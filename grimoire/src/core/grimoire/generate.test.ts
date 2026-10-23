import { describe, expect, it } from 'vitest';
import { generateGrimoire, generateStarterChoices, GRIMOIRE_RANGES } from './generate';
import { getTraitDef } from './traits';
import { IdGen } from '../ids';
import { Rng } from '../rng';
import { getRuneDef } from '../runes/catalog';
import { compileOf } from '../compiler';
import type { GrimoireRarity } from './types';

describe('魔導書の生成', () => {
  it('同じシードなら同じ魔導書', () => {
    const a = generateGrimoire(new Rng('g'), new IdGen(), { act: 2 });
    const b = generateGrimoire(new Rng('g'), new IdGen(), { act: 2 });
    expect(a).toEqual(b);
  });

  for (const rarity of ['common', 'rare', 'legendary'] as GrimoireRarity[]) {
    it(`${rarity}：ステータスが範囲内で、スロット配列の長さが一致する`, () => {
      const t = GRIMOIRE_RANGES[rarity];
      const rng = new Rng(`range-${rarity}`);
      const ids = new IdGen();
      for (let i = 0; i < 300; i++) {
        const g = generateGrimoire(rng, ids, { rarity });
        const slotsAdd = g.traits.reduce((n, id) => n + (getTraitDef(id).slotsAdd ?? 0), 0);
        expect(g.slots).toHaveLength(g.stats.slots);
        expect(g.stats.slots - slotsAdd).toBeGreaterThanOrEqual(t.slots[0]);
        expect(g.stats.slots - slotsAdd).toBeLessThanOrEqual(t.slots[1]);
        expect(g.stats.maxMana).toBeGreaterThanOrEqual(t.maxMana[0]);
        expect(g.stats.maxMana).toBeLessThanOrEqual(t.maxMana[1]);
        expect(g.stats.manaRegen).toBeGreaterThanOrEqual(t.manaRegen[0]);
        expect(g.stats.manaRegen).toBeLessThanOrEqual(t.manaRegen[1]);
        expect(g.stats.castDelay).toBeGreaterThanOrEqual(t.castDelay[0]);
        expect(g.stats.castDelay).toBeLessThanOrEqual(t.castDelay[1]);
        expect(g.stats.recharge).toBeGreaterThanOrEqual(t.recharge[0]);
        expect(g.stats.recharge).toBeLessThanOrEqual(t.recharge[1]);
        expect(g.stats.capacity).toBeGreaterThanOrEqual(t.capacity[0]);
        expect(g.stats.capacity).toBeLessThanOrEqual(t.capacity[1]);
        expect(g.traits.length).toBeGreaterThanOrEqual(t.traits[0]);
        expect(g.traits.length).toBeLessThanOrEqual(t.traits[1]);
        expect(new Set(g.traits).size).toBe(g.traits.length);
        expect(g.traits.filter((x) => x.startsWith('infuse_')).length).toBeLessThanOrEqual(1);
        expect(g.name.length).toBeGreaterThan(2);
      }
    });
  }

  it('初期ルーンは1つ目が顕現で、そのままコンパイルできる', () => {
    const rng = new Rng('prefill');
    const ids = new IdGen();
    for (let i = 0; i < 200; i++) {
      const g = generateGrimoire(rng, ids, { prefill: 2, minSlots: 3 });
      const runes = g.slots.filter((s) => s !== null);
      expect(runes).toHaveLength(2);
      expect(runes.some((r) => getRuneDef(r.defId).kind === 'spell')).toBe(true);
      const c = compileOf(g);
      expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('ID は重複しない', () => {
    const rng = new Rng('ids');
    const ids = new IdGen();
    const all = Array.from({ length: 50 }, () => generateGrimoire(rng, ids, { prefill: 2 }));
    const uids = all.flatMap((g) => [g.id, ...g.slots.filter((s) => s !== null).map((s) => s.uid)]);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('初期魔導書：3冊、4スロット以上、違う顕現が1つずつ', () => {
    const choices = generateStarterChoices(new Rng('starter'), new IdGen());
    expect(choices).toHaveLength(3);
    const spells = choices.map((g) => g.slots[0]?.defId);
    expect(new Set(spells).size).toBe(3);
    for (const g of choices) {
      expect(g.stats.slots).toBeGreaterThanOrEqual(4);
      expect(g.slots.filter((s) => s !== null)).toHaveLength(1);
    }
  });
});
