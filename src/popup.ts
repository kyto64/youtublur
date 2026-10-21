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
  const blurStrengthSlider = document.getElementById('blurStrength');
  if (blurStrengthLabel) blurStrengthLabel.textContent = chrome.i18n.getMessage('blurStrengthLabel');
  if (blurStrengthSlider) {
    blurStrengthSlider.setAttribute('aria-label', chrome.i18n.getMessage('blurStrengthSliderAria'));
  }

  const reviewTitle = document.getElementById('reviewNudgeTitle');
  const reviewBody = document.getElementById('reviewNudgeBody');
  const reviewLeave = document.getElementById('reviewNudgeLeave');
  const reviewClose = document.getElementById('reviewNudgeClose');
  if (reviewTitle) reviewTitle.textContent = chrome.i18n.getMessage('reviewNudgeTitle');
  if (reviewBody) reviewBody.textContent = chrome.i18n.getMessage('reviewNudgeBody');
  if (reviewLeave) reviewLeave.textContent = chrome.i18n.getMessage('reviewNudgeLeaveReview');
  if (reviewClose) reviewClose.textContent = chrome.i18n.getMessage('reviewNudgeClose');
  const reviewSaveNotice = document.getElementById('reviewNudgeSaveNotice');
  if (reviewSaveNotice) reviewSaveNotice.textContent = chrome.i18n.getMessage('reviewNudgeSaveFailed');
}

function showReviewNudgeSaveFailure() {
  const notice = document.getElementById('reviewNudgeSaveNotice');
  if (notice) notice.hidden = false;
}

/** Hide the nudge only after the choice is persisted. Leave it up, with a short notice, when the write fails. */
function finishReviewNudgeChoice(saved: boolean, afterSave?: () => void) {
  if (!saved) {
    showReviewNudgeSaveFailure();
    return;
  }
  hideReviewNudge();
  afterSave?.();
}

function formatBlurStrengthValue(px: number): string {
  const unit = chrome.i18n?.getMessage('blurStrengthUnit') || 'px';
  return `${px}\u00a0${unit}`;
}

function previewBlurCssPx(strengthPx: number): number {
  // The swatch is much smaller than the player. Keep the historical 14px look at the 40px default.
  const ratio = strengthPx / YOUTUBLUR_BLUR_RANGE.defaultValue;
  return Math.max(1, Math.round(ratio * 14));
}

function updateBlurStrengthUi(px: number) {
  const slider = document.getElementById('blurStrength') as HTMLInputElement | null;
  const valueEl = document.getElementById('blurStrengthValue');
  const overlay = document.querySelector('.preview-blur-overlay') as HTMLElement | null;
  if (slider && slider.value !== String(px)) slider.value = String(px);
  if (valueEl) valueEl.textContent = formatBlurStrengthValue(px);
  if (slider) slider.setAttribute('aria-valuetext', formatBlurStrengthValue(px));
  if (overlay) overlay.style.setProperty('--preview-blur-amount', `${previewBlurCssPx(px)}px`);
}

function notifyActiveYouTubeTab(message: unknown) {
  if (typeof chrome === 'undefined' || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id && tab.url?.includes('youtube.com')) {
      sendMessageToTab(tab.id, message);
    }
  });
}

const BLUR_SAVE_DEBOUNCE_MS = 200;
let blurSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBlurPx: number | null = null;
let lastPersistedBlurPx: number | null = null;
let lastNotifiedBlurPx: number | null = null;
let blurStrengthTouched = false;
let blurPagehideWired = false;

function flushBlurStrengthSave() {
  if (blurSaveTimer !== null) {
    clearTimeout(blurSaveTimer);
    blurSaveTimer = null;
  }
  if (pendingBlurPx === null || pendingBlurPx === lastPersistedBlurPx) {
    pendingBlurPx = null;
    return;
  }
  const px = pendingBlurPx;
  pendingBlurPx = null;
  lastPersistedBlurPx = px;
  saveBlurStrengthToStorage(px);
}

function scheduleBlurStrengthSave(px: number) {
  pendingBlurPx = px;
  if (blurSaveTimer !== null) clearTimeout(blurSaveTimer);
  blurSaveTimer = setTimeout(flushBlurStrengthSave, BLUR_SAVE_DEBOUNCE_MS);
}

function publishBlurStrength(px: number, save: 'debounce' | 'now') {
  blurStrengthTouched = true;
  const clamped = clampBlurStrengthPx(px);
  updateBlurStrengthUi(clamped);
  if (clamped !== lastNotifiedBlurPx) {
    lastNotifiedBlurPx = clamped;
    notifyActiveYouTubeTab({ type: 'BLUR_STRENGTH_CHANGED', strength: clamped });
  }
  if (save === 'now') {
    pendingBlurPx = clamped;
    flushBlurStrengthSave();
  } else {
    scheduleBlurStrengthSave(clamped);
  }
}

function wireBlurStrengthControl() {
  const slider = document.getElementById('blurStrength') as HTMLInputElement | null;
  if (!slider) return;

  if (blurSaveTimer !== null) {
    clearTimeout(blurSaveTimer);
    blurSaveTimer = null;
  }
  pendingBlurPx = null;
  lastPersistedBlurPx = null;
  lastNotifiedBlurPx = null;
  blurStrengthTouched = false;

  const range = YOUTUBLUR_BLUR_RANGE;
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(range.step);

  slider.addEventListener('input', () => publishBlurStrength(Number(slider.value), 'debounce'));
  slider.addEventListener('change', () => publishBlurStrength(Number(slider.value), 'now'));
  if (!blurPagehideWired) {
    blurPagehideWired = true;
    const flushIfLeaving = () => flushBlurStrengthSave();
    window.addEventListener('pagehide', flushIfLeaving);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushBlurStrengthSave();
    });
  }

  loadBlurStrengthFromStorage().then((px) => {
    if (blurStrengthTouched) return;
    lastPersistedBlurPx = px;
    lastNotifiedBlurPx = px;
    updateBlurStrengthUi(px);
  });
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
  const closeBtn = document.getElementById('reviewNudgeClose');
  if (!nudge || !leaveBtn || !closeBtn) return;

  // Opening the popup clears the badge that pointed here.
  if (typeof clearReviewBadge === 'function') clearReviewBadge();

  ensureFirstUseTimestamp().then(() => {
    shouldShowReviewNudge().then((show) => {
      if (!show) return;
      showReviewNudge();
      // Shown once: later popups skip it even if this one is closed without a choice.
      markReviewNudgeShown();
    });
  });

  leaveBtn.addEventListener('click', () => {
    markReviewNudgeHandled().then(
      (saved) => finishReviewNudgeChoice(saved, openReviewStorePage),
      () => showReviewNudgeSaveFailure()
    );
  });

  closeBtn.addEventListener('click', () => {
    dismissReviewNudgePermanently().then(
      (saved) => finishReviewNudgeChoice(saved),
      () => showReviewNudgeSaveFailure()
    );
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
    wireBlurStrengthControl();
    if (typeof wireSolidColorControl === 'function') wireSolidColorControl();
    if (typeof initPopupShortcuts === 'function') initPopupShortcuts();

    loadModeFromStorage().then((mode) => {
      const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid') as HTMLInputElement | null;
      if (radio) radio.checked = true;
    });

    document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const mode = (e.target as HTMLInputElement).value as BackgroundMode;
        saveModeToStorage(mode).then(() => {
          notifyActiveYouTubeTab({ type: 'BG_MODE_CHANGED', mode });
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

if (typeof globalThis !== 'undefined') {
  // popup-color.js calls this. Classic scripts share the global binding; Node tests do not.
  Object.assign(globalThis, { sendMessageToTab });
}

if (typeof module !== 'undefined' && module.exports) {
  const { STORAGE_KEY, saveModeToStorage, loadModeFromStorage } = require('./storage-mode.js');
  module.exports = { initPopup, sendMessageToTab, STORAGE_KEY, saveModeToStorage, loadModeFromStorage };
}
