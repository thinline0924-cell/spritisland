// 画面とファイルの読み込み
(function () {
  'use strict';

  const { SECTOR_BYTES, FRAMES_PER_SECTOR, SAMPLE_RATE, msf, clock } = DDP;
  const $ = (id) => document.getElementById(id);
  const HASH_CHUNK = 4 * 1024 * 1024;

  const state = {
    disc: null,
    player: null,
    analysisToken: 0,
    peakHold: [0, 0],
    peakHoldAt: [0, 0],
    overUntil: [0, 0],
    stopAt: null, // 「1曲ずつ止める」のときに止める位置(フレーム)
    seekPreview: null,
  };

  // ---------- ファイルを読む ----------

  function readBytes(file, start, end) {
    const blob = file.slice(start, end);
    if (blob.arrayBuffer) return blob.arrayBuffer().then((b) => new Uint8Array(b));
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(r.error || new Error('読み込みに失敗しました'));
      r.readAsArrayBuffer(blob);
    });
  }

  function readAll(file) {
    return readBytes(file, 0, file.size);
  }

  function readText(file) {
    return readAll(file).then((b) => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(b);
      } catch (e) {
        return new TextDecoder('iso-8859-1').decode(b);
      }
    });
  }

  const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);
  const dirName = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

  function listFromInput(fileList) {
    return [...fileList].map((f) => ({ path: f.webkitRelativePath || f.name, file: f }));
  }

  async function listFromDrop(dt) {
    // webkitGetAsEntry は await の前に呼ぶ必要がある
    const entries = [...(dt.items || [])].map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entries.length) return listFromInput(dt.files || []);
    const out = [];
    async function walk(entry, prefix) {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        out.push({ path: prefix + entry.name, file });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const child of batch) await walk(child, prefix + entry.name + '/');
        }
      }
    }
    for (const e of entries) await walk(e, '');
    return out;
  }

  // 一覧の中から DDP のファイルセット(DDPMS があるフォルダ)を探す
  function pickFileset(list) {
    const ddpms = list.filter((x) => baseName(x.path).toUpperCase() === 'DDPMS').sort((a, b) => a.path.localeCompare(b.path));
    if (!ddpms.length) {
      if (list.some((x) => /\.zip$/i.test(x.path))) {
        throw new Error('ZIP ファイルのままでは開けません。展開(解凍)してから、中のフォルダを開いてください。');
      }
      throw new Error('DDPMS が見つかりません。DDP のファイル(DDPID・DDPMS・PQDESCR・IMAGE.DAT など)が入ったフォルダを開いてください。');
    }
    const dir = dirName(ddpms[0].path);
    const files = new Map();
    for (const x of list) {
      if (dirName(x.path) === dir) files.set(baseName(x.path).toUpperCase(), { name: baseName(x.path), file: x.file });
    }
    return { dir, files, others: ddpms.slice(1).map((x) => dirName(x.path) || '(最上位)') };
  }

  // ---------- DDP を組み立てる ----------

  async function buildDisc(set) {
    const diags = [];
    const get = (name) => (name ? set.files.get(name.toUpperCase()) : undefined);
    if (set.others.length) {
      diags.push({ level: 'info', text: `DDP が複数見つかったので「${set.dir || '(最上位)'}」を開きました(ほかに: ${set.others.join('、')})` });
    }

    const ms = DDP.parseDDPMS(await readAll(get('DDPMS').file));
    diags.push(...ms.warnings);
    if (!ms.entries.length) throw new Error('DDPMS の中身が読めません。ファイルが壊れている可能性があります。');

    let ddpid = null;
    if (get('DDPID')) {
      ddpid = DDP.parseDDPID(await readAll(get('DDPID').file));
      diags.push(...ddpid.warnings);
    } else {
      diags.push({ level: 'warn', text: 'DDPID がありません' });
    }

    const findStream = (entry, fallback) => {
      if (entry) {
        for (const n of [entry.dsi, entry.dsiLong]) if (get(n)) return get(n);
      }
      return get(fallback);
    };

    // PQ(曲の位置)
    const pqEntry = ms.entries.find((e) => /PQ/i.test(e.sub) || /^PQDESCR$/i.test(e.dsi));
    const pqRef = findStream(pqEntry, 'PQDESCR');
    if (!pqRef) throw new Error('PQDESCR(曲の位置の情報)が見つかりません。');
    const pq = DDP.parsePQ(await readAll(pqRef.file));
    diags.push(...pq.warnings);
    const toc = DDP.buildTOC(pq.entries);
    diags.push(...toc.warnings);
    if (!toc.tracks.length) throw new Error('PQDESCR に曲の情報がありません。');

    // 音声データ
    const segments = [];
    for (const m of ms.entries.filter((e) => e.type.startsWith('D'))) {
      const ref = findStream(m, null);
      if (!ref) {
        diags.push({ level: 'error', text: `音声データ「${m.dsi || '(名前なし)'}」が見つかりません` });
        continue;
      }
      if (m.cdm && m.cdm !== 'DA') diags.push({ level: 'warn', text: `「${ref.name}」の CD モードが「${m.cdm}」です(音楽CD は DA)` });
      segments.push(makeSegment(ref, m.dss || 0, diags));
    }
    if (!segments.length) {
      const dats = [...set.files.values()].filter((f) => /\.DAT$/i.test(f.name));
      if (dats.length === 1) {
        diags.push({ level: 'warn', text: `DDPMS に音声データの記録がないため「${dats[0].name}」を使います` });
        segments.push(makeSegment(dats[0], 0, diags));
      } else {
        throw new Error('音声データ(IMAGE.DAT)が見つかりません。');
      }
    }
    segments.sort((a, b) => a.startSector - b.startSector);
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].startSector < segments[i - 1].startSector + segments[i - 1].sectors) {
        diags.push({ level: 'warn', text: `音声データ「${segments[i - 1].name}」と「${segments[i].name}」の範囲が重なっています` });
      }
    }
    const imageStart = segments[0].startSector;
    const imageEnd = Math.max(...segments.map((s) => s.startSector + s.sectors));
    const endSector = toc.leadout !== null ? toc.leadout : imageEnd;
    diags.push(...DDP.finishTracks(toc.tracks, endSector));
    if (imageEnd < endSector) {
      diags.push({ level: 'error', text: `音声データがリードアウトより ${msf(endSector - imageEnd)} 短くなっています(足りない部分は無音で再生します)` });
    } else if (imageEnd > endSector) {
      diags.push({ level: 'info', text: `リードアウトの後ろに ${msf(imageEnd - endSector)} の音声データがあります(CD には入らないので再生しません)` });
    }
    if (imageStart > toc.tracks[0].start) {
      diags.push({ level: 'error', text: `音声データが 1曲目の頭(${msf(toc.tracks[0].start)})より後ろの ${msf(imageStart)} から始まっています` });
    }
    if (endSector > 80 * 60 * 75) diags.push({ level: 'warn', text: `全体の長さが ${msf(endSector)} あり、80分の CD-R にも入りません` });
    else if (endSector > 79 * 60 * 75 + 57 * 75) diags.push({ level: 'warn', text: `全体の長さが ${msf(endSector)} あり、CD の規格の上限(79:57)を超えています` });

    // CD-TEXT
    let cdtext = null;
    const ctEntry = ms.entries.find((e) => /CDTEXT/i.test(e.sub) || /CDTEXT/i.test(e.dsi));
    const ctRef = findStream(ctEntry, 'CDTEXT.BIN');
    if (ctRef) {
      cdtext = DDP.parseCDText(await readAll(ctRef.file));
      diags.push(...cdtext.warnings);
    } else if (ctEntry) {
      diags.push({ level: 'warn', text: `DDPMS に書かれている CD-TEXT「${ctEntry.dsi}」が見つかりません` });
    }

    // チェックサム
    const sums = new Map();
    const checksumFiles = [];
    for (const [key, ref] of set.files) {
      if (/\.MD5$/.test(key) || /^CHECKSUM/.test(key) || key === 'MD5SUM' || key === 'MD5SUMS') {
        if (ref.file.size > 1024 * 1024) continue;
        checksumFiles.push(key);
        for (const s of DDP.parseChecksums(await readText(ref.file), ref.name)) {
          const k = s.name.toUpperCase();
          if (sums.has(k) && sums.get(k).md5 !== s.md5) diags.push({ level: 'warn', text: `「${s.name}」のチェックサムが2通り書かれています` });
          if (!sums.has(k)) sums.set(k, { md5: s.md5, from: ref.name });
        }
      }
    }

    const tracks = toc.tracks.map((t) => {
      const text = (cdtext && cdtext.tracks[t.number]) || {};
      return Object.assign(t, {
        title: text.title || '',
        performer: text.performer || '',
        startFrame: t.start * FRAMES_PER_SECTOR,
        endFrame: t.end * FRAMES_PER_SECTOR,
        index0Frame: t.index0 * FRAMES_PER_SECTOR,
        peak: null,
        fullScale: 0,
      });
    });

    const upc = (ddpid && ddpid.upc) || toc.upc || '';
    if (ddpid && ddpid.upc && toc.upc && ddpid.upc !== toc.upc) {
      diags.push({ level: 'warn', text: `DDPID の UPC/EAN(${ddpid.upc})と PQDESCR の UPC/EAN(${toc.upc})が違います` });
    }

    const disc = {
      dir: set.dir,
      files: set.files,
      ddpid,
      tracks,
      upc,
      cdtext,
      segments,
      leadout: endSector,
      totalFrames: endSector * FRAMES_PER_SECTOR,
      sums,
      checksumFiles,
      diags,
      byteOrder: null,
      littleEndian: true,
    };
    disc.byteOrder = await detectByteOrder(disc);
    disc.littleEndian = disc.byteOrder.littleEndian;
    if (disc.byteOrder.confidence === 'low') {
      diags.push({ level: 'warn', text: 'バイト順をはっきり判定できませんでした。雑音のように聞こえたら「バイト順」を切りかえてください' });
    } else if (!disc.littleEndian) {
      diags.push({ level: 'info', text: '音声データはビッグエンディアン(上位バイトが先)と判定しました' });
    }
    return disc;
  }

  function makeSegment(ref, startSector, diags) {
    const size = ref.file.size;
    if (size % SECTOR_BYTES !== 0) {
      diags.push({ level: 'warn', text: `「${ref.name}」の大きさ(${size.toLocaleString()} バイト)が 2352 の倍数ではありません` });
    }
    return { name: ref.name, file: ref.file, startSector, sectors: Math.floor(size / SECTOR_BYTES), frames: Math.floor(size / 4), size };
  }

  // frame から count フレーム分の PCM(16bit ステレオ)を読む。音声データのない所は無音
  async function readFrames(disc, frame, count) {
    const out = new Uint8Array(count * 4);
    const a = frame;
    const b = frame + count;
    for (const seg of disc.segments) {
      const s = seg.startSector * FRAMES_PER_SECTOR;
      const lo = Math.max(a, s);
      const hi = Math.min(b, s + seg.frames);
      if (lo >= hi) continue;
      const bytes = await readBytes(seg.file, (lo - s) * 4, (hi - s) * 4);
      out.set(bytes.subarray(0, Math.min(bytes.length, (hi - lo) * 4)), (lo - a) * 4);
    }
    for (const t of disc.tracks) {
      if (!t.data) continue;
      const lo = Math.max(a, t.index0Frame);
      const hi = Math.min(b, t.endFrame);
      if (lo < hi) out.fill(0, (lo - a) * 4, (hi - a) * 4);
    }
    return out;
  }

  async function detectByteOrder(disc) {
    const from = disc.tracks[0].startFrame;
    const to = disc.totalFrames;
    const blocks = [];
    const n = 32;
    const len = 4096;
    for (let i = 0; i < n; i++) {
      const f = Math.floor(from + ((to - from - len) * (i + 0.5)) / n);
      if (f < 0 || f + len > to) continue;
      blocks.push(await readFrames(disc, f, len));
    }
    return DDP.detectByteOrder(blocks);
  }

  // ---------- 開く ----------

  async function open(list, opts = {}) {
    hideMessage();
    let set;
    try {
      set = pickFileset(list);
    } catch (e) {
      showMessage(e.message);
      return;
    }
    state.analysisToken++;
    stop();
    showMessage('読み込んでいます…', 'info');
    try {
      const disc = await buildDisc(set);
      disc.sample = !!opts.sample;
      state.disc = disc;
      state.player.setSource({
        read: (f, c) => readFrames(disc, f, c),
        totalFrames: disc.totalFrames,
        littleEndian: disc.littleEndian,
      });
      state.player.anchor = disc.tracks[0].startFrame;
      hideMessage();
      render();
      analyze(disc);
    } catch (e) {
      console.error(e);
      showMessage(e.message || String(e));
    }
  }

  // ---------- 検証(MD5 とピーク) ----------

  async function analyze(disc) {
    const token = ++state.analysisToken;
    const targets = [];
    const seen = new Set();
    // 音声データを最初に(時間がかかるので進み具合が分かるように)
    const order = [...disc.segments.map((s) => s.name.toUpperCase()), 'DDPID', 'DDPMS', 'PQDESCR', 'CDTEXT.BIN'];
    for (const k of order.concat([...disc.files.keys()].sort())) {
      if (seen.has(k) || !disc.files.has(k) || disc.checksumFiles.includes(k)) continue;
      seen.add(k);
      const ref = disc.files.get(k);
      targets.push({ key: k, name: ref.name, file: ref.file, size: ref.file.size, md5: null, done: 0, status: 'wait' });
    }
    for (const [k, s] of disc.sums) {
      if (!disc.files.has(k)) targets.push({ key: k, name: k, file: null, size: null, md5: null, done: 0, status: 'missing', expected: s.md5 });
    }
    for (const t of targets) if (t.expected === undefined) t.expected = disc.sums.has(t.key) ? disc.sums.get(t.key).md5 : null;
    disc.verify = { targets, running: true };
    for (const t of disc.tracks) {
      t.peak = null;
      t.fullScale = 0;
    }
    renderVerify();

    const total = targets.reduce((n, t) => n + (t.size || 0), 0);
    let doneBytes = 0;
    let lastPaint = 0;
    try {
      for (const t of targets) {
        if (!t.file) continue;
        t.status = 'run';
        const seg = disc.segments.find((s) => s.name.toUpperCase() === t.key);
        const peaks = seg ? makePeakCounter(disc, seg) : null;
        const md5 = new MD5();
        for (let pos = 0; pos < t.size; pos += HASH_CHUNK) {
          const bytes = await readBytes(t.file, pos, Math.min(t.size, pos + HASH_CHUNK));
          if (token !== state.analysisToken) return;
          md5.update(bytes);
          if (peaks) peaks.feed(bytes, pos);
          t.done = pos + bytes.length;
          doneBytes += bytes.length;
          const now = performance.now();
          if (now - lastPaint > 200) {
            lastPaint = now;
            renderVerify(doneBytes / total);
            if (peaks) renderPeaks();
          }
          await new Promise((r) => setTimeout(r, 0));
        }
        t.md5 = md5.hex();
        t.status = t.expected ? (t.md5 === t.expected ? 'ok' : 'ng') : 'none';
        if (peaks) peaks.finish();
      }
    } catch (e) {
      if (token !== state.analysisToken) return;
      const t = targets.find((x) => x.status === 'run');
      if (t) t.status = 'error';
      disc.diags.push({ level: 'error', text: `検証中にファイルを読めなくなりました: ${e.message || e}` });
    }
    if (token !== state.analysisToken) return;
    disc.verify.running = false;
    renderVerify(1);
    renderPeaks();
    renderDiagnostics();
  }

  function makePeakCounter(disc, seg) {
    const tracks = disc.tracks;
    const segStart = seg.startSector * FRAMES_PER_SECTOR;
    const acc = tracks.map(() => ({ peak: 0, fs: 0, seen: false }));
    const le = disc.littleEndian;
    return {
      feed(bytes, bytePos) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const n = bytes.length >> 2;
        let f = segStart + (bytePos >> 2);
        let ti = 0;
        while (ti < tracks.length && f >= tracks[ti].endFrame) ti++;
        for (let i = 0; i < n; i++, f++) {
          while (ti < tracks.length && f >= tracks[ti].endFrame) ti++;
          if (ti >= tracks.length) break;
          const t = tracks[ti];
          if (f < t.startFrame || t.data) continue;
          const a = acc[ti];
          a.seen = true;
          const l = dv.getInt16(i * 4, le);
          const r = dv.getInt16(i * 4 + 2, le);
          const al = l < 0 ? -l : l;
          const ar = r < 0 ? -r : r;
          if (al > a.peak) a.peak = al;
          if (ar > a.peak) a.peak = ar;
          if (al >= 32767) a.fs++;
          if (ar >= 32767) a.fs++;
        }
        acc.forEach((a, k) => {
          if (a.seen) {
            tracks[k].peak = a.peak;
            tracks[k].fullScale = a.fs;
          }
        });
      },
      finish() {
        acc.forEach((a, k) => {
          if (a.fs > 0) {
            disc.diags.push({ level: 'warn', text: `曲 ${tracks[k].number} にフルスケール(0 dBFS)のサンプルが ${a.fs.toLocaleString()} 個あります(クリップの可能性)` });
          }
        });
      },
    };
  }

  // ---------- 再生の操作 ----------

  function currentTrackAt(frame) {
    const tracks = state.disc.tracks;
    let cur = tracks[0];
    for (const t of tracks) {
      if (frame >= t.index0Frame) cur = t;
      else break;
    }
    return cur;
  }

  function indexAt(track, frame) {
    const sector = Math.floor(frame / FRAMES_PER_SECTOR);
    if (sector < track.start) return 0;
    let idx = 1;
    for (const x of track.indexList) if (x.index >= 1 && x.sector <= sector) idx = x.index;
    return idx;
  }

  function trackHeadFrame(t) {
    return $('o-pregap').checked ? t.index0Frame : t.startFrame;
  }

  function playTrack(t) {
    if (!state.disc) return;
    setStopAt(t);
    state.player.play(trackHeadFrame(t));
    updatePlayButton();
  }

  function setStopAt(t) {
    state.stopAt = $('o-single').checked && t ? t.endFrame : null;
  }

  function togglePlay() {
    if (!state.disc) return;
    const p = state.player;
    if (p.playing) {
      p.pause();
    } else {
      let pos = p.position;
      if (pos >= state.disc.totalFrames) pos = state.disc.tracks[0].startFrame;
      setStopAt(currentTrackAt(pos));
      p.play(pos);
    }
    updatePlayButton();
  }

  function stop() {
    if (!state.player) return;
    state.player.pause();
    if (state.disc) state.player.anchor = state.disc.tracks[0].startFrame;
    state.stopAt = null;
    updatePlayButton();
  }

  function seekTo(frame) {
    if (!state.disc) return;
    frame = Math.max(0, Math.min(state.disc.totalFrames - 1, Math.floor(frame)));
    if (state.player.playing) setStopAt(currentTrackAt(frame));
    state.player.seek(frame);
  }

  function nudge(seconds) {
    if (!state.disc) return;
    seekTo(state.player.position + seconds * SAMPLE_RATE);
  }

  function step(dir) {
    if (!state.disc) return;
    const tracks = state.disc.tracks;
    const pos = state.player.position;
    const cur = currentTrackAt(pos);
    const i = tracks.indexOf(cur);
    let target;
    if (dir < 0) {
      // 曲の頭から3秒以上たっていれば、その曲の頭へ
      target = pos - cur.startFrame > 3 * SAMPLE_RATE ? cur : tracks[Math.max(0, i - 1)];
    } else {
      if (i + 1 >= tracks.length) return;
      target = tracks[i + 1];
    }
    if (state.player.playing) playTrack(target);
    else state.player.seek(trackHeadFrame(target));
  }

  function updatePlayButton() {
    const playing = state.player && state.player.playing;
    const b = $('b-play');
    b.classList.toggle('is-playing', !!playing);
    b.setAttribute('aria-label', playing ? '一時停止' : '再生');
  }

  // ---------- 表示 ----------

  function showMessage(text, kind) {
    const m = $('message');
    m.textContent = text;
    m.className = 'message ' + (kind || 'error');
    m.hidden = false;
  }

  function hideMessage() {
    $('message').hidden = true;
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      }
    }
    for (const c of children || []) if (c !== null && c !== undefined) e.append(c);
    return e;
  }

  function seconds(sectors) {
    return clock(sectors / 75);
  }

  function render() {
    const d = state.disc;
    $('disc').hidden = false;
    $('loader').classList.add('compact');
    const album = (d.cdtext && d.cdtext.album) || {};
    $('album-title').textContent = album.title || 'タイトルなし(CD-TEXT なし)';
    $('album-artist').textContent = album.performer || '';
    $('folder-name').textContent = 'フォルダ: ' + (d.dir || '(選んだファイル)');
    $('sample-note').hidden = !d.sample;

    const meta = $('disc-meta');
    meta.textContent = '';
    const first = d.tracks[0];
    const add = (k, v, extra) => {
      meta.append(el('dt', { text: k }), el('dd', null, [v, extra]));
    };
    add('曲数', d.tracks.length + ' 曲');
    add('全体の長さ', seconds(d.leadout - first.start) + '(' + msf(d.leadout - first.start) + ')');
    add('UPC / EAN', d.upc || 'なし');
    add('DDP', (d.ddpid && d.ddpid.level) || '不明');
    if (d.ddpid && d.ddpid.masterId) add('マスター ID', d.ddpid.masterId);
    add('CD-TEXT', d.cdtext ? (d.cdtext.charCode === 0x80 ? 'あり(日本語 MS-JIS)' : 'あり') : 'なし');
    const sel = el('select', { id: 'byte-order', 'aria-label': 'バイト順', onchange: onByteOrderChange }, [
      el('option', { value: 'le', text: 'リトルエンディアン' }),
      el('option', { value: 'be', text: 'ビッグエンディアン' }),
    ]);
    sel.value = d.littleEndian ? 'le' : 'be';
    const conf = { high: '自動判定', medium: '自動判定・やや不確か', low: '自動判定・不確か', none: '無音のため判定できず' }[d.byteOrder.confidence];
    add('バイト順', sel, el('span', { class: 'hint', text: ' ' + conf }));
    add('出力', el('span', { id: 'out-rate', text: '再生すると表示' }));

    // シークバーの曲の印
    const marks = $('seek-marks');
    marks.textContent = '';
    for (const t of d.tracks) {
      const left = (t.startFrame / d.totalFrames) * 100;
      if (t.pregap > 0) {
        marks.append(el('div', { class: 'gap', style: `left:${(t.index0Frame / d.totalFrames) * 100}%;width:${((t.startFrame - t.index0Frame) / d.totalFrames) * 100}%` }));
      }
      marks.append(el('div', { class: 'mark', style: `left:${left}%`, title: `${t.number}. ${t.title || ''}` }, [el('span', { text: String(t.number) })]));
    }

    // 曲の一覧
    const rows = $('track-rows');
    rows.textContent = '';
    for (const t of d.tracks) {
      const flags = [];
      if (t.preemphasis) flags.push(el('span', { class: 'tag', text: 'プリエンファシス' }));
      if (t.data) flags.push(el('span', { class: 'tag bad', text: 'データ' }));
      const tr = el('tr', { 'data-track': t.number, tabindex: '0', title: 'クリックで再生' }, [
        el('td', { class: 'c-no' }, [el('span', { class: 'num', text: String(t.number).padStart(2, '0') })]),
        el('td', { class: 'c-title' }, [
          el('div', { class: 't-title', text: t.title || `トラック ${t.number}` }),
          t.performer ? el('div', { class: 't-artist', text: t.performer }) : null,
          ...flags,
        ]),
        el('td', { class: 'c-num mono', text: msf(t.start) }),
        el('td', { class: 'c-num mono', text: seconds(t.length), title: msf(t.length) }),
        el('td', { class: 'c-num mono', text: t.pregap ? msf(t.pregap) : '—' }),
        el('td', { class: 'mono', text: t.isrc || '—' }),
        el('td', { class: 'c-num mono c-peak', text: '…' }),
      ]);
      tr.addEventListener('click', () => playTrack(t));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') playTrack(t);
      });
      rows.append(tr);
    }
    $('leadout').textContent = msf(d.leadout);
    renderDiagnostics();
    renderVerify();
  }

  function renderPeaks() {
    const d = state.disc;
    if (!d) return;
    const rows = $('track-rows').children;
    d.tracks.forEach((t, i) => {
      const cell = rows[i] && rows[i].querySelector('.c-peak');
      if (!cell) return;
      if (t.peak === null) {
        cell.textContent = d.verify && d.verify.running ? '…' : '—';
        return;
      }
      const db = t.peak === 0 ? '-∞' : (20 * Math.log10(t.peak / 32768)).toFixed(1);
      cell.textContent = db + ' dB';
      cell.classList.toggle('bad', t.fullScale > 0);
      cell.title = t.fullScale > 0 ? `フルスケールのサンプル ${t.fullScale.toLocaleString()} 個` : '';
    });
  }

  function renderVerify(ratio) {
    const d = state.disc;
    if (!d || !d.verify) return;
    const v = d.verify;
    const rows = $('file-rows');
    rows.textContent = '';
    for (const t of v.targets) {
      let status;
      let cls = '';
      switch (t.status) {
        case 'wait':
          status = '待機中';
          break;
        case 'run':
          status = `計算中 ${t.size ? Math.floor((t.done / t.size) * 100) : 0}%`;
          break;
        case 'ok':
          status = '一致';
          cls = 'ok';
          break;
        case 'ng':
          status = '不一致';
          cls = 'bad';
          break;
        case 'none':
          status = 'チェックサムの記載なし';
          cls = 'muted';
          break;
        case 'missing':
          status = 'ファイルがありません';
          cls = 'bad';
          break;
        default:
          status = '読み込みエラー';
          cls = 'bad';
      }
      rows.append(
        el('tr', null, [
          el('td', { class: 'mono', text: t.name }),
          el('td', { class: 'c-num mono', text: t.size === null ? '—' : t.size.toLocaleString() }),
          el('td', { class: 'mono hash', text: t.md5 || '' , title: t.expected ? '記載されている値: ' + t.expected : '' }),
          el('td', { class: 'status ' + cls, text: status }),
        ])
      );
    }
    const ok = v.targets.filter((t) => t.status === 'ok').length;
    const bad = v.targets.filter((t) => t.status === 'ng' || t.status === 'missing' || t.status === 'error').length;
    const listed = v.targets.filter((t) => t.expected).length;
    const sum = $('verify-summary');
    if (v.running) {
      sum.textContent = 'チェックサムとピークを計算しています… (再生はそのままできます)';
      sum.className = 'verify-summary';
    } else if (bad) {
      sum.textContent = `${bad} 個のファイルに問題があります。DDP を受け取り直してください。`;
      sum.className = 'verify-summary bad';
    } else if (listed) {
      sum.textContent = `チェックサムが ${ok} 個すべて一致しました(${d.checksumFiles.join('、')})`;
      sum.className = 'verify-summary ok';
    } else {
      sum.textContent = 'チェックサムのファイル(.md5)がないため、照合はしていません。MD5 は計算済みです。';
      sum.className = 'verify-summary muted';
    }
    $('verify-bar').style.width = (v.running ? (ratio || 0) * 100 : 100) + '%';
  }

  function renderDiagnostics() {
    const d = state.disc;
    const ul = $('diagnostics');
    ul.textContent = '';
    const order = { error: 0, warn: 1, info: 2 };
    const list = d.diags.slice().sort((a, b) => order[a.level] - order[b.level]);
    if (!list.length) ul.append(el('li', { class: 'ok', text: '気になる点は見つかりませんでした' }));
    const label = { error: 'エラー', warn: '注意', info: '情報' };
    for (const x of list) ul.append(el('li', { class: x.level }, [el('span', { class: 'lv', text: label[x.level] }), x.text]));
  }

  function onByteOrderChange(e) {
    const d = state.disc;
    d.littleEndian = e.target.value === 'le';
    state.player.source.littleEndian = d.littleEndian;
    if (state.player.playing) state.player.seek(state.player.position);
    d.diags = d.diags.filter((x) => !/フルスケール/.test(x.text));
    analyze(d);
  }

  // 再生位置などの表示を更新する(毎フレーム)
  function tick() {
    requestAnimationFrame(tick);
    const d = state.disc;
    if (!d) return;
    const p = state.player;
    let pos = p.position;

    if (state.stopAt !== null && p.playing && pos >= state.stopAt) {
      p.pause();
      p.anchor = state.stopAt;
      pos = state.stopAt;
      state.stopAt = null;
      updatePlayButton();
    }

    const shown = state.seekPreview !== null ? state.seekPreview : pos;
    const t = currentTrackAt(shown);
    const idx = indexAt(t, shown);
    const rel = (shown - t.startFrame) / SAMPLE_RATE;
    $('d-track').textContent = String(t.number).padStart(2, '0');
    $('d-index').textContent = String(idx).padStart(2, '0');
    // プリギャップの中では、CD プレーヤーと同じく曲の頭までの残りを「-」で表示する
    $('d-time').textContent = rel < 0 ? '-' + clock(Math.ceil(-rel)) : clock(rel);
    $('d-remain').textContent = '-' + clock(Math.max(0, (t.endFrame - shown) / SAMPLE_RATE));
    $('d-disc').textContent = msf(Math.floor(shown / FRAMES_PER_SECTOR));
    $('d-title').textContent = [t.title || `トラック ${t.number}`, t.performer].filter(Boolean).join(' / ');
    const pct = (shown / d.totalFrames) * 100;
    $('seek-fill').style.width = pct + '%';
    $('seek-head').style.left = pct + '%';
    $('seek').setAttribute('aria-valuemax', String(Math.floor(d.totalFrames / SAMPLE_RATE)));
    $('seek').setAttribute('aria-valuenow', String(Math.floor(shown / SAMPLE_RATE)));
    $('seek').setAttribute('aria-valuetext', `曲 ${t.number}、${clock(rel)}`);

    const rows = $('track-rows').children;
    for (const r of rows) r.classList.toggle('current', Number(r.dataset.track) === t.number);

    if (p.outputSampleRate) {
      const rate = p.outputSampleRate;
      $('out-rate').textContent = rate === SAMPLE_RATE ? '44.1 kHz(変換なし)' : `${rate / 1000} kHz に変換して再生`;
      $('out-rate').className = rate === SAMPLE_RATE ? '' : 'warn-text';
    }
    updateMeters(p.levels());
  }

  function dbToPct(db) {
    // -60〜0 dBFS を 0〜100% に
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  }

  function updateMeters(levels) {
    const now = performance.now();
    ['l', 'r'].forEach((ch, i) => {
      const v = levels[i];
      const db = v > 0 ? 20 * Math.log10(v) : -Infinity;
      $('m-' + ch).style.left = dbToPct(db) + '%';
      if (v >= state.peakHold[i] || now - state.peakHoldAt[i] > 1500) {
        state.peakHold[i] = v;
        state.peakHoldAt[i] = now;
      }
      const hold = state.peakHold[i];
      const holdDb = hold > 0 ? 20 * Math.log10(hold) : -Infinity;
      $('mp-' + ch).style.left = dbToPct(holdDb) + '%';
      $('mt-' + ch).textContent = holdDb === -Infinity || holdDb < -99 ? '-∞' : holdDb.toFixed(1);
      if (v >= 0.99997) state.overUntil[i] = now + 2000;
      $('mo-' + ch).classList.toggle('on', now < state.overUntil[i]);
    });
  }

  // ---------- シークバー ----------

  function setupSeek() {
    const bar = $('seek');
    const tip = $('seek-tip');
    const frameAt = (e) => {
      const r = bar.querySelector('.seek-track').getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      return Math.floor(x * state.disc.totalFrames);
    };
    const showTip = (e, frame) => {
      const t = currentTrackAt(frame);
      tip.textContent = `${t.number}  ${clock((frame - t.startFrame) / SAMPLE_RATE)}`;
      const r = bar.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(r.width, e.clientX - r.left)) + 'px';
      tip.hidden = false;
    };
    let dragging = false;
    bar.addEventListener('pointerdown', (e) => {
      if (!state.disc || e.button !== 0) return;
      dragging = true;
      bar.setPointerCapture(e.pointerId);
      state.seekPreview = frameAt(e);
      showTip(e, state.seekPreview);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!state.disc) return;
      const f = frameAt(e);
      if (dragging) state.seekPreview = f;
      showTip(e, f);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      const f = state.seekPreview;
      state.seekPreview = null;
      if (f !== null && e.type === 'pointerup') seekTo(f);
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    bar.addEventListener('pointerleave', () => {
      if (!dragging) tip.hidden = true;
    });
  }

  // ---------- 起動 ----------

  function setup() {
    state.player = new DDPPlayer({
      onEnded: () => {
        state.stopAt = null;
        if (state.disc) state.player.anchor = state.disc.tracks[0].startFrame;
        updatePlayButton();
      },
      onError: (e) => {
        updatePlayButton();
        showMessage('音声データを読めなくなりました。ファイルが移動・削除されていないか確かめて、もう一度開いてください。(' + (e.message || e) + ')');
      },
    });

    $('pick-dir').addEventListener('change', (e) => {
      if (e.target.files.length) open(listFromInput(e.target.files));
      e.target.value = '';
    });
    $('open-sample').addEventListener('click', openSample);
    $('pick-files').addEventListener('change', (e) => {
      if (e.target.files.length) open(listFromInput(e.target.files));
      e.target.value = '';
    });

    // ドラッグ&ドロップ(画面のどこでも)
    let depth = 0;
    const overlay = $('drop-overlay');
    window.addEventListener('dragenter', (e) => {
      if (![...(e.dataTransfer.types || [])].includes('Files')) return;
      e.preventDefault();
      depth++;
      overlay.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      try {
        const list = await listFromDrop(e.dataTransfer);
        if (list.length) open(list);
      } catch (err) {
        showMessage('ドロップされたファイルを読めませんでした: ' + (err.message || err));
      }
    });

    // マウスで押したボタンにフォーカスを残さない(スペースキーがいつも再生/一時停止になるように)
    for (const b of document.querySelectorAll('.transport button')) b.addEventListener('mousedown', (e) => e.preventDefault());
    for (const c of document.querySelectorAll('.options input[type=checkbox]')) c.addEventListener('change', () => c.blur());

    $('b-play').addEventListener('click', togglePlay);
    $('b-stop').addEventListener('click', stop);
    $('b-prev').addEventListener('click', () => step(-1));
    $('b-next').addEventListener('click', () => step(1));
    $('b-back').addEventListener('click', () => nudge(-5));
    $('b-fwd').addEventListener('click', () => nudge(5));
    $('o-single').addEventListener('change', () => {
      if (state.disc && state.player.playing) setStopAt(currentTrackAt(state.player.position));
      else state.stopAt = null;
    });
    const vol = $('volume');
    const savedVol = (() => {
      try {
        return localStorage.getItem('ddp-player-volume');
      } catch (e) {
        return null;
      }
    })();
    if (savedVol !== null && !isNaN(Number(savedVol))) vol.value = savedVol;
    const applyVol = () => {
      state.player.setVolume(vol.value / 100);
      $('vol-text').textContent = vol.value;
      try {
        localStorage.setItem('ddp-player-volume', vol.value);
      } catch (e) {
        /* 保存できなくても困らない */
      }
    };
    vol.addEventListener('input', applyVol);
    applyVol();

    document.addEventListener('keydown', (e) => {
      if (!state.disc || e.ctrlKey || e.metaKey || e.altKey) return;
      // ボタンや入力欄にフォーカスがあるときは、そちらの操作を優先する
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
      let handled = true;
      if (e.key === ' ' || e.key === 'Spacebar') togglePlay();
      else if (e.key === 'ArrowLeft') nudge(e.shiftKey ? -30 : -5);
      else if (e.key === 'ArrowRight') nudge(e.shiftKey ? 30 : 5);
      else if (e.key === 'ArrowUp') step(-1);
      else if (e.key === 'ArrowDown') step(1);
      else if (e.key === 'Home') seekTo(state.disc.tracks[0].index0Frame);
      else if (e.key === 'Escape') stop();
      else if (/^[1-9]$/.test(e.key)) {
        const t = state.disc.tracks.find((x) => x.number === Number(e.key));
        if (t) playTrack(t);
      } else handled = false;
      if (handled) e.preventDefault();
    });

    setupSeek();
    requestAnimationFrame(tick);
    // 最初はお試し用のサンプルを開いておく(自分の DDP を開くと入れかわる)
    openSample();
  }

  function openSample() {
    if (!window.DDPSample) return;
    open(DDPSample.build('サンプル'), { sample: true });
  }

  setup();
})();
