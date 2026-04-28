const { test, expect } = require('./fixtures');

test('should load extension and apply blur on YouTube Shorts', async ({ page }) => {
  // Shorts feed: first video is chosen by YouTube (stable entry point for CI).
  await page.goto('https://www.youtube.com/shorts/');

  // Wait for the shorts player to load
  await page.waitForSelector('ytd-shorts', { state: 'attached' });

  // 2. Check if the youtublur canvas is injected behind the Shorts video
  // The shorts player might take a bit of time to fully render and the content script to detect it.
  const youtublurCanvas = page.locator('#yt-light-bg-blur-canvas');
  
  // The shorts container is generally the current active short's container.
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});
