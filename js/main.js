// 入り口:島を作り、3D表示と画面をつなぎ、ゲームを始める
import { generateBoard } from './boardgen.js';
import { Board3D } from './board3d.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { SPIRITS } from './data.js';

const board = generateBoard();
let board3d;
try {
  board3d = new Board3D(document.getElementById('stage'), document.getElementById('labels'), board);
} catch (e) {
  document.body.insertAdjacentHTML('beforeend',
    '<div class="fatal">3D表示(WebGL)が使えないため、ゲームを表示できません。<br>Chrome・Safari・Edge などの新しいブラウザで開いてください。</div>');
  throw e;
}
const ui = new UI(board3d);

function start(opts) {
  const game = new Game(board, opts, null);
  game.ui = ui.facade(game);
  ui.setGame(game);
  window.__game = game; // 動作確認用
  game.run();
}

ui.onNewGame = () => ui.showStart(SPIRITS, start);
ui.showStart(SPIRITS, start);
