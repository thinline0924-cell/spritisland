# CLAUDE.md — Grimoire Compiler 開発規約

このフォルダは魔導書構築ローグライク『Grimoire Compiler（仮）』。リポジトリ直下の『精霊の島』とは無関係で、**親フォルダのファイルには触れない**。

## 最初に読むもの
- `SPEC.md` … ゲーム仕様の正。仕様を変えたら必ず SPEC.md も更新する
- `TODO.md` … フェーズごとの実装計画。終わった項目にチェックを付ける

## コマンド（すべて `grimoire/` で実行）
```
npm install
npm run dev        # 開発サーバ
npm test           # Vitest（一回実行）
npm run typecheck  # tsc --noEmit
npm run build      # 型検査 + 本番ビルド
```
コミットの前に `npm run typecheck && npm test` が通ること。

## 層の分け方（最重要）
```
src/core   純粋 TypeScript。ゲームのルール・コンパイラ・シミュレーション
src/render PixiJS。core の状態とイベントを読んで描くだけ
src/audio  Web Audio。core のイベントを読んで鳴らすだけ
src/ui     React + Tailwind。core の公開 API を呼ぶだけ
src/app    ゲームループと結線
```
- `src/core` から `window` / `document` / `pixi.js` / `react` / Web Audio を **import しない・参照しない**。`src/core/architecture.test.ts` が検査する。
- 依存の向きは `app → (ui | render | audio) → core` の一方向。core は他の層を知らない。
- core の公開 API は各フォルダの `index.ts` から export する。

## 決定論
- core では `Math.random()` と `Date.now()` を使わない。乱数は `Rng`（`src/core/rng.ts`）を引数で受け取る。
- 用途ごとに `rng.fork('loot')` のようにストリームを分ける。ストリームを足しても既存の展開が変わらないようにするため。
- 描画と音の見た目だけの揺らぎには `Math.random()` を使ってよい。

## 性能
- シミュレーションのホットループ（毎ティック・要素ごと）では **オブジェクトや配列を新しく作らない**。プールと型付き配列を使う。
- 衝突判定は必ず空間ハッシュを経由する。総当たり（O(n²)）は禁止（テストでの比較用は除く）。
- React の再レンダーは HUD で 15Hz まで。毎フレーム動く表示は ref か Pixi で描く。

## コードの書き方
- TypeScript strict。`any` は使わない（どうしても必要なら理由をコメントに書く）。
- 識別子は英語。ゲーム内に出る文字列（ルーン名・説明・診断の文言）は日本語で、データファイルに集める。
- コメントは日本語で、「なぜそうするか」を書く。自明なことは書かない。
- 単位：距離は px、時間は秒、角度はラジアン（データ表で度を使うときは名前に `Deg` を付ける）。
- ルーン・秘宝・敵の数値はデータ（`catalog.ts` など）に置く。ロジックに数値を直接書かない。
- tier 別の値は `[I, II, III]` の3要素タプル（`TierValues<T>`）で持つ。

## テスト
- テストファイルは対象の隣に `*.test.ts` で置く。
- コンパイラの規則を足したり変えたりしたら、その規則のテストを必ず足す。
- 乱数を使うテストはシードを固定する。分布のテストは十分な試行数と緩い許容幅で書き、揺れて落ちないようにする。

## 進め方
- 1フェーズずつ実装し、フェーズが終わるたびにユーザーに動作確認を頼む。
- UI は実装の前に静的なモックを見せて了承を得る。
- コミットメッセージは日本語で、何をなぜ変えたかを書く。
