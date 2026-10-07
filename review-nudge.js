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
                if (chrome.runtime?.lastError) {
                    resolve({});
                    return;
                }
                resolve(result);
            });
        }
        catch {
            resolve({});
        }
    });
}
function storageLocalSet(data) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        }
        catch {
            resolve();
        }
    });
}
function isFirefoxBrowser() {
    try {
        const manifest = chrome.runtime.getManifest();
        return Boolean(manifest.browser_specific_settings?.gecko);
    }
    catch {
        return false;
    }
}
function getReviewStoreUrl() {
    return isFirefoxBrowser() ? STORE_URL_FIREFOX : STORE_URL_CHROME;
}
/**
 * Record first popup open time if missing. Returns the stored timestamp.
 */
async function ensureFirstUseTimestamp() {
    const result = await storageLocalGet([FIRST_USE_TIMESTAMP_KEY]);
    const existing = result[FIRST_USE_TIMESTAMP_KEY];
    if (typeof existing === 'number' && existing > 0) {
        return existing;
    }
    const now = Date.now();
    await storageLocalSet({ [FIRST_USE_TIMESTAMP_KEY]: now });
    return now;
}
async function shouldShowReviewNudge(now = Date.now()) {
    const keys = [
        FIRST_USE_TIMESTAMP_KEY,
        REVIEW_NUDGE_HANDLED_KEY,
        REVIEW_NUDGE_NEVER_ASK_KEY,
        REVIEW_NUDGE_COOLDOWN_UNTIL_KEY
    ];
    const result = await storageLocalGet(keys);
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
    await storageLocalSet({
        [REVIEW_NUDGE_COOLDOWN_UNTIL_KEY]: now + NUDGE_COOLDOWN_MS
    });
}
async function dismissReviewNudgePermanently() {
    await storageLocalSet({ [REVIEW_NUDGE_NEVER_ASK_KEY]: true });
}
async function markReviewNudgeHandled() {
    await storageLocalSet({ [REVIEW_NUDGE_HANDLED_KEY]: true });
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
