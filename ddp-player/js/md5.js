// MD5(少しずつデータを渡して計算できる版)
// 数百MBある IMAGE.DAT もメモリに全部読み込まずに検証できるようにするため、自前で実装している。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MD5 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const S = new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]);
  const K = new Int32Array(64);
  const G = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    G[i] = i < 16 ? i : i < 32 ? (5 * i + 1) & 15 : i < 48 ? (3 * i + 5) & 15 : (7 * i) & 15;
  }
  const LITTLE_ENDIAN_HOST = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  class MD5 {
    constructor() {
      this.h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
      this.w = new Int32Array(16);
      this.buf = new Uint8Array(64);
      this.bufLen = 0;
      this.length = 0;
    }

    // data: Uint8Array
    update(data) {
      let i = 0;
      const n = data.length;
      this.length += n;
      if (this.bufLen > 0) {
        const take = Math.min(64 - this.bufLen, n);
        this.buf.set(data.subarray(0, take), this.bufLen);
        this.bufLen += take;
        i = take;
        if (this.bufLen < 64) return this;
        this._blockBytes(this.buf, 0);
        this.bufLen = 0;
      }
      const blocks = (n - i) >> 6;
      if (blocks > 0) {
        const off = data.byteOffset + i;
        if (LITTLE_ENDIAN_HOST && off % 4 === 0) {
          // 4バイト境界にそろっていれば、まとめて32bit整数として読む(速い)
          const words = new Int32Array(data.buffer, off, blocks * 16);
          for (let b = 0; b < blocks; b++) this._blockWords(words, b * 16);
        } else {
          for (let b = 0; b < blocks; b++) this._blockBytes(data, i + b * 64);
        }
        i += blocks * 64;
      }
      if (i < n) {
        this.buf.set(data.subarray(i), 0);
        this.bufLen = n - i;
      }
      return this;
    }

    _blockBytes(d, off) {
      const w = this.w;
      for (let j = 0; j < 16; j++, off += 4) {
        w[j] = d[off] | (d[off + 1] << 8) | (d[off + 2] << 16) | (d[off + 3] << 24);
      }
      this._blockWords(w, 0);
    }

    _blockWords(w, base) {
      const h = this.h;
      let a = h[0], b = h[1], c = h[2], d = h[3];
      for (let j = 0; j < 64; j++) {
        let f;
        if (j < 16) f = (b & c) | (~b & d);
        else if (j < 32) f = (d & b) | (~d & c);
        else if (j < 48) f = b ^ c ^ d;
        else f = c ^ (b | ~d);
        const x = (a + f + K[j] + w[base + G[j]]) | 0;
        const s = S[j];
        a = d;
        d = c;
        c = b;
        b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
      }
      h[0] = (h[0] + a) | 0;
      h[1] = (h[1] + b) | 0;
      h[2] = (h[2] + c) | 0;
      h[3] = (h[3] + d) | 0;
    }

    // 16進数32文字で返す(小文字)
    hex() {
      const bits = this.length * 8;
      const pad = new Uint8Array(((this.bufLen < 56 ? 56 : 120) - this.bufLen) + 8);
      pad[0] = 0x80;
      const lo = bits % 4294967296;
      const hi = Math.floor(bits / 4294967296);
      const p = pad.length - 8;
      for (let k = 0; k < 4; k++) {
        pad[p + k] = (lo >>> (8 * k)) & 0xff;
        pad[p + 4 + k] = (hi >>> (8 * k)) & 0xff;
      }
      const len = this.length;
      this.update(pad);
      this.length = len;
      let out = '';
      for (let k = 0; k < 4; k++) {
        for (let s = 0; s < 32; s += 8) out += ((this.h[k] >>> s) & 0xff).toString(16).padStart(2, '0');
      }
      return out;
    }
  }

  return MD5;
});
