// コンパイラの中間表現（SPEC §4.6）
import type {
  CurseDef, Element, GroupPattern, ModifierDef, MulticastDef, MulticastId, RuneDef, RuneInstance,
  SpellDef, SpellForm, SpellId, SpellParams, Tier, TriggerCondition, TriggerDef, TriggerId,
} from '../runes/types';

/** デッキの1要素。slot は魔導書上の元の位置（0 始まり） */
export interface DeckEntry {
  readonly slot: number;
  readonly rune: RuneInstance;
  readonly def: RuneDef;
}

interface AstBase {
  readonly slot: number;
  readonly rune: RuneInstance;
  /** 折り返しで読んだか（マナ×1.5） */
  readonly wrapped: boolean;
}

export interface SpellNode extends AstBase {
  readonly type: 'spell';
  readonly def: SpellDef;
}
export interface ModifierNode extends AstBase {
  readonly type: 'modifier';
  /** 呪いも文法上は変質として扱う */
  readonly def: ModifierDef | CurseDef;
  readonly child: AstNode;
}
export interface MulticastNode extends AstBase {
  readonly type: 'multicast';
  readonly def: MulticastDef;
  readonly children: readonly AstNode[];
  /** 束ねる塊数（tier・秘宝込み） */
  readonly count: number;
  readonly missing: number;
}
export interface TriggerNode extends AstBase {
  readonly type: 'trigger';
  readonly def: TriggerDef;
  readonly carrier: AstNode;
  readonly payload: AstNode | null;
}

export type AstNode = SpellNode | ModifierNode | MulticastNode | TriggerNode;

// ------------------------------------------------------------------ 実行計画

export interface EmitPlan {
  readonly kind: 'emit';
  readonly spellId: SpellId;
  readonly tier: Tier;
  readonly form: SpellForm;
  readonly element: Element;
  readonly params: Readonly<SpellParams>;
  /** 有効な覚醒（'spell:fireball' / 'mod:homing' など） */
  readonly awaken: readonly string[];
  readonly trigger: TriggerPlan | null;
  /** 狂詠：別の顕現に化ける確率 */
  readonly wildChance: number;
  readonly sourceSlot: number;
}

export interface GroupPlan {
  readonly kind: 'group';
  readonly multicastId: MulticastId | 'chorus';
  readonly pattern: GroupPattern;
  /** 扇なら全体角（度）、平行なら間隔（px） */
  readonly spread: number;
  readonly children: readonly PlanNode[];
  readonly awaken: readonly string[];
  readonly sourceSlot: number;
}

export interface TriggerPlan {
  readonly triggerId: TriggerId;
  readonly condition: TriggerCondition;
  readonly maxFires: number;
  /** 時限・脈動の秒数（他は 0） */
  readonly interval: number;
  /** 近接の検知半径（他は 0） */
  readonly radius: number;
  readonly damageMul: number;
  readonly awakened: boolean;
  readonly payload: PlanNode;
  readonly sourceSlot: number;
}

export type PlanNode = EmitPlan | GroupPlan;

// ------------------------------------------------------------------ 診断

export type Severity = 'error' | 'warning' | 'info';
export type DiagnosticCode =
  | 'E101' | 'E102' | 'E103'
  | 'W201' | 'W202' | 'W203' | 'W204' | 'W205'
  | 'W301' | 'W302'
  | 'I401' | 'I402';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly message: string;
  /** 関係するスロット（なければ null） */
  readonly slot: number | null;
  /** 関係する詠唱の番号（全体に関わるものは null） */
  readonly castIndex: number | null;
}

// ------------------------------------------------------------------ 成果物

export interface CompiledCast {
  readonly index: number;
  readonly ast: AstNode | null;
  /** null は空撃ち（fizzle） */
  readonly plan: PlanNode | null;
  /** この詠唱で読んだスロット（無視したものも含む、読んだ順） */
  readonly slotsRead: readonly number[];
  readonly wrappedSlots: readonly number[];
  readonly ignoredSlots: readonly number[];
  readonly manaCost: number;
  readonly hpCost: number;
  readonly load: number;
  /** 容量の超過分（0 なら過負荷なし） */
  readonly overload: number;
  /** 過負荷による全ダメージ倍率 */
  readonly damageMul: number;
  /** 過負荷による自傷 */
  readonly selfDamage: number;
  readonly castDelay: number;
  /** この詠唱で周が終わる（折り返し、または最後の詠唱） */
  readonly endsCycle: boolean;
  /** 最大マナを超えていて永遠に撃てない */
  readonly uncastable: boolean;
}

export interface CycleEstimate {
  /** 1周の秒数 */
  readonly cycleTime: number;
  readonly manaPerCycle: number;
  readonly manaPerSecond: number;
  readonly manaRegen: number;
  readonly sustainable: boolean;
  /** 1周で与える期待ダメージ */
  readonly damagePerCycle: number;
  /** マナ収支まで考えた推定 DPS */
  readonly dps: number;
  /** 推定に含まれない要素（プレビューに表示する） */
  readonly excluded: readonly string[];
}

export interface CompiledGrimoire {
  readonly casts: readonly CompiledCast[];
  readonly recharge: number;
  /** デッキを読んだ順の元スロット番号 */
  readonly deckOrder: readonly number[];
  readonly diagnostics: readonly Diagnostic[];
  readonly estimate: CycleEstimate;
  readonly maxMana: number;
  readonly capacity: number;
}
