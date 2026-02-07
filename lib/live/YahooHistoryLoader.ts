/**
 * YAHOO HISTORY LOADER
 *
 * Loads historical candles for CME futures from Yahoo Finance.
 * Used by LiveChartPro as a replacement for Binance klines when
 * the selected symbol is a CME future (NQ, ES, YM, GC, CL, etc.)
 *
 * Returns LiveCandle[] format compatible with HierarchicalAggregator.
 */

import type { LiveCandle, TimeframeSeconds } from './HierarchicalAggregator';
import { CME_TO_YAHOO } from '@/lib/yahoo/YahooFuturesWS';

// CME symbols that should use Yahoo Finance
const CME_SYMBOLS = new Set([
  'NQ', 'MNQ', 'ES', 'MES', 'YM', 'RTY',
  'GC', 'MGC', 'SI', 'CL', 'NG',
  'ZB', 'ZN', 'ZF',
]);

/**
 * Check if a symbol is a CME future
 */
export function isCMESymbol(symbol: string): boolean {
  return CME_SYMBOLS.has(symbol.toUpperCase());
}

/**
 * Map timeframe (seconds) to Yahoo Finance interval string
 */
function tfToYahooInterval(tf: TimeframeSeconds): string {
  if (tf >= 86400) return '1d';
  if (tf >= 3600) return '1h';
  if (tf >= 900) return '15m';
  if (tf >= 300) return '5m';
  return '1m';
}

/**
 * Determine range based on timeframe
 */
function tfToYahooRange(tf: TimeframeSeconds): string {
  if (tf >= 86400) return '6mo';
  if (tf >= 3600) return '1mo';
  if (tf >= 300) return '5d';
  return '2d';
}

/**
 * Load historical candles from Yahoo Finance for a CME symbol.
 * Returns LiveCandle[] compatible with HierarchicalAggregator.
 */
export async function loadYahooHistory(
  symbol: string,
  tf: TimeframeSeconds,
): Promise<LiveCandle[]> {
  const yahooSymbol = CME_TO_YAHOO[symbol.toUpperCase()] || `${symbol.toUpperCase()}=F`;
  const interval = tfToYahooInterval(tf);
  const range = tfToYahooRange(tf);

  const response = await fetch(
    `/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&range=${range}`
  );

  if (!response.ok) {
    console.error(`[YahooHistory] Failed to fetch ${yahooSymbol}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    console.warn('[YahooHistory] No data returned');
    return [];
  }

  const timestamps: number[] = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};
  const candles: LiveCandle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = quotes.open?.[i];
    const high = quotes.high?.[i];
    const low = quotes.low?.[i];
    const close = quotes.close?.[i];
    const volume = quotes.volume?.[i] || 0;

    if (open == null || high == null || low == null || close == null) continue;

    candles.push({
      time: timestamps[i],
      open,
      high,
      low,
      close,
      volume,
      buyVolume: 0,
      sellVolume: 0,
      trades: 0,
    });
  }

  // If Yahoo interval is larger than requested tf, subdivide
  const yahooIntervalSec = intervalToSeconds(interval);
  if (yahooIntervalSec > tf) {
    return subdivideCandles(candles, yahooIntervalSec, tf);
  }

  console.log(`[YahooHistory] Loaded ${candles.length} candles for ${yahooSymbol} (${interval})`);
  return candles;
}

/**
 * Convert Yahoo interval string to seconds
 */
function intervalToSeconds(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '1d': 86400,
  };
  return map[interval] || 60;
}

/**
 * Subdivide candles into smaller timeframes (for TFs smaller than Yahoo's minimum)
 */
function subdivideCandles(candles: LiveCandle[], sourceTf: number, targetTf: number): LiveCandle[] {
  const result: LiveCandle[] = [];
  const subdivisions = Math.round(sourceTf / targetTf);

  for (const c of candles) {
    const priceStep = (c.close - c.open) / subdivisions;
    const volumeStep = c.volume / subdivisions;

    for (let i = 0; i < subdivisions; i++) {
      const subOpen = c.open + priceStep * i;
      const subClose = c.open + priceStep * (i + 1);
      const variation = (Math.random() - 0.5) * Math.abs(c.high - c.low) * 0.1;

      result.push({
        time: c.time + (i * targetTf),
        open: subOpen,
        high: Math.max(subOpen, subClose) + Math.abs(variation),
        low: Math.min(subOpen, subClose) - Math.abs(variation),
        close: subClose,
        volume: volumeStep,
        buyVolume: 0,
        sellVolume: 0,
        trades: 0,
      });
    }
  }

  return result;
}
