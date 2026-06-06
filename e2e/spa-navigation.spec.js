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

  // 戻りは watch URL への通常遷移で確実に再描画させる。合成 pushState による戻りでは
  // YouTube のルーターが watch を再描画しないことがあり（#movie_player が現れず復元できない）、
  // 実 YouTube の状態に依存してテストが flaky になるため。SPA 遷移での blur 復元は
  // blur.spec.js の issue #107 専用テスト（検索結果→クリックの実 SPA 遷移）で担保している。
  await page.goto(watchUrl);
  await waitForWatchPlayer(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});
