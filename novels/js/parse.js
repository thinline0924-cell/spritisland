// 本文の記法を読みとって、組版用の HTML と目次を作る
//
//  ルビ    |漢字《かんじ》 / 漢字《かんじ》 / |漢字(かんじ)
//  傍点    《《ここ》》
//  見出し  # 題 / 第一章 … / 序章・終章・プロローグ・エピローグ など
//  改ページ ［＃改ページ］
//  区切り  ＊＊＊ / ◇ など記号だけの行

const KANSUJI = '0-9０-９一二三四五六七八九十百千〇零壱弐参';
const RE_CHAPTER = new RegExp(`^(第[${KANSUJI}]+[章話部幕編節回]|[${KANSUJI}]+[章話])(?:[\\s　:：.．、]|$)`);
const RE_CHAPTER_LOOSE = new RegExp(`^第[${KANSUJI}]+[章話部幕編]`);
const RE_NAMED = /^(序章|終章|序|間章|幕間|断章|プロローグ|エピローグ|あとがき|まえがき|はじめに|おわりに|Prologue|Epilogue)(?:[\s　:：]|$)/i;
const RE_MD = /^([#＃]{1,3})[\s　]*(.+)$/;
const RE_AOZORA_H = /［＃「(.+?)」は(大|中|小)見出し］/;
const RE_BREAK = /^［＃(改ページ|改丁|改段|改見開き)］$/;
const RE_SEP = /^[\s　]*(?:[＊*◇◆□■☆★○●・※〜~―\-−]\s*　*){1,12}$/;
const OPENERS = '「『（(〈《【〔［“‘―…';

// 章の見出しになる行か(第一章・序章など)
export function isChapterLine(t) {
  return t.length <= 40 && (RE_CHAPTER.test(t) || RE_NAMED.test(t) || (t.length <= 20 && RE_CHAPTER_LOOSE.test(t) && !/[。、」]/.test(t)));
}

export function parseBlocks(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let blanks = 0;
  for (let raw of lines) {
    const line = raw.replace(/[\s　]+$/, '');
    const t = line.replace(/^[\s　]+/, '');
    if (!t) {
      if (++blanks <= 2) blocks.push({ type: 'blank' });
      continue;
    }
    blanks = 0;
    if (RE_BREAK.test(t)) { blocks.push({ type: 'break' }); continue; }
    let m;
    if ((m = t.match(RE_AOZORA_H))) {
      blocks.push({ type: 'h', level: m[2] === '大' ? 1 : m[2] === '中' ? 2 : 3, text: m[1] });
      continue;
    }
    if ((m = t.match(RE_MD))) {
      blocks.push({ type: 'h', level: m[1].length, text: m[2] });
      continue;
    }
    if (isChapterLine(t)) {
      blocks.push({ type: 'h', level: 1, text: t });
      continue;
    }
    if (RE_SEP.test(t) && /[^\s　\-−~〜―]/.test(t)) {
      blocks.push({ type: 'sep', text: t });
      continue;
    }
    blocks.push({ type: 'p', text: line.replace(/［＃[^］]*］/g, '') });
  }
  // 頭と尻の空行は落とす
  while (blocks.length && blocks[0].type === 'blank') blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === 'blank') blocks.pop();
  // 見出しの直後の空行は詰める
  for (let i = blocks.length - 1; i > 0; i--) {
    if (blocks[i].type === 'blank' && (blocks[i - 1].type === 'h' || blocks[i - 1].type === 'break')) blocks.splice(i, 1);
  }
  // 書き手が全角空白で字下げしていなければ、自動で一字下げる
  const paras = blocks.filter((b) => b.type === 'p');
  const manual = paras.filter((b) => /^[　 ]/.test(b.text)).length;
  const auto = paras.length > 0 && manual / paras.length < 0.2;
  for (const b of paras) {
    b.indent = auto && !OPENERS.includes(b.text[0]) && !/^[　 ]/.test(b.text);
  }
  return blocks;
}

export function chaptersOf(blocks) {
  const out = [];
  blocks.forEach((b, i) => { if (b.type === 'h') out.push({ i, level: b.level, text: plain(b.text) }); });
  return out;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 縦中横と、縦書きでの半角記号の置きかえ
function tate(s) {
  return s
    .replace(/(^|[^0-9A-Za-z.,])([0-9]{1,2})(?![0-9A-Za-z.,])/g, '$1<span class="tcy">$2</span>')
    .replace(/[!?！？]{2}/g, (m) => `<span class="tcy">${m.replace(/！/g, '!').replace(/？/g, '?')}</span>`)
    .replace(/!(?![^<]*<\/span>)/g, '！')
    .replace(/\?(?![^<]*<\/span>)/g, '？');
}

const RE_INLINE = /《《(.+?)》》|[|｜]《|[|｜]([^|｜《(（\n]+?)《(.+?)》|[|｜]([^|｜《(（\n]+?)[(（]([ぁ-んァ-ヶー・゛゜]+)[)）]|([\p{sc=Han}々〆ヵヶ]+)《(.+?)》/gu;

export function inline(text, vertical) {
  const fix = vertical ? (s) => tate(esc(s)) : esc;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(RE_INLINE)) {
    out += fix(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] != null) out += `<em class="dot">${fix(m[1])}</em>`;
    else if (m[2] != null) out += `<ruby>${esc(m[2])}<rt>${esc(m[3])}</rt></ruby>`;
    else if (m[4] != null) out += `<ruby>${esc(m[4])}<rt>${esc(m[5])}</rt></ruby>`;
    else if (m[6] != null) out += `<ruby>${esc(m[6])}<rt>${esc(m[7])}</rt></ruby>`;
    else out += '《';
  }
  return out + fix(text.slice(last));
}

export function plain(text) {
  return text
    .replace(/《《(.+?)》》/g, '$1')
    .replace(/[|｜]《/g, '《')
    .replace(/[|｜]([^|｜《(（\n]+?)《.+?》/g, '$1')
    .replace(/[|｜]([^|｜《(（\n]+?)[(（][ぁ-んァ-ヶー・゛゜]+[)）]/g, '$1')
    .replace(/([\p{sc=Han}々〆ヵヶ]+)《.+?》/gu, '$1');
}

export function renderBlocks(blocks, vertical) {
  let html = '';
  let first = true;
  blocks.forEach((b, i) => {
    const at = ` data-i="${i}"`;
    if (b.type === 'p') {
      html += `<p${at}${b.indent ? ' class="ind"' : ''}>${inline(b.text, vertical)}</p>`;
    } else if (b.type === 'blank') {
      html += `<p${at} class="blank"><br></p>`;
    } else if (b.type === 'h') {
      const cls = `h${b.level}${b.level === 1 && !first ? ' turn' : ''}`;
      html += `<h2${at} class="${cls}">${inline(b.text, vertical)}</h2>`;
    } else if (b.type === 'sep') {
      html += `<p${at} class="sep">${esc(b.text.trim())}</p>`;
    } else if (b.type === 'break') {
      html += `<div${at} class="break"></div>`;
    }
    if (b.type !== 'blank') first = false;
  });
  return html;
}

export function countChars(src) {
  return plain(src).replace(/［＃[^］]*］/g, '').replace(/^[#＃]+/gm, '').replace(/[\s　]/g, '').length;
}

// 数を漢数字に(縦書きの表示用)
const D = '〇一二三四五六七八九';
function under10000(n) {
  let s = '';
  const units = [[1000, '千'], [100, '百'], [10, '十']];
  for (const [u, k] of units) {
    const d = Math.floor(n / u);
    if (d) s += (d === 1 ? '' : D[d]) + k;
    n %= u;
  }
  return s + (n ? D[n] : '');
}
export function kansuji(n) {
  if (n === 0) return '〇';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return (man ? under10000(man) + '万' : '') + (rest ? under10000(rest) : '');
}
export function charLabel(n) {
  if (n >= 1000) n = Math.round(n / 100) * 100;
  return kansuji(n) + '字';
}
export function dateLabel(t, vertical = true) {
  const d = new Date(t);
  if (!vertical) return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  const y = String(d.getFullYear()).split('').map((c) => D[c]).join('');
  return `${y}年${kansuji(d.getMonth() + 1)}月${kansuji(d.getDate())}日`;
}
