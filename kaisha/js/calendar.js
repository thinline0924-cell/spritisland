// 日付・祝日・季節・天気(新潟市)

import { R, clamp } from './util.js';

export const START = Date.UTC(2026, 3, 1); // 2026-04-01(水)
const DAY = 86400000;
export const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function dayIndex(t) { return Math.floor(t / 1440); }
export function minuteOfDay(t) { return ((t % 1440) + 1440) % 1440; }
export function dateOf(dayIdx) {
  const d = new Date(START + dayIdx * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), idx: dayIdx };
}
export function dayOfDate(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - START) / DAY); }
export function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function hm(t) { const m = minuteOfDay(t); return { h: Math.floor(m / 60), mi: m % 60 }; }
export function fmtTime(t) { const { h, mi } = hm(t); return `${h}:${String(mi).padStart(2, '0')}`; }
export function fmtDate(d, withWd = true) { return `${d.y}年${d.m}月${d.d}日` + (withWd ? `(${WD[d.wd]})` : ''); }
export function fmtShort(d) { return `${d.m}/${d.d}(${WD[d.wd]})`; }
export function ymKey(d) { return d.y * 100 + d.m; }
export function fiscalYear(d) { return d.m >= 4 ? d.y : d.y - 1; } // 3月決算
export function fiscalLabel(fy) { return `第${fy - 1967}期`; } // 1968年に法人化

function nthMonday(y, m, n) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const off = (8 - first) % 7; // 最初の月曜まで
  return 1 + off + (n - 1) * 7;
}
const holidayCache = new Map();
function baseHolidays(y) {
  const h = new Map();
  const add = (m, d, n) => h.set(m * 100 + d, n);
  add(1, 1, '元日'); add(1, nthMonday(y, 1, 2), '成人の日'); add(2, 11, '建国記念の日'); add(2, 23, '天皇誕生日');
  const sp = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const au = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  add(3, sp, '春分の日'); add(4, 29, '昭和の日'); add(5, 3, '憲法記念日'); add(5, 4, 'みどりの日'); add(5, 5, 'こどもの日');
  add(7, nthMonday(y, 7, 3), '海の日'); add(8, 11, '山の日'); add(9, nthMonday(y, 9, 3), '敬老の日'); add(9, au, '秋分の日');
  add(10, nthMonday(y, 10, 2), 'スポーツの日'); add(11, 3, '文化の日'); add(11, 23, '勤労感謝の日');
  return h;
}
export function holidayName(y, m, d) {
  if (!holidayCache.has(y)) {
    const h = baseHolidays(y);
    // 振替休日
    for (const [k, n] of [...h]) {
      const mm = Math.floor(k / 100), dd = k % 100;
      if (new Date(Date.UTC(y, mm - 1, dd)).getUTCDay() === 0) {
        let t = Date.UTC(y, mm - 1, dd);
        do { t += DAY; } while (h.has((new Date(t).getUTCMonth() + 1) * 100 + new Date(t).getUTCDate()));
        const x = new Date(t); h.set((x.getUTCMonth() + 1) * 100 + x.getUTCDate(), '振替休日');
      }
    }
    // 国民の休日(祝日にはさまれた平日)
    const keys = [...h.keys()];
    for (const k of keys) {
      const mm = Math.floor(k / 100), dd = k % 100;
      const t = Date.UTC(y, mm - 1, dd) + 2 * DAY; const x = new Date(t);
      const k2 = (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
      const mid = new Date(Date.UTC(y, mm - 1, dd) + DAY);
      const km = (mid.getUTCMonth() + 1) * 100 + mid.getUTCDate();
      if (h.has(k2) && !h.has(km) && mid.getUTCDay() !== 0) h.set(km, '国民の休日');
    }
    holidayCache.set(y, h);
  }
  return holidayCache.get(y).get(m * 100 + d) || null;
}
// 会社の休み(事務所)。倉庫は土曜も当番で動く
export function companyOff(d) {
  if (d.wd === 0 || d.wd === 6) return d.wd === 0 ? '日曜' : '土曜';
  const h = holidayName(d.y, d.m, d.d);
  if (h) return h;
  if (d.m === 8 && d.d >= 13 && d.d <= 16) return '夏季休業';
  if ((d.m === 12 && d.d >= 31) || (d.m === 1 && d.d <= 3)) return '年末年始休業';
  return null;
}
export function warehouseOpen(d) {
  if (d.wd === 0) return false;
  if (d.m === 8 && d.d >= 14 && d.d <= 16) return false;
  if ((d.m === 12 && d.d >= 31) || (d.m === 1 && d.d <= 3)) return false;
  if (holidayName(d.y, d.m, d.d) && d.wd !== 6) return d.m === 12; // 12月は祝日も動く
  return true;
}
export function isLastBizDay(d) {
  const dim = daysInMonth(d.y, d.m);
  for (let k = d.d + 1; k <= dim; k++) {
    const x = dateOf(dayOfDate(d.y, d.m, k));
    if (!companyOff(x)) return false;
  }
  return !companyOff(d);
}
export function season(m) {
  if (m >= 3 && m <= 5) return '春';
  if (m >= 6 && m <= 8) return '夏';
  if (m >= 9 && m <= 11) return '秋';
  return '冬';
}

// 天気。新潟市の月別の平均気温とおおよその降水傾向
const TEMP = [0, 3.0, 3.3, 6.5, 11.9, 17.1, 21.3, 25.2, 26.9, 22.9, 16.9, 10.9, 5.8];
const WET = [0, 0.75, 0.68, 0.5, 0.38, 0.32, 0.45, 0.42, 0.3, 0.42, 0.45, 0.6, 0.75];

export function rollWeather(prev, d) {
  const m = d.m;
  const keep = prev && R.chance(0.45);
  let wet = keep ? (prev.kind !== '晴れ' && prev.kind !== 'くもり') : R.chance(WET[m]);
  let kind;
  const temp = Math.round((TEMP[m] + R.normal(0, 2.6)) * 10) / 10;
  if (!wet) kind = R.chance(0.55) ? '晴れ' : 'くもり';
  else if (temp < 2.5 && (m <= 3 || m >= 11)) kind = R.chance(0.22) ? '大雪' : '雪';
  else if (temp < 5 && (m <= 3 || m >= 12)) kind = R.chance(0.5) ? 'みぞれ' : '雪';
  else kind = R.chance(m >= 6 && m <= 9 ? 0.12 : 0.05) ? '大雨' : '雨';
  if ((m === 12 || m === 1) && wet && R.chance(0.18)) kind = kind === '雨' ? '雷雨' : kind; // 冬の雷(鰤起こし)
  let snowDepth = prev ? prev.snowDepth : 0;
  if (kind === '雪') snowDepth += R.int(3, 12);
  if (kind === '大雪') snowDepth += R.int(18, 45);
  if (kind === '晴れ') snowDepth -= R.int(4, 10);
  if (kind === '雨' || kind === 'みぞれ') snowDepth -= R.int(5, 15);
  if (temp > 6) snowDepth -= 8;
  snowDepth = clamp(snowDepth, 0, 140);
  if (m >= 4 && m <= 10) snowDepth = 0;
  const wind = kind === '大雪' || (m <= 2 || m === 12) ? R.int(6, 16) : R.int(1, 7);
  return { kind, temp, hi: Math.round(temp + R.f(2, 6)), lo: Math.round(temp - R.f(2, 5)), snowDepth, wind };
}
export function weatherIcon(k) {
  return { '晴れ': '晴', 'くもり': '曇', '雨': '雨', '大雨': '大雨', '雪': '雪', '大雪': '大雪', 'みぞれ': '霙', '雷雨': '雷' }[k] || k;
}
