const STORAGE_KEY = 'playerBackgroundMode';
/** Blur radius (px); same value on Chrome and Firefox (Gecko uses a two-step draw for correct filter). */
const BLUR_STRENGTH_PX = 40;

/**
 * Storage key for tracking sync timestamp to determine the latest value
 */
const STORAGE_TIMESTAMP_KEY = 'playerBackgroundModeTimestamp';

/**
 * Save mode to storage with fallback from sync to local
 * @param {string} mode - 'blur' or 'solid'
 * @returns {Promise<boolean>} - true if saved to sync, false if saved to local
 */
function saveModeToStorage(mode) {
  const timestamp = Date.now();
  const data = { [STORAGE_KEY]: mode, [STORAGE_TIMESTAMP_KEY]: timestamp };

  // Always update local storage to ensure a reliable fallback is available
  chrome.storage.local.set(data);

  return new Promise((resolve) => {
    try {
      chrome.storage.sync.set(data, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) {
          console.warn('Sync storage failed:', lastError);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    } catch (error) {
      console.warn('Sync storage failed:', error);
      resolve(false);
    }
  });
}

/**
 * Load mode from storage with fallback and latest value determination
 * @returns {Promise<string>} - 'blur' or 'solid'
 */
function loadModeFromStorage() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (syncResult) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          syncResult = {};
        }
        chrome.storage.local.get([STORAGE_KEY, STORAGE_TIMESTAMP_KEY], (localResult) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            localResult = {};
          }

          const syncMode = syncResult[STORAGE_KEY];
          const localMode = localResult[STORAGE_KEY];
          const syncTimestamp = syncResult[STORAGE_TIMESTAMP_KEY] || 0;
          const localTimestamp = localResult[STORAGE_TIMESTAMP_KEY] || 0;

          if (syncMode !== undefined && localMode !== undefined) {
            if (syncTimestamp >= localTimestamp) {
              resolve(syncMode);
              // Sync local in background
              chrome.storage.local.set({
                [STORAGE_KEY]: syncMode,
                [STORAGE_TIMESTAMP_KEY]: syncTimestamp
              });
            } else {
              // Local is newer, resolve immediately and sync back to sync storage in background
              resolve(localMode);
              chrome.storage.sync.set({
                [STORAGE_KEY]: localMode,
                [STORAGE_TIMESTAMP_KEY]: localTimestamp
              }, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  console.warn('Failed to sync local value back to sync storage:', chrome.runtime.lastError);
                }
              });
            }
          } else if (syncMode !== undefined) {
            resolve(syncMode);
            // Sync to local in background
            chrome.storage.local.set({
              [STORAGE_KEY]: syncMode,
              [STORAGE_TIMESTAMP_KEY]: syncTimestamp
            });
          } else if (localMode !== undefined) {
            resolve(localMode);
            // Sync to sync in background
            chrome.storage.sync.set({
              [STORAGE_KEY]: localMode,
              [STORAGE_TIMESTAMP_KEY]: localTimestamp
            }, () => {
              if (chrome.runtime && chrome.runtime.lastError) {
                console.warn('Failed to sync local value to sync storage:', chrome.runtime.lastError);
              }
            });
          } else {
            resolve('blur');
          }
        });
      });
    } catch (error) {
      console.error('Failed to load mode from storage:', error);
      resolve('blur');
    }
  });
}

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
let frameTimes = [];
const FPS_SAMPLE_SIZE = 60;
const FPS_LOW_THRESHOLD = 30;
const FPS_HIGH_THRESHOLD = 55;
let adjustmentCooldown = 0;
const ADJUSTMENT_COOLDOWN_FRAMES = 300;

function updateFPS(timestamp) {
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
        // RGB値から明るさを判定
        const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1], 10);
          const g = parseInt(rgbMatch[2], 10);
          const b = parseInt(rgbMatch[3], 10);
          // 明るさを計算（0-255）
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 128) {
            return 'dark';
          } else {
            return 'light';
          }
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
  return /^\/watch(\/|$)/.test(pathname) || pathname.startsWith('/shorts/');
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

  // FPS監視と描画間隔調整の初期化
  lastFrameTime = 0;
  frameTimes = [];
  adjustmentCooldown = 0;

  function loop(timestamp) {
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
  if (container) {
    container.dataset.ytLightBgMode = 'solid';
    // テーマに応じた背景色を動的に設定
    const bgColor = getSolidModeBackgroundColor();
    container.style.backgroundColor = bgColor;
  }
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
  if (blurCanvas) {
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
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const themeObserver = new MutationObserver(() => {
      if (currentMode === 'solid') {
        const container = getPlayerContainer();
        if (container) {
          const bgColor = getSolidModeBackgroundColor();
          container.style.backgroundColor = bgColor;
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
    // 追加：テスト用の動的描画間隔関連関数
    detectDevicePerformance,
    updateFPS,
    getAverageFPS,
    adjustDrawInterval,
    getCurrentDrawInterval: () => currentDrawInterval,
    setCurrentDrawInterval: (val) => { currentDrawInterval = val; },
    getFrameTimes: () => frameTimes,
    getAdjustmentCooldown: () => adjustmentCooldown,
    setAdjustmentCooldown: (val) => { adjustmentCooldown = val; }
  };
}
