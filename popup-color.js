"use strict";
// Solid-mode color controls. Loaded after storage-mode.js and before popup.js.
const SOLID_SAVE_DEBOUNCE_MS = 200;
const SOLID_PRESET_INPUT_IDS = {
    light: 'solidPresetLight',
    gray: 'solidPresetGray',
    black: 'solidPresetBlack',
    youtubeDark: 'solidPresetYtDark'
};
const SOLID_PRESET_LABEL_KEYS = {
    light: 'solidColorPresetLight',
    gray: 'solidColorPresetGray',
    black: 'solidColorPresetBlack',
    youtubeDark: 'solidColorPresetYtDark'
};
let solidSaveTimer = null;
let pendingSolidColor = null;
let lastPersistedSolidColor = null;
let lastNotifiedSolidColor = null;
let solidColorTouched = false;
let solidPagehideWired = false;
let solidUiGeneration = 0;
function solidPresetInputs() {
    return Array.from(document.querySelectorAll('#solidColorPresets input[type="radio"]'));
}
function solidPreviewTone(hex) {
    const n = Number.parseInt(hex.slice(1), 16);
    if (!Number.isFinite(n))
        return 'light';
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return y > 0.62 ? 'light' : 'dark';
}
function applySolidColorStrings() {
    if (typeof chrome === 'undefined' || !chrome.i18n)
        return;
    const label = document.getElementById('labelSolidColor');
    const custom = document.getElementById('labelSolidColorCustom');
    if (label)
        label.textContent = chrome.i18n.getMessage('solidColorLabel');
    if (custom)
        custom.textContent = chrome.i18n.getMessage('solidColorCustomLabel');
    const picker = document.getElementById('solidColor');
    if (picker)
        picker.setAttribute('aria-label', chrome.i18n.getMessage('solidColorCustomLabel'));
    for (const preset of SOLID_COLOR_PRESETS) {
        const id = SOLID_PRESET_INPUT_IDS[preset.id];
        const text = chrome.i18n.getMessage(SOLID_PRESET_LABEL_KEYS[preset.id]);
        const name = document.getElementById(id + 'Name');
        if (name)
            name.textContent = text;
        const input = document.getElementById(id);
        if (input && text)
            input.setAttribute('aria-label', text);
    }
}
function updateSolidColorUi(color, selectPreset = true) {
    const picker = document.getElementById('solidColor');
    const swatch = document.querySelector('.preview-swatch');
    if (picker && picker.value.toLowerCase() !== color)
        picker.value = color;
    for (const input of solidPresetInputs()) {
        input.checked = selectPreset && input.value.toLowerCase() === color;
    }
    if (swatch) {
        swatch.style.setProperty('--solid-preview', color);
        swatch.dataset.solidTone = solidPreviewTone(color);
    }
}
function flushSolidColorSave() {
    if (solidSaveTimer !== null) {
        clearTimeout(solidSaveTimer);
        solidSaveTimer = null;
    }
    if (pendingSolidColor === null || pendingSolidColor === lastPersistedSolidColor) {
        pendingSolidColor = null;
        return;
    }
    const color = pendingSolidColor;
    pendingSolidColor = null;
    lastPersistedSolidColor = color;
    saveSolidColorToStorage(color);
}
function scheduleSolidColorSave(color) {
    pendingSolidColor = color;
    if (solidSaveTimer !== null)
        clearTimeout(solidSaveTimer);
    solidSaveTimer = setTimeout(flushSolidColorSave, SOLID_SAVE_DEBOUNCE_MS);
}
function notifySolidColorToActiveTab(color) {
    if (typeof chrome === 'undefined' || !chrome.tabs)
        return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url?.includes('youtube.com')) {
            sendMessageToTab(tab.id, { type: 'SOLID_COLOR_CHANGED', color });
        }
    });
}
function publishSolidColor(raw, save) {
    solidColorTouched = true;
    const color = sanitizeSolidColorForCss(raw);
    updateSolidColorUi(color);
    if (color !== lastNotifiedSolidColor) {
        lastNotifiedSolidColor = color;
        notifySolidColorToActiveTab(color);
    }
    if (save === 'now') {
        pendingSolidColor = color;
        flushSolidColorSave();
    }
    else {
        scheduleSolidColorSave(color);
    }
}
function wireSolidColorControl() {
    applySolidColorStrings();
    const picker = document.getElementById('solidColor');
    if (!picker || picker.dataset.wired === '1')
        return;
    picker.dataset.wired = '1';
    if (solidSaveTimer !== null) {
        clearTimeout(solidSaveTimer);
        solidSaveTimer = null;
    }
    pendingSolidColor = null;
    lastPersistedSolidColor = null;
    lastNotifiedSolidColor = null;
    solidColorTouched = false;
    for (const input of solidPresetInputs()) {
        input.addEventListener('change', () => {
            if (!input.checked)
                return;
            publishSolidColor(input.value, 'now');
        });
    }
    picker.addEventListener('input', () => publishSolidColor(picker.value, 'debounce'));
    picker.addEventListener('change', () => publishSolidColor(picker.value, 'now'));
    if (!solidPagehideWired) {
        solidPagehideWired = true;
        window.addEventListener('pagehide', () => flushSolidColorSave());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden')
                flushSolidColorSave();
        });
    }
    const generation = ++solidUiGeneration;
    loadSolidColorFromStorage().then((color) => {
        if (generation !== solidUiGeneration || solidColorTouched)
            return;
        lastPersistedSolidColor = color;
        lastNotifiedSolidColor = color;
        // Unset storage is not an explicit choice. Leave the presets clear so choosing
        // the historical gray still saves and overrides the theme fill.
        updateSolidColorUi(color ?? DEFAULT_SOLID_COLOR, color !== null);
    });
}
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, { wireSolidColorControl });
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { wireSolidColorControl };
}
