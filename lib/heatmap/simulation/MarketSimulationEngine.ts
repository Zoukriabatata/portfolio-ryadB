/**
 * MARKET SIMULATION ENGINE
 *
 * High-fidelity deterministic simulation that generates realistic order flow.
 * Designed to behave exactly like a real market environment.
 *
 * Features:
 * - Dynamic order book with iceberg behavior
 * - Liquidity walls with clustering
 * - Spoofing patterns (appear then cancel)
 * - Absorption dynamics
 * - Realistic trade execution
 * - Price action that interacts with liquidity
 */

export interface SimulationConfig {
  // Instrument
  tickSize: number;
  basePrice: number;

  // Liquidity
  liquidityIntensity: number;        // 0.5 - 2.0, multiplier
  baseLiquidityPerLevel: number;     // Base contracts per level
  liquiditySpread: number;           // How many ticks from mid to populate
  wallProbability: number;           // Chance of wall at any level
  wallSizeMultiplier: number;        // How big walls are vs normal
  icebergProbability: number;        // Chance of iceberg order
  icebergHiddenRatio: number;        // % hidden in iceberg

  // Spoofing
  spoofProbability: number;          // Chance of spoof per update
  spoofLifetimeMs: number;           // How long spoofs live
  spoofSizeMultiplier: number;       // Spoof size vs normal

  // Trading
  tradeFrequency: number;            // Trades per second
  avgTradeSize: number;              // Average contracts
  tradeSizeVariance: number;         // Variance in size
  burstProbability: number;          // Chance of trade burst
  burstMultiplier: number;           // How many trades in burst

  // Price dynamics
  volatility: number;                // Price volatility
  trendStrength: number;             // -1 to 1, current trend
  meanReversionStrength: number;     // How strongly price reverts

  // Decay
  liquidityDecayMs: number;          // Half-life of liquidity persistence
}

export interface SimulatedOrder {
  id: string;
  price: number;
  size: number;
  visibleSize: number;               // For iceberg orders
  hiddenSize: number;
  side: 'bid' | 'ask';
  timestamp: number;
  expiresAt: number | null;          // For spoofs
  isIceberg: boolean;
  isSpoof: boolean;
  isWall: boolean;
  absorbed: number;                  // Volume absorbed so far
}

export interface SimulatedTrade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
  isAggressor: boolean;
  triggeredBy: 'market' | 'stop' | 'liquidation';
}

export interface SimulationState {
  currentPrice: number;
  bids: Map<number, SimulatedOrder[]>;
  asks: Map<number, SimulatedOrder[]>;
  recentTrades: SimulatedTrade[];
  walls: Array<{ price: number; side: 'bid' | 'ask'; size: number }>;
  spoofOrders: SimulatedOrder[];
  absorptionZones: Array<{ price: number; side: 'bid' | 'ask'; absorbed: number }>;
  timestamp: number;
}

const DEFAULT_CONFIG: SimulationConfig = {
  tickSize: 0.5,
  basePrice: 100000,

  liquidityIntensity: 1.0,
  baseLiquidityPerLevel: 10,
  liquiditySpread: 50,
  wallProbability: 0.03,
  wallSizeMultiplier: 8,
  icebergProbability: 0.15,
  icebergHiddenRatio: 0.7,

  spoofProbability: 0.02,
  spoofLifetimeMs: 800,
  spoofSizeMultiplier: 5,

  tradeFrequency: 8,
  avgTradeSize: 2,
  tradeSizeVariance: 3,
  burstProbability: 0.05,
  burstMultiplier: 5,

  volatility: 0.0001,
  trendStrength: 0,
  meanReversionStrength: 0.3,

  liquidityDecayMs: 5000,
};

export class MarketSimulationEngine {
  private config: SimulationConfig;
  private state: SimulationState;
  private orderIdCounter: number = 0;
  private tradeIdCounter: number = 0;
  private lastUpdateTime: number = 0;
  private lastTradeTime: number = 0;
  private priceHistory: number[] = [];
  private trend: number = 0;
  private intervalId: NodeJS.Timeout | null = null;

  // Callbacks
  private onOrderBookUpdate: ((bids: Map<number, number>, asks: Map<number, number>) => void) | null = null;
  private onTrade: ((trade: SimulatedTrade) => void) | null = null;
  private onStateUpdate: ((state: SimulationState) => void) | null = null;

  constructor(config?: Partial<SimulationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.initializeState();
  }

  private initializeState(): SimulationState {
    const now = Date.now();
    const state: SimulationState = {
      currentPrice: this.config.basePrice,
      bids: new Map(),
      asks: new Map(),
      recentTrades: [],
      walls: [],
      spoofOrders: [],
      absorptionZones: [],
      timestamp: now,
    };

    // Initialize order book
    this.populateOrderBook(state);

    return state;
  }

  /**
   * Populate order book with initial liquidity
   */
  private populateOrderBook(state: SimulationState): void {
    const { tickSize, liquiditySpread, basePrice } = this.config;
    const mid = state.currentPrice || basePrice;

    // Clear existing
    state.bids.clear();
    state.asks.clear();
    state.walls = [];

    // Generate bid levels
    for (let i = 1; i <= liquiditySpread; i++) {
      const price = this.roundToTick(mid - i * tickSize);
      const orders = this.generateLiquidityAtLevel(price, 'bid', mid);
      state.bids.set(price, orders);

      // Check for wall
      const totalSize = orders.reduce((sum, o) => sum + o.visibleSize, 0);
      if (orders.some(o => o.isWall)) {
        state.walls.push({ price, side: 'bid', size: totalSize });
      }
    }

    // Generate ask levels
    for (let i = 1; i <= liquiditySpread; i++) {
      const price = this.roundToTick(mid + i * tickSize);
      const orders = this.generateLiquidityAtLevel(price, 'ask', mid);
      state.asks.set(price, orders);

      const totalSize = orders.reduce((sum, o) => sum + o.visibleSize, 0);
      if (orders.some(o => o.isWall)) {
        state.walls.push({ price, side: 'ask', size: totalSize });
      }
    }
  }

  /**
   * Generate liquidity orders at a price level
   */
  private generateLiquidityAtLevel(price: number, side: 'bid' | 'ask', midPrice?: number): SimulatedOrder[] {
    const { liquidityIntensity, baseLiquidityPerLevel, wallProbability,
            wallSizeMultiplier, icebergProbability, icebergHiddenRatio } = this.config;

    const orders: SimulatedOrder[] = [];
    const now = Date.now();

    // Distance from mid affects liquidity (more liquidity further from mid)
    const currentMid = midPrice ?? this.state?.currentPrice ?? this.config.basePrice;
    const distanceFromMid = Math.abs(price - currentMid) / this.config.tickSize;
    const distanceMultiplier = 1 + Math.log(1 + distanceFromMid * 0.1);

    // Random variation
    const randomMultiplier = 0.3 + Math.random() * 1.4;

    // Base size
    let baseSize = baseLiquidityPerLevel * liquidityIntensity * distanceMultiplier * randomMultiplier;

    // Check for wall
    const isWall = Math.random() < wallProbability * (distanceFromMid > 5 ? 1.5 : 1);
    if (isWall) {
      baseSize *= wallSizeMultiplier;
    }

    // Check for iceberg
    const isIceberg = !isWall && Math.random() < icebergProbability;
    let visibleSize = baseSize;
    let hiddenSize = 0;

    if (isIceberg) {
      hiddenSize = baseSize * icebergHiddenRatio;
      visibleSize = baseSize * (1 - icebergHiddenRatio);
    }

    // Create order
    orders.push({
      id: `order_${++this.orderIdCounter}`,
      price,
      size: baseSize,
      visibleSize,
      hiddenSize,
      side,
      timestamp: now,
      expiresAt: null,
      isIceberg,
      isSpoof: false,
      isWall,
      absorbed: 0,
    });

    // Sometimes add multiple smaller orders at same level
    if (Math.random() < 0.3 && !isWall) {
      const extraOrders = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < extraOrders; i++) {
        const smallSize = baseLiquidityPerLevel * (0.2 + Math.random() * 0.5);
        orders.push({
          id: `order_${++this.orderIdCounter}`,
          price,
          size: smallSize,
          visibleSize: smallSize,
          hiddenSize: 0,
          side,
          timestamp: now,
          expiresAt: null,
          isIceberg: false,
          isSpoof: false,
          isWall: false,
          absorbed: 0,
        });
      }
    }

    return orders;
  }

  /**
   * Start simulation loop
   */
  start(intervalMs: number = 50): void {
    if (this.intervalId) return;

    this.lastUpdateTime = Date.now();
    this.lastTradeTime = Date.now();

    this.intervalId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  /**
   * Stop simulation
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Main simulation tick
   */
  private tick(): void {
    const now = Date.now();
    const deltaMs = now - this.lastUpdateTime;
    this.lastUpdateTime = now;

    // Update price trend
    this.updateTrend(deltaMs);

    // Process spoofs
    this.processSpoofs(now);

    // Generate new spoofs
    this.maybeGenerateSpoof(now);

    // Update liquidity (add/remove/modify)
    this.updateLiquidity(now, deltaMs);

    // Generate trades
    this.maybeGenerateTrades(now);

    // Update state timestamp
    this.state.timestamp = now;

    // Notify listeners
    this.notifyOrderBookUpdate();
    this.notifyStateUpdate();
  }

  /**
   * Update price trend based on market dynamics
   */
  private updateTrend(deltaMs: number): void {
    const { volatility, trendStrength, meanReversionStrength } = this.config;

    // Random walk component
    const randomWalk = (Math.random() - 0.5) * 2 * volatility * Math.sqrt(deltaMs);

    // Trend component
    this.trend = this.trend * 0.99 + trendStrength * 0.01;
    const trendComponent = this.trend * volatility * deltaMs * 0.001;

    // Mean reversion (towards base price)
    const deviation = (this.state.currentPrice - this.config.basePrice) / this.config.basePrice;
    const meanReversion = -deviation * meanReversionStrength * deltaMs * 0.0001;

    // Calculate new price
    let newPrice = this.state.currentPrice * (1 + randomWalk + trendComponent + meanReversion);
    newPrice = this.roundToTick(newPrice);

    // Track history
    this.priceHistory.push(newPrice);
    if (this.priceHistory.length > 1000) {
      this.priceHistory.shift();
    }
  }

  /**
   * Process existing spoof orders
   */
  private processSpoofs(now: number): void {
    // Remove expired spoofs
    this.state.spoofOrders = this.state.spoofOrders.filter(spoof => {
      if (spoof.expiresAt && now >= spoof.expiresAt) {
        // Remove from order book
        const book = spoof.side === 'bid' ? this.state.bids : this.state.asks;
        const orders = book.get(spoof.price);
        if (orders) {
          const idx = orders.findIndex(o => o.id === spoof.id);
          if (idx >= 0) orders.splice(idx, 1);
          if (orders.length === 0) book.delete(spoof.price);
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Maybe generate a new spoof order
   */
  private maybeGenerateSpoof(now: number): void {
    if (Math.random() >= this.config.spoofProbability) return;

    const { tickSize, spoofLifetimeMs, spoofSizeMultiplier, baseLiquidityPerLevel } = this.config;
    const side = Math.random() < 0.5 ? 'bid' : 'ask';

    // Spoofs appear close to mid
    const distance = Math.floor(Math.random() * 5) + 2;
    const price = side === 'bid'
      ? this.roundToTick(this.state.currentPrice - distance * tickSize)
      : this.roundToTick(this.state.currentPrice + distance * tickSize);

    const size = baseLiquidityPerLevel * spoofSizeMultiplier * (0.8 + Math.random() * 0.4);

    const spoof: SimulatedOrder = {
      id: `spoof_${++this.orderIdCounter}`,
      price,
      size,
      visibleSize: size,
      hiddenSize: 0,
      side,
      timestamp: now,
      expiresAt: now + spoofLifetimeMs * (0.5 + Math.random()),
      isIceberg: false,
      isSpoof: true,
      isWall: false,
      absorbed: 0,
    };

    // Add to order book
    const book = side === 'bid' ? this.state.bids : this.state.asks;
    const existing = book.get(price) || [];
    existing.push(spoof);
    book.set(price, existing);

    this.state.spoofOrders.push(spoof);
  }

  /**
   * Update liquidity dynamically
   */
  private updateLiquidity(now: number, deltaMs: number): void {
    const { tickSize, liquiditySpread } = this.config;
    const mid = this.state.currentPrice;

    // Add new levels if price moved
    for (let i = 1; i <= liquiditySpread; i++) {
      const bidPrice = this.roundToTick(mid - i * tickSize);
      const askPrice = this.roundToTick(mid + i * tickSize);

      // Add bid level if missing
      if (!this.state.bids.has(bidPrice)) {
        const orders = this.generateLiquidityAtLevel(bidPrice, 'bid', mid);
        this.state.bids.set(bidPrice, orders);
      }

      // Add ask level if missing
      if (!this.state.asks.has(askPrice)) {
        const orders = this.generateLiquidityAtLevel(askPrice, 'ask', mid);
        this.state.asks.set(askPrice, orders);
      }
    }

    // Remove levels too far from mid
    const maxDistance = liquiditySpread * tickSize * 1.5;
    for (const [price] of this.state.bids) {
      if (mid - price > maxDistance) {
        this.state.bids.delete(price);
      }
    }
    for (const [price] of this.state.asks) {
      if (price - mid > maxDistance) {
        this.state.asks.delete(price);
      }
    }

    // Randomly modify some levels
    if (Math.random() < 0.1) {
      this.randomlyModifyLiquidity();
    }

    // Replenish icebergs that have been absorbed
    this.replenishIcebergs();

    // Update walls list
    this.updateWallsList();
  }

  /**
   * Randomly modify liquidity at some levels
   */
  private randomlyModifyLiquidity(): void {
    const allLevels = [
      ...Array.from(this.state.bids.entries()).map(([p, o]) => ({ price: p, orders: o, side: 'bid' as const })),
      ...Array.from(this.state.asks.entries()).map(([p, o]) => ({ price: p, orders: o, side: 'ask' as const })),
    ];

    if (allLevels.length === 0) return;

    // Pick random level
    const level = allLevels[Math.floor(Math.random() * allLevels.length)];

    // Decide action
    const action = Math.random();

    if (action < 0.3 && level.orders.length > 0) {
      // Reduce liquidity
      const order = level.orders[0];
      if (!order.isWall && !order.isSpoof) {
        order.visibleSize *= 0.7 + Math.random() * 0.3;
        order.size = order.visibleSize + order.hiddenSize;
      }
    } else if (action < 0.5) {
      // Add small order
      const newOrder: SimulatedOrder = {
        id: `order_${++this.orderIdCounter}`,
        price: level.price,
        size: this.config.baseLiquidityPerLevel * (0.2 + Math.random() * 0.5),
        visibleSize: this.config.baseLiquidityPerLevel * (0.2 + Math.random() * 0.5),
        hiddenSize: 0,
        side: level.side,
        timestamp: Date.now(),
        expiresAt: null,
        isIceberg: false,
        isSpoof: false,
        isWall: false,
        absorbed: 0,
      };
      level.orders.push(newOrder);
    } else if (action < 0.6 && level.orders.length > 1) {
      // Remove small order
      const nonWallNonSpoof = level.orders.filter(o => !o.isWall && !o.isSpoof);
      if (nonWallNonSpoof.length > 1) {
        const smallest = nonWallNonSpoof.reduce((min, o) => o.size < min.size ? o : min);
        const idx = level.orders.findIndex(o => o.id === smallest.id);
        if (idx >= 0) level.orders.splice(idx, 1);
      }
    }
  }

  /**
   * Replenish iceberg orders
   */
  private replenishIcebergs(): void {
    const replenish = (orders: SimulatedOrder[]) => {
      for (const order of orders) {
        if (order.isIceberg && order.hiddenSize > 0) {
          // If visible size dropped below threshold, replenish
          const threshold = this.config.baseLiquidityPerLevel * 0.3;
          if (order.visibleSize < threshold && order.hiddenSize > 0) {
            const replenishAmount = Math.min(
              order.hiddenSize,
              this.config.baseLiquidityPerLevel * (1 - this.config.icebergHiddenRatio)
            );
            order.visibleSize += replenishAmount;
            order.hiddenSize -= replenishAmount;
          }
        }
      }
    };

    for (const orders of this.state.bids.values()) replenish(orders);
    for (const orders of this.state.asks.values()) replenish(orders);
  }

  /**
   * Update the walls list
   */
  private updateWallsList(): void {
    this.state.walls = [];

    const checkForWalls = (book: Map<number, SimulatedOrder[]>, side: 'bid' | 'ask') => {
      for (const [price, orders] of book) {
        const totalSize = orders.reduce((sum, o) => sum + o.visibleSize, 0);
        if (orders.some(o => o.isWall)) {
          this.state.walls.push({ price, side, size: totalSize });
        }
      }
    };

    checkForWalls(this.state.bids, 'bid');
    checkForWalls(this.state.asks, 'ask');
  }

  /**
   * Maybe generate trades
   */
  private maybeGenerateTrades(now: number): void {
    const { tradeFrequency, burstProbability, burstMultiplier } = this.config;

    // Calculate time since last trade
    const timeSinceLastTrade = now - this.lastTradeTime;
    const expectedInterval = 1000 / tradeFrequency;

    // Check if it's time for a trade
    if (timeSinceLastTrade < expectedInterval * (0.3 + Math.random() * 1.4)) {
      return;
    }

    this.lastTradeTime = now;

    // Determine number of trades (burst or single)
    let numTrades = 1;
    if (Math.random() < burstProbability) {
      numTrades = Math.floor(Math.random() * burstMultiplier) + 2;
    }

    // Generate trades
    for (let i = 0; i < numTrades; i++) {
      this.executeTrade(now + i * 10); // Slight time offset for burst
    }
  }

  /**
   * Execute a single trade
   */
  private executeTrade(timestamp: number): void {
    const { avgTradeSize, tradeSizeVariance, tickSize } = this.config;

    // Determine side based on imbalance and trend
    const bidTotal = this.getTotalLiquidity('bid');
    const askTotal = this.getTotalLiquidity('ask');
    const imbalance = bidTotal / (bidTotal + askTotal + 0.001);
    const sideBias = 0.5 + this.trend * 0.2 + (imbalance - 0.5) * 0.3;
    const isBuy = Math.random() < sideBias;

    // Calculate trade size
    const sizeVariance = (Math.random() - 0.5) * 2 * tradeSizeVariance;
    let tradeSize = Math.max(0.1, avgTradeSize + sizeVariance);

    // Occasionally large trades
    if (Math.random() < 0.05) {
      tradeSize *= 3 + Math.random() * 5;
    }

    // Get execution price
    const book = isBuy ? this.state.asks : this.state.bids;
    const prices = Array.from(book.keys()).sort((a, b) => isBuy ? a - b : b - a);

    if (prices.length === 0) return;

    let remainingSize = tradeSize;
    let executionPrice = prices[0];
    let totalAbsorbed = 0;

    // Execute against order book
    for (const price of prices) {
      if (remainingSize <= 0) break;

      const orders = book.get(price);
      if (!orders || orders.length === 0) continue;

      executionPrice = price;

      for (const order of orders) {
        if (remainingSize <= 0) break;

        const fillAmount = Math.min(remainingSize, order.visibleSize);
        order.visibleSize -= fillAmount;
        order.absorbed += fillAmount;
        remainingSize -= fillAmount;
        totalAbsorbed += fillAmount;

        // Track absorption
        if (order.isWall && fillAmount > 0) {
          this.recordAbsorption(price, isBuy ? 'ask' : 'bid', fillAmount);
        }
      }

      // Clean up empty orders
      const remaining = orders.filter(o => o.visibleSize > 0.01);
      if (remaining.length === 0) {
        book.delete(price);
      } else {
        book.set(price, remaining);
      }
    }

    // Create trade record
    const trade: SimulatedTrade = {
      id: `trade_${++this.tradeIdCounter}`,
      price: executionPrice,
      quantity: tradeSize - remainingSize,
      side: isBuy ? 'buy' : 'sell',
      timestamp,
      isAggressor: true,
      triggeredBy: 'market',
    };

    // Update state
    this.state.recentTrades.push(trade);
    if (this.state.recentTrades.length > 500) {
      this.state.recentTrades.shift();
    }

    // Update current price
    this.state.currentPrice = executionPrice;

    // Notify trade
    if (this.onTrade) {
      this.onTrade(trade);
    }
  }

  /**
   * Record absorption at a price level
   */
  private recordAbsorption(price: number, side: 'bid' | 'ask', amount: number): void {
    const existing = this.state.absorptionZones.find(z => z.price === price && z.side === side);
    if (existing) {
      existing.absorbed += amount;
    } else {
      this.state.absorptionZones.push({ price, side, absorbed: amount });
    }

    // Limit absorption zones
    if (this.state.absorptionZones.length > 20) {
      this.state.absorptionZones.shift();
    }
  }

  /**
   * Get total liquidity for a side
   */
  private getTotalLiquidity(side: 'bid' | 'ask'): number {
    const book = side === 'bid' ? this.state.bids : this.state.asks;
    let total = 0;
    for (const orders of book.values()) {
      for (const order of orders) {
        total += order.visibleSize;
      }
    }
    return total;
  }

  /**
   * Round price to tick
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  /**
   * Notify order book update
   */
  private notifyOrderBookUpdate(): void {
    if (!this.onOrderBookUpdate) return;

    const bids = new Map<number, number>();
    const asks = new Map<number, number>();

    for (const [price, orders] of this.state.bids) {
      bids.set(price, orders.reduce((sum, o) => sum + o.visibleSize, 0));
    }
    for (const [price, orders] of this.state.asks) {
      asks.set(price, orders.reduce((sum, o) => sum + o.visibleSize, 0));
    }

    this.onOrderBookUpdate(bids, asks);
  }

  /**
   * Notify state update
   */
  private notifyStateUpdate(): void {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  setOnOrderBookUpdate(callback: (bids: Map<number, number>, asks: Map<number, number>) => void): void {
    this.onOrderBookUpdate = callback;
  }

  setOnTrade(callback: (trade: SimulatedTrade) => void): void {
    this.onTrade = callback;
  }

  setOnStateUpdate(callback: (state: SimulationState) => void): void {
    this.onStateUpdate = callback;
  }

  getState(): SimulationState {
    return this.state;
  }

  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getCurrentPrice(): number {
    return this.state.currentPrice;
  }

  getOrderBook(): { bids: Map<number, number>; asks: Map<number, number> } {
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();

    for (const [price, orders] of this.state.bids) {
      bids.set(price, orders.reduce((sum, o) => sum + o.visibleSize, 0));
    }
    for (const [price, orders] of this.state.asks) {
      asks.set(price, orders.reduce((sum, o) => sum + o.visibleSize, 0));
    }

    return { bids, asks };
  }

  getRecentTrades(windowMs: number = 60000): SimulatedTrade[] {
    const cutoff = Date.now() - windowMs;
    return this.state.recentTrades.filter(t => t.timestamp > cutoff);
  }

  getSpoofOrders(): SimulatedOrder[] {
    return this.state.spoofOrders;
  }

  getWalls(): Array<{ price: number; side: 'bid' | 'ask'; size: number }> {
    return this.state.walls;
  }

  getAbsorptionZones(): Array<{ price: number; side: 'bid' | 'ask'; absorbed: number }> {
    return this.state.absorptionZones;
  }

  /**
   * Force a price move (for testing)
   */
  forcePriceMove(direction: 'up' | 'down', ticks: number = 1): void {
    const delta = direction === 'up' ? ticks : -ticks;
    this.state.currentPrice = this.roundToTick(this.state.currentPrice + delta * this.config.tickSize);
  }

  /**
   * Force a trade burst
   */
  forceTradeBurst(numTrades: number = 5): void {
    const now = Date.now();
    for (let i = 0; i < numTrades; i++) {
      this.executeTrade(now + i * 20);
    }
  }

  /**
   * Reset simulation
   */
  reset(): void {
    this.state = this.initializeState();
    this.orderIdCounter = 0;
    this.tradeIdCounter = 0;
    this.priceHistory = [];
    this.trend = 0;
  }

  /**
   * Destroy simulation
   */
  destroy(): void {
    this.stop();
    this.onOrderBookUpdate = null;
    this.onTrade = null;
    this.onStateUpdate = null;
  }
}

export default MarketSimulationEngine;
