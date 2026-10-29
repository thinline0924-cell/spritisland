// 社屋・倉庫・駐車場の配置と、人が歩く道すじ(シミュレーションと3D表示で共有)
//  x: 左右(右が+), z: 奥行き(手前が+), 1目盛り=1m

export const FLOOR_H = 5.4; // 見やすさのため階の間をあけて描く(分解図ふう)
export const WALL_H = 3.0;
export const FLY = { '1': 0, '2': FLOOR_H, '3': FLOOR_H * 2, W: 0, O: 0 };
export const BLD = { x0: -24, x1: -2, z0: -9, z1: 3 };
export const WH = { x0: 1, x1: 27, z0: -11, z1: 3, h: 7 };
export const AISLE_Z = -0.2;

export const nodes = new Map();
const edges = new Map();
const chains = {};
export const export_wh = {};
export const export_park = {};

function add(id, x, z, fl, kind = 'path', ex = {}) {
  const n = { id, x, z, fl, y: FLY[fl], kind, ...ex };
  nodes.set(id, n); edges.set(id, edges.get(id) || []);
  return n;
}
function link(a, b) {
  if (!edges.get(a).includes(b)) edges.get(a).push(b);
  if (!edges.get(b).includes(a)) edges.get(b).push(a);
}
function chainAdd(name, id) { (chains[name] = chains[name] || []).push(id); }
// 通路(横一直線)に、指定のxで枝分かれ点を作ってつなぐ
function tap(chain, id, x, z) {
  const tid = `${chain}@${x.toFixed(2)}`;
  if (!nodes.has(tid)) { const fl = nodes.get(id).fl; add(tid, x, z, fl, 'path'); chainAdd(chain, tid); }
  link(tid, id);
  return tid;
}

// ---------- 事務所棟 ----------
export const islands = []; // 3D表示用:島(机のかたまり)
export const placeInfo = {
  kitchen1: { name: '1階 休憩室', talk: 'kyuto' }, rest1: { name: '1階 休憩室', talk: 'lunch' },
  kitchen2: { name: '2階 給湯室', talk: 'kyuto' }, ouse1: { name: '1階 応接', talk: 'ouse' },
  meet2: { name: '2階 打合せ', talk: 'desk' }, meet3: { name: '3階 会議室', talk: 'meeting' },
  pres: { name: '社長室', talk: 'pres' }, yaku: { name: '役員室', talk: 'pres' }, smoke: { name: '喫煙所', talk: 'smoke' },
  wbreak: { name: '倉庫 休憩所', talk: 'wbreak' }, wh: { name: '倉庫', talk: 'warehouse' }, wc1: { name: 'トイレ', talk: 'none' },
  wc2: { name: 'トイレ', talk: 'none' }, wc3: { name: 'トイレ', talk: 'none' }, park: { name: '駐車場', talk: 'park' },
  gaisou: { name: '外回り', talk: 'none' },
};

function island(fl, cx, perSide, place, label) {
  const ids = [];
  // 長(島の頭):通路側に座り、奥を向く
  const head = add(`${place}_h`, cx, -0.95, fl, 'desk', { face: Math.PI, place, deskX: cx, deskZ: -1.65, head: true });
  ids.push(head.id); tap('a' + fl, head.id, cx, AISLE_Z);
  for (let side of [-1, 1]) {
    const cxs = cx + side * 1.05;
    const sub = add(`${place}_s${side}`, cxs, -1.9, fl, 'path');
    tap('a' + fl, sub.id, cxs, AISLE_Z);
    let prev = sub.id;
    for (let k = 0; k < perSide; k++) {
      const z = -2.8 - k * 1.3;
      const d = add(`${place}_${side < 0 ? 'L' : 'R'}${k}`, cxs, z, fl, 'desk', {
        face: side < 0 ? Math.PI / 2 : -Math.PI / 2, place, deskX: cx + side * 0.36, deskZ: z,
      });
      link(prev, d.id); prev = d.id; ids.push(d.id);
    }
  }
  islands.push({ fl, cx, perSide, place, label });
  return ids;
}
function seat(id, x, z, fl, face, place, kind = 'seat', ex = {}) { return add(id, x, z, fl, kind, { face, place, ...ex }); }

for (const fl of ['1', '2', '3']) {
  // 階段
  add('st' + fl, -3.5, -1.2, fl, 'stair');
  tap('a' + fl, 'st' + fl, -3.5, AISLE_Z);
  // トイレ
  add('wc' + fl, -23.2, -7.4, fl, 'wc', { place: 'wc' + fl, face: 0 });
  add('wcp' + fl, -23.2, -2, fl, 'path'); link('wcp' + fl, 'wc' + fl); tap('a' + fl, 'wcp' + fl, -23.2, AISLE_Z);
}
for (const [a, b] of [['1', '2'], ['2', '3']]) {
  add('up' + a, -3.5, -1.9, a, 'path'); link('st' + a, 'up' + a);
  add('land' + b, -3.5, -8.5, b, 'path'); link('up' + a, 'land' + b); link('land' + b, 'st' + b);
}

// 1階:総務・経理、受付、休憩室、応接
export const DESKS = {};
DESKS.soumu = island('1', -19, 3, 'soumu', '総務・経理');
// 休憩室(テーブル6席+流し)
{
  const t = add('rest1_p', -11.5, -2.2, '1', 'path'); tap('a1', t.id, -11.5, AISLE_Z);
  const seats = [];
  for (const [i, [x, z, f]] of [[-12.6, -4.2, Math.PI], [-11.4, -4.2, Math.PI], [-10.2, -4.2, Math.PI], [-12.6, -6.4, 0], [-11.4, -6.4, 0], [-10.2, -6.4, 0]].entries()) {
    const s = seat('rest1_' + i, x, z, '1', f, 'rest1'); link(t.id, s.id); seats.push(s.id);
  }
  add('rest1_q', -8.6, -3.0, '1', 'path'); link(t.id, 'rest1_q');
  for (const [i, x] of [-9.2, -8.2].entries()) { const k = add('kitchen1_' + i, x, -7.6, '1', 'stand', { place: 'kitchen1', face: Math.PI }); link('rest1_q', k.id); }
  // 自販機前
  add('kitchen1_2', -8.0, -4.8, '1', 'stand', { place: 'kitchen1', face: -Math.PI / 2 }); link('rest1_q', 'kitchen1_2');
}
// 応接(ソファ)
{
  const p = add('ouse1_p', -19.5, 0.5, '1', 'path'); tap('a1', p.id, -19.5, AISLE_Z);
  [[-22.3, 1.2, Math.PI / 2], [-22.3, 2.2, Math.PI / 2], [-19.7, 1.2, -Math.PI / 2], [-19.7, 2.2, -Math.PI / 2]].forEach(([x, z, f], i) => {
    const s = seat('ouse1_' + i, x, z, '1', f, 'ouse1', 'sofa'); link(p.id, s.id);
  });
}
// 受付カウンター前(来客が立つ)
add('recept', -11, 1.8, '1', 'stand', { place: 'ouse1', face: 0 }); tap('a1', 'recept', -11, AISLE_Z);
// 入口
add('f1_door', -6, 2.4, '1', 'door'); tap('a1', 'f1_door', -6, AISLE_Z);
// 倉庫への渡り廊下
add('f1_side', -2.4, AISLE_Z, '1', 'door'); chainAdd('a1', 'f1_side');

// 2階:営業・購買
DESKS.eigyo1 = island('2', -21, 3, 'eigyo1', '営業一課(量販)');
DESKS.eigyo2 = island('2', -15, 3, 'eigyo2', '営業二課(業務用)');
DESKS.kobai = island('2', -9.5, 2, 'kobai', '購買・営業事務');
add('bucho2', -15, 2.05, '2', 'desk', { face: Math.PI, place: 'eigyo', deskX: -15, deskZ: 1.35, boss: true });
tap('a2', 'bucho2', -15, AISLE_Z);
DESKS.bucho2 = ['bucho2'];
{
  const p = add('meet2_p', -21, 0.4, '2', 'path'); tap('a2', p.id, -21, AISLE_Z);
  [[-22.2, 1.6, Math.PI / 2], [-19.8, 1.6, -Math.PI / 2], [-21, 2.4, Math.PI], [-21.8, 2.4, Math.PI]].forEach(([x, z, f], i) => {
    const s = seat('meet2_' + i, x, z, '2', f, 'meet2'); link(p.id, s.id);
  });
  const k = add('kitchen2_p', -6.5, -2.2, '2', 'path'); tap('a2', k.id, -6.5, AISLE_Z);
  [[-7.1, -7.6], [-6.0, -7.6], [-6.5, -5.4]].forEach(([x, z], i) => { const s = add('kitchen2_' + i, x, z, '2', 'stand', { place: 'kitchen2', face: Math.PI }); link(k.id, s.id); });
  add('copy2', -10, 1.9, '2', 'stand', { place: 'meet2', face: 0 }); tap('a2', 'copy2', -10, AISLE_Z);
  add('fax2', -8.3, 1.9, '2', 'stand', { place: 'meet2', face: 0 }); tap('a2', 'fax2', -8.3, AISLE_Z);
  add('board2', -17.6, 1.9, '2', 'stand', { place: 'meet2', face: 0 }); tap('a2', 'board2', -17.6, AISLE_Z);
}
// 朝礼で並ぶ位置
export const CHOREI2 = [];
for (let i = 0; i < 16; i++) {
  const x = -20 + (i % 8) * 1.1, z = 0.9 + Math.floor(i / 8) * 0.9;
  const s = add('chorei_' + i, x, z, '2', 'stand', { place: 'chorei', face: Math.PI / 2 * 0 + Math.PI }); tap('a2', s.id, x, AISLE_Z);
  CHOREI2.push(s.id);
}

// 3階:社長室・役員室・会議室
{
  const dp = add('pres_door', -16, -1.2, '3', 'path'); tap('a3', dp.id, -16, AISLE_Z);
  add('pres_in', -18.5, -2.6, '3', 'path'); link(dp.id, 'pres_in');
  add('pres_desk', -20, -7.0, '3', 'desk', { face: 0, place: 'pres', deskX: -20, deskZ: -6.2, big: true }); link('pres_in', 'pres_desk');
  [[-21.6, -3.2, Math.PI / 2], [-21.6, -4.2, Math.PI / 2], [-17.4, -3.2, -Math.PI / 2], [-17.4, -4.2, -Math.PI / 2]].forEach(([x, z, f], i) => {
    const s = seat('pres_' + i, x, z, '3', f, 'pres', 'sofa'); link('pres_in', s.id);
  });
  add('pres_stand', -20, -4.8, '3', 'stand', { place: 'pres', face: Math.PI }); link('pres_in', 'pres_stand'); // 叱られる位置
  const yd = add('yaku_door', -11, -1.2, '3', 'path'); tap('a3', yd.id, -11, AISLE_Z);
  add('yaku_in', -11, -2.6, '3', 'path'); link(yd.id, 'yaku_in');
  add('kaicho_desk', -12.6, -7.0, '3', 'desk', { face: 0, place: 'yaku', deskX: -12.6, deskZ: -6.2, big: true }); link('yaku_in', 'kaicho_desk');
  add('senmu_desk', -9.4, -7.0, '3', 'desk', { face: 0, place: 'yaku', deskX: -9.4, deskZ: -6.2 }); link('yaku_in', 'senmu_desk');
  [[-12.4, -3.6, Math.PI / 2], [-9.6, -3.6, -Math.PI / 2]].forEach(([x, z, f], i) => { const s = seat('yaku_' + i, x, z, '3', f, 'yaku', 'sofa'); link('yaku_in', s.id); });
  const mp = add('meet3_p', -17, 0.35, '3', 'path'); tap('a3', mp.id, -17, AISLE_Z);
  const ms = [];
  for (let i = 0; i < 5; i++) { const x = -21 + i * 2; ms.push(seat('meet3_a' + i, x, 0.95, '3', Math.PI, 'meet3')); ms.push(seat('meet3_b' + i, x, 2.55, '3', 0, 'meet3')); }
  ms.push(seat('meet3_h', -23, 1.75, '3', Math.PI / 2, 'meet3'));
  ms.forEach(s => link(mp.id, s.id));
}

// ---------- 倉庫 ----------
{
  const WZ = -1.4;
  add('w_side', 1.6, AISLE_Z, 'W', 'door'); chainAdd('aW', 'w_side');
  add('walk', -0.4, AISLE_Z, 'O', 'path'); link('f1_side', 'walk'); link('walk', 'w_side');
  // 倉庫事務所
  const op = add('wof_p', 4, -5.6, 'W', 'path'); tap('aW', op.id, 4, WZ);
  const wof = [];
  [[2.7, -7.8, Math.PI / 2], [2.7, -9.2, Math.PI / 2], [5.3, -7.8, -Math.PI / 2], [5.3, -9.2, -Math.PI / 2], [4, -10.4, 0]].forEach(([x, z, f], i) => {
    const d = add('wof_' + i, x, z, 'W', 'desk', { face: f, place: 'wof', deskX: x + (f > 0 ? 0.62 : f < 0 ? -0.62 : 0), deskZ: z + (f === 0 ? 0.65 : 0) });
    link(op.id, d.id); wof.push(d.id);
  });
  DESKS.wof = wof;
  // 休憩所
  const bp = add('wbreak_p', 3.4, -2.4, 'W', 'path'); tap('aW', bp.id, 3.4, WZ);
  [[2.1, -3.6, 0], [3.1, -3.6, 0], [4.1, -3.6, 0], [5.4, -2.6, -Math.PI / 2]].forEach(([x, z, f], i) => {
    const s = seat('wbreak_' + i, x, z, 'W', f, 'wbreak'); link(bp.id, s.id);
  });
  // ピッキング・棚・冷蔵冷凍・ドック
  export_wh.pick = [];
  for (const x of [9, 12, 15, 18, 21, 24]) { const n = add('pick_' + x, x, 0.6, 'W', 'work', { place: 'wh', face: 0 }); tap('aW', n.id, x, WZ); export_wh.pick.push(n.id); }
  export_wh.rack = [];
  for (const x of [9.5, 12.5, 15.5]) for (const z of [-3.7, -6.7, -9.6]) {
    const tid = `rk_${x}`; if (!nodes.has(tid)) { add(tid, x, -2.3, 'W', 'path'); tap('aW', tid, x, WZ); }
    const n = add(`rack_${x}_${z}`, x, z, 'W', 'work', { place: 'wh', face: Math.PI }); link(tid, n.id);
    export_wh.rack.push(n.id);
  }
  for (const [name, x] of [['cold', 21], ['frozen', 25]]) {
    add(name + '_door', x, -4.2, 'W', 'path'); tap('aW', name + '_door', x, WZ);
    const n = add(name, x, -8, 'W', 'work', { place: 'wh', face: Math.PI }); link(name + '_door', n.id);
    export_wh[name] = n.id;
  }
  export_wh.dock = [];
  for (const x of [10, 15, 20]) { const n = add('dock_' + x, x, 2.4, 'W', 'work', { place: 'wh', face: 0 }); tap('aW', n.id, x, WZ); export_wh.dock.push(n.id); }
  add('w_door', 4, 2.4, 'W', 'door'); tap('aW', 'w_door', 4, WZ);
  // 朝礼(倉庫)
  export_wh.chorei = [];
  for (let i = 0; i < 10; i++) { const x = 6 + i * 0.9; const n = add('wchorei_' + i, x, -0.2, 'W', 'stand', { place: 'wh', face: Math.PI }); tap('aW', n.id, x, WZ); export_wh.chorei.push(n.id); }
}

// ---------- 屋外 ----------
{
  const FZ = 4.9;
  add('o_door', -6, FZ, 'O', 'path'); link('f1_door', 'o_door'); chainAdd('front', 'o_door');
  add('o_wdoor', 4, FZ, 'O', 'path'); link('w_door', 'o_wdoor'); chainAdd('front', 'o_wdoor');
  add('o_left', -26, FZ, 'O', 'path'); chainAdd('front', 'o_left');
  add('o_dock', 15, FZ + 0.6, 'O', 'path'); chainAdd('front', 'o_dock');
  for (const [i, [x, z]] of [[-26.6, -2.8], [-27.3, -1.6], [-25.7, -1.4], [-26.9, -0.4]].entries()) {
    const n = add('smoke_' + i, x, z, 'O', 'stand', { place: 'smoke', face: [0.3, 1.2, -1.5, 2.5][i] });
    link('o_left', n.id);
  }
  add('vend', -0.6, 5.6, 'O', 'stand', { place: 'park', face: -Math.PI / 2 }); tap('front', 'vend', -0.6, FZ);
  // 駐車場:3列
  add('lane_in', -12, 7.0, 'O', 'path'); tap('front', 'lane_in', -12, FZ);
  export_park.slots = [];
  const rows = [{ z: 8.6, lane: 11.2, face: Math.PI, ch: 'laneA' }, { z: 13.8, lane: 11.2, face: 0, ch: 'laneA' }, { z: 16.6, lane: 18.6, face: Math.PI, ch: 'laneB' }];
  rows.forEach((r, ri) => {
    for (let i = 0; i < 9; i++) {
      const x = -23 + i * 2.6;
      const id = `park_${ri}_${i}`;
      const n = add(id, x + 1.25, r.z, 'O', 'park', { place: 'park', face: r.face, carX: x, carZ: r.z, carFace: r.face });
      tap(r.ch, n.id, x + 1.25, r.lane);
      export_park.slots.push(id);
    }
  });
  tap('laneA', 'lane_in', -12, 11.2);
  add('lane_x', -12, 18.6, 'O', 'path'); tap('laneB', 'lane_x', -12, 18.6); link('lane_x', 'laneA@-12.00');
  add('gate', -12, 21, 'O', 'path'); link('gate', 'lane_x');
  add('gate_w', 14, 21, 'O', 'path'); link('gate_w', 'o_dock');
}

// 通路を x 順につなぐ
for (const [name, ids] of Object.entries(chains)) {
  const arr = ids.map(i => nodes.get(i)).sort((a, b) => a.x - b.x);
  for (let i = 0; i + 1 < arr.length; i++) link(arr[i].id, arr[i + 1].id);
}

// ---------- 経路探索 ----------
const pathCache = new Map();
export function findPath(a, b) {
  if (a === b) return [a];
  const key = a + '>' + b;
  if (pathCache.has(key)) return pathCache.get(key);
  const dist = new Map([[a, 0]]), prev = new Map(), done = new Set();
  const q = [a];
  while (q.length) {
    let bi = 0; for (let i = 1; i < q.length; i++) if (dist.get(q[i]) < dist.get(q[bi])) bi = i;
    const u = q.splice(bi, 1)[0];
    if (u === b) break;
    if (done.has(u)) continue; done.add(u);
    const nu = nodes.get(u);
    for (const v of edges.get(u)) {
      const nv = nodes.get(v);
      const w = Math.hypot(nu.x - nv.x, nu.z - nv.z) + Math.abs(nu.y - nv.y) * 2.5;
      const nd = dist.get(u) + w;
      if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, u); q.push(v); }
    }
  }
  if (!prev.has(b)) { pathCache.set(key, [a, b]); return [a, b]; }
  const path = [b]; let c = b;
  while (c !== a) { c = prev.get(c); path.push(c); }
  path.reverse();
  pathCache.set(key, path);
  return path;
}

export function placeOf(id) { const n = nodes.get(id); return n?.place || null; }
export function nodesOfPlace(place) { return [...nodes.values()].filter(n => n.place === place && n.kind !== 'path'); }
export function floorOf(id) { return nodes.get(id)?.fl; }
