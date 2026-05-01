/** Blur radius (px); same value on Chrome and Firefox (Gecko uses a two-step draw for correct filter). */
const BLUR_STRENGTH_PX = 40;

// デバイス性能検出と動的な描画間隔の設定
function detectDevicePerformance() {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  let score = 0;
  if (cores <= 2) score += 1;
  else if (cores <= 4) score += 2;
  else score += 3;

  if (memory <= 2) score += 1;
  else if (memory <= 4) score += 2;
  else score += 3;

  if (score <= 2) return 'low';
  if (score <= 4) return 'medium';
  return 'high';
}

let currentDrawInterval = 2; // デフォルト値
const devicePerformance = detectDevicePerformance();
if (devicePerformance === 'low') {
  currentDrawInterval = 3;
} else if (devicePerformance === 'high') {
  currentDrawInterval = 1;
}

// FPS監視用変数
let lastFrameTime = 0;
let frameTimes: number[] = [];
const FPS_SAMPLE_SIZE = 60;
const FPS_LOW_THRESHOLD = 30;
const FPS_HIGH_THRESHOLD = 55;
let adjustmentCooldown = 0;
const ADJUSTMENT_COOLDOWN_FRAMES = 300;

function updateFPS(timestamp: number) {
  if (lastFrameTime > 0) {
    const delta = timestamp - lastFrameTime;
    frameTimes.push(delta);
    if (frameTimes.length > FPS_SAMPLE_SIZE) {
      frameTimes.shift();
    }
  }
  lastFrameTime = timestamp;
}

function getAverageFPS() {
  if (frameTimes.length === 0) return 60;
  const avgDelta = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  return 1000 / avgDelta;
}

function adjustDrawInterval() {
  if (adjustmentCooldown > 0) {
    adjustmentCooldown--;
    return;
  }

  const fps = getAverageFPS();

  if (fps < FPS_LOW_THRESHOLD && currentDrawInterval < 4) {
    currentDrawInterval = Math.min(4, currentDrawInterval + 1);
    frameTimes = [];
  } else if (fps > FPS_HIGH_THRESHOLD && currentDrawInterval > 1) {
    currentDrawInterval = Math.max(1, currentDrawInterval - 1);
    frameTimes = [];
  }

  adjustmentCooldown = ADJUSTMENT_COOLDOWN_FRAMES;
}

/**
 * ページがGeckoレイアウトエンジン（Firefox）で動作しているか判定する。
 * ユーザーエージェント単体では信頼できないため、CSS.supportsを使用する。
 * privacy.resistFingerprintingが有効な場合、UAはChromeと偽装される可能性がある。
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

/**
 * YouTubeの現在のテーマ（ダーク/ライト）を検出する。
 * 複数の方法を組み合わせて信頼性を高める。
 * @returns {'dark'|'light'}
 */
function detectYouTubeTheme() {
  try {
    // 方法1: html要素のdark属性をチェック（YouTubeの標準的な方法）
    const htmlElement = document.documentElement;
    if (htmlElement.hasAttribute('dark') || htmlElement.getAttribute('theme') === 'dark') {
      return 'dark';
    }

    // 方法2: CSS変数から判定（YouTubeのテーマカラーをチェック）
    if (typeof getComputedStyle !== 'undefined') {
      const style = getComputedStyle(htmlElement);
      const bgColor = style.getPropertyValue('--yt-spec-base-background').trim();
      if (bgColor) {
        // RGB値から明るさを判定（より堅牢なパターン）
        const rgbMatch = bgColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 10);
          const g = parseInt(rgbMatch[2], 10);
          const b = parseInt(rgbMatch[3], 10);
          // 値の範囲チェック
          if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            // 明るさを計算（0-255）
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            if (brightness < 128) {
              return 'dark';
            } else {
              return 'light';
            }
          }
        }
        // RGB以外の形式（hex, hsl, 名前付き色など）の場合はフォールバック
        // ここでは明るい色と暗い色の一般的な値で判定
        const lowerBgColor = bgColor.toLowerCase();
        if (lowerBgColor.includes('black') || lowerBgColor.includes('dark') || lowerBgColor.includes('#000') || lowerBgColor.includes('#111')) {
          return 'dark';
        }
        if (lowerBgColor.includes('white') || lowerBgColor.includes('light') || lowerBgColor.includes('#fff') || lowerBgColor.includes('#f')) {
          return 'light';
        }
      }
    }

    // 方法3: prefers-color-schemeメディアクエリ（フォールバック）
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }

    // デフォルトはライトテーマ
    return 'light';
  } catch (error) {
    console.warn('Failed to detect YouTube theme:', error);
    return 'light';
  }
}

/**
 * テーマに応じた単色モードの背景色を取得する。
 * @returns {string} CSS色値
 */
function getSolidModeBackgroundColor() {
  const theme = detectYouTubeTheme();
  if (theme === 'dark') {
    // YouTubeのダークテーマ背景色に近い色
    return '#181818';
  }
  // ライトテーマ時の薄いグレー
  return '#f1f1f1';
}

const geckoLayout = isGeckoLayoutEngine();

/** Gecko環境: ctx.filter + drawImage(video) でフレームが落ちる場合があるため、ラスタライズしたコピーをぼかす */
let geckoVideoSnapCanvas: HTMLCanvasElement | null = null;
let geckoVideoSnapCtx: CanvasRenderingContext2D | null = null;

let currentMode = 'blur';
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let frameCount = 0;
let playerDomObserver: MutationObserver | null = null;
let playerResizeObserver: ResizeObserver | null = null;
let youtubeNavHooksInstalled = false;
let documentLifecycleHooksInstalled = false;
let themeObserver: MutationObserver | null = null;

const BLUR_INIT_RETRY_INITIAL_MS = 50;
const BLUR_INIT_RETRY_MAX_MS = 2000;
const BLUR_INIT_RETRY_MAX_ATTEMPTS = 25;
let blurInitRetryTimer: ReturnType<typeof setTimeout> | null = null;
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

function normalizeMode(mode: string): 'blur' | 'solid' {
  return mode === 'solid' ? 'solid' : 'blur';
}

function isPlayerPagePath(pathname: string) {
  return /^\/watch(\/|$)/.test(pathname) || pathname.startsWith('/shorts/');
}

function getPlayerContainer(): HTMLElement | null {
  return (document.querySelector('#movie_player')
    || document.querySelector('.html5-video-player')) as HTMLElement | null;
}

function getVideoElement(container: Element | null | undefined) {
  return container?.querySelector('video') as HTMLVideoElement | null | undefined;
}

function ensureGeckoVideoSnapCanvas(w: number, h: number) {
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
  // Gecko (Firefox) は canvas をガベージコレクトするまで内部のピクセルバッファを保持し続けるため、
  // 参照を切る前にサイズを 0 にして backing store を即時解放させる。
  if (geckoVideoSnapCanvas) {
    try {
      geckoVideoSnapCanvas.width = 0;
      geckoVideoSnapCanvas.height = 0;
    } catch { /* noop */ }
  }
  geckoVideoSnapCanvas = null;
  geckoVideoSnapCtx = null;
}

function createBlurCanvas(container: HTMLElement | null | undefined) {
  if (!container) return null;
  const existing = container.querySelector('#yt-light-bg-blur-canvas') as HTMLCanvasElement | null;
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

function drawBlurFrame(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null) {
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
        if (geckoVideoSnapCanvas) ctx.drawImage(geckoVideoSnapCanvas, 0, 0);
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

function resizeCanvas(container: HTMLElement | null | undefined) {
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

function attachPlayerResizeObserver(container: Element | null | undefined) {
  if (typeof ResizeObserver === 'undefined' || !container) return;
  detachPlayerResizeObserver();
  playerResizeObserver = new ResizeObserver(() => {
    if (currentMode !== 'blur' || !blurCanvas) return;
    const c = getPlayerContainer();
    if (c) resizeCanvas(c);
  });
  playerResizeObserver.observe(container);
}

function startBlurLoop(container: HTMLElement | null | undefined) {
  stopBlurLoop();
  if (!blurCanvas || !blurCtx) return;
  const initialContainer = container || getPlayerContainer();
  if (!initialContainer || !getVideoElement(initialContainer)) return;

  // FPS監視と描画間隔調整の初期化
  lastFrameTime = 0;
  frameTimes = [];
  adjustmentCooldown = 0;

  function loop(timestamp: number) {
    if (currentMode !== 'blur' || !blurCanvas) return;
    const c = getPlayerContainer();
    const video = c ? getVideoElement(c) : null;
    frameCount++;

    updateFPS(timestamp);

    if (video && frameCount % currentDrawInterval === 0) {
      drawBlurFrame(video, blurCanvas, blurCtx);
    }

    adjustDrawInterval();
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

function showBlurMode(container: HTMLElement | null | undefined) {
  if (!container) return;
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

function hideBlurMode(container: HTMLElement | null | undefined) {
  stopBlurInitRetryCompletely();
  detachPlayerResizeObserver();
  stopBlurLoop();
  // Gecko 環境では描画ループが停止した時点で snap canvas は不要になるため即解放する。
  releaseGeckoVideoSnapCanvas();
  if (blurCanvas) {
    blurCanvas.style.display = 'none';
    blurCanvas.style.visibility = 'hidden';
  }
  if (container) {
    container.dataset.ytLightBgMode = 'solid';
    // !importantを指定してCSSの優先度を確保
    container.style.setProperty('background-color', getSolidModeBackgroundColor(), 'important');
  }
}

function applyMode(mode: string, container?: HTMLElement | null) {
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

function initBlurForPlayer(container: HTMLElement | null | undefined) {
  if (currentMode !== 'blur') return;
  if (!container) return;
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
  if (blurCanvas) {
    try {
      blurCanvas.width = 0;
      blurCanvas.height = 0;
    } catch { /* noop */ }
    blurCanvas.remove();
  }
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
    // Firefox の bfcache 退避時にアイドル状態のリソースを解放してメモリリークを防ぐ。
    // ただしページ自体はまだ生存している可能性があるため blurCanvas は残し、描画ループと
    // Gecko 専用の snap canvas のみを解放する。pageshow 復帰時に observePlayer が再開する。
    window.addEventListener('pagehide', () => {
      stopBlurLoop();
      releaseGeckoVideoSnapCanvas();
    });
  }
}

function installYoutubeNavigationHooks() {
  if (youtubeNavHooksInstalled) return;
  youtubeNavHooksInstalled = true;

  const onNav = () => queueMicrotask(() => observePlayer());

  window.addEventListener('popstate', onNav);

  function wrapHistoryMethod(method: 'pushState' | 'replaceState') {
    const orig = history[method];
    history[method] = function patchedHistory(...args: Parameters<typeof orig>) {
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

    // Load mode from storage with fallback support
    loadModeFromStorage().then((saved) => {
      const normalized = normalizeMode(saved);
      if (normalized !== currentMode) {
        applyMode(normalized, getPlayerContainer());
      } else {
        // observePlayer is already called above; no need to call again
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'BG_MODE_CHANGED') {
        applyMode(msg.mode, getPlayerContainer());
      } else if (msg.type === 'RELOAD_BLUR') {
        teardownPlayerPageBlur();
        loadModeFromStorage().then((saved) => {
          const normalized = normalizeMode(saved);
          applyMode(normalized);
          observePlayer();
        });
      }
    });
  }

  // テーマ変更を監視して単色モードの背景色を動的に更新
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && !themeObserver) {
    themeObserver = new MutationObserver(() => {
      if (currentMode === 'solid') {
        const container = getPlayerContainer();
        if (container) {
          const bgColor = getSolidModeBackgroundColor();
          container.style.setProperty('background-color', bgColor, 'important');
        }
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark', 'theme']
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
    detectYouTubeTheme,
    getSolidModeBackgroundColor,
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
    setMode: (m: string) => { currentMode = m; },
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
      // 動的描画間隔関連の状態をリセット - デバイス性能を再検出
      const devicePerformance = detectDevicePerformance();
      if (devicePerformance === 'low') {
        currentDrawInterval = 3;
      } else if (devicePerformance === 'high') {
        currentDrawInterval = 1;
      } else {
        currentDrawInterval = 2;
      }
      lastFrameTime = 0;
      frameTimes = [];
      adjustmentCooldown = 0;
    },
    saveModeToStorage,
    loadModeFromStorage,
    reconcileStorageCopies,
    // 追加：テスト用の動的描画間隔関連関数
    detectDevicePerformance,
    updateFPS,
    getAverageFPS,
    adjustDrawInterval,
    getCurrentDrawInterval: () => currentDrawInterval,
    setCurrentDrawInterval: (val: number) => { currentDrawInterval = val; },
    getFrameTimes: () => frameTimes,
    getAdjustmentCooldown: () => adjustmentCooldown,
    setAdjustmentCooldown: (val: number) => { adjustmentCooldown = val; }
  };
}
