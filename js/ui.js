// 画面(パネル・手札・案内・ダイアログ)。ゲームからの問い合わせに答える役目。
import { GLOSSARY, GUIDE } from './glossary.js';
import { ELEMENTS, ELEMENT_KEYS, TERRAIN, PIECES, targetLabel, invaderCardName, DIFFICULTY } from './data.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function elChips(list, cls = '') {
  return list.map(e => `<i class="el ${cls}" style="--c:${ELEMENTS[e].color}" title="${ELEMENTS[e].label}">${ELEMENTS[e].ch}</i>`).join('');
}

// 説明文の中の用語を、タップで用語集が開く印にする
const TERM_WORDS = ['ダメージ', '恐怖', '追い払う', '呼び寄せる', '守り', '荒れ地', '島の民', '探検家', '町', '都市', '破壊', '取り除く', '襲撃', '建設', '探検', '灯り', 'エネルギー'];
const TERM_RE = new RegExp(`(${TERM_WORDS.join('|')})`, 'g');
export function termify(text) {
  return esc(text).replace(TERM_RE, w => `<span class="term" data-term="${w}">${w}</span>`);
}

export function cardHTML(c, extra = '') {
  const speed = c.speed === 'fast' ? '<span class="spd fast" title="先手:侵略者が動く前に使う">先</span>' : '<span class="spd slow" title="後手:侵略者が動いたあとに使う">後</span>';
  return `<div class="card ${c.speed} ${extra}" data-id="${esc(c.id)}">
    <div class="c-top"><span class="cost" title="エネルギーのコスト">${c.cost}</span>${speed}</div>
    <div class="c-name">${esc(c.name)}</div>
    <div class="c-meta"><span class="term" data-term="距離">距離${c.range}</span>・${esc(targetLabel(c.target))}</div>
    <div class="c-text">${termify(c.text)}</div>
    <div class="c-el">${elChips(c.el)}</div>
  </div>`;
}

function invChip(card, label) {
  if (!card) return `<div class="inv-slot"><small class="term" data-term="${label}">${label}</small><span class="inv-card empty">—</span></div>`;
  const parts = card.coastal
    ? `<span class="tchip coast">沿岸</span>`
    : card.terrains.map(t => `<span class="tchip" style="--c:${TERRAIN[t].color}">${TERRAIN[t].name}</span>`).join('');
  return `<div class="inv-slot"><small class="term" data-term="${label}">${label}</small><span class="inv-card">${parts}</span></div>`;
}

export class UI {
  constructor(board3d) {
    this.b3 = board3d;
    this.game = null;
    this.pending = null;
    this.selecting = null;
    this.logLines = [];
    this.updateQueued = false;
    this.speedMul = 1;
    try { if (localStorage.getItem('spirit-fast') === '1') this.speedMul = 0.5; } catch (e) { /* 無視 */ }

    board3d.onLandClick = id => this.landClicked(id);
    board3d.onLandHover = (id, x, y) => this.hoverLand(id, x, y);

    document.querySelectorAll('[data-toggle]').forEach(h => h.addEventListener('click', () => {
      $('#' + h.dataset.toggle).classList.toggle('collapsed');
    }));
    if (window.innerWidth < 820) { $('#spirit-panel').classList.add('collapsed'); $('#island-panel').classList.add('collapsed'); }
    $('#menu-btn').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!e.target.closest('#menu')) $('#menu').classList.add('hidden'); });
    $('#menu').addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (!act) return;
      $('#menu').classList.add('hidden');
      if (act === 'rules') this.showRules();
      if (act === 'log') $('#log').classList.toggle('hidden');
      if (act === 'glossary') this.showGlossary();
      if (act === 'sound') { this.b3.fx.sound.setOn(!this.b3.fx.sound.on); this.syncMenu(); }
      if (act === 'speed') {
        this.speedMul = this.speedMul === 1 ? 0.5 : 1;
        try { localStorage.setItem('spirit-fast', this.speedMul < 1 ? '1' : '0'); } catch (e) { /* 無視 */ }
        this.syncMenu();
      }
      if (act === 'view') this.b3.resetView();
      if (act === 'new' && this.onNewGame) this.confirmNew();
    });
    $('#log-close').addEventListener('click', () => $('#log').classList.add('hidden'));
    $('#menu').insertAdjacentHTML('beforeend', '<button data-act="speed" id="speed-btn"></button>');
    this.syncMenu();
    // カードの中の用語にカーソルを合わせると説明が出る
    document.addEventListener('click', e => {
      const term = e.target.closest('.term');
      if (term && !this.selecting && !term.closest('.pick')) { e.stopPropagation(); this.showGlossary(term.dataset.term); }
    }, true);
    $('#hand').addEventListener('click', e => {
      const el = e.target.closest('.card');
      if (el && this.selecting) this.toggleCard(el.dataset.id);
    });
  }

  // ゲームごとの窓口。古いゲームからの呼び出しは無視する
  facade(game) {
    const never = () => new Promise(() => {});
    const ok = () => this.game === game;
    return {
      update: g => ok() && this.queueUpdate(),
      log: (m, c) => ok() && this.log(m, c),
      chooseLand: o => ok() ? this.chooseLand(o) : never(),
      chooseOption: o => ok() ? this.chooseOption(o) : never(),
      selectCards: g => ok() ? this.selectCards(g) : never(),
      showFear: (c, tl) => ok() ? this.showFear(c, tl) : never(),
      notice: (t, x) => ok() ? this.notice(t, x) : never(),
      flash: (ids, k) => ok() && this.b3.flash(ids, k),
      pause: ms => ok() ? new Promise(r => setTimeout(r, ms * this.speedMul)) : never(),
      gameOver: (w, r, g) => ok() && this.gameOver(w, r, g),
      fx: (k, d) => ok() && this.b3.fx.handle(k, d),
    };
  }

  syncMenu() {
    $('#sound-btn').textContent = `効果音:${this.b3.fx.sound.on ? 'オン' : 'オフ'}`;
    $('#speed-btn').textContent = `演出の速さ:${this.speedMul < 1 ? 'はやい' : 'ふつう'}`;
  }

  setGame(game) {
    this.game = game;
    this.b3.lastPos = null;
    this.b3.anims.clear();
    document.body.classList.add('ingame');
    this.pending = null;
    this.selecting = null;
    this.logLines = [];
    $('#log-list').innerHTML = '';
    this.hidePrompt();
    this.closeModal();
    this.queueUpdate();
  }

  queueUpdate() {
    if (this.updateQueued) return;
    this.updateQueued = true;
    requestAnimationFrame(() => { this.updateQueued = false; this.render(); });
  }

  // ---------- 記録 ----------
  log(msg, cls = '') {
    this.logLines.push({ msg, cls });
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = msg;
    const list = $('#log-list');
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
    if (cls !== 'head') {
      const t = document.createElement('div');
      t.className = 'toast-line ' + cls;
      t.textContent = msg;
      const toast = $('#toast');
      toast.appendChild(t);
      while (toast.children.length > 4) toast.removeChild(toast.firstChild);
      setTimeout(() => t.classList.add('fade'), 3800);
      setTimeout(() => t.remove(), 4600);
    }
  }

  // ---------- 描画 ----------
  render() {
    const g = this.game;
    if (!g) return;
    this.b3.setPieces(g.lands, g.spirit.color);
    $('#phase').innerHTML = g.turn ? `<small>ターン ${g.turn}</small>${esc(g.phase)}` : esc(g.phase);
    this.renderSpirit(g);
    this.renderIsland(g);
    this.renderHand(g);
  }

  renderSpirit(g) {
    const sp = g.spirit, def = sp.def;
    $('#spirit-name').innerHTML = `<i class="dot" style="--c:${sp.color}"></i>${esc(sp.name)}`;
    const track = (arr, rev, unit) => arr.map((v, i) => {
      if (i < rev) return `<span class="slot open ${i === rev - 1 ? 'cur' : ''}">${v}</span>`;
      return `<span class="slot pres" style="--c:${sp.color}" title="${v}${unit}"><em>${v}</em></span>`;
    }).join('');
    const el = g.elements();
    const met = g.innateLevels();
    const inn = def.innate;
    $('#spirit-body').innerHTML = `
      <div class="stat-row">
        <div class="big"><small>エネルギー</small><b>${sp.energy}</b><small>毎ターン +${g.energyGain()}</small></div>
        <div class="big"><small>使えるカード</small><b>${g.cardPlays()}</b><small>枚 / ターン</small></div>
      </div>
      <div class="track"><small class="term" data-term="エネルギーの列・カードの列">エネルギーの列(毎ターンもらえる量)</small><div>${track(def.energyTrack, sp.energyRevealed, 'エネルギー')}</div></div>
      <div class="track"><small class="term" data-term="エネルギーの列・カードの列">カードの列(1ターンに使える枚数)</small><div>${track(def.cardTrack, sp.cardRevealed, '枚')}</div></div>
      <div class="els"><small class="term" data-term="元素">このターンの元素(使ったカードの合計)</small><div>${ELEMENT_KEYS.map(k =>
        `<i class="el ${el[k] ? '' : 'off'}" style="--c:${ELEMENTS[k].color}" title="${ELEMENTS[k].label}">${ELEMENTS[k].ch}<sub>${el[k] || ''}</sub></i>`).join('')}</div></div>
      <div class="innate">
        <div class="inn-head">${esc(inn.name)} <span class="spd ${inn.speed}">${inn.speed === 'fast' ? '先' : '後'}</span><small><span class="term" data-term="特技">特技</span>・距離${inn.range}・${esc(targetLabel(inn.target))}</small></div>
        ${inn.levels.map((lv, i) => `<div class="inn-lv ${met[i] ? 'met' : ''}"><span class="need">${Object.entries(lv.need).map(([k, v]) =>
          `<i class="el" style="--c:${ELEMENTS[k].color}">${ELEMENTS[k].ch}<sub>${v}</sub></i>`).join('')}</span><span>${esc(lv.text)}</span></div>`).join('')}
      </div>
      <div class="pres-count">島にある灯り:${g.totalPresence()}</div>`;
  }

  renderIsland(g) {
    const f = g.fear;
    const dots = Array.from({ length: f.perCard }, (_, i) => `<i class="fdot ${i < f.pool ? 'on' : ''}"></i>`).join('');
    const tlText = ['', '侵略者を島からすべて追い出す', '町と都市をすべてなくす', '都市をすべてなくす'][f.terror];
    const cnt = k => g.lands.reduce((t, L) => t + L[k], 0);
    const goalLeft = f.terror === 1 ? `あと 侵略者${cnt('explorers') + cnt('towns') + cnt('cities')}`
      : f.terror === 2 ? `あと 町${cnt('towns')}・都市${cnt('cities')}` : `あと 都市${cnt('cities')}`;
    const inv = g.invader;
    const next = inv.deck[0];
    $('#island-body').innerHTML = `
      <div class="row"><small class="term" data-term="恐怖">恐怖</small><span class="fdots">${dots}</span><span class="num">${f.pool}/${f.perCard}</span></div>
      <div class="row sub"><small>恐怖カード</small><span>獲得 ${9 - f.deck.length}/9${f.earned.length ? `(<b class="warn">未発動 ${f.earned.length}</b>)` : ''}</span></div>
      <div class="row"><small class="term" data-term="恐怖レベル">恐怖レベル</small><span class="tl">${'Ⅰ Ⅱ Ⅲ'.split(' ')[f.terror - 1]}</span></div>
      <div class="goal"><span class="term" data-term="勝利条件">勝利条件</span>:${tlText}<br><b class="left">${goalLeft}</b></div>
      <div class="row"><small class="term" data-term="荒れ地">荒れ地</small><span class="blight">${'◆'.repeat(Math.min(g.blight.pool, 12))}</span><span class="num">残り${g.blight.pool}</span></div>
      ${g.blight.flipped ? '<div class="goal bad">島は荒れ果てた:尽きたら負け</div>' : ''}
      <div class="inv">${invChip(inv.ravage, '襲撃')}${invChip(inv.build, '建設')}${invChip(inv.explore, '探検')}</div>
      <div class="inv-note">←毎ターン左へ進む。「建設」の地形は次のターンに襲撃される</div>
      <div class="row sub"><small class="term" data-term="侵略者カード">侵略者カード</small><span>残り ${inv.deck.length} 枚${next ? `(次はステージ${next.stage})` : '(最後の探検が終わった)'}</span></div>`;
  }

  renderHand(g) {
    const sp = g.spirit;
    const sel = this.selecting;
    const handHTML = sp.hand.map(c => {
      let cls = '';
      if (sel) {
        if (sel.picked.has(c.id)) cls = 'picked';
        else cls = 'can';
      }
      return cardHTML(c, cls);
    }).join('');
    const played = sp.played.map(c => cardHTML(c, 'played')).join('');
    $('#hand').innerHTML = handHTML + (played ? `<div class="hand-sep">使用中</div>${played}` : '');
    $('#hand-info').innerHTML = `<span>手札 ${sp.hand.length}</span><span title="${esc(sp.discard.map(c => c.name).join('、'))}">捨て札 ${sp.discard.length}</span>`;
  }

  // ---------- ホバー ----------
  hoverLand(id, x, y) {
    const tip = $('#tooltip');
    const g = this.game;
    if (id == null || !g) { tip.classList.add('hidden'); return; }
    const L = g.lands[id];
    const rows = [['explorers', L.explorers], ['towns', L.towns], ['cities', L.cities], ['dahan', L.dahan], ['blight', L.blight], ['presence', L.presence]]
      .filter(([, n]) => n > 0).map(([k, n]) => `<span>${PIECES[k]} ${n}</span>`).join('');
    const flags = [];
    if (L.defend) flags.push(`守り${L.defend}`);
    if (L.skip.ravage) flags.push('襲撃無し');
    if (L.skip.build) flags.push('次の建設無し');
    if (L.skip.explore) flags.push('次の探検無し');
    tip.innerHTML = `<b>土地${L.num} ${TERRAIN[L.terrain].name}</b>${L.coastal ? '<em>沿岸</em>' : '<em>内陸</em>'}
      <div class="tp">${rows || '<span>なにもない</span>'}</div>
      ${flags.length ? `<div class="tf">${flags.join('・')}</div>` : ''}
      <div class="ta">となり:${L.adj.map(i => g.lands[i].num).join('・')}</div>`;
    tip.classList.remove('hidden');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px';
    tip.style.top = Math.min(window.innerHeight - h - 8, y + 12) + 'px';
  }

  // ---------- 案内バー ----------
  showPrompt(title, buttons) {
    $('#prompt').classList.remove('hidden');
    $('#prompt-title').innerHTML = title;
    const box = $('#prompt-buttons');
    box.innerHTML = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.innerHTML = b.label;
      if (b.disabled) el.disabled = true;
      el.addEventListener('click', b.onClick);
      box.appendChild(el);
    }
  }
  hidePrompt() { $('#prompt').classList.add('hidden'); this.b3.setSelectable([]); }

  chooseLand({ ids, title, optional, optionalLabel }) {
    const g = this.game;
    return new Promise(resolve => {
      const done = v => { this.pending = null; this.hidePrompt(); resolve(v); };
      this.pending = { type: 'land', ids: new Set(ids), done };
      this.b3.setSelectable(ids);
      const buttons = ids.map(id => {
        const L = g.lands[id];
        return { label: `${L.num} <small>${TERRAIN[L.terrain].name}</small>`, cls: 'land', onClick: () => done(id) };
      });
      if (optional) buttons.push({ label: optionalLabel || 'やめる', cls: 'ghost', onClick: () => done(null) });
      this.showPrompt(esc(title) + '<small class="hint">光っている土地か、下の番号をタップ</small>', buttons);
    });
  }

  landClicked(id) {
    if (this.pending && this.pending.type === 'land' && this.pending.ids.has(id)) this.pending.done(id);
  }

  chooseOption({ title, options, modal }) {
    return new Promise(resolve => {
      if (modal) {
        const box = this.openModal(`<h2>${esc(title)}</h2><div class="card-pick">${options.map((o, i) =>
          `<button class="pick" data-i="${i}">${o.card ? cardHTML(o.card, 'big') : esc(o.label)}</button>`).join('')}</div>`);
        box.querySelectorAll('.pick').forEach(b => b.addEventListener('click', () => {
          this.closeModal();
          resolve(options[+b.dataset.i].value);
        }));
        return;
      }
      const done = v => { this.pending = null; this.hidePrompt(); resolve(v); };
      this.pending = { type: 'option', done };
      this.showPrompt(esc(title), options.map(o => ({ label: esc(o.label), cls: o.ghost ? 'ghost' : '', disabled: o.disabled, onClick: () => done(o.value) })));
    });
  }

  // ---------- カードを選ぶ ----------
  selectCards(g) {
    return new Promise(resolve => {
      this.selecting = { picked: new Set(), resolve, g };
      this.refreshSelect();
    });
  }
  toggleCard(id) {
    const s = this.selecting;
    const g = s.g;
    if (s.picked.has(id)) s.picked.delete(id);
    else {
      const card = g.spirit.hand.find(c => c.id === id);
      if (!card) return;
      const cost = [...s.picked].reduce((t, pid) => t + g.spirit.hand.find(c => c.id === pid).cost, 0);
      if (s.picked.size >= g.cardPlays()) { this.shake(`このターンに使えるのは ${g.cardPlays()} 枚までです`); return; }
      if (cost + card.cost > g.spirit.energy) { this.shake('エネルギーが足りません'); return; }
      s.picked.add(id);
    }
    this.refreshSelect();
  }
  shake(msg) {
    const p = $('#prompt');
    p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake');
    $('#prompt-title').querySelector('.hint').textContent = msg;
  }
  refreshSelect() {
    const s = this.selecting;
    const g = s.g;
    const picked = g.spirit.hand.filter(c => s.picked.has(c.id));
    const cost = picked.reduce((t, c) => t + c.cost, 0);
    this.renderHand(g);
    this.showPrompt(`使うパワーカードを選んでください
      <span class="sel-stat">エネルギー <b>${g.spirit.energy - cost}</b>/${g.spirit.energy}・カード <b>${picked.length}</b>/${g.cardPlays()}</span>
      <small class="hint">手札のカードをタップして選ぶ(もう一度タップで外す)</small>`, [
      { label: picked.length ? `この${picked.length}枚で決定` : '使わずに進む', cls: 'primary', onClick: () => {
        this.selecting = null;
        this.hidePrompt();
        this.renderHand(g);
        s.resolve(picked);
      } },
    ]);
  }

  // ---------- ダイアログ ----------
  openModal(html, layer = 'modal') {
    const box = $(`#${layer}-box`);
    box.innerHTML = html;
    $('#' + layer).classList.remove('hidden');
    box.scrollTop = 0;
    return box;
  }
  closeModal(layer = 'modal') { $('#' + layer).classList.add('hidden'); }

  notice(title, text) {
    return new Promise(resolve => {
      const box = this.openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><button class="btn primary" id="ok">OK</button></div>`);
      box.querySelector('#ok').addEventListener('click', () => { this.closeModal(); resolve(); });
    });
  }

  showFear(card, tl) {
    return new Promise(resolve => {
      const box = this.openModal(`<div class="fear-card">
        <div class="fear-title">恐怖カード</div>
        <h2>${esc(card.name)}</h2>
        ${card.levels.map((lv, i) => `<div class="fear-lv ${i + 1 === tl ? 'now' : ''}"><b>${'ⅠⅡⅢ'[i]}</b><span>${esc(lv.text)}</span></div>`).join('')}
        <p class="note">いまの恐怖レベルは ${'ⅠⅡⅢ'[tl - 1]}。光っている効果が起きます。</p>
      </div><div class="actions"><button class="btn primary" id="ok">効果を使う</button></div>`);
      box.querySelector('#ok').addEventListener('click', () => { this.closeModal(); resolve(); });
    });
  }

  gameOver(win, reason, g) {
    this.b3.fx.sound.play(win ? 'win' : 'lose');
    this.hidePrompt();
    this.selecting = null;
    const box = this.openModal(`<div class="end ${win ? 'win' : 'lose'}">
      <div class="end-title">${win ? '勝利' : '敗北'}</div>
      <p>${esc(reason)}</p>
      <ul class="end-stats">
        <li>ターン数:${g.turn}</li>
        <li>破壊した侵略者:${g.stats.destroyed}</li>
        <li>生み出した恐怖:${g.stats.fearTotal}</li>
        <li>獲得した恐怖カード:${9 - g.fear.deck.length}/9</li>
        <li>難易度:${esc(g.diff.label)}</li>
      </ul>
      </div><div class="actions"><button class="btn" id="see">島を見る</button><button class="btn primary" id="again">もう一度遊ぶ</button></div>`);
    box.querySelector('#again').addEventListener('click', () => { this.closeModal(); this.onNewGame && this.onNewGame(); });
    box.querySelector('#see').addEventListener('click', () => {
      this.closeModal();
      this.showPrompt(win ? '勝利しました' : '敗北しました', [{ label: 'もう一度遊ぶ', cls: 'primary', onClick: () => this.onNewGame && this.onNewGame() }]);
    });
  }

  confirmNew() {
    const box = this.openModal(`<h2>新しいゲーム</h2><p>いまのゲームをやめて、はじめからやり直しますか?</p>
      <div class="actions"><button class="btn ghost" id="no">つづける</button><button class="btn primary" id="yes">やり直す</button></div>`, 'sheet');
    box.querySelector('#no').addEventListener('click', () => this.closeModal('sheet'));
    box.querySelector('#yes').addEventListener('click', () => { this.closeModal('sheet'); this.onNewGame(); });
  }

  // スタート画面
  showStart(spirits, onStart) {
    let spirit = spirits[0].id, diff = 'normal';
    const box = this.openModal(`<div class="start">
      <div class="logo"><span>SPIRIT ISLAND</span><h1>精霊の島</h1><p>島を守る精霊となり、海の向こうから来た侵略者を追い払おう。<br>ひとりで遊ぶ3Dボードゲーム。</p></div>
      <h3>精霊を選ぶ</h3>
      <div class="spirit-pick">${spirits.map(s => `<button class="sp ${s.id === spirit ? 'on' : ''}" data-id="${s.id}">
        <i class="dot" style="--c:${s.color}"></i><b>${esc(s.name)}</b><span>${esc(s.blurb)}</span>
        <small>特技:${esc(s.innate.name)}</small></button>`).join('')}</div>
      <h3>難易度</h3>
      <div class="diff-pick">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="df ${k === diff ? 'on' : ''}" data-k="${k}"><b>${d.label}</b><small>${esc(d.note)}</small></button>`).join('')}</div>
      <div class="actions"><button class="btn ghost" id="rules">遊び方を読む</button><button class="btn primary" id="go">はじめる</button></div>
    </div>`);
    box.querySelectorAll('.sp').forEach(b => b.addEventListener('click', () => {
      spirit = b.dataset.id; box.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', x === b));
    }));
    box.querySelectorAll('.df').forEach(b => b.addEventListener('click', () => {
      diff = b.dataset.k; box.querySelectorAll('.df').forEach(x => x.classList.toggle('on', x === b));
    }));
    box.querySelector('#rules').addEventListener('click', () => this.showRules());
    box.querySelector('#go').addEventListener('click', () => { this.closeModal(); onStart({ spirit, difficulty: diff }); });
  }

  showRules(tab = 'basics', focus = null) {
    const tabs = [['basics', 'はじめに'], ['turn', 'ターンの流れ'], ['invaders', '侵略者の動き'], ['win', '勝ち負け'], ['glossary', '用語集']];
    const glossary = GLOSSARY.map(g => `<h3>${esc(g.group)}</h3><dl class="gloss">${g.items.map(it =>
      `<div class="gl-item" data-term="${esc(it.term)}"><dt>${esc(it.term)}</dt><dd>${esc(it.desc)}${it.rule ? `<p class="gl-rule"><b>くわしく</b>${termify(it.rule)}</p>` : ''}</dd></div>`).join('')}</dl>`).join('');
    const box = this.openModal(`<div class="rules">
      <h2>遊び方と用語集</h2>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      ${tabs.map(([k]) => `<section class="tab-body ${k === tab ? '' : 'hidden'}" data-body="${k}">${k === 'glossary' ? glossary : GUIDE[k]}</section>`).join('')}
      <p class="note">このゲームはボードゲーム「スピリット・アイランド」を題材にしたファンメイドの一人用アレンジです。カードや数値は独自に簡略化しています。</p>
      </div><div class="actions"><button class="btn primary" id="close">閉じる</button></div>`, 'sheet');
    const show = k => {
      box.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
      box.querySelectorAll('.tab-body').forEach(b => b.classList.toggle('hidden', b.dataset.body !== k));
    };
    box.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { show(b.dataset.tab); box.scrollTop = 0; }));
    // 説明の中の用語をタップすると用語集のその項目へ
    box.addEventListener('click', e => {
      const t = e.target.closest('.term');
      if (!t) return;
      e.stopPropagation();
      show('glossary');
      this.focusTerm(box, t.dataset.term);
    });
    box.querySelector('#close').addEventListener('click', () => this.closeModal('sheet'));
    if (focus) this.focusTerm(box, focus);
  }

  focusTerm(box, term) {
    const el = box.querySelector(`.gl-item[data-term="${term}"]`);
    if (!el) return;
    box.querySelectorAll('.gl-item.hl').forEach(x => x.classList.remove('hl'));
    el.classList.add('hl');
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
  }

  showGlossary(term = null) { this.showRules('glossary', term); }
}

export { invaderCardName };
