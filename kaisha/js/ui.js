// 画面(社内ポータル風)。タブ・チャット・ログ・社員情報・新聞

import { el, esc, man, clamp } from './util.js';
import { dateOf, dayIndex, fmtDate, fmtTime, WD, minuteOfDay, companyOff, holidayName, fiscalLabel, fiscalYear, weatherIcon } from './calendar.js';
import { full, titleShort, personalityLines, moodWord, bossOf } from './people.js';
import { rel, ROLE_LABEL } from './world.js';
import { nodes, placeInfo } from './map.js';
import { drawMonthly, spark } from './charts.js';
import { creditScore, totalDebt, projectMonthEnd, trailingOrd } from './business.js';
import { personLook } from './view3d.js';
import { PAPER } from './text/news.js';

const CH_NAME = { all: '全体連絡', eigyo: '営業部', butsuryu: '物流・倉庫', soumu: '総務・経理', zatsudan: '雑談' };
const DEPT_ORDER = ['役員', '総務経理部', '営業部', '営業一課', '営業二課', '購買部', '物流部'];
const DEPT_COL = { '役員': '#6b2d2d', '総務経理部': '#4a5a2a', '営業部': '#24466e', '営業一課': '#2c5d8f', '営業二課': '#3a6e7a', '購買部': '#6a4a7a', '物流部': '#7a5a2a' };

export class UI {
  constructor(hooks) {
    this.h = hooks; this.w = null;
    this.tab = 'chat'; this.ch = 'all'; this.dm = null;
    this.$ = id => document.getElementById(id);
    this.unread = {};
    this.logFilter = 'all';
    this.bindStatic();
  }
  setWorld(w) { this.w = w; this.renderTab(); this.renderLog(true); }
  P(id) { return this.w.people.find(p => p.id === id); }

  bindStatic() {
    document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderTab(); }));
    document.querySelectorAll('#floorbar button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('#floorbar button').forEach(x => x.classList.toggle('on', x === b));
      this.h.floor(+b.dataset.f);
    }));
    document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.s === 'skip') { this.h.skip(); return; }
      this.h.speed(+b.dataset.s); this.markSpeed(+b.dataset.s);
    }));
    document.querySelectorAll('#logfilter button').forEach(b => b.addEventListener('click', () => {
      this.logFilter = b.dataset.f; document.querySelectorAll('#logfilter button').forEach(x => x.classList.toggle('on', x === b)); this.renderLog(true);
    }));
    this.$('paperbadge').addEventListener('click', () => { this.tab = 'paper'; this.renderTab(); this.$('paperbadge').hidden = true; });
    this.$('modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.classList.contains('x')) this.closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.closeModal(); });
    this.$('menu-new').addEventListener('click', () => this.confirmNew());
  }
  markSpeed(s) { document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', +x.dataset.s === s)); }

  // ---------- 上の帯 ----------
  tickHeader() {
    const w = this.w; const d = dateOf(dayIndex(w.t));
    const off = companyOff(d); const hol = holidayName(d.y, d.m, d.d);
    this.$('clock').innerHTML = `${d.y}年${d.m}月${d.d}日(<span class="${d.wd === 0 || hol ? 'sun' : d.wd === 6 ? 'sat' : ''}">${WD[d.wd]}</span>) <b>${fmtTime(w.t)}</b>${off && off !== '日曜' && off !== '土曜' ? ` <span class="off">${off}</span>` : ''}`;
    const wx = w.weather;
    if (wx) this.$('wx').innerHTML = `新潟市 ${wx.kind} ${wx.temp.toFixed(0)}℃${wx.snowDepth ? ` 積雪${wx.snowDepth}cm` : ''}`;
    const inn = w.people.filter(p => p.status === 'active' && p.today?.in);
    const out = inn.filter(p => !p.at).length;
    this.$('presence').textContent = `在社 ${inn.length - out}名・外出 ${out}名`;
    this.$('cash').textContent = `現預金 ${man(w.fin.cash)}万円`;
    this.$('cash').classList.toggle('bad', w.fin.cash < 3e7);
  }

  // ---------- 出来事ログ ----------
  onLog(e) {
    if (!this.w) return;
    if (this.logFilter === 'big' && e.lvl < 2) return;
    if (this.logFilter === 'biz' && !['業績', '取引', '金融', '経営', '品質', '物流'].includes(e.cat)) return;
    const body = this.$('logbody');
    body.prepend(this.logRow(e));
    while (body.children.length > 250) body.lastChild.remove();
    if (e.lvl >= 3) this.flash(e.text);
  }
  logRow(e) {
    const d = dateOf(dayIndex(e.t));
    const tr = el('tr', { class: 'lv' + e.lvl });
    tr.append(el('td', { class: 'tm' }, `${d.m}/${d.d} ${fmtTime(e.t)}`), el('td', { class: 'cat' }, el('span', { class: 'cat-' + (e.cat || '') }, e.cat)), el('td', {}, e.text));
    if (e.who?.length) { tr.classList.add('link'); tr.addEventListener('click', () => this.h.select(e.who[0], true)); }
    return tr;
  }
  renderLog(full) {
    const body = this.$('logbody'); body.innerHTML = '';
    const list = this.w.logs.filter(e => this.logFilter === 'all' || (this.logFilter === 'big' ? e.lvl >= 2 : ['業績', '取引', '金融', '経営', '品質', '物流'].includes(e.cat)));
    for (const e of list.slice(-200).reverse()) body.append(this.logRow(e));
  }
  flash(text) {
    const h = this.$('headline');
    h.textContent = text; h.hidden = false; h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
    clearTimeout(this.flashT); this.flashT = setTimeout(() => { h.hidden = true; }, 9000);
  }

  // ---------- タブ ----------
  renderTab() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const box = this.$('tabbody'); box.innerHTML = ''; box.scrollTop = 0;
    const f = { chat: this.tabChat, talk: this.tabTalk, board: this.tabBoard, nippo: this.tabNippo, biz: this.tabBiz, people: this.tabPeople, clients: this.tabClients, paper: this.tabPaper }[this.tab];
    f.call(this, box);
    if (this.tab === 'chat') { this.unread[this.chKey()] = 0; }
    this.updateBadges();
  }
  refreshLight() { // 定期的に、数字の多いタブだけ描き直す
    if (['biz', 'people', 'clients'].includes(this.tab)) { const st = this.$('tabbody').scrollTop; this.renderTab(); this.$('tabbody').scrollTop = st; }
  }
  updateBadges() {
    const tot = Object.values(this.unread).reduce((s, v) => s + v, 0);
    const b = document.querySelector('#tabs button[data-tab="chat"] .badge'); if (b) { b.textContent = tot > 99 ? '99+' : tot; b.hidden = !tot; }
  }

  // チャット
  chKey() { return this.ch === 'dm' ? 'dm:' + this.dm : this.ch; }
  tabChat(box) {
    const w = this.w;
    const wrap = el('div', { class: 'chat' });
    const list = el('div', { class: 'chlist' });
    const addCh = (key, label, cnt) => {
      const a = el('button', { class: 'ch' + (this.chKey() === key ? ' on' : '') }, label, cnt ? el('span', { class: 'n' }, cnt) : '');
      a.addEventListener('click', () => { if (key.startsWith('dm:')) { this.ch = 'dm'; this.dm = key.slice(3); } else { this.ch = key; this.dm = null; } this.renderTab(); });
      list.append(a);
    };
    list.append(el('div', { class: 'chh' }, 'チャンネル'));
    for (const [k, v] of Object.entries(CH_NAME)) addCh(k, '# ' + v, this.unread[k]);
    list.append(el('div', { class: 'chh' }, '個別メッセージ'));
    const dms = Object.entries(w.channels.dm).sort((a, b) => (b[1].at(-1)?.t || 0) - (a[1].at(-1)?.t || 0)).slice(0, 40);
    for (const [k, arr] of dms) {
      const [a, b] = k.split('|').map(id => this.P(id)); if (!a || !b) continue;
      addCh('dm:' + k, `${a.sei}・${b.sei}`, this.unread['dm:' + k]);
    }
    if (!dms.length) list.append(el('div', { class: 'dim small' }, 'まだありません'));
    const sel = el('select', { class: 'chsel', id: 'chsel' });
    for (const [k, v] of Object.entries(CH_NAME)) sel.append(el('option', { value: k }, '# ' + v));
    for (const [k] of dms) { const [a, b] = k.split('|').map(id => this.P(id)); if (a && b) sel.append(el('option', { value: 'dm:' + k }, `個別:${a.sei}・${b.sei}`)); }
    sel.value = this.chKey();
    sel.addEventListener('change', () => { const v = sel.value; if (v.startsWith('dm:')) { this.ch = 'dm'; this.dm = v.slice(3); } else { this.ch = v; this.dm = null; } this.renderTab(); });
    const main = el('div', { class: 'chmain' });
    const title = this.ch === 'dm' ? (() => { const [a, b] = this.dm.split('|').map(id => this.P(id)); return `個別メッセージ:${a ? full(a) : '?'} と ${b ? full(b) : '?'}`; })() : '# ' + CH_NAME[this.ch];
    main.append(el('div', { class: 'chtitle' }, title, this.ch === 'dm' ? el('span', { class: 'note' }, '※管理者権限で閲覧中') : ''));
    const msgs = el('div', { class: 'msgs', id: 'msgs' });
    const arr = this.ch === 'dm' ? (w.channels.dm[this.dm] || []) : w.channels[this.ch];
    for (const m of arr.slice(-150)) msgs.append(this.msgEl(m));
    main.append(msgs);
    wrap.append(list, el('div', { class: 'chright' }, sel, main));
    box.append(wrap);
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
  }
  msgEl(m) {
    const p = this.P(m.from);
    const d = dateOf(dayIndex(m.t));
    const row = el('div', { class: 'msg' });
    const av = el('div', { class: 'av', style: `background:${DEPT_COL[p?.dept] || '#555'}` }, p ? p.sei[0] : '?');
    av.addEventListener('click', () => p && this.h.select(p.id, true));
    const elapsed = this.w.t - m.t;
    const members = m.ch === 'dm' ? 1 : m.ch === 'all' || m.ch === 'zatsudan' ? this.w.people.filter(q => q.status === 'active').length - 1 : 9;
    const read = Math.min(members, Math.floor(Math.sqrt(Math.max(0, elapsed)) * 2.2));
    const head = el('div', { class: 'mh' }, el('b', {}, p ? full(p) : '(退職者)'), el('span', { class: 'mt' }, `${p ? (p.title || p.dept) : ''}  ${d.m}/${d.d} ${fmtTime(m.t)}`));
    const body = el('div', { class: 'mb' + (m.text.startsWith('[スタンプ') ? ' stamp' : '') });
    body.textContent = m.text;
    const r = el('div', { class: 'read' }, m.ch === 'dm' ? (elapsed > 3 ? '既読' : '') : read ? `既読 ${read}` : '');
    row.append(av, el('div', { class: 'mc' }, head, body, r));
    return row;
  }
  onChat(m) {
    if (!this.w) return;
    const key = m.ch === 'dm' ? 'dm:' + m.dm.slice().sort().join('|') : m.ch;
    if (this.tab === 'chat' && this.chKey() === key) {
      const box = this.$('msgs'); if (!box) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      box.append(this.msgEl(m)); while (box.children.length > 160) box.firstChild.remove();
      if (atBottom) box.scrollTop = box.scrollHeight;
    } else {
      this.unread[key] = (this.unread[key] || 0) + 1;
      this.updateBadges();
    }
  }

  // 会話(立ち話)
  tabTalk(box) {
    box.append(el('div', { class: 'tabnote' }, '社内で交わされた声。3Dの吹き出しと同じものが残ります。'));
    const t = el('table', { class: 'grid talk', id: 'talktable' });
    t.append(el('tr', {}, el('th', {}, '時刻'), el('th', {}, '場所'), el('th', {}, '発言')));
    for (const e of this.w.talks.slice(-150).reverse()) t.append(this.talkRow(e));
    box.append(t);
  }
  talkRow(e) {
    const p = this.P(e.from); const to = e.to && this.P(e.to);
    const tr = el('tr', {});
    tr.append(el('td', { class: 'tm' }, fmtTime(e.t)), el('td', { class: 'pl' }, placeInfo[e.place]?.name || islandName(e.place) || ''), el('td', {}, el('b', {}, p ? p.sei : '?'), to ? el('span', { class: 'dim' }, ` → ${to.sei}`) : '', '「', e.text, '」'));
    tr.addEventListener('click', () => p && this.h.select(p.id, true));
    return tr;
  }
  onTalk(e) {
    if (this.tab !== 'talk') return;
    const t = this.$('talktable'); if (!t) return;
    t.insertBefore(this.talkRow(e), t.children[1] || null);
    while (t.children.length > 200) t.lastChild.remove();
  }

  // 掲示板
  tabBoard(box) {
    const w = this.w;
    box.append(el('div', { class: 'pagehead' }, '社内掲示板', el('span', { class: 'dim' }, `  ${w.board.length}件`)));
    const t = el('table', { class: 'grid board' });
    t.append(el('tr', {}, el('th', {}, '区分'), el('th', {}, '件名'), el('th', {}, '掲載者'), el('th', {}, '日付')));
    for (const b of w.board.slice(0, 80)) {
      const a = this.P(b.author); const d = dateOf(b.day);
      const tr = el('tr', { class: 'link' }, el('td', {}, el('span', { class: 'tag t-' + b.type }, b.type)), el('td', {}, b.title), el('td', {}, a ? a.sei : '総務部'), el('td', { class: 'tm' }, `${d.m}/${d.d}`));
      tr.addEventListener('click', () => this.openPost(b));
      t.append(tr);
    }
    if (!w.board.length) t.append(el('tr', {}, el('td', { colspan: 4, class: 'dim' }, '掲示はまだありません')));
    box.append(t);
  }
  openPost(b) {
    const a = this.P(b.author); const d = dateOf(b.day);
    const body = el('div', { class: 'post' });
    body.append(el('div', { class: 'meta' }, `掲載:${a ? a.dept + ' ' + full(a) : '総務部'}  ${fmtDate(d)} ${fmtTime(b.t)}`));
    if (b.rec) body.append(this.monthTable(b.rec));
    else body.append(el('pre', {}, b.body));
    this.modal(`掲示板 ― ${b.title}`, body);
  }
  monthTable(r) {
    const t = el('table', { class: 'grid fin' });
    const row = (k, v, cls = '') => t.append(el('tr', { class: cls }, el('th', {}, k), el('td', { class: 'num' + (v < 0 ? ' neg' : '') }, man(v) + ' 万円')));
    row('売上高', r.sales); row('売上原価', r.cogs); row('売上総利益', r.gp, 'sub');
    t.append(el('tr', {}, el('th', {}, '粗利率'), el('td', { class: 'num' }, (r.gpr * 100).toFixed(1) + ' %')));
    for (const [k, v] of Object.entries(r.sgaItems).sort((a, b) => b[1] - a[1])) row('  ' + k, v, 'indent');
    row('販売費及び一般管理費 計', r.sga, 'sub'); row('営業利益', r.op, 'sub'); row('支払利息', r.interest); row('営業外収益', r.nonop); row('経常利益', r.ord, 'sub');
    if (r.special) row('特別損益', r.special);
    row('月末 現預金残高', r.cash, 'sub'); row('借入金残高', r.debt); row('売掛金残高', r.ar);
    return t;
  }

  // 日報
  tabNippo(box) {
    const w = this.w;
    box.append(el('div', { class: 'pagehead' }, '営業日報'));
    if (!w.nippo?.length) { box.append(el('div', { class: 'dim pad' }, '日報は夕方に提出されます')); return; }
    for (const n of w.nippo.slice(0, 40)) {
      const p = this.P(n.author); const d = dateOf(n.day);
      const card = el('div', { class: 'nippo' });
      card.append(el('div', { class: 'nh' }, el('b', {}, p ? full(p) : '?'), el('span', { class: 'dim' }, `  ${p?.dept || ''}  ${d.m}/${d.d}(${WD[d.wd]}) ${fmtTime(n.t)}提出`)));
      card.append(el('pre', {}, n.body));
      if (n.comment) { const c = this.P(n.comment.by); card.append(el('div', { class: 'cm' }, `${c ? c.sei + titleShort(c) : ''}のコメント:${n.comment.text}`)); }
      box.append(card);
    }
  }

  // 業績
  tabBiz(box) {
    const w = this.w, f = w.fin;
    const d = dateOf(dayIndex(w.t));
    const head = el('div', { class: 'pagehead' }, '業績照会', el('span', { class: 'dim' }, `  ${fiscalLabel(fiscalYear(d))}  ${d.m}月度`));
    box.append(head);
    const kp = el('table', { class: 'grid kpi' });
    const debt = totalDebt(w); const sc = creditScore(w);
    const rows = [
      ['今月の売上(累計)', man(f.mtd.sales) + ' 万円'], ['今月の粗利(累計)', man(f.mtd.sales - f.mtd.cogs) + ' 万円'],
      ['現預金残高', man(f.cash) + ' 万円', f.cash < 3e7 ? 'neg' : ''], ['今月末の資金見込み', man(projectMonthEnd(w)) + ' 万円', projectMonthEnd(w) < 2e7 ? 'neg' : ''],
      ['借入金残高', man(debt) + ' 万円'], ['直近12か月の経常利益', man(trailingOrd(w, 12)) + ' 万円', trailingOrd(w, 12) < 0 ? 'neg' : ''],
      ['銀行の見立て(推定)', sc >= 60 ? '正常先' : sc >= 45 ? '正常先(下位)' : sc >= 32 ? '要注意先' : '要管理先〜破綻懸念', sc < 45 ? 'neg' : ''],
      ['在籍人数', w.people.filter(p => p.status === 'active').length + ' 名(休職・産休 ' + w.people.filter(p => p.status === 'leave').length + ' 名)'],
    ];
    for (const [k, v, c] of rows) kp.append(el('tr', {}, el('th', {}, k), el('td', { class: 'num ' + (c || '') }, v)));
    box.append(kp);
    const cv = el('canvas', { class: 'chart' }); box.append(el('div', { class: 'sec' }, '月次推移(売上・営業利益・現預金)'), cv);
    requestAnimationFrame(() => drawMonthly(cv, f.hist));
    const t = el('table', { class: 'grid mon' });
    t.append(el('tr', {}, ...['年月', '売上', '粗利率', '販管費', '営業利益', '経常', '月末現預金'].map(x => el('th', {}, x))));
    for (const r of f.hist.slice(-12).reverse()) {
      const tr = el('tr', { class: 'link' }, el('td', {}, `${r.y}/${r.m}`), el('td', { class: 'num' }, man(r.sales)), el('td', { class: 'num' }, (r.gpr * 100).toFixed(1)), el('td', { class: 'num' }, man(r.sga)), el('td', { class: 'num' + (r.op < 0 ? ' neg' : '') }, man(r.op)), el('td', { class: 'num' + (r.ord < 0 ? ' neg' : '') }, man(r.ord)), el('td', { class: 'num' + (r.cash < 3e7 ? ' neg' : '') }, man(r.cash)));
      tr.addEventListener('click', () => this.modal(`月次試算表 ${r.y}年${r.m}月`, this.monthTable(r)));
      t.append(tr);
    }
    if (!f.hist.length) t.append(el('tr', {}, el('td', { colspan: 7, class: 'dim' }, '最初の月末を待っています')));
    box.append(el('div', { class: 'sec' }, '月次一覧(単位:万円・行をクリックで明細)'), t);
    const bk = el('table', { class: 'grid' });
    bk.append(el('tr', {}, el('th', {}, '借入先'), el('th', {}, '残高'), el('th', {}, '月返済'), el('th', {}, '金利')));
    for (const b of w.banks) bk.append(el('tr', {}, el('td', {}, b.name + (b.main ? '(メイン)' : '')), el('td', { class: 'num' }, man(b.bal)), el('td', { class: 'num' }, man(b.monthly)), el('td', { class: 'num' }, (b.rate * 100).toFixed(2) + '%')));
    box.append(el('div', { class: 'sec' }, '借入金'), bk);
    const ec = w.eco;
    box.append(el('div', { class: 'sec' }, '外部環境'), el('table', { class: 'grid' }, el('tr', {}, el('th', {}, '日経平均'), el('td', { class: 'num' }, ec.nikkei.toLocaleString() + '円'), el('th', {}, 'ドル円'), el('td', { class: 'num' }, ec.usd.toFixed(1))), el('tr', {}, el('th', {}, '軽油(県内平均)'), el('td', { class: 'num' }, ec.diesel.toFixed(0) + '円/L'), el('th', {}, '米価指数'), el('td', { class: 'num' }, ec.rice.toFixed(0)))));
  }

  // 名簿
  tabPeople(box) {
    const w = this.w;
    box.append(el('div', { class: 'pagehead' }, '社員名簿', el('span', { class: 'dim' }, '  行をクリックで社員情報')));
    const t = el('table', { class: 'grid people' });
    t.append(el('tr', {}, ...['氏名', '所属・役職', '年齢', '状況', '様子'].map(x => el('th', {}, x))));
    const list = w.people.filter(p => p.status !== 'pending').sort((a, b) => (a.status === 'quit') - (b.status === 'quit') || DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept) || b.rank - a.rank);
    for (const p of list) {
      const st = this.where(p);
      const tr = el('tr', { class: 'link' + (p.status === 'quit' ? ' gone' : '') }, el('td', { class: 'nw' }, el('span', { class: 'dept', style: `border-color:${DEPT_COL[p.dept] || '#888'}` }, el('b', {}, full(p)))), el('td', { class: 'small' }, p.dept, el('br'), el('span', { class: 'dim' }, p.title || (p.emp !== '正社員' ? p.emp : ''))), el('td', { class: 'num' }, p.age), el('td', { class: 'small st-' + st.k }, st.t), el('td', { class: 'dim small nw' }, p.status === 'active' ? moodWord(p) : ''));
      tr.addEventListener('click', () => this.h.select(p.id, true));
      t.append(tr);
    }
    box.append(t);
  }
  where(p) {
    if (p.status === 'quit') return { k: 'gone', t: p.fired ? '懲戒解雇' : '退職' };
    if (p.status === 'leave') return { k: 'leave', t: p.leaveReason || '休職' };
    const T = p.today;
    if (!T) return { k: 'off', t: '-' };
    if (T.absent) return { k: 'off', t: T.absent };
    if (!T.in) { const m = minuteOfDay(this.w.t); return { k: 'off', t: T.arrive && m < T.arrive ? '出社前' : '退社' }; }
    if (!p.at) return { k: 'out', t: T.driving ? '配送中' : T.lunchOut ? '昼食(外)' : '外出中' };
    const n = nodes.get(p.at);
    const pl = n?.place;
    if (p.at === p.desk) return { k: 'in', t: '在席' };
    return { k: 'in', t: placeInfo[pl]?.name || islandName(pl) || '社内' };
  }

  // 取引先
  tabClients(box) {
    const w = this.w;
    box.append(el('div', { class: 'pagehead' }, '取引先一覧'));
    const tot = w.clients.filter(c => c.status === 'active').reduce((s, c) => s + c.base, 0);
    const t = el('table', { class: 'grid clients' });
    t.append(el('tr', {}, ...['取引先', '業態', '担当', '月商見込', '構成比', '関係', '推移'].map(x => el('th', {}, x))));
    for (const c of w.clients.slice().sort((a, b) => (a.status !== 'active') - (b.status !== 'active') || b.base - a.base)) {
      const rep = this.P(c.rep);
      const relMark = c.rel >= 75 ? '◎' : c.rel >= 55 ? '○' : c.rel >= 35 ? '△' : '×';
      const cv = el('canvas', { class: 'spark' });
      const tr = el('tr', { class: c.status !== 'active' ? 'gone' : '' }, el('td', {}, el('b', {}, c.name), c.status !== 'active' ? el('span', { class: 'neg' }, c.status === 'bankrupt' ? ' (倒産)' : ' (取引停止)') : ''), el('td', { class: 'dim' }, c.kind), el('td', {}, rep ? rep.sei : '-'), el('td', { class: 'num' }, man(c.base)), el('td', { class: 'num' }, c.status === 'active' ? (c.base / tot * 100).toFixed(1) + '%' : '-'), el('td', { class: 'c' }, relMark), el('td', {}, cv));
      tr.addEventListener('click', () => this.openClient(c));
      t.append(tr);
      requestAnimationFrame(() => spark(cv, c.hist.slice(-12)));
    }
    box.append(el('div', { class: 'dim small pad' }, '月商見込:直近の取引規模(万円)。関係:◎良好 ○普通 △注意 ×悪化'), t);
    const s = el('table', { class: 'grid' });
    s.append(el('tr', {}, el('th', {}, '仕入先'), el('th', {}, '品目'), el('th', {}, '担当')));
    for (const x of w.suppliers) s.append(el('tr', {}, el('td', {}, x.name), el('td', { class: 'dim' }, x.item), el('td', {}, this.P(x.rep)?.sei || '-')));
    box.append(el('div', { class: 'sec' }, '主な仕入先'), s);
  }
  openClient(c) {
    const rep = this.P(c.rep);
    const t = el('table', { class: 'grid' });
    const r = (k, v) => t.append(el('tr', {}, el('th', {}, k), el('td', {}, v)));
    r('正式名称', c.full); r('業態', c.kind); r('所在・規模', c.area); r('取引開始', c.since + '年'); r('当社担当', rep ? `${full(rep)}(${rep.dept})` : '-');
    r('先方窓口', `${c.contact.sei}${c.contact.mei ? ' ' + c.contact.mei : ''} ${c.contact.title}(${c.contact.type})`); r('支払条件', c.terms === 2 ? '月末締め翌々月末払い' : c.terms === 0 ? '即日' : '月末締め翌月末払い');
    r('月商見込', man(c.base) + ' 万円'); r('粗利率(推定)', (c.margin * 100).toFixed(1) + '%'); r('関係', c.rel.toFixed(0) + ' / 100'); r('与信(社内評価)', c.health >= 70 ? 'A' : c.health >= 50 ? 'B' : c.health >= 35 ? 'C' : 'D(要注意)');
    const box = el('div', {}, t);
    const cv = el('canvas', { class: 'chart small' }); box.append(el('div', { class: 'sec' }, '月別売上(万円)'), cv);
    requestAnimationFrame(() => { const g = cv.getContext('2d'); const W = cv.width = cv.clientWidth, H = cv.height = 90; const h = c.hist.slice(-12); const mx = Math.max(1, ...h); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); h.forEach((v, i) => { const bh = v / mx * (H - 16); g.fillStyle = '#9fb3c8'; g.fillRect(8 + i * (W - 16) / 12, H - 12 - bh, (W - 16) / 12 - 4, bh); g.fillStyle = '#556'; g.font = '9px sans-serif'; g.fillText(Math.round(v / 1e4), 8 + i * (W - 16) / 12, H - 2); }); });
    this.modal(`取引先カード ― ${c.name}`, box);
  }

  // 新聞
  tabPaper(box) {
    const w = this.w;
    const papers = w.papers || [];
    if (!papers.length) { box.append(el('div', { class: 'dim pad' }, '朝刊は毎朝5時ごろ届きます')); return; }
    const sel = el('select', { class: 'papersel' });
    papers.forEach((p, i) => sel.append(el('option', { value: i }, p.date)));
    const holder = el('div', {});
    const show = i => { holder.innerHTML = ''; holder.append(this.paperEl(papers[i])); };
    sel.addEventListener('change', () => show(+sel.value));
    box.append(el('div', { class: 'pagehead' }, '新聞閲覧 ', sel));
    box.append(holder); show(0);
  }
  paperEl(p) {
    const pg = el('div', { class: 'paper' });
    pg.append(el('div', { class: 'mast' }, el('div', { class: 'pname' }, PAPER), el('div', { class: 'pdate' }, `${p.date}  第${p.no.toLocaleString()}号  朝刊`)));
    const top = el('div', { class: 'top' }, el('h2', {}, p.top.head), el('p', {}, p.top.body));
    if (p.top.company) top.classList.add('ours');
    pg.append(top);
    const cols = el('div', { class: 'cols' });
    for (const a of p.items) {
      const art = el('div', { class: 'art' + (a.small ? ' small' : '') + (a.company ? ' ours' : '') }, el('div', { class: 'sec' }, a.sec), el('h3', {}, a.head), el('p', {}, a.body));
      cols.append(art);
    }
    if (p.weather) cols.append(el('div', { class: 'art wx' }, el('div', { class: 'sec' }, '天気'), el('h3', {}, `新潟市 ${p.weather.kind}`), el('p', {}, `最高${p.weather.hi}℃ 最低${p.weather.lo}℃${p.weather.snowDepth ? `  積雪${p.weather.snowDepth}cm` : ''}  風${p.weather.wind}m`)));
    cols.append(el('div', { class: 'art oku' }, el('div', { class: 'sec' }, 'おくやみ'), ...p.okuyami.map(x => el('div', {}, x))));
    pg.append(cols);
    return pg;
  }
  onPaper(p) {
    if (this.tab === 'paper') this.renderTab();
    else this.$('paperbadge').hidden = false;
  }

  // ---------- 社員情報 ----------
  openProfile(pid) {
    const w = this.w; const p = this.P(pid); if (!p) return;
    const L = p.life;
    const box = el('div', { class: 'prof' });
    const top = el('div', { class: 'ptop' });
    const ph = el('canvas', { class: 'photo', width: 96, height: 120 });
    drawPortrait(ph, p);
    const st = this.where(p);
    const basic = el('table', { class: 'grid' });
    const r = (k, v) => basic.append(el('tr', {}, el('th', {}, k), el('td', {}, v)));
    r('氏名', full(p) + (p.maiden ? `(旧姓 ${p.maiden})` : ''));
    r('所属・役職', `${p.dept} ${p.title || ''}`);
    r('雇用形態', p.emp + (p.emp === 'パート' ? '(1日6時間)' : ''));
    r('年齢・性別', `${p.age}歳・${p.gender === 'f' ? '女性' : '男性'}  誕生日 ${p.birth.m}/${p.birth.d}`);
    r('入社', `${p.joined}年(勤続${Math.max(0, dateOf(dayIndex(w.t)).y - p.joined)}年)`);
    r('現在', `${st.t}${p.status === 'active' ? ' / ' + moodWord(p) : ''}`);
    top.append(ph, basic);
    box.append(top);
    const life = el('table', { class: 'grid' });
    const l = (k, v) => v && life.append(el('tr', {}, el('th', {}, k), el('td', {}, v)));
    l('出身', L.born); l('最終学歴', L.edu); l('前職', L.prev || (p.joinAge <= 23 ? '新卒入社' : '-'));
    l('住まい', L.home + (L.liveWithParents ? '(実家暮らし)' : ''));
    l('通勤', `${L.commute}${L.commute === '車' ? '(' + L.car + ')' : ''}`);
    const fam = [L.married ? '配偶者あり' : L.divorced ? '離婚歴あり' : '独身', L.kids.length ? `子ども${L.kids.length}人(${L.kids.map(k => k.age + '歳').join('・')})` : '', L.parents !== '両親健在' ? L.parents : '', L.care ? '親の介護あり' : ''].filter(Boolean).join('、');
    l('家族', fam); l('住宅ローン', L.mortgage ? '返済中(残 約' + Math.round(L.mortgage / 1e4) + '万円)' : ''); l('ペット', L.pet !== 'なし' ? L.pet : '');
    l('趣味', L.hobby.join('、')); l('健康メモ', L.health); l('喫煙', p.smoker ? '吸う' : '');
    l('人事評価(前期)', p.eval); l('給与(月額・推定)', man(p.salary) + '万円');
    box.append(el('div', { class: 'sec' }, '基本情報'), life);
    box.append(el('div', { class: 'sec' }, '人柄(上司・同僚の評)'), el('ul', { class: 'traits' }, ...personalityLines(p, 5).map(t => el('li', {}, t))));
    const meters = el('table', { class: 'grid meters' });
    const mt = (k, v, inv = false) => { const n = Math.round(v / 10); meters.append(el('tr', {}, el('th', {}, k), el('td', { class: 'bar ' + ((inv ? v > 65 : v < 35) ? 'neg' : '') }, '■'.repeat(n) + '□'.repeat(10 - n)), el('td', { class: 'num dim' }, Math.round(v)))); };
    mt('ストレス', p.st.stress, true); mt('やる気', p.st.motiv); mt('会社への満足', p.st.sat); mt('体調', p.st.health); mt('疲れ', p.st.fatigue, true); mt('転職の気持ち(推定)', p.st.quit, true);
    box.append(el('div', { class: 'sec' }, '状態(観察からの推定)'), meters);
    // 人間関係
    const others = w.people.filter(q => q !== p && q.status === 'active');
    const scored = others.map(q => ({ q, r: rel(w, p, q), back: rel(w, q, p) }));
    const likes = scored.filter(x => x.r.aff > 18).sort((a, b) => b.r.aff - a.r.aff).slice(0, 5);
    const hates = scored.filter(x => x.r.aff < -12).sort((a, b) => a.r.aff - b.r.aff).slice(0, 4);
    const relT = el('table', { class: 'grid rel' });
    const word = (x) => {
      const a = x.r.aff, t = x.r.trust;
      if (x.r.tags.includes('lover')) return '特別な関係';
      if (x.r.tags.includes('rival')) return '犬猿の仲';
      if (a > 60) return t > 40 ? '心から信頼' : '大好き';
      if (a > 35) return t > 30 ? '頼りにしている' : '仲がいい';
      if (a > 18) return '好感';
      if (a < -50) return '憎んでいる';
      if (a < -30) return t < -20 ? '信用していない' : '嫌い';
      return '苦手';
    };
    for (const x of [...likes, ...hates]) {
      const tr = el('tr', { class: 'link' }, el('td', {}, el('b', {}, full(x.q)), el('span', { class: 'dim' }, ` ${x.q.dept}`)), el('td', { class: x.r.aff < 0 ? 'neg' : 'pos' }, word(x)), el('td', { class: 'dim small' }, x.back.aff > 20 ? '(相手も好意的)' : x.back.aff < -15 ? '(相手からも嫌われている)' : ''));
      tr.addEventListener('click', () => this.h.select(x.q.id, true));
      relT.append(tr);
    }
    if (!likes.length && !hates.length) relT.append(el('tr', {}, el('td', { class: 'dim' }, 'まだ目立った関係はない')));
    box.append(el('div', { class: 'sec' }, '人間関係'), relT);
    // 最近の出来事
    const mem = el('ul', { class: 'mem' });
    for (const m of p.mem.slice(0, 10)) { const d = dateOf(m.day); mem.append(el('li', {}, el('span', { class: 'tm' }, `${d.m}/${d.d}`), ' ', m.text)); }
    if (!p.mem.length) mem.append(el('li', { class: 'dim' }, '特記事項なし'));
    box.append(el('div', { class: 'sec' }, '最近の出来事(本人の記憶)'), mem);
    // 噂
    const about = w.secrets.filter(s => s.subj.includes(p.id));
    const knowsS = w.secrets.filter(s => s.known.includes(p.id) && !s.subj.includes(p.id) && !s.exposed).slice(-5);
    const ru = el('ul', { class: 'mem' });
    for (const s of about) ru.append(el('li', {}, el('span', { class: 'tag' + (s.exposed ? ' t-重要' : '') }, s.exposed ? '周知' : `${s.known.length}人が知る`), ' ', s.text));
    if (!about.length) ru.append(el('li', { class: 'dim' }, '本人に関する噂は聞こえてこない'));
    box.append(el('div', { class: 'sec' }, 'この人についての噂'), ru);
    if (knowsS.length) { const ku = el('ul', { class: 'mem' }); for (const s of knowsS) ku.append(el('li', {}, s.text)); box.append(el('div', { class: 'sec' }, 'この人が知っている噂'), ku); }
    if (p.role === 'sales') { const cs = w.clients.filter(c => c.rep === p.id && c.status === 'active'); if (cs.length) box.append(el('div', { class: 'sec' }, '担当取引先'), el('div', { class: 'pad' }, cs.map(c => c.name).join('、'))); }
    const btns = el('div', { class: 'btns' });
    const fb = el('button', {}, '3Dで追いかける'); fb.addEventListener('click', () => { this.h.follow(p.id); this.closeModal(); });
    btns.append(fb);
    box.append(btns);
    this.modal(`社員情報照会 ― ${full(p)}`, box);
  }

  // ---------- ダイアログ ----------
  modal(title, body) {
    const m = this.$('modal');
    m.innerHTML = '';
    const win = el('div', { class: 'win' }, el('div', { class: 'wt' }, el('span', {}, title), el('button', { class: 'x', title: '閉じる' }, '×')), el('div', { class: 'wb' }, body));
    m.append(win); m.hidden = false;
  }
  closeModal() { this.$('modal').hidden = true; this.$('modal').innerHTML = ''; }
  confirmNew() {
    const box = el('div', { class: 'pad' }, el('p', {}, '今の会社の記録を消して、新しい顔ぶれで最初からはじめます。よろしいですか?'));
    const b = el('div', { class: 'btns' });
    const yes = el('button', {}, 'はじめからにする'); yes.addEventListener('click', () => { this.closeModal(); this.h.newGame(); });
    const no = el('button', {}, 'やめる'); no.addEventListener('click', () => this.closeModal());
    b.append(yes, no); box.append(b);
    this.modal('確認', box);
  }
  showEnd(w, ended) {
    const paper = (w.papers && w.papers[0]) || null;
    const box = el('div', { class: 'endbox' });
    box.append(el('p', {}, `${fmtDate(dateOf(ended.day))}、${w.company.name}は事業を停止しました。負債総額は約${(ended.debt / 1e8).toFixed(1)}億円。`));
    const list = el('ul', { class: 'mem' });
    const fates = ['同業のホクシンに拾われた', 'ハローワークに通っている', '取引先だったスーパーに転職した', '実家の農業を継いだ', '県外に引っ越した', 'しばらく休むことにした', '運送会社でドライバーになった', '派遣で事務の仕事を始めた', '起業した', '介護の仕事に就いた'];
    w.people.filter(p => p.status === 'active' || p.status === 'leave').forEach((p, i) => list.append(el('li', {}, `${full(p)}(${p.age})― ${p.key === 'shacho' ? '個人保証の債務整理に追われている' : p.key === 'kaicho' ? '自宅に引きこもり、誰とも会わなくなった' : fates[(i * 7 + p.age) % fates.length]}`)));
    box.append(el('div', { class: 'sec' }, 'その後'), list);
    const b = el('div', { class: 'btns' });
    const n = el('button', {}, '新しい会社を眺める'); n.addEventListener('click', () => { this.closeModal(); this.h.newGame(); });
    b.append(n); box.append(b);
    this.modal('閉業のお知らせ', box);
  }
}

function islandName(pl) {
  return { soumu: '総務・経理', eigyo1: '営業一課', eigyo2: '営業二課', kobai: '購買・営業事務', eigyo: '営業部長席', wof: '倉庫事務所', chorei: '朝礼', party: '宴会' }[pl] || '';
}

// 顔写真(社員証ふう)
function drawPortrait(cv, p) {
  const L = personLook(p);
  const g = cv.getContext('2d');
  const hex = c => '#' + c.toString(16).padStart(6, '0');
  g.fillStyle = '#c9d3dc'; g.fillRect(0, 0, 96, 120);
  g.fillStyle = '#b7c2cc'; g.fillRect(0, 84, 96, 36);
  // 肩
  g.fillStyle = hex(L.jacket ? (L.jacketCol || L.top) : L.vest || L.top); g.fillRect(14, 88, 68, 32);
  if (L.jacket || L.vest) { g.fillStyle = hex(L.top); g.fillRect(40, 88, 16, 32); }
  if (L.tie) { g.fillStyle = hex(L.tie); g.fillRect(45, 90, 6, 30); }
  // 首と顔
  g.fillStyle = hex(L.skin); g.fillRect(40, 74, 16, 16);
  g.fillRect(28, 30, 40, 48);
  // 髪
  g.fillStyle = hex(L.hair);
  if (L.bald) { g.fillRect(26, 40, 5, 18); g.fillRect(65, 40, 5, 18); }
  else { g.fillRect(25, 22, 46, 14); g.fillRect(25, 30, 6, 20); g.fillRect(65, 30, 6, 20); if (L.longHair) { g.fillRect(22, 30, 8, 52); g.fillRect(66, 30, 8, 52); } }
  if (L.cap) { g.fillStyle = '#2b3a4f'; g.fillRect(22, 18, 52, 14); g.fillRect(40, 30, 34, 4); }
  // 目・口
  g.fillStyle = '#1a1a1a'; g.fillRect(37, 50, 5, 4); g.fillRect(54, 50, 5, 4);
  if (L.glasses) { g.strokeStyle = '#222'; g.lineWidth = 1.5; g.strokeRect(33.5, 46.5, 12, 10); g.strokeRect(50.5, 46.5, 12, 10); }
  if (L.mask) { g.fillStyle = '#f2f2f0'; g.fillRect(33, 60, 30, 14); }
  else { g.fillStyle = '#8a4a3a'; const mood = p.st.mood; g.fillRect(42, 66 + (mood < 40 ? 1 : 0), 12, 2); }
  g.strokeStyle = '#8a96a0'; g.strokeRect(0.5, 0.5, 95, 119);
}
