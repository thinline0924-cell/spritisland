// 会社・社員・取引先の初期状態をつくる

import { RNG, R, clamp, setSeedState } from './util.js';
import { SEI, MEI, HOME, BIRTHPLACE, SCHOOL_U, SCHOOL_S, SCHOOL_H, PREVJOB, HOBBY, CAR, PET, FOREIGN } from './names.js';
import { export_park } from './map.js';

export const COMPANY = {
  name: '丸栄商事株式会社', short: '丸栄商事', kana: 'まるえいしょうじ',
  founded: 1964, incorporated: 1968, capital: 30000000,
  addr: '新潟市東区', biz: '業務用食品・日配品・米穀・酒類の卸売、配送',
  motto: ['一、誠実をもって商いの道とする', '一、得意先の台所を支える', '一、和をもって社業の発展に尽くす'],
  founder: '丸山 栄蔵',
};

// 部署と役割の名簿(誰が何をするかの枠)。人そのものは種から毎回ちがう
const ROSTER = [
  { key: 'kaicho', dept: '役員', title: '代表取締役会長', age: [73, 78], g: 'm', emp: '役員', desk: 'kaicho_desk', rank: 10, role: 'exec', family: true },
  { key: 'shacho', dept: '役員', title: '代表取締役社長', age: [42, 47], g: 'm', emp: '役員', desk: 'pres_desk', rank: 9, role: 'exec', family: true },
  { key: 'senmu', dept: '役員', title: '専務取締役', age: [60, 64], g: 'm', emp: '役員', desk: 'senmu_desk', rank: 8, role: 'exec' },
  { key: 'soumubucho', dept: '総務経理部', title: '取締役 総務部長', age: [57, 60], g: 'm', emp: '役員', desk: 'soumu_h', rank: 7, role: 'admin', bankOB: true },
  { key: 'keirikacho', dept: '総務経理部', title: '経理課長', age: [52, 58], g: 'f', desk: 'soumu_L0', rank: 5, role: 'acct' },
  { key: 'keiri', dept: '総務経理部', title: '', age: [30, 38], g: 'f', desk: 'soumu_L1', rank: 2, role: 'acct' },
  { key: 'soumu', dept: '総務経理部', title: '', age: [24, 29], g: 'f', desk: 'soumu_R0', rank: 1, role: 'admin' },
  { key: 'soumuit', dept: '総務経理部', title: '主任', age: [33, 40], g: 'm', desk: 'soumu_R1', rank: 3, role: 'it' },
  { key: 'uketsuke', dept: '総務経理部', title: '', age: [46, 58], g: 'f', emp: 'パート', desk: 'soumu_L2', rank: 0, role: 'reception' },
  { key: 'eigyobucho', dept: '営業部', title: '営業部長', age: [52, 56], g: 'm', desk: 'bucho2', rank: 6, role: 'sales', boss: true },
  { key: 'e1kacho', dept: '営業一課', title: '課長', age: [44, 49], g: 'm', desk: 'eigyo1_h', rank: 5, role: 'sales', boss: true },
  { key: 'e1shunin', dept: '営業一課', title: '主任', age: [33, 38], g: 'm', desk: 'eigyo1_L0', rank: 3, role: 'sales' },
  { key: 'e1a', dept: '営業一課', title: '', age: [28, 32], g: 'm', desk: 'eigyo1_R0', rank: 2, role: 'sales' },
  { key: 'e1b', dept: '営業一課', title: '', age: [25, 27], g: 'm', desk: 'eigyo1_L1', rank: 1, role: 'sales' },
  { key: 'e1c', dept: '営業一課', title: '', age: [26, 30], g: 'f', desk: 'eigyo1_R1', rank: 1, role: 'sales' },
  { key: 'e1new', dept: '営業一課', title: '', age: [22, 23], g: '?', desk: 'eigyo1_L2', rank: 0, role: 'sales', newhire: true },
  { key: 'e2kacho', dept: '営業二課', title: '課長', age: [46, 51], g: 'm', desk: 'eigyo2_h', rank: 5, role: 'sales', boss: true },
  { key: 'e2a', dept: '営業二課', title: '', age: [38, 44], g: 'm', desk: 'eigyo2_L0', rank: 2, role: 'sales' },
  { key: 'e2b', dept: '営業二課', title: '', age: [24, 26], g: 'm', desk: 'eigyo2_R0', rank: 1, role: 'sales' },
  { key: 'e2c', dept: '営業二課', title: '', age: [29, 34], g: 'f', desk: 'eigyo2_L1', rank: 1, role: 'sales' },
  { key: 'e2new', dept: '営業二課', title: '', age: [22, 23], g: '?', desk: 'eigyo2_R1', rank: 0, role: 'sales', newhire: true },
  { key: 'ejimu1', dept: '営業部', title: '営業事務', age: [43, 51], g: 'f', desk: 'kobai_L1', rank: 1, role: 'jimu' },
  { key: 'ejimu2', dept: '営業部', title: '営業事務', age: [25, 32], g: 'f', emp: '契約社員', desk: 'kobai_R1', rank: 0, role: 'jimu' },
  { key: 'kobaikacho', dept: '購買部', title: '購買課長', age: [48, 54], g: 'm', desk: 'kobai_h', rank: 5, role: 'buyer', boss: true },
  { key: 'kobai1', dept: '購買部', title: '', age: [34, 39], g: 'm', desk: 'kobai_L0', rank: 2, role: 'buyer' },
  { key: 'kobai2', dept: '購買部', title: '', age: [26, 30], g: 'f', desk: 'kobai_R0', rank: 1, role: 'buyer' },
  { key: 'butsuryubucho', dept: '物流部', title: '物流センター長', age: [55, 59], g: 'm', desk: 'wof_4', rank: 6, role: 'logi', boss: true },
  { key: 'butsuryushunin', dept: '物流部', title: '主任', age: [40, 46], g: 'm', desk: 'wof_0', rank: 3, role: 'logi' },
  { key: 'haisha', dept: '物流部', title: '配車係', age: [30, 37], g: 'f', desk: 'wof_1', rank: 2, role: 'logi' },
  { key: 'driver1', dept: '物流部', title: 'ドライバー', age: [50, 57], g: 'm', desk: 'wof_2', rank: 1, role: 'driver', truck: 0 },
  { key: 'driver2', dept: '物流部', title: 'ドライバー', age: [36, 43], g: 'm', desk: 'wof_3', rank: 1, role: 'driver', truck: 1 },
  { key: 'driver3', dept: '物流部', title: 'ドライバー', age: [25, 31], g: 'm', desk: null, rank: 0, role: 'driver', truck: 2 },
  { key: 'souko1', dept: '物流部', title: '', age: [61, 65], g: 'm', emp: '嘱託', desk: null, rank: 1, role: 'souko' },
  { key: 'souko2', dept: '物流部', title: '', age: [19, 23], g: 'm', desk: null, rank: 0, role: 'souko' },
  { key: 'part1', dept: '物流部', title: '', age: [50, 59], g: 'f', emp: 'パート', desk: null, rank: 0, role: 'souko' },
  { key: 'part2', dept: '物流部', title: '', age: [42, 52], g: 'f', emp: 'パート', desk: null, rank: 0, role: 'souko' },
  { key: 'gaikoku', dept: '物流部', title: '', age: [24, 29], g: 'x', emp: '特定技能', desk: null, rank: 0, role: 'souko', foreign: true },
];

export const ROLE_LABEL = { exec: '役員', admin: '総務', acct: '経理', it: '総務(情シス兼務)', reception: '受付・庶務', sales: '営業', jimu: '営業事務', buyer: '購買', logi: '物流管理', driver: '配送', souko: '倉庫作業' };

function gen(age) { return age >= 50 ? 'old' : age >= 32 ? 'mid' : 'young'; }
function n50(sd = 17) { return clamp(Math.round(R.normal(50, sd)), 3, 97); }

const usedNames = new Set();
function pickName(g, age, forceSei) {
  for (let i = 0; i < 50; i++) {
    const sei = forceSei || R.pick(SEI);
    const mei = R.pick(MEI[g][gen(age)]);
    const k = sei + mei;
    if (!usedNames.has(k) && (forceSei || ![...usedNames].some(u => u.startsWith(sei)) || i > 25)) { usedNames.add(k); return { sei, mei }; }
  }
  return { sei: forceSei || R.pick(SEI), mei: R.pick(MEI[g][gen(age)]) };
}

function salaryFor(r, age) {
  const base = { kaicho: 600000, shacho: 900000, senmu: 700000, soumubucho: 620000 }[r.key];
  if (base) return base;
  if (r.emp === 'パート') return Math.round(1080 * 6 * 21 / 1000) * 1000;
  if (r.emp === '嘱託') return 220000;
  if (r.emp === '特定技能') return 205000;
  if (r.emp === '契約社員') return 200000;
  let s = 185000 + Math.max(0, age - 22) * 6200;
  if (r.title.includes('部長') || r.title.includes('センター長')) s = Math.max(s, 480000);
  else if (r.title.includes('課長')) s = Math.max(s, 400000);
  else if (r.title.includes('主任')) s = Math.max(s, 300000);
  if (r.role === 'driver') s += 40000;
  if (r.newhire) s = 210000;
  return Math.round(s / 1000) * 1000;
}

// 口調・チャットの癖
function makeStyle(p) {
  const young = p.age < 32, old = p.age >= 50, f = p.gender === 'f';
  const s = {};
  s.polite = clamp(0.55 + (p.b5.A - 50) / 200 + (p.b5.C - 50) / 250 + (p.rank <= 2 ? 0.15 : -0.05), 0.15, 1);
  s.excl = clamp((p.b5.E - 35) / 80 + (young ? 0.1 : 0), 0, 0.9);
  s.emoji = clamp((young ? 0.25 : 0.05) + (f ? 0.2 : 0) + (p.b5.E - 50) / 150, 0, 0.8);
  s.ojisan = old && !f && p.b5.E > 52 && R.chance(0.55); // 絵文字とカタカナ混じりの、いわゆるおじさん構文
  if (s.ojisan) s.emoji = 0.8;
  s.kao = !young && f && R.chance(0.6); // 顔文字 (^^)
  s.warai = young ? R.pick(['w', '笑', '笑', 'ww']) : old ? R.pick(['(笑)', '(笑)', '', '^_^']) : R.pick(['笑', '(笑)', '笑']);
  s.period = young ? R.pick(['none', 'none', 'normal']) : old && !f ? R.pick(['normal', 'dots', 'double']) : 'normal';
  s.typo = clamp(0.01 + (old ? 0.03 : 0) + (50 - p.b5.C) / 1500, 0, 0.08);
  s.otsukare = clamp(0.35 + s.polite * 0.4 - (young ? 0.15 : 0), 0, 0.95); // 「お疲れ様です。」で書き出す率
  s.short = clamp((50 - p.b5.A) / 100 + (p.rank >= 5 ? 0.3 : 0), 0, 0.8); // 返事がそっけない
  s.zenkaku = old && R.chance(0.6); // ！？を全角で打つ
  s.sticker = clamp((young ? 0.15 : 0.03) + (f ? 0.1 : 0) + (p.b5.E - 50) / 300, 0, 0.4);
  s.stickerSet = R.pick(['ねこ', 'くま', 'ペンギン', 'うさぎ', 'しば犬', 'おじさん', '敬語うさぎ', '笹団子']);
  s.dialect = p.local ? clamp((p.age - 30) / 40 + R.f(-0.2, 0.2), 0, 1) : 0;
  s.reply = clamp(Math.round(R.normal(old ? 9 : 4, 3)), 1, 25); // 返信までの分
  return s;
}

function makeLife(p) {
  const L = {};
  const a = p.age;
  L.home = R.pick(HOME);
  L.born = p.foreign ? p.foreignFrom : R.pick(BIRTHPLACE);
  p.local = !p.foreign && !/県|東京/.test(L.born);
  const married = a >= 27 && R.chance(clamp((a - 24) / 22, 0, 0.82));
  L.married = married;
  L.divorced = !married && a > 35 && R.chance(0.22);
  L.kids = [];
  if ((married || L.divorced) && a > 27) {
    const n = R.weighted([{ n: 0, w: 2 }, { n: 1, w: 3 }, { n: 2, w: 4 }, { n: 3, w: 1.2 }]).n;
    for (let i = 0; i < n; i++) { const k = clamp(a - R.int(26, 36) - i * R.int(2, 4), 0, 40); if (k >= 0) L.kids.push({ age: k, g: R.chance(0.5) ? 'm' : 'f' }); }
  }
  L.mortgage = married && a >= 30 && a < 60 && R.chance(0.55) ? R.int(1500, 3800) * 10000 : 0;
  L.parents = a > 45 ? R.weighted([{ v: '両親健在', w: a > 58 ? 1 : 4 }, { v: '父他界・母一人', w: 3 }, { v: '母他界・父一人', w: 1.5 }, { v: '両親他界', w: a > 55 ? 4 : 1 }]).v : '両親健在';
  L.care = a > 48 && /一人|健在/.test(L.parents) && R.chance(0.22);
  L.liveWithParents = !married && (a < 35 || R.chance(0.3)) && !p.foreign;
  L.hobby = R.sample(HOBBY, R.int(1, 2));
  L.car = p.foreign ? '自転車(冬は同僚の車に乗せてもらう)' : R.pick(CAR);
  L.commute = p.foreign ? '自転車' : (R.chance(0.08) && a < 30 ? 'バス(新潟交通)' : '車');
  L.pet = R.pick(PET);
  if (p.foreign) { L.edu = '母国の高校'; L.prev = '技能実習(食品工場・3年)'; }
  else if (p.role === 'souko' || p.role === 'driver' || R.chance(0.15)) { L.edu = R.pick(SCHOOL_H); }
  else if (R.chance(0.15)) L.edu = R.pick(SCHOOL_S);
  else L.edu = R.pick(SCHOOL_U);
  if (!L.prev) L.prev = p.joinAge > 25 ? R.pick(PREVJOB) : null;
  L.savings = Math.round(R.f(10, 900)) * 10000;
  L.gamble = p.traits && p.traits.spend > 70 && R.chance(0.35);
  L.health = a > 50 ? R.pick(['血圧が高め', '尿酸値が高い', '腰痛持ち', '特になし', '特になし', '糖尿病予備軍', '肝機能の数値が悪い']) : R.pick(['特になし', '特になし', '花粉症', '腰痛持ち', '偏頭痛', '胃が弱い']);
  return L;
}

let PID = 0;
export function makePerson(r, opts = {}) {
  const age = opts.age ?? R.int(r.age[0], r.age[1]);
  let g = r.g === '?' ? (R.chance(0.5) ? 'm' : 'f') : r.g;
  const p = { id: 'p' + (++PID), key: r.key, dept: r.dept, title: r.title, rank: r.rank, role: r.role, desk: r.desk, emp: r.emp || '正社員', boss: !!r.boss, truck: r.truck };
  if (r.foreign) {
    const fo = R.pick(FOREIGN); p.sei = fo.sei; p.mei = fo.mei; g = fo.g; p.foreign = true; p.foreignFrom = fo.from;
  } else {
    const nm = pickName(g, age, opts.sei); p.sei = nm.sei; p.mei = nm.mei;
  }
  p.gender = g; p.age = age;
  p.birth = { m: R.int(1, 12), d: R.int(1, 28) };
  p.joinAge = r.newhire ? age : opts.joinAge ?? clamp(Math.round(R.f(18, Math.min(age, 45))), 18, age);
  if (r.family) p.joinAge = Math.min(age, R.int(25, 32));
  if (r.key === 'senmu') p.joinAge = R.int(18, 23);
  p.joined = 2026 - (age - p.joinAge) - (r.newhire ? 0 : 0);
  if (r.newhire) p.joined = 2026;
  p.newhire = !!r.newhire;
  p.b5 = { O: n50(), C: n50(), E: n50(), A: n50(), N: n50() };
  if (r.role === 'sales') p.b5.E = clamp(p.b5.E + 12, 5, 95);
  if (r.role === 'acct') p.b5.C = clamp(p.b5.C + 15, 5, 95);
  p.traits = { amb: n50(20), loyal: clamp(n50() + (2026 - p.joined) * 0.8, 3, 97), gossip: n50(20), drink: n50(22), integ: n50(18), humor: n50(18), spend: n50(18) };
  if (r.key === 'senmu') p.traits.loyal = clamp(p.traits.loyal + 25, 0, 97);
  p.smoker = R.chance(g === 'm' ? (age > 45 ? 0.45 : 0.3) : 0.1);
  p.life = makeLife(p);
  p.style = makeStyle(p);
  p.salary = salaryFor(r, age);
  p.skill = { sales: n50(), office: n50(), phys: clamp(n50() + (age < 40 ? 10 : -5), 5, 95), neg: n50() };
  p.eval = R.pick(['B', 'B', 'B', 'B+', 'B-', 'A', 'C']);
  p.st = { stress: clamp(n50(12) - 15, 5, 80), mood: 60, health: clamp(90 - (age - 30) * 0.6 + R.normal(0, 6), 40, 100), fatigue: 20, motiv: n50(15), sat: n50(15), quit: 5, debt: 0 };
  if (p.newhire) { p.st.motiv = 70; p.st.stress = 30; p.st.sat = 60; }
  p.mem = []; p.arcs = {}; p.flags = {};
  p.status = 'active';
  p.nick = null;
  if (g === 'f' && p.life.married && R.chance(0.3) && !p.foreign && age > 35) p.maiden = R.pick(SEI); // 旧姓
  return p;
}

const CLIENTS = [
  { name: 'マルシン', full: '株式会社マルシン(スーパーマルシン)', kind: 'スーパー', area: '新潟市・下越 28店舗', base: 118e6, margin: 0.088, terms: 1, cat: '量販' },
  { name: 'ことぶきストア', full: '株式会社ことぶきストア', kind: 'スーパー', area: '新発田・阿賀野 8店舗', base: 21e6, margin: 0.118, terms: 1, cat: '量販' },
  { name: 'ヤマキ屋', full: '有限会社ヤマキ屋', kind: 'スーパー', area: '上越 5店舗', base: 13e6, margin: 0.12, terms: 1, cat: '量販' },
  { name: 'くすりのコバヤシ', full: '株式会社コバヤシ薬品', kind: 'ドラッグストア', area: '県内31店舗', base: 17e6, margin: 0.108, terms: 2, cat: '量販' },
  { name: '越後デリカ', full: '越後デリカ株式会社', kind: '惣菜工場', area: '新潟市北区', base: 16e6, margin: 0.098, terms: 1, cat: '量販' },
  { name: '長岡フレッシュ市場', full: '株式会社長岡フレッシュ市場', kind: '青果卸', area: '長岡市', base: 7e6, margin: 0.08, terms: 1, cat: '量販' },
  { name: '東部学校給食センター', full: '新潟市東部学校給食センター', kind: '学校給食', area: '新潟市東区', base: 11e6, margin: 0.1, terms: 1, cat: '業務用', school: true },
  { name: '白根中央病院', full: '医療法人白根会 白根中央病院', kind: '病院', area: '新潟市南区', base: 4.6e6, margin: 0.15, terms: 2, cat: '業務用' },
  { name: 'ホテル信濃川', full: '株式会社ホテル信濃川', kind: 'ホテル', area: '新潟市中央区 万代', base: 6.2e6, margin: 0.175, terms: 1, cat: '業務用' },
  { name: '月岡温泉 鶴の家', full: '有限会社鶴の家', kind: '旅館', area: '新発田市月岡温泉', base: 3.8e6, margin: 0.185, terms: 1, cat: '業務用' },
  { name: '雪国ホテル湯沢', full: '株式会社雪国リゾート', kind: 'ホテル', area: '湯沢町', base: 3.5e6, margin: 0.18, terms: 2, cat: '業務用', seasonal: 'winter' },
  { name: '古町横丁グループ', full: '株式会社古町横丁', kind: '居酒屋チェーン', area: '新潟市 12店舗', base: 13e6, margin: 0.158, terms: 1, cat: '業務用' },
  { name: '背脂一番', full: '株式会社麺処背脂一番', kind: 'ラーメンチェーン', area: '燕・三条・新潟 6店舗', base: 5.6e6, margin: 0.165, terms: 1, cat: '業務用' },
  { name: 'きらく弁当', full: '株式会社きらく', kind: '弁当製造', area: '新潟市江南区', base: 15e6, margin: 0.108, terms: 1, cat: '業務用' },
  { name: '北陸フードサービス', full: '北陸フードサービス株式会社', kind: '社員食堂の受託', area: '県内18事業所', base: 9.5e6, margin: 0.13, terms: 1, cat: '業務用' },
  { name: '道の駅 潟の里', full: '一般社団法人潟の里振興公社', kind: '道の駅', area: '新潟市江南区', base: 2.8e6, margin: 0.16, terms: 1, cat: '業務用' },
  { name: '両津観光ホテル', full: '株式会社両津観光ホテル', kind: 'ホテル', area: '佐渡市', base: 2.4e6, margin: 0.2, terms: 1, cat: '業務用', seasonal: 'summer' },
  { name: 'ケアホームさくら', full: '社会福祉法人さくら会', kind: '介護施設', area: '新潟市 5施設', base: 4.8e6, margin: 0.15, terms: 1, cat: '業務用' },
  { name: 'すずらん保育園', full: '社会福祉法人すずらん福祉会', kind: '保育園', area: '新潟市東区ほか 4園', base: 1.9e6, margin: 0.14, terms: 1, cat: '業務用' },
  { name: '焼肉ぎゅう太', full: '株式会社ぎゅう太フーズ', kind: '焼肉店', area: '新潟市・新発田 3店舗', base: 3.1e6, margin: 0.155, terms: 1, cat: '業務用', risky: true },
  { name: 'カフェ・ド・ミナト', full: '合同会社ミナト', kind: 'カフェ', area: '新潟市中央区', base: 0.9e6, margin: 0.2, terms: 1, cat: '業務用', risky: true },
];
const SUPPLIERS = [
  { name: '越後米穀', kind: '米穀卸', item: '米' }, { name: '新潟みなと水産', kind: '水産', item: '鮮魚・冷凍魚' },
  { name: '東邦フーズ', kind: '大手食品メーカー', item: '冷凍食品・調味料' }, { name: '亀山食品', kind: '冷凍食品', item: '冷凍食品' },
  { name: '日本海醤油', kind: '醸造', item: '醤油・味噌' }, { name: 'サンライズ乳業', kind: '乳業', item: '牛乳・乳製品' },
  { name: '上越ハム', kind: '食肉加工', item: 'ハム・ソーセージ' }, { name: '山辺製麺', kind: '製麺', item: '麺' },
  { name: '蒲原青果組合', kind: '青果', item: '野菜' }, { name: 'ミツワ物産', kind: '輸入商社', item: '輸入肉・冷凍エビ' },
  { name: 'ニイガタ包材', kind: '資材', item: '包材・割り箸・洗剤' }, { name: '北越鶏卵', kind: '鶏卵', item: '卵' },
  { name: '朝日酒販', kind: '酒類卸', item: '日本酒・ビール' }, { name: '昭和油脂', kind: '油脂メーカー', item: '業務用油' },
];
const BANKS = [
  { name: '越後中央銀行', short: '越後中央', main: true, bal: 420e6, monthly: 5.0e6, rate: 0.0155, branch: '東支店' },
  { name: '新潟みなと信用金庫', short: 'みなと信金', bal: 150e6, monthly: 2.1e6, rate: 0.019, branch: '竹尾支店' },
  { name: '日本政策金融公庫', short: '公庫', bal: 60e6, monthly: 1.0e6, rate: 0.011, branch: '新潟支店', zerozero: true },
];
export const COMPETITORS = ['ホクシン', '大東京フーズ', 'カネタ商店', '日本海フードネット'];

export const PRODUCTS = [
  'コシヒカリ(業務用30kg)', '新之助', '冷凍エビ(ベトナム産)', '冷凍ポテト', '鶏もも(ブラジル産)', '豚バラスライス', '業務用マヨネーズ',
  'サラダ油(16.5kg缶)', '濃口醤油', '越後味噌', '笹団子', '切り餅', '冷凍うどん', '中華麺', '牛乳', '卵(Lサイズ)', '冷凍餃子',
  '浅漬けの素', 'もずく', '栃尾の油揚げ', '黒埼茶豆', '甘エビ', '塩引き鮭', '南蛮エビ', 'へぎそば', 'タレカツ用ソース', 'ル レクチエ',
  '紙おしぼり', '割り箸', '業務用ラップ', '食器用洗剤(18L)', '冷凍ハンバーグ', 'カット野菜', '豆腐', '納豆', '揚げ玉', 'ウスターソース',
  '冷凍コロッケ', '生クリーム', '米油', '天ぷら粉', 'のっぺの具材セット', '冷凍たこ焼き',
];

function contactFor(c) {
  const g = R.chance(0.25) ? 'f' : 'm';
  const age = R.int(28, 60);
  const nm = { sei: R.pick(SEI), mei: R.pick(MEI[g][gen(age)]) };
  const type = R.pick(['厳しい', '温厚', 'ルーズ', '理屈っぽい', '昔気質', '若手で事務的', '気分屋', '値切り魔']);
  const title = c.kind === 'スーパー' || c.kind === 'ドラッグストア' ? R.pick(['商品部 バイヤー', '商品部 課長', '商品部 係長']) :
    c.kind === '病院' || c.kind === '介護施設' || c.kind === '保育園' ? R.pick(['事務長', '栄養士', '栄養課 主任']) :
      c.kind === '学校給食' ? R.pick(['所長', '栄養教諭', '事務担当']) : c.kind.includes('ホテル') || c.kind === '旅館' ? R.pick(['総料理長', '購買担当', '女将']) : R.pick(['店長', '社長', '購買担当', '統括マネージャー']);
  return { sei: nm.sei, mei: nm.mei, g, age, type, title };
}

export function createWorld(seed) {
  R.s = seed | 0; PID = 0; usedNames.clear();
  const w = { v: 3, seed, t: 7 * 60 + 30, people: [], rel: {}, secrets: [], logs: [], chats: {}, talks: [], board: [], news: [], queue: [], arcs: [], stats: {} };
  w.company = { ...COMPANY };
  // 創業家
  const familySei = '丸山';
  for (const r of ROSTER) {
    const p = makePerson(r, r.family ? { sei: familySei } : {});
    w.people.push(p);
  }
  const by = k => w.people.find(p => p.key === k);
  const kaicho = by('kaicho'), shacho = by('shacho');
  kaicho.mei = R.pick(['栄一', '栄治', '栄作']); shacho.mei = R.pick(['健太郎', '栄太', '雄一郎', '大樹']);
  kaicho.gender = 'm'; shacho.gender = 'm';
  kaicho.joined = 1972; shacho.joined = 2026 - (shacho.age - shacho.joinAge);
  shacho.life.edu = R.pick(['明治大学 商学部', '法政大学 経営学部', '青山学院大学 経営学部', '新潟大学 経済学部']);
  shacho.life.prev = R.pick(['東京の大手食品商社(5年)', '首都圏の外食チェーン本部(4年)', '地元の地銀(3年)', '東京の広告代理店(6年)']);
  shacho.life.married = true; if (!shacho.life.kids.length) shacho.life.kids = [{ age: R.int(10, 16), g: 'm' }];
  shacho.archetype = R.pick(['改革派', '見栄っ張り', '慎重派', 'ワンマン']);
  kaicho.archetype = R.pick(['頑固な職人肌', '温厚な人格者', '口うるさい現役気分']);
  kaicho.life.parents = '両親他界'; kaicho.life.care = false; kaicho.smoker = R.chance(0.4);
  if (shacho.archetype === 'ワンマン') { shacho.b5.A = clamp(shacho.b5.A - 25, 5, 95); shacho.b5.E += 10; }
  if (shacho.archetype === '慎重派') { shacho.b5.C = clamp(shacho.b5.C + 20, 5, 95); shacho.b5.O -= 10; }
  if (shacho.archetype === '改革派') { shacho.b5.O = clamp(shacho.b5.O + 25, 5, 95); }
  if (shacho.archetype === '見栄っ張り') { shacho.traits.spend = clamp(shacho.traits.spend + 30, 5, 95); }
  const senmu = by('senmu'); senmu.archetype = R.pick(['会長の右腕', '叩き上げの営業', '派閥の長']);
  by('soumubucho').life.prev = '越後中央銀行(支店長代理まで。出向から転籍)';
  by('keirikacho').joined = Math.min(by('keirikacho').joined, 1995);
  // 新卒は入社前
  for (const p of w.people) if (p.newhire) { p.status = 'pending'; p.flags.joinDay = 0; }
  // 関係のたね
  for (const a of w.people) for (const b of w.people) {
    if (a === b) continue;
    const same = a.dept === b.dept || (a.dept.startsWith('営業') && b.dept.startsWith('営業'));
    const r = rel(w, a, b);
    r.fam = same ? R.int(40, 75) : R.int(5, 35);
    r.aff = Math.round(R.normal(same ? 12 : 4, 22));
    r.trust = Math.round(R.normal(same ? 15 : 5, 18));
    if (a.newhire || b.newhire) { r.fam = 0; r.aff = 0; r.trust = 0; }
  }
  // 名物の対立・つながり
  const eb = by('eigyobucho'), lb = by('butsuryubucho');
  setPair(w, eb, lb, -25, -15); addTag(w, eb, lb, 'rival');
  setPair(w, senmu, shacho, -10, 10);
  rel(w, senmu, kaicho).aff = 55; rel(w, senmu, kaicho).trust = 60; rel(w, kaicho, senmu).trust = 65;
  rel(w, shacho, kaicho).aff = R.int(-20, 30); rel(w, kaicho, shacho).trust = R.int(-10, 30);
  rel(w, by('keirikacho'), shacho).trust = R.int(10, 50);
  rel(w, by('soumubucho'), by('keirikacho')).aff = R.int(-35, 5);
  // 社員の車と駐車位置
  const slots = R.shuffle(export_park.slots.filter(s => !s.startsWith('park_0_')));
  const front = export_park.slots.filter(s => s.startsWith('park_0_'));
  w.cars = [];
  // 営業車(白いバン)
  for (let i = 0; i < 6; i++) w.cars.push({ id: 'c_e' + i, slot: front[i + 3], kind: 'van', color: 0xe8e8e4, label: '営業車' + (i + 1), owner: null, here: true });
  w.cars.push({ id: 'c_pres', slot: front[0], kind: 'sedan', color: 0x1d1f24, label: '社長車', owner: shacho.id, here: false });
  let si = 0;
  for (const p of w.people) {
    if (p === shacho) { p.car = 'c_pres'; continue; }
    if (p.life.commute !== '車') continue;
    const col = R.pick([0xf2f2f0, 0x2a2c30, 0x8a8f96, 0xb8bcc2, 0x7a2328, 0x2b3d5c, 0xd9cfb8, 0x3b4a3a, 0x9a6b3e, 0x5d7fa8]);
    const kind = /N-BOX|タント|ハスラー|ワゴンR|ムーヴ|ジムニー|軽/.test(p.life.car) ? 'kei' : /セレナ|ヴォクシー|アルファード|ハイエース|デリカ/.test(p.life.car) ? 'minivan' : /フォレスター|エクストレイル|CX-5|ランクル/.test(p.life.car) ? 'suv' : 'sedan';
    w.cars.push({ id: 'c_' + p.id, slot: p.key === 'kaicho' ? front[1] : slots[si++ % slots.length], kind, color: col, label: p.life.car, owner: p.id, here: false });
    p.car = 'c_' + p.id;
  }
  w.trucks = [0, 1, 2].map(i => ({ id: 't' + i, label: ['2t冷凍車', '4t冷凍車', '3t保冷車'][i], at: 'dock', state: 'idle', km: R.int(180000, 420000) }));
  // 取引先
  const sales = w.people.filter(p => p.role === 'sales');
  const one = sales.filter(p => p.dept === '営業一課' && !p.newhire), two = sales.filter(p => p.dept === '営業二課' && !p.newhire);
  w.clients = CLIENTS.map((c, i) => {
    const pool = c.cat === '量販' ? one : two;
    let rep = c.name === 'マルシン' ? by('e1kacho') : R.pick(pool);
    return {
      id: 'k' + i, ...c, base: c.base * R.f(0.92, 1.08), margin: c.margin + 0.011 + R.normal(0, 0.003), rep: rep.id,
      contact: contactFor(c), rel: R.int(45, 80), health: c.risky ? R.int(25, 50) : R.int(55, 90), status: 'active', since: R.int(1972, 2021),
      mtd: 0, ytd: 0, hist: [], arDays: 0, mood: 0,
    };
  });
  w.suppliers = SUPPLIERS.map((s, i) => ({ id: 's' + i, ...s, rep: null, rel: R.int(40, 80), priceIdx: 1, contact: contactFor({ kind: s.kind }) }));
  const buyers = w.people.filter(p => p.role === 'buyer');
  w.suppliers.forEach(s => { s.rep = R.pick(buyers).id; });
  w.banks = BANKS.map((b, i) => ({ id: 'b' + i, ...b, bal: b.bal * R.f(0.9, 1.1), contact: contactFor({ kind: '銀行' }), rel: R.int(50, 70) }));
  w.banks.forEach(b => { b.contact.title = R.pick(['融資課 課長代理', '法人営業 担当', '支店長代理']); });
  w.competitors = COMPETITORS.slice();
  // 経済
  w.eco = { nikkei: Math.round(R.f(38500, 43000)), usd: R.f(142, 156), diesel: R.f(152, 168), rice: R.f(100, 120), cpi: 100, mood: R.normal(0, 0.3), rate: 0.75 };
  // 財務
  const cash = R.f(170e6, 240e6);
  w.fin = {
    cash, inventory: 210e6 * R.f(0.95, 1.05), equity: R.f(180e6, 260e6), fixed: 380e6,
    ar: [], ap: [], hist: [], cashHist: [], mtd: { sales: 0, cogs: 0, extra: {} }, ytd: { sales: 0, gp: 0, op: 0 },
    rescue: 0, bankrupt: false, ordered: 0, warn: 0,
  };
  // 期首の売掛・買掛(前月分)
  for (const c of w.clients) {
    const amt = c.base * R.f(0.95, 1.05);
    w.fin.ar.push({ client: c.id, due: c.terms - 1, amt });
    if (c.terms === 2) w.fin.ar.push({ client: c.id, due: 0, amt: amt * R.f(0.95, 1.05) });
  }
  const totalBase = w.clients.reduce((s, c) => s + c.base, 0);
  w.fin.ap.push({ sup: 'all', due: 1, amt: totalBase * 0.87 });
  // 開始前から貼られている掲示
  const so = by('soumu'), sb = by('soumubucho');
  const fresh = w.people.filter(p => p.newhire);
  w.board = [
    { id: 5, day: -2, t: -2 * 1440 + 16 * 60 + 40, type: '人事', author: sb.id, title: '新入社員の配属について', body: `4月1日付で、次の${fresh.length}名が入社します。\n${fresh.map(p => `・${p.sei} ${p.mei}(${p.dept})`).join('\n')}\n入社式は4月1日9時より3階会議室にて行います。各部署で受け入れの準備をお願いします。` },
    { id: 4, day: -3, t: -3 * 1440 + 10 * 60 + 5, type: 'お知らせ', author: so.id, title: '4月の行事予定', body: '・4月1日(水)入社式(9:00〜 3階会議室)\n・第2水曜 経営計画発表会\n・中旬の金曜 新入社員歓迎会(場所は後日)\n・夏タイヤへの交換は各自で。営業車は総務で手配します\n・6月 定期健康診断(日程は追って)' },
    { id: 3, day: -6, t: -6 * 1440 + 13 * 60 + 20, type: '人事', author: sb.id, title: '4月1日付 人事異動', body: `${by('e1shunin').dept} ${by('e1shunin').sei} 主任に昇格\n${by('haisha').dept} ${by('haisha').sei} 配車係を命ず\n${by('kobai1').dept} ${by('kobai1').sei} 購買担当を命ず(営業二課より)` },
    { id: 2, day: -12, t: -12 * 1440 + 9 * 60 + 40, type: '連絡', author: so.id, title: '休憩室の冷蔵庫について', body: '冷蔵庫に名前のない飲み物・食べ物が増えています。私物には必ず名前を書いてください。毎月最終金曜に中身を確認し、期限切れのものは処分します。' },
    { id: 1, day: -20, t: -20 * 1440 + 15 * 60 + 10, type: 'お知らせ', author: so.id, title: '社員駐車場の割り当て変更', body: '除雪の都合で一時的に変更していた駐車位置を、来週から元に戻します。奥の列(3列目)は来客用を除き自由に使ってください。' },
  ];
  w.boardSeq = 5;
  w.weather = null;
  w.day = -1;
  w.channels = { all: [], eigyo: [], butsuryu: [], soumu: [], zatsudan: [], dm: {} };
  w.unread = {};
  w.ui = {};
  w.stats = { events: 0, quits: 0, hires: 0 };
  w.ended = null;
  w.seedState = R.s;
  return w;
}

export function relKey(a, b) { return a.id + '>' + b.id; }
export function rel(w, a, b) {
  const k = (a.id || a) + '>' + (b.id || b);
  let r = w.rel[k];
  if (!r) { r = w.rel[k] = { aff: 0, trust: 0, fam: 0, tags: [] }; }
  return r;
}
export function setPair(w, a, b, aff, trust) { const r1 = rel(w, a, b), r2 = rel(w, b, a); r1.aff = r2.aff = aff; r1.trust = r2.trust = trust; }
export function addTag(w, a, b, t) { const r1 = rel(w, a, b), r2 = rel(w, b, a); if (!r1.tags.includes(t)) r1.tags.push(t); if (!r2.tags.includes(t)) r2.tags.push(t); }
export function hasTag(w, a, b, t) { return rel(w, a, b).tags.includes(t); }
export { ROSTER };
