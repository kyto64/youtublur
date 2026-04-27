# Agent 向けメモ（youtublur）

YouTube 視聴ページのプレイヤー背景を単色/ブラー表示に切り替えるブラウザ拡張（Chrome/Firefox、Manifest V3）。

## 技術スタック

| 項目 | 詳細 |
|------|------|
| 言語 | JavaScript（ES modules 不使用、グローバルスコープ） |
| テスト | Vite+ (vp test) + jsdom / Playwright E2E |
| Lint | vp lint |
| パッケージ管理 | pnpm（packageManager フィールド固定） |

## 基本ルール

- テスト実行: コード変更後は必ず `pnpm test`
- Lint 実行: コミット前に `vp lint`
- バージョン管理: `manifest.json` のバージョンは手動変更せず `pnpm run release` を使用
- GitHub 操作: 必ず `gh` CLI を使用（REST API/PAT/ブラウザ操作は禁止）
- i18n: 新しい UI 文字列はまず `en` に追加し、全ロケールで同じキーを定義

## 詳細ルール

各ルールは `.cursor/rules/*.mdc` に分割されている。関連ファイル編集時に自動適用される。

## 開発コマンド

| 作業 | コマンド |
|------|----------|
| ユニットテスト | `pnpm test` |
| E2E テスト | `pnpm run test:e2e` |
| Lint | `vp lint` |
| リリース | `pnpm run release` → `git push --follow-tags origin master` |

## 主要パス

| 用途 | パス |
|------|------|
| コンテンツロジック | content.js, content.test.js |
| ポップアップ UI | popup.html, popup.js, popup.test.js |
| スタイル | style.css |
| マニフェスト | manifest.json |
| 文言（i18n） | _locales/（基準は en） |
| E2E テスト | e2e/ |
| 補助スクリプト | scripts/ |
| CI 定義 | .github/workflows/publish.yml |
