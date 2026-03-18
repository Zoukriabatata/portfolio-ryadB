/**
 * Candle Aggregator
 *
 * Builds OHLCV candles with delta and per-price footprint from individual trades.
 * Used server-side to produce richer candle data than the OHLCV bars Tradovate
 * provides — each candle carries a full footprint (buy/sell volume per price level).
 *
 * Usage:
 *   const agg = createCandleAggregator(1); // 1-minute bars
 *   const closedCandle = agg.addTrade({ price, size, time, side });
 *   // closedCandle is non-null when the bar period flips
 */

'use strict';

/**
 * @param {number} intervalMinutes  Bar size in minutes (1, 5, 15, etc.)
 * @returns {{ addTrade: Function, getCurrentCandle: Function }}
 */
function createCandleAggregator(intervalMinutes = 1) {
  const intervalMs = intervalMinutes * 60 * 1_000;
  let currentCandle = null;

  /** Snap a trade timestamp to its bar start (Unix seconds) */
  function getBarTime(tradeTimeMs) {
    return Math.floor(tradeTimeMs / intervalMs) * (intervalMs / 1_000);
  }

  /** Create an empty candle opening at price/time */
  function newCandle(price, timeMs) {
    return {
      time: getBarTime(timeMs),
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      delta: 0,   // buyVolume - sellVolume
      trades: 0,
      // Footprint: price level → { buyVol, sellVol }
      // Price keys are stored as strings for JSON-safety
      footprint: {},
    };
  }

  /**
   * Add a trade tick to the current candle.
   *
   * @param {{ price: number; size: number; time: number; side: 'buy'|'sell' }} trade
   * @returns {object|null} The just-closed candle, or null if still in same bar
   */
  function addTrade(trade) {
    const { price, size, time, side } = trade;
    const barTime = getBarTime(time);

    // New bar detected — close current and start a fresh one
    if (!currentCandle || barTime !== currentCandle.time) {
      const closedCandle = currentCandle;
      currentCandle = newCandle(price, time);

      // Return the closed candle so callers can emit it
      if (closedCandle) return closedCandle;
    }

    // Update OHLCV
    if (price > currentCandle.high) currentCandle.high = price;
    if (price < currentCandle.low) currentCandle.low = price;
    currentCandle.close = price;
    currentCandle.volume += size;
    currentCandle.trades++;

    // Delta tracking
    if (side === 'buy') {
      currentCandle.buyVolume += size;
    } else {
      currentCandle.sellVolume += size;
    }
    currentCandle.delta = currentCandle.buyVolume - currentCandle.sellVolume;

    // Per-price footprint
    const key = String(price);
    if (!currentCandle.footprint[key]) {
      currentCandle.footprint[key] = { buyVol: 0, sellVol: 0 };
    }
    if (side === 'buy') {
      currentCandle.footprint[key].buyVol += size;
    } else {
      currentCandle.footprint[key].sellVol += size;
    }

    return null; // Still accumulating in the same bar
  }

  /** Get the current in-progress candle (may be null before first trade). */
  function getCurrentCandle() {
    return currentCandle;
  }

  /** Reset state — useful when switching symbols or reconnecting. */
  function reset() {
    currentCandle = null;
  }

  return { addTrade, getCurrentCandle, reset };
}

module.exports = { createCandleAggregator };
