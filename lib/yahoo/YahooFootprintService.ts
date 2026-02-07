/**
 * YAHOO FINANCE FOOTPRINT SERVICE
 *
 * FREE CME futures data for footprint charts
 * Uses Yahoo Finance WebSocket + REST API
 *
 * Limitations:
 * - Slight delay (1-3 seconds) vs exchange feed
 * - No tick-by-tick data, only OHLCV bars
 * - Bid/Ask estimated from price action
 *
 * Perfect for: Learning, analysis, non-HFT trading
 */

import {
  yahooFuturesWS,
  CME_TO_YAHOO,
  CME_TICK_SIZES,
  type YahooQuote,
} from './YahooFuturesWS';
import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface YahooFootprintConfig {
  symbol: string;
  timeframe: number;     // Seconds
  tickSize: number;
  imbalanceRatio: number;
}

interface YahooHistoricalBar {
  date: number;      // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
type CandleCallback = (candles: FootprintCandle[]) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class YahooFootprintService {
  private config: YahooFootprintConfig;
  private candles: Map<number, FootprintCandle> = new Map();
  private unsubscribers: (() => void)[] = [];
  private statusCallback: StatusCallback | null = null;
  private candleCallback: CandleCallback | null = null;
  private currentCandleTime: number = 0;
  private lastPrice: number = 0;

  constructor(config: Partial<YahooFootprintConfig> = {}) {
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

  setConfig(config: Partial<YahooFootprintConfig>): void {
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

      // Emit initial candles immediately after loading historical data
      this.emitCandles();

      // If we have historical data, consider it "connected" for display purposes
      if (historicalCandles.length > 0) {
        this.emitStatus('connected', `Loaded ${historicalCandles.length} candles`);
      }

      // Subscribe to live updates (optional - may not work if Yahoo WS is blocked)
      try {
        const unsubQuote = yahooFuturesWS.subscribe(this.config.symbol, (quote) => {
          this.processQuote(quote);
        });
        this.unsubscribers.push(unsubQuote);

        // Status updates from WebSocket
        const unsubStatus = yahooFuturesWS.onStatus((status) => {
          if (status === 'connected') {
            this.emitStatus('connected', `Live: ${this.config.symbol}`);
          } else if (status === 'error') {
            // Don't override connected status if we have historical data
            if (this.candles.size === 0) {
              this.emitStatus('error', 'WebSocket error');
            }
          }
        });
        this.unsubscribers.push(unsubStatus);
      } catch (wsError) {
        console.warn('[YahooFootprint] WebSocket subscription failed, using historical data only');
      }

      return true;
    } catch (error) {
      console.error('[YahooFootprint] Connection error:', error);
      this.emitStatus('error', error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  }

  disconnect(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    yahooFuturesWS.disconnect();
    this.emitStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORICAL DATA
  // ═══════════════════════════════════════════════════════════════════════════

  private async loadHistoricalData(): Promise<FootprintCandle[]> {
    const yahooSymbol = CME_TO_YAHOO[this.config.symbol] || `${this.config.symbol}=F`;
    const { timeframe, tickSize, imbalanceRatio } = this.config;

    // Map timeframe to Yahoo interval
    let interval = '1m';
    if (timeframe >= 3600) interval = '1h';
    else if (timeframe >= 900) interval = '15m';
    else if (timeframe >= 300) interval = '5m';
    else if (timeframe >= 60) interval = '1m';

    // Calculate range (last 2 days for 1m data)
    const range = timeframe <= 300 ? '2d' : '5d';

    try {
      // Fetch from our API route (proxies to Yahoo)
      const response = await fetch(
        `/api/yahoo/chart?symbol=${encodeURIComponent(yahooSymbol)}&interval=${interval}&range=${range}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch historical data: ${response.status}`);
      }

      const data = await response.json();

      if (!data.chart?.result?.[0]) {
        console.warn('[YahooFootprint] No historical data available');
        return [];
      }

      const result = data.chart.result[0];
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};

      const candles: FootprintCandle[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        const open = quotes.open?.[i];
        const high = quotes.high?.[i];
        const low = quotes.low?.[i];
        const close = quotes.close?.[i];
        const volume = quotes.volume?.[i] || 0;

        if (!open || !high || !low || !close) continue;

        const candle = this.createCandleFromOHLCV(
          time,
          open,
          high,
          low,
          close,
          volume,
          tickSize,
          imbalanceRatio
        );

        candles.push(candle);
      }

      console.log(`[YahooFootprint] Loaded ${candles.length} historical candles`);
      return candles;
    } catch (error) {
      console.error('[YahooFootprint] Failed to load historical data:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE DATA PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  private processQuote(quote: YahooQuote): void {
    const { timeframe, tickSize, imbalanceRatio } = this.config;
    const price = quote.price;
    const time = Math.floor(quote.time / 1000);

    // Calculate candle time
    const candleTime = Math.floor(time / timeframe) * timeframe;

    // Update last price for delta estimation
    const priceChange = this.lastPrice > 0 ? price - this.lastPrice : 0;
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

    // Estimate bid/ask from price change
    // Price up = likely hit ask (buy), Price down = likely hit bid (sell)
    const priceLevel = Math.round(price / tickSize) * tickSize;
    let level = candle.levels.get(priceLevel);

    if (!level) {
      level = this.createEmptyLevel(priceLevel);
      candle.levels.set(priceLevel, level);
    }

    // Estimate trade direction from price movement
    const estimatedQty = 1; // We don't have volume per tick, estimate as 1

    if (priceChange >= 0) {
      // Price went up or stayed same - likely buy (hit ask)
      level.askVolume += estimatedQty;
      level.askTrades++;
      candle.totalBuyVolume += estimatedQty;
    } else {
      // Price went down - likely sell (hit bid)
      level.bidVolume += estimatedQty;
      level.bidTrades++;
      candle.totalSellVolume += estimatedQty;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Update candle aggregates
    candle.totalVolume += estimatedQty;
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
        // Bullish: More buying at lower prices, selling at higher
        askRatio = 0.5 + (1 - positionInRange) * 0.3;
      } else {
        // Bearish: More selling at higher prices, buying at lower
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

let instance: YahooFootprintService | null = null;

export function getYahooFootprintService(
  config?: Partial<YahooFootprintConfig>
): YahooFootprintService {
  if (!instance) {
    instance = new YahooFootprintService(config);
  } else if (config) {
    instance.setConfig(config);
  }
  return instance;
}

export function resetYahooFootprintService(): void {
  if (instance) {
    instance.disconnect();
    instance.clearCandles();
  }
  instance = null;
}

export { YahooFootprintService };
