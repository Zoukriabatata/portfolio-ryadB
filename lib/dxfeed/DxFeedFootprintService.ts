/**
 * DXFEED FOOTPRINT SERVICE
 *
 * Professional CME futures data for footprint charts
 * Uses dxFeed WebSocket with 15-minute delay (FREE)
 *
 * Features:
 * - Real tick-by-tick trade data with aggressor side
 * - Proper bid/ask from quote stream
 * - Professional data quality
 *
 * Perfect for: Analysis, learning, backtesting
 */

import {
  dxFeedWS,
  CME_TO_DXFEED,
  CME_TICK_SIZES,
  type DxFeedTrade,
  type DxFeedQuote,
} from './DxFeedWS';
import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DxFeedFootprintConfig {
  symbol: string;
  timeframe: number;     // Seconds
  tickSize: number;
  imbalanceRatio: number;
}

type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
type CandleCallback = (candles: FootprintCandle[]) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class DxFeedFootprintService {
  private config: DxFeedFootprintConfig;
  private candles: Map<number, FootprintCandle> = new Map();
  private unsubscribers: (() => void)[] = [];
  private statusCallback: StatusCallback | null = null;
  private candleCallback: CandleCallback | null = null;
  private currentCandleTime: number = 0;
  private lastPrice: number = 0;
  private lastBid: number = 0;
  private lastAsk: number = 0;

  constructor(config: Partial<DxFeedFootprintConfig> = {}) {
    this.config = {
      symbol: 'NQ',
      timeframe: 60,
      tickSize: CME_TICK_SIZES['NQ'] || 0.25,
      imbalanceRatio: 3.0,
      ...config,
    };

    // Auto-set tick size based on symbol
    if (config.symbol && !config.tickSize) {
      this.config.tickSize = CME_TICK_SIZES[config.symbol] || 0.25;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<DxFeedFootprintConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.symbol) {
      this.config.tickSize = CME_TICK_SIZES[config.symbol] || this.config.tickSize;
    }
  }

  setSymbol(symbol: string): void {
    this.config.symbol = symbol;
    this.config.tickSize = CME_TICK_SIZES[symbol] || 0.25;
  }

  onStatus(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  onCandles(callback: CandleCallback): void {
    this.candleCallback = callback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    this.emitStatus('connecting', 'Loading historical data...');

    try {
      // Load historical data first
      const historicalCandles = await this.loadHistoricalData();

      // Add historical candles
      historicalCandles.forEach(candle => {
        this.candles.set(candle.time, candle);
      });

      this.emitStatus('connecting', 'Connecting to dxFeed...');

      // Connect to dxFeed
      const connected = await dxFeedWS.connect();

      if (!connected) {
        this.emitStatus('error', 'Failed to connect to dxFeed');
        return false;
      }

      // Subscribe to trades (for volume and delta)
      const unsubTrades = dxFeedWS.subscribeTrades(this.config.symbol, (trade) => {
        this.processTrade(trade);
      });
      this.unsubscribers.push(unsubTrades);

      // Subscribe to quotes (for bid/ask)
      const unsubQuotes = dxFeedWS.subscribeQuotes(this.config.symbol, (quote) => {
        this.processQuote(quote);
      });
      this.unsubscribers.push(unsubQuotes);

      // Status updates
      const unsubStatus = dxFeedWS.onStatus((status, message) => {
        if (status === 'connected') {
          this.emitStatus('connected', `Streaming ${this.config.symbol} (15min delay)`);
        } else if (status === 'error') {
          this.emitStatus('error', message || 'Connection error');
        } else if (status === 'disconnected') {
          this.emitStatus('disconnected');
        }
      });
      this.unsubscribers.push(unsubStatus);

      // Emit initial candles
      this.emitCandles();

      return true;
    } catch (error) {
      console.error('[DxFeedFootprint] Connection error:', error);
      this.emitStatus('error', error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  }

  disconnect(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.emitStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORICAL DATA (via API proxy)
  // ═══════════════════════════════════════════════════════════════════════════

  private async loadHistoricalData(): Promise<FootprintCandle[]> {
    const dxSymbol = CME_TO_DXFEED[this.config.symbol] || `/${this.config.symbol}`;
    const { timeframe, tickSize, imbalanceRatio } = this.config;

    try {
      // Fetch from our API route
      const response = await fetch(
        `/api/dxfeed/history?symbol=${encodeURIComponent(dxSymbol)}&timeframe=${timeframe}`
      );

      if (!response.ok) {
        console.warn('[DxFeedFootprint] Historical data not available, starting fresh');
        return [];
      }

      const data = await response.json();

      if (!data.candles || !Array.isArray(data.candles)) {
        return [];
      }

      const candles: FootprintCandle[] = [];

      for (const bar of data.candles) {
        const candle = this.createCandleFromOHLCV(
          bar.time,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          tickSize,
          imbalanceRatio
        );
        candles.push(candle);
      }

      console.log(`[DxFeedFootprint] Loaded ${candles.length} historical candles`);
      return candles;
    } catch (error) {
      console.warn('[DxFeedFootprint] Failed to load historical data:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE DATA PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  private processQuote(quote: DxFeedQuote): void {
    this.lastBid = quote.bidPrice;
    this.lastAsk = quote.askPrice;
  }

  private processTrade(trade: DxFeedTrade): void {
    const { timeframe, tickSize, imbalanceRatio } = this.config;
    const price = trade.price;
    const size = trade.size;
    const time = Math.floor(trade.time / 1000);

    // Calculate candle time
    const candleTime = Math.floor(time / timeframe) * timeframe;

    // Update last price
    this.lastPrice = price;

    // Get or create candle
    let candle = this.candles.get(candleTime);

    if (!candle) {
      // New candle
      candle = this.createEmptyCandle(candleTime, price);
      this.candles.set(candleTime, candle);

      // Mark previous candle as closed
      if (this.currentCandleTime > 0 && this.currentCandleTime !== candleTime) {
        const prevCandle = this.candles.get(this.currentCandleTime);
        if (prevCandle) {
          prevCandle.isClosed = true;
        }
      }
      this.currentCandleTime = candleTime;
    }

    // Update OHLC
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;

    // Get or create price level
    const priceLevel = Math.round(price / tickSize) * tickSize;
    let level = candle.levels.get(priceLevel);

    if (!level) {
      level = this.createEmptyLevel(priceLevel);
      candle.levels.set(priceLevel, level);
    }

    // Determine trade direction
    // dxFeed provides aggressorSide which is more accurate
    let isBuy: boolean;

    if (trade.aggressorSide === 'BUY') {
      isBuy = true;
    } else if (trade.aggressorSide === 'SELL') {
      isBuy = false;
    } else {
      // Fallback: compare to bid/ask or use tick rule
      if (this.lastBid > 0 && this.lastAsk > 0) {
        const mid = (this.lastBid + this.lastAsk) / 2;
        isBuy = price >= mid;
      } else {
        // Tick rule: if price went up, likely a buy
        isBuy = price >= this.lastPrice;
      }
    }

    // Update level volumes
    if (isBuy) {
      level.askVolume += size;
      level.askTrades++;
      candle.totalBuyVolume += size;
    } else {
      level.bidVolume += size;
      level.bidTrades++;
      candle.totalSellVolume += size;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Update candle aggregates
    candle.totalVolume += size;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Recalculate
    this.calculateImbalances(candle, tickSize, imbalanceRatio);
    this.updateKeyLevels(candle);

    // Emit update
    this.emitCandles();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE CREATION
  // ═══════════════════════════════════════════════════════════════════════════

  private createCandleFromOHLCV(
    time: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number,
    tickSize: number,
    imbalanceRatio: number
  ): FootprintCandle {
    const candle = this.createEmptyCandle(time, open);
    candle.open = open;
    candle.high = high;
    candle.low = low;
    candle.close = close;
    candle.totalVolume = volume;
    candle.isClosed = true;

    // Estimate price levels from OHLC
    const isBullish = close >= open;
    const range = high - low;
    const levelCount = Math.max(1, Math.ceil(range / tickSize));
    const volumePerLevel = volume / levelCount;

    for (let price = low; price <= high; price += tickSize) {
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      const level = this.createEmptyLevel(roundedPrice);

      // Estimate bid/ask split based on candle direction and price position
      const positionInRange = (price - low) / Math.max(0.01, range);
      let askRatio: number;

      if (isBullish) {
        // Bullish: More buying at lower prices
        askRatio = 0.5 + (1 - positionInRange) * 0.3;
      } else {
        // Bearish: More selling at higher prices
        askRatio = 0.5 - positionInRange * 0.3;
      }

      level.askVolume = volumePerLevel * askRatio;
      level.bidVolume = volumePerLevel * (1 - askRatio);
      level.totalVolume = volumePerLevel;
      level.delta = level.askVolume - level.bidVolume;

      candle.levels.set(roundedPrice, level);
    }

    // Set totals
    candle.totalBuyVolume = volume * (isBullish ? 0.55 : 0.45);
    candle.totalSellVolume = volume - candle.totalBuyVolume;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;

    // Calculate imbalances and key levels
    this.calculateImbalances(candle, tickSize, imbalanceRatio);
    this.updateKeyLevels(candle);

    return candle;
  }

  private createEmptyCandle(time: number, price: number): FootprintCandle {
    return {
      time,
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

  private createEmptyLevel(price: number): PriceLevel {
    return {
      price,
      bidVolume: 0,
      askVolume: 0,
      bidTrades: 0,
      askTrades: 0,
      delta: 0,
      totalVolume: 0,
      imbalanceBuy: false,
      imbalanceSell: false,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateImbalances(
    candle: FootprintCandle,
    tickSize: number,
    imbalanceRatio: number
  ): void {
    candle.levels.forEach((level, price) => {
      level.imbalanceBuy = false;
      level.imbalanceSell = false;

      const levelBelow = candle.levels.get(price - tickSize);
      const levelAbove = candle.levels.get(price + tickSize);

      if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
        level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
      }

      if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
        level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
      }
    });
  }

  private updateKeyLevels(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    let maxVolume = 0;
    let pocPrice = candle.close;

    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
    });

    candle.poc = pocPrice;

    // Value Area (70%)
    const targetVolume = candle.totalVolume * 0.70;
    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[1].totalVolume - a[1].totalVolume);

    let accumulatedVolume = 0;
    const valueAreaPrices: number[] = [];

    for (const [price, level] of sortedLevels) {
      valueAreaPrices.push(price);
      accumulatedVolume += level.totalVolume;
      if (accumulatedVolume >= targetVolume) break;
    }

    if (valueAreaPrices.length > 0) {
      candle.vah = Math.max(...valueAreaPrices);
      candle.val = Math.min(...valueAreaPrices);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string): void {
    this.statusCallback?.(status, message);
  }

  private emitCandles(): void {
    const candlesArray = Array.from(this.candles.values())
      .sort((a, b) => a.time - b.time)
      .slice(-500); // Keep last 500 candles
    this.candleCallback?.(candlesArray);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  getCandles(): FootprintCandle[] {
    return Array.from(this.candles.values()).sort((a, b) => a.time - b.time);
  }

  getCurrentCandle(): FootprintCandle | null {
    if (this.currentCandleTime === 0) return null;
    return this.candles.get(this.currentCandleTime) || null;
  }

  getLastPrice(): number {
    return this.lastPrice;
  }

  clearCandles(): void {
    this.candles.clear();
    this.currentCandleTime = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let instance: DxFeedFootprintService | null = null;

export function getDxFeedFootprintService(
  config?: Partial<DxFeedFootprintConfig>
): DxFeedFootprintService {
  if (!instance) {
    instance = new DxFeedFootprintService(config);
  } else if (config) {
    instance.setConfig(config);
  }
  return instance;
}

export function resetDxFeedFootprintService(): void {
  if (instance) {
    instance.disconnect();
    instance.clearCandles();
  }
  instance = null;
}

export { DxFeedFootprintService };
