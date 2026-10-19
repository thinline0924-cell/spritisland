// 画面の共通部品と、画面の切り替え
const App = { el: null, play: null, help: false };
const $ = sel => document.querySelector(sel);

function head(no, en, ja, extra = '') {
  return `<div class="sec-head"><span class="sec-no">${no}</span><span class="sec-en">${en}</span><span class="sec-ja">${ja}</span>${extra}</div>`;
}
function seg(path, cur, opts, cls = '') {
  return `<div class="seg ${cls}" role="radiogroup">${opts.map(([v, label, sub]) =>
    `<button type="button" role="radio" aria-checked="${String(v) === String(cur)}" class="${String(v) === String(cur) ? 'on' : ''}" data-act="set" data-path="${path}" data-val="${v}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>`;
}
function choiceList(path, cur, opts) {
  return `<div class="choices">${opts.map(([v, label, desc]) =>
    `<button type="button" class="choice ${v === cur ? 'on' : ''}" data-act="set" data-path="${path}" data-val="${v}"><span class="c-mark"></span><span class="c-t">${label}</span><span class="c-d">${desc}</span></button>`).join('')}</div>`;
}
function tyreChip(c) { return `<span class="tyre t-${c}" title="${TYRES[c] ? TYRES[c].name : c}">${c}</span>`; }
function wxText(w) { return w < 0.05 ? 'ドライ' : w < 0.25 ? '湿った路面' : w < 0.55 ? 'ウェット' : '大雨'; }
function tierLabel(s) { return ['ENTRY', 'TIER 1', 'TIER 2', 'TIER 3', 'TOP'][s.tier]; }

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  const last = ks[ks.length - 1];
  const prev = o[last];
  if (typeof prev === 'number') val = Number(val);
  o[last] = val;
}

function topbar() {
  let ctx = '';
  if (G && G.season && !G.retired) {
    const s = curSeries();
    ctx = `<span>${G.season.year}</span><span>${U.esc(s.en)}</span><span class="hide-s">${U.esc(G.season.team)}</span>`;
  }
  return `<header class="topbar">
    <button class="logo" data-act="home" aria-label="パドックへ">PIT<b>WALL</b></button>
    <div class="ctx">${ctx}</div>
    <button class="tb-btn" data-act="help">遊び方</button>
  </header>`;
}

function render() {
  if (App.play) { clearTimeout(App.play.timer); clearTimeout(App.play.callTimer); cancelAnimationFrame(App.play.raf); }
  let body;
  if (!G) body = App.newForm ? newCareerScreen() : titleScreen();
  else if (G.retired) body = careerEndScreen();
  else if (G.offers) body = offersScreen();
  else if (G.weekend) {
    const st = G.weekend.stage;
    if (App.race && App.play) body = raceScreen();
    else if (st === 'setup') body = setupScreen();
    else if (st === 'plan') body = planScreen();
    else body = resultScreen();
  } else body = hubScreen();
  App.el.innerHTML = (G || App.newForm ? topbar() : '') + `<main class="main">${body}</main>` + (App.help ? helpOverlay() : '') + (App.ask ? askOverlay() : '');
  if (App.race && App.play && document.getElementById('lv-tower')) startPlayback();
}

// ---- 表紙 ----
function titleScreen() {
  const has = !!loadGame();
  return `<section class="title">
    ${titleArt()}
    <h1 class="title-logo">PIT WALL</h1>
    <p class="title-sub">レーシングドライバー・キャリア</p>
    <p class="title-lead">走るのはあなたではなく、あなたが決めた作戦。<br>セットアップを詰め、タイヤと天気を読み、ピットの壁から送り出す。</p>
    <div class="title-btns">
      ${has ? `<button class="btn primary" data-act="continue">続きから</button>` : ''}
      <button class="btn ${has ? '' : 'primary'}" data-act="newform">新しくキャリアを始める</button>
      <button class="btn ghost" data-act="help">遊び方</button>
    </div>
  </section>`;
}

function newCareerScreen() {
  const f = App.newForm;
  return `<section class="panel narrow">
    ${head('01', 'DRIVER', 'ドライバー登録')}
    <label class="field"><span>名前</span><input id="f-name" maxlength="14" value="${U.esc(f.name)}" autocomplete="off"></label>
    <label class="field"><span>カーナンバー(2〜99)</span><input id="f-num" type="number" min="2" max="99" value="${f.number}"></label>
    <div class="field"><span>持ち味</span>
      ${choiceList('strength', f.strength, [
        ['pace', '速さ', '一発の速さがある。予選に強い。'],
        ['cons', '安定感', 'ミスが少ない。長いレースで効いてくる。'],
        ['tyre', 'タイヤの扱い', 'タイヤを長持ちさせる。作戦の幅が広がる。'],
        ['wet', '雨', '濡れた路面でも速い。荒れた天気が味方になる。'],
        ['craft', 'バトル', '抜くのも抜かせないのも上手い。'],
      ])}
    </div>
    <div class="row-end"><button class="btn ghost" data-act="cancelnew">戻る</button><button class="btn primary" data-act="create">17歳、最初の契約へ</button></div>
  </section>`;
}

// ---- パドック(シーズンの拠点) ----
function venueBlock(s, v) {
  if (s.kind === 'rally') {
    return `${rallySVG(v)}
      <dl class="facts">
        <div><dt>路面</dt><dd>${SURFACE_NAME[v.surface]}</dd></div>
        <div><dt>荒れ</dt><dd>${meterHTML(v.rough, '滑らか', '荒れている')}</dd></div>
        <div><dt>速さ</dt><dd>${meterHTML(RALLY_FAST[v.id], '曲がりくねる', '高速')}</dd></div>
        <div><dt>気温</dt><dd>${meterHTML(v.heat, '寒い', '暑い')}</dd></div>
        <div><dt>雨</dt><dd>${meterHTML(v.rain, '少ない', '多い')}</dd></div>
      </dl>`;
  }
  return `${trackSVG(v)}
    <dl class="facts">
      <div><dt>性格</dt><dd>${meterHTML(v.hs, 'テクニカル', '高速')}</dd></div>
      <div><dt>路面</dt><dd>${meterHTML(v.bump, '滑らか', 'バンピー')}</dd></div>
      <div><dt>タイヤ</dt><dd>${meterHTML((v.abr - 0.75) / 0.7, '優しい', '厳しい')}</dd></div>
      <div><dt>追い抜き</dt><dd>${meterHTML(v.pass, '難しい', '易しい')}</dd></div>
      <div><dt>雨</dt><dd>${meterHTML(v.rain / 0.6, '少ない', '多い')}</dd></div>
    </dl>`;
}

function standingsTable(limit = 99) {
  const tbl = standings();
  const meI = tbl.findIndex(x => x.e.isPlayer);
  const rows = tbl.map((x, i) => ({ x, i })).filter(({ i }) => i < limit || i === meI);
  return `<table class="tbl">
    <thead><tr><th class="n">#</th><th>${curSeries().kind === 'endurance' ? 'マシン' : 'ドライバー'}</th><th class="hide-s">チーム</th><th class="n">勝</th><th class="n">点</th></tr></thead>
    <tbody>${rows.map(({ x, i }) => `<tr class="${x.e.isPlayer ? 'me' : ''}">
      <td class="n">${i + 1}</td><td>${U.esc(x.e.name)}${x.e.isMate ? ' <span class="tag">TM</span>' : ''}</td>
      <td class="hide-s muted">${U.esc(teamOfEntry(x.e).name)}</td><td class="n">${x.wins || ''}</td><td class="n b">${x.pts}</td></tr>`).join('')}</tbody>
  </table>`;
}

function statsBlock() {
  const d = G.driver;
  const st = Object.entries(STAT_NAMES).map(([k, n]) => `<div class="stat"><span>${n}</span><span class="bar"><i style="width:${d.stats[k]}%"></i></span><b>${Math.round(d.stats[k])}</b></div>`).join('');
  const fam = Object.entries(DISC_NAME).map(([k, n]) => `<div class="stat sm"><span>${n}</span><span class="bar"><i style="width:${d.fam[k]}%"></i></span><b>${Math.round(d.fam[k])}</b></div>`).join('');
  return `<div class="driver-id"><span class="num">${d.number}</span><div><b>${U.esc(d.name)}</b><small>${d.age}歳・評価 ${Math.round(d.rep)}</small></div></div>
    <div class="stats">${st}</div>
    <p class="sub-label">分野ごとの経験</p><div class="stats">${fam}</div>`;
}

function hubScreen() {
  const S = G.season, s = curSeries();
  const v = venueOf(s.id, S.cal[S.round]);
  const t = teamsOf(s.id).find(x => x.id === S.teamId);
  const cal = S.cal.map((vid, i) => {
    const r = S.results.find(x => x.round === i);
    const res = r ? (r.me.dnf ? '<span class="dnf">DNF</span>' : `P${r.me.pos}`) : i === S.round ? '<span class="next">NEXT</span>' : '';
    return `<tr class="${i === S.round ? 'cur' : ''}"><td class="n">R${i + 1}</td><td>${U.esc(eventName(s.id, i))}</td><td class="n b">${res}</td><td class="n">${r ? r.me.points || '' : ''}</td></tr>`;
  }).join('');
  const pe = paddockEvent();
  const eventCard = pe ? `<section class="panel event">
      ${head('!', 'PADDOCK NEWS', 'レースの前に')}
      <h3 class="ev-t">${U.esc(pe.title)}</h3>
      <p class="ev-x">${U.esc(pe.text)}</p>
      <div class="ev-opts">${pe.options.map((o, i) => `<button type="button" class="ev-o" data-act="pevent" data-arg="${i}"><b>${U.esc(o.label)}</b><span>${U.esc(o.desc)}</span></button>`).join('')}</div>
    </section>` : '';
  return `<section class="hero">
      <div class="hero-l"><span class="kicker">${S.year} SEASON — ${tierLabel(s)}</span><h2>${U.esc(s.name)}</h2>
      <p>${U.esc(S.team)}・マシン ${grade(t.perf)}・信頼性 ${grade(t.rel)}・目標 シリーズ${S.target}位以内</p></div>
      <div class="hero-r"><span class="big">R${S.round + 1}</span><span class="of">/ ${S.cal.length}</span></div>
    </section>
    ${eventCard}
    <div class="grid2">
      <section class="panel">
        ${head('01', 'NEXT ROUND', '次の戦い')}
        <h3 class="venue">${U.esc(eventName(s.id, S.round))}<small>${v.en}</small></h3>
        ${venueBlock(s, v)}
        ${G.season.lastChoice && !pe ? `<p class="note">決めたこと:${U.esc(G.season.lastChoice)}</p>` : ''}
        <button class="btn primary wide" data-act="weekend" ${pe ? 'disabled' : ''}>${pe ? '先に上の出来事を決める' : '週末を始める'}</button>
      </section>
      <section class="panel">
        ${head('02', 'STANDINGS', 'シリーズ順位')}
        ${standingsTable()}
      </section>
    </div>
    <div class="grid2">
      <section class="panel">
        ${head('03', 'CALENDAR', '日程と結果')}
        <table class="tbl">${cal}</table>
        <p class="note">${U.esc(s.desc)}</p>
      </section>
      <section class="panel">
        ${head('04', 'DRIVER', 'ドライバー')}
        ${statsBlock()}
      </section>
    </div>
    <section class="panel press">
      ${head('05', 'PRESS', '新聞と評判')}
      <div class="press-grid">
        ${pressGauge()}
        <div class="clips">${(G.news || []).slice(0, 3).map(a => clippingHTML(a, 'small')).join('') || '<p class="note">まだ記事は出ていない。レースの結果しだいで、新聞が書き立てる。</p>'}</div>
      </div>
    </section>`;
}

function askOverlay() {
  const a = App.ask;
  return `<div class="overlay"><div class="sheet ask" role="alertdialog" aria-label="${U.esc(a.text)}">
    <p class="ask-t">${U.esc(a.text)}</p>
    <div class="row-end"><button class="btn ghost" data-act="askno">やめる</button><button class="btn primary" data-act="${a.act}">${U.esc(a.yes)}</button></div>
  </div></div>`;
}

// ---- 新聞 ----
function clippingHTML(a, size = 'big') {
  if (!a) return '';
  const eff = [];
  if (a.press) eff.push(`<span class="eff ${a.press < 0 ? 'neg' : ''}">評判 ${a.press > 0 ? '+' : ''}${a.press.toFixed(1)}</span>`);
  if (a.trust) eff.push(`<span class="eff ${a.trust < 0 ? 'neg' : ''}">チームの信頼 ${a.trust > 0 ? '+' : ''}${a.trust}</span>`);
  const kindTag = { rumor: '移籍のうわさ', risk: '立場の危機', season: 'シーズン総括' }[a.kind];
  return `<article class="clip ${size} k-${a.kind}">
    <header class="clip-mast"><b>${U.esc(a.paper)}</b><span>${U.esc(a.paperEn)}</span><span class="clip-date">${a.year}年 ${a.kind === 'season' ? '最終戦のあと' : `第${a.round}戦${a.kind === 'race' ? '' : 'のあと'}`}</span></header>
    ${kindTag ? `<span class="clip-kind">${kindTag}</span>` : ''}
    <h3 class="clip-head">${U.esc(a.head)}</h3>
    ${size === 'big' ? `<div class="clip-cols"><div class="clip-photo" aria-hidden="true"><span>${G.driver.number}</span></div>${a.body.map(p => `<p>${U.esc(p)}</p>`).join('')}</div>` : `<p class="clip-lede">${U.esc(a.body[0])}</p>`}
    ${eff.length ? `<footer class="clip-eff">${eff.join('')}</footer>` : ''}
  </article>`;
}
function pressGauge() {
  const v = G.press || 0, t = G.season ? (G.season.trust ?? 50) : 50;
  const p = (v + 50) / 100 * 100;
  return `<div class="press-g">
    <div class="pg-row"><span class="pg-l">評判</span><span class="pg-bar"><i style="left:${p.toFixed(1)}%"></i></span><b>${pressLevel(v)}</b></div>
    <div class="pg-scale"><span>酷評</span><span>ふつう</span><span>大人気</span></div>
    <div class="pg-row"><span class="pg-l">チームの信頼</span><span class="pg-bar t"><i style="left:${t}%"></i></span><b>${Math.round(t)}</b></div>
    <p class="note">評判は来季のオファーの数と質に、チームの信頼は残留できるかに効く。</p>
  </div>`;
}

function helpOverlay() {
  return `<div class="overlay" data-act="closehelp"><div class="sheet" data-stop>
    ${head('?', 'HOW TO PLAY', '遊び方')}
    <ol class="help">
      <li><b>週末の流れ</b>:フリー走行でセットアップを探る → 予選の走り方を決める → 決勝の作戦を立てて送り出す。レースは自動で進み、実況と順位の推移で結果が分かる。</li>
      <li><b>セットアップ</b>:フリー走行は3回まで。ドライバーの感想を手がかりに、ウイングと足回りをコースに合わせる。ずれているほど毎周遅くなり、ミスも増える。</li>
      <li><b>タイヤ</b>:ソフトは速いが早く終わる。ハードは遅いが長持ち。寿命を超えると急に遅くなる。2種類の使用義務があるクラスもある。</li>
      <li><b>ピットの壁からの指示</b>:レース中、雨・セーフティカー・タイヤの限界・バトル・終盤では無線で指示を出す。15秒で答えないと、おすすめの案になる。「最後まで任せる」でチームに任せることもできる。</li>
      <li><b>耐久</b>:3人で1台。燃料補給の周回は決まっている。タイヤを毎回替えるか2スティント使うか、自分が何スティント乗るかを決める。</li>
      <li><b>ラリー</b>:1台ずつステージのタイムを競う。ループごとにタイヤ、スペアの本数、攻め方を決める。途中で止まっても、最終ループ以外なら5分加算で再出走できる。</li>
      <li><b>新聞と評判</b>:レースのあとは記者の取材に答える。結果と答え方で新聞記事が出て、評判とチームの信頼が動く。評判が高いと上のチームからうわさが立ち、オファーが増える。チームを批判すると記事は目立つが、残留が難しくなる。</li>
      <li><b>レースの合間</b>:パドックでは出来事が起きる。選んだことが次の週末やドライバーに効いてくる。</li>
      <li><b>キャリア</b>:シーズンが終わると、成績と評価に応じてオファーが届く。チームの目標順位を上回ると評価が上がる。能力は走るたびに伸び、30代半ばから衰えていく。</li>
    </ol>
    <div class="row-end">${G ? '<button class="btn ghost" data-act="reset">最初からやり直す</button>' : ''}<button class="btn primary" data-act="closehelp">閉じる</button></div>
  </div></div>`;
}
