# フロントエンドアーキテクチャ

ブラウザ拡張機能としてのフロントエンド設計と実装パターン。

## 拡張機能のアーキテクチャ

Manifest V3 に基づくブラウザ拡張機能は、以下のコンポーネントで構成されます。

### コンポーネント構成

```

                  Chrome/Firefox ブラウザ



   ブラウザアクション (拡張機能アイコン)
  - popup.html (UI)
  - popup.js (ロジック / `src/popup.ts` からコンパイル)
  - style.css (スタイル)



   コンテンツスクリプト (YouTubeページで動作)
  - content.js (メインロジック / `src/content.ts` からコンパイル)
  - DOM操作、スタイル適用



   バックグラウンド (Service Worker / Firefox はイベントページ)
  - manifest commands の受信（モード切替、ブラー強度 ±4px、再読み込み）
  - 開いている YouTube タブへ既存メッセージを配信
  - 常時起動せず、コマンド時に起動



   ストレージ (chrome.storage)
  - sync: アカウント間同期
  - local: ローカル保存



```

### コンポーネントの責務

#### 1. ポップアップ（`popup.html` + `src/popup.ts` → `popup.js` + `style.css`）

**責務:**
- ユーザーインターフェースの提供
- 現在の設定値の表示
- ユーザー操作の受け付け
- ストレージへの設定保存
- 任意のレビュー促し（`src/review-nudge.ts` → `review-nudge.js`）
- 現在のキーボードショートカット表示（`src/popup-shortcuts.ts` → `popup-shortcuts.js`）

**ライフサイクル:**
- アイコンクリック時に作成
- ポップアップ外クリックで破棄
- ステートレス（一時的なUIとして動作）

**重要な制約:**
- 長時間の実行を前提としない
- 非同期操作はPromiseベースで処理
- 同期処理はUIをブロックしない

#### 2. コンテンツスクリプト（`src/content.ts` → `content.js`）

**責務:**
- YouTube視聴ページでのみ実行
- プレイヤー要素の検出と監視
- 背景へのスタイル適用（単色/ブラー）
- ブラー強度の反映（描画ループは再開せず、次フレームの `ctx.filter` だけを変える）
- ストレージ変更の監視と反映（`playerBlurStrengthPx` は開いている YouTube タブへ `chrome.storage.onChanged` で届く）

**ライフサイクル:**
- ページ読み込み時に注入
- ページ遷移またはタブ閉じるまで生存
- 必要に応じて定期的なポーリングを実行

**重要な制約:**
- 分離された世界（isolated world）で動作
- ページのJavaScriptとは変数を共有しない
- 実行時間が長すぎるとブラウザによって停止される可能性あり

#### 3. ストレージ（`chrome.storage`）

**役割:**
- 設定値の永続化
- 複数タブ・複数デバイス間での同期
- コンテンツスクリプトとポップアップ間のデータ共有

**利用するストレージ:**
- `chrome.storage.sync`: メインの設定保存（アカウント同期）
- `chrome.storage.local`: 一時的なデータ、バックアップ、レビュー促し状態（`firstUseTimestamp` など）

**レビュー促し（`review-nudge.js`）:**
- 初回ポップアップ開封で `firstUseTimestamp` を記録
- 7 日経過後に一度だけ表示候補（「あとで」はさらに 7 日クールダウン）
- ストア URL はランタイムの Gecko 検出で CWS / AMO を切り替え（manifest の gecko ブロックは共用のため使用しない）
- ストレージを読めないときは表示しない。選択の保存に失敗したときは促しを残し、`reviewNudgeSaveFailed` を出す。「レビューを書く」は保存できたときだけストアを開く

### データフローと通信

#### ストレージ同期の仕組み

```

                    chrome.storage.sync
  (mode, color, timestamp)

                           ↑ read
                           ↓

     content.js      ←      popup.js
     (監視中)              (ユーザー操作)

      ↑
      │
      └──── 変更検知 (onChanged) ──────────
```

#### 通信パターン

1. **ストレージのポーリング**
   - content.js が定期的にストレージを確認
   - 変更があれば即座に反映
   - フォールバックとしての手法（onChangedの補完）

2. **ストレージ変更イベント**
   - `chrome.storage.onChanged` をリッスン
   - 他のタブやデバイスからの変更を検知
   - リアルタイムな同期を実現

3. **メッセージング（未使用だが可能）**
   - `chrome.runtime.sendMessage` で直接通信
   - バックグラウンドスクリプトを介した通信
   - 本拡張ではシンプルなストレージ同期で十分なため未使用

### ライフサイクル管理

#### Service Worker（バックグラウンド）

Manifest V3 ではバックグラウンドページの代わりに Service Worker を使用します。

**特徴:**
- イベント駆動型で動作
- アイドル時に自動的に停止
- 必要な時に起動して処理を実行

**ライフサイクルイベント:**
```javascript
// インストール時
chrome.runtime.onInstalled.addListener(() => {
  // 初期設定など
});

// 起動時
chrome.runtime.onStartup.addListener(() => {
  // ブラウザ起動時の処理
});

// メッセージ受信時
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // メッセージ処理
});
```

#### コンテンツスクリプト

**起動:**
- ページ読み込み時に自動注入
- `manifest.json` の `content_scripts` で指定されたパターンにマッチするページで実行

**終了:**
- タブが閉じられた時
- ページがナビゲートされた時（別ページへ移動）
- 手動で実行コンテキストが破棄された時

#### ポップアップ

**起動:**
- ユーザーが拡張機能アイコンをクリック
- 新しいポップアップウィンドウとして作成

**終了:**
- ポップアップ外がクリックされた時
- ユーザーがブラウザの別の場所をクリックした時
- プログラム的に閉じられた時

### パフォーマンス最適化

#### メモリ使用量の最小化

1. **グローバル変数の制限**
   - 必要最小限の変数のみをグローバルに保持
   - 関数スコープやブロックスコープを活用

2. **イベントリスナーの管理**
   - 不要になったリスナーは明示的に削除
   - メモリリークを防ぐ

3. **タイマーのクリア**
   - `setInterval` や `setTimeout` は不要になったらクリア
   - コンテンツスクリプトの終了時にクリーンアップ

#### CPU使用量の最適化

1. **MutationObserverの効率的な使用**
   ```javascript
   // 対象を限定して監視
   const observer = new MutationObserver((mutations) => {
     // 最小限の処理のみ
   });

   observer.observe(targetElement, {
     childList: true,
     subtree: true,
     attributes: false,  // 不要な属性監視はオフ
   });
   ```

2. **ポーリング間隔の調整**
   - 必要以上に短いポーリングは避ける
   - 現在は1秒間隔（バランスの取れた値）

3. **非同期処理の適切な使用**
   - ブロッキング処理を避ける
   - Promiseとasync/awaitで非同期化

### エラーハンドリング戦略

#### 境界でのエラー捕捉

```javascript
// ストレージアクセスの安全なラッパー
async function safeStorageGet(keys) {
  try {
    return await new Promise((resolve, reject) => {
      chrome.storage.sync.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  } catch (error) {
    console.warn('Storage read failed:', error);
    return {};  // 安全なフォールバック
  }
}
```

#### フォールバックの提供

- ストレージ読み込み失敗 → デフォルト値を使用
- DOM要素未検出 → リトライまたは安全に終了
- パースエラー → デフォルト値にフォールバック

### セキュリティ考慮事項

#### コンテンツスクリプトのセキュリティ

1. **XSS対策**
   - ユーザー入力を直接DOMに挿入しない
   - `innerHTML` の代わりに `textContent` を使用
   - 外部リソースの読み込みは行わない

2. **隔離された世界**
   - コンテンツスクリプトは独自のJavaScript環境で動作
   - ページのJavaScript変数にはアクセスできない（その逆も同様）
   - DOMのみを共有

#### 権限の最小化

- 宣言された権限のみを使用
- 不要な権限は要求しない（`storage`, `activeTab` のみ）
- マッチパターンを最小限に（`*://*.youtube.com/*` のみ）

#### データの保護

- ユーザー設定はローカルにのみ保存
- 外部へのデータ送信は一切行わない
- センシティブな情報は保存しない

### ブラウザ間の互換性

#### Chrome と Firefox の違い

| 機能 | Chrome | Firefox |
|------|--------|---------|
| バックグラウンド | Service Worker | Service Worker |
| Side Panel API | ✅ 対応 | ❌ 未対応 |
| 拡張機能ID | 固定 | メール形式またはUUID |
| ストレッジ同期 | アカウントベース | アカウントベース |
| Manifest V3 | ✅ 完全対応 | ✅ 完全対応 |

#### ブラウザ特有の考慮

**Chrome:**
- Side Panel API を使用してサイドパネルを操作可能
- `chrome.sidePanel` API を活用

**Firefox:**
- `browser_specific_settings.gecko` が必須
- AMO（addons.mozilla.org）用のID管理が必要
- Side Panel API に非対応（ポップアップのみ）

### テスト戦略

#### ユニットテスト

- 純粋な関数のテスト
- Chrome APIのモックを使用したテスト
- JSDOM環境でのDOM操作テスト

#### E2Eテスト

- Playwrightを使用した実際のブラウザテスト
- 複数ブラウザでの動作確認
- ユーザーストーリーに沿ったシナリオテスト

#### パフォーマンステスト

- メモリ使用量の測定
- 実行時間の計測
- 多数のタブを開いた場合の挙動確認

### ベストプラクティスまとめ

1. **ライフサイクルを意識する**
   - 各コンポーネントの生存期間を理解する
   - 適切なタイミングでクリーンアップを行う

2. **通信を最小限にする**
   - 不必要なメッセージングは避ける
   - ストレージ同期で十分な場合はシンプルに保つ

3. **パフォーマンスを常に意識する**
   - メモリとCPUの使用量を最小限に
   - ユーザー体験を損なわない範囲で最適化

4. **エラーハンドリングを堅牢にする**
   - すべての境界でエラーを捕捉
   - 常に安全なフォールバックを用意

5. **セキュリティを最優先する**
   - 権限は最小限に
   - 外部通信は行わない
   - ユーザーデータは保護

6. **ブラウザ間の互換性を保つ**
   - ChromeとFirefoxの両方で動作確認
   - ブラウザ特有の機能は代替手段を用意
