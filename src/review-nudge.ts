const FIRST_USE_TIMESTAMP_KEY = 'firstUseTimestamp';
/** Saved by runtime.onInstalled on a fresh install. Older installs only have firstUseTimestamp. */
const INSTALL_TIMESTAMP_KEY = 'installTimestamp';
const REVIEW_NUDGE_HANDLED_KEY = 'reviewNudgeHandled';
const REVIEW_NUDGE_NEVER_ASK_KEY = 'reviewNudgeNeverAsk';
/** Set when the popup first shows the nudge. The nudge is shown only once. */
const REVIEW_NUDGE_SHOWN_KEY = 'reviewNudgeShown';
/** Written by the old "Not now" button. Still read so a running cooldown is kept. */
const REVIEW_NUDGE_COOLDOWN_UNTIL_KEY = 'reviewNudgeCooldownUntil';

/** Wait ~7 days after install (or the first popup open for older installs). */
const NUDGE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

const STORE_URL_CHROME =
  'https://chromewebstore.google.com/detail/youtublur/npkiobfoclnkmobjhgadnjepceofjenj';
const STORE_URL_FIREFOX = 'https://addons.mozilla.org/firefox/addon/youtublur/';

type StorageRead = { ok: true; data: Record<string, unknown> } | { ok: false };

function storageLocalGet(keys: string[]): Promise<StorageRead> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) {
          console.warn('Review nudge storage read failed:', error);
          resolve({ ok: false });
          return;
        }
        resolve({ ok: true, data: result ?? {} });
      });
    } catch (error) {
      console.warn('Review nudge storage read failed:', error);
      resolve({ ok: false });
    }
  });
}

/** Returns false on lastError or a thrown storage API failure. Never rejects. */
function storageLocalSet(data: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(data, () => {
        const error = chrome.runtime && chrome.runtime.lastError;
        if (error) {
          console.warn('Review nudge storage write failed:', error);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.warn('Review nudge storage write failed:', error);
      resolve(false);
    }
  });
}

/**
 * Detect Firefox at runtime. Do not use manifest `browser_specific_settings.gecko`:
 * the shared manifest includes gecko metadata on Chrome builds too.
 * Same approach as `isGeckoLayoutEngine()` in content.ts (CSS.supports).
 */
function isFirefoxBrowser(): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('-moz-appearance', 'none')
    );
  } catch {
    return false;
  }
}

function getReviewStoreUrl(): string {
  return isFirefoxBrowser() ? STORE_URL_FIREFOX : STORE_URL_CHROME;
}

/**
 * Record first popup open time if missing.
 * Returns the persisted timestamp, or null when the read/write failed
 * (do not invent a timestamp that was not stored).
 */
async function ensureFirstUseTimestamp(): Promise<number | null> {
  const read = await storageLocalGet([FIRST_USE_TIMESTAMP_KEY]);
  if (!read.ok) {
    return null;
  }

  const existing = read.data[FIRST_USE_TIMESTAMP_KEY];
  if (typeof existing === 'number' && existing > 0) {
    return existing;
  }

  const now = Date.now();
  const saved = await storageLocalSet({ [FIRST_USE_TIMESTAMP_KEY]: now });
  return saved ? now : null;
}

async function shouldShowReviewNudge(now = Date.now()): Promise<boolean> {
  const keys = [
    INSTALL_TIMESTAMP_KEY,
    FIRST_USE_TIMESTAMP_KEY,
    REVIEW_NUDGE_HANDLED_KEY,
    REVIEW_NUDGE_NEVER_ASK_KEY,
    REVIEW_NUDGE_SHOWN_KEY,
    REVIEW_NUDGE_COOLDOWN_UNTIL_KEY
  ];
  const read = await storageLocalGet(keys);
  if (!read.ok) {
    return false;
  }
  const result = read.data;

  if (
    result[REVIEW_NUDGE_HANDLED_KEY] === true ||
    result[REVIEW_NUDGE_NEVER_ASK_KEY] === true ||
    result[REVIEW_NUDGE_SHOWN_KEY] === true
  ) {
    return false;
  }

  const cooldownUntil = result[REVIEW_NUDGE_COOLDOWN_UNTIL_KEY];
  if (typeof cooldownUntil === 'number' && now < cooldownUntil) {
    return false;
  }

  const installedAt = result[INSTALL_TIMESTAMP_KEY];
  const firstUse = result[FIRST_USE_TIMESTAMP_KEY];
  const start =
    typeof installedAt === 'number' && installedAt > 0 ? installedAt : firstUse;
  if (typeof start !== 'number' || start <= 0) {
    return false;
  }

  return now - start >= NUDGE_DELAY_MS;
}

async function markReviewNudgeShown(): Promise<boolean> {
  return storageLocalSet({ [REVIEW_NUDGE_SHOWN_KEY]: true });
}

async function dismissReviewNudgePermanently(): Promise<boolean> {
  return storageLocalSet({ [REVIEW_NUDGE_NEVER_ASK_KEY]: true });
}

async function markReviewNudgeHandled(): Promise<boolean> {
  return storageLocalSet({ [REVIEW_NUDGE_HANDLED_KEY]: true });
}

function openReviewStorePage(): void {
  const url = getReviewStoreUrl();
  try {
    chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const reviewNudgeApi = {
  FIRST_USE_TIMESTAMP_KEY,
  INSTALL_TIMESTAMP_KEY,
  REVIEW_NUDGE_HANDLED_KEY,
  REVIEW_NUDGE_NEVER_ASK_KEY,
  REVIEW_NUDGE_SHOWN_KEY,
  REVIEW_NUDGE_COOLDOWN_UNTIL_KEY,
  NUDGE_DELAY_MS,
  STORE_URL_CHROME,
  STORE_URL_FIREFOX,
  storageLocalGet,
  storageLocalSet,
  ensureFirstUseTimestamp,
  shouldShowReviewNudge,
  markReviewNudgeShown,
  dismissReviewNudgePermanently,
  markReviewNudgeHandled,
  getReviewStoreUrl,
  openReviewStorePage
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = reviewNudgeApi;
}
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, reviewNudgeApi);
}
