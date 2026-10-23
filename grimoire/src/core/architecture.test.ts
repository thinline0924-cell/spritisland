// core の純粋さを守る（CLAUDE.md「層の分け方」「決定論」）
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE = join(import.meta.dirname, '.');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

/** コメントと文字列を雑に取り除いてから検査する（説明文の中の単語で誤検知しないため） */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
}

describe('src/core の純粋さ', () => {
  const files = sources(CORE);

  it('対象ファイルがある', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('描画・UI・音のライブラリを import しない', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
      for (const spec of imports) {
        expect(spec, relative(CORE, f)).not.toMatch(/^(pixi|react|react-dom)/);
        expect(spec, relative(CORE, f)).not.toMatch(/\/(render|ui|audio|app)\//);
      }
    }
  });

  it('ブラウザの API と非決定的な関数を使わない', () => {
    const banned = /\b(window|document|navigator|localStorage|AudioContext|requestAnimationFrame|Math\.random|Date\.now|performance\.now)\b/;
    for (const f of files) {
      expect(code(readFileSync(f, 'utf8')), relative(CORE, f)).not.toMatch(banned);
    }
  });
});
