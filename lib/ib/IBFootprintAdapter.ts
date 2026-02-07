/**
 * IB FOOTPRINT ADAPTER
 *
 * Converts IB Gateway trade data into FootprintCandle format
 * expected by the FootprintLayoutEngine and FootprintRenderer.
 *
 * Groups real IB trades into candles with bid/ask volume per price level.
 */

import type { IBTrade, CMEContractSpec } from '@/types/ib-protocol';

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT TYPES (match existing OrderflowEngine interfaces)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PriceLevel {
  price: number;
  bidVolume: number;      // Seller aggressor (hit the bid)
  askVolume: number;      // Buyer aggressor (hit the ask)
  bidTrades: number;
  askTrades: number;
  delta: number;          // askVolume - bidVolume
  totalVolume: number;
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
}

export interface FootprintCandle {
  time: number;           // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, PriceLevel>;
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;
  poc: number;
  vah: number;
  val: number;
  isClosed: boolean;
}

export interface FootprintAdapterConfig {
  contract: CMEContractSpec;
  timeframeSec: number;       // Candle timeframe in seconds (60, 300, etc.)
  maxCandles: number;         // Max candles to keep in memory
  imbalanceRatio: number;     // Threshold for imbalance detection (e.g. 3.0 = 300%)
  valueAreaPercent: number;   // Value area coverage (default 0.70 = 70%)
}

const DEFAULT_CONFIG: FootprintAdapterConfig = {
  contract: {
    symbol: 'ES',
    exchange: 'CME',
    secType: 'FUT',
    tickSize: 0.25,
    tickValue: 12.50,
    pointValue: 50,
    description: 'E-mini S&P 500',
    tradingHours: 'CME Globex',
  },
  timeframeSec: 60,
  maxCandles: 200,
  imbalanceRatio: 3.0,
  valueAreaPercent: 0.70,
};

export class IBFootprintAdapter {
  private config: FootprintAdapterConfig;
  private candles: FootprintCandle[] = [];
  private currentCandle: FootprintCandle | null = null;

  constructor(config?: Partial<FootprintAdapterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process a single trade from IB Gateway.
   * Groups into candles and updates price levels.
   */
  processTrade(trade: IBTrade): void {
    const tickSize = this.config.contract.tickSize;
    const timeframeSec = this.config.timeframeSec;

    // Round price to tick size
    const price = Math.round(trade.price / tickSize) * tickSize;

    // Calculate candle time boundary
    const candleTimeSec = Math.floor(trade.timestamp / 1000 / timeframeSec) * timeframeSec;

    // Check if we need a new candle
    if (!this.currentCandle || this.currentCandle.time !== candleTimeSec) {
      // Close current candle
      if (this.currentCandle) {
        this.currentCandle.isClosed = true;
        this.calculateKeyLevels(this.currentCandle);
        this.candles.push(this.currentCandle);

        // Prune old candles
        if (this.candles.length > this.config.maxCandles) {
          this.candles.splice(0, this.candles.length - this.config.maxCandles);
        }
      }

      // Create new candle
      this.currentCandle = {
        time: candleTimeSec,
        open: price,
        high: price,
        low: price,
        close: price,
        levels: new Map(),
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalDelta: 0,
        totalTrades: 0,
        poc: price,
        vah: price,
        val: price,
        isClosed: false,
      };
    }

    const candle = this.currentCandle;

    // Update OHLC
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;

    // Get or create price level
    if (!candle.levels.has(price)) {
      candle.levels.set(price, {
        price,
        bidVolume: 0,
        askVolume: 0,
        bidTrades: 0,
        askTrades: 0,
        delta: 0,
        totalVolume: 0,
        imbalanceBuy: false,
        imbalanceSell: false,
      });
    }

    const level = candle.levels.get(price)!;

    // IB classification: ASK = buyer aggressor (lift the offer), BID = seller aggressor (hit the bid)
    if (trade.side === 'ASK') {
      level.askVolume += trade.size;
      level.askTrades++;
      candle.totalBuyVolume += trade.size;
    } else {
      level.bidVolume += trade.size;
      level.bidTrades++;
      candle.totalSellVolume += trade.size;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Check imbalances
    const ratio = this.config.imbalanceRatio;
    level.imbalanceBuy = level.askVolume > 0 && level.askVolume >= level.bidVolume * ratio;
    level.imbalanceSell = level.bidVolume > 0 && level.bidVolume >= level.askVolume * ratio;

    // Update candle totals
    candle.totalVolume += trade.size;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Update POC (real-time)
    this.updatePOC(candle);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY LEVEL CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Quick POC update (called on every trade).
   */
  private updatePOC(candle: FootprintCandle): void {
    let maxVol = 0;
    let pocPrice = candle.close;

    for (const [price, level] of candle.levels) {
      if (level.totalVolume > maxVol) {
        maxVol = level.totalVolume;
        pocPrice = price;
      }
    }

    candle.poc = pocPrice;
  }

  /**
   * Full key level calculation (called when candle closes).
   */
  private calculateKeyLevels(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    // Sort levels by price
    const sorted = Array.from(candle.levels.values())
      .sort((a, b) => a.price - b.price);

    // POC
    let maxVol = 0;
    let pocIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].totalVolume > maxVol) {
        maxVol = sorted[i].totalVolume;
        pocIndex = i;
      }
    }
    candle.poc = sorted[pocIndex].price;

    // Value Area (70% of volume around POC)
    const targetVolume = candle.totalVolume * this.config.valueAreaPercent;
    let areaVolume = sorted[pocIndex].totalVolume;
    let upperIdx = pocIndex;
    let lowerIdx = pocIndex;

    while (areaVolume < targetVolume && (lowerIdx > 0 || upperIdx < sorted.length - 1)) {
      const canGoUp = upperIdx < sorted.length - 1;
      const canGoDown = lowerIdx > 0;

      if (canGoUp && canGoDown) {
        // Expand toward the side with more volume
        const upVol = sorted[upperIdx + 1].totalVolume;
        const downVol = sorted[lowerIdx - 1].totalVolume;
        if (upVol >= downVol) {
          upperIdx++;
          areaVolume += upVol;
        } else {
          lowerIdx--;
          areaVolume += downVol;
        }
      } else if (canGoUp) {
        upperIdx++;
        areaVolume += sorted[upperIdx].totalVolume;
      } else {
        lowerIdx--;
        areaVolume += sorted[lowerIdx].totalVolume;
      }
    }

    candle.vah = sorted[upperIdx].price;
    candle.val = sorted[lowerIdx].price;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all candles (closed + current open candle).
   */
  getCandles(): FootprintCandle[] {
    const result = [...this.candles];
    if (this.currentCandle) {
      // Re-calculate key levels for the live candle
      this.calculateKeyLevels(this.currentCandle);
      result.push(this.currentCandle);
    }
    return result;
  }

  /**
   * Get only the current open candle.
   */
  getCurrentCandle(): FootprintCandle | null {
    return this.currentCandle;
  }

  /**
   * Get the last N closed candles.
   */
  getClosedCandles(count?: number): FootprintCandle[] {
    if (count) {
      return this.candles.slice(-count);
    }
    return [...this.candles];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setContract(contract: CMEContractSpec): void {
    this.config.contract = contract;
    this.reset();
  }

  setTimeframe(timeframeSec: number): void {
    this.config.timeframeSec = timeframeSec;
    this.reset();
  }

  reset(): void {
    this.candles = [];
    this.currentCandle = null;
  }

  getConfig(): FootprintAdapterConfig {
    return { ...this.config };
  }
}
