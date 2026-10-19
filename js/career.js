// キャリアの進行:シーズン、チーム、週末、成長、オファー、保存
const SAVE_KEY = 'pitwall-career-v1';
const ENDU_HOURS = [6, 8, 6, 24];
const STAT_NAMES = { pace: '速さ', cons: '安定感', tyre: 'タイヤの扱い', wet: '雨', craft: 'バトル' };
let G = null; // 現在のキャリア

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* 保存できない環境では何もしない */ }
}
function loadGame() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

// ---- 世界(チームとドライバー) ----
function teamsOf(sid) {
  if (!G.world.teams[sid]) {
    const s = SERIES_BY_ID[sid];
    const rnd = U.seeded('teams-' + sid);
    const disc = sid === 'kart' ? 'formula' : s.disc;
    const n = s.kind === 'sprint' ? s.teams : s.kind === 'endurance' ? s.cars : s.crews;
    const words = TEAM_WORDS[disc].slice();
    const suf = TEAM_SUFFIX[sid === 'kart' ? 'kart' : disc];
    const list = [];
    for (let i = 0; i < n; i++) {
      const w = words.splice(Math.floor(rnd() * words.length), 1)[0] || ('Team ' + (i + 1));
      const base = 88 - i * (50 / (n - 1)) + (rnd() - 0.5) * 6;
      list.push({ id: `${sid}-${i}`, name: `${w} ${suf[Math.floor(rnd() * suf.length)]}`, base, perf: base, rel: Math.round(72 + rnd() * 22), num: 2 + Math.floor(rnd() * 97) });
    }
    G.world.teams[sid] = list;
  }
  return G.world.teams[sid];
}
function refreshTeams() {
  for (const sid of Object.keys(G.world.teams)) for (const t of G.world.teams[sid]) {
    t.base = U.clamp(t.base + U.rr(-4, 4), 30, 92);
    t.perf = U.clamp(t.base + U.rr(-5, 5), 28, 95);
    t.rel = U.clamp(Math.round(t.rel + U.rr(-6, 6)), 62, 97);
  }
}
function teamRank(sid, teamId) {
  const ts = teamsOf(sid).slice().sort((a, b) => b.perf - a.perf);
  return ts.findIndex(t => t.id === teamId);
}
function grade(v) { return v >= 80 ? 'A' : v >= 68 ? 'B' : v >= 56 ? 'C' : v >= 44 ? 'D' : 'E'; }

const usedNames = new Set();
function genAIDriver(tier) {
  let name;
  do { name = INITIALS[U.ri(0, INITIALS.length - 1)] + '. ' + U.pick(SURNAMES); } while (usedNames.has(name));
  usedNames.add(name);
  const base = 40 + tier * 9 + U.gauss() * 6;
  const st = v => Math.round(U.clamp(base + U.gauss() * v, 20, 97));
  return { name, short: name, pace: st(3), cons: st(5), tyre: st(5), wet: st(6), craft: st(5) };
}

function playerDrv(disc) {
  const d = G.driver;
  const m = (G.weekend && G.weekend.mods) || {};
  return { ...d.stats, cons: d.stats.cons + (m.cons || 0), name: d.name, short: d.name, famPen: (100 - d.fam[disc]) * 0.12 };
}

// ---- 新しいキャリア ----
function newCareer(name, number, strength) {
  usedNames.clear();
  const stats = { pace: 46, cons: 44, tyre: 44, wet: 44, craft: 44 };
  for (const k in stats) stats[k] = Math.round(stats[k] + U.rr(-2, 2));
  stats[strength] += 8;
  G = {
    v: 1,
    driver: { name, number, age: 17, stats, fam: { formula: 30, gt: 5, rally: 5 }, rep: 6, strength },
    world: { teams: {} },
    seasonNo: 0, year: 2027,
    season: null, weekend: null, offers: null, history: [],
    totals: { starts: 0, wins: 0, podiums: 0, poles: 0, titles: [], points: 0 },
    retired: false,
  };
  const kt = teamsOf('kart').slice().sort((a, b) => b.perf - a.perf);
  const gt = teamsOf('gt4').slice().sort((a, b) => a.perf - b.perf);
  const rt = teamsOf('rnat').slice().sort((a, b) => a.perf - b.perf);
  G.offers = [
    offerFor('kart', kt[2].id, 'カート時代から目をかけてくれていた強豪チーム。'),
    offerFor('kart', kt[5].id, '中堅チーム。チームメイトに勝てば評価は上がる。'),
    offerFor('gt4', gt[0].id, '下位チームだが、いきなりハコ車に乗れる。'),
    offerFor('rnat', rt[1].id, '地方のラリーチーム。経験は無いが、やってみるかと声がかかった。'),
  ];
  saveGame();
}

function offerFor(sid, teamId, note) {
  const s = SERIES_BY_ID[sid];
  const t = teamsOf(sid).find(x => x.id === teamId);
  const r = teamRank(sid, teamId);
  const per = s.kind === 'sprint' ? s.perTeam : 1;
  const n = teamsOf(sid).length * per;
  const target = Math.min(n, Math.max(1, Math.round(r * per + 2)));
  return { sid, teamId, team: t.name, perf: t.perf, rel: t.rel, target, note: note || '' };
}

// ---- シーズン ----
function startSeason(offer) {
  usedNames.clear();
  usedNames.add(G.driver.name);
  G.seasonNo++;
  if (G.seasonNo > 1) { G.year++; G.driver.age++; refreshTeams(); }
  const s = SERIES_BY_ID[offer.sid];
  const teams = teamsOf(s.id);
  const pool = s.pool === 'rally' ? RALLIES : s.pool === 'kart' ? KARTWAYS : CIRCUITS;
  const cal = U.shuffle(pool).slice(0, Math.min(s.rounds, pool.length)).map(x => x.id);
  const entries = [];
  if (s.kind === 'sprint') {
    teams.forEach((t, ti) => {
      for (let k = 0; k < s.perTeam; k++) {
        const isPlayer = t.id === offer.teamId && k === 0;
        const isMate = t.id === offer.teamId && k === 1;
        const d = isPlayer ? null : genAIDriver(s.tier);
        entries.push({ id: isPlayer ? 'P' : `${t.id}-d${k}`, name: isPlayer ? G.driver.name : d.name, short: isPlayer ? G.driver.name : d.name,
          teamId: t.id, isPlayer, isMate, drv: d, num: isPlayer ? G.driver.number : ((t.num + k * 37) % 98) + 2 });
      }
    });
  } else if (s.kind === 'endurance') {
    teams.forEach(t => {
      const isPlayer = t.id === offer.teamId;
      const crew = [isPlayer ? null : genAIDriver(s.tier), genAIDriver(s.tier - 1), genAIDriver(s.tier - 1)];
      entries.push({ id: isPlayer ? 'P' : t.id, name: `#${isPlayer ? G.driver.number : t.num} ${t.name}`, short: `#${isPlayer ? G.driver.number : t.num} ${t.name}`,
        teamId: t.id, isPlayer, isMate: false, crew, num: isPlayer ? G.driver.number : t.num });
    });
  } else {
    teams.forEach(t => {
      const isPlayer = t.id === offer.teamId;
      const d = isPlayer ? null : genAIDriver(s.tier);
      entries.push({ id: isPlayer ? 'P' : t.id, name: isPlayer ? G.driver.name : d.name, short: isPlayer ? G.driver.name : d.name,
        teamId: t.id, isPlayer, isMate: false, drv: d, num: isPlayer ? G.driver.number : t.num });
    });
  }
  G.season = { no: G.seasonNo, year: G.year, sid: s.id, teamId: offer.teamId, team: offer.team, target: offer.target, cal, round: 0,
    entries, points: Object.fromEntries(entries.map(e => [e.id, 0])), results: [], trust: 50, rumors: [], flags: {} };
  G.offers = null;
  G.weekend = null;
  saveGame();
}

function curSeries() { return SERIES_BY_ID[G.season.sid]; }
function venueOf(sid, id) {
  const s = SERIES_BY_ID[sid];
  const pool = s.pool === 'rally' ? RALLIES : s.pool === 'kart' ? KARTWAYS : CIRCUITS;
  return pool.find(x => x.id === id);
}
function eventName(sid, round) {
  const s = SERIES_BY_ID[sid];
  const v = venueOf(sid, G.season.cal[round]);
  if (s.kind === 'endurance') return `${v.name.replace(/サーキット$/, '')} ${ENDU_HOURS[round] || 6}時間`;
  return v.name;
}
function standings() {
  const S = G.season;
  const wins = {};
  for (const r of S.results) for (const [id, pos] of Object.entries(r.pos)) if (pos === 1) wins[id] = (wins[id] || 0) + 1;
  return S.entries.map(e => ({ e, pts: S.points[e.id], wins: wins[e.id] || 0 }))
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins || (a.e.isPlayer ? -1 : 1));
}
function teamOfEntry(e) { return teamsOf(G.season.sid).find(t => t.id === e.teamId); }

// ---- 週末 ----
function idealSetup(sid, venue) {
  const s = SERIES_BY_ID[sid];
  if (s.kind === 'rally') return rallyIdeal(venue);
  return { wing: Math.round(1 + (1 - venue.hs) * 4), susp: venue.bump > 0.6 ? 0 : venue.bump > 0.35 ? 1 : 2 };
}
function setupPenalty(sid, venue, setup) {
  const id = idealSetup(sid, venue);
  if (SERIES_BY_ID[sid].kind === 'rally') return 0.004 * (Math.abs(setup.susp - id.susp) + Math.abs(setup.gear - id.gear));
  return 0.18 * Math.abs(setup.wing - id.wing) + 0.15 * Math.abs(setup.susp - id.susp);
}

function startWeekend() {
  const S = G.season, s = curSeries(), vid = S.cal[S.round], v = venueOf(s.id, vid);
  const wk = { round: S.round, vid, stage: 'setup', runs: [], runsLeft: s.kind === 'rally' ? 2 : 3 };
  if (s.kind === 'rally') {
    wk.ev = genRallyEvent(s, v);
    wk.setup = { susp: 1, gear: 1 };
    wk.shakedown = 'push';
  } else {
    wk.weather = genWeather(v, s.laps);
    wk.setup = { wing: 3, susp: 1 };
    wk.qApproach = 'safe';
  }
  // レースの合間の出来事の効果
  const m = G.season.mods || {};
  wk.mods = m;
  wk.notes = [];
  if (m.runs) wk.runsLeft = Math.max(1, wk.runsLeft + m.runs);
  if (m.gamble === 'parts') {
    m.perf = U.chance(0.65) ? 2.5 : -2;
    wk.notes.push(m.perf > 0 ? '新型ウイングは当たり。コーナーで車が安定している。' : '新型ウイングはどうも合わない。少し遅い。');
  }
  if (m.forecast) {
    if (s.kind === 'rally') wk.ev.forecast = wk.ev.loopRain.map(r => r > 0 ? 90 : 0);
    else {
      const W = wk.weather, L = s.laps;
      W.forecast.parts = [0, 1, 2, 3].map(q => { let any = false; for (let l = Math.floor(q * L / 4) + 1; l <= Math.floor((q + 1) * L / 4); l++) if (W.rain[l] > 0.05) any = true; return any ? 90 : 0; });
      W.forecast.qual = W.qualWet > 0 ? 90 : 0;
    }
    wk.notes.push('予報士の見立てどおりなら、この予報はまず外れない。');
  }
  if (m.engExact) wk.notes.push('データ班のおかげで、タイヤ寿命の見積もりは正確。');
  if (m.gridDrop) wk.notes.push(`エンジン交換のペナルティで、予選順位から${m.gridDrop}つ下がる。`);
  G.season.mods = null;
  G.weekend = wk;
  saveGame();
}

// エンジニアにおまかせ:データから決める。少し外れることもある
function autoSetup() {
  const wk = G.weekend, s = curSeries(), v = venueOf(s.id, wk.vid);
  const id = idealSetup(s.id, v);
  const su = { ...id };
  if (U.chance(0.45)) {
    const k = U.pick(Object.keys(su));
    const max = k === 'wing' ? 5 : 2, min = k === 'wing' ? 1 : 0;
    su[k] = U.clamp(su[k] + U.pick([-1, 1]), min, max);
  }
  wk.setup = su;
  wk.runs.push({ setup: { ...su }, notes: ['エンジニアがデータから組んだセットアップ。'], lap: null, delta: null, auto: true });
  wk.runsLeft = 0;
  saveGame();
}

// フリー走行(またはシェイクダウン)を1回走って、ドライバーの感想を得る
function practiceRun() {
  const wk = G.weekend, s = curSeries(), v = venueOf(s.id, wk.vid);
  if (wk.runsLeft <= 0) return;
  const id = idealSetup(s.id, v), su = wk.setup;
  const notes = [];
  const fuzzy = U.chance(0.2);
  if (s.kind === 'rally') {
    const ds = su.susp - id.susp, dg = su.gear - id.gear;
    notes.push(ds > 0 ? (ds > 1 ? '足がかなり硬い。ギャップで車が跳ね回る。' : '少し硬い。荒れた区間で落ち着かない。')
      : ds < 0 ? (ds < -1 ? '柔らかすぎる。切り返しで車がふらふらする。' : '少し柔らかい。反応がもう一歩遅い。') : '足回りはぴったり。');
    notes.push(dg > 0 ? (fuzzy ? 'ギアは……よく分からない。' : '直線が足りなくて、ギアが長すぎる感じがする。') : dg < 0 ? (fuzzy ? 'ギアは……よく分からない。' : '高速区間ですぐ吹け切ってしまう。ギアを長くしたい。') : 'ギア比は合っている。');
    const t = U.rr(-0.4, 0.4) + setupPenalty(s.id, v, su) * 100;
    wk.runs.push({ setup: { ...su }, notes, delta: t });
  } else {
    const dw = su.wing - id.wing, ds = su.susp - id.susp;
    notes.push(dw > 0 ? (dw > 1 ? 'ストレートでまるで伸びない。ウイングをかなり寝かせたい。' : (fuzzy ? 'バランスは悪くないが、何か少し足りない。' : 'ストレートで少し遅い。ウイングを少し寝かせたい。'))
      : dw < 0 ? (dw < -1 ? 'コーナーでリアが全然落ち着かない。ダウンフォースがかなり欲しい。' : (fuzzy ? 'バランスは悪くないが、何か少し足りない。' : '高速コーナーで少し不安。もう少しウイングを立てたい。')) : '空力のバランスは良い。');
    notes.push(ds > 0 ? (ds > 1 ? '縁石に乗ると車が跳ねる。もっと柔らかく。' : 'バンプで少し跳ねる。少し柔らかくしたい。')
      : ds < 0 ? (ds < -1 ? '柔らかすぎて、切り返しで車が揺れる。' : '少し柔らかい。反応がもう一歩遅い。') : '足回りはしっくりきている。');
    const lap = v.base - (ratingOf(teamsOf(s.id).find(t => t.id === G.season.teamId).perf, playerDrv(s.disc), 0) - 55) * 0.035 * v.base / 90
      + setupPenalty(s.id, v, su) * v.base / 90 + U.gauss() * 0.12;
    wk.runs.push({ setup: { ...su }, notes, lap });
  }
  wk.runsLeft--;
  saveGame();
}

function buildCircuitEntries(plan) {
  const S = G.season, s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  return S.entries.map(e => {
    const t = teamOfEntry(e);
    const base = { id: e.id, name: e.name, short: e.short, team: t.name, isPlayer: e.isPlayer, isMate: e.isMate, perf: t.perf, rel: t.rel };
    if (s.kind === 'endurance') {
      const crew = e.crew.map((d, i) => d || playerDrv(s.disc));
      const rota = e.isPlayer ? { less: [1, 0, 2, 1, 2, 0, 1, 2], even: [0, 1, 2, 0, 1, 2, 0, 1], more: [0, 0, 1, 2, 0, 0, 1, 2] }[plan ? plan.share : 'even'] : [0, 1, 2, 0, 1, 2, 0, 1];
      base.crew = crew; base.rota = rota; base.drv = crew[0];
    } else base.drv = e.isPlayer ? playerDrv(s.disc) : e.drv;
    base.setupPen = e.isPlayer ? setupPenalty(s.id, v, wk.setup) : U.rr(0, 0.28);
    const m = wk.mods || {};
    if (e.isPlayer) { base.perf += m.perf || 0; base.rel = U.clamp(base.rel + (m.rel || 0), 40, 99); }
    if (e.isMate && m.mateBoost) base.drv = { ...base.drv, pace: base.drv.pace + m.mateBoost };
    base.qApproach = e.isPlayer ? wk.qApproach : U.pick(['attack', 'safe', 'safe', 'save']);
    if (e.isPlayer && plan) base.plan = plan;
    else base.plan = aiCircuitPlan(s, v, base);
    return base;
  });
}

function aiCircuitPlan(s, v, e) {
  if (s.kind === 'endurance') {
    const dbl = U.chance(0.5);
    return { start: dbl ? 'H' : 'M', tyres: dbl ? 'double' : 'every', care: U.chance(0.75) ? 'normal' : U.pick(['save', 'push']), rain: 'react', sc: 'box' };
  }
  const opts = estimateStrategies(s, v, { tyre: e.drv.tyre, startAge: e.qApproach === 'save' ? 0 : 3, noise: U.rr(0.9, 1.1) });
  const r = Math.random();
  const o = opts[r < 0.6 ? 0 : r < 0.85 ? Math.min(1, opts.length - 1) : Math.min(2, opts.length - 1)];
  const n = o.stops.length + 1;
  return { start: o.start, stops: o.stops.map(x => ({ ...x })), styles: new Array(n).fill(U.chance(0.12) ? 'push' : 'normal'), rain: 'react', sc: 'box' };
}

function defaultPlan() {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  if (s.kind === 'endurance') return { start: 'M', tyres: 'every', share: 'even', care: 'normal', rain: 'react', sc: 'box' };
  const opts = estimateStrategies(s, v, { tyre: G.driver.stats.tyre, startAge: wk.qApproach === 'save' ? 0 : 3, noise: wk.engNoise || 1 });
  const o = opts[0];
  return { start: o.start, stops: o.stops.map(x => ({ ...x })), styles: new Array(o.stops.length + 1).fill('normal'), rain: 'react', sc: 'box' };
}

function runQualifying() {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  const entries = buildCircuitEntries(null);
  const q = simQualifying(s, v, wk.weather, entries);
  wk.qual = { order: q.order.map(r => ({ id: r.id, time: r.time, gap: r.gap, mistake: r.mistake })), wet: q.wet };
  const drop = (wk.mods || {}).gridDrop || 0;
  wk.grid = wk.qual.order.map(r => r.id);
  if (drop) {
    const i = wk.grid.indexOf('P');
    wk.grid.splice(i, 1);
    wk.grid.splice(Math.min(wk.grid.length, i + drop), 0, 'P');
  }
  wk.aiQ = Object.fromEntries(entries.map(e => [e.id, e.qApproach]));
  wk.engNoise = (wk.mods || {}).engExact ? 1 : U.rr(0.88, 1.12);
  wk.plan = defaultPlan();
  wk.stage = 'plan';
  saveGame();
}

function startLiveRace(live = true) {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid), S = G.season;
  if (s.kind === 'rally') {
    const crews = S.entries.map(e => {
      const t = teamOfEntry(e);
      return { id: e.id, name: e.name, short: e.short, team: t.name, isPlayer: e.isPlayer, perf: t.perf, rel: t.rel,
        drv: e.isPlayer ? playerDrv('rally') : e.drv, setupPen: e.isPlayer ? setupPenalty(s.id, v, wk.setup) : U.rr(0, 0.006),
        plan: e.isPlayer ? { shakedown: wk.shakedown, loops: wk.plan.loops.map(x => ({ ...x })) } : aiRallyPlan(s, v, wk.ev) };
    });
    const order = S.round === 0 ? U.shuffle(S.entries.map(e => e.id)) : standings().map(x => x.e.id);
    return createRally(s, v, wk.ev, crews, order, { live });
  }
  const entries = buildCircuitEntries(wk.plan);
  for (const e of entries) if (!e.isPlayer) e.qApproach = wk.aiQ[e.id] || 'safe';
  const grid = wk.grid || wk.qual.order.map(r => r.id);
  const hours = ENDU_HOURS[S.round] || 6;
  return createRace(s, v, wk.weather, entries, grid, { hours, night: s.kind === 'endurance' && hours >= 24, double: s.kind === 'endurance' && hours >= 24, live });
}

function finalizeRace(res) {
  const wk = G.weekend;
  wk.result = res;
  wk.stage = 'race';
  applyResult(res);
  saveGame();
}

// 指示を出さずに最後まで進める(テストや「結果へ」用)
function runRace() { finalizeRace(startLiveRace(false).finishAll()); }

function applyResult(res) {
  const S = G.season, s = curSeries(), wk = G.weekend, d = G.driver;
  const pos = {};
  for (const r of res.classification) { S.points[r.id] += r.points; pos[r.id] = r.dnf ? null : r.pos; }
  const me = res.classification.find(r => r.id === 'P');
  const pole = wk.qual && wk.qual.order[0].id === 'P';
  S.results.push({ round: S.round, vid: wk.vid, pos, me: { pos: me.pos, dnf: me.dnf, points: me.points, grid: me.grid, reason: me.reason }, pole,
    winner: res.classification[0].id });
  G.totals.starts++;
  G.totals.points += me.points;
  if (!me.dnf && me.pos === 1) G.totals.wins++;
  if (!me.dnf && me.pos <= 3) G.totals.podiums++;
  if (pole) G.totals.poles++;
  // 成長
  const old = { ...d.stats };
  const ageF = d.age <= 20 ? 1.4 : d.age <= 24 ? 1.0 : d.age <= 29 ? 0.55 : d.age <= 32 ? 0.15 : -0.5;
  const g = 0.42;
  const st = d.stats;
  st.pace += g * ageF * U.rr(0.6, 1.2) + (!me.dnf && me.pos <= 3 ? 0.2 : 0);
  st.cons += g * 0.6 * Math.max(ageF, 0.3) * U.rr(0.6, 1.2) - (me.mistakes || 0) * 0.05;
  st.tyre += g * 0.5 * Math.max(ageF, 0.3) * U.rr(0.6, 1.2) + (res.rally ? 0 : 0.15);
  st.wet += (res.wetRace ? 1.2 : 0.15) * Math.max(ageF, 0.3);
  st.craft += 0.2 * Math.max(ageF, 0.3) + (me.overtakes || 0) * 0.08;
  for (const k in st) st[k] = U.clamp(Math.round(st[k] * 10) / 10, 10, 99);
  const disc = s.id === 'kart' ? 'formula' : s.disc;
  d.fam[disc] = Math.min(100, d.fam[disc] + (s.id === 'kart' ? 5 : 10));
  if (!me.dnf && me.pos === 1) d.rep += 1.2 + s.tier * 0.3;
  else if (!me.dnf && me.pos <= 3) d.rep += 0.5;
  d.rep = U.clamp(d.rep, 0, 100);
  wk.growth = Object.fromEntries(Object.keys(st).map(k => [k, Math.round((st[k] - old[k]) * 10) / 10]));
}

function finishWeekend() {
  if (G.weekend && G.weekend.result && !G.weekend.article) giveInterview(0);
  G.season.round++;
  G.weekend = null;
  if (G.season.round >= G.season.cal.length) endSeason();
  else { G.season.event = U.chance(0.75) ? pickPaddockEvent() : null; pressBetweenRounds(); }
  saveGame();
}

// ---- レースの合間の出来事 ----
const PADDOCK_EVENTS = [
  { id: 'sim', title: 'シミュレーターの枠が空いた', text: '次のコースを走り込める枠が取れた。ただ、同じ日に体のケアの予約も入っている。', options: [
    { label: 'シミュレーターで走り込む', desc: 'フリー走行が1回増える。', mod: { runs: 1 } },
    { label: '体を休める', desc: '次のレースでミスが減る。', mod: { cons: 5 } }] },
  { id: 'parts', title: '新しいフロントウイングが届いた', text: '風洞の数字は良い。ただ、実際に走らせた人はまだいない。', options: [
    { label: '新型を使う', desc: '当たれば速くなる。外れると遅くなる。', mod: { gamble: 'parts' } },
    { label: '実績のある旧型で', desc: '何も変わらない。', mod: {} }] },
  { id: 'sponsor', title: 'スポンサーのファンイベント', text: 'メインスポンサーが、週末のファンイベントに顔を出してほしいと言ってきた。', options: [
    { label: '参加する', desc: '評価 +2。フリー走行は1回減る。', mod: { rep: 2, runs: -1 } },
    { label: '断ってテストに集中', desc: '評価 −1。', mod: { rep: -1 } }] },
  { id: 'press', title: '記者の質問', text: '「チームメイトと比べて、速いのはどっちですか?」とマイクを向けられた。', options: [
    { label: '「僕です」と言い切る', desc: '評価 +2。ただしチームメイトが燃えて、次のレースは速くなる。', mod: { rep: 2, mateBoost: 4 } },
    { label: '無難に答える', desc: '何も起きない。', mod: {} }] },
  { id: 'train', title: 'レースまで少し間がある', text: '次の週末まで、まとまった時間が取れた。', options: [
    { label: '体力トレーニング', desc: '安定感 +1', mod: { stat: ['cons', 1] } },
    { label: 'カートで走り込む', desc: 'バトル +1', mod: { stat: ['craft', 1] } },
    { label: 'タイヤの勉強会', desc: 'タイヤの扱い +1', mod: { stat: ['tyre', 1] } }] },
  { id: 'weather', kinds: ['sprint', 'endurance'], title: '地元の気象予報士', text: 'このあたりの天気に詳しい予報士を紹介された。データ班も話を聞きたがっている。', options: [
    { label: '予報士の話を聞く', desc: '今週末の予報が正確になる。', mod: { forecast: true } },
    { label: 'データ班に時間を回す', desc: 'タイヤ寿命の見積もりが正確になる。', mod: { engExact: true } }] },
  { id: 'engine', kinds: ['sprint'], title: 'エンジンの走行距離', text: 'エンジニア「エンジンの距離が伸びている。新品に替えると、決まりで5グリッド降格になる」', options: [
    { label: '新品に替える', desc: 'グリッド5つ降格。壊れにくくなる。', mod: { gridDrop: 5, rel: 12 } },
    { label: 'このまま使う', desc: '壊れる危険が少し上がる。', mod: { rel: -10 } }] },
  { id: 'recce', kinds: ['rally'], title: 'レッキ(下見)の時間', text: '本番前の下見は限られた時間しかない。どこに時間を使うか。', options: [
    { label: 'ペースノートを丁寧に作る', desc: '本番でのミスが減る。', mod: { cons: 6 } },
    { label: 'セットアップの確認に回す', desc: 'シェイクダウンが1回増える。', mod: { runs: 1 } }] },
  { id: 'rookie', title: '若手からの相談', text: 'ジュニアのドライバーが「走りを見てほしい」と頼んできた。', options: [
    { label: '一日付き合う', desc: '評価 +1.5。フリー走行は1回減る。', mod: { rep: 1.5, runs: -1 } },
    { label: '今は自分に集中する', desc: '何も起きない。', mod: {} }] },
];

function pickPaddockEvent() {
  const kind = curSeries().kind;
  const pool = PADDOCK_EVENTS.filter(e => !e.kinds || e.kinds.includes(kind)).filter(e => e.id !== G.season.lastEvent);
  const e = U.pick(pool);
  G.season.lastEvent = e.id;
  return e.id;
}
function paddockEvent() { return G.season && G.season.event ? PADDOCK_EVENTS.find(e => e.id === G.season.event) : null; }
function resolvePaddockEvent(i) {
  const e = paddockEvent();
  if (!e) return;
  const o = e.options[i];
  const m = { ...o.mod };
  if (m.rep) G.driver.rep = U.clamp(G.driver.rep + m.rep, 0, 100);
  if (m.stat) G.driver.stats[m.stat[0]] = Math.min(99, G.driver.stats[m.stat[0]] + m.stat[1]);
  delete m.rep; delete m.stat;
  G.season.mods = m;
  G.season.event = null;
  G.season.lastChoice = `${e.title}:${o.label}`;
  saveGame();
}

// ---- シーズン終了 ----
function endSeason() {
  const S = G.season, s = curSeries(), d = G.driver;
  const tbl = standings();
  const pos = tbl.findIndex(x => x.e.isPlayer) + 1;
  const me = tbl[pos - 1];
  let mateBeat = null;
  const mate = tbl.find(x => x.e.isMate);
  if (mate) mateBeat = me.pts > mate.pts || (me.pts === mate.pts && tbl.indexOf(me) < tbl.indexOf(mate));
  const wins = S.results.filter(r => r.me.pos === 1 && !r.me.dnf).length;
  const pods = S.results.filter(r => r.me.pos <= 3 && !r.me.dnf).length;
  let delta = (S.target - pos) * 1.4 + (pos === 1 ? 12 : pos <= 3 ? 4 : 0) + wins * 1.0 + (mateBeat === true ? 3 : mateBeat === false ? -2 : 0) + s.tier * 1.5 - 2;
  if (d.rep > 70) delta *= 0.7;
  const before = d.rep;
  d.rep = U.clamp(d.rep + delta, 0, 100);
  if (pos === 1) G.totals.titles.push({ year: S.year, name: s.name });
  G.history.push({ year: S.year, sid: s.id, team: S.team, pos, pts: me.pts, wins, pods, target: S.target, mateBeat, age: d.age });
  G.seasonEnd = { pos, pts: me.pts, wins, pods, target: S.target, mateBeat, repBefore: before, rep: d.rep };
  G.seasonEnd.article = seasonReview(pos);
  G.offers = makeOffers(pos);
}

function makeOffers(pos) {
  pressInit();
  const d = G.driver, S = G.season, cur = curSeries();
  const rep = effectiveRep();
  const out = [];
  const seen = new Set();
  const add = o => { const k = o.sid + o.teamId; if (!seen.has(k)) { seen.add(k); out.push(o); } };
  // 今のチームとの再契約
  // 残留:成績に加えて、チームの信頼が要る
  const keep = S.trust >= 35 ? pos <= S.target + 3 : pos <= S.target && S.trust >= 20;
  if (keep) add({ ...offerFor(cur.id, S.teamId, S.trust >= 70 ? 'チームはあなたを高く買っている。残留を強く望んでいる。' : '今のチームが残留を望んでいる。'), must: true });
  // うわさになったチームは、必ず声をかけてくる
  for (const r of (S.trust < 25 ? [] : S.rumors || [])) add({ ...offerFor(r.sid, r.teamId, '新聞のうわさは本当だった。来季のシートを用意している。'), must: true, rumor: true });
  const cands = SERIES.filter(s => s.id !== 'kart' || cur.id === 'kart').filter(s => s.minRep <= rep + 6 && s.tier >= cur.tier - 1);
  for (const s of U.shuffle(cands)) {
    const ts = teamsOf(s.id).slice().sort((a, b) => a.perf - b.perf);
    const ok = ts.filter((t, i) => s.minRep + (i / (ts.length - 1)) * 28 - 6 <= rep + U.rr(-6, 6) && t.id !== S.teamId);
    if (!ok.length) continue;
    const t = ok[ok.length - 1 - U.ri(0, Math.min(1, ok.length - 1))];
    const notes = s.tier > cur.tier ? '上のクラスから声がかかった。' : s.disc !== cur.disc ? '別の分野からの誘い。慣れるまでは時間がかかる。' : '同じクラスのライバルチームから。';
    add(offerFor(s.id, t.id, notes));
  }
  // 少なすぎるときは下位チームで埋める
  if (out.length < 2) {
    let fb = cur;
    if (rep < cur.minRep - 10) fb = SERIES.filter(s => s.disc === cur.disc && s.tier < cur.tier && s.minRep <= rep + 6).sort((a, b) => b.tier - a.tier)[0] || cur;
    const ts = teamsOf(fb.id).slice().sort((a, b) => a.perf - b.perf);
    const note = fb === cur ? '下位チームのシートが空いている。' : '評価を立て直すなら、ひとつ下のクラスから。';
    add(offerFor(fb.id, ts[0].id, note));
    add(offerFor(fb.id, ts[1].id, note));
  }
  out.sort((a, b) => SERIES_BY_ID[b.sid].tier - SERIES_BY_ID[a.sid].tier || b.perf - a.perf);
  // 評判が高いほど、多くのチームから声がかかる
  // チームを批判してばかりの選手は、扱いにくいと見られる
  const max = S.trust < 25 ? 3 : G.press >= 15 ? 6 : G.press <= -15 ? 3 : 5;
  const picked = [...out.filter(o => o.must), ...out.filter(o => !o.must)].slice(0, Math.max(2, max));
  return picked.sort((a, b) => SERIES_BY_ID[b.sid].tier - SERIES_BY_ID[a.sid].tier || b.perf - a.perf);
}

function careerMustEnd() { return G.driver.age >= 38; }
function retire() { G.retired = true; G.offers = null; saveGame(); }
