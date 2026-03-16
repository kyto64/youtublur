const STORAGE_KEY = 'playerBackgroundMode';

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({ [STORAGE_KEY]: 'solid' }, (items) => {
    const mode = items[STORAGE_KEY];
    document.getElementById(mode === 'blur' ? 'modeBlur' : 'modeSolid').checked = true;
  });

  document.querySelectorAll('input[name="bgMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      chrome.storage.sync.set({ [STORAGE_KEY]: mode }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id && tab.url?.includes('youtube.com')) {
          chrome.tabs.sendMessage(tab.id, { type: 'BG_MODE_CHANGED', mode }).catch(() => {});
        }
      });
      });
    });
  });
});
