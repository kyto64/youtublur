"use strict";
const STORAGE_KEY = 'playerBackgroundMode';
const STORAGE_TIMESTAMP_KEY = 'playerBackgroundModeTimestamp';
const STORAGE_BLUR_KEY = 'playerBlurStrengthPx';
const STORAGE_BLUR_TIMESTAMP_KEY = 'playerBlurStrengthTimestamp';
const MIN_BLUR_STRENGTH_PX = 8;
const MAX_BLUR_STRENGTH_PX = 72;
const BLUR_STRENGTH_STEP_PX = 4;
/** Default blur radius (px); aligned with previous fixed canvas blur. */
const DEFAULT_BLUR_STRENGTH_PX = 40;
const ALL_RECONCILE_KEYS = [
    STORAGE_KEY,
    STORAGE_TIMESTAMP_KEY,
    STORAGE_BLUR_KEY,
    STORAGE_BLUR_TIMESTAMP_KEY
];
function snapBlurStrengthPx(n) {
    const stepped = MIN_BLUR_STRENGTH_PX + Math.round((n - MIN_BLUR_STRENGTH_PX) / BLUR_STRENGTH_STEP_PX) * BLUR_STRENGTH_STEP_PX;
    return Math.min(MAX_BLUR_STRENGTH_PX, Math.max(MIN_BLUR_STRENGTH_PX, stepped));
}
function clampBlurStrengthPx(raw) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return DEFAULT_BLUR_STRENGTH_PX;
    return snapBlurStrengthPx(n);
}
/**
 * Re-read both storage areas and converge mode and blur strength to timestamp winners.
 * Called after load resolves so we never persist stale values captured before a concurrent save.
 */
function reconcileStorageCopies() {
    chrome.storage.sync.get([...ALL_RECONCILE_KEYS], (syncResult) => {
        if (chrome.runtime && chrome.runtime.lastError) {
            syncResult = {};
        }
        chrome.storage.local.get([...ALL_RECONCILE_KEYS], (localResult) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                localResult = {};
            }
            reconcileModePair(syncResult, localResult);
            reconcileBlurPair(syncResult, localResult);
        });
    });
}
function reconcileModePair(syncResult, localResult) {
    const syncMode = syncResult[STORAGE_KEY];
    const localMode = localResult[STORAGE_KEY];
    const syncTimestamp = (syncResult[STORAGE_TIMESTAMP_KEY] || 0);
    const localTimestamp = (localResult[STORAGE_TIMESTAMP_KEY] || 0);
    if (syncMode === undefined && localMode === undefined) {
        return;
    }
    const isSyncWinner = syncMode !== undefined && (localMode === undefined || syncTimestamp >= localTimestamp);
    const canonMode = isSyncWinner ? syncMode : localMode;
    const canonTs = isSyncWinner ? syncTimestamp : localTimestamp;
    const data = { [STORAGE_KEY]: canonMode, [STORAGE_TIMESTAMP_KEY]: canonTs };
    const needsLocalFix = localMode !== canonMode || localTimestamp !== canonTs;
    const needsSyncFix = syncMode !== canonMode || syncTimestamp !== canonTs;
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
function reconcileBlurPair(syncResult, localResult) {
    const syncBlur = syncResult[STORAGE_BLUR_KEY];
    const localBlur = localResult[STORAGE_BLUR_KEY];
    const syncTimestamp = (syncResult[STORAGE_BLUR_TIMESTAMP_KEY] || 0);
    const localTimestamp = (localResult[STORAGE_BLUR_TIMESTAMP_KEY] || 0);
    if (syncBlur === undefined && localBlur === undefined) {
        return;
    }
    const isSyncWinner = syncBlur !== undefined && (localBlur === undefined || syncTimestamp >= localTimestamp);
    const rawWinner = isSyncWinner ? syncBlur : localBlur;
    const canonBlur = clampBlurStrengthPx(rawWinner);
    const canonTs = isSyncWinner ? syncTimestamp : localTimestamp;
    const data = { [STORAGE_BLUR_KEY]: canonBlur, [STORAGE_BLUR_TIMESTAMP_KEY]: canonTs };
    const needsLocalFix = localBlur !== canonBlur || localTimestamp !== canonTs;
    const needsSyncFix = syncBlur !== canonBlur || syncTimestamp !== canonTs;
    if (!needsLocalFix && !needsSyncFix) {
        return;
    }
    if (needsLocalFix) {
        chrome.storage.local.set(data, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to converge local blur storage:', chrome.runtime.lastError);
            }
        });
    }
    if (needsSyncFix) {
        chrome.storage.sync.set(data, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to converge sync blur storage:', chrome.runtime.lastError);
            }
        });
    }
}
/**
 * Save mode to storage with fallback from sync to local
 * @param {string} mode - 'blur' or 'solid'
 * @returns {Promise<boolean>} - true if saved to sync, false if saved to local
 */
function saveModeToStorage(mode) {
    const timestamp = Date.now();
    const data = { [STORAGE_KEY]: mode, [STORAGE_TIMESTAMP_KEY]: timestamp };
    // Persist local *after* sync completes so concurrent load/reconcile never reads
    // stale local while sync already holds the newer value (would resurrect old mode).
    return new Promise((resolve) => {
        const finalize = (syncSuccess) => {
            try {
                chrome.storage.local.set(data, () => {
                    const localError = chrome.runtime && chrome.runtime.lastError;
                    if (localError) {
                        console.warn('Local storage failed:', localError);
                    }
                    resolve(syncSuccess);
                });
            }
            catch (err) {
                // sync は成功していても local.set が同期的に失敗し得る。戻り値は「sync が書けたか」の契約のため syncSuccess を維持する。
                console.warn('Local storage failed:', err);
                resolve(syncSuccess);
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
    });
}
/**
 * Save blur strength (px) to sync/local with the same ordering guarantees as mode.
 * @returns {Promise<boolean>} true if sync write succeeded
 */
function saveBlurStrengthToStorage(px) {
    const strength = clampBlurStrengthPx(px);
    const timestamp = Date.now();
    const data = { [STORAGE_BLUR_KEY]: strength, [STORAGE_BLUR_TIMESTAMP_KEY]: timestamp };
    return new Promise((resolve) => {
        const finalize = (syncSuccess) => {
            try {
                chrome.storage.local.set(data, () => {
                    const localError = chrome.runtime && chrome.runtime.lastError;
                    if (localError) {
                        console.warn('Local blur storage failed:', localError);
                    }
                    resolve(syncSuccess);
                });
            }
            catch (err) {
                console.warn('Local blur storage failed:', err);
                resolve(syncSuccess);
            }
        };
        try {
            chrome.storage.sync.set(data, () => {
                const syncError = chrome.runtime && chrome.runtime.lastError;
                if (syncError) {
                    console.warn('Sync blur storage failed:', syncError);
                }
                finalize(!syncError);
            });
        }
        catch (error) {
            console.warn('Sync blur storage failed:', error);
            finalize(false);
        }
    });
}
/**
 * Load mode from storage with fallback and latest value determination
 * @returns {Promise<string>} - 'blur' or 'solid'
 */
function loadModeFromStorage() {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (syncResult) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    syncResult = {};
                }
                chrome.storage.local.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (localResult) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        localResult = {};
                    }
                    const syncMode = syncResult[STORAGE_KEY];
                    const localMode = localResult[STORAGE_KEY];
                    const syncTimestamp = (syncResult[STORAGE_TIMESTAMP_KEY] || 0);
                    const localTimestamp = (localResult[STORAGE_TIMESTAMP_KEY] || 0);
                    if (syncMode !== undefined && localMode !== undefined) {
                        if (syncTimestamp >= localTimestamp) {
                            resolve(syncMode);
                        }
                        else {
                            resolve(localMode);
                        }
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else if (syncMode !== undefined) {
                        resolve(syncMode);
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else if (localMode !== undefined) {
                        resolve(localMode);
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else {
                        resolve('blur');
                    }
                });
            });
        }
        catch (error) {
            console.error('Failed to load mode from storage:', error);
            resolve('blur');
        }
    });
}
/**
 * Load blur strength (px) from storage; returns clamped default when unset.
 */
function loadBlurStrengthFromStorage() {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get([STORAGE_BLUR_KEY, STORAGE_BLUR_TIMESTAMP_KEY], (syncResult) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    syncResult = {};
                }
                chrome.storage.local.get([STORAGE_BLUR_KEY, STORAGE_BLUR_TIMESTAMP_KEY], (localResult) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        localResult = {};
                    }
                    const syncBlur = syncResult[STORAGE_BLUR_KEY];
                    const localBlur = localResult[STORAGE_BLUR_KEY];
                    const syncTimestamp = (syncResult[STORAGE_BLUR_TIMESTAMP_KEY] || 0);
                    const localTimestamp = (localResult[STORAGE_BLUR_TIMESTAMP_KEY] || 0);
                    if (syncBlur !== undefined && localBlur !== undefined) {
                        if (syncTimestamp >= localTimestamp) {
                            resolve(clampBlurStrengthPx(syncBlur));
                        }
                        else {
                            resolve(clampBlurStrengthPx(localBlur));
                        }
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else if (syncBlur !== undefined) {
                        resolve(clampBlurStrengthPx(syncBlur));
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else if (localBlur !== undefined) {
                        resolve(clampBlurStrengthPx(localBlur));
                        queueMicrotask(() => {
                            reconcileStorageCopies();
                        });
                    }
                    else {
                        resolve(DEFAULT_BLUR_STRENGTH_PX);
                    }
                });
            });
        }
        catch (error) {
            console.error('Failed to load blur strength from storage:', error);
            resolve(DEFAULT_BLUR_STRENGTH_PX);
        }
    });
}
const BLUR_STRENGTH_UI_RANGE = Object.freeze({
    min: MIN_BLUR_STRENGTH_PX,
    max: MAX_BLUR_STRENGTH_PX,
    defaultValue: DEFAULT_BLUR_STRENGTH_PX,
    step: BLUR_STRENGTH_STEP_PX
});
const storageModeApi = {
    STORAGE_KEY,
    STORAGE_TIMESTAMP_KEY,
    STORAGE_BLUR_KEY,
    STORAGE_BLUR_TIMESTAMP_KEY,
    YOUTUBLUR_BLUR_RANGE: BLUR_STRENGTH_UI_RANGE,
    saveModeToStorage,
    loadModeFromStorage,
    saveBlurStrengthToStorage,
    loadBlurStrengthFromStorage,
    reconcileStorageCopies
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = storageModeApi;
}
// content.js はグローバル参照のため、テスト（Node）でも globalThis に載せる
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, storageModeApi);
}
