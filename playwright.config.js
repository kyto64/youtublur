const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  // CI のジョブ上限（15 分）より前に Playwright 側で打ち切り、どのテストで止まったかを
  // レポートに残す。ローカルでは無制限。
  globalTimeout: process.env.CI ? 8 * 60_000 : 0,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  // list: テストごとの結果をログへその場で出す（途中で cancel されても止まった箇所が分かる）。
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 0,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox',
      // Firefox は chrome API モックで content.js を注入するだけで、実拡張を読み込めない。
      // 実拡張が必要なスペックは Firefox では常に skip されるため、fixture でブラウザを
      // 起動する前に testMatch で除外する。Firefox で走らせるスペックを増やすときはここに足す。
      testMatch: ['**/shorts.spec.js', '**/spa-navigation.spec.js', '**/blur.spec.js'],
      use: {
        ...devices['Desktop Firefox'],
      },
    },
  ],
});
