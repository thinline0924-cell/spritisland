// 出来事・事件の一覧と、その続き(何日もかけて進む話)

import { R, clamp, manYen, fill } from './util.js';
import { dateOf, fmtDate, companyOff, dayOfDate, daysInMonth } from './calendar.js';
import { log, later, say, talk, chat, board, news, P, byKey, active, atWork, onSite, runLines, stdVars, pickProduct, dmKey } from './out.js';
import { full, callName, remember, affect, stat, bossOf, deptMates, liked, disliked, titleShort } from './people.js';
import { rel, addTag, hasTag, makePerson, ROSTER } from './world.js';
import { addExpense, addSpecial, addNonop, borrow, creditScore, totalDebt, trailingOrd, shareOf, projectMonthEnd, activeClients } from './business.js';

// ---------- 小道具 ----------
const pickWhere = (arr, f) => { const c = arr.filter(f); return c.length ? R.pick(c) : null; };
const pickW = (arr, wf) => arr.length ? R.weighted(arr, wf) : null;
const D = w => dateOf(w.day);
const cname = (sp, tg) => callName(sp, tg);
const isOffice = p => !['driver', 'souko'].includes(p.role);
const single = p => !p.life.married;
const visible = w => atWork(w).filter(p => p.key !== 'kaicho');
function headline(w, text, who = [], cat = '事件') { return log(w, text, { lvl: 3, cat, who }); }
function newSecret(w, s) {
  const sec = { id: 'sec' + (w.secretSeq = (w.secretSeq || 0) + 1), day: w.day, known: [], exposed: false, sev: 2, ...s };
  sec.subj = (sec.subj || []).map(p => p.id || p);
  sec.known = [...new Set([...(sec.known || []).map(p => p.id || p), ...sec.subj])];
  w.secrets.push(sec);
  return sec;
}
export function knows(sec, p) { return sec.known.includes(p.id); }
export function tell(w, sec, p) { if (!sec.known.includes(p.id)) sec.known.push(p.id); }
function clientOf(w, p) { const c = w.clients.filter(c => c.status === 'active' && c.rep === p.id); return c.length ? R.pick(c) : null; }
function repOf(w, c) { return P(w, c.rep); }
function reassignClients(w, gone) {
  const pool = active(w).filter(p => p.role === 'sales' && p.id !== gone.id && !p.newhire);
  for (const c of w.clients) if (c.rep === gone.id) {
    const cand = pool.filter(p => p.dept === gone.dept);
    c.rep = (cand.length ? R.pick(cand) : R.pick(pool))?.id || c.rep;
    c.rel = clamp(c.rel - R.int(3, 12), 0, 100);
  }
}
function boss(w, p) { return bossOf(w, p); }
function shacho(w) { return byKey(w, 'shacho'); }
function kaicho(w) { return byKey(w, 'kaicho'); }
function senmu(w) { return byKey(w, 'senmu'); }
function soumu(w) { return byKey(w, 'soumu') || byKey(w, 'soumubucho'); }
function keiri(w) { return byKey(w, 'keirikacho') || byKey(w, 'keiri'); }
function adminVoice(w) { return byKey(w, 'soumu') || byKey(w, 'uketsuke') || byKey(w, 'soumubucho'); }
function cont(w, delay, fn, args = {}) { later(w, delay, 'call', { fn, args }); }
function dayMin(w, days, h = 9, m = 0) { // n日後の h:m までの分
  const target = (w.day + days) * 1440 + h * 60 + m;
  return Math.max(1, target - w.t);
}
function nextBizDelay(w, days, h = 9, m = 0) {
  let d = w.day + days;
  for (let i = 0; i < 10 && companyOff(dateOf(d)); i++) d++;
  return Math.max(1, d * 1440 + h * 60 + m - w.t);
}
function witnesses(w, p, n = 3) {
  return onSite(w).filter(q => q !== p && q.at && p.at && (q.today.floor === p.today.floor)).slice(0, n);
}
export function callTo(w, p, node, minutes) { // 人を一定時間どこかへ呼ぶ
  p.busy = { until: w.t + minutes, at: node };
}
function money(v) { return manYen(v); }

// ---------- 出来事 ----------
// slot: morning(9時台) noon(12時台) afternoon(14時台) evening(17時台) night(21時) daily(0時)
export const EVENTS = [];
const E = (id, slot, w, run, opt = {}) => EVENTS.push({ id, slot, w, run, ...opt });

// ===== 人:ミス =====
E('mistake', 'afternoon', w => 1.0, w => {
  const p = pickW(visible(w).filter(q => q.rank < 7), q => 1 + (100 - q.b5.C) / 25 + q.st.fatigue / 30 + (q.newhire ? 2 : 0));
  if (!p) return false;
  const v = stdVars(w, p); const c = v._client;
  const kinds = [];
  if (p.role === 'sales' || p.role === 'jimu') kinds.push('order', 'invoice', 'mail', 'fax');
  if (p.role === 'buyer') kinds.push('po');
  if (p.role === 'souko' || p.role === 'logi' || p.role === 'driver') kinds.push('ship', 'temp');
  if (p.role === 'acct') kinds.push('pay');
  if (!kinds.length) kinds.push('mail');
  const k = R.pick(kinds);
  const b = boss(w, p);
  let cost = 0, text = '', lvl = 1;
  if (k === 'order') { const n = R.pick([10, 100]); text = `${full(p)}が${c.name}の${v.prod}の受注を${n}倍で入力。${R.chance(0.5) ? '出荷前に気づいた' : '倉庫から大量に出荷されてしまい、回収に走った'}`; cost = R.chance(0.5) ? 0 : R.int(8, 45) * 10000; }
  if (k === 'invoice') { text = `${c.name}への請求書の金額に誤り。${full(p)}が先方に謝罪の電話`; c.rel -= 3; }
  if (k === 'mail') { text = `${full(p)}が見積書のメールを別の取引先に誤送信。${R.chance(0.4) ? '他社の単価が見える状態だった' : '気づいて削除をお願いした'}`; lvl = R.chance(0.4) ? 2 : 1; c.rel -= 4; }
  if (k === 'fax') { text = `${full(p)}が${c.name}あての注文書を${R.pick(['近所の歯科医院', '個人宅', '別の取引先'])}にFAX誤送信`; }
  if (k === 'po') { const s = R.pick(w.suppliers); text = `${full(p)}が${s.name}への発注で単位を取り違え(ケースとバラ)。${v.prod}が想定の${R.pick([12, 24, 30])}倍届く予定に`; cost = R.int(5, 40) * 10000; lvl = 1; }
  if (k === 'ship') { text = `${c.name}向けに${v.prod}を誤出荷(${R.pick(['品番違い', '数量違い', '別の店舗に配送'])})。再配送に車を一台出した`; cost = R.int(3, 18) * 10000; c.rel -= 3; }
  if (k === 'temp') { text = `冷凍品の${v.prod}を常温のカゴ車に積んだまま${R.int(2, 4)}時間放置。廃棄に`; cost = R.int(10, 60) * 10000; }
  if (k === 'pay') { text = `${full(p)}が${R.pick(w.suppliers).name}への支払いを二重に振り込み。返金を依頼`; }
  log(w, text, { lvl, cat: 'ミス', who: [p] });
  if (cost) addExpense(w, '雑損失', cost);
  stat(p, 'stress', 8 + (100 - p.b5.N) / 30); stat(p, 'mood', -10);
  remember(w, p, `${text.replace(full(p) + 'が', '')}。`, b, 2);
  if (b && b !== p) {
    const harsh = b.b5.A < 40 || b.st.stress > 70;
    const t0 = R.int(2, 15);
    if (harsh) {
      talk(w, b, p, R.pick(['((何回言ったら|いい加減に))わかるの？', 'なんで確認しないの', 'お客さんにどう説明すんの、これ', '((ちょっと来て|ちょっといい？))']), t0);
      talk(w, p, b, R.pick(['申し訳ありません', 'すみません…', '確認したつもりで…']), t0 + 1);
      talk(w, b, p, R.pick(['つもりじゃ困るんだよ', '始末書書いて', '二度とないように', '((もういい|はあ…))']), t0 + 2);
      affect(w, p, b, -6, -3); stat(p, 'stress', 6);
      for (const q of witnesses(w, p)) affect(w, q, b, -2, 0);
      callTo(w, p, b.desk || p.desk, 6);
    } else {
      talk(w, b, p, R.pick(['まあ、起きたことは仕方ない。先方には一緒に謝りに行こう', '次から指差し確認な', '大丈夫、俺も昔やった', 'ダブルチェックの仕組み、考えよう']), t0);
      talk(w, p, b, R.pick(['ありがとうございます…', 'すみません、気をつけます']), t0 + 1);
      affect(w, p, b, 4, 3);
    }
  }
  if (p.role === 'sales') say(w, 'eigyo', p, null, R.pick([`{cust}さんの件、私のミスでした。ご迷惑おかけしました`, `先ほどの件、先方には謝罪済みです。すみませんでした`]), R.int(30, 90), { cust: c.name });
  p.flags.mistakes = (p.flags.mistakes || 0) + 1;
  return true;
});

// ===== 人:叱責・パワハラ =====
E('scold', 'morning', w => 0.55, w => {
  const b = pickW(visible(w).filter(q => q.boss || q.rank >= 5), q => (q.b5.A < 45 ? 3 : 0.3) + q.st.stress / 30);
  if (!b) return false;
  const subs = visible(w).filter(q => bossOf(w, q) === b);
  const v = pickW(subs, q => 1 + (rel(w, b, q).aff < 0 ? 3 : 0) + (q.flags.mistakes || 0));
  if (!v) return false;
  const wit = witnesses(w, v, 5);
  const lines = R.pick([
    [['A', '{nB}、((ちょっと|これ))なに？'], ['B', 'え…'], ['A', '((先週も言ったよね|子どもでもできるよ|やる気ないなら帰っていいよ|給料泥棒って言われても仕方ないよ))'], ['B', '…すみません']],
    [['A', '((みんな聞いて。|)){nB}のせいで{cust}さん怒ってるから'], ['B', '…'], ['A', '((なんで黙ってるの|言い訳しないの？|返事は？))']],
    [['A', '((数字|見込み|報告))、まだ？'], ['B', 'あと少しで…'], ['A', '((少しって何分？|いつもそれだよね|もういい、俺がやる))']],
  ]);
  runLines(w, 'talk', { A: b, B: v }, lines, stdVars(w, v), R.int(1, 5));
  const strong = b.b5.A < 30 && R.chance(0.5);
  log(w, `${full(b)}が${full(v)}を${strong ? '皆の前で強い口調で' : ''}叱責。${wit.length ? `周りの${wit.length}人は手を止めて見ていた` : ''}`, { lvl: strong ? 2 : 1, cat: '人間関係', who: [b, v] });
  stat(v, 'stress', strong ? 15 : 8); stat(v, 'mood', -12); stat(v, 'sat', -4); stat(v, 'quit', strong ? 6 : 2);
  affect(w, v, b, strong ? -12 : -5, -4);
  for (const q of wit) { affect(w, q, b, -3, -1); if (rel(w, q, v).aff > 10) affect(w, q, v, 2, 0); }
  remember(w, v, `${titleShort(b) || b.sei}に${strong ? 'みんなの前で' : ''}怒られた`, b, strong ? 3 : 2);
  v.flags.scolded = (v.flags.scolded || 0) + (strong ? 2 : 1);
  if (strong) {
    b.flags.harass = (b.flags.harass || 0) + 1;
    if (b.flags.harass >= 3 && !w.secrets.find(s => s.kind === 'pawahara' && s.subj[0] === b.id)) {
      newSecret(w, { kind: 'pawahara', subj: [b], victim: v.id, text: `${b.sei}${titleShort(b)}のパワハラ、${v.sei}さん相当まいってるらしい`, sev: 3, known: [v, ...wit] });
    }
    // 見ていた人が、本人を気づかってDMする
    const kind = pickW(wit.filter(q => rel(w, q, v).aff > 5), q => q.b5.A);
    if (kind) say(w, 'dm', kind, v, R.pick(['[[大丈夫ですか？さっきの、ひどかったですね||大丈夫？さっきのはひどいわ]]', '((気にしないで|あれは言い過ぎ))。[[帰り、少し話しませんか||帰りラーメンでも行こ]]', '見てました。何かあったら言ってください']), R.int(20, 60), {}, { to: v });
  }
  return true;
});

// ===== 人:営業と物流の口論 =====
E('fight', 'morning', w => 1, w => {
  const s = pickWhere(visible(w), q => q.role === 'sales');
  const l = pickWhere(visible(w), q => q.role === 'logi' || q.key === 'butsuryubucho');
  if (!s || !l) return false;
  const v = stdVars(w, s);
  runLines(w, 'eigyo', { A: s, B: l }, [
    ['A', '{cust}さん、今日の午後にどうしても{prod}が要るそうで。[[追加で1便出してもらえませんか||追加で1便出せない？]]'],
    ['B', { pos: '((ドライバーが空いてないんです|今日は全車出払ってます))。[[明日の朝一ではダメですか||明日朝一じゃだめ？]]', neg: '((無理です|だから11時締めって言ってますよね|営業さんがお客さんを甘やかすからこうなるんですよ))' }],
    ['A', { pos: '((先方に相談してみます|わかりました))', neg: '((お客さんあっての物流でしょ|じゃあ俺が営業車で持っていきます|そういう言い方ないでしょ))' }],
  ], v, R.int(0, 5));
  const bad = rel(w, s, l).aff < 0 || s.b5.A < 45 || l.b5.A < 45;
  if (bad) {
    log(w, `営業の${full(s)}と物流の${full(l)}が、${v.cust}向けの当日追加の配送をめぐって言い合いに。${R.chance(0.5) ? '結局、' + s.sei + 'が営業車で自分で届けた' : 'センター長が間に入った'}`, { lvl: 1, cat: '人間関係', who: [s, l] });
    affect(w, s, l, -8, -4); affect(w, l, s, -8, -4); stat(s, 'stress', 5); stat(l, 'stress', 5);
    remember(w, s, `物流の${l.sei}さんと配送の件で言い合いになった`, l, 2); remember(w, l, `営業の${s.sei}がまた当日の追加を押しつけてきた`, s, 2);
  }
  return true;
});

// ===== 人:手柄の横取り =====
E('credit', 'afternoon', w => 0.5, w => {
  const b = pickWhere(visible(w), q => q.boss && q.traits.amb > 55 && q.traits.integ < 55);
  if (!b) return false;
  const v = pickWhere(visible(w), q => bossOf(w, q) === b);
  if (!v) return false;
  const top = shacho(w) || senmu(w);
  log(w, `${full(v)}がまとめた${R.pick(['新規提案', '物流コストの削減案', '在庫の見直し案', '値上げ交渉の資料'])}を、${full(b)}が${top ? titleShort(top) : '上'}への報告で自分の案として説明`, { lvl: 1, cat: '人間関係', who: [b, v] });
  affect(w, v, b, -15, -15); stat(v, 'motiv', -12); stat(v, 'quit', 6);
  remember(w, v, `自分の資料を${b.sei}${titleShort(b)}に自分の手柄にされた`, b, 3);
  const c = liked(w, v, active(w).filter(q => q !== b && q !== v));
  if (c) say(w, 'dm', v, c, R.pick(['[[聞いてください。||聞いて。]]あの資料、私が作ったやつなのに{nX}が自分で考えたことになってました', '((もう何のためにやってるのかわからない|やってられない))。あの提案、完全に取られた']), R.int(30, 120), { nX: cname(v, b) }, { to: c });
  return true;
});

// ===== 人:社内恋愛 =====
E('romance_start', 'evening', w => 0.8, w => {
  const pool = active(w).filter(p => p.age >= 21 && p.age <= 48 && !p.foreign && !p.arcs.romance && p.key !== 'kaicho');
  let best = null, bs = 0;
  for (let i = 0; i < 25; i++) {
    const a = R.pick(pool), b = R.pick(pool);
    if (!a || !b || a === b || a.gender === b.gender || Math.abs(a.age - b.age) > 14) continue;
    const sc = rel(w, a, b).aff + rel(w, b, a).aff + rel(w, a, b).fam / 2 + (single(a) && single(b) ? 30 : -20) + R.f(0, 30);
    if (sc > bs) { bs = sc; best = [a, b]; }
  }
  if (!best || bs < 40) return false;
  const [a, b] = best;
  const affair = !single(a) || !single(b);
  if (affair && (a.traits.integ > 35 || b.traits.integ > 45 || R.chance(0.6))) return false;
  const id = 'rom' + w.day + a.id;
  a.arcs.romance = { with: b.id, stage: 1, id, affair }; b.arcs.romance = { with: a.id, stage: 1, id, affair };
  affect(w, a, b, 8, 4); affect(w, b, a, 8, 4);
  say(w, 'dm', a, b, R.pick(['今日((お疲れさまでした|ありがとうございました))。((あの店|話してたラーメン屋)){w}今度ほんとに行きましょう', '((さっき|今日))のフォロー、助かりました。今度お礼させてください', '((この前話してた映画|あのドラマ))、見ました？']), R.int(20, 90), {}, { to: b });
  say(w, 'dm', b, a, R.pick(['((ぜひ！|いいですね)){w}', '((お礼なんていいですよ|じゃあ、お言葉に甘えて))', 'まだです！ネタバレ禁止で{w}']), R.int(100, 200), {}, { to: a });
  cont(w, dayMin(w, R.int(5, 14), 12, 10), 'romance_step', { a: a.id, b: b.id });
  return true;
}, { quiet: true });

// ===== 人:転職を考えはじめる =====
E('jobhunt_start', 'night', w => 1, w => {
  const p = pickW(active(w).filter(q => q.st.quit > 55 && !q.arcs.jobhunt && q.emp !== '役員' && !q.newhireLock), q => q.st.quit);
  if (!p) return false;
  p.arcs.jobhunt = { stage: 1, since: w.day };
  remember(w, p, '転職サイトに登録した', null, 2);
  const c = liked(w, p, active(w).filter(q => q.age < p.age + 15 && q.age > p.age - 15));
  if (c && rel(w, p, c).trust > 20) {
    say(w, 'dm', p, c, R.pick(['ここだけの話、((転職サイト登録した|エージェントと面談した|ハロワ行ってきた))', '((正直、|))もう限界かも。((次探してる|辞めようと思ってる))', '((ホクシン|大東京フーズ))の求人見た？うちより月((3|4|5))万高い']), R.int(10, 80), {}, { to: c });
    say(w, 'dm', c, p, R.pick(['((まじで|え、))…((誰にも言わないけど|寂しくなるな))', 'わかる。俺も見てる{w}', '早まらないで。((一回飲みに行こう|話聞くよ))']), R.int(90, 180), {}, { to: p });
    newSecret(w, { kind: 'jobhunt', subj: [p], text: `${p.sei}さん、転職活動してるらしい`, sev: 2, known: [c] });
  }
  cont(w, dayMin(w, R.int(10, 30), 8, 40), 'jobhunt_step', { p: p.id });
  return true;
}, { quiet: true });

// ===== 人:メンタル不調 =====
E('mental', 'daily', w => (w.day - (w.lastMental ?? -999) < 45 ? 0 : 1), w => {
  const p = pickW(active(w).filter(q => q.st.stress > 84 && !q.arcs.mental && q.emp !== '役員'), q => q.st.stress + q.b5.N / 2);
  if (!p) return false;
  p.arcs.mental = { stage: 1 }; w.lastMental = w.day;
  p.flags.sickBias = 0.25;
  cont(w, nextBizDelay(w, R.int(2, 6), 7, 50), 'mental_step', { p: p.id });
  return true;
}, { quiet: true });

// ===== 人:誕生日 =====
E('birthday', 'morning', w => { const d = D(w); return active(w).some(p => p.birth.m === d.m && p.birth.d === d.d && p.today?.in) ? 50 : 0; }, w => {
  const d = D(w);
  const p = active(w).find(q => q.birth.m === d.m && q.birth.d === d.d && q.today?.in);
  if (!p) return false;
  p.age += 0; // 年齢は年度の切り替えで
  const fr = active(w).filter(q => q !== p && q.today?.in && rel(w, q, p).aff > 15).slice(0, 4);
  fr.forEach((q, i) => say(w, 'zatsudan', q, p, R.pick(['{nB}、誕生日おめでとうございます！', '((誕生日おめでとう|おめでとうございます))！{w}', 'おめでとうございます🎂']), 60 + i * R.int(2, 20), { nB: cname(q, p) }));
  if (fr.length) say(w, 'zatsudan', p, null, R.pick(['ありがとうございます！((もう若くないです{w}|また一つ歳を取りました))', 'ありがとうございます。((覚えててもらえて|恥ずかしい))', '@sticker:thanks']), 120);
  log(w, `${full(p)}の誕生日。${fr.length ? `${fr.map(q => q.sei).join('・')}が雑談チャンネルで祝った` : '誰も気づいていないようだ'}`, { lvl: 0, cat: '暮らし', who: [p] });
  if (!fr.length) { stat(p, 'mood', -4); remember(w, p, '誕生日、誰にも気づかれなかった', null, 1); }
  else { stat(p, 'mood', 8); }
  return true;
});

// ===== 人:お土産 =====
E('omiyage', 'morning', w => 1.2, w => {
  const p = pickWhere(visible(w), q => q.flags.trip);
  if (!p) return false;
  const trip = p.flags.trip; delete p.flags.trip;
  const item = { '東京': R.pick(['東京ばな奈', 'ごまたまご', 'シュガーバターの木']), '北海道': R.pick(['白い恋人', 'ロイズのチョコ', 'じゃがポックル']), '沖縄': 'ちんすこう', '京都': R.pick(['八ツ橋', '抹茶ラングドシャ']), '仙台': R.pick(['萩の月', '喜久福']), '金沢': 'まめや金澤萬久のお菓子', '韓国': 'ハニーバターアーモンド', '台湾': 'パイナップルケーキ', '佐渡': R.pick(['佐渡バター', 'いごねり', 'おけさ柿']), '大阪': R.pick(['551の豚まん', 'りくろーおじさんのチーズケーキ']), '湯沢': R.pick(['ぽっぽ焼き', '笹団子']) }[trip] || R.pick(['クッキー', 'おせんべい']);
  say(w, 'all', p, null, R.pick([`((休憩室|給湯室))に${trip}のお土産置いておきました。${item}です。おひとつどうぞ`, `お休みいただきありがとうございました。${trip}のお土産(${item})を((休憩室|給湯室))に置いてあります`]), R.int(5, 40));
  log(w, `${full(p)}が${trip}土産の${item}を配った`, { cat: '暮らし', who: [p] });
  for (const q of deptMates(w, p).slice(0, 5)) affect(w, q, p, 1, 0);
  return true;
});

// ===== 人:エアコン戦争 =====
E('aircon', 'afternoon', w => { const m = D(w).m; return m >= 6 && m <= 9 || m <= 2 || m === 12 ? 0.8 : 0; }, w => {
  const a = pickWhere(visible(w), q => isOffice(q) && q.b5.A < 55);
  const b = a && pickWhere(visible(w), q => q !== a && q.today.floor === a.today.floor);
  if (!a || !b) return false;
  const hot = D(w).m >= 6 && D(w).m <= 9;
  talk(w, a, b, hot ? '((暑くない？|エアコン何度？))((下げていい？|26度は無理))' : '((寒くない？|足元冷える))。((温度上げていい？|暖房強くしていい？))', 1);
  talk(w, b, a, hot ? '((私は寒いです|カーディガン着てます|膝掛け使ってるんですけど))' : '((私は暑いくらいです|ちょうどいいです))', 2);
  log(w, `${a.today.floor}階でエアコンの設定温度をめぐる静かな攻防。${a.sei}が${hot ? '下げ' : '上げ'}、${R.int(20, 50)}分後に${b.sei}が戻した`, { cat: '暮らし', who: [a, b] });
  affect(w, a, b, -2, 0); affect(w, b, a, -2, 0);
  return true;
});

// ===== 人:冷蔵庫の私物 =====
E('pudding', 'afternoon', w => 0.5, w => {
  const v = pickWhere(visible(w), isOffice);
  if (!v) return false;
  const item = R.pick(['プリン', 'ヨーグルト', '高い方のアイス', 'エクレア', '名前を書いておいたケーキ', '栄養ドリンク']);
  say(w, 'zatsudan', v, null, R.pick([`休憩室の冷蔵庫に入れておいた${item}、食べた人いますか。名前書いてあったんですけど`, `((誰ですか|悲しい))。私の${item}…`]), 1);
  const cul = pickW(visible(w).filter(q => q !== v), q => (100 - q.traits.integ) / 20);
  if (cul && R.chance(0.6)) {
    newSecret(w, { kind: 'pudding', subj: [cul], text: `${v.sei}さんの${item}食べたの、${cul.sei}さんらしいよ`, sev: 1, known: [cul] });
  }
  log(w, `${full(v)}が冷蔵庫に入れていた${item}が消えた。雑談チャンネルに投稿`, { cat: '暮らし', who: [v] });
  stat(v, 'mood', -5);
  return true;
});

// ===== 人:飲み会 =====
E('nomikai', 'evening', w => D(w).wd === 5 || D(w).wd === 4 ? 1.2 : 0.2, w => {
  const org = pickW(atWork(w).filter(q => q.traits.drink > 50), q => q.b5.E + q.traits.drink);
  if (!org) return false;
  const mates = atWork(w).filter(q => q !== org && rel(w, q, org).aff > -5 && (q.dept === org.dept || rel(w, org, q).fam > 50) && q.traits.drink > 25);
  const party = [org, ...R.sample(mates, R.int(1, 4))];
  if (party.length < 2) return false;
  const place = R.pick(['古町の焼き鳥屋', '駅南の居酒屋', '万代の海鮮居酒屋', '東区の焼肉屋', '竹尾の大衆酒場', '沼垂の立ち飲み']);
  party.forEach(q => { q.flags.drankDay = w.day; });
  log(w, `${party.map(q => q.sei).join('・')}で${place}へ。帰りは代行`, { cat: '暮らし', who: party });
  for (const a of party) for (const b of party) if (a !== b) affect(w, a, b, 3, 2);
  // 酒の席の出来事
  later(w, R.int(150, 240), 'call', { fn: 'drunk', args: { party: party.map(q => q.id), place } });
  return true;
});

// ===== 人:遅刻常習・服装 などの小ネタ =====
E('smalltalk_suits', 'morning', w => 0.6, w => {
  const p = pickWhere(visible(w), q => q.arcs.jobhunt && q.arcs.jobhunt.stage >= 2);
  if (!p) return false;
  const g = pickW(visible(w).filter(q => q !== p), q => q.traits.gossip);
  if (!g) return false;
  const c = pickWhere(visible(w), q => q !== p && q !== g && rel(w, g, q).fam > 40);
  if (!c) return false;
  talk(w, g, c, `((${p.sei}さん、最近スーツ多くない？|${p.sei}さん、また午後半休だって)) `, 1);
  talk(w, c, g, '((面接じゃない？|まさか|言われてみれば))', 2);
  const sec = w.secrets.find(s => s.kind === 'jobhunt' && s.subj[0] === p.id) || newSecret(w, { kind: 'jobhunt', subj: [p], text: `${p.sei}さん、転職活動してるらしい`, sev: 2 });
  for (const q of [g, c]) if (!sec.known.includes(q.id)) sec.known.push(q.id);
  return true;
}, { quiet: true });

// ===== 人:消費者金融からの電話 =====
E('loan_call', 'afternoon', w => 0.06, w => {
  const p = pickWhere(active(w), q => q.life.gamble || q.st.debt > 30);
  const r = byKey(w, 'uketsuke') || soumu(w);
  if (!p || !r) return false;
  p.st.debt = clamp(p.st.debt + 15, 0, 100);
  log(w, `受付に「${p.sei}さんはいらっしゃいますか」と個人名の電話。会社名を名乗らない。${r.sei}が取り次いだ`, { lvl: 1, cat: '噂', who: [p, r] });
  newSecret(w, { kind: 'debt', subj: [p], text: `${p.sei}さんにまた変な電話来てたよ。お金の関係じゃない？`, sev: 2, known: [r] });
  stat(p, 'stress', 10);
  return true;
});

// ===== 人:資格合格 =====
E('license', 'afternoon', w => 0.35, w => {
  const p = pickW(active(w).filter(q => q.today?.in && q.b5.C > 50), q => q.b5.O);
  if (!p) return false;
  const lic = p.role === 'souko' || p.role === 'driver' || p.role === 'logi' ? R.pick(['フォークリフト運転技能', '中型免許', '危険物取扱者乙4', '衛生管理者']) : p.role === 'acct' ? R.pick(['日商簿記2級', '給与計算実務能力検定']) : R.pick(['食品表示検定(中級)', 'ITパスポート', '日商簿記3級', '販売士2級', 'MOS(Excel)']);
  say(w, 'all', adminVoice(w) || p, null, `${p.sei}さんが${lic}に合格しました。おめでとうございます！`, R.int(1, 30));
  log(w, `${full(p)}が${lic}に合格`, { cat: '人事', who: [p] });
  stat(p, 'motiv', 8); stat(p, 'mood', 10); p.salary += R.pick([0, 3000, 5000]);
  return true;
});

// ===== 人:交通事故 =====
E('accident', 'afternoon', w => { const k = w.weather?.kind; return k === '雪' || k === '大雪' || k === 'みぞれ' ? 0.5 : 0.1; }, w => {
  const p = pickWhere(active(w), q => (q.role === 'sales' && q.today?.out) || (q.role === 'driver' && q.today?.in));
  if (!p) return false;
  const vehicle = p.role === 'driver' ? R.pick(['2t冷凍車', '4t冷凍車', '3t保冷車']) : '営業車';
  const kind = R.weighted([{ k: 'self', w: 4 }, { k: 'rear', w: 3 }, { k: 'person', w: 0.4 }]).k;
  const place = R.pick(['亀田バイパスの側道', '竹尾インターの交差点', '得意先の駐車場', '旧新潟競馬場前', '赤道の交差点', 'ほんの細い住宅街', '女池の交差点']);
  if (kind === 'self') {
    log(w, `${full(p)}が${vehicle}で${place}にて${R.pick(['ポールに接触', '縁石に乗り上げ', '雪で滑ってガードレールに接触', 'バックで電柱に接触'])}。けが人なし`, { lvl: 1, cat: '事故', who: [p] });
    addExpense(w, '修繕費', R.int(8, 45) * 10000);
  } else if (kind === 'rear') {
    log(w, `${full(p)}の${vehicle}が${place}で${R.pick(['追突した', '追突された'])}。${R.pick(['相手は軽いむち打ち', 'けが人なし', '相手方が保険会社を通すと連絡'])}`, { lvl: 2, cat: '事故', who: [p] });
    addExpense(w, '修繕費', R.int(15, 80) * 10000);
  } else {
    headline(w, `${full(p)}が${vehicle}の運転中、${place}で歩行者と接触。相手は${R.pick(['足を骨折', '打撲で搬送'])}。警察の聴取を受ける`, [p]);
    addExpense(w, '修繕費', R.int(30, 100) * 10000); stat(p, 'stress', 30);
    news(w, { sec: '社会', head: `${R.pick(['新潟市東区', '新潟市江南区', '新潟市中央区'])}でトラックと歩行者の事故`, body: `${D(w).m}月${D(w).d}日午後、新潟市内の${place}で、食品卸会社の${vehicle === '営業車' ? '乗用車' : 'トラック'}と歩行者が接触する事故があった。警察が当時の状況を調べている。` });
    w.fin.scandal = (w.fin.scandal || 0) + 3;
  }
  stat(p, 'stress', 18); stat(p, 'mood', -15);
  remember(w, p, `${vehicle}で事故を起こした`, null, 3);
  const b = boss(w, p);
  if (b) say(w, p.role === 'driver' ? 'butsuryu' : 'eigyo', p, b, R.pick(['[[すみません、事故を起こしました。||すみません、事故った。]]((けが人はいません|警察待ちです|今から現場の写真送ります))', '((申し訳ありません|すみません))。{vh}で事故です。((警察呼んでます|相手の方と話してます))']), 2, { vh: vehicle });
  if (b) say(w, p.role === 'driver' ? 'butsuryu' : 'eigyo', b, p, { pos: '((けがは？|まずは落ち着いて))。((保険会社に電話して|写真撮っておいて))', neg: '((はあ？また？|何やってんの))。((保険の等級上がるんだぞ|とりあえず戻ってこい))' }[b.b5.A < 40 ? 'neg' : 'pos'], 6);
  return true;
});

// ===== 人:健康・入院 =====
E('hospital', 'daily', w => 0.08, w => {
  const p = pickW(active(w).filter(q => q.age > 40 && !q.arcs.sick && q.status === 'active'), q => (100 - q.st.health) + q.age / 2);
  if (!p) return false;
  const ill = R.pick(['胆石', '尿管結石', '椎間板ヘルニア', '心筋梗塞の疑い', '大腸ポリープ', '虫垂炎', '帯状疱疹', '肺炎', '早期の胃がん']);
  const days = { '胆石': 10, '尿管結石': 3, '椎間板ヘルニア': 21, '心筋梗塞の疑い': 14, '大腸ポリープ': 3, '虫垂炎': 7, '帯状疱疹': 7, '肺炎': 10, '早期の胃がん': 30 }[ill];
  p.arcs.sick = { ill, until: w.day + days };
  p.status = 'leave'; p.leaveReason = `入院(${ill})`;
  log(w, `${full(p)}が${ill}で入院。${days >= 14 ? '復帰は早くても' + Math.round(days / 7) + '週間後' : '1週間ほど休む見込み'}`, { lvl: days > 10 ? 2 : 1, cat: '暮らし', who: [p] });
  board(w, { type: '連絡', title: `${p.dept} ${p.sei}さんの休暇について`, author: adminVoice(w)?.id, body: `${p.dept}の${p.sei}さんは、体調不良のためしばらくお休みされます。業務の連絡は${boss(w, p)?.sei || '所属長'}までお願いします。お見舞いは辞退されるとのことです。` });
  remember(w, p, `${ill}で入院した`, null, 3);
  cont(w, dayMin(w, days, 8, 30), 'sick_return', { p: p.id });
  if (p.role === 'sales') { for (const c of w.clients) if (c.rep === p.id) c.rel -= 2; }
  return true;
});

// ===== 人:身内の不幸 =====
E('bereave', 'daily', w => 0.1, w => {
  const p = pickW(active(w).filter(q => q.age > 35 && !/両親他界/.test(q.life.parents)), q => q.age);
  if (!p) return false;
  const who = p.life.parents === '父他界・母一人' ? '母' : p.life.parents === '母他界・父一人' ? '父' : R.pick(['父', '母', '祖母', '義父', '義母']);
  const hon = { '父': 'お父様', '母': 'お母様', '祖母': 'お祖母様', '義父': '奥様のお父様', '義母': '奥様のお母様' }[who];
  const age = R.int(76, 95);
  const hall = R.pick(['セレモニーホール東', '新潟中央斎場', 'みずほ会館 亀田', '紫竹山メモリアル', '白根の自宅']);
  board(w, { type: '訃報', title: `訃報 ${p.dept} ${p.sei}さんの${hon}`, author: soumu(w)?.id, body: `${p.dept}の${full(p)}さんの${hon}(${age}歳)が逝去されました。謹んでお悔やみ申し上げます。\n通夜:明日18時より ${hall}\n告別式:明後日10時より 同所\n会社として弔電と供花を手配しました。香典は社の規定により総務でとりまとめます。` });
  log(w, `${full(p)}の${who}が亡くなる(${age}歳)。忌引で${who === '祖母' ? 1 : 3}日休む`, { lvl: 1, cat: '暮らし', who: [p] });
  if (/父|母/.test(who) && !who.startsWith('義')) p.life.parents = /他界・/.test(p.life.parents) ? '両親他界' : who === '父' ? '父他界・母一人' : '母他界・父一人';
  p.life.care = false;
  p.flags.kibiki = w.day + (who === '祖母' ? 1 : 3);
  stat(p, 'mood', -25); stat(p, 'stress', 10);
  remember(w, p, `${who}が亡くなった`, null, 4);
  addExpense(w, '福利厚生費', 30000 + 15000);
  for (const q of active(w).filter(q => q !== p && rel(w, q, p).aff > 20).slice(0, 3)) say(w, 'dm', q, p, R.pick(['このたびはご愁傷さまでした。仕事のことは気にしないでください', '((大変でしたね|お疲れが出ませんように))。こちらは何とかしておきます']), R.int(60, 300), {}, { to: q === p ? null : p });
  return true;
});

// ===== 人:結婚・出産の報告 =====
E('baby', 'morning', w => 0.25, w => {
  const p = pickWhere(active(w), q => q.life.married && q.age >= 26 && q.age <= 42 && !q.life.kids.some(k => k.age < 1) && q.today?.in);
  if (!p) return false;
  p.life.kids.push({ age: 0, g: R.chance(0.5) ? 'm' : 'f' });
  const sh = shacho(w);
  if (p.gender === 'f') {
    say(w, 'all', p, null, '私事で恐縮ですが、((秋|冬|春))に出産を予定しております。((産休・育休|お休み))の間はご迷惑をおかけしますが、よろしくお願いいたします', R.int(5, 30));
    p.flags.maternity = w.day + R.int(90, 150);
    log(w, `${full(p)}が妊娠を報告。産休に入る予定`, { lvl: 1, cat: '人事', who: [p] });
  } else {
    const ikukyu = p.age < 38 && R.chance(0.5);
    say(w, 'zatsudan', p, null, `昨日、((第一子|第二子|子ども))が生まれました！((母子ともに元気です|寝不足です{w}))`, R.int(5, 30));
    log(w, `${full(p)}に子どもが生まれた${ikukyu ? '。2週間の育休を申請' : ''}`, { lvl: 1, cat: '暮らし', who: [p] });
    if (ikukyu && sh) {
      const old = sh.archetype === 'ワンマン' || sh.archetype === '見栄っ張り';
      if (old) talk(w, sh, p, '育休？男が？…まあ、制度上はいいけど。((お客さんに迷惑かけないようにな|ずいぶん時代は変わったな))', R.int(60, 120));
      else talk(w, sh, p, 'おめでとう。((ちゃんと休めよ|育休、遠慮しないで取って))', R.int(60, 120));
    }
  }
  stat(p, 'mood', 20);
  for (const q of active(w).filter(q => q !== p && rel(w, q, p).aff > 10).slice(0, 4)) say(w, 'zatsudan', q, p, 'おめでとうございます！', R.int(40, 120));
  return true;
});
E('wedding', 'morning', w => 0.15, w => {
  const p = pickWhere(active(w), q => !q.life.married && q.age >= 24 && q.age <= 40 && !q.arcs.romance && q.today?.in);
  if (!p) return false;
  p.life.married = true;
  say(w, 'all', p, null, '私事ですが、((先日|今月))入籍いたしました。((今後ともよろしくお願いいたします|変わらずよろしくお願いします))', R.int(5, 30));
  log(w, `${full(p)}が結婚を報告(相手は社外)`, { lvl: 1, cat: '暮らし', who: [p] });
  stat(p, 'mood', 18); stat(p, 'quit', p.gender === 'f' ? 5 : -5);
  if (p.gender === 'f' && R.chance(0.35)) { p.maiden = p.sei; p.sei = R.pick(['佐藤', '渡辺', '本間', '五十嵐', '小林', '斎藤', '高橋']); log(w, `${p.maiden}さんは今後「${p.sei}」姓に。名札とメールアドレスの変更を総務に依頼`, { cat: '暮らし', who: [p] }); }
  return true;
});

// ===== 人:有給で旅行 =====
E('trip', 'daily', w => 1, w => {
  const p = pickW(active(w).filter(q => !q.flags.trip && q.flags.vacFrom == null), q => q.life.hobby.some(h => /温泉|旅|ドライブ/.test(h)) ? 3 : 1);
  if (!p) return false;
  p.flags.vacFrom = w.day + R.int(3, 12); p.flags.vacTo = p.flags.vacFrom + R.int(0, 2);
  p.flags.tripTo = R.pick(['東京', '北海道', '沖縄', '京都', '仙台', '金沢', '韓国', '台湾', '佐渡', '大阪', '湯沢']);
  return true;
}, { quiet: true });

// ===== 会社:社長の思いつき =====
const IDEAS = [
  { k: 'dx', t: 'DX推進プロジェクト', cost: 4.5e6, desc: 'タブレットで受発注を電子化する', good: 0.45 },
  { k: 'sns', t: '公式SNSの開設', cost: 0.3e6, desc: '若手にインスタを担当させる', good: 0.3 },
  { k: 'ec', t: '一般向けのネット通販', cost: 3.2e6, desc: '新潟の名産を全国に売る', good: 0.25 },
  { k: 'kitchen', t: 'キッチンカー事業', cost: 6.8e6, desc: '休日のイベントでタレカツ丼を売る', good: 0.2 },
  { k: 'speech', t: '朝礼の3分間スピーチ当番', cost: 0, desc: '全員が順番に話す', good: 0.6 },
  { k: 'award', t: '社内表彰制度', cost: 0.5e6, desc: '月間MVPに金一封', good: 0.6 },
  { k: 'consult', t: '経営コンサルタントとの顧問契約', cost: 3.6e6, desc: '東京のコンサル会社と月30万円で契約', good: 0.3 },
  { k: 'philo', t: '経営理念の唱和', cost: 0, desc: '毎朝、社是を全員で唱和する', good: 0.4 },
  { k: 'furusato', t: 'ふるさと納税の返礼品事業', cost: 1.5e6, desc: '自治体の返礼品を受託する', good: 0.5 },
  { k: 'ai', t: '生成AIの全社導入', cost: 1.2e6, desc: '全員に有料のAIアカウントを配る', good: 0.4 },
];
E('idea', 'morning', w => (w.day - (w.lastIdea ?? -99) < 50 ? 0 : shacho(w)?.today?.in ? (shacho(w).archetype === '改革派' ? 0.25 : shacho(w).archetype === 'ワンマン' ? 0.18 : 0.08) : 0), w => {
  w.lastIdea = w.day;
  const sh = shacho(w); if (!sh) return false;
  const done = w.ideas = w.ideas || [];
  const idea = R.pick(IDEAS.filter(i => !done.includes(i.k)));
  if (!idea) return false;
  done.push(idea.k);
  say(w, 'all', sh, null, `((皆さん、|全社員へ。))((本日より|来月から))「${idea.t}」を始めます。${idea.desc}。((現状維持は後退です|変わらなければ生き残れません|やらない理由より、やる方法を考えてください))。`, R.int(5, 20));
  log(w, `社長が「${idea.t}」の開始を宣言${idea.cost ? `(初期費用 約${Math.round(idea.cost / 1e4)}万円)` : ''}`, { lvl: 2, cat: '経営', who: [sh] });
  if (idea.cost) addExpense(w, '新規事業費', idea.cost * 0.4);
  // 反応
  const s = senmu(w);
  if (s && R.chance(0.6)) later(w, R.int(60, 180), 'call', { fn: 'senmu_grumble', args: { idea: idea.t } });
  const youngs = active(w).filter(q => q.age < 35);
  const olds = active(w).filter(q => q.age > 50 && q.key !== 'shacho' && q.key !== 'kaicho');
  const o = R.pick(olds), y = R.pick(youngs);
  if (o && y && R.chance(0.8)) {
    say(w, 'dm', y, liked(w, y, youngs) || o, R.pick([`「${idea.t}」って誰がやるんですかね{w}`, 'また始まった…', `${idea.t}、絶対現場に丸投げされるやつ`]), R.int(30, 90), {}, { to: liked(w, y, youngs) || o });
  }
  cont(w, dayMin(w, R.int(25, 60), 9, 30), 'idea_result', { k: idea.k });
  return true;
});

// ===== 会社:会長の来社と口出し =====
E('kaicho_visit', 'morning', w => kaicho(w)?.today?.in ? 0.6 : 0, w => {
  const k = kaicho(w), sh = shacho(w); if (!k || !sh) return false;
  const topic = R.pick(['マルシンへの値下げ', '若い社員のあいさつ', '新しいシステムへの投資', '銀行への説明', '昔からの取引先の扱い', '社長の車', '営業車の汚れ', '神棚のお榊が枯れていた件']);
  log(w, `会長が社長室へ。「${topic}」について${R.int(20, 70)}分ほど話し込む。${R.chance(0.5) ? 'ドア越しに大きな声が聞こえた' : ''}`, { lvl: 1, cat: '経営', who: [k, sh] });
  callTo(w, sh, 'pres_desk', 50); callTo(w, k, 'pres_0', 50);
  runLines(w, 'talk', { A: k, B: sh }, [
    ['A', R.pick([`${topic}のこと、聞いたぞ`, `おい、${topic}はどうなってる`, `${topic}、わしは聞いてないぞ`])],
    ['B', { pos: 'はい、ご説明しようと思っていました', neg: '((会長、もう任せてもらえませんか|今は時代が違うんです|その件は僕が決めました))' }],
    ['A', R.pick(['((親父|先代))が泣くぞ', '数字だけで商売するな', 'お前はまだ若い', '…好きにしろ。ただし責任はお前が取れ'])],
  ], {}, R.int(3, 10), { place: 'pres' });
  if (sh.b5.A < 45) { affect(w, sh, k, -6, -3); stat(sh, 'stress', 8); }
  const g = pickW(visible(w).filter(q => q.traits.gossip > 50), q => q.traits.gossip);
  if (g) say(w, 'dm', g, liked(w, g, visible(w)) || g, R.pick(['会長来てる。社長室の空気やばい', '((3階|社長室))から怒鳴り声聞こえた{w}', 'また会長と社長がやり合ってる']), R.int(20, 50), {}, { to: liked(w, g, visible(w)) });
  return true;
});

// ===== 会社:経営会議で社長と専務が対立 =====
E('kaigi', 'afternoon', w => (D(w).wd === 1 ? 1.4 : 0.2), w => {
  const sh = shacho(w), s = senmu(w); if (!sh || !s || !sh.today?.in || !s.today?.in) return false;
  const att = [sh, s, byKey(w, 'eigyobucho'), byKey(w, 'butsuryubucho'), byKey(w, 'soumubucho'), byKey(w, 'kobaikacho')].filter(q => q && q.today?.in);
  const seats = ['meet3_h', 'meet3_a0', 'meet3_b0', 'meet3_a1', 'meet3_b1', 'meet3_a2'];
  att.forEach((q, i) => callTo(w, q, seats[i], 70));
  const topic = R.pick(['マルシンとの取引条件', '物流の外注化', '営業の人員配置', '赤字取引先の整理', '賞与の原資', '新しい倉庫管理システム', '値上げの交渉方針']);
  log(w, `3階会議室で月曜の経営会議。議題は「${topic}」`, { cat: '経営', who: att });
  const clash = rel(w, s, sh).aff < 5 || R.chance(0.35);
  runLines(w, 'talk', { A: sh, B: s, C: att[2] || s }, clash ? [
    ['A', `${topic}は、((今期中に結論を出したい|思い切って変えたい))`],
    ['B', '((社長、それは現場を知らない人の考えです|会長はご存じなんですか|拙速です))'],
    ['A', '((専務の時代とは違うんです|じゃあ代案を出してください|僕が責任を取ります))'],
    ['C', '…'],
  ] : [
    ['A', `${topic}について、意見を聞かせてください`],
    ['B', '((段階的に進めましょう|現場とすり合わせます|数字を出してから判断しましょう))'],
    ['A', '((わかりました。それで|任せます))'],
  ], {}, R.int(5, 15), { place: 'meet3' });
  if (clash) {
    affect(w, sh, s, -6, -3); affect(w, s, sh, -8, -3);
    log(w, `会議で社長と専務が「${topic}」をめぐって対立。他の出席者は黙っていた`, { lvl: 1, cat: '経営', who: [sh, s] });
    const sec = w.secrets.find(x => x.kind === 'faction');
    if (!sec && rel(w, s, sh).aff < -20) newSecret(w, { kind: 'faction', subj: [s], text: '専務が会長に、社長のやり方はおかしいって直訴したらしい', sev: 2, known: [s, kaicho(w)].filter(Boolean) });
  }
  return true;
});

// ===== 会社:取引先 新規開拓 =====
const NEW_CLIENTS = [
  ['新潟駅前ホテルリバーサイド', 'ホテル', 4.2e6, 0.17], ['居酒屋チェーン 越後ノ蔵', '居酒屋チェーン', 6e6, 0.155], ['こども食堂ネットワーク新潟', '福祉', 0.6e6, 0.08],
  ['新発田の老人ホーム やすらぎ', '介護施設', 2.2e6, 0.15], ['燕市の学童・給食受託 エヌケイ', '給食受託', 3.5e6, 0.12], ['亀田のパン工房 こむぎ', 'ベーカリー', 1.1e6, 0.18],
  ['万代の韓国料理 ソウル食堂', '飲食店', 1.4e6, 0.17], ['阿賀野の道の駅 うららの森', '道の駅', 1.6e6, 0.16], ['新潟工業団地の社員食堂', '社員食堂', 2.8e6, 0.13],
  ['地場スーパー まるよし', 'スーパー', 9e6, 0.115], ['スポーツクラブの売店', '売店', 0.8e6, 0.2], ['ビジネスホテル東港', 'ホテル', 1.9e6, 0.16],
  ['お弁当のまごころ亭', '弁当製造', 4.8e6, 0.11], ['寿司 はなぶさ(5店舗)', '寿司店', 3.2e6, 0.16],
];
E('newclient', 'afternoon', w => 0.22, w => {
  const p = pickW(active(w).filter(q => q.role === 'sales' && q.today?.in), q => q.skill.sales + q.st.motiv);
  if (!p) return false;
  const used = new Set(w.clients.map(c => c.name));
  const nc = R.pick(NEW_CLIENTS.filter(c => !used.has(c[0])));
  if (!nc) return false;
  if (R.chance(0.45 - p.skill.sales / 400)) {
    say(w, 'eigyo', p, null, `${nc[0]}さん、((今回は見送りでした|${R.pick(w.competitors)}さんで決まったそうです|価格で負けました))`, R.int(1, 20));
    stat(p, 'motiv', -5);
    return true;
  }
  const c = { id: 'k' + w.clients.length, name: nc[0], full: nc[0], kind: nc[1], area: '県内', base: nc[2] * R.f(0.7, 1.2), margin: nc[3] - R.f(0, 0.02), terms: 1, cat: '業務用', rep: p.id, contact: { sei: R.pick(['小池', '堀川', '佐久間', '松田', '吉川', '藤井']), mei: '', type: R.pick(['温厚', '厳しい', 'ルーズ']), title: R.pick(['店長', '購買担当', '社長']) }, rel: 55, health: R.int(40, 80), status: 'active', since: D(w).y, mtd: 0, ytd: 0, hist: [], mood: 0, risky: R.chance(0.3) };
  w.clients.push(c);
  say(w, 'eigyo', p, null, `${c.name}さん、((来月から|来週から))お取引いただけることになりました{!}((月${Math.round(c.base / 1e4)}万くらいの見込みです|まずは一部の商品から))`, R.int(1, 20));
  const b = boss(w, p);
  if (b) say(w, 'eigyo', b, p, { pos: '((よくやった|ナイス|おめでとう))！', neg: '((よし|粗利は大丈夫なんだろうな|ようやくか))' }[b.b5.A < 40 ? 'neg' : 'pos'], R.int(20, 60));
  log(w, `営業の${full(p)}が新規取引先「${c.name}」(${c.kind})を獲得。月商見込み約${Math.round(c.base / 1e4)}万円`, { lvl: 1, cat: '取引', who: [p] });
  stat(p, 'motiv', 12); stat(p, 'mood', 12); p.eval = p.eval === 'B' ? 'B+' : p.eval;
  remember(w, p, `${c.name}の新規取引をとった`, null, 3);
  return true;
});

// ===== 取引先:値下げ要求 =====
E('pricecut', 'afternoon', w => (w.day - (w.lastPricecut ?? -99) < 20 ? 0 : 0.14), w => {
  const c = pickW(activeClients(w), x => Math.sqrt(x.base / 1e6) * (x.contact.type === '値切り魔' ? 3 : 1));
  if (!c) return false;
  const rep = repOf(w, c); if (!rep || rep.status !== 'active') return false;
  const pct = R.pick([1, 1.5, 2, 3, 5]);
  w.lastPricecut = w.day;
  const b = boss(w, rep);
  log(w, `${c.name}の${c.contact.sei}${c.contact.title}から、来月からの納価を${pct}%下げてほしいと要請。担当は${full(rep)}`, { lvl: c.base > 3e7 ? 2 : 1, cat: '取引', who: [rep] });
  say(w, 'eigyo', rep, b, `{cust}さんから納価${pct}%ダウンの要請が来ました。((競合の見積もりを見せられました|全社的な方針だそうです|飲めなければ一部の商品を切り替えると))`, R.int(1, 30), { cust: c.name });
  cont(w, dayMin(w, R.int(3, 10), 15, 0), 'pricecut_result', { c: c.id, pct, rep: rep.id });
  return true;
});

// ===== 仕入:値上げ通知 =====
E('supplyup', 'morning', w => 0.1 + Math.max(0, (w.eco.usd - 145) / 200), w => {
  const s = R.pick(w.suppliers);
  const pct = R.pick([3, 5, 8, 10, 12, 15]);
  const reason = R.pick(['原材料価格の高騰', '円安の進行', '物流費・人件費の上昇', 'エネルギーコストの上昇', '不作']);
  const b = P(w, s.rep);
  log(w, `${s.name}から${s.item}の${pct}%値上げの通知(${reason}のため)。${R.pick(['来月1日から', '再来月の納品分から'])}`, { lvl: 1, cat: '取引', who: b ? [b] : [] });
  if (b && b.status === 'active') say(w, 'eigyo', b, null, `${s.name}さんから値上げの案内が来ました。${s.item}が${pct}%((上がります|アップです))。お客さんへの価格転嫁、各担当で((交渉お願いします|検討お願いします))`, R.int(5, 40));
  w.fin.costPush = clamp((w.fin.costPush || 0) + pct / 100 * 0.06, 0, 0.12);
  cont(w, dayMin(w, R.int(14, 30), 10, 0), 'tenka', { pct, item: s.item });
  return true;
});

// ===== 取引先:倒産・夜逃げ =====
E('client_bankrupt', 'morning', w => (w.day - (w.lastCB ?? -999) < 90 ? 0 : activeClients(w).some(c => c.health < 30) ? 0.12 : 0.02), w => {
  w.lastCB = w.day;
  const c = pickW(activeClients(w).filter(c => c.name !== 'マルシン'), x => Math.max(1, 60 - x.health) * (x.risky ? 2 : 1));
  if (!c) return false;
  const ar = w.fin.ar.filter(a => a.client === c.id);
  const loss = ar.reduce((s, a) => s + a.amt, 0) + c.mtd;
  ar.forEach(a => { a.cut = R.f(0, 0.08); });
  c.status = 'bankrupt';
  const rep = repOf(w, c);
  headline(w, `取引先「${c.name}」が事業を停止。売掛金 約${Math.round(loss / 1e4)}万円が回収困難に`, rep ? [rep] : [], '取引');
  w.fin.mtd.special = (w.fin.mtd.special || 0) - loss * 0.95;
  if (rep) {
    say(w, 'eigyo', rep, null, `{cust}さん、((今朝行ったらシャッターに張り紙が|電話がつながりません|弁護士から通知が届きました))`, R.int(1, 10), { cust: c.name });
    stat(rep, 'stress', 20); remember(w, rep, `担当の${c.name}が倒産した`, null, 3);
    const b = boss(w, rep);
    if (b) say(w, 'eigyo', b, rep, { pos: '((すぐ戻ってきて。対応を考えよう|与信の管理、全社で見直そう))', neg: '((だから言っただろう|支払いが遅れてた時点でなんで止めなかった))' }[b.b5.A < 40 ? 'neg' : 'pos'], R.int(12, 30));
    if (b && b.b5.A < 40) affect(w, rep, b, -6, -3);
  }
  news(w, { sec: '経済', head: `${c.full}が破産申請へ 負債${R.f(1.2, 8).toFixed(1)}億円`, body: `${c.area}で${c.kind}を営む${c.full}は、事業を停止し、破産申請の準備に入った。${R.pick(['新型コロナ後の客足の戻りの鈍さ', '食材・人件費の高騰', '過剰な出店', '後継者不在'])}が響いた。帝国データの調べでは、取引先は約${R.int(40, 180)}社に及ぶ。` });
  return true;
});

// ===== 取引先:競合への乗り換え =====
E('client_lost', 'afternoon', w => 0.06, w => {
  const c = pickW(activeClients(w).filter(c => c.name !== 'マルシン'), x => Math.max(1, 70 - x.rel) * (x.base < 1e7 ? 2 : 1));
  if (!c || c.rel > 48) return false;
  c.status = 'lost';
  const comp = R.pick(w.competitors);
  const rep = repOf(w, c);
  log(w, `${c.name}が仕入先を${comp}に切り替えると通告。月${Math.round(c.base / 1e4)}万円の取引がなくなる`, { lvl: 2, cat: '取引', who: rep ? [rep] : [] });
  if (rep) { say(w, 'eigyo', rep, null, `{cust}さん、${comp}さんに切り替えるそうです。((申し訳ありません|価格です|先方の担当者が変わってから…))`, R.int(1, 20), { cust: c.name }); stat(rep, 'stress', 12); stat(rep, 'motiv', -10); remember(w, rep, `${c.name}を${comp}に取られた`, null, 3); }
  return true;
});

// ===== 取引先:異物混入 =====
E('ibutsu', 'afternoon', w => 0.05, w => {
  const c = pickW(activeClients(w), x => x.base / 1e6);
  if (!c) return false;
  const prod = pickProduct(); const thing = R.pick(['小さな虫', 'ビニール片', '金属片', '髪の毛', '結束バンドの切れ端']);
  const rep = repOf(w, c); const lb = byKey(w, 'butsuryubucho');
  const serious = thing === '金属片' && R.chance(0.5);
  log(w, `${c.name}から、納品した${prod}に${thing}が混入していたと連絡。${serious ? '店頭の商品を撤去・回収へ' : 'メーカーと原因を調査'}`, { lvl: serious ? 3 : 2, cat: '品質', who: [rep, lb].filter(Boolean) });
  if (rep) say(w, 'eigyo', rep, null, `至急です。{cust}さんで${prod}に${thing}が入っていたとのことです。((現物を回収に行きます|写真もらいました))`, R.int(1, 10), { cust: c.name });
  if (lb) say(w, 'butsuryu', lb, null, `${prod}のロット、出荷を止めてください。在庫は全数隔離`, R.int(5, 20));
  c.rel -= serious ? 15 : 6;
  addExpense(w, '雑損失', serious ? R.int(150, 600) * 10000 : R.int(5, 40) * 10000);
  if (serious) {
    news(w, { sec: '県内', head: `${c.kind === 'スーパー' ? '県内スーパー' : '県内'}で${prod}に金属片 自主回収`, body: `${c.full}は、販売した${prod}の一部に金属片が混入していたとして、自主回収を始めた。健康被害の報告はない。製造元と卸売業者が混入の経路を調べている。` });
    w.fin.scandal = (w.fin.scandal || 0) + 2;
  }
  return true;
});

// ===== 物流:トラック故障・ドライバー不足 =====
E('truck', 'morning', w => 0.15, w => {
  const t = R.pick(w.trucks);
  const d = pickWhere(active(w), q => q.role === 'driver' && q.today?.in);
  log(w, `${t.label}(走行${Math.round(t.km / 1000)}千km)が${R.pick(['エンジン不調', '冷凍機の故障', 'パンク', 'バッテリー上がり', 'ブレーキの異音'])}。${R.pick(['傭車(北越運輸)を手配', '営業車で一部を分納', '配送ルートを組み替えた'])}`, { lvl: 1, cat: '物流', who: d ? [d] : [] });
  addExpense(w, '修繕費', R.int(5, 60) * 10000); addExpense(w, '傭車費', R.int(4, 9) * 10000);
  if (d) say(w, 'butsuryu', d, null, `${t.label}、((エンジンかかりません|冷凍機が止まってます|パンクしてます))`, R.int(1, 10));
  return true;
});
E('driver_short', 'afternoon', w => (w.day - (w.lastDriverShort ?? -999) < 240 ? 0 : 0.05), w => {
  w.lastDriverShort = w.day;
  w.fin.freightUp = clamp((w.fin.freightUp || 1) + 0.08, 1, 1.5);
  log(w, `外注先の北越運輸から、ドライバー不足を理由に運賃を${R.pick([8, 10, 12])}%上げたいと申し入れ`, { lvl: 1, cat: '物流' });
  const lb = byKey(w, 'butsuryubucho'); if (lb) say(w, 'butsuryu', lb, null, '北越運輸さんから運賃の値上げの話が来た。((断れる状況じゃない|うちのドライバーをもう一人増やすしかないか))', R.int(10, 40));
  return true;
});

// ===== 設備:冷凍庫の故障 =====
E('freezer', 'night', w => (w.day - (w.lastFreezer ?? -999) < 150 ? 0 : 0.02 + (D(w).m >= 7 && D(w).m <= 8 ? 0.03 : 0)), w => {
  w.lastFreezer = w.day;
  const loss = R.int(120, 680) * 10000;
  headline(w, `夜間に冷凍庫の冷凍機が停止。朝までに庫内温度が-5℃まで上昇し、冷凍食品 約${Math.round(loss / 1e4)}万円分を廃棄`, [], '設備');
  addExpense(w, '商品廃棄損', loss);
  const lb = byKey(w, 'butsuryubucho');
  if (lb) { say(w, 'butsuryu', lb, null, '((緊急|至急))。冷凍庫止まってた。((警報、誰も気づかなかったのか|保険会社に連絡する))。今日の冷凍品の出荷は全部確認してから', 520); stat(lb, 'stress', 20); }
  return true;
});

// ===== 情報システム =====
E('system_down', 'morning', w => 0.07, w => {
  const it = byKey(w, 'soumuit');
  const hrs = R.int(2, 7);
  log(w, `販売管理システムが朝から停止。約${hrs}時間、受注を手書きとFAXで受けた。${it ? it.sei + 'がベンダーと電話をつないだまま対応' : ''}`, { lvl: 1, cat: 'システム', who: it ? [it] : [] });
  if (it) { say(w, 'all', it, null, `販売管理システムが((ログインできない|起動しない))状態です。((復旧作業中|ベンダーに連絡済み))です。受注は紙の伝票でお願いします`, 2); stat(it, 'stress', 12); }
  const o = pickWhere(visible(w), q => q.age > 55);
  if (o) talk(w, o, it || o, 'だから((紙に戻せって言ってるんだ|昔のオフコンのほうが止まらなかった))', R.int(10, 40));
  return true;
});
E('phish', 'afternoon', w => 0.06, w => {
  const p = pickW(visible(w).filter(isOffice), q => (100 - q.b5.C) / 10 + (q.age > 55 ? 3 : 0));
  const it = byKey(w, 'soumuit');
  if (!p) return false;
  const big = R.chance(0.07) && !w.done?.ransom;
  if (big) { w.done = w.done || {}; w.done.ransom = true; }
  if (!big) {
    log(w, `${full(p)}が「請求書送付のお知らせ」という偽メールの添付ファイルを開いてしまう。${it ? it.sei : '総務'}がLANケーブルを抜いて調査。被害なし`, { lvl: 1, cat: 'システム', who: [p, it].filter(Boolean) });
    if (it) talk(w, it, p, '((あ、それ押しちゃダメなやつ|ケーブル抜きます！|パスワード、すぐ変えてください))', 2);
    stat(p, 'stress', 6); return true;
  }
  const days = R.int(3, 9), cost = R.int(400, 1600) * 10000;
  headline(w, `ランサムウェア被害。社内のサーバーとパソコンが暗号化され、受発注・請求が停止。復旧に${days}日の見込み`, [p, it].filter(Boolean), '事件');
  addExpense(w, '特別損失(システム復旧)', cost);
  w.fin.mtd.extra.busy = true;
  for (const c of activeClients(w)) c.rel -= 3;
  board(w, { type: '重要', title: 'システム障害について(社外秘)', author: byKey(w, 'soumubucho')?.id, body: `現在、社内のサーバーがサイバー攻撃を受け、利用できない状態です。\n・社外への説明は「システム障害」で統一してください\n・私物のUSBメモリやスマホを社内PCにつながないこと\n・取引先からの問い合わせは営業部長に集約します\n復旧の見込みは追って連絡します。` });
  news(w, { sec: '経済', head: '新潟市の食品卸にサイバー攻撃 受注業務が停止', body: `新潟市東区の食品卸「${w.company.name}」で、社内のサーバーがランサムウェアに感染し、受発注などの業務が停止した。同社は警察に相談し、外部の専門業者と復旧を進めている。取引先への納品は手作業で続けている。`, company: true });
  w.fin.scandal = (w.fin.scandal || 0) + 4;
  if (it) { stat(it, 'stress', 35); stat(it, 'fatigue', 30); remember(w, it, 'ランサムウェアの復旧で何日も泊まり込んだ', null, 4); }
  remember(w, p, '自分が開いたメールでランサムウェアに感染させてしまった', null, 5); stat(p, 'stress', 40); stat(p, 'quit', 15);
  return true;
});

// ===== 不正:横領 =====
E('embezzle_start', 'night', w => (w.secrets.some(s => s.kind === 'embezzle' && !s.exposed) ? 0 : 0.04), w => {
  const p = pickW(active(w).filter(q => (q.role === 'acct' || q.role === 'sales' || q.role === 'buyer') && q.traits.integ < 40 && (q.st.debt > 20 || q.life.gamble || q.traits.spend > 70) && !q.arcs.embezzle), q => (60 - q.traits.integ) + q.st.debt);
  if (!p) return false;
  const how = p.role === 'acct' ? '小口現金と振込先の付け替え' : p.role === 'sales' ? '集金した現金の一部を入金しない' : '仕入先への架空発注とキックバック';
  p.arcs.embezzle = { how, total: 0, since: w.day };
  newSecret(w, { kind: 'embezzle', subj: [p], text: `${p.sei}さん、最近やけに金回りよくない？`, sev: 4, how, known: [] });
  cont(w, dayMin(w, R.int(20, 40), 22, 0), 'embezzle_step', { p: p.id });
  return true;
}, { quiet: true });

// ===== 不正:粉飾の相談 =====
E('funshoku', 'evening', w => (trailingOrd(w, 6) < -8e6 && creditScore(w) < 50 && !w.fin.cooked && !w.done?.funshoku ? 0.3 : 0), w => {
  w.done = w.done || {}; w.done.funshoku = true;
  const sh = shacho(w), k = byKey(w, 'keirikacho');
  if (!sh || !k) return false;
  callTo(w, k, 'pres_0', 40); callTo(w, sh, 'pres_2', 40);
  runLines(w, 'talk', { A: sh, B: k }, [
    ['A', 'このままの数字だと、銀行の格付けが落ちる。在庫の評価、もう少し何とかならないか'],
    ['B', { pos: '…社長、それは粉飾です', neg: '…どのくらい、ですか' }],
    ['A', '((一時的なことだ|来期で取り戻す|みんなの雇用を守るためだ))'],
  ], {}, 2, { place: 'pres' });
  const yes = k.traits.integ < 55 || k.traits.loyal > 70;
  if (yes) {
    w.fin.cooked = { since: w.day, amt: R.int(30, 80) * 1e6 };
    w.fin.equity += w.fin.cooked.amt;
    newSecret(w, { kind: 'funshoku', subj: [sh, k], text: '決算の在庫、実際よりかなり多く計上してるらしい', sev: 5, known: [] });
    remember(w, k, '社長に頼まれて、在庫を水増しした', sh, 5); stat(k, 'stress', 25);
    log(w, `夕方、社長室に経理課長が呼ばれ、ドアが閉められた`, { lvl: 1, cat: '経営', who: [sh, k] });
  } else {
    affect(w, sh, k, -10, -10); remember(w, k, '社長から在庫の水増しを持ちかけられ、断った', sh, 5); stat(k, 'stress', 15); stat(k, 'quit', 10);
    log(w, `社長室で社長と経理課長が長時間の話し合い。課長は硬い表情で出てきた`, { lvl: 1, cat: '経営', who: [sh, k] });
  }
  return true;
});

// ===== 不正:賞味期限ラベルの貼り替え =====
E('label', 'night', w => trailingOrd(w, 3) < -1.5e7 && !w.flags?.label ? 0.008 : 0, w => {
  const lb = byKey(w, 'butsuryubucho'), sh = byKey(w, 'butsuryushunin');
  if (!lb) return false;
  w.flags = w.flags || {}; w.flags.label = { day: w.day };
  const doers = [lb, sh].filter(Boolean);
  newSecret(w, { kind: 'label', subj: doers, text: '倉庫で期限切れ間近の商品のラベル、貼り替えてるらしい', sev: 5, known: active(w).filter(q => q.role === 'souko').slice(0, 1) });
  for (const q of active(w).filter(q => q.role === 'souko')) { stat(q, 'stress', 8); remember(w, q, '期限のラベルを貼り替える作業を指示された', lb, 4); }
  return true;
}, { quiet: true });

// ===== 外部:労基署・税務調査 =====
E('roukisho', 'morning', w => (w.done?.rouki ? 0 : 0.004 + active(w).filter(q => (q.flags.overwork || 0) > 3).length * 0.002), w => {
  w.done = w.done || {}; w.done.rouki = w.day;
  const amt = R.int(600, 2800) * 10000;
  headline(w, `新潟労働基準監督署の調査が入る。未払い残業代を指摘され、過去2年分 約${Math.round(amt / 1e4)}万円の支払いを求める是正勧告`, [byKey(w, 'soumubucho')].filter(Boolean), '外部');
  addExpense(w, '特別損失(未払残業代)', amt);
  for (const q of active(w).filter(q => q.emp === '正社員')) { stat(q, 'sat', 3); }
  const sb = byKey(w, 'soumubucho'); if (sb) { stat(sb, 'stress', 25); }
  board(w, { type: '重要', title: '勤怠管理の徹底について', author: sb?.id, body: '本日より、タイムカードの打刻後の業務を禁止します。やむを得ず残業する場合は、事前に所属長の承認を得てください。サービス残業は会社として認めていません。' });
  return true;
});
E('zeimu', 'morning', w => { const m = D(w).m; if (w.day - (w.lastZeimu ?? -999) < 700) return 0; return m >= 9 || m <= 2 ? 0.02 : 0.004; }, w => {
  w.lastZeimu = w.day;
  const extra = w.fin.cooked ? R.int(300, 900) * 1e4 : R.int(80, 600) * 1e4;
  const kk = keiri(w);
  log(w, `新潟税務署の税務調査が${R.int(2, 4)}日間の予定で入る。応接室に資料が積まれる`, { lvl: 2, cat: '外部', who: kk ? [kk] : [] });
  if (kk) { callTo(w, kk, 'ouse1_0', 300); stat(kk, 'stress', 20); }
  cont(w, nextBizDelay(w, R.int(2, 4), 16, 0), 'zeimu_result', { extra });
  return true;
});

// ===== 銀行 =====
E('bank_visit', 'afternoon', w => (w.day - (w.fin.lastBank ?? -99) < 25 ? 0 : 0.12 + (projectMonthEnd(w) < 3e7 ? 2 : 0)), w => {
  w.fin.lastBank = w.day;
  const b = w.banks.find(x => x.main); const sh = shacho(w); const sb = byKey(w, 'soumubucho');
  if (!sh) return false;
  const need = projectMonthEnd(w) < 3e7;
  const score = creditScore(w);
  log(w, `${b.name}${b.branch}の${b.contact.sei}${b.contact.title}が来社。${need ? '運転資金の追加融資について' : '決算書の説明と今期の見通しについて'}社長・総務部長と面談`, { lvl: need ? 2 : 1, cat: '金融', who: [sh, sb].filter(Boolean) });
  if (sh.today?.in) callTo(w, sh, 'ouse1_0', 60); if (sb && sb.today?.in) callTo(w, sb, 'ouse1_1', 60);
  if (need) {
    const amt = Math.round((3.5e7 - projectMonthEnd(w)) / 1e7 + 1) * 1e7;
    if (score >= 45) {
      borrow(w, b, amt, 5);
      log(w, `${b.name}が${Math.round(amt / 1e4)}万円の融資を実行(5年返済・保証協会付き)。当面の資金繰りはつながった`, { lvl: 2, cat: '金融' });
    } else if (score >= 28) {
      const b2 = w.banks.find(x => !x.main && !x.zerozero) || b;
      borrow(w, b2, amt * 0.6, 5);
      log(w, `${b.name}は融資を見送り。${b2.name}が${Math.round(amt * 0.6 / 1e4)}万円だけ応じた。条件として月次の試算表の提出を求められる`, { lvl: 2, cat: '金融' });
      stat(sh, 'stress', 15);
    } else {
      log(w, `${b.name}は「今の数字では稟議が通らない」と追加融資を断った`, { lvl: 3, cat: '金融', who: [sh] });
      stat(sh, 'stress', 30); w.fin.warn = (w.fin.warn || 0) + 1;
    }
  }
  return true;
});

// ===== M&Aの打診 =====
E('ma_offer', 'afternoon', w => (w.day - (w.lastMA ?? -999) < 300 ? 0 : trailingOrd(w, 12) < 0 ? 0.025 : 0.006), w => {
  w.lastMA = w.day;
  const sh = shacho(w); if (!sh) return false;
  const who = R.pick(['東京の投資ファンド', '県内最大手のホクシン', '関東の食品商社', '地銀系のM&A仲介会社']);
  log(w, `${who}から、株式の譲渡(会社の売却)についての打診。社長は「検討する」とだけ答えた`, { lvl: 2, cat: '経営', who: [sh] });
  newSecret(w, { kind: 'ma', subj: [sh], text: `会社、${who}に売られるかもしれないって`, sev: 3, known: [byKey(w, 'soumubucho')].filter(Boolean) });
  stat(sh, 'stress', 8);
  const k = kaicho(w);
  if (k && R.chance(0.6)) later(w, R.int(1440, 4000), 'call', { fn: 'ma_kaicho', args: { who } });
  return true;
});

// ===== SNS炎上 =====
E('sns', 'night', w => (w.day - (w.lastSns ?? -999) < 500 ? 0 : 0.006), w => {
  w.lastSns = w.day;
  const p = pickW(active(w).filter(q => q.age < 26), q => 100 - q.b5.C);
  if (!p) return false;
  const what = R.pick(['倉庫の冷凍庫の中で寝そべる動画', '配送中のトラックから撮った危険運転の動画', '取引先の店舗のバックヤードで撮った写真', '「今日も期限切れ売りつけた」という冗談の投稿']);
  headline(w, `${p.dept}の${full(p)}がSNSに投稿した${what}が拡散。会社名が特定される`, [p], '事件');
  news(w, { sec: '社会', head: '食品卸の従業員が不適切動画 会社が謝罪', body: `新潟市の食品卸「${w.company.short}」の従業員が、${what.replace('動画', '動画を').replace('写真', '写真を').replace('投稿', '投稿を')}SNSに載せ、批判が相次いでいる。同社はホームページで謝罪し「従業員の教育を徹底する」としている。`, company: true });
  w.fin.scandal = (w.fin.scandal || 0) + 3;
  for (const c of activeClients(w)) c.rel -= 2;
  stat(p, 'stress', 50); remember(w, p, 'SNSの投稿で会社に大迷惑をかけた', null, 5);
  p.flags.disciplinary = true;
  cont(w, nextBizDelay(w, 2, 10), 'discipline', { p: p.id, why: 'SNSへの不適切な投稿' });
  return true;
});

// ===== 自然・季節 =====
E('heavysnow', 'morning', w => (w.weather?.kind === '大雪' ? 3 : 0), w => {
  const late = atWork(w).length;
  log(w, `大雪(積雪${w.weather.snowDepth}cm)。配送は${R.int(1, 3)}時間遅れ。駐車場の除雪を男性社員総出で行う`, { lvl: 2, cat: '天候' });
  const lb = byKey(w, 'butsuryubucho') || byKey(w, 'haisha');
  if (lb) say(w, 'butsuryu', lb, null, '本日は大雪のため、((全ルート1時間以上の遅れ|午前便は中止))です。営業さんはお客さんへの連絡をお願いします', 1);
  const ad = adminVoice(w);
  if (ad) board(w, { type: 'お知らせ', title: '雪かき当番について', author: ad.id, body: '本日、駐車場と出入口の除雪を行います。手の空いている方は、スコップとスノーダンプを使って協力をお願いします。屋根からの落雪に十分注意してください。' });
  addExpense(w, '除雪費', R.int(5, 15) * 10000);
  return true;
});
E('quake', 'afternoon', w => 0.0025, w => {
  const sh = R.pick([4, 4, 5, 5, 6]);
  headline(w, `地震。新潟市で震度${sh === 6 ? '5強' : sh === 5 ? '5弱' : '4'}。${sh >= 5 ? '倉庫の棚から商品が落下し、一部破損' : '大きな被害はなし'}`, [], '天災');
  if (sh >= 5) addExpense(w, '災害損失', R.int(80, 900) * 10000);
  news(w, { sec: '県内', head: `${R.pick(['中越', '下越', '佐渡付近', '新潟県沖'])}で震度${sh === 6 ? '5強' : sh === 5 ? '5弱' : '4'}の地震`, body: `${D(w).m}月${D(w).d}日午後、新潟県で強い揺れを観測した。津波の心配はない。${sh >= 5 ? '県内では落下物によるけが人が出ている。' : ''}` });
  for (const p of atWork(w)) stat(p, 'stress', 6);
  return true;
});

// ===== 季節の行事 =====
E('kenshin', 'morning', w => { const d = D(w); return d.m === 6 && d.d < 20 ? 1.2 : 0; }, w => {
  const ps = R.sample(active(w), 6);
  log(w, `健康診断の日。${ps.map(p => p.sei).join('・')}が午前中に健診センターへ。前日の夜からの絶食で${ps[0].sei}は機嫌が悪い`, { cat: '行事', who: ps });
  for (const p of ps) if (p.age > 45 && R.chance(0.4)) { p.flags.saikensa = true; }
  return true;
});

// ===== 盗難・倉庫の在庫が合わない =====
E('stockgap', 'afternoon', w => 0.06, w => {
  const lb = byKey(w, 'butsuryubucho') || byKey(w, 'butsuryushunin');
  if (!lb) return false;
  const prod = R.pick(['缶ビール(ケース)', '牛タン(冷凍)', 'うなぎの蒲焼き', '和牛の切り落とし', 'カニ(冷凍)', '日本酒(一升瓶)', 'サラダ油(16.5kg缶)']);
  const n = R.int(3, 25);
  log(w, `棚卸しで${prod}が${n}ケース合わない。${R.pick(['入力ミスの可能性', '誰かが持ち出した可能性'])}も含めて調査`, { lvl: 1, cat: '物流', who: [lb] });
  say(w, 'butsuryu', lb, null, `${prod}、帳簿と${n}ケース合いません。((心当たりある人は言ってください|防犯カメラ確認します|出荷伝票と突き合わせます))`, R.int(1, 20));
  addExpense(w, '棚卸減耗', n * R.int(8, 30) * 1000);
  if (R.chance(0.4)) {
    const th = pickW(active(w).filter(q => q.role === 'souko' || q.role === 'driver'), q => (100 - q.traits.integ) + q.st.debt);
    if (th) newSecret(w, { kind: 'theft', subj: [th], text: `倉庫の${prod}、${th.sei}さんが車に積んでたのを見たって人がいる`, sev: 4, known: [], prod });
  }
  return true;
});

// ===== 人事:中途採用の面接 =====
E('interview', 'afternoon', w => (w.hiring?.length ? 1.6 : 0), w => {
  const h = w.hiring.shift(); if (!h) return false;
  const r = ROSTER.find(x => x.key === h.key) || ROSTER.find(x => x.role === h.role);
  const np = makePerson({ ...r, newhire: false, age: [Math.max(20, r.age[0] - 8), r.age[1]] });
  np.status = 'pending';
  np.key = h.key; np.desk = h.desk; np.dept = h.dept; np.title = ''; np.rank = Math.min(r.rank, 2); np.joined = D(w).y; np.joinAge = np.age;
  if (!np.life.prev) np.life.prev = R.pick(['地元のスーパー', '運送会社', '派遣の事務', '食品工場', '東京の会社(Uターン)']);
  const ivr = bossOf(w, np) || byKey(w, 'soumubucho');
  log(w, `中途採用の面接。応募者は${np.age}歳・${np.gender === 'f' ? '女性' : '男性'}(前職:${np.life.prev})。面接官は${ivr ? full(ivr) : '総務部長'}`, { cat: '人事', who: ivr ? [ivr] : [] });
  w.people.push(np);
  np.flags.joinDay = w.day + R.int(14, 30);
  np.flags.replacing = h.name;
  later(w, (np.flags.joinDay - w.day) * 1440 - (w.t % 1440) + 8 * 60, 'call', { fn: 'join', args: { p: np.id } });
  return true;
});

// ============================================================
// 続き(何日もかけて進む話)。キューから名前で呼ばれる
// ============================================================
export const CONT = {};

// ---- 恋愛 ----
CONT.romance_step = (w, { a, b }) => {
  const A = P(w, a), B = P(w, b);
  if (!A || !B || A.status !== 'active' || B.status !== 'active' || !A.arcs.romance) return;
  const r = A.arcs.romance; const stage = r.stage;
  const ok = rel(w, A, B).aff + rel(w, B, A).aff + R.f(-30, 50) > 40;
  if (!ok) {
    if (stage >= 3) {
      log(w, `${A.sei}と${B.sei}の様子がよそよそしい。${R.pick(['昼休みに別々に出ていった', '会議で目を合わせない', 'チャットのやりとりが事務的になった'])}`, { cat: '噂', who: [A, B] });
      affect(w, A, B, -25, -20); affect(w, B, A, -25, -20); stat(A, 'mood', -20); stat(B, 'mood', -20);
      remember(w, A, `${B.sei}さんと別れた`, B, 4); remember(w, B, `${A.sei}さんと別れた`, A, 4);
      const leaver = R.chance(0.3) ? (A.b5.N > B.b5.N ? A : B) : null;
      if (leaver) stat(leaver, 'quit', 25);
      const s = w.secrets.find(x => x.kind === 'romance' && x.subj.includes(A.id)); if (s) s.text = `${A.sei}さんと${B.sei}さん、別れたらしいよ`;
    }
    delete A.arcs.romance; delete B.arcs.romance; return;
  }
  r.stage = stage + 1; B.arcs.romance.stage = stage + 1;
  affect(w, A, B, 10, 8); affect(w, B, A, 10, 8);
  if (r.stage === 2) {
    say(w, 'dm', A, B, R.pick(['今週の金曜、((空いてます？|ごはん行きませんか))', '((この前の店|気になってた店))、((予約取れました|行ってみません？))']), R.int(30, 180), {}, { to: B });
    say(w, 'dm', B, A, R.pick(['空いてます{w}', '((ぜひ|行きたいです))！', '金曜なら大丈夫です']), R.int(200, 300), {}, { to: A });
  } else if (r.stage === 3) {
    addTag(w, A, B, 'lover');
    const sec = newSecret(w, { kind: r.affair ? 'affair' : 'romance', subj: [A, B], text: r.affair ? `${A.sei}さんと${B.sei}さん、どっちかは結婚してるのに…二人で${R.pick(['新潟駅のホテル', '万代のバー', '弥彦のほう'])}にいたって` : `${A.sei}さんと${B.sei}さん、付き合ってるらしいよ`, sev: r.affair ? 4 : 2 });
    log(w, `終業後、${A.sei}と${B.sei}が時間をずらして退社した`, { cat: '噂', who: [A, B] });
    stat(A, 'mood', 15); stat(B, 'mood', 15);
  } else if (r.stage >= 5 && !r.affair && single(A) && single(B) && R.chance(0.5)) {
    A.life.married = true; B.life.married = true;
    const f = A.gender === 'f' ? A : B, m = f === A ? B : A;
    say(w, 'all', m, null, `私事で恐縮ですが、このたび${f.dept}の${f.sei}さんと結婚することになりました。((社内でのことでお騒がせしますが|驚かせてすみません))、今後ともよろしくお願いいたします`, R.int(5, 30));
    log(w, `${full(m)}と${full(f)}が社内結婚を発表。${R.pick(['薄々気づいていた人が多かった', '多くの社員が驚いた', '給湯室がしばらくその話題でもちきり'])}`, { lvl: 2, cat: '暮らし', who: [A, B] });
    f.maiden = f.sei; if (R.chance(0.85)) f.sei = m.sei;
    for (const q of active(w).filter(q => q !== A && q !== B).slice(0, 6)) say(w, 'zatsudan', q, m, R.pick(['おめでとうございます！', 'おめでとう！やっぱりね{w}', 'おめでとうございます〜！全然気づかなかった']), R.int(20, 200));
    delete A.arcs.romance; delete B.arcs.romance; return;
  } else if (r.affair && r.stage >= 5 && R.chance(0.2)) {
    CONT.affair_exposed(w, { a, b }); return;
  }
  cont(w, dayMin(w, R.int(10, 30), 12, 20), 'romance_step', { a, b });
};
CONT.affair_exposed = (w, { a, b }) => {
  const A = P(w, a), B = P(w, b); if (!A || !B) return;
  const married = !single(A) ? A : B;
  headline(w, `${full(married)}の配偶者が会社に電話。「${married === A ? B.sei : A.sei}という社員と夫(妻)の関係について話がしたい」`, [A, B], '噂');
  for (const q of active(w)) { const s = w.secrets.find(x => x.kind === 'affair' && x.subj.includes(A.id)); if (s && R.chance(0.6)) tell(w, s, q); }
  stat(A, 'stress', 40); stat(B, 'stress', 40); stat(married, 'quit', 30); stat(married === A ? B : A, 'quit', 40);
  if (R.chance(0.5)) { married.life.married = false; married.life.divorced = true; later(w, R.int(20, 60) * 1440, 'call', { fn: 'divorce_news', args: { p: married.id } }); }
  const sb = byKey(w, 'soumubucho');
  if (sb) log(w, `総務部長が二人を別々に呼んで事情を聞いた。${R.chance(0.5) ? '一人を倉庫事務所に異動させる案が出ている' : '会社としては私生活には立ち入らない方針'}`, { lvl: 1, cat: '人事', who: [sb, A, B] });
  delete A.arcs.romance; delete B.arcs.romance;
};
CONT.divorce_news = (w, { p }) => { const q = P(w, p); if (!q || q.status !== 'active') return; log(w, `${full(q)}が離婚したらしい。${R.pick(['住所変更の届けが出た', '扶養の手続きが変わった', '指輪をしていない'])}`, { cat: '噂', who: [q] }); stat(q, 'mood', -15); };

// ---- 転職活動 ----
CONT.jobhunt_step = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'active' || !q.arcs.jobhunt) return;
  const j = q.arcs.jobhunt;
  if (q.st.quit < 30 && j.stage < 3) { delete q.arcs.jobhunt; remember(w, q, '転職はひとまずやめた', null, 1); return; }
  j.stage++;
  if (j.stage === 2) {
    q.flags.vacFrom = q.flags.vacTo = w.day + 1; q.flags.vacReason = '私用';
    log(w, `${full(q)}が${R.pick(['午後半休', '有給', '「通院」で早退'])}。最近こういう日が多い`, { cat: '噂', who: [q] });
    cont(w, dayMin(w, R.int(7, 20), 8, 50), 'jobhunt_step', { p });
  } else if (j.stage === 3) {
    const comp = R.pick([...w.competitors, '県外のメーカー', '市役所の会計年度任用職員', '東京の会社(リモート)', '取引先の' + R.pick(w.clients).name, '親戚の会社']);
    j.to = comp;
    const b = bossOf(w, q) || shacho(w);
    log(w, `${full(q)}が${b ? b.sei + titleShort(b) : '上司'}に「お話があります」と声をかけ、会議室へ`, { lvl: 1, cat: '人事', who: [q, b].filter(Boolean) });
    if (b) {
      callTo(w, q, 'meet3_a3', 30); callTo(w, b, 'meet3_b3', 30);
      runLines(w, 'talk', { A: q, B: b }, [
        ['A', '[[突然すみません。||すみません、]]((一身上の都合で|家庭の事情で|やりたいことができて))、((来月末で|〇月いっぱいで))退職させていただきたいです'],
        ['B', { pos: '((そうか…。理由を聞いてもいいか|まずは座って。何があった？|考え直す余地はある？))', neg: '((このタイミングで？|今辞められたら困るんだけど|どこに行くの))' }],
        ['A', `${comp.includes('取引先') || w.competitors.includes(comp) ? '((まだ言えません|同業です…すみません))' : '((次は決まってます|' + comp + 'です))'}`],
      ], {}, 3, { place: 'meet3' });
      cont(w, dayMin(w, R.int(2, 6), 17, 30), 'jobhunt_step', { p });
    }
  } else if (j.stage === 4) {
    const b = bossOf(w, q);
    const stay = q.traits.loyal > 60 && R.chance(0.35) || (b && rel(w, q, b).aff > 40 && R.chance(0.3));
    if (stay) {
      q.salary += R.pick([10000, 15000, 20000]); stat(q, 'quit', -40); delete q.arcs.jobhunt;
      log(w, `${full(q)}は引き止めに応じ、残ることに。月${R.pick(['1万', '1万5千', '2万'])}円の昇給が約束された(本人以外には内緒)`, { lvl: 1, cat: '人事', who: [q] });
      newSecret(w, { kind: 'raise', subj: [q], text: `${q.sei}さん、辞めるって言って給料上げてもらったらしいよ`, sev: 2, known: [b].filter(Boolean) });
    } else {
      CONT.resign(w, { p, to: j.to });
    }
  }
};
CONT.resign = (w, { p, to, quiet }) => {
  const q = P(w, p); if (!q || q.status !== 'active') return;
  const lastDay = w.day + R.int(14, 35);
  q.flags.lastDay = lastDay; q.flags.goingTo = to || '未定';
  log(w, `${full(q)}(${q.dept}・勤続${D(w).y - q.joined}年)が退職へ。最終出社は${fmtDate(dateOf(lastDay), false)}`, { lvl: 2, cat: '人事', who: [q] });
  board(w, { type: '人事', title: `退職者のお知らせ(${q.dept} ${q.sei})`, author: byKey(w, 'soumubucho')?.id, body: `${q.dept} ${full(q)}さんが、${fmtDate(dateOf(lastDay), false)}付で退職されます。後任・引き継ぎは${bossOf(w, q)?.sei || '所属長'}から連絡します。` });
  for (const r of active(w).filter(r => r !== q && rel(w, r, q).aff > 25).slice(0, 3)) say(w, 'dm', r, q, R.pick(['[[辞めるって本当ですか…||辞めるってほんと？]]', '((寂しくなります|マジか…))。((最後に飲みに行きましょう|次はどこ？))', '((聞きました|知らなかった))。((今までありがとうございました|お疲れさまでした))']), R.int(60, 600), {}, { to: q });
  if (q.role === 'sales') for (const c of w.clients) if (c.rep === q.id) c.rel -= R.int(2, 6);
  for (const r of deptMates(w, q)) stat(r, 'stress', 4);
  later(w, (lastDay - w.day) * 1440 - (w.t % 1440) + 17 * 60 + 20, 'call', { fn: 'lastday', args: { p } });
  if (q.traits.integ < 35 && q.role === 'sales' && w.competitors.includes(to)) {
    later(w, R.int(20, 50) * 1440, 'call', { fn: 'poach', args: { p, to } });
  }
};
CONT.lastday = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'active') return;
  say(w, 'all', q, null, R.pick([
    `本日で退職いたします。在職中は大変お世話になりました。((ご迷惑をおかけしたことも多かったと思いますが、|))皆さんのご健康とご活躍をお祈りしております`,
    `最終日となりました。${D(w).y - q.joined}年間、本当にありがとうございました。((どこかで見かけたら声をかけてください|丸栄商事で働けてよかったです))`,
    `お世話になりました。((引き継ぎ漏れがあったら個人の携帯に連絡ください|デスクの引き出しの中身は処分してください))`,
  ]), 0);
  const fr = active(w).filter(r => r !== q && rel(w, r, q).aff > 10).slice(0, 5);
  fr.forEach((r, i) => say(w, 'all', r, q, R.pick(['お疲れさまでした！', 'ありがとうございました。お元気で', 'お疲れ様でした。また飲みましょう', '@sticker:thanks']), 2 + i * R.int(1, 6)));
  q.status = 'quit'; q.quitDay = w.day; q.today = { in: false };
  w.stats.quits++;
  log(w, `${full(q)}が最終出社を終えて退職。${fr.length ? fr.map(r => r.sei).join('・') + 'が駐車場まで見送った' : '静かに帰っていった'}`, { lvl: 1, cat: '人事', who: [q] });
  if (q.role === 'sales') reassignClients(w, q);
  if (q.emp !== '役員') { w.hiring = w.hiring || []; w.hiring.push({ key: q.key, role: q.role, desk: q.desk, dept: q.dept, name: q.sei }); }
  for (const r of active(w)) if (rel(w, r, q).aff > 30) { stat(r, 'quit', 3); remember(w, r, `${q.sei}さんが辞めた`, q, 2); }
};
CONT.poach = (w, { p, to }) => {
  const q = P(w, p); if (!q) return;
  const lost = w.clients.filter(c => c.status === 'active' && c.name !== 'マルシン' && R.chance(0.25)).slice(0, 2);
  for (const c of lost) c.status = 'lost';
  if (!lost.length) return;
  headline(w, `元社員の${full(q)}が移った${to}に、${lost.map(c => c.name).join('・')}が取引を切り替え。顧客リストの持ち出しが疑われる`, [], '取引');
  const s = shacho(w); if (s) say(w, 'all', s, null, '((顧客情報の扱いについて|退職者との接触について))、改めて徹底してください。((弁護士に相談しています|このようなことは許されない))', R.int(30, 120));
};
CONT.join = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'pending') return;
  q.status = 'active'; q.joined = D(w).y;
  w.stats.hires++;
  log(w, `中途入社の${full(q)}(${q.age}歳)が${q.dept}に着任。${q.flags.replacing ? q.flags.replacing + 'さんの後任' : ''}`, { lvl: 1, cat: '人事', who: [q] });
  say(w, 'all', q, null, `本日より${q.dept}でお世話になります、${full(q)}です。前職は${q.life.prev}でした。((ご迷惑をおかけすることも多いと思いますが、|一日も早く戦力になれるよう))よろしくお願いいたします`, R.int(30, 90));
  for (const r of active(w)) { const x = rel(w, r, q); x.fam = 5; x.aff = Math.round(R.normal(5, 10)); }
};

// ---- メンタル不調 ----
CONT.mental_step = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'active' || !q.arcs.mental) return;
  const m = q.arcs.mental; m.stage++;
  if (q.st.stress < 55 && m.stage < 4) { delete q.arcs.mental; q.flags.sickBias = 0; return; }
  if (m.stage === 2) {
    log(w, `${full(q)}が今月${R.int(3, 6)}回目の欠勤。「頭痛」「腹痛」と連絡が来る`, { cat: '人事', who: [q] });
    const b = bossOf(w, q);
    if (b) say(w, 'dm', b, q, b.b5.A > 50 ? '体調大丈夫？((無理しないで、一度病院に行ってみて|少し休んでもいいから))' : '((休みが続いてるけど、仕事回らないよ|明日は来れるの？))', R.int(60, 180), {}, { to: q });
    cont(w, nextBizDelay(w, R.int(5, 12), 8, 10), 'mental_step', { p });
  } else if (m.stage === 3) {
    q.status = 'leave'; q.leaveReason = '休職(適応障害)';
    const months = R.int(1, 4);
    headline(w, `${full(q)}が「適応障害」の診断書を提出し、${months}か月の休職に入る`, [q], '人事');
    board(w, { type: '人事', title: `${q.dept} ${q.sei}さんの休職について`, author: byKey(w, 'soumubucho')?.id, body: `${q.dept}の${q.sei}さんは、本日より当面のあいだ休職されます。業務は${bossOf(w, q)?.sei || '所属長'}の指示に従って分担してください。本人への業務連絡は控えてください。` });
    const b = bossOf(w, q);
    if (b) { const s = w.secrets.find(x => x.kind === 'pawahara' && x.subj[0] === b.id); if (s) { s.sev = 5; for (const r of R.sample(active(w), 6)) tell(w, s, r); } }
    for (const r of deptMates(w, q)) stat(r, 'stress', 6);
    if (q.role === 'sales') reassignClients(w, q);
    cont(w, months * 30 * 1440, 'mental_step', { p });
  } else {
    if (q.status !== 'leave') return;
    if (R.chance(0.5)) {
      q.status = 'active'; q.st.stress = 45; q.flags.sickBias = 0.05; delete q.arcs.mental;
      log(w, `${full(q)}が休職から復帰。当面は時短勤務`, { lvl: 1, cat: '人事', who: [q] });
      say(w, 'all', q, null, '((長いあいだご迷惑をおかけしました|本日から復帰しました))。((少しずつ慣らしていきます|よろしくお願いします))', R.int(30, 90));
    } else {
      q.status = 'active'; delete q.arcs.mental;
      CONT.resign(w, { p, to: '療養に専念' });
      q.flags.lastDay = w.day + 1;
    }
  }
};
CONT.sick_return = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'leave' || !q.arcs.sick) return;
  q.status = 'active'; delete q.arcs.sick; q.st.health = 75;
  log(w, `${full(q)}が退院し、職場に復帰`, { cat: '暮らし', who: [q] });
  say(w, 'all', q, null, '((ご心配をおかけしました|長らく休んでしまいすみませんでした))。本日より復帰します', R.int(30, 120));
};

// ---- 飲み会の続き ----
CONT.drunk = (w, { party, place }) => {
  const ps = party.map(id => P(w, id)).filter(Boolean);
  if (ps.length < 2) return;
  const roll = R.weighted([{ k: 'secret', w: 2 }, { k: 'fight', w: 1 }, { k: 'love', w: 1.2 }, { k: 'boss', w: 1.5 }, { k: 'none', w: 3 }]).k;
  const [a, b] = R.sample(ps, 2);
  if (roll === 'secret') {
    const sec = w.secrets.find(s => knows(s, a) && !knows(s, b) && !s.exposed && !s.subj.includes(a.id));
    if (sec) { tell(w, sec, b); log(w, `${place}で、酔った${a.sei}が${b.sei}に「ここだけの話」をした`, { cat: '噂', who: [a, b] }); }
  } else if (roll === 'fight') {
    log(w, `${place}で${a.sei}と${b.sei}が${R.pick(['仕事の進め方', '会社の将来', '昔のミス', '政治の話', '野球'])}をめぐって口論。店の人に注意された`, { lvl: 1, cat: '人間関係', who: [a, b] });
    affect(w, a, b, -15, -5); affect(w, b, a, -15, -5);
  } else if (roll === 'love' && a.gender !== b.gender && !a.arcs.romance && !b.arcs.romance) {
    affect(w, a, b, 15, 6); affect(w, b, a, 10, 4);
    log(w, `二次会のあと、${a.sei}と${b.sei}は二人で${R.pick(['もう一軒', 'ラーメン屋', '万代のバー'])}へ`, { cat: '噂', who: [a, b] });
  } else if (roll === 'boss') {
    const target = R.pick(active(w).filter(q => q.boss && !ps.includes(q))) || shacho(w);
    if (target) {
      log(w, `${place}で${a.sei}が${target.sei}${titleShort(target)}の悪口を大声で。${b.sei}が「声大きいって」と止めた`, { cat: '噂', who: [a, b] });
      for (const q of ps) affect(w, q, target, -2, 0);
      if (R.chance(0.3)) { const sec = newSecret(w, { kind: 'warukuchi', subj: [a], text: `${a.sei}さん、飲み会で${target.sei}${titleShort(target)}のことボロクソに言ってたらしい`, sev: 2, known: ps }); }
    }
  }
  // 翌朝
  for (const q of ps) { q.flags.hangover = w.day + 1; }
};
CONT.senmu_grumble = (w, { idea }) => {
  const s = senmu(w), k = kaicho(w); if (!s) return;
  const to = liked(w, s, active(w).filter(q => q.age > 45 && q !== s)) || byKey(w, 'eigyobucho');
  if (to) say(w, 'dm', s, to, `「${idea}」ね…((また東京かぶれが|現場がどれだけ大変かわかってない|会長には言ってあるのかね))`, R.int(5, 30), {}, { to });
};
CONT.idea_result = (w, { k }) => {
  const i = IDEAS.find(x => x.k === k); const sh = shacho(w); if (!i || !sh) return;
  const good = R.chance(i.good + (sh.b5.C - 50) / 200);
  if (good) {
    log(w, `社長肝いりの「${i.t}」、${R.pick(['意外と社内に定着してきた', '取引先から評判がいい', '若手が楽しそうにやっている'])}`, { lvl: 1, cat: '経営', who: [sh] });
    if (i.k === 'ec' || i.k === 'furusato' || i.k === 'kitchen') w.clients.push({ id: 'k' + w.clients.length, name: i.t, full: i.t, kind: '自社事業', area: '全国', base: R.f(0.8, 3) * 1e6, margin: 0.22, terms: 0, cat: '自社', rep: sh.id, contact: { sei: '-', title: '-', type: '温厚' }, rel: 80, health: 90, status: 'active', since: D(w).y, mtd: 0, ytd: 0, hist: [], mood: 0 });
    for (const q of active(w)) if (q.age < 35) stat(q, 'motiv', 3);
  } else {
    log(w, `社長肝いりの「${i.t}」は${R.pick(['いつの間にか誰も話題にしなくなった', '担当者に丸投げされ、残業が増えただけだった', '費用ばかりかさんで中止が決まった', '朝礼で一度触れられたきり'])}`, { lvl: 1, cat: '経営', who: [sh] });
    if (i.cost) addExpense(w, '新規事業費', i.cost * 0.6);
    for (const q of active(w)) if (q.age > 40) stat(q, 'sat', -1);
  }
};
CONT.pricecut_result = (w, { c, pct, rep }) => {
  const cl = w.clients.find(x => x.id === c); const r = P(w, rep); if (!cl || cl.status !== 'active') return;
  const negot = (r ? r.skill.neg : 50) + cl.rel / 2 + R.f(-30, 30);
  if (negot > 70) { log(w, `${cl.name}の値下げ要請、${r ? r.sei : '担当'}が粘って${(pct / 2).toFixed(1)}%で決着`, { cat: '取引', who: r ? [r] : [] }); cl.margin -= pct / 200 * 0.4; if (r) stat(r, 'motiv', 5); }
  else if (negot > 35) { log(w, `${cl.name}の値下げ要請、${pct}%をそのまま受け入れることに`, { cat: '取引', who: r ? [r] : [] }); cl.margin -= pct / 100 * 0.4; }
  else if (cl.name === 'マルシン' && negot > 15) { log(w, `マルシンの値下げ要請、${pct}%のうち半分を飲み、残りは「物流協力金」の名目で毎月支払うことに`, { lvl: 1, cat: '取引', who: r ? [r] : [] }); cl.margin -= pct / 100 * 0.35; }
  else { log(w, `${cl.name}との値下げ交渉が決裂。${R.pick(['一部の商品', '冷凍食品のカテゴリ', '米の取引'])}を${R.pick(w.competitors)}に切り替えられた`, { lvl: 2, cat: '取引', who: r ? [r] : [] }); cl.base *= cl.name === 'マルシン' ? R.f(0.86, 0.93) : R.f(0.6, 0.85); if (r) { stat(r, 'stress', 10); stat(r, 'motiv', -10); } }
  cl.margin = Math.max(0.02, cl.margin);
};
CONT.tenka = (w, { pct, item }) => {
  const ok = R.f(0, 1) < 0.55 + (w.eco.cpi - 100) / 50;
  if (ok) { w.fin.costPush = Math.max(0, (w.fin.costPush || 0) - pct / 100 * 0.05); log(w, `${item}の値上げ分、主要な取引先への価格転嫁がおおむね通った`, { cat: '取引' }); }
  else { log(w, `${item}の値上げ分、${R.pick(['マルシン', '古町横丁グループ', 'きらく弁当'])}など大口が転嫁に応じず、粗利が圧迫されている`, { lvl: 1, cat: '取引' }); for (const c of activeClients(w)) if (R.chance(0.3)) c.margin -= 0.003; }
};
CONT.embezzle_step = (w, { p }) => {
  const q = P(w, p); if (!q || q.status !== 'active' || !q.arcs.embezzle) return;
  const e = q.arcs.embezzle;
  const take = R.int(8, 60) * 10000;
  e.total += take; w.fin.cash -= take; addExpense(w, '雑損失', take * 0);
  q.st.debt = clamp(q.st.debt - 10, 0, 100);
  const sec = w.secrets.find(s => s.kind === 'embezzle' && s.subj[0] === q.id);
  // 発覚の判定:経理のまじめさ・総額
  const checker = byKey(w, 'keirikacho') || byKey(w, 'keiri');
  const catchP = (checker && checker !== q ? checker.b5.C / 600 : 0.02) + e.total / 6e7;
  if (R.chance(catchP)) { CONT.embezzle_found(w, { p, by: checker?.id }); return; }
  if (sec && R.chance(0.2)) { const g = R.pick(active(w)); if (g !== q) tell(w, sec, g); }
  cont(w, dayMin(w, R.int(10, 30), 22, 0), 'embezzle_step', { p });
};
CONT.embezzle_found = (w, { p, by }) => {
  const q = P(w, p), c = P(w, by); if (!q) return;
  const e = q.arcs.embezzle; delete q.arcs.embezzle;
  headline(w, `${c ? full(c) + 'が帳簿の不審な点に気づき、' : ''}${full(q)}による着服が発覚。手口は「${e.how}」。被害額は少なくとも約${Math.round(e.total / 1e4)}万円`, [q, c].filter(Boolean), '不正');
  const sh = shacho(w);
  if (sh) { callTo(w, q, 'pres_stand', 60); callTo(w, sh, 'pres_desk', 60); runLines(w, 'talk', { A: sh, B: q }, [['A', '((なんでこんなことを|説明してくれ|いつからだ))'], ['B', '…((借金があって|返すつもりでした|すみません、すみません))'], ['A', '((家族は知ってるのか|信じてたんだぞ|弁護士と相談する))']], {}, 3, { place: 'pres' }); }
  const sec = w.secrets.find(s => s.kind === 'embezzle' && s.subj[0] === q.id); if (sec) sec.exposed = true;
  addSpecial(w, e.total * R.f(0.1, 0.5)); // 一部は弁済
  cont(w, nextBizDelay(w, 1, 10), 'discipline', { p, why: '業務上横領', fire: true, police: R.chance(0.5) });
  for (const r of active(w)) { stat(r, 'sat', -2); if (rel(w, r, q).aff > 30) remember(w, r, `${q.sei}さんの横領が発覚した。信じられない`, q, 3); }
};
CONT.discipline = (w, { p, why, fire, police }) => {
  const q = P(w, p); if (!q || q.status !== 'active') return;
  const sb = byKey(w, 'soumubucho');
  if (fire || R.chance(0.3)) {
    board(w, { type: '人事', title: '懲戒処分について', author: sb?.id, body: `${q.dept}所属の社員1名を、${why}により就業規則第${R.int(40, 60)}条に基づき懲戒解雇としました。社外からの問い合わせには一切応じず、総務部に回してください。` });
    q.status = 'quit'; q.quitDay = w.day; q.fired = true; q.today = { in: false };
    log(w, `${full(q)}が懲戒解雇に。デスクの私物は総務が段ボールにまとめた`, { lvl: 2, cat: '人事', who: [q] });
    if (police) news(w, { sec: '社会', head: '勤務先の金を着服 容疑で元社員を逮捕', body: `新潟東署は、勤務していた新潟市東区の食品卸会社の金約${Math.round(R.f(150, 900))}万円を着服したとして、業務上横領の疑いで${q.age}歳の元社員を逮捕した。「生活費や借金の返済に使った」と容疑を認めている。`, company: true });
    if (q.role === 'sales') reassignClients(w, q);
    w.hiring = w.hiring || []; w.hiring.push({ key: q.key, role: q.role, desk: q.desk, dept: q.dept, name: q.sei });
  } else {
    q.salary = Math.round(q.salary * 0.9 / 1000) * 1000; stat(q, 'quit', 25);
    board(w, { type: '人事', title: '懲戒処分について', author: sb?.id, body: `${why}により、社員1名を減給処分としました。全社員、コンプライアンスの意識を改めて徹底してください。` });
    log(w, `${full(q)}に減給処分`, { lvl: 1, cat: '人事', who: [q] });
  }
};
CONT.zeimu_result = (w, { extra }) => {
  if (w.fin.cooked) {
    headline(w, `税務調査で在庫の過大計上を指摘される。修正申告と重加算税で約${Math.round(extra / 1e4)}万円。銀行にも事情を説明する必要が出てきた`, [shacho(w)].filter(Boolean), '不正');
    w.fin.equity -= w.fin.cooked.amt; w.fin.cooked = null; w.fin.scandal = (w.fin.scandal || 0) + 15;
    const s = w.secrets.find(x => x.kind === 'funshoku'); if (s) s.exposed = true;
    cont(w, nextBizDelay(w, 3, 14), 'bank_angry', {});
  } else log(w, `税務調査が終了。交際費と外注費の一部を否認され、追徴 約${Math.round(extra / 1e4)}万円`, { lvl: 1, cat: '外部' });
  addExpense(w, '租税公課(追徴)', extra);
};
CONT.bank_angry = (w) => {
  if (w.fin.bankAngry) return; w.fin.bankAngry = true;
  const b = w.banks.find(x => x.main); const sh = shacho(w);
  headline(w, `${b.name}が粉飾を問題視。新規融資を停止し、${R.pick(['金利の引き上げ', '担保の追加', '社長個人の保証の上乗せ'])}を求めてきた`, [sh].filter(Boolean), '金融');
  for (const x of w.banks) x.rate += 0.01;
  w.fin.bankFreeze = w.day + 180;
};
CONT.ma_kaicho = (w, { who }) => {
  const k = kaicho(w), sh = shacho(w); if (!k || !sh) return;
  log(w, `会長が、会社売却の話を聞きつけて激怒。「${R.pick(['わしの目の黒いうちは', '親父が作った会社を', '社員を売る気か'])}」`, { lvl: 2, cat: '経営', who: [k, sh] });
  affect(w, k, sh, -20, -15); affect(w, sh, k, -10, -5); stat(sh, 'stress', 15);
};

// ---- 噂が広まりきったとき ----
export function exposeSecret(w, s) {
  if (s.exposed) return;
  s.exposed = true;
  const subj = s.subj.map(id => P(w, id)).filter(Boolean);
  const sh = shacho(w);
  if (s.kind === 'pawahara') {
    const b = subj[0]; if (!b) return;
    headline(w, `${full(b)}によるパワハラが社内で問題に。複数の社員が総務部長に相談していたことがわかった`, [b], '人事');
    stat(b, 'stress', 25);
    if (R.chance(0.5)) { b.title = b.title.replace(/課長|部長/, m => m + '(代理)'); log(w, `${b.sei}は管理職から外れ、肩書きが変わった`, { lvl: 1, cat: '人事', who: [b] }); }
    else log(w, `${b.sei}は厳重注意にとどまった。相談した社員の間に不満が残る`, { lvl: 1, cat: '人事', who: [b] });
    b.flags.harass = 0;
  } else if (s.kind === 'theft') {
    const q = subj[0]; if (!q || q.status !== 'active') return;
    headline(w, `防犯カメラの映像から、${full(q)}が倉庫の商品(${s.prod})を持ち出していたことが判明`, [q], '不正');
    cont(w, nextBizDelay(w, 1, 10), 'discipline', { p: q.id, why: '会社の商品の窃盗', fire: true, police: R.chance(0.3) });
  } else if (s.kind === 'label') {
    headline(w, '倉庫で賞味期限のラベルを貼り替えていたことが、内部の告発で明るみに', subj, '不正');
    news(w, { sec: '社会', head: '食品卸が賞味期限を改ざん 新潟市が立ち入り', body: `新潟市東区の食品卸「${w.company.name}」が、賞味期限が迫った食品のラベルを貼り替え、期限を延ばして出荷していた疑いがあることがわかった。市保健所が食品表示法に基づき立ち入り調査を行った。同社は「事実関係を確認中」としている。`, company: true, big: true });
    w.fin.scandal = (w.fin.scandal || 0) + 25;
    for (const c of activeClients(w)) { c.rel -= 25; if (R.chance(0.3) && c.name !== 'マルシン') c.status = 'lost'; }
    const m = w.clients.find(c => c.name === 'マルシン'); if (m && m.status === 'active') { m.base *= 0.5; log(w, 'マルシンが取引を半分に減らすと通告', { lvl: 3, cat: '取引' }); }
    for (const q of subj) cont(w, nextBizDelay(w, 2, 10), 'discipline', { p: q.id, why: '食品表示の偽装', fire: R.chance(0.5) });
  } else if (s.kind === 'funshoku') {
    if (!w.fin.cooked) return;
    headline(w, '在庫の水増しによる粉飾決算が、社内の告発で銀行に伝わる', subj, '不正');
    w.fin.equity -= w.fin.cooked.amt; w.fin.cooked = null; w.fin.scandal = (w.fin.scandal || 0) + 20;
    cont(w, nextBizDelay(w, 2, 14), 'bank_angry', {});
  } else if (s.kind === 'embezzle') {
    const q = subj[0]; if (q && q.arcs.embezzle) CONT.embezzle_found(w, { p: q.id, by: null });
  } else if (s.kind === 'affair') {
    const [a, b] = subj; if (a && b) CONT.affair_exposed(w, { a: a.id, b: b.id });
  } else if (s.kind === 'romance') {
    log(w, `${subj.map(q => q.sei).join('さんと')}さんの交際は、もはや社内の公然の秘密になった`, { cat: '噂', who: subj });
  } else if (s.kind === 'ma') {
    log(w, '会社の売却話が社員のあいだに広まり、動揺が広がっている', { lvl: 2, cat: '噂' });
    for (const q of active(w)) stat(q, 'quit', 5);
  } else if (s.kind === 'raise') {
    log(w, `${subj[0]?.sei}さんの「辞める詐欺」昇給の話が広まり、同期が不満を募らせている`, { cat: '噂', who: subj });
    for (const q of active(w)) if (q !== subj[0] && Math.abs(q.age - (subj[0]?.age || 0)) < 6) stat(q, 'sat', -6);
  } else if (s.kind === 'jobhunt') {
    const q = subj[0]; if (q) { const b = bossOf(w, q); if (b) { affect(w, b, q, -8, -10); log(w, `${q.sei}の転職活動の噂が上司の${b.sei}の耳にも入った`, { cat: '噂', who: [q, b] }); } }
  }
}

// ===== よい知らせ =====
E('bigorder', 'morning', w => 0.18, w => {
  const p = pickW(active(w).filter(q => q.role === 'sales' && q.today?.in), q => q.skill.sales);
  if (!p) return false;
  const what = R.pick(['市の防災備蓄の入れ替え(アルファ米と缶詰)', '選挙事務所向けの弁当用食材', 'スポーツ大会の選手村の食材', '大型ホテルの宴会シーズンのスポット', '工場の周年記念行事の弁当', '県のイベントの物産展向け', 'フェリー会社の売店向けの土産菓子']);
  const amt = R.int(150, 900) * 1e4;
  w.fin.mtd.sales += amt; w.fin.mtd.cogs += amt * R.f(0.8, 0.88);
  say(w, 'eigyo', p, null, `((スポットですが|単発ですが))、${what}で約${Math.round(amt / 1e4)}万円の受注をいただきました{!}`, R.int(1, 20));
  log(w, `${full(p)}が${what}で約${Math.round(amt / 1e4)}万円のスポット受注`, { lvl: 1, cat: '取引', who: [p] });
  stat(p, 'motiv', 8); stat(p, 'mood', 8);
  return true;
});
E('subsidy', 'afternoon', w => (w.day - (w.lastSubsidy ?? -999) < 200 ? 0 : 0.03), w => {
  w.lastSubsidy = w.day;
  const amt = R.int(200, 1200) * 1e4; const what = R.pick(['事業再構築補助金', 'ものづくり補助金(冷凍設備の更新)', '省エネ設備の導入補助金', '県の物流効率化の補助金', '業務改善助成金']);
  addNonop(w, amt);
  log(w, `${what}の採択が決まり、約${Math.round(amt / 1e4)}万円が入る見込み`, { lvl: 1, cat: '金融', who: [byKey(w, 'soumubucho')].filter(Boolean) });
  return true;
});
E('priceup_ok', 'afternoon', w => 0.08, w => {
  const c = pickW(activeClients(w), x => x.rel); if (!c) return false;
  const rep = repOf(w, c); if (!rep || rep.status !== 'active') return false;
  c.margin += R.f(0.004, 0.012);
  log(w, `${c.name}が納価の改定(値上げ)を受け入れた。担当の${rep.sei}が${R.pick(['原価の資料を丁寧に説明した', '何度も足を運んだ', '先方の担当者と昔からの付き合いがある'])}`, { cat: '取引', who: [rep] });
  say(w, 'eigyo', rep, null, `{cust}さん、価格改定OKいただきました{!}`, R.int(1, 30), { cust: c.name });
  stat(rep, 'motiv', 6);
  return true;
});
E('refinance', 'afternoon', w => (w.fin.cash < 1.1e8 && w.day - (w.fin.lastLoan ?? -999) > 150 && !w.fin.bankFreeze ? 0.6 : 0), w => {
  const score = creditScore(w); const b = w.banks.find(x => x.main); const sh = shacho(w);
  w.fin.lastLoan = w.day;
  if (score < 42) { log(w, `${b.name}に運転資金の折り返し融資を打診したが、「業績の改善を確認してから」と保留に`, { lvl: 2, cat: '金融', who: sh ? [sh] : [] }); if (sh) stat(sh, 'stress', 10); return true; }
  const amt = R.pick([8e7, 1e8, 1.2e8, 1.5e8]);
  borrow(w, score > 55 ? b : (w.banks.find(x => !x.main && !x.zerozero) || b), amt, 7);
  log(w, `${score > 55 ? b.name : '新潟みなと信用金庫'}が${Math.round(amt / 1e4).toLocaleString()}万円の折り返し融資を実行(7年返済)。返済で減った分を借り直した形`, { lvl: 1, cat: '金融', who: sh ? [sh] : [] });
  return true;
});
