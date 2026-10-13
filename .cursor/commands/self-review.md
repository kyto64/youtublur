# Workflow の Verifier / Review を実行する

旧 7 視点セルフビューは使わない。
[AGENTS.md](../../AGENTS.md) の **Workflow（必須）** に従い、PR 作成前に次だけを行う。

## 手順

1. **Verifier**: `verifier` subagent（[`.cursor/agents/verifier.md`](../agents/verifier.md)）を独立検証で呼ぶ。
   - 渡すもの: 目的、対象ファイル、テスト方針
   - 実行されるもの: `pnpm test` / `pnpm exec vp lint` / `pnpm typecheck`（UI 変更時は `pnpm run test:e2e`）
   - `incomplete` なら修正してからやり直す。verifier 自身はファイルを編集しない

2. **Review**: `reviewer` subagent（[`.cursor/agents/reviewer.md`](../agents/reviewer.md)、grok-4.7、クリーンコンテキスト）を呼ぶ。
   - 見るもの: base（無指定なら `origin/master`）との `git diff` と要件箇条
   - blocking / medium を直してから PR を出す

3. **しないこと**
   - explore タイプの並行セルフレビュー
   - PR への `bugbot run`（kyto 以外は起動しない）
   - verifier / reviewer の編集・コミット・プッシュ

指摘の修正は既存の worktree（`feature/<name>`）で行い、Test を再実行してから Verifier / Review に戻る。
