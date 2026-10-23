// コンパイル結果を文字のツリーにする（CLI・テストのスナップショット・デバッグ用）
import type { AstNode, CompiledGrimoire, PlanNode } from './ast';
import { getSpellDef } from '../runes/catalog';

const ROMAN = ['', 'I', 'II', 'III'] as const;
const ELEMENT = { arcane: '秘', fire: '炎', thunder: '雷', ice: '氷', dark: '闇' } as const;

function label(node: AstNode): string {
  const tier = ROMAN[node.rune.tier];
  const wrap = node.wrapped ? ' ↺' : '';
  return `[${node.slot + 1}] ${node.def.name} ${tier}${wrap}`;
}

export function formatAst(node: AstNode, indent = ''): string[] {
  const lines: string[] = [];
  switch (node.type) {
    case 'spell':
      lines.push(`${indent}${label(node)}`);
      break;
    case 'modifier':
      lines.push(`${indent}${label(node)} ┐`);
      lines.push(...formatAst(node.child, indent + '  '));
      break;
    case 'multicast':
      lines.push(`${indent}${label(node)} ×${node.count}${node.missing > 0 ? `（${node.missing}塊不足）` : ''}`);
      for (const c of node.children) lines.push(...formatAst(c, indent + '  │ '));
      break;
    case 'trigger':
      lines.push(...formatAst(node.carrier, indent));
      lines.push(`${indent}  ⤷ ${node.def.name} ${ROMAN[node.rune.tier]}${node.wrapped ? ' ↺' : ''} [${node.slot + 1}]`);
      if (node.payload) lines.push(...formatAst(node.payload, indent + '      '));
      else lines.push(`${indent}      （空）`);
      break;
  }
  return lines;
}

export function formatPlan(node: PlanNode, indent = ''): string[] {
  if (node.kind === 'group') {
    const lines = [`${indent}{${node.multicastId} ${node.pattern}}`];
    for (const c of node.children) lines.push(...formatPlan(c, indent + '  '));
    return lines;
  }
  const p = node.params;
  const parts = [`dmg ${p.damage.toFixed(1)}`];
  if (p.speed) parts.push(`spd ${Math.round(p.speed)}`);
  if (p.pierce && p.pierce < 999) parts.push(`貫通${p.pierce}`);
  if (p.bounce) parts.push(`跳弾${p.bounce}`);
  if (p.homing) parts.push(`追尾${p.homing}`);
  if (p.split > 1) parts.push(`×${p.split}`);
  const name = getSpellDef(node.spellId).name;
  const lines = [`${indent}${name}(${ELEMENT[node.element]}) ${parts.join(' ')}${node.awaken.length ? ' ★' + node.awaken.join(',') : ''}`];
  if (node.trigger) {
    const t = node.trigger;
    lines.push(`${indent}  ⤷ ${t.condition} 最大${t.maxFires}回 ×${t.damageMul.toFixed(2)}`);
    lines.push(...formatPlan(t.payload, indent + '      '));
  }
  return lines;
}

export function formatCompiled(c: CompiledGrimoire): string {
  const out: string[] = [];
  c.casts.forEach((cast) => {
    const flags = [
      `マナ ${cast.manaCost}`,
      cast.hpCost > 0 ? `HP ${cast.hpCost}` : '',
      `負荷 ${cast.load}/${c.capacity}`,
      `遅延 ${cast.castDelay.toFixed(2)}s`,
      cast.overload > 0 ? `過負荷+${cast.overload}` : '',
      cast.uncastable ? '発動不能' : '',
      cast.endsCycle ? '周の終わり' : '',
    ].filter(Boolean);
    out.push(`詠唱${cast.index + 1}  (${flags.join(' / ')})`);
    if (cast.ast) out.push(...formatAst(cast.ast, '  '));
    else out.push('  （空撃ち）');
  });
  const e = c.estimate;
  out.push(
    `リチャージ ${c.recharge.toFixed(2)}s / 1周 ${e.cycleTime.toFixed(2)}s / マナ毎秒 ${e.manaPerSecond.toFixed(1)}（回復 ${e.manaRegen.toFixed(1)}）/ 推定DPS ${e.dps.toFixed(1)}`,
  );
  for (const d of c.diagnostics) out.push(`${d.code} ${d.message}`);
  return out.join('\n');
}
