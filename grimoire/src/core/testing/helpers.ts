// テスト用の小道具
import { compileGrimoire, type CompiledGrimoire, type EmitPlan, type PlanNode } from '../compiler';
import { parseRuneList } from '../runes/notation';
import { NO_GLOBAL_MODS, type GlobalMods, type GrimoireStats, type TraitId } from '../grimoire/types';

export const TEST_STATS: GrimoireStats = {
  slots: 8,
  maxMana: 1000,
  manaRegen: 1000,
  castDelay: 0.2,
  recharge: 0.5,
  capacity: 100,
  spreadDeg: 0,
  targeting: 'nearest',
};

export function compileList(
  list: string,
  opts: { stats?: Partial<GrimoireStats>; traits?: TraitId[]; global?: Partial<GlobalMods> } = {},
): CompiledGrimoire {
  const slots = parseRuneList(list);
  return compileGrimoire({
    slots,
    stats: { ...TEST_STATS, slots: slots.length, ...opts.stats },
    traits: opts.traits ?? [],
    global: { ...NO_GLOBAL_MODS, ...opts.global },
  });
}

export function firstEmit(node: PlanNode | null | undefined): EmitPlan {
  if (!node) throw new Error('plan が空');
  if (node.kind === 'emit') return node;
  return firstEmit(node.children[0]);
}

export function codes(c: CompiledGrimoire): string[] {
  return c.diagnostics.map((d) => d.code);
}
