// ルールの本体。画面(ui)には「土地を選んで」「どれにする?」と問い合わせながら進む。
import {
  SPIRITS, MINOR_POWERS, FEAR_CARDS, SETUP, DIFFICULTY, PIECES, TERRAIN,
  buildInvaderDeck, invaderCardName, ELEMENT_KEYS, ELEMENTS,
} from './data.js';

export class GameOver extends Error {
  constructor(win, reason) { super(reason); this.win = win; this.reason = reason; }
}

const INVADER_TYPES = ['explorers', 'towns', 'cities'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(board, opts, ui) {
    this.ui = ui;
    this.board = board;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.difficultyKey = opts.difficulty;
    const def = SPIRITS.find(s => s.id === opts.spirit) || SPIRITS[0];
    this.turn = 0;
    this.phase = '準備';
    this.over = false;
    this.stats = { destroyed: 0, fearTotal: 0 };

    this.lands = board.lands.map(b => {
      const s = SETUP[b.num] || {};
      return {
        id: b.id, num: b.num, terrain: b.terrain, coastal: b.coastal, adj: b.adj,
        explorers: s.explorers || 0, towns: s.towns || 0, cities: s.cities || 0,
        dahan: s.dahan || 0, blight: s.blight || 0, presence: 0,
        defend: 0, skip: { ravage: false, build: false, explore: false },
      };
    });

    this.spirit = {
      def, name: def.name, color: def.color,
      energy: this.diff.startEnergy || 0,
      energyRevealed: 1, cardRevealed: 1,
      hand: def.cards.slice(), discard: [], played: [],
      gainedThisTurn: 0,
    };
    for (const n of def.setupPresence) this.landByNum(n).presence++;

    this.fear = { pool: 0, perCard: this.diff.fearPerCard, deck: shuffle(FEAR_CARDS).slice(0, 9), earned: [], resolved: [], terror: 1 };
    this.blight = { pool: this.diff.blight, flipped: false };
    this.invader = { deck: buildInvaderDeck(shuffle), explore: null, build: null, ravage: null, discard: [] };
    this.minorDeck = shuffle(MINOR_POWERS);
    this.minorDiscard = [];
  }

  // ---------- 便利な関数 ----------
  landByNum(n) { return this.lands.find(L => L.num === n); }
  land(id) { return this.lands[id]; }
  landName(L) { return `土地${L.num}(${TERRAIN[L.terrain].name})`; }
  invaderCount(L) { return L.explorers + L.towns + L.cities; }
  log(msg, cls) { this.ui.log(msg, cls); }
  update() { this.ui.update(this); }

  energyGain() { return this.spirit.def.energyTrack[this.spirit.energyRevealed - 1]; }
  cardPlays() { return this.spirit.def.cardTrack[this.spirit.cardRevealed - 1]; }
  totalPresence() { return this.lands.reduce((s, L) => s + L.presence, 0); }

  elements() {
    const el = Object.fromEntries(ELEMENT_KEYS.map(k => [k, 0]));
    for (const c of this.spirit.played) for (const e of c.el) el[e]++;
    return el;
  }
  innateLevels() {
    const el = this.elements();
    return this.spirit.def.innate.levels.map(lv => Object.entries(lv.need).every(([k, v]) => el[k] >= v));
  }

  // 灯りからの距離(距離)の内側にある土地
  landsInRange(range) {
    const dist = new Array(this.lands.length).fill(Infinity);
    const q = [];
    for (const L of this.lands) if (L.presence > 0) { dist[L.id] = 0; q.push(L.id); }
    for (let i = 0; i < q.length; i++) {
      const id = q[i];
      for (const n of this.lands[id].adj) {
        if (dist[n] > dist[id] + 1) { dist[n] = dist[id] + 1; q.push(n); }
      }
    }
    return this.lands.filter(L => dist[L.id] <= range);
  }

  matchesTarget(L, t) {
    switch (t) {
      case 'any': return true;
      case 'coastal': return L.coastal;
      case 'inland': return !L.coastal;
      case 'dahan': return L.dahan > 0;
      case 'invaders': return this.invaderCount(L) > 0;
      case 'blight': return L.blight > 0;
      case 'noblight': return L.blight === 0;
      default: return t.includes(L.terrain);
    }
  }

  // ---------- 勝ち負け ----------
  checkVictory() {
    if (this.over) return;
    const all = this.lands;
    const tl = this.fear.terror;
    let win = false, why = '';
    if (tl === 1 && all.every(L => this.invaderCount(L) === 0)) { win = true; why = '島から侵略者がすべていなくなった(恐怖レベル1の勝利条件)'; }
    if (tl === 2 && all.every(L => L.towns + L.cities === 0)) { win = true; why = '島から町と都市がすべてなくなった(恐怖レベル2の勝利条件)'; }
    if (tl === 3 && all.every(L => L.cities === 0)) { win = true; why = '島から都市がすべてなくなった(恐怖レベル3の勝利条件)'; }
    if (win) throw new GameOver(true, why);
  }
  checkPresence() {
    if (this.totalPresence() === 0) throw new GameOver(false, '島から精霊の灯りがすべて消えてしまった');
  }

  // ---------- 恐怖 ----------
  fx(kind, data) { if (this.ui.fx) this.ui.fx(kind, data); }

  addFear(n, L = this.fxLand) {
    this.fx('fear', { land: L ? L.id : null, n });
    for (let i = 0; i < n; i++) {
      this.fear.pool++;
      this.stats.fearTotal++;
      if (this.fear.pool >= this.fear.perCard) {
        this.fear.pool = 0;
        const card = this.fear.deck.shift();
        if (card) {
          this.fear.earned.push(card);
          this.log(`恐怖が${this.fear.perCard}たまり、恐怖カードを1枚獲得した(侵略者の手番のはじめに効果が出ます)`, 'fear');
          this.fx('fearCard', {});
        }
        const earnedTotal = 9 - this.fear.deck.length;
        const before = this.fear.terror;
        this.fear.terror = earnedTotal >= 6 ? 3 : earnedTotal >= 3 ? 2 : 1;
        if (this.fear.terror !== before) {
          this.log(`恐怖レベルが ${this.fear.terror} に上がった!勝利条件がやさしくなり、恐怖カードの効果も強くなります`, 'fear');
          this.fx('banner', { text: `恐怖レベル ${'ⅠⅡⅢ'[this.fear.terror - 1]}`, sub: '勝利条件がやさしくなった', kind: 'fear' });
        }
        if (this.fear.deck.length === 0) throw new GameOver(true, '侵略者は恐怖に耐えきれず、島から逃げ出した(恐怖カードをすべて獲得)');
      }
    }
    this.update();
    this.checkVictory();
  }

  // ---------- 駒の操作 ----------
  async damage(L, n) {
    let dmg = n;
    const killed = { explorers: 0, towns: 0, cities: 0 };
    while (dmg > 0) {
      if (L.cities > 0 && dmg >= 3) { L.cities--; dmg -= 3; killed.cities++; }
      else if (L.towns > 0 && dmg >= 2) { L.towns--; dmg -= 2; killed.towns++; }
      else if (L.explorers > 0) { L.explorers--; dmg -= 1; killed.explorers++; }
      else break;
    }
    this.fx('damage', { land: L.id, amount: n });
    this.afterKill(L, killed, `${n}ダメージ`);
  }

  destroy(L, type, n) {
    const k = Math.min(n, L[type]);
    if (k <= 0) return;
    L[type] -= k;
    if (type === 'dahan') { this.log(`${this.landName(L)}:島の民が${k}人倒れた`, 'bad'); this.fx('text', { land: L.id, text: `島の民 −${k}`, kind: 'bad' }); this.update(); return; }
    const killed = { explorers: 0, towns: 0, cities: 0 };
    killed[type] = k;
    this.afterKill(L, killed, '破壊');
  }

  afterKill(L, killed, what) {
    const parts = INVADER_TYPES.filter(t => killed[t] > 0).map(t => `${PIECES[t]}${killed[t]}`);
    const total = killed.explorers + killed.towns + killed.cities;
    this.stats.destroyed += total;
    if (parts.length) {
      this.log(`${this.landName(L)}:${what} → ${parts.join('・')}を破壊`, 'good');
      this.fx('text', { land: L.id, text: `${parts.join('・')} 破壊`, kind: 'good', delay: 250 });
    }
    else this.log(`${this.landName(L)}:${what}(破壊できる侵略者はいなかった)`);
    this.update();
    const fear = killed.towns * 1 + killed.cities * 2;
    if (fear) this.addFear(fear, L);
    this.checkVictory();
  }

  remove(L, type, n) {
    const k = Math.min(n, L[type]);
    L[type] -= k;
    if (k) {
      this.log(`${this.landName(L)}:${PIECES[type]}を${k}つ取り除いた(破壊ではないので恐怖は生まれない)`, 'good');
      this.fx('vanish', { land: L.id, kind: type, n: k });
    }
    this.update();
    this.checkVictory();
  }

  defend(L, n) {
    L.defend += n;
    this.log(`${this.landName(L)}:守り${n}(このターンの襲撃で受けるダメージが${n}減る)`);
    this.fx('shield', { land: L.id, text: `守り+${n}` });
    this.update();
  }
  skip(L, what) {
    L.skip[what] = true;
    const label = { ravage: '襲撃', build: '建設', explore: '探検' }[what];
    this.log(`${this.landName(L)}:次の${label}が起きない`);
    this.fx('text', { land: L.id, text: `${label}を封じた`, kind: 'calm' });
    this.update();
  }
  addDahan(L, n) { L.dahan += n; this.log(`${this.landName(L)}:島の民が${n}人加わった`, 'good'); this.fx('text', { land: L.id, text: `島の民 +${n}`, kind: 'good' }); this.update(); }
  gainEnergy(n) { this.spirit.energy += n; this.log(`エネルギー+${n}`); this.update(); }
  removeBlight(L) {
    if (L.blight <= 0) return;
    L.blight--; this.blight.pool++;
    this.log(`${this.landName(L)}:荒れ地を1つ取り除いた(荒れ地の残りが1つ増えた)`, 'good');
    this.fx('heal', { land: L.id });
    this.update();
  }

  async addBlight(L, fromCascade = false) {
    if (this.blight.pool <= 0) {
      if (!this.blight.flipped) {
        this.blight.flipped = true;
        this.blight.pool += this.diff.blightFlip;
        this.log(`荒れ地が尽き、島が「荒れ果てた島」になった。あと${this.diff.blightFlip}つで負けです`, 'bad');
        this.fx('banner', { text: '島が荒れ果てた', sub: `荒れ地はあと ${this.diff.blightFlip} つ`, kind: 'bad' });
        await this.ui.notice('島が荒れ果てた', `荒れ地カードがひっくり返りました。荒れ地はあと ${this.diff.blightFlip} つ。尽きたら負けです。`);
      } else {
        throw new GameOver(false, '島が荒れ地に覆いつくされた(荒れ地が尽きた)');
      }
    }
    this.blight.pool--;
    const had = L.blight > 0;
    L.blight++;
    this.log(`${this.landName(L)}:荒れ地が1つ置かれた(残り${this.blight.pool})`, 'bad');
    this.fx('blight', { land: L.id });
    if (L.presence > 0) {
      L.presence--;
      this.log(`${this.landName(L)}:荒れ地に飲まれて、精霊の灯りが1つ消えた`, 'bad');
      this.fx('text', { land: L.id, text: '灯りが消えた', kind: 'bad', delay: 300 });
      this.update();
      this.checkPresence();
    }
    this.update();
    // やさしい/ふつうでは、広がった先からさらに広がることはない(むずかしいは連鎖する)
    if (had && (!fromCascade || this.diff.chainCascade)) {
      const ids = L.adj;
      this.log(`荒れ地が広がる!(${this.landName(L)}にはもともと荒れ地があったため)`, 'bad');
      const dest = await this.ui.chooseLand({ ids, title: `荒れ地が ${this.landName(L)} から広がります(もともと荒れ地があった土地に、さらに荒れ地が置かれたため)。広がる先のとなりの土地を選んでください` });
      this.fx('cascade', { from: L.id, to: dest });
      await this.ui.pause(500);
      await this.addBlight(this.land(dest), true);
    }
  }

  // 追い払い:最大 n 個
  async push(L, types, n) {
    let moved = 0;
    while (moved < n) {
      const avail = types.filter(t => L[t] > 0);
      if (!avail.length) break;
      const type = await this.ui.chooseOption({
        title: `${this.landName(L)}から追い払う駒を選んでください(${moved}/${n})`,
        options: [...avail.map(t => ({ label: `${PIECES[t]}(${L[t]})`, value: t })), { label: '追い払いを終える', value: null, ghost: true }],
      });
      if (!type) break;
      const dest = await this.ui.chooseLand({ ids: L.adj, title: `${PIECES[type]}をどこへ追い払いますか?(となりの土地)`, optional: true });
      if (dest == null) break;
      const D = this.land(dest);
      this.fx('move', { from: L.id, to: D.id, kind: type });
      L[type]--; D[type]++;
      moved++;
      this.log(`${PIECES[type]}を ${this.landName(L)} → ${this.landName(D)} へ追い払った`);
      this.update();
    }
  }

  // 呼び寄せる:となりの土地から最大 n 個
  async gather(L, types, n) {
    let moved = 0;
    while (moved < n) {
      const src = L.adj.filter(id => types.some(t => this.land(id)[t] > 0));
      if (!src.length) break;
      const from = await this.ui.chooseLand({
        ids: src, optional: true,
        title: `${this.landName(L)}へ呼び寄せる元の土地を選んでください(${moved}/${n}:${types.map(t => PIECES[t]).join('・')})`,
      });
      if (from == null) break;
      const S = this.land(from);
      const avail = types.filter(t => S[t] > 0);
      let type = avail[0];
      if (avail.length > 1) {
        type = await this.ui.chooseOption({ title: '呼び寄せる駒を選んでください', options: avail.map(t => ({ label: PIECES[t], value: t })) });
      }
      this.fx('move', { from: S.id, to: L.id, kind: type });
      S[type]--; L[type]++;
      moved++;
      this.log(`${PIECES[type]}を ${this.landName(S)} → ${this.landName(L)} へ呼び寄せた`);
      this.update();
    }
  }

  // ---------- 恐怖カード用 ----------
  async removeChoice(types, n, filter = () => true) {
    for (let i = 0; i < n; i++) {
      const ids = this.lands.filter(L => filter(L) && types.some(t => L[t] > 0)).map(L => L.id);
      if (!ids.length) return;
      const id = await this.ui.chooseLand({ ids, optional: true, title: `${types.map(t => PIECES[t]).join('か')}を取り除く土地を選んでください(${i + 1}/${n})` });
      if (id == null) return;
      const L = this.land(id);
      const avail = types.filter(t => L[t] > 0);
      let type = avail[0];
      if (avail.length > 1) type = await this.ui.chooseOption({ title: '取り除く駒を選んでください', options: avail.map(t => ({ label: `${PIECES[t]}(${L[t]})`, value: t })) });
      this.remove(L, type, 1);
    }
  }
  async pushChoice(types, n) {
    const ids = this.lands.filter(L => types.some(t => L[t] > 0)).map(L => L.id);
    if (!ids.length) return;
    const id = await this.ui.chooseLand({ ids, optional: true, title: '追い払う土地を選んでください' });
    if (id == null) return;
    await this.push(this.land(id), types, n);
  }
  async skipChoice(what, n) {
    const label = { ravage: '襲撃', build: '建設', explore: '探検' }[what];
    for (let i = 0; i < n; i++) {
      const ids = this.lands.filter(L => !L.skip[what]).map(L => L.id);
      const id = await this.ui.chooseLand({ ids, optional: true, title: `${label}が起きない土地を選んでください(${i + 1}/${n})` });
      if (id == null) return;
      this.skip(this.land(id), what);
    }
  }
  async dahanStrike(per, all) {
    const ids = this.lands.filter(L => L.dahan > 0 && this.invaderCount(L) > 0).map(L => L.id);
    if (!ids.length) { this.log('島の民と侵略者が同じ土地にいなかった'); return; }
    if (all) { for (const id of ids) { const L = this.land(id); await this.damage(L, L.dahan * per); } return; }
    const id = await this.ui.chooseLand({ ids, title: '島の民が反撃する土地を選んでください' });
    const L = this.land(id);
    await this.damage(L, L.dahan * per);
  }
  async dahanDefend(n) {
    for (const L of this.lands) {
      if (L.dahan <= 0) continue;
      if (n >= 99) { L.skip.ravage = true; } else L.defend += n;
    }
    this.log(n >= 99 ? '島の民のいる土地では襲撃が起きない' : `島の民のいるすべての土地で守り${n}`);
    this.update();
  }
  async defendChoice(n) {
    const ids = this.lands.filter(L => this.invaderCount(L) > 0).map(L => L.id);
    if (!ids.length) return;
    const id = await this.ui.chooseLand({ ids, title: `守り${n}を得る土地を選んでください` });
    this.defend(this.land(id), n);
  }
  async downgrade(types, n) {
    for (let i = 0; i < n; i++) {
      const ids = this.lands.filter(L => types.some(t => L[t] > 0)).map(L => L.id);
      if (!ids.length) return;
      const id = await this.ui.chooseLand({ ids, optional: true, title: `小さく置きかえる${types.map(t => PIECES[t]).join('か')}がある土地を選んでください` });
      if (id == null) return;
      const L = this.land(id);
      const avail = types.filter(t => L[t] > 0);
      let type = avail[0];
      if (avail.length > 1) type = await this.ui.chooseOption({ title: 'どれを置きかえますか?', options: avail.map(t => ({ label: PIECES[t], value: t })) });
      L[type]--;
      this.fx('text', { land: L.id, text: type === 'cities' ? '都市→町' : '町→探検家', kind: 'good' });
      if (type === 'cities') { L.towns++; this.log(`${this.landName(L)}:都市を町に置きかえた`, 'good'); }
      else { L.explorers++; this.log(`${this.landName(L)}:町を探検家に置きかえた`, 'good'); }
      this.update();
      this.checkVictory();
    }
  }

  // ---------- ゲームの流れ ----------
  async run() {
    try {
      this.log(`ゲーム開始:精霊「${this.spirit.name}」/ 難易度 ${this.diff.label}`, 'head');
      this.phase = '準備:最初の探検';
      this.update();
      await this.exploreStep();
      if (this.diff.extraExplore) { this.advanceCards(); await this.exploreStep(); }
      this.advanceCards();
      while (!this.over) {
        this.turn++;
        this.log(`―― ターン ${this.turn} ――`, 'head');
        await this.spiritPhase();
        await this.resolvePowers('fast');
        await this.invaderPhase();
        await this.resolvePowers('slow');
        this.timePasses();
      }
    } catch (e) {
      if (e instanceof GameOver) {
        this.over = true;
        this.update();
        this.ui.gameOver(e.win, e.reason, this);
      } else {
        console.error(e);
        this.ui.notice('エラー', 'ゲームの途中で問題が起きました:' + e.message);
      }
    }
  }

  setPhase(p) { this.phase = p; this.update(); }

  async spiritPhase() {
    const sp = this.spirit;
    this.setPhase('成長');
    const def = sp.def;
    const choice = await this.ui.chooseOption({
      title: '成長:精霊の育て方を1つ選んでください',
      options: def.growth.map((g, i) => ({ label: g.label, value: i })),
    });
    const growth = def.growth[choice];
    this.log(`成長:${growth.label}`);
    for (const a of growth.actions) {
      if (a.type === 'reclaim') {
        sp.hand.push(...sp.discard); sp.discard = [];
        this.log('使ったカードを手札にもどした');
      } else if (a.type === 'energy') {
        sp.energy += a.n;
      } else if (a.type === 'gainCard') {
        await this.gainPowerCard();
      } else if (a.type === 'presence') {
        await this.addPresence(a.range);
      }
      this.update();
    }
    const gain = this.energyGain();
    sp.energy += gain;
    this.log(`エネルギー+${gain}(合計 ${sp.energy})`);
    this.setPhase('パワーカードを選ぶ');
    const picked = await this.ui.selectCards(this);
    for (const c of picked) {
      sp.energy -= c.cost;
      sp.hand.splice(sp.hand.indexOf(c), 1);
      sp.played.push(c);
    }
    if (picked.length) this.log(`カードを使う:${picked.map(c => c.name).join('、')}`);
    else this.log('このターンはカードを使わない');
    this.update();
  }

  async gainPowerCard() {
    const drawn = [];
    for (let i = 0; i < 4; i++) {
      if (!this.minorDeck.length) { this.minorDeck = shuffle(this.minorDiscard); this.minorDiscard = []; }
      const c = this.minorDeck.shift();
      if (c) drawn.push(c);
    }
    if (!drawn.length) return;
    const pick = await this.ui.chooseOption({
      title: 'パワーカードを獲得:1枚選んで手札に加えます',
      options: drawn.map((c, i) => ({ label: c.name, value: i, card: c })),
      modal: true,
    });
    const card = drawn[pick];
    this.spirit.hand.push(card);
    drawn.forEach((c, i) => { if (i !== pick) this.minorDiscard.push(c); });
    this.log(`パワーカード「${card.name}」を獲得`);
  }

  async addPresence(range) {
    const sp = this.spirit, def = sp.def;
    const opts = [];
    if (sp.energyRevealed < def.energyTrack.length) opts.push({ label: `エネルギーの列から(毎ターンのエネルギーが ${def.energyTrack[sp.energyRevealed]} に)`, value: 'energy' });
    if (sp.cardRevealed < def.cardTrack.length) opts.push({ label: `カードの列から(使えるカードが ${def.cardTrack[sp.cardRevealed]} 枚に)`, value: 'card' });
    if (!opts.length) { this.log('置ける灯りが残っていない'); return; }
    const track = await this.ui.chooseOption({ title: `灯りを置く(距離${range}):どちらの列から灯りを取りますか?取った場所の数字があらわれ、次のターンから使えます`, options: opts });
    const ids = this.landsInRange(range).map(L => L.id);
    const id = await this.ui.chooseLand({ ids, title: `灯りを置く土地を選んでください(今ある灯りから距離${range})` });
    if (track === 'energy') sp.energyRevealed++; else sp.cardRevealed++;
    const L = this.land(id);
    L.presence++;
    this.log(`${this.landName(L)}に灯りを置いた`, 'good');
    this.fx('text', { land: L.id, text: '灯りがともった', kind: 'spirit' });
    this.update();
    await this.ui.pause(300);
  }

  async resolvePowers(speed) {
    const label = speed === 'fast' ? '先手パワー' : '後手パワー';
    this.setPhase(label);
    const pending = this.spirit.played.filter(c => c.speed === speed).map(c => ({ kind: 'card', card: c, name: c.name }));
    const inn = this.spirit.def.innate;
    if (inn.speed === speed && this.innateLevels().some(Boolean)) pending.push({ kind: 'innate', name: `${inn.name}(特技)`, card: inn });
    while (pending.length) {
      let idx = 0;
      if (pending.length > 1) {
        idx = await this.ui.chooseOption({
          title: `${label}:次に使うパワーを選んでください`,
          options: pending.map((p, i) => ({ label: p.name, value: i })),
        });
      }
      const p = pending.splice(idx, 1)[0];
      await this.usePower(p);
    }
  }

  async usePower(p) {
    const c = p.card;
    const ids = this.landsInRange(c.range).filter(L => this.matchesTarget(L, c.target)).map(L => L.id);
    if (!ids.length) { this.log(`「${p.name}」:距離に対象の土地がないため使えなかった`); return; }
    const id = await this.ui.chooseLand({
      ids, optional: true, optionalLabel: '使わない',
      title: `「${p.name}」の対象の土地を選んでください(距離${c.range})`,
      card: p.kind === 'card' ? c : null,
    });
    if (id == null) { this.log(`「${p.name}」は使わなかった`); return; }
    const L = this.land(id);
    this.log(`「${p.name}」→ ${this.landName(L)}`, 'power');
    this.ui.flash([id], 'power');
    this.fx('power', { land: id, text: p.kind === 'card' ? c.name : c.name });
    await this.ui.pause(450);
    this.fxLand = L;
    try {
      if (p.kind === 'card') {
        await c.effect(this, L, c);
      } else {
        const met = this.innateLevels();
        for (let i = 0; i < c.levels.length; i++) if (met[i]) await c.levels[i].effect(this, L);
      }
    } finally { this.fxLand = null; }
    this.update();
    await this.ui.pause(600);
  }

  async invaderPhase() {
    this.setPhase('侵略者:恐怖カード');
    while (this.fear.earned.length) {
      const card = this.fear.earned.shift();
      const tl = this.fear.terror;
      await this.ui.showFear(card, tl);
      this.fx('flash', { kind: 'fear' });
      this.log(`恐怖カード「${card.name}」(レベル${tl}):${card.levels[tl - 1].text}`, 'fear');
      await card.levels[tl - 1].effect(this);
      this.fear.resolved.push(card);
      this.update();
    }

    if (this.invader.ravage) {
      this.setPhase(`侵略者:襲撃(${invaderCardName(this.invader.ravage)})`);
      this.fx('banner', { text: '襲撃', sub: `${invaderCardName(this.invader.ravage)}の土地`, kind: 'ravage' });
      await this.ui.pause(700);
      const targets = this.lands.filter(L => this.cardMatches(this.invader.ravage, L));
      for (const L of targets) await this.ravage(L);
    }
    if (this.invader.build) {
      this.setPhase(`侵略者:建設(${invaderCardName(this.invader.build)})`);
      this.fx('banner', { text: '建設', sub: `${invaderCardName(this.invader.build)}の土地`, kind: 'build' });
      await this.ui.pause(700);
      const targets = this.lands.filter(L => this.cardMatches(this.invader.build, L));
      for (const L of targets) await this.build(L);
    }
    this.setPhase('侵略者:探検');
    await this.exploreStep();
    this.advanceCards();
  }

  cardMatches(card, L) { return card.coastal ? L.coastal : card.terrains.includes(L.terrain); }

  async ravage(L) {
    const n = this.invaderCount(L);
    if (!n) return;
    this.ui.flash([L.id], 'ravage');
    if (L.skip.ravage) {
      this.log(`${this.landName(L)}:襲撃は起きなかった(封じられていた)`, 'good');
      this.fx('text', { land: L.id, text: '襲撃を防いだ', kind: 'calm' });
      await this.ui.pause(600); return;
    }
    const raw = L.explorers + L.towns * 2 + L.cities * 3;
    const dmg = Math.max(0, raw - L.defend);
    const calc = [L.explorers && `探検家${L.explorers}×1`, L.towns && `町${L.towns}×2`, L.cities && `都市${L.cities}×3`].filter(Boolean).join('+');
    this.log(`${this.landName(L)}:襲撃!ダメージ ${dmg}(${calc}${L.defend ? ` − 守り${Math.min(raw, L.defend)}` : ''})`, 'bad');
    this.fx('ravage', { land: L.id, amount: dmg });
    await this.ui.pause(700);
    if (dmg >= 2) {
      this.log(`ダメージが2以上なので、${this.landName(L)}に荒れ地が置かれる`, 'bad');
      await this.addBlight(L);
      await this.ui.pause(400);
    } else this.log(`ダメージが2未満なので、荒れ地は置かれない`);
    const dead = Math.min(L.dahan, Math.floor(dmg / 2));
    if (dead) { this.destroy(L, 'dahan', dead); await this.ui.pause(400); }
    if (L.dahan > 0) {
      const hit = this.diff.dahanHit || 2;
      this.log(`${this.landName(L)}:生き残った島の民${L.dahan}人が反撃(1人${hit}ダメージ、合計${L.dahan * hit})`, 'good');
      this.fx('counter', { land: L.id, text: `島の民の反撃 ${L.dahan * hit}` });
      await this.ui.pause(500);
      this.fxLand = L;
      await this.damage(L, L.dahan * hit);
      this.fxLand = null;
    }
    this.update();
    await this.ui.pause(500);
  }

  async build(L) {
    if (this.invaderCount(L) === 0) return;
    this.ui.flash([L.id], 'build');
    if (L.skip.build) {
      this.log(`${this.landName(L)}:建設は起きなかった(封じられていた)`, 'good'); L.skip.build = false;
      this.fx('text', { land: L.id, text: '建設を防いだ', kind: 'calm' });
      await this.ui.pause(600); return;
    }
    if (L.towns > L.cities) { L.cities++; this.log(`${this.landName(L)}:都市が建った(町が都市より多いため)`, 'bad'); this.fx('build', { land: L.id, text: '都市が建った' }); }
    else { L.towns++; this.log(`${this.landName(L)}:町が建った`, 'bad'); this.fx('build', { land: L.id, text: '町が建った' }); }
    this.update();
    await this.ui.pause(700);
  }

  async exploreStep() {
    const card = this.invader.deck.shift();
    if (!card) throw new GameOver(false, '時間切れ:侵略者カードが尽き、侵略者が島に根づいてしまった');
    this.invader.explore = card;
    this.log(`探検:${invaderCardName(card)}(ステージ${card.stage})`, 'bad');
    const targets = this.lands.filter(L => this.cardMatches(card, L));
    const ok = targets.filter(L => L.coastal || L.towns + L.cities > 0 ||
      L.adj.some(id => this.land(id).towns + this.land(id).cities > 0));
    this.update();
    this.ui.flash(targets.map(L => L.id), 'explore');
    this.fx('banner', { text: '探検', sub: `${invaderCardName(card)}の土地`, kind: 'explore' });
    await this.ui.pause(700);
    for (const L of targets) if (!ok.includes(L)) this.log(`${this.landName(L)}:探検家は来なかった(海に面しておらず、近くに町・都市もないため)`);
    for (const L of ok) {
      if (L.skip.explore) {
        this.log(`${this.landName(L)}:探検は起きなかった(封じられていた)`, 'good'); L.skip.explore = false;
        this.fx('text', { land: L.id, text: '探検を防いだ', kind: 'calm' });
        continue;
      }
      const why = L.coastal ? '海に面しているため' : L.towns + L.cities > 0 ? 'この土地に町・都市があるため' : 'となりに町・都市があるため';
      this.fx('explore', { land: L.id });
      L.explorers++;
      this.log(`${this.landName(L)}:探検家がやってきた(${why})`, 'bad');
      this.update();
      await this.ui.pause(350);
    }
    if (!ok.length) this.log('探検できる土地がなかった');
    this.update();
    await this.ui.pause(400);
  }

  advanceCards() {
    const inv = this.invader;
    if (inv.ravage) inv.discard.push(inv.ravage);
    inv.ravage = inv.build;
    inv.build = inv.explore;
    inv.explore = null;
    this.update();
  }

  timePasses() {
    const sp = this.spirit;
    sp.discard.push(...sp.played);
    sp.played = [];
    for (const L of this.lands) {
      L.defend = 0;
      L.skip.ravage = false;
    }
    this.update();
  }
}

export { ELEMENTS };
