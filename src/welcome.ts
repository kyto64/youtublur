// Welcome page opened once after a fresh install (see onboarding.ts).

function applyWelcomeStrings(): void {
  if (typeof chrome === 'undefined' || !chrome.i18n) return;
  document.documentElement.lang = chrome.i18n.getUILanguage();
  const title = chrome.i18n.getMessage('welcomeTitle');
  if (title) document.title = title;
  const pairs: Array<[string, string]> = [
    ['welcomeTitle', 'welcomeTitle'],
    ['welcomeTheaterHint', 'welcomeTheaterHint'],
    ['welcomePopupHint', 'welcomePopupHint'],
    ['welcomeClose', 'welcomeClose']
  ];
  for (const [id, key] of pairs) {
    const el = document.getElementById(id);
    if (el) el.textContent = chrome.i18n.getMessage(key);
  }
}

function closeWelcomeTab(): void {
  try {
    chrome.tabs.getCurrent((tab) => {
      void (chrome.runtime && chrome.runtime.lastError);
      if (tab && typeof tab.id === 'number') {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  } catch {
    window.close();
  }
}

function initWelcomePage(): void {
  applyWelcomeStrings();
  const button = document.getElementById('welcomeClose');
  if (button) button.addEventListener('click', closeWelcomeTab);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcomePage, { once: true });
  } else {
    initWelcomePage();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initWelcomePage, applyWelcomeStrings };
}
