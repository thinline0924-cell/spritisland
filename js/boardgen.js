// 島の形を作る。マス目(グリッド)の1マスごとに「どの土地か」を決め、隣り合う土地と沿岸を計算する。
// 3D表示とルールの両方がこの結果を使うので、見た目と隣接関係がずれない。
import { LAND_SEEDS } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// なめらかなノイズ(値ノイズ)
export function makeNoise(rng) {
  const N = 64;
  const v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = rng();
  const at = (x, y) => v[((y % N + N) % N) * N + ((x % N + N) % N)];
  const fade = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

export const GRID_W = 36;
export const GRID_D = 28;

export function generateBoard(seed = 20261003) {
  const rng = mulberry32(seed);
  const noise = makeNoise(rng);
  const W = GRID_W, D = GRID_D;

  // 手前の海岸線(z がこれより大きいと海)
  const shoreZ = x => D * 0.80 + (noise(x * 0.18, 3.7) - 0.5) * 5 + (noise(x * 0.5, 9.1) - 0.5) * 1.6;
  const landDepth = D * 0.80;

  const seeds = LAND_SEEDS.map(s => ({ ...s, x: s.nx * (W - 1), z: s.nz * landDepth }));
  const cells = new Int16Array(W * D).fill(-1); // -1 = 海
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (z >= shoreZ(x)) continue;
      // 境界をくねらせるため、座標をノイズでずらしてから一番近い中心を選ぶ
      const px = x + (noise(x * 0.13 + 11, z * 0.13) - 0.5) * 6;
      const pz = z + (noise(x * 0.13, z * 0.13 + 23) - 0.5) * 6;
      let best = 0, bd = Infinity;
      seeds.forEach((s, i) => {
        const d = (px - s.x) ** 2 + ((pz - s.z) * 1.15) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      cells[z * W + x] = best;
    }
  }

  // 飛び地(本体とつながっていない小さなかたまり)を、となりの土地に吸収する
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Uint8Array(W * D);
    for (let i = 0; i < W * D; i++) {
      if (cells[i] < 0 || seen[i]) continue;
      const id = cells[i];
      const comp = [i]; seen[i] = 1;
      for (let k = 0; k < comp.length; k++) {
        const c = comp[k], cx = c % W, cz = (c / W) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const n = nz * W + nx;
          if (!seen[n] && cells[n] === id) { seen[n] = 1; comp.push(n); }
        }
      }
      // その土地の中心を含むかたまりかどうか
      const s = seeds[id];
      const home = comp.some(c => Math.abs(c % W - s.x) < 1.5 && Math.abs(((c / W) | 0) - s.z) < 1.5);
      if (!home && comp.length < 40) {
        const c = comp[0], cx = c % W, cz = (c / W) | 0;
        let other = -1;
        for (const cc of comp) {
          const x = cc % W, z = (cc / W) | 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
            const v = cells[nz * W + nx];
            if (v >= 0 && v !== id) other = v;
          }
        }
        if (other >= 0) comp.forEach(cc => { cells[cc] = other; });
        void cx; void cz;
      }
    }
  }

  const lands = seeds.map((s, i) => ({
    id: i, num: s.num, terrain: s.terrain, adj: new Set(), coastal: false, cells: [], cx: 0, cz: 0,
  }));
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const id = cells[z * W + x];
      if (id < 0) continue;
      const L = lands[id];
      L.cells.push([x, z]);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= W || nz < 0) continue; // 左右と奥は「森の端」(海ではない)
        if (nz >= D) { L.coastal = true; continue; }
        const v = cells[nz * W + nx];
        if (v < 0) L.coastal = true;
        else if (v !== id) L.adj.add(v);
      }
    }
  }
  for (const L of lands) {
    const s = seeds[L.id];
    // 駒を置く中心:種の位置に一番近いマス
    let best = L.cells[0], bd = Infinity;
    for (const c of L.cells) {
      const d = (c[0] - s.x) ** 2 + (c[1] - s.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    L.cx = best[0]; L.cz = best[1];
    L.adj = [...L.adj].sort((a, b) => a - b);
  }
  return { W, D, cells, lands, noise, seed };
}
