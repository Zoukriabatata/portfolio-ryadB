/**
 * Shared formatting utilities — consolidates duplicate format functions across the codebase.
 */

/** Format price based on magnitude: >=1000 → 2 decimals with commas, >=1 → 4 decimals, <1 → 6 decimals */
export function formatPrice(price: number): string {
  if (price === 0) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** Format price with tick-size-based precision (for DOM/footprint use) */
export function formatPriceByTick(price: number, tickSize: number): string {
  if (tickSize >= 1) return price.toFixed(0);
  const decimals = Math.max(0, Math.ceil(-Math.log10(tickSize)));
  return price.toFixed(decimals);
}

/** Format volume with suffix: >=1B → B, >=1M → M, >=1K → K */
export function formatVolume(vol: number): string {
  const abs = Math.abs(vol);
  const sign = vol < 0 ? '-' : '';
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + 'K';
  return sign + abs.toFixed(0);
}

/** Compact volume: only abbreviate >=10K */
export function formatVolumeCompact(vol: number): string {
  const abs = Math.abs(vol);
  const sign = vol < 0 ? '-' : '';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 10000) return sign + (abs / 1e3).toFixed(0) + 'K';
  return sign + abs.toFixed(0);
}

/** Format volume with dollar prefix */
export function formatVolumeDollar(vol: number): string {
  if (vol >= 1e9) return '$' + (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return '$' + (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return '$' + (vol / 1e3).toFixed(0) + 'K';
  return '$' + vol.toFixed(0);
}

/** Format quantity: >=1000 → K suffix, >=1 → 3 decimals, <1 → 4 decimals */
export function formatQty(qty: number): string {
  if (qty >= 1000) return (qty / 1000).toFixed(2) + 'K';
  if (qty >= 1) return qty.toFixed(3);
  return qty.toFixed(4);
}

/** Format timestamp to HH:MM:SS (24h) */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
