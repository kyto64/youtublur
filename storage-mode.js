"use strict";
const STORAGE_KEY = 'playerBackgroundMode';
const STORAGE_TIMESTAMP_KEY = 'playerBackgroundModeTimestamp';
const STORAGE_BLUR_KEY = 'playerBlurStrengthPx';
const STORAGE_BLUR_TIMESTAMP_KEY = 'playerBlurStrengthPxTimestamp';
const STORAGE_SOLID_COLOR_KEY = 'playerSolidColor';
const STORAGE_SOLID_COLOR_TIMESTAMP_KEY = 'playerSolidColorTimestamp';
/**
 * Historical light-gray fill. A missing key is not stored as this color: the
 * content script keeps the theme-based fill so existing users see no change.
 * Values that are not hex become this color before they are saved or painted.
 */
const DEFAULT_SOLID_COLOR = '#f1f1f1';
const SOLID_COLOR_PRESETS = Object.freeze([
    Object.freeze({ id: 'light', value: '#f1f1f1' }),
    Object.freeze({ id: 'gray', value: '#272727' }),
    Object.freeze({ id: 'black', value: '#000000' }),
    Object.freeze({ id: 'youtubeDark', value: '#0f0f0f' })
]);
/**
 * Slider bounds. Default matches the historical fixed radius so existing users see no change.
 * Step 4 keeps 40 on the grid. The ceiling stays at 72 because a video-sized canvas blur
 * gets expensive quickly; the floor stays at 8 so the effect is still visible.
 */
const MIN_BLUR_STRENGTH_PX = 8;
const MAX_BLUR_STRENGTH_PX = 72;
const DEFAULT_BLUR_STRENGTH_PX = 40;
const BLUR_STRENGTH_STEP_PX = 4;
const YOUTUBLUR_BLUR_RANGE = Object.freeze({
    min: MIN_BLUR_STRENGTH_PX,
    max: MAX_BLUR_STRENGTH_PX,
    defaultValue: DEFAULT_BLUR_STRENGTH_PX,
    step: BLUR_STRENGTH_STEP_PX
});
const ALL_RECONCILE_KEYS = [
    STORAGE_KEY,
    STORAGE_TIMESTAMP_KEY,
    STORAGE_BLUR_KEY,
    STORAGE_BLUR_TIMESTAMP_KEY,
    STORAGE_SOLID_COLOR_KEY,
    STORAGE_SOLID_COLOR_TIMESTAMP_KEY
];
/** Serializes saves so an older sync.set callback cannot finalize after a newer save and overwrite local/sync with stale data. */
let storageSaveChain = Promise.resolve();
function snapBlurStrengthPx(n) {
    const stepped = MIN_BLUR_STRENGTH_PX +
        Math.round((n - MIN_BLUR_STRENGTH_PX) / BLUR_STRENGTH_STEP_PX) * BLUR_STRENGTH_STEP_PX;
    return Math.min(MAX_BLUR_STRENGTH_PX, Math.max(MIN_BLUR_STRENGTH_PX, stepped));
}
function clampBlurStrengthPx(raw) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return DEFAULT_BLUR_STRENGTH_PX;
    return snapBlurStrengthPx(n);
}
/** `#rgb` / `#rrggbb` only. Anything else is unset, never a CSS fragment. */
function normalizeSolidColor(raw) {
    if (typeof raw !== 'string')
        return null;
    const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw.trim());
    if (!match)
        return null;
    let hex = match[1].toLowerCase();
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return `#${hex}`;
}
function sanitizeSolidColorForCss(raw) {
    return normalizeSolidColor(raw) ?? DEFAULT_SOLID_COLOR;
}
/** Stored strings that are not hex become unset so a bad value cannot override the theme fill. */
function canonSolidColor(raw) {
    if (raw === undefined || raw === null || raw === '')
        return null;
    return normalizeSolidColor(raw);
}
function readStorage(area, keys, done) {
    chrome.storage[area].get(keys, (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
            done({});
            return;
        }
        done((result || {}));
    });
}
/**
 * Re-read both storage areas and converge mode and blur strength to the timestamp winners.
 * Called after load resolves so we never persist stale values captured before a concurrent save.
 */
function reconcileStorageCopies() {
    readStorage('sync', ALL_RECONCILE_KEYS, (syncResult) => {
        readStorage('local', ALL_RECONCILE_KEYS, (localResult) => {
            reconcilePair(syncResult, localResult, STORAGE_KEY, STORAGE_TIMESTAMP_KEY, null);
            reconcilePair(syncResult, localResult, STORAGE_BLUR_KEY, STORAGE_BLUR_TIMESTAMP_KEY, clampBlurStrengthPx);
            reconcilePair(syncResult, localResult, STORAGE_SOLID_COLOR_KEY, STORAGE_SOLID_COLOR_TIMESTAMP_KEY, canonSolidColor);
        });
    });
}
function reconcilePair(syncResult, localResult, valueKey, timestampKey, normalize) {
    const syncValue = syncResult[valueKey];
    const localValue = localResult[valueKey];
    const syncTimestamp = (syncResult[timestampKey] || 0);
    const localTimestamp = (localResult[timestampKey] || 0);
    if (syncValue === undefined && localValue === undefined) {
        return;
    }
    const isSyncWinner = syncValue !== undefined && (localValue === undefined || syncTimestamp >= localTimestamp);
    const rawWinner = isSyncWinner ? syncValue : localValue;
    const canonValue = normalize ? normalize(rawWinner) : rawWinner;
    const canonTs = isSyncWinner ? syncTimestamp : localTimestamp;
    const data = { [valueKey]: canonValue, [timestampKey]: canonTs };
    const needsLocalFix = localValue !== canonValue || localTimestamp !== canonTs;
    const needsSyncFix = syncValue !== canonValue || syncTimestamp !== canonTs;
    if (!needsLocalFix && !needsSyncFix) {
        return;
    }
    if (needsLocalFix) {
        chrome.storage.local.set(data, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to converge local storage:', chrome.runtime.lastError);
            }
        });
    }
    if (needsSyncFix) {
        chrome.storage.sync.set(data, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to converge sync storage:', chrome.runtime.lastError);
            }
        });
    }
}
/**
 * Persist a value plus timestamp. Local is written only after sync finishes so a
 * concurrent load cannot observe a new local value beside a stale sync value.
 */
function saveTimestampedRecord(data) {
    let resolveSave;
    const result = new Promise((resolve) => {
        resolveSave = resolve;
    });
    storageSaveChain = storageSaveChain.then(() => new Promise((releaseNext) => {
        const finalize = (syncSuccess) => {
            try {
                chrome.storage.local.set(data, () => {
                    const localError = chrome.runtime && chrome.runtime.lastError;
                    if (localError) {
                        console.warn('Local storage failed:', localError);
                    }
                    resolveSave(syncSuccess);
                    releaseNext();
                });
            }
            catch (err) {
                // sync は成功していても local.set が同期的に失敗し得る。戻り値は「sync が書けたか」の契約のため syncSuccess を維持する。
                console.warn('Local storage failed:', err);
                resolveSave(syncSuccess);
                releaseNext();
            }
        };
        try {
            chrome.storage.sync.set(data, () => {
                const syncError = chrome.runtime && chrome.runtime.lastError;
                if (syncError) {
                    console.warn('Sync storage failed:', syncError);
                }
                finalize(!syncError);
            });
        }
        catch (error) {
            console.warn('Sync storage failed:', error);
            finalize(false);
        }
    }));
    return result;
}
/**
 * Save mode to storage with fallback from sync to local
 * @param {string} mode - 'blur' or 'solid'
 * @returns {Promise<boolean>} - true if saved to sync, false if saved to local
 */
function saveModeToStorage(mode) {
    const timestamp = Date.now();
    const data = { [STORAGE_KEY]: mode, [STORAGE_TIMESTAMP_KEY]: timestamp };
    return saveTimestampedRecord(data);
}
/**
 * Save blur strength (px). Out-of-range values are snapped onto the slider grid.
 * @returns {Promise<boolean>} true if the sync write succeeded
 */
function saveBlurStrengthToStorage(px) {
    const timestamp = Date.now();
    const data = {
        [STORAGE_BLUR_KEY]: clampBlurStrengthPx(px),
        [STORAGE_BLUR_TIMESTAMP_KEY]: timestamp
    };
    return saveTimestampedRecord(data);
}
/**
 * Save a solid-mode color. Only a sanitized `#rrggbb` is written.
 * @returns {Promise<boolean>} true if the sync write succeeded
 */
function saveSolidColorToStorage(color) {
    const timestamp = Date.now();
    const data = {
        [STORAGE_SOLID_COLOR_KEY]: sanitizeSolidColorForCss(color),
        [STORAGE_SOLID_COLOR_TIMESTAMP_KEY]: timestamp
    };
    return saveTimestampedRecord(data);
}
function loadTimestampedRecord(valueKey, timestampKey, fallback, normalize, errorLabel) {
    return new Promise((resolve) => {
        try {
            readStorage('sync', [valueKey, timestampKey], (syncResult) => {
                readStorage('local', [valueKey, timestampKey], (localResult) => {
                    const syncValue = syncResult[valueKey];
                    const localValue = localResult[valueKey];
                    const syncTimestamp = (syncResult[timestampKey] || 0);
                    const localTimestamp = (localResult[timestampKey] || 0);
                    let chosen;
                    let timestamp = 0;
                    if (syncValue !== undefined && localValue !== undefined) {
                        if (syncTimestamp >= localTimestamp) {
                            chosen = syncValue;
                            timestamp = syncTimestamp;
                        }
                        else {
                            chosen = localValue;
                            timestamp = localTimestamp;
                        }
                    }
                    else if (syncValue !== undefined) {
                        chosen = syncValue;
                        timestamp = syncTimestamp;
                    }
                    else if (localValue !== undefined) {
                        chosen = localValue;
                        timestamp = localTimestamp;
                    }
                    else {
                        resolve({ value: fallback, timestamp: 0 });
                        return;
                    }
                    resolve({ value: normalize(chosen), timestamp });
                    queueMicrotask(() => {
                        reconcileStorageCopies();
                    });
                });
            });
        }
        catch (error) {
            console.error(errorLabel, error);
            resolve({ value: fallback, timestamp: 0 });
        }
    });
}
function loadTimestamped(valueKey, timestampKey, fallback, normalize, errorLabel) {
    return loadTimestampedRecord(valueKey, timestampKey, fallback, normalize, errorLabel).then((record) => record.value);
}
/**
 * Load mode from storage with fallback and latest value determination
 * @returns {Promise<string>} - 'blur' or 'solid'
 */
function loadModeFromStorage() {
    return loadTimestamped(STORAGE_KEY, STORAGE_TIMESTAMP_KEY, 'blur', (raw) => raw, 'Failed to load mode from storage:');
}
/** Load blur strength (px). Missing or non-numeric values become the 40px default. */
function loadBlurStrengthFromStorage() {
    return loadBlurStrengthRecordFromStorage().then((record) => record.px);
}
/**
 * Load blur strength plus the winning sync/local timestamp.
 * Timestamp 0 means nothing was stored. Content scripts use it to ignore
 * echoes of writes that started before the latest local slider command.
 */
function loadBlurStrengthRecordFromStorage() {
    return loadTimestampedRecord(STORAGE_BLUR_KEY, STORAGE_BLUR_TIMESTAMP_KEY, DEFAULT_BLUR_STRENGTH_PX, clampBlurStrengthPx, 'Failed to load blur strength from storage:').then((record) => ({ px: record.value, timestamp: record.timestamp }));
}
/** Load the explicit solid color. null means the key is missing or not hex (theme fill stays). */
function loadSolidColorFromStorage() {
    return loadSolidColorRecordFromStorage().then((record) => record.color);
}
function loadSolidColorRecordFromStorage() {
    return loadTimestampedRecord(STORAGE_SOLID_COLOR_KEY, STORAGE_SOLID_COLOR_TIMESTAMP_KEY, null, canonSolidColor, 'Failed to load solid color from storage:').then((record) => ({ color: record.value, timestamp: record.timestamp }));
}
const storageModeApi = {
    STORAGE_KEY,
    STORAGE_TIMESTAMP_KEY,
    STORAGE_BLUR_KEY,
    STORAGE_BLUR_TIMESTAMP_KEY,
    STORAGE_SOLID_COLOR_KEY,
    STORAGE_SOLID_COLOR_TIMESTAMP_KEY,
    DEFAULT_SOLID_COLOR,
    SOLID_COLOR_PRESETS,
    YOUTUBLUR_BLUR_RANGE,
    saveModeToStorage,
    loadModeFromStorage,
    saveBlurStrengthToStorage,
    loadBlurStrengthFromStorage,
    loadBlurStrengthRecordFromStorage,
    clampBlurStrengthPx,
    normalizeSolidColor,
    sanitizeSolidColorForCss,
    saveSolidColorToStorage,
    loadSolidColorFromStorage,
    loadSolidColorRecordFromStorage,
    reconcileStorageCopies
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageModeApi;
}
// content.js はグローバル参照のため、テスト（Node）でも globalThis に載せる
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, storageModeApi);
}
