// テキストファイル・PDF から本文を取りだす

export async function readFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const body = isPdf ? await readPdf(file) : decode(await file.arrayBuffer());
  return { title: name.trim() || '無題', body: tidy(body), source: isPdf ? 'pdf' : 'text' };
}

function decode(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    // 古いメモ帳などで保存された Shift_JIS
    try { return new TextDecoder('shift_jis').decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
  }
}

function tidy(s) {
  return s
    .replace(/[\uFE10-\uFE19\uFE30-\uFE4F]/g, (c) => c.normalize('NFKC'))
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('../lib/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

// 日本語フォントの文字対応表(CMap)。一つの JSON にまとめてあり、要るときだけ読む
let cmaps = null;
class CMapReader {
  async fetch({ name }) {
    cmaps ??= fetch(new URL('../lib/pdfjs/cmaps-ja.json', import.meta.url)).then((r) => r.json());
    const data = (await cmaps)[name];
    if (!data) throw new Error(`CMap ${name} がない`);
    return { cMapData: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), isCompressed: true };
  }
}

async function readPdf(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    CMapReaderFactory: CMapReader,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    pages.push(pageLines(tc.items, tc.styles || {}));
    page.cleanup();
  }
  await doc.destroy();
  return joinPages(pages);
}

const OPEN = /^[　 \t「『（(〈《【〔﹁﹃︵―…]/;
const sizeOf = (it) => Math.max(Math.hypot(it.transform[0], it.transform[1]), Math.hypot(it.transform[2], it.transform[3]));

// 1ページぶんの文字を行に分ける。ルビ(本文より小さい文字)は落とす
// 行ごとに、行頭と行末の位置(行の向きに沿った座標)も覚えておく
function pageLines(items, styles) {
  const sizes = items.filter((it) => it.str.trim()).map(sizeOf).sort((a, b) => a - b);
  const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const vertical = isVertical(items, styles, body);
  const lines = [];
  let cur = null;
  let prev = null;
  const flush = () => {
    if (cur) { cur.text = cur.text.replace(/[\s　]+$/, ''); lines.push(cur); }
    cur = null;
    prev = null;
  };
  for (const it of items) {
    if (it.str && sizeOf(it) >= body * 0.7) {
      // 位置が大きく飛んだら改行あつかい
      if (prev && jumped(prev, it, body, vertical)) flush();
      const [x, y] = [it.transform[4], it.transform[5]];
      const len = [...it.str].length * body;
      const a = vertical ? -y : x;
      const b = vertical ? -y + (styles[it.fontName]?.vertical ? it.height : len) : x + it.width;
      if (!cur) cur = { text: '', a, b, size: body };
      cur.text += it.str;
      cur.b = Math.max(cur.b, b);
      prev = it;
    }
    // 縦組みでは pdf.js の改行の印はあてにならないので、列の位置だけで分ける
    if (it.hasEOL && !vertical) {
      if (cur) flush();
      else lines.push({ text: '', a: NaN, b: NaN, size: body });
    }
  }
  flush();
  // 本文の行頭・行末のそろい位置
  // 行頭は、かぎかっこ等で始まる行を除いて見る(縦組みでは括弧の位置がずれやすい)
  const as = lines.filter((l) => l.text.trim() && !OPEN.test(l.text)).map((l) => l.a).sort((x, y) => x - y);
  const bs = lines.filter((l) => l.text.trim()).map((l) => l.b).sort((x, y) => x - y);
  const head = as[Math.floor(as.length * 0.1)];
  const tail = bs[Math.floor(bs.length * 0.9)];
  for (const l of lines) {
    l.indented = l.a > head + body * 0.5;
    l.short = l.b < tail - body * 1.5;
  }
  return lines;
}

// 縦組みのページか。長いかたまりは縦横どちらに伸びているか、一字ずつのかたまりは次の字がどちらにあるかで決める
function isVertical(items, styles, size) {
  if (items.some((it) => it.str.trim() && styles[it.fontName]?.vertical)) return true;
  let v = 0;
  let h = 0;
  let prev = null;
  for (const it of items) {
    const n = [...it.str.trim()].length;
    if (!n) continue;
    if (n > 1) {
      if (it.width > n * size * 0.5) h += n;
      else if (it.height > n * size * 0.5) v += n;
    } else if (prev && [...prev.str.trim()].length === 1) {
      const dx = Math.abs(it.transform[4] - prev.transform[4]);
      const dy = Math.abs(it.transform[5] - prev.transform[5]);
      if (dx < size * 0.3 && dy > size * 0.3 && dy < size * 2) v++;
      else if (dy < size * 0.3 && dx > size * 0.3 && dx < size * 2) h++;
    }
    prev = it;
  }
  return v > h;
}

function jumped(a, b, size, vertical) {
  // 横書きなら y、縦書きなら x が行の位置
  const d = vertical ? a.transform[4] - b.transform[4] : a.transform[5] - b.transform[5];
  return Math.abs(d) > size * 0.6;
}

const isFolio = (l) => /^[\s　]*[-–—―(（]?\s*[0-9０-９ivxlcdmIVXLCDM一二三四五六七八九十百〇]+\s*[-–—―)）]?[\s　]*$/.test(l) && l.trim().length <= 8;
const norm = (l) => l.replace(/[0-9０-９]+/g, '#').trim();

function joinPages(pages) {
  // ノンブルと、どのページにも出る柱を外す
  const heads = new Map();
  for (const p of pages) {
    for (const l of [p[0], p[p.length - 1]]) {
      if (l && l.text.trim()) heads.set(norm(l.text), (heads.get(norm(l.text)) || 0) + 1);
    }
  }
  const limit = Math.max(3, pages.length / 3);
  const all = [];
  pages.forEach((p) => {
    p.forEach((l, li) => {
      const edge = li === 0 || li === p.length - 1;
      if (edge && (isFolio(l.text) || (pages.length >= 3 && heads.get(norm(l.text)) >= limit))) return;
      all.push(l);
    });
  });

  // 座標が取れなかったときは、行の文字数で行末を見る
  const lens = all.filter((l) => l.text.trim()).map((l) => [...l.text].length).sort((a, b) => a - b);
  const full = lens.length ? lens[Math.floor(lens.length * 0.9)] : 0;

  // 折り返しで切れた行をつなぎ直して段落にもどす
  const out = [];
  let para = null;
  let prev = null;
  for (const l of all) {
    const t = l.text;
    if (!t.trim()) {
      if (para != null) out.push(para);
      para = null;
      prev = null;
      continue;
    }
    const known = !Number.isNaN(l.a) && prev && !Number.isNaN(prev.b);
    const starts = OPEN.test(t) || (known && l.indented);
    const ended = prev && (known ? prev.short : [...prev.text].length < full * 0.85);
    if (para == null || starts || ended || full < 12) {
      if (para != null) out.push(para);
      para = (l.indented && !OPEN.test(t) ? '　' : '') + t;
    } else {
      para += (/[A-Za-z0-9,.]$/.test(para) && /^[A-Za-z0-9]/.test(t) ? ' ' : '') + t;
    }
    prev = l;
  }
  if (para != null) out.push(para);
  return out.join('\n');
}
