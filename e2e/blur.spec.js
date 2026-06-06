const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test('should load extension and apply blur on YouTube', async ({ page, extensionId, context, browserName }) => {
  if (browserName !== 'firefox') {
    await page.setViewportSize({ width: 2048, height: 1152 });
  }

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);

  await waitForWatchPlayer(page);
  if (browserName !== 'firefox') {
    await page.locator('#movie_player').hover();
    await page.locator('.ytp-size-button').click({ timeout: 5000 }).catch(() => {});
  }

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
  await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });
  await expect(youtublurCanvas).toHaveCSS('z-index', '1');
  await expect
    .poll(async () =>
      youtublurCanvas.evaluate((canvas) => {
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
        const video = canvas.parentElement?.querySelector('video');
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) return false;

        const canvasAspect = canvas.width / canvas.height;
        const videoAspect = video.videoWidth / video.videoHeight;
        let sampleX = 1;
        let sampleY = Math.floor(canvas.height / 2);

        if (videoAspect > canvasAspect) {
          const contentHeight = canvas.width / videoAspect;
          const topBarHeight = (canvas.height - contentHeight) / 2;
          if (topBarHeight < 8) return false;
          sampleX = Math.floor(canvas.width / 2);
          sampleY = Math.max(1, Math.floor(topBarHeight / 2));
        } else {
          const contentWidth = canvas.height * videoAspect;
          const sideBarWidth = (canvas.width - contentWidth) / 2;
          if (sideBarWidth < 8) return false;
          sampleX = Math.max(1, Math.floor(sideBarWidth / 2));
        }

        const ambientPixel = Array.from(ctx.getImageData(sampleX, sampleY, 1, 1).data);
        const centerPixel = Array.from(
          ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
        );
        return ambientPixel.some((value) => value !== 0) && centerPixel.every((value) => value === 0);
      })
    )
    .toBe(true);

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
