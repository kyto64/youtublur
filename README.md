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

CI ログに `invalid_grant`（トークン失効）や `unauthorized_client`（クライアントとトークンの組み合わせ不正）などが出たときは、次の手順で **同一 OAuth クライアントの** `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` を揃え直し、GitHub のシークレットを更新してください。

1. **前提（Google の要件）**  
   - ストア用の Google アカウントで [2 段階認証](https://support.google.com/accounts/answer/185839) を有効にする。  
   - [Google Cloud Console](https://console.cloud.google.com/) で対象プロジェクトを開き、[Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) を有効にする。  
   - **OAuth 同意画面**を設定する。外部利用で審査前の場合は、**テストユーザー**に自分の Google アカウントを追加する。

2. **OAuth クライアント（未作成または作り直す場合）**  
   - APIs とサービス → 認証情報 → 「OAuth クライアント ID を作成」。  
   - アプリケーションの種類は **ウェブアプリケーション**（**デスクトップ**のままでは `127.0.0.1` へのリダイレクトが期待どおり動かないことが多い）。  
   - **承認済みのリダイレクト URI** に、使う URI を **1 つ以上**登録する（認可 URL・`curl` の `redirect_uri` と **文字列が完全一致**）。  
     - **推奨:** `https://developers.google.com/oauthplayground`（[公式手順](https://developer.chrome.com/docs/webstore/using-api) と同じ。同意後もブラウザが止まりにくい）  
     - **代替:** `http://127.0.0.1:53682/`（末尾スラッシュまで含め GCP と同一にする。`.env` の `CHROME_REDIRECT_URI` も同じ文字列にする）

3. **ブラウザで認可コードを取得**  
   - 下の URL の `CLIENT_ID` を自分のクライアント ID に差し替えて開く。`redirect_uri` は GCP に登録したものと同じにする（Playground 利用時は下記のまま）。  
   - **Chrome Web Store 上でその拡張を所有している Google アカウント**でログインし、同意する。  
   - リダイレクト後、**アドレスバーに表示された URL** の `code=` の値をコピーする（Playground に戻る場合はその URL でよい。`%2F` などはそのまま。有効期限が短いのですぐ次へ）。

**リダイレクトされない・Continue のあと止まるとき**  
- クライアント種類が **デスクトップ**になっていないか確認する。**ウェブアプリケーション**を新規作成し、上記リダイレクト URI を登録した ID/Secret を `.env` に使う。  
- GCP の **承認済みリダイレクト URI** と、認可 URL の `redirect_uri` が **1 文字たりとも違わないか**（`http` / `https`、末尾 `/`、Playground のスペル）。  
- **OAuth 同意画面**が「テスト中」のとき、ログイン中の Google アカウントが **テストユーザー**に含まれているか。  
- 拡張機能や広告ブロックを切った **シークレットウィンドウ**で試す。

Playground を `redirect_uri` に使う例（`CLIENT_ID` のみ差し替え）:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=https%3A%2F%2Fdevelopers.google.com%2Foauthplayground&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fchromewebstore&access_type=offline&prompt=consent
```

ループバックを使う場合の例:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2F&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fchromewebstore&access_type=offline&prompt=consent
```

4. **`curl` でリフレッシュトークンを取得**  
   - `CODE` … 手順 3 の `code`（URL デコード不要。`curl` の `--data-urlencode` にそのまま渡す）  
   - `CLIENT_ID` / `CLIENT_SECRET` … 手順 2 のクライアント  
   - `redirect_uri` … GCP に登録した URI と **同じ文字列**（Playground なら `https://developers.google.com/oauthplayground`、ループバックなら例: `http://127.0.0.1:53682/`）

   ```bash
   curl -s -X POST "https://oauth2.googleapis.com/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data-urlencode "code=CODE" \
     --data-urlencode "client_id=CLIENT_ID" \
     --data-urlencode "client_secret=CLIENT_SECRET" \
     --data-urlencode "redirect_uri=https://developers.google.com/oauthplayground" \
     --data-urlencode "grant_type=authorization_code"
   ```

   - 返ってきた JSON の `refresh_token` を GitHub の `CHROME_REFRESH_TOKEN` に設定する。末尾に ` | jq -r .refresh_token` を付ければトークンだけ表示できる。  
   - トークンエンドポイントが **`unauthorized_client`** を返すときは、`client_id` / `client_secret` / `redirect_uri` が GCP の設定と一致しているか、認可 URL の `redirect_uri` と同じかを確認する。  
   - **`refresh_token` が JSON に含まれない**ときは、手順 3 の URL に `prompt=consent` があるか確認する。既に同意済みの場合は [連携済みアプリ](https://myaccount.google.com/permissions) から該当アプリを削除してから手順 3 からやり直す。

5. **GitHub に反映**  
   - リポジトリの **Settings → Secrets and variables → Actions** で `CHROME_REFRESH_TOKEN` を更新する。  
   - 手順 2 でクライアントを新しくした場合は `CHROME_CLIENT_ID` と `CHROME_CLIENT_SECRET` も **同じクライアントの値**に更新する。

6. **確認**  
   - 新しい `v*` タグを push するか、失敗した **Publish to Chrome Web Store** ワークフローを再実行する。

### 補助: `.env` と `gh` でリフレッシュトークンを登録

`.env` に `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` を書き（`CHROME_REDIRECT_URI` は任意。**未指定時は `https://developers.google.com/oauthplayground`**。ループバックを使うときだけ `CHROME_REDIRECT_URI=http://127.0.0.1:53682/` などを明示）、[`scripts/sync-chrome-refresh-token.mjs`](scripts/sync-chrome-refresh-token.mjs) で認可 URL の表示と `gh secret set CHROME_REFRESH_TOKEN` まで行える。GCP のウェブクライアントに、使う `redirect_uri` と **同一の**承認済み URI を登録しておく（`gh` はリポジトリへの書き込み権限でログイン）。

```bash
node scripts/sync-chrome-refresh-token.mjs
AUTH_CODE='ブラウザのリダイレクトURLからコピーしたcode' node scripts/sync-chrome-refresh-token.mjs
```

ブラウザだけで完結させる場合は [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)（自前クライアント＋`chromewebstore` スコープ）も利用できる。サービスアカウントは [Use a service account with the Chrome Web Store API](https://developer.chrome.com/docs/webstore/service-accounts) を参照。

## 対応ブラウザ

- Google Chrome（Manifest V3対応）

## バージョン

- **1.1** - テスト基盤（Vitest / Vite+）の導入とコードのリファクタリング
- **1.0** - youtublurとしてリリース
