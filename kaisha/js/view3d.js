// 3D表示:社屋・倉庫・駐車場、社員と車の動き、吹き出し

import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { nodes, findPath, FLY, BLD, WH, islands, export_wh, export_park, FLOOR_H, WALL_H } from './map.js';
import { minuteOfDay, dateOf, dayIndex } from './calendar.js';

// ---------- 色 ----------
const C = {
  asphalt: 0x55575a, line: 0xe4e3dc, curb: 0xa9a79f, grass: 0x6c7a52, soil: 0x7a6a50,
  extWall: 0xcdc6b6, extBand: 0x8d8574, slab: 0x9b9890, wall: 0xe2ded3, wall2: 0xd6d2c6,
  carpet1: 0xb9b19c, carpet2: 0x7f878c, carpet3: 0x8f8778, tileWC: 0xc9cfd1,
  desk: 0xd5d4cc, deskLeg: 0x8e918f, chair: 0x3a4250, chairBoss: 0x2a2826, monitor: 0x1f2124, paper: 0xf1efe8,
  cabinet: 0xc4c5be, partition: 0x98a09c, wood: 0x8a6a48, woodDark: 0x5e4630, sofa: 0x5a4b42, sofaBlue: 0x3f4e5e,
  whWall: 0xbcc0c2, whFloor: 0xa4a39b, whLine: 0xcfa834, rackUp: 0x3b577a, rackBeam: 0xc66a2b, carton: 0xb68d58,
  carton2: 0xa5794a, coldPanel: 0xe7ebe8, pallet: 0x9b7c51, palletBlue: 0x2f5b86, steel: 0x50606c,
  fridge: 0xe8e8e3, vendRed: 0xb8312f, vendBlue: 0x2b5c9e, plant: 0x4f6b3a, pot: 0x6b5847, white: 0xf3f2ee,
  road: 0x48494b, field: 0x6f8a3c, pole: 0x8d8a82,
};

// ---------- まとめて描く箱 ----------
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; }
  box(x, y, z, w, h, d, color, ry = 0, jitter = 0.03) {
    const col = new THREE.Color(color);
    if (jitter) col.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
    const hw = w / 2, hd = d / 2;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const tr = (px, py, pz) => [x + px * cs + pz * sn, y + py, z - px * sn + pz * cs];
    const faces = [
      [[1, 0, 0], [[hw, 0, -hd], [hw, h, -hd], [hw, h, hd], [hw, 0, hd]]],
      [[-1, 0, 0], [[-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], [-hw, 0, -hd]]],
      [[0, 1, 0], [[-hw, h, -hd], [-hw, h, hd], [hw, h, hd], [hw, h, -hd]]],
      [[0, -1, 0], [[-hw, 0, hd], [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd]]],
      [[0, 0, 1], [[hw, 0, hd], [hw, h, hd], [-hw, h, hd], [-hw, 0, hd]]],
      [[0, 0, -1], [[-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], [hw, 0, -hd]]],
    ];
    for (const [nn, q] of faces) {
      const nx = nn[0] * cs + nn[2] * sn, nz = -nn[0] * sn + nn[2] * cs;
      const v = q.map(a => tr(...a));
      for (const i of [0, 1, 2, 0, 2, 3]) { this.p.push(...v[i]); this.n.push(nx, nn[1], nz); this.c.push(col.r, col.g, col.b); }
    }
    return this;
  }
  quad(x, y, z, w, d, color) { return this.box(x, y, z, w, 0.01, d, color, 0, 0); }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

function textTex(lines, { w = 512, h = 128, bg = '#f4f2ea', fg = '#1d2a3a', font = 'bold 64px "BIZ UDPGothic", sans-serif', border = null, align = 'center' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); }
  g.fillStyle = fg; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  arr.forEach((t, i) => g.fillText(t, align === 'center' ? w / 2 : 16, h * (i + 0.5) / arr.length));
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  return tx;
}
function plane(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  return m;
}

// ---------- 静的な建物 ----------
function buildStatic(scene) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const groups = { site: new THREE.Group(), f1: new THREE.Group(), f2: new THREE.Group(), f3: new THREE.Group(), wh: new THREE.Group() };
  Object.values(groups).forEach(g => scene.add(g));

  // 地面・道路・田んぼ
  const site = new Builder();
  site.box(-2, -0.3, 6, 64, 0.3, 36, C.asphalt, 0, 0.01);
  site.box(0, -0.31, 22.2, 90, 0.3, 4.6, C.road, 0, 0);
  for (let x = -42; x < 44; x += 4) site.box(x, 0.0, 22.2, 2, 0.02, 0.12, C.line, 0, 0);
  site.box(0, -0.28, 19.6, 90, 0.32, 0.6, C.curb, 0, 0);
  site.box(0, -0.28, 24.8, 90, 0.32, 0.6, C.curb, 0, 0);
  // 駐車場の白線
  for (const row of [8.6, 13.8, 16.6]) for (let i = 0; i <= 9; i++) site.box(-23 + i * 2.6 - 0.05, 0.0, row, 0.08, 0.02, 4.4, C.line, 0, 0);
  // 植え込み
  site.box(-30, -0.1, 6, 3, 0.3, 30, C.grass, 0, 0.04);
  site.box(29, -0.1, 6, 3, 0.3, 30, C.grass, 0, 0.04);
  site.box(-2, -0.1, -13.5, 64, 0.3, 3, C.grass, 0, 0.04);
  // フェンス
  for (let x = -31; x <= 30; x += 2) site.box(x, 0, -14.8, 0.06, 1.6, 0.06, C.pole);
  site.box(-0.5, 1.5, -14.8, 62, 0.05, 0.05, C.pole);
  // 喫煙所(小屋根と灰皿スタンド)
  site.box(-26.5, 0, -1.7, 3.2, 0.06, 3.6, 0x9c9a92, 0, 0);
  for (const [x, z] of [[-28, -3.4], [-25, -3.4], [-28, 0], [-25, 0]]) site.box(x, 0, z, 0.08, 2.4, 0.08, C.steel);
  site.box(-26.5, 2.4, -1.7, 3.4, 0.06, 3.8, 0x6e7a80);
  site.box(-26.3, 0, -1.8, 0.3, 0.9, 0.3, 0x2f3236);
  site.box(-27.9, 0, -1.7, 0.08, 1.8, 3.4, 0x8fa0a6);
  // 自販機・自転車置き場
  site.box(-0.2, 0, 6.6, 1.0, 1.85, 0.8, C.vendRed, 0, 0); site.box(0.9, 0, 6.6, 1.0, 1.85, 0.8, C.vendBlue, 0, 0);
  site.box(0.35, 0, 7.05, 0.4, 0.8, 0.3, 0x38393b, 0, 0);
  for (let i = 0; i < 5; i++) site.box(-29.5, 0, 9 + i * 0.7, 1.6, 0.05, 0.05, C.pole);
  // 電柱と電線
  for (const x of [-34, -8, 18, 42]) { site.box(x, 0, 25.6, 0.32, 10, 0.32, C.pole, 0, 0); site.box(x, 8.6, 25.6, 1.8, 0.12, 0.12, C.pole, 0, 0); }
  // 田んぼ(道の向こう)
  groups.fields = [];
  // 看板(入口)
  site.box(-14.2, 0, 19.0, 0.15, 2.2, 0.15, C.steel);
  scene.userData.siteMesh = site.mesh(mat); groups.site.add(scene.userData.siteMesh);
  const fieldMat = new THREE.MeshLambertMaterial({ color: C.field });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(21, 0.2, 18), fieldMat);
    m.position.set(-34 + i * 23, -0.25, 36); m.receiveShadow = true; groups.site.add(m);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(21.6, 0.3, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
    ridge.position.set(m.position.x, -0.2, 26.8); groups.site.add(ridge);
  }
  scene.userData.fieldMat = fieldMat;
  // 雪の山(冬だけ見える)
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
  const pile = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 7), snowMat); pile.position.set(-24.5, 0.9, 17.5); pile.scale.set(1.3, 1, 0.9);
  const pile2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.4, 6), snowMat); pile2.position.set(26.5, 0.6, 10);
  groups.site.add(pile, pile2); scene.userData.snowPiles = [pile, pile2];
  // 木
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x4d6438, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4a38 });
  scene.userData.trees = [];
  for (const [x, z, s] of [[-30.5, -6, 1], [-30, 2, 0.8], [-30.4, 14, 1.1], [29, -7, 0.9], [29.5, 2, 1.2], [29, 15, 0.8], [-18, -13.6, 0.9], [8, -13.4, 1.0], [20, -13.6, 0.8]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.6, 5), trunkMat); t.position.set(x, 0.8, z);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * s, 0), treeMat); f.position.set(x, 2.3 + s * 0.6, z); f.castShadow = true;
    groups.site.add(t, f); scene.userData.trees.push(f);
  }

  // ---------- 事務所棟 ----------
  const flKey = { '1': 'f1', '2': 'f2', '3': 'f3' };
  const carpet = { '1': C.carpet1, '2': C.carpet2, '3': C.carpet3 };
  for (const fl of ['1', '2', '3']) {
    const b = new Builder(); const y = FLY[fl];
    const W = BLD.x1 - BLD.x0, D = BLD.z1 - BLD.z0, cx = (BLD.x0 + BLD.x1) / 2, cz = (BLD.z0 + BLD.z1) / 2;
    b.box(cx, y - 0.25, cz, W + 0.4, 0.25, D + 0.4, C.slab, 0, 0);
    b.box(cx, y, cz, W, 0.02, D, carpet[fl], 0, 0.02);
    // 外壁
    const wh = WALL_H;
    b.box(cx, y, BLD.z0 - 0.1, W + 0.4, wh, 0.2, C.extWall, 0, 0.01);
    b.box(BLD.x0 - 0.1, y, cz, 0.2, wh, D + 0.4, C.extWall, 0, 0.01);
    b.box(BLD.x1 + 0.1, y, cz - 2.5, 0.2, wh, D - 5, C.extWall, 0, 0.01);
    b.box(BLD.x1 + 0.1, y + (fl === '1' ? 2.2 : 0), 1.0 + 0.0, 0.2, fl === '1' ? 1.0 : wh, 4.4, C.extWall, 0, 0.01);
    // 窓(奥の壁)
    for (let x = BLD.x0 + 1.5; x < BLD.x1 - 1; x += 2.6) b.box(x, y + 1.0, BLD.z0 + 0.02, 1.8, 1.3, 0.04, 0x9fb3c2, 0, 0.02);
    // 正面は腰の高さで切る
    const fz = BLD.z1 + 0.1;
    if (fl === '1') { b.box(-15.5, y, fz, 17.4, 1.0, 0.2, C.extWall); b.box(-3.5, y, fz, 3.0, 1.0, 0.2, C.extWall); }
    else b.box(cx, y, fz, W + 0.4, 1.0, 0.2, C.extWall);
    b.box(cx, y + 0.98, fz, W + 0.4, 0.06, 0.26, C.extBand, 0, 0);
    // トイレ
    b.box(-23.2, y, -6.0, 1.6, 2.2, 0.08, C.wall2); b.box(-22.4, y, -7.6, 0.08, 2.2, 3.2, C.wall2);
    b.box(-23.6, y, -8.5, 0.45, 0.42, 0.65, C.white); b.box(-23.2, y, -9 + 0.01, 1.5, 0.02, 3, C.tileWC, 0, 0);
    // 階段(次の階まで)
    b.box(-3.5, y, -5.2, 3.0, 0.02, 7.2, 0x8c8a84, 0, 0);
    if (fl !== '3') {
      const steps = 18, rise = FLOOR_H / steps;
      for (let k = 0; k < steps; k++) b.box(-3.5, y + k * rise, -1.9 - k * 0.37, 2.2, rise, 0.37, 0xa19f98, 0, 0.02);
      b.box(-4.65, y + FLOOR_H / 2, -5.2, 0.06, 0.06, 7.0, C.steel, Math.atan2(FLOOR_H, 6.6) * 0, 0);
    }
    b.box(-5.05, y, -5.2, 0.1, 1.1, 7.2, C.steel, 0, 0);
    // 消火器
    b.box(-2.4, y, -0.9, 0.2, 0.55, 0.2, 0xb02a26, 0, 0);
    // 柱
    for (const x of [BLD.x0, -16, -9, BLD.x1]) b.box(x, y, BLD.z1 - 0.05, 0.5, fl === '1' ? 1.0 : 1.0, 0.5, C.extWall);
    groups[flKey[fl]].add(b.mesh(mat));
  }
  // 階をつなぐ細い柱(模型の支柱)
  { const pb = new Builder(); for (const [x, z] of [[BLD.x0, BLD.z0], [BLD.x1, BLD.z0], [BLD.x0, BLD.z1], [BLD.x1, BLD.z1], [-13, BLD.z0]]) pb.box(x, 0, z, 0.22, FLY['3'], 0.22, 0x8f8b80, 0, 0); groups.site.add(pb.mesh(mat)); }
  // 屋上の看板
  const sign = plane(textTex('丸栄商事株式会社', { w: 1024, h: 160, bg: '#f2efe6', fg: '#173c6b', font: 'bold 104px "BIZ UDPMincho", "BIZ UDPGothic", serif' }), 12, 1.9);
  sign.position.set(-13, FLY['3'] + WALL_H + 1.0, BLD.z0 + 0.15); groups.f3.add(sign);
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(12.4, 2.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x6d6a62 }));
  signBack.position.set(-13, FLY['3'] + WALL_H + 1.0, BLD.z0 + 0.0); groups.f3.add(signBack);
  const gateSign = plane(textTex(['丸栄商事', '本社・物流センター →'], { w: 512, h: 256, bg: '#f4f2ea', fg: '#1d2a3a', font: 'bold 54px "BIZ UDPGothic", sans-serif', border: '#1d2a3a' }), 1.6, 0.8);
  gateSign.position.set(-14.2, 2.4, 19.1); groups.site.add(gateSign);

  // ---------- 机と家具 ----------
  const fb = { '1': new Builder(), '2': new Builder(), '3': new Builder(), W: new Builder() };
  for (const n of nodes.values()) {
    if (n.kind === 'desk') desk(fb[n.fl] || fb.W, n);
    if (n.kind === 'seat') chair(fb[n.fl] || fb.W, n, C.chair);
    if (n.kind === 'sofa') sofa(fb[n.fl] || fb.W, n);
  }
  // 1階
  const b1 = fb['1'], y1 = 0;
  b1.box(-11, y1, 1.05, 3.4, 1.05, 0.55, C.wood); b1.box(-11, y1 + 1.05, 1.05, 3.6, 0.05, 0.7, C.woodDark);
  b1.box(-10.2, y1 + 1.1, 1.0, 0.25, 0.08, 0.2, 0x2a2a2a); // 呼び鈴
  b1.box(-24 + 0.25, y1, -2.6, 0.45, 1.8, 2.4, C.cabinet);
  b1.box(-15.6, y1, -6.8, 0.8, 1.2, 0.8, 0x4b4f4e); // 金庫
  for (let i = 0; i < 4; i++) b1.box(-14.6 + 0, y1, -4 - i * 1.0, 0.5, 1.8, 0.9, C.cabinet);
  // 休憩室
  b1.box(-14.1, y1, -6.1, 0.12, 2.6, 5.8, C.wall2); b1.box(-7.6, y1, -6.1, 0.12, 2.6, 5.8, C.wall2);
  b1.box(-13.0, y1, -3.2, 2.2, 2.6, 0.12, C.wall2); b1.box(-9.2, y1, -3.2, 3.2, 2.6, 0.12, C.wall2);
  b1.box(-11.4, y1, -5.3, 3.8, 0.72, 1.3, C.desk); // テーブル
  b1.box(-8.7, y1, -8.6, 2.0, 0.9, 0.6, 0xc8c8c2); b1.box(-8.7, y1 + 0.9, -8.6, 2.0, 0.04, 0.6, 0x9aa0a2); // 流し
  b1.box(-10.1, y1, -8.55, 0.7, 1.75, 0.7, C.fridge); b1.box(-7.95, y1, -5.0, 0.7, 1.8, 0.65, 0x2c5f9a, 0, 0); // 冷蔵庫・自販機
  b1.box(-13.4, y1 + 1.4, -8.85, 1.2, 0.7, 0.08, 0x111214, 0, 0); // テレビ
  b1.box(-9.5, y1 + 0.94, -8.6, 0.4, 0.25, 0.35, 0xdedcd4); // 電子レンジ
  b1.box(-12.3, y1, -8.6, 0.35, 1.1, 0.35, 0xe8eef2); // ウォーターサーバー
  // 応接
  b1.box(-17.1, y1, 1.6, 0.08, 1.6, 2.6, C.partition); b1.box(-22.2, y1, 0.3, 3.6, 1.6, 0.08, C.partition);
  b1.box(-21, y1, 1.7, 1.1, 0.4, 1.6, C.woodDark);
  b1.box(-23.6, y1, 2.6, 0.4, 0.45, 0.4, C.pot); b1.box(-23.6, y1 + 0.45, 2.6, 0.7, 1.2, 0.7, C.plant);
  b1.box(-7.6, y1, 2.4, 0.4, 0.45, 0.4, C.pot); b1.box(-7.6, y1 + 0.45, 2.4, 0.6, 1.0, 0.6, C.plant);
  b1.box(-5, y1, 2.6, 0.5, 0.6, 0.25, 0x4b5055); // 傘立て
  b1.box(-4.6, y1 + 1.2, -0.95, 1.2, 0.8, 0.05, 0x2d3a2e); // 掲示板
  // 2階
  const b2 = fb['2'], y2 = FLY['2'];
  b2.box(-21, y2, 1.6, 2.0, 0.72, 1.0, C.desk);
  b2.box(-10, y2, 2.55, 1.0, 1.1, 0.7, 0xd9d8d1); b2.box(-8.3, y2, 2.55, 0.6, 0.9, 0.5, 0xd4d2c8); // 複合機・FAX
  b2.box(-17.6, y2, 2.75, 2.4, 1.8, 0.06, 0xf6f6f2, 0, 0); // ホワイトボード
  b2.box(-17.6, y2 + 1.8, 2.75, 2.5, 0.06, 0.1, 0x9da3a6, 0, 0);
  for (let i = 0; i < 6; i++) b2.box(-23.6, y2, -0.6 - i * 0.95, 0.6, 1.1, 0.9, C.cabinet);
  b2.box(-7.6, y2, -7.75, 0.1, 2.5, 2.5, C.wall2); b2.box(-6.4, y2, -8.7, 2.3, 0.9, 0.55, 0xc8c8c2); b2.box(-6.4, y2 + 0.9, -8.7, 2.3, 0.04, 0.55, 0x9aa0a2);
  b2.box(-5.4, y2 + 0.94, -8.7, 0.35, 0.3, 0.3, 0x2b2b2b); // ポット
  for (const x of [-6.2, -4.0]) { b2.box(x, y2, 2.4, 0.4, 0.45, 0.4, C.pot); b2.box(x, y2 + 0.45, 2.4, 0.5, 0.9, 0.5, C.plant); }
  b2.box(-12.5, y2 + 1.3, -8.95, 2.2, 1.0, 0.04, 0xf3f1ea, 0, 0); // 予定表
  // 3階
  const b3 = fb['3'], y3 = FLY['3'];
  b3.box(-19.5, y3, -0.8, 9.0, 2.6, 0.12, C.wall2); b3.box(-15.2, y3, -0.8, 0.4, 2.6, 0.12, C.wall2);
  b3.box(-15, y3, -4.9, 0.14, 2.6, 8.2, C.wall2);
  b3.box(-12.7, y3, -0.8, 2.6, 2.6, 0.12, C.wall2); b3.box(-8.7, y3, -0.8, 2.2, 2.6, 0.12, C.wall2);
  b3.box(-7.6, y3, -4.9, 0.14, 2.6, 8.2, C.wall2);
  b3.box(-19.5, y3, -3.7, 1.4, 0.4, 1.2, C.woodDark); b3.box(-11, y3, -3.6, 1.2, 0.4, 0.9, C.woodDark);
  b3.box(-23.4, y3, -6, 0.5, 1.9, 2.4, C.woodDark); // 書棚
  b3.box(-21.8, y3 + 2.0, -8.82, 0.9, 0.35, 0.3, 0xd8c39a); b3.box(-21.8, y3 + 2.35, -8.82, 0.7, 0.18, 0.22, 0xe8e2d0); // 神棚
  b3.box(-16, y3, -8.4, 0.8, 1.0, 0.8, 0x45494a); // 金庫
  b3.box(-23.5, y3, -3.4, 0.25, 1.2, 0.25, 0x23412e); // ゴルフバッグ
  b3.box(-17, y3, 1.75, 11, 0.72, 1.0, C.woodDark); // 会議机
  b3.box(-24 + 0.15, y3 + 1.2, 1.7, 0.05, 1.0, 1.8, 0xf3f1ea, 0, 0);
  for (const x of [-6.6, -5.6]) b3.box(x, y3, -8.3, 0.8, 1.8, 0.6, C.cabinet);
  const kakejiku = plane(textTex(['誠実', '感謝', '和'], { w: 128, h: 384, bg: '#efe9da', fg: '#222', font: 'bold 92px "BIZ UDPMincho", serif' }), 0.5, 1.5);
  kakejiku.position.set(-19.2, y3 + 1.5, -8.84); groups.f3.add(kakejiku);
  groups.f1.add(fb['1'].mesh(mat)); groups.f2.add(fb['2'].mesh(mat)); groups.f3.add(fb['3'].mesh(mat));

  // ---------- 倉庫 ----------
  const w = fb.W;
  const wx = (WH.x0 + WH.x1) / 2, wz = (WH.z0 + WH.z1) / 2, WW = WH.x1 - WH.x0, WD = WH.z1 - WH.z0;
  w.box(wx, -0.2, wz, WW + 0.4, 0.2, WD + 0.4, C.slab, 0, 0);
  w.box(wx, 0, wz, WW, 0.02, WD, C.whFloor, 0, 0.02);
  for (const z of [-1.9, -0.9]) w.box(14, 0.02, z, 25, 0.01, 0.1, C.whLine, 0, 0);
  w.box(wx, 0, WH.z0 - 0.1, WW + 0.4, WH.h, 0.2, C.whWall, 0, 0.01);
  w.box(WH.x0 - 0.1, 0, wz - 3, 0.2, WH.h, WD - 6, C.whWall, 0, 0.01);
  w.box(WH.x0 - 0.1, 2.4, 1.0, 0.2, WH.h - 2.4, 4, C.whWall, 0, 0.01);
  w.box(WH.x1 + 0.1, 0, wz, 0.2, WH.h, WD + 0.4, C.whWall, 0, 0.01);
  w.box(wx, WH.h - 1.2, WH.z0 + 0.0, WW + 0.4, 0.9, 0.24, 0x4a6177, 0, 0);
  // 正面(低い壁+シャッター開口)
  for (const [a, bb] of [[1, 2.9], [5.1, 8.5], [11.5, 13.5], [16.5, 18.5], [21.5, 27]]) w.box((a + bb) / 2, 0, WH.z1 + 0.1, bb - a, 1.0, 0.2, C.whWall);
  for (const x of [1, 7, 13, 19, 27]) w.box(x, 0, WH.z1 + 0.05, 0.3, WH.h, 0.3, C.steel, 0, 0);
  for (let x = 2; x < 27; x += 3) w.box(x, WH.h, wz, 0.18, 0.18, WD, C.steel, 0, 0);
  // ドックのひさし
  w.box(15, 4.3, 4.6, 14, 0.12, 3.4, 0x6e7c86, 0, 0);
  // 倉庫事務所
  w.box(4, 0, -6.3, 5.8, 2.4, 0.1, 0xdfe3e3); w.box(6.9, 0, -8.6, 0.1, 2.4, 4.6, 0xdfe3e3);
  w.box(1.6, 0, -9.0, 0.6, 1.6, 1.4, C.cabinet);
  w.box(5.6, 1.4, -10.9, 1.4, 0.9, 0.05, 0xf3f1ea, 0, 0); // 配車ボード
  // 休憩所
  w.box(3.1, 0, -3.9, 3.4, 0.45, 0.45, 0x6a7680); w.box(5.9, 0, -2.6, 0.5, 0.45, 1.4, 0x6a7680);
  w.box(1.55, 0, -1.6, 0.7, 1.8, 0.7, C.vendBlue); w.box(1.55, 0, -4.8, 0.6, 1.0, 0.5, 0x8a8f90); // 自販機・ゴミ箱
  w.box(3.6, 1.4, -5.1, 1.2, 0.8, 0.05, 0x2d3a2e); // 掲示板(安全第一)
  // ラック
  for (const x of [8.2, 11.0, 14.0, 16.9]) {
    for (const z of [-3.2, -10.6]) for (const xx of [x - 0.4, x + 0.4]) w.box(xx, 0, z, 0.08, 4.6, 0.08, C.rackUp, 0, 0);
    for (const z of [-5.7, -8.2]) for (const xx of [x - 0.4, x + 0.4]) w.box(xx, 0, z, 0.08, 4.6, 0.08, C.rackUp, 0, 0);
    for (const h of [0.15, 1.3, 2.45, 3.6]) {
      w.box(x - 0.4, h, -6.9, 0.08, 0.1, 7.4, C.rackBeam, 0, 0); w.box(x + 0.4, h, -6.9, 0.08, 0.1, 7.4, C.rackBeam, 0, 0);
      for (let z = -3.6; z > -10.4; z -= 0.75) if (Math.random() < 0.82) { const hh = 0.35 + Math.random() * 0.55; w.box(x, h + 0.1, z, 0.7, hh, 0.6 + Math.random() * 0.1, Math.random() < 0.5 ? C.carton : C.carton2, 0, 0.08); }
    }
  }
  // 冷蔵・冷凍庫
  for (const [x0, x1, door, label] of [[19, 23, 21, '冷蔵'], [23, 27, 25, '冷凍']]) {
    const cx2 = (x0 + x1) / 2;
    w.box(cx2, 0, -4.8, door - x0 - 0.8, 3.4, 0.2, C.coldPanel); w.box(door + 0.7 + (x1 - door - 0.8) / 2 - 0.3, 0, -4.8, x1 - door - 0.8, 3.4, 0.2, C.coldPanel);
    w.box(cx2, 2.6, -4.8, x1 - x0, 0.8, 0.2, C.coldPanel);
    w.box(x0 + 0.05, 0, -7.9, 0.15, 3.4, 6.2, C.coldPanel);
    w.box(cx2, 3.4, -7.9, x1 - x0, 0.15, 6.2, C.coldPanel);
    for (let z = -6; z > -10.4; z -= 1.1) for (const xx of [x0 + 0.6, x1 - 0.7]) w.box(xx, 0, z, 0.7, 0.4 + Math.random() * 1.2, 0.9, label === '冷凍' ? 0xd7dde2 : C.carton, 0, 0.05);
    const s = plane(textTex(label === '冷蔵' ? '冷蔵 5℃' : '冷凍 −25℃', { w: 256, h: 96, bg: label === '冷蔵' ? '#2f6aa3' : '#1f3d6b', fg: '#fff', font: 'bold 52px "BIZ UDPGothic", sans-serif' }), 1.2, 0.45);
    s.position.set(door, 2.9, -4.68); groups.wh.add(s);
  }
  // ピッキング場(パレット・カゴ台車)
  for (let i = 0; i < 9; i++) {
    const x = 8.6 + i * 2.0 + (Math.random() - 0.5) * 0.4, z = 1.6 + (Math.random() - 0.5) * 0.3;
    w.box(x, 0, z, 1.1, 0.14, 1.1, Math.random() < 0.6 ? C.pallet : C.palletBlue, 0, 0);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) w.box(x, 0.14 + k * 0.42, z, 1.0, 0.42, 1.0, Math.random() < 0.5 ? C.carton : C.carton2, (Math.random() - 0.5) * 0.15, 0.06);
  }
  for (let i = 0; i < 6; i++) {
    const x = 7.5 + i * 0.85, z = -1.2 - 0.0 + (i % 2) * 0.1;
    if (i < 0) continue;
    // カゴ台車
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) w.box(x + dx, 0.1, z - 9 + dz + 9 + 2.4 - 2.4, 0.03, 1.6, 0.03, 0x9aa3a8, 0, 0);
  }
  w.box(26, 0, 1.8, 0.9, 1.2, 0.5, 0x2f6a3a); // AED風の箱(安全用品)
  groups.wh.add(fb.W.mesh(mat));
  const anzen = plane(textTex(['安全第一', '指差呼称 ヨシ!'], { w: 512, h: 256, bg: '#1f6a3a', fg: '#fff', font: 'bold 64px "BIZ UDPGothic", sans-serif' }), 2.0, 1.0);
  anzen.position.set(14, 5.6, WH.z0 + 0.15); groups.wh.add(anzen);
  const whSign = plane(textTex('丸栄商事 物流センター', { w: 1024, h: 128, bg: '#e9ecec', fg: '#1d3557', font: 'bold 80px "BIZ UDPGothic", sans-serif' }), 9, 1.1);
  whSign.position.set(14, 6.0, WH.z1 + 0.25); groups.wh.add(whSign);
  // 渡り廊下
  const wb = new Builder(); wb.box(-0.4, 0, -0.2, 3.2, 0.05, 2.0, 0xb0ada4, 0, 0); wb.box(-0.4, 2.5, -0.2, 3.4, 0.1, 2.4, 0x7c8890, 0, 0);
  for (const [x, z] of [[-1.9, 0.9], [1.1, 0.9], [-1.9, -1.3], [1.1, -1.3]]) wb.box(x, 0, z, 0.08, 2.5, 0.08, C.steel);
  groups.site.add(wb.mesh(mat));
  return groups;
}

function desk(b, n) {
  const f = n.face, fx = Math.sin(f), fz = Math.cos(f);
  const y = n.y;
  const big = n.big || n.head;
  const w = big ? 1.5 : 1.15, d = n.big ? 0.85 : 0.7;
  const dx = n.deskX, dz = n.deskZ;
  b.box(dx, y, dz, w, 0.7, d, n.big ? C.woodDark : C.deskLeg, f, 0.02);
  b.box(dx, y + 0.7, dz, w + 0.04, 0.04, d + 0.04, n.big ? C.woodDark : C.desk, f, 0.02);
  // モニター・書類
  const mx = dx + fx * (d * 0.2), mz = dz + fz * (d * 0.2);
  if (!n.big) {
    b.box(mx, y + 0.74, mz, 0.55, 0.36, 0.05, C.monitor, f, 0); b.box(mx, y + 0.74, mz, 0.12, 0.12, 0.12, C.monitor, f, 0);
    const side = Math.random() < 0.5 ? -1 : 1;
    const px = dx + Math.cos(f) * side * 0.38, pz = dz - Math.sin(f) * side * 0.38;
    const stack = Math.floor(Math.random() * 4);
    for (let i = 0; i < stack; i++) b.box(px, y + 0.74 + i * 0.03, pz, 0.3, 0.03, 0.22, i % 2 ? C.paper : 0xe6e1cf, f + (Math.random() - 0.5) * 0.3, 0);
    if (Math.random() < 0.6) b.box(dx - Math.cos(f) * side * 0.45, y + 0.74, dz + Math.sin(f) * side * 0.45, 0.16, 0.1, 0.2, 0x2a2a2a, f, 0); // 電話
    if (Math.random() < 0.3) b.box(dx - Math.cos(f) * side * 0.3, y + 0.74, dz + Math.sin(f) * side * 0.3, 0.08, 0.1, 0.08, [0xb73a3a, 0xffffff, 0x3a6ab7][Math.floor(Math.random() * 3)], 0, 0); // マグカップ
  } else {
    b.box(mx, y + 0.74, mz, 0.4, 0.03, 0.3, C.paper, f, 0);
    b.box(dx + Math.cos(f) * 0.5, y + 0.74, dz - Math.sin(f) * 0.5, 0.12, 0.25, 0.12, 0x2b2b2b, f, 0);
  }
  chair(b, n, n.big || n.boss ? C.chairBoss : C.chair);
}
function chair(b, n, col) {
  const f = n.face, fx = Math.sin(f), fz = Math.cos(f);
  const x = n.x - fx * 0.12, z = n.z - fz * 0.12, y = n.y;
  b.box(x, y, z, 0.08, 0.42, 0.08, 0x2c2c2c, f, 0);
  b.box(x, y + 0.42, z, 0.5, 0.08, 0.48, col, f, 0.03);
  b.box(x - fx * 0.24, y + 0.5, z - fz * 0.24, 0.48, 0.55, 0.07, col, f, 0.03);
}
function sofa(b, n) {
  const f = n.face, fx = Math.sin(f), fz = Math.cos(f);
  const col = n.place === 'ouse1' ? C.sofaBlue : C.sofa;
  b.box(n.x - fx * 0.05, n.y, n.z - fz * 0.05, 0.9, 0.42, 0.7, col, f, 0.03);
  b.box(n.x - fx * 0.38, n.y + 0.42, n.z - fz * 0.38, 0.9, 0.45, 0.16, col, f, 0.03);
}

// ---------- 人の模型 ----------
const SKIN = [0xe2b896, 0xd9a982, 0xe8c4a2, 0xcf9e7a, 0xc89170];
const HAIR = { young: [0x1c1714, 0x2a1d16, 0x3b2a1e, 0x5a3b26], mid: [0x1a1614, 0x26201c, 0x2f2924], old: [0x6b6763, 0x8d8a86, 0xb4b1ac, 0x3a3532] };
export function personLook(p) {
  const seed = parseInt(p.id.slice(1)) * 9973;
  const r = k => ((seed * (k + 7)) % 1000) / 1000;
  const gen = p.age >= 55 ? 'old' : p.age >= 35 ? 'mid' : 'young';
  const wh = ['driver', 'souko', 'logi'].includes(p.role);
  const look = { skin: SKIN[Math.floor(r(1) * SKIN.length)], hair: HAIR[gen][Math.floor(r(2) * HAIR[gen].length)], h: (p.gender === 'f' ? 1.56 : 1.68) + (r(3) - 0.5) * 0.12, wide: 0.9 + r(4) * 0.3 };
  if (p.age > 50 && p.gender === 'm' && r(5) < 0.35) look.bald = true;
  if (wh) { look.top = p.foreign ? 0x2f4a6a : 0x3a4a63; look.bottom = 0x2f3b50; look.cap = p.role !== 'logi' && r(6) < 0.7; look.vest = p.role === 'souko' ? 0xd5d33a : null; }
  else if (p.key === 'shacho') { look.top = 0x1f2430; look.bottom = 0x1f2430; look.tie = 0x8a1f2a; look.jacket = true; }
  else if (p.key === 'kaicho') { look.top = 0x55585c; look.bottom = 0x55585c; look.tie = 0x2f4a3a; look.jacket = true; }
  else if (p.emp === '役員' || (p.role === 'sales' && p.gender === 'm')) { look.top = 0xf0f0ec; look.bottom = [0x2a2e38, 0x3a3d42, 0x23262c][Math.floor(r(7) * 3)]; look.tie = [0x2f4a7a, 0x6a2a2a, 0x3a5a3a, 0x555555][Math.floor(r(8) * 4)]; look.jacket = r(9) < 0.3; look.jacketCol = look.bottom; }
  else if (p.gender === 'f' && ['acct', 'admin', 'reception', 'jimu'].includes(p.role)) { look.top = 0xf2f1ed; look.vest = 0x2c3550; look.bottom = 0x2c3550; look.skirt = true; }
  else if (p.gender === 'f') { look.top = [0xf1efe9, 0xd9c7b8, 0x9fb0c4, 0xe6d6c4][Math.floor(r(10) * 4)]; look.bottom = [0x2a2e38, 0x55524e, 0x2c3a52][Math.floor(r(11) * 3)]; look.jacket = r(12) < 0.4; look.jacketCol = 0x3a3f4a; look.skirt = r(13) < 0.4; }
  else { look.top = [0xf0f0ec, 0xdfe6ee, 0xe9e4da][Math.floor(r(14) * 3)]; look.bottom = 0x3a3d44; }
  look.longHair = p.gender === 'f' && r(15) < 0.6;
  look.glasses = r(16) < 0.3;
  look.mask = r(17) < 0.12;
  return look;
}
const matCache = new Map();
function M(c) { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); }
function bx(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; return m; }

function makePerson(p) {
  const L = personLook(p);
  const s = L.h / 1.68;
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const legH = 0.78 * s, torsoH = 0.56 * s, wd = 0.4 * L.wide;
  // 脚(腰を支点に回す)
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.1 * L.wide, legH, 0);
    const leg = bx(0.15, legH, 0.17, L.skirt ? L.skin : L.bottom, 0, -legH / 2, 0);
    pivot.add(leg); pivot.add(bx(0.16, 0.08, 0.26, 0x1d1d1d, 0, -legH + 0.04, 0.04));
    body.add(pivot); legs.push(pivot);
  }
  if (L.skirt) body.add(bx(wd + 0.04, 0.32, 0.26, L.bottom, 0, legH - 0.12, 0));
  const torso = bx(wd, torsoH, 0.24, L.top, 0, legH + torsoH / 2, 0); body.add(torso);
  if (L.vest) body.add(bx(wd + 0.02, torsoH * 0.7, 0.26, L.vest, 0, legH + torsoH * 0.42, 0));
  if (L.jacket) body.add(bx(wd + 0.03, torsoH, 0.26, L.jacketCol || L.top, 0, legH + torsoH / 2, -0.005));
  if (L.tie) body.add(bx(0.06, torsoH * 0.6, 0.02, L.tie, 0, legH + torsoH * 0.6, 0.135));
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * (wd / 2 + 0.06), legH + torsoH - 0.04, 0);
    pivot.add(bx(0.1, 0.56 * s, 0.12, L.jacket ? (L.jacketCol || L.top) : L.top, 0, -0.28 * s, 0));
    pivot.add(bx(0.09, 0.09, 0.1, L.skin, 0, -0.56 * s - 0.03, 0));
    body.add(pivot); arms.push(pivot);
  }
  const head = new THREE.Group(); head.position.set(0, legH + torsoH + 0.02, 0); body.add(head);
  head.add(bx(0.09, 0.06, 0.09, L.skin, 0, 0.02, 0));
  head.add(bx(0.24, 0.26, 0.24, L.skin, 0, 0.17, 0));
  if (!L.bald) head.add(bx(0.26, 0.08, 0.26, L.hair, 0, 0.31, -0.005));
  else head.add(bx(0.255, 0.07, 0.2, L.hair, 0, 0.2, -0.04));
  head.add(bx(0.26, 0.16, 0.06, L.hair, 0, 0.22, -0.11));
  if (L.longHair) head.add(bx(0.27, 0.24, 0.08, L.hair, 0, 0.1, -0.11));
  if (L.cap) head.add(bx(0.27, 0.07, 0.3, 0x2b3a4f, 0, 0.32, 0.02));
  if (L.glasses) head.add(bx(0.2, 0.04, 0.02, 0x222222, 0, 0.19, 0.125));
  if (L.mask) head.add(bx(0.17, 0.08, 0.02, 0xf4f4f2, 0, 0.11, 0.125));
  // 顔の向きがわかるよう目
  head.add(bx(0.03, 0.03, 0.01, 0x1a1a1a, -0.05, 0.18, 0.121)); head.add(bx(0.03, 0.03, 0.01, 0x1a1a1a, 0.05, 0.18, 0.121));
  g.userData = { pid: p.id, legs, arms, body, head, legH, s };
  g.traverse(o => { if (o.isMesh) o.userData.pid = p.id; });
  return g;
}

// ---------- 車 ----------
function makeCar(car) {
  const g = new THREE.Group();
  const k = car.kind;
  const dims = { kei: [1.48, 1.75, 3.4], sedan: [1.72, 1.45, 4.5], suv: [1.82, 1.7, 4.55], minivan: [1.75, 1.85, 4.7], van: [1.69, 1.5, 4.25] }[k] || [1.7, 1.5, 4.3];
  const [w, h, l] = dims;
  const body = bx(w, h * 0.5, l, car.color, 0, h * 0.25 + 0.2, 0);
  const cabinL = k === 'van' ? l * 0.78 : k === 'kei' ? l * 0.78 : l * 0.55;
  const cabin = bx(w * 0.92, h * 0.45, cabinL, car.color, 0, h * 0.5 + h * 0.225 + 0.2, k === 'van' ? -l * 0.08 : -l * 0.05);
  const glass = bx(w * 0.94, h * 0.32, cabinL * 0.98, 0x2a3540, 0, h * 0.5 + h * 0.2 + 0.2, k === 'van' ? -l * 0.08 : -l * 0.05);
  g.add(body, glass, cabin);
  cabin.scale.y = 0.35; cabin.position.y = h * 0.5 + h * 0.45 + 0.13;
  for (const [x, z] of [[-w / 2, l * 0.32], [w / 2, l * 0.32], [-w / 2, -l * 0.32], [w / 2, -l * 0.32]]) g.add(bx(0.18, 0.5, 0.5, 0x1b1b1b, x, 0.25, z));
  g.add(bx(w * 0.8, 0.12, 0.05, 0xe8e2c8, 0, h * 0.35 + 0.2, l / 2 + 0.01));
  if (car.kind === 'van') { const t = plane(textTex('丸栄商事', { w: 256, h: 64, bg: '#e8e8e4', fg: '#173c6b', font: 'bold 44px "BIZ UDPGothic", sans-serif' }), 1.4, 0.35); t.position.set(w / 2 + 0.01, h * 0.35 + 0.2, 0); t.rotation.y = Math.PI / 2; g.add(t); }
  const roofSnow = bx(w * 0.9, 0.12, cabinL * 0.9, 0xf4f6f8, 0, h + 0.27, -l * 0.05); roofSnow.visible = false; g.add(roofSnow);
  g.userData.snow = roofSnow;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeTruck(i) {
  const g = new THREE.Group();
  const L = [6.0, 7.6, 6.8][i], H = [2.9, 3.3, 3.1][i];
  g.add(bx(2.1, 0.9, 2.0, 0xe9ebe8, 0, 0.9, L / 2 - 1.0));
  g.add(bx(2.0, 0.9, 1.9, 0x2a3540, 0, 1.6, L / 2 - 0.95)); g.add(bx(2.1, 0.5, 2.0, 0xe9ebe8, 0, 2.1, L / 2 - 1.0));
  g.add(bx(2.3, H - 0.8, L - 2.2, 0xf1f2f0, 0, 0.8 + (H - 0.8) / 2, -1.0));
  g.add(bx(2.32, 0.3, L - 2.2, 0x1f4f8a, 0, 1.3, -1.0));
  g.add(bx(1.2, 0.5, 0.6, 0x8d969c, 0, H + 0.2, L / 2 - 2.6));
  for (const z of [L / 2 - 1.2, -L / 2 + 1.0, -L / 2 + 2.2]) for (const x of [-1.05, 1.05]) g.add(bx(0.3, 0.8, 0.8, 0x1b1b1b, x, 0.4, z));
  const t = plane(textTex(['丸栄商事', '食品のことなら'], { w: 512, h: 192, bg: '#f1f2f0', fg: '#173c6b', font: 'bold 70px "BIZ UDPGothic", sans-serif' }), 2.6, 1.0);
  t.position.set(1.17, 2.3, -1.0); t.rotation.y = Math.PI / 2; g.add(t);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 本体 ----------
export class View {
  constructor(container) {
    this.el = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9c6cf);
    this.scene.fog = new THREE.Fog(0xb9c6cf, 90, 190);
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.cam = new THREE.OrthographicCamera(-30 * aspect, 30 * aspect, 30, -30, 0.1, 500);
    this.cam.position.set(30, 40, 70);
    this.controls = new OrbitControls(this.cam, this.renderer.domElement);
    this.controls.target.set(-5, 4, -1);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.35; this.controls.maxPolarAngle = 1.25;
    this.controls.minZoom = 0.6; this.controls.maxZoom = 6;
    this.controls.zoomSpeed = 1.2;
    this.cam.zoom = 1.55; this.cam.updateProjectionMatrix();
    this.hemi = new THREE.HemisphereLight(0xdfe7ef, 0x6b6558, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
    this.sun.position.set(30, 50, 25); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.inLights = [];
    for (const [x, y, z] of [[-13, 2.6, -3], [-13, 2.6 + FLOOR_H, -3], [-13, 2.6 + FLOOR_H * 2, -3], [9, 5.5, -4], [21, 5.5, -4]]) {
      const l = new THREE.PointLight(0xf2f6ff, 0, 22, 1.2); l.position.set(x, y, z); this.scene.add(l); this.inLights.push(l);
    }
    this.groups = buildStatic(this.scene);
    this.people = new Map(); this.cars = new Map(); this.trucks = [];
    this.bubbles = [];
    this.overlay = document.createElement('div'); this.overlay.className = 'v-overlay'; container.appendChild(this.overlay);
    this.tip = document.createElement('div'); this.tip.className = 'v-tip'; this.tip.hidden = true; container.appendChild(this.tip);
    this.floorMax = 3;
    this.selected = null;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0xd8462b, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 10; this.scene.add(this.ring);
    this.forklift = this.makeForklift(); this.scene.add(this.forklift);
    this.precip = this.makePrecip(); this.scene.add(this.precip);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.onPick = null; this.onHover = null;
    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.clock = 0;
  }
  resize() {
    const w = this.el.clientWidth, h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h);
    const a = w / h, v = 30;
    this.cam.left = -v * a; this.cam.right = v * a; this.cam.top = v; this.cam.bottom = -v;
    this.cam.updateProjectionMatrix();
  }
  makeForklift() {
    const g = new THREE.Group();
    g.add(bx(1.0, 0.7, 1.6, 0xd9a520, 0, 0.55, 0)); g.add(bx(0.9, 0.08, 1.0, 0x2a2a2a, 0, 1.9, -0.1));
    for (const x of [-0.42, 0.42]) { g.add(bx(0.05, 1.7, 0.05, 0x2a2a2a, x, 1.05, -0.5)); g.add(bx(0.05, 1.7, 0.05, 0x2a2a2a, x, 1.05, 0.4)); }
    g.add(bx(0.9, 2.0, 0.1, 0x3a3a3a, 0, 1.2, 0.85)); g.add(bx(0.1, 0.05, 1.0, 0x5a5a5a, -0.25, 0.15, 1.35)); g.add(bx(0.1, 0.05, 1.0, 0x5a5a5a, 0.25, 0.15, 1.35));
    const load = bx(1.0, 0.8, 1.0, C.carton, 0, 0.6, 1.4); g.add(load); g.userData.load = load;
    for (const [x, z] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.6], [0.5, -0.6]]) g.add(bx(0.15, 0.4, 0.4, 0x111111, x, 0.2, z));
    g.position.set(10, 0, -1.5);
    g.userData.route = [[9.5, -1.4], [9.5, 1.0], [15.5, -1.4], [15.5, 1.0], [12.5, -1.4], [22, -1.4], [21, -4.4], [18, 1.0], [24, -1.4], [12.5, 1.0]];
    g.userData.i = 0; g.userData.wait = 0;
    return g;
  }
  makePrecip() {
    const n = 2400;
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
    m.visible = false; m.userData.kind = null;
    return m;
  }
  bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 6) return;
      const pid = this.pick(e); if (this.onPick) this.onPick(pid);
    });
    dom.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const pid = this.pick(e); this.hoverPid = pid; this.hoverXY = [e.clientX, e.clientY];
    });
    dom.addEventListener('pointerleave', () => { this.hoverPid = null; });
  }
  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.cam);
    const objs = []; for (const v of this.people.values()) if (v.g.visible) objs.push(v.g);
    const hit = this.ray.intersectObjects(objs, true)[0];
    return hit ? hit.object.userData.pid : null;
  }
  setFloor(n) { this.floorMax = n; }
  select(pid) { this.selected = pid; }
  focusOn(pid) {
    const v = this.people.get(pid); if (!v || !v.g.visible) return;
    this.controls.target.lerp(new THREE.Vector3(v.g.position.x, v.g.position.y + 1, v.g.position.z), 1);
    if (this.cam.zoom < 2.2) { this.cam.zoom = 2.6; this.cam.updateProjectionMatrix(); }
  }

  // シミュレーションの状態を反映
  sync(w, speedFactor) {
    this.w = w;
    const d = dateOf(dayIndex(w.t));
    for (const p of w.people) {
      let v = this.people.get(p.id);
      if (!v) {
        if (p.status === 'quit' || p.status === 'pending') continue;
        const g = makePerson(p); g.visible = false; this.scene.add(g);
        v = { g, path: [], node: null, target: null, pose: 'stand', phase: Math.random() * 6, exiting: false };
        this.people.set(p.id, v);
      }
      if ((p.status === 'quit') && !v.g.visible) { this.scene.remove(v.g); this.people.delete(p.id); continue; }
      const want = p.status === 'active' ? p.at : null;
      if (want !== v.target) {
        const entry = this.entryNode(w, p);
        if (want && !v.g.visible) {
          v.node = entry; const n = nodes.get(entry); v.g.position.set(n.x, n.y, n.z); v.g.visible = true;
        }
        if (want) { v.path = findPath(v.node || want, want).slice(1); v.exiting = false; }
        else if (v.g.visible && v.node) { v.path = findPath(v.node, entry).slice(1); v.exiting = true; }
        v.target = want;
      }
    }
    // 車
    for (const c of w.cars) {
      let v = this.cars.get(c.id);
      if (!v) { const g = makeCar(c); this.scene.add(g); v = { g, here: null, anim: null }; this.cars.set(c.id, v); const s = nodes.get(c.slot); g.position.set(s.carX + 1.25, 0, s.carZ); g.rotation.y = s.carFace; g.visible = c.here; v.here = c.here; }
      if (v.here !== c.here) {
        const s = nodes.get(c.slot);
        const path = findPath(c.slot, 'gate').map(id => nodes.get(id));
        const pts = path.map(n => new THREE.Vector3(n.x, 0, n.z)); pts[0] = new THREE.Vector3(s.carX + 1.25, 0, s.carZ);
        if (c.here) pts.reverse();
        v.anim = { pts, i: 0, arrive: c.here, slotFace: s.carFace };
        v.g.visible = true; v.here = c.here;
        v.g.position.copy(pts[0]);
      }
    }
    // トラック
    if (!this.trucks.length) w.trucks.forEach((t, i) => { const g = makeTruck(i); g.position.set([10, 15, 20][i], 0, 7.4); g.rotation.y = Math.PI; this.scene.add(g); this.trucks.push({ g, state: t.state, anim: null, home: new THREE.Vector3([10, 15, 20][i], 0, 7.4) }); });
    w.trucks.forEach((t, i) => {
      const v = this.trucks[i];
      if (v.state !== t.state) {
        const out = t.state === 'out';
        const pts = [v.home.clone(), new THREE.Vector3(v.home.x, 0, 12), new THREE.Vector3(14, 0, 16), new THREE.Vector3(14, 0, 22.2), new THREE.Vector3(60, 0, 22.2)];
        if (!out) pts.reverse();
        v.anim = { pts, i: 0, out }; v.g.visible = true; v.state = t.state;
      }
    });
    this.env(w, d);
  }
  entryNode(w, p) {
    if (p.today?.van) { const c = w.cars.find(c => c.id === p.today.van); if (c) return c.slot; }
    if (p.role === 'driver' && p.today?.drive && minuteOfDay(w.t) > p.today.drive[0] && minuteOfDay(w.t) < p.today.drive[1] + 60) return 'dock_15';
    if (p.car) { const c = w.cars.find(c => c.id === p.car); if (c) return c.slot; }
    return 'gate';
  }
  env(w, d) {
    const m = minuteOfDay(w.t);
    const h = m / 60;
    // 日の出入り(季節で変える)
    const rise = 4.4 + Math.abs(d.m - 6.5) * 0.38, set = 19.1 - Math.abs(d.m - 6.5) * 0.48;
    const dayT = Math.max(0, Math.min(1, Math.min((h - rise) / 1.2, (set - h) / 1.2)));
    const wk = w.weather?.kind || '晴れ';
    const dull = { '晴れ': 0, 'くもり': 0.45, '雨': 0.65, '大雨': 0.8, '雪': 0.55, '大雪': 0.7, 'みぞれ': 0.65, '雷雨': 0.85 }[wk] ?? 0.3;
    const day = new THREE.Color(0xbcd0de).lerp(new THREE.Color(0xaeb4b8), dull);
    const dusk = new THREE.Color(0xd6a684), night = new THREE.Color(0x1b2433);
    let sky;
    if (dayT >= 1) sky = day; else if (dayT <= 0) sky = night; else sky = night.clone().lerp(dusk, Math.min(1, dayT * 2)).lerp(day, Math.max(0, dayT * 2 - 1));
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky);
    this.scene.fog.near = 90 - dull * 50; this.scene.fog.far = 200 - dull * 90;
    this.sun.intensity = (1.7 - dull * 1.1) * dayT;
    const ang = (h - 12) / 12 * Math.PI;
    this.sun.position.set(-Math.sin(ang) * 50, 25 + Math.cos(ang) * 35, 30);
    this.hemi.intensity = 0.25 + dayT * (1.05 - dull * 0.3);
    this.hemi.color.set(dayT > 0.5 ? 0xdfe7ef : 0x8fa3c8);
    // 室内灯:誰かがいて、暗いときほど目立つ
    const occ = { 1: 0, 2: 0, 3: 0, W: 0 };
    for (const p of w.people) if (p.at) { const n = nodes.get(p.at); if (n) occ[n.fl] = (occ[n.fl] || 0) + 1; }
    const lit = (k) => occ[k] > 0 ? (0.6 + (1 - dayT) * 1.6) : 0;
    this.inLights[0].intensity = lit('1') * 22; this.inLights[1].intensity = lit('2') * 22; this.inLights[2].intensity = lit('3') * 22;
    this.inLights[3].intensity = lit('W') * 30; this.inLights[4].intensity = lit('W') * 30;
    // 季節:田んぼ・雪
    const fieldCol = { 1: 0xc9c6bd, 2: 0xc9c6bd, 3: 0x7a6a50, 4: 0x6f6448, 5: 0x6f8f8a, 6: 0x6f9a40, 7: 0x5f8f2e, 8: 0x7d9a2e, 9: 0xc0a640, 10: 0x8a7a50, 11: 0x7a6a50, 12: 0xc9c6bd }[d.m];
    const snowy = (w.weather?.snowDepth || 0) > 5;
    this.scene.userData.fieldMat.color.set(snowy ? 0xeef0f2 : fieldCol);
    for (const s of this.scene.userData.snowPiles) { s.visible = (w.weather?.snowDepth || 0) > 15; s.scale.y = Math.min(2, (w.weather?.snowDepth || 0) / 40); }
    for (const v of this.cars.values()) v.g.userData.snow.visible = snowy && (w.weather.kind === '雪' || w.weather.kind === '大雪');
    // 降るもの
    const P = this.precip;
    const kind = /雪/.test(wk) ? 'snow' : /雨|みぞれ/.test(wk) ? 'rain' : null;
    P.visible = !!kind && (m > 300);
    if (kind !== P.userData.kind) { P.userData.kind = kind; P.material.size = kind === 'snow' ? 0.22 : 0.08; P.material.color.set(kind === 'snow' ? 0xffffff : 0xb8c8d8); P.material.opacity = kind === 'snow' ? 0.9 : 0.55; }
    P.userData.heavy = /大/.test(wk) ? 1 : 0.5;
    // 階の表示
    this.groups.f2.visible = this.floorMax >= 2; this.groups.f3.visible = this.floorMax >= 3;
  }

  // 吹き出し
  bubble(pid, text, speedFactor = 1) {
    const v = this.people.get(pid); if (!v) return;
    const el = document.createElement('div'); el.className = 'v-bubble'; el.textContent = text;
    this.overlay.appendChild(el);
    const life = Math.max(1.6, Math.min(6, 1.4 + text.length * 0.09) / Math.max(1, Math.sqrt(speedFactor)));
    this.bubbles = this.bubbles.filter(b => { if (b.pid === pid) { b.el.remove(); return false; } return true; });
    this.bubbles.push({ pid, el, t: 0, life });
    if (this.bubbles.length > 14) { const b = this.bubbles.shift(); b.el.remove(); }
  }

  frame(dt, speedFactor) {
    this.clock += dt;
    const walk = 1.35 * Math.max(1, Math.min(speedFactor, 12));
    for (const [pid, v] of this.people) {
      if (!v.g.visible) continue;
      const g = v.g, U = g.userData;
      let moving = false;
      if (v.path.length) {
        const n = nodes.get(v.path[0]);
        const tx = n.x, tz = n.z, ty = n.y;
        const dx = tx - g.position.x, dz = tz - g.position.z, dy = ty - g.position.y;
        const dist = Math.hypot(dx, dz, dy);
        const stepLen = walk * dt;
        if (dist <= stepLen || dist < 0.01) { g.position.set(tx, ty, tz); v.node = v.path.shift(); }
        else {
          g.position.x += dx / dist * stepLen; g.position.z += dz / dist * stepLen; g.position.y += dy / dist * stepLen;
          if (Math.hypot(dx, dz) > 0.02) { const a = Math.atan2(dx, dz); g.rotation.y = lerpAngle(g.rotation.y, a, Math.min(1, dt * 12)); }
        }
        moving = true;
        if (!v.path.length && v.exiting) { g.visible = false; v.exiting = false; v.node = null; continue; }
      }
      // ポーズ
      const n = v.node ? nodes.get(v.node) : null;
      const arrived = !moving && n && v.node === v.target;
      const sitting = arrived && (n.kind === 'desk' || n.kind === 'seat' || n.kind === 'sofa');
      const working = arrived && n.kind === 'work';
      if (arrived && n.face != null) g.rotation.y = lerpAngle(g.rotation.y, n.face, Math.min(1, dt * 6));
      v.phase += dt * (moving ? walk * 4.2 : 2);
      const sw = moving ? Math.sin(v.phase) * 0.55 : 0;
      U.legs[0].rotation.x = sitting ? -1.45 : sw; U.legs[1].rotation.x = sitting ? -1.45 : -sw;
      U.arms[0].rotation.x = sitting ? -0.9 + Math.sin(this.clock * 9 + v.phase) * 0.06 : working ? -0.6 + Math.sin(this.clock * 3 + v.phase) * 0.5 : -sw * 0.8;
      U.arms[1].rotation.x = sitting ? -0.9 + Math.cos(this.clock * 8 + v.phase) * 0.06 : working ? -0.6 + Math.cos(this.clock * 3 + v.phase) * 0.5 : sw * 0.8;
      if (arrived && n.place === 'smoke') U.arms[1].rotation.x = -1.6 - Math.max(0, Math.sin(this.clock * 0.9 + v.phase)) * 0.9;
      U.body.position.y = sitting ? -0.33 * U.s : 0;
      U.body.position.z = sitting ? -0.12 : 0;
      U.head.rotation.y = !moving ? Math.sin(this.clock * 0.3 + v.phase) * 0.35 : 0;
      U.body.rotation.x = working ? 0.25 + Math.sin(this.clock * 3 + v.phase) * 0.15 : 0;
      // 階で隠す
      const fl = n ? n.fl : null;
      const hide = (fl === '2' && this.floorMax < 2) || (fl === '3' && this.floorMax < 3) || (g.position.y > FLOOR_H * (this.floorMax) - 0.5 && g.position.y > 0.5 && g.position.x < -1.5);
      g.children[0].visible = !hide;
    }
    // 車
    for (const v of this.cars.values()) {
      if (!v.anim) continue;
      const A = v.anim; const sp = 7 * Math.max(1, Math.min(speedFactor, 10)) * dt;
      const tgt = A.pts[A.i + 1];
      if (!tgt) { v.anim = null; if (!A.arrive) v.g.visible = false; else v.g.rotation.y = A.slotFace; continue; }
      const d = tgt.clone().sub(v.g.position); const L = d.length();
      if (L <= sp) { v.g.position.copy(tgt); A.i++; }
      else { v.g.position.addScaledVector(d.normalize(), sp); v.g.rotation.y = lerpAngle(v.g.rotation.y, Math.atan2(d.x, d.z), 0.3); }
    }
    for (const v of this.trucks) {
      if (!v.anim) continue;
      const A = v.anim; const sp = 6 * Math.max(1, Math.min(speedFactor, 10)) * dt;
      const tgt = A.pts[A.i + 1];
      if (!tgt) { v.anim = null; if (A.out) v.g.visible = false; else { v.g.rotation.y = Math.PI; } continue; }
      const d = tgt.clone().sub(v.g.position); const L = d.length();
      if (L <= sp) { v.g.position.copy(tgt); A.i++; }
      else { v.g.position.addScaledVector(d.normalize(), sp); const back = !A.out && A.i >= A.pts.length - 2; v.g.rotation.y = lerpAngle(v.g.rotation.y, Math.atan2(d.x, d.z) + (back ? Math.PI : 0), 0.25); }
    }
    // フォークリフト(倉庫に人がいるときだけ動く)
    const F = this.forklift, FU = F.userData;
    const whBusy = this.w && this.w.people.some(p => p.at && nodes.get(p.at)?.fl === 'W' && p.role === 'souko');
    if (whBusy) {
      if (FU.wait > 0) FU.wait -= dt * Math.min(speedFactor, 6);
      else {
        const [tx, tz] = FU.route[FU.i]; const dx = tx - F.position.x, dz = tz - F.position.z; const L = Math.hypot(dx, dz);
        const sp = 2.2 * Math.min(speedFactor, 6) * dt;
        if (L < sp) { F.position.set(tx, 0, tz); FU.i = (FU.i + 1) % FU.route.length; FU.wait = 1.5 + Math.random() * 3; FU.load.visible = !FU.load.visible; }
        else { F.position.x += dx / L * sp; F.position.z += dz / L * sp; F.rotation.y = lerpAngle(F.rotation.y, Math.atan2(dx, dz), 0.2); }
      }
    }
    // 雨・雪
    if (this.precip.visible) {
      const pos = this.precip.geometry.attributes.position; const arr = pos.array;
      const snow = this.precip.userData.kind === 'snow';
      const vy = (snow ? 2.2 : 16) * dt, n = arr.length / 3, act = Math.floor(n * this.precip.userData.heavy);
      for (let i = 0; i < n; i++) {
        if (i > act) { arr[i * 3 + 1] = -10; continue; }
        arr[i * 3 + 1] -= vy * (0.8 + (i % 7) * 0.06);
        if (snow) arr[i * 3] += Math.sin(this.clock + i) * dt * 0.4;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 30;
      }
      pos.needsUpdate = true;
    }
    // 選択リング
    const sel = this.selected && this.people.get(this.selected);
    if (sel && sel.g.visible && sel.g.children[0].visible) { this.ring.visible = true; this.ring.position.set(sel.g.position.x, sel.g.position.y + 0.05, sel.g.position.z); this.ring.scale.setScalar(1 + Math.sin(this.clock * 4) * 0.08); }
    else this.ring.visible = false;
    this.controls.update();
    this.renderer.render(this.scene, this.cam);
    this.updateOverlay(dt);
  }
  project(v3) {
    const p = v3.clone().project(this.cam);
    return [(p.x + 1) / 2 * this.el.clientWidth, (1 - p.y) / 2 * this.el.clientHeight, p.z];
  }
  updateOverlay(dt) {
    const tmp = new THREE.Vector3();
    this.bubbles = this.bubbles.filter(b => {
      b.t += dt;
      const v = this.people.get(b.pid);
      if (!v || b.t > b.life || !v.g.visible || !v.g.children[0].visible) { b.el.remove(); return false; }
      v.g.getWorldPosition(tmp); tmp.y += 2.0;
      const [x, y] = this.project(tmp);
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      b.el.style.opacity = b.t > b.life - 0.4 ? String(Math.max(0, (b.life - b.t) / 0.4)) : '1';
      return true;
    });
    // ホバーの名札
    if (this.hoverPid && this.onHover) {
      const info = this.onHover(this.hoverPid);
      if (info) {
        const r = this.el.getBoundingClientRect();
        this.tip.hidden = false; this.tip.innerHTML = info;
        this.tip.style.transform = `translate(${Math.round(this.hoverXY[0] - r.left + 14)}px, ${Math.round(this.hoverXY[1] - r.top + 10)}px)`;
      }
    } else this.tip.hidden = true;
  }
}
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
