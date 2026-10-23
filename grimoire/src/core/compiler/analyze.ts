// 解析：マナ・HP コスト・負荷・詠唱遅延（SPEC §4.7）
import type { AstNode } from './ast';
import { tierValue } from '../runes/types';
import type { GlobalMods } from '../grimoire/types';

export interface CastCost {
  manaCost: number;
  hpCost: number;
  load: number;
  /** ルーン由来の詠唱遅延の合計（魔導書の基礎値は含まない） */
  runeCastDelay: number;
}

export interface CostContext {
  readonly global: Readonly<GlobalMods>;
  /** 特性によるマナ倍率（節制の書） */
  readonly manaCostMul: number;
}

const WRAP_MANA_MUL = 1.5;

export function analyzeCost(ast: AstNode | null, ctx: CostContext): CastCost {
  const cost: CastCost = { manaCost: 0, hpCost: 0, load: 0, runeCastDelay: 0 };
  if (ast) walk(ast, 0, cost, ctx);
  // 表示と比較のぶれを防ぐため 0.01 単位に丸める
  cost.manaCost = Math.round(cost.manaCost * 100) / 100;
  cost.hpCost = Math.round(cost.hpCost * 100) / 100;
  cost.runeCastDelay = Math.round(cost.runeCastDelay * 1000) / 1000;
  return cost;
}

/** bloodRatio > 0 の間は、マナの代わりに HP で払う */
function walk(node: AstNode, bloodRatio: number, cost: CastCost, ctx: CostContext): void {
  const def = node.def;
  let mana = tierValue(def.mana, node.rune.tier) * ctx.manaCostMul;
  if (node.wrapped) mana *= WRAP_MANA_MUL;
  if (def.kind === 'multicast') mana *= ctx.global.multicastManaMul;
  if (bloodRatio > 0) cost.hpCost += mana * bloodRatio * ctx.global.bloodCostMul;
  else cost.manaCost += mana;
  cost.load += def.load;
  cost.runeCastDelay += def.castDelay;

  switch (node.type) {
    case 'spell':
      return;
    case 'modifier': {
      const childBlood = node.def.kind === 'curse' && node.def.bloodHpRatio ? node.def.bloodHpRatio : bloodRatio;
      walk(node.child, childBlood, cost, ctx);
      return;
    }
    case 'multicast':
      for (const c of node.children) walk(c, bloodRatio, cost, ctx);
      return;
    case 'trigger':
      walk(node.carrier, bloodRatio, cost, ctx);
      // 後続のマナも詠唱時に前払いする
      if (node.payload) walk(node.payload, bloodRatio, cost, ctx);
      return;
  }
}

/** 過負荷の結果（SPEC §4.7） */
export function overloadOf(load: number, capacity: number, global: Readonly<GlobalMods>): {
  overload: number; damageMul: number; selfDamage: number;
} {
  const overload = Math.max(0, load - capacity);
  const damageMul = Math.min(2, 1 + 0.1 * overload);
  const selfDamage = global.noOverloadSelfDamage ? 0 : 3 * overload;
  return { overload, damageMul, selfDamage };
}
