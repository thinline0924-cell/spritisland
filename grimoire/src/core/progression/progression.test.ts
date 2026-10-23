import { describe, expect, it } from 'vitest';
import { rollRuneChoices, KIND_WEIGHTS, type Act } from './rewards';
import { addXp, xpNeeded } from './xp';
import { Rng } from '../rng';
import { getRuneDef } from '../runes/catalog';

describe('報酬の抽選', () => {
  it('3つとも違うルーンで、呪いは出ない', () => {
    const rng = new Rng('choices');
    for (let i = 0; i < 2000; i++) {
      const c = rollRuneChoices(rng, { act: 1, owned: [] });
      expect(c).toHaveLength(3);
      expect(new Set(c).size).toBe(3);
      for (const id of c) expect(getRuneDef(id).kind).not.toBe('curse');
    }
  });

  it('同じシードなら同じ提示', () => {
    expect(rollRuneChoices(new Rng('x'), { act: 2, owned: ['spark'] })).toEqual(
      rollRuneChoices(new Rng('x'), { act: 2, owned: ['spark'] }),
    );
  });

  it('種類の分布が重みに沿う', () => {
    const rng = new Rng('kinds');
    const counts: Record<string, number> = {};
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const [id] = rollRuneChoices(rng, { act: 1, owned: [] }, 1);
      const k = getRuneDef(id!).kind;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const total = Object.values(KIND_WEIGHTS).reduce((a, b) => a + b, 0);
    for (const [kind, w] of Object.entries(KIND_WEIGHTS)) {
      expect(Math.abs((counts[kind] ?? 0) / N - w / total), kind).toBeLessThan(0.02);
    }
  });

  it('幕が進むほど希少度3が増える', () => {
    const rate = (act: Act) => {
      const rng = new Rng(`rarity-${act}`);
      let r3 = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) {
        const [id] = rollRuneChoices(rng, { act, owned: [] }, 1);
        if (getRuneDef(id!).rarity === 3) r3++;
      }
      return r3 / N;
    };
    const [a, b, c] = [rate(1), rate(2), rate(3)];
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('所持バイアス：持っているルーンが出やすい', () => {
    const N = 20000;
    let withBias = 0;
    let without = 0;
    const r1 = new Rng('owned-1');
    const r2 = new Rng('owned-2');
    for (let i = 0; i < N; i++) {
      if (rollRuneChoices(r1, { act: 1, owned: ['meteor'] }).includes('meteor')) withBias++;
      if (rollRuneChoices(r2, { act: 1, owned: [] }).includes('meteor')) without++;
    }
    expect(withBias / N).toBeGreaterThan(0.4);
    expect(without / N).toBeLessThan(0.05);
  });

  it('所持している呪いは提示に混ざらない', () => {
    const rng = new Rng('curse-owned');
    for (let i = 0; i < 500; i++) {
      expect(rollRuneChoices(rng, { act: 1, owned: ['wild', 'blood'] })).not.toContain('wild');
    }
  });
});

describe('経験値', () => {
  it('必要量はレベルとともに増える', () => {
    expect(xpNeeded(1)).toBe(10);
    for (let l = 1; l < 50; l++) expect(xpNeeded(l + 1)).toBeGreaterThan(xpNeeded(l));
  });

  it('余りを持ち越し、一気に複数レベル上がる', () => {
    expect(addXp(1, 0, 9)).toEqual({ level: 1, xp: 9, levelsGained: 0 });
    expect(addXp(1, 9, 1)).toEqual({ level: 2, xp: 0, levelsGained: 1 });
    const r = addXp(1, 0, xpNeeded(1) + xpNeeded(2) + 3);
    expect(r).toEqual({ level: 3, xp: 3, levelsGained: 2 });
  });
});
