// 決勝の再生・結果・オファー・引退
function entryName(id) { const e = G.season.entries.find(x => x.id === id); return e ? e.name : id; }
function entryOf(id) { return G.season.entries.find(x => x.id === id); }

function raceScreen() {
  const s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  return `${weekendHead(s, v, 2)}
  <section class="live">
    <div class="live-bar">
      <div class="lb-l"><span id="lv-lap" class="lv-lap">—</span><span id="lv-wx" class="lv-wx"></span><span id="lv-flag" class="flag"></span></div>
      <div class="lb-r">
        <span class="muted hide-s">速さ</span>
        ${[1, 3, 10].map(x => `<button class="mini spd ${App.play.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">×${x}</button>`).join('')}
        <button class="mini" data-act="skip" id="lv-skip">結果へ</button>
      </div>
    </div>
    <div class="live-grid">
      <div class="tower" id="lv-tower"></div>
      <div class="live-r">
        <div class="chart" id="lv-chart"></div>
        <ol class="log" id="lv-log"></ol>
      </div>
    </div>
  </section>`;
}

function startPlayback() {
  const P = App.play, res = G.weekend.result;
  const tick = () => {
    if (!document.getElementById('lv-tower')) { clearInterval(P.timer); return; }
    drawLive(P.idx);
    if (P.idx >= res.snaps.length - 1) {
      clearInterval(P.timer); P.timer = null;
      const b = document.getElementById('lv-skip');
      if (b) { b.textContent = '結果を見る'; b.classList.add('pulse'); }
      return;
    }
    P.idx++;
  };
  clearInterval(P.timer);
  const base = res.rally ? 1500 : Math.max(260, Math.min(800, 26000 / res.snaps.length));
  P.timer = setInterval(tick, base / P.speed);
  tick();
}

function drawLive(i) {
  const res = G.weekend.result, snap = res.snaps[i], s = curSeries();
  const rally = !!res.rally;
  $('#lv-lap').textContent = rally ? `${snap.label} / SS${res.laps}` : s.kind === 'endurance' ? `${snap.label}経過` : `LAP ${snap.lap} / ${res.laps}`;
  $('#lv-wx').textContent = rally ? (snap.w > 0 ? '雨' : '晴れ') : wxText(snap.w);
  const flag = $('#lv-flag');
  flag.textContent = snap.sc ? 'SAFETY CAR' : '';
  flag.className = 'flag' + (snap.sc ? ' on' : '');
  // 計時塔
  const rows = snap.order.map((id, k) => {
    const dnf = snap.dnf.includes(id), e = entryOf(id);
    const gap = dnf ? 'DNF' : snap.pit.includes(id) ? 'PIT' : k === 0 ? 'LEADER' : U.fmtGap(snap.gap[id]);
    const prev = i > 0 ? res.snaps[i - 1].order.indexOf(id) : k;
    const mv = !dnf && prev > k ? '<i class="up">▲</i>' : !dnf && prev < k ? '<i class="dn">▼</i>' : '<i></i>';
    return `<div class="tw-row ${e.isPlayer ? 'me' : ''} ${e.isMate ? 'mate' : ''} ${dnf ? 'out' : ''}">
      <span class="tw-p">${dnf ? '—' : k + 1}</span>${mv}<span class="tw-n">${U.esc(e.short || e.name)}</span>
      <span class="tw-g">${gap}</span>${!rally && snap.tyre[id] ? tyreChip(snap.tyre[id]) : ''}</div>`;
  }).join('');
  const tw = $('#lv-tower');
  tw.innerHTML = rows;
  const mine = tw.querySelector('.tw-row.me');
  if (mine && tw.scrollHeight > tw.clientHeight) tw.scrollTop = Math.max(0, mine.offsetTop - tw.clientHeight / 2);
  $('#lv-chart').innerHTML = posChart(res, i);
  // 実況
  const evs = res.events.filter(e => e.lap <= snap.lap).slice().reverse();
  const tag = l => rally ? (l ? `SS${l}` : '') : s.kind === 'endurance' ? '' : (l ? `L${l}` : 'START');
 const fresh = evs.length - (App.play.shown || 0);
  App.play.shown = evs.length;
  $('#lv-log').innerHTML = evs.slice(0, 60).map((e, k) => `<li class="k-${e.kind} ${e.player ? 'pl' : ''} ${k < fresh ? 'new' : ''}"><span class="lg-t">${tag(e.lap)}</span><span>${U.esc(e.text)}</span></li>`).join('');
}

function posChart(res, upto) {
  const n = res.snaps[0].order.length, L = res.snaps.length;
  const W = 640, H = 220, padL = 26, padR = 8, padT = 10, padB = 18;
  const x = k => padL + (W - padL - padR) * (L === 1 ? 0 : k / (L - 1));
  const y = p => padT + (H - padT - padB) * ((p - 1) / Math.max(1, n - 1));
  const ids = res.snaps[0].order;
  const lineFor = id => {
    let d = '';
    for (let k = 0; k <= upto; k++) {
      const sn = res.snaps[k];
      if (sn.dnf.includes(id)) break;
      const p = sn.order.indexOf(id) + 1;
      d += (d ? ' L' : 'M') + x(k).toFixed(1) + ',' + y(p).toFixed(1);
    }
    return d;
  };
  const others = ids.filter(id => !entryOf(id).isPlayer && !entryOf(id).isMate).map(id => `<path d="${lineFor(id)}" class="ln o"/>`).join('');
  const mate = ids.filter(id => entryOf(id).isMate).map(id => `<path d="${lineFor(id)}" class="ln m"/>`).join('');
  const me = `<path d="${lineFor('P')}" class="ln p"/>`;
  let grid = '';
  for (let p = 1; p <= n; p += (n > 12 ? 4 : 2)) grid += `<line x1="${padL}" x2="${W - padR}" y1="${y(p)}" y2="${y(p)}" class="gl"/><text x="${padL - 6}" y="${y(p) + 3.5}" class="gt">${p}</text>`;
  const sn = res.snaps[upto];
  const myP = sn.order.indexOf('P') + 1;
  const dot = sn.dnf.includes('P') ? '' : `<circle cx="${x(upto)}" cy="${y(myP)}" r="4" class="dot"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="順位の推移">${grid}${others}${mate}${me}${dot}
    <text x="${W - padR}" y="${H - 4}" class="gt end">${res.rally ? 'ステージ' : '周回'} →</text></svg>`;
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
