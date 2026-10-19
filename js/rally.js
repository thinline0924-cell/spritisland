// ラリーの計算。ステージを1本ずつ走らせ、総合タイムで順位を決める。
const RALLY_FAST = { nordland: 0.7, vulcana: 0.35, costa: 0.4, forest: 0.8, alta: 0.3, akatsuchi: 0.45, lakes: 0.95, highland: 0.4 };
const SPK = { gravel: 38, tarmac: 35, snow: 40 }; // 1kmあたりの基準秒

function rallyIdeal(r) {
  let susp;
  if (r.surface === 'tarmac') susp = r.rough < 0.2 ? 2 : 1;
  else if (r.surface === 'snow') susp = 1;
  else susp = r.rough > 0.6 ? 0 : r.rough > 0.3 ? 1 : 2;
  const f = RALLY_FAST[r.id] ?? 0.5;
  const gear = f > 0.66 ? 2 : f > 0.4 ? 1 : 0;
  return { susp, gear };
}

function genRallyEvent(series, rally) {
  const rnd = U.seeded(rally.id + series.id);
  const words = rally.words.slice();
  const loopStages = [];
  for (let i = 0; i < series.perLoop; i++) {
    const w = words[Math.floor(rnd() * words.length)];
    words.splice(words.indexOf(w), 1);
    loopStages.push({ name: w, km: Math.round((8 + rnd() * 16) * 10) / 10 });
  }
  const stages = [];
  let n = 1;
  for (let l = 0; l < series.loops; l++) for (const s of loopStages) stages.push({ no: n++, loop: l, name: s.name + (l > 0 ? ' ' + (l + 1) : ''), km: s.km });
  const loopRain = [];
  const forecast = [];
  for (let l = 0; l < series.loops; l++) {
    const r = rally.surface !== 'snow' && U.chance(rally.rain);
    loopRain.push(r ? U.rr(0.3, 1) : 0);
    forecast.push(Math.round(U.clamp(r ? U.rr(0.4, 0.9) : rally.rain * U.rr(0.1, 0.8), 0, 0.95) * 10) * 10);
  }
  return { stages, loopRain, forecast, totalKm: Math.round(stages.reduce((a, s) => a + s.km, 0) * 10) / 10 };
}

function rallyTyreMult(rally, tyre, k, rain) {
  if (rally.surface === 'snow') return 1;
  if (rally.surface === 'gravel') {
    if (tyre === 'soft') return 0.996 + k * 0.004 * rally.rough * (0.4 + rally.heat) - rain * 0.003;
    return 1.001 + k * 0.0008;
  }
  // ターマック
  if (rain > 0) return tyre === 'wet' ? 0.995 : tyre === 'soft' ? 1.035 : 1.05;
  if (tyre === 'wet') return 1.03 + k * 0.004;
  if (tyre === 'soft') return 0.995 + k * 0.0025 * rally.heat;
  return 1.0 + k * 0.0006;
}

function aiRallyPlan(series, rally, ev) {
  const loops = [];
  for (let l = 0; l < series.loops; l++) {
    let tyre;
    if (rally.surface === 'snow') tyre = 'studded';
    else if (rally.surface === 'gravel') tyre = (rally.rough * (0.4 + rally.heat) > 0.45) !== U.chance(0.25) ? 'hard' : 'soft';
    else tyre = ev.forecast[l] >= 50 ? (U.chance(0.75) ? 'wet' : 'soft') : (U.chance(0.7) ? 'soft' : 'hard');
    loops.push({ tyre, spares: U.chance(rally.rough > 0.5 ? 0.6 : 0.3) ? 2 : 1, pace: U.chance(0.7) ? 'normal' : U.pick(['careful', 'flat']) });
  }
  return { shakedown: U.pick(['push', 'careful']), loops };
}

// ラリー本番。1ステージずつ進める。live のときは、サービスパークとパンクの場面で指示を待つ。
function createRally(series, rally, ev, crews, startOrder, opts = {}) {
  const events = [], snaps = [];
  const say = (stage, text, kind = 'info', player = false) => events.push({ lap: stage, text, kind, player });
  const st = crews.map(c => ({ c, id: c.id, total: 0, dnf: false, damage: 0, spares: 0, outLoop: false, mistakes: 0, stageWins: 0, superRally: false }));
  const byId = Object.fromEntries(st.map(s => [s.id, s]));
  const nm = s => s.c.short || s.c.name;
  const nLoops = series.loops;
  let lastLoop = -1;
  const R = { events, snaps, live: !!opts.live, call: null, done: false, result: null, si: 0, svc: {}, punct: {}, laps: ev.stages.length, rally: true };
  const me = st.find(s => s.c.isPlayer);

  function loopStart(stage) {
    const l = stage.loop, rain = ev.loopRain[l];
    if (l !== lastLoop) {
      for (const s of st) {
        if (s.dnf) continue;
        s.damage = 0; s.outLoop = false; s.spares = s.c.plan.loops[l].spares;
      }
      if (l > 0) say(stage.no, `サービスパーク。マシンを直し、ループ${l + 1}のタイヤに履き替える。`, 'pit');
      if (rain > 0 && rally.surface === 'tarmac') say(stage.no, 'ループの途中から路面が濡れている。', 'weather');
      else if (rain > 0) say(stage.no, '雨。砂利がぬかるみ、轍が深くなる。', 'weather');
      lastLoop = l;
    }
  }

  function runStage(si) {
    const stage = ev.stages[si];
    const l = stage.loop;
    const rain = ev.loopRain[l];
    loopStart(stage);
    const k = ev.stages.filter(x => x.loop === l && x.no < stage.no).length;
    const times = {};
    for (const s of st) {
      if (s.dnf) continue;
      const c = s.c, d = c.drv, lp = c.plan.loops[l], pace = RALLY_PACE[lp.pace];
      if (s.outLoop) { times[s.id] = null; continue; }
      const P = c.perf * 0.5 + skillOf(d, rain) * 0.5;
      let m = 1 - (P - 55) * 0.0016;
      m *= pace.t * rallyTyreMult(rally, lp.tyre, k, rain) * (lp.spares === 2 ? 1.002 : 1);
      m *= 1 + c.setupPen * (c.plan.shakedown === 'push' ? 0.5 : 1);
      if (l === 0 && rally.surface === 'gravel') m *= 1 + Math.max(0, 5 - startOrder.indexOf(c.id)) * 0.002;
      m *= 1 + s.damage + (rain > 0 ? 0.04 : 0);
      m *= 1 + U.gauss() * 0.005;
      let t = stage.km * SPK[rally.surface] * m;
      // パンク
      const pP = punctP(lp, stage);
      const pre = c.isPlayer ? R.punct[si] : undefined;
      if (pre) {
        if (!pre.none) {
          t += pre.extra;
          if (pre.useSpare && s.spares > 0) s.spares--;
          say(stage.no, pre.text, 'mistake', true);
          if (pre.retire) { retire(s, stage, 'パンクでホイールを壊した'); continue; }
        }
      } else if (U.chance(pP)) {
        if (s.spares > 0) {
          const loss = U.rr(15, 45); t += loss; s.spares--;
          say(stage.no, `${nm(s)}がパンク。そのまま走り切って${Math.round(loss)}秒ロス。スペアを1本使う。`, 'mistake', c.isPlayer);
        } else {
          const loss = U.rr(90, 200); t += loss;
          say(stage.no, `${nm(s)}がパンク。スペアが残っておらず、${Math.round(loss)}秒を失う。`, 'mistake', c.isPlayer);
          if (U.chance(0.25)) { retire(s, stage, 'パンクでホイールを壊した'); continue; }
        }
      }
      // ミス
      const pE = 0.05 * (1.5 - d.cons / 100) * pace.err * (1 + rain * 0.7) * (rally.surface === 'snow' ? 1.2 : 1) * (c.plan.shakedown === 'careful' ? 0.85 : 1) * (1 + c.setupPen * 40);
      if (U.chance(pE)) {
        s.mistakes++;
        const r = Math.random();
        if (r < 0.7) {
          const loss = U.rr(3, 12); t += loss;
          if (c.isPlayer) say(stage.no, `${nm(s)}がコーナーで膨らむ。${loss.toFixed(1)}秒ロス。`, 'mistake', true);
        } else if (r < 0.92) {
          const loss = U.rr(20, 60); t += loss; s.damage += 0.006;
          say(stage.no, `${nm(s)}がスピン。${Math.round(loss)}秒ロス。マシンにダメージ。`, 'mistake', c.isPlayer);
        } else {
          retire(s, stage, 'コースアウト'); continue;
        }
      }
      // 故障
      if (U.chance((1 - c.rel / 100) * 0.006 * pace.punct)) {
        if (U.chance(0.15)) { retire(s, stage, U.pick(['エンジン', 'ドライブシャフト', 'ターボ'])); continue; }
        const loss = U.rr(30, 120); t += loss;
        say(stage.no, `${nm(s)}にメカトラブル。${Math.round(loss)}秒を失う。`, 'mistake', c.isPlayer);
      }
      times[s.id] = t;
      s.total += t;
    }
    // ステージ途中で消えた車はスーパーラリーで加算
    const done = Object.values(times).filter(x => x != null);
    const slow = done.length ? Math.max(...done) : stage.km * SPK[rally.surface];
    for (const s of st) if (!s.dnf && s.outLoop && times[s.id] == null) s.total += slow + 30;
    const stageOrder = Object.entries(times).filter(([, t]) => t != null).sort((a, b) => a[1] - b[1]);
    if (stageOrder.length) byId[stageOrder[0][0]].stageWins++;
    const run = st.filter(s => !s.dnf).sort((a, b) => a.total - b.total);
    const lead = run[0];
    const pl = st.find(s => s.c.isPlayer);
    if (pl && !pl.dnf && times[pl.id] != null) {
      const sr = stageOrder.findIndex(([id]) => id === pl.id) + 1;
      const pos = run.indexOf(pl) + 1;
      say(stage.no, `SS${stage.no} ${stage.name}(${stage.km}km):${nm(pl)}はステージ${sr}番手。総合${pos}位${pos > 1 ? `(トップと${U.fmtGap(pl.total - lead.total)})` : ''}。`, 'stage', true);
    }
    if (stageOrder.length && !(pl && stageOrder[0][0] === pl.id)) say(stage.no, `SS${stage.no}のベストタイムは${nm(byId[stageOrder[0][0]])}。`, 'info');
    else if (stageOrder.length) say(stage.no, `${nm(pl)}がSS${stage.no}でベストタイム。`, 'pass', true);
    snaps.push({
      lap: stage.no, label: `SS${stage.no}`, sc: false, w: rain,
      order: run.map(s => s.id).concat(st.filter(s => s.dnf).map(s => s.id)),
      gap: Object.fromEntries(st.map(s => [s.id, s.dnf ? null : s.total - lead.total])),
      stage: Object.fromEntries(Object.entries(times)),
      dnf: st.filter(s => s.dnf).map(s => s.id), pit: [], tyre: {}, age: {},
    });
  }

  function punctP(lp, stage) {
    return rally.rough * 0.06 * RALLY_PACE[lp.pace].punct * (lp.tyre === 'soft' ? 1.3 : lp.tyre === 'hard' ? 0.8 : 1) * (stage.km / 15);
  }

  // ---- 指示 ----
  function standingLine() {
    const last = snaps[snaps.length - 1];
    if (!last || !me || me.dnf) return '';
    const ord = last.order.filter(id => !last.dnf.includes(id));
    const i = ord.indexOf(me.id);
    const a = ord[i - 1], b = ord[i + 1];
    return `総合${i + 1}位。` + (a ? `前の${nm(byId[a])}と${(last.gap[me.id] - last.gap[a]).toFixed(1)}秒。` : 'トップを走っている。') + (b ? `後ろの${nm(byId[b])}とは${(last.gap[b] - last.gap[me.id]).toFixed(1)}秒。` : '');
  }
  function serviceCall(l, stage) {
    if (!me || me.dnf) return;
    const lp = me.c.plan.loops[l];
    const keys = ['flat', 'normal', 'careful'];
    const desc = { flat: '速いがミスとパンクが増える。', normal: '計画どおりの攻め方。', careful: '遅いが確実に走り切る。' };
    R.call = { kind: 'service', lap: stage.no, title: `サービスパーク — ループ${l + 1}へ`,
      text: `${standingLine()} 次のループは${RALLY_TYRES[rally.surface].find(x => x[0] === lp.tyre)[1]}タイヤ、スペア${lp.spares}本。${ev.loopRain[l] > 0 ? '雨が降っている。' : ''}`,
      options: keys.map(k => ({ label: `${RALLY_PACE[k].name}で行く`, desc: desc[k], apply: () => { lp.pace = k; } })), def: keys.indexOf(lp.pace) };
  }
  function prePunct(stage, si) {
    if (!me || me.dnf || me.outLoop) { R.punct[si] = { none: true }; return; }
    loopStart(stage);
    const lp = me.c.plan.loops[stage.loop];
    if (!U.chance(punctP(lp, stage))) { R.punct[si] = { none: true }; return; }
    const at = (stage.km * U.rr(0.2, 0.8)).toFixed(1);
    const set = o => () => { R.punct[si] = o; };
    const nmMe = nm(me);
    const opts = me.spares > 0 ? [
      { label: '止まって交換する', desc: '確実だが1分以上かかる。', apply: () => { const x = U.rr(60, 85); set({ extra: x, useSpare: true, text: `${nmMe}は止まってタイヤを交換。${Math.round(x)}秒ロス。` })(); } },
      { label: 'そのまま走り切る', desc: '速いが、ホイールを傷める恐れがある。', apply: () => {
        const x = U.rr(15, 45), hurt = U.chance(0.2), y = hurt ? U.rr(40, 90) : 0;
        set({ extra: x + y, useSpare: true, text: hurt ? `パンクのまま走ったがホイールを傷めた。${Math.round(x + y)}秒ロス。` : `パンクしたまま走り切った。${Math.round(x)}秒ロス。` })(); } },
    ] : [
      { label: 'ゆっくり走り切る', desc: 'スペアが無い。時間はかかるが、たぶん走り切れる。', apply: () => { const x = U.rr(90, 200), r = U.chance(0.1); set({ extra: x, retire: r, text: `スペアなしで這うように走り切った。${Math.round(x)}秒ロス。` })(); } },
      { label: '全開で走り切る', desc: 'ロスは小さいが、リタイアの危険が大きい。', apply: () => { const x = U.rr(40, 90), r = U.chance(0.4); set({ extra: x, retire: r, text: `パンクのまま全開。${Math.round(x)}秒ロス。` })(); } },
    ];
    R.call = { kind: 'puncture', lap: stage.no, title: 'パンク', text: `SS${stage.no} ${stage.name}、${at}km地点で左リアがパンク。スペアは残り${me.spares}本。`, options: opts, def: 0 };
  }

  R.step = () => {
    if (R.done || R.call) return null;
    const stage = ev.stages[R.si];
    if (R.live && stage.loop > 0 && !R.svc[stage.loop]) { R.svc[stage.loop] = true; serviceCall(stage.loop, stage); if (R.call) return null; }
    if (R.live && R.punct[R.si] === undefined) { prePunct(stage, R.si); if (R.call) return null; }
    runStage(R.si);
    R.si++;
    if (R.si >= ev.stages.length) finish();
    return snaps[snaps.length - 1];
  };
  R.answer = i => {
    const call = R.call;
    if (!call) return;
    const o = call.options[i] || call.options[call.def];
    o.apply();
    say(call.lap, `指示:${o.label}`, 'call', true);
    R.call = null;
  };
  R.finishAll = () => {
    R.live = false;
    while (!R.done) { if (R.call) R.answer(R.call.def); R.step(); }
    return R.result;
  };

  function retire(s, stage, why) {
    const finalLoop = stage.loop === nLoops - 1;
    if (finalLoop) {
      s.dnf = true; s.reason = why;
      say(stage.no, `${nm(s)}が${why}でリタイア。`, 'dnf', s.c.isPlayer);
    } else {
      s.outLoop = true; s.superRally = true;
      s.total += 300;
      say(stage.no, `${nm(s)}が${why}でストップ。このループは走れない。修理して次のループから再出走する(5分加算)。`, 'dnf', s.c.isPlayer);
    }
  }

  function finish() {
  const fin = st.filter(s => !s.dnf).sort((a, b) => a.total - b.total);
  const out = st.filter(s => s.dnf);
  const classification = [...fin, ...out].map((s, i) => ({
    id: s.id, pos: i + 1, dnf: s.dnf, reason: s.reason || '', time: s.total, gap: s.dnf ? null : s.total - fin[0].total,
    points: !s.dnf && i < 10 ? POINTS[i] : 0, stageWins: s.stageWins, mistakes: s.mistakes, superRally: s.superRally, grid: startOrder.indexOf(s.id) + 1,
  }));
  if (fin.length) say(ev.stages.length, `最終ステージを終えて、${nm(fin[0])}が優勝。`, 'finish');
  R.result = { classification, snaps, events, laps: ev.stages.length, rally: true };
  R.done = true;
  }
  return R;
}

function simRally(series, rally, ev, crews, startOrder) {
  return createRally(series, rally, ev, crews, startOrder, { live: false }).finishAll();
}
