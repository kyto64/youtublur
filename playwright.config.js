const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
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
