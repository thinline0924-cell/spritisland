// core の公開 API。render / ui / app はここからだけ import する。
export * from './rng';
export * from './ids';
export * from './runes/types';
export { ALL_RUNES, getRuneDef, getSpellDef, runesOfKind, isRuneId, DEFAULT_PARAMS, FORM_ACCEPTS } from './runes/catalog';
export { mergeRunes, mergeBlocker, type MergeResult } from './runes/merge';
export { parseRuneList, formatRuneList } from './runes/notation';
export * from './compiler';
export { formatCompiled, formatAst, formatPlan } from './compiler/format';
export * from './grimoire/types';
export { TRAITS, getTraitDef, effectiveStats, hasTraitFlag } from './grimoire/traits';
export { generateGrimoire, generateStarterChoices, generateName, GRIMOIRE_RANGES } from './grimoire/generate';
export { GrimoireRuntime, type CastEvent, type RuntimePhase } from './grimoire/runtime';
export { rollRuneChoices, rollRuneOfKind, type Act, type RewardContext } from './progression/rewards';
export { xpNeeded, addXp } from './progression/xp';
