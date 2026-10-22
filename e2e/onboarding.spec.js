const { test, expect } = require('./fixtures');
const { openExtensionPopup } = require('./helpers');

async function findWelcomePage(context) {
  const isWelcome = (p) => p.url().endsWith('/welcome.html');
  const existing = context.pages().find(isWelcome);
  if (existing) return existing;
  return context.waitForEvent('page', { predicate: isWelcome, timeout: 10000 });
}

test('opens the welcome page once after install and closes it from the button', async ({
  context,
  extensionId,
  browserName,
}) => {
  if (browserName === 'firefox') {
    test.skip(true, 'Firefox E2E uses a chrome API mock; the real extension is not installed.');
  }

  const welcome = await findWelcomePage(context);
  await welcome.waitForLoadState('domcontentloaded');
  expect(welcome.url()).toBe(`chrome-extension://${extensionId}/welcome.html`);
  await expect(welcome.locator('#welcomeTitle')).not.toBeEmpty();
  await expect(welcome.locator('#welcomeTheaterHint')).toContainText('t');
  await expect(welcome.locator('#welcomeClose')).not.toBeEmpty();

  const popup = await openExtensionPopup(context, extensionId);
  const stored = await popup.evaluate(
    () => new Promise((resolve) => chrome.storage.local.get(['installTimestamp', 'welcomeShown'], resolve))
  );
  expect(typeof stored.installTimestamp).toBe('number');
  expect(stored.welcomeShown).toBe(true);
  await expect(popup.locator('#reviewNudge')).toBeHidden();
  await popup.close();

  const closed = welcome.waitForEvent('close');
  await welcome.locator('#welcomeClose').click();
  await closed;
  expect(context.pages().some((p) => p.url().endsWith('/welcome.html'))).toBe(false);
});

test('shows the review nudge with a single close button and never again after closing', async ({
  context,
  extensionId,
  browserName,
}) => {
  if (browserName === 'firefox') {
    test.skip(true, 'Firefox E2E uses a chrome API mock; the real extension popup is not available.');
  }

  const setup = await openExtensionPopup(context, extensionId);
  await setup.evaluate(
    () =>
      new Promise((resolve) =>
        chrome.storage.local.set({ installTimestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 }, resolve)
      )
  );
  await setup.close();

  const popup = await openExtensionPopup(context, extensionId);
  await expect(popup.locator('#reviewNudge')).toBeVisible();
  await expect(popup.locator('#reviewNudge button')).toHaveCount(2);
  await popup.locator('#reviewNudgeClose').click();
  await expect(popup.locator('#reviewNudge')).toBeHidden();
  await popup.close();

  const again = await openExtensionPopup(context, extensionId);
  await expect(again.locator('#reviewNudge')).toBeHidden();
  await again.close();
});
