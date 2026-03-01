/**
 * Color utilities — WCAG luminance, auto contrast, hex/rgba conversion
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [0, 0, 0];
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Returns black or white text color based on background luminance (WCAG threshold) */
export function autoTextColor(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  return relativeLuminance(r, g, b) > 0.179 ? '#000000' : '#ffffff';
}

/** Returns contrast text + muted colors for a background (pure function for Canvas/non-React) */
export function getContrastColors(bgHex: string): { text: string; muted: string; isDark: boolean } {
  const [r, g, b] = hexToRgb(bgHex);
  const lum = relativeLuminance(r, g, b);
  const isDark = lum <= 0.179;
  return {
    text: isDark ? '#ffffff' : '#000000',
    muted: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
    isDark,
  };
}

/** Convert hex color + alpha to rgba() string */
export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============ HSV ↔ HEX ↔ RGB CONVERSIONS ============

export function hsvToHex(h: number, s: number, v: number): string {
  const s1 = s / 100;
  const v1 = v / 100;
  const c = v1 * s1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v1 - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, v: 100 };
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

export function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

// ============ RECENT COLORS (localStorage) ============

const RECENT_COLORS_KEY = 'colorPickerRecent';
const MAX_RECENT = 8;

export function getRecentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COLORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addRecentColor(color: string): void {
  try {
    const recent = getRecentColors().filter(c => c.toLowerCase() !== color.toLowerCase());
    recent.unshift(color);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}
