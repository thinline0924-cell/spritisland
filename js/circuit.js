// サーキットのレース計算(スプリントと耐久)。1周ずつ順番に進めて、全周回の記録を返す。

// ---- 天候 ----
function genWeather(track, laps) {
  const chance = U.clamp(track.rain * U.rr(0.6, 1.4), 0, 0.85);
  const rain = new Array(laps + 1).fill(0);
  const rains = U.chance(chance);
  if (rains) {
    const start = U.ri(Math.round(-laps * 0.25), Math.round(laps * 0.8));
    const dur = U.ri(Math.round(laps * 0.2), Math.round(laps * 0.75));
    const peak = U.rr(0.25, 0.95);
    for (let l = 1; l <= laps; l++) {
      if (l < start || l > start + dur) continue;
      const x = (l - start) / Math.max(1, dur);
      rain[l] = peak * Math.min(1, Math.min(x, 1 - x) * 4 + 0.25);
    }
  }
  // 路面の濡れ具合は雨に遅れてついてくる
  const wet = new Array(laps + 1).fill(0);
  let w = rains && rain[1] > 0 ? rain[1] : 0;
  for (let l = 1; l <= laps; l++) {
    if (rain[l] > 0) w += (rain[l] - w) * 0.4;
    else w = Math.max(0, w - 0.05);
    wet[l] = U.clamp(w, 0, 1);
  }
  const qualWet = U.chance(chance * 0.55) ? U.rr(0.15, 0.8) : 0;
  // 予報はおおむね当たるが、外れることもある
  const parts = [0, 1, 2, 3].map(q => {
    const a = Math.floor(q * laps / 4) + 1, b = Math.floor((q + 1) * laps / 4);
    let any = false;
    for (let l = a; l <= b; l++) if (rain[l] > 0.05) any = true;
    const p = any ? U.rr(0.4, 0.9) : chance * U.rr(0.15, 0.8);
    return Math.round(U.clamp(p, 0, 0.95) * 10) * 10;
  });
  const qualP = Math.round(U.clamp(qualWet > 0 ? U.rr(0.45, 0.9) : chance * U.rr(0.1, 0.6), 0, 0.95) * 10) * 10;
  return { rain, wet, qualWet, forecast: { qual: qualP, parts }, chance };
}

// 濡れた路面でのタイヤごとの遅れ(秒)
function wetPen(c, w) {
  if (c === 'I') return 1.2 + 8 * Math.max(0, w - 0.4) + Math.max(0, 0.1 - w) * 10;
  if (c === 'W') return 2.6 + 4 * Math.max(0, 0.55 - w);
  return 18 * w + 20 * Math.max(0, w - 0.4);
}
function isWetTyre(c) { return c === 'I' || c === 'W'; }

function tyreLife(series, track, c, styleKey, tyreStat) {
  const t = TYRES[c];
  const mult = track.abr * STYLES[styleKey].deg * (1.15 - tyreStat * 0.003);
  return t.life * series.laps * series.lifeMul / mult;
}
function tyreLapPen(series, track, c, age, life, styleKey, tyreStat, w) {
  const t = TYRES[c];
  const scale = track.base / 90;
  const mult = track.abr * STYLES[styleKey].deg * (1.15 - tyreStat * 0.003);
  let p = t.off * scale + t.slope * scale * mult * age;
  if (age > life) p += 0.25 * Math.pow(age - life, 1.4) * scale;
  if (isWetTyre(c) && w < 0.1) p += 0.2 * age * (0.1 - w) * 10 * scale; // 乾いた路面では雨用タイヤが溶ける
  return p;
}

// ---- 作戦の見積もり(ドライ前提) ----
function stintCost(series, track, c, startAge, len, styleKey, tyreStat, degNoise) {
  const life = tyreLife(series, track, c, styleKey, tyreStat) / degNoise;
  let sum = 0;
  for (let a = startAge; a < startAge + len; a++) {
    const t = TYRES[c], scale = track.base / 90;
    const mult = track.abr * STYLES[styleKey].deg * (1.15 - tyreStat * 0.003) * degNoise;
    sum += t.off * scale + t.slope * scale * mult * a;
    if (a > life) sum += 0.25 * Math.pow(a - life, 1.4) * scale;
  }
  return sum;
}

function estimateStrategies(series, track, opts = {}) {
  const L = series.laps, C = series.dry, tyreStat = opts.tyre ?? 50, noise = opts.noise ?? 1, startAge = opts.startAge ?? 2;
  const loss = series.pitLoss + 2.5;
  const out = [];
  const valid = cs => !series.twoCompounds || new Set(cs).size > 1;
  for (const a of C) if (valid([a])) out.push({ start: a, stops: [], t: stintCost(series, track, a, startAge, L, 'normal', tyreStat, noise) });
  if (series.pits) {
    for (const a of C) for (const b of C) {
      if (!valid([a, b])) continue;
      let best = null;
      for (let s = 3; s <= L - 3; s++) {
        const t = stintCost(series, track, a, startAge, s, 'normal', tyreStat, noise) + stintCost(series, track, b, 0, L - s, 'normal', tyreStat, noise) + loss;
        if (!best || t < best.t) best = { start: a, stops: [{ lap: s, tyre: b }], t };
      }
      out.push(best);
    }
    if (L >= 20) for (const a of C) for (const b of C) for (const c of C) {
      if (!valid([a, b, c])) continue;
      let best = null;
      for (let s1 = 4; s1 <= L - 8; s1 += 2) for (let s2 = s1 + 4; s2 <= L - 4; s2 += 2) {
        const t = stintCost(series, track, a, startAge, s1, 'normal', tyreStat, noise) + stintCost(series, track, b, 0, s2 - s1, 'normal', tyreStat, noise)
          + stintCost(series, track, c, 0, L - s2, 'normal', tyreStat, noise) + loss * 2;
        if (!best || t < best.t) best = { start: a, stops: [{ lap: s1, tyre: b }, { lap: s2, tyre: c }], t };
      }
      if (best) out.push(best);
    }
  }
  out.sort((x, y) => x.t - y.t);
  const t0 = out[0].t;
  out.forEach(o => o.delta = o.t - t0);
  return out;
}

// ---- 速さ ----
function skillOf(d, w) {
  let s = d.pace * 0.72 + d.cons * 0.1 + d.craft * 0.08 + d.tyre * 0.1;
  s += w * (d.wet - 50) * 0.5;
  return s - (d.famPen || 0);
}
function ratingOf(perf, d, w) { return perf * 0.5 + skillOf(d, w) * 0.5; }

// ---- 予選 ----
const QUAL_APPROACH = {
  attack: { name: '一発に賭ける', off: -0.15, noise: 0.3, err: 0.1, desc: '新品ソフトで限界まで攻める。速いがミスの危険が大きい。' },
  safe: { name: '確実にまとめる', off: 0.1, noise: 0.16, err: 0.03, desc: '少し余裕を残して走る。大きく外すことはない。' },
  save: { name: 'タイヤを温存', off: 0.4, noise: 0.2, err: 0.03, desc: 'アタックを1回に抑える。グリッドは下がるが、決勝を新品タイヤで始められる。' },
};

function simQualifying(series, track, weather, entries) {
  const scale = track.base / 90, w = weather.qualWet;
  const fastest = series.dry.includes('S') ? 'S' : series.dry[0];
  const res = entries.map(e => {
    const ap = QUAL_APPROACH[e.qApproach];
    const d = e.drv;
    const tyres = [fastest, ...series.wet];
    const tp = Math.min(...tyres.map(c => (isWetTyre(c) ? 0 : TYRES[c].off * scale) + wetPen(c, w) * scale));
    let t = track.base - (ratingOf(e.perf, d, w) - 55) * 0.035 * scale + tp + 5 * w * scale + e.setupPen * scale + ap.off * scale
      + U.gauss() * ap.noise * (1.4 - d.cons / 100) * scale;
    let mistake = false;
    if (U.chance(ap.err * (1.5 - d.cons / 100) * (1 + w * 1.5))) { t += U.rr(1.2, 3.5) * scale; mistake = true; }
    return { id: e.id, time: t, mistake };
  });
  res.sort((a, b) => a.time - b.time);
  res.forEach((r, i) => { r.pos = i + 1; r.gap = r.time - res[0].time; });
  return { order: res, wet: w };
}

// ---- 決勝 ----
// 決勝。1周ずつ進める「レース」を作る。live のときは、プレイヤーの車について
// ピットの壁からの指示(call)を出して、答えを待つ。
function createRace(series, track, weather, entries, grid, opts = {}) {
  const L = series.laps, scale = track.base / 90, endurance = series.kind === 'endurance';
  const fuelStint = series.fuelStint || 0;
  const allTyres = [...series.dry, ...series.wet];
  const events = [], snaps = [];
  const byId = {};
  const nightFrom = opts.night ? Math.round(L * 0.35) : 999, nightTo = opts.night ? Math.round(L * 0.7) : -1;
  const label = l => endurance ? `${Math.floor(opts.hours * l / L)}時間${String(Math.round((opts.hours * l / L % 1) * 60)).padStart(2, '0')}分` : `${l}周目`;
  const ev = (lap, text, kind = 'info', player = false) => events.push({ lap, text, kind, player });

  const cars = grid.map((id, gi) => {
    const e = entries.find(x => x.id === id);
    const plan = e.plan;
    const startAge = e.qApproach === 'save' || series.id === 'kart' ? 0 : 3;
    let startTyre = plan.start;
    const c = {
      e, id, grid: gi + 1, cum: gi * 0.25 * scale, tyre: startTyre, age: startAge, stops: plan.stops ? plan.stops.map(s => ({ ...s })) : [],
      stopsDone: 0, dnf: false, lapsDone: 0, wxCount: 0, usedDry: new Set(isWetTyre(startTyre) ? [] : [startTyre]), usedWet: isWetTyre(startTyre),
      last: 0, best: Infinity, penalty: 0, mistakes: 0, overtakes: 0, stuck: 0, stuckOn: null, cliffWarned: false, stintStart: 0,
      rainPolicy: plan.rain || 'react', scPolicy: plan.sc || 'box', delay: e.isPlayer ? 0 : U.ri(0, 2), garage: 0,
      boxNext: null, boxReason: '', ovStyle: null, ovUntil: 0, attackUntil: 0, defendUntil: 0, wxHold: 0,
      cliffAsked: -1, stuckAsked: null, defendAsked: null, finalAsked: false,
    };
    byId[id] = c;
    return c;
  });

  // 雨のスタート:各車は合ったタイヤを履いて出る(チームが判断)
  const w1 = weather.wet[1];
  if (w1 > 0.05) {
    for (const c of cars) {
      const best = bestTyreFor(w1, c);
      if (isWetTyre(best) !== isWetTyre(c.tyre)) { c.tyre = best; c.age = 0; if (isWetTyre(best)) c.usedWet = true; c.stops = []; }
    }
    ev(0, '雨のスタート。各車レインタイヤでグリッドに並ぶ。', 'weather');
  }

  function bestTyreFor(w, c) {
    let best = null, bp = Infinity;
    for (const t of allTyres) {
      const dry = !isWetTyre(t);
      if (dry && t !== series.dry[series.dry.length > 1 ? 1 : 0]) continue; // 比較用はドライ1種で代表
      const p = wetPen(t, w);
      if (p < bp) { bp = p; best = t; }
    }
    return best;
  }
  function styleOf(c) {
    if (c.ovStyle && c.ovUntil >= curLap) return c.ovStyle;
    if (endurance) return c.e.plan.care || 'normal';
    const s = c.e.plan.styles || ['normal'];
    return s[Math.min(c.stopsDone, s.length - 1)] || 'normal';
  }
  function driverOf(c, lap) {
    if (!endurance) return c.e.drv;
    const k = Math.min(Math.floor((lap - 1) / fuelStint), c.e.rota.length - 1);
    return c.e.crew[c.e.rota[k]];
  }
  function lifeOf(c, t, st) { return tyreLife(series, track, t, st || styleOf(c), driverOf(c, Math.max(1, c.lapsDone)).tyre); }
  function chooseDry(c, remaining) {
    const order = ['S', 'M', 'H', 'K'].filter(t => series.dry.includes(t));
    for (const t of order) if (lifeOf(c, t) >= remaining) return t;
    return order[order.length - 1];
  }
  const nameOf = c => c.e.short || c.e.name;
  const P = c => c.e.isPlayer;

  // セーフティカーの予定
  let scPlanned = U.chance(track.sc) ? U.ri(3, L - 4) : -1;
  let scLeft = 0, scReason = '';
  const scLen = endurance ? 2 : 3;
  let prevLeader = grid[0];
  const playerCar = cars.find(P);
  let curLap = 0;
  const R = { L, events, snaps, cars, byId, live: !!opts.live, call: null, lastCall: -9, done: false, result: null, endurance, track, series };
  R.step = () => {
    if (R.done || R.call) return null;
    curLap++;
    runLap(curLap);
    if (curLap === L) finish();
    return snaps[snaps.length - 1];
  };
  R.answer = i => {
    const call = R.call;
    if (!call) return;
    const o = call.options[i] || call.options[call.def];
    o.apply();
    ev(call.lap, `指示:${o.label}`, 'call', true);
    R.lastCall = call.lap;
    R.call = null;
  };
  R.finishAll = () => {
    R.live = false;
    while (!R.done) { if (R.call) R.answer(R.call.def); R.step(); }
    return R.result;
  };

  function runLap(lap) {
    const w = weather.wet[lap];
    // 天候のアナウンス
    if (weather.rain[lap] > 0.05 && weather.rain[lap - 1] <= 0.05 && lap > 1) ev(lap, '雨が降り始めた。', 'weather');
    if (weather.rain[lap] <= 0.05 && weather.rain[lap - 1] > 0.05 && lap > 1) ev(lap, '雨が上がった。路面はこれから乾いていく。', 'weather');
    if (weather.rain[lap] > 0.6 && weather.rain[lap - 1] <= 0.6 && lap > 1) ev(lap, '雨脚が強まる。視界が悪い。', 'weather');
    const prevSc = snaps.length ? snaps[snaps.length - 1].sc : false;

    if (lap === scPlanned && scLeft === 0) { scLeft = scLen; scReason = 'コース上の破片'; }
    const scLap = scLeft > 0;
    if (scLap && !prevSc) ev(lap, `セーフティカー導入(${scReason})。隊列が詰まる。`, 'sc');

    const running = cars.filter(c => !c.dnf);
    const order = snaps.length ? snaps[snaps.length - 1].order.map(id => byId[id]).filter(c => !c.dnf) : running.slice();

    for (const c of running) {
      const remaining = L - lap;
      const st = styleOf(c);
      const d = driverOf(c, lap);
      c.pit = false;
      let newTyre = null, reason = '';

      // ピットの壁からの指示
      const auto = !(R.live && P(c));
      if (P(c) && c.boxNext && remaining > 0 && series.pits) { newTyre = c.boxNext; reason = c.boxReason || 'call'; c.boxNext = null; }

      // 天候への対応
      const best = bestTyreFor(w, c);
      const curP = wetPen(c.tyre, w), bestP = wetPen(best, w);
      const margin = { early: 0.3, react: 1.0, gamble: 3.2 }[c.rainPolicy];
      const delay = { early: 0, react: 1, gamble: 0 }[c.rainPolicy] + (P(c) ? 0 : c.delay);
      if (!auto || newTyre) { /* 指示しだい */ }
      else if (isWetTyre(best) !== isWetTyre(c.tyre) || (isWetTyre(best) && best !== c.tyre && curP - bestP > 1.5)) {
        if (curP - bestP > margin) c.wxCount++; else c.wxCount = 0;
        if (c.wxCount > delay && remaining > 0) {
          newTyre = isWetTyre(best) ? best : chooseDry(c, remaining);
          reason = 'weather';
        }
      } else c.wxCount = 0;

      // 予定のピット
      if (!newTyre && !isWetTyre(c.tyre) && c.stops.length && c.stops[0].lap <= lap && remaining > 0) {
        newTyre = c.stops[0].tyre; c.stops.shift(); reason = 'plan';
      }
      // セーフティカー中に前倒し
      if (!newTyre && auto && scLap && !isWetTyre(c.tyre) && c.stops.length && c.stops[0].lap - lap <= (endurance ? 0 : 10) && remaining > 2) {
        const go = P(c) ? c.scPolicy === 'box' : U.chance(0.65);
        if (go) { newTyre = c.stops[0].tyre; c.stops.shift(); reason = 'sc'; }
      }
      // 耐久:燃料補給
      let fuelStop = false;
      if (endurance && lap % fuelStint === 0 && lap < L) {
        fuelStop = true;
        const stopIdx = lap / fuelStint;
        const change = c.e.plan.tyres === 'every' || stopIdx % 2 === 0 || c.age > lifeOf(c, c.tyre) + 2 || isWetTyre(c.tyre) !== isWetTyre(best);
        if (!newTyre && change) newTyre = isWetTyre(c.tyre) ? (isWetTyre(best) ? best : chooseDry(c, remaining)) : (isWetTyre(best) && curP - bestP > margin ? best : c.e.plan.start);
        if (!reason) reason = 'fuel';
      }
      // 限界を超えたタイヤは強制的に交換
      if (!newTyre && !endurance && c.age > lifeOf(c, c.tyre) + 6 && remaining >= 4 && series.pits) {
        newTyre = isWetTyre(c.tyre) ? c.tyre : chooseDry(c, remaining); reason = 'worn';
        c.stops = [];
      }
      if (!series.pits) newTyre = null; // カートはピット無し:雨でもタイヤはそのまま

      // 1周のタイム
      const life = lifeOf(c, c.tyre, st);
      let t = track.base - (ratingOf(c.e.perf, d, w) - 55) * 0.035 * scale
        + tyreLapPen(series, track, c.tyre, c.age, life, st, d.tyre, w)
        + wetPen(c.tyre, w) * scale + 5 * w * scale + c.e.setupPen * scale + STYLES[st].off * scale
        + U.gauss() * 0.22 * (1.4 - d.cons / 100) * scale;
      if (endurance) t += U.rr(0, 1.3) * (1.25 - d.craft / 100) * scale; // 遅いクラスの車との交錯
      if (c.defendUntil >= lap) t += 0.15 * scale; // ラインを守る分だけ遅くなる
      if (lap === 1) t += U.gauss() * 0.5 * (1.3 - d.craft / 100) + (U.chance(0.03) ? U.rr(2, 6) : 0);

      const night = lap >= nightFrom && lap <= nightTo;
      const fatigue = endurance && P(c) && c.e.rota[Math.floor((lap - 1) / fuelStint)] === 0 && c.e.rota[Math.floor((lap - 1) / fuelStint) - 1] === 0;
      // ミス
      const pErr = 0.011 * (1.6 - d.cons / 100) * STYLES[st].err * (1 + 3 * w * (1.3 - d.wet / 100)) * (night ? 1.5 : 1) * (fatigue ? 1.6 : 1) * (scLap ? 0.2 : 1);
      if (!scLap && U.chance(pErr)) {
        c.mistakes++;
        if (U.chance(0.07 * (1 + 2 * w))) {
          c.dnf = true; c.dnfReason = 'クラッシュ';
          ev(lap, `${nameOf(c)}がクラッシュ。リタイア。`, 'dnf', P(c));
          if (track.sc > 0 && scLeft === 0 && U.chance(0.55)) { scLeft = scLen + 1; scReason = `${nameOf(c)}のクラッシュ`; }
          continue;
        }
        const loss = U.rr(1, 4) * scale;
        t += loss;
        if (P(c)) ev(lap, `${nameOf(c)}がコースオフ。${loss.toFixed(1)}秒を失う。`, 'mistake', true);
      }
      // 故障
      const pFail = (1 - c.e.rel / 100) * (endurance ? 0.01 : 0.0022) * STYLES[st].rel;
      if (U.chance(pFail)) {
        if (endurance && U.chance(0.65)) {
          const loss = U.rr(60, 200) * scale;
          t += loss;
          ev(lap, `${nameOf(c)}がトラブルでガレージへ。${Math.round(loss)}秒の修理。`, 'mistake', P(c));
        } else {
          c.dnf = true; c.dnfReason = U.pick(['エンジン', 'ギアボックス', '油圧', 'サスペンション', '電気系']);
          ev(lap, `${nameOf(c)}が${c.dnfReason}のトラブルでストップ。リタイア。`, 'dnf', P(c));
          if (track.sc > 0 && scLeft === 0 && U.chance(0.3)) { scLeft = scLen + 1; scReason = `${nameOf(c)}の車両回収`; }
          continue;
        }
      }
      if (scLap) t = track.base * 1.35 + U.rr(0, 0.3);

      // ピット
      if (newTyre || fuelStop) {
        const base = series.pitLoss * (scLap ? 0.45 : 1);
        let stop = (fuelStop ? 0 : 2.5) + (newTyre ? (endurance ? series.tyreTime : 0) : 0) + U.rr(-0.3, 0.6);
        let slow = false;
        if (U.chance(0.05)) { stop += U.rr(2.5, 6); slow = true; }
        t += base + stop;
        c.pit = true;
        if (newTyre) {
          if (P(c)) {
            const why = { weather: '天候に合わせて', sc: 'セーフティカーに合わせて', worn: 'タイヤが限界で', plan: '予定どおり', fuel: '', call: 'チームの指示で', undercut: 'アンダーカットを狙って' }[reason] || '';
            ev(lap, `${nameOf(c)}がピットイン。${why}${TYRES[newTyre].name}へ。${slow ? `作業に手間取った(${stop.toFixed(1)}秒)。` : `作業は${stop.toFixed(1)}秒。`}`, 'pit', true);
          } else if (reason === 'weather' && !endurance && order.indexOf(c) < 3) {
            ev(lap, `${nameOf(c)}がピットへ。${TYRES[newTyre].name}を選んだ。`, 'pit');
          }
          if (isWetTyre(newTyre) !== isWetTyre(c.tyre)) c.stops = isWetTyre(newTyre) ? [] : c.stops.filter(s => s.lap > lap + 3 && reason !== 'weather');
          c.tyre = newTyre; c.age = 0; c.stopsDone++; c.cliffWarned = false;
          if (isWetTyre(newTyre)) c.usedWet = true; else c.usedDry.add(newTyre);
        } else if (P(c) && endurance) {
          ev(lap, `${nameOf(c)}が給油のみでピットアウト。タイヤはそのまま。`, 'pit', true);
        }
        if (endurance && P(c)) {
          const k = Math.floor(lap / fuelStint);
          if (k < c.e.rota.length && c.e.rota[k] !== c.e.rota[k - 1]) ev(lap, `ドライバー交代。${c.e.crew[c.e.rota[k]].name}が乗り込む。`, 'pit', true);
        }
      }
      c.age++;
      c.last = t;
      if (!c.pit && !scLap && lap > 1) c.best = Math.min(c.best, t);
      c.cum += t;
      c.lapsDone = lap;
    }

    // 隊列の処理
    let run = order.filter(c => !c.dnf);
    if (scLap) {
      run.sort((a, b) => a.cum - b.cum);
      for (let i = 1; i < run.length; i++) if (!run[i].pit) run[i].cum = Math.max(run[i].cum, run[i - 1].cum + 0.6);
      if (scLeft > 0 && scLeft-- === 1) ev(lap, 'セーフティカーが戻る。レース再開。', 'sc');
      run.sort((a, b) => a.cum - b.cum);
    } else {
      // 速い車がすぐ後ろまで来たら、抜けるかどうか判定する
      for (let i = 1; i < run.length; i++) {
        const c = run[i], a = run[i - 1];
        if (c.cum >= a.cum + 0.3) continue;
        const free = (a.pit && !c.pit) || c.cum < a.cum - 1.5;
        let ok = free;
        if (!free && c.cum < a.cum + 0.3) {
          const adv = a.last - c.last;
          let pc = 0.08 + track.pass * 0.45 + U.clamp(adv * 0.25, -0.2, 0.35) + (driverOf(c, lap).craft - driverOf(a, lap).craft) / 250;
          if (endurance) pc += 0.25;
          if (c.attackUntil >= lap) pc += 0.25;
          if (a.defendUntil >= lap) pc -= 0.2;
          if (lap === 1) pc *= 1.5;
          ok = c.cum < a.cum + 0.15 && U.chance(U.clamp(pc, 0.03, 0.92));
        }
        if (ok) {
          if (c.cum > a.cum - 0.15) c.cum = a.cum - 0.15;
          run[i - 1] = c; run[i] = a;
          if (!a.pit) {
            c.overtakes++;
            if (P(c)) ev(lap, U.pick(PASS_LINES)(nameOf(c), nameOf(a), i), 'pass', true);
            else if (P(a)) ev(lap, U.pick(LOST_LINES)(nameOf(a), nameOf(c), i + 1), 'lost', true);
            else if (i <= 3 && !endurance) ev(lap, `${nameOf(c)}が${nameOf(a)}をかわして${i}位。`, 'info');
          }
          if (P(c)) c.stuck = 0;
        } else if (c.cum < a.cum + 0.3) {
          c.cum = a.cum + 0.3 + U.rr(0, 0.25);
          if (P(c)) {
            if (c.stuckOn === a.id) c.stuck++; else { c.stuckOn = a.id; c.stuck = 1; }
            if (c.stuck === 3) ev(lap, `${nameOf(c)}は${nameOf(a)}の後ろで抑えられている。抜きどころが無い。`, 'info', true);
          }
        }
      }
      run.sort((a, b) => a.cum - b.cum);
    }
    if (lap === 1 && playerCar && !playerCar.dnf) {
      const pos = run.indexOf(playerCar) + 1;
      const k = events.findIndex(x => x.lap === 1);
      const item = { lap: 1, text: `スタート。${nameOf(playerCar)}は${playerCar.grid}番手から${pos}位でオープニングラップを終える。`, kind: 'start', player: true };
      if (k < 0) events.push(item); else events.splice(k, 0, item);
    }
    if (run.length && run[0].id !== prevLeader) {
      ev(lap, `${nameOf(run[0])}がトップに立つ。`, P(run[0]) ? 'pass' : 'lead', P(run[0]));
      prevLeader = run[0].id;
    }
    if (playerCar && !playerCar.dnf && !playerCar.cliffWarned && !isWetTyre(playerCar.tyre) && playerCar.age > lifeOf(playerCar, playerCar.tyre)) {
      playerCar.cliffWarned = true;
      ev(lap, `無線:「タイヤが終わりかけてる。グリップが無い」`, 'radio', true);
    }
    const leader = run[0];
    snaps.push({
      lap, sc: scLap, w,
      order: run.map(c => c.id).concat(cars.filter(c => c.dnf).map(c => c.id)),
      gap: Object.fromEntries(cars.map(c => [c.id, c.dnf ? null : c.cum - leader.cum])),
      tyre: Object.fromEntries(cars.map(c => [c.id, c.tyre])),
      age: Object.fromEntries(cars.map(c => [c.id, c.age])),
      pit: cars.filter(c => c.pit).map(c => c.id),
      dnf: cars.filter(c => c.dnf).map(c => c.id),
      label: label(lap),
    });
    // 節目ごとのまとめ
    if (playerCar && !playerCar.dnf && lap % 10 === 0 && lap < L && !endurance) {
      const pos = run.indexOf(playerCar) + 1;
      const lead = run[0];
      ev(lap, `残り${L - lap}周。トップは${nameOf(lead)}。${nameOf(playerCar)}は${pos}位${pos > 1 ? `、前の車と${(playerCar.cum - run[pos - 2].cum).toFixed(1)}秒差` : `、2位と${(run[1] ? run[1].cum - lead.cum : 0).toFixed(1)}秒差`}。`, 'summary', true);
    }
    if (R.live && lap < L) makeCall(lap, scLap, prevSc, run);
  }

  // ---- ピットの壁からの指示 ----
  function makeCall(lap, scLap, prevSc, run) {
    const c = playerCar;
    if (!c || c.dnf) return;
    const remaining = L - lap, pos = run.indexOf(c) + 1;
    const mk = (kind, title, text, options, def) => { R.call = { kind, lap, title, text, options, def }; };
    const next = c.stops[0];
    // セーフティカー
    if (scLap && !prevSc && series.pits && !endurance && remaining > 3 && !isWetTyre(c.tyre)) {
      const o = series.dry.map(t => ({ label: `ピットへ → ${TYRES[t].name}`, desc: `寿命の目安 約${Math.round(lifeOf(c, t))}周(残り${remaining}周)`,
        apply: () => { c.boxNext = t; c.boxReason = 'sc'; if (next && next.lap - lap <= 12) c.stops.shift(); } }));
      o.push({ label: 'ステイアウト', desc: next ? `予定のピットは${next.lap}周目。順位は守れる。` : '順位を守ってそのまま走る。', apply: () => {} });
      const def = next && next.lap - lap <= 10 ? Math.max(0, series.dry.indexOf(next.tyre)) : o.length - 1;
      return mk('sc', 'セーフティカー', `${scReason}。隊列がスローダウンした。今ピットに入れば、失う時間は普段の半分(約${Math.round(series.pitLoss * 0.45)}秒)。`, o, def);
    }
    // 天候の変化
    if (series.pits && lap >= c.wxHold && remaining > 1) {
      const w2 = weather.wet[lap + 1];
      const best = bestTyreFor(w2, c);
      const gain = wetPen(c.tyre, w2) - wetPen(best, w2);
      if ((isWetTyre(best) !== isWetTyre(c.tyre) || (isWetTyre(best) && best !== c.tyre)) && gain > 0.4) {
        const cands = isWetTyre(best) ? series.wet.filter(t => wetPen(t, w2) - wetPen(best, w2) < 2.5) : [chooseDry(c, remaining)];
        const o = cands.map(t => ({ label: `ピットへ → ${TYRES[t].name}`, desc: t === best ? '今の路面にいちばん合う。' : '路面がさらに変わるならこちら。',
          apply: () => { c.boxNext = t; c.boxReason = 'weather'; } }));
        o.push({ label: 'あと1周様子を見る', desc: '次の周でもう一度判断する。', apply: () => { c.wxHold = lap + 1; } });
        o.push({ label: '賭けて粘る', desc: '4周はこのまま。外れると大きく遅れる。', apply: () => { c.wxHold = lap + 4; } });
        const cond = w2 < 0.05 ? '路面はほぼ乾いた' : w2 < 0.25 ? '路面が湿ってきた' : w2 < 0.55 ? '路面はもうウェット' : '大雨。水しぶきで前が見えない';
        return mk('weather', isWetTyre(best) ? '雨だ' : '路面が乾いてきた', `${cond}。今の${TYRES[c.tyre].name}だと1周あたり約${(gain * scale).toFixed(1)}秒遅い。`, o, gain > 1.0 ? 0 : o.length - 2);
      }
    }
    if (lap - R.lastCall < 3) return;
    // タイヤの限界
    if (series.pits && !endurance && !isWetTyre(c.tyre) && c.cliffAsked !== c.stopsDone && remaining > 3) {
      const life = lifeOf(c, c.tyre);
      if (c.age >= life - 1 && (!next || next.lap > lap + 2)) {
        c.cliffAsked = c.stopsDone;
        const t = chooseDry(c, remaining);
        return mk('tyre', 'タイヤが限界', `${TYRES[c.tyre].name}で${c.age}周。無線「グリップが落ちてきた。どうする?」`, [
          { label: `次の周で入る → ${TYRES[t].name}`, desc: next ? `予定の${next.lap}周目を前倒しする。` : 'ピットが1回増える。', apply: () => { c.boxNext = t; c.boxReason = 'worn'; if (next) c.stops.shift(); } },
          { label: '労わって予定まで粘る', desc: 'ペースを落としてタイヤを持たせる。', apply: () => { c.ovStyle = 'save'; c.ovUntil = next ? next.lap : L; } },
          { label: 'このまま押す', desc: '急にグリップが無くなる恐れがある。', apply: () => {} },
        ], 0);
      }
    }
    // 前の車に詰まっている
    if (c.stuck >= 2 && c.stuckAsked !== c.stuckOn && byId[c.stuckOn] && !byId[c.stuckOn].dnf) {
      const a = byId[c.stuckOn];
      c.stuckAsked = c.stuckOn;
      const o = [{ label: '仕掛ける', desc: '3周のあいだ全開。抜ける確率が上がるが、タイヤとミスに響く。', apply: () => { c.attackUntil = lap + 3; c.ovStyle = 'push'; c.ovUntil = lap + 3; } }];
      if (series.pits && !endurance && next && next.lap - lap <= 8 && next.lap > lap + 1) {
        o.push({ label: 'アンダーカット', desc: `次の周でピットへ(予定は${next.lap}周目)。新品タイヤで前に出る。`, apply: () => { c.boxNext = next.tyre; c.boxReason = 'undercut'; c.stops.shift(); } });
      }
      o.push({ label: '引いてタイヤを守る', desc: '後半のチャンスに備える。', apply: () => { c.ovStyle = 'save'; c.ovUntil = lap + 3; } });
      return mk('battle', `${nameOf(a)}に詰まっている`, `${pos - 1}位の${nameOf(a)}の真後ろで${c.stuck}周。相手は${TYRES[a.tyre].name}で${a.age}周目。`, o, 0);
    }
    // 後ろから迫られている
    const behind = run[pos];
    if (behind && !behind.pit && !c.pit && behind.cum - c.cum < 0.6 && behind.last < c.last && c.defendAsked !== behind.id && remaining > 2 && lap - (c.defendLap || -99) >= (endurance ? 14 : 8)) {
      c.defendAsked = behind.id; c.defendLap = lap;
      return mk('defend', `後ろに${nameOf(behind)}`, `差は${(behind.cum - c.cum).toFixed(1)}秒。相手は${TYRES[behind.tyre].name}で${behind.age}周目。`, [
        { label: '守りに入る', desc: '3周のあいだラインを閉める。少し遅くなるが抜かれにくい。', apply: () => { c.defendUntil = lap + 3; } },
        { label: '自分のペースで', desc: 'タイムを優先する。', apply: () => {} },
      ], 0);
    }
    // 終盤
    const finLap = endurance ? L - 6 : L - (L > 20 ? 5 : 3);
    if (lap >= finLap && !c.finalAsked) {
      c.finalAsked = true;
      const ahead = run[pos - 2];
      const txt = `${nameOf(c)}は${pos}位。` + (ahead ? `前の${nameOf(ahead)}と${(c.cum - ahead.cum).toFixed(1)}秒。` : '') + (behind ? `後ろの${nameOf(behind)}とは${(behind.cum - c.cum).toFixed(1)}秒。` : '');
      return mk('final', `残り${remaining}周`, txt, [
        { label: '全開で行く', desc: '最後まで攻める。タイヤとミスの危険は増える。', apply: () => { c.ovStyle = 'push'; c.ovUntil = L; c.attackUntil = L; } },
        { label: 'このまま', desc: '今のペースで走り切る。', apply: () => {} },
        { label: '順位を守る', desc: 'ペースを抑えてミスを減らす。', apply: () => { c.ovStyle = 'save'; c.ovUntil = L; c.defendUntil = L; } },
      ], 1);
    }
  }

  function finish() {
  // 2種類のタイヤ義務
  if (series.twoCompounds) for (const c of cars) {
    if (!c.dnf && !c.usedWet && c.usedDry.size < 2) {
      c.penalty += 20;
      ev(L, `${nameOf(c)}は2種類のタイヤを使わなかったため、20秒加算のペナルティ。`, 'mistake', P(c));
    }
  }
  const fin = cars.filter(c => !c.dnf).sort((a, b) => (a.cum + a.penalty) - (b.cum + b.penalty));
  const out = cars.filter(c => c.dnf).sort((a, b) => b.lapsDone - a.lapsDone);
  const mult = opts.double ? 2 : 1;
  const classification = [...fin, ...out].map((c, i) => ({
    id: c.id, pos: i + 1, dnf: c.dnf, reason: c.dnfReason || '', time: c.cum + c.penalty,
    gap: c.dnf ? null : (c.cum + c.penalty) - (fin[0].cum + fin[0].penalty), laps: c.lapsDone, stops: c.stopsDone,
    points: !c.dnf && i < 10 ? POINTS[i] * mult : 0, best: c.best, grid: c.grid, overtakes: c.overtakes, mistakes: c.mistakes, wet: c.usedWet,
  }));
  const fl = classification.filter(r => isFinite(r.best)).sort((a, b) => a.best - b.best)[0];
  if (fin.length) ev(L, `チェッカー。${nameOf(fin[0])}が優勝。`, 'finish');
  const wetRace = weather.wet.some(x => x > 0.15);
  R.result = { classification, snaps, events, fastest: fl ? fl.id : null, wetRace, laps: L };
  R.done = true;
  }
  return R;
}

function simRace(series, track, weather, entries, grid, opts = {}) {
  return createRace(series, track, weather, entries, grid, { ...opts, live: false }).finishAll();
}

const PASS_LINES = [
  (me, o, p) => `${me}が${o}のインに飛び込む。${p}位へ浮上。`,
  (me, o, p) => `ストレートで並んだ。${me}がブレーキング勝負で${o}を仕留めて${p}位。`,
  (me, o, p) => `${me}、${o}をアウトからかわした。${p}位。`,
  (me, o, p) => `${o}の立ち上がりが乱れた。${me}が見逃さず${p}位へ。`,
];
const LOST_LINES = [
  (me, o, p) => `${o}が${me}のインを突いた。${me}は${p}位に後退。`,
  (me, o, p) => `${me}、ストレートで${o}に並ばれて${p}位へ下がる。`,
  (me, o, p) => `守り切れない。${o}が前へ。${me}は${p}位。`,
];
