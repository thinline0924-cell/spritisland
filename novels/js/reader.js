// 読む画面。本文を段組み(column)でページに割り、1ページずつめくる
import { parseBlocks, renderBlocks, chaptersOf, inline } from './parse.js';
import { getPos, setPos, getPrefs, setPrefs, applyPrefs, putWork } from './store.js';
import { compose } from './ui.js';

const SIZES = [14, 16, 18, 20, 23];

export function openReader(root, work, opt = {}) {
  work = { ...work };
  let prefs = getPrefs();
  const blocks = parseBlocks(work.body || '');
  const chapters = chaptersOf(blocks);

  root.innerHTML = `
    <div class="reader">
      <header class="rh">
        <a class="r-back" href="#/w/${work.id}">戻る</a>
        <span class="run"></span>
        <span class="r-tools">${work.bundled && !work.summary ? '' : '<button data-a="sum">あらすじ</button>'}<button data-a="toc">目次</button><button data-a="set">組版</button></span>
      </header>
      <div class="page"><div class="flow"></div></div>
      <footer class="rf"><span class="folio"></span></footer>
      <div class="bar"><i></i></div>
      <aside class="sheet toc" hidden>
        <ol>
          <li><button data-go="-1">扉</button></li>
          ${chapters.map((c) => `<li class="l${c.level}"><button data-go="${c.i}">${esc(c.text)}</button></li>`).join('')}
        </ol>
      </aside>
      <aside class="sheet sum" hidden></aside>
      <aside class="sheet set" hidden>
        <dl>
          <dt>組方</dt><dd data-k="dir"><button data-v="v">縦</button><button data-v="h">横</button></dd>
          <dt>文字</dt><dd data-k="size">${SIZES.map((s, i) => `<button data-v="${i}" style="font-size:${11 + i * 2}px">あ</button>`).join('')}</dd>
          <dt>書体</dt><dd data-k="face"><button data-v="mincho">明朝</button><button data-v="gothic">ゴシック</button></dd>
          <dt>地</dt><dd data-k="tone"><button data-v="paper">紙</button><button data-v="white">白</button><button data-v="ink">墨</button></dd>
        </dl>
      </aside>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const el = $('.reader');
  const page = $('.page');
  const flow = $('.flow');
  const run = $('.run');
  const folio = $('.folio');
  const barFill = $('.bar i');
  const toc = $('.toc');
  const set = $('.set');
  const sum = $('.sum');
  const sheets = { toc, set, sum };

  let vertical = true;
  let step = 1;
  let total = 1;
  let cur = 0;
  let els = [];

  function render() {
    vertical = prefs.dir === 'v';
    el.classList.toggle('v', vertical);
    el.classList.toggle('h', !vertical);
    const tobira = `<section class="tobira" data-i="-1"><h1>${inline(work.title || '無題', vertical)}</h1>${work.author ? `<p class="by">${esc(work.author)}</p>` : ''}</section>`;
    flow.innerHTML = tobira + renderBlocks(blocks, vertical);
    els = [...flow.querySelectorAll('[data-i]')];
    syncSet();
  }

  function layout() {
    const vw = innerWidth;
    const vh = innerHeight;
    let fs = SIZES[prefs.size] ?? 18;
    if (vw < 420) fs -= 1;
    const mt = vh < 560 || vw < 640 ? 44 : 64;
    const ms = vw < 640 ? 22 : 64;
    let W = vw - ms * 2;
    let H = vh - mt * 2;
    let G;
    let count = 1;
    if (vertical) {
      H = Math.min(H, Math.round(fs * 44));
      W = Math.min(W, 1120);
      // 行の幅の倍数にして、左右の余白をそろえる
      W = Math.floor(W / (fs * 2)) * fs * 2 + 2;
      G = fs * 3;
    } else {
      G = Math.round(fs * 3.5);
      const col = fs * 36;
      if (W >= col * 2 + G && vw >= 1000) {
        count = 2;
        W = Math.min(W, col * 2 + G);
      } else {
        W = Math.min(W, col);
      }
      H = Math.min(H, Math.round(fs * 46));
      H = Math.floor(H / (fs * 1.9)) * fs * 1.9 + 2;
    }
    W = Math.floor(W);
    H = Math.floor(H);
    Object.assign(flow.style, {
      fontSize: fs + 'px',
      width: W + 'px',
      height: H + 'px',
      columnCount: count,
      columnGap: G + 'px',
    });
    el.style.setProperty('--fs', fs + 'px');
    el.style.setProperty('--pw', W + 'px');
    el.style.setProperty('--ph', H + 'px');
    if (vertical) {
      step = H + G;
      total = Math.max(1, Math.round((flow.scrollHeight + G) / step));
    } else {
      step = W + G;
      total = Math.max(1, Math.round((flow.scrollWidth + G) / step));
    }
  }

  function pageOf(node, end = false) {
    const rects = node.getClientRects();
    const r = rects.length ? rects[end ? rects.length - 1 : 0] : node.getBoundingClientRect();
    const f = flow.getBoundingClientRect();
    const pos = vertical ? r.top - f.top + flow.scrollTop : r.left - f.left + flow.scrollLeft;
    return Math.max(0, Math.min(total - 1, Math.floor((pos + 2) / step)));
  }

  // 今のページの最初にある段落
  function anchor() {
    let lo = 0;
    let hi = els.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pageOf(els[mid], true) >= cur) hi = mid; else lo = mid + 1;
    }
    return els[lo] ? Number(els[lo].dataset.i) : -1;
  }

  function nodeOf(i) {
    return flow.querySelector(`[data-i="${i}"]`);
  }

  let saveTimer = 0;
  function go(n, save = true) {
    cur = Math.max(0, Math.min(total - 1, n));
    if (vertical) { flow.scrollLeft = 0; flow.scrollTop = cur * step; } else { flow.scrollTop = 0; flow.scrollLeft = cur * step; }
    folio.textContent = `${cur + 1} / ${total}`;
    barFill.style.width = (total > 1 ? (cur / (total - 1)) * 100 : 100) + '%';
    const a = anchor();
    let head = '';
    for (const c of chapters) { if (c.i <= a) head = c.text; else break; }
    run.textContent = cur === 0 ? '' : head || work.title || '';
    if (save) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => setPos(work.id, { i: a, r: total > 1 ? cur / (total - 1) : 0, t: Date.now() }), 250);
    }
  }

  function goBlock(i) {
    const node = nodeOf(i);
    go(node ? pageOf(node) : 0);
  }

  function relayout() {
    const a = anchor();
    layout();
    const node = nodeOf(a);
    go(node ? pageOf(node) : 0, false);
  }

  const next = () => go(cur + 1);
  const prev = () => go(cur - 1);

  // ---- 設定 ----
  function syncSet() {
    set.querySelectorAll('dd').forEach((dd) => {
      const k = dd.dataset.k;
      const v = k === 'tone' ? document.documentElement.dataset.tone : String(prefs[k]);
      dd.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    });
  }
  set.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = b.closest('dd').dataset.k;
    const a = anchor();
    prefs = { ...prefs, [k]: k === 'size' ? Number(b.dataset.v) : b.dataset.v };
    setPrefs(prefs);
    applyPrefs();
    if (k === 'dir') render();
    syncSet();
    layout();
    const node = nodeOf(a);
    go(node ? pageOf(node) : 0);
  });

  // ---- 目次 ----
  toc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    goBlock(Number(b.dataset.go));
    closeSheets();
  });

  // ---- あらすじ ----
  function fillSum() {
    const text = (work.summary || '').trim();
    sum.innerHTML = (text ? text.split(/\n+/).map((l) => `<p>${inline(l, false)}</p>`).join('') : '')
      + (work.bundled ? '' : `<button data-a="sum-edit">${text ? '直す' : 'あらすじを書く'}</button>`);
  }
  sum.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-a="sum-edit"]')) return;
    const v = await compose({ value: work.summary || '', placeholder: 'あらすじ' });
    if (v == null) return;
    work = { ...work, summary: v, updated: Date.now() };
    await putWork(work);
    fillSum();
  });
  fillSum();

  function closeSheets() {
    const was = Object.values(sheets).some((x) => !x.hidden);
    Object.values(sheets).forEach((x) => { x.hidden = true; });
    root.querySelectorAll('.r-tools button').forEach((b) => b.classList.remove('on'));
    return was;
  }

  $('.r-tools').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const sheet = sheets[b.dataset.a];
    const open = sheet.hidden;
    closeSheets();
    if (open) {
      sheet.hidden = false;
      b.classList.add('on');
      if (sheet === toc) {
        const a = anchor();
        let mark = toc.querySelector('[data-go="-1"]');
        toc.querySelectorAll('[data-go]').forEach((x) => { if (Number(x.dataset.go) <= a) mark = x; });
        toc.querySelectorAll('[data-go]').forEach((x) => x.classList.toggle('here', x === mark));
        mark.scrollIntoView({ block: 'nearest' });
      }
    }
  });

  // ---- めくる ----
  let swiped = false;
  page.addEventListener('click', (e) => {
    if (swiped) { swiped = false; return; }
    if (closeSheets()) return;
    if (String(getSelection())) return;
    const left = e.clientX < innerWidth / 2;
    if (vertical ? left : !left) next(); else prev();
  });

  let sx = 0;
  let sy = 0;
  page.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  page.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      setTimeout(() => { swiped = false; }, 400);
      if (vertical ? dx > 0 : dx < 0) next(); else prev();
    }
  }, { passive: true });

  let wheelAcc = 0;
  let wheelLock = 0;
  page.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    wheelAcc += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : (vertical ? -e.deltaX : e.deltaX);
    if (Math.abs(wheelAcc) > 30) {
      if (wheelAcc > 0) next(); else prev();
      wheelAcc = 0;
      wheelLock = now + 220;
    }
  }, { passive: false });

  const bar = $('.bar');
  bar.addEventListener('click', (e) => {
    const r = bar.getBoundingClientRect();
    const x = vertical ? r.right - e.clientX : e.clientX - r.left;
    go(Math.round((x / r.width) * (total - 1)));
  });

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea')) return;
    const k = e.key;
    if (k === 'Escape') { if (!closeSheets()) location.hash = `#/w/${work.id}`; return; }
    if (k === 'ArrowLeft') vertical ? next() : prev();
    else if (k === 'ArrowRight') vertical ? prev() : next();
    else if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) next();
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) prev();
    else if (k === 'Home') go(0);
    else if (k === 'End') go(total - 1);
    else return;
    e.preventDefault();
  }

  let raf = 0;
  const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); };
  const onFonts = () => onResize();

  addEventListener('keydown', onKey);
  addEventListener('resize', onResize);
  document.fonts?.addEventListener('loadingdone', onFonts);

  // ---- はじめのページ ----
  render();
  layout();
  const saved = getPos(work.id);
  if (opt.block != null) goBlock(opt.block);
  else if (opt.top || !saved) go(0, false);
  else {
    const node = nodeOf(saved.i);
    go(node ? pageOf(node) : Math.round((saved.r || 0) * (total - 1)), false);
  }
  document.fonts?.ready.then(onResize);

  return () => {
    clearTimeout(saveTimer);
    removeEventListener('keydown', onKey);
    removeEventListener('resize', onResize);
    document.fonts?.removeEventListener('loadingdone', onFonts);
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
