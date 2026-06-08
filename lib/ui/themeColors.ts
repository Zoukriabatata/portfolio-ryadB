// Reads brand tokens from CSS custom properties so canvas/JS code (which can't
// use CSS var() directly) stays theme-aware — no hardcoded hex. Refreshed on
// theme change via refreshThemeColors() (called from applyUITheme()).

const VARS = [
  '--primary', '--primary-light', '--accent', '--accent-light',
  '--bull', '--bear', '--warning',
  '--text-primary', '--text-secondary', '--text-muted', '--text-dimmed',
  '--surface', '--surface-elevated', '--border', '--background',
] as const;
export type ThemeToken = typeof VARS[number];

let cache: Partial<Record<ThemeToken, string>> = {};

/** Re-read the active palette from :root. Call after the theme changes. */
export function refreshThemeColors(): void {
  if (typeof window === 'undefined') return;
  const cs = getComputedStyle(document.documentElement);
  const next: Partial<Record<ThemeToken, string>> = {};
  for (const v of VARS) next[v] = cs.getPropertyValue(v).trim();
  cache = next;
}

/** Resolved hex/string for a brand token (theme-aware). */
export function themeColor(token: ThemeToken): string {
  if (!cache[token]) refreshThemeColors();
  return cache[token] || '#000000';
}

/** Directional P&L / delta color via brand tokens (never crypto hex). */
export function pnlColor(n: number): string {
  return themeColor(n >= 0 ? '--bull' : '--bear');
}

/** rgba() from a token + alpha, for canvas fills. */
export function themeAlpha(token: ThemeToken, alpha: number): string {
  const hex = themeColor(token);
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
