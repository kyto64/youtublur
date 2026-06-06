/**
 * AI-Agentic 検証ハーネス（issue #107 用）
 * ------------------------------------------------------------------
 * 目的:
 *   実 YouTube 上での「初回ロード時にブラーが正しく反映されるか」は、
 *   純粋な E2E アサーションだけだと脆く（bot 検知・再生・タイミング依存）、
 *   かつ過去には「サイズボタンを押す」操作がバグを隠して pass してしまっていた。
 *   このハーネスは *ユーザー操作を一切せず* 初回ロードのみで証跡を採取し、
 *   それを AI（または人間）が「画像A=不具合 / 画像B=正常」のどちらかを判定できる形で出力する。
 *
 * 採取する証跡:
 *   1. player-first-load.png  … 初回ロード（無操作）のプレイヤー領域スクリーンショット
 *   2. player-after-resize.png … サイズ変更後（追加の安定性確認用）
 *   3. blur-metrics.json      … canvas/コンテナ寸法、アンビエント/中央の画素、
 *                                アンビエント領域の空間分散などの決定的メトリクス
 *   4. judge-prompt.md        … 上記を AI 判定器に渡すためのプロンプト
 *
 * 使い方:
 *   pnpm run verify:ai-blur            # ヘッドレス Chrome で採取
 *   HEADLESS=0 pnpm run verify:ai-blur # 目視確認用にヘッドフルで採取
 *   VIDEO_ID=xxxx pnpm run verify:ai-blur
 *
 * 採取後、artifacts/ 配下のスクリーンショットと judge-prompt.md を AI エージェントに渡し、
 * 「アンビエントブラーが動画の反射として正しく描画されているか（画像Bか）」を判定させる。
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '..', '..');
const artifactsDir = path.join(__dirname, 'artifacts');

const SEARCH_QUERY = process.env.SEARCH_QUERY || 'lofi';
const HEADLESS = process.env.HEADLESS !== '0';
const WAIT_MS = Number(process.env.WAIT_MS || 6000);

/**
 * ページ内で blur canvas の決定的メトリクスを収集する。
 * - canvasMatchesContainer: backing store がプレイヤー表示寸法に追従しているか（issue #107 の核）
 * - ambientNonZero / centerCleared: アンビエントブラーが描画され中央が透明か
 * - ambientStdDev: アンビエント領域をグリッドサンプリングした画素の空間分散。
 *   実際のブラー反射は分散を持つ（画像B）が、誤スケールの単色スメアは分散が小さい（画像A）。
 */
function collectBlurMetrics() {
  const canvas = document.querySelector('#yt-light-bg-blur-canvas');
  if (!canvas) return { present: false };
  const container = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const video = container?.querySelector('video');
  const cw = canvas.width;
  const ch = canvas.height;

  const result = {
    present: true,
    canvasWidth: cw,
    canvasHeight: ch,
    containerClientWidth: container ? container.clientWidth : null,
    containerClientHeight: container ? container.clientHeight : null,
    videoWidth: video ? video.videoWidth : null,
    videoHeight: video ? video.videoHeight : null,
    cssWidth: canvas.style.width,
    cssHeight: canvas.style.height,
    zIndex: getComputedStyle(canvas).zIndex,
  };

  result.canvasMatchesContainer =
    !!container &&
    Math.abs(cw - Math.max(1, Math.ceil(container.clientWidth))) <= 1 &&
    Math.abs(ch - Math.max(1, Math.ceil(container.clientHeight))) <= 1;

  if (!ctx || cw === 0 || ch === 0 || !video || !video.videoWidth || !video.videoHeight) {
    result.measurable = false;
    return result;
  }
  result.measurable = true;

  const canvasAspect = cw / ch;
  const videoAspect = video.videoWidth / video.videoHeight;

  // アンビエント帯（letterbox / pillarbox）を特定し、その帯をグリッドサンプリングする
  const samples = [];
  let band = null;
  if (videoAspect > canvasAspect) {
    const contentHeight = cw / videoAspect;
    const topBarHeight = (ch - contentHeight) / 2;
    band = { type: 'top', size: topBarHeight };
    if (topBarHeight >= 8) {
      for (let i = 1; i <= 9; i++) {
        const x = Math.floor((cw * i) / 10);
        const y = Math.max(1, Math.floor(topBarHeight / 2));
        samples.push(Array.from(ctx.getImageData(x, y, 1, 1).data));
      }
    }
  } else {
    const contentWidth = ch * videoAspect;
    const sideBarWidth = (cw - contentWidth) / 2;
    band = { type: 'side', size: sideBarWidth };
    if (sideBarWidth >= 8) {
      for (let i = 1; i <= 9; i++) {
        const x = Math.max(1, Math.floor(sideBarWidth / 2));
        const y = Math.floor((ch * i) / 10);
        samples.push(Array.from(ctx.getImageData(x, y, 1, 1).data));
      }
    }
  }
  result.ambientBand = band;

  const centerPixel = Array.from(
    ctx.getImageData(Math.floor(cw / 2), Math.floor(ch / 2), 1, 1).data
  );
  result.centerPixel = centerPixel;
  result.centerCleared = centerPixel.every((v) => v === 0);

  result.ambientSampleCount = samples.length;
  result.ambientNonZero = samples.some((p) => p.some((v) => v !== 0));

  // アンビエント帯の空間分散（RGB の各サンプルを輝度に変換し標準偏差を取る）
  if (samples.length > 0) {
    const lums = samples.map((p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]);
    const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
    const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
    result.ambientMeanLuminance = Number(mean.toFixed(2));
    result.ambientStdDev = Number(Math.sqrt(variance).toFixed(2));
  }

  return result;
}

async function main() {
  fs.mkdirSync(artifactsDir, { recursive: true });

  // INJECT=1: パッケージ拡張の読み込みが使えない環境（拡張非対応の headless 等）向けに、
  // Firefox fixture と同じ手法で chrome をモックし content script を手動注入する。
  // 既定（INJECT 未指定）は実際のパッケージ拡張を --load-extension で読み込む。
  const inject = process.env.INJECT === '1';

  const context = await chromium.launchPersistentContext('', {
    headless: HEADLESS,
    args: [
      ...(HEADLESS ? ['--headless=new'] : []),
      ...(inject ? [] : [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]),
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  await context.addCookies([
    { name: 'CONSENT', value: 'PENDING+999', domain: '.youtube.com', path: '/' },
  ]);

  if (inject) {
    const storageModeSrc = fs.readFileSync(path.join(extensionPath, 'storage-mode.js'), 'utf8');
    const contentJsSrc = fs.readFileSync(path.join(extensionPath, 'content.js'), 'utf8');
    await context.addInitScript(`(function(){
      if (!location.hostname.endsWith('youtube.com')) return;
      var s = { playerBackgroundMode: 'blur', playerBackgroundModeTimestamp: 0 };
      function g(k, cb){ const d=(k&&typeof k==='object'&&!Array.isArray(k))?k:{}; cb({ ...d, ...s }); }
      window.chrome = { storage:{ sync:{get:g,set:function(d){Object.assign(s,d);}}, local:{get:g,set:function(d){Object.assign(s,d);}} }, runtime:{ onMessage:{ addListener:function(){} }, lastError:undefined } };
      function run(){ ${storageModeSrc}\n${contentJsSrc} }
      if (document.documentElement) run(); else document.addEventListener('DOMContentLoaded', run, { once: true });
    })();`);
  }

  const page = await context.newPage();
  await page.setViewportSize({ width: 2048, height: 1152 });

  const summary = { searchQuery: SEARCH_QUERY, landedUrl: null, capturedAt: new Date().toISOString(), steps: {} };

  try {
    // issue #107 の再現経路: 非プレイヤーページ（検索結果）で content script を初期化させてから、
    // 動画をクリックして /watch へ SPA 遷移する。直接 /watch を開く（F5 相当）と不具合が出ないため、
    // この経路を通さないと #107 を検知できない。
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(SEARCH_QUERY)}`, { waitUntil: 'domcontentloaded' });
    const videoLink = page.locator('ytd-video-renderer a#video-title, ytd-video-renderer a#thumbnail').first();
    await videoLink.waitFor({ state: 'visible', timeout: 30000 });
    await videoLink.click();
    await page.waitForFunction(() => location.pathname === '/watch', null, { timeout: 30000 });
    await page.waitForSelector('#ytd-player', { state: 'attached', timeout: 30000 });
    await page.waitForSelector('#yt-light-bg-blur-canvas', { state: 'attached', timeout: 20000 });
    summary.landedUrl = page.url();

    // --- 初回ロード（無操作）の証跡 ---
    // 既定の watch 表示では YouTube が #movie_player を動画アスペクトに合わせるため
    // アンビエント帯は生じない。ここでの核心は canvasMatchesContainer（issue #107）。
    await page.waitForTimeout(WAIT_MS);
    const player = page.locator('#movie_player');
    await player.screenshot({ path: path.join(artifactsDir, 'player-first-load.png') });
    summary.steps.firstLoad = await page.evaluate(collectBlurMetrics);

    // --- シアター/ワイドレイアウトの証跡 ---
    // サイズボタンでシアターモードに切り替え、アンビエント帯（ブラーが視認できる領域）を発生させる。
    // これが画像A/B の対象シナリオ。切替後 *追加の修復操作なしで* 正しく描画されるかを採取する。
    await player.hover();
    await page.locator('.ytp-size-button').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await player.screenshot({ path: path.join(artifactsDir, 'player-theater.png') });
    summary.steps.theater = await page.evaluate(collectBlurMetrics);
  } catch (err) {
    summary.error = String(err && err.message ? err.message : err);
  } finally {
    fs.writeFileSync(
      path.join(artifactsDir, 'blur-metrics.json'),
      JSON.stringify(summary, null, 2)
    );
    fs.writeFileSync(path.join(artifactsDir, 'judge-prompt.md'), buildJudgePrompt(summary));
    await context.close();
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nArtifacts written to: ${artifactsDir}`);

  // 決定的メトリクスで明らかに不正な場合は非ゼロ終了（CI ゲート用）
  const fl = summary.steps.firstLoad;
  const th = summary.steps.theater;
  if (summary.error) process.exitCode = 2;
  else if (!fl || !fl.present || fl.canvasMatchesContainer === false) process.exitCode = 1;
  // シアターで帯が生じているのにブラーが描かれていない（= issue #107 の見え方）なら失敗
  else if (th && th.ambientBand && th.ambientBand.size >= 8 && th.ambientNonZero === false) process.exitCode = 1;
}

function buildJudgePrompt(summary) {
  return `# AI 判定プロンプト: youtublur 初回ブラー描画（issue #107）

あなたは Chrome 拡張 youtublur の描画品質を判定するレビュアーです。
以下の証跡をもとに、**初回ロード（無操作）でアンビエントブラーが正しく描画されたか**を判定してください。

## 背景
- 正常（画像B）: プレイヤーの余白（レターボックス/ピラーボックス）に、動画を強くぼかした
  反射が背景として描画され、中央の動画はくっきり見える。
- 不具合（画像A）: ブラーが正しく反映されず、引き伸ばされた低解像度の単色スメアが
  「じわじわ色が変わる」だけ。タブ切替で初めて正常化する。

## 判定材料
1. \`player-first-load.png\` … 初回ロード（**無操作**）のスクリーンショット。
   既定 watch 表示では動画がプレイヤーを充たしアンビエント帯は生じないため、ここでの核心は
   canvas 寸法がプレイヤーに追従していること。
2. \`player-theater.png\` … シアター/ワイド切替後。アンビエント帯（ブラーが視認できる領域）が生じる。
   画像A/B の対象シナリオはこちら。
3. 決定的メトリクス（下記 JSON）:
\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## 判定基準
- \`firstLoad.canvasMatchesContainer\` が false → **不合格**（canvas 寸法がプレイヤーに追従していない＝issue #107 再発）。
- \`theater.ambientBand.size >= 8\`（帯あり）なのに \`theater.ambientNonZero\` が false → **不合格**（帯にブラー未描画）。
- \`theater.centerCleared\` が false → 要確認（中央の動画領域が透明にクリアされていない）。
- \`theater.ambientStdDev\` が極端に小さい（例 < 3）→ 単色スメアの疑い（画像A）。\`player-theater.png\` で確認。
- \`player-theater.png\` のアンビエント帯が、動画を強くぼかした反射として自然に見えること（画像B）。

## 出力
\`PASS\` または \`FAIL\` と、理由を 2-3 行で述べてください。FAIL の場合はどのメトリクス/画像が根拠かを明示してください。
`;
}

main();
