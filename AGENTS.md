# Agent 向けメモ（youtublur）

Chrome 拡張（Manifest V3）。YouTube 視聴ページでプレイヤー背景を単色またはブラー表示に切り替える。

## 主要パス

| 用途 | パス |
|------|------|
| コンテンツロジック | `content.js`, `content.test.js` |
| ポップアップ UI | `popup.html`, `popup.js`, `popup.test.js` |
| スタイル | `style.css` |
| マニフェスト | `manifest.json` |
| 文言（i18n） | `_locales/*/messages.json`（基準は `en`） |
| CI に含める zip の定義 | [.github/workflows/publish.yml](.github/workflows/publish.yml) |

## 開発コマンド

- テスト: `npm test`（Vite+ / `vp test`）
- Lint: `vp lint`

## リリース

手順は [docs/release.md](docs/release.md)。要約: 未コミットを残さない → `npm test` → `npm run release` → `git push --follow-tags origin master` → Actions 確認。

## Cursor

- スラッシュコマンド: `.cursor/commands/`（例: `/release-app`, `/verify-ci`, `/locale-sync`, `/update-docs`）
- ルール: `.cursor/rules/*.mdc`
