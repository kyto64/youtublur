const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  navigateToWatchViaSpa,
  openExtensionPopup,
} = require('./helpers');

/**
 * issue #107 回帰アサーション（中核）。
 * blur canvas のバッキングストア寸法がプレイヤー（#movie_player）の表示寸法に追従していることを検証する。
 * 不具合時は初期レイアウト時点の寸法（や canvas 既定の 300x150）で固定され、描画ループが
 * コンテナ寸法を読み直さないため、誤スケールのまま描き続ける。これはアンビエント帯の有無に
 * 関係なく成立する条件なので、ユーザー操作（タブ切替・サイズボタン）に依存せず初回ロードで検証できる。
 * @param {import('@playwright/test').Locator} youtublurCanvas
 */
async function assertCanvasTracksContainer(youtublurCanvas) {
  await expect
    .poll(
      async () =>
        youtublurCanvas.evaluate((canvas) => {
          const container = canvas.parentElement;
          if (!container) return false;
          const cw = canvas.width;
          const ch = canvas.height;
          if (cw <= 1 || ch <= 1) return false;
          const expectedW = Math.max(1, Math.ceil(container.clientWidth));
          const expectedH = Math.max(1, Math.ceil(container.clientHeight));
          // resizeCanvas の ceil による ±1 の丸めだけ許容する
          return Math.abs(cw - expectedW) <= 1 && Math.abs(ch - expectedH) <= 1;
        }),
      { timeout: 15000 }
    )
    .toBe(true);
}

/**
 * アンビエント帯（レターボックス/ピラーボックス）が実際にブラー描画され、
 * 中央の動画領域は透明にクリアされていることを検証する。
 * 注意: 帯はプレイヤーが動画より大きいレイアウト（シアターモード等）でのみ生じる。
 * 既定の watch 表示では YouTube が #movie_player を動画のアスペクトに合わせるため帯が無く、
 * このアサーションは帯が生じるレイアウトに切り替えた後でのみ意味を持つ。
 * @param {import('@playwright/test').Locator} youtublurCanvas
 */
async function assertAmbientBandBlurred(youtublurCanvas) {
  await expect
    .poll(
      async () =>
        youtublurCanvas.evaluate((canvas) => {
          const ctx = canvas.getContext('2d');
          if (!ctx || canvas.width === 0 || canvas.height === 0) return false;
          const video = canvas.parentElement?.querySelector('video');
          if (!video || video.videoWidth === 0 || video.videoHeight === 0) return false;

          const canvasAspect = canvas.width / canvas.height;
          const videoAspect = video.videoWidth / video.videoHeight;
          let sampleX = 1;
          let sampleY = Math.floor(canvas.height / 2);

          if (videoAspect > canvasAspect) {
            const contentHeight = canvas.width / videoAspect;
            const topBarHeight = (canvas.height - contentHeight) / 2;
            if (topBarHeight < 8) return false;
            sampleX = Math.floor(canvas.width / 2);
            sampleY = Math.max(1, Math.floor(topBarHeight / 2));
          } else {
            const contentWidth = canvas.height * videoAspect;
            const sideBarWidth = (canvas.width - contentWidth) / 2;
            if (sideBarWidth < 8) return false;
            sampleX = Math.max(1, Math.floor(sideBarWidth / 2));
          }

          const ambientPixel = Array.from(ctx.getImageData(sampleX, sampleY, 1, 1).data);
          const centerPixel = Array.from(
            ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
          );
          return ambientPixel.some((value) => value !== 0) && centerPixel.every((value) => value === 0);
        }),
      { timeout: 15000 }
    )
    .toBe(true);
}

test('should load extension and apply blur on YouTube', async ({ page, extensionId, context, browserName }) => {
  // 待ち時間の合計（canvas 検証 15s + 追従 15s + 帯 15s + ポップアップ往復）が既定の 30s を超え得るため、
  // このテストだけ延ばす。CI で workers=2 になり YouTube の描画が遅くなっても、
  // 個々の poll が先にタイムアウトして原因が分かるようにする。
  test.setTimeout(90000);

  if (browserName !== 'firefox') {
    await page.setViewportSize({ width: 2048, height: 1152 });
  }

  await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);

  await waitForWatchPlayer(page);

  const youtublurCanvas = youtublurCanvasLocator(page);
  await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
  await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });
  await expect(youtublurCanvas).toHaveCSS('z-index', '1');

  if (browserName !== 'firefox') {
    // issue #107 回帰検証: ユーザー操作（hover / サイズボタンクリック / タブ切替）を一切行わない
    // 初回ロードのみで、canvas のバッキングサイズがプレイヤーの表示寸法に追従していることを検証する。
    // 旧テストはこの検証を持たず、サイズボタンのクリック（= resize による自己修復を兼ねる）後の
    // 画素チェックだけに頼っていたため、初回ロードで誤スケールのまま固定される不具合を素通りさせていた。
    await assertCanvasTracksContainer(youtublurCanvas);

    // シアター/ワイドレイアウトに切り替えてアンビエント帯を発生させ、その帯が
    // 正しくブラー描画されていること、サイズ追従が維持されていることを検証する。
    // 帯の画素判定は video のメタデータ（videoWidth/Height）が揃うまで常に false になるため、
    // レイアウト切替の前に動画の準備完了を待つ（poll の 15s を無駄に消費しない）。
    await page.waitForFunction(
      () => {
        const video = document.querySelector('#movie_player video');
        return !!video && video.videoWidth > 0 && video.videoHeight > 0;
      },
      null,
      { timeout: 15000 }
    );
    await page.locator('#movie_player').hover();
    const sizeButton = page.locator('.ytp-size-button');
    await sizeButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    await sizeButton.click({ timeout: 5000 }).catch(() => {});
    await assertCanvasTracksContainer(youtublurCanvas);
    await assertAmbientBandBlurred(youtublurCanvas);
  }

  if (browserName === 'firefox') {
    test.skip(true, 'Firefox uses a chrome API mock instead of a real extension, so the popup and storage-based mode switching cannot be tested there.');
  }

  const popupPage = await openExtensionPopup(context, extensionId);
  await expect(popupPage.locator('#popupHeading')).toBeVisible();

  await popupPage.locator('label[for="modeSolid"]').click();
  await waitForExtensionStorageMode(popupPage, 'solid');

  await page.bringToFront();
  await page.reload();

  await waitForWatchPlayer(page);

  const reloadedCanvas = youtublurCanvasLocator(page);
  await expect(reloadedCanvas).toBeHidden({ timeout: 15000 });
});

// Firefox E2E は chrome API モックを使い、実拡張のポップアップや SPA 遷移経路を検証できない。
// fixture（ブラウザ起動）の前にスキップされるよう、条件付き skip を describe 先頭に置く。
test.describe('Chromium only', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox E2E uses a chrome API mock instead of a real extension.');

  test('should apply blur after SPA navigation from a non-player page (issue #107)', async ({ page }) => {
    // 回帰テスト本体。直接 /watch を開く（F5 相当）と不具合が出ないため、
    // content script を非プレイヤーページで初期化 → SPA 遷移で /watch に入る経路を必ず通す。
    // 修正前はこの経路で blur canvas が生成されず（タブ切替まで反映されない）、
    // yt-navigate-finish の購読によりタブ切替なしで生成されることを検証する。
    await page.setViewportSize({ width: 2048, height: 1152 });
    await navigateToWatchViaSpa(page);

    const youtublurCanvas = youtublurCanvasLocator(page);
    // タブ切替・サイズ変更などの修復操作を一切せず、SPA 遷移だけで canvas が生成されること
    await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
    await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });
    await assertCanvasTracksContainer(youtublurCanvas);
  });

  test('should keep blur visible when extension popup is opened in a tab (Chromium)', async ({
    page,
    context,
    extensionId,
  }) => {
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const youtublurCanvas = youtublurCanvasLocator(page);
    await expect(youtublurCanvas).toBeAttached({ timeout: 15000 });
    await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });

    const popupPage = await openExtensionPopup(context, extensionId);
    await expect(popupPage.locator('#popupHeading')).toBeVisible();

    await page.bringToFront();
    await expect(youtublurCanvas).toBeVisible({ timeout: 15000 });

    await popupPage.close();
  });
});
