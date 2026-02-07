/**
 * TRADOVATE FOOTPRINT SERVICE
 *
 * Converts Tradovate market data into FootprintCandles for CME futures
 * Compatible with Apex Trader Funding demo accounts
 *
 * Tradovate provides:
 * - bidVolume / offerVolume per bar (for footprint)
 * - upVolume / downVolume (for delta)
 * - Real-time trade data with aggressor side
 */

import { tradovateWS } from '@/lib/websocket/TradovateWS';
import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TradovateBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  upVolume: number;      // Buy volume
  downVolume: number;    // Sell volume
  upTicks: number;       // Buy trades count
  downTicks: number;     // Sell trades count
  bidVolume: number;     // Volume at bid
  offerVolume: number;   // Volume at ask
}

export interface TradovateFootprintConfig {
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

class TradovateFootprintService {
  private config: TradovateFootprintConfig;
  private candles: Map<number, FootprintCandle> = new Map(); // time -> candle
  private unsubscribers: (() => void)[] = [];
  private statusCallback: StatusCallback | null = null;
  private candleCallback: CandleCallback | null = null;
  private isConnected = false;

  constructor(config: Partial<TradovateFootprintConfig> = {}) {
    this.config = {
      symbol: 'NQH5',
      timeframe: 60,
      tickSize: 1,
      imbalanceRatio: 3.0,
      ...config,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<TradovateFootprintConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setSymbol(symbol: string): void {
    this.config.symbol = symbol;
  }

  setTimeframe(timeframe: number): void {
    this.config.timeframe = timeframe;
  }

  setTickSize(tickSize: number): void {
    this.config.tickSize = tickSize;
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
    this.emitStatus('connecting', 'Connecting to Tradovate...');

    try {
      const connected = await tradovateWS.connect();

      if (!connected) {
        this.emitStatus('error', 'Failed to authenticate with Tradovate');
        return false;
      }

      this.isConnected = true;
      this.emitStatus('connected', 'Connected to Tradovate');

      // Subscribe to chart data
      await this.subscribeToChart();

      // Subscribe to live trades for real-time updates
      await this.subscribeToTrades();

      return true;
    } catch (error) {
      console.error('[TradovateFootprint] Connection error:', error);
      this.emitStatus('error', error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  }

  private async subscribeToChart(): Promise<void> {
    const intervalMinutes = Math.floor(this.config.timeframe / 60);

    const unsub = await tradovateWS.subscribeChart(
      this.config.symbol,
      intervalMinutes,
      (candle, isClosed) => {
        this.processChartBar(candle, isClosed);
      }
    );

    this.unsubscribers.push(unsub);
  }

  private async subscribeToTrades(): Promise<void> {
    const unsub = await tradovateWS.subscribeTrades(
      this.config.symbol,
      (trade) => {
        this.processLiveTrade(trade);
      }
    );

    this.unsubscribers.push(unsub);
  }

  disconnect(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.isConnected = false;
    this.emitStatus('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  private processChartBar(
    bar: { time: number; open: number; high: number; low: number; close: number; volume: number },
    isClosed: boolean
  ): void {
    const { tickSize, imbalanceRatio } = this.config;

    let candle = this.candles.get(bar.time);

    if (!candle) {
      candle = this.createEmptyCandle(bar.time, bar.open);
      this.candles.set(bar.time, candle);
    }

    // Update OHLC
    candle.open = bar.open;
    candle.high = bar.high;
    candle.low = bar.low;
    candle.close = bar.close;
    candle.totalVolume = bar.volume;
    candle.isClosed = isClosed;

    // Generate price levels from OHLC range
    // Note: Tradovate doesn't provide per-tick data in historical bars,
    // so we estimate the distribution based on OHLC
    this.estimatePriceLevels(candle, tickSize);

    // Calculate imbalances
    this.calculateImbalances(candle, tickSize, imbalanceRatio);

    // Update POC, VAH, VAL
    this.updateKeyLevels(candle);

    // Emit update
    this.emitCandles();
  }

  private processLiveTrade(trade: {
    id: string;
    price: number;
    quantity: number;
    time: number;
    isBuyerMaker: boolean;
  }): void {
    const { tickSize, imbalanceRatio, timeframe } = this.config;

    // Calculate candle time
    const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;
    const priceLevel = Math.round(trade.price / tickSize) * tickSize;

    let candle = this.candles.get(candleTime);

    if (!candle) {
      candle = this.createEmptyCandle(candleTime, trade.price);
      this.candles.set(candleTime, candle);
    }

    // Update OHLC
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    // Update price level
    let level = candle.levels.get(priceLevel);
    if (!level) {
      level = this.createEmptyLevel(priceLevel);
      candle.levels.set(priceLevel, level);
    }

    // Tradovate: isBuyerMaker = true means seller was aggressor (hit bid)
    if (trade.isBuyerMaker) {
      level.bidVolume += trade.quantity;
      level.bidTrades++;
      candle.totalSellVolume += trade.quantity;
    } else {
      level.askVolume += trade.quantity;
      level.askTrades++;
      candle.totalBuyVolume += trade.quantity;
    }

    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Update candle aggregates
    candle.totalVolume += trade.quantity;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Recalculate
    this.calculateImbalances(candle, tickSize, imbalanceRatio);
    this.updateKeyLevels(candle);

    // Emit update
    this.emitCandles();
  }

  private estimatePriceLevels(candle: FootprintCandle, tickSize: number): void {
    // Estimate price distribution based on OHLC
    // This is an approximation - real tick data would be better

    const range = candle.high - candle.low;
    const levels = Math.ceil(range / tickSize) + 1;
    const volumePerLevel = candle.totalVolume / Math.max(1, levels);

    // Determine if bullish or bearish
    const isBullish = candle.close >= candle.open;

    for (let price = candle.low; price <= candle.high; price += tickSize) {
      const roundedPrice = Math.round(price / tickSize) * tickSize;

      if (!candle.levels.has(roundedPrice)) {
        const level = this.createEmptyLevel(roundedPrice);

        // Estimate bid/ask split based on candle direction
        // Bullish: more ask volume, Bearish: more bid volume
        const askRatio = isBullish ? 0.6 : 0.4;
        level.askVolume = volumePerLevel * askRatio;
        level.bidVolume = volumePerLevel * (1 - askRatio);
        level.totalVolume = volumePerLevel;
        level.delta = level.askVolume - level.bidVolume;

        candle.levels.set(roundedPrice, level);
      }
    }

    // Update totals
    candle.totalBuyVolume = candle.totalVolume * (isBullish ? 0.6 : 0.4);
    candle.totalSellVolume = candle.totalVolume - candle.totalBuyVolume;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
  }

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

      // Buy imbalance: Ask at this level >> Bid at level below
      if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
        level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
      }

      // Sell imbalance: Bid at this level >> Ask at level above
      if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
        level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
      }
    });
  }

  private updateKeyLevels(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    let maxVolume = 0;
    let pocPrice = candle.close;

    // Find POC
    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
    });

    candle.poc = pocPrice;

    // Calculate Value Area (70%)
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

  private emitStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string): void {
    this.statusCallback?.(status, message);
  }

  private emitCandles(): void {
    const candlesArray = Array.from(this.candles.values())
      .sort((a, b) => a.time - b.time);
    this.candleCallback?.(candlesArray);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  getCandles(): FootprintCandle[] {
    return Array.from(this.candles.values()).sort((a, b) => a.time - b.time);
  }

  getCurrentCandle(): FootprintCandle | null {
    const candles = this.getCandles();
    return candles.length > 0 ? candles[candles.length - 1] : null;
  }

  clearCandles(): void {
    this.candles.clear();
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let instance: TradovateFootprintService | null = null;

export function getTradovateFootprintService(
  config?: Partial<TradovateFootprintConfig>
): TradovateFootprintService {
  if (!instance) {
    instance = new TradovateFootprintService(config);
  } else if (config) {
    instance.setConfig(config);
  }
  return instance;
}

export function resetTradovateFootprintService(): void {
  if (instance) {
    instance.disconnect();
    instance.clearCandles();
  }
  instance = null;
}

export { TradovateFootprintService };
