// Tiny formatting utils used across the Journal tabs.

export function formatCurrency(n: number): string {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Background fill for a calendar day cell, keyed on signed P&L vs the
 *  month-wide max-abs P&L. Pure green/white-on-noir mapping per the
 *  Senzoukria palette. */
export function getColorForPnl(pnl: number, maxAbsPnl: number): string {
  if (pnl === 0 || maxAbsPnl === 0) return "transparent";
  const intensity = Math.min(1, Math.abs(pnl) / maxAbsPnl);
  if (pnl > 0) {
    // Green tint, scales with intensity
    const alpha = 0.10 + intensity * 0.30; // 0.10..0.40
    return `rgba(126, 211, 33, ${alpha})`;
  }
  // White (= "bear" in our palette) with reduced punch so losses don't
  // visually overwhelm wins
  const alpha = 0.06 + intensity * 0.16; // 0.06..0.22
  return `rgba(255, 255, 255, ${alpha})`;
}
