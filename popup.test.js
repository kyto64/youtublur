import { vi } from 'vitest';
const { initPopup, STORAGE_KEY } = require('./popup.js');

describe('popup.js', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="radio" name="bgMode" id="modeSolid" value="solid">
      <input type="radio" name="bgMode" id="modeBlur" value="blur">
    `;
    global.chrome = {
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
});
