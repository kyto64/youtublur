import { vi } from 'vitest';
require('./storage-mode.js');
const {
  BLUR_STRENGTH_PX,
  isGeckoLayoutEngine,
  detectYouTubeTheme,
  getSolidModeBackgroundColor,
  createBlurCanvas,
  applyMode,
  getPlayerContainer,
  getVideoElement,
  resetState,
  getMode,
  initBlurForPlayer,
  observePlayer,
  isPlayerPagePath,
  drawBlurFrame,
  resizeCanvas,
  handleResize,
  setMode,
  initExtension,
  startBlurLoop,
  normalizeMode,
  saveModeToStorage,
  loadModeFromStorage,
  reconcileStorageCopies,
  // 新增：动态绘制间隔相关函数
  detectDevicePerformance,
  updateFPS,
  getAverageFPS,
  adjustDrawInterval,
  getCurrentDrawInterval,
  setCurrentDrawInterval,
  getFrameTimes,
  getAdjustmentCooldown,
  setAdjustmentCooldown
} = require('./content.js');

function mock2dContext() {
  return {
    filter: '',
    drawImage: vi.fn()
  };
}

describe('content.js', () => {
  // detectYouTubeTheme 関数のテスト
  describe('detectYouTubeTheme', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      document.documentElement.removeAttribute('dark');
      document.documentElement.removeAttribute('theme');
    });

    test('returns dark when html has dark attribute', () => {
      document.documentElement.setAttribute('dark', '');
      expect(detectYouTubeTheme()).toBe('dark');
    });

    test('returns dark when html has theme="dark"', () => {
      document.documentElement.setAttribute('theme', 'dark');
      expect(detectYouTubeTheme()).toBe('dark');
    });

    test('returns light when html has no dark attributes', () => {
      expect(detectYouTubeTheme()).toBe('light');
    });
  });

  // getSolidModeBackgroundColor 関数のテスト
  describe('getSolidModeBackgroundColor', () => {
    test('returns dark color when theme is dark', () => {
      document.documentElement.setAttribute('dark', '');
      expect(getSolidModeBackgroundColor()).toBe('#181818');
    });

    test('returns light color when theme is light', () => {
      document.documentElement.removeAttribute('dark');
      expect(getSolidModeBackgroundColor()).toBe('#f1f1f1');
    });
  });
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mock2dContext());
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    resetState();
  });

  test('getPlayerContainer returns #movie_player or .html5-video-player', () => {
    const legacy = document.createElement('div');
    legacy.className = 'html5-video-player';
    document.body.appendChild(legacy);
    expect(getPlayerContainer()).toBe(legacy);

    document.body.innerHTML = '';
    const modern = document.createElement('div');
    modern.id = 'movie_player';
    document.body.appendChild(modern);
    expect(getPlayerContainer()).toBe(modern);
  });

  test('getVideoElement returns nested video or undefined', () => {
    expect(getVideoElement(null)).toBeUndefined();
    const container = document.createElement('div');
    expect(getVideoElement(container)).toBeNull();
    const video = document.createElement('video');
    container.appendChild(video);
    expect(getVideoElement(container)).toBe(video);
  });

  test('createBlurCanvas returns null without video and does not insert canvas', () => {
    const container = document.createElement('div');
    container.id = 'movie_player';
    document.body.appendChild(container);

    expect(createBlurCanvas(container)).toBeNull();
    expect(container.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
  });

  test('createBlurCanvas creates a canvas', () => {
    const container = document.createElement('div');
    container.style.position = 'static';
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    const canvas = createBlurCanvas(container);
    expect(canvas).not.toBeNull();
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.id).toBe('yt-light-bg-blur-canvas');
    expect(container.style.position).toBe('relative');
  });

  test('createBlurCanvas reuses existing canvas in container', () => {
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    const first = createBlurCanvas(container);
    const second = createBlurCanvas(container);
    expect(second).toBe(first);
    expect(container.querySelectorAll('#yt-light-bg-blur-canvas')).toHaveLength(1);
  });

  test('createBlurCanvas returns null when getContext returns null', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    expect(createBlurCanvas(container)).toBeNull();
    expect(container.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mock2dContext());
  });

  test('applyMode updates currentMode and DOM', () => {
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    applyMode('blur', container);
    expect(getMode()).toBe('blur');
    expect(container.dataset.ytLightBgMode).toBe('blur');

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.style.display).toBe('');

    applyMode('solid', container);
    expect(getMode()).toBe('solid');
    expect(container.dataset.ytLightBgMode).toBe('solid');
    expect(canvas.style.display).toBe('none');
  });

  test('initBlurForPlayer does nothing without video', () => {
    const container = document.createElement('div');
    container.id = 'movie_player';
    document.body.appendChild(container);

    initBlurForPlayer(container);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.dataset.ytLightBgMode).toBeUndefined();
  });

  test('initBlurForPlayer does nothing when mode is solid', () => {
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);
    setMode('solid');

    initBlurForPlayer(container);
    expect(container.querySelector('canvas')).toBeNull();
  });

  test('blur strength is single value aligned with Chrome', () => {
    expect(BLUR_STRENGTH_PX).toBe(40);
  });

  test('isGeckoLayoutEngine returns boolean', () => {
    expect(typeof isGeckoLayoutEngine()).toBe('boolean');
  });

  test('drawBlurFrame skips when readyState is low', () => {
    const ctx = mock2dContext();
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 0, configurable: true });
    const canvas = document.createElement('canvas');

    drawBlurFrame(video, canvas, ctx);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  test('drawBlurFrame draws when video has dimensions', () => {
    const ctx = mock2dContext();
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;

    drawBlurFrame(video, canvas, ctx);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.filter).toBe('none');
  });

  test('drawBlurFrame resets filter when drawImage throws', () => {
    const ctx = mock2dContext();
    ctx.drawImage = vi.fn(() => {
      throw new Error('draw failed');
    });
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;

    expect(() => drawBlurFrame(video, canvas, ctx)).not.toThrow();
    expect(ctx.filter).toBe('none');
  });

  test('normalizeMode maps only solid; otherwise blur', () => {
    expect(normalizeMode('solid')).toBe('solid');
    expect(normalizeMode('blur')).toBe('blur');
    expect(normalizeMode(undefined)).toBe('blur');
    expect(normalizeMode('')).toBe('blur');
    expect(normalizeMode('other')).toBe('blur');
  });

  test('startBlurLoop cancels previous animation frame when restarted', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(99);
    try {
      const container = document.createElement('div');
      const video = document.createElement('video');
      container.appendChild(video);
      document.body.appendChild(container);

      applyMode('blur', container);
      cancel.mockClear();

      startBlurLoop(container);
      expect(cancel).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  describe('isPlayerPagePath', () => {
    test('matches watch and shorts routes only', () => {
      expect(isPlayerPagePath('/watch')).toBe(true);
      expect(isPlayerPagePath('/watch/extra')).toBe(true);
      expect(isPlayerPagePath('/shorts/abc123')).toBe(true);
      expect(isPlayerPagePath('/feed')).toBe(false);
      expect(isPlayerPagePath('/')).toBe(false);
      expect(isPlayerPagePath('/shorts')).toBe(false);
    });
  });

  test('handleResize updates canvas dimensions when blur is active', () => {
    const container = document.createElement('div');
    container.id = 'movie_player';
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 360, configurable: true });

    applyMode('blur', container);
    const canvas = container.querySelector('canvas');
    expect(canvas.width).toBe(640);

    Object.defineProperty(container, 'clientWidth', { value: 1280, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 720, configurable: true });
    handleResize();
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });

  test('resizeCanvas ceils fractional client dimensions', () => {
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientWidth', { value: 800.2, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 450.6, configurable: true });

    createBlurCanvas(container);
    resizeCanvas(container);
    const canvas = container.querySelector('canvas');
    expect(canvas.width).toBe(801);
    expect(canvas.height).toBe(451);
    expect(canvas.style.width).toBe('801px');
    expect(canvas.style.height).toBe('451px');
  });

  test('starts ResizeObserver on container when blur mode applies', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    function MockResizeObserver() {
      this.observe = observe;
      this.disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });

    applyMode('blur', container);

    expect(observe).toHaveBeenCalledWith(container);

    applyMode('solid', container);
    expect(disconnect).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  describe('observePlayer', () => {
    beforeEach(() => {
      vi.stubGlobal('location', { pathname: '/watch' });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mock2dContext());
    });

    test('teardowns when not on a player page', () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('location', { pathname: '/feed' });

      expect(() => observePlayer()).not.toThrow();
    });

    test('initializes blur after SPA-style path change from feed to watch', async () => {
      const loc = { pathname: '/feed' };
      vi.stubGlobal('location', loc);
      document.body.innerHTML = '<div id="movie_player"></div>';
      const player = document.getElementById('movie_player');

      observePlayer();
      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();

      loc.pathname = '/watch';
      player.appendChild(document.createElement('video'));
      observePlayer();

      await Promise.resolve();
      await Promise.resolve();

      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
    });

    test('initializes observer on shorts path when player and video exist', () => {
      vi.stubGlobal('location', { pathname: '/shorts/xyz' });
      const container = document.createElement('div');
      container.id = 'movie_player';
      const video = document.createElement('video');
      container.appendChild(video);
      document.body.appendChild(container);

      observePlayer();

      expect(container.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(container.dataset.ytLightBgMode).toBe('blur');
    });

    test('schedules blur init when video is inserted after player without video', async () => {
      document.body.innerHTML = '<div id="movie_player"></div>';
      const player = document.getElementById('movie_player');

      observePlayer();
      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();

      const video = document.createElement('video');
      player.appendChild(video);

      await Promise.resolve();
      await Promise.resolve();

      const canvas = player.querySelector('#yt-light-bg-blur-canvas');
      expect(canvas).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
    });

    test('does not add blur canvas when mode is solid and video appears later', async () => {
      setMode('solid');
      document.body.innerHTML = '<div id="movie_player"></div>';
      const player = document.getElementById('movie_player');

      observePlayer();
      player.appendChild(document.createElement('video'));
      await Promise.resolve();
      await Promise.resolve();

      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
    });

    test('stops blur init retry after max attempts when video never appears', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('location', { pathname: '/watch' });
      document.body.innerHTML = '<div id="content"><div id="movie_player"></div></div>';
      const player = document.getElementById('movie_player');

      observePlayer();
      await vi.runAllTimersAsync();
      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
      vi.useRealTimers();
    });

    test('retry path creates canvas when video appears after first failed init', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('location', { pathname: '/watch' });
      document.body.innerHTML = '<div id="content"><div id="movie_player"></div></div>';
      const player = document.getElementById('movie_player');

      observePlayer();
      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();

      await vi.advanceTimersByTimeAsync(49);
      player.appendChild(document.createElement('video'));
      await Promise.resolve();
      await Promise.resolve();

      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
      vi.useRealTimers();
    });

    test('retry continues polling when player container does not exist yet', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('location', { pathname: '/watch' });
      document.body.innerHTML = '';

      observePlayer();

      // container も video も存在しない状態でタイマーが動いていること
      await vi.advanceTimersByTimeAsync(49);
      expect(document.querySelector('#yt-light-bg-blur-canvas')).toBeNull();

      // container + video を後から挿入
      const player = document.createElement('div');
      player.id = 'movie_player';
      player.appendChild(document.createElement('video'));
      document.body.appendChild(player);

      await vi.advanceTimersByTimeAsync(51);
      await Promise.resolve();
      await Promise.resolve();

      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
      vi.useRealTimers();
    });

    test('sets blur attribute early on container before canvas is ready', () => {
      document.body.innerHTML = '<div id="movie_player"></div>';
      const player = document.getElementById('movie_player');

      // video が無い状態 (canvas 未生成) でも属性が先行付与される
      observePlayer();

      expect(player.dataset.ytLightBgMode).toBe('blur');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
    });
  });

  describe('initExtension', () => {
    beforeEach(() => {
      resetState();
      vi.stubGlobal('location', { pathname: '/watch' });
      document.body.innerHTML = '<div id="content"><div id="movie_player"></div></div>';
      const player = document.getElementById('movie_player');
      player.appendChild(document.createElement('video'));
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mock2dContext());
    });

    test('runs observePlayer before storage callback (eager init)', async () => {
      const syncGet = vi.fn((_keys) => {
        /* intentionally not calling cb — delayed storage must not block first blur */
      });
      const localGet = vi.fn();
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      await Promise.resolve(); // Allow async loadModeFromStorage to complete
      const player = document.getElementById('movie_player');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(syncGet).toHaveBeenCalled();
    });

    test('applies saved solid mode when storage differs from optimistic blur', async () => {
      const timestamp = Date.now();
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: timestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({});  // local storage is empty
      });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      await Promise.resolve();
      await Promise.resolve();
      const player = document.getElementById('movie_player');
      expect(getMode()).toBe('solid');
      const canvas = player.querySelector('#yt-light-bg-blur-canvas');
      expect(canvas).not.toBeNull();
      expect(canvas.style.display).toBe('none');
      expect(player.dataset.ytLightBgMode).toBe('solid');
    });

    test('treats invalid storage mode as blur', async () => {
      setMode('solid');
      const timestamp = Date.now();
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'not-a-mode', playerBackgroundModeTimestamp: timestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({});  // local storage is empty
      });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      await Promise.resolve();
      await Promise.resolve();
      const player = document.getElementById('movie_player');
      expect(getMode()).toBe('blur');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
    });

    test('RELOAD_BLUR tears down and re-initializes blur', async () => {
      let messageListener;
      const timestamp = Date.now();
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: timestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({});  // local storage is empty
      });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        },
        runtime: {
          onMessage: {
            addListener: vi.fn((listener) => { messageListener = listener; })
          }
        }
      });

      initExtension();
      await Promise.resolve();
      const player = document.getElementById('movie_player');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();

      // Send RELOAD_BLUR message
      messageListener({ type: 'RELOAD_BLUR' });
      await Promise.resolve();
      await Promise.resolve();

      // init load + reconcile microtask + reload load + reconcile microtask
      expect(syncGet).toHaveBeenCalledTimes(4);

      // Canvas should be re-created after reload
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
    });

    test('RELOAD_BLUR removes canvas from DOM via teardown', async () => {
      let messageListener;
      const timestamp = Date.now();
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: timestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({});  // local storage is empty
      });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        },
        runtime: {
          onMessage: {
            addListener: vi.fn((listener) => { messageListener = listener; })
          }
        }
      });

      initExtension();
      await Promise.resolve();
      const player = document.getElementById('movie_player');
      const originalCanvas = player.querySelector('#yt-light-bg-blur-canvas');
      expect(originalCanvas).not.toBeNull();

      // Delay the storage callback to inspect state between teardown and re-init
      syncGet.mockImplementation((_keys, cb) => {
        // At this point teardown has already run, canvas should be removed
        expect(player.querySelector('#yt-light-bg-blur-canvas')).toBeNull();
        cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: timestamp });
      });

      messageListener({ type: 'RELOAD_BLUR' });
      await Promise.resolve();
      await Promise.resolve();

      // After re-init, new canvas should exist
      const newCanvas = player.querySelector('#yt-light-bg-blur-canvas');
      expect(newCanvas).not.toBeNull();
      expect(newCanvas).not.toBe(originalCanvas);
    });
  });

  describe('storage functions', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('saveModeToStorage saves to sync storage and returns true', async () => {
      const syncSet = vi.fn((_data, cb) => { if (cb) cb(); });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: vi.fn(), set: syncSet },
          local: { get: vi.fn(), set: vi.fn() }
        }
      });

      const result = await saveModeToStorage('blur');
      expect(result).toBe(true);
      expect(syncSet).toHaveBeenCalledWith(
        expect.objectContaining({ playerBackgroundMode: 'blur' }),
        expect.any(Function)
      );
    });

    test('saveModeToStorage falls back to local storage on sync failure', async () => {
      const syncSet = vi.fn(() => { throw new Error('sync failed'); });
      const localSet = vi.fn((_data, cb) => { if (cb) cb(); });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: vi.fn(), set: syncSet },
          local: { get: vi.fn(), set: localSet }
        }
      });

      const result = await saveModeToStorage('solid');
      expect(result).toBe(false);
      // local.set is called twice: once at start (no callback), once in catch block (with callback)
      expect(localSet).toHaveBeenCalled();
      // Check that localSet was called with the correct data (at least once)
      const calls = localSet.mock.calls;
      const hasCorrectDataCall = calls.some(call =>
        call[0] && call[0].playerBackgroundMode === 'solid'
      );
      expect(hasCorrectDataCall).toBe(true);
    });

    test('loadModeFromStorage returns sync value when both storages have data and sync is newer', async () => {
      const syncTimestamp = Date.now();
      const localTimestamp = syncTimestamp - 1000;
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: syncTimestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: localTimestamp });
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
      const syncGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: syncTimestamp });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({ playerBackgroundMode: 'solid', playerBackgroundModeTimestamp: localTimestamp });
      });
      const syncSet = vi.fn((_data, cb) => { if (cb) cb(); });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: syncSet },
          local: { get: localGet, set: vi.fn() }
        }
      });

      const mode = await loadModeFromStorage();
      expect(mode).toBe('solid');
      await new Promise((r) => queueMicrotask(r));
      // Should sync the newer local value back to sync storage (after reconcile microtask)
      expect(syncSet).toHaveBeenCalledWith(
        expect.objectContaining({ playerBackgroundMode: 'solid' }),
        expect.any(Function)
      );
    });

    test('reconcileStorageCopies converges from fresh reads (winner by timestamp)', async () => {
      const storedSync = {
        playerBackgroundMode: 'blur',
        playerBackgroundModeTimestamp: 5000
      };
      const storedLocal = {
        playerBackgroundMode: 'solid',
        playerBackgroundModeTimestamp: 2000
      };
      const syncGet = vi.fn((_keys, cb) => {
        cb({ ...storedSync });
      });
      const localGet = vi.fn((_keys, cb) => {
        cb({ ...storedLocal });
      });
      const syncSet = vi.fn((data, cb) => {
        Object.assign(storedSync, data);
        if (cb) cb();
      });
      const localSet = vi.fn((data, cb) => {
        Object.assign(storedLocal, data);
        if (cb) cb();
      });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: syncSet },
          local: { get: localGet, set: localSet }
        },
        runtime: { lastError: undefined }
      });

      reconcileStorageCopies();
      await new Promise((r) => queueMicrotask(r));
      await new Promise((r) => queueMicrotask(r));

      // 勝者は sync のみ更新が必要（local を合わせる）— sync への不要な set は行わない
      expect(syncSet).not.toHaveBeenCalled();
      expect(localSet).toHaveBeenCalledWith(
        expect.objectContaining({
          playerBackgroundMode: 'blur',
          playerBackgroundModeTimestamp: 5000
        }),
        expect.any(Function)
      );
    });

    test('loadModeFromStorage returns default blur when no data exists', async () => {
      const syncGet = vi.fn((_keys, cb) => { cb({}); });
      const localGet = vi.fn((_keys, cb) => { cb({}); });
      vi.stubGlobal('chrome', {
        storage: {
          sync: { get: syncGet, set: vi.fn() },
          local: { get: localGet, set: vi.fn() }
        }
      });

      const mode = await loadModeFromStorage();
      expect(mode).toBe('blur');
    });

    describe('动态绘制间隔功能', () => {
      beforeEach(() => {
        resetState();
      });

      test('detectDevicePerformance returns valid performance level', () => {
        // Mock navigator properties for consistent testing
        const originalHardwareConcurrency = navigator.hardwareConcurrency;
        const originalDeviceMemory = navigator.deviceMemory;

        // Test low performance
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
        expect(detectDevicePerformance()).toBe('low');

        // Test medium performance
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });
        expect(detectDevicePerformance()).toBe('medium');

        // Test high performance
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
        expect(detectDevicePerformance()).toBe('high');

        // Restore original values
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: originalHardwareConcurrency, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: originalDeviceMemory, configurable: true });
      });

      test('updateFPS and getAverageFPS calculate FPS correctly', () => {
        const timestamp1 = 1000;
        const timestamp2 = 1033; // ~30 FPS
        const timestamp3 = 1066; // ~30 FPS

        updateFPS(timestamp1);
        updateFPS(timestamp2);
        updateFPS(timestamp3);

        expect(getAverageFPS()).toBeCloseTo(30, 0);
      });

      test('adjustDrawInterval increases interval when FPS is low', () => {
        setCurrentDrawInterval(2);
        setAdjustmentCooldown(0);

        // 低FPSをシミュレート（高いフレーム時間を追加）
        const lowFpsFrameTimes = [50, 50, 50, 50, 50]; // ~20 FPS
        getFrameTimes().push(...lowFpsFrameTimes);

        adjustDrawInterval();

        expect(getCurrentDrawInterval()).toBe(3);
      });

      test('adjustDrawInterval decreases interval when FPS is high', () => {
        setCurrentDrawInterval(3);
        setAdjustmentCooldown(0);

        // 高FPSをシミュレート（低いフレーム時間を追加）
        const highFpsFrameTimes = [16, 16, 16, 16, 16]; // ~60 FPS
        getFrameTimes().push(...highFpsFrameTimes);

        adjustDrawInterval();

        expect(getCurrentDrawInterval()).toBe(2);
      });

      test('adjustDrawInterval respects cooldown period', () => {
        setCurrentDrawInterval(2);
        setAdjustmentCooldown(100); // まだクールダウン閾値に達していない

        adjustDrawInterval();

        expect(getCurrentDrawInterval()).toBe(2); // 変更されないはず
      });

      test('adjustDrawInterval respects min/max bounds', () => {
        // 最小値のテスト: currentDrawIntervalが1の場合、FPSが高くても1以下にはならない
        setCurrentDrawInterval(1);
        setAdjustmentCooldown(0);

        // 高FPSをシミュレート（低いフレーム時間を追加）
        const highFpsFrameTimes = [16, 16, 16, 16, 16]; // ~60 FPS
        getFrameTimes().push(...highFpsFrameTimes);

        adjustDrawInterval();

        expect(getCurrentDrawInterval()).toBe(1); // 最小値を下回らないはず

        // 最大値のテスト: currentDrawIntervalが4の場合、FPSが低くても4以上にはならない
        setCurrentDrawInterval(4);
        setAdjustmentCooldown(0);
        const lowFpsFrameTimes = [50, 50, 50, 50, 50]; // ~20 FPS
        getFrameTimes().push(...lowFpsFrameTimes);
        adjustDrawInterval();
        expect(getCurrentDrawInterval()).toBe(4); // 最大値を上回らないはず
      });

      test('getCurrentDrawInterval and setCurrentDrawInterval work correctly', () => {
        // 一貫性を保つため、デバイス性能を中（デフォルト）にモック
        const originalHardwareConcurrency = navigator.hardwareConcurrency;
        const originalDeviceMemory = navigator.deviceMemory;
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });

        try {
          // モジュールを再初期化して正しい初期値を取得する必要があるが、
          // 再requireできないため、手動で初期値を設定する
          setCurrentDrawInterval(2); // 中性能のデフォルト値に設定

          expect(getCurrentDrawInterval()).toBe(2);

          setCurrentDrawInterval(4);
          expect(getCurrentDrawInterval()).toBe(4);

          setCurrentDrawInterval(1);
          expect(getCurrentDrawInterval()).toBe(1);
        } finally {
          // 元の値を復元
          Object.defineProperty(navigator, 'hardwareConcurrency', { value: originalHardwareConcurrency, configurable: true });
          Object.defineProperty(navigator, 'deviceMemory', { value: originalDeviceMemory, configurable: true });
        }
      });

      test('frameTimes and adjustmentCooldown state management', () => {
        // フレーム時間と調整クールダウン状態の管理
        expect(getFrameTimes()).toEqual([]);
        expect(getAdjustmentCooldown()).toBe(0);

        setAdjustmentCooldown(50);
        expect(getAdjustmentCooldown()).toBe(50);
      });

      test('resetState resets dynamic drawing interval state', () => {
        // 一貫性を保つため、デバイス性能を中（デフォルト）にモック
        const originalHardwareConcurrency = navigator.hardwareConcurrency;
        const originalDeviceMemory = navigator.deviceMemory;
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });

        try {
          setCurrentDrawInterval(4);
          setAdjustmentCooldown(100);

          resetState();

          expect(getCurrentDrawInterval()).toBe(2);
          expect(getAdjustmentCooldown()).toBe(0);
          expect(getFrameTimes()).toEqual([]);
        } finally {
          // 元の値を復元
          Object.defineProperty(navigator, 'hardwareConcurrency', { value: originalHardwareConcurrency, configurable: true });
          Object.defineProperty(navigator, 'deviceMemory', { value: originalDeviceMemory, configurable: true });
        }
      });
    });
  });
});
