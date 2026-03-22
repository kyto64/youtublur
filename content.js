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

  // Fill remaining areas with background color to prevent black bars from showing
  const bgColor = getComputedStyle(document.body).backgroundColor || '#f1f1f1';
  const bgR = parseInt(bgColor.slice(1, 3), 16) || 241;
  const bgG = parseInt(bgColor.slice(3, 5), 16) || 241;
  const bgA = bgColor.startsWith('rgba') ? parseFloat(bgColor.split(',')[3]) : 1;

  // Draw background color for areas outside the video frame (letterbox/pillarbox areas)
  ctx.fillStyle = `rgba(${bgR}, ${bgG}, 0, ${bgA})`;
  ctx.fillRect(0, 0, cw, ch);
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
