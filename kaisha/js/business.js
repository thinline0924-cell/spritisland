// 売上・原価・経費・資金繰り・月次決算・倒産判定

import { R, clamp, manYen } from './util.js';
import { dateOf, daysInMonth, companyOff, warehouseOpen, fiscalYear, ymKey } from './calendar.js';

// 月ごとの季節の波(業務用・量販で少しちがう)
const SEASON = { 1: 0.9, 2: 0.88, 3: 1.0, 4: 0.97, 5: 1.0, 6: 0.95, 7: 1.04, 8: 1.06, 9: 0.96, 10: 1.0, 11: 1.03, 12: 1.22 };

export function activeClients(w) { return w.clients.filter(c => c.status === 'active'); }

function bizDays(y, m) {
  let n = 0; const dim = daysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    const t = Date.UTC(y, m - 1, d); const x = new Date(t);
    const o = { y, m, d, wd: x.getUTCDay() };
    if (warehouseOpen(o)) n += o.wd === 6 ? 0.35 : 1;
  }
  return n;
}

// 1日分の出荷と売上
export function dailySales(w, d) {
  if (!warehouseOpen(d)) return null;
  const sat = d.wd === 6 ? 0.35 : 1;
  const bd = bizDays(d.y, d.m);
  let sales = 0, cogs = 0;
  const per = [];
  for (const c of activeClients(w)) {
    let f = SEASON[d.m] * sat / bd;
    if (c.seasonal === 'winter') f *= [0, 1.6, 1.5, 1.1, 0.6, 0.5, 0.5, 0.7, 0.8, 0.6, 0.7, 0.9, 1.5][d.m];
    if (c.seasonal === 'summer') f *= [0, 0.5, 0.5, 0.7, 0.9, 1.1, 1.2, 1.5, 1.7, 1.2, 1.0, 0.7, 0.6][d.m];
    if (c.school && (d.m === 8 || (d.m === 12 && d.d > 24) || (d.m === 3 && d.d > 24) || (d.m === 4 && d.d < 8))) f *= 0.1;
    f *= 1 + w.eco.mood * 0.04 + c.mood * 0.01;
    const amt = c.base * f * R.f(0.82, 1.18);
    const m = c.margin * (1 - (w.fin.costPush || 0)) + R.normal(0, 0.006);
    sales += amt; cogs += amt * (1 - m);
    c.mtd += amt; c.ytd += amt;
    per.push([c.id, amt]);
  }
  w.fin.mtd.sales += sales; w.fin.mtd.cogs += cogs;
  w.fin.today = { sales, gp: sales - cogs };
  return { sales, cogs };
}

// 月の経費(販管費)
export function monthlySGA(w) {
  const act = w.people.filter(p => p.status === 'active' || p.status === 'leave');
  let payroll = 0;
  for (const p of act) payroll += p.status === 'leave' ? 0 : p.salary;
  const exec = w.people.filter(p => p.emp === '役員' && p.status === 'active').reduce((s, p) => s + p.salary, 0);
  const welfare = (payroll - exec) * 0.155 + exec * 0.12;
  const overtime = act.filter(p => p.emp === '正社員').length * R.f(18000, 32000) * (w.fin.mtd.extra.busy ? 1.4 : 1);
  const fuel = 2.1e6 * (w.eco.diesel / 160) * R.f(0.95, 1.05);
  const freight = 3.0e6 * R.f(0.95, 1.08) * (w.fin.freightUp || 1);
  const util = 2.4e6 * (dateOf(w.day).m >= 7 && dateOf(w.day).m <= 9 ? 1.25 : dateOf(w.day).m <= 2 || dateOf(w.day).m === 12 ? 1.15 : 1) * R.f(0.95, 1.05);
  const rent = 2.6e6; const dep = 2.3e6; const lease = 1.1e6; const sys = 0.75e6;
  const ent = 0.45e6 * R.f(0.6, 1.6); const misc = 1.6e6 * R.f(0.9, 1.15); const ins = 0.6e6; const fee = 1.0e6 * R.f(0.9, 1.1);
  const items = { 役員報酬: exec, 給与手当: payroll - exec + overtime, 法定福利費: welfare, 荷造運賃: freight, 燃料費: fuel, 水道光熱費: util, 地代家賃: rent, 減価償却費: dep, リース料: lease, 通信費: sys, 交際費: ent, 保険料: ins, 支払手数料: fee, 雑費: misc };
  for (const [k, v] of Object.entries(w.fin.mtd.extra)) if (typeof v === 'number' && k !== 'busy') items[k] = (items[k] || 0) + v;
  const total = Object.values(items).reduce((s, v) => s + v, 0);
  return { items, total, payroll: payroll + overtime, welfare };
}

export function interestMonthly(w) { return w.banks.reduce((s, b) => s + b.bal * b.rate / 12, 0); }

// 月末の締め:損益をまとめ、売掛の回収・買掛の支払い・借入返済を行う
export function closeMonth(w, d) {
  const f = w.fin;
  const sga = monthlySGA(w);
  const sales = f.mtd.sales, cogs = f.mtd.cogs;
  const gp = sales - cogs;
  const op = gp - sga.total;
  const interest = interestMonthly(w);
  const nonop = (f.mtd.nonop || 0);
  const ord = op - interest + nonop;
  const special = f.mtd.special || 0;
  const pre = ord + special;
  const rec = { ym: ymKey(d), y: d.y, m: d.m, sales, cogs, gp, gpr: sales ? gp / sales : 0, sga: sga.total, sgaItems: sga.items, op, interest, nonop, ord, special, pre };
  // 資金の動き
  let inflow = 0, outflow = 0;
  const keepAR = [];
  for (const a of f.ar) {
    if (a.due <= 0) { inflow += a.amt * (a.cut ?? 1); } else { a.due -= 1; keepAR.push(a); }
  }
  // 当月の売上を売掛に計上(取引先ごとのサイト)
  for (const c of w.clients) {
    if (c.mtd > 0) keepAR.push({ client: c.id, due: c.terms - 1, amt: c.mtd });
    c.hist.push(Math.round(c.mtd)); if (c.hist.length > 24) c.hist.shift();
    if (c.margin0 == null) c.margin0 = c.margin;
    c.margin += (c.margin0 - c.margin) * 0.05;
    c.mtd = 0;
  }
  f.ar = keepAR;
  f.costPush = (f.costPush || 0) * 0.85;
  const keepAP = [];
  for (const a of f.ap) { if (a.due <= 1) outflow += a.amt; else { a.due -= 1; keepAP.push(a); } }
  keepAP.push({ sup: 'all', due: 1, amt: cogs });
  f.ap = keepAP;
  // 給与・経費(給与は25日払いだが、ここで月まとめ)
  outflow += sga.total - sga.items['減価償却費'];
  // 借入の返済と利息
  let repay = 0;
  for (const b of w.banks) { const p = Math.min(b.bal, b.monthly); b.bal -= p; repay += p; }
  outflow += repay + interest;
  // 税金(決算月の2か月後に納付)
  if (f.taxDue && f.taxDue.ym === rec.ym) { outflow += f.taxDue.amt; rec.tax = f.taxDue.amt; f.taxDue = null; }
  f.cash += inflow - outflow + nonop;
  rec.cashIn = inflow; rec.cashOut = outflow; rec.cash = f.cash; rec.repay = repay;
  rec.debt = w.banks.reduce((s, b) => s + b.bal, 0);
  rec.ar = f.ar.reduce((s, a) => s + a.amt, 0);
  f.equity += pre * (pre > 0 ? 0.7 : 1);
  f.hist.push(rec);
  f.ytd.sales += sales; f.ytd.gp += gp; f.ytd.op += op; f.ytd.ord = (f.ytd.ord || 0) + ord;
  // 決算(3月)
  if (d.m === 3) {
    const fy = fiscalYear(d);
    const taxable = f.ytd.ord;
    const tax = taxable > 0 ? taxable * 0.3 : 70000;
    f.taxDue = { ym: ymKey({ y: d.y, m: 5 }), amt: tax };
    rec.fyClose = { fy, sales: f.ytd.sales, gp: f.ytd.gp, op: f.ytd.op, ord: f.ytd.ord, tax };
    f.ytd = { sales: 0, gp: 0, op: 0, ord: 0 };
  }
  f.mtd = { sales: 0, cogs: 0, extra: {}, nonop: 0, special: 0 };
  return rec;
}

// 今月末の資金の見込み
export function projectMonthEnd(w) {
  const f = w.fin;
  const inflow = f.ar.filter(a => a.due <= 0).reduce((s, a) => s + a.amt * (a.cut ?? 1), 0);
  const ap = f.ap.filter(a => a.due <= 1).reduce((s, a) => s + a.amt, 0);
  const sga = 33e6;
  const repay = w.banks.reduce((s, b) => s + Math.min(b.bal, b.monthly), 0) + interestMonthly(w);
  return f.cash + inflow - ap - sga - repay;
}

export function addExpense(w, label, amt) {
  w.fin.mtd.extra[label] = (w.fin.mtd.extra[label] || 0) + amt;
}
export function addSpecial(w, amt) { w.fin.mtd.special = (w.fin.mtd.special || 0) + amt; w.fin.cash += amt; }
export function addNonop(w, amt) { w.fin.mtd.nonop = (w.fin.mtd.nonop || 0) + amt; }
export function borrow(w, bank, amt, years = 7) {
  bank.bal += amt; bank.monthly += amt / (years * 12);
  w.fin.cash += amt;
}
export function totalDebt(w) { return w.banks.reduce((s, b) => s + b.bal, 0); }
export function lastN(w, n) { return w.fin.hist.slice(-n); }
export function trailingOrd(w, n = 12) { return lastN(w, n).reduce((s, r) => s + r.ord, 0); }
export function shareOf(w, c) {
  const tot = w.clients.filter(x => x.status === 'active').reduce((s, x) => s + x.base, 0);
  return c.base / tot;
}
export function creditScore(w) {
  // 銀行から見た会社の評点(0〜100)
  const f = w.fin;
  const ord = trailingOrd(w, 12) + (f.hist.length < 12 ? (12 - f.hist.length) * 0.8e6 : 0);
  const debt = totalDebt(w);
  let s = 55 + ord / 1.5e6 - (debt - 6e8) / 3e7 + (f.cash - 1.5e8) / 2e7 + (f.equity - 2e8) / 3e7;
  if (f.scandal) s -= f.scandal;
  return clamp(Math.round(s), 0, 100);
}
