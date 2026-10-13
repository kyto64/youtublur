# youtublur

YouTubeを、もっと目に優しく。（Chrome / Firefox 向け Manifest V3）

## 配信

- https://chromewebstore.google.com/detail/youtublur/npkiobfoclnkmobjhgadnjepceofjenj
- https://addons.mozilla.org/en-US/firefox/addon/youtublur/

## 機能
- 単色モード / ブラーモードの切替

## クイックスタート
1. `git worktree add -b feature/<name> ../youtublur-<name> master`
2. `cd ../youtublur-<name> && pnpm install`
3. `pnpm test` でテスト実行

詳細な開発手順は [AGENTS.md](AGENTS.md) を参照。

## リリース
Chrome Web Store / Firefox AMO への公開手順は [docs/release.md](docs/release.md) を参照。

## 対応ブラウザ
- Chrome（Manifest V3）
- Firefox（Manifest V3）

## ライセンス

proprietary。利用条件は [LICENSE](LICENSE) を参照。
公開されているのはソースの閲覧用であり、オープンソースライセンスではない。
