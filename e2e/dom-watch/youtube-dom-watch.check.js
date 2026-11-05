/**
 * 実 youtube.com の DOM が、拡張の依存セレクタ（youtube-dom-contract.js）と一致するかの定期チェック。
 * playwright.dom-watch.config.js 経由で `.github/workflows/youtube-dom-watch.yml` からだけ実行する
 * （ファイル名が *.check.js なので PR の E2E には拾われない）。
 *
 * 各チェックは dom-watch-results/report/<name>.json に結果を書く。
 * scripts/dom-watch-issue.mjs がそれを読み、失敗があれば issue「YouTube DOM 変化の疑い」を開く/更新する。
 */
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installYouTubeFixture } = require('../youtube-fixture');
const {
  PATHS,
  WATCH_URL,
  SHORTS_URL,
  RESULTS_URL,
} = require('./youtube-dom-contract');
const {
  evaluateContract,
  requiredFailures,
  optionalMisses,
  evaluateThemeSignals,
} = require('./dom-checks');

const RESULTS_DIR = path.join(__dirname, '..', '..', 'dom-watch-results');
const REPORT_DIR = path.join(RESULTS_DIR, 'report');
const MAX_ATTEMPTS = 3;
const READY_TIMEOUT_MS = 25_000;

// 同意ダイアログ（EU など）を出にくくする Cookie。出てしまった場合は dismissConsent が押す。
const COOKIES = [
  { name: 'CONSENT', value: 'PENDING+999', domain: '.youtube.com', path: '/' },
  { name: 'SOCS', value: 'CAI', domain: '.youtube.com', path: '/' },
];

test.beforeEach(async ({ context }) => {
  await context.addCookies(COOKIES);
});

function ensureDirs() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/**
 * EU の consent.youtube.com ページや、ページ内の同意ダイアログを閉じる。無ければ何もしない。
 * @param {import('@playwright/test').Page} page
 */
async function dismissConsent(page) {
  const buttonName = /reject all|accept all|すべて拒否|すべて同意/i;
  for (let i = 0; i < 2; i++) {
    const onConsentHost = /^https?:\/\/consent\.(youtube|google)\.com\//.test(page.url());
    const button = page.getByRole('button', { name: buttonName }).first();
    const visible = await button.isVisible().catch(() => false);
    if (!onConsentHost && !visible) return;
    await button.click({ timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
}

/**
 * Google の bot 判定（google.com/sorry の reCAPTCHA）や未解決の同意ページ。
 * これは YouTube の DOM 変化ではなく実行環境（IP）側の問題なので、DOM 変化とは別に扱う。
 * @param {import('@playwright/test').Page} page
 */
async function detectBlocked(page) {
  const url = page.url();
  if (/^https?:\/\/([\w-]+\.)*google\.[\w.]+\/sorry\//.test(url)) return `bot 判定ページ（${url.slice(0, 80)}...）`;
  if (/^https?:\/\/consent\.(youtube|google)\.com\//.test(url)) return `同意ページを閉じられなかった（${url.slice(0, 80)}）`;
  const captcha = await page.locator('#captcha-form').count().catch(() => 0);
  return captcha > 0 ? 'reCAPTCHA フォームが表示された' : '';
}

/**
 * DOM のアウトライン（tag#id.class）。失敗時に issue へ載せる DOM スニペット。
 * @param {import('@playwright/test').Page} page
 */
async function domOutline(page) {
  return page
    .evaluate(() => {
      const root =
        document.querySelector('ytd-player')?.parentElement ||
        document.querySelector('ytd-shorts') ||
        document.querySelector('ytd-app') ||
        document.body;
      const lines = [];
      const walk = (el, depth) => {
        if (lines.length >= 160 || depth > 5) return;
        const cls = (typeof el.className === 'string' ? el.className : '')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join('.');
        lines.push(`${'  '.repeat(depth)}${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`);
        for (const child of el.children) walk(child, depth + 1);
      };
      walk(root, 0);
      return lines.join('\n');
    })
    .catch((e) => `(outline failed: ${e.message})`);
}

/**
 * 契約を当てる。同意ダイアログ・広告・遅いロードを吸収するため、最大 MAX_ATTEMPTS 回やり直す。
 * @param {import('@playwright/test').Page} page
 * @param {{ url: string, kind: 'watch'|'shorts'|'results', readySelector: string, pathPattern?: RegExp, live: boolean }} opts
 */
async function runContractWithRetry(page, opts) {
  let results = [];
  let error = '';
  let blocked = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    error = '';
    try {
      if (attempt === 1) {
        await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      } else {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
      }
      await dismissConsent(page);
      blocked = await detectBlocked(page);
      if (blocked) {
        // ブロックされているときは DOM を待っても無駄なので、間を空けて次の attempt へ。
        await page.waitForTimeout(5000);
        continue;
      }
      await page
        .waitForSelector(opts.readySelector, { state: 'attached', timeout: READY_TIMEOUT_MS })
        .catch(() => {});
      // SPA で子孫（video 等）が少し遅れて出ることがあるため、短く待ってから評価する。
      await page.waitForTimeout(1500);
      results = await evaluateContract(page, opts.kind, { fixture: !opts.live });
      const pathOk = !opts.pathPattern || opts.pathPattern.test(new URL(page.url()).pathname);
      if (!pathOk) {
        results.push({
          type: 'selector',
          target: `URL path ${opts.pathPattern}`,
          kind: 'required',
          ok: false,
          count: 0,
          why: `最終 URL が ${opts.pathPattern} に一致しない: ${page.url()}`,
        });
      }
      if (requiredFailures(results).length === 0) return { results, attempts: attempt, error, blocked: '' };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { results, attempts: MAX_ATTEMPTS, error, blocked };
}

/**
 * レポート JSON と失敗時の証跡（スクリーンショット・DOM スニペット）を書き出す。
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {object} report
 */
async function writeReport(page, name, report) {
  ensureDirs();
  const failed = !report.ok;
  if (failed) {
    const shot = `${name}.png`;
    await page.screenshot({ path: path.join(RESULTS_DIR, shot), fullPage: false }).catch(() => {});
    report.screenshot = shot;
    const snippetFile = `${name}.dom.txt`;
    fs.writeFileSync(path.join(RESULTS_DIR, snippetFile), await domOutline(page));
    report.domSnippet = snippetFile;
  }
  report.finalUrl = page.url();
  fs.writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(report, null, 2));
}

function buildReport(name, kind, url, live, run, extraFailures = []) {
  // ブロック中は DOM を評価できていないので、DOM 変化（failures）としては数えない。
  const failures = run.blocked ? [] : [...requiredFailures(run.results), ...extraFailures];
  return {
    blocked: run.blocked || '',
    name,
    pageKind: kind,
    live,
    url,
    attempts: run.attempts,
    ok: failures.length === 0 && !run.error && !run.blocked,
    error: run.error,
    failures,
    warnings: optionalMisses(run.results),
    results: run.results,
  };
}

async function failIfNeeded(report) {
  if (!report.ok) {
    if (report.blocked) {
      throw new Error(`blocked (DOM は評価できていない) for ${report.name}: ${report.blocked}`);
    }
    const detail = [...report.failures.map((f) => `${f.target} (count=${f.count})`), report.error]
      .filter(Boolean)
      .join(', ');
    throw new Error(`DOM contract failed for ${report.name}: ${detail}`);
  }
}

test('live: watch page', async ({ page }) => {
  const run = await runContractWithRetry(page, {
    url: WATCH_URL,
    kind: 'watch',
    readySelector: '#movie_player',
    pathPattern: PATHS.watch,
    live: true,
  });
  const theme = await evaluateThemeSignals(page).catch(() => ({ ok: false, hasDarkAttr: false, cssVar: '' }));
  const extra = theme.ok
    ? []
    : [
        {
          type: 'selector',
          target: 'html[dark] / --yt-spec-base-background',
          kind: 'required',
          ok: false,
          count: 0,
          why: 'detectYouTubeTheme が頼るテーマ指標（html[dark] / theme=dark / --yt-spec-base-background）が全て消えた',
        },
      ];
  const report = buildReport('live-watch', 'watch', WATCH_URL, true, run, extra);
  await writeReport(page, 'live-watch', report);
  await failIfNeeded(report);
});

test('live: shorts page', async ({ page }) => {
  const run = await runContractWithRetry(page, {
    url: SHORTS_URL,
    kind: 'shorts',
    readySelector: 'ytd-shorts',
    pathPattern: PATHS.shorts,
    live: true,
  });
  const report = buildReport('live-shorts', 'shorts', SHORTS_URL, true, run);
  await writeReport(page, 'live-shorts', report);
  await failIfNeeded(report);
});

test('live: SPA navigation (results -> watch)', async ({ page }) => {
  const run = await runContractWithRetry(page, {
    url: RESULTS_URL,
    kind: 'results',
    readySelector: 'ytd-video-renderer',
    live: true,
  });
  const extra = [];
  let spaReport = null;
  if (requiredFailures(run.results).length === 0 && !run.error) {
    // 拡張は yt-navigate-finish を購読して SPA 遷移後に observePlayer を再評価する（issue #107）。
    // 実 YouTube でこのイベントが発火し、その後 watch の契約が満たされることを確かめる。
    await page.evaluate(() => {
      window.__ytNavFinishCount = 0;
      window.addEventListener('yt-navigate-finish', () => {
        window.__ytNavFinishCount++;
      });
    });
    try {
      const link = page
        .locator('ytd-video-renderer a#video-title, ytd-video-renderer a#thumbnail')
        .first();
      await link.click({ timeout: 20_000 });
      await page.waitForFunction(() => location.pathname === '/watch', null, { timeout: 30_000 });
      const fired = await page
        .waitForFunction(() => window.__ytNavFinishCount > 0, null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!fired) {
        extra.push({
          type: 'selector',
          target: 'event: yt-navigate-finish',
          kind: 'required',
          ok: false,
          count: 0,
          why: 'SPA 遷移後に yt-navigate-finish が発火しない（拡張の SPA 追従が壊れる）',
        });
      }
      await page.waitForSelector('#movie_player', { state: 'attached', timeout: READY_TIMEOUT_MS }).catch(() => {});
      await page.waitForTimeout(1500);
      spaReport = await evaluateContract(page, 'watch', { fixture: false });
      extra.push(...requiredFailures(spaReport));
    } catch (e) {
      extra.push({
        type: 'selector',
        target: 'SPA navigation (click -> /watch)',
        kind: 'required',
        ok: false,
        count: 0,
        why: `SPA 遷移の再現に失敗: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  const report = buildReport('live-spa', 'results', RESULTS_URL, true, run, extra);
  if (spaReport) report.results = [...report.results, ...spaReport];
  await writeReport(page, 'live-spa', report);
  await failIfNeeded(report);
});

// fixture（e2e/youtube-fixture.js）が契約を満たすか。live と同じ契約・同じ関数で当て、
// issue では live 側の失敗と並べて「fixture は通るが live は通らない（= fixture が実 YouTube と乖離）」を示す。
for (const [kind, url, ready] of [
  ['watch', WATCH_URL, '#movie_player'],
  ['results', RESULTS_URL, 'ytd-video-renderer'],
]) {
  test(`fixture: ${kind} page satisfies the contract`, async ({ page, context }) => {
    await installYouTubeFixture(context);
    const run = await runContractWithRetry(page, { url, kind, readySelector: ready, live: false });
    const report = buildReport(`fixture-${kind}`, kind, url, false, run);
    await writeReport(page, `fixture-${kind}`, report);
    await failIfNeeded(report);
  });
}
