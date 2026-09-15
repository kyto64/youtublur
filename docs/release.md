# リリース手順

## 1. 前提

- `master` ブランチで作業する
- すべての変更がコミット済みであること

---

## 2. Dependabot（自動マージ・自動パッチリリース）

設定は [.github/dependabot.yml](.github/dependabot.yml)。

- **semver major** の PR にはラベル `semver-major` が付き、`kyto64` にレビュー依頼とコメント通知される（自動マージしない）。
- **patch / minor** は [.github/workflows/dependabot-auto-merge.yml](../.github/workflows/dependabot-auto-merge.yml) が承認し、[dependabot-merge-after-checks.yml](../.github/workflows/dependabot-merge-after-checks.yml) が `Test` / `Lint` / `E2E Tests` / `Semgrep` の全成功を確認した後に通常マージ（squash）する。GitHub のリポジトリ Auto-merge 機能は使用しない。
- **自動パッチリリース**は [.github/workflows/dependabot-daily-patch-release.yml](.github/workflows/dependabot-daily-patch-release.yml) が **最大 1 日 1 回**（cron、既定で **UTC 15:00**）だけ実行する。直前の `v*` タグ以降に `package.json` / `pnpm-lock.yaml` の変更がない場合は **スキップ**（その日はリリースコミットを作らない）。同日に Dependabot が複数マージしても、その日の自動実行は高々 1 回の `pnpm run release -- --release-as patch` にまとまる。**すぐにパッチを出したいとき**は GitHub Actions で同ワークフローを **`workflow_dispatch`** 手動実行できる。
- **major PR を手動マージしたあと**のバージョンとタグは従来どおりローカルで `pnpm run release` して push する。

GitHub の仕様として、`GITHUB_TOKEN` による push が原因で起きたイベントでは **別ワークフローは再実行されない**（再帰ループ防止）。そのためデフォルトのトークンだけだと、自動パッチリリースで付いた `v*` タグで [`publish.yml`](.github/workflows/publish.yml) が走らない。Chrome / AMO まで自動で繋げる場合は、リポジトリ Secrets に **`RELEASE_PUSH_TOKEN`**（`contents: write` が付いた classic PAT など）を設定し、[dependabot-daily-patch-release.yml](.github/workflows/dependabot-daily-patch-release.yml) が checkout／push に使うようにする。未設定のときは `github.token` のみでコミットとタグの push は行われるが、公開は **手動でタグを再 push する**など別途トリガーが必要。

### GitHub 側の確認（初回）

| 確認項目 | 場所 | メモ |
|----------|------|------|
| Workflow を書き込み可能にする | **Settings → Actions → General → Workflow permissions** | **Read and write** を選ぶ |
| Actions による PR 承認 | **Settings → Actions → General** | **Allow GitHub Actions to create and approve pull requests** をオン（自動承認・自動マージに必要） |
| 必須チェック | Branch protection / Rulesets | `lint` と `test` を必須にしている場合、その名前が緑になるまで自動マージは待つ |
| `master` への push | Branch protection / Rulesets | `GITHUB_TOKEN` が push を拒否する場合は Rules で GitHub Actions の push を許可する |
| タグ後の `publish.yml` まで自動化 | **Settings → Secrets and variables → Actions** | 任意で Secret `RELEASE_PUSH_TOKEN`。未設定ならタグは付くが `publish.yml` は自動起動しない（上記の通り） |
| 日次 cron の時刻 | [dependabot-daily-patch-release.yml](.github/workflows/dependabot-daily-patch-release.yml) の `cron` | GitHub は **UTC**。変更する場合はこの行を編集する |

---

## 3. Chrome Web Store 用シークレット

`v*` 形式のタグ（例: `v1.4.0`）を push すると、[Publish extensions](.github/workflows/publish.yml) が実行され、GitHub Release に `extension.zip` と `extension-firefox.zip`（同一内容）が添付されたうえで、Chrome Web Store に zip がアップロードされ公開されます。

| シークレット名 | 内容 |
|---------------|------|
| `CHROME_EXTENSION_ID` | [デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole/) で対象拡張を開いたときの URL 末尾などに表示される ID |
| `CHROME_PUBLISHER_ID` | Chrome Web Store の **開発者アカウント ID**（拡張 ID とは別）。[デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole/) にログインしたときの URL に含まれる publisher ID。`chrome-webstore-upload` v6 以降で必須 |
| `CHROME_CLIENT_ID` | Google Cloud の OAuth 2.0 クライアント ID |
| `CHROME_CLIENT_SECRET` | 上記クライアントのクライアントシークレット |
| `CHROME_REFRESH_TOKEN` | 下記「リフレッシュトークンの再発行」手順で取得するリフレッシュトークン |

## 4. Firefox AMO 用シークレット

| 種別 | 名前 | 内容 |
|------|------|------|
| Variable | `AMO_PUBLISH` | `true` のときだけ、タグ時に AMO（listed）へ `extension-firefox.zip` を送る。 |
| Secret | `AMO_ADDON_ID` | AMO のアドオン slug・数値 ID、または UUID。[API キー](https://addons.mozilla.org/developers/addon/api/key/)は同じ開発者ハブから取得。 |
| Secret | `AMO_JWT_ISSUER` | AMO の JWT **issuer**。 |
| Secret | `AMO_JWT_SECRET` | AMO の JWT **secret**。 |

手動提出のみにする場合は `AMO_PUBLISH` を設定しない（または `true` 以外）。

## 5. リフレッシュトークンの再発行

CI ログに `invalid_grant`（トークン失効）や `unauthorized_client`（クライアントとトークンの組み合わせ不正）などが出たときは、次の手順で **同一 OAuth クライアントの** `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` を揃え直し、GitHub のシークレットを更新してください。

### 5.1 前提（Google の要件）

- ストア用の Google アカウントで [2 段階認証](https://support.google.com/accounts/answer/185839) を有効にする。
- [Google Cloud Console](https://console.cloud.google.com/) で対象プロジェクトを開き、[Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api) を有効にする。
- **OAuth 同意画面**を設定する。外部利用で審査前の場合は、**テストユーザー**に自分の Google アカウントを追加する。

### 5.2 OAuth クライアント（未作成または作り直す場合）

- APIs とサービス → 認証情報 → 「OAuth クライアント ID を作成」。
- アプリケーションの種類は **ウェブアプリケーション**（**デスクトップ**のままでは `127.0.0.1` へのリダイレクトが期待どおり動かないことが多い）。
- **承認済みのリダイレクト URI** に、使う URI を **1 つ以上**登録する（認可 URL・`curl` の `redirect_uri` と **文字列が完全一致**）。
  - **推奨:** `https://developers.google.com/oauthplayground`（[公式手順](https://developer.chrome.com/docs/webstore/using-api) と同じ。同意後もブラウザが止まりにくい）
  - **代替:** `http://127.0.0.1:53682/`（末尾スラッシュまで含め GCP と同一にする。`.env` の `CHROME_REDIRECT_URI` も同じ文字列にする）

### 5.3 ブラウザで認可コードを取得

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

### 5.4 `curl` でリフレッシュトークンを取得

- `CODE` … 手順 5.3 の `code`（URL デコード不要。`curl` の `--data-urlencode` にそのまま渡す）
- `CLIENT_ID` / `CLIENT_SECRET` … 手順 5.2 のクライアント
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
- **`refresh_token` が JSON に含まれない**ときは、手順 5.3 の URL に `prompt=consent` があるか確認する。既に同意済みの場合は [連携済みアプリ](https://myaccount.google.com/permissions) から該当アプリを削除してから手順 5.3 からやり直す。

### 5.5 GitHub に反映

- リポジトリの **Settings → Secrets and variables → Actions** で `CHROME_REFRESH_TOKEN` を更新する。
- 手順 5.2 でクライアントを新しくした場合は `CHROME_CLIENT_ID` と `CHROME_CLIENT_SECRET` も **同じクライアントの値**に更新する。

### 5.6 確認

- 新しい `v*` タグを push するか、失敗した **Publish extensions** ワークフローを再実行する。

### 5.7 補助: `.env` と `gh` でリフレッシュトークンを登録

`.env` に `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` を書き（`CHROME_REDIRECT_URI` は任意。**未指定時は `https://developers.google.com/oauthplayground`**。ループバックを使うときだけ `CHROME_REDIRECT_URI=http://127.0.0.1:53682/` などを明示）、[`scripts/sync-chrome-refresh-token.mjs`](scripts/sync-chrome-refresh-token.mjs) で認可 URL の表示と `gh secret set CHROME_REFRESH_TOKEN` まで行える。GCP のウェブクライアントに、使う `redirect_uri` と **同一の**承認済み URI を登録しておく（`gh` はリポジトリへの書き込み権限でログイン）。

```bash
node scripts/sync-chrome-refresh-token.mjs
AUTH_CODE='ブラウザのリダイレクトURLからコピーしたcode' node scripts/sync-chrome-refresh-token.mjs
```

ブラウザだけで完結させる場合は [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)（自前クライアント＋`chromewebstore` スコープ）も利用できる。サービスアカウントは [Use a service account with the Chrome Web Store API](https://developer.chrome.com/docs/webstore/service-accounts) を参照。

---

## 6. テストを実行する

```bash
pnpm test
```

🔴 失敗した場合はリリースを中止し、問題を修正してから再実行する。

---

## 7. リリースコミット＆タグを作成する

通常リリース（Conventional Commits に基づく自動バンプ）:

```bash
pnpm run release
```

バージョンを手動指定する場合:

```bash
pnpm run release -- --release-as 1.2.4
```

このコマンドで以下が自動実行される:

| 処理 | 対象ファイル |
|---|---|
| バージョンバンプ | `package.json`, `pnpm-lock.yaml`, `manifest.json` |
| CHANGELOG 更新 | `CHANGELOG.md` |
| git commit | 上記すべて |
| git tag | `v{version}` |

Chrome と Firefox で `manifest.json` を分けていないため、バージョン同期は引き続き [scripts/sync-version.js](scripts/sync-version.js) が `manifest.json` のみ更新すれば足りる。将来マニフェストを分割する場合は、同スクリプトまたはパッケージ用スクリプトで複数ファイルの `version` を揃える。

---

## 8. GitHub へ push する

```bash
git push --follow-tags origin master
```

---

## 9. CI/CD の完了を確認する

push 後、GitHub Actions の `publish.yml` が自動でトリガーされ、以下が実行される:

1. Lint チェック
2. テスト実行
3. `extension.zip` のビルド（内容は Firefox 用と同一）
4. `extension-firefox.zip` の作成（`extension.zip` と同一内容。AMO 提出用のファイル名として区別しやすくするため）
5. GitHub Release の作成（上記 2 つの zip を添付）
6. Chrome Web Store への公開（`extension.zip` のみ使用）
7. **（任意）** Firefox AMO への **listed** 版として `extension-firefox.zip` をアップロード（下記「AMO 自動アップロード」を有効にした場合のみ）

👉 [GitHub Actions](https://github.com/kyto64/youtublur/actions) でステータスを確認する。

### 公開のみやり直す（`workflow_dispatch`）

タグの push 後に Chrome / AMO の公開だけ失敗した場合、修正を `master` にマージしたうえで次を実行できる。

1. **Settings → Secrets** に `CHROME_PUBLISHER_ID` など不足シークレットを設定する。
2. [Actions → Publish extensions](https://github.com/kyto64/youtublur/actions/workflows/publish.yml) を開き **Run workflow** を選ぶ。
3. **tag** に再公開したいタグ（例: `v1.12.5`）を入力して実行する。

ワークフロー定義は **default ブランチ上の最新** が使われ、拡張のビルドと publish スクリプトは **master の HEAD** から行う（タグ時点の古い publish スクリプトを避けるため）。GitHub Release の更新先だけ **tag** 入力で指定する。

---

## 10. Firefox（AMO）

### 10.1 AMO 自動アップロード（GitHub Actions）

リポジトリの **Settings → Secrets and variables → Actions** で次を設定する。

| 種別 | 名前 | 内容 |
|------|------|------|
| Variable | `AMO_PUBLISH` | `true` にするとタグ時ワークフローで AMO へアップロードする。未設定または `true` 以外なら **スキップ**（Chrome のみの運用にできる）。 |
| Secret | `AMO_ADDON_ID` | **このリポジトリでは AMO の slug を `youtublur` とする。** GitHub の Secret にはそのまま `youtublur` を設定する（`manifest.json` の `gecko.id` メール形式とは別物。数値 ID・UUIDでも可だが slug が分かっているなら `youtublur` でよい）。 |
| Secret | `AMO_JWT_ISSUER` | [AMO API キー](https://addons.mozilla.org/developers/addon/api/key/) の **JWT issuer**（画面の「ユーザー」相当の文字列）。 |
| Secret | `AMO_JWT_SECRET` | 同ページの **JWT secret**。 |

ワークフローは [browser-actions/release-firefox-addon](https://github.com/browser-actions/release-firefox-addon)（`v0.2.1` 固定）を使う。アップロード後も **Mozilla の審査**は従来どおり行われ、承認までストアには出ない場合がある。

初めて AMO に出す場合は、開発者ハブでアドオンを一度登録し、上記 `AMO_ADDON_ID` が指すアドオンに対して API からバージョンを載せられる状態にしておく。

### 10.2 手動提出（自動化しない場合）

`AMO_PUBLISH` を `true` にしない場合は、従来どおり手動でよい。

1. GitHub Release から **`extension-firefox.zip`**（または **`extension.zip`**。中身は同一）を取得する。
2. [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) の「新しいバージョンをアップロード」などから zip を提出する。
3. 初回登録時、`manifest.json` の `browser_specific_settings.gecko.id`（現在は `youtublur@kyto64.github.io`）が AMO 上のアドオン ID と一致している必要がある。AMO 側で別 ID が割り当てられている場合は、マニフェストの `id` をその値に合わせてから再リリースする。

### リリース前の Firefox 動作確認（推奨）

ローカルでリポジトリを開き、Firefox で **一時的に読み込む**（`about:debugging` → この Firefox → `manifest.json` を選択）し、次を確認する。GitHub Release の zip は展開してから同様に `manifest.json` を選んでもよい:

- ポップアップの文言（i18n）とモード切替
- YouTube 視聴ページで単色／ブラーが切り替わること
- ポップアップからの変更がタブに反映されること

---

## ⚠️ よくあるミス

- **ソースコードをコミットする前に `pnpm run release` を実行しない**
  → 変更ファイルをすべてコミットしてから `pnpm run release` を実行すること

- **タグの push を忘れない**
  → `git push origin master` だけでなく `--follow-tags` を必ずつける
