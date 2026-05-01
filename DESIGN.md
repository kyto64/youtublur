# 設計原則とパターン

コードの設計における原則、パターン、およびベストプラクティス。

## コア原則

### 1. 明示的な境界（Explicit Boundaries）

モジュール間の依存関係は明確で予測可能であるべきです。グローバルスコープを活用しつつも、各コンポーネントの責任範囲は明確に分離してください。

**良い例:**
```javascript
// storage.js - ストレージ操作のみを担当
export function loadMode(callback) {
  chrome.storage.sync.get(['mode', 'timestamp'], (result) => {
    // ...同期ロジック
    callback(finalMode);
  });
}

// content.js - ストレージユーティリティを使用
loadMode((mode) => {
  applyBackground(mode);
});
```

**悪い例:**
```javascript
// content.js が直接ストレージ操作と同期ロジックを複製
chrome.storage.sync.get(['mode'], (result1) => {
  chrome.storage.local.get(['mode'], (result2) => {
    // ...複雑な同期ロジックが散在
  });
});
```

### 2. データの検証と境界でのパース（Parse, Don't Validate）

データがシステムに入る境界（API境界、ストレージ境界、関数境界）で、データの構造と有効性を検証してください。内部ロジックはデータがすでに正しい形式であると仮定して動作するように設計してください。

**実装:**
```javascript
// storage-mode.js - ストレージ読み込み時にデータを正規化
export function normalizeStorageData(syncData, localData) {
  const mode = isValidMode(syncData.mode) ? syncData.mode : 'default';
  const timestamp = Number(syncData.timestamp) || 0;
  return { mode, timestamp };
}

function isValidMode(value) {
  return ['default', 'solid', 'blur'].includes(value);
}
```

### 3. 不変性と副作用の局所化（Immutability and Localized Side Effects）

可能な限りデータの不変性を保ち、副作用は明確に分離してください。DOM 操作やストレージ操作は専用の関数に集約してください。

**良い例:**
```javascript
// DOM 操作は専用関数に集約
function applyBackgroundToElement(element, mode, color) {
  const style = calculateBackgroundStyle(mode, color);
  element.style.background = style;

  // 副作用のロギングはここだけ
  logBackgroundChange(mode, color);
}

function calculateBackgroundStyle(mode, color) {
  // 純粋関数 - 副作用なし
  switch (mode) {
    case 'solid':
      return `#${color}`;
    case 'blur':
      return `rgba(${hexToRgb(color)}, 0.3)`;
    default:
      return 'none';
  }
}
```

### 4. 疎結合とイベント駆動（Loose Coupling and Event-Driven）

コンポーネント間は直接的な呼び出しではなく、イベントやメッセージングを介して通信してください。これにより、テスト容易性と保守性が向上します。

**実装:**
```javascript
// content.js - ストレージの変更をリッスン
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.mode) {
    updateBackgroundFromStorage();
  }
});

// ポーリングをバックアップとして使用
setInterval(pollStorageForChanges, 1000);

function pollStorageForChanges() {
  loadModeFromStorage((mode) => {
    if (mode !== currentMode) {
      currentMode = mode;
      applyBackground(currentMode, currentColor);
    }
  });
}
```

## ファイルサイズ制限

- **コンテンツスクリプト（`src/content.ts`）**: 800 行程度を目安（描画ロジックを含むため例外的に大きい）
- **ポップアップスクリプト（`src/popup.ts`）**: 200 行以内
- **ユーティリティファイル**: 150 行以内
- **テストファイル**: 400 行以内

サイズ制限を超える場合は、以下のいずれかの対処をしてください:

1. **機能分割**: 関連する機能を論理的な単位に分割する
2. **ユーティリティ抽出**: 共通処理を共有モジュールに移動する
3. **実装の簡素化**: 機能を削減または単純化する

## 構造に関する約束事

### グローバルスコープの管理

ES modules を使用しない制約下で、グローバル汚染を防ぐため:

1. **単一の名前空間オブジェクト**: 必要な場合のみ、`Youtublur` のような単一のグローバルオブジェクトを使用
2. **IIFE の活用**: 即時実行関数式でスコープを限定
3. **モジュールパターン**: 関連する関数をオブジェクトやクロージャでグループ化

**例:**
```javascript
// グローバル汚染を防ぐためのモジュールパターン
const BackgroundManager = (function() {
  let currentMode = 'default';
  let currentColor = 'ffffff';

  function apply(mode, color) {
    // 実装...
  }

  function updateFromStorage() {
    // 実装...
  }

  // 公開APIのみを返す
  return {
    apply,
    updateFromStorage
  };
})();
```

### 非同期処理のパターン

Chrome API はコールバックベースですが、可能な限り Promise ベースのパターンを使用してください。

**例:**
```javascript
// Promise ラッパー
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

// async/await での使用
async function loadMode() {
  const data = await getStorage(['mode', 'timestamp']);
  return determineWinner(data);
}
```

### エラーハンドリング

1. **境界でのキャッチ**: すべての非同期操作は境界でエラーを捕捉
2. **フォールバックの提供**: 可能な場合は安全なデフォルト値を使用
3. **情報の記録**: エラーは console.warn/error で記録（ただし本番では最小限に）

## UI/UX パターン

### ポップアップの設計ルール

1. **3秒ルール**: ユーザーの操作から結果が反映されるまで 3 秒以内
2. **フィードバックの即時性**: モード切替時は視覚的なフィードバックをすぐに提供
3. **状態の可視化**: 現在のモードと色は常にポップアップで明確に表示

### コンテンツスクリプトのパフォーマンス

1. **監視の最適化**: MutationObserver のコールバックは最小限に
2. **サンプリングの活用**: 必要以上の頻度でのポーリングは避ける
3. **遅延読み込み**: 不要な初期化は遅延させる

## テストにおける設計制約

### テスト容易性の確保

1. **依存性の注入**: テストしやすいように、外部依存はパラメータとして注入可能に
2. **副作用の分離**: テスト対象から副作用を分離し、純粋な関数としてテスト
3. **境界の模倣**: Chrome API は可能な限りラッパー関数を介してアクセス

**例:**
```javascript
// テストしやすい設計
export function createStorageManager(storageApi = chrome.storage) {
  return {
    async getMode() {
      const data = await new Promise((resolve) =>
        storageApi.sync.get(['mode'], resolve)
      );
      return data.mode || 'default';
    }
  };
}

// テストではモックを注入
const mockStorage = { sync: { get: jest.fn() } };
const manager = createStorageManager(mockStorage);
```

## ドキュメントの要件

### JSDoc コメント

すべての公開関数は JSDoc でドキュメント化してください:

```javascript
/**
 * 指定されたモードと色に背景を適用する
 * @param {string} mode - 背景モード ('default', 'solid', 'blur')
 * @param {string} color - 16進数カラーコード（'ffffff' 形式）
 * @param {HTMLElement} [target=document.body] - 適用対象の要素
 * @returns {void}
 */
function applyBackground(mode, color, target = document.body) {
  // 実装...
}
```

### アーキテクチャ決定記録（ADR）

重要な設計決定は `docs/decisions/` に記録してください:
- 決定の背景
- 選択肢とその評価
- 決定の結果と影響
- 将来の見直し条件

## コードレビューのチェックリスト

- [ ] グローバルスコープの汚染がないか
- [ ] 関数の責任が単一か
- [ ] 副作用が適切に分離されているか
- [ ] エラーハンドリングが適切か
- [ ] テスト可能に設計されているか
- [ ] JSDoc が適切に書かれているか
- [ ] ファイルサイズ制限を超えていないか
- [ ] パフォーマンスへの配慮があるか
- [ ] 境界でのデータ検証があるか
- [ ] ドキュメントが更新されているか

## 変更の影響範囲ガイド

| 変更箇所 | 影響を受ける可能性のあるエリア | 確認すべき事項 |
|----------|------------------------------|----------------|
| `src/content.ts` | すべての YouTube ページ | E2E テスト、パフォーマンス、メモリリーク |
| `src/popup.ts` | 拡張機能アイクリック時の UI | UI テスト、アクセシビリティ |
| `src/storage-mode.ts` | ストレージ同期ロジック | 同期競合、データ整合性 |
| `globals.d.ts` / `tsconfig.json` | 型契約 / コンパイル設定 | `pnpm typecheck` のクリーン維持 |
| style.css | ポップアップの視覚デザイン | クロスブラウザ表示、アクセシビリティ |
| manifest.json | 拡張機能全体 | 権限、マッチパターン、ブラウザ互換性 |

## ベストプラクティスの要約

1. **単一責任の原則**: 各関数は一つのことだけを行う
2. **DRY（Don't Repeat Yourself）**: 重複コードは即座に排除
3. **KISS（Keep It Simple, Stupid）**: シンプルさを最優先
4. **YAGNI（You Aren't Gonna Need It）**: 今必要な機能だけを実装
5. **Fail Fast**: エラーは早く、はっきりと検出する
6. **Explicit over Implicit**: 暗黙の挙動より明示的な設計を