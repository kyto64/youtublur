import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'lcov'],
      include: ['content.js', 'popup.js', 'storage-mode.js'],
      exclude: [
        '**/*.test.js',
        'e2e/**',
        'scripts/**',
        'playwright.config.js'
      ]
    }
  }
});
