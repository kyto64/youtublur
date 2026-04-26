const STORAGE_KEY = 'playerBackgroundMode';

function applyLocalizedStrings() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return;
  document.documentElement.lang = chrome.i18n.getUILanguage();
  const heading = document.getElementById('popupHeading');
  const blur = document.getElementById('labelModeBlur');
  const solid = document.getElementById('labelModeSolid');
  if (heading) {
    const phrases = [];
    for (let i = 0; i < 8; i++) {
      const msg = chrome.i18n.getMessage(`popupPhrase${i}`);
      if (msg) phrases.push(msg);
    }
    if (phrases.length > 0) {
      heading.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    }
  }
  if (blur) blur.textContent = chrome.i18n.getMessage('modeBlur');
  if (solid) solid.textContent = chrome.i18n.getMessage('modeSolid');
  const blurSub = document.getElementById('labelModeBlurSub');
  const solidSub = document.getElementById('labelModeSolidSub');
  const preview = document.getElementById('labelPreview');
  const reload = document.getElementById('labelReload');
  if (blurSub) blurSub.textContent = chrome.i18n.getMessage('modeBlurSub');
  if (solidSub) solidSub.textContent = chrome.i18n.getMessage('modeSolidSub');
  if (preview) preview.textContent = chrome.i18n.getMessage('previewLabel');
  if (reload) reload.textContent = chrome.i18n.getMessage('reloadButton');
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

    const reloadButton = document.getElementById('reloadButton');
    if (reloadButton) {
      let isReloading = false;

      const labelReload = document.getElementById('labelReload');

      const triggerReload = () => {
        // リロード中なら中断しない
        if (isReloading) return;

        isReloading = true;
        reloadButton.classList.add('loading');
        if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadingButton');

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (tab?.id && tab.url?.includes('youtube.com')) {
            chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_BLUR' }).catch(() => {});
          }

          // リロード完了後、クラスを削除して元の状態に戻す
          setTimeout(() => {
            isReloading = false;
            reloadButton.classList.remove('loading');
            if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadButton');
          }, 500);
        });
      };
      reloadButton.addEventListener('click', triggerReload);
      reloadButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerReload();
        }
      });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  initPopup();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPopup, STORAGE_KEY };
}
