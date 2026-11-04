"use strict";
// Install-time onboarding and the review badge. Runs in the background worker and the popup.
// Uses storageLocalGet / storageLocalSet / shouldShowReviewNudge from review-nudge.js
// (loaded first). Nothing here talks to the network; the uninstall survey URL is only
// registered with the browser, which opens it after the user removes the extension.
const WELCOME_SHOWN_KEY = 'welcomeShown';
const WELCOME_PAGE_PATH = 'welcome.html';
/** A digit reads the same in every locale, so the badge needs no i18n key. */
const REVIEW_BADGE_TEXT = '1';
const REVIEW_BADGE_COLOR = '#FF0033';
function ignoreRejection(maybe) {
    if (maybe && typeof maybe.then === 'function') {
        maybe.catch(() => undefined);
    }
}
function openWelcomePage() {
    try {
        const url = chrome.runtime.getURL(WELCOME_PAGE_PATH);
        ignoreRejection(chrome.tabs.create({ url }));
    }
    catch (error) {
        console.warn('[youtublur] failed to open the welcome page:', error);
    }
}
/**
 * Only a fresh install (reason === 'install') records the install time and opens the
 * welcome page. Updates and browser updates do nothing here.
 * The flag is saved before the tab opens, so the page never opens twice.
 */
async function handleExtensionInstalled(details, now = Date.now()) {
    if (!details || details.reason !== 'install')
        return false;
    const read = await storageLocalGet([INSTALL_TIMESTAMP_KEY, WELCOME_SHOWN_KEY]);
    if (!read.ok)
        return false;
    const data = {};
    const existing = read.data[INSTALL_TIMESTAMP_KEY];
    if (typeof existing !== 'number' || existing <= 0) {
        data[INSTALL_TIMESTAMP_KEY] = now;
    }
    const alreadyWelcomed = read.data[WELCOME_SHOWN_KEY] === true;
    if (!alreadyWelcomed)
        data[WELCOME_SHOWN_KEY] = true;
    if (Object.keys(data).length === 0)
        return false;
    const saved = await storageLocalSet(data);
    if (!saved || alreadyWelcomed)
        return false;
    openWelcomePage();
    return true;
}
function getActionApi() {
    if (typeof chrome === 'undefined')
        return undefined;
    return chrome.action;
}
function setReviewBadgeText(text) {
    const action = getActionApi();
    if (!action || typeof action.setBadgeText !== 'function')
        return;
    try {
        if (text && typeof action.setBadgeBackgroundColor === 'function') {
            ignoreRejection(action.setBadgeBackgroundColor({ color: REVIEW_BADGE_COLOR }));
        }
        ignoreRejection(action.setBadgeText({ text }));
    }
    catch (error) {
        console.warn('[youtublur] failed to update the badge:', error);
    }
}
/** Show the badge while the review prompt is waiting in the popup. Clear it otherwise. */
async function refreshReviewBadge(now = Date.now()) {
    // Only installs with a recorded install time get the badge; older users keep the in-popup nudge.
    const read = await storageLocalGet([INSTALL_TIMESTAMP_KEY]);
    const installedAt = read.ok ? read.data[INSTALL_TIMESTAMP_KEY] : undefined;
    const show = typeof installedAt === 'number' && installedAt > 0 && (await shouldShowReviewNudge(now));
    setReviewBadgeText(show ? REVIEW_BADGE_TEXT : '');
    return show;
}
function clearReviewBadge() {
    setReviewBadgeText('');
}
const UNINSTALL_SURVEY_BASE_URL = 'https://kyto64.github.io/youtublur/uninstall/';
const UNINSTALL_URL_MAX_LENGTH = 255;
const SURVEY_LANGUAGES = ['en', 'ja', 'ko', 'es', 'id', 'pt_BR', 'zh_CN', 'zh_TW'];
/** Round a browser UI language ("pt-BR", "zh-Hant", "es-419", ...) to one of the 8 supported locales. */
function normalizeSurveyLanguage(raw) {
    if (typeof raw !== 'string')
        return 'en';
    const parts = raw.trim().replace(/_/g, '-').toLowerCase().split('-');
    const base = parts[0];
    if (base === 'zh') {
        const rest = parts.slice(1);
        const traditional = rest.includes('hant') ||
            (!rest.includes('hans') && (rest.includes('tw') || rest.includes('hk') || rest.includes('mo')));
        return traditional ? 'zh_TW' : 'zh_CN';
    }
    if (base === 'pt')
        return 'pt_BR';
    if (base === 'in')
        return 'id';
    return SURVEY_LANGUAGES.includes(base) ? base : 'en';
}
/** Build the survey URL, or null when it would not fit the browser's 255-character limit. */
function buildUninstallSurveyUrl(version, uiLanguage) {
    const v = typeof version === 'string' ? version.trim() : '';
    if (!/^[0-9A-Za-z.+-]+$/.test(v))
        return null;
    const url = `${UNINSTALL_SURVEY_BASE_URL}?v=${encodeURIComponent(v)}&lang=${normalizeSurveyLanguage(uiLanguage)}`;
    return url.length <= UNINSTALL_URL_MAX_LENGTH ? url : null;
}
/**
 * Register the uninstall survey page. Safe to call on every worker start and on install:
 * it does nothing where setUninstallURL (or the manifest) is unavailable, and never throws.
 */
function configureUninstallSurvey() {
    try {
        if (typeof chrome === 'undefined' || !chrome.runtime)
            return false;
        const runtime = chrome.runtime;
        if (typeof runtime.setUninstallURL !== 'function' || typeof runtime.getManifest !== 'function') {
            return false;
        }
        const uiLanguage = chrome.i18n && typeof chrome.i18n.getUILanguage === 'function'
            ? chrome.i18n.getUILanguage()
            : undefined;
        const url = buildUninstallSurveyUrl(runtime.getManifest().version, uiLanguage);
        if (!url)
            return false;
        ignoreRejection(runtime.setUninstallURL(url));
        return true;
    }
    catch (error) {
        console.warn('[youtublur] failed to set the uninstall URL:', error);
        return false;
    }
}
const onboardingApi = {
    UNINSTALL_SURVEY_BASE_URL,
    normalizeSurveyLanguage,
    buildUninstallSurveyUrl,
    configureUninstallSurvey,
    WELCOME_SHOWN_KEY,
    WELCOME_PAGE_PATH,
    REVIEW_BADGE_TEXT,
    handleExtensionInstalled,
    refreshReviewBadge,
    clearReviewBadge
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = onboardingApi;
}
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, onboardingApi);
}
