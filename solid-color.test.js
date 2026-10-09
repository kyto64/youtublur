import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

require('./storage-mode.js');
require('./popup-color.js');
const { initPopup } = require('./popup.js');
const {
  DEFAULT_SOLID_COLOR,
  SOLID_COLOR_PRESETS,
  STORAGE_SOLID_COLOR_KEY,
  normalizeSolidColor,
  sanitizeSolidColorForCss,
  saveSolidColorToStorage,
  loadSolidColorFromStorage
} = require('./storage-mode.js');
const {
  setMode,
  setActiveSolidColor,
  getActiveSolidColor,
  initExtension,
  resetState
} = require('./content.js');

const COLOR_MESSAGE_KEYS = [
  'solidColorLabel',
  'solidColorCustomLabel',
  'solidColorPresetLight',
  'solidColorPresetGray',
  'solidColorPresetBlack',
  'solidColorPresetYtDark'
];

describe('solid color storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('accepts only hex and expands short form', () => {
    expect(DEFAULT_SOLID_COLOR).toBe('#f1f1f1');
    expect(SOLID_COLOR_PRESETS.map((preset) => preset.value)).toEqual([
      '#f1f1f1',
      '#272727',
      '#000000',
      '#0f0f0f'
    ]);
    expect(normalizeSolidColor('#F1F1F1')).toBe('#f1f1f1');
    expect(normalizeSolidColor('  #abc ')).toBe('#aabbcc');
    expect(normalizeSolidColor(undefined)).toBeNull();
    expect(normalizeSolidColor('')).toBeNull();
    expect(normalizeSolidColor('red')).toBeNull();
    expect(normalizeSolidColor('#f1f1f1;background:url(https://evil.example)')).toBeNull();
    expect(normalizeSolidColor('#11223344')).toBeNull();
    expect(sanitizeSolidColorForCss('not-a-color')).toBe('#f1f1f1');
  });

  test('popup shows color controls only in solid mode and lists the presets', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'popup.html'), 'utf8');
    expect(html).toMatch(/\.solid-color-section\s*\{[^}]*display:\s*none/);
    expect(html).toContain('#modeSolid:checked ~ .solid-color-section');
    expect(html).toContain('type="color"');
    expect(html).toContain('popup-color.js');
    for (const preset of SOLID_COLOR_PRESETS) {
      expect(html).toContain(`value="${preset.value}"`);
    }
  });

  test('every locale defines the color strings with message and description', () => {
    const root = path.join(process.cwd(), '_locales');
    for (const locale of ['en', 'es', 'id', 'ja', 'ko', 'pt_BR', 'zh_CN', 'zh_TW']) {
      const messages = JSON.parse(fs.readFileSync(path.join(root, locale, 'messages.json'), 'utf8'));
      for (const key of COLOR_MESSAGE_KEYS) {
        expect(messages[key]?.message, `${locale}.${key}`).toBeTruthy();
        expect(messages[key]?.description, `${locale}.${key} description`).toBeTruthy();
      }
    }
  });

  test('saveSolidColorToStorage writes a sanitized hex on the shared save queue', async () => {
    const syncSet = vi.fn((_data, cb) => { if (cb) cb(); });
    const localSet = vi.fn((_data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: vi.fn((_keys, cb) => cb({})), set: syncSet },
        local: { get: vi.fn((_keys, cb) => cb({})), set: localSet }
      },
      runtime: { lastError: undefined }
    });

    const saved = await saveSolidColorToStorage('#ABC');
    expect(saved).toBe(true);
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_SOLID_COLOR_KEY]: '#aabbcc' }),
      expect.any(Function)
    );
    expect(localSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_SOLID_COLOR_KEY]: '#aabbcc' }),
      expect.any(Function)
    );

    syncSet.mockClear();
    await saveSolidColorToStorage('red; background: url(https://evil.example)');
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_SOLID_COLOR_KEY]: '#f1f1f1' }),
      expect.any(Function)
    );
  });

  test('loadSolidColorFromStorage prefers the newer copy and stays unset when missing or invalid', async () => {
    const syncGet = vi.fn((_keys, cb) => {
      cb({ playerSolidColor: '#f1f1f1', playerSolidColorTimestamp: 1 });
    });
    const localGet = vi.fn((_keys, cb) => {
      cb({ playerSolidColor: '#0f0f0f', playerSolidColorTimestamp: 5 });
    });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: syncGet, set: vi.fn() },
        local: { get: localGet, set: vi.fn() }
      }
    });

    await expect(loadSolidColorFromStorage()).resolves.toBe('#0f0f0f');

    syncGet.mockImplementation((_keys, cb) => cb({}));
    localGet.mockImplementation((_keys, cb) => cb({}));
    await expect(loadSolidColorFromStorage()).resolves.toBeNull();

    syncGet.mockImplementation((_keys, cb) => {
      cb({ playerSolidColor: 'expression(alert(1))', playerSolidColorTimestamp: 9 });
    });
    await expect(loadSolidColorFromStorage()).resolves.toBeNull();
  });
});

describe('solid color on the player', () => {
  beforeEach(() => {
    resetState();
    document.body.innerHTML = '<div id="movie_player"></div>';
    document.documentElement.removeAttribute('dark');
    document.documentElement.removeAttribute('theme');
  });

  afterEach(() => {
    resetState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('unset color keeps the theme fill and a chosen color ignores later theme changes', async () => {
    setMode('solid');
    const player = document.getElementById('movie_player');

    setActiveSolidColor(null);
    expect(player.dataset.ytSolidColor).toBe('#f1f1f1');
    expect(player.style.getPropertyValue('background-color')).toMatch(/#f1f1f1|rgb\(241,\s*241,\s*241\)/);

    document.documentElement.setAttribute('dark', '');
    setActiveSolidColor(null);
    expect(player.dataset.ytSolidColor).toBe('#181818');

    setActiveSolidColor('#000000');
    document.documentElement.setAttribute('theme', 'dark');
    await Promise.resolve();
    expect(player.dataset.ytSolidColor).toBe('#000000');
    expect(player.style.getPropertyValue('background-color')).toMatch(/#000000|rgb\(0,\s*0,\s*0\)/);
    expect(getActiveSolidColor()).toBe('#000000');
  });

  test('rejects a non-hex message and ignores an older stored echo', async () => {
    vi.stubGlobal('location', { pathname: '/watch' });
    let storedColor = null;
    let storedTs = 0;
    let onChanged = null;
    let onMessage = null;
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => {
            const result = {};
            if (storedColor !== null) {
              result.playerSolidColor = storedColor;
              result.playerSolidColorTimestamp = storedTs;
            }
            cb(result);
          }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        local: {
          get: vi.fn((_keys, cb) => cb({})),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        onChanged: { addListener: (fn) => { onChanged = fn; } }
      },
      runtime: { onMessage: { addListener: (fn) => { onMessage = fn; } } }
    });

    initExtension();
    await Promise.resolve();
    await Promise.resolve();
    setMode('solid');

    onMessage({ type: 'SOLID_COLOR_CHANGED', color: '#112233;background:url(https://evil.example)' });
    expect(getActiveSolidColor()).toBeNull();

    onMessage({ type: 'SOLID_COLOR_CHANGED', color: '#000000' });
    expect(document.getElementById('movie_player').dataset.ytSolidColor).toBe('#000000');

    storedColor = '#f1f1f1';
    storedTs = 1;
    onChanged({ playerSolidColor: { newValue: '#f1f1f1' } }, 'sync');
    await Promise.resolve();
    await Promise.resolve();
    expect(getActiveSolidColor()).toBe('#000000');

    storedColor = '#0f0f0f';
    storedTs = Date.now() + 1000;
    onChanged({ playerSolidColor: { newValue: '#0f0f0f' } }, 'local');
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById('movie_player').dataset.ytSolidColor).toBe('#0f0f0f');
  });
});

function solidPopupDom() {
  document.body.innerHTML = `
    <input type="radio" name="bgMode" id="modeBlur" value="blur">
    <input type="radio" name="bgMode" id="modeSolid" value="solid" checked>
    <p id="labelSolidColor"></p>
    <div id="solidColorPresets">
      <input type="radio" name="solidPreset" id="solidPresetLight" value="#f1f1f1">
      <input type="radio" name="solidPreset" id="solidPresetGray" value="#272727">
      <input type="radio" name="solidPreset" id="solidPresetBlack" value="#000000">
      <input type="radio" name="solidPreset" id="solidPresetYtDark" value="#0f0f0f">
      <span id="solidPresetLightName"></span>
      <span id="solidPresetBlackName"></span>
    </div>
    <label id="labelSolidColorCustom" for="solidColor"></label>
    <input type="color" id="solidColor" value="#f1f1f1">
    <div class="preview-swatch" data-solid-tone="light"></div>
  `;
}

describe('solid color popup', () => {
  let syncGet;
  let syncSet;

  beforeEach(() => {
    solidPopupDom();
    syncGet = vi.fn((_keys, cb) => { if (cb) cb({}); });
    syncSet = vi.fn((_data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      i18n: {
        getMessage: vi.fn((key) => key),
        getUILanguage: vi.fn(() => 'en')
      },
      runtime: {},
      storage: {
        sync: { get: syncGet, set: syncSet },
        local: {
          get: vi.fn((_keys, cb) => { if (cb) cb({}); }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        }
      },
      tabs: {
        query: vi.fn((_query, callback) => callback([{ id: 1, url: 'https://www.youtube.com/watch?v=a' }])),
        sendMessage: vi.fn().mockResolvedValue()
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('leaves presets clear until a color is stored, then restores that color', async () => {
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));
    expect(document.getElementById('solidPresetLight').checked).toBe(false);
    expect(document.getElementById('solidColor').value).toBe('#f1f1f1');
    expect(syncSet).not.toHaveBeenCalled();

    syncGet.mockImplementation((_keys, cb) => {
      cb({ playerSolidColor: '#000000', playerSolidColorTimestamp: 4 });
    });
    solidPopupDom();
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));

    expect(document.getElementById('labelSolidColor').textContent).toBe('solidColorLabel');
    expect(document.getElementById('solidPresetLightName').textContent).toBe('solidColorPresetLight');
    expect(document.getElementById('solidPresetBlack').checked).toBe(true);
    expect(document.getElementById('solidColor').value).toBe('#000000');
    expect(document.querySelector('.preview-swatch').style.getPropertyValue('--solid-preview')).toBe('#000000');
    expect(document.querySelector('.preview-swatch').dataset.solidTone).toBe('dark');
  });

  test('a preset saves immediately and messages the active YouTube tab', async () => {
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));
    syncSet.mockClear();
    chrome.tabs.sendMessage.mockClear();

    const black = document.getElementById('solidPresetBlack');
    black.checked = true;
    black.dispatchEvent(new Event('change'));
    await new Promise((resolve) => process.nextTick(resolve));

    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ playerSolidColor: '#000000' }),
      expect.any(Function)
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'SOLID_COLOR_CHANGED', color: '#000000' },
      expect.any(Function)
    );
    expect(document.querySelector('.preview-swatch').dataset.solidTone).toBe('dark');
  });

  test('color input messages immediately and debounces the storage write', async () => {
    initPopup();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));
    syncSet.mockClear();
    chrome.tabs.sendMessage.mockClear();

    vi.useFakeTimers();
    const picker = document.getElementById('solidColor');
    picker.value = '#123456';
    picker.dispatchEvent(new Event('input'));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: 'SOLID_COLOR_CHANGED', color: '#123456' },
      expect.any(Function)
    );
    expect(syncSet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ playerSolidColor: '#123456' }),
      expect.any(Function)
    );
  });
});
