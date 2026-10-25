// DDP 2.0(CDマスター)ファイルセットの読み取り
// ブラウザでも Node.js(テスト)でも動くように、ファイル操作はせずバイト列だけを扱う。
//
// ファイルセットの中身
//   DDPID    … DDP のバージョン(DDP 2.00)・UPC/EAN など(128バイト)
//   DDPMS    … どのファイルに何が入っているかの一覧(128バイト × 件数)
//   PQDESCR  … 曲番号・インデックス・時刻・ISRC(64バイト × 件数)
//   IMAGE.DAT… 音声そのもの(44.1kHz / 16bit / ステレオ、1セクター = 2352バイト = 588フレーム)
//   CDTEXT.BIN … CD-TEXT(18バイトのパック × 件数、任意)
//   *.MD5    … チェックサム(任意)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DDP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SECTOR_BYTES = 2352;
  const FRAMES_PER_SECTOR = 588;
  const SECTORS_PER_SECOND = 75;
  const SAMPLE_RATE = 44100;
  const BYTES_PER_FRAME = 4;

  // ---------- 小さな道具 ----------

  function ascii(bytes, start, len) {
    let s = '';
    const end = Math.min(bytes.length, start + len);
    for (let i = start; i < end; i++) {
      const c = bytes[i];
      s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
    }
    return s;
  }

  function field(bytes, start, len) {
    return ascii(bytes, start, len).trim();
  }

  function toInt(s) {
    return /^\d+$/.test(s) ? parseInt(s, 10) : null;
  }

  function warn(text) {
    return { level: 'warn', text };
  }
  function error(text) {
    return { level: 'error', text };
  }
  function info(text) {
    return { level: 'info', text };
  }

  // セクター数 → "MM:SS:FF"(CD の時刻表記。FF は 1/75 秒)
  function msf(sectors) {
    const neg = sectors < 0;
    let s = Math.abs(Math.round(sectors));
    const f = s % SECTORS_PER_SECOND;
    s = Math.floor(s / SECTORS_PER_SECOND);
    const sec = s % 60;
    const min = Math.floor(s / 60);
    return (neg ? '-' : '') + pad2(min) + ':' + pad2(sec) + ':' + pad2(f);
  }

  // 秒 → "M:SS"(1時間以上は "H:MM:SS")
  function clock(seconds) {
    const neg = seconds < 0;
    let s = Math.floor(Math.abs(seconds));
    const sec = s % 60;
    s = Math.floor(s / 60);
    const min = s % 60;
    const h = Math.floor(s / 60);
    const body = h > 0 ? h + ':' + pad2(min) + ':' + pad2(sec) : pad2(min) + ':' + pad2(sec);
    return (neg ? '-' : '') + body;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isValidISRC(s) {
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s);
  }

  function isValidEAN13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (s.charCodeAt(i) - 48) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === s.charCodeAt(12) - 48;
  }

  function isBlankCode(s) {
    return !s || /^0+$/.test(s);
  }

  // ---------- DDPID ----------
  // 0-7 DDP レベル / 8-20 UPC・EAN / 38-85 マスターID / 87-88 ディスクの種類
  function parseDDPID(bytes) {
    const warnings = [];
    const level = field(bytes, 0, 8);
    const upc = field(bytes, 8, 13);
    const masterId = field(bytes, 38, 48);
    const discType = field(bytes, 87, 2);
    const valid = /^DDP\s*2\.0/i.test(level);
    if (bytes.length < 128) warnings.push(warn(`DDPID が ${bytes.length} バイトしかありません(本来は128バイト)`));
    if (!valid) warnings.push(warn(`DDPID のバージョン表記が「${level || '空'}」です(DDP 2.0x ではありません)`));
    if (!isBlankCode(upc) && !isValidEAN13(upc)) warnings.push(warn(`DDPID の UPC/EAN「${upc}」のチェックデジットが合いません`));
    return { level, upc: isBlankCode(upc) ? '' : upc, masterId, discType, valid, warnings };
  }

  // ---------- DDPMS ----------
  // 1件128バイト。主な項目:
  //   0-3 "VVVM" / 4-5 種類(D0=音声などの本体, S0=サブコード) / 14-21 長さ / 22-29 開始セクター
  //   30-37 サブコードの種類("PQ DESCR", "CDTEXT") / 38-39 CD モード("DA"=音楽CD)
  //   59-70 ISRC / 74- ファイル名
  function parseDDPMS(bytes) {
    const entries = [];
    const warnings = [];
    if (bytes.length === 0) {
      warnings.push(error('DDPMS が空です'));
      return { entries, warnings };
    }
    if (bytes.length % 128 !== 0) {
      warnings.push(warn(`DDPMS の大きさ(${bytes.length} バイト)が128の倍数ではありません`));
    }
    for (let off = 0, n = 1; off + 128 <= bytes.length; off += 128, n++) {
      if (ascii(bytes, off, 4) !== 'VVVM') {
        warnings.push(warn(`DDPMS の ${n} 件目が "VVVM" で始まっていないため無視しました`));
        continue;
      }
      const dsiLong = field(bytes, off + 74, 54);
      entries.push({
        type: field(bytes, off + 4, 2).toUpperCase(),
        dsp: toInt(field(bytes, off + 6, 8)),
        dsl: toInt(field(bytes, off + 14, 8)),
        dss: toInt(field(bytes, off + 22, 8)),
        sub: field(bytes, off + 30, 8),
        cdm: field(bytes, off + 38, 2).toUpperCase(),
        trk: toInt(field(bytes, off + 55, 2)),
        isrc: field(bytes, off + 59, 12),
        dsi: field(bytes, off + 74, 17),
        dsiLong: dsiLong.split(/\s+/)[0] || '',
      });
    }
    if (!entries.length) warnings.push(error('DDPMS に読める記録がありません'));
    return { entries, warnings };
  }

  // ---------- PQDESCR ----------
  // 1件64バイト。
  //   0-3 "VVVS" / 4-5 曲番号("00"=リードイン, "AA"=リードアウト) / 6-7 インデックス
  //   8-9 時 / 10-11 分 / 12-13 秒 / 14-15 フレーム(ディスクの先頭からの時刻)
  //   16-17 コントロール・ADR(16進) / 20-31 ISRC / 32-44 UPC/EAN
  function parsePQ(bytes) {
    const warnings = [];
    const entries = [];
    let offsets = [];
    for (let off = 0; off + 64 <= bytes.length; off += 64) {
      if (ascii(bytes, off, 4) === 'VVVS') offsets.push(off);
    }
    if (bytes.length % 64 !== 0 || offsets.length !== bytes.length / 64) {
      // 64バイトごとに並んでいない(改行が入っているなど)ときは、"VVVS" を探して読む
      const scanned = [];
      for (let i = 0; i + 64 <= bytes.length; i++) {
        if (bytes[i] === 0x56 && ascii(bytes, i, 4) === 'VVVS') {
          scanned.push(i);
          i += 63;
        }
      }
      if (scanned.length > offsets.length) {
        warnings.push(warn('PQDESCR の記録が64バイトごとに並んでいません(読める部分だけ読みました)'));
        offsets = scanned;
      } else if (bytes.length % 64 !== 0) {
        warnings.push(warn(`PQDESCR の大きさ(${bytes.length} バイト)が64の倍数ではありません`));
      }
    }
    for (const off of offsets) {
      const track = field(bytes, off + 4, 2).toUpperCase();
      const indexText = field(bytes, off + 6, 2);
      const hh = field(bytes, off + 8, 2);
      const mm = toInt(field(bytes, off + 10, 2));
      const ss = toInt(field(bytes, off + 12, 2));
      const ff = toInt(field(bytes, off + 14, 2));
      const hours = hh === '' ? 0 : toInt(hh);
      const index = toInt(indexText);
      if (hours === null || mm === null || ss === null || ff === null || index === null) {
        warnings.push(warn(`PQDESCR の記録(曲 ${track || '?'})の時刻か番号が読めないため無視しました`));
        continue;
      }
      if (ss > 59 || ff > 74) warnings.push(warn(`PQDESCR の時刻 ${pad2(mm)}:${pad2(ss)}:${pad2(ff)} は正しくありません(曲 ${track})`));
      const ctrlAdr = parseInt(field(bytes, off + 16, 2), 16);
      entries.push({
        track,
        index,
        sector: ((hours * 60 + mm) * 60 + ss) * SECTORS_PER_SECOND + ff,
        control: isNaN(ctrlAdr) ? 0 : (ctrlAdr >> 4) & 0x0f,
        isrc: field(bytes, off + 20, 12).toUpperCase(),
        upc: field(bytes, off + 32, 13),
      });
    }
    if (!entries.length) warnings.push(error('PQDESCR に読める記録がありません'));
    return { entries, warnings };
  }

  // PQ の記録を曲ごとにまとめる
  // 返す曲の情報(単位はセクター):
  //   index0 … プリギャップの始まり(なければ start と同じ)
  //   start  … INDEX 01(曲の頭)
  //   end    … 次の曲のプリギャップの始まり、最後の曲ならリードアウト
  function buildTOC(entries) {
    const warnings = [];
    const byNumber = new Map();
    let leadout = null;
    let upc = '';
    for (const e of entries) {
      if (e.track === 'AA') {
        if (leadout === null) leadout = e.sector;
        else if (leadout !== e.sector) warnings.push(warn(`リードアウトの位置が2通り書かれています(${msf(leadout)} と ${msf(e.sector)})`));
        continue;
      }
      if (!/^\d\d$/.test(e.track)) {
        warnings.push(warn(`PQDESCR に読めない曲番号「${e.track}」があります`));
        continue;
      }
      const n = parseInt(e.track, 10);
      if (n === 0) {
        if (!isBlankCode(e.upc)) upc = e.upc;
        continue;
      }
      let t = byNumber.get(n);
      if (!t) {
        t = { number: n, indices: {}, isrc: '', control: null };
        byNumber.set(n, t);
      }
      if (t.indices[e.index] !== undefined && t.indices[e.index] !== e.sector) {
        warnings.push(warn(`曲 ${n} の INDEX ${pad2(e.index)} が2通り書かれています`));
      }
      if (t.indices[e.index] === undefined) t.indices[e.index] = e.sector;
      if (e.isrc && !t.isrc) t.isrc = e.isrc;
      if (t.control === null || e.index === 1) t.control = e.control;
    }

    const tracks = [...byNumber.values()].sort((a, b) => a.number - b.number);
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const idx = Object.keys(t.indices).map(Number).sort((a, b) => a - b);
      if (t.indices[1] === undefined) {
        warnings.push(error(`曲 ${t.number} に INDEX 01(曲の頭)がありません`));
        t.start = t.indices[idx.find((k) => k >= 1) ?? idx[0]];
      } else {
        t.start = t.indices[1];
      }
      t.index0 = t.indices[0] !== undefined ? Math.min(t.indices[0], t.start) : t.start;
      t.indexList = idx.map((k) => ({ index: k, sector: t.indices[k] }));
      for (let k = 1; k < t.indexList.length; k++) {
        if (t.indexList[k].sector < t.indexList[k - 1].sector) {
          warnings.push(warn(`曲 ${t.number} のインデックスの時刻が逆順になっています`));
          break;
        }
      }
      t.control = t.control || 0;
      t.preemphasis = (t.control & 0x1) !== 0;
      t.copyPermitted = (t.control & 0x2) !== 0;
      t.data = (t.control & 0x4) !== 0;
      if (i > 0 && t.number !== tracks[i - 1].number + 1) {
        warnings.push(warn(`曲番号が ${tracks[i - 1].number} から ${t.number} に飛んでいます`));
      }
      if (t.isrc && !isValidISRC(t.isrc)) warnings.push(warn(`曲 ${t.number} の ISRC「${t.isrc}」の形式が正しくありません`));
      if (t.preemphasis) warnings.push(info(`曲 ${t.number} はプリエンファシス付きです(この試聴ではディエンファシスをかけずに再生します)`));
      if (t.data) warnings.push(warn(`曲 ${t.number} はデータトラックの印が付いているため、無音にして再生します`));
    }
    for (let i = 1; i < tracks.length; i++) {
      if (tracks[i].index0 < tracks[i - 1].start) {
        warnings.push(error(`曲 ${tracks[i].number} の位置が、前の曲 ${tracks[i - 1].number} より前になっています`));
      }
    }
    if (tracks.length) {
      const last = tracks[tracks.length - 1];
      if (leadout === null) warnings.push(warn('PQDESCR にリードアウト(AA)がありません。音声データの終わりまでを最後の曲とします'));
      else if (leadout <= last.start) warnings.push(error('リードアウトが最後の曲の頭より前にあります'));
      if (tracks.length > 99) warnings.push(error('曲数が99を超えています'));
      if (tracks[0].number !== 1) warnings.push(warn(`最初の曲番号が ${tracks[0].number} です(ふつうは1)`));
      if (tracks[0].start < 150) warnings.push(warn(`1曲目の頭が ${msf(tracks[0].start)} です(ふつうは 00:02:00 以降)`));
    }
    return { tracks, leadout, upc, warnings };
  }

  // 曲の終わり(セクター)を決める。leadout が分からないときは音声データの終わりを使う
  function finishTracks(tracks, endSector) {
    const warnings = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const next = tracks[i + 1];
      t.end = next ? Math.max(next.index0, t.start) : Math.max(endSector, t.start);
      t.pregap = t.start - t.index0;
      t.length = t.end - t.start;
      if (t.length < 4 * SECTORS_PER_SECOND) {
        warnings.push(warn(`曲 ${t.number} の長さが ${msf(t.length)} です(CD の規格では4秒以上)`));
      }
    }
    return warnings;
  }

  // ---------- CD-TEXT ----------
  const CDTEXT_TYPES = {
    0x80: 'title',
    0x81: 'performer',
    0x82: 'songwriter',
    0x83: 'composer',
    0x84: 'arranger',
    0x85: 'message',
    0x8e: 'code',
  };

  function crc16(bytes, off, len) {
    let crc = 0;
    for (let i = off; i < off + len; i++) {
      crc ^= bytes[i] << 8;
      for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc ^ 0xffff;
  }

  function makeDecoder(charCode) {
    const label = charCode === 0x80 ? 'shift_jis' : charCode === 0x01 ? 'us-ascii' : 'iso-8859-1';
    try {
      return new TextDecoder(label);
    } catch (e) {
      return new TextDecoder('iso-8859-1');
    }
  }

  // 1つの言語ブロック(ブロック0)の文字だけを読む
  function parseCDText(bytes) {
    const warnings = [];
    let start = 0;
    if (bytes.length % 18 === 4) start = 4; // 先頭に4バイトの長さ情報が付いている形式
    const count = Math.floor((bytes.length - start) / 18);
    if ((bytes.length - start) % 18 !== 0) warnings.push(warn('CDTEXT.BIN の大きさが18バイトの倍数ではありません'));

    const packs = [];
    let badCrc = 0;
    for (let i = 0; i < count; i++) {
      const off = start + i * 18;
      const type = bytes[off];
      if (type < 0x80 || type > 0x8f) continue;
      const stored = (bytes[off + 16] << 8) | bytes[off + 17];
      if (stored !== crc16(bytes, off, 16)) badCrc++;
      packs.push({
        type,
        track: bytes[off + 1] & 0x7f,
        dbcc: (bytes[off + 3] & 0x80) !== 0,
        block: (bytes[off + 3] >> 4) & 0x07,
        text: bytes.subarray(off + 4, off + 16),
        raw: bytes.subarray(off, off + 16),
      });
    }
    if (badCrc) warnings.push(warn(`CD-TEXT の ${badCrc} 個のパックで CRC が合いません`));

    // 文字コード(サイズ情報パック 0x8F の最初のバイト)
    let charCode = 0x00;
    const size = packs.find((p) => p.type === 0x8f && p.block === 0 && p.track === 0);
    if (size) charCode = size.text[0];
    const decoder = makeDecoder(charCode);

    const result = { album: {}, tracks: {}, charCode, warnings };
    const block0 = packs.filter((p) => p.block === 0);
    for (const type of Object.keys(CDTEXT_TYPES).map(Number)) {
      const list = block0.filter((p) => p.type === type);
      if (!list.length) continue;
      const key = CDTEXT_TYPES[type];
      const dbcc = list[0].dbcc;
      const stream = new Uint8Array(list.length * 12);
      list.forEach((p, i) => stream.set(p.text, i * 12));
      const dec = type === 0x8e ? makeDecoder(0x00) : decoder;
      let track = list[0].track;
      let prev = '';
      let i = 0;
      while (i < stream.length && track <= 99) {
        // 文字列の区切りは NUL(2バイト文字のときは NUL NUL)
        let j = i;
        while (j < stream.length && stream[j] !== 0) j++;
        if (j >= stream.length) break; // 終わりの NUL がない残りは使わない
        const piece = stream.subarray(i, j);
        const isTab = piece.length > 0 && piece.every((c) => c === 0x09); // TAB は「前の曲と同じ」
        const text = isTab ? prev : dec.decode(piece).trim();
        if (text) {
          const target = track === 0 ? result.album : (result.tracks[track] = result.tracks[track] || {});
          if (target[key] === undefined) target[key] = text;
        }
        prev = text;
        track++;
        i = j + 1;
        if (dbcc && i < stream.length && stream[i] === 0) i++;
      }
    }
    return result;
  }

  // ---------- チェックサムファイル ----------
  // 次の書き方に対応:
  //   <md5> *IMAGE.DAT / <md5>  IMAGE.DAT / MD5 (IMAGE.DAT) = <md5> / IMAGE.DAT <md5>
  //   IMAGE.DAT.MD5 のように中身が <md5> だけのもの
  function parseChecksums(text, fileName) {
    const sums = [];
    const lines = text.replace(/^﻿/, '').split(/\r?\n|\r/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line[0] === ';' || line[0] === '#') continue;
      let m = line.match(/^MD5\s*\((.+)\)\s*=\s*([0-9a-fA-F]{32})$/i);
      if (m) {
        sums.push({ name: baseName(m[1]), md5: m[2].toLowerCase() });
        continue;
      }
      m = line.match(/^([0-9a-fA-F]{32})\s+\*?(.+)$/);
      if (m) {
        sums.push({ name: baseName(m[2].trim()), md5: m[1].toLowerCase() });
        continue;
      }
      m = line.match(/^(.+?)\s+\*?([0-9a-fA-F]{32})$/);
      if (m) {
        sums.push({ name: baseName(m[1].trim()), md5: m[2].toLowerCase() });
        continue;
      }
      m = line.match(/^([0-9a-fA-F]{32})$/);
      if (m && fileName && /\.md5$/i.test(fileName) && fileName.length > 4) {
        sums.push({ name: baseName(fileName.slice(0, -4)), md5: m[1].toLowerCase() });
      }
    }
    return sums;
  }

  function baseName(p) {
    return p.replace(/^["']|["']$/g, '').split(/[\\/]/).pop();
  }

  // ---------- バイト順の自動判定 ----------
  // 本物の音は隣りあうサンプルの差が小さく、バイト順を取り違えると雑音のように差が大きくなる。
  // blocks: 音声データのあちこちから切り出した Uint8Array の配列
  function detectByteOrder(blocks) {
    let le = 0;
    let be = 0;
    let samples = 0;
    for (const b of blocks) {
      const n = b.length >> 1;
      for (let i = 2; i < n; i++) {
        const o = i * 2;
        const p = o - 4; // 同じチャンネルの1つ前のサンプル
        const l1 = (b[o] | (b[o + 1] << 8)) << 16 >> 16;
        const l0 = (b[p] | (b[p + 1] << 8)) << 16 >> 16;
        const b1 = ((b[o] << 8) | b[o + 1]) << 16 >> 16;
        const b0 = ((b[p] << 8) | b[p + 1]) << 16 >> 16;
        le += Math.abs(l1 - l0);
        be += Math.abs(b1 - b0);
        samples++;
      }
    }
    if (samples === 0 || (le === 0 && be === 0)) return { littleEndian: true, confidence: 'none', ratio: 1 };
    const ratio = (Math.max(le, be) + 1) / (Math.min(le, be) + 1);
    const littleEndian = le <= be;
    const confidence = ratio > 4 ? 'high' : ratio > 1.5 ? 'medium' : 'low';
    return { littleEndian, confidence, ratio };
  }

  return {
    SECTOR_BYTES,
    FRAMES_PER_SECTOR,
    SECTORS_PER_SECOND,
    SAMPLE_RATE,
    BYTES_PER_FRAME,
    msf,
    clock,
    parseDDPID,
    parseDDPMS,
    parsePQ,
    buildTOC,
    finishTracks,
    parseCDText,
    parseChecksums,
    detectByteOrder,
    isValidISRC,
    isValidEAN13,
    crc16,
  };
});
