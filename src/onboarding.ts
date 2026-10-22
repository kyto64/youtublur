// Install-time onboarding and the review badge. Runs in the background worker and the popup.
// Uses storageLocalGet / storageLocalSet / shouldShowReviewNudge from review-nudge.js
// (loaded first). Nothing here talks to the network.

const WELCOME_SHOWN_KEY = 'welcomeShown';
const WELCOME_PAGE_PATH = 'welcome.html';
/** A digit reads the same in every locale, so the badge needs no i18n key. */
const REVIEW_BADGE_TEXT = '1';
const REVIEW_BADGE_COLOR = '#FF0033';

function ignoreRejection(maybe: unknown): void {
  if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
    (maybe as Promise<unknown>).catch(() => undefined);
  }
}

function openWelcomePage(): void {
  try {
    const url = chrome.runtime.getURL(WELCOME_PAGE_PATH);
    ignoreRejection(chrome.tabs.create({ url }) as unknown);
  } catch (error) {
    console.warn('[youtublur] failed to open the welcome page:', error);
  }
}

/**
 * Only a fresh install (reason === 'install') records the install time and opens the
 * welcome page. Updates and browser updates do nothing here.
 * The flag is saved before the tab opens, so the page never opens twice.
 */
async function handleExtensionInstalled(
  details: { reason?: string } | undefined,
  now = Date.now()
): Promise<boolean> {
  if (!details || details.reason !== 'install') return false;

  const read = await storageLocalGet([INSTALL_TIMESTAMP_KEY, WELCOME_SHOWN_KEY]);
  if (!read.ok) return false;

  const data: Record<string, unknown> = {};
  const existing = read.data[INSTALL_TIMESTAMP_KEY];
  if (typeof existing !== 'number' || existing <= 0) {
    data[INSTALL_TIMESTAMP_KEY] = now;
  }
  const alreadyWelcomed = read.data[WELCOME_SHOWN_KEY] === true;
  if (!alreadyWelcomed) data[WELCOME_SHOWN_KEY] = true;
  if (Object.keys(data).length === 0) return false;

  const saved = await storageLocalSet(data);
  if (!saved || alreadyWelcomed) return false;
  openWelcomePage();
  return true;
}

function getActionApi(): typeof chrome.action | undefined {
  if (typeof chrome === 'undefined') return undefined;
  return chrome.action;
}

function setReviewBadgeText(text: string): void {
  const action = getActionApi();
  if (!action || typeof action.setBadgeText !== 'function') return;
  try {
    if (text && typeof action.setBadgeBackgroundColor === 'function') {
      ignoreRejection(action.setBadgeBackgroundColor({ color: REVIEW_BADGE_COLOR }) as unknown);
    }
    ignoreRejection(action.setBadgeText({ text }) as unknown);
  } catch (error) {
    console.warn('[youtublur] failed to update the badge:', error);
  }
}

/** Show the badge while the review prompt is waiting in the popup. Clear it otherwise. */
async function refreshReviewBadge(now = Date.now()): Promise<boolean> {
  // Only installs with a recorded install time get the badge; older users keep the in-popup nudge.
  const read = await storageLocalGet([INSTALL_TIMESTAMP_KEY]);
  const installedAt = read.ok ? read.data[INSTALL_TIMESTAMP_KEY] : undefined;
  const show =
    typeof installedAt === 'number' && installedAt > 0 && (await shouldShowReviewNudge(now));
  setReviewBadgeText(show ? REVIEW_BADGE_TEXT : '');
  return show;
}

function clearReviewBadge(): void {
  setReviewBadgeText('');
}

const onboardingApi = {
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
