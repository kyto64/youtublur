import { vi } from 'vitest';
const {
  createBlurCanvas,
  applyMode,
  getPlayerContainer,
  getVideoElement,
  resetState,
  getMode
} = require('./content.js');

describe('content.js', () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      filter: '',
      drawImage: vi.fn()
    }));
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    resetState();
  });

  test('getPlayerContainer returns correct element', () => {
    const div = document.createElement('div');
    div.id = 'movie_player';
    document.body.appendChild(div);
    expect(getPlayerContainer()).toBe(div);
  });

  test('createBlurCanvas creates a canvas', () => {
    const container = document.createElement('div');
    container.style.position = 'static';
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    const canvas = createBlurCanvas(container);
    expect(canvas).not.toBeNull();
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.id).toBe('yt-light-bg-blur-canvas');
    expect(container.style.position).toBe('relative');
  });

  test('applyMode updates currentMode and DOM', () => {
    const container = document.createElement('div');
    const video = document.createElement('video');
    container.appendChild(video);
    document.body.appendChild(container);

    applyMode('blur', container);
    expect(getMode()).toBe('blur');
    expect(container.dataset.ytLightBgMode).toBe('blur');
    
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas.style.display).toBe('');

    applyMode('solid', container);
    expect(getMode()).toBe('solid');
    expect(container.dataset.ytLightBgMode).toBe('solid');
    expect(canvas.style.display).toBe('none');
  });
});
