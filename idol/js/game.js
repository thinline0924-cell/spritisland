// ゲームの状態と各アプリの中身
const SAVE_KEY = 'idol-proto-v1';
const APPS = {
  explorer: { name: 'エクスプローラー', icon: 'folder' },
  mail: { name: 'メール', icon: 'mail' },
  browser: { name: 'ブラウザ', icon: 'browser' },
  chat: { name: 'チャット', icon: 'chat' },
  calendar: { name: 'カレンダー', icon: 'calendar' },
  sheet: { name: '表計算', icon: 'sheet' },
  notepad: { name: 'メモ帳', icon: 'txt' },
};
const C = id => CANDIDATES.find(c => c.id === id);
const clone = o => JSON.parse(JSON.stringify(o));

// ---------- 状態 ----------
function freshState() {
  const slots = [];
  WEEK.fixed.forEach(d => d.forEach(v => slots.push(v ? { label: v, kind: 'fixed' } : null)));
  const sheet = {};
  CANDIDATES.forEach(c => sheet[c.id] = { j: '', note: '' });
  return {
    booted: false, slots, sheet, submitted: false,
    mails: START_MAILS.map(m => Object.assign({ box: 'inbox' }, m)),
    chats: clone(START_CHATS), chatUnread: {},
    searched: {}, asked: {}, interviewed: {}, history: [],
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { S = null; }
if (!S || !S.slots) S = freshState();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 保存できなくても遊べる */ } }

// ---------- 時間(1週間の空き枠) ----------
function lastAct() { let k = -1; S.slots.forEach((s, i) => { if (s && s.kind === 'act') k = i; }); return k; }
function freeLeft() { const k = lastAct(); return S.slots.filter((s, i) => !s && i > k).length; }
function slotName(i) { return `${WEEK.days[i >> 1]} ${i % 2 ? '午後' : '午前'}`; }
function now() {
  const k = lastAct();
  if (k < 0) return { day: 0, time: '9:12' };
  const end = k % 2 ? (k === 9 ? '17:52' : '19:40') : '12:30';
  return { day: k >> 1, time: end };
}
function useSlot(label) {
  const k = lastAct();
  const i = S.slots.findIndex((s, j) => !s && j > k);
  if (i < 0) {
    OS.dialog('カレンダー', '今週の予定はもう埋まっています。\n残りの時間で選考表を仕上げましょう。', null, 'warn');
    return false;
  }
  S.slots[i] = { label, kind: 'act' };
  save();
  updateClock();
  OS.refresh('calendar');
  OS.toast(APPS.calendar, `${slotName(i)} を使いました`, `${label}(今週の空き あと ${freeLeft()} コマ)`, openCalendar);
  return true;
}

// ---------- デスクトップ ----------
const DESKTOP = [
  { key: 'trash', name: 'ごみ箱', icon: 'trash' },
  { key: 'audition', name: 'オーディション2026秋', icon: 'folder' },
  { key: 'sheet', name: '選考表_最終(2).xlsx', icon: 'sheet' },
  { key: 'mail', name: 'メール', icon: 'mail', app: 1 },
  { key: 'browser', name: 'ブラウザ', icon: 'browser', app: 1 },
  { key: 'chat', name: 'チャット', icon: 'chat', app: 1 },
  { key: 'calendar', name: 'カレンダー', icon: 'calendar', app: 1 },
  { key: 'todo', name: 'TODO.txt', icon: 'txt' },
  { key: 'shot', name: 'スクリーンショット 2026-10-21 231455.png', icon: 'img' },
  { key: 'newfolder', name: '新しいフォルダー (2)', icon: 'folder' },
  { key: 'keihi', name: '経費精算_10月.xlsx', icon: 'sheet' },
  { key: 'answer', name: '答え合わせ(開発用).txt', icon: 'txt', after: 1 },
  { key: 'group', name: '新グループ', icon: 'folder', grp: 1 },
];
function renderDesktop() {
  const box = document.getElementById('icons');
  box.innerHTML = '';
  DESKTOP.filter(d => (!d.after || S.submitted) && (!d.grp || S.phase === 'group')).forEach(d => {
    const b = OS.el('button', 'dicon' + (d.app ? ' app' : ''));
    b.innerHTML = `${Icons.get(d.icon)}<span></span>`;
    b.querySelector('span').textContent = d.name;
    b.onclick = e => {
      box.querySelectorAll('.dicon.sel').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      if (OS.isNarrow() || e.pointerType === 'touch') openDesktop(d.key);
    };
    b.ondblclick = () => openDesktop(d.key);
    box.append(b);
  });
  renderSticky();
}
function openDesktop(k) {
  const map = {
    audition: () => openExplorer('audition'), sheet: openSheet, mail: openMail, browser: () => openBrowser(), chat: openChat, calendar: openCalendar,
    trash: () => openExplorer('trash'), newfolder: () => openExplorer('newfolder'),
    todo: () => openText('todo', 'TODO.txt', `・選考表 金曜18時まで!!!→部長
・Lumière 年末ライブ 会場の仮押さえ(12/27?)
・あかりと面談 ←佐野さんと日程
・経費精算 水曜しめ
・歯医者 木曜 午後
・母に電話
・ガムテープ買う`),
    shot: openScreenshot,
    keihi: () => OS.dialog('表計算', '「経費精算_10月.xlsx」は、ほかのユーザー(tamura)が編集中のため開けません。\n\n読み取り専用で開くこともできません。', null, 'warn'),
    answer: openAnswer,
    group: () => openExplorer('group'),
  };
  (map[k] || (() => {}))();
}
function renderSticky() {
  if (S.phase === 'group') { G.sticky(); return; }
  const n = document.getElementById('sticky');
  const left = freeLeft();
  const used = S.slots.filter(s => s && s.kind === 'act').length;
  const boxes = '■'.repeat(used) + '□'.repeat(left);
  n.innerHTML = `<b>金曜18時!!</b><br>選考表 → 部長<br>4〜5人(5人まで)<br><br>今週あいてる時間<br><span class="boxes">${boxes || 'なし'}</span>`;
}

// ---------- タスクバー・時計 ----------
function updateClock() {
  const t = now();
  const d = WEEK.days[t.day].replace(/\(.\)/, '');
  document.getElementById('clock').innerHTML = S.phase === 'group' ? `<span>${S.g.done ? '18:30' : '9:00'}</span><span>${G.clockDate()}</span>` : `<span>${t.time}</span><span>2026/${d}</span>`;
  renderSticky();
  const unread = S.mails.filter(m => m.box === 'inbox' && m.unread).length;
  document.getElementById('pin-mail').dataset.badge = unread || '';
  const cu = Object.values(S.chatUnread).reduce((a, b) => a + b, 0);
  document.getElementById('pin-chat').dataset.badge = cu || '';
}

// ---------- エクスプローラー ----------
function folderFiles(cid) {
  const c = C(cid);
  const f = [
    { name: `履歴書_${c.name.replace(' ', '')}.pdf`, icon: 'pdf', type: 'PDF ファイル', size: '412 KB', open: () => openResume(c) },
    { name: c.photoFile.name, icon: 'img', type: '画像', size: '2.1 MB', open: () => openPhoto(c) },
    { name: '審査員メモ.txt', icon: 'txt', type: 'テキスト ドキュメント', size: '1 KB', open: () => openText('memo_' + cid, `審査員メモ.txt - ${c.name}`, c.memo) },
  ];
  c.extras.forEach((x, i) => f.push({ name: x.name, icon: x.kind === 'mail' ? 'eml' : 'pdf', type: x.kind === 'mail' ? 'メール メッセージ' : 'PDF ファイル', size: (88 + i * 31) + ' KB', open: () => openExtra(c, x) }));
  if (S.interviewed[cid]) f.push({ name: `追加面接メモ_${S.interviewed[cid]}.txt`, icon: 'txt', type: 'テキスト ドキュメント', size: '1 KB', open: () => openText('iv_' + cid, `追加面接メモ - ${c.name}`, c.interview), fresh: 1 });
  return f;
}
function folderList(path) {
  if (path === 'audition') {
    const f = CANDIDATES.map(c => ({ name: `${c.no}_${c.name.replace(' ', '')}`, icon: 'folder', type: 'ファイル フォルダー', size: '', open: null, go: 'c:' + c.id }));
    f.push({ name: '審査の流れ(社外秘).txt', icon: 'txt', type: 'テキスト ドキュメント', size: '1 KB', open: () => openText('flow', '審査の流れ(社外秘).txt', `2026 秋オーディション

応募総数 1,186
書類通過 64
二次(歌・ダンス) 21
最終 8 ← いまここ

審査員: 桐谷(部長) / 三浦(振付・ボイトレ) / 堤(外部・元雑誌編集)

※ 審査員メモは各自の走り書きをそのまま入れています
※ 本人に見せないこと`) });
    return f;
  }
  if (path.startsWith('c:')) return folderFiles(path.slice(2));
  if (path === 'group') return S.phase === 'group' ? G.explorerFiles() : [];
  if (path === 'trash') return [
    { name: 'Lumière_あかり_卒業発表文_v3.docx', icon: 'doc', type: 'Word 文書', size: '18 KB', open: () => openText('akari', 'Lumière_あかり_卒業発表文_v3.docx(下書き)', `ファンのみなさまへ

いつも応援ありがとうございます。
突然のご報告になってしまい、ごめんなさい。

わたし、あかりは、2026年12月27日のライブをもって
Lumièreを卒業します。

(ここに理由)

(理由、なんて書けばいいですか? ―佐野さんへ)`) },
    { name: '新グループ案_ボツ.pptx', icon: 'doc', type: 'プレゼンテーション', size: '3.4 MB', open: () => OS.dialog('ごみ箱', 'ごみ箱内のプレゼンテーションは開けません。', null, 'info') },
  ];
  if (path === 'downloads') return [
    { name: '契約書ひな形_未成年.docx', icon: 'doc', type: 'Word 文書', size: '44 KB', open: () => OS.dialog('', 'このファイルを開くアプリが見つかりません。', null, 'warn') },
    { name: 'IMG_0412(1).jpg', icon: 'img', type: '画像', size: '1.2 MB', open: () => OS.dialog('', 'ファイルが破損しているか、サポートされていない形式です。', null, 'warn') },
  ];
  return [];
}
const PATH_NAME = { group: '共有 > 新グループ', audition: '共有 > オーディション2026秋', trash: 'ごみ箱', newfolder: 'デスクトップ > 新しいフォルダー (2)', downloads: 'ダウンロード' };
function openExplorer(path) {
  OS.open('explorer', {
    title: 'エクスプローラー', icon: 'folder', w: 760, h: 460,
    render(body, w) {
      if (!w.path) w.path = 'audition';
      const p = w.path;
      const crumbs = p.startsWith('c:') ? `${PATH_NAME.audition} > ${C(p.slice(2)).no}_${C(p.slice(2)).name.replace(' ', '')}` : (PATH_NAME[p] || p);
      const files = folderList(p);
      body.innerHTML = `
        <div class="ex-bar"><button class="flat" data-up title="上へ">${Icons.get('back')}</button><div class="addr"></div><div class="ex-search">${Icons.get('search')}<span>検索</span></div></div>
        <div class="ex-main">
          <nav class="ex-nav">
            <div class="nav-h">クイック アクセス</div>
            <button data-p="desktop">${Icons.get('folder')}デスクトップ</button>
            <button data-p="downloads">${Icons.get('folder')}ダウンロード</button>
            <div class="nav-h">共有</div>
            ${S.phase === 'group' ? `<button data-p="group">${Icons.get('folder')}新グループ</button>` : ''}
            <button data-p="audition">${Icons.get('folder')}オーディション2026秋</button>
            <button data-p="lumiere">${Icons.get('folder')}Lumière</button>
            <button data-p="trash">${Icons.get('trash')}ごみ箱</button>
          </nav>
          <div class="ex-list"><table><thead><tr><th>名前</th><th class="hide-n">種類</th><th class="hide-n">サイズ</th></tr></thead><tbody></tbody></table>
          ${files.length ? '' : '<div class="empty">このフォルダーは空です。</div>'}</div>
        </div>
        <div class="statusbar">${files.length} 個の項目</div>`;
      body.querySelector('.addr').textContent = crumbs;
      const tb = body.querySelector('tbody');
      files.forEach(f => {
        const tr = OS.el('tr', f.fresh ? 'fresh' : '');
        tr.innerHTML = `<td><span class="fi">${Icons.get(f.icon)}</span><span class="fname"></span></td><td class="hide-n">${f.type}</td><td class="hide-n num">${f.size}</td>`;
        tr.querySelector('.fname').textContent = f.name;
        const act = () => { if (f.go) { w.path = f.go; OS.refresh('explorer'); } else f.open(); };
        tr.onclick = e => { tb.querySelectorAll('tr').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); if (OS.isNarrow() || e.pointerType === 'touch') act(); };
        tr.ondblclick = act;
        tb.append(tr);
      });
      body.querySelector('[data-up]').onclick = () => { if (w.path.startsWith('c:')) { w.path = 'audition'; OS.refresh('explorer'); } };
      body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const k = b.dataset.p;
        if (k === 'desktop') { OS.close('explorer'); return; }
        if (k === 'lumiere') { OS.dialog('エクスプローラー', '\\\\mitsuba-nas\\Lumière にアクセスできません。\nアクセス許可がありません。管理者に問い合わせてください。', null, 'warn'); return; }
        w.path = k; OS.refresh('explorer');
      });
    },
  });
  if (path) { OS.wins.explorer.path = path; OS.refresh('explorer'); }
}

// ---------- 文書ビューア ----------
function openText(id, title, text) {
  OS.open('np_' + id, {
    title: title + ' - メモ帳', icon: 'txt', w: 520, h: 420,
    render(body) {
      body.innerHTML = `<div class="menubar"><span>ファイル</span><span>編集</span><span>書式</span><span>表示</span><span>ヘルプ</span></div><textarea class="np" readonly spellcheck="false"></textarea><div class="statusbar"><span>行 1、列 1</span><span>UTF-8</span></div>`;
      body.querySelector('textarea').value = text;
    },
  });
}
function pdfShell(body, inner, name) {
  body.innerHTML = `<div class="pdf-bar"><span class="pdf-name"></span><span class="pdf-page">1 / 1</span><span class="pdf-zoom">− 100% +</span></div><div class="pdf-scroll"><div class="page">${inner}</div></div>`;
  body.querySelector('.pdf-name').textContent = name;
}
function openResume(c) {
  const r = c.resume;
  OS.open('resume_' + c.id, {
    title: `履歴書_${c.name.replace(' ', '')}.pdf`, icon: 'pdf', w: 640, h: 560,
    render(body) {
      pdfShell(body, `
        <div class="resume">
          <div class="rs-head"><h2>履 歴 書</h2><span>2026年 9月 ${10 + (+c.no % 18)}日現在</span></div>
          <table class="rs-top"><tr><td class="rs-lab">ふりがな</td><td>${escapeHtml(c.kana)}</td><td rowspan="3" class="rs-photo">${photoSlot(c, 'small')}</td></tr>
            <tr><td class="rs-lab">氏　名</td><td class="rs-name">${escapeHtml(c.name)}</td></tr>
            <tr><td class="rs-lab">生年月日</td><td>${escapeHtml(c.birth)} 生(満 ${c.age} 歳)　身長 ${c.height}cm</td></tr>
            <tr><td class="rs-lab">現住所</td><td colspan="2">${escapeHtml(c.from)}</td></tr></table>
          <table class="rs-hist"><tr><th>年　月</th><th>学歴・職歴・芸能歴</th></tr>
            ${r.history.map(h => `<tr><td>${escapeHtml(h[0])}</td><td>${escapeHtml(h[1])}</td></tr>`).join('')}
            <tr><td></td><td class="r">以上</td></tr></table>
          <table class="rs-free">
            <tr><td class="rs-lab">特技</td><td>${textHtml(r.skill)}</td></tr>
            <tr><td class="rs-lab">趣味</td><td>${textHtml(r.hobby)}</td></tr>
            <tr><td class="rs-lab">志望動機</td><td class="tall">${textHtml(r.motive)}</td></tr>
            <tr><td class="rs-lab">自己PR</td><td class="tall">${textHtml(r.pr)}</td></tr></table>
        </div>`, `履歴書_${c.name.replace(' ', '')}.pdf`);
    },
  });
}
function openPhoto(c) {
  OS.open('photo_' + c.id, {
    title: c.photoFile.name + ' - フォト', icon: 'img', w: 460, h: 540,
    render(body, w) {
      const back = !!w.back;
      body.innerHTML = `<div class="ph-view">${back ? `<div class="ph-back"></div>` : photoSlot(c, 'big')}</div>
        <div class="ph-bar"><span>${back ? '裏面(スキャン)' : '表面'}</span><button class="btn">${back ? '表を見る' : '裏を見る'}</button></div>`;
      if (back) body.querySelector('.ph-back').innerHTML = textHtml(c.photoFile.back);
      body.querySelector('button').onclick = () => { w.back = !back; OS.refresh(w.id); };
    },
  });
}
function openExtra(c, x) {
  if (x.kind === 'mail') {
    OS.open('eml_' + c.id + x.name, {
      title: x.name, icon: 'eml', w: 560, h: 440,
      render(body) {
        body.innerHTML = `<div class="eml"><div class="eml-h"><div class="eml-subj"></div><div><b>差出人:</b> <span class="f"></span></div><div><b>日時:</b> ${x.date}</div><div><b>宛先:</b> 桐谷 誠</div><div><b>CC:</b> 新グループ担当P</div></div><div class="eml-b"></div></div>`;
        body.querySelector('.eml-subj').textContent = x.subject;
        body.querySelector('.f').textContent = x.from;
        body.querySelector('.eml-b').innerHTML = textHtml(x.body);
      },
    });
  } else {
    OS.open('doc_' + c.id + x.name, {
      title: x.name, icon: 'pdf', w: 600, h: 520,
      render(body) {
        pdfShell(body, `<div class="scan"><div class="scan-t">${escapeHtml(x.title)}</div><div class="scan-b">${textHtml(x.body)}</div>${x.sticky ? `<div class="fusen">${textHtml(x.sticky)}</div>` : ''}</div>`, x.name);
      },
    });
  }
}
function openScreenshot() {
  OS.open('shot', {
    title: 'スクリーンショット 2026-10-21 231455.png - フォト', icon: 'img', w: 440, h: 420,
    render(body) {
      body.innerHTML = `<div class="ph-view dark"><div class="shot">
        <div class="shot-user"><b>るみ推し@次は年末</b> <span>@lumi_daisuki_</span></div>
        <div>最近のルミエール運営やばくない?<br>あかりちゃん明らかに痩せすぎだし、配信も減ってるし。<br>大丈夫なの?</div>
        <div class="shot-meta">午後11:12 · 2026年10月21日 · 4.1万 件の表示</div>
        <div class="shot-meta">♡ 2,840　↻ 911</div></div></div>`;
    },
  });
}

// ---------- メール ----------
function openMail() {
  OS.open('mail', {
    title: 'メール', icon: 'mail', w: 860, h: 520,
    render(body, w) {
      w.box = w.box || 'inbox';
      const list = S.mails.filter(m => m.box === w.box);
      if (!w.sel && w.box === 'inbox') w.sel = 'boss1';
      const cur = S.mails.find(m => m.id === w.sel && m.box === w.box);
      const cnt = b => S.mails.filter(m => m.box === b && m.unread).length;
      body.innerHTML = `
        <div class="ml-bar"><button class="btn primary" data-new ${S.submitted ? 'hidden' : ''}>${Icons.get('pen')}問い合わせを書く</button><span class="ml-acct">p-new@mitsuba-pro.co.jp</span></div>
        <div class="ml-main ${cur && OS.isNarrow() ? 'reading' : ''}">
          <nav class="ml-nav">
            <button data-b="inbox" class="${w.box === 'inbox' ? 'on' : ''}">受信トレイ<em>${cnt('inbox') || ''}</em></button>
            <button data-b="sent" class="${w.box === 'sent' ? 'on' : ''}">送信済み</button>
            <button disabled>下書き</button><button disabled>迷惑メール<em class="g">38</em></button>
          </nav>
          <div class="ml-list"></div>
          <div class="ml-read"></div>
        </div>`;
      const lb = body.querySelector('.ml-list');
      if (!list.length) lb.innerHTML = '<div class="empty">メッセージはありません</div>';
      list.forEach(m => {
        const it = OS.el('button', 'ml-item' + (m.unread ? ' unread' : '') + (cur === m ? ' sel' : ''));
        const tag = m.job ? (m.jobState === 'open' ? '<em class="tag req">要返信</em>' : m.jobState === 'accepted' ? '<em class="tag ok">受けた</em>' : '') : m.choices && m.chosen == null ? '<em class="tag req">対応が必要</em>' : '';
        it.innerHTML = `<div class="ml-from"></div><div class="ml-subj"></div><div class="ml-date">${m.date}${tag}</div>`;
        it.querySelector('.ml-from').textContent = w.box === 'sent' ? '宛先: ' + m.to : m.from;
        it.querySelector('.ml-subj').textContent = m.subject;
        it.onclick = () => { w.sel = m.id; m.unread = false; save(); updateClock(); OS.refresh('mail'); };
        lb.append(it);
      });
      const rd = body.querySelector('.ml-read');
      if (cur) {
        rd.innerHTML = `<button class="flat ml-backbtn">${Icons.get('back')}一覧</button><h3></h3><div class="ml-meta"><span class="av">${escapeHtml((cur.from || '自分')[0])}</span><div><div class="who"></div><div class="ml-addr">${escapeHtml(cur.addr || '')}　${cur.date}</div></div></div><div class="ml-body"></div>`;
        rd.querySelector('h3').textContent = cur.subject;
        rd.querySelector('.who').textContent = w.box === 'sent' ? '自分 → ' + cur.to : cur.from;
        rd.querySelector('.ml-body').innerHTML = textHtml(cur.body);
        rd.querySelector('.ml-backbtn').onclick = () => { w.sel = null; OS.refresh('mail'); };
        if (S.phase === 'group' && (cur.job || cur.choices)) G.mailActions(rd, cur);
      } else rd.innerHTML = '<div class="empty">読むメッセージを選んでください</div>';
      body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { w.box = b.dataset.b; w.sel = null; OS.refresh('mail'); });
      body.querySelector('[data-new]').onclick = openCompose;
    },
  });
}
function addMail(m) {
  S.mails.unshift(Object.assign({ box: 'inbox', unread: true }, m));
  save(); updateClock(); OS.refresh('mail');
  OS.toast(APPS.mail, m.from, m.subject, () => { openMail(); OS.wins.mail.sel = m.id; OS.wins.mail.box = 'inbox'; OS.refresh('mail'); });
}
function openCompose() {
  if (S.submitted) { OS.dialog('メール', '選考表はもう送ってしまいました。', null, 'info'); return; }
  OS.open('compose', {
    title: '新しいメッセージ', icon: 'mail', w: 560, h: 480,
    render(body) {
      const opts = CANDIDATES.map(c => `<optgroup label="${escapeHtml(c.name)} の件">${c.contacts.map(k => `<option value="${c.id}|${k.key}" ${S.asked[k.key] ? 'disabled' : ''}>${escapeHtml(k.who)}(${escapeHtml(k.how)})${S.asked[k.key] ? ' ― 問い合わせ済み' : ''}</option>`).join('')}</optgroup>`).join('');
      body.innerHTML = `<div class="cp">
        <label><span>宛先</span><select><option value="">― 誰に聞くか選ぶ ―</option>${opts}</select></label>
        <label><span>件名</span><input class="subj" value=""></label>
        <textarea class="cp-body"></textarea>
        <div class="cp-foot"><span class="cp-note">送ると、今週の空き時間を1コマ使います(あと ${freeLeft()} コマ)</span><button class="btn primary" disabled>送信</button></div></div>`;
      const sel = body.querySelector('select'), btn = body.querySelector('.primary'), subj = body.querySelector('.subj'), ta = body.querySelector('textarea');
      sel.onchange = () => {
        btn.disabled = !sel.value;
        if (!sel.value) return;
        const [cid, key] = sel.value.split('|');
        const c = C(cid), k = c.contacts.find(x => x.key === key);
        subj.value = `${c.name.replace(' ', '')}さんの件でお伺いしたいことがあります`;
        ta.value = `${k.who} 様\n\n突然のご連絡失礼いたします。\n株式会社ミツバ企画の新グループ担当です。\n\n現在、弊社オーディションの最終候補に ${c.name.replace(' ', '')} さんが残っており、\n差し支えない範囲で、${c.name.split(' ')[1]}さんの人となりについてお聞かせいただけないでしょうか。\n\nどうぞよろしくお願いいたします。`;
      };
      btn.onclick = () => {
        const [cid, key] = sel.value.split('|');
        const c = C(cid), k = c.contacts.find(x => x.key === key);
        if (!useSlot(`問い合わせ: ${k.who}`)) return;
        S.asked[key] = true;
        const id = 'sent_' + key;
        S.mails.unshift({ id, box: 'sent', to: k.who, from: '自分', subject: subj.value, body: ta.value, date: WEEK.days[now().day] + ' ' + now().time });
        save();
        OS.close('compose');
        setTimeout(() => addMail({ id: 'reply_' + key, from: k.who, addr: '', date: WEEK.days[now().day] + ' ' + now().time, subject: 'Re: ' + subj.value, body: k.reply }), 1600);
      };
    },
  });
}

// ---------- ブラウザ ----------
const EXTRA_SEARCH = [
  { q: ['ミツバ', 'みつば', 'mitsuba'], res: [
    { type: 'news', title: '株式会社ミツバ企画 | 公式サイト', site: 'mitsuba-pro.co.jp', date: '', snippet: '所属アーティスト:Lumière / 新人発掘オーディション開催中', body: '株式会社ミツバ企画\n\n設立 2009年\n所属:Lumière(ルミエール)\n\nただいま「2026秋 新グループオーディション」の最終選考中です。\n\n(最終更新 2025年4月)' },
    { type: 'bbs', title: 'ミツバ企画ってどうなの?', site: '転職口コミサイト', date: '2026/06/02', snippet: '★1.9 「終電で帰れたら勝ち」「部長はいい人。それ以外は…」', posts: [['1', '元社員', '2026/06/02', '終電で帰れたら勝ち\nタクシー代は出ない'], ['2', '現役', '2026/06/10', '部長はいい人。それ以外は察して'], ['5', '元社員', '2026/07/01', 'タレントの子たちが一番かわいそう']] },
  ] },
  { q: ['ルミエール', 'lumière', 'lumiere', 'あかり'], res: [
    { type: 'x', title: 'Lumière(ルミエール)公式(@lumiere_official)', site: 'Z', date: '2026/10/25', snippet: '12/27 年末ワンマン 開催決定!チケット一般発売中', posts: [['2026/10/25 20:00', '12/27 年末ワンマンライブ開催決定!\nチケット一般発売中です✨', '♡ 820'], ['2026/10/18 21:00', '今夜のメンバー配信は、あかりの体調不良のためお休みします', '♡ 301']] },
  ] },
];
function searchAll(q) {
  const n = q.replace(/[\s ]/g, '').toLowerCase();
  if (!n) return { hits: [], cands: [] };
  const cands = CANDIDATES.filter(c => {
    const keys = [c.name.replace(' ', ''), c.kana.replace(' ', '')].concat(c.name.split(' '), c.kana.split(' '));
    return keys.some(k => k && n.includes(k));
  });
  let hits = [];
  cands.forEach(c => {
    const xs = XSEARCH[c.id];
    if (xs) hits.push({ cid: c.id, type: 'xsearch', q: c.name.replace(' ', ''), title: `「${c.name.replace(' ', '')}」の検索結果 / Z`, site: 'Z', date: '', snippet: xs[0][3].replace(/\n/g, ' '), posts: xs });
    c.search.forEach(r => hits.push(Object.assign({ cid: c.id }, r)));
  });
  EXTRA_SEARCH.forEach(e => { if (e.q.some(k => n.includes(k))) hits = hits.concat(e.res); });
  if (S.phase === 'group') hits = G.searchHits(n).concat(hits);
  return { hits, cands };
}
const SITE_URL = { wiki: 'https://minna-wiki.example.org/wiki/', x: 'https://z.example.com/', xsearch: 'https://z.example.com/search?q=', bbs: 'https://bbs.example.net/test/read.cgi/', sns: 'https://sns.example.com/', news: 'https://news.example.jp/article/', video: 'https://video.example.com/watch?v=', blog: 'https://blog.example.jp/entry/' };
function openBrowser(q) {
  OS.open('browser', {
    title: 'ヤマビコ検索 - ブラウザ', icon: 'browser', w: 860, h: 560,
    render(body, w) {
      w.stack = w.stack || [{ page: 'home' }];
      w.pos = w.pos == null ? 0 : w.pos;
      const cur = w.stack[w.pos];
      const go = st => { w.stack = w.stack.slice(0, w.pos + 1); w.stack.push(st); w.pos++; OS.refresh('browser'); };
      w.go = go;
      let url = 'https://yamabiko-search.jp/';
      if (cur.page === 'results') url += 'search?q=' + encodeURIComponent(cur.q);
      if (cur.page === 'view') {
        const r = cur.r;
        url = SITE_URL[r.type] + (r.type === 'xsearch' ? encodeURIComponent(r.q) + '&src=typed_query' : r.type === 'x' ? xHandle(r.title).id : Math.abs(hash(r.title)) % 99999999);
      }
      body.innerHTML = `
        <div class="br-tabs"><div class="br-tab on">${Icons.get('browser')}<span class="tt"></span></div><div class="br-plus">+</div></div>
        <div class="br-bar"><button class="flat" data-back ${w.pos ? '' : 'disabled'}>${Icons.get('back')}</button><button class="flat" data-fwd ${w.pos < w.stack.length - 1 ? '' : 'disabled'}>${Icons.get('fwd')}</button><button class="flat">${Icons.get('reload')}</button>
          <div class="br-url">${Icons.get('lock')}<span></span></div></div>
        <div class="br-page"></div>`;
      body.querySelector('.br-url span').textContent = url;
      body.querySelector('[data-back]').onclick = () => { w.pos--; OS.refresh('browser'); };
      body.querySelector('[data-fwd]').onclick = () => { w.pos++; OS.refresh('browser'); };
      const pg = body.querySelector('.br-page');
      const tt = body.querySelector('.tt');
      if (cur.page === 'home') {
        tt.textContent = 'ヤマビコ検索';
        pg.innerHTML = `<div class="yh"><div class="logo">ヤマビコ<small>検索</small></div><form class="sbox"><input placeholder="名前やキーワードを入れてください" enterkeyhint="search"><button>${Icons.get('search')}</button></form>
          <div class="yh-note">候補者のことを初めて調べると、今週の空き時間を1コマ使います(あと ${freeLeft()} コマ)</div>
          ${S.history.length ? `<div class="yh-hist"><div>最近の検索</div>${S.history.slice(-6).reverse().map(h => `<button>${escapeHtml(h)}</button>`).join('')}</div>` : ''}
          <div class="yh-news"><div>ニュース</div><p>・円安で来日公演の中止相次ぐ</p><p>・「推し活」の平均出費、月2.3万円 調査</p><p>・都内で今季一番の冷え込み</p></div></div>`;
        bindSearch(pg, go);
        pg.querySelectorAll('.yh-hist button').forEach(b => b.onclick = () => doSearch(b.textContent, go));
      } else if (cur.page === 'results') {
        tt.textContent = cur.q + ' - ヤマビコ検索';
        const { hits } = searchAll(cur.q);
        pg.innerHTML = `<div class="yr"><form class="sbox small"><span class="logo s">ヤマビコ</span><input><button>${Icons.get('search')}</button></form>
          <div class="yr-count">約 ${hits.length ? (hits.length * 1730 + 41).toLocaleString() : 0} 件</div><div class="yr-list"></div></div>`;
        pg.querySelector('input').value = cur.q;
        bindSearch(pg, go);
        const L = pg.querySelector('.yr-list');
        if (!hits.length) L.innerHTML = `<p class="none">「${escapeHtml(cur.q)}」に一致する情報は見つかりませんでした。</p><p class="none">・キーワードに誤字・脱字がないか確認してください<br>・フルネーム(例: 黒田アンナ)で調べてみてください</p>`;
        hits.forEach(r => {
          const d = OS.el('div', 'yr-item');
          d.innerHTML = `<div class="yr-site"></div><a href="#" class="yr-title"></a><div class="yr-snip"></div>`;
          d.querySelector('.yr-site').textContent = r.site + (r.date ? ' ・ ' + r.date : '');
          d.querySelector('.yr-title').textContent = r.title;
          d.querySelector('.yr-snip').textContent = r.snippet;
          d.querySelector('a').onclick = e => { e.preventDefault(); go({ page: 'view', r }); };
          L.append(d);
        });
      } else {
        tt.textContent = cur.r.title;
        pg.innerHTML = renderSite(cur.r);
      }
    },
  });
  if (q) doSearch(q, OS.wins.browser.go);
}
function hash(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }
function bindSearch(pg, go) {
  pg.querySelector('form').onsubmit = e => { e.preventDefault(); doSearch(pg.querySelector('input').value, go); };
}
function doSearch(q, go) {
  q = q.trim();
  if (!q) return;
  const { cands } = searchAll(q);
  const fresh = cands.filter(c => !S.searched[c.id]);
  if (fresh.length && S.phase !== 'group') {
    if (S.submitted) { OS.dialog('ブラウザ', 'もう選考は終わっています。', null, 'info'); return; }
    if (!useSlot(`ネットで調べる: ${fresh.map(c => c.name.replace(' ', '')).join('・')}`)) return;
    fresh.forEach(c => S.searched[c.id] = true);
  }
  S.history = S.history.filter(h => h !== q).concat(q);
  save();
  go({ page: 'results', q });
}
// Z(X風のSNS)
function xHandle(title) {
  const m = title.match(/^(.*)\(@([\w_]+)\)$/);
  return m ? { name: m[1], id: m[2] } : { name: title, id: 'unknown' };
}
function xNum(n) { return typeof n === 'number' ? n.toLocaleString() : n; }
function xPost(name, id, time, text, rep, rt, like, view, to) {
  const hue = Math.abs(hash(id)) % 360;
  return `<div class="zp"><div class="zav" style="background:hsl(${hue} 30% 72%)">${escapeHtml(name[0])}</div><div class="zm">
    <div class="zh"><b>${escapeHtml(name)}</b><span>@${escapeHtml(id)} · ${escapeHtml(time)}</span></div>
    ${to ? `<div class="zto">返信先: <span>@${escapeHtml(to)}</span>さん</div>` : ''}
    <div class="zt">${textHtml(text)}</div>
    <div class="za"><span>${Icons.get('xrep')}${rep ? xNum(rep) : ''}</span><span>${Icons.get('xrt')}${rt ? xNum(rt) : ''}</span><span>${Icons.get('xlike')}${like ? xNum(like) : ''}</span><span>${Icons.get('xview')}${view || ''}</span></div></div></div>`;
}
function zShell(head, inner) {
  return `<div class="z"><div class="zcol"><div class="zbar"><span class="zlogo">Z</span><div class="zsearch">${Icons.get('search')}<span>${escapeHtml(head)}</span></div></div>${inner}</div></div>`;
}
function renderSite(r) {
  if (r.type === 'wiki') return G.wikiHtml();
  if (r.type === 'xsearch') return zShell(r.q, `<div class="ztabs"><span class="on">話題</span><span>最新</span><span>アカウント</span><span>メディア</span></div>
    ${r.posts.map(p => xPost(...p)).join('')}<div class="zend">これ以上の結果はありません</div>`);
  if (r.type === 'x') {
    const h = xHandle(r.title);
    const hue = Math.abs(hash(h.id)) % 360;
    return zShell(h.name, `<div class="zprof"><div class="zcover"></div><div class="zav big" style="background:hsl(${hue} 30% 72%)">${escapeHtml(h.name[0])}</div>
      <div class="zpn"><b>${escapeHtml(h.name)}</b><span>@${escapeHtml(h.id)}</span></div></div>
      <div class="ztabs"><span class="on">ポスト</span><span>返信</span><span>メディア</span><span>いいね</span></div>
      ${r.posts.map(p => {
        const like = p[2] ? parseInt(p[2].replace(/[^0-9]/g, ''), 10) : 0;
        const del = p[1].startsWith('(このポストは削除');
        return del ? `<div class="zp zdel">${textHtml(p[1])}<div class="zh"><span>${escapeHtml(p[0])}</span></div></div>`
          : xPost(h.name, h.id, p[0].slice(0, 10), p[1], Math.round(like / 30), Math.round(like / 12), like, (like * 23).toLocaleString());
      }).join('')}`);
  }
  if (r.type === 'bbs') return `<div class="site bbs"><div class="bbs-h">${escapeHtml(r.site)}</div><h1>${escapeHtml(r.title)}</h1>
    ${r.posts.map(p => `<dl><dt>${p[0]} ：<b>${escapeHtml(p[1])}</b> ：${escapeHtml(p[2])}</dt><dd>${textHtml(p[3])}</dd></dl>`).join('')}<div class="bbs-f">(中略)　新着レスの表示</div></div>`;
  if (r.type === 'sns') return `<div class="site sns"><div class="sns-prof"><div class="sns-av"></div><div><b>${escapeHtml(r.title)}</b></div></div>
    ${r.posts.map(p => `<div class="sns-post"><div class="sns-date">${escapeHtml(p[0])}</div><div>${textHtml(p[1])}</div>${p[2] ? `<div class="sns-like">${escapeHtml(p[2])}</div>` : ''}</div>`).join('')}</div>`;
  if (r.type === 'video') return `<div class="site video"><div class="vid"><span>▶</span></div><h2>${escapeHtml(r.title)}</h2><div class="vmeta">${escapeHtml(r.snippet.split('・')[0])}・${r.date}</div>
    <div class="vcom">コメント</div>${r.comments.map(c => `<div class="vc"><b>${escapeHtml(c[0])}</b><div>${escapeHtml(c[1])}</div></div>`).join('')}</div>`;
  if (r.type === 'blog') return `<div class="site blog"><div class="blog-h">${escapeHtml(r.site)}</div><h2>${escapeHtml(r.title)}</h2><div class="blog-b">${textHtml(r.body)}</div></div>`;
  return `<div class="site news"><div class="news-h">${escapeHtml(r.site)}</div><h2>${escapeHtml(r.title)}</h2><div class="news-d">${r.date}</div><div class="news-b">${textHtml(r.body)}</div><div class="news-ad">広告</div></div>`;
}

// ---------- チャット ----------
function openChat(room) {
  OS.open('chat', {
    title: 'チャット', icon: 'chat', w: 680, h: 500,
    render(body, w) {
      if (room) { w.room = room; room = null; }
      const keys = Object.keys(S.chats);
      w.room = w.room || keys[0];
      S.chatUnread[w.room] = 0; save(); updateClock();
      const r = S.chats[w.room];
      body.innerHTML = `<div class="ch ${OS.isNarrow() && w.inRoom ? 'in' : ''}"><div class="ch-list"></div><div class="ch-room"><div class="ch-h"><button class="flat ch-back">${Icons.get('back')}</button><span></span></div><div class="ch-log"></div><form class="ch-in"><input placeholder="メッセージを入力"><button class="btn">送信</button></form></div></div>`;
      const L = body.querySelector('.ch-list');
      keys.forEach(k => {
        const c = S.chats[k], last = c.log[c.log.length - 1];
        const b = OS.el('button', 'ch-item' + (k === w.room ? ' on' : ''));
        b.innerHTML = `<span class="av">${escapeHtml(c.name[0])}</span><span class="ch-txt"><b></b><small></small></span>${S.chatUnread[k] ? `<em>${S.chatUnread[k]}</em>` : ''}`;
        b.querySelector('b').textContent = c.name;
        b.querySelector('small').textContent = last ? last[2] : '';
        b.onclick = () => { w.room = k; w.inRoom = true; OS.refresh('chat'); };
        L.append(b);
      });
      body.querySelector('.ch-h span').textContent = r.name + (r.members ? `(${r.members})` : '');
      body.querySelector('.ch-back').onclick = () => { w.inRoom = false; OS.refresh('chat'); };
      const lg = body.querySelector('.ch-log');
      r.log.forEach(m => {
        if (!m[0]) { lg.append(OS.el('div', 'msg-sys', escapeHtml(m[2]))); return; }
        const me = m[0] === '自分';
        const d = OS.el('div', 'msg' + (me ? ' me' : ''));
        d.innerHTML = `${me ? '' : `<span class="av">${escapeHtml(m[0][0])}</span>`}<div><div class="msg-n">${me ? '' : escapeHtml(m[0])}</div><div class="bub"></div></div><span class="msg-t">${me ? '既読<br>' : ''}${escapeHtml(m[1].split(' ')[1] || '')}</span>`;
        d.querySelector('.bub').textContent = m[2];
        lg.append(d);
      });
      lg.scrollTop = lg.scrollHeight;
      setTimeout(() => { lg.scrollTop = lg.scrollHeight; });
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const v = body.querySelector('input').value.trim();
        if (!v) return;
        r.log.push(['自分', WEEK.days[now().day] + ' ' + now().time, v]);
        save(); OS.refresh('chat');
      };
    },
  });
}
function pushChat(room, who, text) {
  const r = S.chats[room];
  r.log.push([who, WEEK.days[now().day] + ' ' + now().time, text]);
  const w = OS.wins.chat;
  if (!(w && w.room === room && !w.el.classList.contains('min'))) S.chatUnread[room] = (S.chatUnread[room] || 0) + 1;
  save(); updateClock(); OS.refresh('chat');
  OS.toast(APPS.chat, r.name, `${who}: ${text}`, () => openChat(room));
}

// ---------- カレンダー ----------
function openCalendar() {
  if (S.phase === 'group') return G.openCalendar();
  OS.open('calendar', {
    title: 'カレンダー', icon: 'calendar', w: 760, h: 440,
    render(body) {
      const k = lastAct();
      body.innerHTML = `<div class="cal-h"><b>2026年10月</b><span>10/26 〜 10/30</span><span class="cal-left">今週の空き あと <b>${freeLeft()}</b> コマ</span></div>
        <div class="cal"><div></div>${WEEK.days.map(d => `<div class="cal-d">${d}</div>`).join('')}
        ${[0, 1].map(h => `<div class="cal-t">${h ? '午後' : '午前'}</div>${WEEK.days.map((d, di) => {
          const i = di * 2 + h, s = S.slots[i];
          if (s) return `<div class="ev ${s.kind}">${escapeHtml(s.label)}</div>`;
          if (i <= k) return `<div class="ev past">(空いていたけど何もしなかった)</div>`;
          return `<div class="ev free"><span>空き</span>${S.submitted ? '' : `<button class="btn" data-i="${i}">追加面接を入れる</button>`}</div>`;
        }).join('')}`).join('')}
        <div></div>${WEEK.days.map((d, di) => `<div class="cal-foot">${di === 4 ? '<b>18:00 選考表しめきり</b>' : ''}</div>`).join('')}</div>`;
      body.querySelectorAll('[data-i]').forEach(b => b.onclick = pickInterview);
    },
  });
}
function pickInterview() {
  const left = CANDIDATES.filter(c => !S.interviewed[c.id]);
  OS.open('pick', {
    title: '追加面接に呼ぶ人', icon: 'calendar', w: 360, h: 420,
    render(body) {
      body.innerHTML = `<div class="pick"><p>次の空き時間(1コマ)を使って、追加で面接します。</p>${left.map(c => `<button data-c="${c.id}">${photoSlot(c, 'tiny')}<span>${escapeHtml(c.name)}<small>${c.age}歳・${escapeHtml(c.career)}</small></span></button>`).join('')}</div>`;
      body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        const c = C(b.dataset.c);
        if (!useSlot(`追加面接: ${c.name.replace(' ', '')}`)) return;
        S.interviewed[c.id] = WEEK.days[now().day].slice(0, 5).replace('/', '-');
        save();
        OS.close('pick');
        OS.refresh('explorer');
        OS.toast(APPS.explorer, 'メモを保存しました', `${c.no}_${c.name.replace(' ', '')} に 追加面接メモ を保存しました`, () => openText('iv_' + c.id, `追加面接メモ - ${c.name}`, c.interview));
      });
    },
  });
}

// ---------- 表計算(選考表) ----------
function openSheet() {
  OS.open('sheet', {
    title: '選考表_最終(2).xlsx - 表計算', icon: 'sheet', w: 900, h: 520,
    render(body, w) {
      w.tab = w.tab || 'main';
      const passN = CANDIDATES.filter(c => S.sheet[c.id].j === '合格').length;
      const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
      let rows = '';
      const blank = () => cols.map((c, i) => `<td class="${i === 3 || i === 4 ? 'nx' : ''}"></td>`).join('');
      if (w.tab === 'main') {
        const R = (n, cells, cls) => `<tr class="${cls || ''}"><th>${n}</th>${cells}</tr>`;
        rows += R(1, `<td colspan="7" class="title">2026秋オーディション 最終選考表</td>`);
        rows += R(2, `<td colspan="7" class="sub">※判定は「合格」「保留」「不合格」から選ぶ。メモは自由に</td>`);
        rows += R(3, ['No', '氏名', '年齢', '出身', '経歴', '判定', 'メモ'].map((h, i) => `<td class="hd ${i === 3 || i === 4 ? 'nx' : ''}">${h}</td>`).join(''));
        CANDIDATES.forEach((c, i) => {
          const v = S.sheet[c.id];
          rows += R(4 + i, `<td class="num">${c.no}</td><td>${escapeHtml(c.name)}</td><td class="num">${c.age}</td><td class="nx">${escapeHtml(c.from.slice(0, 3))}</td><td class="nx">${escapeHtml(c.career)}</td>
            <td class="j ${v.j === '合格' ? 'ok' : v.j === '不合格' ? 'ng' : ''}"><select data-j="${c.id}" ${S.submitted ? 'disabled' : ''}><option></option>${['合格', '保留', '不合格'].map(o => `<option ${v.j === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
            <td class="memo"><input data-n="${c.id}" ${S.submitted ? 'readonly' : ''}></td>`);
        });
        rows += R(12, '<td colspan="7"></td>');
        rows += R(13, `<td></td><td class="r">合格人数</td><td class="num f" data-f="=COUNTIF(F4:F11,&quot;合格&quot;)">${passN}</td><td colspan="4" class="${passN > 5 ? 'red' : ''}">${passN > 5 ? '←予算オーバー' : ''}</td>`);
        rows += R(14, `<td></td><td class="r">上限</td><td class="num">5</td><td colspan="4"></td>`);
        for (let n = 15; n < 22; n++) rows += R(n, blank());
      } else if (w.tab === 'budget') {
        const B = [['項目', '月額', '備考'], ['メンバー固定給', '¥80,000', '×人数 / 歩合は別'], ['寮(1K×2)', '¥142,000', '相部屋前提'], ['レッスン', '¥220,000', '三浦先生込み'], ['衣装', '¥0', '←未定!!'], ['宣伝', '¥50,000', '少ない'], ['', '', ''], ['半年で結果出なければ見直し(部長)', '', '']];
        B.forEach((r, i) => rows += `<tr><th>${i + 1}</th>${r.map((x, j) => `<td class="${i === 0 ? 'hd' : j === 1 ? 'num' : ''} ${x === '¥0' ? 'red' : ''}">${escapeHtml(x)}</td>`).join('')}<td></td><td></td><td></td><td></td></tr>`);
        for (let n = B.length + 1; n < 22; n++) rows += `<tr><th>${n}</th>${'<td></td>'.repeat(7)}</tr>`;
      } else if (S.phase === 'group' && (w.tab === 'money' || w.tab === 'members')) {
        rows = G.sheetRows(w.tab);
      } else {
        for (let n = 1; n < 22; n++) rows += `<tr><th>${n}</th>${'<td></td>'.repeat(7)}</tr>`;
      }
      body.innerHTML = `
        <div class="xl-tabs"><span class="file">ファイル</span><span class="on">ホーム</span><span>挿入</span><span>ページ レイアウト</span><span>数式</span><span>データ</span><span>校閲</span><span>表示</span></div>
        <div class="xl-ribbon"><div class="rg"><span class="dd">游ゴシック</span><span class="dd s">11</span><b>B</b><i>I</i><u>U</u></div><div class="rg"><span class="fill"></span><span class="fcol">A</span></div><div class="rg grow"></div>
          <div class="rg"><button class="btn primary" data-send ${S.submitted ? 'disabled' : ''} ${S.phase === 'group' ? 'hidden' : ''}>${Icons.get('mail')}${S.submitted ? '送信済み' : '部長にメールで送る'}</button></div></div>
        <div class="xl-fx"><span class="nm">A1</span><span class="fx">fx</span><span class="fv">2026秋オーディション 最終選考表</span></div>
        <div class="xl-grid"><table><thead><tr><th></th>${cols.map((c, i) => `<th class="${i === 3 || i === 4 ? 'nx' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
        <div class="xl-sheets"><button data-t="main" class="${w.tab === 'main' ? 'on' : ''}">選考</button>${S.phase === 'group' ? G.sheetTabs().map(([k, v]) => `<button data-t="${k}" class="${w.tab === k ? 'on' : ''}">${v}</button>`).join('') : `<button data-t="budget" class="${w.tab === 'budget' ? 'on' : ''}">予算</button>`}<button data-t="s3" class="${w.tab === 's3' ? 'on' : ''}">Sheet3</button><span>+</span></div>
        <div class="statusbar"><span>準備完了</span><span>${w.tab === 'main' ? `合格: ${passN} 人` : ''}</span></div>`;
      const fv = body.querySelector('.fv'), nm = body.querySelector('.nm');
      body.querySelectorAll('.xl-grid td').forEach(td => td.addEventListener('click', () => {
        body.querySelectorAll('.xl-grid td.cur').forEach(x => x.classList.remove('cur'));
        td.classList.add('cur');
        const tr = td.parentElement, row = tr.querySelector('th').textContent;
        const col = cols[Array.from(tr.children).indexOf(td) - 1] || 'A';
        nm.textContent = col + row;
        const inp = td.querySelector('input,select');
        fv.textContent = td.dataset.f || (inp ? inp.value : td.textContent);
      }));
      body.querySelectorAll('[data-j]').forEach(s => s.onchange = () => { S.sheet[s.dataset.j].j = s.value; save(); OS.refresh('sheet'); });
      body.querySelectorAll('[data-n]').forEach(inp => { inp.value = S.sheet[inp.dataset.n].note; inp.oninput = () => { S.sheet[inp.dataset.n].note = inp.value; fv.textContent = inp.value; save(); }; });
      body.querySelectorAll('[data-gn]').forEach(inp => { S.gnotes = S.gnotes || {}; inp.value = S.gnotes[inp.dataset.gn] || ''; inp.oninput = () => { S.gnotes[inp.dataset.gn] = inp.value; fv.textContent = inp.value; save(); }; });
      body.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { w.tab = b.dataset.t; OS.refresh('sheet'); });
      const send = body.querySelector('[data-send]');
      if (send) send.onclick = trySubmit;
    },
  });
}
function trySubmit() {
  const pass = CANDIDATES.filter(c => S.sheet[c.id].j === '合格');
  if (pass.length < 4 || pass.length > 5) {
    OS.dialog('送信できません', `合格が ${pass.length} 人になっています。\n部長からは「4人か5人」と言われています。`, null, 'warn');
    return;
  }
  const hold = CANDIDATES.filter(c => !S.sheet[c.id].j || S.sheet[c.id].j === '保留');
  OS.dialog('部長にメールで送る', `この内容で送りますか?\n\n合格: ${pass.map(c => c.name.replace(' ', '')).join('、')}${hold.length ? `\n\n(判定が空欄・保留の人が ${hold.length} 人います。不合格として扱われます)` : ''}\n\n送ったあとは変更できません。`,
    [{ label: '送信', primary: true, fn: submit }, { label: 'キャンセル' }], 'info');
}
function submit() {
  S.submitted = true;
  const pass = CANDIDATES.filter(c => S.sheet[c.id].j === '合格');
  save();
  OS.refresh('sheet'); OS.refresh('calendar'); renderDesktop();
  const L = {
    hayase: '早瀬は前の事務所の件、向こうの言い分だけ鵜呑みにしないように。',
    shiraishi: '白石は父親の同意書が要る。早めに長野に行ってきてください。',
    kuroda: '黒田は歌で引っ張ってもらう。逃げられないようにな。',
    mori: '森は上京の費用、寮でなんとかする。',
    nanase: '七瀬のフォロワーは正直助かる。ネットの件は把握してるよな?',
    kashiwagi: '柏木はお母さんの窓口をあなたにお願いします。私は無理です。',
    kasai: '葛西は…まあ、あなたが言うなら。',
    uno: '宇野は声がいい。ネットの件は、何かあったら会社として守る。',
  };
  setTimeout(() => addMail({ id: 'boss2', from: '桐谷 誠(部長)', addr: 'kiritani@mitsuba-pro.co.jp', date: WEEK.days[now().day] + ' ' + now().time, subject: 'Re: 選考表', body:
`確認しました。この${pass.length}人でいきましょう。

${pass.map(c => '・' + L[c.id]).join('\n')}

本人たちへの連絡は明日、私からします。
グループのチャットを作っておくので、顔合わせまでに挨拶しておいてください。

ここからが本番です。よろしく。

桐谷` }), 1200);
  setTimeout(() => {
    S.chats.group = { name: '新グループ(仮)', members: pass.length + 2, log: [['桐谷', WEEK.days[now().day] + ' ' + now().time, 'このグループは新グループの連絡用です。担当プロデューサーも入っています。']] };
    save();
    pushChat('group', '桐谷', 'みなさん合格おめでとうございます。まずは一言ずつどうぞ');
    let t = 0;
    pass.forEach(c => c.greet.forEach(g => { t += 700 + Math.random() * 900; setTimeout(() => pushChat('group', c.name.replace(' ', ''), g), t); }));
    setTimeout(() => OS.dialog('オーディション終了', 'オーディションの部分はここまでです。\n\nデスクトップに「答え合わせ(開発用).txt」を置きました。候補者の本当の能力と裏の事情が書いてあります(本番では見えません)。\n\nここから、グループ結成後の1か月が始まります。', [{ label: '1週間後へ', primary: true, fn: () => { ['calendar', 'pick', 'compose'].forEach(OS.close); G.start(pass.map(c => c.id)); } }], 'info'), t + 2500);
  }, 4000);
}
function openAnswer() {
  const line = c => {
    const h = c.hidden, v = S.sheet[c.id].j || '(空欄)';
    const did = [S.searched[c.id] && '検索', S.interviewed[c.id] && '追加面接', c.contacts.some(k => S.asked[k.key]) && '問い合わせ'].filter(Boolean).join('・') || 'なし';
    return `■ ${c.name}(${c.age})  判定: ${v}  /  調べたこと: ${did}
  歌 ${h.vocal}  ダンス ${h.dance}  見た目 ${h.looks}  トーク ${h.talk}
  体力 ${h.stamina}  メンタル ${h.mental}  野心 ${h.drive}
  裏の事情: ${c.truth}`;
  };
  openText('answer', '答え合わせ(開発用).txt', `※開発用。本番では見えない情報です(数字は 1〜10)

${CANDIDATES.map(line).join('\n\n')}`);
}

// ---------- スタートメニュー ----------
function toggleStart(force) {
  const m = document.getElementById('startmenu');
  const show = force != null ? force : m.hidden;
  m.hidden = !show;
  if (!show) return;
  const pins = [['explorer', () => openExplorer('audition')], ['mail', openMail], ['browser', () => openBrowser()], ['chat', () => openChat()], ['calendar', openCalendar], ['sheet', openSheet]];
  m.innerHTML = `<input class="sm-search" placeholder="アプリ、設定、ドキュメントの検索"><div class="sm-h">ピン留め済み</div><div class="sm-grid"></div>
    <div class="sm-h">おすすめ</div><div class="sm-rec"><button data-r="sheet">${Icons.get('sheet')}<span>選考表_最終(2).xlsx<small>2 時間前</small></span></button><button data-r="todo">${Icons.get('txt')}<span>TODO.txt<small>昨日</small></span></button><button data-r="about">${Icons.get('info')}<span>この試作について<small>開発メモ</small></span></button></div>
    <div class="sm-foot"><span>${Icons.get('user')}新グループ担当P</span><button class="flat" data-power title="電源">${Icons.get('power')}</button></div>`;
  const g = m.querySelector('.sm-grid');
  pins.forEach(([k, fn]) => { const b = OS.el('button'); b.innerHTML = `${Icons.get(APPS[k].icon)}<span>${APPS[k].name}</span>`; b.onclick = () => { toggleStart(false); fn(); }; g.append(b); });
  m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { toggleStart(false); b.dataset.r === 'about' ? openAbout() : openDesktop(b.dataset.r); });
  m.querySelector('[data-power]').onclick = () => { toggleStart(false); OS.dialog('電源', '最初からやり直しますか?\n(このブラウザに保存されている進み具合が消えます)', [{ label: 'やり直す', primary: true, fn: () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); } }, { label: 'キャンセル' }], 'warn'); };
  m.querySelector('.sm-search').onkeydown = e => { if (e.key === 'Enter') { toggleStart(false); openBrowser(e.target.value); } };
}
function openAbout() {
  openText('about', 'この試作について', `(仮題)アイドルグループ育成ローグライク 試作 0.1

いまできること
・オーディションの最終選考の1週間
・資料を読む(エクスプローラー → オーディション2026秋)
・空き時間を使って調べる
    ブラウザで名前を検索 / メールで関係者に問い合わせ / カレンダーで追加面接
・選考表(表計算)で合否を決めて、部長に送る

まだないもの
・グループ結成後の活動(ここがメイン。これから詰める)
・候補者のランダム生成
・ランの評価、ランをまたぐ経験・コネ
・立ち絵(写真欄はあとから差し替えられるようにしてある)

操作
・アイコンはダブルクリックで開く(スマホは1回タップ)
・最初からやり直すときは、スタートメニューの電源ボタン`);
}

// ---------- 起動 ----------
function boot() {
  renderDesktop();
  updateClock();
  document.getElementById('startbtn').onclick = e => { e.stopPropagation(); toggleStart(); };
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#startmenu,#startbtn')) toggleStart(false); });
  document.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => ({ explorer: () => openExplorer('audition'), mail: openMail, browser: () => openBrowser(), chat: () => openChat(), calendar: openCalendar, sheet: openSheet }[b.dataset.pin])());
  document.getElementById('tb-search').onsubmit = e => { e.preventDefault(); const v = e.target.querySelector('input').value; e.target.querySelector('input').value = ''; openBrowser(v); };
  const lock = document.getElementById('lock');
  // 途中で閉じた場合の続き
  const pass = () => CANDIDATES.filter(c => S.sheet[c.id].j === '合格').map(c => c.id);
  if (S.submitted && (S.phase !== 'group' || !S.g.name)) setTimeout(() => OS.dialog('オーディション終了', 'ここから、グループ結成後の1か月が始まります。', [{ label: '1週間後へ', primary: true, fn: () => G.start(pass()) }], 'info'), 900);
  if (S.booted) { lock.remove(); return; }
  lock.querySelector('.lk-time').textContent = '9:12';
  const enter = () => {
    lock.classList.add('open');
    setTimeout(() => lock.remove(), 500);
    S.booted = true; save();
    setTimeout(() => { openMail(); S.mails.find(m => m.id === 'boss1').unread = false; save(); updateClock(); OS.refresh('mail'); }, 700);
  };
  lock.onclick = enter;
  lock.onkeydown = e => { if (e.key === 'Enter') enter(); };
}
boot();
