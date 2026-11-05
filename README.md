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

## プライバシー（アンインストール時のアンケート）
アンインストール時に任意のアンケートページ（https://kyto64.github.io/youtublur/uninstall/ 、ソースは [docs/uninstall/](docs/uninstall/)）を開く。ユーザーがページで自分で回答して送信した場合だけ、理由コード（reason）・自由記述（comment、任意・最大1000字）・拡張のバージョン（version）・表示言語（lang）の4項目が Google フォームに送られる。回答しなければ何も送られない。拡張本体は外部通信を行わず、ページ側も外部スクリプト・トラッキング・Cookie を使わない。

Firefox では、ストア表記（`data_collection_permissions`）に合わせて任意の技術データ（`technicalAndInteraction`）の同意を外すと、アンケート URL に version と lang を付けない（Firefox 139 以下も付けない）。Chrome は常に付ける。

## ライセンス

proprietary。利用条件は [LICENSE](LICENSE) を参照。
公開されているのはソースの閲覧用であり、オープンソースライセンスではない。
