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
 * @param {import('@playwright/test').Page} page
 */
async function waitForWatchPlayer(page) {
  await page.waitForSelector('#ytd-player', { state: 'attached' });
}

/**
 * @param {import('@playwright/test').Page} page
 */
function youtublurCanvasLocator(page) {
  return page.locator('#yt-light-bg-blur-canvas');
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
  openExtensionPopup,
};
