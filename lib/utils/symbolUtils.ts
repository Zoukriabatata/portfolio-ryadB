/**
 * CME Symbol Utilities
 * Determines whether a symbol is a CME future (routes to dxFeed/Tradovate)
 * vs. a crypto symbol (routes to Bybit/Binance public WS).
 */

import { ALL_CME_SYMBOLS } from '@/lib/instruments';

export function isCMESymbol(symbol: string): boolean {
  return ALL_CME_SYMBOLS.has(symbol.toUpperCase());
}
