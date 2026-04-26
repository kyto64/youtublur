# Agent 向けメモ（youtublur）

YouTube 視聴ページのプレイヤー背景を、単色またはブラー表示に切り替えるブラウザ拡張（Chrome / Firefox、Manifest V3）。

## 技術スタック

| 項目 | 詳細 |
|------|------|
| 言語 | JavaScript（ES modules 不使用、グローバルスコープ） |
| ユニットテスト | Vite+（[`vp test`](package.json:7)）+ jsdom |
| E2E テスト | Playwright（[`pnpm run test:e2e`](package.json:8)） |
| Lint | `vp lint` |
| パッケージ管理 | pnpm（`packageManager` フィールド固定） |
| 対応ブラウザ | Chrome（Manifest V3）/ Firefox（`browser_specific_settings.gecko`） |

## コンテキスト優先順位

コード変更前に、以下を**順に**確認すること。

| 順位 | ファイル | 確認すべき理由 |
|------|----------|----------------|
| 1 | [`manifest.json`](manifest.json:1) | 権限、マッチパターン、バージョン、ブラウザ別設定の正確性 |
| 2 | [`.cursor/rules/chrome-extension.mdc`](.cursor/rules/chrome-extension.mdc:1) | MV3 制約、リリース zip 整合性、バージョン管理ルール |
| 3 | [`.cursor/rules/locales.mdc`](.cursor/rules/locales.mdc:1) | i18n キー追加・更新ルール |
| 4 | [`content.js`](content.js:1) / [`popup.js`](popup.js:1) | 主要ビジネスロジックと既存実装の整合性 |
| 5 | [`docs/release.md`](docs/release.md:1) | リリース手順、Dependabot 自動化、Secrets 設定の詳細 |

## Do（必ず行うこと）

- **テストを実行する**: コード変更後は必ず `pnpm test` を実行し、すべて通過すること。失敗したらマージ・リリースしない。
- **Lint を実行する**: コミット前に `vp lint` を実行し、警告・エラーを解消すること。
- **バージョン管理に従う**: [`manifest.json`](manifest.json:16) の `version` は手動で書き換えず、[`scripts/sync-version.js`](scripts/sync-version.js:1) を介した `pnpm run release` フローに任せること。
- **i18n キーを完全に追加する**: 新しい UI 文字列は、**まず** [`_locales/en/messages.json`](_locales/en/messages.json:1) に追加し、**すべてのロケール**（`es`, `id`, `ja`, `ko`, `pt_BR`, `zh_CN`, `zh_TW`）で同じキーを定義すること。各キーには `message` と `description` を含めること。
- **リリース zip を同期する**: zip に含まれるファイルを変更・追加したら、[`.github/workflows/publish.yml`](.github/workflows/publish.yml:38) の `zip` コマンドも更新すること。
- **GitHub 操作は CLI を使う**: GitHub への操作は必ず `gh` CLI を使用すること。

## Don't（禁止・注意事項）

- **権限を勝手に追加しない**: `storage` / `activeTab` 以外の権限を追加すると、Chrome Web Store / AMO の審査に影響する。必要な場合はユーザーへの説明を添えること。
- **マッチパターンを広げない**: YouTube 向けの `*://*.youtube.com/*` を維持し、不要な広いマッチを追加しないこと。
- **`manifest.json` のバージョンを手動変更しない**: `version` フィールドは `pnpm run release` フロー以外で書き換えないこと。
- **GitHub を REST API / PAT / ブラウザで操作しない**: `gh` CLI を使用すること。REST API、Personal Access Token、ブラウザ操作は禁止。
- **`description` を省略しない**: ロケールファイルの各キーは、翻訳者・開発者向けコンテキストのため `description` を必ず含めること。
- **E2E テストを無視しない**: SPA 遷移・ショート・ブラー状態など、主要ユーザーストーリーは [`e2e/`](e2e/) でカバーされている。変更後は `pnpm run test:e2e` も実行すること。

## 主要パス

| 用途 | パス |
|------|------|
| コンテンツロジック | [`content.js`](content.js:1), [`content.test.js`](content.test.js:1) |
| ポップアップ UI | [`popup.html`](popup.html:1), [`popup.js`](popup.js:1), [`popup.test.js`](popup.test.js:1) |
| スタイル | [`style.css`](style.css:1) |
| マニフェスト | [`manifest.json`](manifest.json:1) |
| 文言（i18n） | [`_locales/*/messages.json`](_locales/)（基準は [`en`](_locales/en/messages.json:1)） |
| E2E テスト | [`e2e/`](e2e/) |
| 補助スクリプト | [`scripts/`](scripts/)（[`sync-version.js`](scripts/sync-version.js:1), [`publish-chrome-webstore.mjs`](scripts/publish-chrome-webstore.mjs:1), [`sync-chrome-refresh-token.mjs`](scripts/sync-chrome-refresh-token.mjs:1)） |
| CI zip 定義 | [`.github/workflows/publish.yml`](.github/workflows/publish.yml:1) |

## 開発ワークフロー

| 作業 | コマンド |
|------|----------|
| ユニットテスト | `pnpm test` |
| E2E テスト | `pnpm run test:e2e` |
| Lint | `vp lint` |
| リリース | `pnpm run release` → `git push --follow-tags origin master` |

## リリース

詳細は [`docs/release.md`](docs/release.md:1) を参照。概要:

1. 未コミットがないことを確認する。
2. `pnpm test` を実行し、すべて通過すること。
3. `pnpm run release` でバージョンバンプ、CHANGELOG 更新、コミット、タグ作成を自動実行する。
4. `git push --follow-tags origin master` で push する。
5. GitHub Actions の `publish.yml` が自動トリガーされ、GitHub Release 作成・Chrome Web Store 公開・（設定時）Firefox AMO アップロードが行われる。

### Dependabot 自動化

- **patch / minor**: CI 合格後に自動マージされる。
- **自動パッチリリース**: 最大 1 日 1 回（UTC 15:00 の cron、または手動 `workflow_dispatch`）。
- **major**: ラベル `semver-major` が付き、手動レビュー・マージが必要。

## Cursor 固有設定

- **スラッシュコマンド**: [`.cursor/commands/`](.cursor/commands/)（例: `/release-app`, `/verify-ci`, `/locale-sync`, `/update-docs`）
- **ルールファイル**: [`.cursor/rules/*.mdc`](.cursor/rules/)

## GitHub アクセス

GitHub へのアクセスは **`gh` CLI** を使用すること。REST API、Personal Access Token、ブラウザ操作は使用しない。
