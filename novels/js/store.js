// 作品の保存(IndexedDB)と、読みかけ位置・表示設定(localStorage)

const DB_NAME = 'novel-archive';
const STORE = 'works';
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

// IndexedDB が使えない環境(プライベートウィンドウなど)では、開いているあいだだけ覚えておく
const memory = new Map();
const memStore = {
  getAll: () => ({ result: [...memory.values()] }),
  get: (id) => ({ result: memory.get(id) }),
  put: (w) => ({ result: memory.set(w.id, w) && w.id }),
  delete: (id) => ({ result: memory.delete(id) && undefined }),
};

function tx(mode, fn) {
  return Promise.resolve().then(db).then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }), () => fn(memStore).result);
}

// 公開用に同梱された作品(library.json)。手元に同じ id があれば手元が優先
let bundled = null;
async function loadBundled() {
  if (bundled) return bundled;
  try {
    const res = await fetch('library.json', { cache: 'no-cache' });
    if (!res.ok) throw 0;
    const data = await res.json();
    bundled = (data.works || []).map((w) => ({ ...w, bundled: true }));
  } catch {
    bundled = [];
  }
  return bundled;
}

export async function allWorks() {
  const [local, pub] = await Promise.all([tx('readonly', (s) => s.getAll()), loadBundled()]);
  const ids = new Set(local.map((w) => w.id));
  return [...local, ...pub.filter((w) => !ids.has(w.id))]
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function getWork(id) {
  const w = await tx('readonly', (s) => s.get(id));
  if (w) return w;
  return (await loadBundled()).find((x) => x.id === id) || null;
}

export function putWork(w) {
  const { bundled: _, ...rest } = w;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  return tx('readwrite', (s) => s.put(rest));
}

export function deleteWork(id) {
  try { localStorage.removeItem('pos:' + id); } catch {}
  return tx('readwrite', (s) => s.delete(id));
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 読みかけ位置
export function getPos(id) {
  try { return JSON.parse(localStorage.getItem('pos:' + id)); } catch { return null; }
}
export function setPos(id, pos) {
  try { localStorage.setItem('pos:' + id, JSON.stringify(pos)); } catch {}
}

// 表示設定
const DEFAULTS = {
  dir: 'v',       // v=縦書き h=横書き
  size: 2,        // 0..4
  face: 'mincho', // mincho | gothic
  tone: null,     // paper | white | ink(null は端末の明暗に合わせる)
};
export function getPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('prefs')) || {}; } catch {}
  return { ...DEFAULTS, ...p };
}
export function setPrefs(p) {
  try { localStorage.setItem('prefs', JSON.stringify(p)); } catch {}
}

export function getName() {
  return memo('libname') || '書庫';
}
export function setName(n) {
  memo('libname', n);
}

// localStorage の読み書き(使えない環境では何もしない)
export function memo(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

// 地の色と書体を画面全体に反映
export function applyPrefs() {
  const p = getPrefs();
  const root = document.documentElement;
  const theme = root.dataset.theme;
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.tone = p.tone || (dark ? 'ink' : 'paper');
  root.dataset.face = p.face;
}
