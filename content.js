"use strict";
/** Default blur radius (px). Stored values override this; unset storage keeps 40 so existing users see no change. */
const BLUR_STRENGTH_PX = 40;
let activeBlurStrengthPx = BLUR_STRENGTH_PX;
/**
 * Local slider command. Storage writes stamped before this time are echoes of an
 * older drag and are ignored. A newer timestamp (another tab) still applies.
 */
let commandedBlurAt = null;
let commandedBlurTimer = null;
let blurCommandGeneration = 0;
let blurStrengthStorageListenerInstalled = false;
// デバイス性能検出と動的な描画間隔の設定
function detectDevicePerformance() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4;
    let score = 0;
    if (cores <= 2)
        score += 1;
    else if (cores <= 4)
        score += 2;
    else
        score += 3;
    if (memory <= 2)
        score += 1;
    else if (memory <= 4)
        score += 2;
    else
        score += 3;
    if (score <= 2)
        return 'low';
    if (score <= 4)
        return 'medium';
    return 'high';
}
function getInitialDrawInterval() {
    const perf = detectDevicePerformance();
    if (perf === 'low')
        return 3;
    if (perf === 'high')
        return 1;
    return 2;
}
let currentDrawInterval = getInitialDrawInterval();
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
    if (frameTimes.length === 0)
        return 60;
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
    }
    else if (fps > FPS_HIGH_THRESHOLD && currentDrawInterval > 1) {
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
        return (typeof CSS !== 'undefined' &&
            typeof CSS.supports === 'function' &&
            CSS.supports('-moz-appearance', 'none'));
    }
    catch {
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
                        }
                        else {
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
    }
    catch (error) {
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
/** canvas を載せている背景ホスト（プレイヤー自身のときは null） */
let blurHost = null;
/** 単色モードで塗った背景ホスト（プレイヤー自身のときは null） */
let solidPaintedHost = null;
function stampActiveBlurStrength() {
    if (!blurCanvas)
        return;
    blurCanvas.dataset.ytBlurStrength = String(activeBlurStrengthPx);
}
function setActiveBlurStrengthPx(px) {
    activeBlurStrengthPx = clampBlurStrengthPx(px);
    stampActiveBlurStrength();
}
/** Drop a storage read that started before a newer local slider command. */
function applyLoadedBlurStrength(px, generation) {
    if (generation !== blurCommandGeneration)
        return;
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
    if (commandedBlurTimer !== null)
        clearTimeout(commandedBlurTimer);
    // Debounced saves can echo an older radius. After 2s, re-read and apply only
    // a write stamped at or after this command (another tab, or our own save).
    commandedBlurTimer = setTimeout(() => {
        if (generation !== blurCommandGeneration)
            return;
        commandedBlurTimer = null;
        const commandedAt = commandedBlurAt;
        loadBlurStrengthRecordFromStorage()
            .then((record) => {
            if (generation !== blurCommandGeneration)
                return;
            commandedBlurAt = null;
            if (commandedAt !== null && record.timestamp < commandedAt)
                return;
            setActiveBlurStrengthPx(record.px);
        })
            .catch((error) => {
            if (generation === blurCommandGeneration)
                commandedBlurAt = null;
            console.warn('[youtublur] failed to refresh blur strength after slider command:', error);
        });
    }, 2000);
}
function applyStoredBlurStrength(px, storedAt) {
    if (commandedBlurAt !== null && storedAt < commandedBlurAt)
        return;
    clearCommandedBlurStrength();
    setActiveBlurStrengthPx(px);
}
function installBlurStrengthStorageListener() {
    if (blurStrengthStorageListenerInstalled)
        return;
    const onChanged = chrome.storage.onChanged;
    if (!onChanged || typeof onChanged.addListener !== 'function')
        return;
    blurStrengthStorageListenerInstalled = true;
    onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' && areaName !== 'local')
            return;
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
let activeSolidColor = null;
let commandedSolidAt = null;
let commandedSolidTimer = null;
let solidCommandGeneration = 0;
function effectiveSolidCssColor() {
    return sanitizeSolidColorForCss(activeSolidColor ?? getSolidModeBackgroundColor());
}
/** 単色の保存色はプレイヤーが現れてから塗る。ホーム初期化のあと SPA で遅れて届く。 */
function solidBackgroundNeedsPaint(container) {
    if (currentMode !== 'solid' || !container)
        return false;
    const color = effectiveSolidCssColor();
    if (container.dataset.ytLightBgMode !== 'solid' || container.dataset.ytSolidColor !== color)
        return true;
    const host = resolveBackgroundHost(container);
    return host !== container && host.dataset.ytSolidColor !== color;
}
function applySolidPaint(el, color) {
    el.style.setProperty('background-color', color, 'important');
    el.dataset.ytSolidColor = color;
}
/** 直前に塗った背景ホスト。ホスト変更・ブラー移行・破棄時にここだけ塗りを戻す。 */
function clearSolidHostPaint() {
    if (solidPaintedHost) {
        solidPaintedHost.style.removeProperty('background-color');
        delete solidPaintedHost.dataset.ytSolidColor;
        delete solidPaintedHost.dataset.ytLightBgHost;
    }
    solidPaintedHost = null;
}
function paintSolidBackground(container) {
    const color = effectiveSolidCssColor();
    applySolidPaint(container, color);
    const host = resolveBackgroundHost(container);
    if (solidPaintedHost && solidPaintedHost !== host)
        clearSolidHostPaint();
    if (host !== container) {
        applySolidPaint(host, color);
        host.dataset.ytLightBgHost = '1';
        solidPaintedHost = host;
    }
}
function setActiveSolidColor(color) {
    activeSolidColor = color === null ? null : normalizeSolidColor(color);
    if (currentMode !== 'solid')
        return;
    const container = getPlayerContainer();
    if (container)
        paintSolidBackground(container);
}
function applyLoadedSolidColor(color, generation) {
    if (generation !== solidCommandGeneration)
        return;
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
    if (commandedSolidTimer !== null)
        clearTimeout(commandedSolidTimer);
    // Debounced saves can echo an older color. After 2s, apply only a write stamped
    // at or after this command (another tab, or our own save).
    commandedSolidTimer = setTimeout(() => {
        if (generation !== solidCommandGeneration)
            return;
        commandedSolidTimer = null;
        const commandedAt = commandedSolidAt;
        loadSolidColorRecordFromStorage()
            .then((record) => {
            if (generation !== solidCommandGeneration)
                return;
            commandedSolidAt = null;
            if (commandedAt !== null && record.timestamp < commandedAt)
                return;
            setActiveSolidColor(record.color);
        })
            .catch((error) => {
            if (generation === solidCommandGeneration)
                commandedSolidAt = null;
            console.warn('[youtublur] failed to refresh solid color after picker command:', error);
        });
    }, 2000);
}
function applyStoredSolidColor(color, storedAt) {
    if (commandedSolidAt !== null && storedAt < commandedSolidAt)
        return;
    clearCommandedSolidColor();
    setActiveSolidColor(color);
}
function applySolidColorMessage(raw) {
    const color = normalizeSolidColor(raw);
    if (!color)
        return;
    rememberCommandedSolidColor();
    setActiveSolidColor(color);
}
let animationId = null;
let frameCount = 0;
let playerDomObserver = null;
let playerResizeObserver = null;
let youtubeNavHooksInstalled = false;
let documentLifecycleHooksInstalled = false;
let themeObserver = null;
const BLUR_INIT_RETRY_INITIAL_MS = 50;
const BLUR_INIT_RETRY_MAX_MS = 2000;
const BLUR_INIT_RETRY_MAX_ATTEMPTS = 25;
let blurInitRetryTimer = null;
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
    if (blurInitRetryExhausted || blurInitRetryTimer !== null)
        return;
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
        const delay = Math.min(BLUR_INIT_RETRY_MAX_MS, BLUR_INIT_RETRY_INITIAL_MS * 2 ** (blurInitRetryAttempt - 1));
        blurInitRetryTimer = setTimeout(attemptBlurInit, delay);
    }
    const firstDelay = Math.min(BLUR_INIT_RETRY_MAX_MS, BLUR_INIT_RETRY_INITIAL_MS * 2 ** blurInitRetryAttempt);
    blurInitRetryTimer = setTimeout(attemptBlurInit, firstDelay);
}
function normalizeMode(mode) {
    return mode === 'solid' ? 'solid' : 'blur';
}
function isPlayerPagePath(pathname) {
    return /^\/watch(\/|$)/.test(pathname) || pathname.startsWith('/shorts/');
}
function getPlayerContainer() {
    return (document.querySelector('#movie_player')
        || document.querySelector('.html5-video-player'));
}
function getVideoElement(container) {
    return container?.querySelector('video');
}
/** 背景ホスト探索の打ち切り要素（この要素自身はホストにしない） */
function isBackgroundHostBoundary(el) {
    const tag = el.tagName.toLowerCase();
    return tag === 'body' || tag.startsWith('ytd-watch') || el.id === 'columns' || el.id === 'primary';
}
/**
 * 背景（ブラー canvas / 単色）を載せる要素を決める。
 * 新しい視聴ページレイアウトでは #movie_player がラッパーより狭く、左右に余白が出る。
 * プレイヤーと同じ高さ（±2px）でプレイヤーを水平に含み、明確に広い（+8px 超）祖先があれば
 * その中で最も広いものを返す。旧レイアウト（既定 / シアター / 全画面）では該当が無く
 * プレイヤー自身を返すため、挙動は変わらない。
 */
function getBackgroundHost(player) {
    try {
        if (typeof document !== 'undefined' && document.fullscreenElement)
            return player;
        if (typeof location !== 'undefined' && location.pathname.startsWith('/shorts/'))
            return player;
        const base = player.getBoundingClientRect();
        if (base.width <= 0 || base.height <= 0)
            return player;
        let best = null;
        let bestWidth = base.width + 8;
        let el = player.parentElement;
        while (el && !isBackgroundHostBoundary(el)) {
            const rect = el.getBoundingClientRect();
            if (Math.abs(rect.height - base.height) > 2)
                break;
            if (rect.width > bestWidth && rect.left <= base.left + 1 && rect.right >= base.right - 1) {
                best = el;
                bestWidth = rect.width;
            }
            el = el.parentElement;
        }
        return best || player;
    }
    catch {
        return player;
    }
}
/**
 * getBackgroundHost の結果キャッシュ。rAF ループや documentElement 監視の MutationObserver から
 * 毎回計測すると強制同期レイアウトになるため、同じプレイヤーについて短時間は再利用する。
 */
let backgroundHostCache = null;
const BACKGROUND_HOST_CACHE_MS = 500;
function backgroundHostNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}
function invalidateBackgroundHostCache() {
    backgroundHostCache = null;
}
/** 内部の呼び出し元はすべてこちらを使う（getBackgroundHost は計測専用） */
function resolveBackgroundHost(player) {
    const cached = backgroundHostCache;
    const now = backgroundHostNow();
    if (cached && cached.player === player && cached.host.isConnected && now - cached.time < BACKGROUND_HOST_CACHE_MS) {
        return cached.host;
    }
    const host = getBackgroundHost(player);
    backgroundHostCache = { player, host, time: now };
    return host;
}
function markBlurHost(host, player) {
    if (blurHost && blurHost !== host)
        delete blurHost.dataset.ytLightBgHost;
    blurHost = host === player ? null : host;
    if (blurHost)
        blurHost.dataset.ytLightBgHost = '1';
}
function clearBlurHostMark() {
    if (blurHost)
        delete blurHost.dataset.ytLightBgHost;
    blurHost = null;
}
function hasCurrentBlurCanvas(container) {
    if (!container || !blurCanvas || !blurCtx)
        return false;
    if (!document.contains(blurCanvas))
        return false;
    // ホストが変わった（レイアウト切替・SPA 遷移）ときは作り直させる
    return blurCanvas.parentElement === resolveBackgroundHost(container);
}
function discardStaleBlurCanvas(container) {
    if (!blurCanvas)
        return;
    if (!document.contains(blurCanvas)) {
        blurCanvas = null;
        blurCtx = null;
        clearBlurHostMark();
        detachPlayerResizeObserver();
        stopBlurLoop();
        releaseGeckoVideoSnapCanvas();
        return;
    }
    if (!container || hasCurrentBlurCanvas(container))
        return;
    try {
        blurCanvas.width = 0;
        blurCanvas.height = 0;
    }
    catch { /* noop */ }
    blurCanvas.remove();
    blurCanvas = null;
    blurCtx = null;
    clearBlurHostMark();
    detachPlayerResizeObserver();
    stopBlurLoop();
    releaseGeckoVideoSnapCanvas();
}
function ensureGeckoVideoSnapCanvas(w, h) {
    if (typeof document === 'undefined')
        return null;
    if (!geckoVideoSnapCanvas) {
        geckoVideoSnapCanvas = document.createElement('canvas');
        geckoVideoSnapCanvas.id = 'yt-light-bg-blur-gecko-snap';
        geckoVideoSnapCtx = geckoVideoSnapCanvas.getContext('2d');
        if (!geckoVideoSnapCtx)
            return null;
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
        }
        catch { /* noop */ }
    }
    geckoVideoSnapCanvas = null;
    geckoVideoSnapCtx = null;
}
function createBlurCanvas(container) {
    if (!container)
        return null;
    discardStaleBlurCanvas(container);
    const host = resolveBackgroundHost(container);
    const existing = host.querySelector('#yt-light-bg-blur-canvas');
    if (existing && existing.parentElement === host) {
        blurCtx = existing.getContext('2d');
        if (blurCtx) {
            blurCanvas = existing;
            markBlurHost(host, container);
            stampActiveBlurStrength();
            return blurCanvas;
        }
        existing.remove();
    }
    else if (existing) {
        existing.remove();
    }
    if (blurCanvas && !document.contains(blurCanvas)) {
        blurCanvas = null;
        blurCtx = null;
    }
    const video = getVideoElement(container);
    if (!video)
        return null;
    blurCanvas = document.createElement('canvas');
    blurCanvas.id = 'yt-light-bg-blur-canvas';
    blurCanvas.style.cssText = `
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    z-index: ${host === container ? 1 : 0};
    pointer-events: none;
  `;
    if (host === container) {
        if (host.style.position !== 'relative' && host.style.position !== 'absolute') {
            host.style.position = 'relative';
        }
    }
    else if (typeof getComputedStyle === 'function' && getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
    }
    host.insertBefore(blurCanvas, host.firstChild);
    markBlurHost(host, container);
    blurCtx = blurCanvas.getContext('2d');
    if (!blurCtx) {
        blurCanvas.remove();
        blurCanvas = null;
        clearBlurHostMark();
        return null;
    }
    stampActiveBlurStrength();
    return blurCanvas;
}
/**
 * 背景ホストに描く場合、canvas はプレイヤーより広いので映像領域は canvas のアスペクトから
 * 計算できない。実際に表示されている video 要素の矩形を canvas 座標に写してクリアする。
 */
function clearHostVideoRect(video, canvas, ctx) {
    const cRect = canvas.getBoundingClientRect();
    const vRect = video.getBoundingClientRect();
    if (cRect.width <= 0 || cRect.height <= 0 || vRect.width <= 0 || vRect.height <= 0)
        return false;
    const scaleX = canvas.width / cRect.width;
    const scaleY = canvas.height / cRect.height;
    const x1 = Math.floor((vRect.left - cRect.left) * scaleX);
    const y1 = Math.floor((vRect.top - cRect.top) * scaleY);
    const x2 = Math.ceil((vRect.right - cRect.left) * scaleX);
    const y2 = Math.ceil((vRect.bottom - cRect.top) * scaleY);
    ctx.clearRect(x1, y1, x2 - x1, y2 - y1);
    return true;
}
function clearVideoContentRect(video, canvas, ctx) {
    const cw = canvas.width;
    const ch = canvas.height;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (cw === 0 || ch === 0 || vw === 0 || vh === 0)
        return;
    const parent = canvas.parentElement;
    if (parent?.dataset?.ytLightBgHost === '1' && clearHostVideoRect(video, canvas, ctx))
        return;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    let dx = 0;
    let dy = 0;
    let dw = cw;
    let dh = ch;
    if (videoAspect > canvasAspect) {
        dh = cw / videoAspect;
        dy = (ch - dh) / 2;
    }
    else {
        dw = ch * videoAspect;
        dx = (cw - dw) / 2;
    }
    const x1 = Math.floor(dx);
    const y1 = Math.floor(dy);
    const x2 = Math.ceil(dx + dw);
    const y2 = Math.ceil(dy + dh);
    ctx.clearRect(x1, y1, x2 - x1, y2 - y1);
}
function drawBlurFrame(video, canvas, ctx) {
    if (!video || !canvas || !ctx || video.readyState < 2)
        return;
    const cw = canvas.width;
    const ch = canvas.height;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0)
        return;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    let sx, sy, sw, sh;
    if (videoAspect > canvasAspect) {
        sh = vh;
        sw = vh * canvasAspect;
        sx = (vw - sw) / 2;
        sy = 0;
    }
    else {
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
            }
            catch {
                /* same-origin / decode issues as main path */
                return;
            }
            ctx.filter = `blur(${activeBlurStrengthPx}px)`;
            try {
                if (geckoVideoSnapCanvas)
                    ctx.drawImage(geckoVideoSnapCanvas, 0, 0);
            }
            catch {
                /* skip frame */
            }
            finally {
                ctx.filter = 'none';
            }
            clearVideoContentRect(video, canvas, ctx);
            return;
        }
    }
    // Next frame picks up the slider. The loop is not restarted; a larger radius only changes this filter.
    ctx.filter = `blur(${activeBlurStrengthPx}px)`;
    try {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
    }
    catch {
        /* drawImage can throw (e.g. SecurityError); skip frame */
    }
    finally {
        ctx.filter = 'none';
    }
    clearVideoContentRect(video, canvas, ctx);
}
function resizeCanvas(container) {
    if (!hasCurrentBlurCanvas(container) || !container || !blurCanvas)
        return;
    const canvas = blurCanvas;
    const host = resolveBackgroundHost(container);
    const w = Math.max(1, Math.ceil(host.clientWidth));
    const h = Math.max(1, Math.ceil(host.clientHeight));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
}
function detachPlayerResizeObserver() {
    if (playerResizeObserver) {
        playerResizeObserver.disconnect();
        playerResizeObserver = null;
    }
}
function attachPlayerResizeObserver(container) {
    if (typeof ResizeObserver === 'undefined' || !container)
        return;
    detachPlayerResizeObserver();
    playerResizeObserver = new ResizeObserver(() => {
        if (currentMode !== 'blur')
            return;
        invalidateBackgroundHostCache();
        const c = getPlayerContainer();
        discardStaleBlurCanvas(c);
        if (hasCurrentBlurCanvas(c))
            resizeCanvas(c);
    });
    playerResizeObserver.observe(container);
    // 背景ホストはプレイヤーと独立に伸縮しうるので両方を監視する
    const host = resolveBackgroundHost(container);
    if (host !== container)
        playerResizeObserver.observe(host);
}
function startBlurLoop(container) {
    stopBlurLoop();
    const initialContainer = container || getPlayerContainer();
    if (!hasCurrentBlurCanvas(initialContainer) || !getVideoElement(initialContainer))
        return;
    // FPS監視と描画間隔調整の初期化
    lastFrameTime = 0;
    frameTimes = [];
    adjustmentCooldown = 0;
    function loop(timestamp) {
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
    if (!container)
        return;
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
    if (!canvas)
        return;
    resizeCanvas(container);
    attachPlayerResizeObserver(container);
    canvas.style.display = '';
    canvas.style.visibility = 'visible';
    container.dataset.ytLightBgMode = 'blur';
    clearSolidHostPaint();
    startBlurLoop(container);
}
function hideBlurMode(container) {
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
        paintSolidBackground(container);
    }
}
function applyMode(mode, container) {
    const normalized = normalizeMode(mode);
    currentMode = normalized;
    const c = container || getPlayerContainer();
    if (!c)
        return;
    if (normalized === 'blur') {
        showBlurMode(c);
    }
    else {
        hideBlurMode(c);
    }
}
function initBlurForPlayer(container) {
    if (currentMode !== 'blur')
        return;
    if (!container)
        return;
    const video = getVideoElement(container);
    if (!video)
        return;
    createBlurCanvas(container);
    if (hasCurrentBlurCanvas(container)) {
        const canvas = blurCanvas;
        if (!canvas)
            return;
        stopBlurInitRetryCompletely();
        resizeCanvas(container);
        attachPlayerResizeObserver(container);
        canvas.style.display = '';
        canvas.style.visibility = 'visible';
        container.dataset.ytLightBgMode = 'blur';
        clearSolidHostPaint();
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
        }
        catch { /* noop */ }
        blurCanvas.remove();
    }
    blurCanvas = null;
    blurCtx = null;
    clearBlurHostMark();
    clearSolidHostPaint();
    frameCount = 0;
    releaseGeckoVideoSnapCanvas();
    invalidateBackgroundHostCache();
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
        if (typeof document === 'undefined')
            return;
        const c = getPlayerContainer();
        discardStaleBlurCanvas(c);
        // initBlurForPlayer はブラー以外では即 return する。ホームで初期化済みの単色と保存色は、
        // プレイヤーが後から現れたこの時点で塗る。
        if (currentMode === 'solid') {
            stopBlurInitRetryCompletely();
            if (c)
                hideBlurMode(c);
            return;
        }
        restartBlurInitRetryCycle();
        if (c)
            initBlurForPlayer(c);
        scheduleBlurInitRetryIfNeeded();
    }
    let tryInitCoalesced = false;
    function scheduleTryInit() {
        if (tryInitCoalesced)
            return;
        tryInitCoalesced = true;
        queueMicrotask(() => {
            tryInitCoalesced = false;
            tryInit();
        });
    }
    if (!playerDomObserver) {
        playerDomObserver = new MutationObserver(() => {
            if (typeof document === 'undefined')
                return;
            const c = getPlayerContainer();
            if (!c)
                return;
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
    if (documentLifecycleHooksInstalled)
        return;
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function')
        return;
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
    if (youtubeNavHooksInstalled)
        return;
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
    invalidateBackgroundHostCache();
    if (currentMode === 'blur') {
        const container = getPlayerContainer();
        discardStaleBlurCanvas(container);
        if (hasCurrentBlurCanvas(container))
            resizeCanvas(container);
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
            }
            else if (msg.type === 'BLUR_STRENGTH_CHANGED' && typeof msg.strength === 'number') {
                const px = clampBlurStrengthPx(msg.strength);
                rememberCommandedBlurStrength();
                setActiveBlurStrengthPx(px);
            }
            else if (msg.type === 'SOLID_COLOR_CHANGED') {
                applySolidColorMessage(msg.color);
            }
            else if (msg.type === 'RELOAD_BLUR') {
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
                if (container)
                    paintSolidBackground(container);
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
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('fullscreenchange', invalidateBackgroundHostCache);
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
        applyStoredSolidColor,
        getPlayerContainer,
        getBackgroundHost,
        invalidateBackgroundHostCache,
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
            clearBlurHostMark();
            invalidateBackgroundHostCache();
            clearSolidHostPaint();
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
        setCurrentDrawInterval: (val) => { currentDrawInterval = val; },
        getFrameTimes: () => frameTimes,
        getAdjustmentCooldown: () => adjustmentCooldown,
        setAdjustmentCooldown: (val) => { adjustmentCooldown = val; }
    };
}
