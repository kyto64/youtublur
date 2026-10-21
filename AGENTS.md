# Agent 向けメモ（youtublur）

YouTube 視聴ページのプレイヤー背景を単色/ブラー表示に切り替えるブラウザ拡張（Chrome/Firefox、Manifest V3）。

この AGENTS.md はエージェントがリポジトリを理解するためのマップです。詳細は各ドキュメントを参照してください。

## Workflow（必須）

計画・実装・PR 前レビューはすべて Devin のセッションで行う。リポジトリ側ではモデル名を指定しない。Devin のモードはタスクの重さで選ぶ。

- **normal**（既定）: ドキュメント、小さな修正、ルール編集、レビュー（重い PR のレビューだけ fusion 可）
- **fusion**: 複雑なロジック、複数ファイルにまたがる大きな変更、難しいバグだけ
- **ultra**: kyto の承認なしでは使わない
- セッション起動時の報告に、使ったモードと理由を一言添える（例: 「normal（ドキュメントのみの変更のため）」）

ブランチ名とコマンドの詳細は下記「開発手順」「開発コマンド」、ハーネスの配置は [docs/development.md](./docs/development.md) を参照する。

1. **Plan**（実装セッション）: 変更前に目的・影響ファイル・手順・テスト方針を箇条書きで出す。不明点は仮定を明記する。
2. **Implement**（実装セッション）: 計画に沿って最小差分で実装する。手順と制約は [`.cursor/agents/implementer.md`](./.cursor/agents/implementer.md)。
3. **Test**（実装セッション）: 次を必ず実行し、失敗したら直して再実行する。
   - 依存が未整備なら `bash scripts/cloud-agent-install.sh`（engines を満たす Node、corepack の pnpm、`pnpm install --frozen-lockfile`）。Node と pnpm が揃っていれば `pnpm install` でよい
   - `pnpm test`（`pretest` で `tsc`）
   - `pnpm exec vp lint`
   - `pnpm typecheck`
   - UI の挙動を変える場合は `pnpm run test:e2e`
   - UI 変更はスクリーンショットを残す
4. **Verify**（実装セッション）: [`.cursor/agents/verifier.md`](./.cursor/agents/verifier.md) の手順で、テスト結果と差分を要件と照合し `passed` / `incomplete` を出す。`incomplete` なら Implement に戻る。
5. **Review**（別の新しい Devin セッション）: ブランチを push したあと、実装とは別の新しい Devin セッション（普段は normal、重い PR だけ fusion 可。クリーンコンテキスト）に [`.cursor/agents/reviewer.md`](./.cursor/agents/reviewer.md) の手順で base との `git diff` をレビューさせる。渡すのはブランチ名・base・要件の箇条書きだけで、実装の経緯は渡さない。レビューセッションはファイル編集・コミット・push をしない。blocking / medium は実装セッションで直し、Test からやり直してから PR を出す。
6. **Report**（実装セッション）: PR 本文に計画・実施したテストと結果・Verify 結果・レビュー結果（レビューセッションの URL）・未解決事項を書く。

## リポジトリ構造

```
.
├── .cursor/              # エージェント用の手順・ルール（Devin も参照。旧 Cursor 設定）
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

手順の順序と品質ゲートは上記 **Workflow（必須）** が正（Plan → Implement → Test → Verify → Review → Report）。
この節はブランチと作業場所の詳細だけを書く。個別コマンドは「開発コマンド」、ハーネスは [docs/development.md](./docs/development.md)。

### 前提

- master ブランチでの直接作業は禁止
- 新規ブランチ名
  - Devin セッション: `devin/<unix 秒>-<slug>`（Devin の既定。例: `devin/1791981419-blur-resize`）
  - 人手のローカル作業: `feature/<name>`
  - `cursor/*` は Cursor cloud agent 時代の名前。新規には使わない
- コミットは Conventional Commits（`type: message`）
- 必須コマンドは Workflow の Test / Verify に従う（`pnpm test` / `pnpm exec vp lint` / `pnpm typecheck`。UI 変更時は `pnpm run test:e2e`）
- コード変更時は関連ドキュメント（ARCHITECTURE.md、DESIGN.md、docs/、または AGENTS.md）も更新する
- バージョンは `pnpm run release` フローで管理
- Node.js は `package.json` の `engines`（`^22.22.2 || ^24.15.0 || >=26.0.0`）。CI の Test は `22.22.2`、`24`、`26`。E2E とリリースは Node.js 22

### 基本ワークフロー

**Devin セッション**（VM 上のクローンで作業する。worktree は不要）

1. **ブランチ作成**: `git checkout -b devin/$(date +%s)-<slug> origin/master`
2. **依存インストール**: Workflow の Test を参照
3. **実装以降**: コード・ドキュメントの変更、Test、Verify は Workflow に従う
4. **コミット・プッシュ**: `git add <変更ファイル>` → `git commit -m "type: message"` → `git push -u origin <branch>`
5. **Review**: 別の新しい Devin セッションでレビューし、指摘を直す
6. **PR 作成**: Devin の GitHub 連携か `gh` で作成する（draft 可）。Codex のレビューを使う: PR オープン時の自動レビューと、必要に応じた `@codex review` コメントの手動依頼の両方。Codex の指摘を検討したうえで CI とマージ基準に従う。`bugbot run` / `cursor review` は書かない（Bugbot は停止中。例外は kyto 本人が手動で `bugbot run` する場合だけ）

**人手のローカル作業**（git worktree を使う）

1. `git worktree add -b feature/<name> ../youtublur-<name> master`
2. `cd ../youtublur-<name> && pnpm install`
3. 実装・テスト後に `git push -u origin feature/<name>` → `gh pr create`
4. Cleanup: `git worktree remove ../youtublur-<name>`

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

ブラー描画は「見た目」依存のため、ユニット/E2E のアサーションだけでは不具合を見逃しやすい（issue #107 は E2E を素通りした）。
ブラー描画に触れる変更では、[docs/testing.md の「ブラー描画の検証」](./docs/testing.md#ブラー描画の検証issue-107)にある描画モデル・レイヤ別の検証手段（`content.test.js` → `e2e/blur.spec.js` → `pnpm run verify:ai-blur`）・ヘッドレスでの注意を読んでから検証する。
要点: 初回ロードの canvas 追従チェックは `.ytp-size-button` をクリックする**前**に行う。帯の画素を見るときはシアターモードにする。

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

## エージェント設定（Devin）

- **AGENTS.md**: Devin がセッション開始時に自動で読む（先頭 16 KiB まで）。常に必要なルールは先頭 16 KiB 以内に置く（「主なパス」以降は参照用）
- **手順書**: [`.cursor/agents/`](./.cursor/agents/)（`implementer`, `verifier`, `reviewer`）。Workflow の各ステップで Devin セッションが従う。モデル指定は書かない
- **定型作業の手順**: [`.cursor/commands/`](./.cursor/commands/)（`self-review`, `feedback-review`, `verify-ci`, `release-app`）。Devin には「`.cursor/commands/self-review.md` に従って」のようにファイルで指示する
- **ルールファイル**: [`.cursor/rules/*.mdc`](./.cursor/rules/)（グローバルルールは `alwaysApply: true`）。Devin CLI と Devin Review も読む
- **環境**: Devin の環境（blueprint）は Devin 側の設定で管理し、リポジトリには置かない。依存セットアップは blueprint から [`scripts/cloud-agent-install.sh`](./scripts/cloud-agent-install.sh) を呼ぶ前提

## Do / Don't

### Do（必ず行うこと）

- **ブランチで作業**: master ブランチでの直接作業は禁止（Devin はブランチ、人手のローカルは git worktree）
- **テスト実行**: `pnpm test` と `pnpm typecheck` で通過を確認する
- **Lint 実行**: コミット前に `pnpm exec vp lint` でエラーを解消する
- **PR 前検証**: Workflow の Verify（実装セッション）と Review（別の新しい Devin セッション）を実行する
- **バージョン管理**: `pnpm run release` フローに従う
- **i18n キー管理**: 全ロケール（en, es, id, ja, ko, pt_BR, zh_CN, zh_TW）でキー定義
- **zip 同期**: リリース zip の変更は `.github/workflows/publish.yml` にも反映
- **GitHub 操作**: Devin は組み込みの GitHub 連携（PR 作成・コメント・CI 確認）、それ以外は `gh` CLI を使う
- **ドキュメント更新**: コード変更に合わせて関連ドキュメント（ARCHITECTURE.md、DESIGN.md、AGENTS.md など）も必ず更新する

### Don't（禁止・注意事項）

- **勝手に権限追加**: `storage` / `activeTab` 以外の権限追加は慎重に
- **マッチパターン拡張**: `*://*.youtube.com/*` を維持
- **manifest.json 手動変更**: `version` は `pnpm run release` で管理
- **PAT / ブラウザでの GitHub 操作**: しない（Devin の GitHub 連携か `gh` CLI を使う）
- **停止中の Bugbot 起動**: `bugbot run` / `cursor review` を PR に書かない（例外は kyto 本人が手動で `bugbot run` する場合だけ）
- **モデル指定**: ルールや手順書に特定モデル名（旧 `grok-*` / `composer-*` など）を書かない
- **description 省略不可**: i18n キーには `message` と `description` を必須
- **E2E テスト無視**: 主要ユーザーストーリーは e2e でカバー
- **ドキュメント更新の怠り**: コード変更時にドキュメントも更新する（実装とドキュメントの乖離を防ぐ）

## Code Review Rules

PR 作成前のレビューは Workflow の **Review**（実装とは別の新しい Devin セッション、[`.cursor/agents/reviewer.md`](./.cursor/agents/reviewer.md)、base との `git diff`）が正。指摘を直してから PR を出す。

- Codex のレビューを使う: PR オープン時の自動レビューと、必要に応じた `@codex review` コメントの手動依頼の両方。Codex の指摘を検討したうえで CI とマージ基準に従う
- Bugbot は停止中。エージェントは `bugbot run` / `cursor review` を書かない。例外は kyto 本人が手動で `bugbot run` する場合だけ
- Dependabot の PR はレビューセッションの対象外。patch / minor は CI のみで auto-merge、major は下記「Dependabot 自動化」

### マージ基準

迷ったら重い扱いにする。

- **軽い PR**（CI 成功でセルフマージ）: docs、typo、小さな修正、設定
- **重い PR**（CI 成功 + kyto の承認）: 約 100 行を超えるロジック変更、セキュリティ・権限・データ・ビルド・リリース・CI に関わる変更、publish 直前の変更
- **致命的な PR**（必ず kyto の承認）: データ損失の恐れ、セキュリティ / 認証 / secret、リリース・デプロイ・リポジトリ設定、破壊的変更・major 依存更新、不可逆な操作

### レビューコメントの言語
- PR 上のレビュー指摘・提案・説明・要約はすべて日本語で書くこと。
- コード識別子・コマンド・ファイルパス・エラー原文・API 名はそのまま残すこと。

## リリース手順

詳細は [`docs/release.md`](./docs/release.md) を参照。

1. 未コミットがないことを確認
2. `pnpm test` で全テスト通過を確認
3. `pnpm run release` でバージョンバンプ、CHANGELOG 更新、コミット、タグ作成
4. `git push --follow-tags origin master` で push
5. GitHub Actions で公開処理が自動実行

### Dependabot 自動化 / 日次リリース

詳細（ワークフロー、判定スクリプト、シークレット、必須チェック一覧）は [`docs/release.md`](./docs/release.md)。

- **patch / minor**: [`dependabot-auto-merge.yml`](./.github/workflows/dependabot-auto-merge.yml) が承認し GitHub auto-merge（squash）。必須チェックは ruleset `master-ci` の required status checks 8 本。semver major の除外は [`scripts/dependabot-merge.mjs`](./scripts/dependabot-merge.mjs) が actor `app/dependabot` と `dependabot[bot]` の両方で判定する（major は triage ワークフローが hold）
- **major**: ワークフローでは自動マージしない（ラベル `needs-ai-review` / `dependency-major`）。月・木の見回りでリスク評価し、低リスクはメンテ bot がマージ、リスクがあるものだけ kyto にエスカレーション。`kyto64` へのレビュー依頼はしない
- **日次パッチリリース**: 最大 1 日 1 回（UTC 15:00）。`master` への push は GitHub App `youtublur-release-bot` のトークンで行う。代替経路は legacy の `RELEASE_PUSH_TOKEN`、どちらも無ければ `GITHUB_TOKEN` で push し、タグ後に `dispatch-publish` ジョブが `publish.yml` を `workflow_dispatch` で起動する
- **手動対応**: リスクありの major、CI が失敗する更新、既存テストがカバーしない変更

## 主なパス

| 用途 | パス |
|------|------|
| コンテンツロジック | [`src/content.ts`](./src/content.ts), [`content.test.js`](./content.test.js) |
| ポップアップ UI | [`popup.html`](./popup.html), [`src/popup.ts`](./src/popup.ts), [`src/popup-color.ts`](./src/popup-color.ts), [`popup.test.js`](./popup.test.js), [`solid-color.test.js`](./solid-color.test.js) |
| キーボードショートカット | [`manifest.json`](./manifest.json) の `commands`。決定は [`src/shortcut-actions.ts`](./src/shortcut-actions.ts)、配信は [`src/background.ts`](./src/background.ts)（読み取りから保存まで直列）、ポップアップ表示は [`src/popup-shortcuts.ts`](./src/popup-shortcuts.ts)。テストは [`shortcuts.test.js`](./shortcuts.test.js) と [`e2e/shortcuts.spec.js`](./e2e/shortcuts.spec.js)。既定は Alt+Shift+Y（モード切替）、Alt+Shift+Period / Comma（ブラー強度 ±4px）、Alt+Shift+U（ポップアップ）。再読み込みは未割り当て |
| 初回案内・レビュー促しのバッジ | [`src/onboarding.ts`](./src/onboarding.ts)（`onInstalled` の `install` だけでウェルカムページを 1 回開く。バッジの付け外し）, [`welcome.html`](./welcome.html), [`src/welcome.ts`](./src/welcome.ts), [`onboarding.test.js`](./onboarding.test.js) |
| レビュー促し（ポップアップ） | [`src/review-nudge.ts`](./src/review-nudge.ts), [`review-nudge.test.js`](./review-nudge.test.js)。起点はインストール日（無ければ初回ポップアップ）。表示は 1 回きり。読めないときは非表示。選択は保存できたときだけ閉じ、「レビューを書く」もそのときだけストアを開く |
| ストレージユーティリティ | [`src/storage-mode.ts`](./src/storage-mode.ts)（モード、ブラー強度の既定 40px、単色 `playerSolidColor`。色が未設定ならテーマ色のまま） |
| 型定義（拡張グローバル / `BackgroundMode`） | [`globals.d.ts`](./globals.d.ts) |
| TS 設定 | [`tsconfig.json`](./tsconfig.json) |
| コンパイル成果物（編集禁止） | `content.js`, `popup.js`, `popup-color.js`, `popup-shortcuts.js`, `storage-mode.js`, `shortcut-actions.js`, `background.js`, `review-nudge.js`, `onboarding.js`, `welcome.js`（manifest / popup / welcome 参照先） |
| スタイル | [`style.css`](./style.css) |
| マニフェスト | [`manifest.json`](./manifest.json) |
| 文言（i18n） | [`_locales/*/messages.json`](./_locales/)（基準は [`en`](./_locales/en/messages.json)） |
| E2E テスト | [`e2e/`](./e2e/) |
| AI 検証ハーネス | [`e2e/ai-verify/`](./e2e/ai-verify/)（`pnpm run verify:ai-blur`、ブラー描画の証跡採取） |
| 補助スクリプト | [`scripts/`](./scripts/)（sync-version, publish, refresh-token, dependabot-merge, should-patch-release, cloud-agent-install） |
| エージェントハーネス | [`AGENTS.md`](./AGENTS.md)、[`.cursor/agents/`](./.cursor/agents/)、[`.cursor/commands/`](./.cursor/commands/)、[`scripts/cloud-agent-install.sh`](./scripts/cloud-agent-install.sh)（Devin の blueprint から呼ぶ）。説明は [docs/development.md](./docs/development.md) |
| CI/CD | [`.github/workflows/publish.yml`](./.github/workflows/publish.yml) |

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
