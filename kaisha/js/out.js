// 出来事・チャット・会話・掲示板・新聞を「予定」に積み、時刻が来たら画面へ流す

import { R, fill } from './util.js';
import { speak, sticker } from './style.js';
import { callName, bossOf, deptMates, full } from './people.js';
import { rel } from './world.js';
import { PRODUCTS } from './world.js';
import { fmtTime } from './calendar.js';

const listeners = {};
export function on(type, cb) { (listeners[type] = listeners[type] || []).push(cb); }
export function emit(type, data) { for (const cb of listeners[type] || []) cb(data); }

export const P = (w, id) => w.people.find(p => p.id === id);
export const byKey = (w, k) => w.people.find(p => p.key === k && p.status === 'active');
export const active = w => w.people.filter(p => p.status === 'active');
export const atWork = w => w.people.filter(p => p.status === 'active' && p.today?.in);
export const onSite = w => w.people.filter(p => p.status === 'active' && p.today?.in && p.at);

// ---- 出来事ログ ----
//  lvl 0:小 1:ふつう 2:大 3:重大(画面に見出し)
export function log(w, text, opt = {}) {
  const e = { t: w.t, text, lvl: opt.lvl ?? 0, cat: opt.cat || '社内', who: (opt.who || []).map(p => p.id || p), id: (w.logSeq = (w.logSeq || 0) + 1) };
  w.logs.push(e); if (w.logs.length > 600) w.logs.splice(0, w.logs.length - 600);
  emit('log', e);
  return e;
}

// ---- 予定(シリアライズできる形) ----
export function later(w, delay, kind, data) {
  w.queue.push({ t: w.t + Math.max(0, Math.round(delay)), kind, data });
}
export function sortQueue(w) { w.queue.sort((a, b) => a.t - b.t); }

// ---- チャット ----
export function dmKey(a, b) { return [a.id || a, b.id || b].sort().join('|'); }
export function postChat(w, msg) {
  // msg: {ch, from, text, dm?:[a,b], sticker?}
  const m = { ...msg, t: w.t, id: (w.msgSeq = (w.msgSeq || 0) + 1) };
  if (m.ch === 'dm') {
    const k = m.dm.slice().sort().join('|');
    const arr = w.channels.dm[k] = w.channels.dm[k] || [];
    arr.push(m); if (arr.length > 120) arr.shift();
  } else {
    const arr = w.channels[m.ch]; arr.push(m); if (arr.length > 300) arr.shift();
  }
  emit('chat', m);
}
export function chat(w, ch, from, text, delay = 0, opt = {}) {
  later(w, delay, 'chat', { ch, from: from.id || from, text, dm: opt.to ? [from.id || from, opt.to.id || opt.to] : undefined });
}
// 文例を、話し手と相手の関係に応じて仕上げてから送る
export function say(w, ch, sp, tg, text, delay = 0, vars = {}, opt = {}) {
  if (!sp || (ch === 'dm' && !(opt.to || tg))) return '';
  const mood = /すみません|申し訳|ごめん/.test(text) ? 'sorry' : /ありがと|助かり|よかった|おめでと/.test(text) ? 'happy' : opt.mood || 'neutral';
  const out = text.startsWith('@sticker:') ? sticker(sp, text.slice(9)) : speak(text, sp, tg, 'chat', { ...vars, __greet: opt.greet }, mood);
  later(w, delay, 'chat', { ch, from: sp.id, text: out, dm: ch === 'dm' ? [sp.id, (opt.to || tg).id] : undefined });
  return out;
}

// ---- 口頭の会話 ----
export function talk(w, sp, tg, text, delay = 0, vars = {}, place = null) {
  const out = speak(text, sp, tg, 'talk', vars);
  later(w, delay, 'talk', { from: sp.id, to: tg?.id, text: out, place });
  return out;
}

// ---- 掲示板 ----
export function board(w, post) {
  const b = { t: w.t, day: w.day, id: (w.boardSeq = (w.boardSeq || 0) + 1), ...post };
  w.board.unshift(b); if (w.board.length > 200) w.board.pop();
  emit('board', b);
  return b;
}
// ---- 新聞 ----
export function news(w, art) {
  // art: {sec, head, body, big?, company?}
  const a = { day: w.day, id: (w.newsSeq = (w.newsSeq || 0) + 1), ...art };
  w.pendingNews = w.pendingNews || [];
  w.pendingNews.push(a);
  return a;
}

// ---- 文例(チャット)の実行 ----
export function pickProduct() { return R.pick(PRODUCTS); }
export function stdVars(w, A) {
  const clients = w.clients.filter(c => c.status === 'active');
  const mine = A ? clients.filter(c => c.rep === A.id) : [];
  const c = mine.length && R.chance(0.75) ? R.pick(mine) : R.pick(clients);
  const s = R.pick(w.suppliers);
  return {
    cust: c.name, contact: c.contact.sei, prod: pickProduct(), sup: s.name, comp: R.pick(w.competitors),
    num: R.int(2, 30), num2: R.int(0, 40), num3: R.pick([5, 10, 15, 20, 30, 50]), num4: R.int(3, 25), num5: R.int(86, 108),
    num6: R.int(1, 6), num7: R.int(1, 5), num8: R.int(33, 39), num9: R.pick(['20', '25', '末']),
    loc: `${R.pick(['A', 'B', 'C', 'D'])}-${R.int(1, 12)}-${R.int(1, 4)}`, truck: R.pick(['1号車', '2号車', '3号車']),
    hobby: A?.life.hobby[0] || '', home: A?.life.home || '', car: A?.life.car || '', pet: A?.life.pet || '',
    _client: c,
  };
}

export function runLines(w, ch, cast, lines, vars, startDelay = 0, opt = {}) {
  let t = startDelay;
  const said = [];
  lines.forEach((ln, i) => {
    const [who, body] = ln;
    const sp = cast[who]; if (!sp) return;
    const tgKey = who === 'A' ? 'B' : 'A';
    const tg = cast[tgKey] || null;
    let text = body;
    if (typeof body === 'object') {
      const bad = sp.b5.A < 38 || sp.st.stress > 72 || (tg && rel(w, sp, tg).aff < -25);
      text = bad && body.neg ? body.neg : body.pos;
    }
    if (!text) return;
    const v = { ...vars };
    for (const k of Object.keys(cast)) v['n' + k] = cast[k] ? callName(sp, cast[k]) : '';
    if (i > 0) t += ch === 'talk' ? R.int(1, 2) : Math.max(1, Math.round(sp.style.reply * R.f(0.4, 1.5)));
    if (ch === 'talk') said.push(talk(w, sp, tg, text, t, v, opt.place));
    else said.push(say(w, ch, sp, tg, text, t, v, { greet: i === 0 && ch !== 'zatsudan' && ch !== 'dm', to: ch === 'dm' ? tg : null }));
  });
  return { said, end: t };
}

export function nameList(ps) { return ps.map(p => p.sei).join('、'); }
export function stamp(w) { return fmtTime(w.t); }
