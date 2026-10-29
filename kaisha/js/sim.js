// 時間を進め、人を動かし、出来事を起こす

import { R, clamp, manYen } from './util.js';
import { dateOf, dayIndex, minuteOfDay, companyOff, warehouseOpen, rollWeather, fmtDate, isLastBizDay, daysInMonth, fiscalYear, fiscalLabel, holidayName } from './calendar.js';
import { nodes, placeInfo, export_wh, CHOREI2, islands } from './map.js';
import { rel } from './world.js';
import { bindWorld, full, callName, stat, affect, remember, bossOf, deptMates, liked, disliked, titleShort } from './people.js';
import { log, later, say, talk, board, news, emit, postChat, P, byKey, active, atWork, onSite, runLines, stdVars, sortQueue, dmKey } from './out.js';
import { CHATS, ROUTES } from './text/chats.js';
import { TALKS, MUTTER } from './text/talks.js';
import { EVENTS, CONT, exposeSecret, knows, tell, callTo } from './events.js';
import { dailySales, closeMonth, projectMonthEnd, creditScore, trailingOrd, borrow, totalDebt, activeClients, addExpense } from './business.js';
import { stepEconomy, makePaper } from './text/news.js';
import { speak } from './style.js';

let W = null;
export function bind(w) { W = w; bindWorld(w); R.s = w.seedState || w.seed; }

// ---------- 一日の予定 ----------
const OFFICE_ROLES = ['exec', 'admin', 'acct', 'it', 'reception', 'sales', 'jimu', 'buyer'];
const H = (h, m = 0) => h * 60 + m;

function planDay(w, p, d) {
  const off = companyOff(d);
  const T = { in: false, absent: null, arrive: null, leave: null, outs: [], lunch: null, floor: null, late: 0 };
  p.today = T;
  if (p.status !== 'active') return;
  const wh = ['driver', 'souko', 'logi'].includes(p.role);
  if (off) {
    if (d.wd === 6 && warehouseOpen(d) && wh && w.saturdayCrew?.includes(p.id)) { T.arrive = H(7, 30) + R.int(0, 20); T.leave = H(15) + R.int(0, 60); T.sat = true; }
    else { T.absent = off; return; }
  }
  const F = p.flags;
  if (F.vacTo != null && d.idx > F.vacTo) { delete F.vacFrom; delete F.vacTo; delete F.vacReason; }
  if (F.vacFrom != null && d.idx >= F.vacFrom && d.idx <= F.vacTo) {
    T.absent = F.vacReason || '有給休暇';
    if (F.tripTo && d.idx === F.vacTo) { F.trip = F.tripTo; delete F.tripTo; }
    return;
  }
  if (p.flags.kibiki && d.idx <= p.flags.kibiki) { T.absent = '忌引'; return; }
  if (p.flags.maternity && d.idx >= p.flags.maternity) { p.status = 'leave'; p.leaveReason = '産休・育休'; T.absent = '産休'; p.flags.maternityBack = d.idx + R.int(300, 420); log(w, `${full(p)}が今日から産休に入った`, { cat: '人事', who: [p] }); return; }
  if (p.key === 'kaicho' && !([1, 4].includes(d.wd) && R.chance(0.75)) && !R.chance(0.08)) { T.absent = '(出社日ではない)'; return; }
  // 体調不良
  const sickP = 0.01 + (100 - p.st.health) / 2500 + (p.flags.sickBias || 0) + (p.flags.hangover === d.idx ? 0.06 : 0) + (p.st.stress > 80 ? 0.02 : 0);
  const kidSmall = p.life.kids.some(k => k.age < 7);
  if (R.chance(sickP)) { T.absent = '体調不良'; T.absentNote = R.pick(['発熱', '腹痛', '頭痛', '腰痛', 'めまい', '胃腸炎']); }
  else if (kidSmall && R.chance(0.012)) { T.absent = '子の看護'; }
  // 時刻
  const r = p.role, C = p.b5.C;
  let arrive, leave;
  if (p.key === 'shacho') { arrive = H(8, 35) + R.int(0, 45); leave = H(18) + R.int(0, 100); }
  else if (p.key === 'kaicho') { arrive = H(9, 50) + R.int(0, 60); leave = H(14, 30) + R.int(0, 60); }
  else if (r === 'driver') { arrive = H(6, 15) + R.int(0, 20); leave = H(16, 10) + R.int(0, 60); }
  else if (r === 'logi') { arrive = H(6, 55) + R.int(0, 30); leave = H(16, 45) + R.int(0, 75); }
  else if (r === 'souko') {
    if (p.emp === 'パート') { arrive = H(8, 20) + R.int(0, 10); leave = H(14, 30) + R.int(0, 35); }
    else { arrive = H(7, 25) + R.int(0, 25); leave = H(16, 50) + R.int(0, 40); }
  } else {
    arrive = H(8, 28) - Math.round((C - 30) * 0.6) - R.int(0, 12);
    leave = H(17, 30) + R.int(0, 10);
    if (r === 'sales') leave += R.int(20, 160);
    if (r === 'acct' && (d.d >= 25 || d.d <= 6)) leave += R.int(40, 150);
    if (p.boss) leave += R.int(20, 90);
    if (p.emp === 'パート') { arrive = H(8, 50) + R.int(0, 8); leave = H(15) + R.int(0, 30); }
    if (p.newhire) leave = H(17, 35) + R.int(0, 40);
  }
  if (w.fin.mtd.extra.busy || d.m === 12 && d.d >= 20) leave += R.int(30, 120);
  // 遅刻
  const snow = w.weather && /雪/.test(w.weather.kind);
  const lateP = 0.008 + (100 - C) / 4000 + (snow ? (w.weather.kind === '大雪' ? 0.35 : 0.12) : 0) + (p.flags.hangover === d.idx ? 0.08 : 0);
  if (!T.absent && R.chance(lateP)) { T.late = R.pick([5, 10, 15, 20, 30, 45, 60]); T.lateWhy = snow ? '雪' : R.pick(['寝坊', '渋滞', '子どもの送り', '体調', 'バスの遅れ', '車のバッテリー上がり']); }
  if (T.absent) { notifyAbsence(w, p, T); return; }
  T.arrive = arrive + T.late; T.leave = Math.max(leave, T.arrive + 180);
  if (T.late && !(snow && T.late < 15)) notifyLate(w, p, T, arrive);
  // 昼
  if (wh) T.lunch = { at: H(12), until: H(12, 55), place: r === 'driver' ? 'out' : R.chance(0.8) ? 'wbreak' : 'car' };
  else if (p.emp === 'パート' && r === 'reception') T.lunch = { at: H(12, 30), until: H(13, 15), place: 'rest1' };
  else {
    const where = p.key === 'shacho' || p.key === 'kaicho' ? R.pick(['desk', 'out', 'out']) : R.weighted([{ v: 'rest1', w: p.gender === 'f' ? 4 : 2 }, { v: 'desk', w: 3 }, { v: 'out', w: r === 'sales' ? 3 : 1.2 }, { v: 'car', w: p.smoker ? 1 : 0.4 }]).v;
    T.lunch = { at: H(12), until: H(13), place: where };
  }
  // 外回り(営業)
  if (r === 'sales' && !p.newhire) {
    const n = R.weighted([{ v: 0, w: 1 }, { v: 1, w: 3 }, { v: 2, w: 3 }]).v;
    if (n >= 1) { const s = H(9, 40) + R.int(0, 60); T.outs.push([s, s + R.int(70, 140)]); }
    if (n >= 2) { const s = H(13, 20) + R.int(0, 50); T.outs.push([s, s + R.int(90, 200)]); }
  } else if (r === 'sales' && p.newhire && d.idx > 20 && R.chance(0.5)) { const s = H(13, 30); T.outs.push([s, s + 150]); T.ride = true; }
  if (p.key === 'shacho' && R.chance(0.45)) { const s = H(10) + R.int(0, 240); T.outs.push([s, s + R.int(60, 200)]); T.outWhy = R.pick(['銀行', '商工会議所の会合', '取引先回り', 'ゴルフ', '業界団体の会議', '県庁']); }
  if (p.key === 'senmu' && R.chance(0.35)) { const s = H(10) + R.int(0, 180); T.outs.push([s, s + R.int(60, 150)]); }
  if (r === 'driver') { T.drive = [H(7, 35) + R.int(0, 20), H(13, 20) + R.int(0, 140)]; if (T.sat) T.drive[1] = H(12) + R.int(0, 60); }
  if (p.smoker) T.smokeGap = R.int(55, 110);
}

function notifyAbsence(w, p, T) {
  if (p.key === 'kaicho' || T.absent === '有給休暇' || T.absent === '忌引' || T.absent === '産休') return;
  if (!/体調|看護/.test(T.absent)) return;
  const b = bossOf(w, p);
  const ch = ['driver', 'souko', 'logi'].includes(p.role) ? 'butsuryu' : p.dept.startsWith('営業') ? 'eigyo' : p.dept === '購買部' ? 'eigyo' : 'soumu';
  const tpl = T.absent === '子の看護' ? '((子どもが熱を出してしまい|保育園から登園できないと言われ|子どもが嘔吐してしまい))、本日はお休みをいただきます。((急ぎの件は携帯に連絡ください|ご迷惑をおかけします))'
    : `((朝から|昨夜から))${T.absentNote}((がひどく|があり))、本日はお休みをいただきます。((申し訳ありません|ご迷惑をおかけします))`;
  later(w, H(7, 5) + R.int(0, 70) - minuteOfDay(w.t), 'chat', { ch, from: p.id, text: speak(tpl, p, b, 'chat', { __greet: true }, 'sorry') });
  if (b && b.status === 'active') {
    const harsh = b.b5.A < 38 && (p.flags.absences || 0) > 2;
    later(w, H(7, 50) + R.int(0, 50) - minuteOfDay(w.t), 'chat', { ch, from: b.id, text: speak(harsh ? '((了解|わかりました))。((今月何回目？|続くようなら病院の診断書を))' : '((了解です。お大事に|わかりました。ゆっくり休んで|お大事にしてください))', b, p, 'chat') });
    if (harsh) { affect(w, p, b, -4, -2); stat(p, 'stress', 4); }
  }
  p.flags.absences = (p.flags.absences || 0) + 1;
  log(w, `${full(p)}が${T.absent === '子の看護' ? '子どもの看病で' : '体調不良(' + T.absentNote + ')で'}欠勤`, { cat: '勤怠', who: [p] });
}
function notifyLate(w, p, T, plan) {
  const b = bossOf(w, p);
  const ch = ['driver', 'souko', 'logi'].includes(p.role) ? 'butsuryu' : p.dept.startsWith('営業') || p.dept === '購買部' ? 'eigyo' : 'soumu';
  const why = { '雪': '雪で道路が混んでいて', '寝坊': '((寝坊してしまい|目覚ましが鳴らず))', '渋滞': '((バイパスが事故渋滞で|竹尾インターが詰まっていて))', '子どもの送り': '子どもの送りで', '体調': '体調が悪く病院に寄ってから', 'バスの遅れ': 'バスが遅れていて', '車のバッテリー上がり': '車のバッテリーが上がってしまい' }[T.lateWhy];
  later(w, Math.max(1, plan - 25 + R.int(0, 20) - minuteOfDay(w.t)), 'chat', { ch, from: p.id, text: speak(`${why}、((${T.late}分ほど|少し))遅れます。[[申し訳ありません||すみません]]`, p, b, 'chat', { __greet: true }, 'sorry') });
  if (T.lateWhy === '寝坊' && b) { affect(w, b, p, -2, -2); }
  log(w, `${full(p)}が${T.lateWhy === '雪' ? '雪で' : ''}${T.late}分の遅刻(${T.lateWhy})`, { cat: '勤怠', who: [p] });
}

// ---------- 一日の始まり ----------
function newDay(w) {
  const di = dayIndex(w.t);
  const prevD = w.day >= 0 ? dateOf(w.day) : null;
  w.day = di;
  const d = dateOf(di);
  // 月の締め
  if (prevD && prevD.m !== d.m) monthEnd(w, prevD);
  w.weather = rollWeather(w.weather, d);
  w.prevEco = stepEconomy(w) || w.prevEco;
  // 年度替わり
  if (d.m === 4 && d.d === 1) newFiscal(w, d);
  // 誕生日で年をとる
  for (const p of w.people) if (p.birth.m === d.m && p.birth.d === d.d) p.age++;
  // 復帰・最終日など
  for (const p of w.people) {
    if (p.status === 'leave' && p.flags.maternityBack && d.idx >= p.flags.maternityBack) { p.status = 'active'; delete p.flags.maternity; delete p.flags.maternityBack; log(w, `${full(p)}が育休から復帰`, { cat: '人事', who: [p] }); }
  }
  // 土曜当番
  if (d.wd === 6) {
    const wh = active(w).filter(p => ['driver', 'souko', 'logi'].includes(p.role));
    const drv = wh.filter(p => p.role === 'driver'), rest = wh.filter(p => p.role !== 'driver');
    w.saturdayCrew = [...R.sample(drv, 1), ...R.sample(rest, 3)].map(p => p.id);
  }
  for (const p of w.people) planDay(w, p, d);
  // 日次の出来事
  rollSlot(w, 'daily');
  // 夜の間の心身の回復
  for (const p of active(w)) {
    const s = p.st;
    const rest = companyOff(d) ? 6 : 1.5;
    s.fatigue = clamp(s.fatigue - rest * 2, 0, 100);
    s.stress = clamp(s.stress + (35 - s.stress) * 0.045 - (companyOff(d) ? 1.5 : 0) + (p.life.care ? 0.4 : 0) + (p.st.debt > 40 ? 0.4 : 0), 0, 100);
    s.mood = clamp(s.mood + (60 - s.mood) * 0.12 + R.normal(0, 3), 0, 100);
    s.health = clamp(s.health + (85 - s.health) * 0.03 - (s.stress > 75 ? 0.4 : 0), 0, 100);
    s.quit = clamp(s.quit + (s.stress - 55) / 60 + (45 - s.sat) / 90 - (p.traits.loyal - 50) / 200 + (s.motiv < 30 ? 0.3 : 0), 0, 100);
    s.sat = clamp(s.sat + (50 - s.sat) * 0.005, 0, 100);
    s.motiv = clamp(s.motiv + (55 - s.motiv) * 0.01, 0, 100);
  }
  // 新聞(朝刊)は5時に配達
  later(w, H(5) - minuteOfDay(w.t), 'paper', {});
  // 秘密:たまに自然に漏れる
  emit('day', { day: di });
}

function newFiscal(w, d) {
  if (w.fyStarted === d.y) return;
  w.fyStarted = d.y;
  // 新卒の入社式
  const fresh = w.people.filter(p => p.status === 'pending' && p.newhire);
  for (const p of fresh) { p.status = 'active'; p.flags.joinDay = d.idx; }
  if (fresh.length) {
    later(w, H(9, 0) - minuteOfDay(w.t), 'call', { fn: 'nyushashiki', args: { ps: fresh.map(p => p.id) } });
  }
  if (w.day > 30) {
    for (const p of active(w)) { if (p.emp === '正社員' || p.emp === '契約社員') p.salary = Math.round(p.salary * (1 + R.f(0.005, 0.025)) / 1000) * 1000; p.newhire = false; }
    for (const p of w.people) p.life.kids.forEach(k => k.age++);
    log(w, `${fiscalLabel(d.y)}がスタート。定期昇給は平均${(R.f(1.1, 1.9)).toFixed(1)}%`, { lvl: 1, cat: '人事' });
    // 来年の新卒(採用できるかは景気と業績次第)
    const ord = trailingOrd(w, 12);
    if (ord > -2e7 && R.chance(0.6)) w.hiring = [...(w.hiring || []), { key: 'e1new', role: 'sales', desk: null, dept: '営業一課', name: '新卒' }];
  }
}

function monthEnd(w, prevD) {
  const rec = closeMonth(w, prevD);
  // 1日の朝に経理が速報を出す
  const k = byKey(w, 'keirikacho') || byKey(w, 'keiri');
  const gpPct = (rec.gpr * 100).toFixed(1);
  w.monthlyNote = { rec };
  later(w, H(10, 30) - minuteOfDay(w.t) + 1440 * 0, 'call', { fn: 'monthly_post', args: { ym: rec.ym } });
  // 資金ショート
  if (w.fin.cash < 0) {
    rescue(w, prevD);
  } else if (w.fin.cash < 3e7) {
    log(w, `${prevD.m}月末の現預金残高は${Math.round(w.fin.cash / 1e4).toLocaleString()}万円。資金繰りが厳しい`, { lvl: 2, cat: '金融' });
  }
}

function rescue(w, d) {
  const sh = byKey(w, 'shacho'); const score = creditScore(w);
  const need = -w.fin.cash + 4e7;
  const main = w.banks.find(b => b.main);
  if (!w.fin.bankFreeze && score >= 35) {
    borrow(w, main, Math.ceil(need / 1e7) * 1e7, 5);
    log(w, `月末の支払いに${Math.round(-w.fin.cash / 1e4)}万円足りなくなるところ、${main.name}の緊急融資で乗り切った`, { lvl: 3, cat: '金融', who: sh ? [sh] : [] });
    return;
  }
  if ((w.fin.rescue || 0) < 1 && sh) {
    w.fin.rescue = (w.fin.rescue || 0) + 1;
    const amt = Math.min(need, R.f(3e7, 6e7));
    w.fin.cash += amt; w.fin.directorLoan = (w.fin.directorLoan || 0) + amt;
    log(w, `社長が自宅を担保に個人で${Math.round(amt / 1e4)}万円を用意し、会社に貸し付けた。支払いは何とか間に合った`, { lvl: 3, cat: '金融', who: [sh] });
    remember(w, sh, '自宅を担保に会社に金を入れた', null, 5); stat(sh, 'stress', 30);
    if (w.fin.cash >= 0) return;
  }
  if (w.fin.cash < 0) bankrupt(w, d);
}

function bankrupt(w, d) {
  if (w.ended) return;
  const debt = totalDebt(w) + w.fin.ap.reduce((s, a) => s + a.amt, 0);
  w.ended = { day: w.day, debt, t: w.t };
  const sh = byKey(w, 'shacho');
  log(w, `${w.company.name}は、手形・振込の資金を用意できず、事業の継続を断念`, { lvl: 3, cat: '経営', who: sh ? [sh] : [] });
  news(w, { sec: '経済', big: true, company: true, head: `丸栄商事が破産申請へ 負債${(debt / 1e8).toFixed(1)}億円 創業${d.y - 1964}年の食品卸`, body: `新潟市東区の食品卸「${w.company.name}」は、事業を停止し、新潟地裁に破産を申請する準備に入った。負債総額は約${(debt / 1e8).toFixed(1)}億円。1964年の創業で、県内のスーパーや飲食店、学校給食などに食品を卸していた。大口取引先の取引縮小や食品価格の高騰、借入金の返済負担が重なり、資金繰りに行き詰まった。従業員${active(w).length}人は全員解雇される見通し。` });
  emit('end', w.ended);
}

// ---------- 時刻ごとの出来事 ----------
const SLOTS = { morning: H(9, 20), noon: H(12, 15), afternoon: H(14, 30), evening: H(17, 40), night: H(21, 0) };
function rollSlot(w, slot) {
  const d = dateOf(w.day);
  const off = companyOff(d);
  if (off && slot !== 'daily' && slot !== 'night') return;
  const NULLW = { morning: 4, noon: 4, afternoon: 4, evening: 4, night: 4, daily: 6 };
  const cands = EVENTS.filter(e => e.slot === slot).map(e => { let v = 0; try { v = e.w(w); } catch (er) { v = 0; } return { e, v }; });
  const n = slot === 'night' || slot === 'evening' ? 1 : 2;
  const tried = new Set();
  for (let k = 0; k < n; k++) {
    const pool = cands.filter(c => !tried.has(c.e.id));
    const tot = pool.reduce((s, c) => s + Math.max(0, c.v), 0) + NULLW[slot];
    let r = R.next() * tot; let pick = null;
    for (const c of pool) { r -= Math.max(0, c.v); if (r <= 0) { pick = c.e; break; } }
    if (!pick) continue;
    tried.add(pick.id);
    try { if (pick.run(w)) w.stats.events++; } catch (er) { console.warn('event error', pick.id, er); }
  }
}

function fixedSchedule(w, m) {
  const d = dateOf(w.day);
  const off = companyOff(d);
  if (m === H(5)) { /* paper handled by queue */ }
  if (off) return;
  if (m === H(6, 50)) {
    const h = byKey(w, 'haisha') || byKey(w, 'butsuryushunin');
    if (h && h.today?.in) say(w, 'butsuryu', h, null, `本日の配車です。${R.pick(ROUTES)}${w.weather && /雪|大雨/.test(w.weather.kind) ? '。路面に注意してください' : ''}`, 1);
  }
  if (m === H(8, 30) && d.wd === 1) chorei(w);
  if (m === H(8, 0)) wchorei(w);
  if (m === H(18, 10)) dailyWrap(w);
  if (m === H(17, 20)) nippou(w);
  // 決まった日の行事
  if (m === H(10)) calendarEvents(w, d);
  if (m === H(15) && d.d >= 18 && d.d <= 24 && !w.fin.warnedThisMonth) {
    const pj = projectMonthEnd(w);
    if (pj < 2.5e7) {
      w.fin.warnedThisMonth = true;
      const k = byKey(w, 'keirikacho') || byKey(w, 'keiri'), sh = byKey(w, 'shacho');
      if (k && sh) say(w, 'dm', k, sh, `社長、今月末の資金繰りですが、このままだと((${Math.round(Math.max(0, -pj + 2e7) / 1e4).toLocaleString()}万円ほど|かなり))足りません。((銀行さんに早めに相談したほうが|支払いを一部待ってもらう先を))…`, 1, {}, { to: sh });
      if (sh) say(w, 'dm', sh, k, '((わかった。銀行に電話する|…わかった。誰にも言わないで|また？先月なんとかしたばかりだろう))', 15, {}, { to: k });
    }
  }
  if (d.d === 1 && m === H(0, 5)) w.fin.warnedThisMonth = false;
}

function chorei(w) {
  const att = onSite(w).filter(p => OFFICE_ROLES.includes(p.role) && p.today.floor !== '3' && !p.today.outNow);
  const sp = byKey(w, 'shacho')?.today?.in ? byKey(w, 'shacho') : byKey(w, 'senmu');
  if (!sp || !sp.today?.in) return;
  att.slice(0, CHOREI2.length).forEach((p, i) => callTo(w, p, CHOREI2[i], 14));
  callTo(w, sp, 'board2', 14);
  const topics = ['今週も安全運転で', '先月の数字は目標に届いていません', 'お客様の声を大切に', '整理整頓を徹底しましょう', '報連相を忘れずに', '健康第一で', '挨拶は会社の顔です', '他社はもう動いています'];
  talk(w, sp, null, `おはようございます。((${R.pick(topics)}|${R.pick(topics)}))。((以上です|では今週もよろしく))`, 2, {}, 'chorei');
  log(w, `月曜の全体朝礼。${sp.sei}${titleShort(sp)}の話は${R.int(4, 18)}分`, { cat: '行事' });
}
function wchorei(w) {
  const att = onSite(w).filter(p => ['driver', 'souko', 'logi'].includes(p.role) && !p.today.driving);
  const lead = byKey(w, 'butsuryubucho') || byKey(w, 'butsuryushunin');
  if (!lead || !lead.today?.in || att.length < 3) return;
  att.slice(0, export_wh.chorei.length).forEach((p, i) => callTo(w, p, export_wh.chorei[i], 6));
  talk(w, lead, null, R.pick(['ご安全に！', '((フォークの周り|冷凍庫の扉|台車の置き場所))、気をつけて。ご安全に', '今日は((出荷多い|雨))から気をつけて。ご安全に']), 2, {}, 'wh');
}

function calendarEvents(w, d) {
  const ym = d.m * 100 + d.d;
  const sh = byKey(w, 'shacho');
  if (d.d === 25 || (d.d === 24 && dateOf(w.day + 1).wd === 6) || (d.d === 23 && dateOf(w.day + 2).wd === 0)) {
    const g = active(w).filter(p => p.age < 35 && p.today?.in);
    if (g.length) say(w, 'zatsudan', R.pick(g), null, R.pick(['給料日{w}', '今日給料日！((焼肉|ラーメン))行く人？', '給料日だけど、((カードの引き落としで消える|もう残ってない)){w}']), R.int(60, 200));
  }
  // 賞与
  if ((d.m === 7 && d.d >= 8 && d.d <= 12 && !w.bonusPaid?.includes(`${d.y}-7`)) || (d.m === 12 && d.d >= 8 && d.d <= 12 && !w.bonusPaid?.includes(`${d.y}-12`))) bonus(w, d);
  // 忘年会など
  const fri = d.wd === 5;
  if (fri && d.m === 12 && d.d >= 13 && d.d <= 22 && !w.done?.[`bonen${d.y}`]) party(w, '忘年会', `bonen${d.y}`);
  if (fri && d.m === 4 && d.d >= 8 && d.d <= 21 && !w.done?.[`kangei${d.y}`]) party(w, '歓迎会', `kangei${d.y}`);
  if (fri && d.m === 7 && d.d >= 15 && !w.done?.[`shoki${d.y}`]) party(w, '暑気払い', `shoki${d.y}`);
  if (fri && d.m === 1 && d.d >= 9 && d.d <= 23 && !w.done?.[`shinnen${d.y}`]) party(w, '新年会', `shinnen${d.y}`);
  if (d.m === 1 && d.d >= 4 && d.d <= 7 && !w.done?.[`shigoto${d.y}`] && sh) {
    w.done = w.done || {}; w.done[`shigoto${d.y}`] = true;
    say(w, 'all', sh, null, `新年あけましておめでとうございます。((昨年は大変な一年でした|昨年は皆さんよく頑張ってくれました))。今年は((創業${d.y - 1964}年|変革の年|守りではなく攻めの年))です。((健康に気をつけて|一致団結して))、今年もよろしくお願いします`, 5);
    log(w, '仕事始め。社長の年頭あいさつ。会長が持ってきた樽酒が休憩室に置かれる', { lvl: 1, cat: '行事' });
  }
  if (d.m === 9 && d.d === 1) { log(w, '防災の日。地震を想定した避難訓練。全員が駐車場に集合し、点呼に12分かかった', { cat: '行事' }); }
  if (d.m === 10 && d.d === 1 && sh) { log(w, `創業記念日。社長が朝礼で創業者・丸山栄蔵の話をする。全員に紅白まんじゅう`, { cat: '行事' }); addExpense(w, '福利厚生費', 40000); }
  if (d.m === 4 && d.d >= 8 && d.d <= 14 && d.wd === 3 && sh && !w.done?.[`keikaku${d.y}`]) {
    w.done = w.done || {}; w.done[`keikaku${d.y}`] = true;
    const target = Math.round(w.clients.filter(c => c.status === 'active').reduce((s, c) => s + c.base, 0) * 12 * 1.05 / 1e8 * 10) / 10;
    board(w, { type: '経営', title: `${fiscalLabel(d.y)} 経営計画`, author: sh.id, body: `売上目標:${target}億円(前期比105%)\n営業利益目標:売上高の1.5%\n重点施策:\n・粗利率の改善(赤字取引の見直し)\n・物流コストの削減\n・人材の育成と定着\n・${R.pick(['DXの推進', '新規開拓の強化', '業務用比率の拡大', '安全・品質の徹底'])}` });
    log(w, `${fiscalLabel(d.y)}の経営計画発表会。売上目標は${target}億円`, { lvl: 1, cat: '経営', who: [sh] });
  }
}

function bonus(w, d) {
  w.bonusPaid = w.bonusPaid || []; w.bonusPaid.push(`${d.y}-${d.m}`);
  const ord = trailingOrd(w, 12) + (w.fin.hist.length < 6 ? 2e7 : 0);
  let months = clamp(1.1 + ord / 6e7, 0.2, 2.2);
  if (w.fin.cash < 6e7) months = Math.min(months, 0.5);
  months = Math.round(months * 10) / 10;
  const eligible = active(w).filter(p => p.emp === '正社員' || p.emp === '契約社員' || p.emp === '特定技能');
  const cost = eligible.reduce((s, p) => s + p.salary * months, 0) + active(w).filter(p => p.emp === 'パート' || p.emp === '嘱託').length * 30000;
  addExpense(w, '賞与', cost * 1.15);
  w.fin.cash -= 0;
  const sh = byKey(w, 'shacho');
  log(w, `${d.m === 7 ? '夏' : '冬'}の賞与を支給。平均${months}か月分(総額 約${Math.round(cost / 1e4).toLocaleString()}万円)`, { lvl: 2, cat: '人事' });
  if (sh) say(w, 'all', sh, null, months >= 1.2 ? '((皆さんの頑張りのおかげで|厳しい中でしたが))、賞与を支給できました。((ありがとう|引き続きよろしくお願いします))' : '((今期は業績が厳しく|会社の状況を考え))、賞与は((寸志程度|昨年を下回る額))となりました。((申し訳ない|理解してほしい))。', 30);
  for (const p of eligible) {
    const diff = months - (p.lastBonus ?? 1.0);
    stat(p, 'sat', diff * 10); stat(p, 'mood', diff * 8 + 3); stat(p, 'quit', -diff * 6);
    p.lastBonus = months;
  }
  const g = R.sample(eligible.filter(p => p.age < 45), 2);
  g.forEach((p, i) => say(w, 'dm', p, liked(w, p, eligible) || p, months >= 1.2 ? R.pick(['ボーナス出たね{w}', '思ったより出てた', '((車|ローン))に消える']) : R.pick(['ボーナス、これ寸志ってレベルじゃない？', '((社長の車は新しいのにね|やってられない))', '((本気で転職考える|生活できない))']), R.int(120, 500) + i * 30, {}, { to: liked(w, p, eligible) }));
}

function party(w, name, key) {
  w.done = w.done || {}; w.done[key] = true;
  const ps = atWork(w).filter(p => p.traits.drink > 18 || R.chance(0.5)).filter(p => p.key !== 'kaicho' || R.chance(0.5));
  const place = R.pick(['古町の料亭「鍋茶屋」風の老舗', '駅南のホテルの宴会場', '万代の居酒屋の座敷', '東区の焼肉屋の座敷', '岩室温泉の旅館(一泊)']);
  log(w, `${name}。${place}に${ps.length}人が参加。会費は${R.pick([3000, 4000, 5000])}円、残りは会社持ち`, { lvl: 1, cat: '行事', who: ps.slice(0, 5) });
  addExpense(w, '福利厚生費', ps.length * R.int(3, 6) * 1000);
  const sh = byKey(w, 'shacho');
  for (let i = 0; i < 3; i++) {
    const party2 = R.sample(ps, R.int(3, 6));
    later(w, R.int(150, 300), 'call', { fn: 'drunk', args: { party: party2.map(p => p.id), place } });
  }
  for (const a of ps) for (const b of R.sample(ps, 3)) if (a !== b) affect(w, a, b, 2, 1);
  const no = active(w).filter(p => !ps.includes(p) && p.today?.in);
  if (no.length) log(w, `${no.slice(0, 4).map(p => p.sei).join('・')}${no.length > 4 ? 'ほか' : ''}は不参加`, { cat: '行事' });
  if (sh && name === '忘年会') later(w, R.int(30, 90), 'talk', { from: sh.id, text: speak('((今年一年、お疲れさまでした|乾杯！|来年もよろしく頼みます))', sh, null, 'talk'), place: 'party' });
}

function nippou(w) {
  const d = dateOf(w.day);
  for (const p of atWork(w).filter(p => p.role === 'sales')) {
    if (R.chance(0.15 + (100 - p.b5.C) / 300)) { p.flags.noNippou = (p.flags.noNippou || 0) + 1; continue; }
    const mine = w.clients.filter(c => c.rep === p.id && c.status === 'active');
    const visits = R.sample(mine.length ? mine : activeClients(w), clamp(p.today.outs.length * R.int(1, 3), 1, 5));
    const lines = visits.map(c => {
      const note = R.pick([
        `${c.contact.sei}${c.contact.title}と面談。来月の特売の打ち合わせ`, '定期訪問。特になし', `${pickNote()}の件で${R.pick(['謝罪', '説明', '相談'])}`, `${R.pick(w.competitors)}の営業が来ているとの情報あり`,
        `新商品(${R.pick(['冷凍ちまき', '業務用ガパオの素', '新潟県産米粉パン', '減塩しょうゆ'])})のサンプル提供。反応${R.pick(['良好', 'いまいち', '検討するとのこと'])}`, '請求書の件で経理担当と打ち合わせ', `${c.contact.sei}さん不在のため資料を置いてきた`,
        `値上げのお願い。${R.pick(['渋い顔をされた', '仕方ないと言われた', '上と相談するとのこと'])}`, '店舗の棚割り変更の確認', 'クレームの件で店長に謝罪',
      ]);
      return `・${c.name}:${note}`;
    });
    const tail = R.pick(['', '', `所感:${R.pick(['競合の価格攻勢が強まっている', '物価高で客単価が下がっていると先方', '人手不足でどこも発注が遅れがち', '特になし'])}`]);
    w.nippo = w.nippo || [];
    w.nippo.unshift({ day: w.day, t: w.t, author: p.id, body: lines.join('\n') + (tail ? '\n' + tail : ''), comment: null });
    if (w.nippo.length > 160) w.nippo.pop();
    const b = bossOf(w, p);
    if (b && R.chance(0.3)) w.nippo[0].comment = { by: b.id, text: speak(R.pick(['((了解|確認しました))', '数字で書いて', '先方の反応をもう少し具体的に', 'いいね', '競合の件、詳しく聞かせて', '((ご苦労さま|おつかれ))']), b, p, 'chat') };
  }
  emit('nippo', {});
  function pickNote() { return R.pick(['納品遅れ', '欠品', '誤配送', '請求書', '価格改定', '新店オープン']); }
}

function dailyWrap(w) {
  const t = w.fin.today; if (!t) return;
  log(w, `本日の出荷 ${Math.round(t.sales / 1e4).toLocaleString()}万円(粗利 ${Math.round(t.gp / 1e4).toLocaleString()}万円)。月累計 ${Math.round(w.fin.mtd.sales / 1e4).toLocaleString()}万円`, { cat: '業績' });
  // 残業と疲れ
  for (const p of atWork(w)) {
    const ot = Math.max(0, (p.today.leave || 0) - H(17, 30));
    stat(p, 'fatigue', ot / 20 + 3); stat(p, 'stress', ot / 120 - 0.6 + (p.role === 'sales' ? 0.3 : 0));
    if (ot > 150) { p.flags.overwork = (p.flags.overwork || 0) + 1; } else p.flags.overwork = Math.max(0, (p.flags.overwork || 0) - 0.2);
  }
  w.fin.today = null;
}

// ---------- キュー ----------
function runQueue(w) {
  if (!w.queue.length) return;
  sortQueue(w);
  while (w.queue.length && w.queue[0].t <= w.t) {
    const q = w.queue.shift();
    try {
      if (q.kind === 'chat') {
        const from = P(w, q.data.from);
        if (!from || (from.status !== 'active' && from.status !== 'leave' && !q.data.force)) continue;
        postChat(w, q.data);
      } else if (q.kind === 'talk') {
        const from = P(w, q.data.from);
        if (!from || !from.today?.in || !from.at) continue;
        const e = { ...q.data, t: w.t, place: q.data.place || nodes.get(from.at)?.place, id: (w.talkSeq = (w.talkSeq || 0) + 1) };
        w.talks.push(e); if (w.talks.length > 400) w.talks.shift();
        emit('talk', e);
      } else if (q.kind === 'call') {
        const fn = CONT[q.data.fn] || LOCAL_CONT[q.data.fn];
        if (fn) fn(w, q.data.args || {});
      } else if (q.kind === 'paper') {
        const p = makePaper(w, w.prevEco); w.prevEco = null;
        emit('paper', p);
      }
    } catch (er) { console.warn('queue error', q, er); }
  }
}

const LOCAL_CONT = {
  nyushashiki(w, { ps }) {
    const fresh = ps.map(id => P(w, id)).filter(Boolean);
    const sh = byKey(w, 'shacho');
    const seats = ['meet3_a1', 'meet3_a2', 'meet3_a3', 'meet3_a4'];
    fresh.forEach((p, i) => callTo(w, p, seats[i], 50));
    if (sh) { callTo(w, sh, 'meet3_h', 50); talk(w, sh, null, '((入社おめでとう|ようこそ丸栄商事へ))。((うちは小さな会社だが|お客様の台所を支える仕事です))。((失敗を恐れずに|まずは元気な挨拶から))', 5); }
    log(w, `3階会議室で入社式。新入社員は${fresh.map(p => full(p)).join('、')}の${fresh.length}人`, { lvl: 2, cat: '人事', who: fresh });
    fresh.forEach((p, i) => say(w, 'all', p, null, `本日入社しました、${full(p)}です。出身は${p.life.born}、${p.life.edu}を卒業しました。((趣味は${p.life.hobby[0]}です|${p.life.hobby[0]}が好きです))。((一日も早く仕事を覚えられるよう|ご迷惑をおかけすることも多いと思いますが))、よろしくお願いいたします！`, 70 + i * 12));
    const welc = active(w).filter(p => !fresh.includes(p) && p.b5.E > 55).slice(0, 4);
    welc.forEach((p, i) => say(w, 'all', p, fresh[0], R.pick(['よろしくお願いします！', 'ようこそ！', 'わからないことは何でも聞いてね', '@sticker:ok']), 100 + i * 7));
  },
  monthly_post(w, { ym }) {
    const rec = w.fin.hist.find(r => r.ym === ym); if (!rec) return;
    const k = byKey(w, 'keirikacho') || byKey(w, 'keiri');
    board(w, { type: '月次', title: `${rec.y}年${rec.m}月 月次試算表(速報)`, author: k?.id, rec, body: '' });
    const sh = byKey(w, 'shacho');
    const good = rec.op > 0;
    log(w, `${rec.m}月の月次:売上 ${Math.round(rec.sales / 1e4).toLocaleString()}万円、営業利益 ${rec.op >= 0 ? '' : '△'}${Math.round(Math.abs(rec.op) / 1e4).toLocaleString()}万円。月末の現預金 ${Math.round(rec.cash / 1e4).toLocaleString()}万円`, { lvl: good ? 1 : 2, cat: '業績' });
    if (sh) say(w, 'all', sh, null, good ? `${rec.m}月は((何とか黒字|営業利益${Math.round(rec.op / 1e4)}万円))でした。((気を抜かずに|この調子で))` : `${rec.m}月は((${Math.round(-rec.op / 1e4)}万円の赤字|赤字))です。((経費の見直しを各部署で|何が原因か、各部長は報告を))((お願いします|出してください))`, R.int(60, 180));
    if (rec.fyClose) {
      const f = rec.fyClose;
      board(w, { type: '決算', title: `${fiscalLabel(f.fy)} 決算(速報)`, author: k?.id, body: `売上高 ${(f.sales / 1e8).toFixed(2)}億円\n売上総利益 ${(f.gp / 1e8).toFixed(2)}億円\n営業利益 ${Math.round(f.op / 1e4).toLocaleString()}万円\n経常利益 ${Math.round(f.ord / 1e4).toLocaleString()}万円\n法人税等 ${Math.round(f.tax / 1e4).toLocaleString()}万円(5月納付)` });
      log(w, `${fiscalLabel(f.fy)}の決算が締まる。売上 ${(f.sales / 1e8).toFixed(2)}億円、経常利益 ${Math.round(f.ord / 1e4).toLocaleString()}万円`, { lvl: 2, cat: '業績' });
      news(w, { sec: '経済', head: `県内企業の決算 ${w.company.short}は${f.ord >= 0 ? '増益' : '赤字'}`, body: `${w.company.name}(新潟市東区)の${fiscalLabel(f.fy)}決算は、売上高${(f.sales / 1e8).toFixed(1)}億円、経常損益${f.ord >= 0 ? '' : '△'}${Math.round(Math.abs(f.ord) / 1e6) / 100}億円だった。`, company: true });
    }
  },
};

// ---------- 人の動き ----------
function inWindow(m, [a, b]) { return m >= a && m < b; }
function homeNode(p) { return p.desk || null; }
const WH_SPOTS = () => [...export_wh.pick, ...export_wh.rack, export_wh.cold, export_wh.frozen, ...export_wh.dock];

function desiredNode(w, p, m) {
  const T = p.today;
  if (!T || T.absent || T.arrive == null) return null;
  if (m < T.arrive || m >= T.leave) return null;
  if (p.busy && p.busy.until > w.t) return p.busy.at;
  for (const o of T.outs) if (inWindow(m, o)) return null;
  if (T.drive && inWindow(m, T.drive)) return null;
  if (T.lunch && inWindow(m, [T.lunch.at, T.lunch.until])) {
    const L = T.lunch.place;
    if (L === 'out' || L === 'car') return null;
    if (L === 'rest1') return p.lunchSeat || (p.lunchSeat = R.pick(['rest1_0', 'rest1_1', 'rest1_2', 'rest1_3', 'rest1_4', 'rest1_5']));
    if (L === 'wbreak') return p.lunchSeat || (p.lunchSeat = R.pick(['wbreak_0', 'wbreak_1', 'wbreak_2', 'wbreak_3']));
    if (L === 'desk') return homeNode(p) || 'wbreak_0';
  }
  if (p.micro && p.micro.until > w.t) return p.micro.at;
  // 役割ごとの居場所
  if (p.role === 'driver') {
    if (T.drive && m < T.drive[0]) return R.pick(export_wh.dock);
    return p.desk || 'wbreak_' + (parseInt(p.id.slice(1)) % 4);
  }
  if (p.role === 'souko') {
    if (!p.workSpot || (p.workUntil || 0) <= w.t) { p.workSpot = R.pick(WH_SPOTS()); p.workUntil = w.t + R.int(4, 16); }
    return p.workSpot;
  }
  return homeNode(p) || 'wbreak_0';
}

function microBreaks(w, p, m) {
  if (p.micro && p.micro.until > w.t) return;
  if (p.busy && p.busy.until > w.t) return;
  const node = nodes.get(p.at); if (!node) return;
  const fl = node.fl;
  const r = R.next();
  if (p.smoker && (!p.lastSmoke || w.t - p.lastSmoke > (p.today.smokeGap || 80) - p.st.stress / 3) && r < 0.08 && m > H(8, 40) && m < H(17, 30)) {
    p.lastSmoke = w.t; p.micro = { until: w.t + R.int(6, 10), at: R.pick(['smoke_0', 'smoke_1', 'smoke_2', 'smoke_3']) }; return;
  }
  if (r < 0.006) { p.micro = { until: w.t + R.int(3, 6), at: 'wc' + (fl === 'W' || fl === 'O' ? '1' : fl) }; return; }
  if (r < 0.012 && fl !== 'W') { const k = fl === '1' || fl === '3' ? R.pick(['kitchen1_0', 'kitchen1_1', 'kitchen1_2']) : R.pick(['kitchen2_0', 'kitchen2_1', 'kitchen2_2']); p.micro = { until: w.t + R.int(3, 8), at: k }; return; }
  if (r < 0.016 && fl === 'W' && p.role !== 'souko') { p.micro = { until: w.t + R.int(4, 9), at: R.pick(['wbreak_0', 'wbreak_1', 'wbreak_2', 'wbreak_3']) }; return; }
  if (r < 0.019 && fl === '2') { p.micro = { until: w.t + R.int(2, 4), at: R.pick(['copy2', 'fax2', 'board2']) }; return; }
  if (r < 0.021 && fl === 'W' && p.role === 'souko') { p.micro = { until: w.t + R.int(5, 8), at: R.pick(['wbreak_0', 'wbreak_1', 'wbreak_2']) }; return; }
}

function updatePeople(w, m) {
  for (const p of w.people) {
    if (p.status !== 'active') { if (p.at) { p.at = null; } if (p.today) p.today.in = false; continue; }
    const T = p.today; if (!T) continue;
    const wasIn = T.in;
    const inPremises = T.arrive != null && m >= T.arrive && m < T.leave;
    T.in = inPremises;
    if (!wasIn && T.in) arrive(w, p);
    if (wasIn && !T.in) leave(w, p);
    if (!T.in) { p.at = null; continue; }
    // 外出(営業・社長)
    const outNow = T.outs.some(o => inWindow(m, o));
    if (outNow && !T.outNow) goOut(w, p);
    if (!outNow && T.outNow) comeBack(w, p);
    T.outNow = outNow;
    if (T.drive) {
      const dr = inWindow(m, T.drive);
      if (dr && !T.driving) truckOut(w, p);
      if (!dr && T.driving) truckBack(w, p);
      T.driving = dr;
    }
    const lunchOut = !!(T.lunch && (T.lunch.place === 'out' || T.lunch.place === 'car') && inWindow(m, [T.lunch.at, T.lunch.until]));
    if (lunchOut !== !!T.lunchOut) { T.lunchOut = lunchOut; if (p.car) carState(w, p.car, T.lunch.place === 'car' ? true : !lunchOut); }
    const want = desiredNode(w, p, m);
    if (want && p.at && want === homeNode(p)) microBreaks(w, p, m);
    const want2 = desiredNode(w, p, m);
    if (want2 !== p.at) { p.at = want2; p.moved = w.t; }
    T.floor = p.at ? nodes.get(p.at)?.fl : null;
  }
}
function carState(w, carId, here) { const c = w.cars.find(c => c.id === carId); if (c && c.here !== here) { c.here = here; c.changed = w.t; } }
function arrive(w, p) {
  if (p.car) carState(w, p.car, true);
  p.lunchSeat = null; p.workSpot = null; p.micro = null; p.busy = null;
}
function leave(w, p) {
  if (p.car) carState(w, p.car, false);
  p.at = null;
}
function goOut(w, p) {
  if (p.key === 'shacho') { carState(w, p.car, false); if (p.today.outWhy) log(w, `社長が外出(${p.today.outWhy})`, { cat: '動き', who: [p] }); return; }
  const van = w.cars.find(c => c.kind === 'van' && c.here && !c.user);
  if (van) { van.user = p.id; carState(w, van.id, false); p.today.van = van.id; }
  else if (p.car) carState(w, p.car, false);
}
function comeBack(w, p) {
  if (p.key === 'shacho') { carState(w, p.car, true); return; }
  const van = w.cars.find(c => c.id === p.today.van);
  if (van) { van.user = null; carState(w, van.id, true); p.today.van = null; }
  else if (p.car) carState(w, p.car, true);
}
function truckOut(w, p) { const t = w.trucks[p.truck ?? 0]; if (t) { t.state = 'out'; t.changed = w.t; t.driver = p.id; t.km += R.int(80, 180); } }
function truckBack(w, p) { const t = w.trucks[p.truck ?? 0]; if (t) { t.state = 'dock'; t.changed = w.t; } }

// ---------- 会話 ----------
function conversations(w, m) {
  const groups = new Map();
  for (const p of w.people) {
    if (p.status !== 'active' || !p.at || !p.today?.in) continue;
    const n = nodes.get(p.at); if (!n || !n.place) continue;
    if (!groups.has(n.place)) groups.set(n.place, []);
    groups.get(n.place).push(p);
  }
  w.talkBusy = w.talkBusy || {};
  for (const [pl, ps] of groups) {
    if (ps.length < 2) {
      if (ps.length === 1 && R.chance(0.004)) mutter(w, ps[0], pl);
      continue;
    }
    if ((w.talkBusy[pl] || 0) > w.t) continue;
    const info = placeInfo[pl];
    const ctx = info ? info.talk : 'desk';
    if (ctx === 'none' || ctx === 'chorei') continue;
    const chance = ctx === 'desk' ? 0.012 * ps.length : ctx === 'warehouse' ? 0.04 : ctx === 'meeting' || ctx === 'pres' ? 0.05 : 0.22;
    if (!R.chance(chance)) continue;
    startTalk(w, pl, ctx, ps);
  }
}
function mutter(w, p, pl) {
  const ctx = placeInfo[pl]?.talk || 'desk';
  const bank = MUTTER[ctx]; if (!bank) return;
  talk(w, p, null, R.pick(bank), 0, {}, pl);
}
function startTalk(w, pl, ctx, ps) {
  const A = R.weighted(ps, p => 1 + p.b5.E / 20);
  const B = R.weighted(ps.filter(p => p !== A), p => 1 + rel(w, A, p).fam / 15 + Math.max(0, rel(w, A, p).aff) / 20);
  if (!A || !B) return;
  const d = dateOf(w.day);
  // うわさ話
  if (R.chance(A.traits.gossip / 160) && ['kyuto', 'smoke', 'wbreak', 'lunch', 'park'].includes(ctx)) {
    const sec = w.secrets.find(s => !s.exposed && knows(s, A) && !knows(s, B) && !s.subj.includes(B.id) && (rel(w, A, B).trust > -10));
    if (sec) {
      const lines = [
        ['A', `((ここだけの話なんだけど|内緒ね。|聞いた？))${sec.text}`],
        ['B', R.pick(['((えっ、ほんとに？|うそでしょ|やっぱり？|まじか…))', '((誰に聞いたの？|それ、ほかの人には言わないほうがいいよ))'])],
      ];
      if (sec.subj.some(id => rel(w, B, { id }).aff > 30)) lines.push(['B', '((信じられない|そんな人じゃないと思うけど))']);
      runLines(w, 'talk', { A, B }, lines, {}, 0, { place: pl });
      tell(w, sec, B);
      w.talkBusy[pl] = w.t + 4;
      for (const id of sec.subj) { const s = P(w, id); if (s) affect(w, B, s, -sec.sev, -sec.sev); }
      affect(w, A, B, 1, 1);
      log(w, `${placeInfo[pl]?.name || 'どこか'}で${A.sei}が${B.sei}にひそひそ話`, { cat: '噂', who: [A, B] });
      checkExposure(w, sec);
      return;
    }
  }
  const cands = TALKS.filter(t => t.at.includes(ctx) && (!t.mon || t.mon.includes(d.m)));
  for (let i = 0; i < 6; i++) {
    const tpl = R.weighted(cands, t => t.w || 1);
    if (!tpl) return;
    let a = A, b = B;
    if (tpl.fixA && !tpl.fixA(a)) [a, b] = [b, a];
    if (tpl.cond && !tpl.cond(a, b)) { if (tpl.cond(b, a)) [a, b] = [b, a]; else continue; }
    const cast = { A: a, B: b };
    if (tpl.tag === 'guchi') {
      const c = disliked(w, a, active(w).filter(q => q !== b && q !== a));
      if (!c || rel(w, a, b).trust < 0) continue;
      cast.C = c;
    }
    const vars = stdVars(w, a);
    vars.kid = a.life.kids[0] ? (a.life.kids[0].g === 'm' ? '息子' : '娘') : '';
    const { end } = runLines(w, 'talk', cast, tpl.lines, vars, 0, { place: pl });
    w.talkBusy[pl] = w.t + end + R.int(3, 10);
    affect(w, a, b, 1, 0.5); affect(w, b, a, 1, 0.5);
    if (cast.C) {
      affect(w, a, cast.C, -1, 0); affect(w, a, b, 2, 2);
      if (R.chance(b.traits.gossip / 400)) { const g = newSecretSmall(w, a, cast.C); if (g) tell(w, g, b); }
    }
    return;
  }
}
function newSecretSmall(w, a, c) {
  if (w.secrets.some(s => s.kind === 'warukuchi' && s.subj[0] === a.id && !s.exposed)) return null;
  const s = { id: 'sec' + (w.secretSeq = (w.secretSeq || 0) + 1), kind: 'warukuchi', subj: [a.id], target: c.id, text: `${a.sei}さん、${c.sei}${titleShort(c) || 'さん'}の悪口ばっかり言ってるよ`, sev: 1, known: [a.id], exposed: false, day: w.day };
  w.secrets.push(s); return s;
}
function checkExposure(w, sec) {
  const n = sec.known.length;
  const sh = byKey(w, 'shacho'), sb = byKey(w, 'soumubucho');
  const bossKnows = (sh && sec.known.includes(sh.id) && !sec.subj.includes(sh.id)) || (sb && sec.known.includes(sb.id) && !sec.subj.includes(sb.id));
  const thr = { 1: 14, 2: 12, 3: 10, 4: 11, 5: 13 }[sec.sev] || 10;
  if (n >= thr || (bossKnows && sec.sev >= 3 && R.chance(0.5))) {
    if (['pawahara', 'theft', 'label', 'funshoku', 'embezzle', 'affair', 'romance', 'ma', 'raise', 'jobhunt'].includes(sec.kind)) exposeSecret(w, sec);
    else sec.exposed = true;
  }
  if (sec.kind === 'warukuchi' && sec.target) {
    const t = P(w, sec.target);
    if (t && sec.known.includes(t.id)) { const a = P(w, sec.subj[0]); if (a) { affect(w, t, a, -15, -15); remember(w, t, `${a.sei}が陰で自分の悪口を言っていると聞いた`, a, 3); sec.exposed = true; } }
  }
}

// ---------- 社内チャット(ふだんのやりとり) ----------
function resolveRole(w, spec, cast, pool) {
  if (!spec) return null;
  const used = new Set(Object.values(cast).filter(Boolean).map(p => p.id));
  const free = pool.filter(p => !used.has(p.id));
  const A = cast.A;
  if (spec === 'any') return R.pick(free);
  if (spec === 'boss') return R.pick(free.filter(p => p.boss));
  if (spec === 'bossA') { const b = A && bossOf(w, A); return b && !used.has(b.id) && pool.includes(b) ? b : null; }
  if (spec === 'mateA') return R.pick(free.filter(p => A && (p.dept === A.dept)));
  if (spec === 'closeA') { const c = free.filter(p => A && rel(w, A, p).aff > 15 && rel(w, A, p).trust > 5); return c.length ? R.weighted(c, p => rel(w, A, p).aff) : null; }
  if (['exec', 'admin', 'acct', 'it', 'reception', 'sales', 'jimu', 'buyer', 'logi', 'driver', 'souko'].includes(spec)) return R.pick(free.filter(p => p.role === spec || (spec === 'logi' && p.key === 'butsuryubucho')));
  return free.find(p => p.key === spec) || null;
}
function routineChat(w, m) {
  const d = dateOf(w.day);
  const h = Math.floor(m / 60);
  const off = companyOff(d);
  const evening = h >= 18 && h <= 22;
  if (off && !evening) return;
  const rate = off ? 0.004 : evening ? 0.02 : h >= 8 && h < 18 ? 0.065 : h >= 6 && h < 8 ? 0.02 : 0;
  if (!R.chance(rate)) return;
  const pool = evening || off ? active(w) : atWork(w);
  if (pool.length < 2) return;
  const cands = CHATS.filter(c => h >= c.h[0] && h < c.h[1] && (!c.mon || c.mon.includes(d.m)) && (!evening || c.ch === 'dm' || c.ch === 'zatsudan'));
  for (let i = 0; i < 5; i++) {
    const tpl = R.weighted(cands, c => c.w || 1);
    if (!tpl) return;
    const cast = {};
    const roles = { ...tpl.roles, ...(tpl.extraRoles || {}) };
    let ok = true;
    for (const k of Object.keys(roles).sort()) { cast[k] = resolveRole(w, roles[k], cast, pool); if (!cast[k]) { ok = false; break; } }
    if (!ok) continue;
    if (tpl.tag === 'guchi') { const c = disliked(w, cast.A, active(w).filter(q => q !== cast.B && q !== cast.A)); if (!c) continue; cast.C = c; affect(w, cast.A, c, -1, 0); }
    const vars = stdVars(w, cast.A);
    vars.route = R.pick(ROUTES);
    runLines(w, tpl.ch, cast, tpl.lines, vars, R.int(0, 2));
    if (tpl.ch === 'dm' && cast.B) affect(w, cast.A, cast.B, 1, 1);
    return;
  }
}

// ---------- 1分すすめる ----------
export function step(w) {
  if (w.ended) return;
  w.t++;
  const m = minuteOfDay(w.t);
  if (dayIndex(w.t) !== w.day) newDay(w);
  runQueue(w);
  for (const [slot, at] of Object.entries(SLOTS)) if (m === at) rollSlot(w, slot);
  fixedSchedule(w, m);
  const d = dateOf(w.day);
  // 売上は配送が戻る夕方に計上
  if (m === H(16, 30)) dailySales(w, d);
  if (m >= H(5, 50) && m <= H(21, 30)) {
    updatePeople(w, m);
    conversations(w, m);
  } else if (m === H(21, 31)) {
    for (const p of w.people) { if (p.today) p.today.in = false; p.at = null; }
    for (const c of w.cars) if (c.owner) carState(w, c.id, false);
  }
  routineChat(w, m);
}

// 画面からの読み出し用
export function isActiveHours(w) {
  const m = minuteOfDay(w.t); const d = dateOf(dayIndex(w.t));
  if (companyOff(d)) return d.wd === 6 && warehouseOpen(d) && m >= H(7) && m < H(16) ? 'sat' : false;
  return m >= H(6) && m < H(20, 30);
}
