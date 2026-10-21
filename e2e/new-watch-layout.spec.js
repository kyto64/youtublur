const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  youtublurCanvasLocator,
  openExtensionPopup,
} = require('./helpers');

/**
 * 新しい視聴ページレイアウト（段階的ロールアウト中で、この環境の実ページでは再現しない）を
 * CSS で模擬する。シアター切替ボタンを隠し、#movie_player をラッパーより狭くして
 * 左右に余白を作る。詳細は docs/testing.md「新しい視聴ページレイアウトの検証」を参照。
 */
const NEW_LAYOUT_CSS = `
  .ytp-size-button { display: none !important; }
  ytd-player#ytd-player #container.ytd-player { width: 60% !important; margin: 0 auto !important; }
`;

async function simulateNewLayout(page) {
  await page.addStyleTag({ content: NEW_LAYOUT_CSS });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

/** canvas の載っている要素が #movie_player より広いこと（= 左右の余白を覆っていること） */
async function measureHost(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('yt-light-bg-blur-canvas');
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!canvas || !player || !canvas.parentElement) return null;
    const host = canvas.parentElement;
    return {
      hostId: host.id || host.tagName.toLowerCase(),
      hostWidth: host.getBoundingClientRect().width,
      hostClientWidth: host.clientWidth,
      playerWidth: player.getBoundingClientRect().width,
      canvasWidth: canvas.width,
      isPlayer: host === player,
    };
  });
}

test.describe('new watch layout (simulated)', () => {
  test.use({ timeout: 60000 });

  test('blur covers the side margins next to the player', async ({ page, browserName }) => {
    if (browserName !== 'firefox') {
      await page.setViewportSize({ width: 1600, height: 900 });
    }
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 15000 });

    await simulateNewLayout(page);

    // レイアウト変化を検知して canvas がラッパー（ホスト）に載せ替わるのを待つ
    await expect
      .poll(async () => {
        const m = await measureHost(page);
        if (!m) return false;
        return !m.isPlayer
          && m.hostWidth > m.playerWidth + 8
          && Math.abs(m.canvasWidth - m.hostClientWidth) <= 1;
      }, { timeout: 20000 })
      .toBe(true);

    // 左右の余白にブラーが描かれ、動画中央は透明にクリアされていること
    await expect
      .poll(
        async () =>
          canvas.evaluate((el) => {
            const ctx = el.getContext('2d');
            const player = document.querySelector('#movie_player, .html5-video-player');
            const video = player?.querySelector('video');
            if (!ctx || !player || !video || el.width === 0) return false;
            const cRect = el.getBoundingClientRect();
            const pRect = player.getBoundingClientRect();
            const vRect = video.getBoundingClientRect();
            const scaleX = el.width / cRect.width;
            const marginWidth = (pRect.left - cRect.left) * scaleX;
            if (marginWidth < 8) return false;
            const sideX = Math.max(1, Math.floor(marginWidth / 2));
            const sideY = Math.floor(el.height / 2);
            const centerX = Math.floor((vRect.left + vRect.width / 2 - cRect.left) * scaleX);
            const centerY = Math.floor((vRect.top + vRect.height / 2 - cRect.top) * (el.height / cRect.height));
            const side = Array.from(ctx.getImageData(sideX, sideY, 1, 1).data);
            const center = Array.from(ctx.getImageData(centerX, centerY, 1, 1).data);
            return side.some((v) => v !== 0) && center.every((v) => v === 0);
          }),
        { timeout: 20000 }
      )
      .toBe(true);
  });

  test('solid color fills the side margins next to the player', async ({
    page,
    context,
    extensionId,
    browserName,
  }) => {
    if (browserName === 'firefox') {
      await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
      await waitForWatchPlayer(page);
      await expect(youtublurCanvasLocator(page)).toBeAttached({ timeout: 15000 });
      await simulateNewLayout(page);
      // Firefox E2E は実拡張ではなく chrome API モックなので、content script の
      // メッセージリスナーを直接呼んで単色モードに切り替える。
      await page.evaluate(() => {
        const listeners = window.__youtublurE2eMessageListeners || [];
        listeners.forEach((l) => l({ type: 'SOLID_COLOR_CHANGED', color: '#000000' }));
        listeners.forEach((l) => l({ type: 'BG_MODE_CHANGED', mode: 'solid' }));
      });
    } else {
      await page.setViewportSize({ width: 1600, height: 900 });
      // e2e/solid-color.spec.js と同様、モードと色を保存してから視聴ページを開く
      const popup = await openExtensionPopup(context, extensionId);
      await popup.locator('label[for="modeSolid"]').click();
      await waitForExtensionStorageMode(popup, 'solid');
      await popup.locator('label[for="solidPresetBlack"]').click();
      await popup.waitForFunction(
        () =>
          new Promise((resolve) => {
            chrome.storage.sync.get('playerSolidColor', (result) => {
              resolve(result.playerSolidColor === '#000000');
            });
          }),
        null,
        { timeout: 15000 }
      );
      await popup.close();
      await page.bringToFront();
      await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
      await waitForWatchPlayer(page);
      await expect
        .poll(async () => page.locator('#movie_player, .html5-video-player').first().getAttribute('data-yt-solid-color'), {
          timeout: 15000,
        })
        .toBe('#000000');
      await simulateNewLayout(page);
    }

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const player = document.querySelector('#movie_player, .html5-video-player');
            const host = document.querySelector('[data-yt-light-bg-host]');
            if (!player || !host) return null;
            return {
              hostColor: host.dataset.ytSolidColor,
              hostBg: getComputedStyle(host).backgroundColor,
              playerColor: player.dataset.ytSolidColor,
              wider: host.getBoundingClientRect().width > player.getBoundingClientRect().width + 8,
            };
          }),
        { timeout: 20000 }
      )
      .toEqual({
        hostColor: '#000000',
        hostBg: 'rgb(0, 0, 0)',
        playerColor: '#000000',
        wider: true,
      });
  });

  test('old layout keeps the canvas inside #movie_player', async ({ page, browserName }) => {
    if (browserName !== 'firefox') {
      await page.setViewportSize({ width: 1600, height: 900 });
    }
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 15000 });
    await expect
      .poll(async () => (await measureHost(page))?.isPlayer, { timeout: 15000 })
      .toBe(true);
    expect(await page.locator('[data-yt-light-bg-host]').count()).toBe(0);
  });
});
