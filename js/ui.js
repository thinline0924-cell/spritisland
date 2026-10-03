// 画面(パネル・手札・案内・ダイアログ)。ゲームからの問い合わせに答える役目。
import { ELEMENTS, ELEMENT_KEYS, TERRAIN, PIECES, targetLabel, invaderCardName, DIFFICULTY } from './data.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function elChips(list, cls = '') {
  return list.map(e => `<i class="el ${cls}" style="--c:${ELEMENTS[e].color}" title="${ELEMENTS[e].label}">${ELEMENTS[e].ch}</i>`).join('');
}

export function cardHTML(c, extra = '') {
  const speed = c.speed === 'fast' ? '<span class="spd fast">速</span>' : '<span class="spd slow">遅</span>';
  return `<div class="card ${c.speed} ${extra}" data-id="${esc(c.id)}">
    <div class="c-top"><span class="cost" title="エネルギーのコスト">${c.cost}</span>${speed}</div>
    <div class="c-name">${esc(c.name)}</div>
    <div class="c-meta">範囲${c.range}・${esc(targetLabel(c.target))}</div>
    <div class="c-text">${esc(c.text)}</div>
    <div class="c-el">${elChips(c.el)}</div>
  </div>`;
}

function invChip(card, label) {
  if (!card) return `<div class="inv-slot"><small>${label}</small><span class="inv-card empty">—</span></div>`;
  const parts = card.coastal
    ? `<span class="tchip coast">沿岸</span>`
    : card.terrains.map(t => `<span class="tchip" style="--c:${TERRAIN[t].color}">${TERRAIN[t].name}</span>`).join('');
  return `<div class="inv-slot"><small>${label}</small><span class="inv-card">${parts}</span></div>`;
}

export class UI {
  constructor(board3d) {
    this.b3 = board3d;
    this.game = null;
    this.pending = null;
    this.selecting = null;
    this.logLines = [];
    this.updateQueued = false;

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
      if (act === 'view') this.b3.resetView();
      if (act === 'new' && this.onNewGame) this.confirmNew();
    });
    $('#log-close').addEventListener('click', () => $('#log').classList.add('hidden'));
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
      pause: ms => ok() ? new Promise(r => setTimeout(r, ms)) : never(),
      gameOver: (w, r, g) => ok() && this.gameOver(w, r, g),
    };
  }

  setGame(game) {
    this.game = game;
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
      <div class="track"><small>エネルギー欄</small><div>${track(def.energyTrack, sp.energyRevealed, 'エネルギー')}</div></div>
      <div class="track"><small>カード欄</small><div>${track(def.cardTrack, sp.cardRevealed, '枚')}</div></div>
      <div class="els"><small>このターンの元素</small><div>${ELEMENT_KEYS.map(k =>
        `<i class="el ${el[k] ? '' : 'off'}" style="--c:${ELEMENTS[k].color}" title="${ELEMENTS[k].label}">${ELEMENTS[k].ch}<sub>${el[k] || ''}</sub></i>`).join('')}</div></div>
      <div class="innate">
        <div class="inn-head">${esc(inn.name)} <span class="spd ${inn.speed}">${inn.speed === 'fast' ? '速' : '遅'}</span><small>固有パワー・範囲${inn.range}・${esc(targetLabel(inn.target))}</small></div>
        ${inn.levels.map((lv, i) => `<div class="inn-lv ${met[i] ? 'met' : ''}"><span class="need">${Object.entries(lv.need).map(([k, v]) =>
          `<i class="el" style="--c:${ELEMENTS[k].color}">${ELEMENTS[k].ch}<sub>${v}</sub></i>`).join('')}</span><span>${esc(lv.text)}</span></div>`).join('')}
      </div>
      <div class="pres-count">島にある存在:${g.totalPresence()}</div>`;
  }

  renderIsland(g) {
    const f = g.fear;
    const dots = Array.from({ length: f.perCard }, (_, i) => `<i class="fdot ${i < f.pool ? 'on' : ''}"></i>`).join('');
    const tlText = ['', '侵略者を島からすべて追い出す', '町と都市をすべてなくす', '都市をすべてなくす'][f.terror];
    const inv = g.invader;
    const next = inv.deck[0];
    $('#island-body').innerHTML = `
      <div class="row"><small>恐怖</small><span class="fdots">${dots}</span><span class="num">${f.pool}/${f.perCard}</span></div>
      <div class="row sub"><small>恐怖カード</small><span>獲得 ${9 - f.deck.length}/9${f.earned.length ? `(<b class="warn">未発動 ${f.earned.length}</b>)` : ''}</span></div>
      <div class="row"><small>恐怖レベル</small><span class="tl">${'Ⅰ Ⅱ Ⅲ'.split(' ')[f.terror - 1]}</span></div>
      <div class="goal">勝利条件:${tlText}</div>
      <div class="row"><small>荒廃</small><span class="blight">${'◆'.repeat(Math.min(g.blight.pool, 12))}</span><span class="num">${g.blight.pool}</span></div>
      ${g.blight.flipped ? '<div class="goal bad">島は荒れ果てた:尽きたら負け</div>' : ''}
      <div class="inv">${invChip(inv.ravage, '荒らし')}${invChip(inv.build, '建設')}${invChip(inv.explore, '探検')}</div>
      <div class="row sub"><small>侵略者デッキ</small><span>残り ${inv.deck.length} 枚${next ? `(次はステージ${next.stage})` : '(最後の探検が終わった)'}</span></div>`;
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
    if (L.defend) flags.push(`防御${L.defend}`);
    if (L.skip.ravage) flags.push('荒らし無し');
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
        <small>固有パワー:${esc(s.innate.name)}</small></button>`).join('')}</div>
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

  showRules() {
    const box = this.openModal(`<div class="rules">
      <h2>遊び方</h2>
      <p>あなたは島に宿る<b>精霊</b>です。島の人々<b>ダハン</b>と力を合わせ、海から来る<b>侵略者</b>(探検家・町・都市)を追い払いましょう。</p>
      <h3>勝ち・負け</h3>
      <ul>
        <li><b>勝ち</b>:侵略者を怖がらせて<b>恐怖カードを9枚</b>集める。または、恐怖レベルごとの勝利条件(Ⅰ:侵略者全滅/Ⅱ:町と都市が無い/Ⅲ:都市が無い)を満たす。</li>
        <li><b>負け</b>:荒廃が尽きる/島から精霊の存在がすべて消える/侵略者カードが尽きる(時間切れ)。</li>
      </ul>
      <h3>1ターンの流れ</h3>
      <ol>
        <li><b>成長</b>:3つの中から1つ選ぶ。存在を島に置くと、欄の下の数字があらわれ、エネルギーや使えるカードの数が増える。</li>
        <li><b>エネルギーを得てカードを選ぶ</b>:コストを払って手札からパワーカードを使う。</li>
        <li><b>速いパワー</b>(速)を使う。</li>
        <li><b>侵略者フェイズ</b>:恐怖カードの効果 → <b>荒らし</b> → <b>建設</b> → <b>探検</b>。カードは毎ターン「探検→建設→荒らし」の順に右から左へ進む。</li>
        <li><b>遅いパワー</b>(遅)を使う。使ったカードは捨て札に。</li>
      </ol>
      <h3>侵略者の動き</h3>
      <ul>
        <li><b>探検</b>:カードの地形の土地のうち、沿岸か、町・都市がある(となりにある)土地に探検家が来る。</li>
        <li><b>建設</b>:侵略者がいる土地に町(町が都市より多ければ都市)が建つ。</li>
        <li><b>荒らし</b>:探検家1・町2・都市3のダメージ。2以上で<b>荒廃</b>が置かれ、ダハンも傷つく(2ダメージで1人)。生き残ったダハンは1人2ダメージ(やさしいでは3)で反撃する。荒廃がすでにある土地に荒廃が置かれると、となりに広がる。</li>
      </ul>
      <h3>パワーの言葉</h3>
      <ul>
        <li><b>範囲</b>:自分の存在がある土地からの距離。範囲0は存在がある土地。</li>
        <li><b>ダメージ</b>:探検家1・町2・都市3で破壊。町を壊すと恐怖1、都市は恐怖2。</li>
        <li><b>押し出す</b>:となりの土地へ動かす。<b>集める</b>:となりの土地から連れてくる。</li>
        <li><b>防御</b>:このターンの荒らしのダメージを減らす。</li>
        <li><b>元素</b>:使ったカードの元素がそろうと、固有パワーが自動で強くなる。</li>
      </ul>
      <h3>操作</h3>
      <ul>
        <li>ドラッグで回転、ホイール/ピンチで拡大、右ドラッグ(2本指)で移動。</li>
        <li>土地にカーソルを合わせると、駒の数が見られる。右上の丸いボタンでメニュー。</li>
      </ul>
      <p class="note">このゲームはボードゲーム「スピリット・アイランド」を題材にしたファンメイドの一人用アレンジです。カードや数値は独自に簡略化しています。</p>
      </div><div class="actions"><button class="btn primary" id="close">閉じる</button></div>`, 'sheet');
    box.querySelector('#close').addEventListener('click', () => this.closeModal('sheet'));
  }
}

export { invaderCardName };
