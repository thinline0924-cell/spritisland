// ひとりひとりの口ぐせ・打ち方の癖を文章にかける

import { R, fill } from './util.js';
import { shouldBePolite, callName } from './people.js';

const DIALECT = [
  [/だから(?=[、。！!？?]|$)/g, 'だすけ'], [/だからさ/g, 'だすけさ'], [/じゃん/g, 'ねっか'], [/じゃない？/g, 'ねっか？'],
  [/だよね/g, 'らよね'], [/だよ(?=[。！!？?]|$)/g, 'らて'], [/でしょ/g, 'らろ'], [/すごく/g, 'ばか'], [/すごい/g, 'ばか'],
  [/とても/g, 'ばか'], [/恥ずかしい/g, 'しょうしい'], [/そうなんだ/g, 'そうなんらて'], [/だろう/g, 'らろう'], [/元気？/g, 'なじらね？'],
];
const TYPO = [
  ['以外', '意外'], ['移動', '異動'], ['確認', '各員'], ['お願いします', 'お願いしす'], ['ありがとうございます', 'ありがとうごいます'],
  ['よろしく', 'よろししく'], ['請求書', '請求所'], ['了解', '両界'], ['すみません', 'すいません'], ['明日', '明後日'], ['します', 'しまうs'],
  ['です', 'ですs'], ['発注', '発中'], ['納品', '能品'], ['会議', '解義'],
];
const EMO = {
  happy: ['😊', '👍', '✨', '😆', '🙌', '☺️'], sorry: ['🙏', '💦', '😓', '🙇‍♀️', '🙇'], neutral: ['', '', '👀', '📦'],
  sad: ['😢', '😭', '💦'], ojisan: ['😅', '💦', '❗', '😃', '👍', '🍺', '✨', '❓', '😁', '(^_^)v', '⤴️', '🎵'],
};
const KAO = ['(^^)', '(^^;', '(*^^*)', '(^_^;)', '(^-^)', '(>_<)', '(T_T)', '(^^)/'];

export function speak(text, sp, tg, medium = 'chat', vars = {}, mood = 'neutral') {
  const polite = vars.__polite ?? shouldBePolite(sp, tg);
  let s = text;
  // [[丁寧||くだけた]]
  s = s.replace(/\[\[([^\]]*?)\|\|([^\]]*?)\]\]/g, (_, a, b) => polite ? a : b);
  const v = { ...vars, me: sp.sei, you: tg ? callName(sp, tg) : '', youSei: tg?.sei ?? '' };
  s = fill(s, v);
  const st = sp.style;
  // 方言(口頭やくだけた文で)
  if (st.dialect > 0.25 && (!polite || medium === 'talk')) {
    for (const [re, rep] of DIALECT) if (R.chance(st.dialect)) s = s.replace(re, rep);
  }
  // 笑い・感嘆
  s = s.replace(/\{w\}/g, () => medium === 'talk' ? '' : (st.warai && R.chance(0.7) ? st.warai : ''));
  s = s.replace(/\{!\}/g, () => {
    if (medium === 'talk') return R.chance(st.excl) ? '！' : '。';
    if (R.chance(st.excl)) return st.zenkaku ? '！' : (R.chance(0.3) ? '!!' : '!');
    return '。';
  });
  s = s.replace(/\{e\}/g, '');
  if (medium === 'chat') {
    // 書き出しの挨拶
    if (vars.__greet && polite && R.chance(st.otsukare) && !/^お疲れ/.test(s)) s = R.pick(['お疲れ様です。', 'お疲れさまです。', 'お疲れ様です！']) + (R.chance(0.6) ? '\n' : '') + s;
    if (st.zenkaku) s = s.replace(/!/g, '！').replace(/\?/g, '？');
    // 句読点の癖
    if (st.period === 'none') s = s.replace(/。(?=\n|$)/g, '').replace(/。/g, ' ');
    else if (st.period === 'dots') s = s.replace(/。(?=\n|$)/g, () => R.pick(['。。', '…', '、、', '。'])).replace(/、/g, () => R.chance(0.3) ? '、、' : '、');
    else if (st.period === 'double') s = s.replace(/。/g, () => R.chance(0.5) ? '。。' : '。');
    // おじさん構文
    if (st.ojisan) {
      s = s.replace(/かな？/g, 'カナ❓').replace(/ね。/g, () => R.pick(['ネ😅', 'ネ❗', 'ね(^_^)'])).replace(/です。/g, () => R.pick(['です❗', 'デス😃', 'です。']));
      if (R.chance(0.6)) s += R.pick(EMO.ojisan) + (R.chance(0.4) ? R.pick(EMO.ojisan) : '');
    } else if (R.chance(st.emoji)) {
      s += R.pick(EMO[mood] || EMO.neutral);
    } else if (st.kao && R.chance(0.45)) {
      s += R.pick(KAO);
    }
    // 打ち間違い
    if (R.chance(st.typo)) {
      const cand = TYPO.filter(([a]) => s.includes(a));
      if (cand.length) { const [a, b] = R.pick(cand); s = s.replace(a, b); }
    }
  } else {
    s = s.replace(/[😊👍✨😆🙏💦😓😢😭]/gu, '');
  }
  return s.replace(/\s+$/,'');
}

export function sticker(sp, kind = 'ok') {
  const sets = {
    ok: ['了解です', 'りょ', 'OKです', '承知しました', 'ありがとうございます', 'がってん'],
    thanks: ['ありがとうございます', '感謝', 'たすかります', 'さすがです'],
    sorry: ['すみません', 'ごめんなさい', '申し訳ございません', '反省'],
    tired: ['おつかれさまです', 'つかれた', 'ねむい', 'おさきです'],
  };
  return `[スタンプ:${sp.style.stickerSet}「${R.pick(sets[kind] || sets.ok)}」]`;
}
