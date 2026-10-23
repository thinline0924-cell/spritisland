// 魔導書の固有効果（SPEC §3.3）
import type { ModEffect } from '../runes/types';
import type { GlobalMods, Grimoire, GrimoireStats, TraitId } from './types';

export type TraitFlag = 'chorus' | 'shuffle' | 'bloodbound' | 'dashcast';

export interface TraitDef {
  readonly id: TraitId;
  readonly name: string;
  readonly desc: string;
  /** 名前の生成に使う接頭語 */
  readonly epithet: string;
  readonly stat?: {
    maxManaMul?: number;
    manaRegenMul?: number;
    castDelayMul?: number;
    castDelayAdd?: number;
    rechargeMul?: number;
    capacityAdd?: number;
  };
  /** 生成時にだけ適用するスロット増減 */
  readonly slotsAdd?: number;
  /** すべての顕現の変質スタックの先頭に積む暗黙の変質 */
  readonly implicit?: ModEffect;
  readonly manaCostMul?: number;
  readonly triggerFiresAdd?: number;
  readonly flags?: readonly TraitFlag[];
}

export const TRAITS: readonly TraitDef[] = [
  { id: 'ricochet', name: '跳弾の書', epithet: '跳ね返る', desc: 'すべての顕現に跳弾+1。', implicit: { add: { bounce: 1 } } },
  {
    id: 'frugal', name: '節制の書', epithet: '節制の', desc: 'マナ消費×0.5、弾速×0.7。',
    manaCostMul: 0.5, implicit: { mul: { speed: 0.7 } },
  },
  {
    id: 'shuffled', name: '乱丁の書', epithet: '乱丁の', desc: 'リチャージのたびに並びがシャッフルされる。ダメージ+25%。',
    implicit: { mul: { damage: 1.25 } }, flags: ['shuffle'],
  },
  {
    id: 'shorthand', name: '速記の書', epithet: '速記の', desc: '詠唱遅延×0.5、演算容量-2。',
    stat: { castDelayMul: 0.5, capacityAdd: -2 },
  },
  { id: 'chorus', name: '重唱の書', epithet: '重唱する', desc: '各詠唱で最初に現れる顕現が2回発動する。', flags: ['chorus'] },
  {
    id: 'thirst', name: '渇望の書', epithet: '渇望せる', desc: 'マナ回復×2、最大マナ×0.6。',
    stat: { manaRegenMul: 2, maxManaMul: 0.6 },
  },
  {
    id: 'colossus', name: '巨人の書', epithet: '巨人の', desc: '弾の大きさ×1.5、詠唱遅延+0.1。',
    stat: { castDelayAdd: 0.1 }, implicit: { mul: { size: 1.5, aoeRadius: 1.2 } },
  },
  { id: 'seeking', name: '追尾の書', epithet: '飢えた', desc: 'すべての弾に弱い追尾。', implicit: { add: { homing: 2 } } },
  {
    id: 'eternal', name: '永劫の書', epithet: '永劫の', desc: 'リチャージ×0.5（スロットが1つ少ない）。',
    stat: { rechargeMul: 0.5 }, slotsAdd: -1,
  },
  { id: 'infuse_fire', name: '炎の書', epithet: '灰燼の', desc: '秘属性の顕現を炎にする。', implicit: { elementIfArcane: 'fire' } },
  { id: 'infuse_thunder', name: '雷の書', epithet: '雷鳴の', desc: '秘属性の顕現を雷にする。', implicit: { elementIfArcane: 'thunder' } },
  { id: 'infuse_ice', name: '氷の書', epithet: '霜降る', desc: '秘属性の顕現を氷にする。', implicit: { elementIfArcane: 'ice' } },
  { id: 'infuse_dark', name: '闇の書', epithet: '深淵の', desc: '秘属性の顕現を闇にする。', implicit: { elementIfArcane: 'dark' } },
  {
    id: 'bloodbound', name: '鮮血の書', epithet: '鮮血の', desc: 'マナが足りないとき、足りない分を HP で払う（マナ5につき HP1）。',
    flags: ['bloodbound'],
  },
  { id: 'chained', name: '連鎖の書', epithet: '連なる', desc: '契機の最大発動回数+1。', triggerFiresAdd: 1 },
  { id: 'dashcast', name: '疾駆の書', epithet: '疾駆する', desc: 'ダッシュすると、次の詠唱の遅延がなくなる。', flags: ['dashcast'] },
];

const TRAIT_BY_ID = new Map<TraitId, TraitDef>(TRAITS.map((t) => [t.id, t]));

export function getTraitDef(id: TraitId): TraitDef {
  const def = TRAIT_BY_ID.get(id);
  if (!def) throw new Error(`未知の特性: ${id}`);
  return def;
}

export function hasTraitFlag(traits: readonly TraitId[], flag: TraitFlag): boolean {
  return traits.some((t) => getTraitDef(t).flags?.includes(flag) ?? false);
}

/** 特性と秘宝を適用した実効ステータス */
export function effectiveStats(g: Pick<Grimoire, 'stats' | 'traits'>, global: Readonly<GlobalMods>): GrimoireStats {
  const s: GrimoireStats = { ...g.stats };
  for (const id of g.traits) {
    const st = getTraitDef(id).stat;
    if (!st) continue;
    s.maxMana *= st.maxManaMul ?? 1;
    s.manaRegen *= st.manaRegenMul ?? 1;
    s.castDelay = s.castDelay * (st.castDelayMul ?? 1) + (st.castDelayAdd ?? 0);
    s.recharge *= st.rechargeMul ?? 1;
    s.capacity += st.capacityAdd ?? 0;
  }
  s.maxMana *= global.maxManaMul;
  s.manaRegen *= global.manaRegenMul;
  s.recharge *= global.rechargeMul;
  s.capacity += global.capacityAdd;
  s.spreadDeg *= global.spreadMul;
  s.capacity = Math.max(1, Math.round(s.capacity));
  s.maxMana = Math.round(s.maxMana);
  return s;
}

export function traitManaCostMul(traits: readonly TraitId[]): number {
  let m = 1;
  for (const id of traits) m *= getTraitDef(id).manaCostMul ?? 1;
  return m;
}

export function traitTriggerFiresAdd(traits: readonly TraitId[]): number {
  let n = 0;
  for (const id of traits) n += getTraitDef(id).triggerFiresAdd ?? 0;
  return n;
}
