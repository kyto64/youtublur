const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForWatchPlayer,
  youtublurCanvasLocator,
} = require('./helpers');

test.describe('Page visibility change handling', () => {
  test.describe.configure({ timeout: 45000 });

  test('blur canvas handles page visibility toggle (hide/show)', async ({ page, browserName }) => {
    // Firefox mock has limited Page Visibility API support
    if (browserName === 'firefox') {
      test.skip(true, 'Page visibility API differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate page becoming hidden
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(50);

    // Canvas should still exist after visibility change
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate page becoming visible again
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(50);

    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur loop pauses and resumes on page visibility change', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Page visibility API differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Check initial state
    const initialDisplay = await canvas.evaluate((el) => el.style.display);
    expect(initialDisplay).toBe('');

    // Trigger multiple visibility changes
    for (let i = 0; i < 3; i++) {
      await page.evaluate((iteration) => {
        const state = iteration % 2 === 0 ? 'hidden' : 'visible';
        Object.defineProperty(document, 'visibilityState', { value: state, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, i);
      await page.waitForTimeout(30);
    }

    // Final state should be visible
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(50);
    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas handles pageshow/pagehide events', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'pageshow/pagehide events differ in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate pagehide event (e.g., when navigating away)
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });

    await page.waitForTimeout(50);

    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Simulate pageshow event (e.g., when coming back via back button)
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    await page.waitForTimeout(50);

    await expect(canvas).toBeAttached({ timeout: 10000 });
  });

  test('blur canvas state preserved across multiple visibility toggles', async ({ page, browserName }) => {
    if (browserName === 'firefox') {
      test.skip(true, 'Page visibility API differs in Firefox mock');
    }

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    // Store initial attributes
    const initialId = await canvas.getAttribute('id');
    expect(initialId).toBe('yt-light-bg-blur-canvas');

    // Toggle visibility 10 times rapidly
    for (let i = 0; i < 10; i++) {
      const state = i % 2 === 0 ? 'hidden' : 'visible';
      await page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { value: s, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
      await page.waitForTimeout(20);
    }

    await page.waitForTimeout(100);

    // Canvas should still be present with correct ID
    await expect(canvas).toBeAttached({ timeout: 10000 });
    const finalId = await canvas.getAttribute('id');
    expect(finalId).toBe('yt-light-bg-blur-canvas');
  });
});
