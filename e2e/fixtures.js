const { test: base, chromium } = require('@playwright/test');
const path = require('path');

const extensionPath = path.join(__dirname, '..'); // path to root where manifest.json is

const test = base.extend({
  context: async ({ }, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // extensions require headless: false or new headless mode
      args: [
        `--headless=new`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let page = await context.newPage();
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
