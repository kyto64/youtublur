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

単色の色は `solid-color.test.js` と `e2e/solid-color.spec.js`。未設定ではテーマ色のまま、選んだ `#rrggbb` はリロードなしで `#movie_player` の `data-yt-solid-color` に届き、テーマ属性を変えても維持される。ポップアップでは単色のときだけプリセットにフォーカスが当たり、矢印キーで移動する。保存済みの単色は、検索結果で content script を初期化したあと `navigateToWatchViaSpa` で `/watch` に入っても塗られる（直接 `/watch` を開く経路とは別）。

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

## ブラー描画の検証（issue #107）

ブラー描画は「見た目」依存のため、ユニット/E2E のアサーションだけでは不具合を見逃しやすい。
過去に issue #107（初回ロードでブラーが反映されず、タブ切替で初めて正常化する）が
E2E を素通りした事例があるため、以下の前提と手順で検証する。

### 前提となる描画モデル

- blur canvas は `#movie_player` に挿入され、毎フレーム動画フレームをぼかして描画後、
  `clearVideoContentRect` で**動画表示矩形だけを透明にクリア**する。
  → ブラーは「プレイヤーの余白（レターボックス/ピラーボックス帯）」にのみ視認できる。
- 既定の watch 表示では YouTube が `#movie_player` を**動画アスペクトぴったりに合わせる**ため帯が無く、
  ブラーは事実上見えない。帯（=ブラーが見える状態）が生じるのは**シアター/ワイドレイアウト**。
  実機検証で帯の画素を見るときはシアターモードに切り替えること。
- issue #107 の中核は「canvas のバッキングサイズがプレイヤー表示寸法に追従しているか」。
  描画ループ（`syncBlurCanvasSize`）が毎フレーム自己修復するため、帯の有無に関係なく
  **無操作の初回ロードで `canvas.width/height == #movie_player の client box` を検証**できる。

### レイヤ別の検証手段

1. **ユニットテスト**（`content.test.js`）— 決定的・最優先。
   外部 resize イベントなしでループがサイズ不一致を自己修復することを検証する
   （`syncBlurCanvasSize` / 「blur loop self-heals canvas size ...」テスト）。

2. **E2E**（`e2e/blur.spec.js`）— 実 YouTube 上で検証。
   - `assertCanvasTracksContainer()`: **無操作の初回ロード**で canvas がプレイヤー寸法に追従しているか
     （issue #107 の回帰ガード。ユーザー操作に依存しない）。
   - `assertAmbientBandBlurred()`: シアター切替で帯を発生させた後、帯のブラー描画と中央クリアを検証。
   - 注意: 検証より前に `.ytp-size-button` をクリックすると、その resize が不具合を**修復してしまい**
     検証が無意味になる。初回ロードの追従チェックは必ずクリック前に行う。

3. **AI-Agentic 検証**（`e2e/ai-verify/`、`pnpm run verify:ai-blur`）— E2E が脆い/再現が難しい場合の手段。
   無操作の初回ロードとシアターのスクリーンショット + 決定的メトリクス（canvas 追従・帯のブラー・
   空間分散など）+ AI 判定用プロンプトを `e2e/ai-verify/artifacts/`（git 管理外）に生成する。
   明確なメトリクス異常は終了コードで返し（0=OK / 1=メトリクス異常 / 2=採取失敗）、
   定性判定はスクリーンショットを AI に渡して `PASS/FAIL` を得る。詳細は
   [`e2e/ai-verify/README.md`](../e2e/ai-verify/README.md)。

### サンドボックス/ヘッドレスでの注意

パッケージ拡張の content script は、環境によってはヘッドレス Chrome（`--load-extension`）で
注入されないことがある。その場合は Firefox fixture と同じ手法で `chrome` をモックし、
`storage-mode.js` + `content.js` を `addInitScript` で**手動注入**すれば、実 YouTube DOM 上で
content script ロジックを検証できる（`e2e/ai-verify/capture-blur-evidence.mjs` 参照）。

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

## 新レイアウト（シアター切替なし・左右余白）

新レイアウトではプレイヤー（`#movie_player`）の左右に余白が出る。その余白はプレイヤー外側の祖先要素なので、`src/content.ts` の `getMarginHost()` が `#player-container-outer` / `#player` のうちプレイヤーより広いもの（複数ならもっとも外側＝最も広いもの）を余白の描画先として選ぶ。候補祖先は幅に関係なくリサイズ監視し、host だけが後から広がっても塗り直す。ブラーは host の背面に `#yt-light-bg-blur-margin-canvas` を置いて動画をブラー描画し、単色は host に `background-color` を設定する。プレイヤーより広い祖先が無い旧レイアウト（通常・シアター・全画面）では host は `null` で、挙動は変わらない。余白 canvas はプレイヤーの背面にあるため動画矩形を `clearRect` せず、Firefox（Gecko）では専用の snap canvas 経由で描き、ループ停止時は本体用と同様に余白用 snap canvas もサイズ 0 にして解放する。単色で塗った host の元の背景指定と、余白 canvas のために付けた `position` / `isolation` の元のインライン値は、host の切り替え・不成立・teardown 時に戻す。余白 canvas だけが DOM から外れた場合は描画ループが検知して再生成する（`e2e/error-recovery.spec.js`、Firefox はスキップ）。同幅の候補が並ぶときは最外側が host になるため、E2E は親要素を host として検証する。

`e2e/new-layout.spec.js` は、実ページから `.ytp-size-button` を外し `#player-container-outer` に左右 padding を与えて新レイアウトを近似し、余白の canvas（ブラー）と背景色（単色）を検証する。host だけが後から広がるケースと、`#player` が `#player-container-outer` より広い入れ子ケースも E2E で確認する。ユニットは `content.test.js` の「new layout」ケース。

**注意**: 実 YouTube の新レイアウト DOM は実行環境から youtube.com に到達できず未確認。host のセレクタは PR 説明とレビュー指摘（余白は `#player-container-outer` の padding という推測）に基づく。実機での確認は手動で行う。
