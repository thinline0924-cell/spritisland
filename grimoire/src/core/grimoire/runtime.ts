// 魔導書の実行時の状態機械（SPEC §4.7, §4.10）
//   ready ─詠唱─▶ delay ─▶ ready … ─周の終わり─▶ recharging ─▶ ready
// 毎ティック tick() を呼ぶと、発動すべき詠唱が out に積まれる。弾の実体化はシミュレーション側の仕事。
import { compileOf, type CompiledCast, type CompiledGrimoire, type PlanNode } from '../compiler';
import type { Rng } from '../rng';
import { effectiveStats, hasTraitFlag } from './traits';
import type { GlobalMods, Grimoire, GrimoireStats } from './types';

export interface CastEvent {
  readonly castIndex: number;
  /** null は詠唱失敗（最大マナを超える詠唱を飛ばした） */
  readonly plan: PlanNode | null;
  /** 血詠・鮮血の書で払う HP */
  readonly hpCost: number;
  /** 過負荷の自傷 */
  readonly selfDamage: number;
  /** 過負荷によるダメージ倍率 */
  readonly damageMul: number;
}

export type RuntimePhase = 'idle' | 'ready' | 'delay' | 'recharging';

/** 鮮血の書：不足マナ5につき HP1 */
const BLOODBOUND_MANA_PER_HP = 5;
/** 1ティックで連続して詠唱できる上限（極端に短い遅延への保険） */
const MAX_CASTS_PER_TICK = 8;

export class GrimoireRuntime {
  compiled!: CompiledGrimoire;
  stats!: GrimoireStats;
  mana = 0;
  castIndex = 0;
  phase: RuntimePhase = 'ready';
  /** 現在の待ち（delay / recharging）の残り秒 */
  timer = 0;
  /** 現在の待ちの全体の長さ（HUD の進捗表示用） */
  phaseDuration = 0;
  private readonly sealed = new Map<number, number>();
  private readonly shuffleRng: Rng;

  constructor(
    readonly grimoire: Grimoire,
    private global: Readonly<GlobalMods>,
    rng: Rng,
  ) {
    this.shuffleRng = rng.fork(`shuffle:${grimoire.id}`);
    this.recompile();
    this.mana = this.stats.maxMana;
  }

  /** スロットや秘宝が変わったら呼ぶ。周の先頭からやり直す */
  rebuild(global: Readonly<GlobalMods> = this.global): void {
    this.global = global;
    this.recompile();
    this.castIndex = 0;
    this.mana = Math.min(this.mana, this.stats.maxMana);
  }

  private recompile(): void {
    this.stats = effectiveStats(this.grimoire, this.global);
    const shuffle = hasTraitFlag(this.grimoire.traits, 'shuffle');
    this.compiled = compileOf(this.grimoire, this.global, {
      sealed: this.sealed.size > 0 ? new Set(this.sealed.keys()) : undefined,
      shuffleRng: shuffle ? this.shuffleRng : undefined,
    });
    if (this.castIndex >= this.compiled.casts.length) this.castIndex = 0;
  }

  /** 封印術師：スロットを一時的に空として扱う */
  seal(slot: number, seconds: number): void {
    const had = this.sealed.has(slot);
    this.sealed.set(slot, Math.max(seconds, this.sealed.get(slot) ?? 0));
    if (!had) this.recompile();
  }

  isSealed(slot: number): boolean {
    return this.sealed.has(slot);
  }

  /** 疾駆の書：ダッシュで詠唱遅延を打ち切る */
  onDash(): void {
    if (this.phase === 'delay' && hasTraitFlag(this.grimoire.traits, 'dashcast')) this.timer = 0;
  }

  tick(dt: number, out: CastEvent[]): void {
    this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen * dt);
    this.updateSeals(dt);

    const casts = this.compiled.casts;
    if (casts.length === 0) {
      this.phase = 'idle';
      return;
    }
    if (this.phase === 'idle') this.phase = 'ready';

    this.timer -= dt;
    for (let n = 0; n < MAX_CASTS_PER_TICK && this.timer <= 0; n++) {
      this.phase = 'ready';
      const cast = this.compiled.casts[this.castIndex] as CompiledCast;
      if (cast.uncastable) {
        out.push({ castIndex: cast.index, plan: null, hpCost: 0, selfDamage: 0, damageMul: 1 });
        this.advance(cast);
        continue;
      }
      let hpCost = cast.hpCost;
      if (this.mana >= cast.manaCost) {
        this.mana -= cast.manaCost;
      } else if (hasTraitFlag(this.grimoire.traits, 'bloodbound')) {
        hpCost += (cast.manaCost - this.mana) / BLOODBOUND_MANA_PER_HP;
        this.mana = 0;
      } else {
        // マナが溜まるまでこの位置で待つ
        this.timer = 0;
        break;
      }
      out.push({
        castIndex: cast.index, plan: cast.plan, hpCost, selfDamage: cast.selfDamage, damageMul: cast.damageMul,
      });
      this.advance(cast);
    }
  }

  private advance(cast: CompiledCast): void {
    if (cast.endsCycle) {
      const wait = Math.max(cast.castDelay, this.compiled.recharge);
      this.phase = 'recharging';
      this.timer += wait;
      this.phaseDuration = wait;
      this.castIndex = 0;
      if (hasTraitFlag(this.grimoire.traits, 'shuffle')) this.recompile();
    } else {
      this.phase = 'delay';
      this.timer += cast.castDelay;
      this.phaseDuration = cast.castDelay;
      this.castIndex++;
    }
  }

  private updateSeals(dt: number): void {
    if (this.sealed.size === 0) return;
    let changed = false;
    for (const [slot, t] of this.sealed) {
      const left = t - dt;
      if (left <= 0) {
        this.sealed.delete(slot);
        changed = true;
      } else {
        this.sealed.set(slot, left);
      }
    }
    if (changed) this.recompile();
  }
}
