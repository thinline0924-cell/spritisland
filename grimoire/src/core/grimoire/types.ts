// 魔導書の型（SPEC §3）
import type { RuneInstance } from '../runes/types';

export type TargetingMode = 'nearest' | 'moveDir' | 'rotate' | 'random';
export type GrimoireRarity = 'common' | 'rare' | 'legendary';

export type TraitId =
  | 'ricochet' | 'frugal' | 'shuffled' | 'shorthand' | 'chorus' | 'thirst' | 'colossus'
  | 'seeking' | 'eternal' | 'infuse_fire' | 'infuse_thunder' | 'infuse_ice' | 'infuse_dark'
  | 'bloodbound' | 'chained' | 'dashcast';

export interface GrimoireStats {
  slots: number;
  maxMana: number;
  /** 毎秒 */
  manaRegen: number;
  /** 秒 */
  castDelay: number;
  /** 秒 */
  recharge: number;
  capacity: number;
  spreadDeg: number;
  targeting: TargetingMode;
}

export interface Grimoire {
  readonly id: string;
  name: string;
  readonly rarity: GrimoireRarity;
  /** 特性・秘宝を適用する前の素のステータス */
  stats: GrimoireStats;
  traits: TraitId[];
  /** 長さは stats.slots と一致させる。null は空スロット */
  slots: (RuneInstance | null)[];
}

/**
 * 秘宝などランの全体から魔導書とコンパイラに掛かる補正（SPEC §9）。
 * 秘宝の実装（Phase 7）はこの値を組み立てるだけにする。
 */
export interface GlobalMods {
  maxManaMul: number;
  manaRegenMul: number;
  rechargeMul: number;
  capacityAdd: number;
  triggerFiresAdd: number;
  payloadDamageMul: number;
  /** 継承の印：後続が運び手の変質を継承する */
  inheritModifiers: boolean;
  timerIntervalMul: number;
  multicastCountAdd: number;
  ringCountAdd: number;
  multicastManaMul: number;
  spreadMul: number;
  noOverloadSelfDamage: boolean;
  bloodCostMul: number;
}

export const NO_GLOBAL_MODS: Readonly<GlobalMods> = {
  maxManaMul: 1,
  manaRegenMul: 1,
  rechargeMul: 1,
  capacityAdd: 0,
  triggerFiresAdd: 0,
  payloadDamageMul: 1,
  inheritModifiers: false,
  timerIntervalMul: 1,
  multicastCountAdd: 0,
  ringCountAdd: 0,
  multicastManaMul: 1,
  spreadMul: 1,
  noOverloadSelfDamage: false,
  bloodCostMul: 1,
};
