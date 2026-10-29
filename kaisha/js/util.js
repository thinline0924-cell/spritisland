// 乱数・文字列・数値まわりの小物

// 保存できる乱数(状態は整数ひとつ)
export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  f(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  normal(m = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted(items, wf) {
    let tot = 0;
    const ws = items.map(it => { const w = Math.max(0, wf ? wf(it) : it.w ?? 1); tot += w; return w; });
    if (tot <= 0) return null;
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  sample(arr, n) { return this.shuffle(arr).slice(0, n); }
}

// シミュレーション全体で使う乱数(world を読み込むたびに差し替える)
export const R = new RNG(1);
export function setSeedState(s) { R.s = s | 0; }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// 金額表示
export function yen(v) {
  const neg = v < 0; v = Math.abs(Math.round(v));
  return (neg ? '△' : '') + v.toLocaleString('ja-JP');
}
export function man(v, digits = 0) { // 万円
  const neg = v < 0; const x = Math.abs(v) / 10000;
  return (neg ? '△' : '') + x.toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function oku(v) {
  const x = v / 1e8;
  return x.toFixed(2).replace(/\.?0+$/, '') + '億';
}
export function manYen(v) { // 新聞・会話向け「1億2,300万円」
  const neg = v < 0; v = Math.abs(v);
  const o = Math.floor(v / 1e8), m = Math.round((v % 1e8) / 1e4);
  let s = '';
  if (o > 0) s += o + '億';
  if (m > 0) s += m.toLocaleString('ja-JP') + '万';
  if (!s) s = '0';
  return (neg ? 'マイナス' : '') + s + '円';
}

// テンプレート展開
//  ((A|B|C))  ランダムに一つ
//  {key}      vars の値(配列ならランダム)
export function fill(str, vars = {}, rng = R) {
  let s = str;
  for (let guard = 0; guard < 6 && s.includes('(('); guard++) {
    s = s.replace(/\(\(([^()]*)\)\)/g, (_, body) => rng.pick(body.split('|')));
  }
  s = s.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) => {
    if (!(k in vars)) return m;
    const v = vars[k];
    if (Array.isArray(v)) return rng.pick(v);
    if (typeof v === 'function') return v();
    return v;
  });
  return s;
}

export function pad2(n) { return String(n).padStart(2, '0'); }

export function uid(prefix = 'x') { return prefix + Math.random().toString(36).slice(2, 9); }

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
