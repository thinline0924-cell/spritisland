// 線画(コース図・ラリーの道・表紙の建物)。どれも種から同じ形を描く。
function catmullClosed(pts) {
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
function catmullOpen(pts) {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function trackSVG(venue, opts = {}) {
  const rnd = U.seeded('track-' + venue.id);
  const W = 320, H = 200, cx = W / 2, cy = H / 2;
  const n = 9 + Math.floor(rnd() * 5);
  const twist = 1 - venue.hs; // くねくね度
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    let r = 0.62 + rnd() * 0.38;
    if (rnd() < 0.25 + twist * 0.3) r *= 0.45 + rnd() * 0.25; // 内側に切れ込むヘアピン
    pts.push([cx + Math.cos(a) * r * W * 0.44, cy + Math.sin(a) * r * H * 0.42]);
  }
  const d = catmullClosed(pts);
  const sf = pts[0];
  const cls = opts.cls || '';
  return `<svg class="track ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(venue.name)}のコース図">
    <path d="${d}" class="t-out"/><path d="${d}" class="t-in"/>
    <line x1="${sf[0] - 9}" y1="${sf[1]}" x2="${sf[0] + 9}" y2="${sf[1]}" class="t-sf"/>
    <text x="${sf[0] + 12}" y="${sf[1] - 6}" class="t-lab">S/F</text>
  </svg>`;
}

function rallySVG(rally, stages) {
  const rnd = U.seeded('rally-' + rally.id);
  const W = 320, H = 200;
  const pts = [];
  const n = 14;
  let x = 18, y = 30 + rnd() * 140;
  for (let i = 0; i < n; i++) {
    pts.push([x, y]);
    x += (W - 36) / (n - 1);
    y = U.clamp(y + (rnd() - 0.5) * 90 * (0.5 + rally.rough), 18, H - 18);
  }
  const d = catmullOpen(pts);
  const ticks = [0, 4, 9, 13].map((k, i) => `<circle cx="${pts[k][0].toFixed(1)}" cy="${pts[k][1].toFixed(1)}" r="4" class="t-dot"/>`).join('');
  return `<svg class="track" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(rally.name)}のステージ図">
    <path d="${d}" class="t-out r"/><path d="${d}" class="t-dash"/>${ticks}
  </svg>`;
}

// 表紙:ピットの建物と外階段(参考画像の雰囲気を借りた線画)
function titleArt() {
  const cols = 4, bx = 40, by = 20, bw = 160, bh = 200;
  let grid = '';
  for (let i = 1; i < cols; i++) grid += `<line x1="${bx + i * bw / cols}" y1="${by}" x2="${bx + i * bw / cols}" y2="${by + bh}" class="a-dash"/>`;
  for (let j = 1; j < 4; j++) grid += `<line x1="${bx}" y1="${by + j * bh / 4}" x2="${bx + bw}" y2="${by + j * bh / 4}" class="a-dash h"/>`;
  // ガレージの扉
  let doors = '';
  for (let i = 0; i < cols; i++) {
    const x = bx + i * bw / cols + 6, w = bw / cols - 12;
    doors += `<rect x="${x}" y="${by + bh - 44}" width="${w}" height="44" class="a-door"/>`;
    for (let k = 1; k < 5; k++) doors += `<line x1="${x}" y1="${by + bh - 44 + k * 8.8}" x2="${x + w}" y2="${by + bh - 44 + k * 8.8}" class="a-thin"/>`;
  }
  // 外階段
  let stairs = '';
  const sx0 = 118, sy0 = 202, sx1 = 238, sy1 = 92;
  const steps = 14;
  for (let k = 0; k <= steps; k++) {
    const x = sx0 + (sx1 - sx0) * k / steps, y = sy0 + (sy1 - sy0) * k / steps;
    stairs += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 26}" class="a-rail"/>`;
  }
  stairs += `<line x1="${sx0}" y1="${sy0}" x2="${sx1}" y2="${sy1}" class="a-stair"/>`;
  stairs += `<line x1="${sx0}" y1="${sy0 - 26}" x2="${sx1}" y2="${sy1 - 26}" class="a-rail"/>`;
  stairs += `<line x1="${sx1}" y1="${sy1}" x2="${sx1 + 34}" y2="${sy1}" class="a-stair"/><line x1="${sx1}" y1="${sy1 - 26}" x2="${sx1 + 34}" y2="${sy1 - 26}" class="a-rail"/>`;
  stairs += `<line x1="${sx1 + 34}" y1="${sy1}" x2="${sx1 + 34}" y2="${sy1 - 26}" class="a-rail"/>`;
  // 屋上の計時ボード
  const board = `<rect x="${bx + 30}" y="${by - 14}" width="${bw - 60}" height="14" class="a-board"/>
    <text x="${bx + bw / 2}" y="${by - 3.5}" class="a-boardtxt">1:31.402</text>`;
  return `<svg class="title-art" viewBox="0 0 300 240" aria-hidden="true">
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" class="a-wall"/>${grid}${doors}${board}${stairs}
  </svg>`;
}

function meterHTML(v, labelL, labelR) {
  const p = Math.round(U.clamp(v, 0, 1) * 100);
  return `<div class="meter"><span class="m-l">${labelL}</span><span class="m-bar"><i style="left:${p}%"></i></span><span class="m-r">${labelR}</span></div>`;
}
