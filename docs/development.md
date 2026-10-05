# 開発ガイド

プロジェクトの開発に関する包括的なガイドです。

## 開発環境のセットアップ

### 前提条件

- Node.js 22.22.2 以上、24.15 以上、または 26 以上（`jsdom` 30.1.1 の要件。依存ツリー中最も厳しい）
- pnpm 9+
- Git
- Chrome または Firefox ブラウザ

### 初期セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/kyto64/youtublur.git
cd youtublur

# 依存関係のインストール
pnpm install

# ビルド
pnpm build

# テストの実行
pnpm test
```

### Git ワークフロー

このプロジェクトでは、master ブランチでの直接作業は禁止されています。常に git worktree を使用してください。

```bash
# 新しい機能の場合
git worktree add -b feature/<name> ../youtublur-<name> master

# 既存のブランチの場合
git worktree add ../youtublur-<name> <branch-name>

# worktree に移動
cd ../youtublur-<name>

# 依存関係をインストール
pnpm install
```

### 開発サイクル

1. **コードの変更**: `src/*.ts` ファイルを編集
2. **型チェック**: `pnpm typecheck` で型エラーを確認
3. **ビルド**: `pnpm build` でコンパイル
4. **テスト**: `pnpm test` でユニットテストを実行
5. **Lint**: `pnpm exec vp lint` でコード品質を確認
6. **コミット**: `git add -A && git commit -m "type: message"`
7. **プッシュ**: `git push -u origin ブランチ名`
8. **PR作成**: `gh pr create`

## コード構造

### ディレクトリ構成

```
youtublur/
├── src/                          # ソースコード
│   ├── content.ts                # コンテンツスクリプト（YouTubeページで実行）
│   ├── popup.ts                  # ポップアップUIのロジック
│   └── storage-mode.ts          # ストレージ同期ユーティリティ
├── globals.d.ts                  # 型定義
├── manifest.json                 # 拡張機能マニフェスト
├── popup.html                    # ポップアップUI
├── style.css                     # スタイルシート
├── content.js                    # コンパイル成果物（編集禁止）
├── popup.js                      # コンパイル成果物（編集禁止）
├── storage-mode.js              # コンパイル成果物（編集禁止）
├── docs/                         # ドキュメント
└── ...
```

### レイヤーアーキテクチャ

```
UIレイヤー（popup.ts）
    ↓
ビジネスロジックレイヤー（content.ts）
    ↓
データ永続化レイヤー（storage-mode.ts）
```

## TypeScript 開発

### 基本ルール

- すべての関数は型注釈を持つ
- `strict: true` が有効（`tsconfig.json` で設定）
- 戻り値の型は明示的に指定
- `BackgroundMode = 'blur' | 'solid'` を使用（`globals.d.ts` で定義）

### 型定義の例

```typescript
/**
 * 背景モードの種類
 */
type BackgroundMode = 'blur' | 'solid';

/**
 * ストレージに保存されるデータ
 */
interface StorageData {
  mode: BackgroundMode;
  color: string;
  timestamp: number;
}

/**
 * モードを適用する
 * @param mode - 適用する背景モード
 * @param target - 適用対象の要素（省略時は document.body）
 */
function applyMode(mode: BackgroundMode, target?: HTMLElement): void {
  // 実装...
}
```

## JSDoc コメント

すべての公開関数は JSDoc でドキュメント化してください。

### 記述例

```typescript
/**
 * 指定されたモードと色に背景を適用する
 * @param {string} mode - 背景モード（'default', 'solid', 'blur'）
 * @param {string} color - 16進数カラーコード（'ffffff' 形式）
 * @param {HTMLElement} [target=document.body] - 適用対象の要素
 * @returns {void}
 */
function applyBackground(mode: BackgroundMode, color: string, target: HTMLElement = document.body): void {
  // 実装...
}
```

## テスト

### ユニットテスト

```bash
# テストの実行
pnpm test

# カバレッジ付きテスト
pnpm run test:coverage

# 型チェック（pretest で自動実行）
pnpm typecheck
```

### E2Eテスト

```bash
# E2Eテストの実行
pnpm run test:e2e
```

### テストの記述ルール

1. 各関数には対応するテストを作成
2. 境界条件（エッジケース）をテスト
3. エラーハンドリングをテスト
4. 非同期処理は適切に await する
5. モックを使用して外部依存を排除

## Lint ルール

```bash
# Lintチェックの実行
pnpm exec vp lint
```

### 必須チェック項目

- [ ] すべてのユニットテストが通過
- [ ] Lintエラーが0
- [ ] コードカバレッジが75%以上
- [ ] 新機能にはテストが追加されている

## リリース手順

```bash
# 1. テストの実行
pnpm test

# 2. Lintチェック
pnpm exec vp lint

# 3. バージョンのバンプとリリース
pnpm run release

# 4. リモートにプッシュ
git push --follow-tags origin master
```

**注意**: バージョン番号は手動で変更しないでください。`pnpm run release` を使用してください。

## 開発ベストプラクティス

### コード品質

- **DRY**: コードの重複を避ける
- **KISS**: シンプルを保つ
- **YAGNI**: 今必要な機能だけを実装
- **単一責任**: 1つの関数は1つのことだけを行う

### エラーハンドリング

- すべての非同期処理は境界でエラーを捕捉
- 安全なフォールバック値を提供
- エラーは console.warn/error で記録

### パフォーマンス

- コンテンツスクリプトは軽量に保つ（目標: <5MB）
- MutationObserver のコールバックは最小限に
- 不要なポーリングは避ける

### セキュリティ

- 最小権限の原則を遵守
- 外部ネットワーク通信は行わない
- XSS対策を施す
- ユーザーデータはローカルにのみ保存

## デバッグ

### コンテンツスクリプトのデバッグ

1. Chrome で `chrome://extensions/` を開く
2. 拡張機能の「詳細」ページを開く
3. 「ビューの検証」からコンテンツスクリプトを確認
4. DevTools の Console タブでログを確認

### ポップアップのデバッグ

1. 拡張機能アイコンを右クリック
2. 「ポップアップの検証」を選択
3. DevTools を使用してデバッグ

## ブラウザ間の違い

### Chrome vs Firefox

| 機能 | Chrome | Firefox |
|------|--------|---------|
| 背景スクリプト | Service Worker | Service Worker |
| Side Panel API | 対応 | 未対応 |
| ストレージ同期 | 自動 | アカウント同期による自動同期 |
| 拡張機能 ID | 固定 | 開発者ハブで取得 |

### 対応ブラウザ

- Chrome（バージョン 88 以上、Manifest V3 対応）
- Firefox（バージョン 109 以上、AMO 対応）

## トラブルシューティング

### ビルドエラー

```bash
# TypeScriptの型チェック
pnpm typecheck

# 依存関係の再インストール
# 注意: pnpm-lock.yaml を削除すると依存パッケージのバージョンが意図せず変わるリスクがあります。
# 通常は node_modules の削除だけで解決することが多いため、ロックファイルは削除しないことを推奨します。
rm -rf node_modules
pnpm install
```

### テストの失敗

```bash
# テストの再実行
pnpm test

# キャッシュのクリア
pnpm exec vite --force
```

### Lintエラー

```bash
# Lintエラーの確認
pnpm exec vp lint

# 手動で修正（自動フォーマッターはありません）
```

## リソース

- [Chrome拡張機能ドキュメント](https://developer.chrome.com/docs/extensions/mv3/)
- [Firefox拡張機能開発ガイド](https://extensionworkshop.com/documentation/develop/)
- [TypeScriptドキュメント](https://www.typescriptlang.org/docs/)
- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)