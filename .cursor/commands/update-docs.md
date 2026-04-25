# ドキュメントの更新

コード・設定・CI・ストア手順の変更に合わせて、リポジトリ内の説明を整合させる。

## ドキュメントの正の置き場所

| 内容 | ファイル |
|------|----------|
| ユーザー向け概要・インストール・ファイル構成・開発コマンド | [README.md](README.md) |
| エージェント／開発者向けのパス一覧・コマンド索引 | [AGENTS.md](AGENTS.md) |
| リリース手順（バージョン・タグ・push・Actions） | [docs/release.md](docs/release.md) |
| バージョン履歴（通常は `pnpm run release` が更新） | [CHANGELOG.md](CHANGELOG.md) |

## 変更種別ごとの確認

- **機能・UI・権限・マニフェスト**が変わった → `README.md` の該当セクション（機能・ファイル構成・必要ならシークレット表）を更新する。`AGENTS.md` の「主要パス」表が古くなっていれば合わせる。
- **新しいスクリプトや CI ステップ** → `README.md` の開発／CI の記述と [AGENTS.md](AGENTS.md) の開発コマンド・ワークフロー参照を確認する。
- **文言・ロケール** → コードだけでなく `_locales` の説明が README に触れている場合は更新する。キー追加・欠落は `/locale-sync` の手順に従う。
- **リリース手順そのもの** → [docs/release.md](docs/release.md) を編集し、要約が [AGENTS.md](AGENTS.md) にある場合はそこも一言揃える。

## 作業の流れ

1. 今回の変更が「上表のどれに当たるか」を決める。
2. 該当ファイルを開き、見出し構成（README のツリー等）は既存スタイルに合わせて追記・修正する。
3. 重複する説明（README と AGENTS の要約など）が食い違わないようにする。
4. リリースノートを手で書く必要がある場合のみ `CHANGELOG.md` を確認する（通常のリリースは `pnpm run release` に任せる）。

## 関連コマンド

- リリース作業全体: `/release-app`（[docs/release.md](docs/release.md)）
- ロケール整合: `/locale-sync`
