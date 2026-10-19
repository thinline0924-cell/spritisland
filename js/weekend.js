// 週末の画面:セットアップ → 予選 → 作戦
function forecastBlock(wk, s) {
  if (s.kind === 'rally') {
    return `<div class="fc">${wk.ev.forecast.map((p, i) => `<div class="fc-c"><span>ループ${i + 1}</span><span class="fc-bar"><i style="height:${p}%"></i></span><b>${p}%</b></div>`).join('')}</div>`;
  }
  const f = wk.weather.forecast;
  const parts = s.kind === 'endurance' ? ['序盤', '前半', '後半', '終盤'] : ['序盤', '前半', '後半', '終盤'];
  return `<div class="fc"><div class="fc-c q"><span>予選</span><span class="fc-bar"><i style="height:${f.qual}%"></i></span><b>${f.qual}%</b></div>
    ${f.parts.map((p, i) => `<div class="fc-c"><span>${parts[i]}</span><span class="fc-bar"><i style="height:${p}%"></i></span><b>${p}%</b></div>`).join('')}</div>
    <p class="note">降水確率。予報は外れることもある。</p>`;
}

function weekendHead(s, v, step) {
  const S = G.season;
  const steps = s.kind === 'rally' ? ['セットアップ', 'ステージ計画', 'ラリー'] : ['セットアップ・予選', '決勝の作戦', '決勝'];
  return `<section class="hero slim">
    <div class="hero-l"><span class="kicker">ROUND ${S.round + 1} — ${U.esc(s.en)}</span><h2>${U.esc(eventName(s.id, S.round))}</h2></div>
    <ol class="steps">${steps.map((x, i) => `<li class="${i === step ? 'on' : i < step ? 'done' : ''}"><span>${i + 1}</span>${x}</li>`).join('')}</ol>
  </section>`;
}

function setupScreen() {
  const S = G.season, s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  const rally = s.kind === 'rally';
  const su = wk.setup;
  const controls = rally
    ? `<div class="ctrl"><span class="ctrl-l">サスペンション</span>${seg('setup.susp', su.susp, [[0, '柔らかい'], [1, '中間'], [2, '硬い']])}</div>
       <div class="ctrl"><span class="ctrl-l">ギア比</span>${seg('setup.gear', su.gear, [[0, '短い'], [1, '中間'], [2, '長い']])}</div>`
    : `<div class="ctrl"><span class="ctrl-l">リアウイング</span>${seg('setup.wing', su.wing, [[1, '1', '寝かせる'], [2, '2'], [3, '3'], [4, '4'], [5, '5', '立てる']])}</div>
       <div class="ctrl"><span class="ctrl-l">サスペンション</span>${seg('setup.susp', su.susp, [[0, '柔らかい'], [1, '中間'], [2, '硬い']])}</div>`;
  const laps = wk.runs.filter(r => r.lap != null).map(r => r.lap);
  const best = !rally && laps.length ? Math.min(...laps) : null;
  const runs = wk.runs.length ? `<table class="tbl runs"><thead><tr><th class="n">回</th><th>設定</th><th class="n">${rally ? '感触' : 'タイム'}</th><th>ドライバーの声</th></tr></thead><tbody>
    ${wk.runs.map((r, i) => `<tr><td class="n">${i + 1}</td>
      <td class="nowrap">${rally ? `足${['柔', '中', '硬'][r.setup.susp]}・ギア${['短', '中', '長'][r.setup.gear]}` : `W${r.setup.wing}・足${['柔', '中', '硬'][r.setup.susp]}`}</td>
      <td class="n b">${r.auto ? '—' : rally ? (r.delta < 0.6 ? '良い' : r.delta < 1.2 ? 'まあまあ' : '悪い') : U.fmtLap(r.lap) + (r.lap === best ? ' ◆' : '')}</td>
      <td class="voice">${r.notes.map(n => `「${n}」`).join('<br>')}</td></tr>`).join('')}</tbody></table>`
    : `<p class="note">まだ走っていない。設定を選んで走らせると、ドライバーが感想を返してくる。</p>`;
  const qual = rally ? `${head('02', 'SHAKEDOWN', '本番前の走り方')}
      ${choiceList('shakedown', wk.shakedown, [
        ['push', 'しっかり走り込む', 'セットアップの迷いが半分になる。'],
        ['careful', '軽く確認するだけ', '本番でのミスが少し減る。'],
      ])}
      <button class="btn primary wide" data-act="toplan">ステージ計画へ</button>`
    : `${head('02', 'QUALIFYING', '予選の走り方')}
      ${choiceList('qApproach', wk.qApproach, Object.entries(QUAL_APPROACH).filter(([k]) => s.id !== 'kart' || k !== 'save').map(([k, a]) => [k, a.name, a.desc]))}
      <button class="btn primary wide" data-act="qualify">予選へ送り出す</button>`;
  return `${weekendHead(s, v, 0)}
  <div class="grid2 wide-r">
    <section class="panel">
      ${head('00', 'BRIEFING', rally ? 'ラリーの概要' : 'コースと天気')}
      ${venueBlock(s, v)}
      ${rally ? `<p class="sub-label">ステージ ${wk.ev.stages.length}本・合計${wk.ev.totalKm}km</p>` : `<p class="sub-label">${s.kind === 'endurance' ? `${ENDU_HOURS[S.round] || 6}時間` : `${s.laps}周`}${s.pits ? '' : '・ピット無し'}</p>`}
      <p class="sub-label">天気予報</p>
      ${forecastBlock(wk, s)}
    </section>
    <section class="panel">
      ${head('01', rally ? 'SETUP' : 'PRACTICE', rally ? 'セットアップとシェイクダウン' : 'フリー走行とセットアップ')}
      ${controls}
      ${(wk.notes || []).map(n => `<p class="warn sky">${U.esc(n)}</p>`).join('')}
      <div class="btn-row">
        <button class="btn" data-act="practice" ${wk.runsLeft <= 0 ? 'disabled' : ''}>この設定で走ってみる(残り${wk.runsLeft}回)</button>
        <button class="btn ghost" data-act="autosetup" ${wk.runsLeft <= 0 ? 'disabled' : ''}>エンジニアにおまかせ</button>
      </div>
      ${runs}
      ${qual}
    </section>
  </div>`;
}

// ---- 作戦 ----
function normPlan(plan, s) {
  if (!plan.stops) return;
  plan.stops.forEach(x => x.lap = U.clamp(Math.round(x.lap) || 2, 2, s.laps - 1));
  plan.stops.sort((a, b) => a.lap - b.lap);
  const n = plan.stops.length + 1;
  while (plan.styles.length < n) plan.styles.push('normal');
  plan.styles.length = n;
}

function stratLabel(o) {
  const seq = [o.start, ...o.stops.map(x => x.tyre)];
  return `<span class="seq">${seq.map(tyreChip).join('<i>→</i>')}</span>` + (o.stops.length ? `<small class="muted laps">${o.stops.map(x => x.lap + '周目').join('・')}</small>` : '');
}

function qualBlock(wk) {
  const ord = wk.qual.order;
  const meI = ord.findIndex(r => r.id === 'P');
  const name = id => G.season.entries.find(e => e.id === id).name;
  const show = ord.map((r, i) => ({ r, i })).filter(({ i }) => i < 6 || Math.abs(i - meI) <= 1);
  let last = -1;
  const rows = show.map(({ r, i }) => {
    const gapRow = i - last > 1 ? `<tr class="gaprow"><td colspan="3">…</td></tr>` : '';
    last = i;
    return gapRow + `<tr class="${r.id === 'P' ? 'me' : ''}"><td class="n">${i + 1}</td><td>${U.esc(name(r.id))}${r.mistake ? ' <span class="tag">ミス</span>' : ''}</td><td class="n">${i === 0 ? U.fmtLap(r.time) : '+' + r.gap.toFixed(3)}</td></tr>`;
  }).join('');
  const me = ord[meI];
  const gp = wk.grid ? wk.grid.indexOf('P') + 1 : meI + 1;
  return `<p class="qual-big"><b>P${meI + 1}</b><span>${meI === 0 ? 'ポールポジション。' : `トップと${me.gap.toFixed(3)}秒差。`}${me.mistake ? 'アタック中にミスがあった。' : ''}${wk.qual.wet > 0.05 ? '(ウェット予選)' : ''}${gp !== meI + 1 ? `<br>ペナルティで${gp}番グリッドから。` : ''}</span></p>
    <table class="tbl">${rows}</table>`;
}

function planScreen() {
  const S = G.season, s = curSeries(), wk = G.weekend, v = venueOf(s.id, wk.vid);
  if (s.kind === 'rally') return rallyPlanScreen(s, v, wk);
  const p = wk.plan;
  let strat = '';
  const radioNote = `<div class="radio-note"><b>RADIO</b><span>雨、セーフティカー、タイヤの限界、バトル、終盤。レース中の大事な場面では、無線で指示を出せる。</span></div>`;
  const rainOpts = [
    ['early', '早めに替える', '路面が変わり始めたらすぐピットへ。外れると無駄なピットになる。'],
    ['react', '様子を見て替える', 'はっきり変わってから1周後に入る。いちばん無難。'],
    ['gamble', '賭けて粘る', 'ぎりぎりまで今のタイヤで走る。当たれば大きく順位が上がる。'],
  ];
  if (s.kind === 'endurance') {
    strat = `${head('02', 'STINTS', '耐久の作戦')}
      <p class="note">${s.laps / s.fuelStint}スティント。燃料補給は${s.fuelStint}周ごとに必ず入る。タイヤ交換は1回${s.tyreTime}秒。</p>
      <div class="ctrl"><span class="ctrl-l">タイヤ</span>${seg('plan.start', p.start, s.dry.map(c => [c, TYRES[c].name]))}</div>
      <div class="ctrl"><span class="ctrl-l">交換の頻度</span>${seg('plan.tyres', p.tyres, [['every', '毎回替える'], ['double', '2スティント使う']])}</div>
      <p class="note">タイヤの寿命の目安:${s.dry.map(c => `${TYRES[c].name} 約${Math.round(tyreLife(s, v, c, 'normal', G.driver.stats.tyre) / (wk.engNoise || 1))}周`).join('/')}</p>
      <div class="ctrl"><span class="ctrl-l">あなたの担当</span>${seg('plan.share', p.share, [['less', '2スティント'], ['even', '3スティント'], ['more', '4スティント', '連続あり']])}</div>
      <div class="ctrl"><span class="ctrl-l">マシンの扱い</span>${seg('plan.care', p.care, Object.entries(STYLES).map(([k, x]) => [k, x.name]))}</div>
      <p class="note">攻めるほど速いが、故障しやすくなる。連続スティントでは疲れでミスが増える。チームメイト:${S.entries.find(e => e.isPlayer).crew.slice(1).map(d => U.esc(d.name)).join('、')}</p>
      ${radioNote}`;
  } else if (!s.pits) {
    strat = `${head('02', 'RACE', '決勝の走り方')}
      <p class="note">ピットは無い。タイヤは最後まで同じもの。雨が降ってもそのまま走るしかない。</p>
      <div class="ctrl"><span class="ctrl-l">走り方</span>${seg('plan.styles.0', p.styles[0], Object.entries(STYLES).map(([k, x]) => [k, x.name]))}</div>
      <p class="note">攻めると速いがタイヤが減りやすく、ミスも増える。労わると遅いが終盤まで粘れる。</p>
      ${radioNote}`;
  } else {
    const opts = estimateStrategies(s, v, { tyre: G.driver.stats.tyre, startAge: wk.qApproach === 'save' ? 0 : 3, noise: wk.engNoise || 1 });
    App.opts = opts;
    const lives = s.dry.map(c => `${tyreChip(c)} 約${Math.round(tyreLife(s, v, c, 'normal', G.driver.stats.tyre) / (wk.engNoise || 1))}周`).join(' ');
    const seq = [p.start, ...p.stops.map(x => x.tyre)];
    const warn = s.twoCompounds && new Set(seq).size < 2 ? `<p class="warn">ドライでは2種類のタイヤを使う決まりがある。このままだと20秒加算。</p>` : '';
    const stint = (i) => {
      const a = i === 0 ? 1 : p.stops[i - 1].lap + 1, b = i < p.stops.length ? p.stops[i].lap : s.laps;
      return `${a}〜${b}周`;
    };
    strat = `${head('02', 'STRATEGY', '決勝の作戦')}
      <p class="sub-label">エンジニアの試算(ドライの場合)</p>
      <table class="tbl opts">${opts.slice(0, 4).map((o, i) => `<tr><td class="nowrap">${o.stops.length}ストップ</td><td>${stratLabel(o)}</td><td class="n">${i === 0 ? '最速' : '+' + o.delta.toFixed(1) + '秒'}</td><td class="n"><button class="mini" data-act="useopt" data-arg="${i}">使う</button></td></tr>`).join('')}</table>
      <p class="note">タイヤ寿命の目安:${lives}。あくまで見積もりで、実際は少しずれる。</p>
      <div class="plan">
        <div class="plan-row"><span class="pr-l">スタート</span>${seg('plan.start', p.start, s.dry.map(c => [c, TYRES[c].name]))}</div>
        <div class="plan-row"><span class="pr-l">${stint(0)}</span>${seg('plan.styles.0', p.styles[0], Object.entries(STYLES).map(([k, x]) => [k, x.name]), 'sm')}</div>
        ${p.stops.map((x, i) => `
          <div class="plan-row pit"><span class="pr-l">ピット${i + 1}</span>
            <label class="lap-in"><input type="number" min="2" max="${s.laps - 1}" value="${x.lap}" data-path="plan.stops.${i}.lap">周目</label>
            ${seg(`plan.stops.${i}.tyre`, x.tyre, s.dry.map(c => [c, TYRES[c].name]))}
            <button class="mini x" data-act="delstop" data-arg="${i}" aria-label="このピットを消す">×</button></div>
          <div class="plan-row"><span class="pr-l">${stint(i + 1)}</span>${seg(`plan.styles.${i + 1}`, p.styles[i + 1], Object.entries(STYLES).map(([k, x]) => [k, x.name]), 'sm')}</div>`).join('')}
        ${p.stops.length < 3 ? `<button class="mini add" data-act="addstop">+ ピットを足す</button>` : ''}
      </div>
      ${warn}
      ${radioNote}`;
  }
  return `${weekendHead(s, v, 1)}
  <div class="grid2 wide-r">
    <section class="panel">
      ${head('01', 'QUALIFYING', '予選結果')}
      ${qualBlock(wk)}
      <p class="sub-label">決勝の天気予報</p>
      ${forecastBlock(wk, s)}
    </section>
    <section class="panel">
      ${strat}
      <button class="btn primary wide go" data-act="race">送り出す</button>
    </section>
  </div>`;
}

function defaultRallyPlan(s, v, wk) {
  const loops = [];
  for (let l = 0; l < s.loops; l++) {
    let tyre = RALLY_TYRES[v.surface][0][0];
    if (v.surface === 'gravel' && v.rough * (0.4 + v.heat) > 0.45) tyre = 'hard';
    if (v.surface === 'tarmac' && wk.ev.forecast[l] >= 60) tyre = 'wet';
    loops.push({ tyre, spares: 1, pace: 'normal' });
  }
  return { loops };
}

function rallyPlanScreen(s, v, wk) {
  const S = G.season;
  const p = wk.plan;
  const order = S.round === 0 ? null : standings().findIndex(x => x.e.isPlayer) + 1;
  const sweep = v.surface === 'gravel'
    ? (order ? `選手権${order}位のあなたは、ループ1を${order}番目に走る。${order <= 5 ? '前を走るほど浮き砂利を掃く役になり、少し遅くなる。' : '後ろの方なので、道はきれいになっている。'}` : '開幕戦の出走順は抽選。')
    : '舗装路なので出走順の影響は無い。';
  const loops = p.loops.map((lp, l) => {
    const st = wk.ev.stages.filter(x => x.loop === l);
    return `<div class="loop">
      <div class="loop-h"><b>ループ${l + 1}</b><span>SS${st[0].no}〜${st[st.length - 1].no}・${Math.round(st.reduce((a, x) => a + x.km, 0) * 10) / 10}km・降水${wk.ev.forecast[l]}%</span></div>
      <ul class="stages">${st.map(x => `<li><span>SS${x.no}</span>${U.esc(x.name)}<em>${x.km}km</em></li>`).join('')}</ul>
      <div class="ctrl"><span class="ctrl-l">タイヤ</span>${seg(`plan.loops.${l}.tyre`, lp.tyre, RALLY_TYRES[v.surface])}</div>
      <div class="ctrl"><span class="ctrl-l">スペア</span>${seg(`plan.loops.${l}.spares`, lp.spares, [[1, '1本'], [2, '2本', '少し重い']])}</div>
      <div class="ctrl"><span class="ctrl-l">攻め方</span>${seg(`plan.loops.${l}.pace`, lp.pace, Object.entries(RALLY_PACE).map(([k, x]) => [k, x.name]))}</div>
    </div>`;
  }).join('');
  const tips = v.surface === 'gravel' ? 'ソフトは速いが、荒れた路面や暑い日はループ後半で急に減る。パンクもしやすい。'
    : v.surface === 'tarmac' ? '濡れた舗装にドライタイヤは厳しい。乾いた路面でウェットを履くと遅いうえに減る。'
      : '雪と氷にはスパイクタイヤ一択。勝負は攻め方とスペアの本数。';
  return `${weekendHead(s, v, 1)}
  <div class="grid2 wide-r">
    <section class="panel">
      ${head('00', 'BRIEFING', 'ラリーの概要')}
      ${venueBlock(s, v)}
      <p class="note">${sweep}</p>
      <p class="note">${tips}</p>
      <p class="sub-label">天気予報</p>
      ${forecastBlock(wk, s)}
    </section>
    <section class="panel">
      ${head('01', 'LOOPS', 'ループごとの計画')}
      <p class="note">ループの間にサービスパークがあり、修理とタイヤ交換ができる。</p>
      <div class="radio-note"><b>RADIO</b><span>サービスパークでは次のループの攻め方を変えられる。パンクしたときは、止まって替えるか走り切るかを決める。</span></div>
      <div class="loops">${loops}</div>
      <button class="btn primary wide go" data-act="race">送り出す</button>
    </section>
  </div>`;
}
