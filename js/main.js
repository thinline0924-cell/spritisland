// 起動と操作
const ACT = {
  home() { App.play = null; render(); },
  help() { App.help = true; render(); },
  closehelp() { App.help = false; render(); },

  reset() { ask('今のキャリアを消して、最初からやり直しますか?', '消してやり直す', 'doreset'); },
  doreset() {
    clearSave(); G = null; App.ask = null; App.help = false; App.play = null; App.newForm = null; render();
  },
  continue() { G = loadGame(); render(); },
  newform() {
    if (loadGame()) return ask('保存されているキャリアは消えます。新しく始めますか?', '新しく始める', 'donewform');
    ACT.donewform();
  },
  donewform() {
    App.ask = null;
    App.newForm = { name: '', number: U.ri(2, 99), strength: 'pace' }; render();
  },
  cancelnew() { App.newForm = null; render(); },
  create() {
    const f = App.newForm;
    f.name = ($('#f-name').value || '').trim() || 'ミナト';
    f.number = U.clamp(parseInt($('#f-num').value, 10) || 7, 2, 99);
    newCareer(f.name, f.number, f.strength);
    App.newForm = null; window.scrollTo(0, 0); render();
  },
  set(arg, el) {
    const path = el.dataset.path, val = el.dataset.val;
    if (!G && App.newForm) { App.newForm.name = $('#f-name').value; App.newForm.number = $('#f-num').value; setPath(App.newForm, path, val); }
    else { setPath(G.weekend, path, val); if (G.weekend.plan) normPlan(G.weekend.plan, curSeries()); saveGame(); }
    render();
  },
  sign(i) {
    startSeason(G.offers[Number(i)]);
    G.seasonEnd = null; saveGame(); window.scrollTo(0, 0); render();
  },
  retire() { if (careerMustEnd()) ACT.doretire(); else ask('ここで引退しますか?', '引退する', 'doretire'); },
  doretire() { App.ask = null; retire(); window.scrollTo(0, 0); render(); },
  askno() { App.ask = null; render(); },
  weekend() { startWeekend(); window.scrollTo(0, 0); render(); },
  practice() { practiceRun(); render(); },
  qualify() { runQualifying(); window.scrollTo(0, 0); render(); },
  toplan() {
    const s = curSeries(), wk = G.weekend;
    wk.plan = defaultRallyPlan(s, venueOf(s.id, wk.vid), wk);
    wk.stage = 'plan'; saveGame(); window.scrollTo(0, 0); render();
  },
  useopt(i) {
    const o = App.opts[Number(i)], p = G.weekend.plan;
    p.start = o.start; p.stops = o.stops.map(x => ({ ...x })); p.styles = new Array(o.stops.length + 1).fill('normal');
    saveGame(); render();
  },
  addstop() {
    const s = curSeries(), p = G.weekend.plan;
    const lastLap = p.stops.length ? p.stops[p.stops.length - 1].lap : 0;
    p.stops.push({ lap: Math.min(s.laps - 1, Math.round((lastLap + s.laps) / 2)), tyre: s.dry.includes('M') ? 'M' : s.dry[0] });
    normPlan(p, s); saveGame(); render();
  },
  delstop(i) { const p = G.weekend.plan; p.stops.splice(Number(i), 1); normPlan(p, curSeries()); saveGame(); render(); },
  race() { runRace(); App.play = { live: true, idx: 0, speed: 1 }; window.scrollTo(0, 0); render(); },
  speed(x) {
    App.play.speed = Number(x);
    document.querySelectorAll('.spd').forEach(b => b.classList.toggle('on', b.dataset.arg === x));
    if (App.play.timer) startPlayback();
  },
  skip() { clearInterval(App.play.timer); App.play = null; window.scrollTo(0, 0); render(); },
  replay() { App.play = { live: true, idx: 0, speed: 3 }; window.scrollTo(0, 0); render(); },
  done() { App.play = null; finishWeekend(); window.scrollTo(0, 0); render(); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.dataset.act === 'closehelp' && !el.matches('button') && e.target.closest('[data-stop]')) return;
  const fn = ACT[el.dataset.act];
  if (fn) fn(el.dataset.arg, el, e);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('input[data-path]') && G && G.weekend) {
    setPath(G.weekend, el.dataset.path, Number(el.value));
    normPlan(G.weekend.plan, curSeries());
    saveGame(); render();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (App.ask) { App.ask = null; render(); } else if (App.help) { App.help = false; render(); }
});
function ask(text, yes, act) { App.ask = { text, yes, act }; render(); }

window.addEventListener('DOMContentLoaded', () => {
  App.el = document.getElementById('app');
  render(); // 保存があれば表紙に「続きから」が出る。レース再生の途中で閉じた場合は結果から再開する

});
