const STORAGE_KEY = 'playerBackgroundMode';

function applyLocalizedStrings() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return;
  document.documentElement.lang = chrome.i18n.getUILanguage();
  const heading = document.getElementById('popupHeading');
  const blur = document.getElementById('labelModeBlur');
  const solid = document.getElementById('labelModeSolid');
  if (heading) heading.textContent = chrome.i18n.getMessage('popupHeading');
  if (blur) blur.textContent = chrome.i18n.getMessage('modeBlur');
  if (solid) solid.textContent = chrome.i18n.getMessage('modeSolid');
}

function initPopup() {
  document.addEventListener('DOMContentLoaded', () => {
    applyLocalizedStrings();

    chrome.storage.sync.get({ [STORAGE_KEY]: 'blur' }, (items) => {
      const mode = items[STORAGE_KEY];
      const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid');
      if (radio) radio.checked = true;
    });

    document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const mode = e.target.value;
        chrome.storage.sync.set({ [STORAGE_KEY]: mode }, () => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id && tab.url?.includes('youtube.com')) {
              chrome.tabs.sendMessage(tab.id, { type: 'BG_MODE_CHANGED', mode }).catch(() => {});
            }
          });
        });
      });
    });

    document.getElementById('reloadButton').addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url?.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_BLUR' }).catch(() => {});
        }
      });
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  initPopup();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPopup, STORAGE_KEY };
}
