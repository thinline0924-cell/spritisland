import { describe, expect, it } from 'vitest';
import { GrimoireRuntime, type CastEvent } from './runtime';
import { Rng } from '../rng';
import { parseRuneList } from '../runes/notation';
import { firstEmit, TEST_STATS } from '../testing/helpers';
import { NO_GLOBAL_MODS, type Grimoire, type GrimoireStats, type TraitId } from './types';

function make(list: string, stats: Partial<GrimoireStats> = {}, traits: TraitId[] = []): GrimoireRuntime {
  const slots = parseRuneList(list);
  const g: Grimoire = {
    id: 'g1', name: 'テスト', rarity: 'common',
    stats: { ...TEST_STATS, slots: slots.length, ...stats }, traits, slots,
  };
  return new GrimoireRuntime(g, NO_GLOBAL_MODS, new Rng('runtime'));
}

/** dt 刻みで seconds だけ進め、起きた詠唱を [時刻, 顕現ID] で返す */
function run(rt: GrimoireRuntime, seconds: number, dt = 1 / 60): { t: number; ev: CastEvent }[] {
  const out: { t: number; ev: CastEvent }[] = [];
  const buf: CastEvent[] = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    buf.length = 0;
    rt.tick(dt, buf);
    for (const ev of buf) out.push({ t: (i + 1) * dt, ev });
  }
  return out;
}

const spellOf = (e: CastEvent) => (e.plan ? firstEmit(e.plan).spellId : 'fizzle');

describe('魔導書の実行時', () => {
  it('詠唱遅延とリチャージに従って順に詠唱する', () => {
    const rt = make('spark, fireball', { castDelay: 0.2, recharge: 0.5 });
    const evs = run(rt, 1.3);
    expect(evs.map((e) => spellOf(e.ev))).toEqual(['spark', 'fireball', 'spark', 'fireball']);
    // spark → 0.2 後に fireball → 周の終わりは max(火球の遅延 0.28, リチャージ 0.5) 後に spark
    expect(evs[1]!.t).toBeCloseTo(1 / 60 + 0.2, 1);
    expect(evs[2]!.t - evs[1]!.t).toBeCloseTo(0.5, 1);
  });

  it('マナを消費し、足りなければ溜まるまで待つ', () => {
    const rt = make('meteor', { maxMana: 50, manaRegen: 10, castDelay: 0.1, recharge: 0.1 });
    const evs = run(rt, 5);
    // 1発目は満タンから。2発目は 40 溜まるまで約 3 秒かかる
    expect(evs).toHaveLength(2);
    expect(evs[1]!.t - evs[0]!.t).toBeGreaterThan(2.9);
    expect(evs[1]!.t - evs[0]!.t).toBeLessThan(3.2);
  });

  it('マナは最大値を超えない', () => {
    const rt = make('_', { maxMana: 100, manaRegen: 50 });
    run(rt, 3);
    expect(rt.mana).toBe(100);
    expect(rt.phase).toBe('idle');
  });

  it('最大マナを超える詠唱は飛ばして先へ進む（デッドロックしない）', () => {
    const rt = make('dual, meteor, meteor, spark', { maxMana: 60, castDelay: 0.1, recharge: 0.1 });
    // 発動不能でも詠唱遅延（隕石2つぶん +0.5）とリチャージ（+0.4）は掛かる
    const evs = run(rt, 2.5);
    expect(evs.slice(0, 4).map((e) => spellOf(e.ev))).toEqual(['fizzle', 'spark', 'fizzle', 'spark']);
  });

  it('鮮血の書は不足分を HP で払う', () => {
    const rt = make('meteor', { maxMana: 50, manaRegen: 0, castDelay: 0.1, recharge: 0.1 }, ['bloodbound']);
    const evs = run(rt, 0.5);
    expect(evs.length).toBeGreaterThanOrEqual(2);
    expect(evs[0]!.ev.hpCost).toBe(0);
    // 2発目：残り10、不足30 → HP6
    expect(evs[1]!.ev.hpCost).toBeCloseTo(6);
  });

  it('過負荷は詠唱イベントに自傷と倍率を載せる', () => {
    const rt = make('dual, fireball, fireball', { capacity: 2 });
    const [first] = run(rt, 0.1);
    expect(first!.ev.selfDamage).toBe(9);
    expect(first!.ev.damageMul).toBeCloseTo(1.3);
  });

  it('封印したスロットは空として扱い、時間で戻る', () => {
    const rt = make('spark, fireball', { castDelay: 0.1, recharge: 0.1 });
    rt.seal(1, 1);
    expect(rt.isSealed(1)).toBe(true);
    expect(rt.compiled.casts).toHaveLength(1);
    const during = run(rt, 0.9).map((e) => spellOf(e.ev));
    expect(during.every((s) => s === 'spark')).toBe(true);
    run(rt, 0.2);
    expect(rt.isSealed(1)).toBe(false);
    expect(rt.compiled.casts).toHaveLength(2);
  });

  it('乱丁の書はリチャージのたびに並びが変わり、同じシードなら同じ', () => {
    const list = 'spark, fireball, icelance, blade, shadow, lightning';
    const order = () => {
      const rt = make(list, { castDelay: 0.05, recharge: 0.05 }, ['shuffled']);
      return run(rt, 3).map((e) => spellOf(e.ev));
    };
    const a = order();
    expect(order()).toEqual(a);
    const cycles = [a.slice(0, 6).join(), a.slice(6, 12).join(), a.slice(12, 18).join()];
    expect(new Set(cycles).size).toBeGreaterThan(1);
  });

  it('疾駆の書はダッシュで詠唱遅延を打ち切る', () => {
    const rt = make('spark, spark, spark', { castDelay: 1, recharge: 1 }, ['dashcast']);
    run(rt, 0.1);
    expect(rt.phase).toBe('delay');
    rt.onDash();
    const evs = run(rt, 1 / 60);
    expect(evs).toHaveLength(1);
  });

  it('rebuild で周の先頭に戻る', () => {
    const rt = make('spark, fireball, icelance', { castDelay: 0.2 });
    run(rt, 0.1);
    expect(rt.castIndex).toBe(1);
    rt.grimoire.slots[0] = null;
    rt.rebuild();
    expect(rt.castIndex).toBe(0);
    expect(rt.compiled.casts).toHaveLength(2);
  });
});
