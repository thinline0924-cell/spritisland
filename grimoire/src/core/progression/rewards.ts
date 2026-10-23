// レベルアップ報酬の抽選（SPEC §7.4）
import { ALL_RUNES } from '../runes/catalog';
import type { Rarity, RuneDef, RuneId, RuneKind } from '../runes/types';
import type { Rng } from '../rng';

export type Act = 1 | 2 | 3;

export const KIND_WEIGHTS: Readonly<Record<Exclude<RuneKind, 'curse'>, number>> = {
  spell: 30,
  modifier: 40,
  trigger: 15,
  multicast: 15,
};

/** 希少度ごとの重み（第1幕 / 第2幕 / 第3幕） */
export const RARITY_WEIGHTS: Readonly<Record<1 | 2 | 3, readonly [number, number, number]>> = {
  1: [70, 55, 40],
  2: [25, 35, 42],
  3: [5, 10, 18],
};

/** 各候補が「すでに持っているルーン」から選ばれる確率（合成の機会を作る） */
export const OWNED_BIAS = 0.2;

export interface RewardContext {
  readonly act: Act;
  /** 装備中・書庫にあるルーンの種類（重複可） */
  readonly owned: readonly RuneId[];
}

const POOL = ALL_RUNES.filter((r) => r.rarity > 0);

function rollFromPool(rng: Rng, act: Act, kindFilter?: RuneKind): RuneDef {
  const kinds = Object.keys(KIND_WEIGHTS) as (keyof typeof KIND_WEIGHTS)[];
  const kind = kindFilter ?? rng.weighted(kinds, (k) => KIND_WEIGHTS[k]);
  const ofKind = POOL.filter((r) => r.kind === kind);
  // その種類に存在する希少度だけで抽選する（変質には希少度3がない）
  const rarities = ([1, 2, 3] as const).filter((r) => ofKind.some((d) => d.rarity === r));
  const rarity = rng.weighted(rarities, (r) => RARITY_WEIGHTS[r][act - 1] ?? 0);
  return rng.pick(ofKind.filter((d) => d.rarity === (rarity as Rarity)));
}

export function rollRuneChoices(rng: Rng, ctx: RewardContext, count = 3): RuneId[] {
  const chosen: RuneId[] = [];
  const ownedPool = [...new Set(ctx.owned)].filter((id) => POOL.some((r) => r.id === id));
  for (let attempt = 0; chosen.length < count && attempt < 200; attempt++) {
    const fromOwned = ownedPool.length > 0 && rng.chance(OWNED_BIAS);
    const id = fromOwned ? rng.pick(ownedPool) : rollFromPool(rng, ctx.act).id;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return chosen;
}

/** 魔導書の初期ルーンなど、種類を指定して1つ引く */
export function rollRuneOfKind(rng: Rng, act: Act, kind: Exclude<RuneKind, 'curse'>): RuneId {
  return rollFromPool(rng, act, kind).id;
}
