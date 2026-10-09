"use strict";
// load/save: storage-mode.js (loaded from popup.html before this file)
function applyLocalizedStrings() {
    if (typeof chrome === 'undefined' || !chrome.i18n)
        return;
    document.documentElement.lang = chrome.i18n.getUILanguage();
    const heading = document.getElementById('popupHeading');
    const blur = document.getElementById('labelModeBlur');
    const solid = document.getElementById('labelModeSolid');
    if (heading) {
        const phrases = [];
        for (let i = 0; i < 20; i++) {
            const msg = chrome.i18n.getMessage('popupPhrase' + i);
            if (!msg)
                break;
            phrases.push(msg);
        }
        if (phrases.length > 0) {
            heading.textContent = phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    if (blur)
        blur.textContent = chrome.i18n.getMessage('modeBlur');
    if (solid)
        solid.textContent = chrome.i18n.getMessage('modeSolid');
    const blurSub = document.getElementById('labelModeBlurSub');
    const solidSub = document.getElementById('labelModeSolidSub');
    const preview = document.getElementById('labelPreview');
    const reload = document.getElementById('labelReload');
    if (blurSub)
        blurSub.textContent = chrome.i18n.getMessage('modeBlurSub');
    if (solidSub)
        solidSub.textContent = chrome.i18n.getMessage('modeSolidSub');
    if (preview)
        preview.textContent = chrome.i18n.getMessage('previewLabel');
    if (reload)
        reload.textContent = chrome.i18n.getMessage('reloadButton');
    const blurStrengthLabel = document.getElementById('labelBlurStrength');
    const blurStrengthSlider = document.getElementById('blurStrength');
    if (blurStrengthLabel)
        blurStrengthLabel.textContent = chrome.i18n.getMessage('blurStrengthLabel');
    if (blurStrengthSlider) {
        blurStrengthSlider.setAttribute('aria-label', chrome.i18n.getMessage('blurStrengthSliderAria'));
    }
    const reviewTitle = document.getElementById('reviewNudgeTitle');
    const reviewBody = document.getElementById('reviewNudgeBody');
    const reviewLeave = document.getElementById('reviewNudgeLeave');
    const reviewNotNow = document.getElementById('reviewNudgeNotNow');
    const reviewNever = document.getElementById('reviewNudgeNever');
    if (reviewTitle)
        reviewTitle.textContent = chrome.i18n.getMessage('reviewNudgeTitle');
    if (reviewBody)
        reviewBody.textContent = chrome.i18n.getMessage('reviewNudgeBody');
    if (reviewLeave)
        reviewLeave.textContent = chrome.i18n.getMessage('reviewNudgeLeaveReview');
    if (reviewNotNow)
        reviewNotNow.textContent = chrome.i18n.getMessage('reviewNudgeNotNow');
    if (reviewNever)
        reviewNever.textContent = chrome.i18n.getMessage('reviewNudgeDontAskAgain');
    const reviewSaveNotice = document.getElementById('reviewNudgeSaveNotice');
    if (reviewSaveNotice)
        reviewSaveNotice.textContent = chrome.i18n.getMessage('reviewNudgeSaveFailed');
}
function showReviewNudgeSaveFailure() {
    const notice = document.getElementById('reviewNudgeSaveNotice');
    if (notice)
        notice.hidden = false;
}
/** Hide the nudge only after the choice is persisted. Leave it up, with a short notice, when the write fails. */
function finishReviewNudgeChoice(saved, afterSave) {
    if (!saved) {
        showReviewNudgeSaveFailure();
        return;
    }
    hideReviewNudge();
    afterSave?.();
}
function formatBlurStrengthValue(px) {
    const unit = chrome.i18n?.getMessage('blurStrengthUnit') || 'px';
    return `${px}\u00a0${unit}`;
}
function previewBlurCssPx(strengthPx) {
    // The swatch is much smaller than the player. Keep the historical 14px look at the 40px default.
    const ratio = strengthPx / YOUTUBLUR_BLUR_RANGE.defaultValue;
    return Math.max(1, Math.round(ratio * 14));
}
function updateBlurStrengthUi(px) {
    const slider = document.getElementById('blurStrength');
    const valueEl = document.getElementById('blurStrengthValue');
    const overlay = document.querySelector('.preview-blur-overlay');
    if (slider && slider.value !== String(px))
        slider.value = String(px);
    if (valueEl)
        valueEl.textContent = formatBlurStrengthValue(px);
    if (slider)
        slider.setAttribute('aria-valuetext', formatBlurStrengthValue(px));
    if (overlay)
        overlay.style.setProperty('--preview-blur-amount', `${previewBlurCssPx(px)}px`);
}
function notifyActiveYouTubeTab(message) {
    if (typeof chrome === 'undefined' || !chrome.tabs)
        return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url?.includes('youtube.com')) {
            sendMessageToTab(tab.id, message);
        }
    });
}
const BLUR_SAVE_DEBOUNCE_MS = 200;
let blurSaveTimer = null;
let pendingBlurPx = null;
let lastPersistedBlurPx = null;
let lastNotifiedBlurPx = null;
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
function scheduleBlurStrengthSave(px) {
    pendingBlurPx = px;
    if (blurSaveTimer !== null)
        clearTimeout(blurSaveTimer);
    blurSaveTimer = setTimeout(flushBlurStrengthSave, BLUR_SAVE_DEBOUNCE_MS);
}
function publishBlurStrength(px, save) {
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
    }
    else {
        scheduleBlurStrengthSave(clamped);
    }
}
function wireBlurStrengthControl() {
    const slider = document.getElementById('blurStrength');
    if (!slider)
        return;
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
            if (document.visibilityState === 'hidden')
                flushBlurStrengthSave();
        });
    }
    loadBlurStrengthFromStorage().then((px) => {
        if (blurStrengthTouched)
            return;
        lastPersistedBlurPx = px;
        lastNotifiedBlurPx = px;
        updateBlurStrengthUi(px);
    });
}
function hideReviewNudge() {
    const nudge = document.getElementById('reviewNudge');
    if (nudge)
        nudge.hidden = true;
}
function showReviewNudge() {
    const nudge = document.getElementById('reviewNudge');
    if (nudge)
        nudge.hidden = false;
}
function initReviewNudge() {
    const nudge = document.getElementById('reviewNudge');
    const leaveBtn = document.getElementById('reviewNudgeLeave');
    const notNowBtn = document.getElementById('reviewNudgeNotNow');
    const neverBtn = document.getElementById('reviewNudgeNever');
    if (!nudge || !leaveBtn || !notNowBtn || !neverBtn)
        return;
    ensureFirstUseTimestamp().then(() => {
        shouldShowReviewNudge().then((show) => {
            if (show)
                showReviewNudge();
        });
    });
    leaveBtn.addEventListener('click', () => {
        markReviewNudgeHandled().then((saved) => finishReviewNudgeChoice(saved, openReviewStorePage), () => showReviewNudgeSaveFailure());
    });
    notNowBtn.addEventListener('click', () => {
        dismissReviewNudgeForNow().then((saved) => finishReviewNudgeChoice(saved), () => showReviewNudgeSaveFailure());
    });
    neverBtn.addEventListener('click', () => {
        dismissReviewNudgePermanently().then((saved) => finishReviewNudgeChoice(saved), () => showReviewNudgeSaveFailure());
    });
}
// Supports both callback-style and Promise-returning chrome.tabs.sendMessage implementations.
function sendMessageToTab(tabId, message, onResult) {
    let settled = false;
    const settle = (delivered) => {
        if (settled)
            return;
        settled = true;
        onResult?.(delivered);
    };
    try {
        const maybePromise = chrome.tabs.sendMessage(tabId, message, () => {
            settle(!chrome.runtime?.lastError);
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(() => settle(true)).catch(() => settle(false));
        }
    }
    catch {
        settle(false);
    }
}
function initPopup() {
    document.addEventListener('DOMContentLoaded', () => {
        applyLocalizedStrings();
        initReviewNudge();
        wireBlurStrengthControl();
        loadModeFromStorage().then((mode) => {
            const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid');
            if (radio)
                radio.checked = true;
        });
        document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
            radio.addEventListener('change', (e) => {
                const mode = e.target.value;
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
                if (isReloading)
                    return;
                isReloading = true;
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const tab = tabs[0];
                    if (tab?.id && tab.url?.includes('youtube.com')) {
                        reloadButton.classList.add('loading');
                        if (labelReload)
                            labelReload.textContent = chrome.i18n.getMessage('reloadingButton');
                        sendMessageToTab(tab.id, { type: 'RELOAD_BLUR' }, (delivered) => {
                            if (!delivered) {
                                isReloading = false;
                                reloadButton.classList.remove('loading');
                                if (labelReload)
                                    labelReload.textContent = chrome.i18n.getMessage('reloadButton');
                                return;
                            }
                            // リロード完了後、クラスを削除して元の状態に戻す
                            setTimeout(() => {
                                isReloading = false;
                                reloadButton.classList.remove('loading');
                                if (labelReload)
                                    labelReload.textContent = chrome.i18n.getMessage('reloadButton');
                            }, 500);
                        });
                    }
                    else {
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
