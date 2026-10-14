# Workflow の Verify / Review を実行する

旧 7 視点セルフビューは使わない。
[AGENTS.md](../../AGENTS.md) の **Workflow（必須）** に従い、PR 作成前の Verify / Review と、PR オープン後の Codex レビューを行う。

## 手順

1. **Verify**（実装セッション）: [`.cursor/agents/verifier.md`](../agents/verifier.md) の手順で検証する。
   - 照合するもの: 目的、対象ファイル、テスト方針
   - 実行するもの: `pnpm test` / `pnpm exec vp lint` / `pnpm typecheck`（UI 変更時は `pnpm run test:e2e`）
   - `incomplete` なら Implement に戻って直し、やり直す

2. **Review**（別の新しい Devin セッション）: ブランチを push し、実装とは別の新しい Devin セッション（普段は normal、重い PR だけ fusion 可。クリーンコンテキスト）に [`.cursor/agents/reviewer.md`](../agents/reviewer.md) の手順でレビューさせる。
   - 渡すもの: ブランチ名、base（無指定なら `origin/master`）、要件の箇条書き
   - blocking / medium を実装セッションで直してから PR を出す

3. **PR オープン後**: Codex のレビューを使う: PR オープン時の自動レビューと、必要に応じた `@codex review` コメントの手動依頼の両方。Codex の指摘を検討したうえで CI とマージ基準に従う。

4. **しないこと**
   - PR への `bugbot run` / `cursor review`（Bugbot は停止中。例外は kyto 本人が手動で `bugbot run` する場合だけ）
   - 実装セッション内だけで Review を済ませること（レビューは必ず別セッション）
   - レビューセッションによる編集・コミット・プッシュ

指摘の修正は同じブランチで行い、Test を再実行してから Verify / Review に戻る。
