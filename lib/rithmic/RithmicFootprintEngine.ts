/**
 * RITHMIC FOOTPRINT ENGINE
 *
 * Moteur Footprint tick-by-tick alimenté par Rithmic (Topstep)
 * Compatible avec les données CME réelles.
 *
 * Architecture:
 *   Rithmic Bridge (Python)
 *     → RithmicClient (WebSocket)
 *       → RithmicFootprintEngine (Aggregation)
 *         → UI (Canvas Render)
 */

import { rithmicClient, CME_SPECS, type ClassifiedTrade } from './RithmicClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  bidTrades: number;
  askTrades: number;
  delta: number;
  totalVolume: number;
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
  isPOC: boolean;
  isValueArea: boolean;
}

export interface FootprintCandle {
  symbol: string;
  timeframe: number;
  openTime: number;
  closeTime: number;
  isClosed: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, FootprintLevel>;
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;
  poc: number;
  vah: number;
  val: number;
}

export interface RithmicFootprintConfig {
  symbol: string;
  timeframe: number;
  imbalanceRatio: number;
}

type CandleCallback = (candles: FootprintCandle[]) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class RithmicFootprintEngine {
  private config: RithmicFootprintConfig;
  private spec: { tickSize: number; tickValue: number };

  // Candles storage
  private candles: Map<number, FootprintCandle> = new Map();
  private currentCandleTime: number = 0;

  // Subscriptions
  private unsubscribers: (() => void)[] = [];

  // Callbacks
  private candleCallback: CandleCallback | null = null;
  private statusCallback: StatusCallback | null = null;

  // State
  private processedTradeCount = 0;
  private firstTradeReceived = false;
  private emitCount = 0;

  constructor(config: Partial<RithmicFootprintConfig> = {}) {
    this.config = {
      symbol: config.symbol || 'NQ',
      timeframe: config.timeframe || 60,
      imbalanceRatio: config.imbalanceRatio || 3.0,
    };

    this.spec = CME_SPECS[this.config.symbol] || { tickSize: 0.25, tickValue: 5.00 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<RithmicFootprintConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.symbol) {
      this.spec = CME_SPECS[config.symbol] || { tickSize: 0.25, tickValue: 5.00 };
    }
  }

  onCandles(callback: CandleCallback): void {
    console.log('[RithmicFootprint] Candle callback registered');
    this.candleCallback = callback;
  }

  onStatus(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    this.emitStatus('connecting', 'Connecting to Rithmic...');

    try {
      // Connect to Rithmic bridge
      rithmicClient.connect();

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        const unsubStatus = rithmicClient.onStatus((status) => {
          if (status === 'connected') {
            clearTimeout(timeout);
            unsubStatus();
            resolve();
          } else if (status === 'error') {
            clearTimeout(timeout);
            unsubStatus();
            reject(new Error('Connection failed'));
          }
        });
      });

      // Subscribe to trades
      console.log(`[RithmicFootprint] Subscribing to ${this.config.symbol}`);
      const unsubTrade = rithmicClient.subscribeTrades(this.config.symbol, (trade) => {
        this.processTrade(trade);
      });
      this.unsubscribers.push(unsubTrade);

      // Status updates
      const unsubStatus = rithmicClient.onStatus((status, message) => {
        this.emitStatus(status, message);
      });
      this.unsubscribers.push(unsubStatus);

      this.emitStatus('connected', `Streaming ${this.config.symbol}`);
      console.log('[RithmicFootprint] ✓ Connected and subscribed');

      return true;
    } catch (error) {
      console.error('[RithmicFootprint] Connection error:', error);
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
  // TRADE PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  private processTrade(trade: ClassifiedTrade): void {
    this.processedTradeCount++;

    if (this.processedTradeCount <= 10) {
      console.log(`[RithmicFootprint] ▶ Trade #${this.processedTradeCount}:`, trade);
    }

    // Validate trade
    if (!trade.price || trade.price <= 0 || !trade.size || trade.size <= 0) {
      console.warn('[RithmicFootprint] Invalid trade:', trade);
      return;
    }

    const { timeframe } = this.config;

    // Align price to tick
    const alignedPrice = this.alignToTick(trade.price);

    // Calculate candle time
    let timestamp: number;
    if (trade.timestamp && trade.timestamp > 0) {
      timestamp = trade.timestamp > 1e12
        ? Math.floor(trade.timestamp / 1000)
        : trade.timestamp;
    } else {
      timestamp = Math.floor(Date.now() / 1000);
    }

    const candleTime = Math.floor(timestamp / timeframe) * timeframe;

    // Get or create candle
    let candle = this.candles.get(candleTime);

    if (!candle) {
      if (!this.firstTradeReceived) {
        console.log(`[RithmicFootprint] ✓ FIRST TRADE - Creating candle at ${new Date(candleTime * 1000).toISOString()}`);
        this.firstTradeReceived = true;
      }

      candle = this.createCandle(candleTime, alignedPrice);
      this.candles.set(candleTime, candle);

      // Finalize previous candle
      if (this.currentCandleTime > 0 && this.currentCandleTime !== candleTime) {
        const prevCandle = this.candles.get(this.currentCandleTime);
        if (prevCandle && !prevCandle.isClosed) {
          this.finalizeCandle(prevCandle);
        }
      }

      this.currentCandleTime = candleTime;
    }

    // Update candle
    this.updateCandle(candle, alignedPrice, trade.size, trade.side);

    // Emit
    this.emitCandles();
  }

  private alignToTick(price: number): number {
    return Math.round(price / this.spec.tickSize) * this.spec.tickSize;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private createCandle(time: number, firstPrice: number): FootprintCandle {
    return {
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      openTime: time,
      closeTime: time + this.config.timeframe,
      isClosed: false,
      open: firstPrice,
      high: firstPrice,
      low: firstPrice,
      close: firstPrice,
      levels: new Map(),
      totalVolume: 0,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      totalDelta: 0,
      totalTrades: 0,
      poc: firstPrice,
      vah: firstPrice,
      val: firstPrice,
    };
  }

  private updateCandle(
    candle: FootprintCandle,
    price: number,
    size: number,
    side: 'BID' | 'ASK'
  ): void {
    // Update OHLC
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;

    // Get or create level
    let level = candle.levels.get(price);
    if (!level) {
      level = this.createLevel(price);
      candle.levels.set(price, level);
    }

    // Update level
    if (side === 'ASK') {
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

    // Update candle totals
    candle.totalVolume += size;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Update POC
    this.updatePOC(candle);
  }

  private createLevel(price: number): FootprintLevel {
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
      isPOC: false,
      isValueArea: false,
    };
  }

  private updatePOC(candle: FootprintCandle): void {
    let maxVolume = 0;
    let pocPrice = candle.close;

    candle.levels.forEach((level, price) => {
      level.isPOC = false;
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
    });

    candle.poc = pocPrice;
    const pocLevel = candle.levels.get(pocPrice);
    if (pocLevel) {
      pocLevel.isPOC = true;
    }
  }

  private finalizeCandle(candle: FootprintCandle): void {
    candle.isClosed = true;
    this.calculateImbalances(candle);
    this.calculateValueArea(candle);
  }

  private calculateImbalances(candle: FootprintCandle): void {
    const { imbalanceRatio } = this.config;
    const tickSize = this.spec.tickSize;

    candle.levels.forEach((level, price) => {
      level.imbalanceBuy = false;
      level.imbalanceSell = false;

      const priceBelow = Math.round((price - tickSize) * 10000) / 10000;
      const priceAbove = Math.round((price + tickSize) * 10000) / 10000;

      const levelBelow = candle.levels.get(priceBelow);
      if (levelBelow && levelBelow.bidVolume > 0 && level.askVolume > 0) {
        if (level.askVolume / levelBelow.bidVolume >= imbalanceRatio) {
          level.imbalanceBuy = true;
        }
      }

      const levelAbove = candle.levels.get(priceAbove);
      if (levelAbove && levelAbove.askVolume > 0 && level.bidVolume > 0) {
        if (level.bidVolume / levelAbove.askVolume >= imbalanceRatio) {
          level.imbalanceSell = true;
        }
      }
    });
  }

  private calculateValueArea(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    const totalVolume = candle.totalVolume;
    const targetVolume = totalVolume * 0.70;

    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[1].totalVolume - a[1].totalVolume);

    let accumulatedVolume = 0;
    const valueAreaPrices: number[] = [];

    for (const [price, level] of sortedLevels) {
      level.isValueArea = false;
      valueAreaPrices.push(price);
      accumulatedVolume += level.totalVolume;
      level.isValueArea = true;

      if (accumulatedVolume >= targetVolume) {
        break;
      }
    }

    if (valueAreaPrices.length > 0) {
      candle.vah = Math.max(...valueAreaPrices);
      candle.val = Math.min(...valueAreaPrices);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMIT
  // ═══════════════════════════════════════════════════════════════════════════

  private emitStatus(
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    message?: string
  ): void {
    this.statusCallback?.(status, message);
  }

  private emitCandles(): void {
    const candlesArray = Array.from(this.candles.values())
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-500);

    if (candlesArray.length === 0) {
      if (this.firstTradeReceived) {
        console.error('[RithmicFootprint] BUG: Emitting 0 candles after trades!');
      }
      return;
    }

    this.emitCount++;

    if (this.emitCount <= 5) {
      const latest = candlesArray[candlesArray.length - 1];
      console.log(`[RithmicFootprint] 📊 Emit #${this.emitCount}: ${candlesArray.length} candle(s)`, {
        volume: latest.totalVolume,
        delta: latest.totalDelta,
        levels: latest.levels.size,
      });
    }

    if (this.candleCallback) {
      this.candleCallback(candlesArray);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  getCandles(): FootprintCandle[] {
    return Array.from(this.candles.values())
      .sort((a, b) => a.openTime - b.openTime);
  }

  getCurrentCandle(): FootprintCandle | null {
    return this.candles.get(this.currentCandleTime) || null;
  }

  clear(): void {
    this.candles.clear();
    this.currentCandleTime = 0;
    this.processedTradeCount = 0;
    this.firstTradeReceived = false;
    this.emitCount = 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let instance: RithmicFootprintEngine | null = null;

export function getRithmicFootprintEngine(
  config?: Partial<RithmicFootprintConfig>
): RithmicFootprintEngine {
  if (!instance) {
    instance = new RithmicFootprintEngine(config);
  } else if (config) {
    instance.setConfig(config);
  }
  return instance;
}

export function resetRithmicFootprintEngine(): void {
  if (instance) {
    instance.disconnect();
    instance.clear();
  }
  instance = null;
}
