// 読み取り部分のテスト(依存なし): node test/run.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const DDP = require('../js/ddp.js');
const MD5 = require('../js/md5.js');
const sample = require('./make-sample-ddp.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.log('  NG  ' + name);
    console.log(e.stack);
    process.exitCode = 1;
  }
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-test-'));
}

function load(dir) {
  const read = (n) => new Uint8Array(fs.readFileSync(path.join(dir, n)));
  const ms = DDP.parseDDPMS(read('DDPMS'));
  const id = DDP.parseDDPID(read('DDPID'));
  const pq = DDP.parsePQ(read('PQDESCR'));
  const toc = DDP.buildTOC(pq.entries);
  DDP.finishTracks(toc.tracks, toc.leadout);
  const cd = fs.existsSync(path.join(dir, 'CDTEXT.BIN')) ? DDP.parseCDText(read('CDTEXT.BIN')) : null;
  return { ms, id, pq, toc, cd, read };
}

console.log('DDP 試聴プレーヤーのテスト');

test('MD5 が Node の crypto と一致する(分割して渡しても同じ)', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 1000, 70001]) {
    const d = crypto.randomBytes(n);
    const m = new MD5();
    for (let i = 0; i < n; i += 37) m.update(new Uint8Array(d.buffer, d.byteOffset + i, Math.min(37, n - i)));
    assert.strictEqual(m.hex(), crypto.createHash('md5').update(d).digest('hex'));
  }
});

test('DDPID・DDPMS・PQDESCR を読める', () => {
  const dir = tmp();
  sample.make(dir);
  const { ms, id, pq, toc } = load(dir);
  assert.strictEqual(id.level, 'DDP 2.00');
  assert.strictEqual(id.upc, sample.UPC);
  assert.strictEqual(id.masterId, 'SPIRIT-TEST-MASTER');
  assert.deepStrictEqual(id.warnings, []);
  assert.deepStrictEqual(ms.warnings, []);
  const main = ms.entries.find((e) => e.type === 'D0');
  assert.strictEqual(main.dsi, 'IMAGE.DAT');
  assert.strictEqual(main.cdm, 'DA');
  assert.strictEqual(main.dss, 0);
  assert.ok(ms.entries.some((e) => e.sub === 'PQ DESCR' && e.dsi === 'PQDESCR'));
  assert.ok(ms.entries.some((e) => e.sub === 'CDTEXT' && e.dsi === 'CDTEXT.BIN'));
  assert.deepStrictEqual(pq.warnings, []);
  assert.deepStrictEqual(toc.warnings.filter((w) => w.level !== 'info'), []);
  assert.strictEqual(toc.upc, sample.UPC);
  assert.strictEqual(toc.tracks.length, 3);
  const [t1, t2, t3] = toc.tracks;
  assert.strictEqual(t1.index0, 0);
  assert.strictEqual(t1.start, 150);
  assert.strictEqual(t1.length, 6 * 75);
  assert.strictEqual(t2.index0, 150 + 6 * 75);
  assert.strictEqual(t2.pregap, 150);
  assert.strictEqual(t2.start, 150 + 6 * 75 + 150);
  assert.strictEqual(t3.pregap, 0);
  assert.strictEqual(t3.length, 7 * 75);
  assert.strictEqual(toc.leadout, t3.start + 7 * 75);
  assert.strictEqual(t2.isrc, 'JPXX02600002');
});

test('日本語(Shift_JIS)の CD-TEXT を読める', () => {
  const dir = tmp();
  sample.make(dir);
  const { cd } = load(dir);
  assert.deepStrictEqual(cd.warnings, []);
  assert.strictEqual(cd.charCode, 0x80);
  assert.strictEqual(cd.album.title, sample.ALBUM.title);
  assert.strictEqual(cd.album.performer, sample.ALBUM.performer);
  sample.TRACKS.forEach((t, i) => {
    assert.strictEqual(cd.tracks[i + 1].title, t.title);
    assert.strictEqual(cd.tracks[i + 1].performer, t.performer);
  });
});

test('英字(ISO-8859-1)の CD-TEXT を読める', () => {
  const dir = tmp();
  sample.make(dir, { latin: true });
  const { cd } = load(dir);
  assert.deepStrictEqual(cd.warnings, []);
  assert.strictEqual(cd.album.title, sample.ALBUM.titleLatin);
  assert.strictEqual(cd.tracks[3].title, 'Fireflies');
  assert.strictEqual(cd.tracks[3].performer, 'Guest Singer');
});

test('CD-TEXT の CRC 異常を知らせる', () => {
  const dir = tmp();
  sample.make(dir, { latin: true });
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, 'CDTEXT.BIN')));
  bytes[5] ^= 0xff;
  const cd = DDP.parseCDText(bytes);
  assert.ok(cd.warnings.some((w) => /CRC/.test(w.text)));
});

test('バイト順を自動判定できる(リトル/ビッグ)', () => {
  for (const be of [false, true]) {
    const dir = tmp();
    sample.make(dir, { be });
    const img = new Uint8Array(fs.readFileSync(path.join(dir, 'IMAGE.DAT')));
    const blocks = [];
    for (let i = 0; i < 16; i++) {
      const off = Math.floor(((150 + i * 100) * 2352) / 4) * 4;
      blocks.push(img.subarray(off, off + 8192));
    }
    const r = DDP.detectByteOrder(blocks);
    assert.strictEqual(r.littleEndian, !be);
    assert.strictEqual(r.confidence, 'high');
  }
  assert.strictEqual(DDP.detectByteOrder([new Uint8Array(4096)]).confidence, 'none');
});

test('チェックサムファイルのいろいろな書き方を読める', () => {
  const h = '0123456789abcdef0123456789ABCDEF';
  const sums = DDP.parseChecksums(
    [`${h} *IMAGE.DAT`, `${h}  DDPMS`, `MD5 (PQDESCR) = ${h}`, `sub\\DDPID ${h}`, '; comment', ''].join('\r\n'),
    'CHECKSUM.MD5'
  );
  assert.deepStrictEqual(sums.map((s) => s.name), ['IMAGE.DAT', 'DDPMS', 'PQDESCR', 'DDPID']);
  assert.ok(sums.every((s) => s.md5 === h.toLowerCase()));
  assert.deepStrictEqual(DDP.parseChecksums(h + '\n', 'IMAGE.DAT.md5'), [{ name: 'IMAGE.DAT', md5: h.toLowerCase() }]);
});

test('壊れた PQDESCR・おかしな曲順を知らせる', () => {
  const dir = tmp();
  sample.make(dir);
  const pq = fs.readFileSync(path.join(dir, 'PQDESCR'), 'latin1');
  // 2曲目の INDEX 01 の時刻を1曲目より前にする
  const recs = pq.match(/.{64}/gs);
  const i = recs.findIndex((r) => r.startsWith('VVVS0201'));
  recs[i] = recs[i].slice(0, 8) + '00000010' + recs[i].slice(16);
  const toc = DDP.buildTOC(DDP.parsePQ(new Uint8Array(Buffer.from(recs.join(''), 'latin1'))).entries);
  assert.ok(toc.warnings.some((w) => w.level === 'error'));
  // 改行入りでも読める
  const withNewlines = new Uint8Array(Buffer.from(pq.match(/.{64}/gs).join('\r\n'), 'latin1'));
  const r = DDP.parsePQ(withNewlines);
  assert.strictEqual(r.entries.length, recs.length);
});

test('UPC/EAN と ISRC の形式チェック', () => {
  assert.ok(DDP.isValidEAN13('4901234567894'));
  assert.ok(!DDP.isValidEAN13('4901234567890'));
  assert.ok(DDP.isValidISRC('JPXX02600001'));
  assert.ok(!DDP.isValidISRC('JP-XX0-26-00001'));
});

test('時刻の表示', () => {
  assert.strictEqual(DDP.msf(150), '00:02:00');
  assert.strictEqual(DDP.msf(75 * 61 + 74), '01:01:74');
  assert.strictEqual(DDP.msf(-150), '-00:02:00');
  assert.strictEqual(DDP.clock(65.9), '01:05');
  assert.strictEqual(DDP.clock(-2), '-00:02');
  assert.strictEqual(DDP.clock(3725), '1:02:05');
});

console.log(`\n${passed} 件成功${process.exitCode ? '(失敗あり)' : ''}`);
