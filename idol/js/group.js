// グループ結成後(4週間)
// 時間はプロデューサーのカレンダー(1週 14コマ = 7日 × 午前/午後)。
// 空き枠に「レッスン / 面談 / SNS運営 / 営業」を入れ、仕事の依頼はメールで受ける。
// 「この予定で1週間を進める」を押すと、予定が順に実行されて結果が返ってくる。

const G = (() => {
  const rnd = () => Math.random();
  const pick = a => a[Math.floor(rnd() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const yen = n => (n < 0 ? '-' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString();
  const g = () => S.g;
  const M = id => S.g.m[id];
  const nm = id => C(id).name.split(' ')[1];           // 下の名前(チャットや報告で使う)
  const full = id => C(id).name.replace(' ', '');
  const active = () => Object.keys(S.g.m).filter(id => M(id).status !== 'left');
  const ready = () => active().filter(id => M(id).status === 'active');
  const minor = id => C(id).age < 18;
  const WEEKS = 4;

  // ---------- 日付 ----------
  function date(w, d) { return new Date(2026, 10, 2 + w * 7 + d); }
  function dayLabel(w, d) { const t = date(w, d); return `${t.getMonth() + 1}/${t.getDate()}(${'日月火水木金土'[t.getDay()]})`; }
  function slotLabel(i, w) { return `${dayLabel(w == null ? S.g.week : w, i >> 1)} ${i % 2 ? '午後' : '午前'}`; }
  function weekRange(w) { return `${dayLabel(w, 0).replace(/\(.\)/, '')}〜${dayLabel(w, 6).replace(/\(.\)/, '')}`; }

  const FIXED = [
    { 0: '定例会議' },
    { 0: '定例会議', 7: 'Lumière あかりの面談に同席' },
    { 0: '定例会議', 4: '経費精算・雑務' },
    { 0: '定例会議', 13: 'Lumière 年末ライブ打ち合わせ' },
  ];
  function freshSlots(w) {
    const s = Array(14).fill(null);
    Object.entries(FIXED[w] || {}).forEach(([i, label]) => s[i] = { kind: 'fixed', label });
    return s;
  }

  // ---------- 仕事の依頼 ----------
  // when: [曜日(0=月), 0午前/1午後] の候補 / ck: 営業先の種類 / nom: 指名のしかた
  const JOBS = [
    { k: 'taiban', kind: 'live', tier: 0, ck: 'live', client: '下北沢 GARAGE NOISE', person: 'ブッキング担当 岡', subj: '対バンイベント出演のご相談', when: [[5, 1], [6, 1]], pay: 'ticket', min: 3, max: 9, w: { vocal: 1, dance: 1, talk: .3 }, fans: 120, cheki: 1,
      desc: '弊店の対バンイベントに、新人枠でご出演いただけないでしょうか。持ち時間20分、終演後に特典会の時間をお取りします。' },
    { k: 'mall', kind: 'event', tier: 0, ck: 'event', client: 'イベント制作 サンライズ企画', person: '制作 小島', subj: 'ショッピングモール ステージイベントのご相談', when: [[5, 0], [6, 0]], pay: 50000, min: 3, max: 6, nom: 'talk', w: { talk: 1, looks: .5, dance: .5 }, fans: 90, cheki: 1,
      desc: '郊外のショッピングモールで、週末のステージイベントを予定しております。ステージ30分、特典会ありです。なお先方のご希望で、センターの方は「明るい感じの子」でお願いしたいとのことです。' },
    { k: 'radio', kind: 'media', tier: 0, ck: 'media', client: 'コミュニティFM しながわ', person: 'ディレクター 堀', subj: 'ラジオ番組 ゲスト出演のお願い', when: [[1, 0], [3, 0]], pay: 10000, min: 1, max: 2, nom: 'talk', w: { talk: 1 }, fans: 40,
      desc: '地域の情報番組で、新人アイドルの方をご紹介するコーナーがございます。生放送で10分ほど、お話を伺えればと思います。' },
    { k: 'stream', kind: 'stream', tier: 0, ck: 'corp', client: '配信アプリ「ポプラ」運営事務局', person: 'パートナー担当', subj: '【公式】新人応援ランキングイベントのご案内', when: [[2, 1], [4, 1]], pay: 'gift', min: 1, max: 9, w: { talk: 1, looks: .6 }, fans: 70, tired: 1.4,
      desc: '新人アイドル応援ランキングイベントにご参加いただけませんか。期間中の配信で集まったギフトの一部を事務所様にお支払いします。上位入賞で公式バナー掲載!' },
    { k: 'webvar', kind: 'media', tier: 1, ck: 'media', client: 'Web番組「深夜の部室」', person: 'AD 宮田', subj: 'Web番組 ゲスト出演のご相談', when: [[2, 1], [3, 1]], pay: 30000, min: 2, max: 3, w: { talk: 1, looks: .4 }, fans: 220,
      desc: '動画配信の番組で、ゲストとしてご出演いただけないでしょうか。収録は2時間ほど。トークが中心の番組です。' },
    { k: 'magazine', kind: 'media', tier: 1, ck: 'media', client: '月刊アイドルスコープ 編集部', person: '編集 吉岡', subj: '新人紹介ページ 撮影のご相談', when: [[1, 1], [3, 1]], pay: 30000, min: 1, max: 1, nom: 'looks', w: { looks: 1 }, fans: 160,
      desc: '巻末の新人紹介ページ(1/2ページ)で、グループからお一人ご紹介させてください。撮影と簡単なインタビューです。' },
    { k: 'school', kind: 'event', tier: 1, ck: 'event', client: '〇〇大学 学園祭実行委員会', person: '企画局 中村', subj: '学園祭ステージ 出演依頼', when: [[5, 0], [6, 0]], pay: 50000, min: 3, max: 9, w: { dance: 1, vocal: .6, talk: .6 }, fans: 200, cheki: 1,
      desc: '学園祭のメインステージにご出演いただけないでしょうか。持ち時間25分です。学生の企画なので不慣れな点があるかと思いますが…' },
    { k: 'pr', kind: 'pr', tier: 1, ck: 'corp', client: '株式会社ルクシア(美容)', person: 'マーケティング部 西', subj: 'SNS PR投稿のご相談', when: [[1, 1], [2, 0], [4, 0]], pay: 60000, min: 1, max: 1, nom: 'followers', w: { looks: 1, talk: .3 }, fans: 100, pr: 1,
      desc: '弊社の新作美容液のPR投稿をお願いできないでしょうか。投稿1回と、撮影が半日です。「#PR」の表記は控えめでお願いできればと思います。' },
    { k: 'dinner', kind: 'dinner', tier: 1, ck: 'corp', client: '株式会社ハーベストキャピタル', person: '代表付き秘書 平田', subj: '会食のご案内(スポンサーのご相談)', when: [[4, 1]], pay: 200000, min: 2, max: 2, adult: 1, night: 1, w: { talk: 1, looks: 1 }, fans: 0,
      desc: '弊社代表が、新しいアイドルグループへの出資に関心を持っております。つきましては、メンバーの方お二人とお食事をご一緒できればと存じます。お車代として20万円をご用意しております。' },
    { k: 'tvnight', kind: 'media', tier: 2, ck: 'media', client: '東都テレビ「夜ふかしアイドル部」', person: 'ディレクター 菊池', subj: '深夜番組 ひな壇出演のお願い', when: [[4, 1]], pay: 60000, min: 2, max: 3, night: 1, w: { talk: 1, looks: .5 }, fans: 600,
      desc: '深夜のバラエティ番組で、新人アイドルのひな壇企画がございます。収録は23時開始、終了は深夜2時ごろの予定です。' },
    { k: 'gravure', kind: 'gravure', tier: 2, ck: 'media', client: '週刊ミッドナイト 編集部', person: 'グラビア班 樋口', subj: 'グラビア撮影のご相談', when: [[2, 1]], pay: 100000, min: 1, max: 1, nom: 'looks', adult: 1, w: { looks: 1 }, fans: 500,
      desc: '巻中グラビア(4ページ)のご相談です。水着での撮影を予定しております。新人の方を大きく扱えるチャンスかと思います。' },
    { k: 'fes', kind: 'live', tier: 2, ck: 'event', client: 'TOKYO IDOL CARNIVAL 実行委員会', person: '出演調整 森下', subj: 'アイドルフェス 出演のご案内', when: [[6, 1]], pay: 0, min: 3, max: 9, w: { vocal: 1, dance: 1, talk: .3 }, fans: 800, cheki: 1,
      desc: '夏の大型フェスの冬版を開催します。サブステージ15分枠でのご出演です。出演料はございませんが、露出の機会としてご検討ください。' },
  ];
  const SPECIAL = {
    debut: { k: 'debut', kind: 'live', client: 'ミツバ企画(社内)', person: '桐谷', subj: 'お披露目ライブの件(決定事項)', pay: 'ticket', min: 3, max: 9, w: { vocal: 1, dance: 1, talk: .4 }, fans: 200, cheki: 1, fixed: [5, 1],
      desc: '今週土曜にお披露目ライブをやります。会場は渋谷の小箱、キャパ80。全員出してください。これは決定です。' },
    opening: { k: 'opening', kind: 'live', client: 'ミツバ企画(社内)', person: '佐野', subj: 'Lumière 年末ライブの前座について', pay: 0, min: 3, max: 9, w: { vocal: 1, dance: 1, talk: .3 }, fans: 900, cheki: 0, fixed: [5, 1], lumi: 1,
      desc: 'Lumièreの年末ライブ(プレ公演)の前座を、新グループにお願いしたいです。持ち時間10分。Lumièreのファンは、正直あたたかくないです。' },
  };
  const tier = () => S.g.fans < 1500 ? 0 : S.g.fans < 5000 ? 1 : 2;
  function nominee(job) {
    const ok = ready().filter(id => eligible(job, id) === true);
    if (!job.nom || !ok.length) return null;
    const by = { talk: id => M(id).sk.talk + M(id).mf / 400, looks: id => C(id).hidden.looks + M(id).mf / 300, followers: id => M(id).mf, vocal: id => M(id).sk.vocal };
    return ok.sort((a, b) => by[job.nom](b) - by[job.nom](a))[0];
  }
  // true か、出られない理由の文字列を返す
  function eligible(job, id, slot) {
    const m = M(id);
    if (m.status === 'left') return '脱退';
    if (m.status === 'rest') return '休養中';
    if (job.adult && minor(id)) return '18歳未満';
    if (job.night && minor(id)) return '18歳未満は22時以降NG';
    return true;
  }
  function payText(job) {
    if (job.pay === 'ticket') return 'チケットバック(1枚 ¥1,000 × 動員)';
    if (job.pay === 'gift') return 'ギフト額に応じて(目安 数千円〜)';
    if (!job.pay) return 'なし(交通費のみ)';
    return yen(job.pay) + '(税別・交通費込み)';
  }
  function makeJobMail(t, w) {
    const job = Object.assign({}, t);
    const [d, h] = t.fixed || pick(t.when);
    job.slot = d * 2 + h;
    job.nominee = nominee(job);
    if (t.nom && !job.nominee) return null;
    const time = h ? (job.night ? '23:00〜' : '14:00〜') : '10:30〜';
    const body = `ミツバ企画 新グループご担当者様

${t.client} の${t.person}です。

${t.desc}

  日時: ${dayLabel(w, d)} ${time}
  人数: ${t.min === t.max ? t.min : t.min + '〜' + t.max}名
  ギャラ: ${payText(t)}${job.nominee ? `\n  ご指名: ${full(job.nominee)} さん` : ''}${t.night ? '\n  ※深夜帯の収録です' : ''}

ご検討のほど、よろしくお願いいたします。`;
    return { id: `job_${w}_${t.k}_${Math.floor(rnd() * 1e6)}`, from: t.client, addr: '', date: dayLabel(w, 0) + ' 09:' + String(10 + Math.floor(rnd() * 40)), subject: t.subj, body, job, jobState: 'open' };
  }
  function genJobs() {
    const w = S.g.week, out = [];
    if (w === 0) out.push(makeJobMail(SPECIAL.debut, w));
    if (w === 2) out.push(makeJobMail(SPECIAL.opening, w));
    const pool = JOBS.filter(j => j.tier <= tier() && !(j.k === 'dinner' && S.g.flags.dinner));
    const used = new Set();
    S.g.sales.forEach(ck => {
      const c = JOBS.filter(j => j.ck === ck && j.tier <= tier() + 1 && !used.has(j.k) && !(j.k === 'dinner' && S.g.flags.dinner));
      if (c.length) { const j = pick(c); used.add(j.k); out.push(makeJobMail(j, w)); }
    });
    S.g.sales = [];
    const target = out.length + 2 + (w > 0 ? 1 : 0);
    for (let i = 0; i < 20 && out.length < target; i++) {
      const j = pick(pool);
      if (used.has(j.k)) continue;
      used.add(j.k); out.push(makeJobMail(j, w));
    }
    out.filter(Boolean).reverse().forEach(m => {
      if (m.job.fixed && m.job.k === 'debut') { m.jobState = 'accepted'; m.cast = ready(); S.g.slots[m.job.slot] = { kind: 'job', mail: m.id, label: 'お披露目ライブ(全員)' }; }
      S.mails.unshift(Object.assign({ box: 'inbox', unread: true }, m));
    });
  }

  // ---------- 出演メンバーを選ぶ ----------
  function openAssign(mailId) {
    const mail = S.mails.find(x => x.id === mailId), job = mail.job;
    const cur = S.g.slots[job.slot];
    if (cur && !(cur.kind === 'job' && cur.mail === mailId)) {
      OS.dialog('カレンダー', `${slotLabel(job.slot)} には、もう予定が入っています。\n(${cur.label})\n\n${cur.kind === 'fixed' || cur.kind === 'job' ? 'この依頼は受けられません。' : 'カレンダーで予定を取り消せば受けられます。'}`, null, 'warn');
      return;
    }
    OS.open('assign', {
      title: '出演メンバーを決める', icon: 'calendar', w: 420, h: 500,
      render(body) {
        body.innerHTML = `<div class="asg"><div class="asg-h"><b></b><span>${slotLabel(job.slot)} / ${job.min === job.max ? job.min : job.min + '〜' + job.max}名</span></div><div class="asg-list"></div>
          <div class="asg-foot"><span class="asg-n"></span><button class="btn primary">この人数で受ける</button></div></div>`;
        body.querySelector('b').textContent = mail.subject;
        const L = body.querySelector('.asg-list');
        Object.keys(S.g.m).forEach(id => {
          if (M(id).status === 'left') return;
          const ok = eligible(job, id);
          const school = ok === true && minor(id) && (job.slot >> 1) < 5 && job.slot % 2 === 0;
          const r = OS.el('label', 'asg-row' + (ok === true ? '' : ' off'));
          r.innerHTML = `<input type="checkbox" value="${id}" ${ok === true ? '' : 'disabled'} ${job.nominee === id ? 'checked disabled' : ''}>${photoSlot(C(id), 'tiny')}<span><b>${escapeHtml(full(id))}</b><small>${ok !== true ? ok : job.nominee === id ? '指名' : school ? '平日の昼…学校を休ませることになる' : condWord(id)}</small></span>`;
          L.append(r);
        });
        const count = () => body.querySelectorAll('input:checked').length;
        const upd = () => { const n = count(); body.querySelector('.asg-n').textContent = `${n}人 選択中`; body.querySelector('.primary').disabled = n < job.min || n > job.max; };
        body.querySelectorAll('input').forEach(i => i.onchange = upd); upd();
        body.querySelector('.primary').onclick = () => {
          mail.cast = Array.from(body.querySelectorAll('input:checked')).map(i => i.value);
          mail.jobState = 'accepted';
          S.g.slots[job.slot] = { kind: 'job', mail: mail.id, label: `${mail.from.replace(/(株式会社|編集部|実行委員会|運営事務局)/g, '').trim()}(${mail.cast.map(nm).join('・')})` };
          save(); OS.close('assign'); OS.refresh('mail'); OS.refresh('calendar'); sticky();
          OS.toast(APPS.calendar, '予定に入れました', `${slotLabel(job.slot)} ${mail.subject}`, openCalendar);
        };
      },
    });
  }
  // 見た目からわかる程度の様子
  function condWord(id) {
    const m = M(id);
    if (m.fat >= 75) return '顔色が悪い';
    if (m.fat >= 50) return '疲れている様子';
    if (m.mood < 25) return '元気がない';
    return 'ふつう';
  }
  function decline(mailId) {
    const mail = S.mails.find(x => x.id === mailId);
    mail.jobState = 'declined';
    S.g.rel[mail.job.ck || 'in'] = (S.g.rel[mail.job.ck || 'in'] || 0) - 1;
    save(); OS.refresh('mail');
  }
  function mailActions(rd, cur) {
    if (cur.job) {
      const d = OS.el('div', 'job-act');
      const st = cur.jobState;
      if (st === 'open' && !S.g.done) {
        d.innerHTML = `<button class="btn primary" data-a>受ける(メンバーを選ぶ)</button><button class="btn" data-d ${cur.job.fixed ? 'disabled' : ''}>お断りする</button><span>返事をしないまま週を進めると、断ったのと同じになります</span>`;
        d.querySelector('[data-a]').onclick = () => openAssign(cur.id);
        d.querySelector('[data-d]').onclick = () => decline(cur.id);
      } else d.innerHTML = `<span class="st ${st}">${{ accepted: '受けた', declined: 'お断りした', expired: '返事をしなかった', done: '終わった仕事' }[st] || ''}${cur.cast ? '(出演: ' + cur.cast.map(nm).join('・') + ')' : ''}</span>`;
      rd.querySelector('.ml-body').before(d);
    }
    if (cur.choices) {
      const d = OS.el('div', 'job-act choices');
      if (cur.chosen == null && !S.g.done) {
        d.innerHTML = '<div class="ch-q">どうする?</div>' + cur.choices.map((c, i) => `<button class="btn" data-c="${i}">${escapeHtml(c)}</button>`).join('');
        d.querySelectorAll('[data-c]').forEach(b => b.onclick = () => choose(cur.id, +b.dataset.c));
      } else if (cur.chosen != null) d.innerHTML = `<div class="ch-q">選んだこと: ${escapeHtml(cur.choices[cur.chosen] || '何もしなかった')}</div><div class="ch-r">${textHtml(cur.result || '')}</div>`;
      rd.querySelector('.ml-body').after(d);
    }
  }

  // ---------- 空き枠に予定を入れる ----------
  const LESSON = { vocal: 'ボーカル', dance: 'ダンス', talk: 'トーク・MC' };
  const SNS = { safe: 'オフショットを載せる(無難)', plan: 'メンバー企画の動画(ふつう)', bold: '攻めた企画(バズるかも・荒れるかも)' };
  const SALES = { live: 'ライブハウス', event: 'イベント制作会社', media: 'テレビ局・出版社', corp: '企業(広告・配信)' };
  function openPlan(i) {
    OS.open('plan', {
      title: `${slotLabel(i)} の予定`, icon: 'calendar', w: 440, h: 520,
      render(body) {
        body.innerHTML = `<div class="plan">
          <h4>レッスン <small>全員参加・¥40,000・疲れがたまる</small></h4><div class="pl-row">${Object.entries(LESSON).map(([k, v]) => `<button class="btn" data-k="lesson" data-v="${k}">${v}</button>`).join('')}</div>
          <h4>面談 <small>ひとりと話す</small></h4><div class="pl-row">${active().map(id => `<button class="btn" data-k="talk" data-v="${id}">${escapeHtml(full(id))}</button>`).join('')}</div>
          <h4>SNS運営 <small>グループのZアカウント</small></h4><div class="pl-col">${Object.entries(SNS).map(([k, v]) => `<button class="btn" data-k="sns" data-v="${k}">${v}</button>`).join('')}</div>
          <h4>営業 <small>来週の依頼が増える</small></h4><div class="pl-row">${Object.entries(SALES).map(([k, v]) => `<button class="btn" data-k="sales" data-v="${k}">${v}</button>`).join('')}</div></div>`;
        body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
          const k = b.dataset.k, v = b.dataset.v;
          const label = k === 'lesson' ? `レッスン: ${LESSON[v]}` : k === 'talk' ? `面談: ${full(v)}` : k === 'sns' ? `SNS: ${SNS[v].replace(/\(.+\)/, '')}` : `営業: ${SALES[v]}`;
          S.g.slots[i] = { kind: k, v, label };
          save(); OS.close('plan'); OS.refresh('calendar'); sticky();
        });
      },
    });
  }
  function openCalendar() {
    OS.open('calendar', {
      title: 'カレンダー', icon: 'calendar', w: 900, h: 470,
      render(body) {
        const w = S.g.week;
        body.innerHTML = `<div class="cal-h"><b>第${w + 1}週</b><span>${weekRange(w)}</span><span class="cal-left">グループ予算 <b class="${S.g.money < 0 ? 'neg' : 'pos'}">${yen(S.g.money)}</b>${S.g.debt ? ` ・ 借金 <b class="neg">${yen(S.g.debt)}</b>` : ''}</span></div>
          <div class="cal wk"><div></div>${[0, 1, 2, 3, 4, 5, 6].map(d => `<div class="cal-d ${d > 4 ? 'we' : ''}">${dayLabel(w, d)}</div>`).join('')}
          ${[0, 1].map(h => `<div class="cal-t">${h ? '午後' : '午前'}</div>${[0, 1, 2, 3, 4, 5, 6].map(d => {
            const i = d * 2 + h, s = S.g.slots[i];
            if (s) return `<div class="ev ${s.kind === 'fixed' ? 'fixed' : s.kind === 'job' ? 'job' : 'act'}">${escapeHtml(s.label)}${s.kind !== 'fixed' && s.kind !== 'job' && !S.g.done ? `<button class="x" data-x="${i}" title="取り消す">×</button>` : ''}</div>`;
            return `<div class="ev free"><span>空き</span>${S.g.done ? '' : `<button class="btn" data-i="${i}">予定を入れる</button>`}</div>`;
          }).join('')}`).join('')}</div>
          <div class="cal-go">${S.g.done ? '<span>このランは終わりました</span>' : `<span>依頼の返事がまだ ${openJobs().length} 件</span><button class="btn primary" data-go>この予定で1週間を進める</button>`}</div>`;
        body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => openPlan(+b.dataset.i));
        body.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { S.g.slots[+b.dataset.x] = null; save(); OS.refresh('calendar'); sticky(); });
        const go = body.querySelector('[data-go]');
        if (go) go.onclick = confirmAdvance;
      },
    });
  }
  const openJobs = () => S.mails.filter(m => m.job && m.jobState === 'open');
  const openChoices = () => S.mails.filter(m => m.choices && m.chosen == null);
  function confirmAdvance() {
    const free = S.g.slots.filter(s => !s).length;
    const warn = [];
    if (openJobs().length) warn.push(`返事をしていない依頼が ${openJobs().length} 件あります(断ったことになります)`);
    if (openChoices().length) warn.push(`対応していない件が ${openChoices().length} 件あります(何もしなかったことになります)`);
    if (free) warn.push(`空いている時間が ${free} コマあります`);
    OS.dialog('1週間を進める', `第${S.g.week + 1}週(${weekRange(S.g.week)})をこの予定で進めます。${warn.length ? '\n\n・' + warn.join('\n・') : ''}`, [{ label: '進める', primary: true, fn: advance }, { label: 'キャンセル' }], warn.length ? 'warn' : 'info');
  }

  // ---------- メンバーの成長・疲れ ----------
  function tire(id, base) { const m = M(id); m.fat = clamp(m.fat + base * (1.35 - C(id).hidden.stamina / 10), 0, 100); }
  function moodAdd(id, v) { const m = M(id); m.mood = clamp(m.mood + (v < 0 ? v * (1.3 - C(id).hidden.mental / 10) : v), 0, 100); }
  function skillOf(id, k) { return k === 'looks' ? C(id).hidden.looks : M(id).sk[k]; }
  function perf(ids, wts) {
    if (!ids.length) return 0;
    const tot = Object.values(wts).reduce((a, b) => a + b, 0);
    const avg = ids.map(id => Object.entries(wts).reduce((a, [k, v]) => a + skillOf(id, k) * v, 0) / tot - M(id).fat / 30 - (M(id).mood < 25 ? 1 : 0));
    const lumiPenalty = S.g.flags.lumiHostile ? 0.6 : 0;
    return clamp(avg.reduce((a, b) => a + b, 0) / avg.length + (rnd() * 3 - 1.5) - lumiPenalty, 0, 10);
  }
  const best = (ids, wts) => ids.slice().sort((a, b) => score(b, wts) - score(a, wts))[0];
  const worst = (ids, wts) => ids.slice().sort((a, b) => score(a, wts) - score(b, wts))[0];
  function score(id, wts) { return Object.entries(wts).reduce((a, [k, v]) => a + skillOf(id, k) * v, 0) - M(id).fat / 20; }
  function gainFans(total, ids, nominee) {
    total = Math.round(total);
    S.g.fans = Math.max(0, S.g.fans + total);
    if (!ids.length) return;
    const wt = ids.map(id => (C(id).hidden.looks * .5 + M(id).sk.talk * .3 + 2) * (id === nominee ? 2.5 : 1));
    const sum = wt.reduce((a, b) => a + b, 0);
    ids.forEach((id, i) => M(id).mf = Math.max(0, M(id).mf + total * wt[i] / sum));
  }

  // ---------- 週を進める ----------
  const ZFANS = ['るみ推し@次は年末|lumi_daisuki_', '地下ドル巡回|chika_junkai', 'はこおし|hakooshi_desu', 'みつば新規|mitsuba_shinki', 'たこやき|takoyaki_ota', '名無し|user' + 0, 'ぴの|pino_chekiya', 'アイドル速報まとめ|idol_sokuho_mtm', '在宅おじ|zaitaku_oji', 'かのん|kanon_0w0'];
  function zpost(text, likes, to) {
    const [n, id] = pick(ZFANS).split('|');
    const uid = id.startsWith('user') ? 'user' + (10000000 + Math.floor(rnd() * 89999999)) : id;
    const lk = Math.max(0, Math.round(likes));
    S.g.zlog.unshift([n.startsWith('名無し') ? '名無し' : n, uid, dayLabel(S.g.week, Math.floor(rnd() * 7)).replace(/\(.\)/, ''), text, Math.round(lk / 15), Math.round(lk / 6), lk, (lk * 31).toLocaleString(), to]);
    S.g.zlog = S.g.zlog.slice(0, 40);
  }
  function ownPost(text, likes) {
    S.g.own.unshift([dayLabel(S.g.week, Math.floor(rnd() * 7)).replace(/\(.\)/, '') + ' 20:00', text, '♡ ' + Math.max(1, Math.round(likes)).toLocaleString()]);
  }
  function ledger(item, inc, out) {
    S.g.money += (inc || 0) - (out || 0);
    S.g.ledger.push([`第${S.g.week + 1}週`, item, inc || 0, out || 0, S.g.money]);
  }

  function runJob(mail, R) {
    const job = mail.job, cast = (mail.cast || []).filter(id => M(id).status === 'active');
    const when = slotLabel(job.slot);
    if (!cast.length) { R.push(`■ ${when} ${mail.subject}\n出られるメンバーがいなかった。先方に平謝りした。`); S.g.rel[job.ck] = (S.g.rel[job.ck] || 0) - 2; return; }
    const q = perf(cast, job.w), b = nm(best(cast, job.w)), wv = nm(worst(cast, job.w));
    let txt = '', pay = 0;
    const tier3 = q >= 6.5 ? 2 : q >= 4 ? 1 : 0;
    if (job.kind === 'live') txt = [`歌い出しがずれて、そのまま最後まで戻らなかった。袖で${wv}が泣いていた。`, '可もなく不可もなく。ほかのグループのファンは、うちの番になると後ろに下がっていった。', `フロアが少しずつ前に詰めてきた。${b}のところで小さく歓声が上がった。`][tier3];
    if (job.kind === 'event') txt = ['誰も足を止めなかった。音響さんがずっとスマホを見ていた。', '通りすがりの人が数人。担当者は「まあ、こんなもんですよ」と言った。', `買い物客が足を止めた。子どもが${b}に手を振っていた。`][tier3];
    if (job.kind === 'media') txt = ['ほとんどカットされた。放送を見たメンバーが黙った。', '使われたのは数秒だった。', `${b}の一言がディレクターに刺さったらしい。「また呼びます」と言われた。`][tier3];
    if (job.kind === 'stream') txt = `${b}の枠にギフトが集中した。${wv}の枠は、同時視聴が一桁の時間が長かった。`;
    if (job.kind === 'pr') { txt = `${b}の投稿は伸びた。`; if (rnd() < .3) { txt += '…が、「#PR」の表記が小さすぎるとZで指摘され、「ステマ」と言われ始めた。'; S.g.fans = Math.round(S.g.fans * .96); zpost(`${full(cast[0])}の美容液の投稿、PR表記どこ? ステマじゃん`, 300 + rnd() * 400); } }
    if (job.kind === 'gravure') txt = `撮影は予定より2時間押した。${b}は最後まで笑顔だったが、帰りの車では一言もしゃべらなかった。` + (C(cast[0]).hidden.drive >= 7 ? `次の日、「次は表紙を狙います」とLINEが来た。` : '');
    if (job.kind === 'dinner') {
      const [a, c] = cast;
      txt = `(自分も同行した)二次会に誘われたのを、${nm(a)}がうまく断ってくれた。${nm(c || a)}は帰りのタクシーで泣いていた。\n先方からは「いい子たちですね」とだけ連絡があった。出資の話は、それきり出ていない。`;
      cast.forEach(id => { moodAdd(id, -30); M(id).trust = clamp(M(id).trust - 20, 0, 100); });
      S.g.flags.dinner = 1;
      S.g.log.push(`${S.g.week + 1}週目、スポンサー候補との会食にメンバーを同席させた。`);
    }
    // ギャラ
    if (job.pay === 'ticket') { const att = Math.max(3, Math.round(S.g.fans * .012 * (.5 + q / 10) + rnd() * 8)); pay = att * 1000; txt += `\n動員 ${att}人。`; }
    else if (job.pay === 'gift') { pay = Math.round(cast.reduce((a, id) => a + M(id).mf * (8 + rnd() * 20), 0) / 100) * 100; }
    else pay = job.pay || 0;
    if (pay) ledger(mail.subject.slice(0, 18), pay, 0);
    // ファン
    const fanGain = job.fans * (.3 + q / 8) * (job.lumi ? (S.g.flags.lumiHostile ? .3 : 1) : 1);
    gainFans(fanGain, cast, job.nominee);
    // 特典会(チェキ)
    if (job.cheki) {
      const ch = cast.map(id => [id, Math.max(0, Math.round(M(id).mf * .015 * (.6 + rnd() * .8) + q * .4 - 1))]).sort((a, b) => b[1] - a[1]);
      const sum = ch.reduce((a, x) => a + x[1], 0);
      if (sum) ledger('特典会(チェキ)', sum * 1000, 0);
      txt += `\n特典会: ${ch.map(([id, n]) => `${nm(id)} ${n}枚`).join(' / ')}`;
      const low = ch[ch.length - 1];
      if (ch.length > 2 && low[1] <= 1) { moodAdd(low[0], -12); txt += `\n${nm(low[0])}の前には、ほとんど誰も並ばなかった。`; M(low[0]).flags.lowCheki = (M(low[0]).flags.lowCheki || 0) + 1; }
    }
    // 疲れ・気分
    cast.forEach(id => {
      tire(id, 18 * (job.tired || 1) + (job.night ? 12 : 0));
      M(id).jobs++; M(id).wjobs++;
      if (job.nominee === id) { M(id).nom++; moodAdd(id, 6); }
      if (minor(id) && (job.slot >> 1) < 5 && job.slot % 2 === 0) { M(id).flags.absent = (M(id).flags.absent || 0) + 1; moodAdd(id, -4); }
      if (q >= 6.5) moodAdd(id, 4);
    });
    if (job.kind === 'gravure' && C(cast[0]).hidden.drive < 7) moodAdd(cast[0], -20);
    // Zの反応
    const g1 = S.g.name;
    if (job.kind !== 'dinner') {
      if (tier3 === 2) zpost(pick([`${g1}の${b}ちゃん、今日はじめて見たけど良かった`, `${g1}、新人なのに思ったよりちゃんとしてる`, `${b}推しになりそう`]), fanGain * .8);
      else if (tier3 === 0) zpost(pick([`${g1}、正直まだ素人の発表会レベル`, `ミツバの新グループ見てきた。…がんばって`, `${wv}、明らかに疲れてなかった?`]), 40 + rnd() * 80);
      else zpost(pick([`${g1}見てきた。${b}が気になる`, `ミツバの新しいグループ、名前覚えた`]), fanGain * .4);
    }
    mail.jobState = 'done';
    R.push(`■ ${when} ${mail.subject}\n出演: ${cast.map(nm).join('・')}${pay ? ' / 収入 ' + yen(pay) : ''}\n${txt}`);
  }
  function runLesson(v, R, i) {
    ledger(`レッスン(${LESSON[v]})`, 0, 40000);
    const ids = ready();
    const grow = ids.map(id => {
      const m = M(id), cur = m.sk[v];
      let gn = .25 + .35 * (10 - cur) / 10 + rnd() * .2;
      if (id === 'shiraishi' && v === 'vocal') gn += .35;
      if (id === 'kashiwagi' && S.g.flags.yuiFree && v === 'dance') gn += .2;
      if (m.mood < 25) gn *= .5;
      m.sk[v] = clamp(cur + gn, 0, 10);
      tire(id, 12);
      return [id, gn];
    }).sort((a, b) => b[1] - a[1]);
    R.push(`■ ${slotLabel(i)} レッスン(${LESSON[v]})\n講師のひとこと: 「${nm(grow[0][0])}が一番伸びてる。${grow.length > 1 ? nm(grow[grow.length - 1][0]) + 'は集中できてない' : ''}」`);
  }
  // 面談: 本人の様子と、話の中身(何回目か・信頼で変わる)
  const TALK = {
    hayase: [m => '前のグループの話を少しした。「ここはお給料、ちゃんと出るんですね」と真顔で言われた。',
      m => m.trust >= 30 ? '夜、ほとんど眠れていないと打ち明けられた。「2時間寝れば平気です」。平気ではない。' : '「大丈夫です」を3回言った。',
      m => '「Pさんには言っておきます。坂上さんから、今もときどきDMが来ます」'],
    shiraishi: [m => '東京の空は狭い、と言っていた。', m => m.trust >= 25 ? '父の話をしてくれた。「お父さん、私の顔を見ると怒るんです。お母さんに似てるから」' : '家族の話になると黙った。', m => '「歌、もっとうまくなりたいです」。はじめて自分から何かを欲しがった。'],
    kuroda: [m => '歌割りについて、具体的な秒数で不満を言われた。数えているらしい。', m => m.trust >= 25 ? '「売れなかったら、私は来年ここにいないと思います。それは正直に言っておきます」' : '「別に、問題ないです」', m => '劇団時代の同期の話。「あの子たちに負けたくない」'],
    mori: [m => '寮のご飯を、みんなの分まで作っているらしい。', m => m.trust >= 25 ? '実家の話。母親の体調があまり良くないらしい。「仕送り、もっと増やしたいんです」' : '「家族は元気です!」(即答だった)', m => '「Pさんも、ちゃんと寝てくださいね」と逆に心配された。'],
    nanase: [m => 'SNSの数字の話ばかりしていた。フォロワーの増減を毎日スクショしているらしい。', m => m.trust >= 30 ? (m.flags.confide = 1, '付き合っている人がいる、と打ち明けられた。「隠すの、疲れました」') : '恋愛の話を振ったら、笑ってかわされた。', m => '「グループのアカウント、私に任せてもらえませんか」'],
    kashiwagi: [m => '母親から1日に何十件もLINEが来るらしい。スマホを画面を伏せて置いていた。', m => m.trust >= 25 ? '「東京、楽しいです」。少しだけ笑った。母親の前では見たことがない顔だった。' : 'ほとんど話さなかった。「踊れればいいです」', m => '「振付、自分で考えてみたいです」'],
    kasai: [m => { const lo = active().filter(x => x !== 'kasai').sort((a, b) => M(a).mood - M(b).mood)[0]; return lo ? `最年長として、みんなのことをよく見ている。「${nm(lo)}ちゃん、最近ちょっと元気ないです。ご飯もあんまり食べてない」` : '「ひとりになっちゃいましたね」と笑っていた。'; },
      m => '「アイドルって、こんなに眠いんですね」と笑っていた。', m => '「オタクの頃の自分が見たら、今の私をどう思うかな」'],
    uno: [m => '歌の話のときだけ、目を見て話す。', m => m.trust >= 30 ? (m.flags.consent = 1, '「もし、またネットで何か言われたら…本当のこと、言ってもいいです。Pさんからなら」') : '中学の話は、まだできないと言われた。', m => '「最近、少しだけ眠れるようになりました」'],
  };
  function runTalk(id, R, i) {
    const m = M(id);
    if (m.status === 'left') return;
    m.trust = clamp(m.trust + 12, 0, 100); moodAdd(id, 8); m.fat = clamp(m.fat - 8, 0, 100);
    const lines = [];
    lines.push(m.fat >= 70 ? '顔色が悪い。目の下にクマ。' : m.fat >= 45 ? '少し疲れている様子。' : '元気そう。');
    lines.push(m.mood < 25 ? 'ほとんど目を合わせなかった。' : m.mood < 50 ? '受け答えはするが、本音は言わない感じ。' : 'よく笑っていた。');
    const T = TALK[id];
    lines.push(T[Math.min(m.talks, T.length - 1)](m));
    if (id === 'mori' && m.flags.baito) {
      lines.push('夜、コンビニでバイトしていることがわかった。「内緒にしててください」');
      if (m.trust >= 30) { m.flags.baito = 0; lines.push('やめるように言った。泣きながらうなずいた。'); }
    }
    if (m.flags.absent >= 2 && minor(id)) lines.push(`学校の出席日数が気になっているらしい。(今月 ${m.flags.absent} 回休ませた)`);
    m.talks++;
    const name = `面談メモ_${nm(id)}_第${S.g.week + 1}週.txt`;
    const text = `面談メモ ${full(id)} ${slotLabel(i)}\n\n${lines.join('\n\n')}`;
    S.g.files.unshift({ name, text });
    R.push(`■ ${slotLabel(i)} 面談: ${full(id)}\n(メモは 新グループ フォルダに保存)`);
  }
  function runSNS(v, R, i) {
    const ids = ready();
    const talk = ids.reduce((a, id) => a + M(id).sk.talk, 0) / Math.max(1, ids.length);
    const boost = S.g.m.nanase && M('nanase').status === 'active' ? 1.4 : 1;
    let gain, txt;
    if (v === 'safe') { gain = (25 + talk * 6) * boost * (.7 + rnd() * .6); txt = 'レッスン後のオフショットを載せた。いつもの人たちがいいねしてくれた。'; ownPost('今日もレッスンがんばりました📸 #' + S.g.name, gain * 2); }
    else if (v === 'plan') { gain = (60 + talk * 14) * boost * (.5 + rnd()); txt = `「${pick(['メンバーの好きなところ言い合ってみた', '寮の冷蔵庫の中身紹介', '最年少に敬語禁止チャレンジ'])}」の動画を出した。`; ownPost('【企画】動画あげました!最後まで見てね #' + S.g.name, gain * 2.5); }
    else {
      const r = rnd();
      ownPost(pick(['【ガチ】メンバー同士で「グループに要らない人」投票してみた', '【ドッキリ】リーダーが脱退すると言ったらメンバーはどうする?']) + ' #' + S.g.name, 200 + rnd() * 2000);
      if (r < .4) { gain = (400 + talk * 60) * boost * (.6 + rnd()); txt = '攻めた企画がバズった。知らない人からの引用が止まらない。'; zpost(`${S.g.name}の企画動画、地獄すぎて最後まで見てしまった`, gain * 1.5); }
      else if (r < .75) { gain = -S.g.fans * .06; txt = '攻めた企画が荒れた。「メンバーがかわいそう」「運営が終わってる」'; zpost(`${S.g.name}の運営、メンバーで遊ぶのやめなよ`, 800 + rnd() * 1500); ids.forEach(id => moodAdd(id, -8)); S.g.log.push(`${S.g.week + 1}週目、SNSの企画動画が「メンバーがかわいそう」と批判を浴びた。`); }
      else { gain = 30; txt = '攻めた企画を出したが、ほとんど誰にも見られなかった。'; }
    }
    gainFans(gain, ids);
    R.push(`■ ${slotLabel(i)} SNS運営\n${txt}(フォロワー ${gain >= 0 ? '+' : ''}${Math.round(gain)})`);
  }
  function runSales(v, R, i) {
    S.g.sales.push(v);
    S.g.rel[v] = (S.g.rel[v] || 0) + 1;
    R.push(`■ ${slotLabel(i)} 営業: ${SALES[v]}\n${pick(['名刺を12枚配った。2人が資料を受け取ってくれた。', '30分待たされて、5分で終わった。', '先方の担当者がたまたまアイドル好きだった。'])}`);
  }

  function advance() {
    const R = [], post = [];
    Object.values(S.g.m).forEach(m => m.wjobs = 0);
    // 返事をしなかった依頼
    openJobs().forEach(m => { m.jobState = 'expired'; S.g.rel[m.job.ck || 'in'] = (S.g.rel[m.job.ck || 'in'] || 0) - 1; });
    openChoices().forEach(m => {
      m.chosen = -1;
      if (m.ev.startsWith('quit:')) m.result = QUIT(m.ev.slice(5)).choose(1);
      else { const ev = EVENTS[m.ev]; m.result = ev && ev.none ? ev.none() : '(何もしなかった)'; }
    });
    // 予定を順に
    S.g.slots.forEach((s, i) => {
      if (!s) return;
      if (s.kind === 'job') { const m = S.mails.find(x => x.id === s.mail); if (m) runJob(m, R); }
      if (s.kind === 'lesson') runLesson(s.v, R, i);
      if (s.kind === 'talk') runTalk(s.v, R, i);
      if (s.kind === 'sns') runSNS(s.v, R, i);
      if (s.kind === 'sales') runSales(s.v, R, i);
    });
    // 週のしめ
    const n = active().length;
    ledger(`メンバー固定給(${n}人)`, 0, 20000 * n);
    ledger('寮・宣伝費', 0, 48000);
    if (S.g.debt) { const it = Math.round(S.g.debt * .02); S.g.debt += it; S.g.ledger.push([`第${S.g.week + 1}週`, '借入金 利息(週2%)', 0, 0, S.g.money, it]); }
    if (S.g.money < 0) {
      const need = Math.ceil(-S.g.money / 500000) * 500000;
      S.g.debt += need; ledger('社内貸付(借入)', need, 0);
      post.push({ id: 'debt_' + S.g.week, from: '経理 大西', addr: 'onishi@mitsuba-pro.co.jp', subject: '【経理】新グループ予算の不足について', body: `お疲れさまです。経理の大西です。\n\n新グループの予算がマイナスになったため、社長決裁で\n社内貸付として ${yen(need)} を計上しました。\n\n利息は週2%です。\n「年」ではなく「週」です。お間違えのないように。\n\n返済の見込みについて、月末までにご報告ください。\n\n経理 大西` });
    }
    const avgJobs = active().reduce((a, id) => a + M(id).wjobs, 0) / Math.max(1, n);
    active().forEach(id => {
      const m = M(id);
      if (m.status === 'rest') { m.rest--; m.fat = clamp(m.fat - 40, 0, 100); if (m.rest <= 0) { m.status = 'active'; } return; }
      m.fat = clamp(m.fat - 15 - (m.wjobs ? 0 : 12), 0, 100);
      if (m.flags.baito) tire(id, 25);
      if (S.g.flags.momControl && id === 'kashiwagi') { moodAdd(id, -10); tire(id, 10); }
      if (m.wjobs < avgJobs - .9) { moodAdd(id, -8); m.flags.hosare = (m.flags.hosare || 0) + 1; }
      m.mood = clamp(m.mood + (55 - m.mood) * .08, 0, 100);
    });
    // 倒れる・辞めたいと言い出す
    active().forEach(id => {
      const m = M(id);
      if (m.status === 'active' && m.fat >= (id === 'mori' ? 78 : 85)) {
        m.status = 'rest'; m.rest = 1; moodAdd(id, -10);
        R.push(`■ ${full(id)}が倒れた\n${id === 'mori' ? '寮の台所で倒れているのを、まひるさんが見つけた。' : 'レッスン中に座り込んで、立てなくなった。'}病院では過労と言われた。来週は休ませる。`);
        S.g.log.push(`${S.g.week + 1}週目、${full(id)}が過労で倒れ、一時休養した。`);
        zpost(`${S.g.name}の${nm(id)}ちゃん休養って…運営なにしてんの`, 300 + rnd() * 600);
      } else if (m.mood <= 12 && !m.flags.quitAsked) {
        m.flags.quitAsked = 1;
        S.g.queue.push({ ev: 'quit', id });
      }
    });
    S.g.slots.forEach((s, i) => { if (s && s.kind === 'job') { const m = S.mails.find(x => x.id === s.mail); if (m && m.jobState === 'accepted') m.jobState = 'done'; } });
    // 週報
    const head = `週報 第${S.g.week + 1}週(${weekRange(S.g.week)})\n\nZフォロワー ${Math.round(S.g.fans).toLocaleString()}人\nグループ予算 ${yen(S.g.money)}${S.g.debt ? '\n借金 ' + yen(S.g.debt) : ''}\n\n`;
    const report = head + (R.length ? R.join('\n\n') : '(何もしなかった週)') + '\n\n― メンバーの様子 ―\n' + active().map(id => `${full(id)}: ${M(id).status === 'rest' ? '休養中' : condWord(id)}`).join('\n');
    const fname = `週報_第${S.g.week + 1}週.txt`;
    S.g.files.unshift({ name: fname, text: report });
    // 次の週へ
    S.g.week++;
    if (active().length < 3) { S.g.log.push(`${S.g.week}週目、メンバーが3人を下回り、活動を続けられなくなった。`); finish(true); }
    else if (S.g.week >= WEEKS) finish(false);
    else { S.g.slots = freshSlots(S.g.week); weekStart(); }
    save();
    refreshAll();
    openText('report' + S.g.week, fname, report);
    post.forEach(m => G.mail(m));
    chatter();
  }

  function weekStart() {
    genJobs();
    // 事件
    Object.entries(EVENTS).forEach(([k, ev]) => {
      if (S.g.fired[k] || !ev.when()) return;
      S.g.fired[k] = 1;
      sendEvent(k, ev.mail());
    });
    S.g.queue.splice(0).forEach(q => { if (q.ev === 'quit' && M(q.id).status !== 'left') sendEvent('quit:' + q.id, quitMail(q.id)); });
    S.g.pend = (S.g.pend || []).filter(p => { if (p.week <= S.g.week) { PEND[p.fn] && PEND[p.fn](); return false; } return true; });
  }
  function sendEvent(k, m) {
    S.mails.unshift(Object.assign({ box: 'inbox', unread: true, ev: k, date: dayLabel(S.g.week, 0) + ' 08:' + String(10 + Math.floor(rnd() * 40)) }, m));
  }
  function choose(mailId, idx) {
    const mail = S.mails.find(x => x.id === mailId);
    const ev = mail.ev.startsWith('quit:') ? QUIT(mail.ev.slice(5)) : EVENTS[mail.ev];
    const res = ev.choose(idx, mail);
    if (res === false) return;
    mail.chosen = idx; mail.result = res;
    save(); refreshAll();
  }
  function bookFree(n, label) {
    const free = S.g.slots.map((s, i) => s ? -1 : i).filter(i => i >= 0 && (i >> 1) < 5);
    if (free.length < n) { OS.dialog('カレンダー', `平日の空き時間が ${n} コマ必要です。カレンダーの予定を取り消してから選んでください。`, null, 'warn'); return false; }
    free.slice(0, n).forEach(i => S.g.slots[i] = { kind: 'fixed', label });
    return true;
  }
  function has(id) { return S.g.m[id] && M(id).status !== 'left'; }
  function leave(id, why) {
    M(id).status = 'left';
    S.g.log.push(`${S.g.week + 1}週目、${full(id)}が${why}`);
    S.chats.group.log.push(['', '', `${full(id)} がグループを退会しました`]);
    S.chats.group.members = Math.max(2, (S.chats.group.members || 3) - 1);
    zpost(`${S.g.name}、${nm(id)}ちゃん脱退って本当? 結成したばっかりなのに`, 500 + rnd() * 900);
  }
  function fansMul(k) { S.g.fans = Math.round(S.g.fans * k); }

  // ---------- メンバーごとの事件 ----------
  const EVENTS = {
    akari: { when: () => S.g.week === 1, mail: () => ({ id: 'ev_akari', from: '桐谷 誠(部長)', addr: 'kiritani@mitsuba-pro.co.jp', subject: 'Lumièreの件(共有)', body: `Lumièreのあかりが、今週から休養に入ります。\n表向きは体調不良です。\n\n佐野さんはしばらくそっちにかかりきりになるので、\n新グループの現場は基本あなた一人で回してください。\n\n同じことを繰り返さないように。\n\n桐谷` }) },
    shiraishi: {
      when: () => S.g.week === 0 && has('shiraishi'),
      mail: () => ({ id: 'ev_shiraishi', from: '白石 健一', addr: 'k.shiraishi@mail.example', subject: '娘のことで', body: `突然のご連絡、失礼します。白石透子の父です。\n\n娘が東京へ行ったことを、私は昨日まで知りませんでした。\n妻が勝手に同意書に署名したことも。\n\n未成年の娘を、どういうおつもりで預かっているのか。\n今週中にご説明いただけない場合は、しかるべき手段を考えます。\n\n白石`, choices: ['長野へ行って直接説明する(平日の空き時間を2コマ使う)', '本人と母親に任せる', '会社の顧問弁護士から連絡してもらう(¥100,000)'] }),
      choose(i) {
        if (i === 0) {
          if (!bookFree(2, '長野へ出張(白石家)')) return false;
          if (rnd() < .7) { S.g.flags.fatherOk = 1; M('shiraishi').trust += 15; return '父親は最後まで目を合わせなかったが、同意書に署名した。\n「一年。一年で何もなければ、連れて帰ります」'; }
          S.g.pend.push({ week: S.g.week + 1, fn: 'shiraishiCheck' });
          return '話は平行線だった。帰りの新幹線で、透子からLINEが来た。「ごめんなさい」';
        }
        if (i === 1) { S.g.pend.push({ week: S.g.week + 1, fn: 'shiraishiCheck' }); return '透子と母親に任せることにした。'; }
        ledger('顧問弁護士 費用', 0, 100000);
        S.g.flags.fatherOk = 1; moodAdd('shiraishi', -30); M('shiraishi').trust = clamp(M('shiraishi').trust - 15, 0, 100);
        return '署名済みの書類だけが返送されてきた。透子はその日、レッスンを休んだ。';
      },
      none: () => { S.g.pend.push({ week: S.g.week + 1, fn: 'shiraishiCheck' }); return '(返事をしなかった)'; },
    },
    kashiwagi: {
      when: () => S.g.week === 0 && has('kashiwagi'),
      mail: () => ({ id: 'ev_kashiwagi', from: '柏木 恵子', addr: 'yui.mama.dance@mail.example', subject: 'ゆいの今後について(お願い)', body: `プロデューサー様\n\nゆいの母です。いくつかお願いがございます。\n\n一、ゆいをセンターにしていただけますよね。\n一、レッスンには毎回、私も同席いたします。\n一、ゆいのSNSは私が管理いたします。\n一、寮ではなく、私が借りたマンションから通わせます。\n\nゆいのためです。よろしくお願いいたします。\n\n柏木 恵子`, choices: ['要望をすべて受け入れる', 'レッスンの同席だけはお断りする', '寮に入れて、お母さんとは距離を置いてもらう'] }),
      choose(i) {
        if (i === 0) { S.g.flags.momControl = 1; return 'お母さんからお礼の長文メールが届いた。\nゆいからは、何も来なかった。'; }
        if (i === 1) { moodAdd('kashiwagi', 5); return 'お母さんは不満そうだったが、引き下がった。\nその夜、部長あてに抗議の電話があったらしい。'; }
        S.g.pend.push({ week: S.g.week + 1, fn: 'momWar' });
        return 'お母さんは電話口で一時間、泣きながら怒っていた。\n「契約のことは、こちらにも考えがあります」';
      },
    },
    hayase: {
      when: () => has('hayase') && (S.g.week === 2 || (S.g.week === 1 && S.g.fans >= 700)),
      mail: () => ({ id: 'ev_hayase', from: '佐野 美咲(Lumière担当)', addr: 'sano@mitsuba-pro.co.jp', subject: 'みのりちゃんの件、Zで回ってます', body: `佐野です。バタバタしててごめんなさい。\n\nZで、ぷらドロ時代の「繋がり」の噂がまた回ってます。\n元運営の坂上さんのアカウントが、名前は出さずに匂わせてます。\n\nみのりちゃん本人もたぶん見てます。\nどうしますか。\n\n佐野`, choices: ['弁護士から警告文を送る(¥150,000)', '放っておく', 'みのり本人に配信で説明させる'] }),
      choose(i) {
        zpost('ぷらドロの例の件、元運営が匂わせてて草', 400);
        if (i === 0) { ledger('弁護士 警告文', 0, 150000); M('hayase').trust += 20; moodAdd('hayase', 10); S.g.log.push(`${S.g.week + 1}週目、${full('hayase')}の前所属事務所との確執が表面化し、ミツバ企画は警告文を送った。`); return '警告文を送った翌日、坂上さんのアカウントは鍵がかかった。\nみのりからLINEが来た。「ありがとうございます」。それだけだった。'; }
        if (i === 1) { moodAdd('hayase', -15); fansMul(.97); return '噂は一週間くらいで流れていった。\nみのりは、その間ずっと「大丈夫です」と言っていた。'; }
        if (M('hayase').mood > 40 && M('hayase').fat < 70) { fansMul(1.08); M('hayase').mf *= 1.2; S.g.log.push(`${S.g.week + 1}週目、${full('hayase')}が配信で前グループの報酬未払い問題について語り、話題になった。`); return 'みのりは配信で、未払いのことだけを淡々と話した。泣かなかった。\n同接は過去最高。「この子を応援したい」という引用が並んだ。'; }
        fansMul(.95); moodAdd('hayase', -25); tire('hayase', 20);
        return '配信の途中で、みのりは話せなくなった。\n12分の沈黙のあと、配信は切れた。切り抜きが出回った。';
      },
    },
    nanase: {
      when: () => has('nanase') && S.g.week >= 1 && rnd() < .3 + M('nanase').mf / 4000,
      mail: () => ({ id: 'ev_nanase', from: '桐谷 誠(部長)', addr: 'kiritani@mitsuba-pro.co.jp', subject: '【至急】七瀬の件', body: `Zを見てください。\n七瀬とバンドマンが一緒に歩いている写真が出ました。\n暴露系のアカウントが「続報あり」と言っています。\n\n今日中に方針を決めてください。\n\n桐谷`, choices: ['事実を認めて、謝罪コメントを出す', '事務所として否定する', '本人に任せる'] }),
      choose(i) {
        zpost('リカの彼氏の件、写真出てるのにまだ黙ってるの?', 2000);
        S.g.log.push(`${S.g.week + 1}週目、${full('nanase')}の交際が報じられた。`);
        if (i === 0) { fansMul(.9); M('nanase').mf *= .65; moodAdd('nanase', -20); return '謝罪コメントを出した。\n「アイドルなのに」「謝ることじゃない」で、Zは真っ二つに割れた。\nリカのフォロワーは一晩で1万人減った。'; }
        if (i === 1) { if (rnd() < .5) { fansMul(.98); return '否定のコメントを出した。今のところ、続報は出ていない。'; } fansMul(.75); active().forEach(id => moodAdd(id, -10)); S.g.log.push('事務所は否定したが、翌週に決定的な写真が出回り、批判が集中した。'); return '否定した三日後、二人が部屋に入っていく写真が出た。\n「嘘つき運営」がトレンドに入った。'; }
        if (M('nanase').flags.confide || M('nanase').trust >= 30) { fansMul(.95); M('nanase').mf *= 1.1; moodAdd('nanase', -10); return 'リカは自分の言葉で書いた。\n「お付き合いしていた方がいました。けじめはつけました。グループで、ちゃんとやります」\n意外にも、好意的な引用が多かった。'; }
        fansMul(.8); moodAdd('nanase', -25);
        return 'リカは一人で否定の投稿をして、すぐに消した。\n消したことが、一番燃えた。';
      },
    },
    kuroda: {
      when: () => has('kuroda') && S.g.week === 2,
      mail: () => ({ id: 'ev_kuroda', from: '黒田アンナ', addr: 'anna.kuroda.vo@mail.example', subject: '歌割りについて', body: `お疲れさまです。黒田です。\n\n今の歌割りだと、私は全体の2割しか歌っていません。\n正直、納得できていません。\n\nグループのためにも、歌える人が歌うべきだと思います。\nご検討ください。\n\n黒田`, choices: ['メインの歌割りを任せる', '全員均等のままにする', '来年ソロ曲を出すと約束する'] }),
      choose(i) {
        if (i === 0) { moodAdd('kuroda', 20); active().filter(id => id !== 'kuroda').forEach(id => moodAdd(id, C(id).hidden.vocal >= 7 ? -15 : -6)); return 'アンナは「ありがとうございます」とだけ返してきた。\nグループのチャットが、少し静かになった。'; }
        if (i === 1) { moodAdd('kuroda', -20); S.g.pend.push({ week: S.g.week + 1, fn: 'kurodaOffer' }); return 'アンナからの返信は「わかりました」の一言だった。'; }
        moodAdd('kuroda', 10); S.g.flags.soloPromise = 1; return 'アンナは少し考えてから、「約束ですよ」と言った。\n部長にはまだ言っていない。';
      },
    },
    mori: {
      when: () => has('mori') && S.g.week === 2,
      mail: () => ({ id: 'ev_mori', from: '森ひなた', addr: 'hinata.mori.0409@mail.example', subject: 'ご相談です', body: `Pさん、お疲れさまです。森です。\n\nこんなこと聞いていいのかわからないんですけど、\nお給料の前借りってできますか。\n\nお母さんが入院することになって、\n弟たちの給食費とかが払えなくなりそうで。\n\nすみません。ほんとにすみません。\n\n森ひなた`, choices: ['会社から前借りさせる(¥200,000)', '規則なので断る', '自分のお金から貸す'] }),
      choose(i) {
        if (i === 0) { ledger('森 給与前払い', 0, 200000); M('mori').trust += 15; moodAdd('mori', 10); return 'ひなたから「ほんとうにありがとうございます!!!」と、絵文字だらけのLINEが来た。'; }
        if (i === 1) { moodAdd('mori', -20); M('mori').flags.baito = 1; return 'ひなたは「ですよね!変なこと聞いてすみません!」と明るく返してきた。'; }
        M('mori').trust += 25; S.g.flags.lentMoney = 1; return '自分の口座から20万円を振り込んだ。\nひなたは電話口で泣いていた。\n誰にも言っていない。';
      },
      none: () => { M('mori').flags.baito = 1; return '(返事をしなかった)'; },
    },
    kasai: {
      when: () => has('kasai') && (S.g.week === 2 || (S.g.week === 1 && S.g.fans >= 600)),
      mail: () => ({ id: 'ev_kasai', from: '桐谷 誠(部長)', addr: 'kiritani@mitsuba-pro.co.jp', subject: '葛西の過去の投稿について', body: `葛西の昔の投稿が掘り起こされています。\n「ルミエールの運営ほんと無能」というやつです。\n\nLumièreのファンが怒っていて、佐野さんもいい顔をしていません。\n\nどうするか決めてください。\n\n桐谷`, choices: ['本人に謝罪文を出させる', 'ネタにする(自虐のMCで笑いに変える)', '何もしない'] }),
      choose(i) {
        zpost('ミツバの新グループに、昔ルミエール叩いてたオタクいるの地獄で草', 1200);
        if (i === 0) { moodAdd('kasai', -10); fansMul(.98); return 'まひるは長い謝罪文を書いた。\n読んだLumièreのファンの一人が「ちゃんと謝れる人なんだね」と引用していた。'; }
        if (i === 1) { if (M('kasai').mood > 40) { fansMul(1.1); M('kasai').mf *= 1.4; S.g.log.push(`${S.g.week + 1}週目、${full('kasai')}が「元Lumièreアンチ」という過去を自虐ネタにし、注目を集めた。`); return 'ライブのMCで、まひるが「元ルミエールのアンチです!今は社員です!」と言った。\n会場が一番笑ったのは、そこだった。'; } fansMul(.92); return 'MCでネタにしたが、まひるの声が震えていた。\n笑いは起きず、「開き直り」と切り抜かれた。'; }
        S.g.flags.lumiHostile = 1; fansMul(.95); return '何もしなかった。\nLumièreのファンの間で、新グループは「敵」ということになったらしい。';
      },
      none: () => { S.g.flags.lumiHostile = 1; return '(何もしなかった)'; },
    },
    uno: {
      when: () => has('uno') && (S.g.week === 3 || (S.g.week >= 1 && S.g.fans >= 1500)),
      mail: () => ({ id: 'ev_uno', from: '佐野 美咲(Lumière担当)', addr: 'sano@mitsuba-pro.co.jp', subject: 'さくらちゃんの中学の件', body: `佐野です。\n\nさくらちゃんの中学の件が、Zでまた回り始めています。\n「いじめ加害者がアイドルに」という書き方です。\n\n本当は逆なのは、私たちは知っています。\nでも、それを言うかどうかは別の話だと思います。\n\n佐野`, choices: ['事務所として「本人は被害者だった」と公表する', '法的措置を取ると発表する(¥150,000)', 'しばらく活動を控えさせる'] }),
      choose(i) {
        zpost('宇野って子、中学でいじめしてたってマジ?', 900);
        if (i === 0) {
          if (M('uno').flags.consent) { fansMul(1.08); moodAdd('uno', 20); M('uno').trust += 10; S.g.log.push(`${S.g.week + 1}週目、${full('uno')}をめぐるネット上のデマに対し、事務所が事実関係を公表した。`); return '公表した。さくらは、その日のライブで一曲目から泣いていた。\n終演後「言ってくれて、ありがとうございました」と頭を下げられた。'; }
          moodAdd('uno', -40); M('uno').trust = clamp(M('uno').trust - 30, 0, 100); fansMul(1.03);
          return '公表した。デマは止まった。\nさくらからは一言だけ来た。「勝手に言わないでほしかったです」';
        }
        if (i === 1) { ledger('弁護士 声明', 0, 150000); moodAdd('uno', 5); return '法的措置の声明を出した。書き込みは目に見えて減った。'; }
        M('uno').status = 'rest'; M('uno').rest = 1; moodAdd('uno', -15); fansMul(.97); return 'さくらは一週間休むことになった。\n「私が悪いみたいですね」と言われた。';
      },
    },
  };
  const PEND = {
    shiraishiCheck() {
      if (!has('shiraishi') || S.g.flags.fatherOk) return;
      if (M('shiraishi').trust >= 25) { S.g.flags.fatherOk = 1; sendEvent('info', { id: 'ev_shiraishi2', from: '白石透子', addr: '', subject: '父のこと', body: 'Pさん\n\n父と、電話で2時間話しました。\n最後に「勝手にしろ」と言われました。\nたぶん、それが父のいいよ、です。\n\n白石' }); return; }
      leave('shiraishi', '家庭の事情により脱退した。');
      sendEvent('info', { id: 'ev_shiraishi3', from: '桐谷 誠(部長)', addr: '', subject: '白石の件', body: '白石の父親が寮まで迎えに来て、連れて帰りました。\n契約は解除になります。\n\n本人は最後まで何も言いませんでした。\n\n桐谷' });
    },
    momWar() {
      if (!has('kashiwagi')) return;
      if (M('kashiwagi').trust >= 25) { S.g.flags.yuiFree = 1; moodAdd('kashiwagi', 25); sendEvent('info', { id: 'ev_kashi2', from: '柏木ゆい', addr: '', subject: '(件名なし)', body: 'Pさん\n\nママに、自分で言いました。\n東京にいたいって。\n\nママは泣いてたけど、わたしは泣かなかったです。\n\nゆい' }); return; }
      leave('kashiwagi', '保護者の意向により脱退した。');
      sendEvent('info', { id: 'ev_kashi3', from: '柏木 恵子', addr: '', subject: '契約解除のご通知', body: '本日をもちまして、ゆいは貴社との契約を解除させていただきます。\n娘の才能を理解していただけなかったこと、大変残念に思います。\n\n柏木 恵子' });
    },
    kurodaOffer() {
      if (!has('kuroda')) return;
      if (M('kuroda').mood < 35 && M('kuroda').trust < 35) {
        leave('kuroda', '他事務所からのソロデビューの誘いを受け、脱退した。');
        sendEvent('info', { id: 'ev_kuroda2', from: '黒田アンナ', addr: '', subject: 'ご報告', body: 'お疲れさまです。黒田です。\n\n別の事務所から、ソロでのお話をいただきました。\nお受けすることにしました。\n\n短い間でしたが、お世話になりました。\nみんなには、自分で伝えます。\n\n黒田' });
      }
    },
  };
  const quitMail = id => ({ id: 'ev_quit_' + id, from: full(id), addr: '', subject: '少しお時間いただけますか', body: `Pさん\n\n${pick(['最近、自分がここにいる意味がわからなくなってます。', '辞めたいって言ったら、怒りますか。', 'ステージに立つのが、こわくなってしまいました。'])}\n\n一度、ちゃんと話したいです。\n\n${nm(id)}`, choices: ['すぐに時間を作って引き止める', '本人の気持ちを尊重する'] });
  const QUIT = id => ({
    choose(i) {
      if (i === 0) { if (M(id).trust >= 35) { moodAdd(id, 30); return `${nm(id)}と2時間話した。\n最後に「もう少しだけ、やってみます」と言ってくれた。`; } leave(id, '一身上の都合により脱退した。'); return `${nm(id)}と話した。\n「Pさんは、私のこと何も知らないじゃないですか」と言われた。\n${nm(id)}は脱退することになった。`; }
      leave(id, '一身上の都合により脱退した。'); return `${nm(id)}は、翌週に寮を出ていった。`;
    },
  });

  // ---------- チャット・付箋・表 ----------
  const VOICE = {
    hayase: ['今日、久しぶりにステージが楽しかった', '明日も早いので寝ます(寝れたら)', 'ちょっと休んでもいいですか'],
    shiraishi: ['たのしかったです', '了解です', '…'],
    kuroda: ['今日の音、よかった。次もこの感じで', '了解。', 'このままでいいと思ってる人いる?'],
    mori: ['みんなおつかれ〜〜!!今日のご飯は豚汁です🍲', '明日もがんばろうね!', '大丈夫大丈夫!元気だけが取り柄なので!'],
    nanase: ['今日のオフショ載せていい?🤍', 'おつかれさま〜', 'ちょっとSNS見ないようにする'],
    kashiwagi: ['ダンス、もっと揃えたいです', 'はい', '…はい'],
    kasai: ['今日の現場、オタク目線で100点でした!!', '連絡事項、ノートにまとめました🙏', 'みんな無理してない? 私はしてる(笑)'],
    uno: ['歌えてよかったです', 'はい', 'ごめんなさい、今日はやめておきます'],
  };
  function chatter() {
    if (S.g.done) return;
    const ids = active().filter(id => M(id).status === 'active').sort(() => rnd() - .5).slice(0, 3);
    ids.forEach((id, k) => setTimeout(() => {
      const m = M(id), t = VOICE[id][m.mood >= 60 && m.fat < 60 ? 0 : m.mood >= 30 ? 1 : 2];
      pushChat('group', full(id), t);
    }, 900 + k * 1100));
  }
  function sticky() {
    const n = document.getElementById('sticky');
    if (!n) return;
    const free = S.g.slots.filter(s => !s).length;
    n.innerHTML = S.g.done ? `<b>おつかれさま</b><br>${escapeHtml(S.g.name)}<br>1か月終了` : `<b>第${S.g.week + 1}週</b><br>${weekRange(S.g.week)}<br>予算 ${yen(S.g.money)}${S.g.debt ? `<br><span class="neg">借金 ${yen(S.g.debt)}</span>` : ''}<br>Zフォロワー ${Math.round(S.g.fans).toLocaleString()}<br><br>空き時間 <span class="boxes">${'□'.repeat(free) || 'なし'}</span>`;
  }
  function refreshAll() {
    ['calendar', 'mail', 'sheet', 'explorer', 'chat'].forEach(w => OS.refresh(w));
    renderDesktop(); updateClock(); sticky();
  }
  function sheetTabs() { return [['money', '収支'], ['members', 'メンバー']]; }
  function sheetRows(tab) {
    let rows = '';
    const r = (n, cells) => `<tr><th>${n}</th>${cells}</tr>`;
    if (tab === 'money') {
      rows += r(1, '<td class="hd">週</td><td class="hd">項目</td><td class="hd">収入</td><td class="hd">支出</td><td class="hd">残高</td><td class="hd">借金</td><td class="hd"></td>');
      rows += r(2, `<td>開始</td><td>グループ予算(4週分)</td><td class="num">${yen(600000)}</td><td></td><td class="num">${yen(600000)}</td><td></td><td></td>`);
      S.g.ledger.forEach((l, i) => rows += r(i + 3, `<td>${l[0]}</td><td>${escapeHtml(l[1])}</td><td class="num">${l[2] ? yen(l[2]) : ''}</td><td class="num red">${l[3] ? yen(l[3]) : ''}</td><td class="num ${l[4] < 0 ? 'red' : ''}">${yen(l[4])}</td><td class="num red">${l[5] ? '+' + yen(l[5]) : ''}</td><td></td>`));
      const n = S.g.ledger.length + 3;
      rows += r(n, `<td></td><td class="r"><b>現在</b></td><td></td><td></td><td class="num ${S.g.money < 0 ? 'red' : ''}"><b>${yen(S.g.money)}</b></td><td class="num red">${S.g.debt ? '<b>' + yen(S.g.debt) + '</b>' : ''}</td><td></td>`);
      for (let k = n + 1; k < n + 8; k++) rows += r(k, '<td></td>'.repeat(7));
    } else {
      rows += r(1, ['氏名', '年齢', '出演', '指名', '推しの数(概算)', '状態', 'メモ'].map(h => `<td class="hd">${h}</td>`).join(''));
      Object.keys(S.g.m).forEach((id, i) => {
        const m = M(id);
        rows += r(i + 2, `<td>${escapeHtml(full(id))}</td><td class="num">${C(id).age}</td><td class="num">${m.jobs}</td><td class="num">${m.nom}</td><td class="num">約 ${Math.round(m.mf / 10) * 10}</td><td class="${m.status === 'left' ? 'red' : ''}">${m.status === 'left' ? '脱退' : m.status === 'rest' ? '休養中' : condWord(id)}</td><td class="memo"><input data-gn="${id}"></td>`);
      });
      for (let k = Object.keys(S.g.m).length + 2; k < 22; k++) rows += r(k, '<td></td>'.repeat(7));
    }
    return rows;
  }
  function explorerFiles() {
    return S.g.files.map(f => ({ name: f.name, icon: 'txt', type: 'テキスト ドキュメント', size: '1 KB', open: () => openText('gf_' + f.name, f.name, f.text) }));
  }
  function searchHits(n) {
    if (!S.g || !S.g.name) return [];
    const key = S.g.name.replace(/[\s ]/g, '').toLowerCase();
    if (!(n.includes(key) || key.includes(n) && n.length >= 2 || n.includes('新グループ'))) return [];
    const hits = [];
    if (S.g.done) hits.push({ type: 'wiki', title: `${S.g.name} - ウィキペディア風百科事典`, site: 'みんなの百科事典', date: '', snippet: `${S.g.name}は、日本の女性アイドルグループ。株式会社ミツバ企画所属。2026年11月結成。` });
    hits.push({ type: 'x', title: `${S.g.name}【公式】(@mitsuba_newgrp)`, site: 'Z', date: '', snippet: `フォロワー ${Math.round(S.g.fans).toLocaleString()}人`, posts: S.g.own.length ? S.g.own : [['11/02 12:00', `${S.g.name} 公式アカウントです。よろしくお願いします!`, '♡ 120']] });
    if (S.g.zlog.length) hits.push({ type: 'xsearch', q: S.g.name, title: `「${S.g.name}」の検索結果 / Z`, site: 'Z', date: '', snippet: S.g.zlog[0][3], posts: S.g.zlog });
    return hits;
  }

  // ---------- 1か月の評価 ----------
  function rank() {
    const f = S.g.fans, left = Object.keys(S.g.m).length - active().length;
    let s = f < 800 ? 0 : f < 2000 ? 1 : f < 5000 ? 2 : f < 12000 ? 3 : 4;
    if (left >= 2) s--;
    if (S.g.debt > 1000000) s--;
    s = clamp(s, 0, 4);
    return [['D', '無名'], ['C', '地下で少し話題'], ['B', 'ライブアイドル界隈で注目株'], ['A', 'ネットで話題の新人'], ['S', 'ブレイク寸前']][s];
  }
  function wikiHtml() {
    const [rk, label] = rank();
    const ids = Object.keys(S.g.m);
    const disb = S.g.disbanded;
    return `<div class="site wiki"><h1>${escapeHtml(S.g.name)}</h1><div class="wk-sub">出典: みんなの百科事典(この記事は書きかけです)</div>
      <table class="wk-box"><tr><th colspan="2">${escapeHtml(S.g.name)}</th></tr><tr><td>結成</td><td>2026年11月</td></tr>${disb ? '<tr><td>活動停止</td><td>2026年11月</td></tr>' : ''}<tr><td>事務所</td><td>ミツバ企画</td></tr><tr><td>メンバー</td><td>${active().length}人${ids.length > active().length ? `(元 ${ids.length - active().length}人)` : ''}</td></tr><tr><td>Zフォロワー</td><td>${Math.round(S.g.fans).toLocaleString()}</td></tr></table>
      <p><b>${escapeHtml(S.g.name)}</b>は、日本の女性アイドルグループ。株式会社ミツバ企画所属。2026年11月結成。${disb ? '結成から1か月足らずで、メンバーの相次ぐ脱退により活動を停止した。' : ''}</p>
      <h2>メンバー</h2><ul>${ids.filter(id => M(id).status !== 'left').map(id => `<li>${escapeHtml(full(id))}(${C(id).age}歳・${escapeHtml(C(id).from.slice(0, 3))}出身)${M(id).nom >= 2 ? ' - 雑誌などで指名されることが多い' : ''}</li>`).join('')}</ul>
      ${ids.some(id => M(id).status === 'left') ? `<h3>元メンバー</h3><ul>${ids.filter(id => M(id).status === 'left').map(id => `<li>${escapeHtml(full(id))}</li>`).join('')}</ul>` : ''}
      <h2>来歴</h2><p>2026年秋に開催されたミツバ企画のオーディション(応募総数1,186人)から選ばれたメンバーで結成。同年11月、渋谷のライブハウスでお披露目公演を行った。</p>
      ${S.g.log.map(l => `<p>${escapeHtml(l)}</p>`).join('')}
      ${S.g.debt ? `<p>結成直後から、運営会社の資金繰りの厳しさがたびたび噂された。</p>` : ''}
      <h2>評価</h2><p>結成1か月時点での評価は「${label}」(ランク${rk})。</p>
      <div class="wk-cat">カテゴリ: 日本の女性アイドルグループ | 2026年に結成した音楽グループ | ミツバ企画</div></div>`;
  }
  function finish(disbanded) {
    S.g.done = true; S.g.disbanded = disbanded;
    save();
    const [rk, label] = rank();
    setTimeout(() => {
      openBrowser();
      const w = OS.wins.browser;
      w.go({ page: 'view', r: { type: 'wiki', title: `${S.g.name} - ウィキペディア風百科事典` } });
      OS.dialog(disbanded ? '活動停止' : '1か月が終わりました', `${disbanded ? 'メンバーが3人を下回り、グループは活動を続けられなくなりました。\n\n' : ''}${S.g.name} の結成1か月の評価は\n\n  ランク${rk}「${label}」\n\nです。百科事典の記事を開きました。\n\n試作版はここまでです。`, null, 'info');
    }, 1500);
  }

  // ---------- 結成 ----------
  function start(pass) {
    S.phase = 'group';
    S.g = { name: '', week: 0, money: 600000, debt: 0, fans: 300, m: {}, slots: freshSlots(0), rel: {}, zlog: [], own: [], log: [], flags: {}, sales: [], pend: [], fired: {}, queue: [], ledger: [], files: [], done: false };
    const base = { nanase: 1500, kuroda: 400, hayase: 300, mori: 120, kasai: 150 };
    pass.forEach(id => {
      const h = C(id).hidden;
      S.g.m[id] = { fat: 10, mood: 60, trust: 10, mf: base[id] || 40, sk: { vocal: h.vocal, dance: h.dance, talk: h.talk }, status: 'active', rest: 0, jobs: 0, wjobs: 0, nom: 0, talks: 0, flags: {} };
    });
    if (pass.includes('nanase')) S.g.fans += 1800;
    if (pass.includes('kuroda')) S.g.fans += 300;
    save();
    OS.prompt('グループ名', '部長から「グループ名を決めて、今日中に送ってください」と言われました。\n\nグループ名を入れてください。', '', name => {
      S.g.name = name.slice(0, 24);
      S.chats.group.name = S.g.name;
      weekStart();
      save();
      refreshAll();
      OS.dialog('第1週', `11月2日(月)。\n「${S.g.name}」の活動が始まります。\n\n・メールに仕事の依頼が届いています。受けるならメンバーを選びます\n・カレンダーの空き時間に、レッスン・面談・SNS運営・営業を入れられます\n・予定が決まったら、カレンダーの「この予定で1週間を進める」を押します\n\n4週間(1か月)やってみましょう。`, [{ label: 'メールを見る', primary: true, fn: openMail }], 'info');
    });
  }

  return {
    start, openCalendar, mailActions, sheetTabs, sheetRows, explorerFiles, searchHits, wikiHtml, sticky, dayLabel,
    mail: m => addMail(Object.assign({ date: dayLabel(S.g.week, 0) + ' 08:00' }, m)),
    clockDate: () => { const t = date(S.g.week, 0); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getDate()).padStart(2, '0')}`; },
  };
})();
