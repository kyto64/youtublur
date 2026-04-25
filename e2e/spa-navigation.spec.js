const { test, expect } = require('./fixtures');

test('should handle SPA navigation between video pages', async ({ page }) => {
  // 1. Navigate to a YouTube video
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  // Wait for the video player to load
  await page.waitForSelector('#ytd-player', { state: 'attached' });

  // Verify that the blur canvas is attached
  const youtublurCanvas = page.locator('#yt-light-bg-blur-canvas');
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  // 2. Simulate SPA navigation to a new video page
  const initialUrl = page.url();
  await page.evaluate(() => {
    history.pushState(null, '', '/watch?v=dQw4w9WgXcQ_NEW');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  // Wait for the URL to change
  await page.waitForURL('**/watch?v=dQw4w9WgXcQ_NEW', { timeout: 15000 });
  
  // Verify that the extension detects the navigation and keeps/re-attaches the blur canvas
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  // 3. Simulate SPA navigation back to the initial video
  await page.evaluate((url) => {
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, initialUrl);

  // Wait for the URL to change back
  await page.waitForURL(initialUrl, { timeout: 15000 });

  // Verify the canvas is still correctly attached
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});
