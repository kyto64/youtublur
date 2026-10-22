/** Default blur radius (px). Stored values override this; unset storage keeps 40 so existing users see no change. */
const BLUR_STRENGTH_PX = 40;
let activeBlurStrengthPx = BLUR_STRENGTH_PX;
/**
 * Local slider command. Storage writes stamped before this time are echoes of an
 * older drag and are ignored. A newer timestamp (another tab) still applies.
 */
let commandedBlurAt: number | null = null;
let commandedBlurTimer: ReturnType<typeof setTimeout> | null = null;
let blurCommandGeneration = 0;
let blurStrengthStorageListenerInstalled = false;

// デバイス性能検出と動的な描画間隔の設定
function detectDevicePerformance(): 'low' | 'medium' | 'high' {
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

function getInitialDrawInterval(): number {
  const perf = detectDevicePerformance();
  if (perf === 'low') return 3;
  if (perf === 'high') return 1;
  return 2;
}

let currentDrawInterval = getInitialDrawInterval();

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

let currentMode: BackgroundMode = 'blur';
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;

function stampActiveBlurStrength() {
  if (!blurCanvas) return;
  blurCanvas.dataset.ytBlurStrength = String(activeBlurStrengthPx);
}

function setActiveBlurStrengthPx(px: number) {
  activeBlurStrengthPx = clampBlurStrengthPx(px);
  stampActiveBlurStrength();
}

/** Drop a storage read that started before a newer local slider command. */
function applyLoadedBlurStrength(px: number, generation: number) {
  if (generation !== blurCommandGeneration) return;
  setActiveBlurStrengthPx(px);
}

function clearCommandedBlurStrength() {
  blurCommandGeneration += 1;
  commandedBlurAt = null;
  if (commandedBlurTimer !== null) {
    clearTimeout(commandedBlurTimer);
    commandedBlurTimer = null;
  }
}

function rememberCommandedBlurStrength() {
  const generation = ++blurCommandGeneration;
  commandedBlurAt = Date.now();
  if (commandedBlurTimer !== null) clearTimeout(commandedBlurTimer);
  // Debounced saves can echo an older radius. After 2s, re-read and apply only
  // a write stamped at or after this command (another tab, or our own save).
  commandedBlurTimer = setTimeout(() => {
    if (generation !== blurCommandGeneration) return;
    commandedBlurTimer = null;
    const commandedAt = commandedBlurAt;
    loadBlurStrengthRecordFromStorage()
      .then((record) => {
        if (generation !== blurCommandGeneration) return;
        commandedBlurAt = null;
        if (commandedAt !== null && record.timestamp < commandedAt) return;
        setActiveBlurStrengthPx(record.px);
      })
      .catch((error) => {
        if (generation === blurCommandGeneration) commandedBlurAt = null;
        console.warn('[youtublur] failed to refresh blur strength after slider command:', error);
      });
  }, 2000);
}

function applyStoredBlurStrength(px: number, storedAt: number) {
  if (commandedBlurAt !== null && storedAt < commandedBlurAt) return;
  clearCommandedBlurStrength();
  setActiveBlurStrengthPx(px);
}

function installBlurStrengthStorageListener() {
  if (blurStrengthStorageListenerInstalled) return;
  const onChanged = chrome.storage.onChanged;
  if (!onChanged || typeof onChanged.addListener !== 'function') return;
  blurStrengthStorageListenerInstalled = true;
  onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    if (changes[STORAGE_BLUR_KEY]) {
      // Re-read both areas so a late echo of an older write cannot clobber a newer radius.
      loadBlurStrengthRecordFromStorage()
        .then((record) => applyStoredBlurStrength(record.px, record.timestamp))
        .catch((error) => {
          console.warn('[youtublur] failed to apply stored blur strength:', error);
        });
    }
    if (changes[STORAGE_SOLID_COLOR_KEY]) {
      loadSolidColorRecordFromStorage()
        .then((record) => applyStoredSolidColor(record.color, record.timestamp))
        .catch((error) => {
          console.warn('[youtublur] failed to apply stored solid color:', error);
        });
    }
  });
}

/** null: no explicit color yet, so the theme-based fill stays (existing users see no change). */
let activeSolidColor: string | null = null;
let marginSolidHost: HTMLElement | null = null;
let marginSolidPrev: { value: string; priority: string } | null = null;
let commandedSolidAt: number | null = null;
let commandedSolidTimer: ReturnType<typeof setTimeout> | null = null;
let solidCommandGeneration = 0;

function effectiveSolidCssColor(): string {
  return sanitizeSolidColorForCss(activeSolidColor ?? getSolidModeBackgroundColor());
}

/** 単色の保存色はプレイヤーが現れてから塗る。ホーム初期化のあと SPA で遅れて届く。 */
function solidBackgroundNeedsPaint(container: HTMLElement | null | undefined): boolean {
  if (currentMode !== 'solid' || !container) return false;
  return container.dataset.ytLightBgMode !== 'solid'
    || container.dataset.ytSolidColor !== effectiveSolidCssColor();
}

function paintSolidBackground(container: HTMLElement) {
  const color = effectiveSolidCssColor();
  container.style.setProperty('background-color', color, 'important');
  container.dataset.ytSolidColor = color;
  const host = getMarginHost(container);
  if (!host) {
    restoreMarginSolidHost();
    return;
  }
  if (marginSolidHost !== host) {
    restoreMarginSolidHost();
    marginSolidHost = host;
    marginSolidPrev = {
      value: host.style.getPropertyValue('background-color'),
      priority: host.style.getPropertyPriority('background-color'),
    };
  }
  host.style.setProperty('background-color', color, 'important');
}

/** 単色で塗った余白 host の元の背景指定を戻す（host の切り替え・不成立・teardown 時）。 */
function restoreMarginSolidHost() {
  const host = marginSolidHost;
  const prev = marginSolidPrev;
  marginSolidHost = null;
  marginSolidPrev = null;
  if (!host || !prev) return;
  if (prev.value) host.style.setProperty('background-color', prev.value, prev.priority);
  else host.style.removeProperty('background-color');
}

function setActiveSolidColor(color: string | null) {
  activeSolidColor = color === null ? null : normalizeSolidColor(color);
  if (currentMode !== 'solid') return;
  const container = getPlayerContainer();
  if (container) paintSolidBackground(container);
}

function applyLoadedSolidColor(color: string | null, generation: number) {
  if (generation !== solidCommandGeneration) return;
  setActiveSolidColor(color);
}

function clearCommandedSolidColor() {
  solidCommandGeneration += 1;
  commandedSolidAt = null;
  if (commandedSolidTimer !== null) {
    clearTimeout(commandedSolidTimer);
    commandedSolidTimer = null;
  }
}

function rememberCommandedSolidColor() {
  const generation = ++solidCommandGeneration;
  commandedSolidAt = Date.now();
  if (commandedSolidTimer !== null) clearTimeout(commandedSolidTimer);
  // Debounced saves can echo an older color. After 2s, apply only a write stamped
  // at or after this command (another tab, or our own save).
  commandedSolidTimer = setTimeout(() => {
    if (generation !== solidCommandGeneration) return;
    commandedSolidTimer = null;
    const commandedAt = commandedSolidAt;
    loadSolidColorRecordFromStorage()
      .then((record) => {
        if (generation !== solidCommandGeneration) return;
        commandedSolidAt = null;
        if (commandedAt !== null && record.timestamp < commandedAt) return;
        setActiveSolidColor(record.color);
      })
      .catch((error) => {
        if (generation === solidCommandGeneration) commandedSolidAt = null;
        console.warn('[youtublur] failed to refresh solid color after picker command:', error);
      });
  }, 2000);
}

function applyStoredSolidColor(color: string | null, storedAt: number) {
  if (commandedSolidAt !== null && storedAt < commandedSolidAt) return;
  clearCommandedSolidColor();
  setActiveSolidColor(color);
}

function applySolidColorMessage(raw: unknown) {
  const color = normalizeSolidColor(raw);
  if (!color) return;
  rememberCommandedSolidColor();
  setActiveSolidColor(color);
}

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
let blurInitRetryExhausted = false;

function clearBlurInitRetryTimer() {
  if (blurInitRetryTimer !== null) {
    clearTimeout(blurInitRetryTimer);
    blurInitRetryTimer = null;
  }
}

function stopBlurInitRetryCompletely() {
  clearBlurInitRetryTimer();
  blurInitRetryAttempt = 0;
  blurInitRetryExhausted = false;
}

function restartBlurInitRetryCycle() {
  clearBlurInitRetryTimer();
  blurInitRetryAttempt = 0;
  blurInitRetryExhausted = false;
}

function scheduleBlurInitRetryIfNeeded() {
  if (currentMode !== 'blur') {
    stopBlurInitRetryCompletely();
    return;
  }
  const currentContainer = getPlayerContainer();
  discardStaleBlurCanvas(currentContainer);
  if (hasCurrentBlurCanvas(currentContainer)) {
    stopBlurInitRetryCompletely();
    return;
  }
  if (blurInitRetryExhausted || blurInitRetryTimer !== null) return;

  function attemptBlurInit() {
    blurInitRetryTimer = null;
    if (currentMode !== 'blur') {
      stopBlurInitRetryCompletely();
      return;
    }
    const container = getPlayerContainer();
    discardStaleBlurCanvas(container);
    if (container) {
      initBlurForPlayer(container);
      if (hasCurrentBlurCanvas(container)) {
        stopBlurInitRetryCompletely();
        return;
      }
    }
    blurInitRetryAttempt += 1;
    if (blurInitRetryAttempt >= BLUR_INIT_RETRY_MAX_ATTEMPTS) {
      blurInitRetryExhausted = true;
      clearBlurInitRetryTimer();
      blurInitRetryAttempt = 0;
      console.warn('[youtublur] blur init retry exhausted');
      return;
    }
    const delay = Math.min(
      BLUR_INIT_RETRY_MAX_MS,
      BLUR_INIT_RETRY_INITIAL_MS * 2 ** (blurInitRetryAttempt - 1)
    );
    blurInitRetryTimer = setTimeout(attemptBlurInit, delay);
  }

  const firstDelay = Math.min(
    BLUR_INIT_RETRY_MAX_MS,
    BLUR_INIT_RETRY_INITIAL_MS * 2 ** blurInitRetryAttempt
  );
  blurInitRetryTimer = setTimeout(attemptBlurInit, firstDelay);
}

function normalizeMode(mode: string): BackgroundMode {
  return mode === 'solid' ? 'solid' : 'blur';
}

function isPlayerPagePath(pathname: string) {
  return /^\/watch(\/|$)/.test(pathname) || pathname.startsWith('/shorts/');
}

function getPlayerContainer(): HTMLElement | null {
  return (document.querySelector('#movie_player')
    || document.querySelector('.html5-video-player')) as HTMLElement | null;
}

/**
 * 新レイアウト（シアター切替なし）ではプレイヤーの左右に余白が出る。その余白はプレイヤーの外側の
 * 祖先要素なので、プレイヤー内の canvas / 背景色では塗れない。プレイヤーより広い祖先があれば
 * 余白の描画先（host）として返す。旧レイアウトでは該当しないので null。
 * 実 YouTube の DOM は未確認で、セレクタは推測（docs/testing.md 参照）。
 */
const MARGIN_HOST_SELECTORS = ['#player-container-outer', '#player'];
const MARGIN_CANVAS_ID = 'yt-light-bg-blur-margin-canvas';
let marginCanvas: HTMLCanvasElement | null = null;
let marginCtx: CanvasRenderingContext2D | null = null;
let marginSnapCanvas: HTMLCanvasElement | null = null;
let marginSnapCtx: CanvasRenderingContext2D | null = null;

/** 余白 host の候補祖先（幅は問わない）。後から広がるケースを監視するために使う。 */
function getMarginHostCandidates(container: HTMLElement | null | undefined): HTMLElement[] {
  if (!container) return [];
  const hosts: HTMLElement[] = [];
  for (const selector of MARGIN_HOST_SELECTORS) {
    const host = container.closest(selector) as HTMLElement | null;
    if (host && host !== container && !hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

/** プレイヤーより広い候補のうち最も外側（最も広い。同幅なら DOM 上の外側）を返す。 */
function getMarginHost(container: HTMLElement | null | undefined): HTMLElement | null {
  if (!container) return null;
  let best: HTMLElement | null = null;
  for (const host of getMarginHostCandidates(container)) {
    if (host.clientWidth <= container.clientWidth) continue;
    if (!best || host.clientWidth > best.clientWidth
      || (host.clientWidth === best.clientWidth && host.contains(best))) best = host;
  }
  return best;
}

function removeMarginCanvas() {
  if (marginCanvas) {
    try {
      marginCanvas.width = 0;
      marginCanvas.height = 0;
    } catch { /* noop */ }
    marginCanvas.remove();
  }
  marginCanvas = null;
  marginCtx = null;
  releaseMarginSnapCanvas();
}

function releaseMarginSnapCanvas() {
  if (marginSnapCanvas) {
    try {
      marginSnapCanvas.width = 0;
      marginSnapCanvas.height = 0;
    } catch { /* noop */ }
  }
  marginSnapCanvas = null;
  marginSnapCtx = null;
}

function ensureMarginSnapCanvas(w: number, h: number) {
  if (!marginSnapCanvas) {
    marginSnapCanvas = document.createElement('canvas');
    marginSnapCtx = marginSnapCanvas.getContext('2d');
    if (!marginSnapCtx) return null;
  }
  if (marginSnapCanvas.width !== w || marginSnapCanvas.height !== h) {
    marginSnapCanvas.width = w;
    marginSnapCanvas.height = h;
  }
  return marginSnapCtx;
}

/** ブラー時に余白へ描く canvas。host の背面（z-index:-1）に置き、プレイヤーより下に出す。 */
function ensureMarginCanvas(container: HTMLElement | null | undefined) {
  const host = getMarginHost(container);
  if (!host) {
    removeMarginCanvas();
    return;
  }
  restoreMarginSolidHost();
  if (marginCanvas && marginCanvas.parentElement !== host) removeMarginCanvas();
  if (!marginCanvas) {
    const canvas = document.createElement('canvas');
    canvas.id = MARGIN_CANVAS_ID;
    canvas.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  `;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.style.isolation = 'isolate';
    host.insertBefore(canvas, host.firstChild);
    marginCanvas = canvas;
    marginCtx = ctx;
  }
  marginCanvas.style.display = '';
  marginCanvas.style.visibility = 'visible';
  const w = Math.max(1, Math.ceil(host.clientWidth));
  const h = Math.max(1, Math.ceil(host.clientHeight));
  marginCanvas.width = w;
  marginCanvas.height = h;
  marginCanvas.style.width = `${w}px`;
  marginCanvas.style.height = `${h}px`;
}

function hideMarginCanvas() {
  if (marginCanvas) {
    marginCanvas.style.display = 'none';
    marginCanvas.style.visibility = 'hidden';
  }
}

function getVideoElement(container: Element | null | undefined) {
  return container?.querySelector('video') as HTMLVideoElement | null | undefined;
}

function hasCurrentBlurCanvas(container: HTMLElement | null | undefined) {
  if (!container || !blurCanvas || !blurCtx) return false;
  if (!document.contains(blurCanvas)) return false;
  return container.querySelector('#yt-light-bg-blur-canvas') === blurCanvas;
}

function discardStaleBlurCanvas(container: HTMLElement | null | undefined) {
  if (!blurCanvas) return;
  if (!document.contains(blurCanvas)) {
    blurCanvas = null;
    blurCtx = null;
    detachPlayerResizeObserver();
    stopBlurLoop();
    releaseGeckoVideoSnapCanvas();
    return;
  }
  if (!container || hasCurrentBlurCanvas(container)) return;

  try {
    blurCanvas.width = 0;
    blurCanvas.height = 0;
  } catch { /* noop */ }
  blurCanvas.remove();
  blurCanvas = null;
  blurCtx = null;
  detachPlayerResizeObserver();
  stopBlurLoop();
  releaseGeckoVideoSnapCanvas();
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
  releaseMarginSnapCanvas();
}

function createBlurCanvas(container: HTMLElement | null | undefined) {
  if (!container) return null;
  discardStaleBlurCanvas(container);
  const existing = container.querySelector('#yt-light-bg-blur-canvas') as HTMLCanvasElement | null;
  if (existing) {
    blurCtx = existing.getContext('2d');
    if (blurCtx) {
      blurCanvas = existing;
      stampActiveBlurStrength();
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
    z-index: 1;
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
  stampActiveBlurStrength();
  return blurCanvas;
}

function clearVideoContentRect(video: HTMLVideoElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const cw = canvas.width;
  const ch = canvas.height;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (cw === 0 || ch === 0 || vw === 0 || vh === 0) return;

  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let dx = 0;
  let dy = 0;
  let dw = cw;
  let dh = ch;

  if (videoAspect > canvasAspect) {
    dh = cw / videoAspect;
    dy = (ch - dh) / 2;
  } else {
    dw = ch * videoAspect;
    dx = (cw - dw) / 2;
  }

  const x1 = Math.floor(dx);
  const y1 = Math.floor(dy);
  const x2 = Math.ceil(dx + dw);
  const y2 = Math.ceil(dy + dh);
  ctx.clearRect(x1, y1, x2 - x1, y2 - y1);
}

function drawBlurFrame(video: HTMLVideoElement | null, canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null, isMargin = false) {
  if (!video || !canvas || !ctx || video.readyState < 2) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  if (vw === 0 || vh === 0) return;

  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;

  let sx: number, sy: number, sw: number, sh: number;
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
    const snapCtx = isMargin ? ensureMarginSnapCanvas(cw, ch) : ensureGeckoVideoSnapCanvas(cw, ch);
    const snapCanvas = isMargin ? marginSnapCanvas : geckoVideoSnapCanvas;
    if (snapCtx) {
      snapCtx.filter = 'none';
      try {
        snapCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
      } catch {
        /* same-origin / decode issues as main path */
        return;
      }
      ctx.filter = `blur(${activeBlurStrengthPx}px)`;
      try {
        if (snapCanvas) ctx.drawImage(snapCanvas, 0, 0);
      } catch {
        /* skip frame */
      } finally {
        ctx.filter = 'none';
      }
      // 余白 canvas はプレイヤーの背面にある。動画矩形を消すと横長動画で余白が透けるので消さない。
      if (!isMargin) clearVideoContentRect(video, canvas, ctx);
      return;
    }
  }

  // Next frame picks up the slider. The loop is not restarted; a larger radius only changes this filter.
  ctx.filter = `blur(${activeBlurStrengthPx}px)`;
  try {
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  } catch {
    /* drawImage can throw (e.g. SecurityError); skip frame */
  } finally {
    ctx.filter = 'none';
  }
  if (!isMargin) clearVideoContentRect(video, canvas, ctx);
}

function resizeCanvas(container: HTMLElement | null | undefined) {
  if (!hasCurrentBlurCanvas(container) || !container || !blurCanvas) return;
  const canvas = blurCanvas;
  const w = Math.max(1, Math.ceil(container.clientWidth));
  const h = Math.max(1, Math.ceil(container.clientHeight));
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ensureMarginCanvas(container);
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
    if (currentMode === 'solid') {
      // 余白（host）は後からプレイヤーより広くなることがあるので、サイズ変化で塗り直す。
      const sc = getPlayerContainer();
      if (sc) paintSolidBackground(sc);
      return;
    }
    if (currentMode !== 'blur') return;
    const c = getPlayerContainer();
    discardStaleBlurCanvas(c);
    if (hasCurrentBlurCanvas(c)) resizeCanvas(c);
  });
  playerResizeObserver.observe(container);
  for (const host of getMarginHostCandidates(container as HTMLElement)) {
    playerResizeObserver.observe(host);
  }
}

function startBlurLoop(container: HTMLElement | null | undefined) {
  stopBlurLoop();
  const initialContainer = container || getPlayerContainer();
  if (!hasCurrentBlurCanvas(initialContainer) || !getVideoElement(initialContainer)) return;

  // FPS監視と描画間隔調整の初期化
  lastFrameTime = 0;
  frameTimes = [];
  adjustmentCooldown = 0;

  function loop(timestamp: number) {
    if (currentMode !== 'blur') {
      animationId = null;
      return;
    }
    if (!hasCurrentBlurCanvas(initialContainer)) {
      scheduleBlurInitRetryIfNeeded();
      animationId = null;
      return;
    }
    const video = getVideoElement(initialContainer);
    if (!video) {
      scheduleBlurInitRetryIfNeeded();
      animationId = null;
      return;
    }
    frameCount++;

    updateFPS(timestamp);

    if (video && frameCount % currentDrawInterval === 0) {
      drawBlurFrame(video, blurCanvas, blurCtx);
      if (marginCanvas && document.contains(marginCanvas)) {
        drawBlurFrame(video, marginCanvas, marginCtx, true);
      }
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
  if (!hasCurrentBlurCanvas(container)) {
    scheduleBlurInitRetryIfNeeded();
    return;
  }
  const canvas = blurCanvas;
  if (!canvas) return;

  ensureMarginCanvas(container);
  resizeCanvas(container);
  attachPlayerResizeObserver(container);
  canvas.style.display = '';
  canvas.style.visibility = 'visible';
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
  hideMarginCanvas();
  if (container) {
    container.dataset.ytLightBgMode = 'solid';
    paintSolidBackground(container);
    attachPlayerResizeObserver(container);
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
  if (hasCurrentBlurCanvas(container)) {
    const canvas = blurCanvas;
    if (!canvas) return;
    stopBlurInitRetryCompletely();
    ensureMarginCanvas(container);
    resizeCanvas(container);
    attachPlayerResizeObserver(container);
    canvas.style.display = '';
    canvas.style.visibility = 'visible';
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
  removeMarginCanvas();
  restoreMarginSolidHost();
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
    discardStaleBlurCanvas(c);
    // initBlurForPlayer はブラー以外では即 return する。ホームで初期化済みの単色と保存色は、
    // プレイヤーが後から現れたこの時点で塗る。
    if (currentMode === 'solid') {
      stopBlurInitRetryCompletely();
      if (c) hideBlurMode(c);
      return;
    }
    restartBlurInitRetryCycle();
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
      discardStaleBlurCanvas(c);
      // プレイヤー DOM は yt-navigate-finish より後に出ることがある。ブラーは canvas が無いとき再初期化し、
      // 単色はリトライが無いので、保存色が未反映のときだけ塗る。
      if (solidBackgroundNeedsPaint(c) || (currentMode === 'blur' && !hasCurrentBlurCanvas(c))) {
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

  // YouTube (Polymer/kevlar) の SPA 遷移を確実に検知する。
  // issue #107: content script の初期化がプレイヤーページ以外（例: ホーム /）で起きると
  // observePlayer は監視を張らずに return する。そこからサムネイルをクリックして /watch へ
  // SPA 遷移しても、YouTube は自前で保持した history.pushState 参照経由で遷移するため
  // 下の pushState ラッパーでは捕捉できず、observePlayer が再実行されない。結果 blur canvas が
  // 生成されず、タブ切替（visibilitychange）まで反映されなかった。
  // YouTube が SPA 遷移完了時に dispatch する yt-navigate-finish を購読することで確実に再評価する。
  // このイベントは page world から共有 DOM 上に発火されるため、isolated world の content script でも受け取れる。
  // （遷移完了後にプレイヤー DOM が遅れて現れるケースは MutationObserver が拾う。
  // ブラーは canvas 未生成で再初期化し、単色は保存色が未反映なら塗る。video 未準備のブラーはリトライが拾う）
  window.addEventListener('yt-navigate-finish', onNav);

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
  if (currentMode === 'blur') {
    const container = getPlayerContainer();
    discardStaleBlurCanvas(container);
    if (hasCurrentBlurCanvas(container)) resizeCanvas(container);
  }
}

function initExtension() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    installYoutubeNavigationHooks();
    observePlayer();

    // Load mode from storage with fallback support
    loadModeFromStorage()
      .then((saved) => {
        const normalized = normalizeMode(saved);
        if (normalized !== currentMode) {
          applyMode(normalized, getPlayerContainer());
        }
      })
      .catch((error) => {
        console.warn('[youtublur] failed to load mode from storage:', error);
      });

    const initialBlurGeneration = blurCommandGeneration;
    loadBlurStrengthFromStorage()
      .then((px) => applyLoadedBlurStrength(px, initialBlurGeneration))
      .catch((error) => {
        console.warn('[youtublur] failed to load blur strength from storage:', error);
      });

    installBlurStrengthStorageListener();

    const initialSolidGeneration = solidCommandGeneration;
    loadSolidColorRecordFromStorage()
      .then((record) => applyLoadedSolidColor(record.color, initialSolidGeneration))
      .catch((error) => {
        console.warn('[youtublur] failed to load solid color from storage:', error);
      });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'BG_MODE_CHANGED') {
        applyMode(msg.mode, getPlayerContainer());
      } else if (msg.type === 'BLUR_STRENGTH_CHANGED' && typeof msg.strength === 'number') {
        const px = clampBlurStrengthPx(msg.strength);
        rememberCommandedBlurStrength();
        setActiveBlurStrengthPx(px);
      } else if (msg.type === 'SOLID_COLOR_CHANGED') {
        applySolidColorMessage(msg.color);
      } else if (msg.type === 'RELOAD_BLUR') {
        teardownPlayerPageBlur();
        const reloadGeneration = blurCommandGeneration;
        loadBlurStrengthFromStorage()
          .then((px) => applyLoadedBlurStrength(px, reloadGeneration))
          .catch((error) => {
            console.warn('[youtublur] failed to reload blur strength from storage:', error);
          });
        const reloadSolidGeneration = solidCommandGeneration;
        loadSolidColorRecordFromStorage()
          .then((record) => applyLoadedSolidColor(record.color, reloadSolidGeneration))
          .catch((error) => {
            console.warn('[youtublur] failed to reload solid color from storage:', error);
          });
        loadModeFromStorage()
          .then((saved) => {
            const normalized = normalizeMode(saved);
            applyMode(normalized);
            observePlayer();
          })
          .catch((error) => {
            console.warn('[youtublur] failed to reload blur mode from storage:', error);
          });
      }
    });
  }

  // テーマ変更を監視して単色モードの背景色を動的に更新
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && !themeObserver) {
    themeObserver = new MutationObserver(() => {
      if (currentMode === 'solid') {
        const container = getPlayerContainer();
        if (container) paintSolidBackground(container);
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
    setActiveBlurStrengthPx,
    getActiveBlurStrengthPx: () => activeBlurStrengthPx,
    applyStoredBlurStrength,
    isGeckoLayoutEngine,
    detectYouTubeTheme,
    getSolidModeBackgroundColor,
    getActiveSolidColor: () => activeSolidColor,
    setActiveSolidColor,
    paintSolidBackground,
    getMarginHost,
    restoreMarginSolidHost,
    applyStoredSolidColor,
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
    setMode: (m: BackgroundMode) => { currentMode = m; },
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
      activeBlurStrengthPx = BLUR_STRENGTH_PX;
      clearCommandedBlurStrength();
      blurStrengthStorageListenerInstalled = false;
      activeSolidColor = null;
      clearCommandedSolidColor();
      stopBlurLoop();
      frameCount = 0;
      releaseGeckoVideoSnapCanvas();
      // 動的描画間隔関連の状態をリセット - デバイス性能を再検出
      currentDrawInterval = getInitialDrawInterval();
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
