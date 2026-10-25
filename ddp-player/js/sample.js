// お試し用のサンプル DDP をブラウザの中で作る(test/make-sample-ddp.js と同じ中身)
// 3曲(サイン波の音)、2曲目の前に2秒のプリギャップ、ISRC・UPC・日本語 CD-TEXT・CHECKSUM.MD5 付き。
(function (root) {
  'use strict';

  const SPS = 75;
  const UPC = '4901234567894';
  const TRACKS = [
    { seconds: 6, freq: 440, isrc: 'JPXX02600001', pregap: 150 },
    { seconds: 5, freq: 660, isrc: 'JPXX02600002', pregap: 150 },
    { seconds: 7, freq: 330, isrc: 'JPXX02600003', pregap: 0 },
  ];
  // 「精霊の島 サウンドトラック / 精霊楽団」ほか(Shift_JIS)。node test/make-sample-ddp.js で作ったもの
  const CDTEXT_BASE64 =
    'gAAAgJC4l+yCzJOHIINUg7CugAABhkWDk4Nog2eDiYNig/yqgAACjE4AAJbplr6Cr4LMk0ODgAEDhIcAAIyOgsyPTQAAgnA0gAMEgNmCvYLpAAAAAAAAALyqgQAFgJC4l+yKeZJjAACQuPQBgQEGgZfsinmSYwAAkLiX7BpigQIHgop5kmMAAINRg1iDZxZOgQMIg4nMjugAAAAAAAAAABKDjwAJAIABAwAFBAAAAAAAAFTBjwEKAAAAAAAAAAADCwAAAM0MjwILAAAAAABpAAAAAAAAAHE0';

  function padField(s, len) {
    s = String(s);
    return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
  }
  function num(n, len) {
    return String(n).padStart(len, '0');
  }
  function asciiBytes(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  }

  function msRecord(type, dsl, dss, sub, cdm, dsi) {
    let r = 'VVVM' + padField(type, 2) + padField('', 8) + num(dsl, 8) + num(dss, 8) + padField(sub, 8) + padField(cdm, 2);
    r += padField(cdm ? '70' : '', 2) + padField('', 4) + padField(cdm ? '0150' : '', 4) + padField('', 4) + '     ' + padField('', 12);
    r += '017' + padField(dsi, 17);
    return padField(r, 128);
  }

  function pqRecord(track, index, sector, isrc, upc) {
    const f = sector % SPS;
    const s = Math.floor(sector / SPS) % 60;
    const m = Math.floor(sector / SPS / 60);
    const r = 'VVVS' + track + num(index, 2) + '00' + num(m, 2) + num(s, 2) + num(f, 2) + '01  ' + padField(isrc || '', 12) + padField(upc || '', 13);
    return padField(r, 64);
  }

  // 返り値: [{ path, file }]
  function build(folder) {
    const layout = [];
    let sector = 150;
    TRACKS.forEach((t, i) => {
      if (i > 0) sector += t.pregap;
      const start = sector;
      sector += t.seconds * SPS;
      layout.push({ ...t, number: i + 1, index0: i === 0 ? 0 : start - t.pregap, start, end: sector });
    });
    const leadout = sector;

    const pcm = new Uint8Array(leadout * 2352);
    const dv = new DataView(pcm.buffer);
    for (const t of layout) {
      for (let f = t.start * 588; f < t.end * 588; f++) {
        const tt = (f - t.start * 588) / 44100;
        dv.setInt16(f * 4, Math.round(Math.sin(2 * Math.PI * t.freq * tt) * 16000), true);
        dv.setInt16(f * 4 + 2, Math.round(Math.sin(2 * Math.PI * t.freq * 1.5 * tt) * 12000), true);
      }
    }

    let pq = pqRecord('00', 0, 0, '', UPC);
    for (const t of layout) {
      if (t.index0 !== t.start || t.number === 1) pq += pqRecord(num(t.number, 2), 0, t.index0, t.isrc, '');
      pq += pqRecord(num(t.number, 2), 1, t.start, t.isrc, '');
    }
    pq += pqRecord('AA', 1, leadout, '', '');
    pq += pqRecord('AA', 1, leadout, '', '');

    const cdtext = Uint8Array.from(atob(CDTEXT_BASE64), (c) => c.charCodeAt(0));
    const ms =
      msRecord('D0', leadout, 0, '', 'DA', 'IMAGE.DAT') +
      msRecord('S0', pq.length, 0, 'PQ DESCR', '', 'PQDESCR') +
      msRecord('S0', cdtext.length, 0, 'CDTEXT', '', 'CDTEXT.BIN');
    const id = padField(padField(padField('DDP 2.00', 8) + UPC, 38) + padField('SAMPLE-MASTER', 48) + ' CD', 128);

    const files = [
      ['DDPID', asciiBytes(id)],
      ['DDPMS', asciiBytes(ms)],
      ['PQDESCR', asciiBytes(pq)],
      ['IMAGE.DAT', pcm],
      ['CDTEXT.BIN', cdtext],
    ];
    const sums = files.map(([name, bytes]) => new root.MD5().update(bytes).hex() + ' *' + name + '\n').join('');
    files.push(['CHECKSUM.MD5', asciiBytes(sums)]);
    return files.map(([name, bytes]) => ({ path: folder + '/' + name, file: new File([bytes], name) }));
  }

  root.DDPSample = { build };
})(typeof self !== 'undefined' ? self : this);
