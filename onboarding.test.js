import { vi } from 'vitest';

require('./review-nudge.js');
const {
  WELCOME_SHOWN_KEY,
  REVIEW_BADGE_TEXT,
  handleExtensionInstalled,
  refreshReviewBadge,
  clearReviewBadge
} = require('./onboarding.js');
const { INSTALL_TIMESTAMP_KEY, FIRST_USE_TIMESTAMP_KEY, REVIEW_NUDGE_SHOWN_KEY, NUDGE_DELAY_MS } =
  require('./review-nudge.js');

describe('onboarding.js', () => {
  let localData;
  let localSetMock;

  beforeEach(() => {
    localData = {};
    localSetMock = vi.fn((data, cb) => {
      Object.assign(localData, data);
      if (cb) cb();
    });
    global.chrome = {
      runtime: {
        lastError: undefined,
        getURL: vi.fn((path) => `chrome-extension://test-id/${path}`)
      },
      storage: {
        local: {
          get: vi.fn((keys, cb) => {
            const result = {};
            for (const key of keys) if (localData[key] !== undefined) result[key] = localData[key];
            cb(result);
          }),
          set: localSetMock
        }
      },
      tabs: { create: vi.fn() },
      action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() }
    };
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('a fresh install saves the install time and opens the welcome page once', async () => {
    const now = 1_700_000_000_000;
    await expect(handleExtensionInstalled({ reason: 'install' }, now)).resolves.toBe(true);

    expect(localData[INSTALL_TIMESTAMP_KEY]).toBe(now);
    expect(localData[WELCOME_SHOWN_KEY]).toBe(true);
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://test-id/welcome.html' });

    await expect(handleExtensionInstalled({ reason: 'install' }, now + 1000)).resolves.toBe(false);
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(localData[INSTALL_TIMESTAMP_KEY]).toBe(now);
  });

  test.each(['update', 'chrome_update', 'browser_update', 'shared_module_update', undefined])(
    'reason %s does not open the welcome page or save the install time',
    async (reason) => {
      await expect(handleExtensionInstalled({ reason })).resolves.toBe(false);
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(localSetMock).not.toHaveBeenCalled();
    }
  );

  test('does not open the welcome page when the flag cannot be saved', async () => {
    localSetMock.mockImplementation((_data, cb) => {
      chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
      cb();
    });
    await expect(handleExtensionInstalled({ reason: 'install' })).resolves.toBe(false);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('does not open the welcome page when storage cannot be read', async () => {
    chrome.storage.local.get.mockImplementation((_keys, cb) => {
      chrome.runtime.lastError = { message: 'Access denied' };
      cb({});
    });
    await expect(handleExtensionInstalled({ reason: 'install' })).resolves.toBe(false);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  test('refreshReviewBadge sets the badge 7 days after install', async () => {
    const installedAt = 1_700_000_000_000;
    localData[INSTALL_TIMESTAMP_KEY] = installedAt;

    await expect(refreshReviewBadge(installedAt + NUDGE_DELAY_MS - 1)).resolves.toBe(false);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });

    await expect(refreshReviewBadge(installedAt + NUDGE_DELAY_MS)).resolves.toBe(true);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
  });

  test('refreshReviewBadge keeps the badge off after the nudge was shown', async () => {
    localData[FIRST_USE_TIMESTAMP_KEY] = 1_700_000_000_000;
    localData[REVIEW_NUDGE_SHOWN_KEY] = true;

    await expect(refreshReviewBadge(1_700_000_000_000 + NUDGE_DELAY_MS * 2)).resolves.toBe(false);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });

  test('badge helpers do nothing when the action API is missing', async () => {
    delete chrome.action;
    expect(() => clearReviewBadge()).not.toThrow();
    localData[INSTALL_TIMESTAMP_KEY] = 1;
    await expect(refreshReviewBadge(1 + NUDGE_DELAY_MS)).resolves.toBe(true);
  });

  describe('background lifecycle listeners', () => {
    let installedListener;
    let startupListener;

    beforeEach(() => {
      require('./storage-mode.js');
      require('./shortcut-actions.js');
      chrome.commands = { onCommand: { addListener: vi.fn() } };
      chrome.runtime.onInstalled = { addListener: vi.fn((fn) => { installedListener = fn; }) };
      chrome.runtime.onStartup = { addListener: vi.fn((fn) => { startupListener = fn; }) };
      delete require.cache[require.resolve('./background.js')];
      require('./background.js');
    });

    afterEach(() => {
      delete require.cache[require.resolve('./background.js')];
    });

    test('install opens the welcome page once', async () => {
      await installedListener({ reason: 'install' });
      expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
      expect(typeof localData[INSTALL_TIMESTAMP_KEY]).toBe('number');
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    test('update does not open the welcome page but refreshes the badge for existing users', async () => {
      localData[FIRST_USE_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await installedListener({ reason: 'update', previousVersion: '1.0.0' });
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(localData[INSTALL_TIMESTAMP_KEY]).toBeUndefined();
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
    });

    test('browser startup re-checks the badge', async () => {
      localData[INSTALL_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await startupListener();
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
    });
  });
});
