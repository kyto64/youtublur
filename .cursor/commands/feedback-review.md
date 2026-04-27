# PR のレビューコメントを確認してトリアージ・修正

PR のレビューコメントを取得し、優先順位をつけて修正を行う。

## 手順

1. **PR のレビューコメントを取得**

   ```bash
   gh pr list --json number -q '.[].number'
   # 特定の PR のコメントを取得
   gh api :owner/:repo/pulls/PR番号/comments --jq '.[] | {id, body, path, line}'
   # または
   gh pr view PR番号 --comments
   ```

2. **コメントのトリアージ**

   - バグ修正が必要: 優先度高
   - コード改善提案: 優先度中
   - 質問・議論: 優先度低（回答のみ）
   - 解決済み: スキップ

3. **修正の実施**

   - worktree またはブランチで作業: `git worktree add ../youtublur-fix feature/fix-pr-comments`
   - 該当ファイルを修正
   - `pnpm exec vp lint` と `pnpm test` を実行
   - コミット: `git add -A && git commit -m "fix: address review comments"`

4. **回答・更新**

   - 修正完了後、該当コメントに返信: `gh api :owner/:repo/pulls/PR番号/comments/COMMENT_ID/replies -f body="修正しました"`
   - または `gh pr review PR番号 --comment -b "修正内容の説明"`

## 注意

- すべてのレビューコメントに回答または修正を行う
- 修正後はテストが通過することを確認
- 大きな変更は別 PR に分割を検討
