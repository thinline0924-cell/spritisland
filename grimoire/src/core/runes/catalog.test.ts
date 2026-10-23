import { describe, expect, it } from 'vitest';
import { ALL_RUNES, getRuneDef, runesOfKind } from './catalog';
import { mergeRunes } from './merge';
import { formatRuneList, parseRuneList } from './notation';

describe('カタログ', () => {
  it('40種：顕現12・変質14・契機8・多重詠唱4・呪い2', () => {
    expect(ALL_RUNES).toHaveLength(40);
    expect(runesOfKind('spell')).toHaveLength(12);
    expect(runesOfKind('modifier')).toHaveLength(14);
    expect(runesOfKind('trigger')).toHaveLength(8);
    expect(runesOfKind('multicast')).toHaveLength(4);
    expect(runesOfKind('curse')).toHaveLength(2);
  });

  it('ID・名前・ルーン文字はすべて重複しない', () => {
    for (const key of ['id', 'name', 'glyph'] as const) {
      const values = ALL_RUNES.map((r) => r[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it('顕現のダメージは tier とともに増える', () => {
    for (const s of runesOfKind('spell')) {
      if (s.kind !== 'spell') continue;
      const [a, b, c] = s.params.map((p) => p.damage);
      expect(a, s.id).toBeGreaterThan(0);
      expect(b, s.id).toBeGreaterThan(a as number);
      expect(c, s.id).toBeGreaterThan(b as number);
    }
  });

  it('マナは tier で増えない', () => {
    for (const r of ALL_RUNES) {
      expect(r.mana[1], r.id).toBeLessThanOrEqual(r.mana[0]);
      expect(r.mana[2], r.id).toBeLessThanOrEqual(r.mana[1]);
    }
  });

  it('呪いだけが希少度0（報酬に出ない）', () => {
    for (const r of ALL_RUNES) expect(r.rarity === 0, r.id).toBe(r.kind === 'curse');
  });

  it('すべてに説明と覚醒の説明がある', () => {
    for (const r of ALL_RUNES) {
      expect(r.desc.length, r.id).toBeGreaterThan(0);
      expect(r.awakening.length, r.id).toBeGreaterThan(0);
    }
  });
});

describe('記法', () => {
  it('往復できる', () => {
    const text = 'spark, homing:2, _, on_hit, lightning:3';
    expect(formatRuneList(parseRuneList(text))).toBe(text);
  });

  it('未知のルーンと不正な tier は拒否する', () => {
    expect(() => parseRuneList('nope')).toThrow();
    expect(() => parseRuneList('spark:4')).toThrow();
  });
});

describe('合成', () => {
  const r = (uid: string, defId: Parameters<typeof getRuneDef>[0], tier: 1 | 2 | 3) => ({ uid, defId, tier });

  it('I+I→II、II+I→III、II+II→III', () => {
    expect(mergeRunes(r('a', 'spark', 1), r('b', 'spark', 1), 'c')).toEqual({ ok: true, rune: r('c', 'spark', 2) });
    expect(mergeRunes(r('a', 'spark', 2), r('b', 'spark', 1), 'c')).toEqual({ ok: true, rune: r('c', 'spark', 3) });
    expect(mergeRunes(r('a', 'spark', 2), r('b', 'spark', 2), 'c')).toEqual({ ok: true, rune: r('c', 'spark', 3) });
  });

  it('合成できないもの', () => {
    expect(mergeRunes(r('a', 'spark', 1), r('b', 'fireball', 1), 'c').ok).toBe(false);
    expect(mergeRunes(r('a', 'wild', 1), r('b', 'wild', 1), 'c').ok).toBe(false);
    expect(mergeRunes(r('a', 'spark', 3), r('b', 'spark', 1), 'c').ok).toBe(false);
    expect(mergeRunes(r('a', 'spark', 3), r('b', 'spark', 3), 'c').ok).toBe(false);
    expect(mergeRunes(r('a', 'spark', 1), r('a', 'spark', 1), 'c').ok).toBe(false);
  });
});
