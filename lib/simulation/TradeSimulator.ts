/**
 * TRADE SIMULATOR - CME FUTURES
 *
 * Génère des trades simulés réalistes pour tester le footprint
 * sans connexion externe (dxFeed, Rithmic, etc.)
 *
 * Usage:
 *   const simulator = getTradeSimulator({ symbol: 'NQ' });
 *   simulator.onTrade((trade) => engine.processTrade(trade));
 *   simulator.start();
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SimulatedTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'BID' | 'ASK';
  timestamp: number;
}

export interface SimulatorConfig {
  symbol: string;
  basePrice?: number;
  tickSize?: number;
  tradesPerSecond?: number;
  volatility?: number;  // Price movement intensity
}

type TradeCallback = (trade: SimulatedTrade) => void;
type StatusCallback = (status: 'running' | 'stopped') => void;

// ═══════════════════════════════════════════════════════════════════════════════
// CME SPECIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const CME_DEFAULTS: Record<string, { basePrice: number; tickSize: number }> = {
  'NQ': { basePrice: 21500, tickSize: 0.25 },
  'MNQ': { basePrice: 21500, tickSize: 0.25 },
  'ES': { basePrice: 6050, tickSize: 0.25 },
  'MES': { basePrice: 6050, tickSize: 0.25 },
  'YM': { basePrice: 44500, tickSize: 1.0 },
  'GC': { basePrice: 2650, tickSize: 0.10 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class TradeSimulator {
  private config: Required<SimulatorConfig>;
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;

  private currentPrice: number;
  private currentBid: number;
  private currentAsk: number;
  private tradeCount = 0;

  // Callbacks
  private tradeCallbacks: Set<TradeCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();

  // Market microstructure simulation
  private momentum = 0;
  private lastSide: 'BID' | 'ASK' = 'ASK';

  constructor(config: SimulatorConfig) {
    const defaults = CME_DEFAULTS[config.symbol] || { basePrice: 20000, tickSize: 0.25 };

    this.config = {
      symbol: config.symbol,
      basePrice: config.basePrice ?? defaults.basePrice,
      tickSize: config.tickSize ?? defaults.tickSize,
      tradesPerSecond: config.tradesPerSecond ?? 5,
      volatility: config.volatility ?? 1.0,
    };

    this.currentPrice = this.config.basePrice;
    this.currentBid = this.currentPrice - this.config.tickSize;
    this.currentAsk = this.currentPrice;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  start(): void {
    if (this.running) return;

    console.log(`[Simulator] Starting ${this.config.symbol} @ ${this.currentPrice}`);
    this.running = true;
    this.emitStatus('running');

    const interval = Math.floor(1000 / this.config.tradesPerSecond);

    this.intervalId = setInterval(() => {
      this.generateTrade();
    }, interval);
  }

  stop(): void {
    if (!this.running) return;

    console.log(`[Simulator] Stopped after ${this.tradeCount} trades`);
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emitStatus('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADE GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  private generateTrade(): void {
    const { tickSize, volatility } = this.config;

    // ─────────────────────────────────────────────────────────────────────────
    // 1. UPDATE MOMENTUM (simulates order flow pressure)
    // ─────────────────────────────────────────────────────────────────────────
    // Random walk with mean reversion
    this.momentum += (Math.random() - 0.5) * volatility;
    this.momentum *= 0.95;  // Mean reversion

    // ─────────────────────────────────────────────────────────────────────────
    // 2. DETERMINE SIDE (bid/ask based on momentum + randomness)
    // ─────────────────────────────────────────────────────────────────────────
    const sideProb = 0.5 + this.momentum * 0.3;
    const side: 'BID' | 'ASK' = Math.random() < sideProb ? 'ASK' : 'BID';

    // ─────────────────────────────────────────────────────────────────────────
    // 3. MOVE PRICE (based on side and momentum)
    // ─────────────────────────────────────────────────────────────────────────
    let priceMove = 0;

    // Trending move
    if (Math.random() < 0.3 * volatility) {
      priceMove = side === 'ASK' ? tickSize : -tickSize;
    }

    // Large move (breakout simulation)
    if (Math.random() < 0.02 * volatility) {
      priceMove = (side === 'ASK' ? 1 : -1) * tickSize * Math.floor(Math.random() * 4 + 2);
    }

    this.currentPrice = Math.round((this.currentPrice + priceMove) / tickSize) * tickSize;
    this.currentBid = this.currentPrice - tickSize;
    this.currentAsk = this.currentPrice;

    // ─────────────────────────────────────────────────────────────────────────
    // 4. DETERMINE SIZE (realistic distribution)
    // ─────────────────────────────────────────────────────────────────────────
    let size: number;
    const sizeRand = Math.random();

    if (sizeRand < 0.6) {
      // Small trades (1-3)
      size = Math.floor(Math.random() * 3) + 1;
    } else if (sizeRand < 0.9) {
      // Medium trades (4-10)
      size = Math.floor(Math.random() * 7) + 4;
    } else {
      // Large trades (11-50)
      size = Math.floor(Math.random() * 40) + 11;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. CREATE AND EMIT TRADE
    // ─────────────────────────────────────────────────────────────────────────
    const trade: SimulatedTrade = {
      symbol: this.config.symbol,
      price: side === 'ASK' ? this.currentAsk : this.currentBid,
      size,
      side,
      timestamp: Date.now(),
    };

    this.tradeCount++;
    this.lastSide = side;

    // Log periodically
    if (this.tradeCount <= 5 || this.tradeCount % 50 === 0) {
      console.log(`[Simulator] Trade #${this.tradeCount}: ${trade.price} x${trade.size} (${trade.side})`);
    }

    // Emit to callbacks
    this.tradeCallbacks.forEach(cb => cb(trade));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════

  onTrade(callback: TradeCallback): () => void {
    this.tradeCallbacks.add(callback);
    return () => this.tradeCallbacks.delete(callback);
  }

  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  private emitStatus(status: 'running' | 'stopped'): void {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORICAL DATA GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate historical trades for backtesting/display
   * @param candleCount Number of candles to generate
   * @param timeframeSeconds Candle timeframe in seconds (e.g., 60 for 1m)
   * @param tradesPerCandle Average trades per candle
   * @returns Array of simulated trades with historical timestamps
   */
  generateHistoricalTrades(
    candleCount: number = 20,
    timeframeSeconds: number = 60,
    tradesPerCandle: number = 50
  ): SimulatedTrade[] {
    const { tickSize, volatility } = this.config;
    const trades: SimulatedTrade[] = [];

    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (candleCount * timeframeSeconds);

    // Reset price to base for historical generation
    let histPrice = this.config.basePrice;
    let histMomentum = 0;

    console.log(`[Simulator] Generating ${candleCount} historical candles (${tradesPerCandle} trades each)`);

    for (let candle = 0; candle < candleCount; candle++) {
      const candleStartTime = startTime + (candle * timeframeSeconds);

      // Vary trades per candle for realism (80-120% of average)
      const candleTrades = Math.floor(tradesPerCandle * (0.8 + Math.random() * 0.4));

      // Generate a trend for this candle (less extreme for tighter price range)
      const candleTrend = (Math.random() - 0.5) * 1.5;  // -0.75 to +0.75

      // Candle price range: typically 4-12 ticks for CME futures
      const candleRange = Math.floor(4 + Math.random() * 8);
      const candleOpen = histPrice;

      for (let t = 0; t < candleTrades; t++) {
        // Update momentum with candle trend influence
        histMomentum += (Math.random() - 0.5 + candleTrend * 0.15) * volatility;
        histMomentum *= 0.92;  // Slower mean reversion for more persistent moves

        // Determine side based on momentum
        const sideProb = 0.5 + histMomentum * 0.35 + candleTrend * 0.15;
        const side: 'BID' | 'ASK' = Math.random() < sideProb ? 'ASK' : 'BID';

        // Price movement - TIGHTER range within candle
        // Only move price 20% of the time (creates more volume at each level)
        let priceMove = 0;
        if (Math.random() < 0.20) {
          priceMove = side === 'ASK' ? tickSize : -tickSize;
        }

        // Occasional larger move (3% chance)
        if (Math.random() < 0.03) {
          priceMove = (side === 'ASK' ? 1 : -1) * tickSize * Math.floor(Math.random() * 3 + 2);
        }

        // Keep price within candle range (prevents drift)
        const proposedPrice = histPrice + priceMove;
        if (Math.abs(proposedPrice - candleOpen) > candleRange * tickSize) {
          // Mean revert toward candle open
          priceMove = candleOpen > histPrice ? tickSize : -tickSize;
        }

        histPrice = Math.round((histPrice + priceMove) / tickSize) * tickSize;

        // Size distribution - more larger trades for visible volume
        let size: number;
        const sizeRand = Math.random();
        if (sizeRand < 0.4) {
          // Small trades (1-5)
          size = Math.floor(Math.random() * 5) + 1;
        } else if (sizeRand < 0.8) {
          // Medium trades (6-20)
          size = Math.floor(Math.random() * 15) + 6;
        } else {
          // Large trades (21-80)
          size = Math.floor(Math.random() * 60) + 21;
        }

        // Timestamp within candle (spread across the timeframe)
        const tradeOffset = (t / candleTrades) * timeframeSeconds;
        const timestamp = (candleStartTime + tradeOffset) * 1000;  // Convert to ms

        trades.push({
          symbol: this.config.symbol,
          price: side === 'ASK' ? histPrice : histPrice - tickSize,
          size,
          side,
          timestamp,
        });
      }

      // Move to next candle with trend continuation
      histPrice = Math.round((histPrice + candleTrend * tickSize * 2) / tickSize) * tickSize;
    }

    // Update current price to end of historical data
    this.currentPrice = histPrice;
    this.currentBid = histPrice - tickSize;
    this.currentAsk = histPrice;

    console.log(`[Simulator] Generated ${trades.length} historical trades, ending at price ${histPrice}`);

    return trades;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════════

  getTradeCount(): number {
    return this.tradeCount;
  }

  getCurrentPrice(): number {
    return this.currentPrice;
  }

  reset(): void {
    this.tradeCount = 0;
    this.momentum = 0;
    this.currentPrice = this.config.basePrice;
    this.currentBid = this.currentPrice - this.config.tickSize;
    this.currentAsk = this.currentPrice;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

let instance: TradeSimulator | null = null;

export function getTradeSimulator(config?: SimulatorConfig): TradeSimulator {
  if (!instance && config) {
    instance = new TradeSimulator(config);
  } else if (!instance) {
    instance = new TradeSimulator({ symbol: 'NQ' });
  }
  return instance;
}

export function resetTradeSimulator(): void {
  if (instance) {
    instance.stop();
    instance.reset();
  }
  instance = null;
}
