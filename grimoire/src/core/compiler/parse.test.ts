// 文法・折り返し・エラー回復（SPEC §4.2〜§4.5）
import { describe, expect, it } from 'vitest';
import type { AstNode } from './ast';
import { compileList, codes } from '../testing/helpers';

/** AST を短い文字列にする：spell は名前、変質は mod(child)、多重は multi[a,b]、契機は carrier>cond>payload */
function sig(n: AstNode | null): string {
  if (!n) return '∅';
  switch (n.type) {
    case 'spell':
      return n.def.id;
    case 'modifier':
      return `${n.def.id}(${sig(n.child)})`;
    case 'multicast':
      return `${n.def.id}[${n.children.map(sig).join(',')}]`;
    case 'trigger':
      return `${sig(n.carrier)}>${n.def.id}>${sig(n.payload)}`;
  }
}

const casts = (list: string): string[] => compileList(list).casts.map((c) => sig(c.ast));

describe('1回の詠唱 ＝ 1塊', () => {
  it('顕現だけなら1つずつ詠唱する', () => {
    expect(casts('spark, fireball, icelance')).toEqual(['spark', 'fireball', 'icelance']);
  });

  it('空スロットは飛ばす', () => {
    const c = compileList('_, spark, _, _, fireball, _');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'fireball']);
    expect(c.deckOrder).toEqual([1, 4]);
    expect(c.casts[0]?.slotsRead).toEqual([1]);
  });

  it('空の魔導書は詠唱しない', () => {
    const c = compileList('_, _, _');
    expect(c.casts).toHaveLength(0);
    expect(c.estimate.dps).toBe(0);
  });

  it('最後の詠唱で周が終わる', () => {
    const c = compileList('spark, fireball');
    expect(c.casts.map((x) => x.endsCycle)).toEqual([false, true]);
  });
});

describe('変質', () => {
  it('直後の顕現に掛かる', () => {
    expect(casts('homing, spark, fireball')).toEqual(['homing(spark)', 'fireball']);
  });

  it('連続した変質は重なる', () => {
    expect(casts('homing, pierce, spark')).toEqual(['homing(pierce(spark))']);
  });

  it('契機より強く結合する（運び手にだけ掛かる）', () => {
    expect(casts('homing, fireball, on_hit, lightning')).toEqual(['homing(fireball)>on_hit>lightning']);
  });

  it('多重詠唱に掛かると、そのまとまり全体に掛かる', () => {
    expect(casts('homing, dual, spark, spark')).toEqual(['homing(dual[spark,spark])']);
  });

  it('呪いも変質として扱う', () => {
    expect(casts('blood, meteor')).toEqual(['blood(meteor)']);
  });
});

describe('契機', () => {
  it('直前の顕現と直後の塊をつなぐ', () => {
    expect(casts('spark, on_hit, lightning')).toEqual(['spark>on_hit>lightning']);
  });

  it('右結合：A >命中> (B >消滅> C)', () => {
    expect(casts('spark, on_hit, fireball, on_expire, frostnova')).toEqual([
      'spark>on_hit>fireball>on_expire>frostnova',
    ]);
    const c = compileList('spark, on_hit, fireball, on_expire, frostnova');
    const ast = c.casts[0]?.ast;
    expect(ast?.type).toBe('trigger');
    if (ast?.type !== 'trigger') return;
    expect(ast.carrier.type).toBe('spell');
    expect(ast.payload?.type).toBe('trigger');
  });

  it('後続は塊なので、変質付きの顕現や多重詠唱を丸ごと運べる', () => {
    expect(casts('spark, on_expire, triple, icelance, icelance, icelance')).toEqual([
      'spark>on_expire>triple[icelance,icelance,icelance]',
    ]);
    expect(casts('spark, on_hit, homing, shadow')).toEqual(['spark>on_hit>homing(shadow)']);
  });
});

describe('多重詠唱', () => {
  it('直後の n 塊を束ねる', () => {
    expect(casts('triple, spark, fireball, icelance, blade')).toEqual(['triple[spark,fireball,icelance]', 'blade']);
  });

  it('塊数に変質は数えない', () => {
    expect(casts('dual, homing, spark, fireball')).toEqual(['dual[homing(spark),fireball]']);
  });

  it('最後の子は後ろに続く契機を吸収する', () => {
    expect(casts('dual, spark, spark, on_hit, lightning')).toEqual(['dual[spark,spark>on_hit>lightning]']);
  });

  it('入れ子にできる', () => {
    expect(casts('dual, dual, spark, spark, fireball')).toEqual(['dual[dual[spark,spark],fireball]']);
  });

  it('三重詠唱 III は4塊を束ねる（覚醒）', () => {
    expect(casts('triple:3, spark, spark, spark, spark')).toEqual(['triple[spark,spark,spark,spark]']);
  });

  it('秘宝「多頭の竜珠」で塊数+1', () => {
    const c = compileList('dual, spark, spark, spark', { global: { multicastCountAdd: 1 } });
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['dual[spark,spark,spark]']);
  });
});

describe('エラーからの回復', () => {
  it('E101：先頭の契機は無視され、マナも消費しない', () => {
    const c = compileList('on_hit, spark');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark']);
    expect(c.casts[0]?.ignoredSlots).toEqual([0]);
    expect(c.casts[0]?.manaCost).toBe(5);
    expect(codes(c)).toContain('E101');
    expect(c.diagnostics.find((d) => d.code === 'E101')?.slot).toBe(0);
  });

  it('E101：契機が連続しても止まらない', () => {
    const c = compileList('spark, on_hit, on_expire, lightning');
    // 1つ目の契機の後続を読もうとして2つ目の契機に当たる → 2つ目は無視、後続は雷撃
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark>on_hit>lightning']);
    expect(codes(c)).toContain('E101');
  });

  it('E102：後に顕現のない変質は効果を持たない', () => {
    const c = compileList('homing, pierce');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['∅']);
    expect(c.casts[0]?.plan).toBeNull();
    expect(c.casts[0]?.manaCost).toBe(0);
    expect(c.casts[0]?.ignoredSlots).toEqual([1, 0]);
    expect(codes(c)).toContain('E102');
  });

  it('末尾の変質は、折り返せるなら先頭の顕現に掛かる', () => {
    const c = compileList('spark, homing');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'homing(spark)']);
    expect(codes(c)).not.toContain('E102');
  });

  it('W201：先頭の詠唱で後続がなければ運び手だけ発動する', () => {
    const c = compileList('spark, on_hit');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark>on_hit>∅']);
    expect(c.casts[0]?.plan?.kind).toBe('emit');
    expect(codes(c)).toContain('W201');
  });

  it('W202：多重詠唱の子が足りなければ、ある子だけで発動する', () => {
    const c = compileList('triple, spark, spark');
    const ast = c.casts[0]?.ast;
    expect(ast?.type === 'multicast' && ast.missing).toBe(1);
    expect(codes(c)).toContain('W202');
  });
});

describe('折り返し', () => {
  it('末尾で足りない分を先頭から読み、マナ×1.5・周の終わり・I401', () => {
    const c = compileList('spark, fireball, on_hit');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'fireball>on_hit>spark']);
    const second = c.casts[1];
    expect(second?.wrappedSlots).toEqual([0]);
    expect(second?.endsCycle).toBe(true);
    // 火球15 + 契機8 + 火花弾 5×1.5
    expect(second?.manaCost).toBeCloseTo(15 + 8 + 7.5);
    expect(codes(c)).toContain('I401');
  });

  it('折り返しても同じ詠唱で読んだスロットは読まない', () => {
    // 詠唱2は fireball から始まり、先頭の spark だけを再読できる。dual の2つ目は足りない
    const c = compileList('spark, dual, fireball');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'dual[fireball,spark]']);
    const c2 = compileList('spark, triple, fireball');
    expect(c2.casts.map((x) => sig(x.ast))).toEqual(['spark', 'triple[fireball,spark]']);
    expect(c2.casts[1]?.ast?.type === 'multicast' && c2.casts[1].ast.missing).toBe(1);
  });

  it('先頭から始まる詠唱は折り返さない', () => {
    const c = compileList('dual, spark');
    expect(c.casts).toHaveLength(1);
    expect(c.casts[0]?.wrappedSlots).toEqual([]);
    expect(codes(c)).toContain('W202');
  });

  it('覗いただけでは折り返さない（契機が続かなければ普通に終わる）', () => {
    const c = compileList('spark, fireball');
    expect(c.casts[1]?.wrappedSlots).toEqual([]);
    expect(codes(c)).not.toContain('I401');
  });

  it('末尾の顕現が先頭の契機を拾って連鎖する', () => {
    const c = compileList('on_expire, spark, fireball');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'fireball>on_expire>spark']);
    expect(c.casts[1]?.wrappedSlots).toEqual([0, 1]);
  });

  it('折り返した詠唱で周が終わり、残りは次の周に回らない', () => {
    // 詠唱2が折り返したので、詠唱は2つだけ
    const c = compileList('spark, blade, fireball, on_hit');
    expect(c.casts.map((x) => sig(x.ast))).toEqual(['spark', 'blade', 'fireball>on_hit>spark']);
    expect(c.casts.at(-1)?.endsCycle).toBe(true);
  });
});
