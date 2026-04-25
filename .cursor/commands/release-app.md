# リリース（Chrome 拡張）

[docs/release.md](docs/release.md) に従い、リリース作業を実行する。詳細はそのドキュメントが正とする。

## 前提の確認

- ブランチは `master` であること。
- **機能変更・バグ修正など、リリースに含めたい変更はすべてコミット済み**であること（未コミットのまま `npm run release` を実行しない）。

## 手順

1. **テスト**

   ```bash
   pnpm test
   ```

   失敗したらリリースを中止し、修正してからやり直す。

2. **リリースコミットとタグ**

   通常（Conventional Commits に基づく自動バンプ）:

   ```bash
   pnpm run release
   ```

   バージョンを明示する場合:

   ```bash
   npm run release -- --release-as 1.2.4
   ```

   `npm run release`（commit-and-tag-version）は、バージョン更新にあわせて `package.json` の `version` スクリプトを実行し、[scripts/sync-version.js](scripts/sync-version.js) 経由で `manifest.json` のバージョンも揃える。CHANGELOG の更新・コミット・`v{version}` タグ作成まで行う。

3. **GitHub へ push**

   ```bash
   git push --follow-tags origin master
   ```

   `git push origin master` だけではタグが送られない。`--follow-tags` を必ず付ける。

4. **CI の確認**

   [GitHub Actions](https://github.com/kyto64/youtublur/actions) で `publish.yml` が成功するまで確認する（lint、テスト、`extension.zip` / `extension-firefox.zip`、GitHub Release、Chrome Web Store 公開。リポジトリ変数 `AMO_PUBLISH=true` と AMO 用シークレットを設定している場合は Firefox AMO へのアップロードも含む）。

## よくあるミス

- 未コミットの変更が残ったまま `npm run release` を実行する → 先にコミットする。
- タグを push しない → `git push --follow-tags` を使う。
