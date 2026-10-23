// ルーンの型定義（SPEC §4.1, §5）

export type Tier = 1 | 2 | 3;
/** tier I / II / III の値 */
export type TierValues<T> = readonly [T, T, T];

export function tierValue<T>(values: TierValues<T>, tier: Tier): T {
  return values[tier - 1] as T;
}

export type RuneKind = 'spell' | 'modifier' | 'trigger' | 'multicast' | 'curse';
export type Element = 'arcane' | 'fire' | 'thunder' | 'ice' | 'dark';
/** 0 は報酬に出ない（呪い） */
export type Rarity = 0 | 1 | 2 | 3;

export type SpellId =
  | 'spark' | 'fireball' | 'lightning' | 'icelance' | 'blade' | 'gravity'
  | 'summon' | 'shadow' | 'frostnova' | 'meteor' | 'orbit' | 'thunderorb';
export type ModifierId =
  | 'homing' | 'pierce' | 'spiral' | 'split'
  | 'infuse_fire' | 'infuse_thunder' | 'infuse_ice' | 'infuse_dark'
  | 'giant' | 'accelerate' | 'bounce' | 'amplify' | 'extend' | 'precision';
export type TriggerId =
  | 'on_hit' | 'on_expire' | 'timer' | 'on_kill' | 'pulse' | 'on_bounce' | 'echo' | 'proximity';
export type MulticastId = 'dual' | 'triple' | 'quad' | 'ring';
export type CurseId = 'wild' | 'blood';
export type RuneId = SpellId | ModifierId | TriggerId | MulticastId | CurseId;

/** 顕現の形式。変質が効くかどうか（W204）の判定にも使う */
export type SpellForm = 'projectile' | 'chain' | 'slash' | 'nova' | 'meteor' | 'field' | 'orbit';

/** 変質の分類。形式ごとに受け付ける分類が決まっている */
export type ModCategory = 'movement' | 'pierce' | 'lifetime' | 'split' | 'general';

/** 実行時に使う、確定した顕現の数値 */
export interface SpellParams {
  damage: number;
  /** px/s */
  speed: number;
  /** 秒。弾の寿命・設置物や周回の持続時間 */
  lifetime: number;
  /** 当たり判定の半径 px */
  size: number;
  /** 爆発・新星の半径 px（0 なら範囲なし） */
  aoeRadius: number;
  pierce: number;
  bounce: number;
  /** 旋回速度 rad/s */
  homing: number;
  /** 螺旋の振幅 px */
  spiral: number;
  /** 分裂後の弾数（1 なら分裂なし） */
  split: number;
  /** 連鎖雷の跳躍回数 */
  chains: number;
  /** 連鎖雷の跳躍距離 px */
  chainRange: number;
  /** 照準・着弾に使う射程 px */
  range: number;
  /** 持続ダメージの刻み 秒（0 なら刻みなし） */
  tickInterval: number;
  /** 周回刃の枚数・吸引や放電の効果半径などに使う補助値 */
  blades: number;
  effectRadius: number;
  /** 斬撃の弧の角度 rad */
  arc: number;
  /** 0..1 */
  crit: number;
  critMul: number;
  /** 魔導書の拡散角に掛ける倍率 */
  spreadMul: number;
  knockback: number;
  /** 状態異常の付与量の倍率（冷気スタック等） */
  statusPower: number;
  /** 着弾までの遅延 秒（隕石） */
  delay: number;
}

export type NumericParam = keyof SpellParams;

/** 変質1つぶんの効果。積んだ順に add → mul → set の順で適用する */
export interface ModEffect {
  add?: Partial<Record<NumericParam, number>>;
  mul?: Partial<Record<NumericParam, number>>;
  set?: Partial<Record<NumericParam, number>>;
  /** 属性を上書きする */
  element?: Element;
  /** 秘属性の顕現にだけ属性を付ける（元素の書）。属性付与ルーンが後から積まれれば上書きされる */
  elementIfArcane?: Element;
}

export interface RuneInstance {
  readonly uid: string;
  readonly defId: RuneId;
  readonly tier: Tier;
}

interface RuneDefBase<K extends RuneKind, I extends RuneId> {
  readonly id: I;
  readonly kind: K;
  readonly name: string;
  readonly desc: string;
  /** tier III の質的変化の説明 */
  readonly awakening: string;
  readonly rarity: Rarity;
  readonly mana: TierValues<number>;
  /** 演算容量に対する負荷 */
  readonly load: number;
  /** 詠唱遅延への加算 秒 */
  readonly castDelay: number;
  /** リチャージへの加算 秒 */
  readonly recharge: number;
  /** 呪文帳に描くルーン文字（UI 用の1文字） */
  readonly glyph: string;
}

export interface SpellDef extends RuneDefBase<'spell', SpellId> {
  readonly element: Element;
  readonly form: SpellForm;
  readonly params: TierValues<Partial<SpellParams> & { damage: number }>;
  /** 推定 DPS 用：1回の命中イベントで巻き込む敵数の目安 */
  readonly estTargets: number;
}

export interface ModifierDef extends RuneDefBase<'modifier', ModifierId> {
  readonly category: ModCategory;
  readonly effects: TierValues<ModEffect>;
}

export type TriggerCondition =
  | 'hit' | 'expire' | 'timer' | 'kill' | 'pulse' | 'bounce' | 'echo' | 'proximity';

export interface TriggerDef extends RuneDefBase<'trigger', TriggerId> {
  readonly condition: TriggerCondition;
  readonly maxFires: TierValues<number>;
  /** 時限・脈動の秒数 */
  readonly interval?: TierValues<number>;
  /** 後続のダメージ倍率 */
  readonly payloadDamageMul: TierValues<number>;
  /** 運び手に足す跳弾数（契機：跳弾） */
  readonly carrierBounce?: TierValues<number>;
  /** 近接の検知半径 px */
  readonly radius?: TierValues<number>;
}

export type GroupPattern = 'parallel' | 'fan' | 'ring';

export interface MulticastDef extends RuneDefBase<'multicast', MulticastId> {
  readonly count: TierValues<number>;
  readonly pattern: GroupPattern;
  /** 扇の全体角（度）、平行なら間隔（px）、放射なら未使用 */
  readonly spread: TierValues<number>;
}

export interface CurseDef extends RuneDefBase<'curse', CurseId> {
  readonly effect: ModEffect;
  /** 狂詠：顕現が化ける確率 */
  readonly wildChance?: number;
  /** 血詠：マナの代わりに払う HP の比率 */
  readonly bloodHpRatio?: number;
}

export type RuneDef = SpellDef | ModifierDef | TriggerDef | MulticastDef | CurseDef;
