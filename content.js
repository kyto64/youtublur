const STORAGE_KEY = 'playerBackgroundMode';
/** Blur radius (px); same value on Chrome and Firefox (Gecko uses a two-step draw for correct filter). */
const BLUR_STRENGTH_PX = 40;
const DRAW_INTERVAL = 2; // 描画を2フレームに1回にして軽量化

/**
 * True when the page runs on Gecko (Firefox). UA alone is unreliable:
 * privacy.resistFingerprinting can spoof navigator.userAgent as Chrome.
 * @returns {boolean}
 */
function isGeckoLayoutEngine() {
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

const geckoLayout = isGeckoLayoutEngine();

/** Gecko: ctx.filter + drawImage(video) can drop the frame; blur a raster copy instead. */
let geckoVideoSnapCanvas = null;
let geckoVideoSnapCtx = null;

let currentMode = 'blur';
let blurCanvas = null;
let blurCtx = null;
let animationId = null;
let frameCount = 0;
let playerDomObserver = null;
let playerResizeObserver = null;
let youtubeNavHooksInstalled = false;
let documentLifecycleHooksInstalled = false;

const BLUR_INIT_RETRY_INITIAL_MS = 50;
const BLUR_INIT_RETRY_MAX_MS = 2000;
const BLUR_INIT_RETRY_MAX_ATTEMPTS = 25;
let blurInitRetryTimer = null;
let blurInitRetryAttempt = 0;

function clearBlurInitRetryTimer() {
  if (blurInitRetryTimer !== null) {
    clearTimeout(blurInitRetryTimer);
    blurInitRetryTimer = null;
  }
}

function stopBlurInitRetryCompletely() {
  clearBlurInitRetryTimer();
  blurInitRetryAttempt = 0;
}

function scheduleBlurInitRetryIfNeeded() {
  if (currentMode !== 'blur') {
    stopBlurInitRetryCompletely();
    return;
  }
  if (blurCanvas) {
    stopBlurInitRetryCompletely();
    return;
  }
  if (blurInitRetryTimer !== null) return;

  function attemptBlurInit() {
    blurInitRetryTimer = null;
    if (currentMode !== 'blur') {
      stopBlurInitRetryCompletely();
      return;
    }
    const container = getPlayerContainer();
    if (container) {
      initBlurForPlayer(container);
      if (blurCanvas) {
        stopBlurInitRetryCompletely();
        return;
      }
    }
    blurInitRetryAttempt += 1;
    if (blurInitRetryAttempt >= BLUR_INIT_RETRY_MAX_ATTEMPTS) {
      stopBlurInitRetryCompletely();
      return;
    }
    const delay = Math.min(
      BLUR_INIT_RETRY_MAX_MS,
      BLUR_INIT_RETRY_INITIAL_MS * 2 ** (blurInitRetryAttempt - 1)
    );
    blurInitRetryTimer = setTimeout(attemptBlurInit, delay);
  }

  blurInitRetryAttempt = 0;
  const firstDelay = Math.min(
    BLUR_INIT_RETRY_MAX_MS,
    BLUR_INIT_RETRY_INITIAL_MS * 2 ** 0
  );
  blurInitRetryTimer = setTimeout(attemptBlurInit, firstDelay);
}

function normalizeMode(mode) {
  return mode === 'solid' ? 'solid' : 'blur';
}

function isPlayerPagePath(pathname) {
  return /^\/watch(\/|$)/.test(pathname) || /^\/shorts\//.test(pathname);
}

function getPlayerContainer() {
  return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
}

function getVideoElement(container) {
  return container?.querySelector('video');
}

function ensureGeckoVideoSnapCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  if (!geckoVideoSnapCanvas) {
    geckoVideoSnapCanvas = document.createElement('canvas');
    geckoVideoSnapCanvas.id = 'yt-light-bg-blur-gecko-snap';
    geckoVideoSnapCtx = geckoVideoSnapCanvas.getContext('2d');
    if (!geckoVideoSnapCtx) return null;
  }
  if (geckoVideoSnapCanvas.width !== w || geckoVideoSnapCanvas.height !== h) {
    geckoVideoSnapCanvas.width = w;
    geckoVideoSnapCanvas.height = h;
  }
  return geckoVideoSnapCtx;
}

function releaseGeckoVideoSnapCanvas() {
  geckoVideoSnapCanvas = null;
  geckoVideoSnapCtx = null;
}

function createBlurCanvas(container) {
  const existing = container?.querySelector('#yt-light-bg-blur-canvas');
  if (existing) {
    blurCtx = existing.getContext('2d');
    if (blurCtx) {
      blurCanvas = existing;
      return blurCanvas;
    }
    existing.remove();
  }
  if (blurCanvas && !document.contains(blurCanvas)) {
    blurCanvas = null;
    blurCtx = null;
  }

  const video = getVideoElement(container);
  if (!video) return null;

  blurCanvas = document.createElement('canvas');
  blurCanvas.id = 'yt-light-bg-blur-canvas';
  blurCanvas.style.cssText = `
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    z-index: -1;
    pointer-events: none;
  `;

  if (container.style.position !== 'relative' && container.style.position !== 'absolute') {
    container.style.position = 'relative';
  }
  container.insertBefore(blurCanvas, container.firstChild);

  blurCtx = blurCanvas.getContext('2d');
  if (!blurCtx) {
    blurCanvas.remove();
    blurCanvas = null;
    return null;
  }
  return blurCanvas;
}

function drawBlurFrame(video, canvas, ctx) {
  if (!video || !canvas || !ctx || video.readyState < 2) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (vw === 0 || vh === 0) return;

  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let sx, sy, sw, sh;
  if (videoAspect > canvasAspect) {
    sh = vh;
    sw = vh * canvasAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / canvasAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  if (geckoLayout) {
    const snapCtx = ensureGeckoVideoSnapCanvas(cw, ch);
    if (snapCtx) {
      snapCtx.filter = 'none';
      try {
        snapCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      } catch {
        /* same-origin / decode issues as main path */
        return;
      }
      ctx.filter = `blur(${BLUR_STRENGTH_PX}px)`;
      try {
        ctx.drawImage(geckoVideoSnapCanvas, 0, 0);
      } catch {
        /* skip frame */
      } finally {
        ctx.filter = 'none';
      }
      return;
    }
  }

  ctx.filter = `blur(${BLUR_STRENGTH_PX}px)`;
  try {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  } catch {
    /* drawImage can throw (e.g. SecurityError); skip frame */
  } finally {
    ctx.filter = 'none';
  }
}

function resizeCanvas(container) {
  if (!blurCanvas || !container) return;
  const w = Math.max(1, Math.ceil(container.clientWidth));
  const h = Math.max(1, Math.ceil(container.clientHeight));
  blurCanvas.width = w;
  blurCanvas.height = h;
  blurCanvas.style.width = `${w}px`;
  blurCanvas.style.height = `${h}px`;
}

function detachPlayerResizeObserver() {
  if (playerResizeObserver) {
    playerResizeObserver.disconnect();
    playerResizeObserver = null;
  }
}

function attachPlayerResizeObserver(container) {
  if (typeof ResizeObserver === 'undefined' || !container) return;
  detachPlayerResizeObserver();
  playerResizeObserver = new ResizeObserver(() => {
    if (currentMode !== 'blur' || !blurCanvas) return;
    const c = getPlayerContainer();
    if (c) resizeCanvas(c);
  });
  playerResizeObserver.observe(container);
}

function startBlurLoop(container) {
  stopBlurLoop();
  if (!blurCanvas || !blurCtx) return;
  const initialContainer = container || getPlayerContainer();
  if (!initialContainer || !getVideoElement(initialContainer)) return;

  function loop() {
    if (currentMode !== 'blur' || !blurCanvas) return;
    const c = getPlayerContainer();
    const video = c ? getVideoElement(c) : null;
    frameCount++;
    if (video && frameCount % DRAW_INTERVAL === 0) {
      drawBlurFrame(video, blurCanvas, blurCtx);
    }
    animationId = requestAnimationFrame(loop);
  }
  animationId = requestAnimationFrame(loop);
}

function stopBlurLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function showBlurMode(container) {
  const video = getVideoElement(container);
  if (!video) {
    scheduleBlurInitRetryIfNeeded();
    return;
  }

  createBlurCanvas(container);
  if (!blurCanvas) {
    scheduleBlurInitRetryIfNeeded();
    return;
  }

  resizeCanvas(container);
  attachPlayerResizeObserver(container);
  blurCanvas.style.display = '';
  blurCanvas.style.visibility = 'visible';
  container.dataset.ytLightBgMode = 'blur';
  startBlurLoop(container);
}

function hideBlurMode(container) {
  stopBlurInitRetryCompletely();
  detachPlayerResizeObserver();
  stopBlurLoop();
  if (blurCanvas) {
    blurCanvas.style.display = 'none';
    blurCanvas.style.visibility = 'hidden';
  }
  if (container) container.dataset.ytLightBgMode = 'solid';
}

function applyMode(mode, container) {
  const normalized = normalizeMode(mode);
  currentMode = normalized;
  const c = container || getPlayerContainer();
  if (!c) return;

  if (normalized === 'blur') {
    showBlurMode(c);
  } else {
    hideBlurMode(c);
  }
}

function initBlurForPlayer(container) {
  if (currentMode !== 'blur') return;
  const video = getVideoElement(container);
  if (!video) return;

  createBlurCanvas(container);
  if (blurCanvas) {
    stopBlurInitRetryCompletely();
    resizeCanvas(container);
    attachPlayerResizeObserver(container);
    blurCanvas.style.display = '';
    blurCanvas.style.visibility = 'visible';
    container.dataset.ytLightBgMode = 'blur';
    startBlurLoop(container);
  }
}

function teardownPlayerPageBlur() {
  stopBlurInitRetryCompletely();
  detachPlayerResizeObserver();
  if (playerDomObserver) {
    playerDomObserver.disconnect();
    playerDomObserver = null;
  }
  stopBlurLoop();
  blurCanvas = null;
  blurCtx = null;
  frameCount = 0;
  releaseGeckoVideoSnapCanvas();
}

function observePlayer() {
  if (!isPlayerPagePath(location.pathname)) {
    teardownPlayerPageBlur();
    return;
  }

  if (currentMode === 'blur') {
    const earlyContainer = getPlayerContainer();
    if (earlyContainer && !earlyContainer.dataset.ytLightBgMode) {
      earlyContainer.dataset.ytLightBgMode = 'blur';
    }
  }

  function tryInit() {
    if (typeof document === 'undefined') return;
    const c = getPlayerContainer();
    if (c) initBlurForPlayer(c);
    scheduleBlurInitRetryIfNeeded();
  }

  let tryInitCoalesced = false;
  function scheduleTryInit() {
    if (tryInitCoalesced) return;
    tryInitCoalesced = true;
    queueMicrotask(() => {
      tryInitCoalesced = false;
      tryInit();
    });
  }

  if (!playerDomObserver) {
    playerDomObserver = new MutationObserver(() => {
      if (typeof document === 'undefined') return;
      const c = getPlayerContainer();
      if (!c) return;
      if (blurCanvas && !document.contains(blurCanvas)) {
        blurCanvas = null;
        blurCtx = null;
        scheduleTryInit();
        return;
      }
      // 初回はプレイヤーに video がまだ無く init がスキップされることがある。後から video が挿入されても
      // blurCanvas が null のままなら従来の observer は再試行しなかった。
      if (currentMode === 'blur' && !blurCanvas) {
        scheduleTryInit();
      }
    });

    playerDomObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  tryInit();
}

function installDocumentLifecycleHooks() {
  if (documentLifecycleHooksInstalled) return;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  documentLifecycleHooksInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      queueMicrotask(() => observePlayer());
    }
  });

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) {
        queueMicrotask(() => observePlayer());
      }
    });
  }
}

function installYoutubeNavigationHooks() {
  if (youtubeNavHooksInstalled) return;
  youtubeNavHooksInstalled = true;

  const onNav = () => queueMicrotask(() => observePlayer());

  window.addEventListener('popstate', onNav);

  function wrapHistoryMethod(method) {
    const orig = history[method];
    history[method] = function patchedHistory(...args) {
      const ret = orig.apply(this, args);
      onNav();
      return ret;
    };
  }

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');
}

function handleResize() {
  if (currentMode === 'blur' && blurCanvas) {
    const container = getPlayerContainer();
    if (container) resizeCanvas(container);
  }
}

function initExtension() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    installYoutubeNavigationHooks();
    observePlayer();

    chrome.storage.sync.get({ [STORAGE_KEY]: 'blur' }, (items) => {
      const saved = normalizeMode(items[STORAGE_KEY]);
      if (saved !== currentMode) {
        applyMode(saved, getPlayerContainer());
      } else {
        observePlayer();
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'BG_MODE_CHANGED') {
        applyMode(msg.mode, getPlayerContainer());
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', handleResize);
  }
  installDocumentLifecycleHooks();
}

initExtension();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BLUR_STRENGTH_PX,
    isGeckoLayoutEngine,
    getPlayerContainer,
    getVideoElement,
    createBlurCanvas,
    drawBlurFrame,
    resizeCanvas,
    startBlurLoop,
    stopBlurLoop,
    showBlurMode,
    hideBlurMode,
    applyMode,
    initBlurForPlayer,
    observePlayer,
    isPlayerPagePath,
    teardownPlayerPageBlur,
    handleResize,
    initExtension,
    normalizeMode,
    setMode: (m) => { currentMode = m; },
    getMode: () => currentMode,
    resetState: () => {
      currentMode = 'blur';
      stopBlurInitRetryCompletely();
      detachPlayerResizeObserver();
      if (playerDomObserver) {
        playerDomObserver.disconnect();
        playerDomObserver = null;
      }
      blurCanvas = null;
      blurCtx = null;
      stopBlurLoop();
      frameCount = 0;
      releaseGeckoVideoSnapCanvas();
    }
  };
}
