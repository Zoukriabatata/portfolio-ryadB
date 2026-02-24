/**
 * Replay TWAP — Time-Weighted Average Price
 *
 * Calculates cumulative TWAP from replay candle data.
 * TWAP = Σ(price × duration) / Σ(duration)
 * where price = (open + high + low + close) / 4 for each candle period.
 */

export interface TWAPPoint {
  timestamp: number;
  twap: number;
}

export class ReplayTWAP {
  private cumPriceTime = 0;
  private cumTime = 0;
  private lastTimestamp = 0;
  private points: TWAPPoint[] = [];

  reset(): void {
    this.cumPriceTime = 0;
    this.cumTime = 0;
    this.lastTimestamp = 0;
    this.points = [];
  }

  /**
   * Add a candle to TWAP computation.
   * @param timestamp Start time of the candle
   * @param o Open price
   * @param h High price
   * @param l Low price
   * @param c Close price
   * @param durationMs Duration of this candle period in ms
   */
  addCandle(timestamp: number, o: number, h: number, l: number, c: number, durationMs: number): void {
    const typicalPrice = (o + h + l + c) / 4;
    const duration = durationMs > 0 ? durationMs : 1;

    this.cumPriceTime += typicalPrice * duration;
    this.cumTime += duration;
    this.lastTimestamp = timestamp;

    const twap = this.cumTime > 0 ? this.cumPriceTime / this.cumTime : typicalPrice;
    this.points.push({ timestamp, twap });
  }

  /**
   * Add a single trade price with timestamp-based time weighting.
   */
  addTrade(timestamp: number, price: number): void {
    const duration = this.lastTimestamp > 0 ? Math.max(1, timestamp - this.lastTimestamp) : 1;
    this.cumPriceTime += price * duration;
    this.cumTime += duration;
    this.lastTimestamp = timestamp;

    const twap = this.cumTime > 0 ? this.cumPriceTime / this.cumTime : price;
    this.points.push({ timestamp, twap });
  }

  getCurrentTWAP(): number {
    return this.cumTime > 0 ? this.cumPriceTime / this.cumTime : 0;
  }

  getPoints(): TWAPPoint[] {
    return this.points;
  }

  getRecentPoints(count: number): TWAPPoint[] {
    return this.points.slice(-count);
  }
}
