import { vi } from 'vitest';

const {
  FIRST_USE_TIMESTAMP_KEY,
  REVIEW_NUDGE_HANDLED_KEY,
  REVIEW_NUDGE_NEVER_ASK_KEY,
  REVIEW_NUDGE_COOLDOWN_UNTIL_KEY,
  NUDGE_DELAY_MS,
  NUDGE_COOLDOWN_MS,
  STORE_URL_CHROME,
  STORE_URL_FIREFOX,
  ensureFirstUseTimestamp,
  shouldShowReviewNudge,
  dismissReviewNudgeForNow,
  dismissReviewNudgePermanently,
  markReviewNudgeHandled,
  getReviewStoreUrl,
  openReviewStorePage
} = require('./review-nudge.js');

describe('review-nudge.js', () => {
  let localData;
  let localGetMock;
  let localSetMock;

  beforeEach(() => {
    localData = {};
    global.CSS = { supports: vi.fn(() => false) };
    localGetMock = vi.fn((keys, cb) => {
      const result = {};
      for (const key of keys) {
        if (localData[key] !== undefined) {
          result[key] = localData[key];
        }
      }
      if (cb) cb(result);
    });
    localSetMock = vi.fn((data, cb) => {
      Object.assign(localData, data);
      if (cb) cb();
    });

    global.chrome = {
      runtime: {
        lastError: undefined,
        getManifest: vi.fn(() => ({}))
      },
      storage: {
        local: {
          get: localGetMock,
          set: localSetMock
        }
      },
      tabs: {
        create: vi.fn()
      }
    };
  });

  afterEach(() => {
    delete global.chrome;
    delete global.CSS;
  });

  test('ensureFirstUseTimestamp records and returns a timestamp when missing', async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const ts = await ensureFirstUseTimestamp();
    expect(ts).toBe(now);
    expect(localSetMock).toHaveBeenCalledWith({ [FIRST_USE_TIMESTAMP_KEY]: now }, expect.any(Function));
  });

  test('ensureFirstUseTimestamp returns existing timestamp without writing', async () => {
    const existing = 1_600_000_000_000;
    localData[FIRST_USE_TIMESTAMP_KEY] = existing;

    const ts = await ensureFirstUseTimestamp();
    expect(ts).toBe(existing);
    expect(localSetMock).not.toHaveBeenCalled();
  });

  test('shouldShowReviewNudge is false before 7 days elapse', async () => {
    const firstUse = 1_700_000_000_000;
    localData[FIRST_USE_TIMESTAMP_KEY] = firstUse;

    const show = await shouldShowReviewNudge(firstUse + NUDGE_DELAY_MS - 1);
    expect(show).toBe(false);
  });

  test('shouldShowReviewNudge is true after 7 days with no dismiss state', async () => {
    const firstUse = 1_700_000_000_000;
    localData[FIRST_USE_TIMESTAMP_KEY] = firstUse;

    const show = await shouldShowReviewNudge(firstUse + NUDGE_DELAY_MS);
    expect(show).toBe(true);
  });

  test('shouldShowReviewNudge is false during cooldown after Not now', async () => {
    const firstUse = 1_700_000_000_000;
    const now = firstUse + NUDGE_DELAY_MS + 1000;
    localData[FIRST_USE_TIMESTAMP_KEY] = firstUse;
    localData[REVIEW_NUDGE_COOLDOWN_UNTIL_KEY] = now + NUDGE_COOLDOWN_MS;

    const show = await shouldShowReviewNudge(now);
    expect(show).toBe(false);
  });

  test('shouldShowReviewNudge is false when permanently dismissed', async () => {
    const firstUse = 1_700_000_000_000;
    localData[FIRST_USE_TIMESTAMP_KEY] = firstUse;
    localData[REVIEW_NUDGE_NEVER_ASK_KEY] = true;

    const show = await shouldShowReviewNudge(firstUse + NUDGE_DELAY_MS);
    expect(show).toBe(false);
  });

  test('shouldShowReviewNudge is false after review CTA handled', async () => {
    const firstUse = 1_700_000_000_000;
    localData[FIRST_USE_TIMESTAMP_KEY] = firstUse;
    localData[REVIEW_NUDGE_HANDLED_KEY] = true;

    const show = await shouldShowReviewNudge(firstUse + NUDGE_DELAY_MS);
    expect(show).toBe(false);
  });

  test('dismissReviewNudgeForNow sets a 7-day cooldown', async () => {
    const now = 1_700_000_000_000;
    await dismissReviewNudgeForNow(now);
    expect(localData[REVIEW_NUDGE_COOLDOWN_UNTIL_KEY]).toBe(now + NUDGE_COOLDOWN_MS);
  });

  test('dismissReviewNudgePermanently sets never-ask flag', async () => {
    await dismissReviewNudgePermanently();
    expect(localData[REVIEW_NUDGE_NEVER_ASK_KEY]).toBe(true);
  });

  test('markReviewNudgeHandled sets handled flag', async () => {
    await markReviewNudgeHandled();
    expect(localData[REVIEW_NUDGE_HANDLED_KEY]).toBe(true);
  });

  test('getReviewStoreUrl returns Chrome URL by default', () => {
    global.CSS = { supports: vi.fn(() => false) };
    expect(getReviewStoreUrl()).toBe(STORE_URL_CHROME);
  });

  test('getReviewStoreUrl returns Chrome URL when manifest has gecko but runtime is Chromium', () => {
    chrome.runtime.getManifest = vi.fn(() => ({
      browser_specific_settings: { gecko: { id: 'youtublur@kyto64.github.io' } }
    }));
    global.CSS = { supports: vi.fn(() => false) };
    expect(getReviewStoreUrl()).toBe(STORE_URL_CHROME);
  });

  test('getReviewStoreUrl returns Firefox URL when Gecko layout engine is detected', () => {
    global.CSS = {
      supports: vi.fn((prop) => prop === '-moz-appearance')
    };
    expect(getReviewStoreUrl()).toBe(STORE_URL_FIREFOX);
  });

  test('openReviewStorePage opens the store in a new tab', () => {
    openReviewStorePage();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: STORE_URL_CHROME });
  });
});
