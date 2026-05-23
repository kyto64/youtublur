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
- **キー**: `mode`, `color`, `timestamp`

#### 2. ビジネスロジックレイヤー（中間）
- **`src/content.ts` → `content.js`**:
  - YouTube ページでのみ動作
  - プレイヤー要素の検出と監視
  - 背景へのスタイル適用（単色/ブラー）
  - ダークモード検出による自動調整
- **`src/storage-mode.ts` → `storage-mode.js`**:
  - ストレージ間の競合解決（sync vs local）
  - タイムスタンプベースの勝者決定
  - `saveModeToStorage` は複数回の連続保存を内部キューで直列化し、遅延した古い `sync.set` コールバックが新しい選択より後に `local` を上書きしないようにする
  - `BackgroundMode = 'blur' | 'solid'` 型に基づく型安全なAPI

#### 3. UI レイヤー（最上位）
- **`src/popup.ts` → `popup.js`**:
  - ポップアップ UI の状態管理
  - モード切替ハンドラ
  - カラーピッカーの同期
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
6. MutationObserver でプレイヤーの変更を監視
```

### ユーザー操作フロー

```
1. ユーザーが拡張機能のアイコンをクリック
   ↓
2. popup.html が開く、popup.js が実行
   ↓
3. chrome.storage から現在の状態を読み込んで UI に反映
   ↓
4. ユーザーがモードを変更（または色を選択）
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
3. **キーボードショートカット**: chrome.commands API を使用した操作
4. **スケジューリング**: 時刻ベースの自動モード切り替え

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
