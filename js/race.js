// 決勝の中継・結果・オファー・引退
function entryName(id) { const e = G.season.entries.find(x => x.id === id); return e ? e.name : id; }
function entryOf(id) { return G.season.entries.find(x => x.id === id); }

const CALL_SECONDS = 15;

// 保存済みの結果を、もう一度流すための「レース」
function replayOf(res) {
  const R = { snaps: [], events: res.events, laps: res.laps, rally: !!res.rally, call: null, done: false, live: false, result: res, replay: true };
  R.step = () => {
    if (R.done) return null;
    R.snaps.push(res.snaps[R.snaps.length]);
    if (R.snaps.length >= res.snaps.length) R.done = true;
    return R.snaps[R.snaps.length - 1];
  };
  R.finishAll = () => { while (!R.done) R.step(); return res; };
  return R;
}

function raceScreen() {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid), R = App.race;
  const rally = s.kind === 'rally';
  let map;
  if (rally) {
    const { d, pts } = rallyShape(v);
    map = `<svg viewBox="0 0 320 200" id="lv-map" role="img" aria-label="ステージ図と自分の車の位置">${rallyLines(d, pts)}<path id="lv-path" d="${d}" fill="none" stroke="none"/><g id="lv-cars"></g>
      <text x="10" y="190" class="m-lab" id="lv-stage"></text></svg>`;
  } else {
    const { d, sf } = trackShape(v);
    map = `<svg viewBox="0 0 320 200" id="lv-map" role="img" aria-label="コース図と各車の位置">${trackLines(d, sf)}<path id="lv-path" d="${d}" fill="none" stroke="none"/><g id="lv-cars"></g></svg>`;
  }
  return `${weekendHead(s, v, 2)}
  <section class="live" id="live">
    <div class="live-top">
      <div class="lv-count"><span id="lv-lap">${rally ? 'SS1' : 'LAP 0'}</span><small>/${R.laps || R.L}</small></div>
      <div class="lv-chips"><span id="lv-wx" class="chip sky"></span><span id="lv-flag" class="chip"></span></div>
      <div class="lv-ctrl">
        ${[1, 3, 10].map(x => `<button class="mini spd ${App.play.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">×${x}</button>`).join('')}
        <button class="mini hot" data-act="skip" id="lv-skip">${R.replay ? '結果へ' : '最後まで任せる'}</button>
      </div>
    </div>
    <div class="live-grid">
      <div class="live-l">
        <div class="map">${map}</div>
        <div class="duel" id="lv-duel"></div>
        <div class="chart" id="lv-chart"></div>
      </div>
      <div class="live-r">
        <div class="tower" id="lv-tower"></div>
        <ol class="log" id="lv-log"></ol>
      </div>
    </div>
    <div class="headline" id="lv-head" aria-live="polite"></div>
    <div class="callbox" id="lv-call" hidden></div>
  </section>`;
}

function startPlayback() {
  const P = App.play, R = App.race;
  clearTimeout(P.timer);
  cancelAnimationFrame(P.raf);
  const s = curSeries(), v = venueOf(s.id, G.weekend.vid);
  P.lapT = s.kind === 'rally' ? 1 : v.base;
  P.lapStart = performance.now();
  P.lapDur = 1;
  P.shown = 0;
  if (R.snaps.length) drawLive();
  const base = () => (R.rally ? 2600 : Math.max(420, Math.min(1100, 34000 / (R.laps || R.L)))) / P.speed;
  P.base = base;
  const tick = () => {
    if (!document.getElementById('lv-tower') || App.play !== P) return;
    if (R.call) { showCall(); return; }
    const snap = R.step();
    if (!snap) {
      if (R.call) showCall();
      return;
    }
    const head = drawLive();
    P.lapStart = performance.now();
    P.lapDur = base() + (head ? 900 / P.speed : 0);
    if (R.done) {
      if (!R.replay && !P.finalized) { P.finalized = true; finalizeRace(R.result); }
      const b = document.getElementById('lv-skip');
      if (b) { b.textContent = '結果を見る'; b.dataset.act = 'toresult'; b.classList.add('pulse'); }
      return;
    }
    P.timer = setTimeout(tick, P.lapDur);
  };
  P.tick = tick;
  P.timer = setTimeout(tick, 400);
  const anim = () => {
    if (!document.getElementById('lv-map') || App.play !== P) return;
    drawCars();
    P.raf = requestAnimationFrame(anim);
  };
  P.raf = requestAnimationFrame(anim);
}

// 新しく増えた出来事から、見出しにするものを選ぶ
const HEAD_RANK = { dnf: 10, finish: 9, sc: 8, weather: 7, pass: 6, lost: 6, mistake: 5, pit: 4, lead: 3, stage: 2 };
const HEAD_TAG = { dnf: 'RETIRED', finish: 'CHEQUERED FLAG', sc: 'SAFETY CAR', weather: 'WEATHER', pass: 'OVERTAKE!', lost: 'LOST A PLACE', mistake: 'TROUBLE', pit: 'PIT STOP', lead: 'NEW LEADER', stage: 'STAGE TIME' };
function pickHeadline(evs) {
  let best = null, br = 0;
  for (const e of evs) {
    if (e.kind === 'call' || e.kind === 'summary' || e.kind === 'info' || e.kind === 'radio' || e.kind === 'start') continue;
    if ((e.kind === 'dnf' || e.kind === 'pit' || e.kind === 'mistake') && !e.player) continue;
    if (e.kind === 'stage' && !e.player) continue;
    const r = (HEAD_RANK[e.kind] || 0) + (e.player ? 1 : 0);
    if (r > br) { br = r; best = e; }
  }
  return best;
}

function drawLive() {
  const R = App.race, P = App.play, i = R.snaps.length - 1, snap = R.snaps[i], s = curSeries();
  const rally = !!R.rally, total = R.laps || R.L;
  $('#lv-lap').textContent = rally ? snap.label : s.kind === 'endurance' ? snap.label : `LAP ${snap.lap}`;
  $('#lv-wx').textContent = rally ? (snap.w > 0 ? '雨' : '晴れ') : wxText(snap.w);
  const flag = $('#lv-flag');
  const last = i === total - 1 || R.done;
  flag.textContent = last ? 'FINISH' : snap.sc ? 'SAFETY CAR' : rally ? 'STAGE' : 'GREEN';
  flag.className = 'chip ' + (last ? 'ink' : snap.sc ? 'sc' : 'go');
  // 計時タワー
  const prevOrder = i > 0 ? R.snaps[i - 1].order : snap.order;
  const tw = $('#lv-tower');
  tw.innerHTML = snap.order.map((id, k) => {
    const dnf = snap.dnf.includes(id), e = entryOf(id);
    const gap = dnf ? 'OUT' : snap.pit.includes(id) ? 'PIT' : k === 0 ? 'LEADER' : U.fmtGap(snap.gap[id]);
    const pk = prevOrder.indexOf(id);
    const mv = !dnf && pk > k ? '<i class="up">▲</i>' : !dnf && pk < k ? '<i class="dn">▼</i>' : '<i></i>';
    return `<div class="tw-row ${e.isPlayer ? 'me' : ''} ${e.isMate ? 'mate' : ''} ${dnf ? 'out' : ''}">
      <span class="tw-p">${dnf ? '—' : k + 1}</span>${mv}<span class="tw-n">${U.esc(e.short || e.name)}</span>
      <span class="tw-g">${gap}</span>${!rally && snap.tyre[id] ? tyreChip(snap.tyre[id]) : '<span></span>'}</div>`;
  }).join('');
  const mine = tw.querySelector('.tw-row.me');
  if (mine && tw.scrollHeight > tw.clientHeight) tw.scrollTop = Math.max(0, mine.offsetTop - tw.clientHeight / 2);
  $('#lv-duel').innerHTML = duelHTML(R, i);
  $('#lv-chart').innerHTML = posChart(R, i);
  // 実況
  const evs = R.events.filter(e => e.lap <= snap.lap);
  const fresh = evs.slice(P.shown || 0);
  P.shown = evs.length;
  const tag = l => rally ? (l ? `SS${l}` : '') : s.kind === 'endurance' ? '' : (l ? `L${l}` : 'START');
  const list = evs.slice().reverse().slice(0, 50);
  $('#lv-log').innerHTML = list.map((e, k) => `<li class="k-${e.kind} ${e.player ? 'pl' : ''} ${k < fresh.length ? 'new' : ''}"><span class="lg-t">${tag(e.lap)}</span><span>${U.esc(e.text)}</span></li>`).join('');
  if (rally) { const st = G.weekend.ev.stages[Math.min(i + 1, G.weekend.ev.stages.length - 1)]; const t = $('#lv-stage'); if (t) t.textContent = R.done ? '' : `NEXT  SS${st.no} ${st.name} ${st.km}km`; }
  const head = pickHeadline(fresh);
  if (head) showHeadline(head);
  return head;
}

function showHeadline(e) {
  const el = $('#lv-head');
  if (!el) return;
  const tag = e.kind === 'weather' ? (/上が|乾/.test(e.text) ? 'DRYING' : 'RAIN') : HEAD_TAG[e.kind];
  el.innerHTML = `<div class="hd-band k-${e.kind} ${e.player ? 'pl' : ''}"><b>${tag}</b><span>${U.esc(e.text)}</span></div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function duelHTML(R, i) {
  const snap = R.snaps[i], prev = i > 0 ? R.snaps[i - 1] : null;
  const ord = snap.order.filter(id => !snap.dnf.includes(id));
  const k = ord.indexOf('P');
  if (k < 0) return `<div class="duel-out">リタイア。ここからはピットで見守るしかない。</div>`;
  const row = (id, side) => {
    if (!id) return `<div class="du ${side}"><span class="du-s">${side === 'a' ? '前' : '後ろ'}</span><span class="du-n">${side === 'a' ? 'トップを走行中' : '後ろは誰もいない'}</span><span></span></div>`;
    const g = side === 'a' ? snap.gap.P - snap.gap[id] : snap.gap[id] - snap.gap.P;
    let trend = '';
    if (prev && prev.gap[id] != null && prev.gap.P != null) {
      const pg = side === 'a' ? prev.gap.P - prev.gap[id] : prev.gap[id] - prev.gap.P;
      const d = g - pg;
      trend = Math.abs(d) < 0.15 ? '変わらず' : side === 'a' ? (d < 0 ? `詰めている ${d.toFixed(1)}` : `離された +${d.toFixed(1)}`) : (d < 0 ? `迫られている ${d.toFixed(1)}` : `引き離した +${d.toFixed(1)}`);
    }
    const close = g < 1 ? 'hot' : '';
    return `<div class="du ${side} ${close}"><span class="du-s">${side === 'a' ? '前' : '後ろ'}</span><span class="du-n">${U.esc(entryOf(id).short || entryOf(id).name)}</span><span class="du-g"><b>${g.toFixed(1)}</b>秒<small>${trend}</small></span></div>`;
  };
  const tyre = !R.rally && snap.tyre.P ? `${tyreChip(snap.tyre.P)} ${snap.age.P}周` : '';
  return `${row(ord[k - 1], 'a')}<div class="du me"><span class="du-s">自分</span><span class="du-n"><b>P${k + 1}</b> ${U.esc(G.driver.name)}</span><span class="du-g">${tyre}</span></div>${row(ord[k + 1], 'b')}`;
}

// コース上の各車
function drawCars() {
  const R = App.race, P = App.play, g = document.getElementById('lv-cars'), path = document.getElementById('lv-path');
  if (!g || !path) return;
  if (!P.len) P.len = path.getTotalLength();
  const p = U.clamp((performance.now() - P.lapStart) / P.lapDur, 0, 1);
  const snap = R.snaps[R.snaps.length - 1];
  if (R.rally) {
    const f = R.done ? 1 : (snap ? p : 0) * 0.98;
    const pt = path.getPointAtLength(f * P.len);
    g.innerHTML = `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="9" class="car me"/><text x="${pt.x.toFixed(1)}" y="${(pt.y + 3.5).toFixed(1)}" class="car-no">${G.driver.number}</text>`;
    return;
  }
  const ids = snap ? snap.order : G.weekend.grid || G.weekend.qual.order.map(r => r.id);
  const moving = snap && !R.done;
  let out = '', me = '';
  ids.forEach((id, k) => {
    if (snap && snap.dnf.includes(id)) return;
    const gap = snap ? snap.gap[id] : 0;
    let f = moving ? p - gap / (P.lapT * (snap.sc ? 1.35 : 1)) : (snap ? -gap / P.lapT : -k * 0.006);
    f = ((f % 1) + 1) % 1;
    const pt = path.getPointAtLength(f * P.len);
    const e = entryOf(id);
    if (e.isPlayer) me = `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="9" class="car me"/><text x="${pt.x.toFixed(1)}" y="${(pt.y + 3.5).toFixed(1)}" class="car-no">${G.driver.number}</text>`;
    else out += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${e.isMate ? 5.5 : 4}" class="car ${e.isMate ? 'mate' : k === 0 ? 'lead' : ''}"/>`;
    if (k === 0 && snap && snap.sc && moving) {
      const q = path.getPointAtLength((((f + 0.04) % 1)) * P.len);
      out += `<rect x="${(q.x - 9).toFixed(1)}" y="${(q.y - 6).toFixed(1)}" width="18" height="12" class="sc-car"/><text x="${q.x.toFixed(1)}" y="${(q.y + 3.5).toFixed(1)}" class="sc-no">SC</text>`;
    }
  });
  g.innerHTML = out + me;
}

// ピットの壁からの指示
function showCall() {
  const R = App.race, P = App.play, c = R.call, box = $('#lv-call');
  if (!box || !c) return;
  box.innerHTML = `<div class="call-k">TEAM RADIO — ${c.kind === 'service' ? 'SERVICE PARK' : 'PIT WALL CALL'}</div>
    <h3>${U.esc(c.title)}</h3><p class="call-t">${U.esc(c.text)}</p>
    <div class="call-opts">${c.options.map((o, i) => `<button type="button" class="call-o ${i === c.def ? 'def' : ''}" data-act="callans" data-arg="${i}"><b>${U.esc(o.label)}</b><span>${U.esc(o.desc)}</span></button>`).join('')}</div>
    <div class="call-timer"><i style="animation-duration:${CALL_SECONDS}s"></i></div>
    <p class="call-n">${CALL_SECONDS}秒で答えないと「${U.esc(c.options[c.def].label)}」になる。</p>`;
  box.hidden = false;
  const first = box.querySelector('.call-o.def') || box.querySelector('.call-o');
  if (first) first.focus({ preventScroll: true });
  clearTimeout(P.callTimer);
  P.callTimer = setTimeout(() => answerCall(c.def), CALL_SECONDS * 1000);
}
function answerCall(i) {
  const R = App.race, P = App.play;
  if (!R || !R.call || !P) return;
  clearTimeout(P.callTimer);
  R.answer(Number(i));
  const box = $('#lv-call');
  if (box) { box.hidden = true; box.innerHTML = ''; }
  P.lapStart = performance.now();
  P.timer = setTimeout(P.tick, 250);
}

function posChart(R, upto) {
  const snaps = R.snaps, n = snaps[0].order.length, L = Math.max(2, R.laps || R.L || snaps.length);
  const W = 640, H = 200, padL = 26, padR = 8, padT = 10, padB = 16;
  const x = k => padL + (W - padL - padR) * (k / (L - 1));
  const y = p => padT + (H - padT - padB) * ((p - 1) / Math.max(1, n - 1));
  const ids = snaps[0].order;
  const lineFor = id => {
    let d = '';
    for (let k = 0; k <= upto; k++) {
      const sn = snaps[k];
      if (sn.dnf.includes(id)) break;
      d += (d ? ' L' : 'M') + x(k).toFixed(1) + ',' + y(sn.order.indexOf(id) + 1).toFixed(1);
    }
    return d;
  };
  const others = ids.filter(id => !entryOf(id).isPlayer && !entryOf(id).isMate).map(id => `<path d="${lineFor(id)}" class="ln o"/>`).join('');
  const mate = ids.filter(id => entryOf(id).isMate).map(id => `<path d="${lineFor(id)}" class="ln m"/>`).join('');
  let grid = '';
  for (let p = 1; p <= n; p += (n > 12 ? 4 : 2)) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(p)}" y2="${y(p)}" class="gl"/><text x="${padL - 6}" y="${y(p) + 3.5}" class="gt">${p}</text>`;
  const sn = snaps[upto];
  const myP = sn.order.indexOf('P') + 1;
  const dot = sn.dnf.includes('P') ? '' : `<circle cx="${x(upto)}" cy="${y(myP)}" r="6" class="dot"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="順位の推移">${grid}${others}${mate}<path d="${lineFor('P')}" class="ln ps"/><path d="${lineFor('P')}" class="ln p"/>${dot}</svg>`;
}

// ---- 結果 ----
function resultScreen() {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid), res = wk.result;
  const me = res.classification.find(r => r.id === 'P');
  const rally = !!res.rally;
  const head1 = me.dnf ? 'DNF' : `P${me.pos}`;
  let line;
  if (me.dnf) line = `${me.reason}でリタイア。ポイントは無し。`;
  else if (me.pos === 1) line = `優勝。${rally ? '' : `${me.grid}番手からの勝利。`}`;
  else if (me.pos <= 3) line = `表彰台。${rally ? '' : `${me.grid}番手スタートから${me.pos}位。`}`;
  else line = rally ? `総合${me.pos}位でフィニッシュ。` : `${me.grid}番手スタートから${me.pos}位でフィニッシュ。`;
  const extra = [];
  if (!rally && me.overtakes) extra.push(`追い抜き${me.overtakes}回`);
  if (me.mistakes) extra.push(`ミス${me.mistakes}回`);
  if (!rally && s.pits) extra.push(`ピット${me.stops}回`);
  if (rally && me.stageWins) extra.push(`ステージ優勝${me.stageWins}回`);
  const rows = res.classification.map(r => {
    const e = entryOf(r.id);
    return `<tr class="${e.isPlayer ? 'me' : ''}"><td class="n">${r.dnf ? '—' : r.pos}</td><td>${U.esc(e.name)}${e.isMate ? ' <span class="tag">TM</span>' : ''}${r.id === res.fastest ? ' <span class="tag">FL</span>' : ''}</td>
      <td class="hide-s muted">${U.esc(teamOfEntry(e).name)}</td>
      <td class="n">${r.dnf ? `<span class="dnf">${U.esc(r.reason)}</span>` : r.pos === 1 ? U.fmtTime(r.time) : U.fmtGap(r.gap)}</td>
      ${rally ? '' : `<td class="n hide-s">${r.stops ?? ''}</td>`}<td class="n b">${r.points || ''}</td></tr>`;
  }).join('');
  const growth = Object.entries(wk.growth || {}).filter(([, d]) => Math.abs(d) >= 0.1).map(([k, d]) => `<span class="gr ${d < 0 ? 'neg' : ''}">${STAT_NAMES[k]} ${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`).join('');
  const last = G.season.round + 1 >= G.season.cal.length;
  return `${weekendHead(s, v, 2)}
  <section class="result-hero">
    <span class="rh-pos">${head1}</span>
    <div><p class="rh-line">${line}</p><p class="muted">${extra.join('・')}${me.points ? `・${me.points}ポイント獲得` : ''}</p>
    ${growth ? `<div class="growth">${growth}</div>` : ''}</div>
  </section>
  <div class="grid2 wide-l">
    <section class="panel">
      ${head('01', 'CLASSIFICATION', '最終結果')}
      <table class="tbl"><thead><tr><th class="n">#</th><th>${s.kind === 'endurance' ? 'マシン' : 'ドライバー'}</th><th class="hide-s">チーム</th><th class="n">タイム</th>${rally ? '' : '<th class="n hide-s">ピット</th>'}<th class="n">点</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
    <section class="panel">
      ${head('02', 'STANDINGS', 'シリーズ順位')}
      ${standingsTable(8)}
      <button class="btn ghost wide" data-act="replay">もう一度見る</button>
      <button class="btn primary wide" data-act="done">${last ? 'シーズンを締めくくる' : 'パドックへ戻る'}</button>
    </section>
  </div>`;
}

// ---- オファー ----
function offersScreen() {
  const d = G.driver;
  let summary = '';
  if (G.seasonEnd && G.season) {
    const e = G.seasonEnd, s = curSeries();
    const verdict = e.pos === 1 ? 'チャンピオン。' : e.pos <= e.target ? `目標の${e.target}位以内を達成。` : `目標の${e.target}位には届かなかった。`;
    summary = `<section class="result-hero">
      <span class="rh-pos">P${e.pos}</span>
      <div><p class="rh-line">${G.season.year}年 ${U.esc(s.name)}:シリーズ${e.pos}位。${verdict}</p>
      <p class="muted">${e.pts}ポイント・${e.wins}勝・表彰台${e.pods}回${e.mateBeat === true ? '・チームメイトに勝った' : e.mateBeat === false ? '・チームメイトに負けた' : ''}</p>
      <div class="growth"><span class="gr ${e.rep < e.repBefore ? 'neg' : ''}">評価 ${Math.round(e.repBefore)} → ${Math.round(e.rep)}</span></div></div>
    </section>`;
  }
  const first = !G.season;
  const rows = G.offers.map((o, i) => {
    const s = SERIES_BY_ID[o.sid];
    const famLow = s.id !== 'kart' && d.fam[s.disc] < 40;
    return `<article class="offer">
      <div class="of-tier">${tierLabel(s)}<small>${DISC_NAME[s.disc]}</small></div>
      <div class="of-main"><h3>${U.esc(s.name)}</h3><p class="of-team">${U.esc(o.team)}</p><p class="note">${U.esc(o.note)}${famLow ? ' この分野の経験はまだ浅い。' : ''}</p></div>
      <dl class="of-spec"><div><dt>マシン</dt><dd>${grade(o.perf)}</dd></div><div><dt>信頼性</dt><dd>${grade(o.rel)}</dd></div><div><dt>目標</dt><dd>${o.target}位</dd></div></dl>
      <button class="btn primary" data-act="sign" data-arg="${i}">契約する</button>
    </article>`;
  }).join('');
  const end = careerMustEnd();
  return `${summary}
  <section class="panel">
    ${head(first ? '01' : '02', 'OFFERS', first ? '最初の契約' : `${G.year + 1}年のオファー`)}
    ${first ? '<p class="note">17歳。いくつかのチームから声がかかっている。どこでキャリアを始めるか。</p>' : `<p class="note">${d.age + 1}歳のシーズン。評価 ${Math.round(d.rep)}。</p>`}
    ${end ? '<p class="warn">38歳。そろそろヘルメットを置く時だ。</p>' : `<div class="offers">${rows}</div>`}
    ${first ? '' : `<div class="row-end"><button class="btn ${end ? 'primary' : 'ghost'}" data-act="retire">引退する</button></div>`}
  </section>
  ${first ? '' : `<section class="panel">${head('03', 'DRIVER', 'ドライバー')}${statsBlock()}</section>`}`;
}

// ---- 引退 ----
function careerEndScreen() {
  const t = G.totals, d = G.driver;
  const hist = G.history.map(h => `<tr><td class="n">${h.year}</td><td>${U.esc(SERIES_BY_ID[h.sid].name)}</td><td class="hide-s muted">${U.esc(h.team)}</td><td class="n b">${h.pos === 1 ? 'CHAMP' : 'P' + h.pos}</td><td class="n">${h.wins}</td><td class="n">${h.pts}</td></tr>`).join('');
  const best = G.history.reduce((a, h) => !a || SERIES_BY_ID[h.sid].tier > SERIES_BY_ID[a.sid].tier || (SERIES_BY_ID[h.sid].tier === SERIES_BY_ID[a.sid].tier && h.pos < a.pos) ? h : a, null);
  return `<section class="hero">
      <div class="hero-l"><span class="kicker">CAREER RECORD</span><h2>${U.esc(d.name)} <small>#${d.number}</small></h2>
      <p>${G.history.length}シーズン・${d.age}歳で引退${best ? `・最高位 ${U.esc(SERIES_BY_ID[best.sid].name)} ${best.pos}位` : ''}</p></div>
    </section>
    <section class="totals">
      ${[['出走', t.starts], ['優勝', t.wins], ['表彰台', t.podiums], ['ポール', t.poles], ['タイトル', t.titles.length]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}
    </section>
    <div class="grid2 wide-l">
      <section class="panel">${head('01', 'SEASONS', '歩み')}
        <table class="tbl"><thead><tr><th class="n">年</th><th>シリーズ</th><th class="hide-s">チーム</th><th class="n">順位</th><th class="n">勝</th><th class="n">点</th></tr></thead><tbody>${hist}</tbody></table></section>
      <section class="panel">${head('02', 'TITLES', 'タイトル')}
        ${t.titles.length ? `<ul class="titles">${t.titles.map(x => `<li><b>${x.year}</b>${U.esc(x.name)}</li>`).join('')}</ul>` : '<p class="note">タイトルには手が届かなかった。</p>'}
        <button class="btn primary wide" data-act="reset">新しいキャリアを始める</button>
      </section>
    </div>`;
}
