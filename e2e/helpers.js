/**
 * Shared E2E helpers for YouTube + extension flows (Chromium MV3).
 */

const STABLE_WATCH_VIDEO_ID = 'dQw4w9WgXcQ';
const STORAGE_KEY_MODE = 'playerBackgroundMode';

/**
 * Wait until chrome.storage.sync reflects the expected mode (avoids fixed sleep after save).
 * @param {import('@playwright/test').Page} popupPage
 * @param {'blur'|'solid'} expectedMode
 * @param {{ timeout?: number }} [options]
 */
async function waitForExtensionStorageMode(popupPage, expectedMode, options = {}) {
  const timeout = options.timeout ?? 15000;
  await popupPage.waitForFunction(
    ({ key, mode }) =>
      new Promise((resolve) => {
        try {
          chrome.storage.sync.get([key], (r) => {
            resolve(r[key] === mode);
          });
        } catch {
          resolve(false);
        }
      }),
    { key: STORAGE_KEY_MODE, mode: expectedMode },
    { timeout }
  );
}

/**
 * playwright.config の actionTimeout は 0（無制限）なので、タイムアウトを明示しないと
 * YouTube が遅いときにテスト全体の timeout まで黙って待ち続け、どこで詰まったか分からない。
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [options]
 */
async function waitForWatchPlayer(page, options = {}) {
  await page.waitForSelector('#ytd-player', {
    state: 'attached',
    timeout: options.timeout ?? 30000,
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
function youtublurCanvasLocator(page) {
  return page.locator('#yt-light-bg-blur-canvas');
}

/**
 * issue #107 の再現経路: 非プレイヤーページ（検索結果）で content script を初期化させてから、
 * 動画をクリックして /watch へ SPA 遷移する。直接 /watch を開く（F5 相当）と不具合が出ないため、
 * この経路を通さないと #107 を検知できない。
 * @param {import('@playwright/test').Page} page
 */
async function navigateToWatchViaSpa(page) {
  await page.goto('https://www.youtube.com/results?search_query=lofi');
  const videoLink = page.locator('ytd-video-renderer a#video-title, ytd-video-renderer a#thumbnail').first();
  await videoLink.waitFor({ state: 'visible', timeout: 30000 });
  await videoLink.click();
  await page.waitForFunction(() => location.pathname === '/watch', null, { timeout: 30000 });
  await waitForWatchPlayer(page);
}

/**
 * Opens the extension popup in a new tab (same pattern as blur.spec.js).
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 */
async function openExtensionPopup(context, extensionId) {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  return popupPage;
}

module.exports = {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  navigateToWatchViaSpa,
  openExtensionPopup,
};
