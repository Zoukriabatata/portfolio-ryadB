/**
 * MarketProfileEngine — Computes per-period Volume Profiles (like ATAS Market Profile & TPO)
 *
 * Creates VP segments for each time period (M15, M30, 1H, 4H, Daily, etc.)
 * Each segment has its own POC, VAH, VAL, and volume distribution.
 *
 * Used to overlay multiple profiles on the chart, matching ATAS "Market profile & TPO" indicator.
 */

export interface MarketProfilePeriod {
  startTime: number;       // Unix seconds (matches candle time)
  endTime: number;         // Unix seconds
  bins: Map<number, { total: number; buy: number; sell: number }>;
  poc: number;             // Price level with max volume
  pocVolume: number;
  vah: number;             // Value Area High
  val: number;             // Value Area Low
  totalVolume: number;
  totalTrades: number;
  high: number;            // Highest traded price
  low: number;             // Lowest traded price
}

export interface MarketProfileConfig {
  externalPeriod: number;  // Seconds (900 = M15, 1800 = M30, 3600 = 1H, etc.)
  tickSize: number;
  valueAreaPercent: number; // 0.70 = 70%
}

export class MarketProfileEngine {
  private config: MarketProfileConfig;
  private periods: MarketProfilePeriod[] = [];
  private currentPeriod: MarketProfilePeriod | null = null;

  constructor(config: MarketProfileConfig) {
    this.config = config;
  }

  /**
   * Build profiles from candle data.
   * Each candle is assigned to a period based on its timestamp.
   * Volume is distributed across the OHLC range using the candle's buy/sell split.
   */
  buildFromCandles(candles: { time: number; open: number; high: number; low: number; close: number; volume: number; buyVolume: number; sellVolume: number }[]): void {
    this.periods = [];
    this.currentPeriod = null;
    if (candles.length === 0) return;

    const { externalPeriod, tickSize } = this.config;

    for (const c of candles) {
      const periodStart = Math.floor(c.time / externalPeriod) * externalPeriod;
      const periodEnd = periodStart + externalPeriod;

      // New period?
      if (!this.currentPeriod || this.currentPeriod.startTime !== periodStart) {
        if (this.currentPeriod) {
          this.finalizePeriod(this.currentPeriod);
          this.periods.push(this.currentPeriod);
        }
        this.currentPeriod = {
          startTime: periodStart,
          endTime: periodEnd,
          bins: new Map(),
          poc: 0, pocVolume: 0, vah: 0, val: 0,
          totalVolume: 0, totalTrades: 0,
          high: -Infinity, low: Infinity,
        };
      }

      // Distribute volume across price range
      const low = Math.floor(c.low / tickSize) * tickSize;
      const high = Math.ceil(c.high / tickSize) * tickSize;
      const close = Math.round(c.close / tickSize) * tickSize;
      const range = high - low;
      if (range <= 0 || c.volume <= 0) continue;

      const levels = Math.max(1, Math.round(range / tickSize) + 1);
      const buyRatio = c.volume > 0 ? (c.buyVolume || 0) / c.volume : 0.5;

      // Triangle distribution weighted toward close
      let totalWeight = 0;
      const weights: number[] = [];
      for (let j = 0; j < levels; j++) {
        const price = low + j * tickSize;
        const distFromClose = range > 0 ? Math.abs(price - close) / range : 0;
        const w = 1 + (1 - distFromClose) * 3;
        weights.push(w);
        totalWeight += w;
      }

      for (let j = 0; j < levels; j++) {
        const price = low + j * tickSize;
        const binVol = (c.volume * weights[j]) / totalWeight;
        const existing = this.currentPeriod.bins.get(price) || { total: 0, buy: 0, sell: 0 };
        existing.total += binVol;
        existing.buy += binVol * buyRatio;
        existing.sell += binVol * (1 - buyRatio);
        this.currentPeriod.bins.set(price, existing);
      }

      this.currentPeriod.totalVolume += c.volume;
      this.currentPeriod.totalTrades++;
      if (c.high > this.currentPeriod.high) this.currentPeriod.high = c.high;
      if (c.low < this.currentPeriod.low) this.currentPeriod.low = c.low;
    }

    // Finalize last period
    if (this.currentPeriod) {
      this.finalizePeriod(this.currentPeriod);
      this.periods.push(this.currentPeriod);
    }
  }

  private finalizePeriod(period: MarketProfilePeriod): void {
    if (period.bins.size === 0) return;

    // Find POC
    let maxVol = 0;
    for (const [price, vol] of period.bins) {
      if (vol.total > maxVol) {
        maxVol = vol.total;
        period.poc = price;
        period.pocVolume = vol.total;
      }
    }

    // Calculate Value Area (70% rule)
    const { valueAreaPercent } = this.config;
    const targetVolume = period.totalVolume * valueAreaPercent;
    const sortedBins = Array.from(period.bins.entries()).sort((a, b) => a[0] - b[0]);

    // Start from POC and expand outward
    const pocIdx = sortedBins.findIndex(([p]) => p === period.poc);
    if (pocIdx < 0) return;

    let vaVolume = sortedBins[pocIdx][1].total;
    let hiIdx = pocIdx;
    let loIdx = pocIdx;

    while (vaVolume < targetVolume && (hiIdx < sortedBins.length - 1 || loIdx > 0)) {
      const nextHiVol = hiIdx < sortedBins.length - 1 ? sortedBins[hiIdx + 1][1].total : 0;
      const nextLoVol = loIdx > 0 ? sortedBins[loIdx - 1][1].total : 0;

      if (nextHiVol >= nextLoVol && hiIdx < sortedBins.length - 1) {
        hiIdx++;
        vaVolume += sortedBins[hiIdx][1].total;
      } else if (loIdx > 0) {
        loIdx--;
        vaVolume += sortedBins[loIdx][1].total;
      } else {
        break;
      }
    }

    period.vah = sortedBins[hiIdx][0];
    period.val = sortedBins[loIdx][0];
  }

  getPeriods(): MarketProfilePeriod[] {
    return this.periods;
  }

  reset(): void {
    this.periods = [];
    this.currentPeriod = null;
  }
}
