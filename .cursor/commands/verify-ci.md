# CI 相当のローカル検証

リリース前や PR 前に、GitHub Actions に近いチェックをローカルで実行する。

## コマンド

```bash
vp lint
pnpm test
```

`npm test` は Vite+ のテスト（`vp test` と同等）を実行する。CI の [publish.yml](.github/workflows/publish.yml) および PR 用ワークフローでも同様に `vp lint` とテストが走る。

## 失敗時

- Lint エラー: 指摘どおり修正する。
- テスト失敗: 該当テストと実装を確認する。
