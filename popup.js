const STORAGE_KEY = 'playerBackgroundMode';
const STORAGE_TIMESTAMP_KEY = 'playerBackgroundModeTimestamp';

/**
 * Save mode to storage with fallback from sync to local
 * @param {string} mode - 'blur' or 'solid'
 * @returns {Promise<boolean>} - true if saved to sync, false if saved to local
 */
function saveModeToStorage(mode) {
  const timestamp = Date.now();
  const data = { [STORAGE_KEY]: mode, [STORAGE_TIMESTAMP_KEY]: timestamp };

  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(data, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) {
          console.warn('Sync storage failed, falling back to local storage:', lastError);
          chrome.storage.local.set(data, () => resolve(false));
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      console.warn('Sync storage failed, falling back to local storage:', error);
      chrome.storage.local.set(data, () => resolve(false));
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
        const lastError1 = chrome.runtime && chrome.runtime.lastError;
        if (lastError1) {
          syncResult = {};
        }
        chrome.storage.local.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (localResult) => {
          const lastError2 = chrome.runtime && chrome.runtime.lastError;
          if (lastError2) {
            localResult = {};
          }

          const syncMode = syncResult[STORAGE_KEY];
          const localMode = localResult[STORAGE_KEY];
          const syncTimestamp = syncResult[STORAGE_TIMESTAMP_KEY] || 0;
          const localTimestamp = localResult[STORAGE_TIMESTAMP_KEY] || 0;

          if (syncMode !== undefined && localMode !== undefined) {
            if (syncTimestamp >= localTimestamp) {
              resolve(syncMode);
            } else {
              // Local is newer, sync it back to sync storage
              chrome.storage.sync.set({
                [STORAGE_KEY]: localMode,
                [STORAGE_TIMESTAMP_KEY]: localTimestamp
              }, () => {
                const lastError3 = chrome.runtime && chrome.runtime.lastError;
                if (lastError3) {
                  console.warn('Failed to sync local value back to sync storage:', lastError3);
                }
                resolve(localMode);
              });
            }
          } else if (syncMode !== undefined) {
            resolve(syncMode);
          } else if (localMode !== undefined) {
            resolve(localMode);
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
}

function initPopup() {
  document.addEventListener('DOMContentLoaded', () => {
    applyLocalizedStrings();

    loadModeFromStorage().then((mode) => {
      const radio = document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid');
      if (radio) radio.checked = true;
    });

    document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const mode = e.target.value;
        saveModeToStorage(mode).then(() => {
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
  module.exports = { initPopup, STORAGE_KEY, saveModeToStorage, loadModeFromStorage };
}
