/**
 * Tests for editor-color-utils.js — Pure OKLCH/sRGB color math utilities.
 * Loads the IIFE module via new Function to simulate browser window environment.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modulePath = resolve(__dirname, '../../../skills/vibes/modules/editor-color-utils.js');

let utils;

beforeAll(() => {
  const src = readFileSync(modulePath, 'utf-8');
  const win = {};
  new Function('window', src)(win);
  utils = win.EditorColorUtils;
});

describe('EditorColorUtils module', () => {
  it('exports all 12 required functions', () => {
    const required = [
      'hexToRgb', 'rgbToHex', 'linearize', 'delinearize',
      'rgbToOklab', 'oklabToRgb', 'hexToOklch', 'oklchToHex',
      'oklchClamp', 'relativeLuminance', 'contrastRatio', 'generateHarmony',
    ];
    for (const name of required) {
      expect(utils, `window.EditorColorUtils should exist`).toBeDefined();
      expect(typeof utils[name], `${name} should be a function`).toBe('function');
    }
  });
});

describe('hexToRgb / rgbToHex roundtrip', () => {
  it('converts #ff0000 to [255, 0, 0]', () => {
    const { hexToRgb } = utils;
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
  });

  it('converts [255, 0, 0] back to #ff0000', () => {
    const { rgbToHex } = utils;
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
  });

  it('handles full roundtrip: #ff0000 → rgb → hex', () => {
    const { hexToRgb, rgbToHex } = utils;
    const [r, g, b] = hexToRgb('#ff0000');
    expect(rgbToHex(r, g, b)).toBe('#ff0000');
  });

  it('expands 3-digit shorthand hex', () => {
    const { hexToRgb } = utils;
    expect(hexToRgb('#f00')).toEqual([255, 0, 0]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('handles black and white', () => {
    const { hexToRgb, rgbToHex } = utils;
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
  });

  it('clamps out-of-range rgb values', () => {
    const { rgbToHex } = utils;
    expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
  });
});

describe('hexToOklch / oklchToHex roundtrip', () => {
  it('converts #ff0000 to OKLCH and back within 1-step rounding', () => {
    const { hexToOklch, oklchToHex, hexToRgb } = utils;
    const { l, c, h } = hexToOklch('#ff0000');
    const recovered = oklchToHex(l, c, h);
    const [r1, g1, b1] = hexToRgb('#ff0000');
    const [r2, g2, b2] = hexToRgb(recovered);
    expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(1);
    expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(1);
    expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(1);
  });

  it('returns an object with l, c, h properties', () => {
    const { hexToOklch } = utils;
    const result = hexToOklch('#3498db');
    expect(result).toHaveProperty('l');
    expect(result).toHaveProperty('c');
    expect(result).toHaveProperty('h');
    expect(result.l).toBeGreaterThan(0);
    expect(result.c).toBeGreaterThanOrEqual(0);
    expect(result.h).toBeGreaterThanOrEqual(0);
    expect(result.h).toBeLessThan(360);
  });

  it('hue is in [0, 360) range', () => {
    const { hexToOklch } = utils;
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    for (const hex of colors) {
      const { h } = hexToOklch(hex);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });
});

describe('contrastRatio', () => {
  it('black vs white is approximately 21:1', () => {
    const { contrastRatio } = utils;
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('same color returns 1:1', () => {
    const { contrastRatio } = utils;
    expect(contrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5);
  });

  it('is commutative (order does not matter)', () => {
    const { contrastRatio } = utils;
    const a = contrastRatio('#3498db', '#ffffff');
    const b = contrastRatio('#ffffff', '#3498db');
    expect(a).toBeCloseTo(b, 10);
  });

  it('result is always >= 1', () => {
    const { contrastRatio } = utils;
    const pairs = [
      ['#ff0000', '#00ff00'],
      ['#123456', '#abcdef'],
      ['#ffffff', '#eeeeee'],
    ];
    for (const [c1, c2] of pairs) {
      expect(contrastRatio(c1, c2)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('oklchClamp', () => {
  it('returns a valid hex string', () => {
    const { oklchClamp } = utils;
    const result = oklchClamp(0.5, 0.2, 120);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles zero chroma (gray)', () => {
    const { oklchClamp } = utils;
    const result = oklchClamp(0.5, 0, 0);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('clamps lightness into [0, 1]', () => {
    const { oklchClamp } = utils;
    // Extreme values should not throw
    expect(() => oklchClamp(-0.5, 0.1, 90)).not.toThrow();
    expect(() => oklchClamp(1.5, 0.1, 90)).not.toThrow();
    const r1 = oklchClamp(-0.5, 0.1, 90);
    const r2 = oklchClamp(1.5, 0.1, 90);
    expect(r1).toMatch(/^#[0-9a-f]{6}$/);
    expect(r2).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('generateHarmony', () => {
  const modes = ['complementary', 'analogous', 'triadic', 'monochromatic'];

  it('returns null for invalid mode', () => {
    const { generateHarmony } = utils;
    expect(generateHarmony('#ff0000', 'invalid')).toBeNull();
    expect(generateHarmony('#ff0000', '')).toBeNull();
    expect(generateHarmony('#ff0000', 'split-complementary')).toBeNull();
  });

  for (const mode of modes) {
    it(`returns a palette object for mode: ${mode}`, () => {
      const { generateHarmony } = utils;
      const palette = generateHarmony('#3498db', mode);
      expect(palette).not.toBeNull();
      expect(palette).toHaveProperty('bg');
      expect(palette).toHaveProperty('text');
      expect(palette).toHaveProperty('accent');
      expect(palette).toHaveProperty('muted');
      expect(palette).toHaveProperty('accentText');
    });

    it(`all palette values are valid hex strings for mode: ${mode}`, () => {
      const { generateHarmony } = utils;
      const palette = generateHarmony('#e94560', mode);
      for (const [key, value] of Object.entries(palette)) {
        expect(value, `palette.${key} should be a hex string`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  }

  it('accentText is either #ffffff or #1a1a1a', () => {
    const { generateHarmony } = utils;
    for (const mode of modes) {
      const palette = generateHarmony('#3498db', mode);
      expect(['#ffffff', '#1a1a1a']).toContain(palette.accentText);
    }
  });

  it('bg matches the input hex for all modes', () => {
    const { generateHarmony } = utils;
    for (const mode of modes) {
      const palette = generateHarmony('#3498db', mode);
      expect(palette.bg).toBe('#3498db');
    }
  });
});
