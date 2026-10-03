// 3Dの島。three.js で、ブロックを積んだドット絵風の島・水面の映りこみ・月・森を描く。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { TERRAIN } from './data.js';
import { mulberry32 } from './boardgen.js';

const HL_COLORS = {
  select: new THREE.Color('#9fd6ff'),
  hover: new THREE.Color('#ffffff'),
  power: new THREE.Color('#b9f0ff'),
  ravage: new THREE.Color('#ff4a3a'),
  build: new THREE.Color('#ff9a3a'),
  explore: new THREE.Color('#ffe48a'),
};

export class Board3D {
  constructor(host, labelHost, board) {
    this.host = host;
    this.labelHost = labelHost;
    this.board = board;
    this.selectable = new Set();
    this.hoverId = null;
    this.flashes = [];
    this.onLandClick = null;
    this.onLandHover = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#4a4a72', 45, 120);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.camera.position.set(0, 15, 47);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 0.5, 3);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 70;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minAzimuthAngle = -1.1;
    this.controls.maxAzimuthAngle = 1.1;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.baseCam = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.homeCam = this.baseCam;

    this.buildSky();
    this.buildLights();
    this.buildIsland();
    this.buildWater();
    this.buildForest();
    this.buildFireflies();
    this.buildPieceAssets();
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);
    this.buildLabels();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.bindPointer();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // 座標:グリッド(x,z) → 世界座標
  wx(x) { return x - this.board.W / 2 + 0.5; }
  wz(z) { return z - this.board.D / 2 + 0.5; }

  resetView() {
    this.camera.position.copy(this.homeCam.pos);
    this.controls.target.copy(this.homeCam.target);
    this.controls.update();
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    // ドット絵らしさを出すため、低い解像度で描いて引きのばす
    this.pix = w > 1400 ? 3 : w > 700 ? 2.5 : 2;
    const rw = Math.max(160, Math.floor(w / this.pix));
    const rh = Math.max(120, Math.floor(h / this.pix));
    this.renderer.setSize(rw, rh, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    // 縦長の画面では少し引いて島全体を入れる
    const a = w / h;
    this.camera.fov = a < 0.9 ? 56 : a < 1.3 ? 46 : 40;
    this.camera.updateProjectionMatrix();
    // 縦長の画面ではカメラを引いて、島の左右が切れないようにする
    const k = a < 0.6 ? 1.8 : a < 0.9 ? 1.5 : a < 1.3 ? 1.2 : 1;
    if (k !== this.camK) {
      this.camK = k;
      this.homeCam = { pos: this.baseCam.pos.clone().sub(this.baseCam.target).multiplyScalar(k).add(this.baseCam.target), target: this.baseCam.target.clone() };
      this.controls.maxDistance = 70 * k;
      this.resetView();
    }
    if (this.mirror) this.mirror.getRenderTarget().setSize(rw, rh);
  }

  // ---------- 空・月・星 ----------
  buildSky() {
    const skyGeo = new THREE.SphereGeometry(300, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color('#232846') },
        mid: { value: new THREE.Color('#6f6890') },
        horizon: { value: new THREE.Color('#c7a9bd') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = abs(vP.y);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          // 島の奥(-z)側の空を少し明るく
          c += vec3(0.10,0.07,0.09) * smoothstep(0.3, -1.0, vP.z) * (1.0 - smoothstep(0.0, 0.35, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // 半月
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#f2ecf6';
    cx.beginPath(); cx.arc(32, 32, 28, -Math.PI / 2, Math.PI / 2); cx.closePath(); cx.fill();
    cx.fillStyle = 'rgba(200,190,220,0.5)';
    cx.fillRect(32, 4, 3, 56);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    moon.position.set(-16, 30, -130);
    this.scene.add(moon);
    this.moon = moon;

    // 星
    const rng = mulberry32(42);
    const pos = [];
    for (let i = 0; i < 380; i++) {
      const th = rng() * Math.PI * 2, ph = 0.08 + rng() * 1.2;
      const r = 280;
      pos.push(Math.cos(th) * Math.cos(ph) * r, Math.sin(ph) * r, Math.sin(th) * Math.cos(ph) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e6e0f6', size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.scene.add(this.stars);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight('#b6aed8', '#2a2d4a', 1.35));
    const moonLight = new THREE.DirectionalLight('#e6d8f0', 1.5);
    moonLight.position.set(-18, 30, -22);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    const sc = moonLight.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    moonLight.shadow.bias = -0.002;
    this.scene.add(moonLight);
    const fill = new THREE.DirectionalLight('#c09cc0', 0.45);
    fill.position.set(10, 8, 30);
    this.scene.add(fill);
  }

  // ---------- 島(ブロック) ----------
  buildIsland() {
    const { W, D, cells, lands, noise } = this.board;
    const rng = mulberry32(7);
    const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= D) ? -2 : cells[z * W + x];

    // 海からの距離(海岸ほど低くする)
    const distSea = new Float32Array(W * D).fill(99);
    const q = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (at(x, z) === -1) { distSea[z * W + x] = 0; q.push(z * W + x); }
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % W, z = (c / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const n = nz * W + nx;
        if (distSea[n] > distSea[c] + 1) { distSea[n] = distSea[c] + 1; q.push(n); }
      }
    }

    const heights = new Float32Array(W * D);
    for (const L of lands) {
      let maxD = 1;
      for (const [x, z] of L.cells) maxD = Math.max(maxD, Math.hypot(x - L.cx, z - L.cz));
      for (const [x, z] of L.cells) {
        const n = noise(x * 0.35, z * 0.35);
        const r = Math.hypot(x - L.cx, z - L.cz) / maxD;
        let h;
        switch (L.terrain) {
          case 'M': h = 2.0 + (1 - r) * 3.4 + n * 1.2; break;
          case 'J': h = 1.7 + n * 1.0; break;
          case 'W': h = 0.75 + n * 0.35; break;
          default: h = 1.15 + n * 0.6;
        }
        // 奥ほど少し高い
        h += (1 - z / D) * 0.9;
        h = Math.min(h, 0.45 + distSea[z * W + x] * 0.55);
        heights[z * W + x] = Math.max(0.35, Math.round(h * 2) / 2);
      }
    }
    // 駒の置き場所は中心付近の平らなマス。山は頂上を少し平らに
    for (const L of lands) {
      if (L.terrain !== 'M') continue;
      const top = heights[L.cz * W + L.cx];
      for (const [x, z] of L.cells) if (Math.hypot(x - L.cx, z - L.cz) < 1.6) heights[z * W + x] = top;
    }
    this.heights = heights;

    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    this.landMeshes = [];
    this.landMats = [];
    this.slots = [];
    this.labelPos = [];
    const propCells = [];

    for (const L of lands) {
      const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
      const mesh = new THREE.InstancedMesh(box, mat, L.cells.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.landId = L.id;
      const base = new THREE.Color(TERRAIN[L.terrain].color);
      L.cells.forEach(([x, z], i) => {
        const h = heights[z * W + x];
        m.makeScale(1, h + 2, 1);
        m.setPosition(this.wx(x), -2, this.wz(z));
        mesh.setMatrixAt(i, m);
        const border = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const v = at(x + dx, z + dz); return v >= 0 && v !== L.id; });
        const n = noise(x * 0.9 + 5, z * 0.9);
        col.copy(base).multiplyScalar(0.82 + n * 0.3 + h * 0.025);
        if (border) col.multiplyScalar(0.55);
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      this.landMeshes.push(mesh);
      this.landMats.push(mat);

      // 駒の置き場所:中心に近く、境界でないマス
      const sorted = L.cells
        .filter(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => at(x + dx, z + dz) === L.id))
        .map(c => ({ c, d: Math.hypot(c[0] - L.cx, (c[1] - L.cz) * 1.2) }))
        .sort((a, b) => a.d - b.d);
      const slots = sorted.slice(0, 16).map(s => s.c);
      this.slots.push(slots.map(([x, z]) => new THREE.Vector3(this.wx(x), heights[z * W + x], this.wz(z))));
      const lp = slots[0];
      this.labelPos.push(new THREE.Vector3(this.wx(lp[0]), heights[lp[1] * W + lp[0]] + 2.4, this.wz(lp[1])));
      const taken = new Set(sorted.slice(0, 22).map(s => s.c[1] * W + s.c[0]));
      for (const [x, z] of L.cells) if (!taken.has(z * W + x)) propCells.push({ L, x, z });
    }

    this.buildProps(propCells, rng);
  }

  buildProps(propCells, rng) {
    const { W } = this.board;
    const trunks = [], crowns = [], rocks = [], reeds = [], puddles = [], bushes = [];
    for (const p of propCells) {
      const h = this.heights[p.z * W + p.x];
      const x = this.wx(p.x) + (rng() - 0.5) * 0.3, z = this.wz(p.z) + (rng() - 0.5) * 0.3;
      const r = rng();
      if (p.L.terrain === 'J') {
        if (r < 0.32) { const s = 0.75 + rng() * 0.6; trunks.push([x, h, z, s]); crowns.push([x, h + 1.0 * s + 0.45 * s, z, s]); }
        else if (r < 0.5) bushes.push([x, h, z, 0.6 + rng() * 0.3]);
      } else if (p.L.terrain === 'W') {
        if (r < 0.14) puddles.push([x, h, z]);
        else if (r < 0.34) reeds.push([x, h, z, 0.5 + rng() * 0.5]);
        else if (r < 0.40) bushes.push([x, h, z, 0.45]);
      } else if (p.L.terrain === 'M') {
        if (r < 0.10) rocks.push([x, h, z, 0.5 + rng() * 0.5]);
        else if (r < 0.16) { const s = 0.55 + rng() * 0.3; trunks.push([x, h, z, s]); crowns.push([x, h + 1.45 * s, z, s]); }
      } else {
        if (r < 0.12) rocks.push([x, h, z, 0.35 + rng() * 0.4]);
        else if (r < 0.17) bushes.push([x, h, z, 0.4]);
      }
    }
    const inst = (geo, mat, list, place) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
      list.forEach((it, i) => { place(it, v, q, s); m.compose(v, q, s); mesh.setMatrixAt(i, m); });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    const dark = new THREE.MeshLambertMaterial({ color: '#2a3048' });
    const crownMat = new THREE.MeshLambertMaterial({ color: '#34445a', flatShading: true });
    const trunkGeo = new THREE.BoxGeometry(0.16, 1, 0.16); trunkGeo.translate(0, 0.5, 0);
    inst(trunkGeo, dark, trunks, (t, v, q, s) => { v.set(t[0], t[1], t[2]); s.set(1, t[3] * 1.2, 1); });
    inst(new THREE.IcosahedronGeometry(0.62, 1), crownMat, crowns, (t, v, q, s) => { v.set(t[0], t[1], t[2]); s.setScalar(t[3]); });
    inst(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: '#3b4a5c', flatShading: true }), bushes,
      (t, v, q, s) => { v.set(t[0], t[1] + 0.2, t[2]); s.set(t[3], t[3] * 0.7, t[3]); });
    inst(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshLambertMaterial({ color: '#8a8698', flatShading: true }), rocks,
      (t, v, q, s) => { v.set(t[0], t[1] + 0.15, t[2]); s.setScalar(t[3]); q.setFromEuler(new THREE.Euler(t[3], t[0], 0)); });
    const reedGeo = new THREE.BoxGeometry(0.06, 1, 0.06); reedGeo.translate(0, 0.5, 0);
    inst(reedGeo, new THREE.MeshLambertMaterial({ color: '#7d8a8a' }), reeds, (t, v, q, s) => { v.set(t[0], t[1], t[2]); s.set(1, t[3], 1); });
    const pudGeo = new THREE.BoxGeometry(0.9, 0.04, 0.9);
    inst(pudGeo, new THREE.MeshLambertMaterial({ color: '#8fa6c8', emissive: '#2a3a5a' }), puddles, (t, v, q, s) => { v.set(t[0], t[1] + 0.02, t[2]); s.setScalar(1); });
  }

  // ---------- 水面(映りこみ) ----------
  buildWater() {
    const geo = new THREE.PlaneGeometry(500, 500);
    this.mirror = new Reflector(geo, {
      textureWidth: 512, textureHeight: 512,
      color: new THREE.Color('#8d8aa6'),
      clipBias: 0.003,
    });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = 0;
    this.scene.add(this.mirror);

    // 水面の細い光のすじ(横線)
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const cx = cv.getContext('2d');
    const rng = mulberry32(99);
    for (let i = 0; i < 260; i++) {
      const y = Math.floor(rng() * 256), x = Math.floor(rng() * 256), w = 4 + Math.floor(rng() * 26);
      cx.fillStyle = `rgba(230,220,245,${0.15 + rng() * 0.35})`;
      cx.fillRect(x, y, w, 1);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.magFilter = THREE.NearestFilter;
    this.waveTex = tex;
    const waves = new THREE.Mesh(new THREE.PlaneGeometry(500, 500),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false }));
    waves.rotation.x = -Math.PI / 2;
    waves.position.y = 0.03;
    this.scene.add(waves);
    this.waves = waves;
    // 映りこみには光のすじを写さない
    const ob = this.mirror.onBeforeRender;
    this.mirror.onBeforeRender = (...args) => { waves.visible = false; ob.apply(this.mirror, args); waves.visible = true; };
  }

  // ---------- 周りの森 ----------
  buildForest() {
    const { W, D } = this.board;
    const rng = mulberry32(5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#2b2f4c' });
    const crownMat = new THREE.MeshLambertMaterial({ color: '#2e3654', flatShading: true });
    const g = new THREE.Group();
    const add = (x, z, h, w) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), trunkMat);
      t.position.set(x, h / 2 - 1, z);
      t.castShadow = true;
      g.add(t);
      if (rng() < 0.7) {
        const s = 1.6 + rng() * 2.2;
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), crownMat);
        c.position.set(x + (rng() - 0.5), h * (0.45 + rng() * 0.4), z);
        c.scale.y = 1.15;
        c.castShadow = true;
        g.add(c);
      }
    };
    // 奥の森
    for (let i = 0; i < 26; i++) add(-W / 2 - 8 + rng() * (W + 16), -D / 2 - 2 - rng() * 14, 14 + rng() * 40, 0.9 + rng() * 1.8);
    // 左右の森(高い柱のような木)
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      add(side * (W / 2 + 2 + rng() * 9), -D / 2 + rng() * D * 0.95, 20 + rng() * 45, 1.1 + rng() * 2);
    }
    // 低い茂み(奥と左右)
    for (let i = 0; i < 40; i++) {
      const side = rng();
      let x, z;
      if (side < 0.5) { x = -W / 2 - 4 + rng() * (W + 8); z = -D / 2 - 0.5 - rng() * 4; }
      else { const s = side < 0.75 ? -1 : 1; x = s * (W / 2 + 0.5 + rng() * 4); z = -D / 2 + rng() * D * 0.8; }
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rng() * 1.6, 1), crownMat);
      b.position.set(x, 0.5 + rng() * 1.5, z);
      b.castShadow = true;
      g.add(b);
    }
    // 左右の地面(島の外側の暗い土台)
    const groundMat = new THREE.MeshLambertMaterial({ color: '#33385a' });
    for (const s of [-1, 1]) {
      const gr = new THREE.Mesh(new THREE.BoxGeometry(18, 3, D * 0.85), groundMat);
      gr.position.set(s * (W / 2 + 9), -0.9, -D * 0.08);
      gr.receiveShadow = true;
      g.add(gr);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 40, 3, 22), groundMat);
    back.position.set(0, -0.6, -D / 2 - 11);
    g.add(back);
    this.scene.add(g);
  }

  buildFireflies() {
    const { W, D } = this.board;
    const rng = mulberry32(11);
    const n = 70;
    const pos = new Float32Array(n * 3);
    this.ffBase = [];
    for (let i = 0; i < n; i++) {
      const b = [(rng() - 0.5) * (W + 10), 1 + rng() * 5, (rng() - 0.5) * D * 0.9 - 2, rng() * 10];
      this.ffBase.push(b);
      pos.set([b[0], b[1], b[2]], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffb35c', size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.fireflies);
  }

  // ---------- 駒 ----------
  buildPieceAssets() {
    const A = {};
    const lam = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    A.explorer = (() => {
      const g = new THREE.ConeGeometry(0.2, 0.55, 4); g.translate(0, 0.275, 0); return [g, lam('#d4834e')];
    })();
    A.town = (() => {
      const b = new THREE.BoxGeometry(0.46, 0.32, 0.46); b.translate(0, 0.16, 0);
      const r = new THREE.ConeGeometry(0.4, 0.3, 4); r.rotateY(Math.PI / 4); r.translate(0, 0.47, 0);
      return [[b, lam('#c06650')], [r, lam('#8e3e3a')]];
    })();
    A.city = (() => {
      const a = new THREE.BoxGeometry(0.32, 0.95, 0.32); a.translate(-0.08, 0.475, 0);
      const b = new THREE.BoxGeometry(0.3, 0.6, 0.3); b.translate(0.2, 0.3, 0.08);
      return [[a, lam('#a8443e')], [b, lam('#7c2f33')]];
    })();
    A.dahan = (() => {
      const body = new THREE.CylinderGeometry(0.1, 0.16, 0.38, 6); body.translate(0, 0.19, 0);
      const head = new THREE.SphereGeometry(0.12, 6, 4); head.translate(0, 0.5, 0);
      return [[body, lam('#e8dcc6')], [head, lam('#f2e8d8')]];
    })();
    A.blight = [new THREE.OctahedronGeometry(0.3, 0).translate(0, 0.3, 0),
      new THREE.MeshLambertMaterial({ color: '#5a2c6c', emissive: '#2a0c38', flatShading: true })];
    A.presenceGeo = new THREE.SphereGeometry(0.24, 10, 8).translate(0, 0.32, 0);
    A.ringGeo = new THREE.TorusGeometry(0.34, 0.04, 4, 16).rotateX(Math.PI / 2).translate(0, 0.06, 0);
    // 光のにじみ(加算合成のスプライト)
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
    A.glowTex = new THREE.CanvasTexture(cv);
    this.assets = A;
  }

  makePiece(kind, color) {
    const A = this.assets;
    const g = new THREE.Group();
    const addParts = parts => {
      const list = Array.isArray(parts[0]) ? parts : [parts];
      for (const [geo, mat] of list) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
    };
    if (kind === 'presence') {
      const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.8 });
      const m = new THREE.Mesh(A.presenceGeo, mat); g.add(m);
      g.add(new THREE.Mesh(A.ringGeo, new THREE.MeshBasicMaterial({ color })));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      sp.scale.setScalar(1.4); sp.position.y = 0.32; g.add(sp);
      g.userData.bob = true;
    } else if (kind === 'explorers') addParts(A.explorer);
    else if (kind === 'towns') addParts(A.town);
    else if (kind === 'cities') addParts(A.city);
    else if (kind === 'dahan') addParts(A.dahan);
    else if (kind === 'blight') addParts(A.blight);
    return g;
  }

  setPieces(lands, spiritColor) {
    const grp = this.pieceGroup;
    while (grp.children.length) grp.remove(grp.children[0]);
    const order = ['presence', 'dahan', 'cities', 'towns', 'explorers', 'blight'];
    for (const L of lands) {
      const slots = this.slots[L.id];
      let si = 0;
      for (const kind of order) {
        const n = L[kind];
        for (let i = 0; i < n; i++) {
          const p = this.makePiece(kind, spiritColor);
          const slot = slots[si % slots.length];
          const lift = Math.floor(si / slots.length) * 1.1;
          p.scale.setScalar(1.55);
          p.position.set(slot.x, slot.y + lift, slot.z);
          p.rotation.y = (si * 1.7) % (Math.PI * 2);
          p.userData.baseY = p.position.y;
          p.userData.phase = si;
          grp.add(p);
          si++;
        }
      }
    }
  }

  // ---------- 土地の番号ラベル ----------
  buildLabels() {
    this.labels = this.board.lands.map(L => {
      const el = document.createElement('div');
      el.className = 'land-label';
      el.innerHTML = `<b>${L.num}</b><span>${TERRAIN[L.terrain].name}</span>`;
      el.addEventListener('click', () => this.onLandClick && this.onLandClick(L.id));
      this.labelHost.appendChild(el);
      return el;
    });
  }

  // ---------- 強調表示 ----------
  setSelectable(ids) {
    this.selectable = new Set(ids || []);
    this.labels.forEach((el, i) => el.classList.toggle('selectable', this.selectable.has(i)));
  }
  flash(ids, kind) {
    const until = this.clock.getElapsedTime() + 1.3;
    for (const id of ids) this.flashes.push({ id, kind, until });
  }

  bindPointer() {
    let down = null;
    const pick = e => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.landMeshes, false)[0];
      return hit ? hit.object.userData.landId : null;
    };
    this.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const id = pick(e);
      if (id != null && this.onLandClick) this.onLandClick(id);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const id = pick(e);
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.canvas.style.cursor = id != null && this.selectable.has(id) ? 'pointer' : 'default';
      }
      if (this.onLandHover) this.onLandHover(id, e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointerleave', () => { this.hoverId = null; if (this.onLandHover) this.onLandHover(null); });
  }

  frame() {
    const t = this.clock.getElapsedTime();
    this.controls.update();

    // 土地の光
    this.flashes = this.flashes.filter(f => f.until > t);
    this.landMats.forEach((mat, id) => {
      const f = this.flashes.find(fl => fl.id === id);
      if (f) {
        mat.emissive.copy(HL_COLORS[f.kind]);
        mat.emissiveIntensity = 0.25 + 0.25 * Math.max(0, Math.sin((f.until - t) * 9));
      } else if (this.selectable.has(id)) {
        mat.emissive.copy(id === this.hoverId ? HL_COLORS.hover : HL_COLORS.select);
        mat.emissiveIntensity = (id === this.hoverId ? 0.32 : 0.12) + 0.08 * Math.sin(t * 4);
      } else if (id === this.hoverId) {
        mat.emissive.copy(HL_COLORS.hover);
        mat.emissiveIntensity = 0.06;
      } else {
        mat.emissiveIntensity = 0;
      }
    });

    // 存在の浮遊
    for (const p of this.pieceGroup.children) {
      if (p.userData.bob) p.position.y = p.userData.baseY + 0.08 + Math.sin(t * 2 + p.userData.phase) * 0.07;
    }

    // ほたる
    const pos = this.fireflies.geometry.attributes.position;
    this.ffBase.forEach((b, i) => {
      pos.setXYZ(i, b[0] + Math.sin(t * 0.3 + b[3]) * 1.2, b[1] + Math.sin(t * 0.7 + b[3] * 2) * 0.5, b[2] + Math.cos(t * 0.25 + b[3]) * 1.2);
    });
    pos.needsUpdate = true;
    this.fireflies.material.opacity = 0.65 + 0.3 * Math.sin(t * 1.7);

    this.waveTex.offset.x = (t * 0.004) % 1;
    this.waveTex.offset.y = Math.floor(t * 0.6) % 2 ? 0.002 : 0;

    // ラベルの位置
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    this.labels.forEach((el, i) => {
      v.copy(this.labelPos[i]).project(this.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = vis ? '' : 'none';
      el.style.transform = `translate(-50%,-50%) translate(${Math.round((v.x * 0.5 + 0.5) * w)}px, ${Math.round((-v.y * 0.5 + 0.5) * h)}px)`;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
