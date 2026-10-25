// ブラウザでの動作確認(Playwright が必要): node test/e2e.js
// テスト用の DDP を作り、index.html を file:// で開いて、読み込み・検証・再生・頭出しを確かめる。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const sample = require('./make-sample-ddp.js');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'index.html');

function makeSet(opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-e2e-'));
  sample.make(dir, opts);
  return dir;
}

async function openSet(page, dir) {
  await page.goto(PAGE);
  const files = fs.readdirSync(dir).map((n) => path.join(dir, n));
  await page.setInputFiles('#pick-files', files);
  await waitOpened(page);
}

// 最初に自動で開くサンプルから、選んだ DDP に入れかわるのを待つ
async function waitOpened(page) {
  await page.waitForFunction(() => {
    const disc = document.getElementById('disc');
    return !disc.hidden && document.getElementById('sample-note').hidden;
  });
}

async function waitVerify(page) {
  await page.waitForFunction(() => !/計算しています/.test(document.getElementById('verify-summary').textContent), null, { timeout: 30000 });
  return page.textContent('#verify-summary');
}

const text = (page, sel) => page.textContent(sel).then((s) => s.trim());

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  let passed = 0;
  async function test(name, fn) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(name + ': ' + m.text()));
    try {
      await fn(page);
      passed++;
      console.log('  ok  ' + name);
    } catch (e) {
      console.log('  NG  ' + name + '\n' + e.stack);
      process.exitCode = 1;
      await page.screenshot({ path: path.join(os.tmpdir(), 'ddp-e2e-fail.png'), fullPage: true });
    }
    await page.close();
  }

  console.log('DDP 試聴プレーヤーのブラウザテスト');

  await test('読み込み・CD-TEXT・曲の一覧・チェックサム一致', async (page) => {
    await openSet(page, makeSet());
    assert.strictEqual(await text(page, '#album-title'), sample.ALBUM.title);
    assert.strictEqual(await page.locator('#track-rows tr').count(), 3);
    assert.strictEqual(await text(page, '#track-rows tr:nth-child(2) .t-title'), '月の舟');
    assert.strictEqual(await text(page, '#track-rows tr:nth-child(2) td:nth-child(5)'), '00:02:00');
    assert.strictEqual(await text(page, '#leadout'), '00:22:00');
    const summary = await waitVerify(page);
    assert.match(summary, /5 個すべて一致/);
    // ピーク: 左 16000 / 32768 → -6.2 dB
    assert.strictEqual(await text(page, '#track-rows tr:nth-child(1) .c-peak'), '-6.2 dB');
    assert.match(await text(page, '#disc-meta'), /リトルエンディアン/);
  });

  await test('再生すると時間が進み、メーターが振れる', async (page) => {
    await openSet(page, makeSet());
    assert.strictEqual(await text(page, '#d-track'), '01');
    await page.click('#b-play');
    await page.waitForTimeout(2300);
    const t = await text(page, '#d-time');
    assert.ok(['00:01', '00:02'].includes(t), '再生時間: ' + t);
    const db = parseFloat(await text(page, '#mt-l'));
    assert.ok(db > -7 && db < -5.5, '左のレベル: ' + db);
    assert.match(await text(page, '#out-rate'), /44\.1 kHz/);
    await page.click('#b-play'); // 一時停止
    const paused = await text(page, '#d-time');
    await page.waitForTimeout(800);
    assert.strictEqual(await text(page, '#d-time'), paused);
  });

  await test('曲をクリックで頭出し・プリギャップ表示・次の曲へ', async (page) => {
    await openSet(page, makeSet());
    await page.click('#track-rows tr:nth-child(2)');
    await page.waitForTimeout(600);
    assert.strictEqual(await text(page, '#d-track'), '02');
    assert.strictEqual(await text(page, '#d-index'), '01');
    // プリギャップから頭出し
    await page.check('#o-pregap');
    await page.click('#track-rows tr:nth-child(2)');
    await page.waitForTimeout(400);
    assert.strictEqual(await text(page, '#d-track'), '02');
    assert.strictEqual(await text(page, '#d-index'), '00');
    assert.match(await text(page, '#d-time'), /^-00:0[12]$/);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    assert.strictEqual(await text(page, '#d-track'), '03');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    assert.strictEqual(await text(page, '#d-track'), '01');
  });

  await test('最後まで再生すると止まる / 1曲ずつ止める', async (page) => {
    await openSet(page, makeSet());
    await page.check('#o-single');
    await page.click('#track-rows tr:nth-child(3)'); // 7秒の曲
    await page.waitForFunction(() => !document.getElementById('b-play').classList.contains('is-playing'), null, { timeout: 12000 });
    assert.strictEqual(await page.evaluate(() => document.getElementById('d-track').textContent), '01');
    await page.uncheck('#o-single');
    await page.click('#track-rows tr:nth-child(2)'); // 5秒 + 2秒プリギャップ + 7秒
    await page.waitForTimeout(6500);
    assert.strictEqual(await text(page, '#d-track'), '03', '止まらずに次の曲へ');
  });

  await test('シークバーをクリックすると移動する', async (page) => {
    await openSet(page, makeSet());
    const box = await page.locator('.seek-track').boundingBox();
    await page.mouse.click(box.x + box.width * 0.95, box.y + box.height / 2);
    await page.waitForTimeout(100);
    assert.strictEqual(await text(page, '#d-track'), '03');
  });

  await test('ビッグエンディアンを自動判定する', async (page) => {
    await openSet(page, makeSet({ be: true }));
    assert.match(await text(page, '#disc-meta'), /ビッグエンディアン/);
    await waitVerify(page);
    assert.strictEqual(await text(page, '#track-rows tr:nth-child(1) .c-peak'), '-6.2 dB');
  });

  await test('壊れた IMAGE.DAT を見つける', async (page) => {
    const dir = makeSet();
    const f = path.join(dir, 'IMAGE.DAT');
    const b = fs.readFileSync(f);
    b[b.length >> 1] ^= 1;
    fs.writeFileSync(f, b);
    await openSet(page, dir);
    assert.match(await waitVerify(page), /チェックサムと合いません/);
    assert.match(await text(page, '#file-rows'), /不一致/);
  });

  await test('足りないファイル・フルスケールを知らせる', async (page) => {
    const dir = makeSet({ fullScale: true });
    fs.unlinkSync(path.join(dir, 'CDTEXT.BIN'));
    await openSet(page, dir);
    await waitVerify(page);
    assert.match(await text(page, '#file-rows'), /ファイルがありません/);
    assert.match(await text(page, '#diagnostics'), /フルスケール/);
    assert.match(await text(page, '#diagnostics'), /CD-TEXT/);
  });

  await test('最初はサンプルが開いていて、そのまま再生・検証できる', async (page) => {
    await page.goto(PAGE);
    await page.waitForSelector('#sample-note:not([hidden])');
    assert.strictEqual(await text(page, '#album-title'), sample.ALBUM.title);
    assert.match(await waitVerify(page), /6 個すべて一致|5 個すべて一致/);
    await page.click('#b-play');
    await page.waitForTimeout(1300);
    assert.match(await text(page, '#d-time'), /^00:0[01]$/);
    assert.ok(parseFloat(await text(page, '#mt-l')) > -7);
  });

  await test('音声データがないときは、曲の一覧を出して足りないファイルを知らせる', async (page) => {
    const dir = makeSet();
    fs.unlinkSync(path.join(dir, 'IMAGE.DAT'));
    await openSet(page, dir);
    assert.strictEqual(await page.locator('#track-rows tr').count(), 3);
    assert.match(await text(page, '#message'), /IMAGE\.DAT/);
    await waitVerify(page);
    assert.match(await text(page, '#verify-summary'), /選んだファイルの中にありません/);
    await page.click('#b-play');
    await page.waitForTimeout(500);
    assert.strictEqual(await text(page, '#d-time'), '00:00');
  });

  await test('足りない IMAGE.DAT をあとから追加して再生できる', async (page) => {
    const dir = makeSet();
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-e2e-'));
    fs.renameSync(path.join(dir, 'IMAGE.DAT'), path.join(extra, 'IMAGE.DAT'));
    await openSet(page, dir);
    await page.waitForSelector('#add-audio:not([hidden])');
    assert.match(await text(page, '#add-audio-label'), /IMAGE\.DAT/);
    await page.setInputFiles('#pick-more', [path.join(extra, 'IMAGE.DAT')]);
    await page.waitForSelector('#add-audio', { state: 'hidden' });
    assert.ok(await page.evaluate(() => document.getElementById('message').hidden));
    assert.match(await waitVerify(page), /5 個すべて一致/);
    await page.click('#b-play');
    await page.waitForTimeout(1500);
    assert.ok(parseFloat(await text(page, '#mt-l')) > -7);
  });

  await test('名前の前に文字が付いていても開ける(9cc92fc6-DDPMS など)', async (page) => {
    const dir = makeSet();
    for (const n of fs.readdirSync(dir)) fs.renameSync(path.join(dir, n), path.join(dir, 'a1b2c3d4-' + n));
    await openSet(page, dir);
    assert.strictEqual(await page.locator('#track-rows tr').count(), 3);
    assert.match(await waitVerify(page), /5 個すべて一致/);
    await page.click('#b-play');
    await page.waitForTimeout(1500);
    assert.ok(parseFloat(await text(page, '#mt-l')) > -7);
  });

  await test('音声データの名前が違っても、大きさが合えば使う', async (page) => {
    const dir = makeSet();
    fs.renameSync(path.join(dir, 'IMAGE.DAT'), path.join(dir, 'master_audio'));
    fs.renameSync(path.join(dir, 'DDPMS'), path.join(dir, 'map.bin')); // 名前が違っても中身で見つける
    await openSet(page, dir);
    assert.match(await text(page, '#diagnostics'), /大きさが同じ「master_audio」/);
    await page.click('#b-play');
    await page.waitForTimeout(1500);
    assert.ok(parseFloat(await text(page, '#mt-l')) > -7);
  });

  await test('DDP でないものを開くと説明が出る', async (page) => {
    await page.goto(PAGE);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-e2e-'));
    fs.writeFileSync(path.join(tmp, 'master.zip'), 'PK');
    await page.setInputFiles('#pick-files', [path.join(tmp, 'master.zip')]);
    assert.match(await text(page, '#message'), /ZIP/);
  });

  await test('フォルダごと選んでも開ける(サブフォルダ入り)', async (page) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-e2e-'));
    sample.make(path.join(root, 'MASTER'));
    await page.goto(PAGE);
    await page.setInputFiles('#pick-dir', root);
    await waitOpened(page);
    assert.strictEqual(await page.locator('#track-rows tr').count(), 3);
  });

  await page_shot(browser);
  await browser.close();
  if (errors.length) {
    console.log('ブラウザのエラー:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  console.log(`\n${passed} 件成功${process.exitCode ? '(失敗あり)' : ''}`);
})();

// 画面の見本(test/screenshot.png)
async function page_shot(browser) {
  if (!process.env.SCREENSHOT) return;
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  await openSet(page, makeSet());
  await waitVerify(page);
  await page.click('#track-rows tr:nth-child(2)');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
  await page.close();
}
