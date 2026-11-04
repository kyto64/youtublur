const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');

// docs/uninstall/ の静的アンケートページを実際に開いて検証する。
// 送信先（Google フォームの formResponse）は route でモックし、外部へは実リクエストを送らない。
const PAGE_URL = pathToFileURL(path.join(__dirname, '..', 'docs', 'uninstall', 'index.html')).href;

async function mockFormResponse(page) {
  const requests = [];
  await page.route('https://docs.google.com/**', async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname.endsWith('/formResponse')) {
      requests.push({
        method: request.method(),
        url: request.url(),
        body: new URLSearchParams(request.postData() || ''),
      });
      await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
      return;
    }
    await route.abort();
  });
  return requests;
}

test.describe('uninstall survey page', () => {
  test('shows an error when submitting without choosing a reason', async ({ page }) => {
    const requests = await mockFormResponse(page);
    await page.goto(`${PAGE_URL}?lang=en`);

    await expect(page.locator('#error')).toBeHidden();
    await page.locator('#submit').click();

    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#error')).toHaveText('Please choose one reason.');
    await expect(page.locator('#surveyForm')).toBeVisible();
    await expect(page.locator('#done')).toBeHidden();
    expect(requests).toHaveLength(0);

    // 理由を選ぶとエラーは消える。
    await page.locator('input[name="reason"][value="slow"]').check();
    await expect(page.locator('#error')).toBeHidden();
  });

  test('posts reason, comment, version and lang to the Google Form and shows the thank-you', async ({
    page,
  }) => {
    const requests = await mockFormResponse(page);
    await page.goto(`${PAGE_URL}?lang=en&v=1.12.39`);

    await page.locator('input[name="reason"][value="not_needed"]').check();
    await page.locator('#comment').fill('Works fine, just not needed.');
    const posted = page.waitForRequest((req) => req.url().endsWith('/formResponse'));
    await page.locator('#submit').click();
    await posted;

    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#doneTitle')).toHaveText('Thank you!');
    await expect(page.locator('#surveyForm')).toBeHidden();

    expect(requests).toHaveLength(1);
    const [req] = requests;
    expect(req.method).toBe('POST');
    expect(req.url).toMatch(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[^/]+\/formResponse$/);
    expect(req.body.get('entry.333345560')).toBe('not_needed');
    expect(req.body.get('entry.2058122616')).toBe('Works fine, just not needed.');
    expect(req.body.get('entry.1160209855')).toBe('1.12.39');
    expect(req.body.get('entry.61505378')).toBe('en');
  });

  test('still shows the thank-you when the send fails', async ({ page }) => {
    await page.route('https://docs.google.com/**', (route) => route.abort());
    await page.goto(`${PAGE_URL}?lang=en`);

    await page.locator('input[name="reason"][value="other"]').check();
    await page.locator('#submit').click();

    await expect(page.locator('#done')).toBeVisible();
    await expect(page.locator('#surveyForm')).toBeHidden();
  });

  test('switches language with ?lang= and sends the matching lang value', async ({ page }) => {
    const requests = await mockFormResponse(page);

    await page.goto(`${PAGE_URL}?lang=ja`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await expect(page.locator('#question')).toHaveText('なぜアンインストールしましたか？');
    await expect(page.locator('#submit')).toHaveText('送信');
    await page.locator('#submit').click();
    await expect(page.locator('#error')).toHaveText('理由をひとつ選んでください。');

    await page.locator('input[name="reason"][value="broken"]').check();
    await page.locator('#submit').click();
    await expect(page.locator('#doneTitle')).toHaveText('ありがとうございました！');
    expect(requests).toHaveLength(1);
    expect(requests[0].body.get('entry.333345560')).toBe('broken');
    expect(requests[0].body.get('entry.61505378')).toBe('ja');
    // v 未指定なら version は空で送る。
    expect(requests[0].body.get('entry.1160209855')).toBe('');

    await page.goto(`${PAGE_URL}?lang=en`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#question')).toHaveText('Why did you uninstall it?');
    await expect(page.locator('#submit')).toHaveText('Send');
  });
});
