import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

require('./storage-mode.js');
const {
  clampBlurStrengthPx,
  saveBlurStrengthToStorage,
  loadBlurStrengthFromStorage,
  YOUTUBLUR_BLUR_RANGE,
  STORAGE_BLUR_KEY
} = require('./storage-mode.js');
const {
  BLUR_STRENGTH_PX,
  drawBlurFrame,
  setActiveBlurStrengthPx,
  getActiveBlurStrengthPx,
  initExtension,
  resetState
} = require('./content.js');

function videoReady() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
  return video;
}

describe('blur strength storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('range keeps today\'s 40px default on the slider grid', () => {
    expect(BLUR_STRENGTH_PX).toBe(40);
    expect(YOUTUBLUR_BLUR_RANGE).toEqual({ min: 8, max: 72, defaultValue: 40, step: 4 });
    expect(clampBlurStrengthPx(undefined)).toBe(40);
    expect(clampBlurStrengthPx('nope')).toBe(40);
    expect(clampBlurStrengthPx(40)).toBe(40);
    expect(clampBlurStrengthPx(0)).toBe(8);
    expect(clampBlurStrengthPx(100)).toBe(72);
    expect(clampBlurStrengthPx(41)).toBe(40);
  });

  test('popup hides the slider unless blur mode is selected', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'popup.html'), 'utf8');
    expect(html).toContain('min="8" max="72" step="4" value="40"');
    expect(html).toMatch(/\.blur-strength-section\s*\{[^}]*display:\s*none/);
    expect(html).toContain('#modeBlur:checked ~ .blur-strength-section');
  });

  test('saveBlurStrengthToStorage snaps and writes sync before local', async () => {
    const syncSet = vi.fn((_data, cb) => { if (cb) cb(); });
    const localSet = vi.fn((_data, cb) => { if (cb) cb(); });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: vi.fn((_keys, cb) => cb({})), set: syncSet },
        local: { get: vi.fn((_keys, cb) => cb({})), set: localSet }
      },
      runtime: { lastError: undefined }
    });

    const saved = await saveBlurStrengthToStorage(100);
    expect(saved).toBe(true);
    expect(syncSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_BLUR_KEY]: 72 }),
      expect.any(Function)
    );
    expect(localSet).toHaveBeenCalledWith(
      expect.objectContaining({ [STORAGE_BLUR_KEY]: 72 }),
      expect.any(Function)
    );
  });

  test('loadBlurStrengthFromStorage prefers the newer copy and defaults when unset', async () => {
    const syncGet = vi.fn((_keys, cb) => {
      cb({ playerBlurStrengthPx: 16, playerBlurStrengthPxTimestamp: 1 });
    });
    const localGet = vi.fn((_keys, cb) => {
      cb({ playerBlurStrengthPx: 64, playerBlurStrengthPxTimestamp: 5 });
    });
    vi.stubGlobal('chrome', {
      storage: {
        sync: { get: syncGet, set: vi.fn() },
        local: { get: localGet, set: vi.fn() }
      }
    });

    await expect(loadBlurStrengthFromStorage()).resolves.toBe(64);

    syncGet.mockImplementation((_keys, cb) => cb({}));
    localGet.mockImplementation((_keys, cb) => cb({}));
    await expect(loadBlurStrengthFromStorage()).resolves.toBe(40);
  });
});

describe('blur strength rendering', () => {
  beforeEach(() => {
    resetState();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      filter: '',
      drawImage: vi.fn(),
      clearRect: vi.fn()
    }));
  });

  afterEach(() => {
    resetState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('drawBlurFrame uses the active radius and clears the filter afterward', () => {
    const ctx = {
      filter: '',
      drawImage: vi.fn(),
      clearRect: vi.fn()
    };
    ctx.drawImage.mockImplementation(() => {
      ctx.duringDraw = ctx.filter;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    setActiveBlurStrengthPx(16);

    drawBlurFrame(videoReady(), canvas, ctx);

    expect(ctx.duringDraw).toBe('blur(16px)');
    expect(ctx.filter).toBe('none');
    expect(getActiveBlurStrengthPx()).toBe(16);
  });

  test('slider message updates open players and ignores a stale storage echo', async () => {
    vi.stubGlobal('location', { pathname: '/watch' });
    document.body.innerHTML = '<div id="content"><div id="movie_player"><video></video></div></div>';
    let storedPx = 40;
    let storedTs = 1;
    let onChanged = null;
    let onMessage = null;
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => {
            cb({
              playerBackgroundMode: 'blur',
              playerBackgroundModeTimestamp: 1,
              playerBlurStrengthPx: storedPx,
              playerBlurStrengthPxTimestamp: storedTs
            });
          }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        local: {
          get: vi.fn((_keys, cb) => cb({})),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        onChanged: {
          addListener: (fn) => { onChanged = fn; }
        }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { onMessage = fn; }
        }
      }
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    initExtension();
    await Promise.resolve();
    await Promise.resolve();

    const canvas = document.querySelector('#yt-light-bg-blur-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.dataset.ytBlurStrength).toBe('40');

    onMessage({ type: 'BLUR_STRENGTH_CHANGED', strength: '72' });
    expect(getActiveBlurStrengthPx()).toBe(40);

    onMessage({ type: 'BLUR_STRENGTH_CHANGED', strength: 8 });
    expect(canvas.dataset.ytBlurStrength).toBe('8');

    storedPx = 40;
    storedTs = 1;
    onChanged({ playerBlurStrengthPx: { newValue: 40 } }, 'sync');
    await Promise.resolve();
    await Promise.resolve();
    expect(getActiveBlurStrengthPx()).toBe(8);

    storedPx = 8;
    storedTs = Date.now();
    onChanged({ playerBlurStrengthPx: { newValue: 8 } }, 'local');
    await Promise.resolve();
    await Promise.resolve();
    expect(getActiveBlurStrengthPx()).toBe(8);
  });

  test('a newer blur strength from another tab applies during the local suppression window', async () => {
    vi.stubGlobal('location', { pathname: '/watch' });
    document.body.innerHTML = '<div id="content"><div id="movie_player"><video></video></div></div>';
    let storedPx = 40;
    let storedTs = 1;
    let onChanged = null;
    let onMessage = null;
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => {
            cb({
              playerBackgroundMode: 'blur',
              playerBackgroundModeTimestamp: 1,
              playerBlurStrengthPx: storedPx,
              playerBlurStrengthPxTimestamp: storedTs
            });
          }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        local: {
          get: vi.fn((_keys, cb) => cb({})),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        onChanged: {
          addListener: (fn) => { onChanged = fn; }
        }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { onMessage = fn; }
        }
      }
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    initExtension();
    await Promise.resolve();
    await Promise.resolve();

    onMessage({ type: 'BLUR_STRENGTH_CHANGED', strength: 8 });
    expect(getActiveBlurStrengthPx()).toBe(8);

    storedPx = 16;
    storedTs = Date.now() + 1000;
    onChanged({ playerBlurStrengthPx: { newValue: 16 } }, 'sync');
    await Promise.resolve();
    await Promise.resolve();

    const canvas = document.querySelector('#yt-light-bg-blur-canvas');
    expect(getActiveBlurStrengthPx()).toBe(16);
    expect(canvas.dataset.ytBlurStrength).toBe('16');
  });

  test('suppression timeout re-reads storage when another tab changed and the notice was missed', async () => {
    vi.stubGlobal('location', { pathname: '/watch' });
    document.body.innerHTML = '<div id="content"><div id="movie_player"><video></video></div></div>';
    let storedPx = 40;
    let storedTs = 1;
    let onMessage = null;
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => {
            cb({
              playerBackgroundMode: 'blur',
              playerBackgroundModeTimestamp: 1,
              playerBlurStrengthPx: storedPx,
              playerBlurStrengthPxTimestamp: storedTs
            });
          }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        local: {
          get: vi.fn((_keys, cb) => cb({})),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { onMessage = fn; }
        }
      }
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    initExtension();
    await Promise.resolve();
    await Promise.resolve();

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      onMessage({ type: 'BLUR_STRENGTH_CHANGED', strength: 8 });
      expect(getActiveBlurStrengthPx()).toBe(8);

      storedPx = 16;
      storedTs = Date.now() + 5000;
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
      await Promise.resolve();

      expect(getActiveBlurStrengthPx()).toBe(16);
      expect(document.querySelector('#yt-light-bg-blur-canvas').dataset.ytBlurStrength).toBe('16');
    } finally {
      vi.useRealTimers();
    }
  });

  test('suppression timeout does not restore a blur strength written before the local command', async () => {
    vi.stubGlobal('location', { pathname: '/watch' });
    document.body.innerHTML = '<div id="content"><div id="movie_player"><video></video></div></div>';
    let storedPx = 40;
    let storedTs = 1;
    let onMessage = null;
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn((_keys, cb) => {
            cb({
              playerBackgroundMode: 'blur',
              playerBackgroundModeTimestamp: 1,
              playerBlurStrengthPx: storedPx,
              playerBlurStrengthPxTimestamp: storedTs
            });
          }),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        local: {
          get: vi.fn((_keys, cb) => cb({})),
          set: vi.fn((_data, cb) => { if (cb) cb(); })
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { onMessage = fn; }
        }
      }
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    initExtension();
    await Promise.resolve();
    await Promise.resolve();

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      onMessage({ type: 'BLUR_STRENGTH_CHANGED', strength: 8 });
      expect(getActiveBlurStrengthPx()).toBe(8);

      storedPx = 40;
      storedTs = 1;
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.resolve();
      await Promise.resolve();

      expect(getActiveBlurStrengthPx()).toBe(8);
      expect(document.querySelector('#yt-light-bg-blur-canvas').dataset.ytBlurStrength).toBe('8');
    } finally {
      vi.useRealTimers();
    }
  });
});
