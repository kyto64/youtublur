const { test: base, chromium, firefox } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const extensionPath = path.join(__dirname, '..');
const GECKO_ID = 'youtublur@kyto64.github.io';

// Read once at module level to avoid repeated disk I/O per test context.
const contentJsSrc = fs.readFileSync(path.join(extensionPath, 'content.js'), 'utf8');

const CONSENT_COOKIE = {
  name: 'CONSENT',
  value: 'PENDING+999',
  domain: '.youtube.com',
  path: '/',
};

const test = base.extend({
  context: async ({ browserName }, use) => {
    let context;

    if (browserName === 'firefox') {
      // Playwright's bundled Firefox does not support loading user extensions.
      // Instead, inject a minimal chrome API mock and the content script directly
      // into YouTube pages so we can test the content script behavior in Firefox.
      // Passing '' lets launchPersistentContext manage the temp directory automatically.
      context = await firefox.launchPersistentContext('', {
        headless: !!process.env.CI,
        firefoxUserPrefs: {
          'media.volume_scale': '0.0',
        },
      });

      // Playwright's bundled Firefox does not expose document.documentElement at
      // addInitScript time, causing MutationObserver.observe() to throw. Instead,
      // inject a loader that defers content.js execution until the document is ready.
      await context.addInitScript(`
        (function () {
          if (!location.hostname.endsWith('youtube.com')) return;

          // Mock the chrome extension API that content.js depends on.
          // Always returns the default 'blur' mode so the canvas is rendered.
          window.chrome = {
            storage: {
              sync: {
                get: function (_keys, callback) { callback({ playerBackgroundMode: 'blur' }); },
                set: function () {},
              },
            },
            runtime: {
              onMessage: { addListener: function () {} },
            },
          };

          function runContentScript() {
            ${contentJsSrc}
          }

          // document.documentElement may not exist yet at init-script time in Firefox.
          if (document.documentElement) {
            runContentScript();
          } else {
            document.addEventListener('DOMContentLoaded', runContentScript, { once: true });
          }
        })();
      `);
    } else {
      context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          ...(process.env.CI ? ['--headless=new'] : []),
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          `--mute-audio`,
        ],
      });
    }

    await context.addCookies([CONSENT_COOKIE]);
    await use(context);
    await context.close();
  },

  extensionId: async ({ browserName, context }, use) => {
    if (browserName === 'firefox') {
      // No real extension in Firefox; return the gecko ID as a placeholder.
      await use(GECKO_ID);
      return;
    }

    const page = await context.newPage();
    await page.goto('chrome://extensions');
    await page.waitForSelector('extensions-manager');
    const extensionId = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager');
      const itemList = manager.shadowRoot.querySelector('extensions-item-list');
      const item = itemList.shadowRoot.querySelector('extensions-item');
      return item.id;
    });
    await page.close();
    await use(extensionId);
  },
});

const expect = test.expect;
module.exports = { test, expect };
