# Agent 向けメモ（youtublur）

ブラウザ拡張（Manifest V3、Chrome / Firefox）。YouTube 視聴ページでプレイヤー背景を単色またはブラー表示に切り替える。

## 主要パス

| 用途 | パス |
|------|------|
| コンテンツロジック | `content.js`, `content.test.js` |
| ポップアップ UI | `popup.html`, `popup.js`, `popup.test.js` |
| スタイル | `style.css` |
| マニフェスト | `manifest.json` |
| 文言（i18n） | `_locales/*/messages.json`（基準は `en`） |
| 補助スクリプト | `scripts/`（`sync-version.js`, `publish-chrome-webstore.mjs`, `sync-chrome-refresh-token.mjs`） |
| CI に含める zip の定義 | [.github/workflows/publish.yml](.github/workflows/publish.yml) |

## 開発コマンド

- テスト: `npm test`（Vite+ / `vp test`）
- Lint: `vp lint`

## リリース

手順は [docs/release.md](docs/release.md)。要約: 未コミットを残さない → `npm test` → `npm run release` → `git push --follow-tags origin master` → Actions 確認（GitHub Release に `extension.zip` / `extension-firefox.zip`、CWS 自動公開。Firefox AMO は変数 `AMO_PUBLISH=true` とシークレット設定時に同ワークフローで自動アップロード、未設定なら手動。詳細は同ドキュメントの「5. Firefox（AMO）」）。Dependabot の patch/minor は自動マージのみ。パッチバージョンの自動リリースは **最大 1 日 1 回のスケジュール**（または手動 dispatch）（同ドキュメントの「Dependabot」節）。

## Cursor

- スラッシュコマンド: `.cursor/commands/`（例: `/release-app`, `/verify-ci`, `/locale-sync`, `/update-docs`）
- ルール: `.cursor/rules/*.mdc`

## Access to Github

Use gh cli to access to github instead of rest api or personal token or opening the browser.
