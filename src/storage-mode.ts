const STORAGE_KEY = 'playerBackgroundMode';
const STORAGE_TIMESTAMP_KEY = 'playerBackgroundModeTimestamp';

/**
 * Re-read both storage areas and converge them to the same mode+timestamp winner.
 * Called after load resolves so we never persist stale values captured before a concurrent save.
 */
function reconcileStorageCopies() {
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
      const syncTimestamp = syncResult[STORAGE_TIMESTAMP_KEY] || 0;
      const localTimestamp = localResult[STORAGE_TIMESTAMP_KEY] || 0;

      if (syncMode === undefined && localMode === undefined) {
        return;
      }

      const isSyncWinner =
        syncMode !== undefined &&
        (localMode === undefined || syncTimestamp >= localTimestamp);
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
    });
  });
}

/**
 * Save mode to storage with fallback from sync to local
 * @param {string} mode - 'blur' or 'solid'
 * @returns {Promise<boolean>} - true if saved to sync, false if saved to local
 */
function saveModeToStorage(mode: BackgroundMode) {
  const timestamp = Date.now();
  const data = { [STORAGE_KEY]: mode, [STORAGE_TIMESTAMP_KEY]: timestamp };

  // Always update local storage to ensure a reliable fallback is available
  chrome.storage.local.set(data);

  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(data, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) {
          console.warn('Sync storage failed:', lastError);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      console.warn('Sync storage failed:', error);
      resolve(false);
    }
  });
}

/**
 * Load mode from storage with fallback and latest value determination
 * @returns {Promise<string>} - 'blur' or 'solid'
 */
function loadModeFromStorage(): Promise<BackgroundMode> {
  return new Promise<BackgroundMode>((resolve) => {
    try {
      chrome.storage.sync.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (syncResult) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          syncResult = {};
        }
        chrome.storage.local.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (localResult) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            localResult = {};
          }

          const syncMode = syncResult[STORAGE_KEY] as BackgroundMode | undefined;
          const localMode = localResult[STORAGE_KEY] as BackgroundMode | undefined;
          const syncTimestamp = (syncResult[STORAGE_TIMESTAMP_KEY] || 0) as number;
          const localTimestamp = (localResult[STORAGE_TIMESTAMP_KEY] || 0) as number;

          if (syncMode !== undefined && localMode !== undefined) {
            if (syncTimestamp >= localTimestamp) {
              resolve(syncMode);
            } else {
              resolve(localMode);
            }
            queueMicrotask(() => {
              reconcileStorageCopies();
            });
          } else if (syncMode !== undefined) {
            resolve(syncMode);
            queueMicrotask(() => {
              reconcileStorageCopies();
            });
          } else if (localMode !== undefined) {
            resolve(localMode);
            queueMicrotask(() => {
              reconcileStorageCopies();
            });
          } else {
            resolve('blur');
          }
        });
      });
    } catch (error) {
      console.error('Failed to load mode from storage:', error);
      resolve('blur');
    }
  });
}

const storageModeApi = {
  STORAGE_KEY,
  STORAGE_TIMESTAMP_KEY,
  saveModeToStorage,
  loadModeFromStorage,
  reconcileStorageCopies
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = storageModeApi;
}
// content.js はグローバル参照のため、テスト（Node）でも globalThis に載せる
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, storageModeApi);
}
