const { test, expect } = require('./fixtures');
const { STABLE_WATCH_VIDEO_ID, waitForWatchPlayer, youtublurCanvasLocator } = require('./helpers');

test('should handle SPA navigation between video pages', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);

  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  const initialUrl = page.url();
  await page.evaluate((vid) => {
    history.pushState(null, '', `/watch?v=${vid}_NEW`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, STABLE_WATCH_VIDEO_ID);

  await page.waitForURL(`**/watch?v=${STABLE_WATCH_VIDEO_ID}_NEW`, { timeout: 15000 });

  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, initialUrl);

  await page.waitForURL(initialUrl, { timeout: 15000 });

  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});

test('should keep blur canvas after replaceState on watch URL', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  await page.evaluate((vid) => {
    history.replaceState(null, '', `/watch?v=${vid}_REPLACE`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, STABLE_WATCH_VIDEO_ID);

  await page.waitForURL(`**/watch?v=${STABLE_WATCH_VIDEO_ID}_REPLACE`, { timeout: 15000 });
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});

test('should tear down blur when SPA leaves the player page then restore on return', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  const watchUrl = page.url();

  await page.evaluate(() => {
    history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await page.waitForURL(/youtube\.com\/?(\?.*)?$/, { timeout: 30000 });
  await expect(youtublurCanvas).toHaveCount(0);

  await page.evaluate((url) => {
    const pathAndSearch = new URL(url).pathname + new URL(url).search;
    history.pushState(null, '', pathAndSearch);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, watchUrl);

  await page.waitForURL(watchUrl, { timeout: 30000 });
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});
