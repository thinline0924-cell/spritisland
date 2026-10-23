// ルーン40種のカタログ（SPEC §5）。数値はすべてここに置く。
import type {
  CurseDef, ModifierDef, MulticastDef, RuneDef, RuneId, RuneKind,
  SpellDef, SpellForm, SpellParams, TriggerDef, ModCategory,
} from './types';

/** 顕現の数値の既定値。各顕現は必要な項目だけを上書きする */
export const DEFAULT_PARAMS: Readonly<SpellParams> = {
  damage: 0,
  speed: 0,
  lifetime: 0,
  size: 6,
  aoeRadius: 0,
  pierce: 0,
  bounce: 0,
  homing: 0,
  spiral: 0,
  split: 1,
  chains: 0,
  chainRange: 0,
  range: 420,
  tickInterval: 0,
  blades: 0,
  effectRadius: 0,
  arc: 0,
  crit: 0.05,
  critMul: 2,
  spreadMul: 1,
  knockback: 0,
  statusPower: 1,
  delay: 0,
};

/** 形式ごとに受け付ける変質の分類（W204 の判定） */
export const FORM_ACCEPTS: Readonly<Record<SpellForm, readonly ModCategory[]>> = {
  projectile: ['movement', 'pierce', 'lifetime', 'split', 'general'],
  chain: ['split', 'general'],
  slash: ['general'],
  nova: ['general'],
  meteor: ['lifetime', 'general'],
  field: ['lifetime', 'general'],
  orbit: ['lifetime', 'general'],
};

const deg = (d: number): number => (d * Math.PI) / 180;

// ---------------------------------------------------------------- 顕現 12種
const SPELLS: SpellDef[] = [
  {
    id: 'spark', kind: 'spell', name: '火花弾', glyph: 'ᚠ', element: 'arcane', form: 'projectile',
    desc: '安く速い小さな魔弾。契機の運び手に向く。',
    awakening: '命中時、小さな火花2つに分かれる。',
    rarity: 1, mana: [5, 5, 5], load: 1, castDelay: 0, recharge: 0, estTargets: 1,
    params: [
      { damage: 6, speed: 700, lifetime: 0.6, size: 4 },
      { damage: 9, speed: 700, lifetime: 0.6, size: 4 },
      { damage: 13, speed: 700, lifetime: 0.6, size: 4 },
    ],
  },
  {
    id: 'fireball', kind: 'spell', name: '火球', glyph: 'ᚲ', element: 'fire', form: 'projectile',
    desc: '着弾点で爆ぜる炎の球。',
    awakening: '爆心に2秒間の炎の床を残す。',
    rarity: 1, mana: [15, 15, 15], load: 2, castDelay: 0.08, recharge: 0, estTargets: 2.5,
    params: [
      { damage: 14, aoeRadius: 40, speed: 380, lifetime: 1.2, size: 7 },
      { damage: 21, aoeRadius: 50, speed: 380, lifetime: 1.2, size: 7 },
      { damage: 30, aoeRadius: 60, speed: 380, lifetime: 1.2, size: 8 },
    ],
  },
  {
    id: 'lightning', kind: 'spell', name: '雷撃', glyph: 'ᛋ', element: 'thunder', form: 'chain',
    desc: '最寄りの敵へ即座に落ち、近くの敵へ連鎖する。',
    awakening: '連鎖するたびにダメージ+20%。',
    rarity: 2, mana: [18, 18, 18], load: 2, castDelay: 0.05, recharge: 0, estTargets: 1,
    params: [
      { damage: 10, chains: 2, range: 320, chainRange: 140 },
      { damage: 15, chains: 3, range: 320, chainRange: 140 },
      { damage: 22, chains: 4, range: 320, chainRange: 140 },
    ],
  },
  {
    id: 'icelance', kind: 'spell', name: '氷槍', glyph: 'ᛁ', element: 'ice', form: 'projectile',
    desc: '高速で1体を貫く氷の槍。冷気を与える。',
    awakening: '貫通するたびに左右へ氷片を放つ。',
    rarity: 1, mana: [12, 12, 12], load: 2, castDelay: 0.04, recharge: 0, estTargets: 1,
    params: [
      { damage: 12, speed: 900, lifetime: 0.7, pierce: 1, size: 5 },
      { damage: 18, speed: 900, lifetime: 0.7, pierce: 1, size: 5 },
      { damage: 26, speed: 900, lifetime: 0.7, pierce: 1, size: 5 },
    ],
  },
  {
    id: 'blade', kind: 'spell', name: '魔力刃', glyph: 'ᛏ', element: 'arcane', form: 'slash',
    desc: '前方を弧状に薙ぐ近接の刃。詠唱が速い。',
    awakening: '斬撃が前方へ飛ぶ衝撃波になる。',
    rarity: 1, mana: [6, 6, 6], load: 1, castDelay: -0.02, recharge: 0, estTargets: 2.5,
    params: [
      { damage: 10, aoeRadius: 90, arc: deg(120), lifetime: 0.15 },
      { damage: 15, aoeRadius: 90, arc: deg(120), lifetime: 0.15 },
      { damage: 22, aoeRadius: 90, arc: deg(120), lifetime: 0.15 },
    ],
  },
  {
    id: 'gravity', kind: 'spell', name: '重力球', glyph: 'ᛟ', element: 'dark', form: 'projectile',
    desc: 'ゆっくり進み、周囲の敵を吸い寄せながら削る。',
    awakening: '消滅時、吸い込んだ数に応じた闇の爆発。',
    rarity: 2, mana: [25, 25, 25], load: 3, castDelay: 0.15, recharge: 0, estTargets: 2,
    params: [
      { damage: 3, tickInterval: 0.25, effectRadius: 120, speed: 150, lifetime: 2, size: 12, pierce: 999 },
      { damage: 5, tickInterval: 0.25, effectRadius: 120, speed: 150, lifetime: 2, size: 12, pierce: 999 },
      { damage: 7, tickInterval: 0.25, effectRadius: 120, speed: 150, lifetime: 2, size: 13, pierce: 999 },
    ],
  },
  {
    id: 'summon', kind: 'spell', name: '召喚陣', glyph: 'ᛗ', element: 'arcane', form: 'field',
    desc: 'その場に陣を敷き、近くの敵へ子弾を撃ち続ける。',
    awakening: '陣が詠唱者を追従し、衛星2つを伴う。',
    rarity: 3, mana: [30, 30, 30], load: 3, castDelay: 0.2, recharge: 0, estTargets: 1,
    params: [
      { damage: 5, tickInterval: 0.4, lifetime: 3, range: 300, effectRadius: 40 },
      { damage: 7, tickInterval: 0.4, lifetime: 3, range: 300, effectRadius: 40 },
      { damage: 10, tickInterval: 0.4, lifetime: 3, range: 300, effectRadius: 40 },
    ],
  },
  {
    id: 'shadow', kind: 'spell', name: '闇の矢', glyph: 'ᚦ', element: 'dark', form: 'projectile',
    desc: 'わずかに追尾する闇の矢。侵蝕を与える。',
    awakening: '呪印：印の付いた敵が死ぬと闇の矢3本を放つ。',
    rarity: 1, mana: [9, 9, 9], load: 1, castDelay: 0, recharge: 0, estTargets: 1,
    params: [
      { damage: 9, speed: 520, lifetime: 1, homing: 2, size: 5 },
      { damage: 13, speed: 520, lifetime: 1, homing: 2, size: 5 },
      { damage: 19, speed: 520, lifetime: 1, homing: 2, size: 5 },
    ],
  },
  {
    id: 'frostnova', kind: 'spell', name: '霜の新星', glyph: 'ᚾ', element: 'ice', form: 'nova',
    desc: '自分を中心に冷気の輪を放つ。冷気を2重に与える。',
    awakening: '凍結した敵が砕けて氷片を撒く。',
    rarity: 2, mana: [20, 20, 20], load: 2, castDelay: 0.1, recharge: 0, estTargets: 3,
    params: [
      { damage: 8, aoeRadius: 110, statusPower: 2 },
      { damage: 12, aoeRadius: 130, statusPower: 2 },
      { damage: 17, aoeRadius: 150, statusPower: 2 },
    ],
  },
  {
    id: 'meteor', kind: 'spell', name: '隕石', glyph: 'ᛞ', element: 'fire', form: 'meteor',
    desc: '最寄りの敵の位置へ、遅れて巨大な隕石が落ちる。',
    awakening: '着弾点に溶岩溜まりと小隕石3つ。',
    rarity: 3, mana: [40, 40, 40], load: 3, castDelay: 0.25, recharge: 0.2, estTargets: 3,
    params: [
      { damage: 35, aoeRadius: 80, delay: 0.6, range: 360, lifetime: 0 },
      { damage: 52, aoeRadius: 80, delay: 0.6, range: 360, lifetime: 0 },
      { damage: 75, aoeRadius: 80, delay: 0.6, range: 360, lifetime: 0 },
    ],
  },
  {
    id: 'orbit', kind: 'spell', name: '周回刃', glyph: 'ᛜ', element: 'arcane', form: 'orbit',
    desc: '詠唱者の周りを刃が回り、触れた敵を刻む。',
    awakening: '刃が2枚増え、回転半径が広がる。',
    rarity: 2, mana: [22, 22, 22], load: 2, castDelay: 0.05, recharge: 0, estTargets: 1,
    params: [
      { damage: 7, blades: 2, effectRadius: 70, lifetime: 3, tickInterval: 0.3, size: 8 },
      { damage: 10, blades: 2, effectRadius: 70, lifetime: 3, tickInterval: 0.3, size: 8 },
      { damage: 14, blades: 4, effectRadius: 95, lifetime: 3, tickInterval: 0.3, size: 9 },
    ],
  },
  {
    id: 'thunderorb', kind: 'spell', name: '雷球', glyph: 'ᛉ', element: 'thunder', form: 'projectile',
    desc: 'ゆっくり進み、近くの敵へ放電し続ける。',
    awakening: '雷球どうしを電撃の鎖で結ぶ。',
    rarity: 2, mana: [24, 24, 24], load: 3, castDelay: 0.12, recharge: 0, estTargets: 1,
    params: [
      { damage: 5, tickInterval: 0.3, speed: 200, lifetime: 2, effectRadius: 110, size: 9, pierce: 999 },
      { damage: 7, tickInterval: 0.3, speed: 200, lifetime: 2, effectRadius: 110, size: 9, pierce: 999 },
      { damage: 10, tickInterval: 0.3, speed: 200, lifetime: 2, effectRadius: 110, size: 10, pierce: 999 },
    ],
  },
];

// ---------------------------------------------------------------- 変質 14種
const infuse = (
  id: ModifierDef['id'], name: string, glyph: string, element: 'fire' | 'thunder' | 'ice' | 'dark',
  elName: string, awakening: string,
): ModifierDef => ({
  id, kind: 'modifier', name, glyph, category: 'general',
  desc: `直後の塊の属性を${elName}にし、ダメージを上げる。`,
  awakening,
  rarity: 1, mana: [5, 5, 5], load: 1, castDelay: 0, recharge: 0,
  effects: [
    { element, mul: { damage: 1.1 } },
    { element, mul: { damage: 1.2 } },
    { element, mul: { damage: 1.3 } },
  ],
});

const MODIFIERS: ModifierDef[] = [
  {
    id: 'homing', kind: 'modifier', name: '追尾', glyph: 'ᚱ', category: 'movement',
    desc: '弾が敵を追いかける。', awakening: '命中後、次の標的へ再追尾する（貫通+1）。',
    rarity: 1, mana: [6, 6, 6], load: 1, castDelay: 0, recharge: 0,
    effects: [{ add: { homing: 3 } }, { add: { homing: 5 } }, { add: { homing: 8, pierce: 1 } }],
  },
  {
    id: 'pierce', kind: 'modifier', name: '貫通', glyph: 'ᚷ', category: 'pierce',
    desc: '弾が敵を貫く。ダメージは少し下がる。', awakening: '貫通するたびにダメージ+15%。',
    rarity: 1, mana: [8, 8, 8], load: 1, castDelay: 0, recharge: 0,
    effects: [
      { add: { pierce: 2 }, mul: { damage: 0.9 } },
      { add: { pierce: 3 }, mul: { damage: 0.9 } },
      { add: { pierce: 5 }, mul: { damage: 0.9 } },
    ],
  },
  {
    id: 'spiral', kind: 'modifier', name: '螺旋', glyph: 'ᛃ', category: 'movement',
    desc: '弾が螺旋を描いて進む。', awakening: '鏡像の弾を1発追加する（二重螺旋）。',
    rarity: 1, mana: [3, 3, 3], load: 1, castDelay: 0, recharge: 0,
    effects: [
      { add: { spiral: 18 }, mul: { damage: 1.1 } },
      { add: { spiral: 22 }, mul: { damage: 1.15 } },
      { add: { spiral: 26 }, mul: { damage: 1.2 } },
    ],
  },
  {
    id: 'split', kind: 'modifier', name: '分裂', glyph: 'ᛇ', category: 'split',
    desc: '弾を複数に分ける。1発ごとのダメージは下がる。', awakening: '分裂弾が消滅時にさらに2つに分かれる。',
    rarity: 2, mana: [12, 12, 12], load: 2, castDelay: 0.03, recharge: 0,
    effects: [
      { mul: { split: 3, damage: 0.45 } },
      { mul: { split: 3, damage: 0.55 } },
      { mul: { split: 5, damage: 0.6 } },
    ],
  },
  infuse('infuse_fire', '炎化', 'ᚺ', 'fire', '炎', '命中で必ず燃焼させ、燃焼ダメージが2倍。'),
  infuse('infuse_thunder', '雷化', 'ᚻ', 'thunder', '雷', '命中時、近くの敵1体に小電撃。'),
  infuse('infuse_ice', '氷化', 'ᛄ', 'ice', '氷', '冷気スタックが2倍。'),
  infuse('infuse_dark', '闇化', 'ᛣ', 'dark', '闇', '侵蝕が周囲に感染する。'),
  {
    id: 'giant', kind: 'modifier', name: '巨大化', glyph: 'ᚢ', category: 'general',
    desc: '弾と爆発が大きく重くなる。', awakening: '命中時の衝撃波でノックバック。',
    rarity: 2, mana: [10, 10, 10], load: 1, castDelay: 0.05, recharge: 0,
    effects: [
      { mul: { size: 1.6, aoeRadius: 1.3, damage: 1.2, speed: 0.85 } },
      { mul: { size: 1.9, aoeRadius: 1.45, damage: 1.35, speed: 0.85 } },
      { mul: { size: 2.3, aoeRadius: 1.6, damage: 1.5, speed: 0.85 }, add: { knockback: 220 } },
    ],
  },
  {
    id: 'accelerate', kind: 'modifier', name: '加速', glyph: 'ᛖ', category: 'movement',
    desc: '弾が速くなる。詠唱も少し速まる。', awakening: '飛行中に加速し続け、速度に比例してダメージが上がる。',
    rarity: 1, mana: [4, 4, 4], load: 1, castDelay: -0.03, recharge: 0,
    effects: [
      { mul: { speed: 1.5, damage: 1.1 } },
      { mul: { speed: 1.8, damage: 1.15 } },
      { mul: { speed: 2.2, damage: 1.2 } },
    ],
  },
  {
    id: 'bounce', kind: 'modifier', name: '跳弾', glyph: 'ᛒ', category: 'movement',
    desc: '命中後、近くの別の敵へ跳ねる。', awakening: '跳ねるたびにダメージ+20%。',
    rarity: 2, mana: [7, 7, 7], load: 1, castDelay: 0, recharge: 0,
    effects: [{ add: { bounce: 2 } }, { add: { bounce: 3 } }, { add: { bounce: 5 } }],
  },
  {
    id: 'amplify', kind: 'modifier', name: '増幅', glyph: 'ᚨ', category: 'general',
    desc: 'ダメージを大きく上げる。', awakening: '会心率+25%。',
    rarity: 2, mana: [12, 12, 12], load: 1, castDelay: 0.04, recharge: 0,
    effects: [
      { mul: { damage: 1.3 } },
      { mul: { damage: 1.5 } },
      { mul: { damage: 1.75 }, add: { crit: 0.25 } },
    ],
  },
  {
    id: 'extend', kind: 'modifier', name: '延命', glyph: 'ᛚ', category: 'lifetime',
    desc: '弾の寿命と、設置物の持続を延ばす。', awakening: '消滅時に小爆発する。',
    rarity: 1, mana: [5, 5, 5], load: 1, castDelay: 0, recharge: 0,
    effects: [{ mul: { lifetime: 1.5 } }, { mul: { lifetime: 1.8 } }, { mul: { lifetime: 2.2 } }],
  },
  {
    id: 'precision', kind: 'modifier', name: '精密', glyph: 'ᛈ', category: 'general',
    desc: '拡散を抑え、会心率を上げる。', awakening: '会心倍率が×2から×3になる。',
    rarity: 1, mana: [4, 4, 4], load: 1, castDelay: -0.02, recharge: 0,
    effects: [
      { mul: { spreadMul: 0.3 }, add: { crit: 0.1 } },
      { mul: { spreadMul: 0.2 }, add: { crit: 0.15 } },
      { mul: { spreadMul: 0 }, add: { crit: 0.25 }, set: { critMul: 3 } },
    ],
  },
];

// ---------------------------------------------------------------- 契機 8種
const STD_PAYLOAD_MUL = [1, 1.2, 1.4] as const;

const TRIGGERS: TriggerDef[] = [
  {
    id: 'on_hit', kind: 'trigger', name: '契機：命中', glyph: 'ᚹ', condition: 'hit',
    desc: '直前の顕現が最初に命中したとき、直後の塊をその場から発動する。',
    awakening: '命中のたびに発動する（最大3回）。',
    rarity: 1, mana: [8, 8, 8], load: 2, castDelay: 0, recharge: 0,
    maxFires: [1, 1, 3], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'on_expire', kind: 'trigger', name: '契機：消滅', glyph: 'ᛝ', condition: 'expire',
    desc: '直前の顕現が消えたとき、直後の塊をその場から発動する。',
    awakening: '後続を2回発動する。',
    rarity: 1, mana: [8, 8, 8], load: 2, castDelay: 0, recharge: 0,
    maxFires: [1, 1, 2], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'timer', kind: 'trigger', name: '契機：時限', glyph: 'ᛡ', condition: 'timer',
    desc: '直前の顕現の発射から一定時間後、直後の塊を発動する。運び手は飛び続ける。',
    awakening: '時限がもう一度だけ再設定される。',
    rarity: 2, mana: [10, 10, 10], load: 2, castDelay: 0, recharge: 0,
    maxFires: [1, 1, 2], interval: [0.5, 0.4, 0.3], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'on_kill', kind: 'trigger', name: '契機：撃破', glyph: 'ᛢ', condition: 'kill',
    desc: '直前の顕現が敵を倒したとき、直後の塊をその場から発動する。',
    awakening: '倒した敵の最大HPの10%を後続のダメージに加える。',
    rarity: 2, mana: [10, 10, 10], load: 2, castDelay: 0, recharge: 0,
    maxFires: [2, 2, 2], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'pulse', kind: 'trigger', name: '契機：脈動', glyph: 'ᛥ', condition: 'pulse',
    desc: '直前の顕現が生きている間、一定間隔で直後の塊を発動し続ける。',
    awakening: '脈動の間隔が半分になる。',
    rarity: 3, mana: [15, 15, 15], load: 3, castDelay: 0, recharge: 0,
    maxFires: [3, 4, 5], interval: [0.5, 0.5, 0.25], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'on_bounce', kind: 'trigger', name: '契機：跳弾', glyph: 'ᛦ', condition: 'bounce',
    desc: '直前の顕現が跳ねるたび、直後の塊を発動する。運び手は跳弾+1。',
    awakening: '運び手の跳弾がさらに+2。',
    rarity: 2, mana: [10, 10, 10], load: 2, castDelay: 0, recharge: 0,
    maxFires: [3, 3, 3], carrierBounce: [1, 1, 3], payloadDamageMul: STD_PAYLOAD_MUL,
  },
  {
    id: 'echo', kind: 'trigger', name: '契機：反響', glyph: 'ᛩ', condition: 'echo',
    desc: '直前の顕現が命中するたび、弱めた直後の塊を発動する。',
    awakening: '後続のダメージ減衰がなくなる。',
    rarity: 3, mana: [14, 14, 14], load: 3, castDelay: 0, recharge: 0,
    maxFires: [3, 4, 5], payloadDamageMul: [0.6, 0.72, 1.4],
  },
  {
    id: 'proximity', kind: 'trigger', name: '契機：近接', glyph: 'ᛪ', condition: 'proximity',
    desc: '直前の顕現の近くに敵が入ると、それを消して直後の塊を発動する（地雷）。',
    awakening: '範囲が2倍になり、発動後も1回残る。',
    rarity: 2, mana: [9, 9, 9], load: 2, castDelay: 0, recharge: 0,
    maxFires: [1, 1, 2], radius: [60, 60, 120], payloadDamageMul: STD_PAYLOAD_MUL,
  },
];

// ---------------------------------------------------------------- 多重詠唱 4種
const MULTICASTS: MulticastDef[] = [
  {
    id: 'dual', kind: 'multicast', name: '二重詠唱', glyph: 'ᛠ', pattern: 'parallel',
    desc: '直後の2塊を平行に同時発動する。', awakening: '子が同じ標的へ収束する。',
    rarity: 1, mana: [4, 3, 2], load: 1, castDelay: 0, recharge: 0,
    count: [2, 2, 2], spread: [12, 10, 8],
  },
  {
    id: 'triple', kind: 'multicast', name: '三重詠唱', glyph: 'ᚣ', pattern: 'fan',
    desc: '直後の3塊を扇状に同時発動する。', awakening: '束ねる塊が1つ増える。',
    rarity: 2, mana: [8, 6, 4], load: 2, castDelay: 0, recharge: 0,
    count: [3, 3, 4], spread: [15, 12, 10],
  },
  {
    id: 'quad', kind: 'multicast', name: '四重詠唱', glyph: 'ᚤ', pattern: 'fan',
    desc: '直後の4塊を広い扇状に同時発動する。', awakening: '子の顕現ダメージ+30%。',
    rarity: 3, mana: [14, 11, 7], load: 3, castDelay: 0.05, recharge: 0,
    count: [4, 4, 4], spread: [30, 26, 22],
  },
  {
    id: 'ring', kind: 'multicast', name: '環詠', glyph: 'ᚥ', pattern: 'ring',
    desc: '直後の3塊を、自分を中心に放射状に発動する。', awakening: '0.15秒後にもう一度、角度をずらして放つ。',
    rarity: 2, mana: [10, 8, 5], load: 2, castDelay: 0.03, recharge: 0,
    count: [3, 3, 3], spread: [0, 0, 0],
  },
];

// ---------------------------------------------------------------- 呪い 2種
const CURSES: CurseDef[] = [
  {
    id: 'wild', kind: 'curse', name: '狂詠', glyph: 'ᚧ',
    desc: '直後の塊の顕現が、詠唱ごとに30%の確率で別の顕現に化ける。ダメージ×2。',
    awakening: '（合成できない）',
    rarity: 0, mana: [0, 0, 0], load: 0, castDelay: 0, recharge: 0,
    effect: { mul: { damage: 2 } }, wildChance: 0.3,
  },
  {
    id: 'blood', kind: 'curse', name: '血詠', glyph: 'ᚩ',
    desc: '直後の塊のマナを HP で払う（マナ×0.25）。ダメージ×1.6。',
    awakening: '（合成できない）',
    rarity: 0, mana: [0, 0, 0], load: 0, castDelay: 0, recharge: 0,
    effect: { mul: { damage: 1.6 } }, bloodHpRatio: 0.25,
  },
];

export const ALL_RUNES: readonly RuneDef[] = [...SPELLS, ...MODIFIERS, ...TRIGGERS, ...MULTICASTS, ...CURSES];

const BY_ID = new Map<RuneId, RuneDef>(ALL_RUNES.map((r) => [r.id, r]));

export function getRuneDef(id: RuneId): RuneDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`未知のルーン: ${id}`);
  return def;
}

export function isRuneId(id: string): id is RuneId {
  return BY_ID.has(id as RuneId);
}

export function runesOfKind(kind: RuneKind): RuneDef[] {
  return ALL_RUNES.filter((r) => r.kind === kind);
}

export function getSpellDef(id: RuneId): SpellDef {
  const def = getRuneDef(id);
  if (def.kind !== 'spell') throw new Error(`${id} は顕現ではない`);
  return def;
}
