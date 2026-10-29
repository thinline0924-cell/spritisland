// 業績グラフ(canvas)。社内システムにありがちな素っ気ない棒と折れ線

export function drawMonthly(cv, hist) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 400, H = cv.clientHeight || 180;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const data = hist.slice(-13);
  const pad = { l: 46, r: 46, t: 18, b: 22 };
  g.font = '10px "BIZ UDPGothic", sans-serif';
  if (!data.length) { g.fillStyle = '#666'; g.fillText('月次データはまだありません(月末に締まります)', 12, H / 2); return; }
  const maxS = Math.max(...data.map(r => r.sales)) * 1.1;
  const cashMax = Math.max(...data.map(r => Math.abs(r.cash))) * 1.15 || 1;
  const opMax = Math.max(...data.map(r => Math.abs(r.op)), 1) * 1.3;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / data.length;
  // 罫線
  g.strokeStyle = '#d9dde2'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pad.t + ih * i / 4; g.beginPath(); g.moveTo(pad.l, y + 0.5); g.lineTo(W - pad.r, y + 0.5); g.stroke(); }
  g.fillStyle = '#556'; g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) g.fillText(Math.round(maxS * (1 - i / 4) / 1e6) + '', pad.l - 4, pad.t + ih * i / 4 + 3);
  g.textAlign = 'left'; g.fillText('売上(百万円)', 4, 10);
  // 売上の棒
  data.forEach((r, i) => {
    const h = r.sales / maxS * ih;
    g.fillStyle = '#9fb3c8'; g.fillRect(pad.l + i * bw + bw * 0.18, pad.t + ih - h, bw * 0.64, h);
    // 営業利益(小さな棒、赤字は朱)
    const oh = Math.abs(r.op) / opMax * (ih * 0.35);
    g.fillStyle = r.op >= 0 ? '#2f5d8a' : '#c0392b';
    const y0 = pad.t + ih * 0.65;
    if (r.op >= 0) g.fillRect(pad.l + i * bw + bw * 0.38, y0 - oh, bw * 0.24, oh); else g.fillRect(pad.l + i * bw + bw * 0.38, y0, bw * 0.24, oh);
    g.fillStyle = '#556'; g.textAlign = 'center';
    g.fillText(r.m + '月', pad.l + i * bw + bw / 2, H - 6);
  });
  g.strokeStyle = '#8a8f96'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(pad.l, pad.t + ih * 0.65 + 0.5); g.lineTo(W - pad.r, pad.t + ih * 0.65 + 0.5); g.stroke(); g.setLineDash([]);
  // 現預金の折れ線(右軸)
  g.strokeStyle = '#1e7a46'; g.lineWidth = 2; g.beginPath();
  data.forEach((r, i) => { const x = pad.l + i * bw + bw / 2, y = pad.t + ih * (1 - (r.cash / cashMax + 1) / 2); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
  data.forEach((r, i) => { const x = pad.l + i * bw + bw / 2, y = pad.t + ih * (1 - (r.cash / cashMax + 1) / 2); g.fillStyle = '#1e7a46'; g.fillRect(x - 2, y - 2, 4, 4); });
  g.fillStyle = '#1e7a46'; g.textAlign = 'left';
  g.fillText('現預金', W - pad.r + 4, 10);
  g.fillText(Math.round(cashMax / 1e6) + '', W - pad.r + 4, pad.t + 3);
  g.fillText('0', W - pad.r + 4, pad.t + ih / 2 + 3);
  g.fillStyle = '#556'; g.fillText('■売上 ', pad.l, 10);
  g.fillStyle = '#2f5d8a'; g.fillText('■営業利益', pad.l + 40, 10); g.fillStyle = '#c0392b'; g.fillText('(赤字)', pad.l + 96, 10);
}

export function spark(cv, vals, color = '#2f5d8a') {
  const W = cv.width = 80, H = cv.height = 18;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  if (vals.length < 2) return;
  const mx = Math.max(...vals), mn = Math.min(...vals);
  g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath();
  vals.forEach((v, i) => { const x = i / (vals.length - 1) * (W - 2) + 1, y = H - 2 - (v - mn) / Math.max(1, mx - mn) * (H - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}
