"use strict";
// Chrome loads this file as the MV3 service worker and importScripts the helpers.
// Firefox loads storage-mode.js and shortcut-actions.js first via background.scripts
// (an event page). Listeners are registered synchronously so the worker can wake on a command.
function loadShortcutWorkerScripts() {
    if (typeof applyShortcutCommand === 'function' && typeof saveModeToStorage === 'function')
        return;
    // Call as a method. A detached importScripts loses its worker `this` and throws.
    const scope = globalThis;
    if (typeof scope.importScripts !== 'function')
        return;
    try {
        scope.importScripts('storage-mode.js', 'shortcut-actions.js');
    }
    catch (error) {
        console.warn('[youtublur] failed to load shortcut scripts:', error);
    }
}
loadShortcutWorkerScripts();
function broadcastToYouTubeTabs(message) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
            resolve();
            return;
        }
        let settled = false;
        const finish = () => {
            if (settled)
                return;
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
                    if (typeof tab.id !== 'number')
                        continue;
                    try {
                        const maybe = chrome.tabs.sendMessage(tab.id, message, () => {
                            // Tabs without a content script set lastError. Reading it clears the warning.
                            void (chrome.runtime && chrome.runtime.lastError);
                        });
                        if (maybe && typeof maybe.then === 'function') {
                            maybe.catch(() => undefined);
                        }
                    }
                    catch (error) {
                        console.warn('[youtublur] shortcut message failed:', error);
                    }
                }
                finish();
            });
        }
        catch (error) {
            console.warn('[youtublur] shortcut tab query failed:', error);
            finish();
        }
    });
}
async function runShortcutCommand(command) {
    const mode = await loadModeFromStorage();
    const blurPx = await loadBlurStrengthFromStorage();
    const effect = applyShortcutCommand(command, { mode, blurPx });
    if (effect.kind === 'none')
        return;
    if (effect.kind === 'mode') {
        await saveModeToStorage(effect.mode);
        await broadcastToYouTubeTabs({ type: 'BG_MODE_CHANGED', mode: effect.mode });
        return;
    }
    await saveBlurStrengthToStorage(effect.blurPx);
    await broadcastToYouTubeTabs({ type: 'BLUR_STRENGTH_CHANGED', strength: effect.blurPx });
}
function registerShortcutCommands() {
    const onCommand = typeof chrome !== 'undefined' ? chrome.commands?.onCommand : undefined;
    if (!onCommand || typeof onCommand.addListener !== 'function')
        return;
    onCommand.addListener((command) => runShortcutCommand(command).catch((error) => {
        console.warn('[youtublur] shortcut failed:', error);
    }));
}
registerShortcutCommands();
if (typeof globalThis !== 'undefined') {
    Object.assign(globalThis, { runShortcutCommand });
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runShortcutCommand };
}
