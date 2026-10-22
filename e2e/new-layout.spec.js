const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForExtensionStorageMode,
  waitForWatchPlayer,
  openExtensionPopup,
  youtublurCanvasLocator,
} = require('./helpers');

const MARGIN_PX = 48;
const PLAYER_WIDTH_PX = 800;

// 新レイアウト（シアター切替なし、プレイヤー左右に余白）を、実ページに余白と
// size ボタン除去を適用して近似する。実 DOM は未確認のため docs/testing.md を参照。
async function applyNewLayout(page) {
  await page.evaluate(
    ({ margin, width }) => {
      document.querySelectorAll('.ytp-size-button').forEach((el) => el.remove());
      const player = document.querySelector('#movie_player, .html5-video-player');
      if (!player) throw new Error('Player element not found');
      const host = player.closest('#player-container-outer');
      if (!host) throw new Error('#player-container-outer not found');
      host.style.padding = `0 ${margin}px`;
      player.style.width = `${width}px`;
      player.style.height = '450px';
      player.style.margin = '0 auto';
    },
    { margin: MARGIN_PX, width: PLAYER_WIDTH_PX }
  );
}

test.describe('New layout (no theater toggle, side margins)', () => {
  test.use({ timeout: 45000 });

  test('blur is drawn in the side margins as well as inside the player', async ({ page }) => {
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    await applyNewLayout(page);

    await expect
      .poll(async () => canvas.evaluate((c) => c.width), { timeout: 10000 })
      .toBe(PLAYER_WIDTH_PX);
    await expect(canvas).toHaveAttribute('id', 'yt-light-bg-blur-canvas');
    const player = page.locator('#movie_player, .html5-video-player').first();
    await expect(player).toHaveAttribute('data-yt-light-bg-mode', 'blur');

    const marginCanvas = page.locator('#yt-light-bg-blur-margin-canvas');
    await expect(marginCanvas).toBeAttached({ timeout: 10000 });
    expect(await marginCanvas.count()).toBe(1);
    const sizes = await page.evaluate(() => {
      const host = document.querySelector('#player-container-outer');
      const margin = document.querySelector('#yt-light-bg-blur-margin-canvas');
      if (!host || !margin) return null;
      return {
        hostWidth: Math.ceil(host.clientWidth),
        hostHeight: Math.ceil(host.clientHeight),
        marginWidth: margin.width,
        marginHeight: margin.height,
        parentId: margin.parentElement && margin.parentElement.id,
      };
    });
    expect(sizes).not.toBeNull();
    expect(sizes.parentId).toBe('player-container-outer');
    expect(sizes.marginWidth).toBe(sizes.hostWidth);
    expect(sizes.marginHeight).toBe(sizes.hostHeight);
    // 余白の分だけプレイヤー内 canvas より広い
    expect(sizes.marginWidth).toBeGreaterThan(PLAYER_WIDTH_PX);
  });

  test('solid color fills the side margins', async ({ page, context, extensionId, browserName }) => {
    test.skip(
      browserName === 'firefox',
      'Firefox E2E uses a chrome API mock; the real popup and storage are not available.'
    );

    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);

    const popup = await openExtensionPopup(context, extensionId);
    await popup.locator('label[for="modeSolid"]').click();
    await waitForExtensionStorageMode(popup, 'solid');
    await popup.close();

    await page.bringToFront();
    await page.reload();
    await waitForWatchPlayer(page);
    const player = page.locator('#movie_player, .html5-video-player').first();
    await expect
      .poll(async () => player.getAttribute('data-yt-solid-color'), { timeout: 15000 })
      .toMatch(/^#(f1f1f1|181818)$/);
    const color = await player.getAttribute('data-yt-solid-color');

    await applyNewLayout(page);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const host = document.querySelector('#player-container-outer');
            return host ? host.style.getPropertyValue('background-color') : null;
          }),
        { timeout: 10000 }
      )
      .not.toBe('');
    const hostColor = await page.evaluate(() => {
      const host = document.querySelector('#player-container-outer');
      return host ? getComputedStyle(host).backgroundColor : null;
    });
    expect(hostColor).not.toBeNull();
    const expected = await page.evaluate((hex) => {
      const probe = document.createElement('div');
      probe.style.color = hex;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    }, color);
    expect(hostColor).toBe(expected);
    await expect(page.locator('#yt-light-bg-blur-margin-canvas')).toBeHidden();
  });
});
