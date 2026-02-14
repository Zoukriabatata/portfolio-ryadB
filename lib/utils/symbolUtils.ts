/**
 * CME Symbol Utilities
 * Determines whether a symbol is a CME future (routes to IB Gateway)
 * vs. a crypto symbol (routes to Binance public WS).
 */

const CME_SYMBOLS = new Set([
  'NQ', 'MNQ', 'ES', 'MES', 'YM', 'RTY',
  'GC', 'MGC', 'SI', 'CL', 'NG',
  'ZB', 'ZN', 'ZF',
]);

export function isCMESymbol(symbol: string): boolean {
  return CME_SYMBOLS.has(symbol.toUpperCase());
}
