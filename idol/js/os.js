// ウィンドウ・タスクバー・通知など「PCとしての動き」だけを受け持つ
const OS = (() => {
  const wins = {};
  let z = 100;
  let cascade = 0;
  const layer = () => document.getElementById('windows');
  const isNarrow = () => window.innerWidth < 760;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function focus(id) {
    const w = wins[id];
    if (!w) return;
    w.el.style.zIndex = ++z;
    w.el.classList.remove('min');
    Object.values(wins).forEach(o => o.el.classList.toggle('active', o === w));
    renderTaskbar();
  }

  // opt: { title, icon, w, h, x, y, render(body, win), onClose, app }
  function open(id, opt) {
    if (wins[id]) {
      if (opt.refresh !== false) refresh(id, opt);
      focus(id);
      return wins[id];
    }
    const root = el('div', 'win');
    root.dataset.id = id;
    const W = Math.min(opt.w || 640, window.innerWidth - 20);
    const H = Math.min(opt.h || 440, window.innerHeight - 70);
    const x = opt.x != null ? opt.x : 80 + (cascade % 8) * 28;
    const y = opt.y != null ? opt.y : 40 + (cascade % 8) * 24;
    cascade++;
    Object.assign(root.style, { width: W + 'px', height: H + 'px', left: Math.max(0, Math.min(x, window.innerWidth - W)) + 'px', top: Math.max(0, y) + 'px' });

    const bar = el('div', 'titlebar');
    bar.innerHTML = `<span class="ticon">${Icons.get(opt.icon)}</span><span class="ttext"></span>
      <span class="tbtns"><button class="b-min" title="最小化">${Icons.get('wmin')}</button><button class="b-max" title="最大化">${Icons.get('wmax')}</button><button class="b-close" title="閉じる">${Icons.get('wclose')}</button></span>`;
    bar.querySelector('.ttext').textContent = opt.title;
    const body = el('div', 'winbody');
    root.append(bar, body);
    layer().append(root);

    const w = { id, el: root, body, opt, title: opt.title, icon: opt.icon };
    wins[id] = w;

    bar.querySelector('.b-close').onclick = e => { e.stopPropagation(); close(id); };
    bar.querySelector('.b-min').onclick = e => { e.stopPropagation(); root.classList.add('min'); root.classList.remove('active'); renderTaskbar(); };
    bar.querySelector('.b-max').onclick = e => { e.stopPropagation(); root.classList.toggle('max'); };
    bar.addEventListener('dblclick', () => root.classList.toggle('max'));
    root.addEventListener('pointerdown', () => focus(id), true);
    drag(root, bar);

    opt.render(body, w);
    focus(id);
    return w;
  }

  function refresh(id, opt) {
    const w = wins[id];
    if (!w) return;
    if (opt) { w.opt = Object.assign(w.opt, opt); }
    if (w.opt.title) { w.title = w.opt.title; w.el.querySelector('.ttext').textContent = w.opt.title; }
    const st = w.body.scrollTop;
    w.body.innerHTML = '';
    w.opt.render(w.body, w);
    w.body.scrollTop = st;
    renderTaskbar();
  }

  function close(id) {
    const w = wins[id];
    if (!w) return;
    if (w.opt.onClose) w.opt.onClose();
    w.el.remove();
    delete wins[id];
    renderTaskbar();
  }

  function drag(root, bar) {
    let sx, sy, ox, oy, on = false;
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || isNarrow() || root.classList.contains('max')) return;
      on = true; sx = e.clientX; sy = e.clientY; ox = root.offsetLeft; oy = root.offsetTop;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if (!on) return;
      root.style.left = Math.max(-root.offsetWidth + 80, Math.min(window.innerWidth - 80, ox + e.clientX - sx)) + 'px';
      root.style.top = Math.max(0, Math.min(window.innerHeight - 80, oy + e.clientY - sy)) + 'px';
    });
    bar.addEventListener('pointerup', () => { on = false; });
  }

  function renderTaskbar() {
    const box = document.getElementById('tasks');
    if (!box) return;
    box.innerHTML = '';
    const top = Object.values(wins).filter(w => !w.el.classList.contains('min')).sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0];
    Object.values(wins).forEach(w => {
      const b = el('button', 'task' + (w === top ? ' on' : ''));
      b.innerHTML = `${Icons.get(w.icon)}<span>${escapeHtml(w.title)}</span>`;
      b.title = w.title;
      b.onclick = () => {
        if (w === top) { w.el.classList.add('min'); renderTaskbar(); }
        else focus(w.id);
      };
      box.append(b);
    });
  }

  // 右下の通知
  function toast(app, title, text, onClick) {
    const box = document.getElementById('toasts');
    const t = el('div', 'toast');
    t.innerHTML = `<div class="toast-app">${Icons.get(app.icon)}<span>${escapeHtml(app.name)}</span><button class="x">${Icons.get('wclose')}</button></div>
      <div class="toast-title"></div><div class="toast-text"></div>`;
    t.querySelector('.toast-title').textContent = title;
    t.querySelector('.toast-text').textContent = text;
    t.onclick = e => {
      t.remove();
      if (!e.target.closest('.x') && onClick) onClick();
    };
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('gone'), 6500);
    setTimeout(() => t.remove(), 7000);
  }

  // OS っぽい確認ダイアログ。buttons: [{label, primary, fn}]
  function dialog(title, message, buttons, icon) {
    const shade = el('div', 'shade');
    const d = el('div', 'dialog');
    d.innerHTML = `<div class="dlg-title"></div><div class="dlg-main"><div class="dlg-icon">${Icons.get(icon || 'info')}</div><div class="dlg-msg"></div></div><div class="dlg-btns"></div>`;
    d.querySelector('.dlg-title').textContent = title;
    d.querySelector('.dlg-msg').textContent = message;
    (buttons || [{ label: 'OK', primary: true }]).forEach(b => {
      const bt = el('button', b.primary ? 'primary' : '');
      bt.textContent = b.label;
      bt.onclick = () => { shade.remove(); if (b.fn) b.fn(); };
      d.querySelector('.dlg-btns').append(bt);
    });
    shade.append(d);
    document.body.append(shade);
    d.querySelector('button.primary, button')?.focus();
  }

  // 入力欄つきのダイアログ
  function prompt(title, message, def, fn) {
    const shade = el('div', 'shade');
    const d = el('div', 'dialog');
    d.innerHTML = `<div class="dlg-title"></div><div class="dlg-main"><div class="dlg-icon">${Icons.get('pen')}</div><div style="flex:1"><div class="dlg-msg"></div><input class="dlg-input"></div></div><div class="dlg-btns"><button class="primary">OK</button></div>`;
    d.querySelector('.dlg-title').textContent = title;
    d.querySelector('.dlg-msg').textContent = message;
    const inp = d.querySelector('input');
    inp.value = def || '';
    const ok = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } shade.remove(); fn(v); };
    d.querySelector('button').onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) ok(); };
    shade.append(d);
    document.body.append(shade);
    inp.focus();
  }

  return { open, close, focus, refresh, toast, dialog, prompt, wins, renderTaskbar, el, isNarrow };
})();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// 改行を <br> に。~~x~~ は取り消し線
function textHtml(s) {
  return escapeHtml(s).replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/\n/g, '<br>');
}
