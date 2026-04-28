/**
 * Shared E2E helpers for YouTube + extension flows (Chromium MV3).
 */

const STABLE_WATCH_VIDEO_ID = 'dQw4w9WgXcQ';

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
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
};
