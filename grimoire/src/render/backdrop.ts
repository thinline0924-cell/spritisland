// 起動画面の背景：加算合成で回る魔法陣と、漂う光の粒（Phase 0 の描画確認用）
import { Application, Container, Graphics } from 'pixi.js';

function magicCircle(radius: number, color: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, radius).stroke({ width: 2, color, alpha: 0.9 });
  g.circle(0, 0, radius * 0.86).stroke({ width: 1, color, alpha: 0.6 });
  g.circle(0, 0, radius * 0.42).stroke({ width: 1.5, color, alpha: 0.7 });
  // 二重の正三角形（六芒星）
  for (const offset of [0, Math.PI]) {
    const pts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = offset + (i * Math.PI * 2) / 3 - Math.PI / 2;
      pts.push(Math.cos(a) * radius * 0.86, Math.sin(a) * radius * 0.86);
    }
    g.poly(pts, true).stroke({ width: 1.5, color, alpha: 0.75 });
  }
  // 外周の目盛り
  for (let i = 0; i < 48; i++) {
    const a = (i * Math.PI * 2) / 48;
    const r0 = radius * (i % 4 === 0 ? 0.9 : 0.94);
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  g.stroke({ width: 1, color, alpha: 0.6 });
  g.blendMode = 'add';
  return g;
}

export async function startBackdrop(host: HTMLElement): Promise<() => void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#07060c', antialias: true });
  host.appendChild(app.canvas);

  const root = new Container();
  app.stage.addChild(root);
  const outer = magicCircle(260, 0xb48cff);
  const inner = magicCircle(150, 0xff8a3d);
  inner.alpha = 0.7;
  root.addChild(outer, inner);

  const motes: { g: Graphics; vx: number; vy: number }[] = [];
  for (let i = 0; i < 120; i++) {
    const g = new Graphics().circle(0, 0, 1 + Math.random() * 2).fill({ color: Math.random() < 0.5 ? 0xb48cff : 0xff8a3d, alpha: 0.6 });
    g.blendMode = 'add';
    g.position.set((Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 1000);
    motes.push({ g, vx: (Math.random() - 0.5) * 12, vy: -6 - Math.random() * 18 });
    root.addChild(g);
  }

  app.ticker.add((t) => {
    const dt = t.deltaMS / 1000;
    root.position.set(app.screen.width / 2, app.screen.height / 2);
    outer.rotation += dt * 0.15;
    inner.rotation -= dt * 0.35;
    for (const m of motes) {
      m.g.x += m.vx * dt;
      m.g.y += m.vy * dt;
      if (m.g.y < -app.screen.height / 2 - 10) m.g.y = app.screen.height / 2 + 10;
    }
  });

  return () => app.destroy(true);
}
