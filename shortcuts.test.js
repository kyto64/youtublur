import { vi } from 'vitest';

require('./storage-mode.js');
require('./shortcut-actions.js');

const { applyShortcutCommand, SHORTCUT_COMMAND_ORDER } = require('./shortcut-actions.js');

function deferredStorage() {
  const syncData = {};
  const localData = {};
  const read = (store, keys, cb) => {
    const result = {};
    const list = Array.isArray(keys) ? keys : [];
    for (const key of list) {
      if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key];
    }
    if (cb) cb(result);
  };
  return {
    syncData,
    localData,
    sync: {
      get: vi.fn((keys, cb) => read(syncData, keys, cb)),
      set: vi.fn((data, cb) => {
        Object.assign(syncData, data);
        if (cb) cb();
      })
    },
    local: {
      get: vi.fn((keys, cb) => read(localData, keys, cb)),
      set: vi.fn((data, cb) => {
        Object.assign(localData, data);
        if (cb) cb();
      })
    }
  };
}

describe('applyShortcutCommand', () => {
  test('toggles blur and solid, and treats unknown modes as blur', () => {
    expect(applyShortcutCommand('toggle-mode', { mode: 'blur', blurPx: 40 })).toEqual({
      kind: 'mode',
      mode: 'solid'
    });
    expect(applyShortcutCommand('toggle-mode', { mode: 'solid', blurPx: 40 })).toEqual({
      kind: 'mode',
      mode: 'blur'
    });
    expect(applyShortcutCommand('toggle-mode', { mode: 'default', blurPx: 40 })).toEqual({
      kind: 'mode',
      mode: 'solid'
    });
  });

  test('steps blur strength by 4px inside 8–72 and ignores the ends', () => {
    expect(applyShortcutCommand('increase-blur-strength', { mode: 'blur', blurPx: 40 })).toEqual({
      kind: 'blur',
      blurPx: 44
    });
    expect(applyShortcutCommand('decrease-blur-strength', { mode: 'blur', blurPx: 40 })).toEqual({
      kind: 'blur',
      blurPx: 36
    });
    expect(applyShortcutCommand('increase-blur-strength', { mode: 'solid', blurPx: 72 })).toEqual({
      kind: 'none'
    });
    expect(applyShortcutCommand('decrease-blur-strength', { mode: 'blur', blurPx: 8 })).toEqual({
      kind: 'none'
    });
    expect(applyShortcutCommand('increase-blur-strength', { mode: 'blur', blurPx: 70 })).toEqual({
      kind: 'none'
    });
  });

  test('ignores unknown commands', () => {
    expect(applyShortcutCommand('not-a-command', { mode: 'blur', blurPx: 40 })).toEqual({ kind: 'none' });
    expect(SHORTCUT_COMMAND_ORDER).toEqual([
      'toggle-mode',
      'increase-blur-strength',
      'decrease-blur-strength',
      'reload-effect',
      '_execute_action'
    ]);
    expect(applyShortcutCommand('reload-effect', { mode: 'blur', blurPx: 40 })).toEqual({ kind: 'none' });
    expect(applyShortcutCommand('_execute_action', { mode: 'blur', blurPx: 40 })).toEqual({ kind: 'none' });
  });
});

describe('background shortcut commands', () => {
  let areas;
  let commandListener;
  let sendMessage;
  let runShortcutCommand;

  beforeEach(() => {
    areas = deferredStorage();
    sendMessage = vi.fn((tabId, message, cb) => {
      if (cb) cb();
    });
    commandListener = undefined;
    global.chrome = {
      runtime: {},
      commands: {
        onCommand: {
          addListener: vi.fn((fn) => {
            commandListener = fn;
          })
        }
      },
      storage: { sync: areas.sync, local: areas.local },
      tabs: {
        query: vi.fn((query, cb) => {
          cb([
            { id: 11, url: 'https://www.youtube.com/watch?v=a' },
            { id: 12, url: 'https://www.youtube.com/watch?v=b' },
            { url: 'https://www.youtube.com/feed' }
          ]);
        }),
        sendMessage
      }
    };
    delete require.cache[require.resolve('./background.js')];
    ({ runShortcutCommand } = require('./background.js'));
  });

  afterEach(() => {
    delete global.chrome;
    delete require.cache[require.resolve('./background.js')];
  });

  test('registers one listener and toggles mode on every YouTube tab', async () => {
    expect(global.chrome.commands.onCommand.addListener).toHaveBeenCalledTimes(1);
    await commandListener('toggle-mode');

    expect(areas.syncData.playerBackgroundMode).toBe('solid');
    expect(typeof areas.syncData.playerBackgroundModeTimestamp).toBe('number');
    expect(areas.syncData.playerBlurStrengthPx).toBeUndefined();
    expect(global.chrome.tabs.query).toHaveBeenCalledWith({}, expect.any(Function));
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(11, { type: 'BG_MODE_CHANGED', mode: 'solid' }, expect.any(Function));
    expect(sendMessage).toHaveBeenCalledWith(12, { type: 'BG_MODE_CHANGED', mode: 'solid' }, expect.any(Function));
  });

  test('raises blur strength through the same storage keys and message as the popup', async () => {
    areas.syncData.playerBackgroundMode = 'blur';
    areas.syncData.playerBackgroundModeTimestamp = 1;
    areas.syncData.playerBlurStrengthPx = 40;
    areas.syncData.playerBlurStrengthPxTimestamp = 1;

    await runShortcutCommand('increase-blur-strength');

    expect(areas.syncData.playerBlurStrengthPx).toBe(44);
    expect(areas.syncData.playerBackgroundMode).toBe('blur');
    expect(sendMessage).toHaveBeenCalledWith(
      11,
      { type: 'BLUR_STRENGTH_CHANGED', strength: 44 },
      expect.any(Function)
    );
  });

  test('does not write storage when blur strength is already at the ceiling', async () => {
    areas.syncData.playerBlurStrengthPx = 72;
    areas.syncData.playerBlurStrengthPxTimestamp = 5;
    const setsBefore = areas.sync.set.mock.calls.length;

    await runShortcutCommand('increase-blur-strength');

    expect(areas.sync.set.mock.calls.length).toBe(setsBefore);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('applies two fast blur increases in order instead of both writing 44', async () => {
    areas.syncData.playerBlurStrengthPx = 40;
    areas.syncData.playerBlurStrengthPxTimestamp = 1;

    await Promise.all([
      runShortcutCommand('increase-blur-strength'),
      runShortcutCommand('increase-blur-strength')
    ]);

    expect(areas.syncData.playerBlurStrengthPx).toBe(48);
  });

  test('reload reuses RELOAD_BLUR and does not write mode storage', async () => {
    await runShortcutCommand('reload-effect');
    expect(sendMessage).toHaveBeenCalledWith(11, { type: 'RELOAD_BLUR' }, expect.any(Function));
    expect(areas.syncData.playerBackgroundMode).toBeUndefined();
    expect(areas.syncData.playerBlurStrengthPx).toBeUndefined();
  });

  test('logs and skips messaging when the tab query fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.chrome.runtime.lastError = { message: 'query failed' };
    global.chrome.tabs.query.mockImplementation((query, cb) => cb([]));

    await runShortcutCommand('toggle-mode');

    expect(areas.syncData.playerBackgroundMode).toBe('solid');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('popup shortcut list', () => {
  let initPopupShortcuts;
  let openShortcutSettings;
  let shortcutSettingsUrl;
  let renderShortcutList;

  beforeEach(() => {
    document.body.innerHTML = `
      <section id="shortcutSection">
        <p id="shortcutSectionTitle"></p>
        <ul id="shortcutList"></ul>
        <p id="shortcutManageHint"></p>
        <button type="button" id="shortcutManage"></button>
      </section>
    `;
    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => {
          const messages = {
            shortcutSectionTitle: 'Shortcuts',
            shortcutUnset: 'Not set',
            shortcutManage: 'Manage shortcuts',
            shortcutManageHint: 'Rebind these in the browser.'
          };
          return messages[key] || '';
        })
      },
      runtime: {},
      commands: {
        getAll: vi.fn((cb) => {
          cb([
            { name: 'toggle-mode', description: 'Switch blur and solid', shortcut: 'Alt+Shift+Y' },
            { name: 'increase-blur-strength', description: '<img src=x>', shortcut: '' },
            { name: 'decrease-blur-strength', description: 'Decrease blur strength', shortcut: 'Alt+Shift+Comma' },
            { name: 'reload-effect', description: 'Reload player background', shortcut: '' },
            { name: '_execute_action', description: 'Open youtublur', shortcut: 'Alt+Shift+U' }
          ]);
        })
      },
      tabs: {
        create: vi.fn((opts, cb) => {
          if (cb) cb();
        })
      }
    };
    ({
      initPopupShortcuts,
      openShortcutSettings,
      shortcutSettingsUrl,
      renderShortcutList
    } = require('./popup-shortcuts.js'));
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('lists commands in order and escapes descriptions', async () => {
    initPopupShortcuts();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('shortcutSectionTitle').textContent).toBe('Shortcuts');
    expect(document.getElementById('shortcutManage').textContent).toBe('Manage shortcuts');
    const items = [...document.querySelectorAll('#shortcutList li')];
    expect(items.map((item) => item.querySelector('.shortcut-label').textContent)).toEqual([
      'Switch blur and solid',
      '<img src=x>',
      'Decrease blur strength',
      'Reload player background',
      'Open youtublur'
    ]);
    expect(document.querySelector('#shortcutList img')).toBeNull();
    expect(items.map((item) => item.querySelector('kbd').textContent)).toEqual([
      'Alt+Shift+Y',
      'Not set',
      'Alt+Shift+Comma',
      'Not set',
      'Alt+Shift+U'
    ]);
  });

  test('opens Chrome shortcut settings, and Firefox uses commands.openShortcutSettings', () => {
    expect(shortcutSettingsUrl()).toBe('chrome://extensions/shortcuts');
    openShortcutSettings();
    expect(global.chrome.tabs.create).toHaveBeenCalledWith(
      { url: 'chrome://extensions/shortcuts' },
      expect.any(Function)
    );

    const originalSupports = CSS.supports;
    CSS.supports = (prop) => prop === '-moz-appearance';
    const openShortcutSettingsApi = vi.fn(() => Promise.resolve());
    global.chrome.commands.openShortcutSettings = openShortcutSettingsApi;
    global.chrome.tabs.create.mockClear();
    try {
      openShortcutSettings();
      expect(openShortcutSettingsApi).toHaveBeenCalledTimes(1);
      expect(global.chrome.tabs.create).not.toHaveBeenCalled();

      delete global.chrome.commands.openShortcutSettings;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      openShortcutSettings();
      expect(global.chrome.tabs.create).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    } finally {
      CSS.supports = originalSupports;
    }
  });

  test('renderShortcutList no-ops without the list element', () => {
    document.body.innerHTML = '';
    expect(() => renderShortcutList([])).not.toThrow();
  });
});
