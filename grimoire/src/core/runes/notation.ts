// ルーン列の短い記法。テスト・開発用 CLI・デバッグ画面で使う。
//   "spark, homing:2, _, on_hit, lightning:3"
//   ・名前は RuneId、":数字" は tier（省略時 1）、"_" は空スロット
import { isRuneId } from './catalog';
import type { RuneInstance, Tier } from './types';

export function parseRuneList(text: string, uidPrefix = 'r'): (RuneInstance | null)[] {
  const tokens = text.split(/[\s,]+/).filter((t) => t.length > 0);
  return tokens.map((tok, i) => {
    if (tok === '_') return null;
    const [id, tierText] = tok.split(':');
    if (!id || !isRuneId(id)) throw new Error(`未知のルーン: ${tok}`);
    const tierNum = tierText === undefined ? 1 : Number(tierText);
    if (tierNum !== 1 && tierNum !== 2 && tierNum !== 3) throw new Error(`tier は 1〜3: ${tok}`);
    return { uid: `${uidPrefix}${i}`, defId: id, tier: tierNum as Tier };
  });
}

export function formatRuneList(slots: readonly (RuneInstance | null)[]): string {
  return slots.map((r) => (r ? (r.tier === 1 ? r.defId : `${r.defId}:${r.tier}`) : '_')).join(', ');
}
