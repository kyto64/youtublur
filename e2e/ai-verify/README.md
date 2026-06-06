# AI-Agentic ブラー検証ハーネス

純粋な E2E アサーションだけでは脆く、過去には「サイズボタンを押す」操作や直接 /watch を開く
（F5 相当）テストが不具合（issue #107: 非プレイヤーページで初期化後、SPA 遷移で /watch に入ると
ブラーが反映されず、タブ切替で初めて直る）を隠して pass してしまっていた。
このハーネスは **不具合が実際に出る経路（検索結果ページ → 動画クリックで SPA 遷移）** を通し、
ユーザーの修復操作を一切せずに証跡を採取して、AI（または人間）が「正常（画像B）/ 不具合（画像A）」を
判定できる形にする。

## 実行

```bash
pnpm run verify:ai-blur                       # 実パッケージ拡張を読み込んで採取（既定）
HEADLESS=0 pnpm run verify:ai-blur            # 目視用にヘッドフルで採取
SEARCH_QUERY="music" pnpm run verify:ai-blur  # クリックする動画を探す検索語を変更
INJECT=1 pnpm run verify:ai-blur              # 拡張読込が使えない環境向け: content script を手動注入
```

> `INJECT=1` は拡張の読み込みに対応しない headless 環境（一部のサンドボックス/CI）向けのフォールバック。
> Firefox fixture と同じく `chrome` をモックして `content.js` を注入し、content script のロジックを検証する。

`e2e/ai-verify/artifacts/` に以下が出力される（git 管理外）:

| ファイル | 内容 |
|----------|------|
| `player-first-load.png` | SPA 遷移直後（**無操作**）のプレイヤースクショ。核心は canvas が生成されプレイヤー寸法に追従していること。 |
| `player-theater.png` | シアター/ワイド切替後。アンビエント帯（ブラーが視認できる領域）が生じる。画像A/B の対象シナリオ。 |
| `blur-metrics.json` | canvas/コンテナ寸法、アンビエント/中央画素、アンビエント帯の空間分散など決定的メトリクス。 |
| `judge-prompt.md` | 上記を AI 判定器に渡すためのプロンプト。 |

## 判定フロー

1. 上記スクリプトで証跡を採取する。
2. `blur-metrics.json` の決定的チェック（`canvasMatchesContainer` / `ambientNonZero` /
   `centerCleared` / `ambientStdDev`）でスクリプトが終了コードを返す（0=OK, 1=メトリクス不正, 2=採取失敗）。
3. 定性判定は `judge-prompt.md` と 2 枚のスクリーンショットを AI エージェント（Claude 等）に渡し、
   `PASS`/`FAIL` と根拠を得る。CI では LLM API へ流すステップを足せばゲート化できる。

## 終了コード

- `0`: 決定的メトリクス上は問題なし（最終判定は AI/人間のスクショ確認で確定）。
- `1`: `canvasMatchesContainer === false` など、明確なメトリクス異常（issue #107 再発）。
- `2`: ページ取得や採取に失敗（bot 検知・ネットワーク等）。
