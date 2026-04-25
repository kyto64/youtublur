import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**']
  }
});
