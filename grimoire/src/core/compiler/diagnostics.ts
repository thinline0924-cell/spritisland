// 診断メッセージ（SPEC §4.8）。文言はここに集める。
import type { Diagnostic, DiagnosticCode, Severity } from './ast';

const SEVERITY: Record<DiagnosticCode, Severity> = {
  E101: 'error', E102: 'error', E103: 'error',
  W201: 'warning', W202: 'warning', W203: 'warning', W204: 'warning', W205: 'warning',
  W301: 'warning', W302: 'warning',
  I401: 'info', I402: 'info',
};

const ELEMENT_NAME = { arcane: '秘', fire: '炎', thunder: '雷', ice: '氷', dark: '闇' } as const;

/** 「契機：命中」→「命中」。文中では《契機《…》》の重複を避ける */
const bare = (name: string): string => name.replace(/^契機：/, '');

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const MESSAGES = {
  E101: (trigger: string) => `契機《${bare(trigger)}》の前に、引き金となる顕現がありません。このルーンは無視されます。`,
  E102: (mod: string) => `変質《${mod}》の後に顕現がありません。効果を持ちません。`,
  E103: (cost: number, max: number) => `この詠唱はマナ ${fmt(cost)} を要しますが、最大マナは ${fmt(max)} です。永遠に発動しません。`,
  W201: (trigger: string) => `契機《${bare(trigger)}》の後続が空です。`,
  W202: (mc: string, want: number, got: number) => `多重詠唱《${mc}》は${want}塊を求めましたが、${got}塊しかありません。`,
  W203: (from: keyof typeof ELEMENT_NAME, to: keyof typeof ELEMENT_NAME, by: string) =>
    `属性付与が衝突しています（${ELEMENT_NAME[from]} → ${ELEMENT_NAME[to]}）。最後の《${by}》が勝ちます。`,
  W204: (mod: string, spell: string) => `変質《${mod}》は《${spell}》に効果がありません。`,
  W205: (trigger: string, spell: string, why: string) => `契機《${bare(trigger)}》は《${spell}》では発動しません（${why}）。`,
  W301: (load: number, cap: number, mul: number, self: number) =>
    `過負荷：負荷 ${load} / 容量 ${cap}。威力×${mul.toFixed(1)}` + (self > 0 ? `、詠唱ごとに自傷 ${fmt(self)}。` : '。'),
  W302: (deficit: number) => `マナ収支が赤字です（毎秒 -${fmt(deficit)}）。息切れします。`,
  I401: (from: number, to: number) =>
    from === to
      ? `折り返し：スロット ${from} を再読します（マナ×1.5、この詠唱で周が終わります）。`
      : `折り返し：スロット ${from}〜${to} を再読します（マナ×1.5、この詠唱で周が終わります）。`,
  I402: () => '乱丁：表示は一例です。リチャージのたびに並びが変わります。',
} as const;

export function diag(code: DiagnosticCode, message: string, slot: number | null, castIndex: number | null): Diagnostic {
  return { code, severity: SEVERITY[code], message, slot, castIndex };
}
