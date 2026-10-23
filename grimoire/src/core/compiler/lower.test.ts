// 変質の畳み込み・属性・契機の付与（SPEC §4.6）
import { describe, expect, it } from 'vitest';
import { collectEmits } from './lower';
import type { GroupPlan } from './ast';
import { compileList, firstEmit, codes } from '../testing/helpers';

const plan = (list: string, opts?: Parameters<typeof compileList>[1]) => compileList(list, opts).casts[0]?.plan ?? null;

describe('数値の確定', () => {
  it('基礎値は tier で変わる', () => {
    expect(firstEmit(plan('spark')).params.damage).toBe(6);
    expect(firstEmit(plan('spark:2')).params.damage).toBe(9);
    expect(firstEmit(plan('spark:3')).params.damage).toBe(13);
  });

  it('変質は積んだ順に加算・乗算する', () => {
    const e = firstEmit(plan('pierce, amplify, spark'));
    expect(e.params.pierce).toBe(2);
    expect(e.params.damage).toBeCloseTo(6 * 0.9 * 1.3);
  });

  it('分裂は弾数を掛け合わせ、上限25で止まる', () => {
    expect(firstEmit(plan('split, spark')).params.split).toBe(3);
    expect(firstEmit(plan('split, split, spark')).params.split).toBe(9);
    expect(firstEmit(plan('split:3, split:3, split:3, spark')).params.split).toBe(25);
  });

  it('会心率は1を超えない', () => {
    expect(firstEmit(plan('precision:3, precision:3, precision:3, precision:3, spark')).params.crit).toBe(1);
  });

  it('精密 III は会心倍率を3にする', () => {
    expect(firstEmit(plan('precision:3, spark')).params.critMul).toBe(3);
  });
});

describe('属性', () => {
  it('属性付与で上書きされる', () => {
    expect(firstEmit(plan('infuse_ice, fireball')).element).toBe('ice');
  });

  it('衝突したら最後が勝ち、W203', () => {
    const c = compileList('infuse_fire, infuse_ice, spark');
    expect(firstEmit(c.casts[0]?.plan).element).toBe('ice');
    expect(codes(c)).toContain('W203');
  });

  it('同じ属性を重ねても W203 にならない', () => {
    expect(codes(compileList('infuse_fire, infuse_fire, spark'))).not.toContain('W203');
  });

  it('元素の書は秘属性の顕現にだけ属性を付ける', () => {
    expect(firstEmit(plan('spark', { traits: ['infuse_fire'] })).element).toBe('fire');
    expect(firstEmit(plan('icelance', { traits: ['infuse_fire'] })).element).toBe('ice');
  });

  it('元素の書より属性付与ルーンが優先', () => {
    expect(firstEmit(plan('infuse_dark, spark', { traits: ['infuse_fire'] })).element).toBe('dark');
  });
});

describe('効かない変質（W204）', () => {
  it('追尾は霜の新星に効かず、数値も変わらない', () => {
    const c = compileList('homing, frostnova');
    expect(codes(c)).toContain('W204');
    expect(firstEmit(c.casts[0]?.plan).params.homing).toBe(0);
  });

  it('加速は雷撃に効かない（ダメージ補正も入らない）', () => {
    const c = compileList('accelerate, lightning');
    expect(codes(c)).toContain('W204');
    expect(firstEmit(c.casts[0]?.plan).params.damage).toBe(10);
  });

  it('増幅は何にでも効く', () => {
    expect(codes(compileList('amplify, frostnova'))).not.toContain('W204');
  });

  it('多重詠唱の各子で同じ警告が出ても1つにまとめる', () => {
    const c = compileList('homing, dual, frostnova, frostnova');
    expect(codes(c).filter((x) => x === 'W204')).toHaveLength(1);
  });
});

describe('多重詠唱の計画', () => {
  it('変質はまとまりのすべての子に掛かる', () => {
    const p = plan('homing, dual, spark, fireball');
    expect(p?.kind).toBe('group');
    const emits = collectEmits(p!);
    expect(emits.map((e) => e.params.homing)).toEqual([3, 3]);
  });

  it('扇の角度は tier で狭まる', () => {
    expect((plan('triple, spark, spark, spark') as GroupPlan).spread).toBe(15);
    expect((plan('triple:2, spark, spark, spark') as GroupPlan).spread).toBe(12);
  });

  it('四重詠唱 III は子の顕現ダメージ+30%', () => {
    const emits = collectEmits(plan('quad:3, spark, spark, spark, spark')!);
    expect(emits.every((e) => Math.abs(e.params.damage - 6 * 1.3) < 1e-9)).toBe(true);
  });
});

describe('契機の計画', () => {
  it('運び手に契機が付き、後続は変質を引き継がない', () => {
    const e = firstEmit(plan('homing, spark, on_hit, shadow'));
    expect(e.params.homing).toBe(3);
    expect(e.trigger?.condition).toBe('hit');
    const payload = firstEmit(e.trigger?.payload);
    expect(payload.spellId).toBe('shadow');
    expect(payload.params.homing).toBe(2); // 闇の矢の素の追尾だけ
  });

  it('秘宝「継承の印」なら後続も変質を引き継ぐ', () => {
    const e = firstEmit(plan('homing, spark, on_hit, shadow', { global: { inheritModifiers: true } }));
    expect(firstEmit(e.trigger?.payload).params.homing).toBe(5);
  });

  it('特性の暗黙の変質は後続にも掛かる', () => {
    const e = firstEmit(plan('spark, on_hit, spark', { traits: ['ricochet'] }));
    expect(e.params.bounce).toBe(1);
    expect(firstEmit(e.trigger?.payload).params.bounce).toBe(1);
  });

  it('最大発動回数：tier・連鎖の書・連鎖の鎖が加算される', () => {
    expect(firstEmit(plan('spark, on_hit, spark')).trigger?.maxFires).toBe(1);
    expect(firstEmit(plan('spark, on_hit:3, spark')).trigger?.maxFires).toBe(3);
    const both = firstEmit(plan('spark, on_hit, spark', { traits: ['chained'], global: { triggerFiresAdd: 1 } }));
    expect(both.trigger?.maxFires).toBe(3);
  });

  it('契機：跳弾は運び手の跳弾を増やす', () => {
    expect(firstEmit(plan('spark, on_bounce, spark')).params.bounce).toBe(1);
    expect(firstEmit(plan('spark, on_bounce:3, spark')).params.bounce).toBe(3);
  });

  it('契機：跳弾は跳ねない形式で W205', () => {
    expect(codes(compileList('lightning, on_bounce, spark'))).toContain('W205');
  });

  it('時限が運び手の寿命以内なら W205 にならない', () => {
    // 火花弾の寿命は 0.6 秒、時限 I は 0.5 秒
    expect(codes(compileList('spark, timer, spark'))).not.toContain('W205');
  });

  it('後続のダメージ倍率は tier で上がり、反響は弱まる', () => {
    expect(firstEmit(plan('spark, on_hit:2, spark')).trigger?.damageMul).toBeCloseTo(1.2);
    expect(firstEmit(plan('spark, echo, spark')).trigger?.damageMul).toBeCloseTo(0.6);
    expect(firstEmit(plan('spark, echo:3, spark')).trigger?.damageMul).toBeCloseTo(1.4);
  });

  it('時限・脈動の間隔', () => {
    expect(firstEmit(plan('spark, timer:2, spark')).trigger?.interval).toBeCloseTo(0.4);
    expect(firstEmit(plan('gravity, pulse:3, spark')).trigger?.interval).toBeCloseTo(0.25);
    expect(firstEmit(plan('gravity, pulse, spark', { global: { timerIntervalMul: 0.7 } })).trigger?.interval).toBeCloseTo(0.35);
  });
});

describe('覚醒と特性', () => {
  it('tier III の顕現・変質は覚醒 ID を持つ', () => {
    const e = firstEmit(plan('homing:3, pierce, fireball:3'));
    expect(e.awaken).toContain('spell:fireball');
    expect(e.awaken).toContain('mod:homing');
    expect(e.awaken).not.toContain('mod:pierce');
  });

  it('効かない変質の覚醒は付かない', () => {
    expect(firstEmit(plan('homing:3, frostnova')).awaken).not.toContain('mod:homing');
  });

  it('重唱の書は最初の顕現を2回にする', () => {
    const p = plan('spark, on_hit, fireball', { traits: ['chorus'] });
    expect(p?.kind).toBe('group');
    const g = p as GroupPlan;
    expect(g.multicastId).toBe('chorus');
    expect(g.children).toHaveLength(2);
  });

  it('狂詠は化ける確率を持つ', () => {
    expect(firstEmit(plan('wild, fireball')).wildChance).toBeCloseTo(0.3);
    expect(firstEmit(plan('wild, fireball')).params.damage).toBeCloseTo(28);
    expect(firstEmit(plan('wild, wild, fireball')).wildChance).toBeCloseTo(1 - 0.7 * 0.7);
  });
});
