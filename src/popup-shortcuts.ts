// Shows manifest command bindings in the popup. Loaded after shortcut-actions.js.

const CHROME_SHORTCUT_SETTINGS_URL = 'chrome://extensions/shortcuts';
const FIREFOX_SHORTCUT_SETTINGS_URL = 'about:addons';

function isFirefoxForShortcuts(): boolean {
  try {
    return (
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('-moz-appearance', 'none')
    );
  } catch {
    return false;
  }
}

function shortcutSettingsUrl(): string {
  return isFirefoxForShortcuts() ? FIREFOX_SHORTCUT_SETTINGS_URL : CHROME_SHORTCUT_SETTINGS_URL;
}

function readRegisteredCommands(): Promise<chrome.commands.Command[]> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.commands || typeof chrome.commands.getAll !== 'function') {
      resolve([]);
      return;
    }

    let settled = false;
    const finish = (commands: chrome.commands.Command[] | null | undefined) => {
      if (settled) return;
      settled = true;
      resolve(Array.isArray(commands) ? commands : []);
    };

    try {
      const maybe = chrome.commands.getAll((commands) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('[youtublur] commands.getAll failed:', chrome.runtime.lastError);
          finish([]);
          return;
        }
        finish(commands);
      }) as unknown;
      if (maybe && typeof (maybe as Promise<chrome.commands.Command[]>).then === 'function') {
        (maybe as Promise<chrome.commands.Command[]>)
          .then((commands) => finish(commands))
          .catch((error) => {
            console.warn('[youtublur] commands.getAll failed:', error);
            finish([]);
          });
      }
    } catch (error) {
      console.warn('[youtublur] commands.getAll failed:', error);
      finish([]);
    }
  });
}

function renderShortcutList(commands: readonly chrome.commands.Command[]) {
  const list = document.getElementById('shortcutList');
  if (!list) return;

  const unsetLabel = (chrome.i18n && chrome.i18n.getMessage('shortcutUnset')) || '';
  const byName = new Map(commands.map((command) => [command.name, command]));
  list.replaceChildren();

  for (const name of SHORTCUT_COMMAND_ORDER) {
    const command = byName.get(name);
    if (!command) continue;
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'shortcut-label';
    label.textContent = command.description || name;
    const keys = document.createElement('kbd');
    keys.textContent = command.shortcut ? command.shortcut : unsetLabel;
    item.append(label, keys);
    list.append(item);
  }
}

function openShortcutSettings() {
  if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.create !== 'function') return;
  const url = shortcutSettingsUrl();
  try {
    chrome.tabs.create({ url }, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) console.warn('[youtublur] could not open shortcut settings:', err);
    });
  } catch (error) {
    console.warn('[youtublur] could not open shortcut settings:', error);
  }
}

function initPopupShortcuts() {
  const section = document.getElementById('shortcutSection');
  if (!section) return;

  const title = document.getElementById('shortcutSectionTitle');
  const hint = document.getElementById('shortcutManageHint');
  const manage = document.getElementById('shortcutManage');
  if (title) title.textContent = (chrome.i18n && chrome.i18n.getMessage('shortcutSectionTitle')) || '';
  if (hint) hint.textContent = (chrome.i18n && chrome.i18n.getMessage('shortcutManageHint')) || '';
  if (manage) {
    manage.textContent = (chrome.i18n && chrome.i18n.getMessage('shortcutManage')) || '';
    manage.addEventListener('click', () => openShortcutSettings());
  }

  readRegisteredCommands()
    .then((commands) => renderShortcutList(commands))
    .catch((error) => {
      console.warn('[youtublur] failed to render shortcuts:', error);
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPopupShortcuts,
    renderShortcutList,
    openShortcutSettings,
    shortcutSettingsUrl
  };
}
