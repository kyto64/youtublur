const STORAGE_KEY = 'playerBackgroundMode';
const BLUR_STRENGTH = 40;
const DRAW_INTERVAL = 2; // 描画を2フレームに1回にして軽量化

let currentMode = 'blur';
let blurCanvas = null;
let blurCtx = null;
let animationId = null;
let frameCount = 0;
let playerDomObserver = null;
let playerResizeObserver = null;
let youtubeNavHooksInstalled = false;

function isPlayerPagePath(pathname) {
  return /^\/watch(\/|$)/.test(pathname) || /^\/shorts\//.test(pathname);
}

function getPlayerContainer() {
  return document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
}

function getVideoElement(container) {
  return container?.querySelector('video');
}

function createBlurCanvas(container) {
  const existing = container?.querySelector('#yt-light-bg-blur-canvas');
  if (existing) {
    blurCanvas = existing;
    blurCtx = blurCanvas.getContext('2d');
    return blurCanvas;
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

  ctx.filter = `blur(${BLUR_STRENGTH}px)`;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.filter = 'none';
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
  const video = getVideoElement(container);
  if (!video || !blurCanvas || !blurCtx) return;

  function loop() {
    if (currentMode !== 'blur' || !blurCanvas) return;
    frameCount++;
    if (frameCount % DRAW_INTERVAL === 0) {
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
  if (!video) return;

  createBlurCanvas(container);
  if (!blurCanvas) return;

  resizeCanvas(container);
  attachPlayerResizeObserver(container);
  blurCanvas.style.display = '';
  blurCanvas.style.visibility = 'visible';
  container.dataset.ytLightBgMode = 'blur';
  startBlurLoop(container);
}

function hideBlurMode(container) {
  detachPlayerResizeObserver();
  stopBlurLoop();
  if (blurCanvas) {
    blurCanvas.style.display = 'none';
    blurCanvas.style.visibility = 'hidden';
  }
  if (container) container.dataset.ytLightBgMode = 'solid';
}

function applyMode(mode, container) {
  currentMode = mode;
  const c = container || getPlayerContainer();
  if (!c) return;

  if (mode === 'blur') {
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
    resizeCanvas(container);
    attachPlayerResizeObserver(container);
    blurCanvas.style.display = '';
    blurCanvas.style.visibility = 'visible';
    container.dataset.ytLightBgMode = 'blur';
    startBlurLoop(container);
  }
}

function teardownPlayerPageBlur() {
  detachPlayerResizeObserver();
  if (playerDomObserver) {
    playerDomObserver.disconnect();
    playerDomObserver = null;
  }
  stopBlurLoop();
  blurCanvas = null;
  blurCtx = null;
  frameCount = 0;
}

function observePlayer() {
  if (!isPlayerPagePath(location.pathname)) {
    teardownPlayerPageBlur();
    return;
  }

  function tryInit() {
    if (typeof document === 'undefined') return;
    const c = getPlayerContainer();
    if (c) initBlurForPlayer(c);
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

    const root = document.querySelector('#content') || document.body;
    playerDomObserver.observe(root, { childList: true, subtree: true });
  }

  tryInit();
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

    chrome.storage.sync.get({ [STORAGE_KEY]: 'blur' }, (items) => {
      currentMode = items[STORAGE_KEY];
      observePlayer();
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'BG_MODE_CHANGED') {
        currentMode = msg.mode;
        applyMode(msg.mode, getPlayerContainer());
      }
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', handleResize);
  }
}

initExtension();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    setMode: (m) => { currentMode = m; },
    getMode: () => currentMode,
    resetState: () => {
      currentMode = 'blur';
      detachPlayerResizeObserver();
      if (playerDomObserver) {
        playerDomObserver.disconnect();
        playerDomObserver = null;
      }
      blurCanvas = null;
      blurCtx = null;
      stopBlurLoop();
      frameCount = 0;
    }
  };
}
