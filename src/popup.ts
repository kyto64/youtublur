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

  const reviewTitle = document.getElementById('reviewNudgeTitle');
  const reviewBody = document.getElementById('reviewNudgeBody');
  const reviewLeave = document.getElementById('reviewNudgeLeave');
  const reviewNotNow = document.getElementById('reviewNudgeNotNow');
  const reviewNever = document.getElementById('reviewNudgeNever');
  if (reviewTitle) reviewTitle.textContent = chrome.i18n.getMessage('reviewNudgeTitle');
  if (reviewBody) reviewBody.textContent = chrome.i18n.getMessage('reviewNudgeBody');
  if (reviewLeave) reviewLeave.textContent = chrome.i18n.getMessage('reviewNudgeLeaveReview');
  if (reviewNotNow) reviewNotNow.textContent = 'Not now';
  if (reviewNever) reviewNever.textContent = chrome.i18n.getMessage('reviewNudgeDontAskAgain');
}

function hideReviewNudge() {
  const nudge = document.getElementById('reviewNudge');
  if (nudge) nudge.hidden = true;
}

function showReviewNudge() {
  const nudge = document.getElementById('reviewNudge');
  if (nudge) nudge.hidden = false;
}

function initReviewNudge() {
  const nudge = document.getElementById('reviewNudge');
  const leaveBtn = document.getElementById('reviewNudgeLeave');
  const notNowBtn = document.getElementById('reviewNudgeNotNow');
  const neverBtn = document.getElementById('reviewNudgeNever');
  if (!nudge || !leaveBtn || !notNowBtn || !neverBtn) return;

  ensureFirstUseTimestamp().then(() => {
    shouldShowReviewNudge().then((show) => {
      if (show) showReviewNudge();
    });
  });

  leaveBtn.addEventListener('click', () => {
    markReviewNudgeHandled().then(() => {
      hideReviewNudge();
      openReviewStorePage();
    });
  });

  notNowBtn.addEventListener('click', () => {
    dismissReviewNudgeForNow().then(() => {
      hideReviewNudge();
    });
  });

  neverBtn.addEventListener('click', () => {
    dismissReviewNudgePermanently().then(() => {
      hideReviewNudge();
    });
  });
}

// Supports both callback-style and Promise-returning chrome.tabs.sendMessage implementations.
function sendMessageToTab(
  tabId: number,
  message: unknown,
  onResult?: (delivered: boolean) => void
) {
  let settled = false;
  const settle = (delivered: boolean) => {
    if (settled) return;
    settled = true;
    onResult?.(delivered);
  };

  try {
    const maybePromise = chrome.tabs.sendMessage(tabId, message, () => {
      settle(!chrome.runtime?.lastError);
    }) as unknown;
    if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
      (maybePromise as Promise<void>).then(() => settle(true)).catch(() => settle(false));
    }
  } catch {
    settle(false);
  }
}

function initPopup() {
  document.addEventListener('DOMContentLoaded', () => {
    applyLocalizedStrings();
    initReviewNudge();

    loadModeFromStorage().then((mode) => {
      const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid') as HTMLInputElement | null;
      if (radio) radio.checked = true;
    });

    document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const mode = (e.target as HTMLInputElement).value as BackgroundMode;
        saveModeToStorage(mode).then(() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab?.id && tab.url?.includes('youtube.com')) {
              sendMessageToTab(tab.id, { type: 'BG_MODE_CHANGED', mode });
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

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          if (tab?.id && tab.url?.includes('youtube.com')) {
            reloadButton.classList.add('loading');
            if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadingButton');

            sendMessageToTab(tab.id, { type: 'RELOAD_BLUR' }, (delivered) => {
              if (!delivered) {
                isReloading = false;
                reloadButton.classList.remove('loading');
                if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadButton');
                return;
              }

              // リロード完了後、クラスを削除して元の状態に戻す
              setTimeout(() => {
                isReloading = false;
                reloadButton.classList.remove('loading');
                if (labelReload) labelReload.textContent = chrome.i18n.getMessage('reloadButton');
              }, 500);
            });
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
  const { STORAGE_KEY, saveModeToStorage, loadModeFromStorage } = require('./storage-mode.js');
  module.exports = { initPopup, sendMessageToTab, STORAGE_KEY, saveModeToStorage, loadModeFromStorage };
}
