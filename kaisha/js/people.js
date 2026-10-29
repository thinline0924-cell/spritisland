// 人物まわりの共通処理:呼び方・性格の説明・記憶

import { R, clamp } from './util.js';
import { rel } from './world.js';

export const full = p => p.foreign ? `${p.sei}・${p.mei}` : `${p.sei} ${p.mei}`;
export const short = p => p.sei;
export function titleShort(p) {
  if (p.key === 'shacho') return '社長';
  if (p.key === 'kaicho') return '会長';
  if (p.key === 'senmu') return '専務';
  if (/部長|センター長/.test(p.title)) return p.title.includes('センター長') ? 'センター長' : '部長';
  if (/課長/.test(p.title)) return '課長';
  return '';
}
// speaker が target をどう呼ぶか
export function callName(sp, tg) {
  if (!tg) return '';
  if (tg.key === 'shacho') return sp.key === 'kaicho' ? R.pick([tg.mei, '社長']) : '社長';
  if (tg.key === 'kaicho') return '会長';
  if (tg.key === 'senmu') return '専務';
  const t = titleShort(tg);
  if (t && sp.rank < tg.rank) return tg.sei + t;
  const r = sp && rel(globalW, sp, tg);
  if (sp && sp.age - tg.age >= 12 && (r?.fam ?? 0) > 45) {
    if (tg.gender === 'm') return tg.sei + 'くん';
    if (tg.age < 30 && R.chance(0.5)) return tg.sei + 'ちゃん';
  }
  if (tg.nick && (r?.fam ?? 0) > 60) return tg.nick;
  return tg.sei + 'さん';
}
let globalW = null;
export function bindWorld(w) { globalW = w; }

export function shouldBePolite(sp, tg) {
  if (!tg) return sp.rank < 6 || R.chance(sp.style.polite);
  if (tg.isClient) return true;
  if (tg.rank > sp.rank) return true;
  if (tg.age > sp.age + 6 && sp.rank <= tg.rank + 1) return true;
  const r = rel(globalW, sp, tg);
  if (r.fam < 45) return sp.rank <= tg.rank + 2 || R.chance(sp.style.polite);
  if (sp.rank > tg.rank + 1) return false;
  return R.chance(sp.style.polite * 0.6);
}

export function present(p) { return p.status === 'active' && p.today?.in; }

// 性格の文章化(人事メモ風)
const DESC = {
  E: { hi: ['声が大きく、どこにいてもすぐわかる', '飲み会では必ず幹事を買って出る', '初対面の取引先ともすぐ打ち解ける', '社内の誰とでも雑談している'],
       lo: ['必要なこと以外はほとんど話さない', '昼休みは車の中で一人で過ごす', '電話より文字のほうが楽だと言っている', '会議ではまず発言しない'] },
  A: { hi: ['頼まれると断れない', '他人のミスを黙ってかぶることがある', '新人の面倒見がいい', '誰の悪口も言わない'],
       lo: ['言い方がきつく、周りが萎縮しがち', '人の失敗をいつまでも覚えている', '自分の非をなかなか認めない', '相手によって態度を変える'] },
  C: { hi: ['机の上がいつも片付いている', '締め切りの3日前には終わらせる', '数字のずれを1円まで追う', '朝は誰よりも早く来ている'],
       lo: ['締め切りぎりぎりにならないと動かない', '机の上は書類の山', '経費精算をため込む', '物をよくなくす'] },
  N: { hi: ['心配性で、ささいなことで眠れなくなる', '叱られるとしばらく引きずる', '月末が近づくと胃薬を飲んでいる', '顔色にすぐ出る'],
       lo: ['何があっても動じない', 'クレームの電話でも声色が変わらない', '切り替えが早い', '本人いわく「寝れば忘れる」'] },
  O: { hi: ['新しいもの好き', '社内でいちばん早く生成AIを使い始めた', '業務改善の提案をよく出す', '休日はあちこちに出かけている'],
       lo: ['やり方を変えるのを嫌う', '「前からこうだから」が口ぐせ', 'FAXのほうが確実だと信じている', '同じ店で同じものばかり食べる'] },
  amb: { hi: ['出世への意欲を隠さない', '上の人の前では別人のようにきびきびする'], lo: ['役職には興味がないと公言している', '定時で帰ることを何より大事にしている'] },
  gossip: { hi: ['社内の噂はたいていこの人から広がる', '給湯室の情報通'], lo: ['噂話には加わらない', '聞いた話をよそで言わない'] },
  drink: { hi: ['酒が強く、二次会には必ず行く', '新潟の地酒にうるさい'], lo: ['酒はほとんど飲めない', '飲み会は一次会で帰る'] },
  integ: { hi: ['曲がったことが嫌い', 'ルールを守らない人に厳しい'], lo: ['「バレなきゃいい」が本音', '経費の使い方がゆるい'] },
  humor: { hi: ['冗談で場をなごませる', 'ものまねが妙にうまい'], lo: ['冗談が通じない', '笑うところをあまり見たことがない'] },
  spend: { hi: ['金づかいが荒い', '新しい車をすぐ買い替える'], lo: ['倹約家で弁当は毎日手作り', '割り勘は1円単位'] },
};
export function personalityLines(p, n = 4) {
  const cands = [];
  const seed = parseInt(p.id.slice(1)) * 7;
  const pickD = (arr, i) => arr[(seed + i) % arr.length];
  for (const k of ['E', 'A', 'C', 'N', 'O']) {
    const v = p.b5[k];
    if (v >= 64) cands.push({ s: Math.abs(v - 50), t: pickD(DESC[k].hi, k.charCodeAt(0)) });
    if (v <= 36) cands.push({ s: Math.abs(v - 50), t: pickD(DESC[k].lo, k.charCodeAt(0)) });
  }
  for (const k of ['amb', 'gossip', 'drink', 'integ', 'humor', 'spend']) {
    const v = p.traits[k];
    if (v >= 68) cands.push({ s: Math.abs(v - 50) - 5, t: pickD(DESC[k].hi, k.length) });
    if (v <= 32) cands.push({ s: Math.abs(v - 50) - 5, t: pickD(DESC[k].lo, k.length) });
  }
  cands.sort((a, b) => b.s - a.s);
  return cands.slice(0, n).map(c => c.t);
}
export function moodWord(p) {
  const s = p.st;
  if (p.status === 'leave') return '休職中';
  if (s.health < 35) return '体調が悪そう';
  if (s.stress > 82) return '限界が近い';
  if (s.stress > 65) return 'ピリピリしている';
  if (s.quit > 60) return '心ここにあらず';
  if (s.mood > 75) return '機嫌がいい';
  if (s.fatigue > 70) return '疲れている';
  if (s.mood < 35) return '沈んでいる';
  return 'ふつう';
}

export function remember(w, p, text, about = null, weight = 1) {
  const day = w.day;
  p.mem.unshift({ day, text, about: about?.id || about || null, w: weight });
  if (p.mem.length > 40) p.mem.length = 40;
}

export function affect(w, a, b, daff = 0, dtrust = 0) {
  const r = rel(w, a, b);
  r.aff = clamp(r.aff + daff, -100, 100);
  r.trust = clamp(r.trust + dtrust, -100, 100);
  r.fam = clamp(r.fam + 1, 0, 100);
}
export function stat(p, k, d) { p.st[k] = clamp(p.st[k] + d, 0, 100); }

export function liked(w, p, pool) { // p がいちばん好きな人
  let best = null, bv = -999;
  for (const q of pool) { if (q === p) continue; const v = rel(w, p, q).aff; if (v > bv) { bv = v; best = q; } }
  return best;
}
export function disliked(w, p, pool) {
  let best = null, bv = 999;
  for (const q of pool) { if (q === p) continue; const v = rel(w, p, q).aff; if (v < bv) { bv = v; best = q; } }
  return bv < -5 ? best : null;
}
export function bossOf(w, p) {
  const act = w.people.filter(q => q.status === 'active');
  const find = k => act.find(q => q.key === k);
  if (p.dept === '営業一課') return p.key === 'e1kacho' ? find('eigyobucho') : find('e1kacho') || find('eigyobucho');
  if (p.dept === '営業二課') return p.key === 'e2kacho' ? find('eigyobucho') : find('e2kacho') || find('eigyobucho');
  if (p.dept === '営業部') return p.key === 'eigyobucho' ? find('senmu') : find('eigyobucho');
  if (p.dept === '購買部') return p.key === 'kobaikacho' ? find('senmu') : find('kobaikacho');
  if (p.dept === '物流部') return p.key === 'butsuryubucho' ? find('senmu') : p.role === 'driver' || p.role === 'souko' ? (find('butsuryushunin') || find('butsuryubucho')) : find('butsuryubucho');
  if (p.dept === '総務経理部') return p.key === 'soumubucho' ? find('shacho') : (p.role === 'acct' && p.key !== 'keirikacho') ? find('keirikacho') : find('soumubucho');
  if (p.key === 'senmu') return find('shacho');
  if (p.key === 'shacho') return find('kaicho');
  return null;
}
export function deptMates(w, p) { return w.people.filter(q => q !== p && q.status === 'active' && (q.dept === p.dept || (p.dept.startsWith('営業') && q.dept.startsWith('営業')))); }
export function yearsAt(p) { return 2026 - p.joined; }
export function ageLabel(p) { return `${p.age}歳`; }
export function genderJ(p) { return p.gender === 'f' ? '女性' : '男性'; }
