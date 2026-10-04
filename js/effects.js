// 演出(エフェクト):火花・破片・衝撃の輪・光の柱・飛ぶ光・浮かぶ文字・大きな見出し・画面のゆれ・効果音
import * as THREE from 'three';

export const PIECE_COLORS = {
  explorers: '#e08a50', towns: '#c86450', cities: '#b04040', dahan: '#efe3cc', blight: '#8a46a8', presence: '#9fdcff',
};

const ease = {
  outCubic: k => 1 - (1 - k) ** 3,
  outBack: k => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  outBounce: k => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
};
export { ease };

// ---------- 効果音(ファイルを使わず、その場で音を作る) ----------
class Sound {
  constructor() {
    this.on = true;
    try { this.on = localStorage.getItem('spirit-sound') !== 'off'; } catch (e) { /* 保存できない環境では無視 */ }
    this.ctx = null;
  }
  setOn(v) { this.on = v; try { localStorage.setItem('spirit-sound', v ? 'on' : 'off'); } catch (e) { /* 無視 */ } }
  ensure() {
    if (!this.on) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur, { type = 'sine', vol = 0.5, slide = 0, delay = 0 } = {}) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.5, freq = 800, q = 1, delay = 0, type = 'lowpass' } = {}) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  play(name) {
    if (!this.on) return;
    switch (name) {
      case 'hit': this.noise(0.25, { vol: 0.7, freq: 900 }); this.tone(140, 0.2, { type: 'square', vol: 0.15, slide: 0.5 }); break;
      case 'shatter': this.noise(0.35, { vol: 0.5, freq: 2500, type: 'bandpass', q: 0.8 }); break;
      case 'ravage': this.noise(0.9, { vol: 0.9, freq: 260 }); this.tone(70, 0.8, { type: 'sawtooth', vol: 0.18, slide: 0.6 }); break;
      case 'build': this.tone(220, 0.08, { type: 'square', vol: 0.18 }); this.tone(220, 0.08, { type: 'square', vol: 0.18, delay: 0.14 }); this.noise(0.15, { vol: 0.3, freq: 600, delay: 0.28 }); break;
      case 'explore': this.tone(330, 0.25, { type: 'triangle', vol: 0.2, slide: 1.3 }); break;
      case 'blight': this.tone(110, 1.0, { type: 'sawtooth', vol: 0.12, slide: 0.7 }); this.noise(0.8, { vol: 0.25, freq: 400 }); break;
      case 'power': [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.18, delay: i * 0.07 })); break;
      case 'presence': [784, 1047].forEach((f, i) => this.tone(f, 0.7, { type: 'sine', vol: 0.16, delay: i * 0.1 })); break;
      case 'fear': this.tone(392, 0.9, { type: 'triangle', vol: 0.14, slide: 0.94 }); this.tone(466, 0.9, { type: 'triangle', vol: 0.1 }); break;
      case 'fearCard': [294, 349, 415].forEach((f, i) => this.tone(f, 1.0, { type: 'triangle', vol: 0.14, delay: i * 0.12 })); break;
      case 'shield': this.tone(660, 0.6, { type: 'sine', vol: 0.15, slide: 1.5 }); break;
      case 'heal': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.4, { type: 'sine', vol: 0.12, delay: i * 0.08 })); break;
      case 'whoosh': this.noise(0.4, { vol: 0.3, freq: 1200, type: 'bandpass', q: 0.6 }); break;
      case 'banner': this.tone(196, 0.6, { type: 'triangle', vol: 0.18 }); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.9, { type: 'triangle', vol: 0.2, delay: i * 0.15 })); break;
      case 'lose': [330, 262, 196].forEach((f, i) => this.tone(f, 1.0, { type: 'triangle', vol: 0.2, delay: i * 0.25 })); break;
      default: break;
    }
  }
}

export class Effects {
  constructor(b3) {
    this.b3 = b3;
    this.scene = b3.scene;
    this.sound = new Sound();
    this.t = 0;
    this.shakeAmt = 0;
    this.layer = document.getElementById('fx-layer');
    this.flashEl = document.getElementById('screen-flash');
    this.bannerEl = document.getElementById('banner');

    // 火花(加算合成の点)
    const N = 1200;
    this.N = N;
    this.sp = { pos: new Float32Array(N * 3), col: new Float32Array(N * 3), base: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N), next: 0 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sp.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.sp.col, 3));
    this.sparkPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);

    // 破片(小さな立方体)
    const D = 260;
    this.D = D;
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: '#ffffff' }), D);
    this.debrisMesh.frustumCulled = false;
    this.debris = Array.from({ length: D }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), s: 1 }));
    this.debrisNext = 0;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < D; i++) { this.debrisMesh.setMatrixAt(i, m); this.debrisMesh.setColorAt(i, new THREE.Color('#fff')); }
    this.debrisMesh.castShadow = true;
    this.scene.add(this.debrisMesh);

    this.items = []; // 輪・柱・ドーム・飛ぶ光
    this.texts = [];
    this.ringGeo = new THREE.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2);
    this.pillarGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 16, 1, true).translate(0, 0.5, 0);
    this.domeGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.glowTex = b3.assets.glowTex;
  }

  landPos(id, dy = 0) {
    const s = this.b3.slots[id][0];
    return new THREE.Vector3(s.x, s.y + dy, s.z);
  }

  // ---------- 部品 ----------
  sparks(pos, count, color, o = {}) {
    const { speed = 4, up = 2, grav = 6, life = 0.9, spread = 0.3 } = o;
    const c = new THREE.Color(color);
    const sp = this.sp;
    for (let n = 0; n < count; n++) {
      const i = sp.next; sp.next = (sp.next + 1) % this.N;
      sp.pos[i * 3] = pos.x + (Math.random() - 0.5) * spread;
      sp.pos[i * 3 + 1] = pos.y + Math.random() * spread;
      sp.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      sp.vel[i * 3] = Math.cos(a) * r;
      sp.vel[i * 3 + 1] = up + Math.random() * up;
      sp.vel[i * 3 + 2] = Math.sin(a) * r;
      const k = 0.7 + Math.random() * 0.5;
      sp.base[i * 3] = c.r * k; sp.base[i * 3 + 1] = c.g * k; sp.base[i * 3 + 2] = c.b * k;
      sp.max[i] = sp.life[i] = life * (0.6 + Math.random() * 0.6);
      sp.grav[i] = grav;
    }
  }

  shatter(pos, color, count = 14, power = 1) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.debrisNext; this.debrisNext = (this.debrisNext + 1) % this.D;
      const d = this.debris[i];
      d.p.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.3 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.4);
      const a = Math.random() * Math.PI * 2, r = (1.5 + Math.random() * 3) * power;
      d.v.set(Math.cos(a) * r, (3 + Math.random() * 4) * power, Math.sin(a) * r);
      d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      d.s = 0.6 + Math.random() * 1.0;
      d.max = d.life = 1.0 + Math.random() * 0.6;
      this.debrisMesh.setColorAt(i, c.clone().multiplyScalar(0.8 + Math.random() * 0.4));
    }
    this.debrisMesh.instanceColor.needsUpdate = true;
  }

  ring(pos, color, maxR = 3, dur = 0.8, y = 0.15) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pos.x, pos.y + y, pos.z);
    this.scene.add(mesh);
    this.items.push({ mesh, start: this.t, dur, update: k => { mesh.scale.setScalar(0.2 + ease.outCubic(k) * maxR); mat.opacity = (1 - k) * 0.9; } });
  }

  pillar(pos, color, h = 7, dur = 1.2, w = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.pillarGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({ mesh, start: this.t, dur, update: k => {
      mesh.scale.set(w * (1 - k * 0.6), h * ease.outCubic(Math.min(1, k * 3)), w * (1 - k * 0.6));
      mat.opacity = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.55;
    } });
  }

  dome(pos, color, r = 2.2, dur = 1.6) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
    const mesh = new THREE.Mesh(this.domeGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({ mesh, start: this.t, dur, update: k => {
      mesh.scale.setScalar(r * ease.outBack(Math.min(1, k * 2.5)));
      mesh.rotation.y = k * 2;
      mat.opacity = (k < 0.7 ? 0.6 : (1 - k) / 0.3 * 0.6);
    } });
  }

  // 放物線を描いて飛ぶ光
  arc(from, to, color, dur = 0.6, height = 3, trail = true) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.setScalar(1.6);
    this.scene.add(sp);
    const a = from.clone(), b = to.clone();
    const mid = a.clone().lerp(b, 0.5); mid.y = Math.max(a.y, b.y) + height;
    const p = new THREE.Vector3();
    this.items.push({ mesh: sp, start: this.t, dur, update: k => {
      const e = ease.outCubic(k), u = 1 - e;
      p.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(mid, 2 * u * e).addScaledVector(b, e * e);
      sp.position.copy(p);
      if (trail) this.sparks(p, 2, color, { speed: 0.4, up: 0.2, grav: 1, life: 0.4, spread: 0.1 });
    }, done: () => this.sparks(b, 14, color, { speed: 2.5, up: 1.5, life: 0.6 }) });
  }

  text(id, text, kind = '', delay = 0, dy = 2.2) {
    const el = document.createElement('div');
    el.className = 'fx-text ' + kind;
    el.textContent = text;
    el.style.animationDelay = delay + 'ms';
    this.layer.appendChild(el);
    const jitter = (this.texts.filter(t => t.id === id && this.t - t.start < 1).length) * 0.9;
    this.texts.push({ el, id, start: this.t + delay / 1000, pos: this.landPos(id, dy + jitter) });
  }

  banner(text, sub, kind) {
    const b = this.bannerEl;
    b.className = '';
    b.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
    void b.offsetWidth;
    b.className = 'show ' + (kind || '');
  }

  flash(kind) {
    const f = this.flashEl;
    f.className = '';
    void f.offsetWidth;
    f.className = 'on ' + kind;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  // ---------- ゲームのできごとごとの演出 ----------
  handle(kind, d) {
    const P = id => this.landPos(id, 0.4);
    switch (kind) {
      case 'damage': {
        const p = P(d.land);
        this.sparks(p, 26 + d.amount * 8, '#ffcf8a', { speed: 4, up: 3 });
        this.ring(p, '#ffb070', 1.6 + d.amount * 0.4, 0.6);
        this.text(d.land, `${d.amount}ダメージ`, 'dmg');
        this.shake(0.12 + d.amount * 0.05);
        this.sound.play('hit');
        break;
      }
      case 'ravage': {
        const p = P(d.land);
        this.ring(p, '#ff4a3a', 4.5, 0.9);
        this.ring(p, '#ff8a5a', 3, 0.7, 0.4);
        this.sparks(p, 70, '#ff5a40', { speed: 5, up: 3.5 });
        this.text(d.land, `襲撃 ダメージ${d.amount}`, 'bad', 0, 2.8);
        this.flash('ravage');
        this.shake(0.55);
        this.sound.play('ravage');
        break;
      }
      case 'build': {
        const p = P(d.land);
        this.ring(p, '#c8a888', 2.2, 0.7, 0.05);
        this.sparks(p, 30, '#d8c0a0', { speed: 2.5, up: 1, grav: 2, life: 1.0, spread: 1 });
        this.text(d.land, d.text, 'bad', 200);
        this.shake(0.15);
        this.sound.play('build');
        break;
      }
      case 'explore': {
        const to = P(d.land);
        const from = to.clone(); from.z += 12; from.y = 0.4; from.x *= 1.15;
        this.arc(from, to, '#ffd27a', 0.7, 2.5);
        this.ring(to, '#ffe48a', 1.8, 0.8);
        this.text(d.land, '探検家が来た', 'bad', 500);
        this.sound.play('explore');
        break;
      }
      case 'blight': {
        const p = P(d.land);
        this.sparks(p, 60, '#b060e0', { speed: 1.4, up: 1.2, grav: -1.2, life: 1.8, spread: 1.4 });
        this.ring(p, '#a050d0', 3, 1.1);
        this.text(d.land, '荒れ地 +1', 'blight', 100);
        this.flash('blight');
        this.sound.play('blight');
        break;
      }
      case 'cascade': {
        this.arc(P(d.from), P(d.to), '#c070ff', 0.55, 3.5);
        this.sound.play('whoosh');
        break;
      }
      case 'fear': {
        const p = d.land != null ? P(d.land) : new THREE.Vector3(0, 3, 0);
        this.sparks(p, 24 * d.n, '#d9a8ff', { speed: 0.8, up: 1.5, grav: -2, life: 1.6, spread: 1.2 });
        if (d.land != null) this.text(d.land, `恐怖 +${d.n}`, 'fear', 150, 3.2);
        this.sound.play('fear');
        this.pulse('#island-panel');
        break;
      }
      case 'fearCard': {
        this.flash('fear');
        this.banner('恐怖カード獲得', '侵略者の手番のはじめに効果が出る', 'fear');
        this.sound.play('fearCard');
        break;
      }
      case 'shield': {
        const p = P(d.land); p.y -= 0.3;
        this.dome(p, '#9fe0ff');
        this.text(d.land, d.text, 'calm');
        this.sound.play('shield');
        break;
      }
      case 'heal': {
        const p = P(d.land);
        this.sparks(p, 40, '#a8f0b0', { speed: 1, up: 2, grav: -0.5, life: 1.4, spread: 1.2 });
        this.ring(p, '#a8f0b0', 2.4, 0.9);
        this.text(d.land, '荒れ地 −1', 'good');
        this.sound.play('heal');
        break;
      }
      case 'counter': {
        const p = P(d.land);
        this.sparks(p, 40, '#fff0d0', { speed: 3, up: 2.5 });
        this.ring(p, '#fff0d0', 2.5, 0.6);
        this.text(d.land, d.text, 'good');
        this.sound.play('hit');
        break;
      }
      case 'power': {
        const p = P(d.land); p.y -= 0.4;
        const col = this.b3.spiritColor || '#9fdcff';
        this.pillar(p, col, 9, 1.3, 1.2);
        this.ring(p, col, 3, 0.9);
        this.sparks(p, 40, col, { speed: 1.5, up: 4, grav: 1, life: 1.2, spread: 1 });
        this.text(d.land, d.text, 'spirit', 0, 3.4);
        this.sound.play('power');
        break;
      }
      case 'text': this.text(d.land, d.text, d.kind, d.delay || 0); break;
      case 'banner': this.banner(d.text, d.sub, d.kind); this.sound.play('banner'); break;
      case 'flash': this.flash(d.kind); break;
      case 'move': this.b3.hintMove(d); break;
      case 'vanish': this.b3.hintVanish(d); break;
      default: break;
    }
  }

  pulse(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }

  // 駒が消えたとき(破壊)
  pieceDestroyed(kind, pos) {
    const p = pos.clone(); p.y += 0.2;
    this.shatter(p, PIECE_COLORS[kind], kind === 'cities' ? 22 : kind === 'towns' ? 16 : 10);
    this.sparks(p, 16, kind === 'presence' ? '#9fdcff' : '#ffd0a0', { speed: 2.5, up: 2 });
    this.sound.play('shatter');
  }
  pieceVanished(kind, pos) {
    this.sparks(pos.clone().setY(pos.y + 0.4), 24, '#f0eaff', { speed: 0.6, up: 1.2, grav: -1.5, life: 1.2, spread: 0.6 });
  }
  pieceAdded(kind, pos) {
    if (kind === 'presence') {
      this.pillar(pos, this.b3.spiritColor || '#9fdcff', 8, 1.4, 0.7);
      this.sparks(pos.clone().setY(pos.y + 0.5), 30, this.b3.spiritColor || '#9fdcff', { speed: 1, up: 3, grav: 0.5, life: 1.4 });
      this.sound.play('presence');
    } else if (kind === 'dahan') {
      this.sparks(pos.clone().setY(pos.y + 0.4), 20, '#fff4d8', { speed: 1, up: 2, grav: 0, life: 1 });
    }
  }

  update(t, dt) {
    this.t = t;
    // 火花
    const sp = this.sp;
    for (let i = 0; i < this.N; i++) {
      if (sp.life[i] <= 0) { sp.col[i * 3] = sp.col[i * 3 + 1] = sp.col[i * 3 + 2] = 0; continue; }
      sp.life[i] -= dt;
      sp.vel[i * 3 + 1] -= sp.grav[i] * dt;
      sp.vel[i * 3] *= 0.97; sp.vel[i * 3 + 2] *= 0.97;
      sp.pos[i * 3] += sp.vel[i * 3] * dt;
      sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt;
      sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
      const f = Math.max(0, sp.life[i] / sp.max[i]);
      sp.col[i * 3] = sp.base[i * 3] * f; sp.col[i * 3 + 1] = sp.base[i * 3 + 1] * f; sp.col[i * 3 + 2] = sp.base[i * 3 + 2] * f;
    }
    this.sparkPts.geometry.attributes.position.needsUpdate = true;
    this.sparkPts.geometry.attributes.color.needsUpdate = true;

    // 破片
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < this.D; i++) {
      const d = this.debris[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= dt;
      d.v.y -= 14 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.1 && d.v.y < 0) { d.p.y = 0.1; d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; }
      const k = Math.max(0, d.life / d.max);
      e.set(d.r.x * t, d.r.y * t, d.r.z * t);
      q.setFromEuler(e);
      s.setScalar(d.life > 0 ? d.s * Math.min(1, k * 2.5) : 0);
      m.compose(d.p, q, s);
      this.debrisMesh.setMatrixAt(i, m);
    }
    if (any || this.debrisDirty) { this.debrisMesh.instanceMatrix.needsUpdate = true; this.debrisDirty = any; }

    // 輪・柱など
    this.items = this.items.filter(it => {
      const k = (t - it.start) / it.dur;
      if (k >= 1) {
        this.scene.remove(it.mesh);
        it.mesh.material.dispose();
        if (it.done) it.done();
        return false;
      }
      it.update(Math.max(0, k));
      return true;
    });

    // 浮かぶ文字
    const w = this.b3.host.clientWidth, h = this.b3.host.clientHeight;
    const v = new THREE.Vector3();
    this.texts = this.texts.filter(tx => {
      const age = t - tx.start;
      if (age > 2.4) { tx.el.remove(); return false; }
      v.copy(tx.pos).project(this.b3.camera);
      const rise = Math.max(0, age) * 28;
      tx.el.style.transform = `translate(-50%,-50%) translate(${Math.round((v.x * 0.5 + 0.5) * w)}px, ${Math.round((-v.y * 0.5 + 0.5) * h - rise)}px)`;
      return true;
    });
  }

  // カメラのゆれ(描く直前に足して、描いたあとに戻す)
  applyShake(camera, dt) {
    if (this.shakeAmt <= 0.001) return null;
    const off = new THREE.Vector3((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt * 0.5);
    camera.position.add(off);
    this.shakeAmt *= Math.pow(0.02, dt);
    return off;
  }
}
