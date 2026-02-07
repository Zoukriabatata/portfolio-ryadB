/**
 * SMOOTHED SIMULATION ENGINE
 *
 * Time-dilated, human-readable market simulation.
 * Designed for professional trading analysis.
 *
 * Key Features:
 * - Global time dilation (0.35x - 1.0x speed)
 * - Batched order book updates (100ms slices)
 * - Smooth liquidity fade in/out (400-800ms)
 * - Price movement pacing (120ms minimum between ticks)
 * - Trade clustering with extended lifetime
 * - EMA smoothing on all values
 *
 * Speed Modes:
 * - ANALYSIS: 0.35x (maximum readability)
 * - TRADING: 0.55x (balanced realism)
 * - REPLAY: 1.0x (fast review)
 */

// ============================================================================
// SPEED MODES
// ============================================================================
export type SpeedMode = 'analysis' | 'trading' | 'replay';

// Optimized for visible trades and smooth animation
export const SPEED_PRESETS: Record<SpeedMode, SpeedConfig> = {
  analysis: {
    timeDilation: 0.30,
    updateBatchMs: 175,
    liquidityFadeInMs: 690,
    liquidityFadeOutMs: 1035,
    minPriceIntervalMs: 230,
    tradeLifetimeMs: 3000,            // LONGER - trades stay visible 3s
    tradeFadeMs: 1500,
    smoothingFactor: 0.12,
    clusterWindowMs: 200,             // SHORTER - less clustering = more bubbles
  },
  trading: {
    timeDilation: 0.47,
    updateBatchMs: 115,
    liquidityFadeInMs: 520,
    liquidityFadeOutMs: 805,
    minPriceIntervalMs: 160,
    tradeLifetimeMs: 2500,            // LONGER - trades stay visible 2.5s
    tradeFadeMs: 1200,
    smoothingFactor: 0.21,
    clusterWindowMs: 150,
  },
  replay: {
    timeDilation: 0.85,
    updateBatchMs: 58,
    liquidityFadeInMs: 290,
    liquidityFadeOutMs: 460,
    minPriceIntervalMs: 92,
    tradeLifetimeMs: 1500,            // LONGER - trades stay visible 1.5s
    tradeFadeMs: 700,
    smoothingFactor: 0.34,
    clusterWindowMs: 100,
  },
};

export interface SpeedConfig {
  timeDilation: number;
  updateBatchMs: number;
  liquidityFadeInMs: number;
  liquidityFadeOutMs: number;
  minPriceIntervalMs: number;
  tradeLifetimeMs: number;
  tradeFadeMs: number;
  smoothingFactor: number;        // EMA alpha (lower = smoother)
  clusterWindowMs: number;
}

// ============================================================================
// SMOOTHED LIQUIDITY LEVEL
// ============================================================================
export interface SmoothedLiquidityLevel {
  price: number;
  side: 'bid' | 'ask';

  // Raw values (from simulation)
  rawSize: number;
  rawDelta: number;

  // Smoothed values (for display)
  displaySize: number;
  displayDelta: number;
  displayOpacity: number;         // For fade in/out

  // Timing
  firstSeen: number;
  lastModified: number;
  fadeStartTime: number | null;   // When fade out started
  ageMs: number;

  // ══════════════════════════════════════════════════════════════════════════
  // THERMAL MEMORY (HUGE) - Time accumulation
  // ══════════════════════════════════════════════════════════════════════════
  thermalAge: number;             // Accumulated "presence time" in ms
  thermalSolidity: number;        // 0-1: how "solid" this level feels (longer = more solid)
  stableTime: number;             // How long size has been stable (no significant change)
  lastSizeChange: number;         // Timestamp of last significant size change

  // ══════════════════════════════════════════════════════════════════════════
  // INTELLIGENT DISAPPEARANCE
  // ══════════════════════════════════════════════════════════════════════════
  removalType: 'none' | 'cancel' | 'consumed' | 'spoof';  // Why it disappeared
  afterimageOpacity: number;      // Residual visual trace (0-1)
  decayVelocity: number;          // Non-linear decay speed

  // State
  isAppearing: boolean;
  isDisappearing: boolean;
  isWall: boolean;
  isAbsorbing: boolean;
  absorptionIntensity: number;

  // Previous for ghost (1 second ago)
  previousSize: number;
  ghostSize: number;
  ghostSizeHistory: number[];

  // Contact feedback
  isPriceContact: boolean;
  contactPulse: number;
  contactStartTime: number | null;

  // Texture/density category
  densityCategory: 'soft' | 'normal' | 'dense' | 'wall';

  // ══════════════════════════════════════════════════════════════════════════
  // SILENCE - Change tracking for dirty detection
  // ══════════════════════════════════════════════════════════════════════════
  isDirty: boolean;               // Has this level changed visually?
  lastRenderSize: number;         // Size at last render (for change detection)
}

// ============================================================================
// SMOOTHED TRADE
// ============================================================================
export interface SmoothedTrade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
  appearTime: number;             // When bubble started appearing
  displayOpacity: number;         // Animated opacity
  displayRadius: number;          // Animated radius
  hitWall: boolean;
  isCluster: boolean;
  clusterSize: number;
}

// ============================================================================
// SMOOTHED STATE
// ============================================================================
export interface SmoothedState {
  // Price
  currentPrice: number;
  previousPrice: number;          // Previous price for direction
  displayPrice: number;           // Smoothed for display
  targetPrice: number;            // Where price is heading
  priceVelocity: number;
  priceDirection: 'up' | 'down' | 'flat';
  lastPriceChangeTime: number;

  // Price line visual state
  priceLineThickness: number;
  priceLineGlow: number;
  priceInDenseZone: boolean;
  denseZonePressure: number;

  // Order book
  bids: Map<number, SmoothedLiquidityLevel>;
  asks: Map<number, SmoothedLiquidityLevel>;

  // Derived
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;

  // Smoothed totals
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  smoothedImbalance: number;

  // Trades
  trades: SmoothedTrade[];
  activeAbsorptions: Array<{ price: number; side: 'bid' | 'ask'; intensity: number; startTime: number }>;

  // Walls
  walls: Array<{ price: number; side: 'bid' | 'ask'; size: number; displaySize: number }>;

  // Contact events
  priceContacts: Array<{ price: number; side: 'bid' | 'ask'; intensity: number; startTime: number }>;

  // ══════════════════════════════════════════════════════════════════════════
  // DIRECTIONAL PRESSURE (subtle visual bias)
  // ══════════════════════════════════════════════════════════════════════════
  buyPressure: number;            // 0-1: aggressive buying strength
  sellPressure: number;           // 0-1: aggressive selling strength
  pressureBias: number;           // -1 to 1: net directional pressure
  pressureMomentum: number;       // How fast pressure is changing

  // ══════════════════════════════════════════════════════════════════════════
  // SILENCE / ACTIVITY TRACKING
  // ══════════════════════════════════════════════════════════════════════════
  marketActivity: number;         // 0-1: how active the market is
  lastSignificantEvent: number;   // Timestamp of last meaningful change
  isQuiet: boolean;               // True when nothing worth showing is happening
  quietDuration: number;          // How long market has been quiet (ms)

  // ══════════════════════════════════════════════════════════════════════════
  // AFTERIMAGES (residual traces of removed liquidity)
  // ══════════════════════════════════════════════════════════════════════════
  afterimages: Array<{
    price: number;
    side: 'bid' | 'ask';
    size: number;                 // Original size
    opacity: number;              // Fading opacity
    type: 'cancel' | 'consumed' | 'spoof';
    startTime: number;
  }>;

  // Timing
  timestamp: number;
  simulationTime: number;
  speedMode: SpeedMode;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER OPTIMIZATION
  // ══════════════════════════════════════════════════════════════════════════
  dirtyLevels: Set<number>;       // Prices that need re-render
  frameSkipCounter: number;       // For throttling non-critical updates
}

// ============================================================================
// CONFIG
// ============================================================================
export interface SmoothedConfig {
  tickSize: number;
  basePrice: number;
  liquidityIntensity: number;
  baseLiquidityPerLevel: number;
  liquiditySpread: number;
  wallProbability: number;
  wallSizeMultiplier: number;
  spoofProbability: number;
  spoofLifetimeMs: number;
  tradeFrequency: number;
  avgTradeSize: number;
  tradeSizeVariance: number;
  burstProbability: number;
  volatility: number;
  trendStrength: number;
}

const DEFAULT_CONFIG: SmoothedConfig = {
  tickSize: 0.5,
  basePrice: 100000,
  liquidityIntensity: 1.0,
  baseLiquidityPerLevel: 12,
  liquiditySpread: 55,
  wallProbability: 0.02,
  wallSizeMultiplier: 8,
  spoofProbability: 0.012,
  spoofLifetimeMs: 1200,
  tradeFrequency: 12,             // More trades visible
  avgTradeSize: 4,                // Bigger trades
  tradeSizeVariance: 3,
  burstProbability: 0.025,        // Reduced from 0.04
  volatility: 0.00005,            // Reduced from 0.00008
  trendStrength: 0,
};

// ============================================================================
// MAIN ENGINE
// ============================================================================
export class SmoothedSimulationEngine {
  private config: SmoothedConfig;
  private speedConfig: SpeedConfig;
  private speedMode: SpeedMode = 'trading';
  private state: SmoothedState;

  // Internal simulation state
  private rawBids: Map<number, number> = new Map();
  private rawAsks: Map<number, number> = new Map();
  private pendingBidChanges: Map<number, { target: number; startTime: number; startValue: number }> = new Map();
  private pendingAskChanges: Map<number, { target: number; startTime: number; startValue: number }> = new Map();

  // Timing
  private lastUpdateTime = 0;
  private lastBatchTime = 0;
  private lastTradeTime = 0;
  private lastPriceTime = 0;
  private simulationClock = 0;
  private trend = 0;

  // Counters
  private tradeIdCounter = 0;
  private intervalId: NodeJS.Timeout | null = null;

  // Pending trades for clustering
  private pendingTrades: Array<{ price: number; quantity: number; side: 'buy' | 'sell'; timestamp: number }> = [];

  // Callbacks
  private onStateUpdate: ((state: SmoothedState) => void) | null = null;

  constructor(config?: Partial<SmoothedConfig>, initialSpeedMode: SpeedMode = 'trading') {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.speedMode = initialSpeedMode;
    this.speedConfig = SPEED_PRESETS[initialSpeedMode];
    this.state = this.initializeState();
  }

  private initializeState(): SmoothedState {
    const now = Date.now();

    const state: SmoothedState = {
      currentPrice: this.config.basePrice,
      previousPrice: this.config.basePrice,
      displayPrice: this.config.basePrice,
      targetPrice: this.config.basePrice,
      priceVelocity: 0,
      priceDirection: 'flat',
      lastPriceChangeTime: now,
      priceLineThickness: 1.5,
      priceLineGlow: 0.3,
      priceInDenseZone: false,
      denseZonePressure: 0,
      bids: new Map(),
      asks: new Map(),
      bestBid: this.config.basePrice - this.config.tickSize,
      bestAsk: this.config.basePrice + this.config.tickSize,
      midPrice: this.config.basePrice,
      spread: this.config.tickSize * 2,
      totalBidLiquidity: 0,
      totalAskLiquidity: 0,
      smoothedImbalance: 0,
      trades: [],
      activeAbsorptions: [],
      walls: [],
      priceContacts: [],

      // Directional pressure
      buyPressure: 0,
      sellPressure: 0,
      pressureBias: 0,
      pressureMomentum: 0,

      // Silence tracking
      marketActivity: 0.5,
      lastSignificantEvent: now,
      isQuiet: false,
      quietDuration: 0,

      // Afterimages
      afterimages: [],

      timestamp: now,
      simulationTime: 0,
      speedMode: this.speedMode,

      // Render optimization
      dirtyLevels: new Set(),
      frameSkipCounter: 0,
    };

    // Initialize order book
    this.populateOrderBook(state, now);

    return state;
  }

  private populateOrderBook(state: SmoothedState, now: number): void {
    const { tickSize, liquiditySpread, basePrice } = this.config;

    for (let i = 1; i <= liquiditySpread; i++) {
      const bidPrice = this.roundToTick(basePrice - i * tickSize);
      const askPrice = this.roundToTick(basePrice + i * tickSize);

      const bidSize = this.generateLiquiditySize(i);
      const askSize = this.generateLiquiditySize(i);

      this.rawBids.set(bidPrice, bidSize);
      this.rawAsks.set(askPrice, askSize);

      state.bids.set(bidPrice, this.createSmoothedLevel(bidPrice, 'bid', bidSize, now, true));
      state.asks.set(askPrice, this.createSmoothedLevel(askPrice, 'ask', askSize, now, true));
    }
  }

  private generateLiquiditySize(distanceFromMid: number): number {
    const { liquidityIntensity, baseLiquidityPerLevel, wallProbability, wallSizeMultiplier } = this.config;

    const distanceMultiplier = 1 + Math.log(1 + distanceFromMid * 0.06);
    const randomMultiplier = 0.5 + Math.random() * 1.0;
    let size = baseLiquidityPerLevel * liquidityIntensity * distanceMultiplier * randomMultiplier;

    // Wall
    if (Math.random() < wallProbability * (distanceFromMid > 10 ? 1.5 : 1)) {
      size *= wallSizeMultiplier * (0.7 + Math.random() * 0.6);
    }

    return size;
  }

  private createSmoothedLevel(
    price: number,
    side: 'bid' | 'ask',
    size: number,
    now: number,
    instant: boolean = false
  ): SmoothedLiquidityLevel {
    const { baseLiquidityPerLevel, wallSizeMultiplier } = this.config;
    const isWall = size > baseLiquidityPerLevel * wallSizeMultiplier * 0.5;

    // Determine density category based on size
    let densityCategory: 'soft' | 'normal' | 'dense' | 'wall' = 'normal';
    if (size < baseLiquidityPerLevel * 0.5) {
      densityCategory = 'soft';
    } else if (size > baseLiquidityPerLevel * wallSizeMultiplier * 0.3) {
      densityCategory = isWall ? 'wall' : 'dense';
    }

    return {
      price,
      side,
      rawSize: size,
      rawDelta: 0,
      displaySize: instant ? size : 0,
      displayDelta: 0,
      displayOpacity: instant ? 1 : 0,
      firstSeen: now,
      lastModified: now,
      fadeStartTime: null,
      ageMs: 0,

      // Thermal memory
      thermalAge: instant ? 2000 : 0,  // Start with some age if instant
      thermalSolidity: instant ? 0.3 : 0,
      stableTime: 0,
      lastSizeChange: now,

      // Intelligent disappearance
      removalType: 'none',
      afterimageOpacity: 0,
      decayVelocity: 1.0,

      isAppearing: !instant,
      isDisappearing: false,
      isWall,
      isAbsorbing: false,
      absorptionIntensity: 0,
      previousSize: size,
      ghostSize: size,
      ghostSizeHistory: [size],
      isPriceContact: false,
      contactPulse: 0,
      contactStartTime: null,
      densityCategory,

      // Silence
      isDirty: true,
      lastRenderSize: 0,
    };
  }

  // ============================================================================
  // SPEED MODE
  // ============================================================================
  setSpeedMode(mode: SpeedMode): void {
    this.speedMode = mode;
    this.speedConfig = SPEED_PRESETS[mode];
    this.state.speedMode = mode;
  }

  getSpeedMode(): SpeedMode {
    return this.speedMode;
  }

  // ============================================================================
  // MAIN LOOP
  // ============================================================================
  start(intervalMs = 25): void {
    if (this.intervalId) return;

    this.lastUpdateTime = Date.now();
    this.lastBatchTime = Date.now();
    this.lastTradeTime = Date.now();
    this.lastPriceTime = Date.now();

    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const realDeltaMs = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Time dilation
    const dilatedDeltaMs = realDeltaMs * this.speedConfig.timeDilation;
    this.simulationClock += dilatedDeltaMs;

    // Update simulation at dilated speed
    this.updateSimulation(now, dilatedDeltaMs);

    // Update display values with interpolation
    this.updateDisplayValues(now, realDeltaMs);

    // Notify
    this.state.timestamp = now;
    this.state.simulationTime = this.simulationClock;

    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
  }

  private updateSimulation(now: number, dilatedDeltaMs: number): void {
    // Batch order book updates
    const timeSinceBatch = now - this.lastBatchTime;
    if (timeSinceBatch >= this.speedConfig.updateBatchMs) {
      this.lastBatchTime = now;
      this.batchOrderBookUpdate(now);
    }

    // Price movement (with minimum interval)
    const timeSincePrice = now - this.lastPriceTime;
    if (timeSincePrice >= this.speedConfig.minPriceIntervalMs) {
      this.updatePrice(now, dilatedDeltaMs);
    }

    // Trade generation (with time dilation)
    this.maybeGenerateTrade(now, dilatedDeltaMs);

    // Process pending trade clusters
    this.processTradeCluster(now);

    // Update trend slowly
    this.trend = this.trend * 0.998 + this.config.trendStrength * 0.002;
  }

  private batchOrderBookUpdate(now: number): void {
    const { tickSize, liquiditySpread } = this.config;
    const mid = this.state.currentPrice;

    // Ensure levels exist
    for (let i = 1; i <= liquiditySpread; i++) {
      const bidPrice = this.roundToTick(mid - i * tickSize);
      const askPrice = this.roundToTick(mid + i * tickSize);

      // Add new bid level
      if (!this.rawBids.has(bidPrice)) {
        const size = this.generateLiquiditySize(i);
        this.rawBids.set(bidPrice, size);
        this.scheduleChange(bidPrice, 'bid', size, now);
      }

      // Add new ask level
      if (!this.rawAsks.has(askPrice)) {
        const size = this.generateLiquiditySize(i);
        this.rawAsks.set(askPrice, size);
        this.scheduleChange(askPrice, 'ask', size, now);
      }
    }

    // Remove far levels
    const maxDistance = liquiditySpread * tickSize * 1.2;
    for (const [price] of this.rawBids) {
      if (mid - price > maxDistance) {
        this.scheduleRemoval(price, 'bid', now);
      }
    }
    for (const [price] of this.rawAsks) {
      if (price - mid > maxDistance) {
        this.scheduleRemoval(price, 'ask', now);
      }
    }

    // Random modifications (reduced frequency)
    if (Math.random() < 0.04) {
      this.randomlyModifyLevel(now);
    }
  }

  private scheduleChange(price: number, side: 'bid' | 'ask', targetSize: number, now: number): void {
    const pending = side === 'bid' ? this.pendingBidChanges : this.pendingAskChanges;
    const current = side === 'bid' ? this.state.bids.get(price) : this.state.asks.get(price);

    pending.set(price, {
      target: targetSize,
      startTime: now,
      startValue: current?.displaySize ?? 0,
    });

    // Create level if not exists
    const levels = side === 'bid' ? this.state.bids : this.state.asks;
    if (!levels.has(price)) {
      levels.set(price, this.createSmoothedLevel(price, side, targetSize, now, false));
    }
  }

  private scheduleRemoval(price: number, side: 'bid' | 'ask', now: number): void {
    const levels = side === 'bid' ? this.state.bids : this.state.asks;
    const level = levels.get(price);

    if (level && !level.isDisappearing) {
      level.isDisappearing = true;
      level.fadeStartTime = now;
    }

    // Remove from raw
    if (side === 'bid') {
      this.rawBids.delete(price);
    } else {
      this.rawAsks.delete(price);
    }
  }

  private randomlyModifyLevel(now: number): void {
    const allPrices = [...this.rawBids.keys(), ...this.rawAsks.keys()];
    if (allPrices.length === 0) return;

    const price = allPrices[Math.floor(Math.random() * allPrices.length)];
    const isBid = this.rawBids.has(price);
    const currentSize = isBid ? this.rawBids.get(price)! : this.rawAsks.get(price)!;

    const action = Math.random();
    let newSize = currentSize;

    if (action < 0.4) {
      // Add liquidity
      newSize = currentSize + this.config.baseLiquidityPerLevel * (0.2 + Math.random() * 0.4);
    } else if (action < 0.7) {
      // Remove liquidity
      newSize = Math.max(0.5, currentSize * (0.6 + Math.random() * 0.3));
    }

    if (isBid) {
      this.rawBids.set(price, newSize);
    } else {
      this.rawAsks.set(price, newSize);
    }

    this.scheduleChange(price, isBid ? 'bid' : 'ask', newSize, now);
  }

  private updatePrice(now: number, dilatedDeltaMs: number): void {
    const { volatility, tickSize } = this.config;

    // Check if we should allow price change
    const timeSinceLast = now - this.lastPriceTime;
    if (timeSinceLast < this.speedConfig.minPriceIntervalMs) return;

    // Random walk with time dilation
    const randomWalk = (Math.random() - 0.5) * 2 * volatility * Math.sqrt(dilatedDeltaMs);
    const trendComponent = this.trend * volatility * dilatedDeltaMs * 0.0003;

    // Mean reversion
    const deviation = (this.state.currentPrice - this.config.basePrice) / this.config.basePrice;
    const meanReversion = -deviation * 0.2 * dilatedDeltaMs * 0.00003;

    const priceChange = randomWalk + trendComponent + meanReversion;
    const newPrice = this.roundToTick(this.state.currentPrice * (1 + priceChange));

    // Only update if meaningful change
    if (newPrice !== this.state.currentPrice) {
      // Check for liquidity at new price (price pauses at strong liquidity)
      const liquidity = newPrice > this.state.currentPrice
        ? this.rawAsks.get(newPrice) ?? 0
        : this.rawBids.get(newPrice) ?? 0;

      const threshold = this.config.baseLiquidityPerLevel * this.config.wallSizeMultiplier * 0.4;

      // Strong liquidity causes pause
      if (liquidity > threshold && Math.random() < 0.6) {
        // Record absorption
        this.recordAbsorption(newPrice, newPrice > this.state.currentPrice ? 'ask' : 'bid', now);
        return; // Don't move price yet
      }

      this.state.previousPrice = this.state.currentPrice;
      this.state.currentPrice = newPrice;
      this.state.targetPrice = newPrice;
      this.lastPriceTime = now;

      // Direction
      if (newPrice > this.state.previousPrice) {
        this.state.priceDirection = 'up';
      } else if (newPrice < this.state.previousPrice) {
        this.state.priceDirection = 'down';
      } else {
        this.state.priceDirection = 'flat';
      }

      this.state.lastPriceChangeTime = now;
    }
  }

  private maybeGenerateTrade(now: number, dilatedDeltaMs: number): void {
    // Trade frequency is time-dilated
    const effectiveFrequency = this.config.tradeFrequency * this.speedConfig.timeDilation;
    const expectedIntervalMs = 1000 / effectiveFrequency;

    const timeSinceTrade = now - this.lastTradeTime;
    if (timeSinceTrade < expectedIntervalMs * (0.5 + Math.random() * 1.0)) {
      return;
    }

    this.lastTradeTime = now;

    // Burst (reduced probability)
    let numTrades = 1;
    if (Math.random() < this.config.burstProbability * this.speedConfig.timeDilation) {
      numTrades = Math.floor(Math.random() * 3) + 2;
    }

    for (let i = 0; i < numTrades; i++) {
      this.generateTrade(now);
    }
  }

  private generateTrade(now: number): void {
    const { avgTradeSize, tradeSizeVariance } = this.config;

    // Side
    const imbalance = this.state.smoothedImbalance;
    const sideBias = 0.5 + this.trend * 0.1 + imbalance * 0.15;
    const isBuy = Math.random() < sideBias;

    // Size
    const variance = (Math.random() - 0.5) * 2 * tradeSizeVariance;
    let size = Math.max(0.2, avgTradeSize + variance);

    // Occasional large trade
    if (Math.random() < 0.02) {
      size *= 3 + Math.random() * 4;
    }

    // Price
    const price = isBuy
      ? this.state.bestAsk
      : this.state.bestBid;

    // Add to pending for clustering
    this.pendingTrades.push({
      price,
      quantity: size,
      side: isBuy ? 'buy' : 'sell',
      timestamp: now,
    });

    // Consume liquidity
    const rawBook = isBuy ? this.rawAsks : this.rawBids;
    const current = rawBook.get(price) ?? 0;
    const remaining = Math.max(0, current - size);
    rawBook.set(price, remaining);

    if (remaining < 0.5) {
      this.scheduleRemoval(price, isBuy ? 'ask' : 'bid', now);
    } else {
      this.scheduleChange(price, isBuy ? 'ask' : 'bid', remaining, now);
    }
  }

  private processTradeCluster(now: number): void {
    const { clusterWindowMs, tradeLifetimeMs } = this.speedConfig;

    // Group trades by price within window
    const recentPending = this.pendingTrades.filter(t => now - t.timestamp < clusterWindowMs);
    const olderPending = this.pendingTrades.filter(t => now - t.timestamp >= clusterWindowMs);

    // Process older trades into clusters
    const clusters = new Map<string, typeof olderPending>();
    for (const trade of olderPending) {
      const key = `${trade.price}_${trade.side}`;
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key)!.push(trade);
    }

    // Create display trades from clusters
    for (const [key, trades] of clusters) {
      const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
      const [priceStr, side] = key.split('_');
      const price = parseFloat(priceStr);

      const isCluster = trades.length > 1;

      const displayTrade: SmoothedTrade = {
        id: `trade_${++this.tradeIdCounter}`,
        price,
        quantity: totalQty,
        side: side as 'buy' | 'sell',
        timestamp: trades[0].timestamp,
        appearTime: now,
        displayOpacity: 0,
        displayRadius: 0,
        hitWall: this.isWallAtPrice(price),
        isCluster,
        clusterSize: isCluster ? totalQty : 0,
      };

      this.state.trades.push(displayTrade);
    }

    this.pendingTrades = recentPending;

    // Clean old trades
    const cutoff = now - tradeLifetimeMs;
    this.state.trades = this.state.trades.filter(t => t.timestamp > cutoff);
  }

  private isWallAtPrice(price: number): boolean {
    const threshold = this.config.baseLiquidityPerLevel * this.config.wallSizeMultiplier * 0.4;
    const bidSize = this.rawBids.get(price) ?? 0;
    const askSize = this.rawAsks.get(price) ?? 0;
    return Math.max(bidSize, askSize) > threshold;
  }

  private recordAbsorption(price: number, side: 'bid' | 'ask', now: number): void {
    const existing = this.state.activeAbsorptions.find(a => a.price === price && a.side === side);
    if (existing) {
      existing.intensity = Math.min(1, existing.intensity + 0.2);
    } else {
      this.state.activeAbsorptions.push({ price, side, intensity: 0.5, startTime: now });
    }
  }

  // ============================================================================
  // DISPLAY VALUE INTERPOLATION
  // ============================================================================
  private updateDisplayValues(now: number, realDeltaMs: number): void {
    const { smoothingFactor, liquidityFadeInMs, liquidityFadeOutMs, tradeFadeMs } = this.speedConfig;

    // Clear dirty levels from previous frame
    this.state.dirtyLevels.clear();

    // Interpolate price display
    const priceDiff = this.state.targetPrice - this.state.displayPrice;
    this.state.displayPrice += priceDiff * smoothingFactor;

    // Update price line visual state
    this.updatePriceLineState(now);

    // Detect price contacts
    this.detectPriceContacts(now);

    // Update directional pressure
    this.updateDirectionalPressure(now, realDeltaMs);

    // Update silence tracking
    this.updateSilenceTracking(now, realDeltaMs);

    // Update afterimages
    this.updateAfterimages(now);

    // Update bid levels
    for (const [price, level] of this.state.bids) {
      // Core interpolation
      this.interpolateLevel(level, now, liquidityFadeInMs, liquidityFadeOutMs, smoothingFactor);

      // Thermal memory (time accumulation)
      this.updateThermalMemory(level, now, realDeltaMs);

      // Intelligent disappearance
      if (level.isDisappearing) {
        const shouldRemove = this.handleIntelligentDisappearance(level, now, realDeltaMs);
        if (shouldRemove) {
          this.state.bids.delete(price);
          continue;
        }
      }

      // Other updates
      this.updateGhostTracking(level, now);
      this.updateContactPulse(level, now);
      this.updateDensityCategory(level);
      this.updateDirtyTracking(level);
    }

    // Update ask levels
    for (const [price, level] of this.state.asks) {
      this.interpolateLevel(level, now, liquidityFadeInMs, liquidityFadeOutMs, smoothingFactor);
      this.updateThermalMemory(level, now, realDeltaMs);

      if (level.isDisappearing) {
        const shouldRemove = this.handleIntelligentDisappearance(level, now, realDeltaMs);
        if (shouldRemove) {
          this.state.asks.delete(price);
          continue;
        }
      }

      this.updateGhostTracking(level, now);
      this.updateContactPulse(level, now);
      this.updateDensityCategory(level);
      this.updateDirtyTracking(level);
    }

    // Update trades (with silence-aware rendering)
    for (const trade of this.state.trades) {
      const age = now - trade.appearTime;

      // Fade in (slower when market is quiet for contrast)
      const fadeInSpeed = this.state.isQuiet ? 300 : 200;
      if (age < fadeInSpeed) {
        trade.displayOpacity = Math.min(1, age / fadeInSpeed);
        trade.displayRadius = trade.displayOpacity;
      } else {
        // Fade out
        const fadeAge = now - trade.timestamp;
        const fadeProgress = Math.max(0, fadeAge - (this.speedConfig.tradeLifetimeMs - tradeFadeMs)) / tradeFadeMs;
        trade.displayOpacity = Math.max(0, 1 - fadeProgress);
      }
    }

    // Decay absorptions
    this.state.activeAbsorptions = this.state.activeAbsorptions.filter(a => {
      a.intensity *= 0.97;
      return a.intensity > 0.05;
    });

    // Decay price contacts
    this.state.priceContacts = this.state.priceContacts.filter(c => {
      c.intensity *= 0.94;
      return c.intensity > 0.02;
    });

    // Update totals
    this.updateTotals();

    // Frame skip counter for render optimization
    this.state.frameSkipCounter++;
  }

  // ============================================================================
  // PRICE LINE STATE (Hero effect)
  // ============================================================================
  private updatePriceLineState(now: number): void {
    const { currentPrice, displayPrice } = this.state;
    const { tickSize, baseLiquidityPerLevel, wallSizeMultiplier } = this.config;

    // Check liquidity at and around current price
    let nearbyLiquidity = 0;
    const checkRange = 3; // ticks

    for (let i = -checkRange; i <= checkRange; i++) {
      const checkPrice = this.roundToTick(currentPrice + i * tickSize);
      const bid = this.state.bids.get(checkPrice);
      const ask = this.state.asks.get(checkPrice);
      if (bid) nearbyLiquidity += bid.displaySize;
      if (ask) nearbyLiquidity += ask.displaySize;
    }

    const threshold = baseLiquidityPerLevel * wallSizeMultiplier * 2;
    const pressure = Math.min(1, nearbyLiquidity / threshold);

    // Update dense zone state
    this.state.priceInDenseZone = pressure > 0.4;
    this.state.denseZonePressure += (pressure - this.state.denseZonePressure) * 0.08;

    // Price line thickness varies with pressure (more pressure = thicker)
    const targetThickness = 1.2 + this.state.denseZonePressure * 1.8;
    this.state.priceLineThickness += (targetThickness - this.state.priceLineThickness) * 0.1;

    // Glow increases slightly when moving, more in dense zones
    const isMoving = Math.abs(currentPrice - displayPrice) > tickSize * 0.1;
    const targetGlow = 0.2 + (isMoving ? 0.15 : 0) + this.state.denseZonePressure * 0.25;
    this.state.priceLineGlow += (targetGlow - this.state.priceLineGlow) * 0.12;
  }

  // ============================================================================
  // PRICE CONTACT DETECTION
  // ============================================================================
  private detectPriceContacts(now: number): void {
    const { currentPrice, previousPrice } = this.state;
    const { tickSize } = this.config;

    // Check if price moved into a new level
    if (Math.abs(currentPrice - previousPrice) < tickSize * 0.01) return;

    const direction = currentPrice > previousPrice ? 'up' : 'down';
    const contactPrice = direction === 'up' ? currentPrice : currentPrice;

    // Check for liquidity at the contact price
    const askLevel = this.state.asks.get(this.roundToTick(contactPrice + tickSize * 0.5));
    const bidLevel = this.state.bids.get(this.roundToTick(contactPrice - tickSize * 0.5));

    if (direction === 'up' && askLevel && askLevel.displaySize > 0.5) {
      askLevel.isPriceContact = true;
      askLevel.contactStartTime = now;
      askLevel.contactPulse = Math.min(1, askLevel.displaySize / 30);

      // Record contact event
      this.state.priceContacts.push({
        price: askLevel.price,
        side: 'ask',
        intensity: askLevel.contactPulse,
        startTime: now,
      });
    }

    if (direction === 'down' && bidLevel && bidLevel.displaySize > 0.5) {
      bidLevel.isPriceContact = true;
      bidLevel.contactStartTime = now;
      bidLevel.contactPulse = Math.min(1, bidLevel.displaySize / 30);

      // Record contact event
      this.state.priceContacts.push({
        price: bidLevel.price,
        side: 'bid',
        intensity: bidLevel.contactPulse,
        startTime: now,
      });
    }
  }

  // ============================================================================
  // GHOST BAR TRACKING (1 second history)
  // ============================================================================
  private updateGhostTracking(level: SmoothedLiquidityLevel, now: number): void {
    // Add current size to history every ~100ms
    const historyInterval = 100;
    const maxHistoryLength = 10; // 1 second at 100ms intervals

    if (!level.ghostSizeHistory) {
      level.ghostSizeHistory = [level.displaySize];
    }

    // Check if we should add a new entry
    const shouldAdd = level.ghostSizeHistory.length === 0 ||
      now - level.lastModified > historyInterval;

    if (shouldAdd && level.displaySize > 0.1) {
      level.ghostSizeHistory.push(level.displaySize);
      if (level.ghostSizeHistory.length > maxHistoryLength) {
        level.ghostSizeHistory.shift();
      }
    }

    // Ghost size is the size from ~1 second ago (oldest in history)
    level.ghostSize = level.ghostSizeHistory[0] || level.displaySize;
  }

  // ============================================================================
  // CONTACT PULSE ANIMATION
  // ============================================================================
  private updateContactPulse(level: SmoothedLiquidityLevel, now: number): void {
    if (!level.isPriceContact) {
      level.contactPulse *= 0.92; // Decay
      if (level.contactPulse < 0.02) {
        level.contactPulse = 0;
      }
      return;
    }

    // Pulse animation (200ms duration)
    if (level.contactStartTime) {
      const age = now - level.contactStartTime;
      if (age > 200) {
        level.isPriceContact = false;
        level.contactStartTime = null;
      }
    }
  }

  // ============================================================================
  // DENSITY CATEGORY UPDATE
  // ============================================================================
  private updateDensityCategory(level: SmoothedLiquidityLevel): void {
    const { baseLiquidityPerLevel, wallSizeMultiplier } = this.config;
    const size = level.displaySize;

    if (size < baseLiquidityPerLevel * 0.4) {
      level.densityCategory = 'soft';
    } else if (size > baseLiquidityPerLevel * wallSizeMultiplier * 0.5) {
      level.densityCategory = 'wall';
    } else if (size > baseLiquidityPerLevel * 2) {
      level.densityCategory = 'dense';
    } else {
      level.densityCategory = 'normal';
    }
  }

  // ============================================================================
  // THERMAL MEMORY (Time accumulation - HUGE feature)
  // ============================================================================
  private updateThermalMemory(level: SmoothedLiquidityLevel, now: number, deltaMs: number): void {
    // Accumulate thermal age while level exists
    if (!level.isDisappearing && level.displaySize > 0.5) {
      level.thermalAge += deltaMs;

      // Track stability (how long size hasn't changed significantly)
      const sizeChangePercent = Math.abs(level.rawSize - level.previousSize) / (level.previousSize + 0.1);
      if (sizeChangePercent < 0.1) {
        level.stableTime += deltaMs;
      } else {
        level.stableTime = 0;
        level.lastSizeChange = now;
      }

      // Calculate thermal solidity (0-1)
      // Longer presence + more stability = more solid
      const ageContribution = Math.min(1, level.thermalAge / 8000);  // Max at 8 seconds
      const stabilityContribution = Math.min(1, level.stableTime / 4000);  // Max at 4 seconds stable
      const sizeContribution = Math.min(1, level.displaySize / (this.config.baseLiquidityPerLevel * 4));

      // Weighted combination
      const targetSolidity = ageContribution * 0.4 + stabilityContribution * 0.35 + sizeContribution * 0.25;

      // Smooth transition (solidity builds slowly, decays slowly)
      const alpha = level.thermalSolidity < targetSolidity ? 0.03 : 0.08;
      level.thermalSolidity += (targetSolidity - level.thermalSolidity) * alpha;
    } else {
      // Decaying - solidity drops faster
      level.thermalSolidity *= 0.95;
    }

    // Clamp
    level.thermalSolidity = Math.max(0, Math.min(1, level.thermalSolidity));
  }

  // ============================================================================
  // INTELLIGENT DISAPPEARANCE
  // ============================================================================
  private handleIntelligentDisappearance(
    level: SmoothedLiquidityLevel,
    now: number,
    deltaMs: number
  ): boolean {
    if (!level.isDisappearing) return false;

    // Determine removal type if not set
    if (level.removalType === 'none') {
      level.removalType = this.classifyRemoval(level, now);
    }

    // Non-linear decay based on removal type
    const decayProfiles = {
      cancel: { speed: 1.2, residual: 0.15, erratic: false },     // Fast, clean
      consumed: { speed: 0.7, residual: 0.35, erratic: false },   // Slower, leaves trace
      spoof: { speed: 2.5, residual: 0.05, erratic: true },       // Very fast, almost no trace
    };

    const profile = decayProfiles[level.removalType];
    level.decayVelocity = profile.speed;

    // Calculate fade progress with non-linear curve
    if (level.fadeStartTime === null) return false;

    const fadeAge = now - level.fadeStartTime;
    const baseFadeDuration = this.speedConfig.liquidityFadeOutMs / profile.speed;

    // Non-linear decay curve (ease-out for consumed, sharp for spoof)
    let fadeProgress: number;
    if (level.removalType === 'consumed') {
      // Ease-out: starts fast, ends slow (leaves afterimage)
      fadeProgress = 1 - Math.pow(1 - fadeAge / baseFadeDuration, 2);
    } else if (level.removalType === 'spoof') {
      // Sharp: almost instant
      fadeProgress = Math.min(1, fadeAge / (baseFadeDuration * 0.3));
      // Add erratic flicker
      if (profile.erratic && Math.random() < 0.3) {
        fadeProgress = Math.min(1, fadeProgress + Math.random() * 0.2);
      }
    } else {
      // Linear for cancel
      fadeProgress = fadeAge / baseFadeDuration;
    }

    fadeProgress = Math.min(1, Math.max(0, fadeProgress));

    // Update display values
    level.displayOpacity = 1 - fadeProgress;
    level.displaySize = level.rawSize * (1 - fadeProgress);

    // Create afterimage when fading
    if (fadeProgress > 0.5 && level.afterimageOpacity === 0 && profile.residual > 0) {
      level.afterimageOpacity = profile.residual * level.thermalSolidity;

      // Add to state afterimages
      this.state.afterimages.push({
        price: level.price,
        side: level.side,
        size: level.previousSize,
        opacity: level.afterimageOpacity,
        type: level.removalType,
        startTime: now,
      });
    }

    // Mark as fully removed
    return fadeProgress >= 1;
  }

  private classifyRemoval(level: SmoothedLiquidityLevel, now: number): 'cancel' | 'consumed' | 'spoof' {
    // Spoof: existed for very short time and was large
    if (level.thermalAge < 800 && level.previousSize > this.config.baseLiquidityPerLevel * 3) {
      return 'spoof';
    }

    // Consumed: price reached this level recently
    const priceDistance = Math.abs(this.state.currentPrice - level.price);
    const isNearPrice = priceDistance <= this.config.tickSize * 2;
    if (isNearPrice && level.isAbsorbing) {
      return 'consumed';
    }

    // Default: cancel
    return 'cancel';
  }

  // ============================================================================
  // DIRECTIONAL PRESSURE
  // ============================================================================
  private updateDirectionalPressure(now: number, deltaMs: number): void {
    // Calculate pressure from recent trades
    let recentBuyVolume = 0;
    let recentSellVolume = 0;
    const recentWindow = 2000; // 2 seconds

    for (const trade of this.state.trades) {
      const age = now - trade.timestamp;
      if (age > recentWindow) continue;

      const recency = 1 - age / recentWindow; // More recent = more weight
      const volume = trade.quantity * recency;

      if (trade.side === 'buy') {
        recentBuyVolume += volume;
      } else {
        recentSellVolume += volume;
      }
    }

    const totalVolume = recentBuyVolume + recentSellVolume + 0.1;
    const rawBuyPressure = recentBuyVolume / totalVolume;
    const rawSellPressure = recentSellVolume / totalVolume;

    // Also factor in order book imbalance
    const bookImbalance = this.state.smoothedImbalance; // -1 to 1

    // Combine
    const targetBuyPressure = rawBuyPressure * 0.7 + (bookImbalance > 0 ? bookImbalance * 0.3 : 0);
    const targetSellPressure = rawSellPressure * 0.7 + (bookImbalance < 0 ? -bookImbalance * 0.3 : 0);

    // Smooth
    const alpha = 0.05;
    this.state.buyPressure += (targetBuyPressure - this.state.buyPressure) * alpha;
    this.state.sellPressure += (targetSellPressure - this.state.sellPressure) * alpha;

    // Net bias (-1 to 1)
    const previousBias = this.state.pressureBias;
    this.state.pressureBias = this.state.buyPressure - this.state.sellPressure;

    // Momentum (how fast pressure is changing)
    this.state.pressureMomentum = (this.state.pressureBias - previousBias) / (deltaMs + 1) * 1000;
  }

  // ============================================================================
  // SILENCE / ACTIVITY TRACKING
  // ============================================================================
  private updateSilenceTracking(now: number, deltaMs: number): void {
    // Count recent events
    let eventCount = 0;

    // Recent trades
    const tradeWindow = 1000;
    for (const trade of this.state.trades) {
      if (now - trade.timestamp < tradeWindow) eventCount++;
    }

    // Recent price changes
    if (now - this.state.lastPriceChangeTime < 500) eventCount += 2;

    // Recent absorptions
    for (const abs of this.state.activeAbsorptions) {
      if (abs.intensity > 0.3) eventCount++;
    }

    // Calculate activity level (0-1)
    const rawActivity = Math.min(1, eventCount / 8);

    // Smooth
    const alpha = rawActivity > this.state.marketActivity ? 0.15 : 0.03; // Fast rise, slow fall
    this.state.marketActivity += (rawActivity - this.state.marketActivity) * alpha;

    // Determine if quiet
    const quietThreshold = 0.15;
    const wasQuiet = this.state.isQuiet;

    if (this.state.marketActivity < quietThreshold) {
      if (!this.state.isQuiet) {
        this.state.isQuiet = true;
        this.state.quietDuration = 0;
      } else {
        this.state.quietDuration += deltaMs;
      }
    } else {
      this.state.isQuiet = false;
      this.state.quietDuration = 0;
      this.state.lastSignificantEvent = now;
    }
  }

  // ============================================================================
  // AFTERIMAGE DECAY
  // ============================================================================
  private updateAfterimages(now: number): void {
    this.state.afterimages = this.state.afterimages.filter(ai => {
      const age = now - ai.startTime;

      // Different decay for different types
      let decayRate: number;
      switch (ai.type) {
        case 'consumed': decayRate = 0.0005; break;  // Slow decay (2 seconds)
        case 'cancel': decayRate = 0.001; break;     // Medium (1 second)
        case 'spoof': decayRate = 0.003; break;      // Fast (0.3 seconds)
        default: decayRate = 0.001;
      }

      ai.opacity -= decayRate * (now - ai.startTime > 500 ? 2 : 1);

      return ai.opacity > 0.01;
    });
  }

  // ============================================================================
  // DIRTY LEVEL TRACKING (for render optimization)
  // ============================================================================
  private updateDirtyTracking(level: SmoothedLiquidityLevel): void {
    const sizeDiff = Math.abs(level.displaySize - level.lastRenderSize);
    const threshold = 0.3; // Minimum change to trigger re-render

    if (sizeDiff > threshold || level.isAppearing || level.isDisappearing || level.contactPulse > 0.05) {
      level.isDirty = true;
      this.state.dirtyLevels.add(level.price);
    } else {
      level.isDirty = false;
    }
  }

  private interpolateLevel(
    level: SmoothedLiquidityLevel,
    now: number,
    fadeInMs: number,
    fadeOutMs: number,
    smoothingFactor: number
  ): void {
    // Update age
    level.ageMs = now - level.firstSeen;

    // Fade in
    if (level.isAppearing) {
      const fadeProgress = Math.min(1, level.ageMs / fadeInMs);
      level.displayOpacity = fadeProgress;
      level.displaySize = level.rawSize * fadeProgress;

      if (fadeProgress >= 1) {
        level.isAppearing = false;
      }
    }
    // Fade out
    else if (level.isDisappearing && level.fadeStartTime !== null) {
      const fadeAge = now - level.fadeStartTime;
      const fadeProgress = Math.min(1, fadeAge / fadeOutMs);
      level.displayOpacity = 1 - fadeProgress;
      level.displaySize = level.rawSize * (1 - fadeProgress);
    }
    // Normal - smooth interpolation
    else {
      level.displayOpacity = 1;
      // EMA smoothing for size changes
      level.displaySize += (level.rawSize - level.displaySize) * smoothingFactor;
    }

    // Dampen small changes (higher threshold = less micro-jitter)
    if (Math.abs(level.rawSize - level.displaySize) < 0.25) {
      level.displaySize = level.rawSize;
    }
  }

  private updateTotals(): void {
    let totalBid = 0, totalAsk = 0;

    for (const level of this.state.bids.values()) {
      totalBid += level.displaySize;
    }
    for (const level of this.state.asks.values()) {
      totalAsk += level.displaySize;
    }

    this.state.totalBidLiquidity = totalBid;
    this.state.totalAskLiquidity = totalAsk;

    const total = totalBid + totalAsk;
    const rawImbalance = total > 0 ? (totalBid - totalAsk) / total : 0;
    this.state.smoothedImbalance += (rawImbalance - this.state.smoothedImbalance) * 0.1;

    // Best prices
    const bidPrices = [...this.state.bids.keys()].filter(p => (this.state.bids.get(p)?.displaySize ?? 0) > 0.1);
    const askPrices = [...this.state.asks.keys()].filter(p => (this.state.asks.get(p)?.displaySize ?? 0) > 0.1);

    this.state.bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : this.state.currentPrice - this.config.tickSize;
    this.state.bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : this.state.currentPrice + this.config.tickSize;
    this.state.midPrice = (this.state.bestBid + this.state.bestAsk) / 2;
    this.state.spread = this.state.bestAsk - this.state.bestBid;

    // Update walls
    this.state.walls = [];
    const wallThreshold = this.config.baseLiquidityPerLevel * this.config.wallSizeMultiplier * 0.5;

    for (const [price, level] of this.state.bids) {
      if (level.rawSize > wallThreshold) {
        this.state.walls.push({ price, side: 'bid', size: level.rawSize, displaySize: level.displaySize });
      }
    }
    for (const [price, level] of this.state.asks) {
      if (level.rawSize > wallThreshold) {
        this.state.walls.push({ price, side: 'ask', size: level.rawSize, displaySize: level.displaySize });
      }
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  setOnStateUpdate(cb: (state: SmoothedState) => void): void {
    this.onStateUpdate = cb;
  }

  getState(): SmoothedState {
    return this.state;
  }

  getConfig(): SmoothedConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SmoothedConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getSpeedConfig(): SpeedConfig {
    return { ...this.speedConfig };
  }

  reset(): void {
    this.rawBids.clear();
    this.rawAsks.clear();
    this.pendingBidChanges.clear();
    this.pendingAskChanges.clear();
    this.pendingTrades = [];
    this.simulationClock = 0;
    this.trend = 0;
    this.tradeIdCounter = 0;
    this.state = this.initializeState();
  }

  destroy(): void {
    this.stop();
    this.onStateUpdate = null;
  }
}

export default SmoothedSimulationEngine;
