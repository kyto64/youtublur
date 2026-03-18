# youtublur

YouTubeを、もっと目に優しく。動画のブラー背景でやわらかな視聴体験を提供するChrome拡張機能です。

## 機能

- **プレイヤー背景**: 2つのモードから選択可能
  - **単色**: 動画プレイヤー周辺の余白を白〜薄いグレー（#f1f1f1）に変更
  - **ブラー**: 再生中の動画をぼかして背景に表示（目に優しい）

## インストール方法

1. このリポジトリをダウンロードまたはクローンする
2. 依存関係のインストール: `npm ci`
3. Chromeで `chrome://extensions/` を開く
4. 右上の「デベロッパーモード」をONにする
5. 「パッケージ化されていない拡張機能を読み込む」をクリック
6. このプロジェクトのフォルダを選択する

## ファイル構成

```
youtublur/
├── .github/workflows/ # CI設定（テスト・Lint）
├── manifest.json      # 拡張機能の設定
├── package.json       # プロジェクト設定・スクリプト
├── vite.config.ts     # Vite+ (テスト用) 設定
├── style.css          # YouTube用のスタイル定義
├── content.js         # プレイヤー検出・ブラー描画
├── content.test.js    # content.jsのテスト
├── popup.html         # モード切替UI
├── popup.js           # 設定保存
├── popup.test.js      # popup.jsのテスト
├── icons/             # アイコン画像
└── README.md          # このファイル
```

## 使い方

拡張機能アイコンをクリックし、「単色」または「ブラー」を選択してください。設定は自動保存され、複数デバイス間で同期されます。

## 開発とテスト

本プロジェクトは **Vite+** を用いてテスト・Lintを行っています。
- **テストの実行**: `npm test` または `vp test`
- **Lintの実行**: `vp lint`

また、`master` ブランチへのプッシュやPR作成時に、GitHub Actions（CI）によって自動的にテストとLintが実行されます。

## 対応ブラウザ

- Google Chrome（Manifest V3対応）

## バージョン

- **1.1** - テスト基盤（Vitest / Vite+）の導入とコードのリファクタリング
- **1.0** - youtublurとしてリリース
