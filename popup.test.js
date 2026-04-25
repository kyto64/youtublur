import { vi } from 'vitest';
const { initPopup, STORAGE_KEY } = require('./popup.js');

describe('popup.js', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="radio" name="bgMode" id="modeSolid" value="solid">
      <input type="radio" name="bgMode" id="modeBlur" value="blur">
    `;
    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => key),
        getUILanguage: vi.fn(() => 'en')
      },
      storage: {
        sync: {
          get: vi.fn((defaults, callback) => callback({ [STORAGE_KEY]: 'blur' })),
          set: vi.fn((data, callback) => callback())
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

  test('initializes radio buttons based on storage', () => {
    initPopup();
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);

    return new Promise(resolve => {
      process.nextTick(() => {
        const radioBlur = document.getElementById('modeBlur');
        expect(radioBlur).not.toBeNull();
        expect(radioBlur.checked).toBe(true);
        expect(chrome.storage.sync.get).toHaveBeenCalled();
        resolve();
      });
    });
  });

  test('initializes solid radio when storage is solid', () => {
    chrome.storage.sync.get = vi.fn((defaults, callback) =>
      callback({ [STORAGE_KEY]: 'solid' })
    );
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    return new Promise((resolve) => {
      process.nextTick(() => {
        expect(document.getElementById('modeSolid').checked).toBe(true);
        expect(document.getElementById('modeBlur').checked).toBe(false);
        resolve();
      });
    });
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

  test('updates storage and sends message on change', () => {
    initPopup();
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);

    const radioSolid = document.getElementById('modeSolid');
    radioSolid.checked = true;
    radioSolid.dispatchEvent(new Event('change'));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [STORAGE_KEY]: 'solid' }, expect.any(Function));
    
    // Simulate set callback
    return new Promise(resolve => {
      process.nextTick(() => {
        expect(chrome.tabs.query).toHaveBeenCalled();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'BG_MODE_CHANGED', mode: 'solid' });
        resolve();
      });
    });
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
