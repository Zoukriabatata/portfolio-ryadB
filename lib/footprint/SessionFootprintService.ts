/**
 * SESSION FOOTPRINT SERVICE - Professional Implementation
 *
 * Architecture:
 * 1. Session Management: 00:00 UTC → Now (crypto 24/7)
 * 2. Historical Loading: Fetch ALL aggTrades since session start
 * 3. Live Buffer: Continue adding trades in real-time
 * 4. Footprint Reconstruction: Build candles from individual trades
 *
 * This is how institutional platforms work.
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ============ TYPES ============

export interface AggTrade {
  id: number;
  price: number;
  quantity: number;
  firstTradeId: number;
  lastTradeId: number;
  time: number;          // Unix timestamp ms
  isBuyerMaker: boolean; // true = sell aggressor, false = buy aggressor
}

export interface SessionConfig {
  symbol: string;
  timeframe: number;      // Seconds (60 = M1)
  tickSize: number;
  imbalanceRatio: number;
}

export interface SessionState {
  sessionId: string;      // e.g., "2026-02-01_BTCUSDT"
  sessionStart: number;   // Unix timestamp ms (00:00 UTC)
  sessionEnd: number;     // Unix timestamp ms (23:59:59 UTC)
  lastTradeId: number;    // Last processed trade ID
  lastTradeTime: number;  // Last trade timestamp
  totalTrades: number;    // Total trades processed
  candles: Map<number, FootprintCandle>; // time → candle
  isLive: boolean;
  // O(1) POC tracking per candle
  pocTracking: Map<number, { price: number; volume: number }>;
}

// ============ SESSION FOOTPRINT SERVICE ============

export class SessionFootprintService {
  private config: SessionConfig;
  private session: SessionState | null = null;
  private loadingProgress: number = 0;
  private isLoading: boolean = false;
  private onProgress: ((progress: number, message: string) => void) | null = null;

  constructor(config: SessionConfig) {
    this.config = config;
  }

  /**
   * Set progress callback for UI updates
   */
  setProgressCallback(callback: (progress: number, message: string) => void): void {
    this.onProgress = callback;
  }

  /**
   * Get current session start time (00:00 UTC today)
   */
  private getSessionStart(): number {
    const now = new Date();
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
    return utcMidnight;
  }

  /**
   * Get session end time (23:59:59.999 UTC today)
   */
  private getSessionEnd(): number {
    const now = new Date();
    const utcEndOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999);
    return utcEndOfDay;
  }

  /**
   * Initialize a new session
   */
  private initSession(): SessionState {
    const sessionStart = this.getSessionStart();
    const sessionEnd = this.getSessionEnd();
    const date = new Date(sessionStart).toISOString().split('T')[0];

    return {
      sessionId: `${date}_${this.config.symbol.toUpperCase()}`,
      sessionStart,
      sessionEnd,
      lastTradeId: 0,
      lastTradeTime: sessionStart,
      totalTrades: 0,
      candles: new Map(),
      isLive: false,
      pocTracking: new Map(),
    };
  }

  /**
   * MAIN ENTRY POINT: Load complete session from trades
   *
   * This is the professional approach:
   * 1. Fetch ALL aggTrades since 00:00 UTC
   * 2. Reconstruct every M1 footprint candle
   * 3. Return 100+ candles for a full day
   */
  async loadSession(): Promise<FootprintCandle[]> {
    if (this.isLoading) {
      console.warn('[SessionFootprint] Already loading, please wait...');
      return this.getCandlesArray();
    }

    this.isLoading = true;
    this.loadingProgress = 0;
    this.session = this.initSession();

    const { sessionStart } = this.session;
    const now = Date.now();

    console.log(`[SessionFootprint] Loading session from ${new Date(sessionStart).toISOString()} to now`);
    this.reportProgress(0, 'Starting session load...');

    try {
      // ═══════════════════════════════════════════════════════════════
      // PHASE 1: Fetch trades - conservative rate limiting
      // Binance limits ~1200 req/min, we use ~20 req/min to be safe
      // ═══════════════════════════════════════════════════════════════
      const minutesBack = 60; // Load last 60 minutes of trades
      const startTime = Math.max(sessionStart, now - minutesBack * 60 * 1000);
      let currentStartTime = startTime;
      let totalTradesFetched = 0;
      let batchNumber = 0;
      let consecutiveErrors = 0;
      const maxBatches = 100; // Safety limit
      const requestDelay = 500; // 500ms between requests = ~120 req/min max

      this.reportProgress(5, `Loading last ${minutesBack} min of trades...`);

      while (currentStartTime < now && batchNumber < maxBatches) {
        batchNumber++;

        // Fetch batch of trades with retry logic
        const trades = await this.fetchAggTradesWithRetry(currentStartTime, 1000);

        if (trades.length === 0) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            console.log('[SessionFootprint] Stopping after empty responses');
            break;
          }
          // Wait longer and skip ahead
          await this.sleep(2000);
          currentStartTime += 60000; // Skip 1 minute
          continue;
        }

        consecutiveErrors = 0;

        // Process trades into footprint candles
        for (const trade of trades) {
          this.processTradeIntoCandle(trade);
        }

        totalTradesFetched += trades.length;
        this.session.totalTrades = totalTradesFetched;

        // Update last trade info
        const lastTrade = trades[trades.length - 1];
        this.session.lastTradeId = lastTrade.id;
        this.session.lastTradeTime = lastTrade.time;

        // Move to next batch
        currentStartTime = lastTrade.time + 1;

        // Progress
        const elapsed = currentStartTime - startTime;
        const total = now - startTime;
        const progress = Math.min(90, 5 + (elapsed / total) * 85);
        this.loadingProgress = progress;

        const candleCount = this.session.candles.size;
        this.reportProgress(progress, `${totalTradesFetched.toLocaleString()} trades → ${candleCount} candles`);

        // Conservative rate limiting
        await this.sleep(requestDelay);
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: Calculate metrics for all candles
      // ═══════════════════════════════════════════════════════════════
      this.reportProgress(95, 'Calculating footprint metrics...');

      this.session.candles.forEach(candle => {
        this.calculateCandleMetrics(candle);
      });

      // Mark session as ready for live updates
      this.session.isLive = true;

      const finalCandles = this.getCandlesArray();
      this.reportProgress(100, `Session loaded: ${finalCandles.length} candles from ${this.session.totalTrades.toLocaleString()} trades`);

      console.log(`[SessionFootprint] ✓ Session loaded: ${finalCandles.length} candles from ${this.session.totalTrades.toLocaleString()} trades`);

      return finalCandles;

    } catch (error) {
      console.error('[SessionFootprint] Error loading session:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch aggTrades from Binance
   *
   * Binance aggTrades endpoint:
   * - Returns up to 1000 trades per request
   * - startTime: inclusive
   * - Each trade has isBuyerMaker for bid/ask classification
   */
  private async fetchAggTrades(startTime: number, limit: number = 1000): Promise<AggTrade[]> {
    const params = new URLSearchParams({
      symbol: this.config.symbol.toUpperCase(),
      startTime: startTime.toString(),
      limit: limit.toString(),
    });

    const url = `/api/binance/fapi/v1/aggTrades?${params}`;
    console.log(`[SessionFootprint] Fetching: ${url}`);

    const response = await fetch(url);
    const responseText = await response.text();

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[SessionFootprint] Failed to parse response:', responseText.substring(0, 200));
      return [];
    }

    if (!response.ok) {
      // Rate limit handling - wait much longer
      if (response.status === 429 || response.status === 418) {
        console.warn('[SessionFootprint] Rate limited, waiting 30 seconds...');
        this.reportProgress(this.loadingProgress, 'Rate limited - waiting 30s...');
        await this.sleep(30000);
      } else {
        console.error(`[SessionFootprint] HTTP ${response.status}:`, data);
      }
      return [];
    }

    // Check if it's an error response from Binance
    if (data && typeof data === 'object' && 'code' in data) {
      console.error('[SessionFootprint] Binance error:', data);
      return [];
    }

    if (!Array.isArray(data)) {
      console.error('[SessionFootprint] Invalid aggTrades response (not array):', typeof data, data);
      return [];
    }

    console.log(`[SessionFootprint] Got ${data.length} trades`);

    return data.map((t: {
      a: number;
      p: string;
      q: string;
      f: number;
      l: number;
      T: number;
      m: boolean;
    }) => ({
      id: t.a,
      price: parseFloat(t.p),
      quantity: parseFloat(t.q),
      firstTradeId: t.f,
      lastTradeId: t.l,
      time: t.T,
      isBuyerMaker: t.m,
    }));
  }

  /**
   * Fetch aggTrades with exponential backoff retry
   */
  private async fetchAggTradesWithRetry(startTime: number, limit: number = 1000): Promise<AggTrade[]> {
    const maxRetries = 3;
    let retryDelay = 5000; // Start with 5 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const trades = await this.fetchAggTrades(startTime, limit);

      // If we got trades, return them
      if (trades.length > 0) {
        return trades;
      }

      // If this was the last attempt, return empty
      if (attempt === maxRetries) {
        return [];
      }

      // Wait with exponential backoff
      this.reportProgress(this.loadingProgress, `Retry ${attempt}/${maxRetries}...`);
      await this.sleep(retryDelay);
      retryDelay *= 2; // Double the delay (5s → 10s → 20s)
    }

    return [];
  }

  /**
   * Process a single trade into the appropriate footprint candle
   *
   * This is the CORE of footprint reconstruction:
   * - Each trade goes into its time bucket (candle)
   * - Each trade goes into its price level
   * - isBuyerMaker determines bid/ask classification
   */
  private processTradeIntoCandle(trade: AggTrade): void {
    if (!this.session) return;

    const { timeframe, tickSize } = this.config;

    // Calculate candle time bucket (floor to timeframe)
    const candleTime = Math.floor(trade.time / 1000 / timeframe) * timeframe;

    // Get or create candle
    let candle = this.session.candles.get(candleTime);

    if (!candle) {
      candle = {
        time: candleTime,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        levels: new Map(),
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        totalDelta: 0,
        totalTrades: 0,
        poc: trade.price,
        vah: trade.price,
        val: trade.price,
        isClosed: false,
      };
      this.session.candles.set(candleTime, candle);
    }

    // Update OHLC
    if (candle.totalTrades === 0) {
      candle.open = trade.price;
    }
    candle.high = Math.max(candle.high, trade.price);
    candle.low = Math.min(candle.low, trade.price);
    candle.close = trade.price;

    // Snap to price level: Math.floor (ATAS convention, not Math.round)
    // Math.round shifts boundary trades to the wrong bin (e.g. 71799.8 → 71800 instead of 71790)
    const priceLevel = Math.floor(trade.price / tickSize) * tickSize;

    // Get or create level
    let level = candle.levels.get(priceLevel);
    if (!level) {
      level = {
        price: priceLevel,
        bidVolume: 0,
        askVolume: 0,
        bidTrades: 0,
        askTrades: 0,
        delta: 0,
        totalVolume: 0,
        imbalanceBuy: false,
        imbalanceSell: false,
      };
      candle.levels.set(priceLevel, level);
    }

    // ═══════════════════════════════════════════════════════════════
    // CRITICAL: Bid/Ask Classification from isBuyerMaker
    //
    // isBuyerMaker = true  → Seller was the aggressor → Market SELL → BID volume
    // isBuyerMaker = false → Buyer was the aggressor  → Market BUY  → ASK volume
    //
    // This is the REAL Time & Sales classification, not estimated!
    // ═══════════════════════════════════════════════════════════════
    if (trade.isBuyerMaker) {
      // Sell aggressor = hit the BID
      level.bidVolume += trade.quantity;
      level.bidTrades += 1;
      candle.totalSellVolume += trade.quantity;
    } else {
      // Buy aggressor = hit the ASK
      level.askVolume += trade.quantity;
      level.askTrades += 1;
      candle.totalBuyVolume += trade.quantity;
    }

    // Update level totals
    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Update candle totals
    candle.totalVolume += trade.quantity;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades += 1;

    // ═══════════════════════════════════════════════════════════════
    // O(1) INCREMENTAL POC UPDATE
    // Track max volume per candle without iterating all levels
    // ═══════════════════════════════════════════════════════════════
    const currentPOC = this.session.pocTracking.get(candleTime);
    if (!currentPOC || level.totalVolume > currentPOC.volume) {
      this.session.pocTracking.set(candleTime, { price: priceLevel, volume: level.totalVolume });
      candle.poc = priceLevel;
    }

    // ═══════════════════════════════════════════════════════════════
    // O(1) INCREMENTAL IMBALANCE UPDATE
    // Only check the affected level and its neighbors (3 levels max)
    // ═══════════════════════════════════════════════════════════════
    this.updateLevelImbalance(candle, priceLevel, level);
  }

  /**
   * O(1) Incremental imbalance check for a single level
   * Only checks the affected level and updates neighbors
   */
  private updateLevelImbalance(candle: FootprintCandle, price: number, level: PriceLevel): void {
    const { tickSize, imbalanceRatio } = this.config;

    const priceBelowKey = Math.round((price - tickSize) * 1000000) / 1000000;
    const priceAboveKey = Math.round((price + tickSize) * 1000000) / 1000000;

    const levelBelow = candle.levels.get(priceBelowKey);
    const levelAbove = candle.levels.get(priceAboveKey);

    // Check current level's imbalances
    if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
      level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
    } else {
      level.imbalanceBuy = false;
    }

    if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
      level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
    } else {
      level.imbalanceSell = false;
    }

    // Also update neighbors' imbalances (they may now be affected)
    if (levelAbove) {
      levelAbove.imbalanceBuy = level.bidVolume > 0 && levelAbove.askVolume > 0
        ? (levelAbove.askVolume / level.bidVolume) >= imbalanceRatio
        : false;
    }

    if (levelBelow) {
      levelBelow.imbalanceSell = level.askVolume > 0 && levelBelow.bidVolume > 0
        ? (levelBelow.bidVolume / level.askVolume) >= imbalanceRatio
        : false;
    }
  }

  /**
   * Calculate POC, VAH/VAL, and imbalances for a candle
   */
  private calculateCandleMetrics(candle: FootprintCandle): void {
    const { tickSize, imbalanceRatio } = this.config;

    // ═══════════════════════════════════════════════════════════════
    // POC (Point of Control) - Price level with highest total volume
    // ═══════════════════════════════════════════════════════════════
    let maxVolume = 0;
    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        candle.poc = price;
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // DIAGONAL IMBALANCES (professional methodology)
    //
    // Buy imbalance: Ask[price] vs Bid[price - tickSize]
    // Sell imbalance: Bid[price] vs Ask[price + tickSize]
    // ═══════════════════════════════════════════════════════════════
    candle.levels.forEach((level, price) => {
      const priceBelowKey = Math.round((price - tickSize) * 1000000) / 1000000;
      const priceAboveKey = Math.round((price + tickSize) * 1000000) / 1000000;

      const levelBelow = candle.levels.get(priceBelowKey);
      const levelAbove = candle.levels.get(priceAboveKey);

      // Buy imbalance: Current Ask vs Below Bid
      if (levelBelow && level.askVolume > 0 && levelBelow.bidVolume > 0) {
        level.imbalanceBuy = (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio;
      }

      // Sell imbalance: Current Bid vs Above Ask
      if (levelAbove && level.bidVolume > 0 && levelAbove.askVolume > 0) {
        level.imbalanceSell = (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio;
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // VALUE AREA (VAH/VAL) - 70% of volume
    // ═══════════════════════════════════════════════════════════════
    const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
    const totalVolume = candle.totalVolume;
    let cumulativeVolume = 0;

    candle.val = sortedPrices[0] || candle.low;
    candle.vah = sortedPrices[sortedPrices.length - 1] || candle.high;

    for (const price of sortedPrices) {
      const level = candle.levels.get(price)!;
      cumulativeVolume += level.totalVolume;

      if (cumulativeVolume >= totalVolume * 0.15 && candle.val === sortedPrices[0]) {
        candle.val = price;
      }
      if (cumulativeVolume >= totalVolume * 0.85) {
        candle.vah = price;
        break;
      }
    }
  }

  /**
   * Process a live trade (called from WebSocket)
   *
   * PERFORMANCE: O(1) per trade
   * - POC and imbalances are updated incrementally in processTradeIntoCandle()
   * - No full recalculation needed
   */
  processLiveTrade(trade: AggTrade): FootprintCandle | null {
    if (!this.session || !this.session.isLive) {
      return null;
    }

    // Skip if we've already processed this trade
    if (trade.id <= this.session.lastTradeId) {
      return null;
    }

    // Process the trade (includes O(1) POC + imbalance updates)
    this.processTradeIntoCandle(trade);

    // Update session state
    this.session.lastTradeId = trade.id;
    this.session.lastTradeTime = trade.time;
    this.session.totalTrades++;

    // Get the candle that was updated
    const candleTime = Math.floor(trade.time / 1000 / this.config.timeframe) * this.config.timeframe;
    const candle = this.session.candles.get(candleTime);

    // POC and imbalances already updated incrementally - no recalculation needed

    return candle || null;
  }

  /**
   * Get all candles as sorted array
   */
  getCandlesArray(): FootprintCandle[] {
    if (!this.session) return [];

    return Array.from(this.session.candles.values())
      .sort((a, b) => a.time - b.time);
  }

  /**
   * Get session info
   */
  getSessionInfo(): {
    sessionId: string;
    candleCount: number;
    totalTrades: number;
    isLive: boolean;
    loadingProgress: number;
  } | null {
    if (!this.session) return null;

    return {
      sessionId: this.session.sessionId,
      candleCount: this.session.candles.size,
      totalTrades: this.session.totalTrades,
      isLive: this.session.isLive,
      loadingProgress: this.loadingProgress,
    };
  }

  /**
   * Check if a new session is needed (day changed)
   */
  needsNewSession(): boolean {
    if (!this.session) return true;

    const currentSessionStart = this.getSessionStart();
    return currentSessionStart !== this.session.sessionStart;
  }

  /**
   * Reset session
   */
  resetSession(): void {
    this.session = null;
    this.loadingProgress = 0;
    this.isLoading = false;
  }

  private reportProgress(progress: number, message: string): void {
    if (this.onProgress) {
      this.onProgress(progress, message);
    }
    console.log(`[SessionFootprint] ${progress.toFixed(0)}% - ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ SINGLETON ============

let sessionService: SessionFootprintService | null = null;

export function getSessionFootprintService(config?: SessionConfig): SessionFootprintService {
  if (!sessionService && config) {
    sessionService = new SessionFootprintService(config);
  }
  if (!sessionService) {
    throw new Error('SessionFootprintService not initialized. Provide config on first call.');
  }
  return sessionService;
}

export function resetSessionFootprintService(): void {
  sessionService?.resetSession();
  sessionService = null;
}
