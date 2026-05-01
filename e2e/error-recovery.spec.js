const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Error recovery and DOM mutation handling', () => {
  test.use({ timeout: 45000 });

  test('blur canvas recovers after being removed from DOM', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'DOM mutation handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate YouTube removing the canvas
    await page.evaluate(() => {
      const canvas = document.querySelector('#yt-light-bg-blur-canvas');
      if (canvas) {
        canvas.remove();
      }
    });

    // The MutationObserver in content.js should detect the removal
    // and recreate the canvas. Verify it reappears.
    const newCanvas = youtublurCanvasLocator(page);
    await expect(newCanvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas recovers after video element is replaced', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'DOM mutation handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate YouTube replacing the video element
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      const oldVideo = container.querySelector('video');
      if (oldVideo) {
        const newVideo = document.createElement('video');
        newVideo.src = oldVideo.src;
        oldVideo.replaceWith(newVideo);
      }
    });

    await page.waitForTimeout(200);

    // Canvas should still exist
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur mode persists after container class changes', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'DOM mutation handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate YouTube adding/removing classes
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.classList.add('ytp-autohide', 'video-ads-enabled');
        container.classList.remove('ytp-autohide');
        container.classList.add('playing-mode');
      }
    });

    await page.waitForTimeout(100);

    // Canvas should still be present
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas handles null video element gracefully', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Error handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate video element being removed
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      const video = container.querySelector('video');
      if (video) {
        video.remove();
      }
    });

    // Canvas may stay attached or be hidden, but the page should not crash.
    // Verify the canvas element does not throw and the page remains responsive.
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur recovers after player container is mutated', async ({ page, context, extensionId, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'DOM mutation handling differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Aggressively mutate the player container
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.style.cssText += 'transition: all 0.3s;';
        container.dataset.test = 'mutated';
        container.setAttribute('aria-label', 'mutated-player');
      }
    });

    await page.waitForTimeout(100);

    // Canvas should still be present
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Now toggle mode via popup, then reload the watch tab so the new mode is applied
    // (popup→content message targets the active tab, which is the popup itself in E2E)
    const popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popupPage, 'solid');
    await popupPage.close();

    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);

    // Canvas should be hidden in solid mode
    await expect(canvas).toBeHidden({ timeout: 10000 });
  });
});
