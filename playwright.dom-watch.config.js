const { defineConfig, devices } = require('@playwright/test');

/**
 * 実 youtube.com の DOM が、拡張の依存セレクタ（e2e/dom-watch/youtube-dom-contract.js）と
 * 一致するかの定期チェック用設定。`.github/workflows/youtube-dom-watch.yml` からだけ使う。
 *
 * - テストファイルは `*.check.js`。既定の playwright.config.js（testMatch は *.spec.js）には
 *   拾われないので、PR の required checks（test-e2e）には影響しない。
 * - 拡張はロードしない（DOM の構造だけを見る）。workers は増やさない（1 本ずつ直列）。
 * - リトライ（同意ダイアログ・広告・遅いロード）はテスト内の attempt ループで吸収する。
 *   test 自体の retries は 0 にして、失敗の理由がログに 1 回だけ出るようにする。
 * - リトライ全体は時間予算（check.js の RETRY_BUDGET_MS = 100 秒。各待機は残り予算でクランプ）で、
 *   SPA 遷移の待機（最大約 90 秒）と合わせても test の timeout（4 分）に収まる。
 *   それでも時間切れになったときは afterEach が代わりのレポートを残す（レポート欠落で issue が作られないのを防ぐ）。
 */
module.exports = defineConfig({
  testDir: './e2e/dom-watch',
  testMatch: '**/*.check.js',
  timeout: 4 * 60 * 1000,
  globalTimeout: 12 * 60 * 1000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['json', { outputFile: 'dom-watch-results/playwright.json' }]],
  outputDir: 'dom-watch-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    // CI では headless shell を入れず（--no-shell）、フル Chromium の新 headless を使う。
    channel: 'chromium',
    locale: 'en-US',
    trace: 'off',
    // ローカル検証用の上書き（CI では未設定で、playwright install したブラウザを使う）。
    launchOptions: { executablePath: process.env.DOM_WATCH_CHROMIUM_PATH || undefined },
  },
  projects: [{ name: 'dom-watch' }],
});
