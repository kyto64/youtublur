// docs/privacy/index.html: 静的ポリシーページ。外部スクリプト・トラッカーを使わず、両言語が載り、各所からリンクされていること。
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');

describe('docs/privacy/index.html', () => {
  const html = read('docs', 'privacy', 'index.html');

  test('has no scripts, external stylesheets or cookies', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/i);
    expect(html).not.toMatch(/document\.cookie/);
  });

  test('contains both Japanese and English policies with the contact address', () => {
    expect(html).toContain('id="ja"');
    expect(html).toContain('id="en"');
    expect(html).toContain('最終更新日: 2026年11月5日');
    expect(html).toContain('Last updated: November 5, 2026');
    expect(html.match(/youtublur@kyto\.jp/g).length).toBeGreaterThanOrEqual(4);
  });

  test('is linked from README and the uninstall survey footer', () => {
    expect(read('README.md')).toContain('https://kyto64.github.io/youtublur/privacy/');
    expect(read('docs', 'uninstall', 'index.html')).toContain('href="../privacy/"');
  });
});
