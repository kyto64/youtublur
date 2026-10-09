# テストガイド

プロジェクトのテストに関する包括的なガイドです。

## テスト戦略

### テストピラミッド

```
        E2Eテスト (10%)
           ↑
    統合テスト (20%)
           ↑
    ユニットテスト (70%)
```

### テストの原則

1. **早いフィードバック**: ユニットテストは高速に実行
2. **信頼性**: テストは常に同じ結果を返す
3. **独立性**: テストは互いに依存しない
4. **自己検証**: テストは成功/失敗を自動判定
5. **網羅性**: 主要なパスはすべてテストされる

## ユニットテスト

### テストフレームワーク

- **Vitest**: Viteベースの高速なテストランナー
- **jsdom**: ブラウザ環境のシミュレーション

### テストの基本構造

```javascript
describe('機能名', () => {
  beforeEach(() => {
    // 各テスト前のセットアップ
  });

  afterEach(() => {
    // 各テスト後の後片付け
  });

  it('期待する動作', () => {
    // テストの実行
    // 結果の検証
  });
});
```

### 境界値テスト

```javascript
describe('detectYouTubeTheme', () => {
  it('ダークテーマを正しく検出する', () => {
    // ダークテーマの条件をシミュレート
    Object.defineProperty(document.documentElement, 'hasAttribute', {
      value: (attr) => attr === 'dark',
    });
    
    const result = detectYouTubeTheme();
    expect(result).toBe('dark');
  });

  it('ライトテーマを正しく検出する', () => {
    // ライトテーマの条件をシミュレート
    Object.defineProperty(document.documentElement, 'hasAttribute', {
      value: (attr) => attr !== 'dark',
    });
    
    const result = detectYouTubeTheme();
    expect(result).toBe('light');
  });
});
```

### 非同期処理のテスト

```javascript
describe('loadModeFromStorage', () => {
  it('ストレージからモードを読み込む', async () => {
    // モックの設定
    chrome.storage.sync.get = vi.fn((keys, callback) => {
      callback({ [STORAGE_KEY]: 'solid', [STORAGE_TIMESTAMP_KEY]: 1234567890 });
    });

    const result = await loadModeFromStorage();
    expect(result).toBe('solid');
  });

  it('エラー時はデフォルト値を返す', async () => {
    // エラーをシミュレート
    chrome.runtime.lastError = new Error('Storage error');
    
    const result = await loadModeFromStorage();
    expect(result).toBe('blur');
  });
});
```

### モックの使用

```javascript
// Chrome APIのモック
const mockChrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
  },
};
```

## E2Eテスト

キーボードショートカットは `e2e/shortcuts.spec.js`。Chromium ではポップアップの割り当て表示、Tab / 矢印 / Enter によるポップアップ操作、service worker の `runShortcutCommand` が開いている watch タブのモードとブラー強度を変えることを見る。Firefox プロジェクトは拡張をロードしないため skip する。

単色の色は `solid-color.test.js` と `e2e/solid-color.spec.js`。未設定ではテーマ色のまま、選んだ `#rrggbb` はリロードなしで `#movie_player` の `data-yt-solid-color` に届き、テーマ属性を変えても維持される。ポップアップでは単色のときだけプリセットにフォーカスが当たり、矢印キーで移動する。

### テストフレームワーク

- **Playwright**: クロスブラウザのE2Eテスト

### テストの記述

```javascript
import { test, expect } from '@playwright/test';

test.describe('youtublur E2Eテスト', () => {
  test('ブラーモードに切り替える', async ({ page }) => {
    // YouTubeページに移動
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    
    // 拡張機能ポップアップを開く（テスト用のトリガーを使用）
    // 注意: このテストを動作させるには、src/content.ts に以下のリスナー実装が必要です:
    // window.addEventListener('message', (event) => {
    //   if (event.data.type === 'TEST_SET_MODE') {
    //     applyMode(event.data.mode);
    //   }
    // });
    await page.evaluate(() => {
      window.postMessage({ type: 'TEST_SET_MODE', mode: 'blur' }, '*');
    });
    
    // 背景がブラーになることを確認
    const player = await page.$('#movie_player');
    await expect(player.locator('#yt-light-bg-blur-canvas')).toBeVisible();
  });

  test('単色モードに切り替える', async ({ page }) => {
    await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    
    // 拡張機能ポップアップを開く（テスト用のトリガーを使用）
    // 注意: このテストを動作させるには、src/content.ts に以下のリスナー実装が必要です:
    // window.addEventListener('message', (event) => {
    //   if (event.data.type === 'TEST_SET_MODE') {
    //     applyMode(event.data.mode);
    //   }
    // });
    await page.evaluate(() => {
      window.postMessage({ type: 'TEST_SET_MODE', mode: 'solid' }, '*');
    });
    
    // 背景色が適用されていることを確認
    const player = await page.$('#movie_player');
    await expect(player).toHaveCSS('background-color', 'rgb(24, 24, 24)'); // #181818
  });
});
```

### テスト実行

```bash
# E2Eテストの実行
pnpm run test:e2e

# ヘッドレスモード
pnpm run test:e2e -- --headed=false

# 特定のテストのみ実行
pnpm run test:e2e -- --grep "モード切り替え"
```

## 統合テスト

### ストレージ同期のテスト

```javascript
describe('reconcileStorageCopies', () => {
  it('syncが新しい場合、localを同期する', () => {
    const syncData = { [STORAGE_KEY]: 'blur', [STORAGE_TIMESTAMP_KEY]: 2000 };
    const localData = { [STORAGE_KEY]: 'solid', [STORAGE_TIMESTAMP_KEY]: 1000 };
    
    const result = reconcileStorageCopies(syncData, localData);
    
    expect(result.mode).toBe('blur');
    expect(result.syncedToLocal).toBe(true);
  });

  it('localが新しい場合、syncを同期する', () => {
    const syncData = { [STORAGE_KEY]: 'blur', [STORAGE_TIMESTAMP_KEY]: 1000 };
    const localData = { [STORAGE_KEY]: 'solid', [STORAGE_TIMESTAMP_KEY]: 2000 };
    
    const result = reconcileStorageCopies(syncData, localData);
    
    expect(result.mode).toBe('solid');
    expect(result.syncedToSync).toBe(true);
  });
});
```

## パフォーマンステスト

### FPS監視テスト

```javascript
describe('FPS監視', () => {
  it('低FPSで描画間隔が増加する', () => {
    const initialInterval = getCurrentDrawInterval();
    
    // 低FPSをシミュレート
    for (let i = 0; i < 60; i++) {
      updateFPS(performance.now() + i * 100); // 10FPS
    }
    
    adjustDrawInterval();
    
    const newInterval = getCurrentDrawInterval();
    expect(newInterval).toBeGreaterThan(initialInterval);
  });

  it('高FPSで描画間隔が減少する', () => {
    const initialInterval = getCurrentDrawInterval();
    
    // 高FPSをシミュレート
    for (let i = 0; i < 60; i++) {
      updateFPS(performance.now() + i * 10); // 100FPS
    }
    
    adjustDrawInterval();
    
    const newInterval = getCurrentDrawInterval();
    expect(newInterval).toBeLessThan(initialInterval);
  });
});
```

## テストカバレッジ

### カバレッジ目標

| カテゴリ | 目標 | 現在 |
|---------|------|------|
| ステートメント | 80% | - |
| ブランチ | 75% | - |
| 関数 | 80% | - |
| 行 | 80% | - |

### カバレッジの確認

```bash
# カバレッジ付きテストの実行
pnpm run test:coverage

# レポートの確認
open coverage/index.html
```

### カバレッジ不足の対応

1. **未テストの関数を特定**
   ```bash
   pnpm run test:coverage -- --reporter=text
   ```

2. **境界条件をテスト**
   - null/undefinedの入力
   - 空の配列
   - 異常値
   - ネットワークエラー

3. **エラーパスをテスト**
   - try-catchブロックの各catch
   - Promiseのreject
   - タイムアウト

## テスト環境

### ブラウザ環境のシミュレーション

```javascript
// jsdomによるDOM環境のセットアップ
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = window.document;
global.navigator = window.navigator;
```

### Chrome APIのモック

```javascript
// content.test.js で使用
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
  },
};
```

## テストデータ

### テストユーティリティ

```javascript
// test-utils.js
export function createMockVideo() {
  return {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 4,
  };
}

export function createMockCanvas() {
  return {
    width: 800,
    height: 600,
    style: {},
    getContext: () => ({
      drawImage: vi.fn(),
      filter: '',
    }),
  };
}

export function createMockPlayer() {
  return {
    style: {},
    dataset: {},
    querySelector: () => createMockVideo(),
    insertBefore: vi.fn(),
    clientWidth: 1280,
    clientHeight: 720,
  };
}
```

## CI/CDでのテスト

### GitHub Actions

実装は [`.github/workflows/test.yml`](../.github/workflows/test.yml)。Test は Node.js `22.22.2`、`24`、`26` のマトリクスで、チェック名 `test` はすべてのレグが成功したときだけ成功する。E2E（`.github/workflows/e2e.yml`）とリリースは Node.js 22 のまま。以下は構成イメージです。

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run type check
        run: pnpm typecheck
      
      - name: Run unit tests
        run: pnpm test
      
      - name: Run lint
        run: pnpm exec vp lint
      
      - name: Upload coverage
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/
```

## デバッグテクニック

### テストのデバッグ

```javascript
// 特定のテストのみ実行
test.only('特定のテスト', () => {
  // テストコード
});

// テストのスキップ
test.skip('スキップするテスト', () => {
  // テストコード
});

// コンソールログの確認
it('デバッグ', () => {
  console.log('値:', value);
  expect(value).toBe(expected);
});
```

### カバレッジの可視化

```bash
# HTMLレポートの生成
pnpm run test:coverage -- --reporter=html

# ブラウザで確認
open coverage/index.html
```

## テストメトリクス

### 定期的な確認項目

- [ ] テストの実行時間（目標: <30秒）
- [ ] カバレッジ率（目標: 80%以上）
- [ ] テストの失敗率（目標: 0%）
- [ ] フラッキングテストの有無
- [ ] 新機能のテストカバレッジ

### 改善サイクル

1. テストの実行と結果の確認
2. 失敗したテストの原因究明
3. テストの修正または実装の修正
4. 再度テストを実行
5. カバレッジの確認と必要に応じたテストの追加

## ベストプラクティス

### 良いテストの特徴

- **AAAパターン**: Arrange, Act, Assert
- **一つのこと**: 1つのテストは1つのことをテストする
- **読みやすい**: テスト名が何をテストしているかわかる
- **独立している**: 他のテストに依存しない
- **高速である**: 実行が速い

### 避けるべきテスト

- 実装の詳細に依存するテスト
- 複数のアサーションを含むテスト（1つの意味のある動作をテストする場合を除く）
- 実行に時間がかかるテスト
- 不安定なテスト（フラッキングするテスト）

## 参考資料

- [Vitestドキュメント](https://vitest.dev/)
- [Playwrightドキュメント](https://playwright.dev/)
- [jsdomドキュメント](https://github.com/jsdom/jsdom)