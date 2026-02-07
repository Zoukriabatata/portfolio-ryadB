/**
 * INSTITUTIONAL SIMULATION ENGINE
 *
 * High-fidelity market simulation with:
 * - Liquidity age tracking
 * - Passive delta (added vs removed)
 * - Absorption detection
 * - Spoof pattern simulation
 * - Contact feedback data
 * - Consumption/break behavior
 */

export interface InstitutionalConfig {
  // Instrument
  tickSize: number;
  basePrice: number;

  // Liquidity
  liquidityIntensity: number;
  baseLiquidityPerLevel: number;
  liquiditySpread: number;
  wallProbability: number;
  wallSizeMultiplier: number;
  icebergProbability: number;
  icebergHiddenRatio: number;

  // Spoofing
  spoofProbability: number;
  spoofLifetimeMs: number;
  spoofSizeMultiplier: number;

  // Trading
  tradeFrequency: number;
  avgTradeSize: number;
  tradeSizeVariance: number;
  burstProbability: number;
  burstMultiplier: number;

  // Price dynamics
  volatility: number;
  trendStrength: number;
  meanReversionStrength: number;

  // Decay & timing
  liquidityDecayMs: number;
  historyRetentionMs: number;
}

// ============================================================================
// LIQUIDITY LEVEL WITH AGE & DELTA TRACKING
// ============================================================================
export interface LiquidityLevel {
  price: number;
  side: 'bid' | 'ask';

  // Current state
  totalSize: number;
  visibleSize: number;
  hiddenSize: number;

  // Age tracking
  firstSeen: number;
  lastModified: number;
  ageMs: number;
  persistenceScore: number;      // 0-1, how stable this level is

  // Passive delta
  sizeAdded: number;             // Volume added in last window
  sizeRemoved: number;           // Volume removed (cancels)
  passiveDelta: number;          // Added - Removed

  // Absorption tracking
  volumeAbsorbed: number;        // Trades executed against this level
  absorptionRate: number;        // Absorption per second
  isAbsorbing: boolean;          // Currently being absorbed

  // Flags
  isWall: boolean;
  isIceberg: boolean;
  isSpoof: boolean;
  spoofConfidence: number;

  // History for ghost bars
  sizeHistory: Array<{ timestamp: number; size: number }>;
  previousSize: number;          // 1-2 seconds ago
}

// ============================================================================
// TRADE WITH CONTEXT
// ============================================================================
export interface InstitutionalTrade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;

  // Context
  hitWall: boolean;              // Executed against a wall
  wallSize: number;              // Size of wall at execution
  liquidityAtPrice: number;      // Total liquidity at execution price
  isCluster: boolean;            // Part of a cluster
  clusterId: string | null;
  clusterSize: number;           // Combined cluster volume
}

// ============================================================================
// TRADE CLUSTER
// ============================================================================
export interface TradeCluster {
  id: string;
  price: number;
  side: 'buy' | 'sell';
  totalQuantity: number;
  tradeCount: number;
  startTime: number;
  endTime: number;
  hitWall: boolean;
  liquidityAtPrice: number;
}

// ============================================================================
// PRICE-LIQUIDITY INTERACTION EVENT
// ============================================================================
export interface InteractionEvent {
  type: 'contact' | 'absorption' | 'break' | 'bounce';
  price: number;
  side: 'bid' | 'ask';
  timestamp: number;
  intensity: number;             // 0-1
  volumeInvolved: number;
  liquidityRemaining: number;
}

// ============================================================================
// SIMULATION STATE
// ============================================================================
export interface InstitutionalState {
  currentPrice: number;
  previousPrice: number;
  priceDirection: 'up' | 'down' | 'flat';

  // Order book
  bids: Map<number, LiquidityLevel>;
  asks: Map<number, LiquidityLevel>;

  // Best prices
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;

  // Trades
  recentTrades: InstitutionalTrade[];
  tradeClusters: TradeCluster[];

  // Events
  interactionEvents: InteractionEvent[];
  activeAbsorptions: Array<{ price: number; side: 'bid' | 'ask'; intensity: number }>;

  // Walls
  walls: Array<{ price: number; side: 'bid' | 'ask'; size: number; age: number; absorptionRatio: number }>;

  // Spoofs
  spoofOrders: Array<{ price: number; side: 'bid' | 'ask'; size: number; confidence: number; lifetime: number }>;

  // Stats
  timestamp: number;
  totalBidLiquidity: number;
  totalAskLiquidity: number;
  imbalance: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================
const DEFAULT_CONFIG: InstitutionalConfig = {
  tickSize: 0.5,
  basePrice: 100000,

  liquidityIntensity: 1.0,
  baseLiquidityPerLevel: 12,
  liquiditySpread: 60,
  wallProbability: 0.025,
  wallSizeMultiplier: 10,
  icebergProbability: 0.12,
  icebergHiddenRatio: 0.7,

  spoofProbability: 0.015,
  spoofLifetimeMs: 600,
  spoofSizeMultiplier: 6,

  tradeFrequency: 10,
  avgTradeSize: 2.5,
  tradeSizeVariance: 4,
  burstProbability: 0.04,
  burstMultiplier: 6,

  volatility: 0.00008,
  trendStrength: 0,
  meanReversionStrength: 0.25,

  liquidityDecayMs: 8000,
  historyRetentionMs: 30000,
};

// ============================================================================
// MAIN ENGINE
// ============================================================================
export class InstitutionalSimulationEngine {
  private config: InstitutionalConfig;
  private state: InstitutionalState;
  private orderIdCounter = 0;
  private tradeIdCounter = 0;
  private clusterIdCounter = 0;
  private lastUpdateTime = 0;
  private lastTradeTime = 0;
  private trend = 0;
  private intervalId: NodeJS.Timeout | null = null;

  // Cluster tracking
  private pendingTrades: InstitutionalTrade[] = [];
  private clusterWindowMs = 150;

  // Callbacks
  private onStateUpdate: ((state: InstitutionalState) => void) | null = null;
  private onTrade: ((trade: InstitutionalTrade) => void) | null = null;
  private onInteraction: ((event: InteractionEvent) => void) | null = null;

  constructor(config?: Partial<InstitutionalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.initializeState();
  }

  private initializeState(): InstitutionalState {
    const now = Date.now();
    const state: InstitutionalState = {
      currentPrice: this.config.basePrice,
      previousPrice: this.config.basePrice,
      priceDirection: 'flat',
      bids: new Map(),
      asks: new Map(),
      bestBid: 0,
      bestAsk: 0,
      midPrice: this.config.basePrice,
      spread: this.config.tickSize,
      recentTrades: [],
      tradeClusters: [],
      interactionEvents: [],
      activeAbsorptions: [],
      walls: [],
      spoofOrders: [],
      timestamp: now,
      totalBidLiquidity: 0,
      totalAskLiquidity: 0,
      imbalance: 0,
    };

    this.populateOrderBook(state);
    this.updateMetrics(state);

    return state;
  }

  private populateOrderBook(state: InstitutionalState): void {
    const { tickSize, liquiditySpread } = this.config;
    const mid = state.currentPrice;
    const now = Date.now();

    state.bids.clear();
    state.asks.clear();

    // Generate bid levels
    for (let i = 1; i <= liquiditySpread; i++) {
      const price = this.roundToTick(mid - i * tickSize);
      const level = this.createLiquidityLevel(price, 'bid', mid, now);
      state.bids.set(price, level);
    }

    // Generate ask levels
    for (let i = 1; i <= liquiditySpread; i++) {
      const price = this.roundToTick(mid + i * tickSize);
      const level = this.createLiquidityLevel(price, 'ask', mid, now);
      state.asks.set(price, level);
    }
  }

  private createLiquidityLevel(
    price: number,
    side: 'bid' | 'ask',
    midPrice: number,
    timestamp: number
  ): LiquidityLevel {
    const {
      liquidityIntensity,
      baseLiquidityPerLevel,
      wallProbability,
      wallSizeMultiplier,
      icebergProbability,
      icebergHiddenRatio,
    } = this.config;

    // Distance-based liquidity (more further from mid)
    const distance = Math.abs(price - midPrice) / this.config.tickSize;
    const distanceMultiplier = 1 + Math.log(1 + distance * 0.08);

    // Random variation
    const randomMultiplier = 0.4 + Math.random() * 1.2;

    let baseSize = baseLiquidityPerLevel * liquidityIntensity * distanceMultiplier * randomMultiplier;

    // Wall check
    const isWall = Math.random() < wallProbability * (distance > 8 ? 1.8 : 1);
    if (isWall) {
      baseSize *= wallSizeMultiplier * (0.8 + Math.random() * 0.4);
    }

    // Iceberg check
    const isIceberg = !isWall && Math.random() < icebergProbability;
    let visibleSize = baseSize;
    let hiddenSize = 0;

    if (isIceberg) {
      hiddenSize = baseSize * icebergHiddenRatio;
      visibleSize = baseSize * (1 - icebergHiddenRatio);
    }

    // Random age (some liquidity is older)
    const ageVariation = Math.random() * 10000;

    return {
      price,
      side,
      totalSize: baseSize,
      visibleSize,
      hiddenSize,
      firstSeen: timestamp - ageVariation,
      lastModified: timestamp,
      ageMs: ageVariation,
      persistenceScore: 0.3 + Math.random() * 0.7,
      sizeAdded: 0,
      sizeRemoved: 0,
      passiveDelta: 0,
      volumeAbsorbed: 0,
      absorptionRate: 0,
      isAbsorbing: false,
      isWall,
      isIceberg,
      isSpoof: false,
      spoofConfidence: 0,
      sizeHistory: [{ timestamp, size: visibleSize }],
      previousSize: visibleSize,
    };
  }

  private updateMetrics(state: InstitutionalState): void {
    // Best bid/ask
    const bidPrices = Array.from(state.bids.keys());
    const askPrices = Array.from(state.asks.keys());

    state.bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : state.currentPrice - this.config.tickSize;
    state.bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : state.currentPrice + this.config.tickSize;
    state.midPrice = (state.bestBid + state.bestAsk) / 2;
    state.spread = state.bestAsk - state.bestBid;

    // Total liquidity
    state.totalBidLiquidity = 0;
    state.totalAskLiquidity = 0;

    for (const level of state.bids.values()) {
      state.totalBidLiquidity += level.visibleSize;
    }
    for (const level of state.asks.values()) {
      state.totalAskLiquidity += level.visibleSize;
    }

    const total = state.totalBidLiquidity + state.totalAskLiquidity;
    state.imbalance = total > 0 ? (state.totalBidLiquidity - state.totalAskLiquidity) / total : 0;

    // Update walls list
    state.walls = [];
    for (const [price, level] of state.bids) {
      if (level.isWall) {
        state.walls.push({
          price,
          side: 'bid',
          size: level.visibleSize,
          age: level.ageMs,
          absorptionRatio: level.totalSize > 0 ? level.volumeAbsorbed / level.totalSize : 0,
        });
      }
    }
    for (const [price, level] of state.asks) {
      if (level.isWall) {
        state.walls.push({
          price,
          side: 'ask',
          size: level.visibleSize,
          age: level.ageMs,
          absorptionRatio: level.totalSize > 0 ? level.volumeAbsorbed / level.totalSize : 0,
        });
      }
    }
  }

  // ============================================================================
  // SIMULATION LOOP
  // ============================================================================
  start(intervalMs = 40): void {
    if (this.intervalId) return;

    this.lastUpdateTime = Date.now();
    this.lastTradeTime = Date.now();

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
    const deltaMs = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Update price trend
    this.updatePriceTrend(deltaMs);

    // Update liquidity ages
    this.updateLiquidityAges(now, deltaMs);

    // Process spoofs
    this.processSpoofs(now);

    // Maybe generate new spoofs
    this.maybeGenerateSpoof(now);

    // Update liquidity (add/remove/modify)
    this.updateLiquidity(now, deltaMs);

    // Generate trades
    this.maybeGenerateTrades(now);

    // Process trade clusters
    this.processTradesClusters(now);

    // Clean old data
    this.cleanOldData(now);

    // Update state
    this.state.timestamp = now;
    this.updateMetrics(this.state);

    // Notify
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
  }

  private updatePriceTrend(deltaMs: number): void {
    const { volatility, trendStrength, meanReversionStrength } = this.config;

    // Store previous
    this.state.previousPrice = this.state.currentPrice;

    // Random walk
    const randomWalk = (Math.random() - 0.5) * 2 * volatility * Math.sqrt(deltaMs);

    // Trend
    this.trend = this.trend * 0.995 + trendStrength * 0.005;
    const trendComponent = this.trend * volatility * deltaMs * 0.0008;

    // Mean reversion
    const deviation = (this.state.currentPrice - this.config.basePrice) / this.config.basePrice;
    const meanReversion = -deviation * meanReversionStrength * deltaMs * 0.00008;

    // Apply
    const newPrice = this.state.currentPrice * (1 + randomWalk + trendComponent + meanReversion);
    this.state.currentPrice = this.roundToTick(newPrice);

    // Direction
    if (this.state.currentPrice > this.state.previousPrice) {
      this.state.priceDirection = 'up';
    } else if (this.state.currentPrice < this.state.previousPrice) {
      this.state.priceDirection = 'down';
    } else {
      this.state.priceDirection = 'flat';
    }
  }

  private updateLiquidityAges(now: number, deltaMs: number): void {
    const updateLevel = (level: LiquidityLevel) => {
      level.ageMs = now - level.firstSeen;

      // Update persistence score based on stability
      const timeFactor = Math.min(1, level.ageMs / 10000);
      level.persistenceScore = Math.min(1, level.persistenceScore + timeFactor * 0.01);

      // Update size history
      level.sizeHistory.push({ timestamp: now, size: level.visibleSize });
      if (level.sizeHistory.length > 50) {
        level.sizeHistory.shift();
      }

      // Calculate previous size (1-2 seconds ago)
      const targetTime = now - 1500;
      const historicalEntry = level.sizeHistory.find(h => Math.abs(h.timestamp - targetTime) < 500);
      level.previousSize = historicalEntry?.size ?? level.visibleSize;

      // Decay absorption rate
      level.absorptionRate *= 0.95;
      level.isAbsorbing = level.absorptionRate > 0.5;

      // Decay passive delta
      level.sizeAdded *= 0.9;
      level.sizeRemoved *= 0.9;
      level.passiveDelta = level.sizeAdded - level.sizeRemoved;
    };

    for (const level of this.state.bids.values()) updateLevel(level);
    for (const level of this.state.asks.values()) updateLevel(level);
  }

  private processSpoofs(now: number): void {
    this.state.spoofOrders = this.state.spoofOrders.filter(spoof => {
      const elapsed = now - (spoof as any).startTime;
      if (elapsed > this.config.spoofLifetimeMs) {
        // Remove from order book
        const book = spoof.side === 'bid' ? this.state.bids : this.state.asks;
        const level = book.get(spoof.price);
        if (level && level.isSpoof) {
          level.sizeRemoved += level.visibleSize;
          book.delete(spoof.price);
        }
        return false;
      }
      spoof.lifetime = elapsed;
      return true;
    });
  }

  private maybeGenerateSpoof(now: number): void {
    if (Math.random() >= this.config.spoofProbability) return;

    const { tickSize, spoofSizeMultiplier, baseLiquidityPerLevel } = this.config;
    const side = Math.random() < 0.5 ? 'bid' : 'ask';

    // Spoofs appear 3-8 ticks from mid
    const distance = Math.floor(Math.random() * 6) + 3;
    const price = side === 'bid'
      ? this.roundToTick(this.state.currentPrice - distance * tickSize)
      : this.roundToTick(this.state.currentPrice + distance * tickSize);

    const size = baseLiquidityPerLevel * spoofSizeMultiplier * (0.7 + Math.random() * 0.6);

    // Create level
    const level: LiquidityLevel = {
      price,
      side,
      totalSize: size,
      visibleSize: size,
      hiddenSize: 0,
      firstSeen: now,
      lastModified: now,
      ageMs: 0,
      persistenceScore: 0.1,
      sizeAdded: size,
      sizeRemoved: 0,
      passiveDelta: size,
      volumeAbsorbed: 0,
      absorptionRate: 0,
      isAbsorbing: false,
      isWall: false,
      isIceberg: false,
      isSpoof: true,
      spoofConfidence: 0.7 + Math.random() * 0.3,
      sizeHistory: [{ timestamp: now, size }],
      previousSize: 0,
    };

    const book = side === 'bid' ? this.state.bids : this.state.asks;
    book.set(price, level);

    this.state.spoofOrders.push({
      price,
      side,
      size,
      confidence: level.spoofConfidence,
      lifetime: 0,
      startTime: now,
    } as any);
  }

  private updateLiquidity(now: number, deltaMs: number): void {
    const { tickSize, liquiditySpread } = this.config;
    const mid = this.state.currentPrice;

    // Ensure levels exist near price
    for (let i = 1; i <= liquiditySpread; i++) {
      const bidPrice = this.roundToTick(mid - i * tickSize);
      const askPrice = this.roundToTick(mid + i * tickSize);

      if (!this.state.bids.has(bidPrice)) {
        const level = this.createLiquidityLevel(bidPrice, 'bid', mid, now);
        level.sizeAdded = level.visibleSize;
        this.state.bids.set(bidPrice, level);
      }

      if (!this.state.asks.has(askPrice)) {
        const level = this.createLiquidityLevel(askPrice, 'ask', mid, now);
        level.sizeAdded = level.visibleSize;
        this.state.asks.set(askPrice, level);
      }
    }

    // Remove far levels
    const maxDistance = liquiditySpread * tickSize * 1.3;
    for (const [price, level] of this.state.bids) {
      if (mid - price > maxDistance) {
        level.sizeRemoved += level.visibleSize;
        this.state.bids.delete(price);
      }
    }
    for (const [price, level] of this.state.asks) {
      if (price - mid > maxDistance) {
        level.sizeRemoved += level.visibleSize;
        this.state.asks.delete(price);
      }
    }

    // Randomly modify levels
    if (Math.random() < 0.08) {
      this.modifyRandomLevel(now);
    }

    // Replenish icebergs
    this.replenishIcebergs(now);
  }

  private modifyRandomLevel(now: number): void {
    const allLevels = [
      ...Array.from(this.state.bids.values()),
      ...Array.from(this.state.asks.values()),
    ].filter(l => !l.isSpoof && !l.isWall);

    if (allLevels.length === 0) return;

    const level = allLevels[Math.floor(Math.random() * allLevels.length)];
    const action = Math.random();

    if (action < 0.4) {
      // Add liquidity
      const addAmount = this.config.baseLiquidityPerLevel * (0.2 + Math.random() * 0.5);
      level.visibleSize += addAmount;
      level.totalSize += addAmount;
      level.sizeAdded += addAmount;
      level.lastModified = now;
    } else if (action < 0.7) {
      // Remove liquidity
      const removeAmount = level.visibleSize * (0.1 + Math.random() * 0.3);
      level.visibleSize = Math.max(0.1, level.visibleSize - removeAmount);
      level.totalSize = level.visibleSize + level.hiddenSize;
      level.sizeRemoved += removeAmount;
      level.lastModified = now;
    }

    level.passiveDelta = level.sizeAdded - level.sizeRemoved;
  }

  private replenishIcebergs(now: number): void {
    const threshold = this.config.baseLiquidityPerLevel * 0.25;

    for (const level of this.state.bids.values()) {
      if (level.isIceberg && level.hiddenSize > 0 && level.visibleSize < threshold) {
        const replenish = Math.min(level.hiddenSize, threshold * 2);
        level.visibleSize += replenish;
        level.hiddenSize -= replenish;
        level.sizeAdded += replenish;
        level.lastModified = now;
      }
    }
    for (const level of this.state.asks.values()) {
      if (level.isIceberg && level.hiddenSize > 0 && level.visibleSize < threshold) {
        const replenish = Math.min(level.hiddenSize, threshold * 2);
        level.visibleSize += replenish;
        level.hiddenSize -= replenish;
        level.sizeAdded += replenish;
        level.lastModified = now;
      }
    }
  }

  // ============================================================================
  // TRADE GENERATION
  // ============================================================================
  private maybeGenerateTrades(now: number): void {
    const { tradeFrequency, burstProbability, burstMultiplier } = this.config;

    const timeSinceLast = now - this.lastTradeTime;
    const expectedInterval = 1000 / tradeFrequency;

    if (timeSinceLast < expectedInterval * (0.4 + Math.random() * 1.2)) {
      return;
    }

    this.lastTradeTime = now;

    let numTrades = 1;
    if (Math.random() < burstProbability) {
      numTrades = Math.floor(Math.random() * burstMultiplier) + 2;
    }

    for (let i = 0; i < numTrades; i++) {
      this.executeTrade(now + i * 15);
    }
  }

  private executeTrade(timestamp: number): void {
    const { avgTradeSize, tradeSizeVariance, tickSize } = this.config;

    // Determine side
    const bidTotal = this.state.totalBidLiquidity;
    const askTotal = this.state.totalAskLiquidity;
    const imbalance = bidTotal / (bidTotal + askTotal + 0.001);
    const sideBias = 0.5 + this.trend * 0.15 + (imbalance - 0.5) * 0.2;
    const isBuy = Math.random() < sideBias;

    // Trade size
    const variance = (Math.random() - 0.5) * 2 * tradeSizeVariance;
    let tradeSize = Math.max(0.1, avgTradeSize + variance);

    // Occasional large trade
    if (Math.random() < 0.03) {
      tradeSize *= 4 + Math.random() * 6;
    }

    // Execute
    const book = isBuy ? this.state.asks : this.state.bids;
    const prices = Array.from(book.keys()).sort((a, b) => isBuy ? a - b : b - a);

    if (prices.length === 0) return;

    let remainingSize = tradeSize;
    let executionPrice = prices[0];
    let hitWall = false;
    let wallSize = 0;
    let liquidityAtPrice = 0;

    for (const price of prices) {
      if (remainingSize <= 0) break;

      const level = book.get(price);
      if (!level) continue;

      executionPrice = price;
      liquidityAtPrice = level.visibleSize;
      hitWall = level.isWall;
      wallSize = level.isWall ? level.visibleSize : 0;

      const fillAmount = Math.min(remainingSize, level.visibleSize);
      level.visibleSize -= fillAmount;
      level.volumeAbsorbed += fillAmount;
      level.absorptionRate += fillAmount * 0.5;
      level.isAbsorbing = true;
      remainingSize -= fillAmount;

      // Interaction event
      if (fillAmount > 0) {
        this.createInteractionEvent(
          fillAmount > level.totalSize * 0.3 ? 'absorption' : 'contact',
          price,
          isBuy ? 'ask' : 'bid',
          timestamp,
          fillAmount / level.totalSize,
          fillAmount,
          level.visibleSize
        );
      }

      // Check for break
      if (level.visibleSize < 0.1 && level.isWall) {
        this.createInteractionEvent(
          'break',
          price,
          level.side,
          timestamp,
          1,
          level.volumeAbsorbed,
          0
        );
        book.delete(price);
      } else if (level.visibleSize < 0.1) {
        book.delete(price);
      }
    }

    // Create trade
    const trade: InstitutionalTrade = {
      id: `trade_${++this.tradeIdCounter}`,
      price: executionPrice,
      quantity: tradeSize - remainingSize,
      side: isBuy ? 'buy' : 'sell',
      timestamp,
      hitWall,
      wallSize,
      liquidityAtPrice,
      isCluster: false,
      clusterId: null,
      clusterSize: 0,
    };

    this.pendingTrades.push(trade);
    this.state.recentTrades.push(trade);

    // Update price
    this.state.currentPrice = executionPrice;

    if (this.onTrade) {
      this.onTrade(trade);
    }
  }

  private createInteractionEvent(
    type: InteractionEvent['type'],
    price: number,
    side: 'bid' | 'ask',
    timestamp: number,
    intensity: number,
    volumeInvolved: number,
    liquidityRemaining: number
  ): void {
    const event: InteractionEvent = {
      type,
      price,
      side,
      timestamp,
      intensity: Math.min(1, intensity),
      volumeInvolved,
      liquidityRemaining,
    };

    this.state.interactionEvents.push(event);

    if (type === 'absorption') {
      this.state.activeAbsorptions.push({ price, side, intensity });
    }

    if (this.onInteraction) {
      this.onInteraction(event);
    }
  }

  private processTradesClusters(now: number): void {
    // Group trades by price and time
    const clusterWindow = this.clusterWindowMs;
    const tradesByPrice = new Map<number, InstitutionalTrade[]>();

    for (const trade of this.pendingTrades) {
      if (now - trade.timestamp < clusterWindow) {
        const key = trade.price;
        if (!tradesByPrice.has(key)) {
          tradesByPrice.set(key, []);
        }
        tradesByPrice.get(key)!.push(trade);
      }
    }

    // Create clusters
    for (const [price, trades] of tradesByPrice) {
      if (trades.length >= 2) {
        const clusterId = `cluster_${++this.clusterIdCounter}`;
        const totalQuantity = trades.reduce((sum, t) => sum + t.quantity, 0);
        const firstTrade = trades[0];

        const cluster: TradeCluster = {
          id: clusterId,
          price,
          side: firstTrade.side,
          totalQuantity,
          tradeCount: trades.length,
          startTime: trades[0].timestamp,
          endTime: trades[trades.length - 1].timestamp,
          hitWall: trades.some(t => t.hitWall),
          liquidityAtPrice: firstTrade.liquidityAtPrice,
        };

        this.state.tradeClusters.push(cluster);

        // Mark trades
        for (const trade of trades) {
          trade.isCluster = true;
          trade.clusterId = clusterId;
          trade.clusterSize = totalQuantity;
        }
      }
    }

    this.pendingTrades = [];
  }

  private cleanOldData(now: number): void {
    const { historyRetentionMs } = this.config;
    const cutoff = now - historyRetentionMs;

    // Clean trades
    this.state.recentTrades = this.state.recentTrades.filter(t => t.timestamp > cutoff);

    // Clean clusters
    this.state.tradeClusters = this.state.tradeClusters.filter(c => c.endTime > cutoff);

    // Clean events
    this.state.interactionEvents = this.state.interactionEvents.filter(e => e.timestamp > cutoff - 5000);

    // Clean absorptions
    this.state.activeAbsorptions = this.state.activeAbsorptions.filter(a => {
      a.intensity *= 0.95;
      return a.intensity > 0.1;
    });
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
  setOnStateUpdate(cb: (state: InstitutionalState) => void): void {
    this.onStateUpdate = cb;
  }

  setOnTrade(cb: (trade: InstitutionalTrade) => void): void {
    this.onTrade = cb;
  }

  setOnInteraction(cb: (event: InteractionEvent) => void): void {
    this.onInteraction = cb;
  }

  getState(): InstitutionalState {
    return this.state;
  }

  getConfig(): InstitutionalConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<InstitutionalConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.state = this.initializeState();
    this.tradeIdCounter = 0;
    this.clusterIdCounter = 0;
    this.pendingTrades = [];
    this.trend = 0;
  }

  destroy(): void {
    this.stop();
    this.onStateUpdate = null;
    this.onTrade = null;
    this.onInteraction = null;
  }
}

export default InstitutionalSimulationEngine;
