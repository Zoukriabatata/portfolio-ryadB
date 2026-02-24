import type { Candle } from '@/types/market';

export type SubMinuteInterval = 15 | 30;

interface AggregatorTrade {
  price: number;
  volume: number;
  time: number; // ms timestamp
}

/**
 * Aggregates real-time trades into sub-minute candles (15s / 30s).
 * Also splits 1m historical candles into sub-minute slots for initial chart data.
 */
export class SubMinuteAggregator {
  private intervalSec: SubMinuteInterval;
  private currentCandle: Candle | null = null;
  private onCandle: (candle: Candle, isClosed: boolean) => void;

  constructor(intervalSec: SubMinuteInterval, onCandle: (candle: Candle, isClosed: boolean) => void) {
    this.intervalSec = intervalSec;
    this.onCandle = onCandle;
  }

  /** Get the bucket start time (unix seconds) for a given timestamp (ms) */
  private getBucketTime(timestampMs: number): number {
    const sec = Math.floor(timestampMs / 1000);
    return sec - (sec % this.intervalSec);
  }

  /** Feed a real-time trade into the aggregator */
  addTrade(trade: AggregatorTrade): void {
    const bucketTime = this.getBucketTime(trade.time);

    if (!this.currentCandle || this.currentCandle.time !== bucketTime) {
      // Close previous candle
      if (this.currentCandle) {
        this.onCandle({ ...this.currentCandle }, true);
      }

      // Start new candle
      this.currentCandle = {
        time: bucketTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
      };
    } else {
      // Update current candle
      this.currentCandle.high = Math.max(this.currentCandle.high, trade.price);
      this.currentCandle.low = Math.min(this.currentCandle.low, trade.price);
      this.currentCandle.close = trade.price;
      this.currentCandle.volume += trade.volume;
    }

    // Emit current (open) candle
    this.onCandle({ ...this.currentCandle }, false);
  }

  /** Reset the aggregator state */
  reset(): void {
    this.currentCandle = null;
  }

  /**
   * Split 1-minute historical candles into sub-minute candles.
   * Since we don't have tick data for history, we distribute the 1m candle
   * across sub-minute slots using realistic interpolation.
   */
  static splitHistoricalCandles(candles1m: Candle[], intervalSec: SubMinuteInterval): Candle[] {
    const slotsPerMinute = 60 / intervalSec;
    const result: Candle[] = [];

    for (const c of candles1m) {
      const baseTime = c.time; // unix seconds, start of the minute

      if (slotsPerMinute === 2) {
        // 30s: split into 2 candles
        const mid = (c.open + c.close) / 2;
        const isUp = c.close >= c.open;

        result.push({
          time: baseTime,
          open: c.open,
          high: isUp ? Math.max(c.open, mid, (c.high + mid) / 2) : c.high,
          low: isUp ? c.low : Math.min(c.open, mid, (c.low + mid) / 2),
          close: mid,
          volume: c.volume * 0.48,
        });
        result.push({
          time: baseTime + 30,
          open: mid,
          high: isUp ? c.high : Math.max(mid, c.close, (c.high + mid) / 2),
          low: isUp ? Math.min(mid, c.close, (c.low + mid) / 2) : c.low,
          close: c.close,
          volume: c.volume * 0.52,
        });
      } else {
        // 15s: split into 4 candles
        const isUp = c.close >= c.open;
        const range = c.close - c.open;
        const points = [
          c.open,
          c.open + range * 0.3,
          c.open + range * 0.6,
          c.open + range * 0.85,
          c.close,
        ];

        const volWeights = [0.22, 0.28, 0.26, 0.24];

        for (let i = 0; i < 4; i++) {
          const slotOpen = points[i];
          const slotClose = points[i + 1];
          const slotHigh = Math.max(slotOpen, slotClose);
          const slotLow = Math.min(slotOpen, slotClose);

          // Distribute high/low across slots realistically
          let high = slotHigh;
          let low = slotLow;
          if (i === 0 && !isUp) high = Math.max(high, c.high);
          if (i === 0 && isUp) low = Math.min(low, c.low);
          if (i === 1) high = Math.max(high, isUp ? c.high : slotHigh);
          if (i === 2) low = Math.min(low, isUp ? slotLow : c.low);
          if (i === 3 && isUp) high = Math.max(high, c.high);
          if (i === 3 && !isUp) low = Math.min(low, c.low);

          result.push({
            time: baseTime + i * 15,
            open: slotOpen,
            high,
            low,
            close: slotClose,
            volume: c.volume * volWeights[i],
          });
        }
      }
    }

    return result;
  }
}
