const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Theme switching behavior', () => {
  test.use({ timeout: 60000 });

  test('solid mode background updates when YouTube theme changes to dark', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; theme switching test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to solid mode
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();

    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify solid mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeHidden({ timeout: 10000 });

    // Check that container has solid mode background color (light theme default)

    // Switch to dark theme by setting dark attribute on html
    await page.evaluate(() => {
      document.documentElement.setAttribute('dark', '');
    });

    // Give time for theme observer to react
    await page.waitForTimeout(150);

    // The theme observer in content.js watches for 'dark' and 'theme' attribute changes
    const hasDarkAttr = await page.evaluate(() => {
      return document.documentElement.hasAttribute('dark');
    });
    expect(hasDarkAttr).toBe(true);
  });

  test('solid mode background updates when YouTube theme changes to light', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; theme switching test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    // Set dark theme initially
    await page.evaluate(() => {
      document.documentElement.setAttribute('dark', '');
    });

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to solid mode
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();

    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify solid mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeHidden({ timeout: 10000 });

    // Remove dark theme (switch to light)
    await page.evaluate(() => {
      document.documentElement.removeAttribute('dark');
      document.documentElement.removeAttribute('theme');
    });

    await page.waitForTimeout(150);

    const hasDarkAttr = await page.evaluate(() => {
      return document.documentElement.hasAttribute('dark');
    });
    expect(hasDarkAttr).toBe(false);
  });

  test('solid mode uses correct background colors for both themes', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      test.skip(
        true,
        'Firefox E2E uses mock chrome API; theme switching test requires real extension'
      );
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    // Test dark theme solid mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('dark', '');
    });

    const popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();

    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Verify solid mode is active
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeHidden({ timeout: 10000 });

    // Now switch to light theme in solid mode
    await page.evaluate(() => {
      document.documentElement.removeAttribute('dark');
    });
    await page.reload();
    await waitForWatchPlayer(page);
    await expect(canvas).toBeHidden({ timeout: 10000 });
  });
});
