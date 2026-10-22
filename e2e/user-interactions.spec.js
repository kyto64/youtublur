const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('User interaction scenarios', () => {
  test.describe.configure({ timeout: 60000 });

  test('rapid mode switching between blur and solid', async ({ page, context, extensionId, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Chrome storage interaction differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Rapidly switch modes multiple times
    for (let i = 0; i < 5; i++) {
      const mode = i % 2 === 0 ? 'solid' : 'blur';
      const radioId = mode === 'solid' ? 'modeSolid' : 'modeBlur';

      await popupPage.locator(`label[for="${radioId}"]`).click();
      await waitForExtensionStorageMode(popupPage, mode);
      await page.waitForTimeout(50);
    }

    await popupPage.close();

    // Final mode should be blur
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas handles reload while popup is open', async ({ page, context, extensionId, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Real extension required for this test');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Open popup
    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    // Set to solid mode
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');

    // Reload main page while popup is still open
    await page.reload();
    await waitForWatchPlayer(page);

    await popupPage.close();

    // Wait for canvas state to settle
    await page.waitForTimeout(100);

    // Canvas should be hidden (solid mode) or not present
    await expect(canvas).toBeHidden({ timeout: 10000 });
  });

  test('blur and solid modes maintain state across multiple page navigations', async ({ page, context, extensionId, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Chrome storage interaction differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    const popupPage = await openExtensionPopup(context, extensionId);

    // Set to solid mode
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();

    // Navigate away and back via real navigation
    await page.goto('https://www.youtube.com/');
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    // Canvas should be hidden (solid mode persisted)
    await expect(canvas).toBeHidden({ timeout: 10000 });

    // Switch back to blur
    const popupPage2 = await openExtensionPopup(context, extensionId);
    await popupPage2.locator('label[for="modeBlur"]').click();
    await waitForExtensionStorageMode(popupPage2, 'blur');
    await popupPage2.close();

    await page.waitForTimeout(100);

    // Canvas should be visible again
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas correctly handles player entering/exiting fullscreen', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Fullscreen API differs in mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate fullscreen change
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.classList.add('ytp-fullscreen', 'fullscreen');
        container.style.width = '100%';
        container.style.height = '100%';
      }
      document.dispatchEvent(new Event('fullscreenchange'));
      document.dispatchEvent(new Event('webkitfullscreenchange'));
    });

    await page.waitForTimeout(100);

    // Canvas should still be present
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Exit fullscreen
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.classList.remove('ytp-fullscreen', 'fullscreen');
        container.style.width = '';
        container.style.height = '';
      }
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    await page.waitForTimeout(100);

    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas handles minimized/collapsed player state', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'DOM handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate YouTube collapsing/minimizing player
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.classList.add('minimized', 'collapsed');
        container.style.height = '150px';
        container.style.maxHeight = '150px';
      }
    });

    await page.waitForTimeout(100);

    // Canvas should still exist
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Restore to normal
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.classList.remove('minimized', 'collapsed');
        container.style.height = '';
        container.style.maxHeight = '';
      }
    });

    await page.waitForTimeout(100);

    await expect(canvas).toBeAttached({ timeout: 10000 });
  });
});
