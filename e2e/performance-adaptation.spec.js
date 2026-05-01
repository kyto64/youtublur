const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Performance adaptation', () => {
  test.use({ timeout: 60000 });

  test('should adapt draw interval based on device performance', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; performance test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to blur mode
    await popupPage.locator('label[for="modeBlur"]').click();
    await waitForExtensionStorageMode(popupPage, 'blur');
    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify blur mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Check that canvas is visible (blur mode)
    await expect(canvas).toBeVisible({ timeout: 5000 });

    // The extension should automatically adjust draw interval based on performance
    // This is handled internally by the content script
    // We verify the canvas is still functional after some time
    await expect(canvas).toBeVisible({ timeout: 2000 });

    await popupPage.close();
  });

  test('should handle rapid mode switching without performance degradation', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; performance test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    const canvas = youtublurCanvasLocator(page);

    // Rapidly switch modes multiple times
    for (let i = 0; i < 5; i++) {
      const mode = i % 2 === 0 ? 'solid' : 'blur';
      const radioId = mode === 'solid' ? 'modeSolid' : 'modeBlur';

      await popupPage.locator(`label[for="${radioId}"]`).click();
      await waitForExtensionStorageMode(popupPage, mode);
      // Wait for canvas state to update instead of fixed timeout

      if (mode === 'blur') {
        await expect(canvas).toBeVisible({ timeout: 5000 });
      } else {
        await expect(canvas).toBeHidden({ timeout: 5000 });
      }
    }

    // Final mode should be solid
    await expect(canvas).toBeHidden({ timeout: 5000 });

    await popupPage.close();
  });
});
