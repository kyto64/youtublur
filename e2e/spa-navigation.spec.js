const { test, expect } = require('./fixtures');
const { waitForWatchPlayer, youtublurCanvasLocator } = require('./helpers');

test('should handle SPA navigation between video pages', async ({ page }) => {
  test.setTimeout(90000);
  // 1. Navigate to a YouTube video
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  await waitForWatchPlayer(page);

  // Verify that the blur canvas is attached
  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  // 2. Simulate SPA navigation to a new video page
  const initialUrl = page.url();
  await page.evaluate(() => {
    history.pushState(null, '', '/watch?v=dQw4w9WgXcQ_NEW');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Wait for the URL to change
  await page.waitForURL('**/watch?v=dQw4w9WgXcQ_NEW', { timeout: 15000 });

  // Verify that the extension detects the navigation and keeps/re-attaches the blur canvas
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  // 3. Simulate SPA navigation back to the initial video
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, initialUrl);

  // Wait for the URL to change back
  await page.waitForURL(initialUrl, { timeout: 15000 });

  // Verify the canvas is still correctly attached
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});

test('should keep blur canvas after replaceState on watch URL', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  await page.evaluate(() => {
    history.replaceState(null, '', '/watch?v=dQw4w9WgXcQ_REPLACE');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await page.waitForURL('**/watch?v=dQw4w9WgXcQ_REPLACE', { timeout: 15000 });
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});

test('should tear down blur when SPA leaves the player page then restore on return', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
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
