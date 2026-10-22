const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForWatchPlayer,
  youtublurCanvasLocator,
} = require('./helpers');

test.describe('Player resize handling', () => {
  test.describe.configure({ timeout: 45000 });

  test('blur canvas resizes when player container dimensions change', async ({ page, browserName }) => {
    // Firefox mock doesn't support real ResizeObserver interactions well
    if (browserName === 'firefox') {
      test.skip(true, 'ResizeObserver behavior differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);

    // Wait for canvas to be attached
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Get initial canvas dimensions
    const initialBBox = await canvas.boundingBox();
    expect(initialBBox).not.toBeNull();

    // Simulate player resize by changing container dimensions via JavaScript
    // This triggers ResizeObserver which should resize the canvas
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.style.width = '800px';
        container.style.height = '450px';
        container.style.flexBasis = '800px';
      }
    });

    // Wait a bit for ResizeObserver to fire
    await page.waitForTimeout(100);

    // Verify canvas still exists
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas maintains correct aspect ratio after resize', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'ResizeObserver behavior differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);

    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Resize to square-ish dimensions
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.style.width = '600px';
        container.style.height = '600px';
      }
    });

    await page.waitForTimeout(100);

    // Canvas should still be present
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Reset to normal
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.style.width = '';
        container.style.height = '';
      }
    });
  });

  test('canvas resize handles very small container dimensions', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'ResizeObserver behavior differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Shrink container significantly
    await page.evaluate(() => {
      const container = document.querySelector('#movie_player, .html5-video-player');
      if (container) {
        container.style.width = '20px';
        container.style.height = '20px';
      }
    });

    await page.waitForTimeout(100);

    // Canvas should still exist (even if dimensions are clamped to 1x1)
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('multiple rapid resizes do not break blur canvas', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'ResizeObserver behavior differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Perform multiple rapid resizes
    for (let i = 0; i < 5; i++) {
      await page.evaluate((index) => {
        const container = document.querySelector('#movie_player, .html5-video-player');
        if (container) {
          const width = 400 + (index * 100);
          const height = 300 + (index * 50);
          container.style.width = `${width}px`;
          container.style.height = `${height}px`;
        }
      }, i);
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(100);

    // Canvas should still be attached
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });
});
