import { describe, expect, it } from 'vitest';
import { dailySeed, Rng } from './rng';

describe('Rng', () => {
  it('同じシードなら同じ列', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('違うシードなら違う列', () => {
    const a = Array.from({ length: 8 }, (_, i, r = new Rng('A')) => r.nextU32() + i);
    const b = Array.from({ length: 8 }, (_, i, r = new Rng('B')) => r.nextU32() + i);
    expect(a).not.toEqual(b);
  });

  it('fork は親の状態を進めない（ストリームを足しても既存の展開が変わらない）', () => {
    const a = new Rng('s');
    const b = new Rng('s');
    a.fork('loot');
    expect(a.next()).toBe(b.next());
    expect(new Rng('s').fork('x').next()).toBe(new Rng('s').fork('x').next());
    expect(new Rng('s').fork('x').next()).not.toBe(new Rng('s').fork('y').next());
  });

  it('next は [0,1)、int は両端を含む', () => {
    const r = new Rng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('shuffle は並べ替えだけで要素を変えない', () => {
    const r = new Rng('shuffle');
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('weighted は重みに比例し、重み0は選ばない', () => {
    const r = new Rng('weighted');
    const counts = { a: 0, b: 0, c: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const k = r.weighted(['a', 'b', 'c'] as const, (x) => (x === 'a' ? 1 : x === 'b' ? 3 : 0));
      counts[k]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.b / N).toBeGreaterThan(0.72);
    expect(counts.b / N).toBeLessThan(0.78);
  });

  it('日替わりのシード', () => {
    expect(dailySeed(2026, 3, 7)).toBe('daily-2026-03-07');
  });
});
