// 共通の小道具(乱数・数値の整形・HTMLのエスケープ)
const U = {
  rr(a, b) { return a + Math.random() * (b - a); },
  ri(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  chance(p) { return Math.random() < p; },
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },
  // 種から同じ並びを出す乱数(コース図など、毎回同じ形にしたいもの用)
  seeded(seed) {
    let a = typeof seed === 'string' ? U.hash(seed) : seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  fmtTime(sec) {
    if (!isFinite(sec)) return '—';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = s.toFixed(1).padStart(4, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  },
  fmtLap(sec) {
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return `${m}:${s.toFixed(3).padStart(6, '0')}`;
  },
  fmtGap(sec) {
    if (!isFinite(sec)) return '';
    return sec >= 60 ? '+' + U.fmtTime(sec) : '+' + sec.toFixed(1);
  },
  ordinal(n) { return n + '位'; },
};
