import { vi } from 'vitest';
const {
  BLUR_STRENGTH_PX,
  isGeckoLayoutEngine,
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
  normalizeMode
} = require('./content.js');

function mock2dContext() {
  return {
    filter: '',
    drawImage: vi.fn()
  };
}

describe('content.js', () => {
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
      // #content が無い場合は document.body を監視する（本番と同じ分岐）。JSDOM では body 監視の方が MO が安定する。
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

    test('runs observePlayer before storage callback (eager init)', () => {
      const get = vi.fn((_defaults, _cb) => {
        /* intentionally not calling _cb — delayed storage must not block first blur */
      });
      vi.stubGlobal('chrome', {
        storage: { sync: { get } },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      const player = document.getElementById('movie_player');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(get).toHaveBeenCalled();
    });

    test('applies saved solid mode when storage differs from optimistic blur', () => {
      const get = vi.fn((_defaults, cb) => {
        cb({ playerBackgroundMode: 'solid' });
      });
      vi.stubGlobal('chrome', {
        storage: { sync: { get } },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      const player = document.getElementById('movie_player');
      expect(getMode()).toBe('solid');
      const canvas = player.querySelector('#yt-light-bg-blur-canvas');
      expect(canvas).not.toBeNull();
      expect(canvas.style.display).toBe('none');
      expect(player.dataset.ytLightBgMode).toBe('solid');
    });

    test('treats invalid storage mode as blur', () => {
      setMode('solid');
      const get = vi.fn((_defaults, cb) => {
        cb({ playerBackgroundMode: 'not-a-mode' });
      });
      vi.stubGlobal('chrome', {
        storage: { sync: { get } },
        runtime: { onMessage: { addListener: vi.fn() } }
      });

      initExtension();
      const player = document.getElementById('movie_player');
      expect(getMode()).toBe('blur');
      expect(player.querySelector('#yt-light-bg-blur-canvas')).not.toBeNull();
      expect(player.dataset.ytLightBgMode).toBe('blur');
    });
  });
});
