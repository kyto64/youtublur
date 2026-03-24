# リリース手順

## 前提

- `master` ブランチで作業する
- すべての変更がコミット済みであること

---

## 1. テストを実行する

```bash
npm test
```

🔴 失敗した場合はリリースを中止し、問題を修正してから再実行する。

---

## 2. リリースコミット＆タグを作成する

通常リリース（Conventional Commits に基づく自動バンプ）:

```bash
npm run release
```

バージョンを手動指定する場合:

```bash
npm run release -- --release-as 1.2.4
```

このコマンドで以下が自動実行される:

| 処理 | 対象ファイル |
|---|---|
| バージョンバンプ | `package.json`, `package-lock.json`, `manifest.json` |
| CHANGELOG 更新 | `CHANGELOG.md` |
| git commit | 上記すべて |
| git tag | `v{version}` |

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
3. `extension.zip` のビルド
4. GitHub Release の作成（zip 添付）
5. Chrome Web Store への公開

👉 [GitHub Actions](https://github.com/kyto64/youtublur/actions) でステータスを確認する。

---

## ⚠️ よくあるミス

- **ソースコードをコミットする前に `npm run release` を実行しない**  
  → 変更ファイルをすべてコミットしてから `npm run release` を実行すること

- **タグの push を忘れない**  
  → `git push origin master` だけでなく `--follow-tags` を必ずつける
