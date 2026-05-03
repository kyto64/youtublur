import { vi } from 'vitest';
require('./storage-mode.js');
const { initPopup, saveModeToStorage, loadModeFromStorage } = require('./popup.js');

describe('popup.js', () => {
  let syncGetMock;
  let syncSetMock;
  let localGetMock;
  let localSetMock;

  beforeEach(() => {
    document.body.innerHTML = `
      <input type="radio" name="bgMode" id="modeSolid" value="solid">
      <input type="radio" name="bgMode" id="modeBlur" value="blur">
    `;

    syncGetMock = vi.fn((keys, cb) => { if (cb) cb({}); });
    syncSetMock = vi.fn((data, cb) => { if (cb) cb(); });
    localGetMock = vi.fn((keys, cb) => { if (cb) cb({}); });
    localSetMock = vi.fn((data, cb) => { if (cb) cb(); });

    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => key),
        getUILanguage: vi.fn(() => 'en')
      },
      runtime: {},
      storage: {
        sync: {
          get: syncGetMock,
          set: syncSetMock
        },
        local: {
          get: localGetMock,
          set: localSetMock
        }
      },
      tabs: {
        query: vi.fn((query, callback) => callback([{ id: 1, url: 'https://youtube.com/watch' }])),
        sendMessage: vi.fn().mockResolvedValue()
      }
    };
  });

  afterEach(() => {
    delete global.chrome;
  });

  test('initializes radio buttons based on storage', async () => {
    // Mock storage to return 'blur' mode
    syncGetMock.mockImplementation((keys, cb) => {
      cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: Date.now() });
    });

    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Wait for async loadModeFromStorage to complete
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    const radioBlur = document.getElementById('modeBlur');
    expect(radioBlur).not.toBeNull();
    expect(radioBlur.checked).toBe(true);
    expect(syncGetMock).toHaveBeenCalled();
  });

  test('initializes solid radio when storage is solid', async () => {
    // Mock storage to return 'solid' mode
    syncGetMock.mockImplementation((keys, cb) => {
      cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: Date.now() });
    });

    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    expect(document.getElementById('modeSolid').checked).toBe(true);
    expect(document.getElementById('modeBlur').checked).toBe(false);
  });

  test('does not send message when active tab is not YouTube', () => {
    chrome.tabs.query = vi.fn((query, callback) =>
      callback([{ id: 1, url: 'https://example.com/' }])
    );
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    const radioBlur = document.getElementById('modeBlur');
    radioBlur.checked = true;
    radioBlur.dispatchEvent(new Event('change'));

    return new Promise((resolve) => {
      process.nextTick(() => {
        process.nextTick(() => {
          expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
          resolve();
        });
      });
    });
  });

  test('updates storage and sends message on change', async () => {
    // Mock loadModeFromStorage to return 'blur' initially
    syncGetMock.mockImplementation((keys, cb) => {
      cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: Date.now() });
    });

    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    // Now change to solid
    const radioSolid = document.getElementById('modeSolid');
    radioSolid.checked = true;
    radioSolid.dispatchEvent(new Event('change'));

    // Wait for saveModeToStorage to complete and then tabs.query/sendMessage
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => process.nextTick(resolve));

    expect(syncSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ playerBackgroundMode: 'solid' }),
      expect.any(Function)
    );
    expect(chrome.tabs.query).toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'BG_MODE_CHANGED', mode: 'solid' });
  });

  describe('reload button', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <input type="radio" name="bgMode" id="modeSolid" value="solid">
        <input type="radio" name="bgMode" id="modeBlur" value="blur">
        <div id="reloadButton" role="button" tabindex="0">
          <span id="labelReload"></span>
        </div>
      `;
    });

    test('sends RELOAD_BLUR message on click', () => {
      initPopup();
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const btn = document.getElementById('reloadButton');
      btn.click();

      return new Promise((resolve) => {
        process.nextTick(() => {
          expect(chrome.tabs.query).toHaveBeenCalled();
          expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'RELOAD_BLUR' });
          resolve();
        });
      });
    });

    test('sends RELOAD_BLUR message on Enter key', () => {
      initPopup();
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const btn = document.getElementById('reloadButton');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      btn.dispatchEvent(event);

      return new Promise((resolve) => {
        process.nextTick(() => {
          expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'RELOAD_BLUR' });
          resolve();
        });
      });
    });

    test('sends RELOAD_BLUR message on Space key', () => {
      initPopup();
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const btn = document.getElementById('reloadButton');
      const event = new KeyboardEvent('keydown', { key: ' ' });
      btn.dispatchEvent(event);

      return new Promise((resolve) => {
        process.nextTick(() => {
          expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'RELOAD_BLUR' });
          resolve();
        });
      });
    });

    test('does not send RELOAD_BLUR when active tab is not YouTube', () => {
      chrome.tabs.query = vi.fn((query, callback) =>
        callback([{ id: 1, url: 'https://example.com/' }])
      );
      initPopup();
      document.dispatchEvent(new Event('DOMContentLoaded'));

      const btn = document.getElementById('reloadButton');
      btn.click();

      return new Promise((resolve) => {
        process.nextTick(() => {
          expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
          resolve();
        });
      });
    });
  });
});

// Storage functions tests
describe('storage functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('saveModeToStorage saves to sync storage and returns true', async () => {
    const syncSet = vi.fn((data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: syncSet },
        local: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: vi.fn((data, cb) => { if (cb) cb(); }) }
      },
      runtime: { lastError: undefined }
    });

    const result = await saveModeToStorage('blur');
    expect(result).toBe(true);
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ playerBackgroundMode: 'blur' }),
      expect.any(Function)
    );
  });

  test('saveModeToStorage does not write local until sync callback runs', async () => {
    let finishSync = () => {};
    const syncSet = vi.fn((_data, cb) => {
      finishSync = () => {
        if (cb) cb();
      };
    });
    const localSet = vi.fn((data, cb) => {
      if (cb) cb();
    });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: syncSet },
        local: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: localSet }
      },
      runtime: { lastError: undefined }
    });

    const p = saveModeToStorage('blur');
    await new Promise((r) => process.nextTick(r));
    expect(localSet).not.toHaveBeenCalled();
    finishSync();
    await p;
    expect(localSet).toHaveBeenCalledWith(
      expect.objectContaining({ playerBackgroundMode: 'blur' }),
      expect.any(Function)
    );
  });

  test('saveModeToStorage falls back to local storage on sync failure', async () => {
    const syncSet = vi.fn(() => { throw new Error('sync failed'); });
    const localSet = vi.fn((data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: syncSet },
        local: { get: vi.fn((keys, cb) => { if (cb) cb({}); }), set: localSet }
      },
      runtime: { lastError: undefined }
    });

    const result = await saveModeToStorage('solid');
    expect(result).toBe(false);
    expect(localSet).toHaveBeenCalled();
    // Check that localSet was called with the correct data at least once
    const calls = localSet.mock.calls;
    const hasCorrectDataCall = calls.some(call =>
      call[0] && call[0].playerBackgroundMode === 'solid'
    );
    expect(hasCorrectDataCall).toBe(true);
  });

  test('loadModeFromStorage returns sync value when both storages have data and sync is newer', async () => {
    const syncTimestamp = Date.now();
    const localTimestamp = syncTimestamp - 1000;
    const syncGet = vi.fn((keys, cb) => {
      if (cb) cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: syncTimestamp });
    });
    const localGet = vi.fn((keys, cb) => {
      if (cb) cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: localTimestamp });
    });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: syncGet, set: vi.fn() },
        local: { get: localGet, set: vi.fn() }
      }
    });

    const mode = await loadModeFromStorage();
    expect(mode).toBe('blur');
  });

  test('loadModeFromStorage returns local value when local is newer', async () => {
    const syncTimestamp = Date.now() - 1000;
    const localTimestamp = Date.now();
    const syncGet = vi.fn((keys, cb) => {
      if (cb) cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: syncTimestamp });
    });
    const localGet = vi.fn((keys, cb) => {
      if (cb) cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: localTimestamp });
    });
    const syncSet = vi.fn((data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: syncGet, set: syncSet },
        local: { get: localGet, set: vi.fn() }
      }
    });

    const mode = await loadModeFromStorage();
    expect(mode).toBe('solid');
    // Should sync the newer local value back to sync storage
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ playerBackgroundMode: 'solid' }),
      expect.any(Function)
    );
  });

  test('loadModeFromStorage returns default blur when no data exists', async () => {
    const syncGet = vi.fn((keys, cb) => { if (cb) cb({}); });
    const localGet = vi.fn((keys, cb) => { if (cb) cb({}); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: syncGet, set: vi.fn() },
        local: { get: localGet, set: vi.fn() }
      }
    });

    const mode = await loadModeFromStorage();
    expect(mode).toBe('blur');
  });
});
