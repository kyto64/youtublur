const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

async function youtublurServiceWorker(context, extensionId) {
  const match = () => context.serviceWorkers().find((worker) => worker.url().includes(extensionId));
  if (!match()) {
    await context.waitForEvent('serviceworker', { timeout: 20000 });
  }
  const worker = match();
  if (!worker) throw new Error('youtublur service worker was not registered');
  return worker;
}

test('popup lists rebindable shortcuts', async ({ context, extensionId, browserName }) => {
  test.skip(
    browserName === 'firefox',
    'Firefox E2E uses a chrome API mock; the real popup and commands API are not available.'
  );

  const popup = await openExtensionPopup(context, extensionId);
  await expect(popup.locator('#shortcutSectionTitle')).toHaveText('Shortcuts');
  const rows = popup.locator('#shortcutList li');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0).locator('kbd')).toHaveText('Alt+Shift+Y');
  await expect(rows.nth(1).locator('kbd')).toHaveText('Alt+Shift+Period');
  await expect(rows.nth(2).locator('kbd')).toHaveText('Alt+Shift+Comma');
  await expect(rows.nth(3).locator('kbd')).toHaveText('Not set');
  await expect(rows.nth(4).locator('kbd')).toHaveText('Alt+Shift+U');
  await expect(popup.locator('#shortcutManage')).toHaveText('Manage shortcuts');
  await popup.close();
});

test('popup controls are operable from the keyboard in visual order', async ({
  context,
  extensionId,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Firefox E2E uses a chrome API mock; the real popup is not available.'
  );

  const popup = await openExtensionPopup(context, extensionId);
  await expect(popup.locator('#shortcutList li')).toHaveCount(5);

  await popup.keyboard.press('Tab');
  await expect(popup.locator('#modeBlur')).toBeFocused();
  await expect(popup.locator('#modeBlur')).toBeChecked();
  await expect
    .poll(() => popup.locator('label[for="modeBlur"]').evaluate((el) => getComputedStyle(el).outlineStyle))
    .toBe('solid');

  await popup.keyboard.press('ArrowDown');
  await expect(popup.locator('#modeSolid')).toBeChecked();
  await popup.keyboard.press('ArrowUp');
  await expect(popup.locator('#modeBlur')).toBeChecked();

  await popup.keyboard.press('Tab');
  await expect(popup.locator('#blurStrength')).toBeFocused();
  await expect(popup.locator('#blurStrength')).toHaveValue('40');
  await popup.keyboard.press('ArrowRight');
  await expect(popup.locator('#blurStrength')).toHaveValue('44');

  await popup.keyboard.press('Tab');
  await expect(popup.locator('#reloadButton')).toBeFocused();
  await expect
    .poll(() => popup.locator('#reloadButton').evaluate((el) => getComputedStyle(el).outlineStyle))
    .toBe('solid');

  await popup.keyboard.press('Tab');
  await expect(popup.locator('#shortcutManage')).toBeFocused();
  const settingsPromise = context.waitForEvent('page');
  await popup.keyboard.press('Enter');
  const settings = await settingsPromise;
  await expect(settings).toHaveURL(/chrome:\/\/extensions\/shortcuts/);
  await popup.close();
});

test('shortcut commands update mode and blur strength on the open watch tab', async ({
  page,
  context,
  extensionId,
  browserName,
}) => {
  test.setTimeout(60_000);
  test.skip(
    browserName === 'firefox',
    'Firefox E2E uses a chrome API mock; extension commands are not dispatched.'
  );

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
  await waitForWatchPlayer(page);
  const canvas = youtublurCanvasLocator(page);
  await expect(canvas).toBeAttached({ timeout: 15000 });
  const player = page.locator('#movie_player, .html5-video-player').first();
  await expect(player).toHaveAttribute('data-yt-light-bg-mode', 'blur', { timeout: 15000 });

  const worker = await youtublurServiceWorker(context, extensionId);
  await worker.evaluate(() => globalThis.runShortcutCommand('increase-blur-strength'));
  await expect.poll(async () => canvas.getAttribute('data-yt-blur-strength'), { timeout: 15000 }).toBe('44');

  const storedMode = await worker.evaluate(async () => {
    await globalThis.runShortcutCommand('toggle-mode');
    return await new Promise((resolve) => {
      chrome.storage.local.get('playerBackgroundMode', (result) => {
        resolve(result.playerBackgroundMode);
      });
    });
  });
  expect(storedMode).toBe('solid');
  await expect(player).toHaveAttribute('data-yt-light-bg-mode', 'solid', { timeout: 15000 });

  await worker.evaluate(() => globalThis.runShortcutCommand('toggle-mode'));
  await expect(player).toHaveAttribute('data-yt-light-bg-mode', 'blur', { timeout: 15000 });
  await expect.poll(async () => canvas.getAttribute('data-yt-blur-strength'), { timeout: 15000 }).toBe('44');

  await worker.evaluate(() => globalThis.runShortcutCommand('decrease-blur-strength'));
  await expect.poll(async () => canvas.getAttribute('data-yt-blur-strength'), { timeout: 15000 }).toBe('40');
});
