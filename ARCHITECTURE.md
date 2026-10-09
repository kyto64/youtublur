# アーキテクチャ

システムアーキテクチャと依存関係の概要。

## システム概要

youtublur は YouTube 視聴ページのプレイヤー背景を単色/ブラー表示に切り替えるブラウザ拡張機能（Chrome/Firefox 向け、Manifest V3）。

## アーキテクチャ図

```

                    YouTube 視聴ページ
  (https://*.youtube.com/watch?v=...)

                  ↑ DOM 操作 / 監視
                  ↓

      content.js (compiled from src/content.ts)
  - ページの状態監視（プレイヤー、モード）
  - 背景への適用（単色/ブラー）
  - ストレージとの同期

                  ↑ ストレージ（chrome.storage）
                  ↓

         chrome.storage (sync + local)
  - mode: "solid" | "blur" | "default"
  - color: "#RRGGBB"
  - timestamp: number

                  ↑ 読み取り
                  ↓

     popup.js (compiled from src/popup.ts)
  - UI の状態管理
  - モード切替（単色/ブラー/デフォルト）
  - カラーピッカー

                  ↓

         popup.html + style.css
  - コンパクトな UI
  - リアルタイムプレビュー

```

## 依存関係の方向性

このプロジェクトは Manifest V3 の制約下で動作し、以下の原則に基づいて設計されています。

### コア原則

1. **グローバルスコープ**: ES modules を使用せず、グローバル変数で状態を管理（TypeScript ソースは `src/*.ts`、`tsc` で flat script `.js` を root に出力）
2. **最小権限**: `storage` と `activeTab` のみを使用
3. **ブラウザ互換性**: Chrome (MV3) と Firefox (AMO) 両対応
4. **宣言的マッチ**: マッチパターンは `*://*.youtube.com/*` のみ

### レイヤー構造

システムは以下の 3 つのレイヤーに分かれています（厳密な依存方向はグローバルスコープのため緩いですが、概念的に整理されています）：

#### 1. ストレージレイヤー（最下位）
- **責務**: 設定値の永続化と同期
- **実装**: `chrome.storage.sync` と `chrome.storage.local`
- **キー（モード）**: `playerBackgroundMode`, `playerBackgroundModeTimestamp`（`storage-mode.js`）
- **キー（ブラー強度）**: `playerBlurStrengthPx`, `playerBlurStrengthPxTimestamp`（既定 40px、8–72px、4px 刻み。未設定の利用者は従来どおり 40px）。ローカルのスライダー操作より前の書き込みは無視し、それより新しいタイムスタンプ（別タブの変更を含む）はすぐ適用する。抑制が切れてもストレージを読み直し、操作以降のタイムスタンプだけを適用する。読み込み開始後に新しいスライダー指示が届いた結果は適用しない
- **キー（単色）**: `playerSolidColor`, `playerSolidColorTimestamp`（`#rrggbb` のみ。未設定なら従来のテーマ色のまま。ライト `#f1f1f1`、ダーク `#181818`）。不正な値は CSS に入れず、保存時は `#f1f1f1` に落とす。選んだあとはテーマ変更で上書きしない
- **キー（レビュー促し・local のみ）**: `firstUseTimestamp`, `reviewNudgeHandled`, `reviewNudgeNeverAsk`, `reviewNudgeCooldownUntil`（`review-nudge.js`）

#### 2. ビジネスロジックレイヤー（中間）
- **`src/content.ts` → `content.js`**:
  - YouTube ページでのみ動作
  - プレイヤー要素の検出と監視
  - 背景へのスタイル適用（単色/ブラー）
  - ダークモード検出による自動調整
- **`src/storage-mode.ts` → `storage-mode.js`**:
  - ストレージ間の競合解決（sync vs local）
  - タイムスタンプベースの勝者決定
  - `saveModeToStorage` / `saveBlurStrengthToStorage` / `saveSolidColorToStorage` は複数回の連続保存を内部キューで直列化し、遅延した古い `sync.set` コールバックが新しい選択より後に `local` を上書きしないようにする
  - `BackgroundMode = 'blur' | 'solid'` 型に基づく型安全なAPI
  - ブラー強度は範囲外の値をスライダーの刻みにスナップしてから保存する

#### 3. UI レイヤー（最上位）
- **`src/popup.ts` → `popup.js`**:
  - ポップアップ UI の状態管理
  - モード切替ハンドラ
  - ブラー強度スライダー（ブラーモードのときだけ表示。ドラッグ中の保存は間引き、離したときは即保存）
  - 単色の色（単色モードのときだけ。プリセットと `<input type="color">`。ドラッグ中の保存は間引き、プリセットと確定時は即保存）
  - 任意のレビュー促し（`review-nudge.js` 経由。初回ポップアップから 7 日後に一度だけ表示候補）
  - キーボードショートカットの現在の割り当て表示（`popup-shortcuts.js`。`chrome.commands.getAll`）
- **`src/background.ts` → `background.js`**:
  - Manifest `commands` の `chrome.commands.onCommand` を受け取る
  - モードとブラー強度はポップアップと同じ `saveModeToStorage` / `saveBlurStrengthToStorage` で保存する（キーの形は変えない）
  - 開いている全タブへ既存メッセージ `BG_MODE_CHANGED` / `BLUR_STRENGTH_CHANGED` を送る。タブ URL は読まない（`tabs` 権限や `host_permissions` を足さない）。コンテンツスクリプトがある YouTube タブだけが受け取る
  - Chrome は `background.service_worker`（`importScripts` で `storage-mode.js` と `shortcut-actions.js` を読む）。Firefox は `background.scripts` のイベントページ（Chrome 121 以降は `scripts` を無視する）
- **popup.html**:
  - シンプルな操作インターフェース
  - モードボタンとカラーピッカー
- **style.css**:
  - ダークテーマに適した視覚デザイン
  - レスポンシブなポップアップサイズ

## 外部依存関係

### ランタイム依存（パッケージ）

プロジェクトは外部の JavaScript ライブラリに依存せず、純粋なブラウザ拡張として動作します。

開発・ビルドツール:
- **TypeScript**: ソースコードは `src/*.ts`（`strict: true`）。`tsc` で root の flat script `.js` に出力（マニフェスト互換）
- **`@types/chrome`**: 拡張機能 API の型定義
- **Vite+**: テストランナー（Vitest 互換）
- **JSDOM**: テスト環境
- **Playwright**: E2E テスト

### ブラウザ API

以下の Chrome/Firefox 拡張 API に依存:

- `chrome.storage` (sync, local)
- `chrome.runtime` (onMessage, id)
- `chrome.tabs` (query, onUpdated)
- `chrome.sidePanel` (setOptions) - Chrome のみ
- `chrome.action` (setBadgeText, setTitle)

## データフロー

### 初期化フロー

```
1. ページ読み込み (YouTube 視聴ページ)
   ↓
2. content.js が注入・実行
   ↓
3. chrome.storage から現在のモードと色を読み込み
   ↓
4. プレイヤー要素を検出
   ↓
5. 現在のモードに基づいて背景を適用
   ↓
6. MutationObserver / SPA navigation / visibility 復帰でプレイヤーを再評価
   ↓
7. 現在のプレイヤーに blur canvas が無い場合は短時間リトライして再適用
```

#### Blur canvas ライフサイクル（content.js）

YouTube のプレイヤー DOM は SPA 遷移や遅延描画で差し替わるため、blur canvas は単一のグローバル参照だけに依存しない。

| 関数 | 役割 |
|------|------|
| `hasCurrentBlurCanvas(container)` | モジュール参照・DOM 所属・現プレイヤー内 ID の三条件を満たすか判定 |
| `discardStaleBlurCanvas(container)` | 別プレイヤーに残った canvas や DOM 外れを検知し、ResizeObserver / rAF / Gecko snap を解放 |
| `clearVideoContentRect(...)` | canvas を `z-index: 1` で前面に置きつつ、動画表示領域だけ毎フレームクリアして映像を鮮明に保つ |
| `scheduleBlurInitRetryIfNeeded()` | video / canvas 未準備時に指数バックオフで再初期化（最大 25 回）。上限到達後は `blurInitRetryExhausted` で停止し、MutationObserver 等の再評価まで待つ |
| `startBlurLoop()` | 描画 rAF。canvas が完全に欠落した場合は rAF を止め、プレイヤーセレクタ一時消失時のみ rAF を継続 |

##### SPA ナビゲーション検知（issue #107）

`installYoutubeNavigationHooks()` は `popstate` と `history.pushState`/`replaceState` のラッパーに加え、
YouTube (Polymer/kevlar) 公式の **`yt-navigate-finish`** イベントを購読して `observePlayer()` を再実行する。

これが無いと、content script が**プレイヤーページ以外（例: ホーム `/`）で初期化**された後にサムネイルを
クリックして `/watch` へ SPA 遷移しても、YouTube が自前で保持した `history.pushState` 参照経由で遷移するため
ラッパーで捕捉できず、`observePlayer()` が再実行されない。結果 blur canvas が生成されず、タブ切替
（`visibilitychange`）まで反映されなかった。公式イベント購読により SPA 遷移を確実に再評価する。
単色モードも同じ経路で塗る。ホームで初期化した時点ではプレイヤーが無く、保存済みの `playerSolidColor` は
`yt-navigate-finish` 後の `tryInit`、またはプレイヤー DOM が遅れて現れたときの MutationObserver で
`#movie_player` に載る。`initBlurForPlayer` はブラー以外では何もしない。
これらのイベントは page world から共有 DOM 上に発火されるため、isolated world の content script でも受け取れる。

`popup.js` の `sendMessageToTab()` は callback 型と Promise 型の `chrome.tabs.sendMessage` の両方に対応する。

#### レビュー促し（`review-nudge.js`）

ポップアップ開封時に `ensureFirstUseTimestamp()` で初回利用時刻を `chrome.storage.local` に記録する。約 7 日経過後、未処理かつクールダウン外のときだけコンパクトなレビュー促しを表示する。

| ユーザー操作 | 保存キー | 効果 |
|--------------|----------|------|
| （初回ポップアップ） | `firstUseTimestamp` | 以降の 7 日カウント開始 |
| **レビューを書く** | `reviewNudgeHandled = true` | 保存できたときだけストアを新規タブで開き、再表示しない |
| **あとで** | `reviewNudgeCooldownUntil` | 保存できたとき 7 日間非表示 |
| **今後表示しない** | `reviewNudgeNeverAsk = true` | 保存できたとき恒久非表示 |

`chrome.storage.local` の読み取りが `lastError` または例外で失敗したときは促しを出さない（fail closed）。初回時刻の書き込みに失敗したときも時刻を捏造せず、促しは出さない。

「あとで」「今後表示しない」「レビューを書く」の保存が失敗したときは、選択が残ったように促しを消さない。促しは表示したまま、短い案内（`reviewNudgeSaveFailed`）を出す。「レビューを書く」は保存できたときだけストアを開く。保存できないままタブだけ開くと、ユーザーは対応済みだと思って戻ったあとに同じ促しが再表示される。

ストア URL は manifest の `gecko` ブロックでは判定しない（Chrome ビルドにも gecko 設定が含まれる）。`CSS.supports('-moz-appearance', 'none')` で Gecko ランタイムを検出し、Chrome Web Store / Firefox AMO を切り替える（`content.ts` の `isGeckoLayoutEngine()` と同手法）。

### ユーザー操作フロー

```
1. ユーザーが拡張機能のアイコンをクリック
   ↓
2. popup.html が開く、popup.js が実行
   ↓
3. chrome.storage から現在の状態を読み込んで UI に反映
   ↓
4. ユーザーがモードまたはブラー強度を変更
   ↓
5. 新しい値を chrome.storage に保存（含タイムスタンプ）
   ↓
6. content-script にメッセージを送信（またはポーリングで検知）
   ↓
7. content.js が変更を検知し背景を即座に更新
```

### ストレージ同期フロー

```
複数のストレージ（sync と local）に同じキーが存在する場合:
   ↓
両方の値のタイムスタンプを比較
   ↓
より新しい方（未来のタイムスタンプ）が勝者
   ↓
古い方は無視され、統一された状態が確立
```

## 制約事項

### Manifest V3 の制約

1. **バックグラウンドスクリプト**: Service Worker として動作（常に起動しない）
2. **リモートコード**: 外部からコードを読み込んで実行することは禁止
3. **権限の最小化**: 宣言した権限以上のアクセスはできない
4. **コンテンツスクリプト**: 静的に宣言されたマッチパターンのみ

### ブラウザ間の差異

| 機能 | Chrome | Firefox (AMO) |
|------|--------|---------------|
| 背景スクリプト | Service Worker | Service Worker（browser_specific_settings.gecko 必須） |
| Side Panel API | 対応 | 未対応（代替手法でカバー） |
| ストレージ同期 | 自動（sync） | アカウント同期による自動同期 |
| 拡張機能 ID | 固定 | 開発者ハブで取得（メール形式か UUID） |

## セキュリティモデル

- コンテンツスクリプトは YouTube ページの DOM に直接アクセス可能だが、隔離された世界で動作
- 外部ネットワーク通信は一切行わない（ローカル処理のみ）
- ユーザーデータ（色設定など）はローカルストレージにのみ保存
- リモートリソースの読み込みや外部 API コールは行わない

## 拡張可能性

現在のアーキテクチャで容易に追加可能な機能:

1. **追加の背景スタイル**: グラデーション、パターンなど（content.js に追加）
2. **サイト別設定**: 他の動画サイトへの対応（manifest.json の matches 拡張 + content.js の調整）
3. **スケジューリング**: 時刻ベースの自動モード切り替え

キーボードショートカットは実装済み。`manifest.json` の `commands`（`toggle-mode`、`increase-blur-strength`、`decrease-blur-strength`、提案キーなしの `reload-effect`、ポップアップを開く `_execute_action`）を使う。Chrome は `chrome://extensions/shortcuts`、Firefox は `commands.openShortcutSettings()` で割り当てを変える。決定は `src/shortcut-actions.ts`。保存とタブへの配信は `src/background.ts` が読み取りから保存まで直列に行う。

アーキテクチャ変更が必要な機能:

1. **リモート設定**: クラウド同期（ネットワーク権限とバックグラウンドの永続化が必要）
2. **データ収集**: 使用状況のトラッキング（プライバシー機能の追加と権限拡張が必要）
3. **マルチタブ同期**: タブ間のリアルタイム同期（長寿命バックグラウンドが必要）

## コード品質ルール

- 各ファイルは 150 行以内（例外あり）
- グローバル変数の衝突を防ぐため、必要最小限のスコープを使用
- すべての公開関数は TypeScript の型注釈で契約を明示（JSDoc は補足のみ）
- 変更時は必ずユニットテストを追加または更新

## テスト戦略

- **型チェック**: `pnpm typecheck`（`tsc --noEmit`、`strict: true`）— CI/`pretest` で自動実行
- **ユニットテスト**: `src/content.ts` / `src/popup.ts` のコアロジック（jsdom + Vitest、コンパイル後の `.js` を読み込む）
- **統合テスト**: ストレージ同期ロジック（`src/storage-mode.ts`）
- **E2E テスト**: ブラウザ環境での実際の動作確認（Playwright）

## パフォーマンス考慮

- コンテンツスクリプトは必要最小限のメモリと CPU を使用
- MutationObserver は対象要素に限定して監視
- ストレージ読み込みは非同期で行われ、UI をブロックしない
- ポップアップは必要なときのみロードされ、閉じるとすぐにアンロード
