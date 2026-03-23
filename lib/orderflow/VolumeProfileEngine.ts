/**
 * VOLUME PROFILE ENGINE - Orderflow-based Volume Distribution
 *
 * Professional-grade volume profile calculation engine.
 *
 * CORE CONCEPT:
 *   Volume Profile shows the distribution of traded volume across price levels.
 *   It reveals where market participants have committed capital.
 *
 * DATA STRUCTURE:
 *   - Price is divided into discrete bins (ticks or price levels)
 *   - Each bin accumulates: total volume, bid volume, ask volume
 *   - From this distribution, we derive POC, VAH, VAL
 *
 * KEY METRICS:
 *   - POC (Point of Control): Price level with highest volume
 *   - VA (Value Area): Price range containing 70% of volume
 *   - VAH (Value Area High): Upper bound of value area
 *   - VAL (Value Area Low): Lower bound of value area
 *
 * ORDERFLOW DISTINCTION:
 *   - Bid Volume: Trades executed at bid (aggressive selling)
 *   - Ask Volume: Trades executed at ask (aggressive buying)
 *   - Delta at price: Ask volume - Bid volume at each level
 */

// ============ TYPES ============

export interface ProfileTrade {
  timestamp: number;      // Unix ms
  price: number;          // Trade price
  size: number;           // Trade size
  side: 'buy' | 'sell';   // Aggressor side
}

export interface PriceBin {
  price: number;          // Bin center price (rounded to tick)
  totalVolume: number;    // Total volume at this price
  bidVolume: number;      // Volume from sell aggressors (hit bid)
  askVolume: number;      // Volume from buy aggressors (lifted ask)
  delta: number;          // askVolume - bidVolume
  tradeCount: number;     // Number of trades
  maxSingleTrade: number; // Largest single trade (detect blocks)
  firstTradeTime: number; // When this level first traded
  lastTradeTime: number;  // When this level last traded
}

export interface ValueArea {
  poc: number;            // Point of Control price
  pocVolume: number;      // Volume at POC
  vah: number;            // Value Area High
  val: number;            // Value Area Low
  valueAreaVolume: number; // Total volume in VA
  valueAreaPercent: number; // Actual percentage (may differ from target)
}

export interface VolumeProfileState {
  bins: Map<number, PriceBin>;  // Price -> PriceBin
  tickSize: number;              // Price bin granularity
  totalVolume: number;           // Total profile volume
  totalBidVolume: number;        // Total bid volume
  totalAskVolume: number;        // Total ask volume
  totalDelta: number;            // Total delta
  tradeCount: number;            // Total trades
  profileHigh: number;           // Highest traded price
  profileLow: number;            // Lowest traded price
  sessionStart: number;          // Profile start time
  lastUpdateTime: number;        // Last update
}

export interface ProfileConfig {
  tickSize: number;              // Bin size (price granularity)
  valueAreaPercent: number;      // Value area target (default 70%)
  sessionType: 'fixed' | 'rolling' | 'anchored';
  rollingPeriodMs?: number;      // For rolling profile
  anchorTimestamp?: number;      // For anchored profile
  maxBins: number;               // Memory limit
}

// ============ DEFAULT CONFIGS ============

export const PROFILE_CONFIGS: Record<string, ProfileConfig> = {
  // ES/NQ Futures - $0.25 tick
  ES_FUTURES: {
    tickSize: 0.25,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 10000,
  },
  // Crypto - $1 bins
  CRYPTO_1: {
    tickSize: 1,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 50000,
  },
  // Crypto - $10 bins (for BTC)
  CRYPTO_10: {
    tickSize: 10,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 10000,
  },
  // Crypto - $100 bins (for BTC)
  CRYPTO_100: {
    tickSize: 100,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 5000,
  },
  // Forex - 1 pip
  FOREX: {
    tickSize: 0.0001,
    valueAreaPercent: 70,
    sessionType: 'fixed',
    maxBins: 50000,
  },
};

// ============ VOLUME PROFILE ENGINE ============

export class VolumeProfileEngine {
  private state: VolumeProfileState;
  private config: ProfileConfig;

  // Cache for value area calculation
  private cachedValueArea: ValueArea | null = null;
  private valueAreaDirty: boolean = true;

  // Rolling window data
  private rollingTrades: ProfileTrade[] = [];

  constructor(config: ProfileConfig = PROFILE_CONFIGS.CRYPTO_1) {
    this.config = config;
    this.state = this.createEmptyState();
  }

  // ============ CORE CALCULATION ============

  /**
   * Process a single trade
   *
   * Each trade:
   * 1. Gets assigned to a price bin (rounded to tick)
   * 2. Updates volume counters
   * 3. Tracks aggressor side (bid/ask)
   * 4. Invalidates value area cache
   *
   * COMPLEXITY: O(1) per trade
   */
  processTrade(trade: ProfileTrade): void {
    if (!this.isValidTrade(trade)) {
      return;
    }

    // Initialize session start
    if (this.state.sessionStart === 0) {
      this.state.sessionStart = trade.timestamp;
    }

    // Round price to tick size
    const binPrice = this.roundToTick(trade.price);

    // Get or create bin
    let bin = this.state.bins.get(binPrice);

    if (!bin) {
      // Check bin limit
      if (this.state.bins.size >= this.config.maxBins) {
        this.pruneOldBins();
      }

      bin = this.createEmptyBin(binPrice, trade.timestamp);
      this.state.bins.set(binPrice, bin);
    }

    // Update bin volumes
    bin.totalVolume += trade.size;
    bin.tradeCount++;
    bin.lastTradeTime = trade.timestamp;

    if (trade.size > bin.maxSingleTrade) {
      bin.maxSingleTrade = trade.size;
    }

    // Track aggressor side
    if (trade.side === 'buy') {
      // Buy aggressor = lifted ask
      bin.askVolume += trade.size;
      this.state.totalAskVolume += trade.size;
    } else {
      // Sell aggressor = hit bid
      bin.bidVolume += trade.size;
      this.state.totalBidVolume += trade.size;
    }

    // Update delta
    bin.delta = bin.askVolume - bin.bidVolume;

    // Update global state
    this.state.totalVolume += trade.size;
    this.state.totalDelta = this.state.totalAskVolume - this.state.totalBidVolume;
    this.state.tradeCount++;
    this.state.lastUpdateTime = trade.timestamp;

    // Update profile range
    if (trade.price > this.state.profileHigh || this.state.profileHigh === 0) {
      this.state.profileHigh = trade.price;
    }
    if (trade.price < this.state.profileLow || this.state.profileLow === Infinity) {
      this.state.profileLow = trade.price;
    }

    // Invalidate value area cache
    this.valueAreaDirty = true;

    // Rolling profile maintenance
    if (this.config.sessionType === 'rolling' && this.config.rollingPeriodMs) {
      this.rollingTrades.push(trade);
      this.pruneRollingTrades(trade.timestamp);
    }
  }

  /**
   * Process multiple trades (batch)
   */
  processTrades(trades: ProfileTrade[]): void {
    // Sort by timestamp for deterministic order
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sorted) {
      this.processTrade(trade);
    }
  }

  /**
   * Bulk inject volume at a price level (fast, no validation overhead).
   * Used to build VP from klines OHLCV without simulating individual trades.
   */
  addBulkVolume(price: number, buyVolume: number, sellVolume: number, timestamp: number = Date.now()): void {
    const binPrice = this.roundToTick(price);
    let bin = this.state.bins.get(binPrice);

    if (!bin) {
      if (this.state.bins.size >= this.config.maxBins) this.pruneOldBins();
      bin = this.createEmptyBin(binPrice, timestamp);
      this.state.bins.set(binPrice, bin);
    }

    const total = buyVolume + sellVolume;
    bin.totalVolume += total;
    bin.askVolume += buyVolume;
    bin.bidVolume += sellVolume;
    bin.delta = bin.askVolume - bin.bidVolume;
    bin.tradeCount++;
    bin.lastTradeTime = timestamp;

    this.state.totalVolume += total;
    this.state.totalAskVolume += buyVolume;
    this.state.totalBidVolume += sellVolume;
    this.state.totalDelta = this.state.totalAskVolume - this.state.totalBidVolume;
    this.state.tradeCount++;

    if (binPrice > this.state.profileHigh) this.state.profileHigh = binPrice;
    if (binPrice < this.state.profileLow || this.state.profileLow === 0) this.state.profileLow = binPrice;
    if (this.state.sessionStart === 0) this.state.sessionStart = timestamp;
  }

  // ============ VALUE AREA CALCULATION ============

  /**
   * Calculate Value Area using the TPO method
   *
   * ALGORITHM (70% Rule):
   * 1. Start with POC (highest volume price)
   * 2. Look at price levels immediately above and below POC
   * 3. Add the level with higher volume to value area
   * 4. Repeat until value area contains >= 70% of total volume
   *
   * This is the industry-standard method used by:
   *   - CME Market Profile
   *   - Institutional platforms
   */
  calculateValueArea(): ValueArea {
    // Return cached if valid
    if (!this.valueAreaDirty && this.cachedValueArea) {
      return this.cachedValueArea;
    }

    const bins = Array.from(this.state.bins.values());

    if (bins.length === 0) {
      return this.createEmptyValueArea();
    }

    // Sort bins by price (ascending)
    bins.sort((a, b) => a.price - b.price);

    // Find POC (highest volume bin)
    let pocBin = bins[0];
    for (const bin of bins) {
      if (bin.totalVolume > pocBin.totalVolume) {
        pocBin = bin;
      }
    }

    const pocIndex = bins.findIndex(b => b.price === pocBin.price);
    const targetVolume = this.state.totalVolume * (this.config.valueAreaPercent / 100);

    // Initialize value area with POC
    let vaVolume = pocBin.totalVolume;
    let vahIndex = pocIndex;
    let valIndex = pocIndex;

    // Expand value area until we reach target percentage
    while (vaVolume < targetVolume && (vahIndex < bins.length - 1 || valIndex > 0)) {
      // Get volumes at next levels above and below
      const aboveVolume = vahIndex < bins.length - 1 ? bins[vahIndex + 1].totalVolume : 0;
      const belowVolume = valIndex > 0 ? bins[valIndex - 1].totalVolume : 0;

      // Add the level with higher volume
      if (aboveVolume >= belowVolume && vahIndex < bins.length - 1) {
        vahIndex++;
        vaVolume += bins[vahIndex].totalVolume;
      } else if (valIndex > 0) {
        valIndex--;
        vaVolume += bins[valIndex].totalVolume;
      } else if (vahIndex < bins.length - 1) {
        vahIndex++;
        vaVolume += bins[vahIndex].totalVolume;
      } else {
        break; // Can't expand further
      }
    }

    const valueArea: ValueArea = {
      poc: pocBin.price,
      pocVolume: pocBin.totalVolume,
      vah: bins[vahIndex].price,
      val: bins[valIndex].price,
      valueAreaVolume: vaVolume,
      valueAreaPercent: this.state.totalVolume > 0
        ? (vaVolume / this.state.totalVolume) * 100
        : 0,
    };

    // Cache result
    this.cachedValueArea = valueArea;
    this.valueAreaDirty = false;

    return valueArea;
  }

  /**
   * Get POC (Point of Control)
   *
   * POC = Price level with highest traded volume
   * Represents "fair value" where most business occurred
   */
  getPOC(): { price: number; volume: number } {
    const va = this.calculateValueArea();
    return { price: va.poc, volume: va.pocVolume };
  }

  /**
   * Get VAH (Value Area High)
   *
   * Upper boundary of value area
   * Prices above VAH are considered "expensive" relative to session
   */
  getVAH(): number {
    return this.calculateValueArea().vah;
  }

  /**
   * Get VAL (Value Area Low)
   *
   * Lower boundary of value area
   * Prices below VAL are considered "cheap" relative to session
   */
  getVAL(): number {
    return this.calculateValueArea().val;
  }

  // ============ BIN ACCESS ============

  /**
   * Get all bins sorted by price
   */
  getBins(): PriceBin[] {
    return Array.from(this.state.bins.values())
      .sort((a, b) => a.price - b.price);
  }

  /**
   * Get bins sorted by volume (descending)
   */
  getBinsByVolume(): PriceBin[] {
    return Array.from(this.state.bins.values())
      .sort((a, b) => b.totalVolume - a.totalVolume);
  }

  /**
   * Get bin at specific price
   */
  getBinAtPrice(price: number): PriceBin | null {
    const binPrice = this.roundToTick(price);
    return this.state.bins.get(binPrice) || null;
  }

  /**
   * Get total volume in price range
   */
  getVolumeInRange(lowPrice: number, highPrice: number): {
    totalVolume: number;
    bidVolume: number;
    askVolume: number;
    delta: number;
  } {
    let totalVolume = 0;
    let bidVolume = 0;
    let askVolume = 0;

    for (const bin of this.state.bins.values()) {
      if (bin.price >= lowPrice && bin.price <= highPrice) {
        totalVolume += bin.totalVolume;
        bidVolume += bin.bidVolume;
        askVolume += bin.askVolume;
      }
    }

    return {
      totalVolume,
      bidVolume,
      askVolume,
      delta: askVolume - bidVolume,
    };
  }

  // ============ ORDERFLOW ANALYSIS ============

  /**
   * Detect absorption (large volume with minimal price movement)
   *
   * Absorption occurs when:
   * - High volume at a price level
   * - Price doesn't move through that level
   * - Often indicates hidden liquidity (iceberg orders)
   */
  detectAbsorption(threshold: number = 2): PriceBin[] {
    const bins = this.getBins();

    if (bins.length === 0) return [];

    // Calculate average volume per bin
    const avgVolume = this.state.totalVolume / bins.length;

    // Find bins with volume significantly above average
    return bins.filter(bin => bin.totalVolume >= avgVolume * threshold);
  }

  /**
   * Detect stop runs (rapid volume surge at price level)
   *
   * Stop runs typically show:
   * - Sudden volume spike
   * - High trade count in short time
   * - Often one-sided (mostly bid or ask)
   */
  detectStopRuns(): {
    price: number;
    volume: number;
    side: 'buy' | 'sell';
    intensity: number; // 0-1
  }[] {
    const bins = this.getBins();
    const stopRuns: {
      price: number;
      volume: number;
      side: 'buy' | 'sell';
      intensity: number;
    }[] = [];

    for (const bin of bins) {
      const totalSideVolume = bin.askVolume + bin.bidVolume;
      if (totalSideVolume === 0) continue;

      const askRatio = bin.askVolume / totalSideVolume;
      const bidRatio = bin.bidVolume / totalSideVolume;

      // Strong one-sided activity (>80% one side)
      if (askRatio > 0.8 || bidRatio > 0.8) {
        const side = askRatio > bidRatio ? 'buy' : 'sell';
        const intensity = Math.max(askRatio, bidRatio);

        stopRuns.push({
          price: bin.price,
          volume: bin.totalVolume,
          side,
          intensity,
        });
      }
    }

    return stopRuns.sort((a, b) => b.volume - a.volume);
  }

  /**
   * Detect potential iceberg orders
   *
   * Iceberg indicators:
   * - Very high trade count relative to total volume
   * - Many small trades at same price
   * - Volume accumulation without price movement
   */
  detectIcebergs(minTradeCount: number = 50): {
    price: number;
    tradeCount: number;
    avgTradeSize: number;
    totalVolume: number;
    icebergScore: number; // Higher = more likely iceberg
  }[] {
    const bins = this.getBins();
    const icebergs: {
      price: number;
      tradeCount: number;
      avgTradeSize: number;
      totalVolume: number;
      icebergScore: number;
    }[] = [];

    // Calculate global average trade size
    const globalAvgTradeSize = this.state.tradeCount > 0
      ? this.state.totalVolume / this.state.tradeCount
      : 0;

    for (const bin of bins) {
      if (bin.tradeCount < minTradeCount) continue;

      const avgTradeSize = bin.totalVolume / bin.tradeCount;

      // Iceberg score: higher when many small trades relative to average
      const sizeRatio = globalAvgTradeSize > 0 ? avgTradeSize / globalAvgTradeSize : 0;
      const icebergScore = (bin.tradeCount / 100) * (1 - Math.min(sizeRatio, 1));

      if (icebergScore > 0.5) {
        icebergs.push({
          price: bin.price,
          tradeCount: bin.tradeCount,
          avgTradeSize,
          totalVolume: bin.totalVolume,
          icebergScore,
        });
      }
    }

    return icebergs.sort((a, b) => b.icebergScore - a.icebergScore);
  }

  /**
   * Get delta profile (net buying/selling at each price)
   */
  getDeltaProfile(): { price: number; delta: number }[] {
    return this.getBins().map(bin => ({
      price: bin.price,
      delta: bin.delta,
    }));
  }

  /**
   * Find high volume nodes (HVN) and low volume nodes (LVN)
   *
   * HVN: Areas of high volume (support/resistance)
   * LVN: Areas of low volume (price travels quickly through these)
   */
  getVolumeNodes(): {
    hvn: PriceBin[];  // High Volume Nodes
    lvn: PriceBin[];  // Low Volume Nodes
  } {
    const bins = this.getBins();

    if (bins.length < 3) {
      return { hvn: [], lvn: [] };
    }

    const avgVolume = this.state.totalVolume / bins.length;
    const hvnThreshold = avgVolume * 1.5;  // 50% above average
    const lvnThreshold = avgVolume * 0.5;  // 50% below average

    return {
      hvn: bins.filter(b => b.totalVolume >= hvnThreshold),
      lvn: bins.filter(b => b.totalVolume <= lvnThreshold && b.totalVolume > 0),
    };
  }

  // ============ PRICE BIN HELPERS ============

  /**
   * Round price to tick size
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  private createEmptyBin(price: number, timestamp: number): PriceBin {
    return {
      price,
      totalVolume: 0,
      bidVolume: 0,
      askVolume: 0,
      delta: 0,
      tradeCount: 0,
      maxSingleTrade: 0,
      firstTradeTime: timestamp,
      lastTradeTime: timestamp,
    };
  }

  // ============ EDGE CASES ============

  /**
   * Validate trade data
   */
  private isValidTrade(trade: ProfileTrade): boolean {
    if (trade.price <= 0) return false;
    if (trade.size <= 0) return false;
    if (trade.timestamp <= 0) return false;
    return true;
  }

  /**
   * Handle prices with no trades
   *
   * For visualization, you may want to show all price levels
   * even those with zero volume. This creates empty bins.
   */
  fillEmptyPriceLevels(lowPrice: number, highPrice: number): void {
    let price = this.roundToTick(lowPrice);
    const high = this.roundToTick(highPrice);

    while (price <= high) {
      if (!this.state.bins.has(price)) {
        this.state.bins.set(price, this.createEmptyBin(price, 0));
      }
      price = this.roundToTick(price + this.config.tickSize);
    }
  }

  /**
   * Prune old bins when limit reached
   */
  private pruneOldBins(): void {
    // Remove bins with lowest volume first
    const sorted = Array.from(this.state.bins.entries())
      .sort((a, b) => a[1].totalVolume - b[1].totalVolume);

    // Remove 10% of bins
    const removeCount = Math.floor(sorted.length * 0.1);

    for (let i = 0; i < removeCount; i++) {
      const [price, bin] = sorted[i];
      this.state.totalVolume -= bin.totalVolume;
      this.state.totalBidVolume -= bin.bidVolume;
      this.state.totalAskVolume -= bin.askVolume;
      this.state.tradeCount -= bin.tradeCount;
      this.state.bins.delete(price);
    }

    this.valueAreaDirty = true;
  }

  /**
   * Prune old trades for rolling profile
   */
  private pruneRollingTrades(currentTime: number): void {
    if (!this.config.rollingPeriodMs) return;

    const cutoff = currentTime - this.config.rollingPeriodMs;

    // Remove old trades and their volume from bins
    while (this.rollingTrades.length > 0 && this.rollingTrades[0].timestamp < cutoff) {
      const oldTrade = this.rollingTrades.shift()!;
      const binPrice = this.roundToTick(oldTrade.price);
      const bin = this.state.bins.get(binPrice);

      if (bin) {
        bin.totalVolume -= oldTrade.size;
        bin.tradeCount--;

        if (oldTrade.side === 'buy') {
          bin.askVolume -= oldTrade.size;
          this.state.totalAskVolume -= oldTrade.size;
        } else {
          bin.bidVolume -= oldTrade.size;
          this.state.totalBidVolume -= oldTrade.size;
        }

        bin.delta = bin.askVolume - bin.bidVolume;

        // Remove bin if empty
        if (bin.totalVolume <= 0) {
          this.state.bins.delete(binPrice);
        }
      }

      this.state.totalVolume -= oldTrade.size;
      this.state.tradeCount--;
    }

    this.state.totalDelta = this.state.totalAskVolume - this.state.totalBidVolume;
    this.valueAreaDirty = true;
  }

  // ============ FAST MARKET HANDLING ============

  /**
   * Batch update for fast markets
   *
   * In fast markets, individual trade processing may lag.
   * Use batch updates with pre-aggregated data.
   */
  batchUpdate(aggregatedData: {
    price: number;
    totalVolume: number;
    bidVolume: number;
    askVolume: number;
    tradeCount: number;
    timestamp: number;
  }[]): void {
    for (const data of aggregatedData) {
      const binPrice = this.roundToTick(data.price);
      let bin = this.state.bins.get(binPrice);

      if (!bin) {
        if (this.state.bins.size >= this.config.maxBins) {
          this.pruneOldBins();
        }
        bin = this.createEmptyBin(binPrice, data.timestamp);
        this.state.bins.set(binPrice, bin);
      }

      bin.totalVolume += data.totalVolume;
      bin.bidVolume += data.bidVolume;
      bin.askVolume += data.askVolume;
      bin.tradeCount += data.tradeCount;
      bin.delta = bin.askVolume - bin.bidVolume;
      bin.lastTradeTime = data.timestamp;

      this.state.totalVolume += data.totalVolume;
      this.state.totalBidVolume += data.bidVolume;
      this.state.totalAskVolume += data.askVolume;
      this.state.tradeCount += data.tradeCount;
    }

    this.state.totalDelta = this.state.totalAskVolume - this.state.totalBidVolume;
    this.valueAreaDirty = true;
  }

  // ============ STATE MANAGEMENT ============

  private createEmptyState(): VolumeProfileState {
    return {
      bins: new Map(),
      tickSize: this.config.tickSize,
      totalVolume: 0,
      totalBidVolume: 0,
      totalAskVolume: 0,
      totalDelta: 0,
      tradeCount: 0,
      profileHigh: 0,
      profileLow: Infinity,
      sessionStart: 0,
      lastUpdateTime: 0,
    };
  }

  private createEmptyValueArea(): ValueArea {
    return {
      poc: 0,
      pocVolume: 0,
      vah: 0,
      val: 0,
      valueAreaVolume: 0,
      valueAreaPercent: 0,
    };
  }

  getState(): {
    totalVolume: number;
    totalBidVolume: number;
    totalAskVolume: number;
    totalDelta: number;
    tradeCount: number;
    profileHigh: number;
    profileLow: number;
    binCount: number;
  } {
    return {
      totalVolume: this.state.totalVolume,
      totalBidVolume: this.state.totalBidVolume,
      totalAskVolume: this.state.totalAskVolume,
      totalDelta: this.state.totalDelta,
      tradeCount: this.state.tradeCount,
      profileHigh: this.state.profileHigh,
      profileLow: this.state.profileLow,
      binCount: this.state.bins.size,
    };
  }

  reset(): void {
    this.state = this.createEmptyState();
    this.cachedValueArea = null;
    this.valueAreaDirty = true;
    this.rollingTrades = [];
  }

  setConfig(config: ProfileConfig): void {
    this.config = config;
    this.state.tickSize = config.tickSize;
    this.reset();
  }

  setTickSize(tickSize: number): void {
    if (tickSize !== this.config.tickSize) {
      this.config.tickSize = tickSize;
      this.state.tickSize = tickSize;
      this.reset();
    }
  }

  // ============ SERIALIZATION ============

  toJSON(): string {
    const binsArray = Array.from(this.state.bins.entries());
    return JSON.stringify({
      bins: binsArray,
      config: this.config,
      state: {
        ...this.state,
        bins: undefined, // Exclude from state, use binsArray
      },
    });
  }

  fromJSON(json: string): void {
    const data = JSON.parse(json);
    this.config = data.config;
    this.state = {
      ...data.state,
      bins: new Map(data.bins),
      tickSize: data.config.tickSize,
    };
    this.valueAreaDirty = true;
    this.cachedValueArea = null;
  }
}

// ============ SINGLETON ============

let volumeProfileEngineInstance: VolumeProfileEngine | null = null;

export function getVolumeProfileEngine(): VolumeProfileEngine {
  if (!volumeProfileEngineInstance) {
    volumeProfileEngineInstance = new VolumeProfileEngine();
  }
  return volumeProfileEngineInstance;
}

export function resetVolumeProfileEngine(): void {
  volumeProfileEngineInstance = null;
}
