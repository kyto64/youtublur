# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.7.0](https://github.com/kyto64/youtublur/compare/v1.6.1...v1.7.0) (2026-04-11)


### Features

* enhance blur functionality for Gecko layout engine ([55deca1](https://github.com/kyto64/youtublur/commit/55deca129fada81fe6dda5ad27bc34c8a7dafd8a))

## [1.6.1](https://github.com/kyto64/youtublur/compare/v1.6.0...v1.6.1) (2026-04-11)


### Bug Fixes

* **ci:** use scalar files input for action-gh-release ([c31e5a9](https://github.com/kyto64/youtublur/commit/c31e5a9aa3e36d8682c105f60c49ecd5279ab316))

## [1.6.0](https://github.com/kyto64/youtublur/compare/v1.5.0...v1.6.0) (2026-04-11)


### Features

* add localized descriptions for YouTube viewing extension in multiple languages ([903ce25](https://github.com/kyto64/youtublur/commit/903ce25a9a2fb8ba4f8a47cbb9d3f77d913ab23b))

## [1.5.0](https://github.com/kyto64/youtublur/compare/v1.4.0...v1.5.0) (2026-04-10)


### Features

* add extension i18n (en, ja, ko, zh_CN, zh_TW, es, pt_BR, id) ([09c9ff3](https://github.com/kyto64/youtublur/commit/09c9ff35a3734ae7126a576328f5bb6d14db138e))


### Bug Fixes

* eager blur init and backoff retry for first-load failures ([4ef1947](https://github.com/kyto64/youtublur/commit/4ef19479ef6e029a034f93dfbccf8c06ecd696e8))

## [1.4.0](https://github.com/kyto64/youtublur/compare/v1.3.0...v1.4.0) (2026-03-28)


### Features

* add Chrome Web Store upload script and update dependencies ([0e04c0f](https://github.com/kyto64/youtublur/commit/0e04c0fda3fc99abd590c795b4d79187be82cd5b))

## [1.3.0](https://github.com/kyto64/youtublur/compare/v1.2.6...v1.3.0) (2026-03-27)


### Features

* enhance player page handling with navigation hooks and blur teardown ([c7cf333](https://github.com/kyto64/youtublur/commit/c7cf33335737144d8c6835196d4e5ed2383f29e9))
* implement resize observer for blur canvas and improve resizing logic ([4b3d6fc](https://github.com/kyto64/youtublur/commit/4b3d6fcc887bc9ca8670d39cf77cd88cce465625))


### Bug Fixes

* reorder background mode options in popup.html ([0067f69](https://github.com/kyto64/youtublur/commit/0067f6948229c8df583d05f94bff31161fec1c89))

## [1.2.6](https://github.com/kyto64/youtublur/compare/v1.2.5...v1.2.6) (2026-03-25)


### Bug Fixes

* apply blur on load when video mounts after player ([34b40b3](https://github.com/kyto64/youtublur/commit/34b40b310a9e767d79a1633b71eaf56d075e271f))

## [1.2.5](https://github.com/kyto64/youtublur/compare/v1.2.4...v1.2.5) (2026-03-25)

## [1.2.4](https://github.com/kyto64/youtublur/compare/v1.2.3...v1.2.4) (2026-03-24)


### Features

* change default background mode to blur ([fcfcc48](https://github.com/kyto64/youtublur/commit/fcfcc48a4f54651f441b1fb2931ca69174664e67))

## [1.2.3](https://github.com/kyto64/youtublur/compare/v1.2.2...v1.2.3) (2026-03-24)

## [1.2.2](https://github.com/kyto64/youtublur/compare/v1.2.1...v1.2.2) (2026-03-22)


### Bug Fixes

* PRレビュー対応 — 背景色パースと screen 合成 ([2292433](https://github.com/kyto64/youtublur/commit/2292433198d1865638e6c1565c66cd15528cade0))
* 黒いエリアが見える不具合を修正 ([9f10060](https://github.com/kyto64/youtublur/commit/9f10060532d2e12ac8404eba06b2cd401d780481))

## [1.2.1](https://github.com/kyto64/youtublur/compare/v1.2.0...v1.2.1) (2026-03-22)


### Bug Fixes

* grant contents write permission for GitHub Release ([5a4a057](https://github.com/kyto64/youtublur/commit/5a4a0570a601e57d68e522b7492ed95e610c5720))

## 1.2.0 (2026-03-22)

### 🚀 Features & Enhancements
* **CI/CD Automation:** GitHub Actions CI環境の構築とVite+によるテスト環境の追加 ([919a45b](https://github.com/kyto64/youtublur/commit/919a45b7f2c72ee337ffc17492b106512700ab5a))
* **Release Pipeline:** 自動リリース用ワークフローの構築。Gitタグ作成時の各種チェック・アーカイブ作成と拡張機能のバージョン自動同期処理を追加 ([20c7da2](https://github.com/kyto64/youtublur/commit/20c7da2480b92022e986d536f85bcd3e08d83b49))
* **Changelog Generation:** `npm run release` コマンドにより履歴から自動でChangelogを生成・管理する仕組みを導入 ([8c0c31d](https://github.com/kyto64/youtublur/commit/8c0c31d1e19d28f00cac5665ffe158d4a3a073cf))

---

## 1.1.0 (2026-03-18)

### 🌟 Features & Enhancements
* GitHub Actions CI および Vite+ によるテスト環境の導入
* Chrome Web Store 自動公開用ワークフローの構築とREADMEの更新

---

## 1.0.0 (2026-03-01)

### 🎉 Initial Release
* YouTube動画の背景にやわらかいブラー効果を追加する機能の初期実装
* アイコンの追加およびChrome Web Storeへの初回リリース
