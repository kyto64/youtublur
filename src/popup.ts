// load/save: storage-mode.js (loaded from popup.html before this file)

function applyLocalizedStrings() {
  if (typeof chrome === 'undefined' || !chrome.i18n) return;
  document.documentElement.lang = chrome.i18n.getUILanguage();
  const heading = document.getElementById('popupHeading');
  const blur = document.getElementById('labelModeBlur');
  const solid = document.getElementById('labelModeSolid');
  if (heading) {
    const phrases = [];
    for (let i = 0; i < 20; i++) {
      const msg = chrome.i18n.getMessage('popupPhrase' + i);
      if (!msg) break;
      phrases.push(msg);
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

  const blurStrengthLabel = document.getElementById('labelBlurStrength');
  const blurStrengthSlider = document.getElementById('blurStrength') as HTMLInputElement | null;
  if (blurStrengthLabel) blurStrengthLabel.textContent = chrome.i18n.getMessage('blurStrengthLabel');
  if (blurStrengthSlider) {
    blurStrengthSlider.setAttribute('aria-label', chrome.i18n.getMessage('blurStrengthSliderAria'));
  }
}

function formatBlurStrengthValue(px: number): string {
  if (typeof chrome === 'undefined' || !chrome.i18n) return `${px}px`;
  const unit = chrome.i18n.getMessage('blurStrengthUnit');
  return `${px}\u00a0${unit}`;
}

function setPreviewBlurAmount(px: number) {
  const overlay = document.querySelector('.preview-blur-overlay') as HTMLElement | null;
  if (overlay) {
    overlay.style.setProperty('--preview-blur-amount', `${px}px`);
  }
}

function updateBlurStrengthUi(px: number) {
  const slider = document.getElementById('blurStrength') as HTMLInputElement | null;
  const valueEl = document.getElementById('blurStrengthValue');
  if (slider) slider.value = String(px);
  if (valueEl) valueEl.textContent = formatBlurStrengthValue(px);
  setPreviewBlurAmount(px);
}

function notifyActiveTabBlurStrength(px: number) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id && tab.url?.includes('youtube.com')) {
      chrome.tabs.sendMessage(tab.id, { type: 'BLUR_STRENGTH_CHANGED', strength: px }).catch(() => {});
    }
  });
}

function initPopup() {
  document.addEventListener('DOMContentLoaded', () => {
    applyLocalizedStrings();

    const range = YOUTUBLUR_BLUR_RANGE;
    const slider = document.getElementById('blurStrength') as HTMLInputElement | null;
    if (slider) {
      slider.min = String(range.min);
      slider.max = String(range.max);
      slider.step = String(range.step);
    }

    Promise.all([loadModeFromStorage(), loadBlurStrengthFromStorage()]).then(([mode, blurPx]) => {
      const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid') as HTMLInputElement | null;
      if (radio) radio.checked = true;
      updateBlurStrengthUi(blurPx);
    });

    document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const nextMode = (e.target as HTMLInputElement).value as BackgroundMode;
        saveModeToStorage(nextMode).then(() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id && tab.url?.includes('youtube.com')) {
              chrome.tabs.sendMessage(tab.id, { type: 'BG_MODE_CHANGED', mode: nextMode }).catch(() => {});
            }
          });
        });
      });
    });

    if (slider) {
      slider.addEventListener('input', () => {
        const px = Number(slider.value);
        if (!Number.isFinite(px)) return;
        updateBlurStrengthUi(px);
        saveBlurStrengthToStorage(px).then(() => {
          notifyActiveTabBlurStrength(px);
        });
      });
    }

    const reloadButton = document.getElementById('reloadButton');
    if (reloadButton) {
      let isReloading = false;

      const labelReload = document.getElementById('labelReload');

      const triggerReload = () => {
        // リロード中なら中断しない
        if (isReloading) return;

        isReloading = true;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (tab?.id && tab.url?.includes('youtube.com')) {
            reloadButton.classList.add('loading');
            if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadingButton');

            chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_BLUR' }).catch(() => {});

            // リロード完了後、クラスを削除して元の状態に戻す
            setTimeout(() => {
              isReloading = false;
              reloadButton.classList.remove('loading');
              if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadButton');
            }, 500);
          } else {
            isReloading = false;
          }
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
  const {
    STORAGE_KEY,
    saveModeToStorage,
    loadModeFromStorage,
    saveBlurStrengthToStorage,
    loadBlurStrengthFromStorage
  } = require('./storage-mode.js');
  module.exports = {
    initPopup,
    STORAGE_KEY,
    saveModeToStorage,
    loadModeFromStorage,
    saveBlurStrengthToStorage,
    loadBlurStrengthFromStorage
  };
}
