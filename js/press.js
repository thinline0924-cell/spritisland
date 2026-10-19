// 新聞と評判。レースの後の囲み取材と結果から記事を作り、評判(G.press)とチームの信頼(G.season.trust)を動かす。
// 評判はシーズン末のオファーに、信頼は今のチームとの残留に効く。
const PAPERS = {
  hot: { name: '日刊グリッド', en: 'DAILY GRID' },
  mid: { name: '週刊モータースポーツ', en: 'MOTORSPORT WEEKLY' },
  low: { name: '夕刊スピード', en: 'EVENING SPEED' },
};

const INTERVIEW = [
  { key: 'humble', label: '謙虚に答える', desc: 'チームへの感謝を口にする。信頼が上がる。' },
  { key: 'bold', label: '強気に答える', desc: '結果が良ければ記事が大きくなる。悪ければ叩かれる。' },
  { key: 'blame', label: 'チームを批判する', desc: '記事としては目立つ。チームの信頼は大きく下がる。' },
];

function pressLevel(v) {
  return v >= 25 ? '大人気' : v >= 10 ? '好評' : v > -10 ? 'ふつう' : v > -25 ? '不評' : '酷評';
}
function pressInit() {
  if (G.press == null) G.press = 0;
  if (!G.news) G.news = [];
  if (G.season && G.season.trust == null) { G.season.trust = 50; G.season.rumors = []; G.season.flags = {}; }
}
function pushNews(a) {
  G.news.unshift(a);
  if (G.news.length > 40) G.news.length = 40;
}

// レース結果から見出しの材料を拾う
function raceFacts(res) {
  const S = G.season, s = curSeries(), wk = G.weekend;
  const me = res.classification.find(r => r.id === 'P');
  const mateE = S.entries.find(e => e.isMate);
  const mate = mateE ? res.classification.find(r => r.id === mateE.id) : null;
  const winsThisSeason = S.results.filter(r => r.me.pos === 1 && !r.me.dnf).length;
  return {
    n: G.driver.name, team: S.team, series: s.name, round: S.round + 1, year: S.year, track: eventName(s.id, S.round),
    pos: me.pos, grid: me.grid || 0, dnf: me.dnf, reason: me.reason, pts: me.points, gap: me.gap, target: S.target,
    over: me.overtakes || 0, mis: me.mistakes || 0, stageWins: me.stageWins || 0, superRally: !!me.superRally,
    wet: !!res.wetRace, pole: !!(wk.qual && wk.qual.order[0].id === 'P'), rally: !!res.rally,
    firstWin: !me.dnf && me.pos === 1 && G.totals.wins === 1, winsThisSeason,
    mate: mate ? { name: mateE.name, pos: mate.pos, dnf: mate.dnf } : null,
    winner: entryName(res.classification[0].id), field: res.classification.length,
  };
}

function pickStory(f) {
  const n = f.n;
  if (f.dnf && /クラッシュ|コースアウト/.test(f.reason)) return { tag: 'crash', score: -6, head: `${n}、痛恨のクラッシュ`, line: `${f.reason}でレースを終えた。チャンスがあっただけに、悔やまれる一戦になった。` };
  if (f.dnf) return { tag: 'mech', score: -1, head: `${n}のマシンが沈黙`, line: `${f.reason}のトラブルでリタイア。本人の走りに落ち度はなく、同情の声も上がっている。` };
  if (f.firstWin) return { tag: 'first', score: 12, head: `${n}、ついに初優勝`, line: `${f.grid ? `${f.grid}番手から` : ''}ついにトップでチェッカーを受けた。表彰台の真ん中で、${n}は何度も拳を突き上げた。` };
  if (f.pos === 1 && f.pole && !f.rally) return { tag: 'polewin', score: 9, head: `ポール・トゥ・ウィン ${n}が完勝`, line: '予選から決勝まで、誰も前に出させなかった。文句のつけようがない週末だった。' };
  if (f.pos === 1) return { tag: 'win', score: 8, head: `${n}が${f.track}を制す`, line: `今季${f.winsThisSeason}勝目。${f.rally ? `ステージ優勝${f.stageWins}回の速さで、ライバルを振り切った。` : 'レース運びの巧さが光った。'}` };
  if (!f.rally && f.grid - f.pos >= 6) return { tag: 'comeback', score: 5, head: `${f.grid}番手から${f.pos}位 ${n}の猛追`, line: `後方スタートから${f.grid - f.pos}台を抜き去る追い上げ。スタンドが何度も沸いた。` };
  if (f.wet && f.pos <= Math.max(3, f.target)) return { tag: 'rain', score: 5, head: `雨を味方に ${n}が${f.pos}位`, line: '路面が濡れると、周りが苦しむなかでひとり速かった。雨の強さは本物だ。' };
  if (f.pos <= 3) return { tag: 'podium', score: 4, head: `${n}、${f.pos}位表彰台`, line: `${f.winner}には届かなかったが、${f.pts}点を手にした。` };
  if (f.over >= 5) return { tag: 'show', score: 3, head: `抜いて抜いて${f.over}台 ${n}のオーバーテイク・ショー`, line: `${f.pos}位という結果以上に、攻める走りが印象に残った。` };
  if (f.mis >= 2) return { tag: 'mistakes', score: -3, head: `ミス連発 ${n}に試練`, line: `${f.mis}度のミスで順位を落とし、${f.pos}位。本来の速さを結果につなげられなかった。` };
  if (f.pos <= f.target) return { tag: 'solid', score: 1.5, head: `${n}、${f.pos}位で手堅く${f.pts}点`, line: 'チームの目標どおりの仕事をこなした。派手さはないが、評価は着実に上がっている。' };
  if (f.pos > f.target + 4) return { tag: 'poor', score: -4, head: `${n}、まさかの${f.pos}位 精彩欠く`, line: `チームが期待する${f.target}位以内には遠く及ばなかった。週末を通して流れをつかめなかった。` };
  return { tag: 'quiet', score: -1, head: `${n}は${f.pos}位 見せ場なく`, line: '中団に埋もれたまま、静かにレースを終えた。' };
}

const QUOTES = {
  humble: { good: ['チームが最高の車を用意してくれた。みんなの結果です', '支えてくれた全員に感謝したい'], bad: ['今日は自分の力不足。次で取り返します', 'チームに申し訳ない。もっと良くなれる'] },
  bold: { good: ['今日の走りなら誰にも負けない。タイトルも見えている', '当然の結果だ。まだ上に行ける'], bad: ['結果は悪いが、速さは見せた。次は勝つ', '今日は運がなかっただけ。誰が一番速いかは分かっている'] },
  blame: { good: ['勝てたのは自分の走りのおかげだ。作戦は正直、疑問だった', '車がもう少し良ければ、もっと差をつけられた'], bad: ['ピットの判断がおかしかった。車も遅い', 'これで自分を責めろと言われても困る。問題は別のところにある'] },
};

// 囲み取材の答えを受けて、記事を作る
function giveInterview(i) {
  pressInit();
  const wk = G.weekend;
  if (!wk || wk.article || !wk.result) return;
  const ans = INTERVIEW[i] || INTERVIEW[0];
  const f = raceFacts(wk.result);
  const st = pickStory(f);
  const good = st.score > 0;
  let score = st.score, trust = 0;
  if (ans.key === 'humble') { score += 0.5; trust += 4; }
  if (ans.key === 'bold') score += good ? 2.5 : -2;
  if (ans.key === 'blame') { score += good ? 1 : -1; trust -= 12; }
  if (f.mate && !f.dnf) {
    if (f.mate.dnf || f.mate.pos > f.pos) { score += 1; trust += 2; } else { score -= 1; trust -= 2; }
  }
  if (!f.dnf && f.pos <= f.target) trust += 3;
  if (!f.dnf && f.pos > f.target + 4) trust -= 4;
  const tier = curSeries().tier;
  score *= 0.7 + tier * 0.15; // 上のクラスほど注目される
  G.press = U.clamp(G.press * 0.85 + score, -50, 50);
  G.season.trust = U.clamp(G.season.trust + trust, 0, 100);

  const quote = U.pick(QUOTES[ans.key][good ? 'good' : 'bad']);
  const lede = `${f.year}年 ${f.series} 第${f.round}戦 ${f.track}。${f.team}の${f.n}は${f.rally ? '' : `${f.grid}番手からスタートし、`}${f.dnf ? 'ゴールまで届かなかった' : `${f.pos}位でフィニッシュした`}。`;
  let after = '';
  if (ans.key === 'blame') after = `この発言に、${f.team}の関係者は表情を曇らせた。`;
  else if (f.mate && !f.dnf) after = f.mate.dnf || f.mate.pos > f.pos ? `チームメイトの${f.mate.name}${f.mate.dnf ? 'はリタイア' : `は${f.mate.pos}位`}。チーム内の勝負は${f.n}に軍配が上がった。` : `チームメイトの${f.mate.name}は${f.mate.pos}位。チーム内の比較では後れを取った。`;
  const paper = score >= 5 ? PAPERS.hot : score <= -3 ? PAPERS.low : PAPERS.mid;
  const a = { kind: 'race', year: f.year, round: f.round, paper: paper.name, paperEn: paper.en, head: st.head,
    body: [lede, st.line, `「${quote}」と${f.n}は語った。${after}`], press: Math.round(score * 10) / 10, trust, tag: st.tag, answer: ans.label };
  wk.article = a;
  pushNews(a);
  saveGame();
}

// レースとレースの間:うわさ記事と、立場の危機の記事
function pressBetweenRounds() {
  pressInit();
  const S = G.season, s = curSeries(), n = G.driver.name;
  if (!S.flags.rumor && G.press >= 15 && S.round >= 2) {
    const cands = SERIES.filter(x => x.tier >= s.tier && x.tier <= s.tier + 1 && x.id !== 'kart' && x.minRep <= G.driver.rep + 18);
    const pool = [];
    for (const x of cands) for (const t of teamsOf(x.id)) if (t.id !== S.teamId && (x.tier > s.tier || t.perf > (teamsOf(s.id).find(y => y.id === S.teamId) || {}).perf)) pool.push({ x, t });
    if (pool.length) {
      pool.sort((a, b) => b.x.tier - a.x.tier || b.t.perf - a.t.perf);
      const { x, t } = U.pick(pool.slice(0, 4));
      S.flags.rumor = true;
      S.rumors.push({ sid: x.id, teamId: t.id });
      pushNews({ kind: 'rumor', year: S.year, round: S.round, paper: PAPERS.hot.name, paperEn: PAPERS.hot.en,
        head: `${t.name}、${n}の獲得に興味`, body: [`関係者によると、${x.name}の${t.name}が来季に向けて${n}の起用を検討しているという。`, `最近の活躍ぶりが、首脳陣の目に留まったようだ。${S.team}は「契約の話をするには早い」とコメントした。`],
        press: 0, trust: -3 });
      S.trust = U.clamp(S.trust - 3, 0, 100);
    }
  }
  if (!S.flags.risk && (G.press <= -12 || S.trust <= 30) && S.round >= 2) {
    S.flags.risk = true;
    pushNews({ kind: 'risk', year: S.year, round: S.round, paper: PAPERS.low.name, paperEn: PAPERS.low.en,
      head: `${S.team}、${n}の起用を再検討か`, body: [`${S.team}の内部で、${n}の来季の起用に疑問の声が出ているという。`, `${S.trust <= 30 ? 'チームとの関係はぎくしゃくしたまま。' : '結果が伴わず、批判の記事も増えてきた。'}残りのレースが正念場になる。`],
      press: -3, trust: 0 });
    G.press = U.clamp(G.press - 3, -50, 50);
  }
}

// シーズン総括の記事
function seasonReview(pos) {
  pressInit();
  const S = G.season, s = curSeries(), n = G.driver.name, e = G.seasonEnd;
  const champ = pos === 1, good = pos <= S.target;
  const score = (champ ? 10 : good ? 3 : -3) * (0.7 + s.tier * 0.15);
  G.press = U.clamp(G.press + score, -50, 50);
  const head = champ ? `${n}、${s.name}王者に` : good ? `${n}の${S.year}年 シリーズ${pos}位で目標クリア` : `${n}、苦しんだ${S.year}年 シリーズ${pos}位`;
  const body = [
    `${S.year}年の${s.name}が幕を閉じた。${S.team}の${n}は${e.pts}点、${e.wins}勝、表彰台${e.pods}回でシリーズ${pos}位。`,
    champ ? '最後まで主導権を渡さず、堂々のタイトル獲得となった。' : good ? `チームの目標だった${S.target}位以内を果たし、来季に向けて株を上げた。` : `目標の${S.target}位には届かず、来季の去就に注目が集まる。`,
    `評判は「${pressLevel(G.press)}」。${S.rumors.length ? '他チームからの関心も伝えられている。' : ''}`,
  ];
  const paper = champ ? PAPERS.hot : good ? PAPERS.mid : PAPERS.low;
  const a = { kind: 'season', year: S.year, round: S.round, paper: paper.name, paperEn: paper.en, head, body, press: Math.round(score * 10) / 10, trust: 0 };
  pushNews(a);
  return a;
}

// 契約で使う「実際の評価」:実力の評価に、新聞の評判を足す
function effectiveRep() { return U.clamp(G.driver.rep + (G.press || 0) * 0.2, 0, 100); }
