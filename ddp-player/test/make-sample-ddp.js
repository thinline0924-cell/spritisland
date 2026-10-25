// テスト用の DDP 2.0 ファイルセットを作る
//   node test/make-sample-ddp.js <出力フォルダ> [--be] [--latin] [--no-cdtext] [--no-md5] [--dss=<セクター>]
// 3曲(サイン波の音)、2曲目の前に2秒のプリギャップ、ISRC・UPC・CD-TEXT・CHECKSUM.MD5 付き。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DDP = require('../js/ddp.js');

const SPS = 75;
const TRACKS = [
  { seconds: 6, freq: 440, title: '夜明けの島', performer: '精霊楽団', titleLatin: 'Dawn Island', performerLatin: 'Spirit Band', isrc: 'JPXX02600001', pregap: 150 },
  { seconds: 5, freq: 660, title: '月の舟', performer: '精霊楽団', titleLatin: 'Moon Boat', performerLatin: 'Spirit Band', isrc: 'JPXX02600002', pregap: 150 },
  { seconds: 7, freq: 330, title: 'ほたる', performer: 'ゲスト歌手', titleLatin: 'Fireflies', performerLatin: 'Guest Singer', isrc: 'JPXX02600003', pregap: 0 },
];
const ALBUM = { title: '精霊の島 サウンドトラック', performer: '精霊楽団', titleLatin: 'Spirit Island OST', performerLatin: 'Spirit Band' };
const UPC = '4901234567894';

function padField(s, len) {
  s = String(s);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}
function num(n, len) {
  return String(n).padStart(len, '0');
}

// Shift_JIS への変換表(Node の TextDecoder を逆に使って作る)
let sjisTable = null;
function encodeSJIS(text) {
  if (!sjisTable) {
    sjisTable = new Map();
    const dec = new TextDecoder('shift_jis');
    const leads = [];
    for (let b = 0x81; b <= 0x9f; b++) leads.push(b);
    for (let b = 0xe0; b <= 0xfc; b++) leads.push(b);
    for (const a of leads) {
      for (let b = 0x40; b <= 0xfc; b++) {
        if (b === 0x7f) continue;
        const ch = dec.decode(new Uint8Array([a, b]));
        if (ch.length === 1 && ch !== '�' && !sjisTable.has(ch)) sjisTable.set(ch, [a, b]);
      }
    }
  }
  const out = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x80) out.push(code);
    else if (sjisTable.has(ch)) out.push(...sjisTable.get(ch));
    else throw new Error('Shift_JIS にできない文字: ' + ch);
  }
  return out;
}

function makeCDText(latin) {
  const charCode = latin ? 0x00 : 0x80;
  const dbcc = !latin;
  const enc = (s) => (latin ? [...Buffer.from(s, 'latin1')] : encodeSJIS(s));
  const term = dbcc ? [0, 0] : [0];
  const packs = [];
  let seq = 0;
  const counts = new Array(16).fill(0);
  function addType(type, strings) {
    // strings: [アルバム, 曲1, 曲2, ...]
    const stream = [];
    const owner = []; // 各バイトがどの曲の文字列か
    const posInString = [];
    strings.forEach((s, t) => {
      const bytes = enc(s).concat(term);
      bytes.forEach((b, k) => {
        stream.push(b);
        owner.push(t);
        posInString.push(dbcc ? k >> 1 : k);
      });
    });
    while (stream.length % 12) {
      stream.push(0);
      owner.push(strings.length - 1);
      posInString.push(0);
    }
    for (let i = 0; i < stream.length; i += 12) {
      const header = [type, owner[i], seq++ & 0xff, ((dbcc ? 1 : 0) << 7) | (0 << 4) | Math.min(posInString[i], 15)];
      packs.push(header.concat(stream.slice(i, i + 12)));
      counts[type - 0x80]++;
    }
  }
  addType(0x80, [latin ? ALBUM.titleLatin : ALBUM.title, ...TRACKS.map((t) => (latin ? t.titleLatin : t.title))]);
  addType(0x81, [latin ? ALBUM.performerLatin : ALBUM.performer, ...TRACKS.map((t) => (latin ? t.performerLatin : t.performer))]);
  counts[0x0f] = 3;
  const info = new Array(36).fill(0);
  info[0] = charCode;
  info[1] = 1;
  info[2] = TRACKS.length;
  for (let i = 0; i < 16; i++) info[4 + i] = counts[i];
  info[20] = seq + 2; // 最後のシーケンス番号(サイズ情報の3パックを含む)
  info[28] = latin ? 0x09 : 0x69; // 言語コード(英語 / 日本語)
  for (let k = 0; k < 3; k++) {
    packs.push([0x8f, k, seq++ & 0xff, 0].concat(info.slice(k * 12, k * 12 + 12)));
  }
  const out = Buffer.alloc(packs.length * 18);
  packs.forEach((p, i) => {
    const b = Buffer.from(p);
    b.copy(out, i * 18);
    const crc = DDP.crc16(b, 0, 16);
    out[i * 18 + 16] = crc >> 8;
    out[i * 18 + 17] = crc & 0xff;
  });
  return out;
}

function msRecord({ type, dsl, dss, sub, cdm, dsi }) {
  let r = 'VVVM' + padField(type, 2) + padField('', 8) + num(dsl, 8) + num(dss, 8) + padField(sub, 8) + padField(cdm, 2);
  r += padField(cdm ? '70' : '', 2) + padField('', 4) + padField(cdm ? '0150' : '', 4) + padField('', 4) + ' ' + '  ' + '  ' + padField('', 12);
  r += padField('017', 3) + padField(dsi, 17);
  return padField(r, 128);
}

function pqRecord(track, index, sector, control, isrc, upc) {
  const f = sector % SPS;
  const s = Math.floor(sector / SPS) % 60;
  const m = Math.floor(sector / SPS / 60);
  let r = 'VVVS' + track + num(index, 2) + '00' + num(m, 2) + num(s, 2) + num(f, 2);
  r += ((control << 4) | 1).toString(16).toUpperCase().padStart(2, '0') + '  ' + padField(isrc || '', 12) + padField(upc || '', 13);
  return padField(r, 64);
}

function make(outDir, opts = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const dss = opts.dss || 0;
  // 音声
  const layout = [];
  let sector = 150; // 1曲目の頭は 00:02:00
  TRACKS.forEach((t, i) => {
    if (i > 0) sector += t.pregap;
    const startSector = sector;
    sector += t.seconds * SPS;
    layout.push({ ...t, number: i + 1, index0: i === 0 ? 0 : startSector - t.pregap, start: startSector, end: sector });
  });
  const leadout = sector;
  const imageSectors = leadout - dss;
  const pcm = Buffer.alloc(imageSectors * DDP.SECTOR_BYTES);
  for (const t of layout) {
    const fromFrame = t.start * 588;
    const toFrame = t.end * 588;
    for (let f = fromFrame; f < toFrame; f++) {
      const pos = (f - dss * 588) * 4;
      if (pos < 0) continue;
      const tt = (f - fromFrame) / 44100;
      const l = Math.round(Math.sin(2 * Math.PI * t.freq * tt) * 16000);
      const r = Math.round(Math.sin(2 * Math.PI * t.freq * 1.5 * tt) * 12000);
      if (opts.be) {
        pcm.writeInt16BE(l, pos);
        pcm.writeInt16BE(r, pos + 2);
      } else {
        pcm.writeInt16LE(l, pos);
        pcm.writeInt16LE(r, pos + 2);
      }
    }
  }
  if (opts.fullScale) {
    // 3曲目の途中にフルスケールのサンプルを入れる
    const pos = (layout[2].start * 588 + 1000 - dss * 588) * 4;
    pcm.writeInt16LE(32767, pos);
    pcm.writeInt16LE(-32768, pos + 4);
  }
  fs.writeFileSync(path.join(outDir, 'IMAGE.DAT'), pcm);

  // PQDESCR
  let pq = pqRecord('00', 0, 0, 0, '', UPC);
  for (const t of layout) {
    if (t.index0 !== t.start || t.number === 1) pq += pqRecord(num(t.number, 2), 0, t.index0, 0, t.isrc, '');
    pq += pqRecord(num(t.number, 2), 1, t.start, 0, t.isrc, '');
  }
  pq += pqRecord('AA', 1, leadout, 0, '', '');
  pq += pqRecord('AA', 1, leadout, 0, '', '');
  fs.writeFileSync(path.join(outDir, 'PQDESCR'), pq, 'latin1');

  // CD-TEXT
  let cdtext = null;
  if (!opts.noCdtext) {
    cdtext = makeCDText(!!opts.latin);
    fs.writeFileSync(path.join(outDir, 'CDTEXT.BIN'), cdtext);
  }

  // DDPMS
  let ms = msRecord({ type: 'D0', dsl: imageSectors, dss, sub: '', cdm: 'DA', dsi: 'IMAGE.DAT' });
  ms += msRecord({ type: 'S0', dsl: pq.length, dss: 0, sub: 'PQ DESCR', cdm: '', dsi: 'PQDESCR' });
  if (cdtext) ms += msRecord({ type: 'S0', dsl: cdtext.length, dss: 0, sub: 'CDTEXT', cdm: '', dsi: 'CDTEXT.BIN' });
  fs.writeFileSync(path.join(outDir, 'DDPMS'), ms, 'latin1');

  // DDPID
  let id = padField('DDP 2.00', 8) + padField(UPC, 13);
  id = padField(id, 38) + padField('SPIRIT-TEST-MASTER', 48) + ' ' + 'CD';
  fs.writeFileSync(path.join(outDir, 'DDPID'), padField(id, 128), 'latin1');

  // CHECKSUM.MD5
  if (!opts.noMd5) {
    const names = ['DDPID', 'DDPMS', 'PQDESCR', 'IMAGE.DAT'].concat(cdtext ? ['CDTEXT.BIN'] : []);
    const lines = names.map((n) => crypto.createHash('md5').update(fs.readFileSync(path.join(outDir, n))).digest('hex') + ' *' + n + '\n');
    fs.writeFileSync(path.join(outDir, 'CHECKSUM.MD5'), lines.join(''));
  }
  return { layout, leadout, imageSectors };
}

module.exports = { make, TRACKS, ALBUM, UPC };

if (require.main === module) {
  const args = process.argv.slice(2);
  const out = args.find((a) => !a.startsWith('--'));
  if (!out) {
    console.error('使い方: node test/make-sample-ddp.js <出力フォルダ> [--be] [--latin] [--no-cdtext] [--no-md5] [--dss=<セクター>]');
    process.exit(1);
  }
  const dssArg = args.find((a) => a.startsWith('--dss='));
  const r = make(out, {
    be: args.includes('--be'),
    latin: args.includes('--latin'),
    noCdtext: args.includes('--no-cdtext'),
    noMd5: args.includes('--no-md5'),
    fullScale: args.includes('--full-scale'),
    dss: dssArg ? parseInt(dssArg.slice(6), 10) : 0,
  });
  console.log(`作成しました: ${out}(${r.layout.length}曲、リードアウト ${DDP.msf(r.leadout)})`);
}
