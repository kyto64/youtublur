# リリース手順

## 前提

- `master` ブランチで作業する
- すべての変更がコミット済みであること

---

## Dependabot（自動マージ・自動パッチリリース）

設定は [.github/dependabot.yml](.github/dependabot.yml)。

- **semver major** の PR にはラベル `semver-major` が付き、`kyto64` にレビュー依頼とコメント通知される（自動マージしない）。
- **patch / minor** は CI 合格後に [.github/workflows/dependabot-auto-merge.yml](.github/workflows/dependabot-auto-merge.yml) が承認して自動マージ（squash）する。
- **自動パッチリリース**は [.github/workflows/dependabot-daily-patch-release.yml](.github/workflows/dependabot-daily-patch-release.yml) が **最大 1 日 1 回**（cron、既定で **UTC 15:00**）だけ実行する。直前の `v*` タグ以降に `package.json` / `package-lock.json` の変更がない場合は **スキップ**（その日はリリースコミットを作らない）。同日に Dependabot が複数マージしても、その日の自動実行は高々 1 回の `npm run release -- --release-as patch` にまとまる。**すぐにパッチを出したいとき**は GitHub Actions で同ワークフローを **`workflow_dispatch`** 手動実行できる。
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

## 1. テストを実行する

```bash
pnpm test
```

🔴 失敗した場合はリリースを中止し、問題を修正してから再実行する。

---

## 2. リリースコミット＆タグを作成する

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

## 3. GitHub へ push する

```bash
git push --follow-tags origin master
```

---

## 4. CI/CD の完了を確認する

push 後、GitHub Actions の `publish.yml` が自動でトリガーされ、以下が実行される:

1. Lint チェック
2. テスト実行
3. `extension.zip` のビルド（内容は Firefox 用と同一）
4. `extension-firefox.zip` の作成（`extension.zip` と同一内容。AMO 提出用のファイル名として区別しやすくするため）
5. GitHub Release の作成（上記 2 つの zip を添付）
6. Chrome Web Store への公開（`extension.zip` のみ使用）
7. **（任意）** Firefox AMO への **listed** 版として `extension-firefox.zip` をアップロード（下記「AMO 自動アップロード」を有効にした場合のみ）

👉 [GitHub Actions](https://github.com/kyto64/youtublur/actions) でステータスを確認する。

---

## 5. Firefox（AMO）

### 5.1 AMO 自動アップロード（GitHub Actions）

リポジトリの **Settings → Secrets and variables → Actions** で次を設定する。

| 種別 | 名前 | 内容 |
|------|------|------|
| Variable | `AMO_PUBLISH` | `true` にするとタグ時ワークフローで AMO へアップロードする。未設定または `true` 以外なら **スキップ**（Chrome のみの運用にできる）。 |
| Secret | `AMO_ADDON_ID` | **このリポジトリでは AMO の slug を `youtublur` とする。** GitHub の Secret にはそのまま `youtublur` を設定する（`manifest.json` の `gecko.id` メール形式とは別物。数値 ID・UUIDでも可だが slug が分かっているなら `youtublur` でよい）。 |
| Secret | `AMO_JWT_ISSUER` | [AMO API キー](https://addons.mozilla.org/developers/addon/api/key/) の **JWT issuer**（画面の「ユーザー」相当の文字列）。 |
| Secret | `AMO_JWT_SECRET` | 同ページの **JWT secret**。 |

ワークフローは [browser-actions/release-firefox-addon](https://github.com/browser-actions/release-firefox-addon)（`v0.2.1` 固定）を使う。アップロード後も **Mozilla の審査**は従来どおり行われ、承認までストアには出ない場合がある。

初めて AMO に出す場合は、開発者ハブでアドオンを一度登録し、上記 `AMO_ADDON_ID` が指すアドオンに対して API からバージョンを載せられる状態にしておく。

### 5.2 手動提出（自動化しない場合）

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
