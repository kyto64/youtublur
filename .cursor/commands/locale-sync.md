# ロケール（i18n）の整合チェック

`_locales` 配下の [Chrome i18n messages.json](https://developer.chrome.com/docs/extensions/reference/api/i18n) 形式ファイルを、英語を基準に揃える。

## 基準

- **ソース・オブ・トゥルース**: [_locales/en/messages.json](_locales/en/messages.json)
- `manifest.json` の `default_locale` は `en`。

## このリポジトリのロケール一覧

次の各ディレクトリに `messages.json` がある: `en`, `ja`, `ko`, `zh_CN`, `zh_TW`, `es`, `id`, `pt_BR`。

## チェックリスト（新規キーを追加したとき）

1. `en/messages.json` にキー、`message`、開発者向け `description` を追加する。
2. 上記と**同じキー**を、他のすべてのロケールの `messages.json` に追加する（翻訳は各言語の `message` に記載）。
3. 各エントリに `description` を残す（英語の説明でよい。ストア／翻訳コンテキスト用）。
4. JSON の構文・カンマ漏れがないか確認する。

## 注意

- キー名の typo や、あるロケールだけ欠けているキーがないかを重点的に確認する。
- UI 文言を変えただけでキーが増えない場合は、既存キーの `message` だけ更新すればよい。
