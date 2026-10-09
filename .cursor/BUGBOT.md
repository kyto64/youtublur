# Bugbot レビュールール（youtublur）

このファイルが PR レビュー基準の正である。Bugbot は `.cursor/rules/*.mdc` を適用しない。`AGENTS.md` を読むかも未確認なので、レビューに必要な方針はここに自己完結で書いてある。変更行と、その変更が壊しうる呼び出し元だけを見る。無関係な既存コードの一括改修は求めない。

## 起動

kyto の設定は手動トリガーのみ。push では自動実行しない。PR に `bugbot run` とコメントしたときだけ走る。レビュー可能になったときに 1 回、その指摘への修正を push したあとに 1 回。細かい push のたびに要求しない（1 回ごとに費用がかかる）。結果はチェック run `Cursor Bugbot`（`success` は指摘なし、`neutral` は指摘あり・キャンセル・エラー）。Dependabot の PR はレビューしない。

## レビューコメントの言語

指摘・提案・説明・要約はすべて日本語で書く。次はそのまま残す。

- コード識別子（関数名・型名・変数名・ワークフロー名）
- コマンド（例: `pnpm test`、`pnpm exec vp lint`、`bugbot run`）
- ファイルパス
- エラー原文
- API 名・権限名・チェック名

## 重大度

各指摘の先頭に、次のいずれか一つを付ける。説明は日本語、根拠になる識別子は原文のまま書く。

- **blocking** — マージ前に直す。本番不具合、セキュリティ、ストア審査に効く破壊、テストが落ちる変更、自動マージを止める変更。
- **medium** — 今は動いても回帰しやすい。エッジケース、エラーハンドリング不足、ドキュメントと実装の乖離、主要ストーリーのテスト不足。
- **low** — 動作もポリシーも壊さない改善（命名、コメント、小さな整理）。同種の low を並べない。スタイルだけの指摘は出さない。

### blocking にする条件

- Chrome（Manifest V3）か Firefox（AMO）の片方だけで壊れる。
- `manifest.json` の権限を `storage` / `activeTab` 以外に増やす。マッチパターンを `*://*.youtube.com/*` から広げる。`browser_specific_settings.gecko`（`id`、`strict_min_version`）を消す、または AMO のアドオン ID とずらす。
- `manifest.json` の `version` を手動で変える。バージョンは `pnpm run release` だけが上げる。
- UI に出す文字列を i18n 経由にしない。ロケールキーの追加・変更が `en`, `es`, `id`, `ja`, `ko`, `pt_BR`, `zh_CN`, `zh_TW` のどれかで欠ける。キーに `message` または `description` が無い。
- コンパイル成果物（root の `content.js` / `popup.js` / `storage-mode.js` / `review-nudge.js`）だけを手編集し、対応する `src/*.ts` を変えていない。
- ワークフロー名 `Test` / `Lint` / `E2E Tests` / `Semgrep` を変える、または Dependabot 自動マージ（`dependabot-auto-merge.yml`、`dependabot-merge-after-checks.yml`、`scripts/dependabot-merge.mjs`）がこれらの結論を読めなくなる。
- 新しい機能なのにユニットテストが無く、既存テストも更新されていない。`pnpm test` や `pnpm exec vp lint` が落ちる。
- ユーザー入力やストレージ値を検証せず DOM に入れる（XSS）。シークレットやトークンをリポジトリに書く。

### medium にする条件

- 非同期の失敗を握りつぶし、安全なフォールバックが無い。
- ブラー描画の変更で、無操作の初回ロードにおける canvas サイズ追従（下記）を壊しうるのにテストが無い。
- UI 変更なのに E2E（`pnpm run test:e2e`）の主要ストーリーを更新していない。
- 実装を変えたのに `AGENTS.md` や関連ドキュメントが古いままになる。
- `src/content.ts` を目安（約 800 行）からさらに大きく膨らませる。`src/popup.ts` は約 200 行、ユーティリティは約 150 行、テストは約 400 行が目安。既に超えているファイルを、今回触っていないのに指摘しない。

### low にする条件

- 上に当てはまらない、限定的な読みやすさの改善。ポリシー違反に見えないものは出さない。

## リポジトリの方針

YouTube 視聴ページのプレイヤー背景を単色またはブラーにするブラウザ拡張（Chrome / Firefox、Manifest V3）。

### Chrome / Firefox

- `manifest_version` は 3。権限は `storage` と `activeTab` のみ。権限追加は Chrome Web Store と AMO の審査に効く。
- content script のマッチパターンは `*://*.youtube.com/*` のまま。
- Firefox は `browser_specific_settings.gecko` を維持する。リリース zip は `extension.zip` と `extension-firefox.zip`（中身は同一）で、一覧は `.github/workflows/publish.yml` と一致させる。
- ソースは `src/*.ts`（`strict: true`）。`tsc` が root に flat script の `.js` を出す。ES modules は使わない。mode は `BackgroundMode = 'blur' | 'solid'`（`globals.d.ts`）。
- ポップアップ、コンテンツスクリプト、ストレージの境界を混ぜない。ストレージに入る値は境界で検証する。

### i18n

- 既定ロケールは `en`（`manifest.json` の `default_locale`）。
- UI 文字列は `__MSG_キー名__` または `chrome.i18n.getMessage` だけ。HTML / JS への直書きはしない。
- 新しい概念は新しいキーにする。文言だけ変えるときは既存キーの `message` を更新する。
- 全ロケールは `en`, `es`, `id`, `ja`, `ko`, `pt_BR`, `zh_CN`, `zh_TW`。各キーに `message` と `description` が必要。

### テスト

- ユニットテストは `pnpm test`（Vite+ と jsdom。`pretest` で `tsc`）。コード変更後はこれが通ることが前提。
- Lint は `pnpm exec vp lint`。CI のワークフロー名は `Lint`。
- E2E は `pnpm run test:e2e`（Playwright）。CI のワークフロー名は `E2E Tests`。SPA 遷移、ショート、ブラー状態など主要ユーザーストーリーをカバーする。UI の挙動を変えた PR では E2E の更新要否を見る。
- 失敗したテストのままマージ・リリースしない。
- ブラーは見た目依存でアサーションをすり抜けやすい。canvas は `#movie_player` に入り、毎フレームぼかしたあと `clearVideoContentRect` で動画矩形だけ透明にする。ブラーが見えるのはレターボックス / ピラーボックス（シアター・ワイド）の帯だけ。通常の watch ではプレイヤーが動画アスペクトに合うため帯が無く、ブラーは事実上見えない。
- issue #107 の回帰は「無操作の初回ロードで `canvas.width/height` が `#movie_player` の client box と一致するか」。描画ループの `syncBlurCanvasSize` が毎フレーム自己修復する。検証より前に `.ytp-size-button` を押すと resize で不具合が隠れる。ユニットテストは `content.test.js` の canvas サイズ自己修復。E2E は `e2e/blur.spec.js` の `assertCanvasTracksContainer()`（クリック前）と `assertAmbientBandBlurred()`。

### Dependabot とリリース

- Dependabot（作者 `app/dependabot` と `dependabot[bot]` の両方）の patch / minor / major は、`Test` / `Lint` / `E2E Tests` / `Semgrep` が成功したあと自動マージする。semver major も、この 4 つが担保できる更新は自動マージする。極めて高リスクなのは、この 4 ワークフローが失敗する場合か、既存スイートが検証できない変更だけ。
- ワークフロー名はジョブ名ではない。`Test` の Node マトリクスと `E2E Tests` のブラウザマトリクスは、それぞれ 1 run で、全ジョブ成功のときだけ conclusion が success。`dependabot-merge-after-checks.yml` は `gh run list --workflow` でこの名前を読む。名前を変えない。
- Dependabot の PR は Bugbot ではレビューしない。自動マージ条件に `Cursor Bugbot` を足さない。Dependabot PR に Bugbot の指摘が無いことを指摘しない。自動マージは `Test` / `Lint` / `E2E Tests` / `Semgrep` のみ。
- 自動パッチリリースは最大 1 日 1 回（既定 cron は UTC 15:00）。`package.json` の version やタグをこの PR で手動変更しない。
- `GITHUB_TOKEN` による push では他ワークフローが再実行されない。日次リリースの publish 起動（`scripts/dispatch-publish.sh`、`RELEASE_PUSH_TOKEN`）を、レビューで別方式に置き換えない。

### セキュリティ

- 新しい権限は必要最小限。ユーザー設定は `chrome.storage` に置き、レビュー促しの状態は local のみ。
- サードパーティの依存追加は理由が PR に無いとき medium 以上で聞く。Semgrep（ワークフロー名 `Semgrep`）が落ちる変更は blocking。

## 指摘しないこと

- 参考文献にある Codex / OpenAI の記事名（レビュー手順の記述ではない）。
- 今回の差分の外にある、既存のファイルサイズ超過や既存の文言。
- フォーマットだけの差分。Lint が既に見ている項目の繰り返し。
