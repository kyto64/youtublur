import { vi } from 'vitest';
const {
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
  handleResize,
  setMode
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
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 640,
      height: 360,
      top: 0,
      left: 0,
      right: 640,
      bottom: 360,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    applyMode('blur', container);
    const canvas = container.querySelector('canvas');
    expect(canvas.width).toBe(640);

    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      width: 1280,
      height: 720,
      top: 0,
      left: 0,
      right: 1280,
      bottom: 720,
      x: 0,
      y: 0,
      toJSON: () => {}
    });
    handleResize();
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
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
  });
});
