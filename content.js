const STORAGE_KEY = 'playerBackgroundMode';
const BLUR_STRENGTH = 40;
const DRAW_INTERVAL = 2; // 描画を2フレームに1回にして軽量化

let currentMode = 'solid';
let blurCanvas = null;
let blurCtx = null;
let animationId = null;
let frameCount = 0;

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

  blurCanvas = document.createElement('canvas');
  blurCanvas.id = 'yt-light-bg-blur-canvas';
  blurCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  `;

  const video = getVideoElement(container);
  if (!video) return null;

  if (container.style.position !== 'relative' && container.style.position !== 'absolute') {
    container.style.position = 'relative';
  }
  container.insertBefore(blurCanvas, container.firstChild);

  blurCtx = blurCanvas.getContext('2d');
  return blurCanvas;
}

const FALLBACK_BG = { r: 241, g: 241, b: 241, a: 1 };

function parseCssColorToRgba(input) {
  if (!input || typeof input !== 'string') return { ...FALLBACK_BG };
  const s = input.trim();

  const rgbMatch = s.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
  );
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1], 10));
    const g = Math.min(255, parseInt(rgbMatch[2], 10));
    const b = Math.min(255, parseInt(rgbMatch[3], 10));
    const a =
      rgbMatch[4] !== undefined
        ? Math.min(1, Math.max(0, parseFloat(rgbMatch[4])))
        : 1;
    return { r, g, b, a };
  }

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (![r, g, b].some(Number.isNaN)) return { r, g, b, a: 1 };
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (![r, g, b].some(Number.isNaN)) return { r, g, b, a: 1 };
    }
  }

  return { ...FALLBACK_BG };
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

  const bgColor = getComputedStyle(document.body).backgroundColor || '#f1f1f1';
  const { r, g, b, a } = parseCssColorToRgba(bgColor);

  // Screen blend: lighten near-black letterbox pixels toward page background without
  // painting over the whole frame (source-over would replace the blurred video).
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  ctx.fillRect(0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
}

function resizeCanvas(container) {
  if (!blurCanvas || !container) return;
  const rect = container.getBoundingClientRect();
  blurCanvas.width = rect.width;
  blurCanvas.height = rect.height;
  blurCanvas.style.width = rect.width + 'px';
  blurCanvas.style.height = rect.height + 'px';
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
  blurCanvas.style.display = '';
  blurCanvas.style.visibility = 'visible';
  container.dataset.ytLightBgMode = 'blur';
  startBlurLoop(container);
}

function hideBlurMode(container) {
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
    blurCanvas.style.display = '';
    blurCanvas.style.visibility = 'visible';
    container.dataset.ytLightBgMode = 'blur';
    startBlurLoop(container);
  }
}

function observePlayer() {
  if (!/^\/watch/.test(location.pathname)) return;

  function tryInit() {
    const c = getPlayerContainer();
    if (c) initBlurForPlayer(c);
  }

  tryInit();

  const observer = new MutationObserver(() => {
    const c = getPlayerContainer();
    if (!c) return;
    if (blurCanvas && !document.contains(blurCanvas)) {
      blurCanvas = null;
      blurCtx = null;
      tryInit();
    }
  });

  const root = document.querySelector('#content') || document.body;
  observer.observe(root, { childList: true, subtree: true });
}

function handleResize() {
  if (currentMode === 'blur' && blurCanvas) {
    const container = getPlayerContainer();
    if (container) resizeCanvas(container);
  }
}

function initExtension() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get({ [STORAGE_KEY]: 'solid' }, (items) => {
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
    parseCssColorToRgba,
    drawBlurFrame,
    resizeCanvas,
    startBlurLoop,
    stopBlurLoop,
    showBlurMode,
    hideBlurMode,
    applyMode,
    initBlurForPlayer,
    observePlayer,
    handleResize,
    initExtension,
    setMode: (m) => { currentMode = m; },
    getMode: () => currentMode,
    resetState: () => {
      currentMode = 'solid';
      blurCanvas = null;
      blurCtx = null;
      stopBlurLoop();
      frameCount = 0;
    }
  };
}
