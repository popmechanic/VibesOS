/**
 * editor-color-utils.js — Pure OKLCH/sRGB color math utilities.
 * No state, no DOM, no callbacks. Used by editor-themes.js for palette editing.
 * Interface: window.EditorColorUtils = { hexToRgb, rgbToHex, ... }
 */
(function() {
  // --- OKLCH <-> sRGB math ---
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function linearize(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function delinearize(v) { return v <= 0.0031308 ? v * 12.92 * 255 : (1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255; }

  function rgbToOklab(r, g, b) {
    const lr = linearize(r), lg = linearize(g), lb = linearize(b);
    const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
    const l = Math.cbrt(l_), m = Math.cbrt(m_), s = Math.cbrt(s_);
    return [
      0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    ];
  }
  function oklabToRgb(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      delinearize(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      delinearize(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      delinearize(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }

  function hexToOklch(hex) {
    const [r, g, b] = hexToRgb(hex);
    const [L, a, bv] = rgbToOklab(r, g, b);
    const C = Math.sqrt(a * a + bv * bv);
    let h = Math.atan2(bv, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { l: L, c: C, h };
  }
  function oklchToHex(l, c, h) {
    const hRad = h * Math.PI / 180;
    const a = c * Math.cos(hRad), b = c * Math.sin(hRad);
    const [r, g, bv] = oklabToRgb(l, a, b);
    return rgbToHex(r, g, bv);
  }

  // Clamp oklch to gamut by reducing chroma
  function oklchClamp(l, c, h) {
    l = Math.max(0, Math.min(1, l));
    for (let i = 0; i < 20; i++) {
      const hex = oklchToHex(l, c, h);
      const [r, g, b] = hexToRgb(hex);
      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) return hex;
      c *= 0.9;
    }
    return oklchToHex(l, 0, h);
  }

  // --- WCAG contrast ---
  function relativeLuminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  }
  function contrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(hex1), l2 = relativeLuminance(hex2);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // --- Harmony generators ---
  function generateHarmony(baseHex, mode) {
    const base = hexToOklch(baseHex);
    const { l, c, h } = base;
    let bg, text, accent, muted, accentText;

    // Pick high-contrast text: light bg → dark text, dark bg → light text
    const textL = l > 0.6 ? 0.15 : 0.95;
    text = oklchClamp(textL, 0.01, h);

    switch (mode) {
      case 'complementary':
        bg = baseHex;
        accent = oklchClamp(Math.min(l + 0.15, 0.85), Math.min(c + 0.05, 0.15), (h + 180) % 360);
        muted = oklchClamp(l, Math.max(c - 0.06, 0.01), h);
        accentText = contrastRatio(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1a1a';
        break;
      case 'analogous':
        bg = baseHex;
        accent = oklchClamp(Math.min(l + 0.1, 0.85), Math.min(c + 0.04, 0.15), (h + 30) % 360);
        muted = oklchClamp(l, Math.max(c - 0.04, 0.01), (h + 330) % 360);
        accentText = contrastRatio(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1a1a';
        break;
      case 'triadic':
        bg = baseHex;
        accent = oklchClamp(Math.min(l + 0.1, 0.85), Math.min(c + 0.04, 0.15), (h + 120) % 360);
        muted = oklchClamp(l, Math.max(c - 0.04, 0.01), (h + 240) % 360);
        accentText = contrastRatio(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1a1a';
        break;
      case 'monochromatic':
        bg = baseHex;
        accent = oklchClamp(Math.min(l + 0.2, 0.9), Math.min(c + 0.08, 0.15), h);
        muted = oklchClamp(Math.max(l - 0.15, 0.1), Math.max(c - 0.06, 0.01), h);
        accentText = contrastRatio(accent, '#ffffff') >= 4.5 ? '#ffffff' : '#1a1a1a';
        break;
      default:
        return null;
    }
    return { bg, text, accent, muted, accentText };
  }

  window.EditorColorUtils = {
    hexToRgb, rgbToHex, linearize, delinearize,
    rgbToOklab, oklabToRgb, hexToOklch, oklchToHex,
    oklchClamp, relativeLuminance, contrastRatio, generateHarmony
  };
})();
