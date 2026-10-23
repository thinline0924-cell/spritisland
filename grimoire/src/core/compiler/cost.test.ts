// マナ・HP・負荷・遅延・過負荷・推定 DPS（SPEC §4.7, §4.9）
import { describe, expect, it } from 'vitest';
import { compileList, codes } from '../testing/helpers';
import { cycleTimeOf } from './estimate';

const cast0 = (list: string, opts?: Parameters<typeof compileList>[1]) => {
  const c = compileList(list, opts).casts[0];
  if (!c) throw new Error('詠唱がない');
  return c;
};

describe('マナ', () => {
  it('塊に含まれるすべてのルーンの合計（後続も前払い）', () => {
    // 追尾6 + 火球15 + 契機8 + 雷撃18
    expect(cast0('homing, fireball, on_hit, lightning').manaCost).toBe(47);
  });

  it('多重詠唱は tier でマナが下がる', () => {
    expect(cast0('dual, spark, spark').manaCost).toBe(4 + 10);
    expect(cast0('dual:3, spark, spark').manaCost).toBe(2 + 10);
  });

  it('節制の書は半分', () => {
    expect(cast0('fireball', { traits: ['frugal'] }).manaCost).toBe(7.5);
  });

  it('秘宝「扇の羽」は多重詠唱のマナだけを下げる', () => {
    expect(cast0('triple, spark, spark, spark', { global: { multicastManaMul: 0.7 } }).manaCost).toBeCloseTo(8 * 0.7 + 15);
  });

  it('血詠の子孫は HP で払う', () => {
    const c = cast0('blood, meteor');
    expect(c.manaCost).toBe(0);
    expect(c.hpCost).toBe(10);
  });

  it('血詠は多重詠唱の子すべてに及び、外の契機の後続には及ばない', () => {
    const c = cast0('blood, dual, spark, spark');
    expect(c.manaCost).toBe(0);
    expect(c.hpCost).toBeCloseTo((4 + 10) * 0.25);
    const d = cast0('blood, spark, on_hit, fireball');
    // 血詠は運び手（火花弾）にだけ掛かる
    expect(d.hpCost).toBeCloseTo(5 * 0.25);
    expect(d.manaCost).toBe(8 + 15);
  });

  it('E103：最大マナを超える詠唱は発動不能', () => {
    const c = compileList('meteor, meteor', { stats: { maxMana: 60 } });
    // 1つずつなら40で撃てる
    expect(c.casts.every((x) => !x.uncastable)).toBe(true);
    const d = compileList('dual, meteor, meteor', { stats: { maxMana: 60 } });
    expect(d.casts[0]?.uncastable).toBe(true);
    expect(codes(d)).toContain('E103');
  });

  it('鮮血の書なら最大マナを超えても発動不能にならない', () => {
    const d = compileList('dual, meteor, meteor', { stats: { maxMana: 60 }, traits: ['bloodbound'] });
    expect(d.casts[0]?.uncastable).toBe(false);
  });
});

describe('負荷と過負荷', () => {
  it('負荷はルーンの合計', () => {
    expect(cast0('homing, fireball, on_hit, lightning').load).toBe(1 + 2 + 2 + 2);
  });

  it('容量以内なら過負荷なし', () => {
    const c = cast0('fireball', { stats: { capacity: 2 } });
    expect(c.overload).toBe(0);
    expect(c.damageMul).toBe(1);
  });

  it('超過分で威力と自傷が増え、W301', () => {
    const c = compileList('homing, fireball, on_hit, lightning', { stats: { capacity: 4 } });
    const x = c.casts[0]!;
    expect(x.overload).toBe(3);
    expect(x.damageMul).toBeCloseTo(1.3);
    expect(x.selfDamage).toBe(9);
    expect(codes(c)).toContain('W301');
  });

  it('威力の倍率は×2で頭打ち', () => {
    const x = cast0('quad, meteor, meteor, meteor, meteor', { stats: { capacity: 1 } });
    expect(x.overload).toBeGreaterThan(10);
    expect(x.damageMul).toBe(2);
  });

  it('秘宝「過負荷の冠」で自傷なし', () => {
    const x = cast0('quad, meteor, meteor, meteor, meteor', { stats: { capacity: 1 }, global: { noOverloadSelfDamage: true } });
    expect(x.selfDamage).toBe(0);
    expect(x.damageMul).toBe(2);
  });

  it('秘宝「写本師の羽ペン」で容量が増える', () => {
    const c = compileList('fireball', { stats: { capacity: 1 }, global: { capacityAdd: 3 } });
    expect(c.capacity).toBe(4);
    expect(c.casts[0]?.overload).toBe(0);
  });

  it('速記の書は容量-2', () => {
    expect(compileList('spark', { stats: { capacity: 8 }, traits: ['shorthand'] }).capacity).toBe(6);
  });
});

describe('詠唱遅延とリチャージ', () => {
  it('詠唱遅延は魔導書の値＋読んだルーンの合計', () => {
    // 0.2 + 火球0.08 + 巨大化0.05
    expect(cast0('giant, fireball').castDelay).toBeCloseTo(0.33);
  });

  it('下限 0.03 秒', () => {
    expect(cast0('accelerate, precision, blade', { stats: { castDelay: 0 } }).castDelay).toBeCloseTo(0.03);
  });

  it('リチャージはデッキ全体のルーンの合計（隕石 +0.2）', () => {
    expect(compileList('spark, meteor').recharge).toBeCloseTo(0.7);
  });

  it('速記の書は詠唱遅延が半分', () => {
    expect(cast0('spark', { traits: ['shorthand'] }).castDelay).toBeCloseTo(0.1);
  });

  it('1周の時間：最後は詠唱遅延とリチャージの長い方', () => {
    const c = compileList('spark, spark, spark', { stats: { castDelay: 0.2, recharge: 0.5 } });
    expect(cycleTimeOf(c.casts, c.recharge)).toBeCloseTo(0.2 + 0.2 + 0.5);
    const d = compileList('spark, spark', { stats: { castDelay: 0.9, recharge: 0.5 } });
    expect(cycleTimeOf(d.casts, d.recharge)).toBeCloseTo(0.9 + 0.9);
    expect(d.estimate.cycleTime).toBeCloseTo(1.8);
  });
});

describe('推定 DPS とマナ収支', () => {
  it('ダメージを上げる変質を足すと DPS が上がる', () => {
    const base = compileList('spark').estimate.dps;
    expect(compileList('amplify, spark').estimate.dps).toBeGreaterThan(base);
    expect(compileList('spark:3').estimate.dps).toBeGreaterThan(base);
  });

  it('契機の後続を足すと DPS が上がる', () => {
    expect(compileList('spark, on_hit, lightning').estimate.dps).toBeGreaterThan(compileList('spark').estimate.dps);
  });

  it('過負荷の倍率が DPS に入る', () => {
    const normal = compileList('fireball').estimate.dps;
    const over = compileList('fireball', { stats: { capacity: 0 } }).estimate.dps;
    expect(over / normal).toBeCloseTo(1.1);
  });

  it('マナが足りないと DPS は回復量に比例して落ち、W302', () => {
    const rich = compileList('meteor', { stats: { manaRegen: 1000 } });
    const poor = compileList('meteor', { stats: { manaRegen: 10 } });
    expect(rich.estimate.sustainable).toBe(true);
    expect(poor.estimate.sustainable).toBe(false);
    expect(codes(poor)).toContain('W302');
    expect(poor.estimate.dps / rich.estimate.dps).toBeCloseTo(10 / poor.estimate.manaPerSecond);
  });

  it('発動不能な詠唱は数えない', () => {
    const c = compileList('dual, meteor, meteor', { stats: { maxMana: 60 } });
    expect(c.estimate.dps).toBe(0);
    expect(c.estimate.manaPerCycle).toBe(0);
  });
});
