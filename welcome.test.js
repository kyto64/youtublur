import { vi } from 'vitest';

describe('welcome.js', () => {
  let api;

  beforeEach(() => {
    document.body.innerHTML = `
      <h1 id="welcomeTitle"></h1>
      <p id="welcomeTheaterHint"></p>
      <p id="welcomePopupHint"></p>
      <button id="welcomeClose"></button>
    `;
    global.chrome = {
      i18n: {
        getMessage: vi.fn((key) => `msg:${key}`),
        getUILanguage: vi.fn(() => 'ja')
      },
      runtime: {},
      tabs: {
        getCurrent: vi.fn((cb) => cb({ id: 42 })),
        remove: vi.fn()
      }
    };
    delete require.cache[require.resolve('./welcome.js')];
    api = require('./welcome.js');
  });

  test('fills every text from i18n', () => {
    api.applyWelcomeStrings();
    expect(document.documentElement.lang).toBe('ja');
    expect(document.title).toBe('msg:welcomeTitle');
    for (const id of ['welcomeTitle', 'welcomeTheaterHint', 'welcomePopupHint', 'welcomeClose']) {
      expect(document.getElementById(id).textContent).toBe(`msg:${id}`);
    }
  });

  test('the button closes its own tab', () => {
    api.initWelcomePage();
    document.getElementById('welcomeClose').click();
    expect(chrome.tabs.getCurrent).toHaveBeenCalled();
    expect(chrome.tabs.remove).toHaveBeenCalledWith(42);
  });

  test('falls back to window.close when the tab is unknown', () => {
    chrome.tabs.getCurrent = vi.fn((cb) => cb(undefined));
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    api.closeWelcomeTab();
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });

  test('falls back to window.close when the tabs API throws', () => {
    chrome.tabs.getCurrent = vi.fn(() => {
      throw new Error('no tabs');
    });
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    api.closeWelcomeTab();
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});
