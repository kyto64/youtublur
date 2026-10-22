const { test, expect } = require('./fixtures');
const {
  STABLE_WATCH_VIDEO_ID,
  waitForWatchPlayer,
  youtublurCanvasLocator,
} = require('./helpers');

// 新レイアウト（シアター切替なし、プレイヤー左右に余白）を、実ページに余白と
// size ボタン除去を適用して近似する。実 DOM は段階配信のため docs/testing.md を参照。
test.describe('New layout (no theater toggle, side margins)', () => {
  test.use({ timeout: 45000 });

  test('blur canvas follows the player when side margins are present', async ({ page }) => {
    await page.goto(`https://www.youtube.com/watch?v=${STABLE_WATCH_VIDEO_ID}`);
    await waitForWatchPlayer(page);
    const canvas = youtublurCanvasLocator(page);
    await expect(canvas).toBeAttached({ timeout: 10000 });

    await page.evaluate(() => {
      document.querySelectorAll('.ytp-size-button').forEach((el) => el.remove());
      const player = document.querySelector('#movie_player, .html5-video-player');
      player.style.width = '800px';
      player.style.height = '450px';
      player.style.margin = '0 auto';
    });

    await expect
      .poll(async () => canvas.evaluate((c) => c.width), { timeout: 10000 })
      .toBe(800);
    await expect(canvas).toHaveAttribute('id', 'yt-light-bg-blur-canvas');
    const player = page.locator('#movie_player, .html5-video-player').first();
    await expect(player).toHaveAttribute('data-yt-light-bg-mode', 'blur');
  });
});
