/**
 * Replay VWAP — Volume-Weighted Average Price
 *
 * Calculates cumulative VWAP from replay trade data.
 * VWAP = Σ(price × volume) / Σ(volume)
 */

export interface VWAPPoint {
  timestamp: number;
  vwap: number;
  volume: number;
}

export class ReplayVWAP {
  private cumPriceVolume = 0;
  private cumVolume = 0;
  private points: VWAPPoint[] = [];

  reset(): void {
    this.cumPriceVolume = 0;
    this.cumVolume = 0;
    this.points = [];
  }

  addTrade(timestamp: number, price: number, size: number): void {
    this.cumPriceVolume += price * size;
    this.cumVolume += size;

    const vwap = this.cumVolume > 0 ? this.cumPriceVolume / this.cumVolume : price;

    this.points.push({ timestamp, vwap, volume: this.cumVolume });
  }

  getCurrentVWAP(): number {
    return this.cumVolume > 0 ? this.cumPriceVolume / this.cumVolume : 0;
  }

  getPoints(): VWAPPoint[] {
    return this.points;
  }

  /** Get VWAP at the last N points (for rendering) */
  getRecentPoints(count: number): VWAPPoint[] {
    return this.points.slice(-count);
  }
}
