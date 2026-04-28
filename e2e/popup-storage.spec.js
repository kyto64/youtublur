const { test, expect } = require('./fixtures');
const { STABLE_WATCH_VIDEO_ID, waitForWatchPlayer, openExtensionPopup } = require('./helpers');

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
  await popup1.waitForTimeout(500);
  await popup1.close();

  const popup2 = await openExtensionPopup(context, extensionId);
  await expect(popup2.locator('#modeSolid')).toBeChecked();
  await popup2.close();
});
