const { test, expect } = require('./fixtures');
const { evaluateContract, requiredFailures } = require('./dom-watch/dom-checks');
const { PATHS } = require('./dom-watch/youtube-dom-contract');

// ローカル fixture が、実 YouTube の DOM 契約（e2e/dom-watch/youtube-dom-contract.js）を満たし続けているか。
// 実 YouTube との突き合わせは定期チェック（.github/workflows/youtube-dom-watch.yml）が同じ契約で行う。
// 契約にセレクタを足したのに fixture が追従していない、というドリフトを PR 時点で検知する。

test('fixture /watch satisfies the DOM contract', async ({ page }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.waitForSelector('#movie_player', { state: 'attached' });
  expect(new URL(page.url()).pathname).toMatch(PATHS.watch);
  const results = await evaluateContract(page, 'watch', { fixture: true });
  expect(requiredFailures(results)).toEqual([]);
});

test('fixture /results satisfies the DOM contract', async ({ page }) => {
  await page.goto('https://www.youtube.com/results?search_query=lofi');
  await page.waitForSelector('ytd-video-renderer', { state: 'attached' });
  const results = await evaluateContract(page, 'results', { fixture: true });
  expect(requiredFailures(results)).toEqual([]);
});
