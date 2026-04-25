const { test, expect } = require('./fixtures');

test('should load extension and apply blur on YouTube', async ({ page, extensionId, context, browserName }) => {

  // 1. Navigate to a YouTube video
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); // Rick roll as a stable test video

  // Wait for the video player to load to ensure content script ran
  await page.waitForSelector('#ytd-player', { state: 'attached' });

  // 2. Check if the youtublur canvas is injected
  const youtublurCanvas = page.locator('#yt-light-bg-blur-canvas');
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });

  // Firefox uses a chrome API mock instead of a real extension, so the popup
  // and storage-based mode switching cannot be tested there.
  if (browserName === 'firefox') return;

  // 3. Open the extension popup
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

  // Verify the popup loaded correctly
  const header = popupPage.locator('#popupHeading');
  await expect(header).toBeVisible();

  // 4. Change mode from the default to solid color
  const modeSolidLabel = popupPage.locator('label[for="modeSolid"]');
  await modeSolidLabel.click();

  // Verify that the setting was saved (you might want to close and reopen, or just check the page)
  // Let's go back to the YouTube page and check if it reacted to the change
  // The popup sends a message to the "active tab in the current window".
  // Since we opened the popup in a new tab, the message won't reach the YouTube tab.
  // However, the popup also saves the setting to chrome.storage.sync.
  // We can verify the integration by reloading the YouTube page and checking if it starts in solid mode.
  // Wait a little bit for the async chrome.storage.sync.set to finish before reloading.
  await popupPage.waitForTimeout(500);
  await page.bringToFront();
  await page.reload();

  // Wait for the video player to load
  await page.waitForSelector('#ytd-player', { state: 'attached' });

  // The content script should have applied the 'solid' mode on init.
  // It should NOT attach the canvas or it should be hidden.
  // Since it creates the canvas lazily or hides it, we check if it's hidden or detached.
  const reloadedCanvas = page.locator('#yt-light-bg-blur-canvas');
  await expect(reloadedCanvas).toBeHidden({ timeout: 15000 });
});
