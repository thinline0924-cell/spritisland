// 魔導書のランダム生成（SPEC §3.1）
import type { IdGen } from '../ids';
import type { Rng } from '../rng';
import { rollRuneOfKind, type Act } from '../progression/rewards';
import { getRuneDef } from '../runes/catalog';
import type { RuneInstance } from '../runes/types';
import { getTraitDef, TRAITS } from './traits';
import type { Grimoire, GrimoireRarity, GrimoireStats, TargetingMode, TraitId } from './types';

type Range = readonly [number, number];

interface RarityTable {
  slots: Range;
  maxMana: Range;
  manaRegen: Range;
  castDelay: Range;
  recharge: Range;
  capacity: Range;
  spreadDeg: Range;
  traits: Range;
}

export const GRIMOIRE_RANGES: Readonly<Record<GrimoireRarity, RarityTable>> = {
  common: {
    slots: [3, 5], maxMana: [80, 160], manaRegen: [20, 40], castDelay: [0.25, 0.5],
    recharge: [0.6, 1.2], capacity: [6, 9], spreadDeg: [0, 10], traits: [0, 0],
  },
  rare: {
    slots: [4, 7], maxMana: [120, 260], manaRegen: [30, 60], castDelay: [0.15, 0.4],
    recharge: [0.4, 1.0], capacity: [8, 12], spreadDeg: [0, 8], traits: [1, 1],
  },
  legendary: {
    slots: [6, 8], maxMana: [200, 400], manaRegen: [50, 90], castDelay: [0.05, 0.3],
    recharge: [0.2, 0.7], capacity: [11, 16], spreadDeg: [0, 5], traits: [1, 2],
  },
};

/** 幕ごとの希少度の重み（コモン / レア / 伝説） */
const RARITY_BY_ACT: Readonly<Record<Act, readonly [number, number, number]>> = {
  1: [75, 22, 3],
  2: [55, 37, 8],
  3: [40, 45, 15],
};

const TARGETING_WEIGHTS: Readonly<Record<TargetingMode, number>> = {
  nearest: 70, moveDir: 15, rotate: 10, random: 5,
};

const round = (v: number, step: number): number => Math.round(v / step) * step;
/** 浮動小数の誤差を消して小数2桁にする */
const to2 = (v: number): number => Math.round(v * 100) / 100;

export interface GenerateOptions {
  readonly act?: Act;
  readonly rarity?: GrimoireRarity;
  /** 最初から入っているルーンの数（省略時は 0〜2 をランダム） */
  readonly prefill?: number;
  /** 最小スロット数（初期魔導書用） */
  readonly minSlots?: number;
}

export function rollGrimoireRarity(rng: Rng, act: Act): GrimoireRarity {
  const w = RARITY_BY_ACT[act];
  return rng.weighted(['common', 'rare', 'legendary'] as const, (r) =>
    r === 'common' ? w[0] : r === 'rare' ? w[1] : w[2],
  );
}

function rollTraits(rng: Rng, count: number): TraitId[] {
  const traits: TraitId[] = [];
  for (let attempt = 0; traits.length < count && attempt < 50; attempt++) {
    const t = rng.pick(TRAITS).id;
    if (traits.includes(t)) continue;
    // 元素の書は1冊に1つまで
    if (t.startsWith('infuse_') && traits.some((x) => x.startsWith('infuse_'))) continue;
    traits.push(t);
  }
  return traits;
}

export function generateGrimoire(rng: Rng, ids: IdGen, opts: GenerateOptions = {}): Grimoire {
  const act = opts.act ?? 1;
  const rarity = opts.rarity ?? rollGrimoireRarity(rng, act);
  const t = GRIMOIRE_RANGES[rarity];

  const traits = rollTraits(rng, rng.int(t.traits[0], t.traits[1]));
  let slots = rng.int(t.slots[0], t.slots[1]);
  for (const id of traits) slots += getTraitDef(id).slotsAdd ?? 0;
  slots = Math.max(opts.minSlots ?? 2, slots);

  const stats: GrimoireStats = {
    slots,
    maxMana: round(rng.range(t.maxMana[0], t.maxMana[1]), 10),
    manaRegen: Math.round(rng.range(t.manaRegen[0], t.manaRegen[1])),
    castDelay: to2(rng.range(t.castDelay[0], t.castDelay[1])),
    recharge: to2(rng.range(t.recharge[0], t.recharge[1])),
    capacity: rng.int(t.capacity[0], t.capacity[1]),
    spreadDeg: Math.round(rng.range(t.spreadDeg[0], t.spreadDeg[1])),
    targeting: rng.weighted(Object.keys(TARGETING_WEIGHTS) as TargetingMode[], (m) => TARGETING_WEIGHTS[m]),
  };

  const slotArr: (RuneInstance | null)[] = new Array<RuneInstance | null>(slots).fill(null);
  const prefill = Math.min(slots, opts.prefill ?? rng.int(0, 2));
  for (let i = 0; i < prefill; i++) {
    // 1つ目は必ず顕現、2つ目は変質か顕現
    const kind = i === 0 ? 'spell' : rng.chance(0.6) ? 'modifier' : 'spell';
    slotArr[i] = { uid: ids.next('r'), defId: rollRuneOfKind(rng, act, kind), tier: 1 };
  }
  // 変質が先に来るよう並べ替える（「変質 → 顕現」で意味が通る並び）
  const [first, second] = slotArr;
  if (prefill === 2 && first && second && getRuneDef(second.defId).kind === 'modifier') {
    slotArr[0] = second;
    slotArr[1] = first;
  }

  return {
    id: ids.next('g'),
    name: generateName(rng, rarity, traits, stats),
    rarity,
    stats,
    traits,
    slots: slotArr,
  };
}

const NOUNS: Readonly<Record<GrimoireRarity, readonly string[]>> = {
  common: ['写本', '手記', '祈祷書', '覚え書き', '綴り'],
  rare: ['魔導書', '秘儀書', '法典', '呪文集'],
  legendary: ['黙示録', '原典', '大典', '聖典'],
};

const PLAIN_EPITHETS = ['古びた', '煤けた', '名もなき', '忘れられた', '血染めの', '黴びた', '囁く'];

export function generateName(rng: Rng, rarity: GrimoireRarity, traits: readonly TraitId[], stats: GrimoireStats): string {
  let epithet: string;
  if (traits.length > 0) {
    epithet = getTraitDef(rng.pick(traits)).epithet;
  } else if (stats.castDelay < 0.3) {
    epithet = '速き';
  } else if (stats.maxMana >= 140) {
    epithet = '溢れる';
  } else if (stats.slots >= 5) {
    epithet = '分厚い';
  } else {
    epithet = rng.pick(PLAIN_EPITHETS);
  }
  return `${epithet}${rng.pick(NOUNS[rarity])}`;
}

/** ラン開始時に選ぶ初期魔導書3冊（顕現1つ入り、重複しない顕現） */
export function generateStarterChoices(rng: Rng, ids: IdGen): Grimoire[] {
  const starters = ['spark', 'fireball', 'shadow', 'icelance', 'blade'] as const;
  const spells = rng.shuffle(starters).slice(0, 3);
  return spells.map((spell, i) => {
    const g = generateGrimoire(rng, ids, { act: 1, rarity: i === 2 ? 'rare' : 'common', prefill: 0, minSlots: 4 });
    g.slots[0] = { uid: ids.next('r'), defId: spell, tier: 1 };
    return g;
  });
}
