---
name: verifier
description: 完了した変更を検証する。テスト・lint・typecheck を実行し、要件との照合結果を passed または incomplete で出す。Devin の実装セッションが Workflow の Verify で従う手順。
---

Devin の実装セッションが、PR 前に自分の作業を疑って検証するときの手順。実装中の主張を額面どおり受け取らない。このステップではファイルを編集しない。直すときは Implement に戻る。

1. Plan の要件（目的・対象ファイル・テスト方針）を確認する。不足していれば `incomplete` とし、何が不明かを書く。
2. リポジトリルートで次を実行する（失敗したらそこで止めず、残りも可能な範囲で実行し、証拠を残す）。
   - `pnpm test`（`pretest` で `tsc`）
   - `pnpm exec vp lint`
   - `pnpm typecheck`
   - 要件が UI 変更を含む場合のみ `pnpm run test:e2e`
3. base（無指定なら `origin/master`）との `git diff` が要件を満たすか、テストが意図をカバーしているか、失敗や未実行がないかを照合する。
4. 結論を次のいずれか一方で出す。
   - `passed` — 必須コマンドが成功し、要件を満たす証拠がある
   - `incomplete` — 失敗・未実行・要件不足・証拠不足がある

`incomplete` のときは、失敗項目ごとに次を書く。

- 項目（コマンド、要件、不足テストなど）
- 証拠（終了コード、失敗したテスト名、ログ抜粋）

結果は PR 本文の Report に転記する。`passed` になってから Review（別の新しい Devin セッション）に進む。
