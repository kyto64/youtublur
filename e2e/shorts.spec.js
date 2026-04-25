const { test, expect } = require('./fixtures');

test('should load extension and apply blur on YouTube Shorts', async ({ page }) => {
  // 1. Navigate directly to a stable YouTube Shorts URL
  // We'll just pick a popular shorts URL or a generic one. 
  // It's better to use a known video ID if possible to avoid 404s, 
  // or navigate to /shorts/ first video. Let's try navigating to a known one or the shorts tab.
  await page.goto('https://www.youtube.com/shorts/dQw4w9WgXcQ'); 
  // Wait, Rick Roll as a short might not exist, it might redirect to /watch. 
  // Let's navigate to the shorts feed and let it pick the first one.
  await page.goto('https://www.youtube.com/shorts/');

  // Wait for the shorts player to load
  await page.waitForSelector('ytd-shorts', { state: 'attached' });

  // 2. Check if the youtublur canvas is injected behind the Shorts video
  // The shorts player might take a bit of time to fully render and the content script to detect it.
  const youtublurCanvas = page.locator('#yt-light-bg-blur-canvas');
  
  // The shorts container is generally the current active short's container.
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
});
