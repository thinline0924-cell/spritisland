// 開発用：ルーンを並べてコンパイル結果を確かめる試験台（ゲームの UI ではない）
import { useMemo, useState } from 'react';
import {
  ALL_RUNES, TRAITS, compileGrimoire, formatCompiled, formatRuneList, getRuneDef, parseRuneList,
  type GrimoireStats, type RuneInstance, type RuneKind, type Tier, type TraitId,
} from '../../core';

const KIND_LABEL: Record<RuneKind, string> = {
  spell: '顕現', modifier: '変質', trigger: '契機', multicast: '多重詠唱', curse: '呪い',
};
const KIND_STYLE: Record<RuneKind, string> = {
  spell: 'border-orange-400/70 text-orange-200',
  modifier: 'border-sky-400/70 text-sky-200',
  trigger: 'border-violet-400/70 text-violet-200',
  multicast: 'border-emerald-400/70 text-emerald-200',
  curse: 'border-red-500/70 text-red-300',
};
const ROMAN = ['', 'I', 'II', 'III'];

const PRESETS: { name: string; list: string }[] = [
  { name: '追尾火球 → 命中で雷撃', list: 'homing, fireball, on_hit, lightning' },
  { name: '二重詠唱の最後の子が契機を吸収', list: 'dual, spark, spark, on_hit, triple, icelance, icelance, frostnova' },
  { name: '折り返し（末尾の契機が先頭を拾う）', list: 'spark, fireball, on_expire' },
  { name: '右結合の連鎖', list: 'spark, on_hit, fireball, on_expire, frostnova' },
  { name: '過負荷', list: 'quad, meteor, meteor, meteor, meteor' },
  { name: 'エラーだらけ', list: 'on_hit, homing, _, triple, spark, infuse_fire, infuse_ice, blade' },
  { name: '血詠の隕石', list: 'blood, meteor, _, spark' },
];

const BASE_STATS: GrimoireStats = {
  slots: 8, maxMana: 150, manaRegen: 40, castDelay: 0.3, recharge: 0.8, capacity: 10, spreadDeg: 4, targeting: 'nearest',
};

let uidCounter = 1000;
const newUid = () => `bench${uidCounter++}`;

export function CompilerBench() {
  const [slots, setSlots] = useState<(RuneInstance | null)[]>(() => parseRuneList(PRESETS[0]!.list, 'p'));
  const [stats, setStats] = useState(BASE_STATS);
  const [traits, setTraits] = useState<TraitId[]>([]);
  const [text, setText] = useState('');

  const compiled = useMemo(
    () => compileGrimoire({ slots, stats: { ...stats, slots: slots.length }, traits }),
    [slots, stats, traits],
  );
  const output = useMemo(() => formatCompiled(compiled), [compiled]);

  const update = (i: number, r: RuneInstance | null) => setSlots((s) => s.map((x, j) => (j === i ? r : x)));
  const move = (i: number, d: number) =>
    setSlots((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const out = s.slice();
      [out[i], out[j]] = [out[j] ?? null, out[i] ?? null];
      return out;
    });

  return (
    <div className="absolute inset-0 overflow-auto p-4 text-sm">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl tracking-widest text-parchment">Grimoire Compiler</h1>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs">開発用 コンパイラ試験台（Phase 1）</span>
        </header>

        <section className="rounded-lg border border-white/10 bg-black/60 p-3 backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-white/60">例：</span>
            {PRESETS.map((p) => (
              <button key={p.name} className="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10"
                onClick={() => setSlots(parseRuneList(p.list, newUid()))}>{p.name}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {slots.map((r, i) => {
              const def = r ? getRuneDef(r.defId) : null;
              return (
                <div key={i} className={`flex w-28 flex-col items-center rounded border px-1 py-1 ${def ? KIND_STYLE[def.kind] : 'border-dashed border-white/20 text-white/30'} bg-black/50`}>
                  <span className="text-[10px] text-white/40">スロット{i + 1}</span>
                  <span className="text-xl leading-tight">{def ? def.glyph : '·'}</span>
                  <span className="truncate text-xs">{def ? def.name : '空'}</span>
                  <div className="mt-1 flex gap-1 text-[11px]">
                    <button className="px-1 hover:text-white" onClick={() => move(i, -1)}>←</button>
                    {r && def?.kind !== 'curse' && (
                      <button className="px-1 hover:text-white" title="Tier を変える"
                        onClick={() => update(i, { ...r, tier: ((r.tier % 3) + 1) as Tier })}>{ROMAN[r.tier]}</button>
                    )}
                    <button className="px-1 hover:text-white" onClick={() => (r ? update(i, null) : setSlots((s) => s.filter((_, j) => j !== i)))}>×</button>
                    <button className="px-1 hover:text-white" onClick={() => move(i, 1)}>→</button>
                  </div>
                </div>
              );
            })}
            <button className="w-16 rounded border border-dashed border-white/20 text-white/50 hover:bg-white/10"
              onClick={() => setSlots((s) => [...s, null])}>＋空き</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className="min-w-80 flex-1 rounded bg-white/10 px-2 py-1 font-mono text-xs" placeholder={formatRuneList(slots)}
              value={text} onChange={(e) => setText(e.target.value)} />
            <button className="rounded border border-white/20 px-2 py-1 hover:bg-white/10" onClick={() => {
              try { setSlots(parseRuneList(text, newUid())); } catch (err) { alert(String(err)); }
            }}>記法で読み込む</button>
          </div>
        </section>

        <section className="grid gap-3 rounded-lg border border-white/10 bg-black/60 p-3 backdrop-blur md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            {(['spell', 'modifier', 'trigger', 'multicast', 'curse'] as RuneKind[]).map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-1">
                <span className="w-16 text-white/50">{KIND_LABEL[k]}</span>
                {ALL_RUNES.filter((r) => r.kind === k).map((r) => (
                  <button key={r.id} title={`${r.desc}\n覚醒：${r.awakening}\nマナ ${r.mana[0]} / 負荷 ${r.load}`}
                    className={`rounded border px-1.5 py-0.5 text-xs hover:bg-white/10 ${KIND_STYLE[k]}`}
                    onClick={() => setSlots((s) => {
                      const rune: RuneInstance = { uid: newUid(), defId: r.id, tier: 1 };
                      const empty = s.indexOf(null);
                      return empty >= 0 ? s.map((x, j) => (j === empty ? rune : x)) : [...s, rune];
                    })}>{r.glyph} {r.name}</button>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            {([
              ['maxMana', '最大マナ', 10], ['manaRegen', 'マナ回復/秒', 5], ['castDelay', '詠唱遅延', 0.05],
              ['recharge', 'リチャージ', 0.05], ['capacity', '演算容量', 1],
            ] as const).map(([key, label, step]) => (
              <label key={key} className="contents">
                <span className="text-white/60">{label}</span>
                <input type="number" step={step} className="w-20 rounded bg-white/10 px-1" value={stats[key]}
                  onChange={(e) => setStats({ ...stats, [key]: Number(e.target.value) })} />
              </label>
            ))}
            <span className="col-span-2 mt-1 text-white/60">特性</span>
            <div className="col-span-2 flex max-w-64 flex-wrap gap-1">
              {TRAITS.map((t) => (
                <button key={t.id} title={t.desc}
                  className={`rounded border px-1 text-[11px] ${traits.includes(t.id) ? 'border-amber-300 text-amber-200' : 'border-white/15 text-white/50'}`}
                  onClick={() => setTraits((ts) => (ts.includes(t.id) ? ts.filter((x) => x !== t.id) : [...ts, t.id]))}>{t.name}</button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-black/70 p-3 backdrop-blur">
          <pre className="overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed">
            {output.split('\n').map((line, i) => (
              <div key={i} className={
                line.startsWith('E') ? 'text-red-400' : line.startsWith('W') ? 'text-amber-300'
                  : line.startsWith('I') ? 'text-sky-300' : line.startsWith('詠唱') ? 'mt-2 text-parchment' : 'text-white/80'
              }>{line}</div>
            ))}
          </pre>
        </section>
      </div>
    </div>
  );
}
