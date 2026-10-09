const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  openExtensionPopup,
} = require('./helpers');

test('solid color is chosen from the keyboard and applied without reload', async ({
  page,
  context,
  extensionId,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Firefox E2E uses a chrome API mock; the real popup and storage are not available.'
  );

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);

  const popup1 = await openExtensionPopup(context, extensionId);
  await popup1.locator('label[for="modeSolid"]').click();
  await waitForExtensionStorageMode(popup1, 'solid');
  await expect(popup1.locator('#solidColorSection')).toBeVisible();
  await expect(popup1.locator('#blurStrengthSection')).toBeHidden();
  await popup1.close();

  await page.bringToFront();
  await page.reload();
  await waitForWatchPlayer(page);
  const player = page.locator('#movie_player, .html5-video-player').first();
  await expect
    .poll(async () => player.getAttribute('data-yt-solid-color'), { timeout: 15000 })
    .toMatch(/^#(f1f1f1|181818)$/);

  const popup2 = await openExtensionPopup(context, extensionId);
  await expect(popup2.locator('#solidPresetLight')).not.toBeChecked();
  await expect(popup2.locator('#solidColor')).toHaveValue('#f1f1f1');
  await popup2.locator('#modeSolid').focus();
  await popup2.keyboard.press('Tab');
  await expect(popup2.locator('#solidPresetLight')).toBeFocused();
  await expect
    .poll(() => popup2.locator('label[for="solidPresetLight"]').evaluate((el) => getComputedStyle(el).outlineStyle))
    .toBe('solid');
  await popup2.keyboard.press('ArrowRight');
  await popup2.keyboard.press('ArrowRight');
  await expect(popup2.locator('#solidPresetBlack')).toBeChecked();
  await popup2.waitForFunction(
    () =>
      new Promise((resolve) => {
        chrome.storage.sync.get('playerSolidColor', (result) => {
          resolve(result.playerSolidColor === '#000000');
        });
      }),
    null,
    { timeout: 15000 }
  );
  await expect(player).toHaveAttribute('data-yt-solid-color', '#000000', { timeout: 15000 });
  await expect(player).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  await page.evaluate(() => {
    document.documentElement.setAttribute('dark', '');
  });
  await expect(player).toHaveAttribute('data-yt-solid-color', '#000000');
  await popup2.close();

  const popup3 = await openExtensionPopup(context, extensionId);
  await expect(popup3.locator('#solidPresetBlack')).toBeChecked();
  await expect(popup3.locator('#solidColor')).toHaveValue('#000000');
  await popup3.locator('label[for="modeBlur"]').click();
  await expect(popup3.locator('#solidColorSection')).toBeHidden();
  await expect(popup3.locator('#blurStrength')).toBeVisible();
  await popup3.close();
});
