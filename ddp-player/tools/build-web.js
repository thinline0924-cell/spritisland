// ウェブ公開用に、CSS と JavaScript を1つの HTML にまとめる
//   node tools/build-web.js <出力ファイル>
// claude.ai のアーティファクトとして公開するときは、外側の <html>・<head>・<body> を付けない形にする
// (公開するときに自動で付くため)。
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = process.argv[2];
if (!out) {
  console.error('使い方: node tools/build-web.js <出力ファイル>');
  process.exit(1);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
let body = html.match(/<body>([\s\S]*)<\/body>/)[1];
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(src + ' に </script が含まれています');
  return '<script>\n' + js + '\n</script>';
});
const page = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<style>\n' + css + '\n</style>',
  body.trim(),
  '',
].join('\n');
fs.writeFileSync(out, page);
console.log(`作成しました: ${out}(${(page.length / 1024).toFixed(0)} KB)`);
