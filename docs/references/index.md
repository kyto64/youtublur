# リファレンス資料

プロジェクト開発に関連するリファレンス資料。

## ブラウザ拡張機能開発

### Chrome拡張機能

- [Chrome拡張機能ドキュメント（公式）](https://developer.chrome.com/docs/extensions/mv3/)
- [Manifest V3 移行ガイド](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/)
- [Chrome API リファレンス](https://developer.chrome.com/docs/extensions/reference/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)

### Firefox拡張機能

- [Firefox拡張機能開発ガイド](https://extensionworkshop.com/documentation/develop/)
- [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [AMO ポリシー](https://extensionworkshop.com/documentation/publish/add-on-policies/)

## AI駆動開発

### OpenAI Harness Engineering

- [Harness Engineering: Leveraging Codex in an Agent-First World](https://openai.com/index/harness-engineering/) - オリジナル記事
  - 日付: 2026年2月11日
  - 著者: Ryan Lopopolo (OpenAI)
  - 概要: AIエージェントによるソフトウェア開発のベストプラクティス

### 関連記事

- [An open-source spec for Codex orchestration: Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/)
  - Codexエージェントのためのオーケストレーション仕様

### ベストプラクティス

1. **漸進的開示（Progressive Disclosure）**
   - 最小の安定したエントリーポイントから始める
   - 必要に応じて文脈を段階的に提供
   - コンテキストが多すぎるとエージェントのパフォーマンスが低下

2. **知識のコード化（Knowledge as Code）**
   - すべてのドキュメントをリポジトリ内にバージョン管理
   - 設計判断は ADR として記録
   - ルールと原則をリンターで強制

3. **機械的強制（Mechanical Enforcement）**
   - ルールは自動テストやリンターで強制
   - 手動レビューに依存しない
   - 違反はCIで検出

4. **可視性の最大化（Legibility First）**
   - エージェントが直接アクセスできるコンテキストを最大化
   - 外部の知識ベース（Google Docsなど）は避ける
   - すべての判断根拠をリポジトリ内に保存

## 開発ツール

### パッケージ管理

- **pnpm**: v10.33.2（packageManagerフィールドで固定）
  - 高速なパッケージインストール
  - 厳密な依存管理
  - ディスクスペースの効率的な使用

### テストフレームワーク

- **Vitest**: v4.1.4
  - Viteベースのテストランナー
  - 高速なテスト実行
  - コードカバレッジサポート（@vitest/coverage-v8）

- **jsdom**: v29.0.2
  - ブラウザ環境のシミュレーション
  - DOM操作のテスト

- **Playwright**: v1.59.1
  - E2Eテスト自動化
  - クロスブラウザテスト
  - Chrome、Firefox、Safari、Edgeサポート

### ビルドツール

- **Vite Plus**: v0.1.19 (@voidzero-dev/vite-plus-test)
  - 高速な開発サーバー
  - HMR（Hot Module Replacement）
  - 生のESモジュールサポート

### Lintツール

- **Vite Plus Core**: v0.1.19 (@voidzero-dev/vite-plus-core)
  - コード品質チェック
  - カスタムルールの適用

### その他のツール

- **chrome-webstore-upload**: v6.0.0（`CHROME_PUBLISHER_ID` 必須）
  - Chrome Web Storeへの自動アップロード

- **commit-and-tag-version**: v12.7.1
  - バージョンの自動バンプ
  - CHANGELOGの自動生成
  - gitタグの作成

## Chrome API リファレンス

### 主に使用するAPI

#### chrome.storage

```javascript
// ストレージからデータを取得
chrome.storage.sync.get(['key1', 'key2'], (result) => {
  console.log(result.key1, result.key2);
});

// ストレージにデータを保存
chrome.storage.sync.set({key: 'value'}, () => {
  console.log('保存完了');
});

// 変更のリッスン
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log(`Storage area: ${areaName}`);
  console.log('Changed items: ', changes);
});
```

#### chrome.runtime

```javascript
// メッセージの受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  sendResponse({response: 'OK'});
});

// メッセージの送信
chrome.runtime.sendMessage({greeting: 'hello'}, (response) => {
  console.log(response);
});
```

#### chrome.tabs

```javascript
// 現在のアクティブタブの取得
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  console.log(tabs[0]);
});
```

## Firefox AMO リファレンス

### 必須設定

```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "youtublur@kyto64.github.io",
      "strict_min_version": "109.0"
    }
  }
}
```

### 提出プロセス

1. AMOでアドオンを登録
2. APIキーを取得
3. `AMO_ADDON_ID`、`AMO_JWT_ISSUER`、`AMO_JWT_SECRET`を設定
4. `AMO_PUBLISH=true`でGitHub Actionsが自動アップロード

## セキュリティリファレンス

### XSS対策

- `innerHTML`の代わりに`textContent`を使用
- ユーザー入力は必ず検証・サニタイズ
- Content Security Policy（CSP）を適切に設定
- 外部リソースの読み込みを制限

### 権限管理

- 最小権限の原則を遵守
- 不要な権限は要求しない
- `manifest.json`の権限宣言を定期的にレビュー

### プライバシー保護

- ユーザーデータの収集は最小限
- 外部へのデータ送信は行わない
- データはローカルにのみ保存

## リリース手順

詳細は [docs/release.md](../release.md) を参照。

### 自動リリース

- GitHub Actionsの`publish.yml`が自動トリガー
- Chrome Web Storeへの自動アップロード
- GitHub Releaseの作成
- Firefox AMOへの自動アップロード（設定の場合）

### 手動リリース

```bash
# 1. テストの実行
pnpm test
pnpm run test:e2e

# 2. Lintチェック
pnpm exec vp lint

# 3. バージョンのバンプ
pnpm run release

# 4. Pushとタグの作成
git push --follow-tags origin master
```

## 関連プロジェクト

### 類似プロジェクト

- [Dark Reader](https://github.com/darkreader/darkreader) - ダークモード拡張
- [uBlock Origin](https://github.com/gorhill/uBlock) - 広告ブロッカー（高性能なコンテンツスクリプトの例）
- [Vimium](https://github.com/philc/vimium) - キーボード操作拡張

### 学習リソース

- [Extension Workshop](https://extensionworkshop.com/) - Mozillaの拡張機能開発チュートリアル
- [Chrome Extensions Samples](https://github.com/GoogleChrome/chrome-extensions-samples) - 公式サンプル集
- [Awesome Browser Extensions](https://github.com/rbracco/awesome-browser-extensions) - 拡張機能開発のリソース集

## 文言（i18n）リファレンス

### ロケールサポート

- en（英語） - ベースロケール
- es（スペイン語）
- id（インドネシア語）
- ja（日本語）
- ko（韓国語）
- pt_BR（ブラジルポルトガル語）
- zh_CN（簡体字中国語）
- zh_TW（繁体字中国語）

### キーの命名規則

- スネークケースを使用（例: `background_mode_label`）
- コンポーネント名をプレフィックスに（例: `popup_title`）
- 意味のある説明を含める（例: `content_player_detection_failed`）

### メッセージのフォーマット

各キーには必ず以下を含める:

```json
{
  "message": "表示されるテキスト",
  "description": "翻訳者・開発者向けの説明"
}
```

## FAQ

### Q: 新しい機能を追加する際のプロセスは？

A: 以下の手順に従ってください。

1. 機能の要件を明確にする
2. 関連するドキュメント（DESIGN.mdなど）を更新
3. 実装する
4. テストを追加または更新
5. Lintを実行し、エラーを解消
6. PRを作成し、レビューを受ける

### Q: ブラウザ間の違いをどのように扱いますか？

A: 以下の原則に従ってください。

- 可能な限り共通のコードを使用
- ブラウザ特有の機能は分離して実装
- 適切な機能検出（feature detection）を行う
- 両ブラウザでテストを行う

### Q: パフォーマンス問題が発生したら？

A: 以下の手順で対処してください。

1. Chrome DevToolsのPerformanceタブでプロファイリング
2. メモリリークがないか確認
3. 実行時間の長い処理を特定
4. 必要に応じて最適化（サンプリングの調整、非同期化など）
5. 再度プロファイリングで改善を確認

## サポート

問題や質問がある場合は以下のリソースを確認してください。

- [GitHub Issues](https://github.com/kyto64/youtublur/issues) - バグ報告や機能リクエスト
- [AGENTS.md](AGENTS.md) - 開発手順と基本ルール
- [ARCHITECTURE.md](ARCHITECTURE.md) - システムアーキテクチャ
- [DESIGN.md](DESIGN.md) - 設計原則

## 更新履歴

| 日付 | 変更内容 | 担当者 |
|------|----------|--------|
| 2026-04-30 | リファレンス構造の作成 | AI Agent |
| 2026-04-30 | OpenAI Harness Engineeringの追加 | AI Agent |
