// ゲームのデータ(地形・精霊・パワーカード・恐怖カード・侵略者カード)
// ルールは「スピリット・アイランド」を参考にした一人用のアレンジ版。カード名と効果文はこのゲームのオリジナル。

export const ELEMENTS = {
  sun:    { label: '太陽', ch: '陽', color: '#f0c872' },
  moon:   { label: '月',   ch: '月', color: '#cfcdf0' },
  fire:   { label: '火',   ch: '火', color: '#ec7a5a' },
  air:    { label: '風',   ch: '風', color: '#bfe2ea' },
  water:  { label: '水',   ch: '水', color: '#6fa8e0' },
  earth:  { label: '大地', ch: '土', color: '#b49470' },
  plant:  { label: '植物', ch: '植', color: '#82c084' },
  animal: { label: '獣',   ch: '獣', color: '#d088a8' },
};
export const ELEMENT_KEYS = Object.keys(ELEMENTS);

export const TERRAIN = {
  M: { name: '山岳', color: '#a29cb4' },
  W: { name: '湿地', color: '#4f86a8' },
  J: { name: '密林', color: '#3f7268' },
  S: { name: '砂地', color: '#c8ad94' },
};

export const PIECES = {
  explorers: '探検家',
  towns: '町',
  cities: '都市',
  dahan: '島の民',
  blight: '荒れ地',
  presence: '灯り',
};

// 島の8つの土地。nx/nz は島の中の位置(0〜1、nz が大きいほど手前=海側)
export const LAND_SEEDS = [
  { num: 1, terrain: 'M', nx: 0.14, nz: 0.80 },
  { num: 2, terrain: 'W', nx: 0.48, nz: 0.86 },
  { num: 3, terrain: 'J', nx: 0.85, nz: 0.80 },
  { num: 4, terrain: 'S', nx: 0.12, nz: 0.40 },
  { num: 5, terrain: 'W', nx: 0.40, nz: 0.50 },
  { num: 6, terrain: 'M', nx: 0.70, nz: 0.47 },
  { num: 7, terrain: 'S', nx: 0.30, nz: 0.12 },
  { num: 8, terrain: 'J', nx: 0.76, nz: 0.13 },
];

// はじめに置かれている駒(土地の番号ごと)
export const SETUP = {
  1: {},
  2: { cities: 1, dahan: 1 },
  3: { dahan: 2 },
  4: { blight: 1 },
  5: {},
  6: { dahan: 1 },
  7: { dahan: 2 },
  8: { towns: 1 },
};

export const DIFFICULTY = {
  easy:   { label: 'やさしい', fearPerCard: 3, blight: 12, blightFlip: 8, dahanHit: 3, startEnergy: 2, note: '恐怖3で恐怖カード1枚・荒れ地に余裕・島の民の反撃が強い(1人3ダメージ)' },
  normal: { label: 'ふつう',   fearPerCard: 4, blight: 9, blightFlip: 6, dahanHit: 2, startEnergy: 1, note: '一人用の標準的なバランス' },
  hard:   { label: 'むずかしい', fearPerCard: 4, blight: 6, blightFlip: 4, dahanHit: 2, startEnergy: 0, extraExplore: true, chainCascade: true, note: '荒れ地が少なく、最初の探検が2回・荒れ地が連鎖する' },
};

// ---- 侵略者カード ----
// stage1: 単独の地形、stage2: 単独の地形+沿岸、stage3: 地形2つ
export function buildInvaderDeck(shuffle) {
  const s1 = ['M', 'W', 'J', 'S'].map(t => ({ stage: 1, terrains: [t] }));
  const s2 = ['M', 'W', 'J', 'S'].map(t => ({ stage: 2, terrains: [t] }));
  s2.push({ stage: 2, coastal: true, terrains: [] });
  const s3 = [['M', 'W'], ['M', 'J'], ['M', 'S'], ['W', 'J'], ['W', 'S'], ['J', 'S']]
    .map(ts => ({ stage: 3, terrains: ts }));
  return [...shuffle(s1).slice(0, 3), ...shuffle(s2).slice(0, 4), ...shuffle(s3).slice(0, 5)];
}

export function invaderCardName(card) {
  if (!card) return '';
  if (card.coastal) return '沿岸';
  return card.terrains.map(t => TERRAIN[t].name).join('+');
}

// ---- パワーカードの対象 ----
// target: any / coastal / inland / dahan / invaders / blight / noblight / M W J S / JW / MS など地形の組み合わせ
export const TARGET_LABEL = {
  any: 'どの土地でも',
  coastal: '沿岸の土地',
  inland: '内陸の土地',
  dahan: '島の民のいる土地',
  invaders: '侵略者のいる土地',
  blight: '荒れ地のある土地',
  noblight: '荒れ地のない土地',
};
export function targetLabel(t) {
  if (TARGET_LABEL[t]) return TARGET_LABEL[t];
  return t.split('').map(c => TERRAIN[c].name).join('か') + 'の土地';
}

// ---- 精霊固有のパワーカード ----
const RIVER_CARDS = [
  {
    id: 'river-guide', name: 'せせらぎの導き', cost: 1, speed: 'fast', range: 1, target: 'any',
    el: ['sun', 'air', 'water'],
    text: '探検家か町を最大2つ追い払う。',
    effect: async (g, L) => { await g.push(L, ['explorers', 'towns'], 2); },
  },
  {
    id: 'river-gift', name: '大水のめぐみ', cost: 0, speed: 'fast', range: 1, target: 'any',
    el: ['water', 'plant'],
    text: '島の民を最大2人呼び寄せる。その後島の民がいれば守り2。',
    effect: async (g, L) => { await g.gather(L, ['dahan'], 2); if (L.dahan > 0) g.defend(L, 2); },
  },
  {
    id: 'river-surge', name: '押し寄せる流れ', cost: 2, speed: 'slow', range: 1, target: 'any',
    el: ['sun', 'water', 'earth'],
    text: '2ダメージ。',
    effect: async (g, L) => { await g.damage(L, 2); },
  },
  {
    id: 'river-wash', name: '押し流す波', cost: 1, speed: 'slow', range: 1, target: 'coastal',
    el: ['water', 'moon'],
    text: '探検家か町を最大3つ追い払う。',
    effect: async (g, L) => { await g.push(L, ['explorers', 'towns'], 3); },
  },
];

const THUNDER_CARDS = [
  {
    id: 'thunder-bolt', name: '霹靂', cost: 1, speed: 'fast', range: 1, target: 'invaders',
    el: ['fire', 'air'],
    text: '1ダメージ。恐怖1。',
    effect: async (g, L) => { g.addFear(1); await g.damage(L, 1); },
  },
  {
    id: 'thunder-strike', name: '天を裂く雷撃', cost: 3, speed: 'fast', range: 2, target: 'any',
    el: ['fire', 'air', 'earth'],
    text: '3ダメージ。',
    effect: async (g, L) => { await g.damage(L, 3); },
  },
  {
    id: 'thunder-omen', name: '迅雷の兆し', cost: 0, speed: 'fast', range: 1, target: 'any',
    el: ['air', 'moon'],
    text: '恐怖1。探検家を1つ追い払ってもよい。',
    effect: async (g, L) => { g.addFear(1); await g.push(L, ['explorers'], 1); },
  },
  {
    id: 'thunder-eye', name: '風の目', cost: 1, speed: 'fast', range: 1, target: 'any',
    el: ['air', 'water'],
    text: '守り4。',
    effect: async (g, L) => { g.defend(L, 4); },
  },
];

// ---- 精霊 ----
export const SPIRITS = [
  {
    id: 'river',
    name: '陽光をうつす大河',
    color: '#9fdcff',
    blurb: '追い払いが得意な、あつかいやすい精霊。侵略者を島の外側へ流し、島の民を守る。はじめての人におすすめ。',
    setupPresence: [5],
    energyTrack: [1, 2, 2, 3, 4, 4, 5],
    cardTrack: [1, 2, 2, 3, 3, 4, 5],
    growth: [
      { label: '使ったカードをすべて手札にもどす・パワーカードを1枚獲得・エネルギー+1', actions: [{ type: 'reclaim' }, { type: 'gainCard' }, { type: 'energy', n: 1 }] },
      { label: '灯りを置く(距離1)を2回', actions: [{ type: 'presence', range: 1 }, { type: 'presence', range: 1 }] },
      { label: 'パワーカードを1枚獲得・灯りを置く(距離2)', actions: [{ type: 'gainCard' }, { type: 'presence', range: 2 }] },
    ],
    cards: RIVER_CARDS,
    innate: {
      name: '満ちてゆく潮', speed: 'slow', range: 1, target: 'any',
      levels: [
        { need: { sun: 1, water: 2 }, text: '1ダメージ。', effect: async (g, L) => { await g.damage(L, 1); } },
        { need: { sun: 2, water: 3 }, text: 'さらに1ダメージ。', effect: async (g, L) => { await g.damage(L, 1); } },
        { need: { sun: 3, water: 4, earth: 1 }, text: '町を1つ破壊(無ければ探検家を2つ破壊)。', effect: async (g, L) => {
          if (L.towns > 0) g.destroy(L, 'towns', 1); else g.destroy(L, 'explorers', 2);
        } },
      ],
    },
  },
  {
    id: 'thunder',
    name: '雷鳴をまとう使い',
    color: '#ffe08a',
    blurb: '先手パワーで先手を取る攻撃的な精霊。エネルギーは少ないが、たくさんのカードを使える。',
    setupPresence: [4, 6],
    energyTrack: [1, 1, 2, 2, 3, 3, 4],
    cardTrack: [2, 2, 3, 3, 4, 4, 5],
    growth: [
      { label: '使ったカードをすべて手札にもどす・エネルギー+1', actions: [{ type: 'reclaim' }, { type: 'energy', n: 1 }] },
      { label: 'パワーカードを1枚獲得・灯りを置く(距離1)', actions: [{ type: 'gainCard' }, { type: 'presence', range: 1 }] },
      { label: '灯りを置く(距離2)・エネルギー+2', actions: [{ type: 'presence', range: 2 }, { type: 'energy', n: 2 }] },
    ],
    cards: THUNDER_CARDS,
    innate: {
      name: '稲妻の閃き', speed: 'fast', range: 1, target: 'invaders',
      levels: [
        { need: { fire: 2, air: 1 }, text: '1ダメージ。', effect: async (g, L) => { await g.damage(L, 1); } },
        { need: { fire: 3, air: 2 }, text: '恐怖1と、さらに1ダメージ。', effect: async (g, L) => { g.addFear(1); await g.damage(L, 1); } },
        { need: { fire: 4, air: 3 }, text: '都市か町を1つ破壊。', effect: async (g, L) => {
          if (L.cities > 0) g.destroy(L, 'cities', 1); else if (L.towns > 0) g.destroy(L, 'towns', 1);
        } },
      ],
    },
  },
];

// ---- 小さなパワー(山札から獲得する) ----
export const MINOR_POWERS = [
  { id: 'm-mist', name: '霧のとばり', cost: 0, speed: 'slow', range: 1, target: 'any', el: ['moon', 'air', 'water'],
    text: 'この土地では次の探検が起きない。', effect: async (g, L) => { g.skip(L, 'explore'); } },
  { id: 'm-wrath', name: '土地の怒り', cost: 1, speed: 'slow', range: 1, target: 'any', el: ['fire', 'earth', 'plant'],
    text: '1ダメージ。荒れ地があれば+1ダメージ。', effect: async (g, L) => { await g.damage(L, L.blight > 0 ? 2 : 1); } },
  { id: 'm-howl', name: '恐ろしい遠吠え', cost: 0, speed: 'fast', range: 1, target: 'invaders', el: ['moon', 'animal'],
    text: '恐怖1。探検家を1つ追い払ってもよい。', effect: async (g, L) => { g.addFear(1); await g.push(L, ['explorers'], 1); } },
  { id: 'm-pack', name: '獣たちの群れ', cost: 1, speed: 'fast', range: 1, target: 'invaders', el: ['moon', 'fire', 'animal'],
    text: '恐怖2。', effect: async (g) => { g.addFear(2); } },
  { id: 'm-rally', name: '島の民の奮起', cost: 1, speed: 'slow', range: 1, target: 'dahan', el: ['sun', 'fire', 'animal'],
    text: '島の民1人につき1ダメージ(最大3)。', effect: async (g, L) => { await g.damage(L, Math.min(3, L.dahan)); } },
  { id: 'm-heal', name: '大地のいやし', cost: 1, speed: 'slow', range: 1, target: 'blight', el: ['water', 'earth', 'plant'],
    text: '荒れ地を1つ取り除く。', effect: async (g, L) => { g.removeBlight(L); } },
  { id: 'm-path', name: 'かくれた小道', cost: 0, speed: 'fast', range: 1, target: 'any', el: ['moon', 'air', 'plant'],
    text: '島の民を最大2人呼び寄せる。', effect: async (g, L) => { await g.gather(L, ['dahan'], 2); } },
  { id: 'm-sprout', name: '芽吹きの守り', cost: 1, speed: 'fast', range: 1, target: 'any', el: ['sun', 'earth', 'plant'],
    text: '守り3。', effect: async (g, L) => { g.defend(L, 3); } },
  { id: 'm-bolt', name: '落雷', cost: 2, speed: 'fast', range: 1, target: 'any', el: ['fire', 'air'],
    text: '2ダメージ。', effect: async (g, L) => { await g.damage(L, 2); } },
  { id: 'm-frost', name: '凍てつく夜', cost: 2, speed: 'fast', range: 1, target: 'invaders', el: ['moon', 'water', 'earth'],
    text: '恐怖1。このターン、この土地では襲撃が起きない。', effect: async (g, L) => { g.addFear(1); g.skip(L, 'ravage'); } },
  { id: 'm-roots', name: '根のからみつき', cost: 1, speed: 'slow', range: 1, target: 'JW', el: ['plant', 'earth'],
    text: '恐怖1。この土地では次の建設が起きない。', effect: async (g, L) => { g.addFear(1); g.skip(L, 'build'); } },
  { id: 'm-wisp', name: 'さまよう灯火', cost: 1, speed: 'slow', range: 2, target: 'invaders', el: ['moon', 'fire', 'air'],
    text: '探検家を1つ破壊。恐怖1。', effect: async (g, L) => { g.addFear(1); g.destroy(L, 'explorers', 1); } },
  { id: 'm-song', name: '祖霊の歌', cost: 1, speed: 'slow', range: 1, target: 'any', el: ['sun', 'water', 'animal'],
    text: '島の民を1人加える。', effect: async (g, L) => { g.addDahan(L, 1); } },
  { id: 'm-sand', name: '砂あらし', cost: 1, speed: 'fast', range: 1, target: 'S', el: ['fire', 'air', 'earth'],
    text: '恐怖1。1ダメージ。', effect: async (g, L) => { g.addFear(1); await g.damage(L, 1); } },
  { id: 'm-marsh', name: '沼のささやき', cost: 1, speed: 'slow', range: 1, target: 'W', el: ['moon', 'water', 'plant'],
    text: '恐怖1。探検家か町を1つ追い払ってもよい。', effect: async (g, L) => { g.addFear(1); await g.push(L, ['explorers', 'towns'], 1); } },
  { id: 'm-quake', name: '山のとどろき', cost: 2, speed: 'slow', range: 1, target: 'MS', el: ['fire', 'earth'],
    text: '町を1つ破壊(無ければ1ダメージ)。', effect: async (g, L) => { if (L.towns > 0) g.destroy(L, 'towns', 1); else await g.damage(L, 1); } },
  { id: 'm-moonlight', name: '月光の導き', cost: 0, speed: 'fast', range: 2, target: 'any', el: ['moon', 'air'],
    text: 'エネルギー+1。この土地に島の民がいれば守り1。', effect: async (g, L) => { g.gainEnergy(1); if (L.dahan > 0) g.defend(L, 1); } },
  { id: 'm-pulse', name: '大地の脈動', cost: 2, speed: 'slow', range: 0, target: 'any', el: ['earth', 'plant'],
    text: '2ダメージ。荒れ地があれば1つ取り除く。', effect: async (g, L) => { await g.damage(L, 2); g.removeBlight(L); } },
  { id: 'm-plague', name: '病の霧', cost: 2, speed: 'slow', range: 1, target: 'invaders', el: ['moon', 'water', 'animal'],
    text: '探検家をすべて破壊。', effect: async (g, L) => { g.destroy(L, 'explorers', L.explorers); } },
  { id: 'm-birds', name: '鳥たちの警告', cost: 0, speed: 'fast', range: 1, target: 'dahan', el: ['air', 'animal'],
    text: '恐怖1。島の民を1人追い払ってもよい。', effect: async (g, L) => { g.addFear(1); await g.push(L, ['dahan'], 1); } },
  { id: 'm-tide', name: '引き潮', cost: 1, speed: 'fast', range: 1, target: 'coastal', el: ['moon', 'water'],
    text: 'この土地では次の探検が起きない。恐怖1。', effect: async (g, L) => { g.addFear(1); g.skip(L, 'explore'); } },
  { id: 'm-fire', name: '野火', cost: 1, speed: 'slow', range: 1, target: 'noblight', el: ['fire', 'plant'],
    text: '2ダメージ。この土地に荒れ地を1つ加える。', effect: async (g, L) => { await g.damage(L, 2); await g.addBlight(L); } },
];

// ---- 恐怖カード ----
// levels[0..2] は恐怖レベル1〜3の効果
export const FEAR_CARDS = [
  {
    id: 'f-omen', name: '不吉な予兆',
    levels: [
      { text: '探検家を1つ取り除く。', effect: g => g.removeChoice(['explorers'], 1) },
      { text: '探検家か町を1つ取り除く。', effect: g => g.removeChoice(['explorers', 'towns'], 1) },
      { text: '探検家か町を2つまで取り除く。', effect: g => g.removeChoice(['explorers', 'towns'], 2) },
    ],
  },
  {
    id: 'f-flee', name: '逃げ出す者たち',
    levels: [
      { text: '1つの土地から探検家を1つ追い払う。', effect: g => g.pushChoice(['explorers'], 1) },
      { text: '1つの土地から探検家か町を2つまで追い払う。', effect: g => g.pushChoice(['explorers', 'towns'], 2) },
      { text: '1つの土地から探検家か町を3つまで追い払う。', effect: g => g.pushChoice(['explorers', 'towns'], 3) },
    ],
  },
  {
    id: 'f-sleepless', name: '眠れぬ夜',
    levels: [
      { text: '土地を1つ選ぶ。そこでは建設が起きない。', effect: g => g.skipChoice('build', 1) },
      { text: '土地を2つ選ぶ。そこでは建設が起きない。', effect: g => g.skipChoice('build', 2) },
      { text: '土地を3つ選ぶ。そこでは建設が起きない。', effect: g => g.skipChoice('build', 3) },
    ],
  },
  {
    id: 'f-dahan', name: '島の民の反撃',
    levels: [
      { text: '島の民のいる土地を1つ選ぶ。島の民1人につき1ダメージ。', effect: g => g.dahanStrike(1, false) },
      { text: '島の民のいる土地を1つ選ぶ。島の民1人につき2ダメージ。', effect: g => g.dahanStrike(2, false) },
      { text: '島の民のいるすべての土地で、島の民1人につき1ダメージ。', effect: g => g.dahanStrike(1, true) },
    ],
  },
  {
    id: 'f-lost', name: '霧の中の迷い',
    levels: [
      { text: '土地を1つ選ぶ。そこでは探検が起きない。', effect: g => g.skipChoice('explore', 1) },
      { text: '土地を2つ選ぶ。そこでは探検が起きない。', effect: g => g.skipChoice('explore', 2) },
      { text: '土地を3つ選ぶ。そこでは探検が起きない。', effect: g => g.skipChoice('explore', 3) },
    ],
  },
  {
    id: 'f-guard', name: '身を守る島の民',
    levels: [
      { text: '島の民のいるすべての土地で守り2。', effect: g => g.dahanDefend(2) },
      { text: '島の民のいるすべての土地で守り3。', effect: g => g.dahanDefend(3) },
      { text: '島の民のいる土地では襲撃が起きない。', effect: g => g.dahanDefend(99) },
    ],
  },
  {
    id: 'f-retreat', name: '撤退',
    levels: [
      { text: '探検家を2つまで取り除く。', effect: g => g.removeChoice(['explorers'], 2) },
      { text: '探検家を3つまで取り除く。', effect: g => g.removeChoice(['explorers'], 3) },
      { text: '町を1つと、探検家を3つまで取り除く。', effect: async g => { await g.removeChoice(['towns'], 1); await g.removeChoice(['explorers'], 3); } },
    ],
  },
  {
    id: 'f-awe', name: '精霊への畏れ',
    levels: [
      { text: '灯りのある土地を1つ選び、探検家か町を1つ取り除く。', effect: g => g.removeChoice(['explorers', 'towns'], 1, L => L.presence > 0) },
      { text: '灯りのある土地から、探検家か町を2つまで取り除く。', effect: g => g.removeChoice(['explorers', 'towns'], 2, L => L.presence > 0) },
      { text: '灯りのある土地から、探検家・町・都市を3つまで取り除く。', effect: g => g.removeChoice(['explorers', 'towns', 'cities'], 3, L => L.presence > 0) },
    ],
  },
  {
    id: 'f-shaken', name: '浮き足立つ',
    levels: [
      { text: '町を1つ探検家に置きかえる。', effect: g => g.downgrade(['towns'], 1) },
      { text: '都市か町を1つ、1段階小さく置きかえる。', effect: g => g.downgrade(['cities', 'towns'], 1) },
      { text: '都市か町を2つまで、1段階小さく置きかえる。', effect: g => g.downgrade(['cities', 'towns'], 2) },
    ],
  },
  {
    id: 'f-dread', name: '襲撃への恐れ',
    levels: [
      { text: '侵略者のいる土地を1つ選び、守り3。', effect: g => g.defendChoice(3) },
      { text: '土地を1つ選ぶ。そこでは襲撃が起きない。', effect: g => g.skipChoice('ravage', 1) },
      { text: '土地を2つ選ぶ。そこでは襲撃が起きない。', effect: g => g.skipChoice('ravage', 2) },
    ],
  },
];
