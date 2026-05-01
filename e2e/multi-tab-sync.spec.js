const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Multi-tab synchronization', () => {
  test.use({ timeout: 60000 });

  test('should synchronize mode across multiple YouTube tabs', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; multi-tab test requires real extension'
      );
    }

    // Open first YouTube tab
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to solid mode in first tab
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    const canvas1 = youtublurCanvasLocator(page);
    await expect(canvas1).toBeHidden({ timeout: 10000 });

    // Open a second YouTube tab (simulate new tab)
    const page2 = await context.newPage();
    await page2.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page2);

    // Wait for the extension to initialize in the second tab
    await expect(page2.locator("#movie_player")).toHaveAttribute("data-yt-light-bg-mode", "solid", { timeout: 10000 });

    const canvas2 = page2.locator('#yt-light-bg-blur-canvas');
    // Second tab should also have solid mode (synchronized)
    await expect(canvas2).toBeHidden({ timeout: 10000 });

    // Open popup in second tab and switch to blur
    const popupPage2 = await openExtensionPopup(context, extensionId);
    await expect(popupPage2.locator('#popupHeading')).toBeVisible();
    await popupPage2.locator('label[for="modeBlur"]').click();
    await waitForExtensionStorageMode(popupPage2, 'blur');
    await popupPage2.close();
    await page2.bringToFront();
    await page2.reload();
    await waitForWatchPlayer(page2);

    // Second tab should now have blur mode
    await expect(canvas2).toBeVisible({ timeout: 10000 });

    // First tab should also reflect the change after reload
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);
    await expect(canvas1).toBeVisible({ timeout: 10000 });

    await page2.close();
  });

  test('should maintain independent mode per tab before synchronization', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; multi-tab test requires real extension'
      );
    }

    // Open first YouTube tab and set to solid
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    const canvas1 = youtublurCanvasLocator(page);
    await expect(canvas1).toBeHidden({ timeout: 10000 });

    // Open second tab (should inherit solid mode from storage)
    const page2 = await context.newPage();
    await page2.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page2);
    await page2.waitForTimeout(1000);

    const canvas2 = page2.locator('#yt-light-bg-blur-canvas');
    await expect(canvas2).toBeHidden({ timeout: 10000 });

    await page2.close();
  });

  test('should handle rapid mode changes across multiple tabs', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; multi-tab test requires real extension'
      );
    }

    // Open first tab
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Rapidly change modes in first tab
    for (let i = 0; i < 3; i++) {
      const mode = i % 2 === 0 ? 'solid' : 'blur';
      const radioId = mode === 'solid' ? 'modeSolid' : 'modeBlur';

      await popupPage.locator(`label[for="${radioId}"]`).click();
      await waitForExtensionStorageMode(popupPage, mode);
      await page.waitForTimeout(200);
    }

    await popupPage.close();
    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    const canvas1 = youtublurCanvasLocator(page);
    // Should be in blur mode after last change
    await expect(canvas1).toBeVisible({ timeout: 10000 });
  });
});
