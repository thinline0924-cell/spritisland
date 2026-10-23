// 開発用：ルーン列をコンパイルしてツリーを表示する
//   npm run compile -- "spark, on_hit, lightning"
//   npm run compile -- "fireball, on_expire, triple, spark, spark, spark" --traits chorus --mana 200
import { compileGrimoire } from '../src/core/compiler';
import { formatCompiled } from '../src/core/compiler/format';
import { parseRuneList } from '../src/core/runes/notation';
import type { GrimoireStats, TraitId } from '../src/core/grimoire/types';

const args = process.argv.slice(2);
const list = args.find((a) => !a.startsWith('--')) ?? 'spark, on_hit, lightning';
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const slots = parseRuneList(list);
const stats: GrimoireStats = {
  slots: slots.length,
  maxMana: Number(opt('mana') ?? 150),
  manaRegen: Number(opt('regen') ?? 40),
  castDelay: Number(opt('delay') ?? 0.3),
  recharge: Number(opt('recharge') ?? 0.8),
  capacity: Number(opt('capacity') ?? 10),
  spreadDeg: 4,
  targeting: 'nearest',
};
const traits = (opt('traits')?.split(',').filter(Boolean) ?? []) as TraitId[];

console.log(`並び: ${list}${traits.length ? `  特性: ${traits.join(',')}` : ''}\n`);
console.log(formatCompiled(compileGrimoire({ slots, stats, traits })));
