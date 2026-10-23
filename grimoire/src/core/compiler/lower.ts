// lower：AST → 実行計画（SPEC §4.6「下げ方の規則」）
// 変質を畳み込み、顕現ごとの数値を確定させる。
import type {
  AstNode, Diagnostic, EmitPlan, GroupPlan, PlanNode, TriggerPlan,
} from './ast';
import { diag, MESSAGES } from './diagnostics';
import { DEFAULT_PARAMS, FORM_ACCEPTS, getSpellDef } from '../runes/catalog';
import {
  tierValue,
  type Element, type ModCategory, type ModEffect, type NumericParam, type SpellDef, type SpellParams,
} from '../runes/types';
import type { GlobalMods } from '../grimoire/types';

/** 変質スタックの1段 */
export interface StackMod {
  readonly effect: ModEffect;
  /** null は暗黙の変質（特性・覚醒など）。W204 の対象にしない */
  readonly category: ModCategory | null;
  readonly name: string;
  readonly slot: number | null;
  /** tier III のルーンなら覚醒 ID */
  readonly awaken: string | null;
  readonly wildChance: number;
  /** 属性付与ルーンか（W203 の判定用） */
  readonly isInfusion: boolean;
}

export interface LowerContext {
  readonly global: Readonly<GlobalMods>;
  /** 特性による暗黙の変質。すべての顕現（後続を含む）の先頭に積む */
  readonly baseStack: readonly StackMod[];
  readonly triggerFiresAdd: number;
  readonly castIndex: number;
  readonly diagnostics: Diagnostic[];
}

const INT_PARAMS: readonly NumericParam[] = ['pierce', 'bounce', 'split', 'chains', 'blades'];

function applyEffect(p: SpellParams, e: ModEffect): void {
  if (e.add) for (const [k, v] of Object.entries(e.add) as [NumericParam, number][]) p[k] += v;
  if (e.mul) for (const [k, v] of Object.entries(e.mul) as [NumericParam, number][]) p[k] *= v;
  if (e.set) for (const [k, v] of Object.entries(e.set) as [NumericParam, number][]) p[k] = v;
}

function clampParams(p: SpellParams): void {
  for (const k of INT_PARAMS) p[k] = Math.round(p[k]);
  p.split = Math.min(25, Math.max(1, p.split));
  p.crit = Math.min(1, Math.max(0, p.crit));
  p.speed = Math.max(0, p.speed);
  p.spreadMul = Math.max(0, p.spreadMul);
  p.lifetime = Math.max(0, p.lifetime);
}

function accepts(def: SpellDef, m: StackMod): boolean {
  return m.category === null || FORM_ACCEPTS[def.form].includes(m.category);
}

function lowerSpell(node: Extract<AstNode, { type: 'spell' }>, stack: readonly StackMod[], ctx: LowerContext): EmitPlan {
  const def = node.def;
  const tier = node.rune.tier;
  const params: SpellParams = { ...DEFAULT_PARAMS, ...tierValue(def.params, tier) };
  let element: Element = def.element;
  let infusedBy: { element: Element; name: string } | null = null;
  let wildChance = 0;
  const awaken: string[] = [];
  if (tier === 3) awaken.push(`spell:${def.id}`);

  for (const m of stack) {
    if (!accepts(def, m)) {
      ctx.diagnostics.push(diag('W204', MESSAGES.W204(m.name, def.name), m.slot, ctx.castIndex));
      continue;
    }
    applyEffect(params, m.effect);
    if (m.effect.elementIfArcane && def.element === 'arcane' && infusedBy === null) {
      element = m.effect.elementIfArcane;
    }
    if (m.effect.element) {
      if (m.isInfusion && infusedBy && infusedBy.element !== m.effect.element) {
        ctx.diagnostics.push(diag('W203', MESSAGES.W203(infusedBy.element, m.effect.element, m.name), m.slot, ctx.castIndex));
      }
      element = m.effect.element;
      if (m.isInfusion) infusedBy = { element: m.effect.element, name: m.name };
    }
    if (m.wildChance > 0) wildChance = 1 - (1 - wildChance) * (1 - m.wildChance);
    if (m.awaken) awaken.push(m.awaken);
  }
  clampParams(params);
  return {
    kind: 'emit', spellId: def.id, tier, form: def.form, element, params, awaken,
    trigger: null, wildChance, sourceSlot: node.slot,
  };
}

function stackModFromNode(node: Extract<AstNode, { type: 'modifier' }>): StackMod {
  const def = node.def;
  if (def.kind === 'curse') {
    return {
      effect: def.effect, category: null, name: def.name, slot: node.slot, awaken: null,
      wildChance: def.wildChance ?? 0, isInfusion: false,
    };
  }
  return {
    effect: tierValue(def.effects, node.rune.tier),
    category: def.category,
    name: def.name,
    slot: node.slot,
    awaken: node.rune.tier === 3 ? `mod:${def.id}` : null,
    wildChance: 0,
    isInfusion: def.effects[0].element !== undefined,
  };
}

/** 計画の中のすべての emit を（後続の中は含めずに）列挙する */
export function collectEmits(node: PlanNode, out: EmitPlan[] = []): EmitPlan[] {
  if (node.kind === 'emit') out.push(node);
  else for (const c of node.children) collectEmits(c, out);
  return out;
}

const TRIGGER_FORM_RULES: Partial<Record<string, { forms: readonly string[]; why: string }>> = {
  bounce: { forms: ['projectile'], why: '跳ねない形式です' },
  proximity: { forms: ['projectile', 'field'], why: '留まらない形式です' },
};

export function lowerNode(node: AstNode, stack: readonly StackMod[], ctx: LowerContext): PlanNode {
  switch (node.type) {
    case 'spell':
      return lowerSpell(node, stack, ctx);
    case 'modifier':
      return lowerNode(node.child, [...stack, stackModFromNode(node)], ctx);
    case 'multicast': {
      const def = node.def;
      const tier = node.rune.tier;
      const awaken: string[] = tier === 3 ? [`multicast:${def.id}`] : [];
      // 四重詠唱の覚醒：子の顕現ダメージ+30%
      const childStack: readonly StackMod[] =
        tier === 3 && def.id === 'quad'
          ? [...stack, {
            effect: { mul: { damage: 1.3 } }, category: null, name: def.name, slot: node.slot,
            awaken: null, wildChance: 0, isInfusion: false,
          }]
          : stack;
      const group: GroupPlan = {
        kind: 'group',
        multicastId: def.id,
        pattern: def.pattern,
        spread: tierValue(def.spread, tier),
        children: node.children.map((c) => lowerNode(c, childStack, ctx)),
        awaken,
        sourceSlot: node.slot,
      };
      return group;
    }
    case 'trigger': {
      const def = node.def;
      const tier = node.rune.tier;
      const carrier = lowerNode(node.carrier, stack, ctx);
      if (!node.payload) return carrier;
      const payloadStack = ctx.global.inheritModifiers ? carrierStack(node.carrier, stack) : ctx.baseStack;
      const payload = lowerNode(node.payload, payloadStack, ctx);
      const isTimed = def.condition === 'timer' || def.condition === 'pulse';
      const plan: TriggerPlan = {
        triggerId: def.id,
        condition: def.condition,
        maxFires: tierValue(def.maxFires, tier) + ctx.global.triggerFiresAdd + ctx.triggerFiresAdd,
        interval: def.interval ? tierValue(def.interval, tier) * (isTimed ? ctx.global.timerIntervalMul : 1) : 0,
        radius: def.radius ? tierValue(def.radius, tier) : 0,
        damageMul: tierValue(def.payloadDamageMul, tier) * ctx.global.payloadDamageMul,
        awakened: tier === 3,
        payload,
        sourceSlot: node.slot,
      };
      const bounceAdd = def.carrierBounce ? tierValue(def.carrierBounce, tier) : 0;
      const rule = TRIGGER_FORM_RULES[def.condition];
      return attachTrigger(carrier, plan, bounceAdd, rule, def.name, ctx);
    }
  }
}

/** 運び手に直接掛かっている変質まで含めたスタック（継承の印用） */
function carrierStack(node: AstNode, stack: readonly StackMod[]): readonly StackMod[] {
  return node.type === 'modifier' ? carrierStack(node.child, [...stack, stackModFromNode(node)]) : stack;
}

/** 運び手のすべての emit に契機を付ける。plan は不変データなので付け替えた新しい木を返す */
function attachTrigger(
  node: PlanNode,
  plan: TriggerPlan,
  bounceAdd: number,
  rule: { forms: readonly string[]; why: string } | undefined,
  triggerName: string,
  ctx: LowerContext,
): PlanNode {
  if (node.kind === 'group') {
    return { ...node, children: node.children.map((c) => attachTrigger(c, plan, bounceAdd, rule, triggerName, ctx)) };
  }
  if (node.trigger) return node;
  if (rule && !rule.forms.includes(node.form)) {
    ctx.diagnostics.push(
      diag('W205', MESSAGES.W205(triggerName, spellName(node), rule.why), plan.sourceSlot, ctx.castIndex),
    );
  }
  if (plan.condition === 'timer' && node.form === 'projectile' && plan.interval > node.params.lifetime) {
    ctx.diagnostics.push(
      diag('W205', MESSAGES.W205(triggerName, spellName(node), '時限より先に消えます'), plan.sourceSlot, ctx.castIndex),
    );
  }
  const params = bounceAdd > 0 && node.form === 'projectile'
    ? { ...node.params, bounce: node.params.bounce + bounceAdd }
    : node.params;
  return { ...node, params, trigger: plan };
}

function spellName(e: EmitPlan): string {
  return getSpellDef(e.spellId).name;
}

/** 重唱の書：最初に現れる emit を2回発動にする */
export function duplicateFirstEmit(node: PlanNode): PlanNode {
  if (node.kind === 'emit') {
    return {
      kind: 'group', multicastId: 'chorus', pattern: 'parallel', spread: 10,
      children: [node, node], awaken: [], sourceSlot: node.sourceSlot,
    };
  }
  const [first, ...rest] = node.children;
  if (!first) return node;
  return { ...node, children: [duplicateFirstEmit(first), ...rest] };
}
