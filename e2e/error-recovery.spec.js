const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

test.describe('Error recovery and DOM mutation handling', () => {
  test.use({ timeout: 45000 });

  test('blur canvas recovers after being removed from DOM', async ({ page, context, extensionId, browserName }) => {
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

    await page.waitForTimeout(100);

    // Canvas should be gone
    await expect(canvas).toHaveCount(0);

    // Trigger an update by changing mode via popup
    const popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.locator('label[for="modeBlur"]').click();
    await popupPage.close();

    // Wait for re-initialization
    await page.waitForTimeout(200);

    // Canvas should be recreated
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

    await page.waitForTimeout(100);

    // Canvas might be hidden or removed - both are acceptable
    const count = await canvas.count();
    expect([0, 1]).toContain(count);
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

    // Now toggle mode to ensure everything still works
    const popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.locator('label[for="modeSolid"]').click();
    await popupPage.close();

    await page.waitForTimeout(100);

    // Canvas should be hidden in solid mode
    await expect(canvas).toBeHidden({ timeout: 10000 });
  });
});
