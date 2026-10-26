import { allWorks, getWork, putWork, deleteWork, newId, getPos, getName, setName, applyPrefs, memo } from './store.js';
import { parseBlocks, chaptersOf, countChars, charLabel, dateLabel, inline, kansuji } from './parse.js';
import { readFile } from './importer.js';
import { openReader } from './reader.js';

const app = document.getElementById('app');
const note = document.getElementById('note');
let cleanup = null;
let draft = null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

applyPrefs();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);
new MutationObserver(applyPrefs).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------- 道すじ ----------
async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const [, kind, id, extra, arg] = (location.hash.slice(1) || '/').split('/');
  document.body.dataset.view = kind || 'shelf';
  scrollTo(0, 0);
  if (kind === 'w') return showWork(id);
  if (kind === 'r') return showReader(id, extra, arg);
  if (kind === 'e') return showEditor(id);
  if (kind === 'new') return showEditor(null);
  return showShelf();
}
addEventListener('hashchange', route);

// ---------- 書架 ----------
async function showShelf() {
  const works = await allWorks();
  document.title = getName();
  app.innerHTML = `
    <header class="top">
      <nav><a href="#/new">書く</a><label class="file">取り込む<input type="file" multiple accept=".txt,.text,.md,.pdf,text/plain,application/pdf"></label></nav>
    </header>
    <main class="shelf vscroll">
      <h1 class="libname" contenteditable="true" spellcheck="false">${esc(getName())}</h1>
      ${works.length ? works.map(book).join('') : '<p class="none">まだ一冊もない</p>'}
    </main>
    <footer class="foot">
      <span>${works.length ? kansuji(works.length) + '篇' : ''}</span>
      <nav><button data-a="backup">控えを書き出す</button><label class="file">控えを戻す<input type="file" accept=".json,application/json" data-a="restore"></label></nav>
    </footer>`;

  const name = app.querySelector('.libname');
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
  name.addEventListener('blur', () => {
    const v = name.textContent.trim() || '書庫';
    name.textContent = v;
    setName(v);
    document.title = v;
  });
  app.querySelector('[data-a="backup"]').addEventListener('click', backup);
  bindFiles();
  wheelSideways(app.querySelector('.shelf'));
}

function book(w) {
  const chars = w.chars ?? countChars(w.body || '');
  return `<a class="book" href="#/w/${w.id}">
    <span class="t">${inline(w.title || '無題', true)}</span>
    <span class="m">${w.author ? `<span>${esc(w.author)}</span>` : ''}<span>${charLabel(chars)}</span></span>
  </a>`;
}

function bindFiles() {
  app.querySelectorAll('input[type=file]').forEach((input) => {
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      if (input.dataset.a === 'restore') restore(files[0]);
      else importFiles(files);
    });
  });
}

// 縦書きの横スクロールを、ふつうのホイールで動かせるように
function wheelSideways(box) {
  if (!box) return;
  box.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || box.scrollWidth <= box.clientWidth) return;
    box.scrollLeft -= e.deltaY;
    e.preventDefault();
  }, { passive: false });
}

// ---------- 取り込み ----------
async function importFiles(files) {
  files = files.filter((f) => /\.(txt|text|md|pdf)$/i.test(f.name) || /^text\/|pdf$/.test(f.type));
  if (!files.length) return;
  const got = [];
  for (const [n, f] of files.entries()) {
    say(files.length > 1 ? `読み込み中 ${n + 1}/${files.length}` : '読み込み中');
    try {
      got.push(await readFile(f));
    } catch (err) {
      console.error(err);
      say(`${f.name} は読めなかった`, 4000);
      return;
    }
  }
  if (got.length === 1) {
    say('');
    draft = got[0];
    if (location.hash === '#/new') route(); else location.hash = '#/new';
    return;
  }
  for (const w of got) await saveWork({ id: newId(), created: Date.now(), ...w });
  say(`${got.length}篇を収めた`, 2500);
  if (!location.hash || location.hash === '#/') route(); else location.hash = '#/';
}

let noteTimer = 0;
function say(text, ms = 0) {
  clearTimeout(noteTimer);
  note.textContent = text;
  note.hidden = !text;
  if (ms) noteTimer = setTimeout(() => { note.hidden = true; }, ms);
}

// 確かめる。ブラウザの confirm() は使えない場所があるので、ページの中に出す
function ask(text, yes) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'ask';
    box.innerHTML = `<div role="alertdialog" aria-modal="true"><p></p><div><button data-v="0">やめる</button><button data-v="1" class="yes"></button></div></div>`;
    box.querySelector('p').textContent = text;
    box.querySelector('.yes').textContent = yes;
    const done = (v) => { box.remove(); removeEventListener('keydown', key, true); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) done(b.dataset.v === '1');
      else if (e.target === box) done(false);
    });
    addEventListener('keydown', key, true);
    document.body.append(box);
    box.querySelector('[data-v="0"]').focus();
  });
}

function saveWork(w) {
  return putWork({ ...w, chars: countChars(w.body || ''), updated: Date.now() });
}

// 窓に落として取り込む
let dragDepth = 0;
addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  dragDepth++;
  document.body.classList.add('dropping');
});
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); }
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dropping');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  if (files.length === 1 && /\.json$/i.test(files[0].name)) restore(files[0]);
  else importFiles(files);
});

// ---------- 控え ----------
async function backup() {
  const works = (await allWorks()).filter((w) => !w.bundled);
  const data = { app: 'novel-archive', version: 1, name: getName(), saved: Date.now(), works };
  download('library.json', JSON.stringify(data, null, 1), 'application/json');
}

async function restore(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const works = (data.works || []).filter((w) => w && w.id && typeof w.body === 'string');
    for (const w of works) await putWork(w);
    if (data.name && getName() === '書庫') setName(data.name);
    say(`${works.length}篇を戻した`, 2500);
    route();
  } catch (err) {
    console.error(err);
    say('この控えは読めなかった', 4000);
  }
}

// 保存。claude.ai の上では、そこで用意された保存の仕組みを使う
async function download(name, text, type) {
  const saver = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (saver) {
    try {
      await saver.save({ filename: name, data: text });
    } catch (err) {
      if (err?.code !== 'declined') say('ここでは保存できなかった', 4000);
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- 扉 ----------
async function showWork(id) {
  const w = await getWork(id);
  if (!w) { location.hash = '#/'; return; }
  document.title = w.title || '無題';
  const chapters = chaptersOf(parseBlocks(w.body || ''));
  const pos = getPos(id);
  const summary = (w.summary || '').trim();
  app.innerHTML = `
    <header class="top">
      <a href="#/">${esc(getName())}</a>
      <nav>
        ${w.bundled ? '' : `<a href="#/e/${w.id}">直す</a>`}
        <button data-a="txt">書き出す</button>
        ${w.bundled ? '' : '<button data-a="del">消す</button>'}
      </nav>
    </header>
    <main class="work vscroll">
      <div class="head">
        <h1>${inline(w.title || '無題', true)}</h1>
        ${w.author ? `<p class="by">${esc(w.author)}</p>` : ''}
        <p class="meta"><span>${charLabel(w.chars ?? countChars(w.body || ''))}</span><span>${dateLabel(w.updated || w.created || Date.now())}</span></p>
      </div>
      ${summary ? `<div class="summary">${summary.split(/\n+/).map((l) => `<p>${inline(l, true)}</p>`).join('')}</div>` : ''}
      ${chapters.length ? `<ol class="contents">${chapters.map((c) => `<li class="l${c.level}"><a href="#/r/${w.id}/c/${c.i}">${inline(c.text, true)}</a></li>`).join('')}</ol>` : ''}
    </main>
    <footer class="go">
      ${pos ? `<a class="read" href="#/r/${w.id}">続きから</a><a href="#/r/${w.id}/top">はじめから</a>` : `<a class="read" href="#/r/${w.id}/top">読む</a>`}
    </footer>`;

  app.querySelector('[data-a="txt"]').addEventListener('click', () => {
    const head = [w.title, w.author].filter(Boolean).join('\n');
    download(`${w.title || '無題'}.txt`, (head ? head + '\n\n' : '') + (w.body || ''), 'text/plain');
  });
  app.querySelector('[data-a="del"]')?.addEventListener('click', async () => {
    if (!(await ask(`「${w.title || '無題'}」を消しますか。`, '消す'))) return;
    await deleteWork(w.id);
    location.hash = '#/';
  });
  wheelSideways(app.querySelector('.work'));
}

// ---------- 読む ----------
async function showReader(id, extra, arg) {
  const w = await getWork(id);
  if (!w) { location.hash = '#/'; return; }
  document.title = w.title || '無題';
  cleanup = openReader(app, w, {
    top: extra === 'top',
    block: extra === 'c' ? Number(arg) : null,
  });
}

// ---------- 書く・直す ----------
async function showEditor(id) {
  let w = id ? await getWork(id) : null;
  if (id && !w) { location.hash = '#/'; return; }
  if (!w) {
    w = { id: newId(), created: Date.now(), title: '', author: memo('author') || '', summary: '', body: '', source: 'write', ...(draft || {}) };
    draft = null;
  }
  document.title = w.title || '書く';
  const back = id ? `#/w/${id}` : '#/';
  app.innerHTML = `
    <form class="edit" autocomplete="off">
      <header class="top">
        <a href="${back}">やめる</a>
        <nav><span class="count"></span><label class="file">ファイルから<input type="file" accept=".txt,.text,.md,.pdf,text/plain,application/pdf"></label><button type="submit">しまう</button></nav>
      </header>
      <input name="title" placeholder="題" value="${esc(w.title)}">
      <input name="author" placeholder="著者" value="${esc(w.author)}">
      <textarea name="summary" placeholder="あらすじ" rows="3">${esc(w.summary)}</textarea>
      <textarea name="body" placeholder="本文" spellcheck="false">${esc(w.body)}</textarea>
    </form>`;

  const form = app.querySelector('form');
  const count = form.querySelector('.count');
  const body = form.elements.body;
  let dirty = false;
  const recount = () => { count.textContent = countChars(body.value).toLocaleString('ja-JP') + '字'; };
  recount();
  form.querySelector('.top > a').addEventListener('click', async (e) => {
    if (!dirty) return;
    e.preventDefault();
    if (await ask('書きかけを捨てますか。', '捨てる')) { dirty = false; location.hash = back; }
  });
  form.addEventListener('input', () => { dirty = true; recount(); });

  // 本文の中でタブを打てるように(全角空白で字下げ)
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      document.execCommand('insertText', false, '　');
    }
  });

  form.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    say('読み込み中');
    try {
      const got = await readFile(f);
      say('');
      if (body.value.trim() && !(await ask('本文を置きかえますか。', '置きかえる'))) return;
      body.value = got.body;
      if (!form.elements.title.value.trim()) form.elements.title.value = got.title;
      dirty = true;
      recount();
    } catch (err) {
      console.error(err);
      say(`${f.name} は読めなかった`, 4000);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const next = {
      ...w,
      title: f.title.value.trim() || '無題',
      author: f.author.value.trim(),
      summary: f.summary.value.trim(),
      body: f.body.value.replace(/\s+$/, ''),
    };
    if (next.author) memo('author', next.author);
    dirty = false;
    await saveWork(next);
    location.hash = `#/w/${next.id}`;
  });

  const guard = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', guard);
  cleanup = () => removeEventListener('beforeunload', guard);
  if (!id && !w.body) form.elements.title.focus();
}

route();
