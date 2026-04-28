const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test('should load extension and apply blur on YouTube', async ({ page, extensionId, context, browserName }) => {
  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);

  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  if (browserName === 'firefox') {
    test.skip(true, 'Firefox uses a chrome API mock instead of a real extension, so the popup and storage-based mode switching cannot be tested there.');
  }

  const popupPage = await openExtensionPopup(context, extensionId);
  await expect(popupPage.locator('#popupHeading')).toBeVisible();

  await popupPage.locator('label[for="modeSolid"]').click();
  await waitForExtensionStorageMode(popupPage, 'solid');

  await page.bringToFront();
  await page.reload();

  await waitForWatchPlayer(page);

  const reloadedCanvas = youtublurCanvasLocator(page);
  await expect(reloadedCanvas).toBeHidden({ timeout: 15000 });
});

test('should keep blur visible when extension popup is opened in a tab (Chromium)', async ({
  page,
  context,
  extensionId,
  browserName,
}) => {
  if (browserName === 'firefox') {
    test.skip(
      true,
      'Firefox E2E uses a chrome API mock instead of a real extension.'
    );
  }

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
  await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });

  const popupPage = await openExtensionPopup(context, extensionId);
  await expect(popupPage.locator('#popupHeading')).toBeVisible();

  await page.bringToFront();
  await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });

  await popupPage.close();
});
