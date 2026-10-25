// 再生エンジン(Web Audio)
// IMAGE.DAT を全部メモリに読み込まず、少しずつ(約0.37秒ずつ)読みながら、すき間なく並べて鳴らす。
(function (root) {
  'use strict';

  const RATE = 44100;
  const CHUNK = 16384; // 1回に読むフレーム数(約0.37秒)
  const START_DELAY = 0.08; // 再生ボタンから音が出るまでの余裕(秒)

  class Player {
    // opts.onEnded() … 最後まで再生したとき / opts.onError(err) … 読み込みに失敗したとき
    constructor(opts = {}) {
      this.onEnded = opts.onEnded || (() => {});
      this.onError = opts.onError || (() => {});
      this.ctx = null;
      this.source = null; // { read(frame, count) → Promise<Uint8Array>, totalFrames, littleEndian }
      this.gen = 0;
      this.playing = false;
      this.anchor = 0; // 止まっているときの位置(フレーム)
      this.chunks = [];
      this.volume = 0.8;
      this.underruns = 0;
      this._pumpGen = null;
      this._timer = null;
      this._tbuf = null;
    }

    setSource(source) {
      this._halt();
      this.source = source;
      this.anchor = 0;
      this.underruns = 0;
    }

    _ensureContext() {
      if (this.ctx) return;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) throw new Error('このブラウザは Web Audio に対応していません');
      try {
        // CD と同じ 44.1kHz で鳴らす(できない環境ではブラウザの標準の周波数に変換される)
        this.ctx = new AC({ sampleRate: RATE, latencyHint: 'playback' });
      } catch (e) {
        this.ctx = new AC();
      }
      const ctx = this.ctx;
      this.input = ctx.createGain();
      this.output = ctx.createGain();
      this.output.gain.value = this.volume * this.volume;
      this.input.connect(this.output);
      this.output.connect(ctx.destination);
      // メーターは音量つまみの前(素材そのもののレベル)で測る
      const splitter = ctx.createChannelSplitter(2);
      this.input.connect(splitter);
      this.analysers = [0, 1].map((ch) => {
        const a = ctx.createAnalyser();
        a.fftSize = 2048;
        splitter.connect(a, ch);
        return a;
      });
      this._tbuf = new Float32Array(2048);
    }

    get outputSampleRate() {
      return this.ctx ? this.ctx.sampleRate : null;
    }

    get position() {
      if (!this.playing || !this.ctx) return this.anchor;
      return this._positionAt(this.ctx.currentTime);
    }

    _positionAt(t) {
      const cs = this.chunks;
      if (!cs.length) return this.nextFrame !== undefined ? this.nextFrame : this.anchor;
      for (const c of cs) {
        if (t < c.t) return c.frame;
        if (t < c.t + c.frames / RATE) return c.frame + Math.floor((t - c.t) * RATE);
      }
      const last = cs[cs.length - 1];
      return last.frame + last.frames;
    }

    play(frame) {
      if (!this.source) return;
      this._ensureContext();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const target = frame !== undefined ? frame : this.anchor;
      this._stopNodes();
      const gen = ++this.gen;
      this.anchor = this._clamp(target);
      this.playing = true;
      this.nextFrame = this.anchor;
      this.nextTime = this.ctx.currentTime + START_DELAY;
      this._startTimer();
      this._pump(gen);
    }

    pause() {
      if (!this.playing) return;
      const pos = this.position;
      this._halt();
      this.anchor = pos;
    }

    seek(frame) {
      if (this.playing) this.play(frame);
      else this.anchor = this._clamp(frame);
    }

    setVolume(v) {
      this.volume = v;
      if (this.ctx) this.output.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.015);
    }

    // [左, 右] の瞬間のピーク(0〜1)
    levels() {
      if (!this.ctx || !this.playing) return [0, 0];
      return this.analysers.map((a) => {
        a.getFloatTimeDomainData(this._tbuf);
        let p = 0;
        for (let i = 0; i < this._tbuf.length; i++) {
          const v = Math.abs(this._tbuf[i]);
          if (v > p) p = v;
        }
        return p;
      });
    }

    _clamp(frame) {
      const total = this.source ? this.source.totalFrames : 0;
      return Math.max(0, Math.min(total, Math.floor(frame)));
    }

    _halt() {
      this.gen++;
      this.playing = false;
      this._stopNodes();
      this._stopTimer();
    }

    _stopNodes() {
      for (const c of this.chunks) {
        c.node.onended = null;
        try {
          c.node.stop();
        } catch (e) {
          /* まだ始まっていない/もう終わった */
        }
        c.node.disconnect();
      }
      this.chunks = [];
    }

    _startTimer() {
      this._stopTimer();
      this._timer = setInterval(() => this._tick(), 100);
    }

    _stopTimer() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    _tick() {
      if (!this.playing) return;
      const t = this.ctx.currentTime;
      // 鳴り終わった分を片付ける
      while (this.chunks.length > 1 && this.chunks[0].t + this.chunks[0].frames / RATE < t - 0.5) {
        this.chunks.shift().node.disconnect();
      }
      const last = this.chunks[this.chunks.length - 1];
      if (this.nextFrame >= this.source.totalFrames && (!last || t >= last.t + last.frames / RATE)) {
        this._halt();
        this.anchor = this.source.totalFrames;
        this.onEnded();
        return;
      }
      this._pump(this.gen);
    }

    async _pump(gen) {
      if (this._pumpGen === gen) return;
      this._pumpGen = gen;
      try {
        const ctx = this.ctx;
        // タブが裏に回るとタイマーが遅くなるので、先読みを長めにする
        const lookahead = typeof document !== 'undefined' && document.hidden ? 6 : 1.5;
        while (gen === this.gen && this.nextFrame < this.source.totalFrames && this.nextTime - ctx.currentTime < lookahead) {
          const start = this.nextFrame;
          const count = Math.min(CHUNK, this.source.totalFrames - start);
          const bytes = await this.source.read(start, count);
          if (gen !== this.gen) return;
          const node = ctx.createBufferSource();
          node.buffer = this._toBuffer(bytes, count);
          node.connect(this.input);
          let t = this.nextTime;
          if (t < ctx.currentTime + 0.01) {
            // 読み込みが間に合わなかった(音切れ)。少し先から鳴らし直す
            if (this.chunks.length) this.underruns++;
            t = ctx.currentTime + 0.03;
          }
          node.onended = () => this._tick();
          node.start(t);
          this.chunks.push({ node, t, frame: start, frames: count });
          this.nextTime = t + count / RATE;
          this.nextFrame = start + count;
        }
      } catch (e) {
        if (gen === this.gen) {
          const pos = this.position;
          this._halt();
          this.anchor = pos;
          this.onError(e);
        }
      } finally {
        if (this._pumpGen === gen) this._pumpGen = null;
      }
    }

    _toBuffer(bytes, count) {
      const buf = this.ctx.createBuffer(2, count, RATE);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const le = this.source.littleEndian;
      for (let i = 0, o = 0; i < count; i++, o += 4) {
        L[i] = dv.getInt16(o, le) / 32768;
        R[i] = dv.getInt16(o + 2, le) / 32768;
      }
      return buf;
    }
  }

  root.DDPPlayer = Player;
})(typeof self !== 'undefined' ? self : this);
