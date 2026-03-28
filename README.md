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
├── .github/workflows/ # CI（テスト・Lint・タグ公開時のCWSアップロード）
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

## GitHub Actions でのストア公開とシークレット

`v*` 形式のタグ（例: `v1.4.0`）を push すると、[Publish to Chrome Web Store](.github/workflows/publish.yml) が実行され、拡張の zip をアップロードして公開します。

リポジトリに次の **Actions 用シークレット** を設定してください。

| シークレット名 | 内容 |
|----------------|------|
| `CHROME_EXTENSION_ID` | [デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole/) で対象拡張を開いたときの URL 末尾などに表示される ID |
| `CHROME_CLIENT_ID` | Google Cloud の OAuth 2.0 クライアント ID |
| `CHROME_CLIENT_SECRET` | 上記クライアントのクライアントシークレット |
| `CHROME_REFRESH_TOKEN` | 下記「再発行」手順で取得するリフレッシュトークン |

### リフレッシュトークンの再発行

CI ログに `invalid_grant` や `Token has been expired or revoked` と出たときは、保存しているリフレッシュトークンが無効になっています。次の手順で新しいトークンを取得し、GitHub の **`CHROME_REFRESH_TOKEN`** を更新してください（OAuth クライアントを作り直した場合は **`CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`** も同じクライアントの値に揃えてください）。

1. **前提（Google の要件）**  
   - ストア用の Google アカウントで [2 段階認証](https://support.google.com/accounts/answer/185839) を有効にする。  
   - [Google Cloud Console](https://console.cloud.google.com/) で対象プロジェクトを開き、[Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) を有効にする。  
   - **OAuth 同意画面**を設定する。外部利用で審査前の場合は、**テストユーザー**に自分の Google アカウントを追加する。

2. **OAuth クライアント（未作成または作り直す場合）**  
   - APIs とサービス → 認証情報 → 「OAuth クライアント ID を作成」。  
   - アプリケーションの種類は **ウェブアプリケーション**。  
   - 承認済みのリダイレクト URI に **`https://developers.google.com/oauthplayground`** を追加する（[公式ガイド](https://developer.chrome.com/docs/webstore/using-api) と同じ設定）。

3. **[OAuth 2.0 Playground](https://developers.google.com/oauthplayground) でトークンを取得**  
   - 右上の歯車アイコン → **Use your own OAuth credentials** をオンにし、Client ID と Client Secret を入力する。  
   - 「入力する独自のスコープ」に `https://www.googleapis.com/auth/chromewebstore` を入力する。  
   - **Authorize APIs** をクリックし、**Chrome Web Store 上でその拡張を所有している Google アカウント**でログインする。  
   - **Exchange authorization code for tokens** を実行し、表示されたレスポンスの **Refresh token** をコピーする。

4. **GitHub に反映**  
   - リポジトリの **Settings → Secrets and variables → Actions** で `CHROME_REFRESH_TOKEN` を更新する。  
   - 手順 2 でクライアントを新しくした場合は `CHROME_CLIENT_ID` と `CHROME_CLIENT_SECRET` も更新する。

5. **確認**  
   - 新しい `v*` タグを push するか、失敗した **Publish to Chrome Web Store** ワークフローを再実行する。

サービスアカウントでの認証を検討する場合は、[Use a service account with the Chrome Web Store API](https://developer.chrome.com/docs/webstore/service-accounts) を参照してください。

## 対応ブラウザ

- Google Chrome（Manifest V3対応）

## バージョン

- **1.1** - テスト基盤（Vitest / Vite+）の導入とコードのリファクタリング
- **1.0** - youtublurとしてリリース
