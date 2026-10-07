"use strict";
const FIRST_USE_TIMESTAMP_KEY = 'firstUseTimestamp';
const REVIEW_NUDGE_HANDLED_KEY = 'reviewNudgeHandled';
const REVIEW_NUDGE_NEVER_ASK_KEY = 'reviewNudgeNeverAsk';
const REVIEW_NUDGE_COOLDOWN_UNTIL_KEY = 'reviewNudgeCooldownUntil';
/** Wait ~7 days after first popup open before showing the nudge. */
const NUDGE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
/** "Not now" hides the nudge for another 7 days. */
const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const STORE_URL_CHROME = 'https://chromewebstore.google.com/detail/youtublur/npkiobfoclnkmobjhgadnjepceofjenj';
const STORE_URL_FIREFOX = 'https://addons.mozilla.org/firefox/addon/youtublur/';
function storageLocalGet(keys) {
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
        }
        catch (error) {
            console.warn('Review nudge storage read failed:', error);
            resolve({ ok: false });
        }
    });
}
/** Returns false on lastError or a thrown storage API failure. Never rejects. */
function storageLocalSet(data) {
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
        }
        catch (error) {
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
function isFirefoxBrowser() {
    try {
        return (typeof CSS !== 'undefined' &&
            typeof CSS.supports === 'function' &&
            CSS.supports('-moz-appearance', 'none'));
    }
    catch {
        return false;
    }
}
function getReviewStoreUrl() {
    return isFirefoxBrowser() ? STORE_URL_FIREFOX : STORE_URL_CHROME;
}
/**
 * Record first popup open time if missing.
 * Returns the persisted timestamp, or null when the read/write failed
 * (do not invent a timestamp that was not stored).
 */
async function ensureFirstUseTimestamp() {
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
async function shouldShowReviewNudge(now = Date.now()) {
    const keys = [
        FIRST_USE_TIMESTAMP_KEY,
        REVIEW_NUDGE_HANDLED_KEY,
        REVIEW_NUDGE_NEVER_ASK_KEY,
        REVIEW_NUDGE_COOLDOWN_UNTIL_KEY
    ];
    const read = await storageLocalGet(keys);
    if (!read.ok) {
        return false;
    }
    const result = read.data;
    if (result[REVIEW_NUDGE_HANDLED_KEY] === true || result[REVIEW_NUDGE_NEVER_ASK_KEY] === true) {
        return false;
    }
    const cooldownUntil = result[REVIEW_NUDGE_COOLDOWN_UNTIL_KEY];
    if (typeof cooldownUntil === 'number' && now < cooldownUntil) {
        return false;
    }
    const firstUse = result[FIRST_USE_TIMESTAMP_KEY];
    if (typeof firstUse !== 'number' || firstUse <= 0) {
        return false;
    }
    return now - firstUse >= NUDGE_DELAY_MS;
}
async function dismissReviewNudgeForNow(now = Date.now()) {
    return storageLocalSet({
        [REVIEW_NUDGE_COOLDOWN_UNTIL_KEY]: now + NUDGE_COOLDOWN_MS
    });
}
async function dismissReviewNudgePermanently() {
    return storageLocalSet({ [REVIEW_NUDGE_NEVER_ASK_KEY]: true });
}
async function markReviewNudgeHandled() {
    return storageLocalSet({ [REVIEW_NUDGE_HANDLED_KEY]: true });
}
function openReviewStorePage() {
    const url = getReviewStoreUrl();
    try {
        chrome.tabs.create({ url });
    }
    catch {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
const reviewNudgeApi = {
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
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = reviewNudgeApi;
}
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, reviewNudgeApi);
}
