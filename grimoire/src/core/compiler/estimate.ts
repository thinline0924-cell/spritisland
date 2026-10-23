// 推定 DPS とマナ収支（SPEC §4.9）。プレビュー用の概算で、元素反応などは含まない。
import type { CompiledCast, CycleEstimate, EmitPlan, PlanNode, TriggerPlan } from './ast';
import { getSpellDef } from '../runes/catalog';

/** 弾1発（分裂後の1発）が起こす命中イベントの数 */
function hitEvents(e: EmitPlan): number {
  const p = e.params;
  switch (e.form) {
    case 'chain':
      return p.chains + 1;
    case 'projectile':
      if (p.tickInterval > 0) return ticks(e);
      return Math.min(1 + p.pierce + p.bounce, 4);
    case 'field':
    case 'orbit':
      return ticks(e);
    case 'slash':
    case 'nova':
    case 'meteor':
      return 1;
  }
}

function ticks(e: EmitPlan): number {
  const p = e.params;
  if (p.tickInterval <= 0) return 1;
  return (p.lifetime / p.tickInterval) * Math.max(1, p.blades);
}

function triggerFires(t: TriggerPlan, carrier: EmitPlan): number {
  const p = carrier.params;
  switch (t.condition) {
    case 'hit':
    case 'echo':
      return Math.min(t.maxFires, hitEvents(carrier));
    case 'bounce':
      return carrier.form === 'projectile' ? Math.min(t.maxFires, p.bounce) : 0;
    case 'kill':
      return 0.3 * t.maxFires;
    case 'pulse':
      return t.interval > 0 ? Math.min(t.maxFires, Math.floor(p.lifetime / t.interval)) : 0;
    case 'timer':
      // 寿命のない形式（即時のもの）は時限で発動しない
      if (carrier.form === 'projectile' || carrier.form === 'field' || carrier.form === 'orbit') {
        return p.lifetime >= t.interval ? t.maxFires : 0;
      }
      return 0;
    case 'expire':
    case 'proximity':
      return t.maxFires;
  }
}

export function expectedDamage(node: PlanNode): number {
  if (node.kind === 'group') {
    let sum = 0;
    for (const c of node.children) sum += expectedDamage(c);
    // 環詠の覚醒：もう一度放つ
    if (node.awaken.includes('multicast:ring')) sum *= 2;
    return sum;
  }
  const p = node.params;
  const def = getSpellDef(node.spellId);
  const critFactor = 1 + p.crit * (p.critMul - 1);
  const perProjectile = p.damage * hitEvents(node) * def.estTargets * critFactor;
  let payload = 0;
  if (node.trigger) {
    payload = triggerFires(node.trigger, node) * node.trigger.damageMul * expectedDamage(node.trigger.payload);
  }
  return (perProjectile + payload) * p.split;
}

/** 1周の時間：最後の詠唱の後は、詠唱遅延とリチャージの長い方だけ待つ */
export function cycleTimeOf(casts: readonly CompiledCast[], recharge: number): number {
  if (casts.length === 0) return 0;
  let t = 0;
  for (let i = 0; i < casts.length - 1; i++) t += (casts[i] as CompiledCast).castDelay;
  t += Math.max((casts[casts.length - 1] as CompiledCast).castDelay, recharge);
  return t;
}

export function estimateCycle(casts: readonly CompiledCast[], recharge: number, manaRegen: number): CycleEstimate {
  const cycleTime = cycleTimeOf(casts, recharge);
  let manaPerCycle = 0;
  let damagePerCycle = 0;
  for (const c of casts) {
    if (c.uncastable || !c.plan) continue;
    manaPerCycle += c.manaCost;
    damagePerCycle += expectedDamage(c.plan) * c.damageMul;
  }
  const manaPerSecond = cycleTime > 0 ? manaPerCycle / cycleTime : 0;
  const sustainable = manaPerSecond <= manaRegen + 1e-9;
  let dps = cycleTime > 0 ? damagePerCycle / cycleTime : 0;
  if (!sustainable && manaPerSecond > 0) dps *= manaRegen / manaPerSecond;
  return {
    cycleTime,
    manaPerCycle,
    manaPerSecond,
    manaRegen,
    sustainable,
    damagePerCycle,
    dps,
    excluded: ['元素反応', '状態異常の継続ダメージ', '覚醒の一部', '秘宝の一部'],
  };
}
