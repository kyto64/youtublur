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
    let alarmListener;
    let existingAlarm;

    beforeEach(() => {
      require('./storage-mode.js');
      require('./shortcut-actions.js');
      chrome.commands = { onCommand: { addListener: vi.fn() } };
      chrome.runtime.onInstalled = { addListener: vi.fn((fn) => { installedListener = fn; }) };
      chrome.runtime.onStartup = { addListener: vi.fn((fn) => { startupListener = fn; }) };
      existingAlarm = undefined;
      chrome.alarms = {
        onAlarm: { addListener: vi.fn((fn) => { alarmListener = fn; }) },
        get: vi.fn((name, cb) => cb(existingAlarm)),
        create: vi.fn()
      };
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

    test('update opens nothing and keeps the badge off for users without an install time', async () => {
      localData[FIRST_USE_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await installedListener({ reason: 'update', previousVersion: '1.0.0' });
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(localData[INSTALL_TIMESTAMP_KEY]).toBeUndefined();
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
    });

    test('update keeps the badge for users installed with this version', async () => {
      localData[INSTALL_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await installedListener({ reason: 'update', previousVersion: '1.0.0' });
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
    });

    test('a periodic alarm is created when missing and re-checks the badge', async () => {
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'review-badge-check',
        expect.objectContaining({ periodInMinutes: expect.any(Number) })
      );
      localData[INSTALL_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await alarmListener({ name: 'other' });
      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
      await alarmListener({ name: 'review-badge-check' });
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
    });

    test('an existing alarm is not recreated', () => {
      existingAlarm = { name: 'review-badge-check' };
      delete require.cache[require.resolve('./background.js')];
      chrome.alarms.create.mockClear();
      require('./background.js');
      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    test('browser startup re-checks the badge', async () => {
      localData[INSTALL_TIMESTAMP_KEY] = Date.now() - NUDGE_DELAY_MS - 1000;
      await startupListener();
      expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: REVIEW_BADGE_TEXT });
    });
  });
});

describe('uninstall survey URL', () => {
  const {
    UNINSTALL_SURVEY_BASE_URL,
    normalizeSurveyLanguage,
    buildUninstallSurveyUrl,
    configureUninstallSurvey
  } = require('./onboarding.js');

  afterEach(() => {
    delete global.chrome;
  });

  test.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['ja', 'ja'],
    ['ko', 'ko'],
    ['es-419', 'es'],
    ['id', 'id'],
    ['in', 'id'],
    ['pt-BR', 'pt_BR'],
    ['pt-PT', 'pt_BR'],
    ['zh-CN', 'zh_CN'],
    ['zh', 'zh_CN'],
    ['zh-Hans', 'zh_CN'],
    ['zh-TW', 'zh_TW'],
    ['zh-HK', 'zh_TW'],
    ['zh-Hant-TW', 'zh_TW'],
    ['fr', 'en'],
    ['', 'en'],
    [undefined, 'en'],
    [42, 'en']
  ])('normalizeSurveyLanguage(%j) is %s', (input, expected) => {
    expect(normalizeSurveyLanguage(input)).toBe(expected);
  });

  test('buildUninstallSurveyUrl joins version and language', () => {
    expect(buildUninstallSurveyUrl('1.12.39', 'pt-BR')).toBe(
      `${UNINSTALL_SURVEY_BASE_URL}?v=1.12.39&lang=pt_BR`
    );
    expect(UNINSTALL_SURVEY_BASE_URL).toBe('https://kyto64.github.io/youtublur/uninstall/');
  });

  test('buildUninstallSurveyUrl rejects bad versions and stays within 255 characters', () => {
    expect(buildUninstallSurveyUrl('', 'en')).toBeNull();
    expect(buildUninstallSurveyUrl(undefined, 'en')).toBeNull();
    expect(buildUninstallSurveyUrl('1.0&x=1', 'en')).toBeNull();
    expect(buildUninstallSurveyUrl('1'.repeat(300), 'en')).toBeNull();
    expect(buildUninstallSurveyUrl('1.12.39', 'zh-TW').length).toBeLessThanOrEqual(255);
  });

  test('configureUninstallSurvey registers the URL', () => {
    const setUninstallURL = vi.fn();
    global.chrome = {
      runtime: { setUninstallURL, getManifest: () => ({ version: '2.3.4' }) },
      i18n: { getUILanguage: () => 'zh-TW' }
    };
    expect(configureUninstallSurvey()).toBe(true);
    expect(setUninstallURL).toHaveBeenCalledWith(`${UNINSTALL_SURVEY_BASE_URL}?v=2.3.4&lang=zh_TW`);
  });

  test('configureUninstallSurvey falls back to en without i18n', () => {
    const setUninstallURL = vi.fn(() => Promise.reject(new Error('nope')));
    global.chrome = { runtime: { setUninstallURL, getManifest: () => ({ version: '1.0.0' }) } };
    expect(configureUninstallSurvey()).toBe(true);
    expect(setUninstallURL).toHaveBeenCalledWith(`${UNINSTALL_SURVEY_BASE_URL}?v=1.0.0&lang=en`);
  });

  test('configureUninstallSurvey does nothing when the API is missing or throws', () => {
    delete global.chrome;
    expect(configureUninstallSurvey()).toBe(false);
    global.chrome = { runtime: { getManifest: () => ({ version: '1.0.0' }) } };
    expect(configureUninstallSurvey()).toBe(false);
    global.chrome = {
      runtime: {
        setUninstallURL: () => {
          throw new Error('boom');
        },
        getManifest: () => ({ version: '1.0.0' })
      }
    };
    expect(configureUninstallSurvey()).toBe(false);
  });
});
