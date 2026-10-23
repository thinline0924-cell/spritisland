// ルーン・コンパイラの入口（SPEC §4）
//   slots ─parse─▶ AST ─lower─▶ CastPlan
//                     └analyze─▶ コスト・診断 ─estimate─▶ 推定 DPS
import type { CompiledCast, CompiledGrimoire, DeckEntry, Diagnostic } from './ast';
import { analyzeCost, overloadOf } from './analyze';
import { diag, MESSAGES } from './diagnostics';
import { estimateCycle } from './estimate';
import { duplicateFirstEmit, lowerNode, type StackMod } from './lower';
import { parseCycle } from './parse';
import { getRuneDef } from '../runes/catalog';
import type { RuneInstance } from '../runes/types';
import type { Rng } from '../rng';
import {
  effectiveStats, getTraitDef, hasTraitFlag, traitManaCostMul, traitTriggerFiresAdd,
} from '../grimoire/traits';
import { NO_GLOBAL_MODS, type GlobalMods, type Grimoire, type GrimoireStats, type TraitId } from '../grimoire/types';

export * from './ast';
export { MESSAGES } from './diagnostics';
export { collectEmits } from './lower';
export { expectedDamage, cycleTimeOf } from './estimate';

export interface CompileInput {
  readonly slots: readonly (RuneInstance | null)[];
  /** 素のステータス（特性・秘宝はここで適用する） */
  readonly stats: GrimoireStats;
  readonly traits: readonly TraitId[];
  readonly global?: Readonly<GlobalMods>;
  /** 封印されたスロット（空として扱う） */
  readonly sealed?: ReadonlySet<number>;
  /** 乱丁の書の並び替えに使う。省略すると元の並びのまま（プレビュー用） */
  readonly shuffleRng?: Rng;
}

const MIN_CAST_DELAY = 0.03;
const MIN_RECHARGE = 0.1;

export function compileGrimoire(input: CompileInput): CompiledGrimoire {
  const global = input.global ?? NO_GLOBAL_MODS;
  const stats = effectiveStats({ stats: input.stats, traits: [...input.traits] }, global);
  const diagnostics: Diagnostic[] = [];

  let deck: DeckEntry[] = [];
  input.slots.forEach((rune, slot) => {
    if (rune && !input.sealed?.has(slot)) deck.push({ slot, rune, def: getRuneDef(rune.defId) });
  });
  if (hasTraitFlag(input.traits, 'shuffle')) {
    diagnostics.push(diag('I402', MESSAGES.I402(), null, null));
    if (input.shuffleRng) deck = input.shuffleRng.shuffle(deck);
  }

  const baseStack: StackMod[] = [];
  for (const id of input.traits) {
    const t = getTraitDef(id);
    if (t.implicit) {
      baseStack.push({
        effect: t.implicit, category: null, name: t.name, slot: null, awaken: null, wildChance: 0, isInfusion: false,
      });
    }
  }

  const parsed = parseCycle(deck, { multicastCountAdd: global.multicastCountAdd, ringCountAdd: global.ringCountAdd });
  const chorus = hasTraitFlag(input.traits, 'chorus');
  const bloodbound = hasTraitFlag(input.traits, 'bloodbound');
  const manaCostMul = traitManaCostMul(input.traits);
  const triggerFiresAdd = traitTriggerFiresAdd(input.traits);

  const casts: CompiledCast[] = parsed.map((p, index) => {
    const castDiags: Diagnostic[] = [...p.diagnostics];
    let plan = p.ast
      ? lowerNode(p.ast, baseStack, { global, baseStack, triggerFiresAdd, castIndex: index, diagnostics: castDiags })
      : null;
    if (plan && chorus) plan = duplicateFirstEmit(plan);

    const cost = analyzeCost(p.ast, { global, manaCostMul });
    const ol = overloadOf(cost.load, stats.capacity, global);
    const uncastable = !bloodbound && cost.manaCost > stats.maxMana;
    const firstSlot = p.slotsRead[0] ?? null;
    if (uncastable) castDiags.push(diag('E103', MESSAGES.E103(cost.manaCost, stats.maxMana), firstSlot, index));
    if (ol.overload > 0) {
      castDiags.push(diag('W301', MESSAGES.W301(cost.load, stats.capacity, ol.damageMul, ol.selfDamage), firstSlot, index));
    }
    diagnostics.push(...castDiags);

    return {
      index,
      ast: p.ast,
      plan,
      slotsRead: p.slotsRead,
      wrappedSlots: p.wrappedSlots,
      ignoredSlots: p.ignoredSlots,
      manaCost: cost.manaCost,
      hpCost: cost.hpCost,
      load: cost.load,
      overload: ol.overload,
      damageMul: ol.damageMul,
      selfDamage: ol.selfDamage,
      castDelay: Math.max(MIN_CAST_DELAY, stats.castDelay + cost.runeCastDelay),
      endsCycle: p.wrapped || index === parsed.length - 1,
      uncastable,
    };
  });

  let runeRecharge = 0;
  for (const e of deck) runeRecharge += e.def.recharge;
  const recharge = Math.max(MIN_RECHARGE, stats.recharge + runeRecharge);

  const estimate = estimateCycle(casts, recharge, stats.manaRegen);
  if (casts.length > 0 && !estimate.sustainable) {
    diagnostics.push(diag('W302', MESSAGES.W302(estimate.manaPerSecond - estimate.manaRegen), null, null));
  }

  return {
    casts,
    recharge,
    deckOrder: deck.map((e) => e.slot),
    diagnostics: dedupe(diagnostics),
    estimate,
    maxMana: stats.maxMana,
    capacity: stats.capacity,
  };
}

/** 同じ変質が多重詠唱の各子に効かない場合など、同一の診断が重複するのをまとめる */
function dedupe(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = `${d.code}|${d.slot}|${d.castIndex}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compileOf(
  g: Pick<Grimoire, 'slots' | 'stats' | 'traits'>,
  global?: Readonly<GlobalMods>,
  opts: { sealed?: ReadonlySet<number>; shuffleRng?: Rng } = {},
): CompiledGrimoire {
  return compileGrimoire({ slots: g.slots, stats: g.stats, traits: g.traits, global, ...opts });
}
