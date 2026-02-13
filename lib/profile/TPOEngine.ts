/**
 * TPO (Time Price Opportunity) / Market Profile Engine
 *
 * Builds TPO profile from footprint candles:
 * - Letters A-Z assigned per 30/60min period
 * - POC: price with most TPO letters
 * - Value Area: 70% of total TPO count
 * - Initial Balance: first hour range
 */

import type { FootprintCandle } from '@/lib/orderflow/OrderflowEngine';

export interface TPORow {
  price: number;
  letters: string[];    // e.g., ['A', 'A', 'B', 'C'] — each letter = one period touch
  count: number;        // Total TPO count at this price
}

export interface TPOData {
  rows: Map<number, TPORow>;
  pocPrice: number;
  pocCount: number;
  vahPrice: number;
  valPrice: number;
  ibHigh: number;       // Initial balance high
  ibLow: number;        // Initial balance low
  totalTPO: number;
  highPrice: number;
  lowPrice: number;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Build a TPO profile from footprint candles
 * @param candles - Array of footprint candles (should cover a full session)
 * @param periodMinutes - TPO period in minutes (30 or 60)
 * @param tickSize - Price tick size for rounding
 */
export function buildTPOProfile(
  candles: FootprintCandle[],
  periodMinutes: 30 | 60,
  tickSize: number,
): TPOData | null {
  if (candles.length === 0 || tickSize <= 0) return null;

  const periodSeconds = periodMinutes * 60;
  const rows = new Map<number, TPORow>();

  // Find the session start time (earliest candle)
  const sessionStart = candles[0].time;

  let highPrice = -Infinity;
  let lowPrice = Infinity;
  let ibHigh = -Infinity;
  let ibLow = Infinity;
  let totalTPO = 0;

  for (const candle of candles) {
    // Determine period index (letter)
    const periodIndex = Math.floor((candle.time - sessionStart) / periodSeconds);
    const letter = periodIndex < LETTERS.length ? LETTERS[periodIndex] : '?';

    // Mark initial balance (first 2 periods = first hour for 30min, first period for 60min)
    const ibPeriods = periodMinutes === 30 ? 2 : 1;
    const isIB = periodIndex < ibPeriods;

    // For each price touched in this candle, add the letter
    const candleHigh = candle.high;
    const candleLow = candle.low;

    // Round to tick size
    const roundedLow = Math.floor(candleLow / tickSize) * tickSize;
    const roundedHigh = Math.ceil(candleHigh / tickSize) * tickSize;

    for (let price = roundedLow; price <= roundedHigh; price = Math.round((price + tickSize) * 1e8) / 1e8) {
      let row = rows.get(price);
      if (!row) {
        row = { price, letters: [], count: 0 };
        rows.set(price, row);
      }
      row.letters.push(letter);
      row.count++;
      totalTPO++;

      if (isIB) {
        ibHigh = Math.max(ibHigh, price);
        ibLow = Math.min(ibLow, price);
      }
    }

    highPrice = Math.max(highPrice, candleHigh);
    lowPrice = Math.min(lowPrice, candleLow);
  }

  if (rows.size === 0) return null;

  // Find POC (price with most TPO)
  let pocPrice = 0;
  let pocCount = 0;
  for (const [price, row] of rows) {
    if (row.count > pocCount) {
      pocCount = row.count;
      pocPrice = price;
    }
  }

  // Calculate Value Area (70% of total TPO, expanding from POC)
  const targetTPO = Math.ceil(totalTPO * 0.70);
  const sortedPrices = Array.from(rows.keys()).sort((a, b) => a - b);
  const pocIndex = sortedPrices.indexOf(pocPrice);

  let vaTPO = pocCount;
  let upperIdx = pocIndex;
  let lowerIdx = pocIndex;

  while (vaTPO < targetTPO && (upperIdx < sortedPrices.length - 1 || lowerIdx > 0)) {
    const upperCount = upperIdx < sortedPrices.length - 1
      ? (rows.get(sortedPrices[upperIdx + 1])?.count || 0)
      : 0;
    const lowerCount = lowerIdx > 0
      ? (rows.get(sortedPrices[lowerIdx - 1])?.count || 0)
      : 0;

    if (upperCount >= lowerCount && upperIdx < sortedPrices.length - 1) {
      upperIdx++;
      vaTPO += upperCount;
    } else if (lowerIdx > 0) {
      lowerIdx--;
      vaTPO += lowerCount;
    } else {
      upperIdx++;
      vaTPO += upperCount;
    }
  }

  const vahPrice = sortedPrices[upperIdx] ?? highPrice;
  const valPrice = sortedPrices[lowerIdx] ?? lowPrice;

  return {
    rows,
    pocPrice,
    pocCount,
    vahPrice,
    valPrice,
    ibHigh: ibHigh === -Infinity ? highPrice : ibHigh,
    ibLow: ibLow === Infinity ? lowPrice : ibLow,
    totalTPO,
    highPrice,
    lowPrice,
  };
}
