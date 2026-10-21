// Chrome loads this file as the MV3 service worker and importScripts the helpers.
// Firefox loads storage-mode.js and shortcut-actions.js first via background.scripts
// (an event page). Listeners are registered synchronously so the worker can wake on a command.

function loadShortcutWorkerScripts() {
  if (
    typeof applyShortcutCommand === 'function' &&
    typeof saveModeToStorage === 'function' &&
    typeof handleExtensionInstalled === 'function'
  ) {
    return;
  }
  // Call as a method. A detached importScripts loses its worker `this` and throws.
  const scope = globalThis as typeof globalThis & {
    importScripts?: (...paths: string[]) => void;
  };
  if (typeof scope.importScripts !== 'function') return;
  try {
    scope.importScripts('storage-mode.js', 'shortcut-actions.js', 'review-nudge.js', 'onboarding.js');
  } catch (error) {
    console.warn('[youtublur] failed to load shortcut scripts:', error);
  }
}

loadShortcutWorkerScripts();

function broadcastToYouTubeTabs(message: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      // Do not filter on tab.url. Reading URLs needs the tabs permission or host_permissions,
      // and this extension keeps permissions at storage + activeTab. Content scripts only run on
      // YouTube, so other tabs ignore the message (lastError is cleared below).
      chrome.tabs.query({}, (tabs) => {
        const queryError = chrome.runtime && chrome.runtime.lastError;
        if (queryError) {
          console.warn('[youtublur] shortcut tab query failed:', queryError);
          finish();
          return;
        }

        const targets = Array.isArray(tabs) ? tabs : [];
        for (const tab of targets) {
          if (typeof tab.id !== 'number') continue;
          try {
            const maybe = chrome.tabs.sendMessage(tab.id, message, () => {
              // Tabs without a content script set lastError. Reading it clears the warning.
              void (chrome.runtime && chrome.runtime.lastError);
            }) as unknown;
            if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
              (maybe as Promise<unknown>).catch(() => undefined);
            }
          } catch (error) {
            console.warn('[youtublur] shortcut message failed:', error);
          }
        }
        finish();
      });
    } catch (error) {
      console.warn('[youtublur] shortcut tab query failed:', error);
      finish();
    }
  });
}

async function performShortcutCommand(command: string): Promise<void> {
  // The browser opens the popup for this reserved command. It is not a storage change.
  if (command === '_execute_action') return;
  // Same action as the popup Reload button. No suggested key; see the manifest comment in docs.
  if (command === 'reload-effect') {
    await broadcastToYouTubeTabs({ type: 'RELOAD_BLUR' });
    return;
  }

  const mode = await loadModeFromStorage();
  const blurPx = await loadBlurStrengthFromStorage();
  const effect = applyShortcutCommand(command, { mode, blurPx });
  if (effect.kind === 'none') return;

  if (effect.kind === 'mode') {
    await saveModeToStorage(effect.mode);
    await broadcastToYouTubeTabs({ type: 'BG_MODE_CHANGED', mode: effect.mode });
    return;
  }

  await saveBlurStrengthToStorage(effect.blurPx);
  await broadcastToYouTubeTabs({ type: 'BLUR_STRENGTH_CHANGED', strength: effect.blurPx });
}

// Overlapping onCommand events must not read the same stored value. The queue covers
// read, decide, and save. A failure does not stall later commands.
let shortcutQueue: Promise<void> = Promise.resolve();

function runShortcutCommand(command: string): Promise<void> {
  const task = shortcutQueue.then(() => performShortcutCommand(command));
  shortcutQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function registerShortcutCommands() {
  const onCommand = typeof chrome !== 'undefined' ? chrome.commands?.onCommand : undefined;
  if (!onCommand || typeof onCommand.addListener !== 'function') return;
  onCommand.addListener((command) => {
    // Return the promise so the service worker stays alive until the save finishes.
    return runShortcutCommand(command).catch((error) => {
      console.warn('[youtublur] shortcut failed:', error);
    });
  });
}

registerShortcutCommands();

function registerOnboarding() {
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  if (!runtime) return;
  const refreshBadge = () => {
    if (typeof refreshReviewBadge !== 'function') return Promise.resolve();
    return refreshReviewBadge().then(
      () => undefined,
      (error) => console.warn('[youtublur] review badge check failed:', error)
    );
  };
  // Only reason === 'install' opens the welcome page. Updates just re-check the badge.
  runtime.onInstalled?.addListener((details) => {
    const install =
      typeof handleExtensionInstalled === 'function'
        ? handleExtensionInstalled(details)
        : Promise.resolve(false);
    return install
      .catch((error) => console.warn('[youtublur] install handling failed:', error))
      .then(refreshBadge);
  });
  runtime.onStartup?.addListener(() => refreshBadge());
}

registerOnboarding();

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { runShortcutCommand });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runShortcutCommand };
}
