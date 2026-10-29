// 入り口:世界をつくり、時間を回し、画面と3Dをつなぐ

import { createWorld } from './world.js';
import { bind, step, isActiveHours } from './sim.js';
import { on } from './out.js';
import { View } from './view3d.js';
import { UI } from './ui.js';
import { minuteOfDay, dayIndex, dateOf, companyOff } from './calendar.js';
import { full, titleShort, moodWord } from './people.js';
import { placeInfo, nodes } from './map.js';
import { R } from './util.js';

const SAVE_KEY = 'kaisha-kansatsu-v3';
let w = null, view = null, ui = null;
let speed = 1, acc = 0, follow = null, lastSave = 0;

function save() {
  if (!w) return;
  try {
    w.seedState = R.s;
    const slim = { ...w, talks: w.talks.slice(-120), logs: w.logs.slice(-400) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
  } catch (e) { /* 保存できなくても動き続ける */ }
}
function load() {
  try { const s = localStorage.getItem(SAVE_KEY); if (s) return JSON.parse(s); } catch (e) { }
  return null;
}

function start(world) {
  w = world; bind(w);
  if (view) { for (const v of view.people.values()) view.scene.remove(v.g); view.people.clear(); for (const v of view.cars.values()) view.scene.remove(v.g); view.cars.clear(); for (const t of view.trucks) view.scene.remove(t.g); view.trucks = []; }
  ui.setWorld(w);
  if (w.ended) ui.showEnd(w, w.ended);
}

function boot() {
  ui = new UI({
    floor: n => view.setFloor(n),
    speed: s => { speed = s; },
    skip: () => skipToMorning(),
    select: (pid, open) => { view.select(pid); if (open) ui.openProfile(pid); },
    follow: pid => { follow = pid; view.select(pid); view.focusOn(pid); },
    newGame: () => { localStorage.removeItem(SAVE_KEY); start(createWorld((Math.random() * 1e9) | 0)); },
  });
  view = new View(document.getElementById('view'));
  view.onPick = pid => { if (pid) { view.select(pid); ui.openProfile(pid); } else { follow = null; view.select(null); } };
  view.onHover = pid => {
    const p = w.people.find(q => q.id === pid); if (!p) return null;
    const n = p.at && nodes.get(p.at);
    return `<b>${full(p)}</b> <span>${p.dept}${p.title ? ' ' + p.title : ''}</span><br><span>${n ? (placeInfo[n.place]?.name || (p.at === p.desk ? '自席' : '')) : ''} ${moodWord(p)}</span>`;
  };
  on('log', e => ui.onLog(e));
  on('chat', m => ui.onChat(m));
  on('talk', e => { ui.onTalk(e); view.bubble(e.from, e.text, speedFactor()); });
  on('board', () => { if (ui.tab === 'board') ui.renderTab(); });
  on('nippo', () => { if (ui.tab === 'nippo') ui.renderTab(); });
  on('paper', p => ui.onPaper(p));
  on('end', e => { save(); setTimeout(() => ui.showEnd(w, e), 1500); });
  const saved = load();
  start(saved && saved.v === 3 ? saved : createWorld((Math.random() * 1e9) | 0));
  ui.markSpeed(speed);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);
  let last = performance.now(), hdr = 0, light = 0;
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    advance(dt);
    view.sync(w, speedFactor());
    if (follow) view.focusOn(follow);
    view.frame(dt, speedFactor());
    hdr += dt; light += dt;
    if (hdr > 0.25) { ui.tickHeader(); hdr = 0; }
    if (light > 4) { ui.refreshLight(); light = 0; }
    if (now - lastSave > 30000) { save(); lastSave = now; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// 1秒あたり何分すすめるか
function baseRate() {
  const a = isActiveHours(w);
  if (a === true) return 1;
  if (a === 'sat') return 4;
  return 40;
}
function speedFactor() { return speed * (isActiveHours(w) ? 1 : 1); }
function advance(dt) {
  if (!speed || w.ended) return;
  acc += dt * baseRate() * speed;
  let n = Math.floor(acc); acc -= n;
  n = Math.min(n, 3000);
  for (let i = 0; i < n; i++) step(w);
}
function skipToMorning() {
  // 翌営業日の朝7時半まで一気に進める(画面への細かい流れは省く)
  let guard = 0;
  const target = () => { const m = minuteOfDay(w.t); const d = dateOf(dayIndex(w.t)); return !companyOff(d) && m >= 450 && m < 460; };
  step(w);
  while (!target() && guard < 1440 * 5) { step(w); guard++; }
}

boot();
