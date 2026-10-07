# Agent 向けメモ（youtublur）

YouTube 視聴ページのプレイヤー背景を単色/ブラー表示に切り替えるブラウザ拡張（Chrome/Firefox、Manifest V3）。

この AGENTS.md はエージェントがリポジトリを理解するためのマップです。詳細は各ドキュメントを参照してください。

## リポジトリ構造

```
.
├── .cursor/              # Cursor 設定・ルール・スキル
├── docs/                 # プロジェクトドキュメント
│   ├── design-docs/      # 設計ドキュメント
│   ├── exec-plans/       # 実行計画
│   ├── product-specs/    # 製品仕様
│   └── references/       # リファレンス
├── _locales/             # 国際化（i18n）メッセージ
├── e2e/                  # E2E テスト
├── scripts/              # 補助スクリプト
└── (ソースコード)
```

## 開発手順

### 前提

- すべての作業は `git worktree` で行う（master ブランチでの直接作業は禁止）
- コード変更後は必ず `pnpm test` と `pnpm exec vp lint` を実行
- バージョンは `pnpm run release` フローで管理

### 基本ワークフロー

1. **ブランチ作成**: `git worktree add -b feature/<name> ../youtublur-<name> master`
2. **依存インストール**: `cd ../youtublur-<name> && pnpm install`
3. **実装**: コードを変更
4. **ドキュメント更新**: 変更に応じて関連ドキュメント（ARCHITECTURE.md、DESIGN.md、docs/ 内、または AGENTS.md）を更新
5. **テスト**: `pnpm test` でユニットテスト実行
6. **Lint**: `pnpm exec vp lint` でコード品質チェック
7. **E2E テスト（必要時）**: `pnpm run test:e2e`
8. **コミット**: `git add -A && git commit -m "type: message"`
9. **プッシュ**: `git push -u origin feature/branch-name`
10. **PR 作成**: `gh pr create`
11. **Cleanup**: `git worktree remove ../youtublur-<name>`

詳しくは [implementation.mdc](./.cursor/rules/implementation.mdc) を参照。

## 技術スタック

| 項目 | 詳細 |
|------|------|
| 言語 | TypeScript（`src/*.ts`、`strict: true`）→ `tsc` で root に flat script `.js` を出力 |
| ビルド | `pnpm build` (`tsc`) / `pnpm build:watch` / `pnpm typecheck` |
| ユニットテスト | Vite+（`pnpm test`）+ jsdom（`pretest` で自動コンパイル） |
| E2E テスト | Playwright（`pnpm run test:e2e`） |
| Lint | `pnpm exec vp lint` |
| パッケージ管理 | pnpm（`packageManager` フィールド固定） |
| 対応ブラウザ | Chrome（Manifest V3）/ Firefox（`browser_specific_settings.gecko`） |

## 開発コマンド

| 作業 | コマンド |
|------|----------|
| 型チェック | `pnpm typecheck` |
| ビルド（TS → JS） | `pnpm build` / 監視モード `pnpm build:watch` |
| ユニットテスト | `pnpm test`（pretest で自動 `tsc`） |
| カバレッジ付きユニットテスト | `pnpm run test:coverage`（レポートは `coverage/`） |
| E2E テスト | `pnpm run test:e2e` |
| AI 検証（ブラー描画） | `pnpm run verify:ai-blur`（詳細は下記「検証方法」） |
| Lint | `pnpm exec vp lint` |
| リリース | `pnpm run release` → `git push --follow-tags origin master` |

## 検証方法（ブラー描画 / issue #107）

ブラー描画は「見た目」依存のため、ユニット/E2E のアサーションだけでは不具合を見逃しやすい。
過去に issue #107（初回ロードでブラーが反映されず、タブ切替で初めて正常化する）が
E2E を素通りした事例があるため、以下の前提と手順で検証する。

### 前提となる描画モデル

- blur canvas は `#movie_player` に挿入され、毎フレーム動画フレームをぼかして描画後、
  `clearVideoContentRect` で**動画表示矩形だけを透明にクリア**する。
  → ブラーは「プレイヤーの余白（レターボックス/ピラーボックス帯）」にのみ視認できる。
- 既定の watch 表示では YouTube が `#movie_player` を**動画アスペクトぴったりに合わせる**ため帯が無く、
  ブラーは事実上見えない。帯（=ブラーが見える状態）が生じるのは**シアター/ワイドレイアウト**。
  実機検証で帯の画素を見るときはシアターモードに切り替えること。
- issue #107 の中核は「canvas のバッキングサイズがプレイヤー表示寸法に追従しているか」。
  描画ループ（`syncBlurCanvasSize`）が毎フレーム自己修復するため、帯の有無に関係なく
  **無操作の初回ロードで `canvas.width/height == #movie_player の client box` を検証**できる。

### レイヤ別の検証手段

1. **ユニットテスト**（`content.test.js`）— 決定的・最優先。
   外部 resize イベントなしでループがサイズ不一致を自己修復することを検証する
   （`syncBlurCanvasSize` / 「blur loop self-heals canvas size ...」テスト）。

2. **E2E**（`e2e/blur.spec.js`）— 実 YouTube 上で検証。
   - `assertCanvasTracksContainer()`: **無操作の初回ロード**で canvas がプレイヤー寸法に追従しているか
     （issue #107 の回帰ガード。ユーザー操作に依存しない）。
   - `assertAmbientBandBlurred()`: シアター切替で帯を発生させた後、帯のブラー描画と中央クリアを検証。
   - 注意: 検証より前に `.ytp-size-button` をクリックすると、その resize が不具合を**修復してしまい**
     検証が無意味になる。初回ロードの追従チェックは必ずクリック前に行う。

3. **AI-Agentic 検証**（`e2e/ai-verify/`、`pnpm run verify:ai-blur`）— E2E が脆い/再現が難しい場合の手段。
   無操作の初回ロードとシアターのスクリーンショット + 決定的メトリクス（canvas 追従・帯のブラー・
   空間分散など）+ AI 判定用プロンプトを `e2e/ai-verify/artifacts/`（git 管理外）に生成する。
   明確なメトリクス異常は終了コードで返し（0=OK / 1=メトリクス異常 / 2=採取失敗）、
   定性判定はスクリーンショットを AI に渡して `PASS/FAIL` を得る。詳細は
   [`e2e/ai-verify/README.md`](./e2e/ai-verify/README.md)。

### サンドボックス/ヘッドレスでの注意

パッケージ拡張の content script は、環境によってはヘッドレス Chrome（`--load-extension`）で
注入されないことがある。その場合は Firefox fixture と同じ手法で `chrome` をモックし、
`storage-mode.js` + `content.js` を `addInitScript` で**手動注入**すれば、実 YouTube DOM 上で
content script ロジックを検証できる（`e2e/ai-verify/capture-blur-evidence.mjs` 参照）。

## コンテキスト優先順位

コード変更前に、以下を**順に**確認すること。

1. **[`manifest.json`](./manifest.json)** - 権限、マッチパターン、バージョン、正確性
2. **[browser-extension.mdc](./.cursor/rules/browser-extension.mdc)** - MV3 制約、Firefox AMO 要件
3. **[locales.mdc](./.cursor/rules/locales.mdc)** - i18n キー追加・更新ルール
4. **[src/content.ts](./src/content.ts) / [src/popup.ts](./src/popup.ts) / [src/storage-mode.ts](./src/storage-mode.ts)** - 主要ビジネスロジック（root の同名 `.js` はコンパイル成果物。直接編集しない）
5. **[docs/release.md](./docs/release.md)** - リリース手順

## ドキュメント構造

### 主要ドキュメント

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - システムアーキテクチャと依存関係
- **[DESIGN.md](./DESIGN.md)** - 設計原則とパターン
- **[FRONTEND.md](./FRONTEND.md)** - フロントエンドアーキテクチャ
- **[QUALITY_SCORE.md](./QUALITY_SCORE.md)** - 品質指標と技術的負債

### docs/ ディレクトリ

- **[docs/design-docs/](./docs/design-docs/)** - 設計ドキュメント集
- **[docs/exec-plans/](./docs/exec-plans/)** - 実行計画
- **[docs/product-specs/](./docs/product-specs/)** - 製品仕様
- **[docs/references/](./docs/references/)** - リファレンス資料

## Cursor 設定

- **スラッシュコマンド**: [`.cursor/commands/`](./.cursor/commands/)（`/feedback-review`, `/self-review` など）
- **ルールファイル**: [`.cursor/rules/*.mdc`](./.cursor/rules/)（グローバルルールは `alwaysApply: true`）

## 主なパス

| 用途 | パス |
|------|------|
| コンテンツロジック | [`src/content.ts`](./src/content.ts), [`content.test.js`](./content.test.js) |
| ポップアップ UI | [`popup.html`](./popup.html), [`src/popup.ts`](./src/popup.ts), [`popup.test.js`](./popup.test.js) |
| レビュー促し（ポップアップ） | [`src/review-nudge.ts`](./src/review-nudge.ts), [`review-nudge.test.js`](./review-nudge.test.js) |
| ストレージユーティリティ | [`src/storage-mode.ts`](./src/storage-mode.ts) |
| 型定義（拡張グローバル / `BackgroundMode`） | [`globals.d.ts`](./globals.d.ts) |
| TS 設定 | [`tsconfig.json`](./tsconfig.json) |
| コンパイル成果物（編集禁止） | `content.js`, `popup.js`, `storage-mode.js`, `review-nudge.js`（manifest / popup 参照先） |
| スタイル | [`style.css`](./style.css) |
| マニフェスト | [`manifest.json`](./manifest.json) |
| 文言（i18n） | [`_locales/*/messages.json`](./_locales/)（基準は [`en`](./_locales/en/messages.json)） |
| E2E テスト | [`e2e/`](./e2e/) |
| AI 検証ハーネス | [`e2e/ai-verify/`](./e2e/ai-verify/)（`pnpm run verify:ai-blur`、ブラー描画の証跡採取） |
| 補助スクリプト | [`scripts/`](./scripts/)（sync-version, publish, refresh-token, dependabot-merge） |
| CI/CD | [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) |

## Do / Don't

### Do（必ず行うこと）

- **git worktree で作業**: master ブランチでの直接作業は禁止
- **テスト実行**: `pnpm test` で全テスト通過を確認
- **Lint 実行**: コミット前に `pnpm exec vp lint` でエラー解消
- **バージョン管理**: `pnpm run release` フローに従う
- **i18n キー管理**: 全ロケール（en, es, id, ja, ko, pt_BR, zh_CN, zh_TW）でキー定義
- **zip 同期**: リリース zip の変更は `.github/workflows/publish.yml` にも反映
- **CLI 使用**: GitHub 操作は `gh` CLI のみ
- **ドキュメント更新**: コード変更に合わせて関連ドキュメント（ARCHITECTURE.md、DESIGN.md、AGENTS.md など）も必ず更新する

### Don't（禁止・注意事項）

- **勝手に権限追加**: `storage` / `activeTab` 以外の権限追加は慎重に
- **マッチパターン拡張**: `*://*.youtube.com/*` を維持
- **manifest.json 手動変更**: `version` は `pnpm run release` で管理
- **REST API / PAT / ブラウザ操作**: `gh` CLI のみを使用
- **description 省略不可**: i18n キーには `message` と `description` を必須
- **E2E テスト無視**: 主要ユーザーストーリーは e2e でカバー
- **ドキュメント更新の怠り**: コード変更時にドキュメントも更新する（実装とドキュメントの乖離を防ぐ）

## Code Review Rules

### レビューコメントの言語
- PR 上のレビュー指摘・提案・説明はすべて日本語で書くこと。
- コード識別子・コマンド・ファイルパス・エラー原文・API 名はそのまま残すこと。

## リリース手順

詳細は [`docs/release.md`](./docs/release.md) を参照。

1. 未コミットがないことを確認
2. `pnpm test` で全テスト通過を確認
3. `pnpm run release` でバージョンバンプ、CHANGELOG 更新、コミット、タグ作成
4. `git push --follow-tags origin master` で push
5. GitHub Actions で公開処理が自動実行

### Dependabot 自動化

- **patch / minor / major**: CI（`Test` / `Lint` / `E2E Tests` / `Semgrep`）合格後に自動マージ（[`scripts/dependabot-merge.mjs`](./scripts/dependabot-merge.mjs) が `app/dependabot` と `dependabot[bot]` の両方を対象にする）。semver major も CI が担保できる更新は自動マージする。
- **自動パッチリリース**: 最大 1 日 1 回（UTC 15:00 cron）
- **手動対応が必要なケース**: 上記 CI が失敗する、または既存テストスイートがカバーしない変更のみ（「極めて高リスク」）

## 設計理念

このリポジトリは AI エージェントとの協調開発を前提として設計されています。

- **Progressive Disclosure**: 最小の安定したエントリーポイントから段階的に文脈を広げる
- **Knowledge as Code**: ドキュメントはすべてリポジトリ内にバージョン管理
- **Mechanical Enforcement**: ルールはリンターやテストで自動強制
- **Legibility First**: エージェントが直接アクセスできるコンテキストを最大化

詳しくは各ドキュメントを参照してください。

## 参考文献

- [Harness Engineering: Leveraging Codex in an Agent-First World](https://openai.com/index/harness-engineering/) - OpenAI の AI 駆動開発ベストプラクティス
- [Cortex CLI](https://github.com/lobehub/cortex-cli) - ローカル LLM 管理

## サポート

問題や質問がある場合は、GitHub Issue を作成してください（[GitHub](https://github.com/kyto64/youtublur/issues)）。
