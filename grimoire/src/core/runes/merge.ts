// 合成（Tier 進化、SPEC §7.3）
import { getRuneDef } from './catalog';
import type { RuneInstance, Tier } from './types';

export type MergeResult =
  | { readonly ok: true; readonly rune: RuneInstance }
  | { readonly ok: false; readonly reason: string };

/** 合成できない理由。できるなら null */
export function mergeBlocker(a: RuneInstance, b: RuneInstance): string | null {
  if (a.uid === b.uid) return '同じルーンどうしは重ねられない';
  if (a.defId !== b.defId) return '別の種類のルーンは合成できない';
  if (getRuneDef(a.defId).kind === 'curse') return '呪いは合成できない';
  if (a.tier === 3 || b.tier === 3) return 'Tier III にはこれ以上重ねられない';
  return null;
}

/** tier = min(3, max(a, b) + 1)。I+I→II、II+I→III なので III には計3枚が要る */
export function mergeRunes(a: RuneInstance, b: RuneInstance, uid: string): MergeResult {
  const reason = mergeBlocker(a, b);
  if (reason) return { ok: false, reason };
  const tier = Math.min(3, Math.max(a.tier, b.tier) + 1) as Tier;
  return { ok: true, rune: { uid, defId: a.defId, tier } };
}
