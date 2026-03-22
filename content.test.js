import { vi } from 'vitest';
const {
  createBlurCanvas,
  applyMode,
  getPlayerContainer,
  getVideoElement,
  resetState,
  getMode,
  parseCssColorToRgba
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

  describe('parseCssColorToRgba', () => {
    test('parses rgb()', () => {
      expect(parseCssColorToRgba('rgb(10, 20, 30)')).toEqual({
        r: 10,
        g: 20,
        b: 30,
        a: 1
      });
    });

    test('parses rgba() with alpha', () => {
      expect(parseCssColorToRgba('rgba(1, 2, 3, 0.5)')).toEqual({
        r: 1,
        g: 2,
        b: 3,
        a: 0.5
      });
    });

    test('parses #rrggbb', () => {
      expect(parseCssColorToRgba('#f1f1f1')).toEqual({
        r: 241,
        g: 241,
        b: 241,
        a: 1
      });
    });

    test('parses #rgb shorthand', () => {
      expect(parseCssColorToRgba('#abc')).toEqual({
        r: 170,
        g: 187,
        b: 204,
        a: 1
      });
    });

    test('falls back for invalid input', () => {
      expect(parseCssColorToRgba('not-a-color')).toEqual({
        r: 241,
        g: 241,
        b: 241,
        a: 1
      });
      expect(parseCssColorToRgba('')).toEqual({
        r: 241,
        g: 241,
        b: 241,
        a: 1
      });
    });
  });
});
