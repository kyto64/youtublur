const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  openExtensionPopup,
} = require('./helpers');

test('should persist mode in popup UI after storage write (Chromium)', async ({
  page,
  context,
  extensionId,
  browserName,
}) => {
  if (browserName === 'firefox') {
    test.skip(
      true,
      'Firefox E2E uses a chrome API mock; real extension popup and storage are not available.'
    );
  }

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);

  const popup1 = await openExtensionPopup(context, extensionId);
  await popup1.locator('label[for="modeSolid"]').click();
  await waitForExtensionStorageMode(popup1, 'solid');
  await popup1.close();

  const popup2 = await openExtensionPopup(context, extensionId);
  await expect(popup2.locator('#modeSolid')).toBeChecked();
  await popup2.close();
});

test('should persist blur strength and apply it to the open watch tab', async ({
  page,
  context,
  extensionId,
  browserName,
}) => {
  if (browserName === 'firefox') {
    test.skip(
      true,
      'Firefox E2E uses a chrome API mock; real extension popup and storage are not available.'
    );
  }

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);
  const canvas = page.locator('#yt-light-bg-blur-canvas');
  await expect(canvas).toBeAttached({ timeout: 15000 });

  const popup1 = await openExtensionPopup(context, extensionId);
  const slider = popup1.locator('#blurStrength');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('40');
  await slider.fill('8');
  await popup1.waitForFunction(
    () =>
      new Promise((resolve) => {
        chrome.storage.sync.get('playerBlurStrengthPx', (result) => {
          resolve(result.playerBlurStrengthPx === 8);
        });
      }),
    null,
    { timeout: 15000 }
  );
  await expect
    .poll(async () => canvas.getAttribute('data-yt-blur-strength'), { timeout: 15000 })
    .toBe('8');
  await popup1.close();

  const popup2 = await openExtensionPopup(context, extensionId);
  await expect(popup2.locator('#blurStrength')).toHaveValue('8');
  await popup2.locator('label[for="modeSolid"]').click();
  await expect(popup2.locator('#blurStrengthSection')).toBeHidden();
  await popup2.locator('label[for="modeBlur"]').click();
  await expect(popup2.locator('#blurStrength')).toBeVisible();
  await expect(popup2.locator('#blurStrength')).toHaveValue('8');
  await popup2.close();
});
