/**
 * SIMULATION ENGINE V2 - Simple and stable
 *
 * Generates:
 * - Moving bid/ask prices
 * - Trades (buys/sells)
 * - Passive orders (order book)
 */

import {
  MarketState,
  PricePoint,
  Trade,
  TradeCluster,
  PassiveOrder,
  HeatmapCell,
  CumulativeLevel,
  InterestZone,
  SimulationConfig,
  DEFAULT_CONFIG,
  ImbalanceLevel,
  AbsorptionEvent,
  IcebergOrder,
  VWAPData,
  CumulativeDeltaData,
  DeltaPoint,
  TapeVelocityData,
  VelocityPoint,
  LargeTradeAlertsData,
  LargeTrade,
  PressureMeterData,
  PressurePoint,
  SessionStats,
  DrawingsData,
} from './types';

export class SimulationEngine {
  private config: SimulationConfig;
  private state: MarketState;
  private tradeCounter = 0;
  private heatmapTickCounter = 0;
  private lastPriceHistoryUpdate = 0;
  private priceHistoryInterval = 200;   // Add price history point every 200ms
  private momentum = 0;                 // Price momentum (-1 to 1)
  private tradeBurstRemaining = 0;      // Remaining burst trades
  private tradeBurstSide: 'buy' | 'sell' = 'buy';
  private intervalId: NodeJS.Timeout | null = null;
  private onUpdate: ((state: MarketState) => void) | null = null;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════
  private createInitialState(): MarketState {
    const now = Date.now();
    const { basePrice, tickSize } = this.config;

    const state: MarketState = {
      currentBid: basePrice - tickSize,
      currentAsk: basePrice,
      midPrice: basePrice - tickSize / 2,
      priceHistory: [],
      trades: [],
      tradeClusters: [],
      cumulativeLevels: new Map(),
      bids: new Map(),
      asks: new Map(),
      interestZones: new Map(),
      heatmapHistory: new Map(),
      traces: [],
      // Advanced orderflow features
      imbalances: [],
      absorptionEvents: [],
      icebergs: new Map(),
      vwap: {
        vwap: basePrice,
        upperBand: basePrice + tickSize * 5,
        lowerBand: basePrice - tickSize * 5,
        cumulativeVolume: 0,
        cumulativePV: 0,
      },
      cumulativeDelta: {
        points: [],
        currentDelta: 0,
        sessionHigh: 0,
        sessionLow: 0,
        maxAbsDelta: 1,
      },
      tapeVelocity: {
        points: [],
        currentTPS: 0,
        currentVPS: 0,
        avgTPS: 0,
        maxTPS: 0,
        isAccelerating: false,
        accelerationLevel: 'normal',
      },
      largeTradeAlerts: {
        trades: [],
        largeThreshold: 10,
        hugeThreshold: 25,
        massiveThreshold: 50,
        avgTradeSize: 5,
        maxTradeSize: 5,
        totalLargeTrades: 0,
      },
      pressureMeter: {
        points: [],
        currentRatio: 0,
        smoothedRatio: 0,
        shortTermBuyVol: 0,
        shortTermSellVol: 0,
        mediumTermBuyVol: 0,
        mediumTermSellVol: 0,
        momentum: 'neutral',
        momentumStrength: 0,
      },
      sessionStats: {
        sessionHigh: basePrice,
        sessionLow: basePrice,
        sessionOpen: basePrice,
        poc: basePrice,
        vah: basePrice + tickSize * 5,
        val: basePrice - tickSize * 5,
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        delta: 0,
        deltaPercent: 0,
        totalTrades: 0,
        avgTradeSize: 0,
        largestTrade: 0,
        sessionStart: now,
        lastUpdate: now,
      },
      drawings: {
        drawings: [],
        selectedId: null,
        activeToolType: null,
      },
      depthColumns: [],
      timestamp: now,
    };

    // Initialize price history
    for (let i = 100; i >= 0; i--) {
      state.priceHistory.push({
        timestamp: now - i * 100,
        bid: state.currentBid,
        ask: state.currentAsk,
      });
    }

    // Initialize interest zones (significant levels)
    this.initializeInterestZones(state, now);

    // Initialize order book (only in interest zones)
    this.initializeOrderBook(state, now);

    return state;
  }

  private initializeInterestZones(state: MarketState, now: number): void {
    const { tickSize, orderBookDepth, baseLiquidity } = this.config;

    // Create interest zones at "round" or significant levels
    // Not every tick, only certain important levels
    const zoneSpacing = tickSize * 3; // Zone every ~3 ticks

    for (let i = 1; i <= orderBookDepth; i++) {
      // Bid zones (below price)
      const bidPrice = this.roundToTick(state.currentBid - i * tickSize);
      // Ask zones (above price)
      const askPrice = this.roundToTick(state.currentAsk + i * tickSize);

      // Only certain levels are interest zones
      const isBidZone = i % 3 === 0 || Math.random() < 0.15;
      const isAskZone = i % 3 === 0 || Math.random() < 0.15;

      if (isBidZone) {
        state.interestZones.set(bidPrice, {
          price: bidPrice,
          side: 'bid',
          strength: 0.3 + Math.random() * 0.7,
          totalVolume: baseLiquidity * (1 + Math.random() * 2),
          orderCount: 1,
          firstSeen: now,
          lastActivity: now,
          wasTestedByPrice: false,
        });
      }

      if (isAskZone) {
        state.interestZones.set(askPrice, {
          price: askPrice,
          side: 'ask',
          strength: 0.3 + Math.random() * 0.7,
          totalVolume: baseLiquidity * (1 + Math.random() * 2),
          orderCount: 1,
          firstSeen: now,
          lastActivity: now,
          wasTestedByPrice: false,
        });
      }
    }
  }

  private initializeOrderBook(state: MarketState, now: number): void {
    const { baseLiquidity, wallProbability, tickSize, orderBookDepth, nearBookFillPct } = this.config;
    const nearThreshold = Math.floor(orderBookDepth * nearBookFillPct);

    // 1. Fill ALL levels near the current price (dense near, realistic thin→thick)
    for (let i = 1; i <= nearThreshold; i++) {
      const distanceFactor = i / nearThreshold; // 0→1 as distance increases
      const bidPrice = this.roundToTick(state.currentBid - i * tickSize);
      const askPrice = this.roundToTick(state.currentAsk + i * tickSize);

      // Size: thin near price, thicker further away
      let bidSize = baseLiquidity * (0.3 + distanceFactor * 0.7) * (0.7 + Math.random() * 0.6);
      let askSize = baseLiquidity * (0.3 + distanceFactor * 0.7) * (0.7 + Math.random() * 0.6);

      // Wall probability increases with distance
      if (Math.random() < wallProbability * (1 + distanceFactor * 2)) {
        bidSize *= 3 + Math.random() * 2;
      }
      if (Math.random() < wallProbability * (1 + distanceFactor * 2)) {
        askSize *= 3 + Math.random() * 2;
      }

      state.bids.set(bidPrice, this.createOrder(bidPrice, 'bid', bidSize, now, true, distanceFactor > 0.5));
      state.asks.set(askPrice, this.createOrder(askPrice, 'ask', askSize, now, true, distanceFactor > 0.5));
    }

    // 2. Far levels: use interest zones (sparse, same as before)
    for (const [price, zone] of state.interestZones) {
      // Skip if already covered by near-price fill
      const distBid = Math.abs(price - state.currentBid) / tickSize;
      const distAsk = Math.abs(price - state.currentAsk) / tickSize;
      if (zone.side === 'bid' && distBid <= nearThreshold) continue;
      if (zone.side === 'ask' && distAsk <= nearThreshold) continue;

      let size = zone.totalVolume;
      if (zone.strength > 0.7 && Math.random() < wallProbability * 2) {
        size *= 3 + Math.random() * 2;
      }

      const order = this.createOrder(price, zone.side, size, now, true, zone.strength > 0.5);
      if (zone.side === 'bid') {
        state.bids.set(price, order);
      } else {
        state.asks.set(price, order);
      }
    }
  }

  private createOrder(
    price: number,
    side: 'bid' | 'ask',
    size: number,
    now: number,
    instant = false,
    isSignificant = false
  ): PassiveOrder {
    return {
      price,
      side,
      size,
      initialSize: size,
      displaySize: instant ? size : 0,
      state: instant ? 'stable' : 'appearing',
      firstSeen: now,
      lastModified: now,
      stateChangeTime: now,
      lastVolumeAdd: now,
      timesReinforced: 0,
      wasPartiallyAbsorbed: false,
      opacity: instant ? 1 : 0,
      intensity: Math.min(1, size / (this.config.baseLiquidity * 3)),
      isSignificant,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN LOOP
  // ══════════════════════════════════════════════════════════════════════════
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), 50); // 20 FPS
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = 50; // ms

    // 1. Update price
    this.updatePrice(now);

    // 2. Generate trades
    this.maybeGenerateTrade(now);

    // 3. Update passive orders
    this.updatePassiveOrders(now, dt);

    // 4. Update trades (animation)
    this.updateTrades(now);

    // 5. Update traces
    this.updateTraces(now);

    // 6. Record heatmap snapshot (every 4 ticks = 200ms)
    this.heatmapTickCounter++;
    if (this.heatmapTickCounter % 4 === 0) {
      this.recordHeatmapSnapshot(now);
    }

    // 7. Calculate advanced orderflow features
    this.calculateImbalances(now);
    this.updateAbsorptionEvents(now);
    this.detectIcebergs(now);
    this.updateVWAP(now);
    this.updateCumulativeDelta(now);
    this.updateTapeVelocity(now);
    this.updateLargeTradeAlerts(now);
    this.updatePressureMeter(now);
    this.updateSessionStats(now);

    // 8. Notify
    this.state.timestamp = now;
    if (this.onUpdate) {
      this.onUpdate(this.state);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRICE
  // ══════════════════════════════════════════════════════════════════════════
  private updatePrice(now: number): void {
    const { tickSize, priceMoveProb, momentumDecay } = this.config;

    // Decay momentum each tick
    this.momentum *= momentumDecay;

    // Biased random walk: momentum shifts probability
    const moveProb = priceMoveProb + Math.abs(this.momentum) * 0.1;

    if (Math.random() < moveProb) {
      // Direction: biased by momentum
      const rawDir = (Math.random() - 0.5) + this.momentum * 0.4;
      const direction = Math.sign(rawDir);

      // Multi-tick move when momentum is strong
      const ticks = Math.abs(this.momentum) > 0.6 ? 2 : 1;

      if (direction > 0) {
        this.state.currentAsk = this.roundToTick(this.state.currentAsk + tickSize * ticks);
        this.state.currentBid = this.roundToTick(this.state.currentBid + tickSize * ticks);
      } else if (direction < 0) {
        this.state.currentAsk = this.roundToTick(this.state.currentAsk - tickSize * ticks);
        this.state.currentBid = this.roundToTick(this.state.currentBid - tickSize * ticks);
      }

      // Set momentum after move (carries into next ticks)
      this.momentum = direction * (0.3 + Math.random() * 0.4);

      this.state.midPrice = (this.state.currentBid + this.state.currentAsk) / 2;

      // Occasional spread widening (5% chance)
      if (Math.random() < 0.05) {
        if (Math.random() < 0.5) {
          this.state.currentAsk = this.roundToTick(this.state.currentAsk + tickSize);
        } else {
          this.state.currentBid = this.roundToTick(this.state.currentBid - tickSize);
        }
        this.state.midPrice = (this.state.currentBid + this.state.currentAsk) / 2;
      }

      // Spread normalization: if spread > 3 ticks, tighten
      const spread = this.state.currentAsk - this.state.currentBid;
      if (spread > tickSize * 3) {
        if (Math.random() < 0.5) {
          this.state.currentAsk = this.roundToTick(this.state.currentAsk - tickSize);
        } else {
          this.state.currentBid = this.roundToTick(this.state.currentBid + tickSize);
        }
        this.state.midPrice = (this.state.currentBid + this.state.currentAsk) / 2;
      }

      // Update order book (add/remove levels)
      this.adjustOrderBook(now);
    }

    // Add to history (throttled to avoid too many points)
    if (now - this.lastPriceHistoryUpdate >= this.priceHistoryInterval) {
      this.state.priceHistory.push({
        timestamp: now,
        bid: this.state.currentBid,
        ask: this.state.currentAsk,
      });
      this.lastPriceHistoryUpdate = now;

      // Limit history
      const limit = this.config.priceHistoryLimit;
      if (this.state.priceHistory.length > limit) {
        this.state.priceHistory.shift();
      }
    }
  }

  private adjustOrderBook(now: number): void {
    const { tickSize, orderBookDepth, baseLiquidity, wallProbability } = this.config;

    // Mark zones tested by price
    for (const [price, zone] of this.state.interestZones) {
      if (zone.side === 'bid' && price >= this.state.currentBid - tickSize) {
        zone.wasTestedByPrice = true;
        zone.lastActivity = now;
      }
      if (zone.side === 'ask' && price <= this.state.currentAsk + tickSize) {
        zone.wasTestedByPrice = true;
        zone.lastActivity = now;
      }
    }

    // Absorb orders crossed by price
    for (const [price, order] of this.state.bids) {
      if (price >= this.state.currentBid) {
        this.consumeOrder(order, now);
      }
    }

    for (const [price, order] of this.state.asks) {
      if (price <= this.state.currentAsk) {
        this.consumeOrder(order, now);
      }
    }

    // Dynamically create new interest zones
    this.maybeCreateNewInterestZone(now);

    // Fill near levels densely (not just interest zones)
    const nearThreshold = Math.floor(orderBookDepth * (this.config.nearBookFillPct));
    for (let i = 1; i <= nearThreshold; i++) {
      const distanceFactor = i / nearThreshold;
      const bidPrice = this.roundToTick(this.state.currentBid - i * tickSize);
      const askPrice = this.roundToTick(this.state.currentAsk + i * tickSize);

      if (!this.state.bids.has(bidPrice)) {
        const size = baseLiquidity * (0.3 + distanceFactor * 0.7) * (0.7 + Math.random() * 0.6);
        this.state.bids.set(bidPrice, this.createOrder(bidPrice, 'bid', size, now, false, distanceFactor > 0.5));
      }
      if (!this.state.asks.has(askPrice)) {
        const size = baseLiquidity * (0.3 + distanceFactor * 0.7) * (0.7 + Math.random() * 0.6);
        this.state.asks.set(askPrice, this.createOrder(askPrice, 'ask', size, now, false, distanceFactor > 0.5));
      }
    }

    // Add orders in existing interest zones (far levels)
    for (const [price, zone] of this.state.interestZones) {
      // Skip if too far
      if (zone.side === 'bid' && price < this.state.currentBid - orderBookDepth * tickSize) continue;
      if (zone.side === 'ask' && price > this.state.currentAsk + orderBookDepth * tickSize) continue;

      const orders = zone.side === 'bid' ? this.state.bids : this.state.asks;

      if (!orders.has(price)) {
        // Create a new order in this interest zone
        let size = zone.totalVolume * (0.5 + Math.random() * 0.5);
        if (zone.strength > 0.7 && Math.random() < wallProbability) size *= 3;

        const order = this.createOrder(price, zone.side, size, now, false, zone.strength > 0.5);
        orders.set(price, order);
      } else {
        // Sometimes reinforce existing order (continuation)
        if (Math.random() < 0.004 && zone.strength > 0.5) {
          const order = orders.get(price)!;
          const addSize = baseLiquidity * (0.3 + Math.random() * 0.5);
          order.size += addSize;
          order.timesReinforced++;
          order.lastVolumeAdd = now;
          order.state = 'reinforcing';
          order.stateChangeTime = now;
        }
      }
    }

    // Remove zones and orders that are too far
    const maxDistance = orderBookDepth * tickSize * 1.5;
    for (const [price, zone] of this.state.interestZones) {
      if (zone.side === 'bid' && this.state.currentBid - price > maxDistance) {
        this.state.interestZones.delete(price);
        this.state.bids.delete(price);
      }
      if (zone.side === 'ask' && price - this.state.currentAsk > maxDistance) {
        this.state.interestZones.delete(price);
        this.state.asks.delete(price);
      }
    }
  }

  private maybeCreateNewInterestZone(now: number): void {
    const { tickSize, orderBookDepth, baseLiquidity } = this.config;

    // Chance of creating a new interest zone (3% per tick for far levels)
    if (Math.random() > 0.03) return;

    const side = Math.random() < 0.5 ? 'bid' : 'ask';
    const distance = Math.floor(Math.random() * orderBookDepth) + 2;
    const price = side === 'bid'
      ? this.roundToTick(this.state.currentBid - distance * tickSize)
      : this.roundToTick(this.state.currentAsk + distance * tickSize);

    // Don't create if already exists
    if (this.state.interestZones.has(price)) return;

    const strength = 0.4 + Math.random() * 0.6;

    this.state.interestZones.set(price, {
      price,
      side,
      strength,
      totalVolume: baseLiquidity * (1 + Math.random() * strength * 3),
      orderCount: 1,
      firstSeen: now,
      lastActivity: now,
      wasTestedByPrice: false,
    });
  }

  private consumeOrder(order: PassiveOrder, now: number): void {
    order.state = 'absorbing';
    order.stateChangeTime = now;

    // Add a trace
    this.state.traces.push({
      price: order.price,
      side: order.side,
      type: 'absorbed',
      opacity: 0.6,
      timestamp: now,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRADES
  // ══════════════════════════════════════════════════════════════════════════
  private maybeGenerateTrade(now: number): void {
    const { tradeFrequency, avgTradeSize } = this.config;

    // Handle trade bursts (rapid same-direction trades)
    if (this.tradeBurstRemaining > 0) {
      this.tradeBurstRemaining--;
      this.emitTrade(now, this.tradeBurstSide, avgTradeSize);
      return;
    }

    // Trade probability based on frequency
    const prob = tradeFrequency / 20; // 20 ticks/seconde

    if (Math.random() < prob) {
      // Direction biased by momentum
      const buyProb = Math.max(0.2, Math.min(0.8, 0.5 + this.momentum * 0.3));
      const side: 'buy' | 'sell' = Math.random() < buyProb ? 'buy' : 'sell';

      // Occasional burst (10% chance: 2-3 rapid trades same direction)
      if (Math.random() < 0.10) {
        this.tradeBurstRemaining = 1 + Math.floor(Math.random() * 2); // 1-2 more after this
        this.tradeBurstSide = side;
      }

      this.emitTrade(now, side, avgTradeSize);
    }
  }

  private emitTrade(now: number, side: 'buy' | 'sell', avgTradeSize: number): void {
    const price = side === 'buy' ? this.state.currentAsk : this.state.currentBid;
    // Exponential size distribution: mostly small, occasionally large
    const rawSize = avgTradeSize * Math.min(5, -Math.log(Math.max(0.01, Math.random())));
    const size = Math.round(rawSize * 10) / 10;

    const trade: Trade = {
      id: `trade_${++this.tradeCounter}`,
      timestamp: now,
      price,
      size: Math.max(0.1, size),
      side,
      historyIndex: this.state.priceHistory.length - 1,
      opacity: 0,
      scale: 0,
    };

    this.state.trades.push(trade);

    // Update clusters
    this.updateTradeClusters();

    // Update cumulative levels
    this.updateCumulativeLevel(price, side, trade.size);
  }

  private updateCumulativeLevel(price: number, side: 'buy' | 'sell', size: number): void {
    const roundedPrice = this.roundToTick(price);

    if (!this.state.cumulativeLevels.has(roundedPrice)) {
      this.state.cumulativeLevels.set(roundedPrice, {
        price: roundedPrice,
        totalBuySize: 0,
        totalSellSize: 0,
        buyCount: 0,
        sellCount: 0,
      });
    }

    const level = this.state.cumulativeLevels.get(roundedPrice)!;

    if (side === 'buy') {
      level.totalBuySize += size;
      level.buyCount++;
    } else {
      level.totalSellSize += size;
      level.sellCount++;
    }
  }

  private updateTrades(now: number): void {
    const { tradeLifetimeMs } = this.config;

    this.state.trades = this.state.trades.filter(trade => {
      const age = now - trade.timestamp;

      // Appear animation (150ms)
      if (age < 150) {
        trade.opacity = age / 150;
        trade.scale = 0.5 + (age / 150) * 0.5;
      }
      // Stable phase
      else if (age < tradeLifetimeMs - 500) {
        trade.opacity = 1;
        trade.scale = 1;
      }
      // Fade out (500ms)
      else {
        const fadeAge = age - (tradeLifetimeMs - 500);
        trade.opacity = Math.max(0, 1 - fadeAge / 500);
        trade.scale = 1;
      }

      return age < tradeLifetimeMs;
    });

    // Update clusters after filtering
    this.updateTradeClusters();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRADE CLUSTERS
  // ══════════════════════════════════════════════════════════════════════════
  private updateTradeClusters(): void {
    const clusterMap = new Map<string, TradeCluster>();

    for (const trade of this.state.trades) {
      const key = `${trade.price}_${trade.side}`;

      if (!clusterMap.has(key)) {
        clusterMap.set(key, {
          price: trade.price,
          side: trade.side,
          totalSize: 0,
          count: 0,
          trades: [],
          avgHistoryIndex: 0,
          opacity: 0,
          scale: 0,
        });
      }

      const cluster = clusterMap.get(key)!;
      cluster.trades.push(trade);
      cluster.totalSize += trade.size;
      cluster.count++;
    }

    // Calculate averages and animations
    this.state.tradeClusters = Array.from(clusterMap.values()).map(cluster => {
      // Average position on timeline
      cluster.avgHistoryIndex = cluster.trades.reduce((sum, t) => sum + t.historyIndex, 0) / cluster.count;

      // Take max opacity and scale from cluster trades
      cluster.opacity = Math.max(...cluster.trades.map(t => t.opacity));
      cluster.scale = Math.max(...cluster.trades.map(t => t.scale));

      return cluster;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PASSIVE ORDERS
  // ══════════════════════════════════════════════════════════════════════════
  private updatePassiveOrders(now: number, dt: number): void {
    const { orderFadeInMs, orderFadeOutMs, baseLiquidity } = this.config;

    const updateOrder = (order: PassiveOrder) => {
      const stateAge = now - order.stateChangeTime;
      const orderAge = now - order.firstSeen;

      switch (order.state) {
        case 'appearing':
          order.opacity = Math.min(1, stateAge / orderFadeInMs);
          order.displaySize = order.size * order.opacity;
          if (stateAge >= orderFadeInMs) {
            order.state = 'stable';
            order.stateChangeTime = now;
          }
          break;

        case 'reinforcing':
          // Flash animation when volume is added
          const reinforceProgress = stateAge / 300;
          order.opacity = 1 + Math.sin(reinforceProgress * Math.PI) * 0.3;
          order.displaySize = order.size;
          if (stateAge >= 300) {
            order.state = 'stable';
            order.stateChangeTime = now;
          }
          break;

        case 'stable':
          order.opacity = 1;
          order.displaySize = order.size;

          // Non-significant orders can fade due to disinterest
          if (!order.isSignificant) {
            // Older = higher chance of fading
            const fadeChance = 0.0002 + (orderAge / 60000) * 0.001;
            if (Math.random() < fadeChance) {
              order.state = 'fading';
              order.stateChangeTime = now;
            }
          } else {
            // Significant orders fade less often
            if (Math.random() < 0.0001) {
              order.state = 'fading';
              order.stateChangeTime = now;
            }
          }
          break;

        case 'absorbing':
          order.opacity = Math.max(0, 1 - stateAge / (orderFadeOutMs * 0.7));
          order.displaySize = order.size * order.opacity;
          order.wasPartiallyAbsorbed = true;

          // Chance of continuation (new volume arrives during absorption)
          if (order.isSignificant && Math.random() < 0.01 && stateAge < orderFadeOutMs * 0.3) {
            order.state = 'absorbed_continuing';
            order.stateChangeTime = now;
            order.size = baseLiquidity * (0.5 + Math.random());
            order.timesReinforced++;
          }

          if (order.opacity <= 0) {
            order.state = 'absorbed';
          }
          break;

        case 'absorbed_continuing':
          // Order was absorbed but new volume arrives
          const continueProgress = stateAge / 500;
          if (continueProgress < 1) {
            order.opacity = 0.3 + continueProgress * 0.7;
            order.displaySize = order.size * order.opacity;
          } else {
            order.state = 'stable';
            order.stateChangeTime = now;
            order.opacity = 1;
          }
          break;

        case 'fading':
          // Slow fade due to disinterest (no trades)
          order.opacity = Math.max(0, 1 - stateAge / (orderFadeOutMs * 2));
          order.displaySize = order.size * order.opacity;
          if (order.opacity <= 0) {
            order.state = 'gone';
          }
          break;
      }

      order.intensity = Math.min(1, order.displaySize / (baseLiquidity * 3));
    };

    // Update all orders
    for (const order of this.state.bids.values()) {
      updateOrder(order);
    }
    for (const order of this.state.asks.values()) {
      updateOrder(order);
    }

    // Remove gone/absorbed orders
    for (const [price, order] of this.state.bids) {
      if (order.state === 'gone' || order.state === 'absorbed') {
        this.state.bids.delete(price);
      }
    }
    for (const [price, order] of this.state.asks) {
      if (order.state === 'gone' || order.state === 'absorbed') {
        this.state.asks.delete(price);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRACES
  // ══════════════════════════════════════════════════════════════════════════
  private updateTraces(now: number): void {
    this.state.traces = this.state.traces.filter(trace => {
      const age = now - trace.timestamp;
      trace.opacity = Math.max(0, 0.6 - age / 2000);
      return trace.opacity > 0.01;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HEATMAP HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  private recordHeatmapSnapshot(now: number): void {
    const timeIndex = this.state.priceHistory.length - 1;
    const maxHistory = this.config.heatmapHistoryLimit;

    // Record current state of each price level
    for (const [price, order] of this.state.bids) {
      if (order.opacity > 0.1) {
        const key = `${price.toFixed(2)}_${timeIndex}`;
        this.state.heatmapHistory.set(key, {
          price,
          timeIndex,
          bidIntensity: order.intensity * order.opacity,
          askIntensity: 0,
          wasAbsorbed: order.state === 'absorbing' || order.state === 'absorbed',
          timestamp: now,
        });
      }
    }

    for (const [price, order] of this.state.asks) {
      if (order.opacity > 0.1) {
        const key = `${price.toFixed(2)}_${timeIndex}`;
        const existing = this.state.heatmapHistory.get(key);
        if (existing) {
          existing.askIntensity = order.intensity * order.opacity;
          if (order.state === 'absorbing' || order.state === 'absorbed') {
            existing.wasAbsorbed = true;
          }
        } else {
          this.state.heatmapHistory.set(key, {
            price,
            timeIndex,
            bidIntensity: 0,
            askIntensity: order.intensity * order.opacity,
            wasAbsorbed: order.state === 'absorbing' || order.state === 'absorbed',
            timestamp: now,
          });
        }
      }
    }

    // Clean up old entries
    const minTimeIndex = timeIndex - maxHistory;
    for (const [key, cell] of this.state.heatmapHistory) {
      if (cell.timeIndex < minTimeIndex) {
        this.state.heatmapHistory.delete(key);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IMBALANCE DETECTION - Detect bid/ask imbalances at price levels
  // ══════════════════════════════════════════════════════════════════════════
  private calculateImbalances(now: number): void {
    const { tickSize } = this.config;
    const imbalances: ImbalanceLevel[] = [];
    const IMBALANCE_THRESHOLD = 2.0; // 2x volume difference = imbalance

    // Check each price level for imbalance
    const allPrices = new Set([
      ...this.state.bids.keys(),
      ...this.state.asks.keys(),
    ]);

    for (const price of allPrices) {
      const bid = this.state.bids.get(price);
      const ask = this.state.asks.get(price);

      // Get volumes from cumulative levels for better accuracy
      const cumLevel = this.state.cumulativeLevels.get(price);
      const bidVol = cumLevel?.totalBuySize || bid?.displaySize || 0;
      const askVol = cumLevel?.totalSellSize || ask?.displaySize || 0;

      if (bidVol < 1 && askVol < 1) continue;

      const ratio = bidVol > askVol
        ? (askVol > 0 ? bidVol / askVol : bidVol)
        : (bidVol > 0 ? askVol / bidVol : askVol);

      if (ratio >= IMBALANCE_THRESHOLD) {
        const type = bidVol > askVol ? 'bid_imbalance' : 'ask_imbalance';
        imbalances.push({
          price,
          type,
          ratio,
          strength: Math.min(1, (ratio - IMBALANCE_THRESHOLD) / 3),
          bidVolume: bidVol,
          askVolume: askVol,
          timestamp: now,
          consecutiveCount: 1,
        });
      }
    }

    // Detect stacked imbalances (3+ consecutive same-side imbalances)
    imbalances.sort((a, b) => b.price - a.price);
    let consecutiveCount = 1;
    let lastType: string | null = null;

    for (let i = 0; i < imbalances.length; i++) {
      const imb = imbalances[i];
      if (imb.type === lastType) {
        consecutiveCount++;
        imb.consecutiveCount = consecutiveCount;
        if (consecutiveCount >= 3) {
          imb.type = 'stacked_imbalance';
          // Also mark previous ones as stacked
          for (let j = i - 1; j >= 0 && j >= i - consecutiveCount + 1; j--) {
            if (imbalances[j].type !== 'stacked_imbalance') {
              imbalances[j].type = 'stacked_imbalance';
            }
            imbalances[j].consecutiveCount = consecutiveCount;
          }
        }
      } else {
        consecutiveCount = 1;
        lastType = imb.type;
      }
    }

    this.state.imbalances = imbalances;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ABSORPTION EVENTS - Track large orders being consumed
  // ══════════════════════════════════════════════════════════════════════════
  private absorptionCounter = 0;

  private updateAbsorptionEvents(now: number): void {
    const { baseLiquidity } = this.config;
    const SIGNIFICANT_THRESHOLD = baseLiquidity * 2;

    // Check for new absorption events
    for (const order of [...this.state.bids.values(), ...this.state.asks.values()]) {
      if (order.state === 'absorbing' && order.wasPartiallyAbsorbed) {
        // Check if we already have this event
        const existingEvent = this.state.absorptionEvents.find(
          e => e.price === order.price && e.side === order.side && now - e.timestamp < 2000
        );

        if (!existingEvent && order.initialSize >= SIGNIFICANT_THRESHOLD) {
          const absorbedAmount = order.initialSize - order.displaySize;
          this.state.absorptionEvents.push({
            id: `abs_${++this.absorptionCounter}`,
            price: order.price,
            side: order.side,
            absorbedVolume: absorbedAmount,
            aggressorVolume: absorbedAmount * (0.8 + Math.random() * 0.4),
            timestamp: now,
            duration: now - order.stateChangeTime,
            isSignificant: order.initialSize >= SIGNIFICANT_THRESHOLD * 2,
            opacity: 1,
          });
        }
      }
    }

    // Fade out old absorption events
    this.state.absorptionEvents = this.state.absorptionEvents.filter(event => {
      const age = now - event.timestamp;
      if (age > 5000) return false;
      event.opacity = Math.max(0, 1 - age / 5000);
      return event.opacity > 0.01;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ICEBERG DETECTION - Detect hidden orders that refill
  // ══════════════════════════════════════════════════════════════════════════
  private detectIcebergs(now: number): void {
    const { baseLiquidity } = this.config;

    // Check orders that have been reinforced multiple times at the same price
    for (const order of [...this.state.bids.values(), ...this.state.asks.values()]) {
      if (order.timesReinforced >= 2) {
        let iceberg = this.state.icebergs.get(order.price);

        if (!iceberg) {
          iceberg = {
            price: order.price,
            side: order.side,
            visibleSize: order.displaySize,
            estimatedHiddenSize: order.initialSize * order.timesReinforced,
            refillCount: order.timesReinforced,
            firstSeen: order.firstSeen,
            lastRefill: order.lastVolumeAdd,
            confidence: Math.min(0.95, 0.3 + order.timesReinforced * 0.2),
          };
          this.state.icebergs.set(order.price, iceberg);
        } else {
          // Update existing iceberg
          iceberg.visibleSize = order.displaySize;
          iceberg.refillCount = order.timesReinforced;
          iceberg.lastRefill = order.lastVolumeAdd;
          iceberg.estimatedHiddenSize += order.displaySize * 0.5;
          iceberg.confidence = Math.min(0.95, iceberg.confidence + 0.05);
        }
      }
    }

    // Remove stale icebergs (orders that no longer exist or haven't refilled recently)
    for (const [price, iceberg] of this.state.icebergs) {
      const order = iceberg.side === 'bid'
        ? this.state.bids.get(price)
        : this.state.asks.get(price);

      if (!order || now - iceberg.lastRefill > 10000) {
        // Keep for a bit with decreasing confidence
        iceberg.confidence -= 0.01;
        if (iceberg.confidence <= 0) {
          this.state.icebergs.delete(price);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VWAP - Volume Weighted Average Price
  // ══════════════════════════════════════════════════════════════════════════
  private updateVWAP(now: number): void {
    // Update VWAP with recent trades
    for (const trade of this.state.trades) {
      // Only count trades from the last tick
      if (now - trade.timestamp < 100) {
        this.state.vwap.cumulativeVolume += trade.size;
        this.state.vwap.cumulativePV += trade.price * trade.size;
      }
    }

    if (this.state.vwap.cumulativeVolume > 0) {
      this.state.vwap.vwap = this.state.vwap.cumulativePV / this.state.vwap.cumulativeVolume;

      // Calculate standard deviation for bands (simplified)
      let sumSqDiff = 0;
      let count = 0;
      for (const trade of this.state.trades) {
        const diff = trade.price - this.state.vwap.vwap;
        sumSqDiff += diff * diff * trade.size;
        count += trade.size;
      }

      const stdDev = count > 0 ? Math.sqrt(sumSqDiff / count) : this.config.tickSize * 5;
      this.state.vwap.upperBand = this.state.vwap.vwap + stdDev;
      this.state.vwap.lowerBand = this.state.vwap.vwap - stdDev;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUMULATIVE DELTA - Track buy vs sell volume over time
  // ══════════════════════════════════════════════════════════════════════════
  private updateCumulativeDelta(now: number): void {
    const cd = this.state.cumulativeDelta;

    // Calculate delta from recent trades (last 100ms)
    let buyVol = 0;
    let sellVol = 0;

    for (const trade of this.state.trades) {
      if (now - trade.timestamp < 100) {
        if (trade.side === 'buy') {
          buyVol += trade.size;
        } else {
          sellVol += trade.size;
        }
      }
    }

    // Update cumulative delta
    const tickDelta = buyVol - sellVol;
    if (tickDelta !== 0) {
      cd.currentDelta += tickDelta;

      // Add data point (aggregate every ~200ms to keep array manageable)
      const shouldAddPoint = cd.points.length === 0 ||
        now - cd.points[cd.points.length - 1].timestamp >= 200;

      if (shouldAddPoint) {
        cd.points.push({
          timestamp: now,
          delta: cd.currentDelta,
          buyVolume: buyVol,
          sellVolume: sellVol,
          price: this.state.midPrice,
        });

        // Limit points to ~5 minutes of data
        const maxPoints = 1500;
        if (cd.points.length > maxPoints) {
          cd.points = cd.points.slice(-maxPoints);
        }
      } else if (cd.points.length > 0) {
        // Update last point
        const lastPoint = cd.points[cd.points.length - 1];
        lastPoint.delta = cd.currentDelta;
        lastPoint.buyVolume += buyVol;
        lastPoint.sellVolume += sellVol;
        lastPoint.price = this.state.midPrice;
      }

      // Update session extremes
      cd.sessionHigh = Math.max(cd.sessionHigh, cd.currentDelta);
      cd.sessionLow = Math.min(cd.sessionLow, cd.currentDelta);
      cd.maxAbsDelta = Math.max(Math.abs(cd.sessionHigh), Math.abs(cd.sessionLow), 1);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAPE VELOCITY - Track trades per second and volume per second
  // ══════════════════════════════════════════════════════════════════════════
  private updateTapeVelocity(now: number): void {
    const tv = this.state.tapeVelocity;
    const windowMs = 1000; // 1 second window

    // Count trades and volume in the last second
    let tradeCount = 0;
    let totalVolume = 0;
    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of this.state.trades) {
      if (now - trade.timestamp <= windowMs) {
        tradeCount++;
        totalVolume += trade.size;
        if (trade.side === 'buy') {
          buyVolume += trade.size;
        } else {
          sellVolume += trade.size;
        }
      }
    }

    tv.currentTPS = tradeCount;
    tv.currentVPS = totalVolume;

    // Add data point every 500ms
    const shouldAddPoint = tv.points.length === 0 ||
      now - tv.points[tv.points.length - 1].timestamp >= 500;

    if (shouldAddPoint) {
      tv.points.push({
        timestamp: now,
        tradesPerSecond: tradeCount,
        volumePerSecond: totalVolume,
        buyVolume,
        sellVolume,
      });

      // Limit points to ~2 minutes of data
      const maxPoints = 240;
      if (tv.points.length > maxPoints) {
        tv.points = tv.points.slice(-maxPoints);
      }
    }

    // Update max TPS
    tv.maxTPS = Math.max(tv.maxTPS, tradeCount);

    // Calculate average TPS
    if (tv.points.length > 0) {
      const sum = tv.points.reduce((acc, p) => acc + p.tradesPerSecond, 0);
      tv.avgTPS = sum / tv.points.length;
    }

    // Determine acceleration level
    if (tv.avgTPS > 0) {
      const ratio = tv.currentTPS / tv.avgTPS;
      tv.isAccelerating = ratio > 1.5;

      if (ratio <= 1.2) {
        tv.accelerationLevel = 'normal';
      } else if (ratio <= 2.0) {
        tv.accelerationLevel = 'elevated';
      } else if (ratio <= 3.0) {
        tv.accelerationLevel = 'high';
      } else {
        tv.accelerationLevel = 'extreme';
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LARGE TRADE ALERTS - Detect and track significant trades
  // ══════════════════════════════════════════════════════════════════════════
  private largeTradeCounter = 0;

  private updateLargeTradeAlerts(now: number): void {
    const lta = this.state.largeTradeAlerts;

    // Update average trade size from all trades
    if (this.state.trades.length > 0) {
      const totalSize = this.state.trades.reduce((sum, t) => sum + t.size, 0);
      lta.avgTradeSize = totalSize / this.state.trades.length;

      // Update dynamic thresholds
      lta.largeThreshold = lta.avgTradeSize * 2;
      lta.hugeThreshold = lta.avgTradeSize * 5;
      lta.massiveThreshold = lta.avgTradeSize * 10;
    }

    // Check for new large trades (trades from last 100ms)
    for (const trade of this.state.trades) {
      if (now - trade.timestamp > 100) continue;

      // Check if this trade is large enough
      if (trade.size >= lta.largeThreshold) {
        // Check if we already have this trade
        const exists = lta.trades.some(lt =>
          lt.timestamp === trade.timestamp &&
          lt.price === trade.price &&
          lt.size === trade.size
        );

        if (!exists) {
          // Determine level
          let level: 'large' | 'huge' | 'massive' = 'large';
          if (trade.size >= lta.massiveThreshold) {
            level = 'massive';
          } else if (trade.size >= lta.hugeThreshold) {
            level = 'huge';
          }

          const largeTrade: LargeTrade = {
            id: `lt_${++this.largeTradeCounter}`,
            timestamp: trade.timestamp,
            price: trade.price,
            size: trade.size,
            side: trade.side,
            level,
            opacity: 1,
            pulsePhase: 0,
            historyIndex: trade.historyIndex,
          };

          lta.trades.push(largeTrade);
          lta.totalLargeTrades++;
          lta.maxTradeSize = Math.max(lta.maxTradeSize, trade.size);
        }
      }
    }

    // Update large trade animations and cleanup old ones
    lta.trades = lta.trades.filter(lt => {
      const age = now - lt.timestamp;

      // Large trades persist for 30 seconds
      if (age > 30000) return false;

      // Pulse animation for first 3 seconds
      if (age < 3000) {
        lt.pulsePhase = (age / 300) % 1;
        lt.opacity = 1;
      } else {
        // Gradual fade after 3 seconds
        lt.pulsePhase = 0;
        lt.opacity = Math.max(0.3, 1 - (age - 3000) / 27000);
      }

      // Update history index for positioning
      lt.historyIndex = Math.max(0, this.state.priceHistory.length - 1 - Math.floor(age / 100));

      return true;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRESSURE METER - Buy/Sell pressure indicator
  // ══════════════════════════════════════════════════════════════════════════
  private updatePressureMeter(now: number): void {
    const pm = this.state.pressureMeter;
    const shortWindow = 5000;   // 5 seconds
    const mediumWindow = 30000; // 30 seconds

    // Calculate volumes in time windows
    let shortBuy = 0, shortSell = 0;
    let mediumBuy = 0, mediumSell = 0;

    for (const trade of this.state.trades) {
      const age = now - trade.timestamp;

      if (age <= shortWindow) {
        if (trade.side === 'buy') shortBuy += trade.size;
        else shortSell += trade.size;
      }

      if (age <= mediumWindow) {
        if (trade.side === 'buy') mediumBuy += trade.size;
        else mediumSell += trade.size;
      }
    }

    pm.shortTermBuyVol = shortBuy;
    pm.shortTermSellVol = shortSell;
    pm.mediumTermBuyVol = mediumBuy;
    pm.mediumTermSellVol = mediumSell;

    // Calculate current ratio (-1 to 1)
    const totalShort = shortBuy + shortSell;
    if (totalShort > 0) {
      pm.currentRatio = (shortBuy - shortSell) / totalShort;
    } else {
      pm.currentRatio = 0;
    }

    // EMA smoothing (alpha = 0.1 for smooth transitions)
    const alpha = 0.1;
    pm.smoothedRatio = pm.smoothedRatio * (1 - alpha) + pm.currentRatio * alpha;

    // Determine momentum
    const ratio = pm.smoothedRatio;
    if (ratio > 0.5) {
      pm.momentum = 'strong_buy';
      pm.momentumStrength = Math.min(1, (ratio - 0.5) * 2);
    } else if (ratio > 0.15) {
      pm.momentum = 'buy';
      pm.momentumStrength = (ratio - 0.15) / 0.35;
    } else if (ratio < -0.5) {
      pm.momentum = 'strong_sell';
      pm.momentumStrength = Math.min(1, (-ratio - 0.5) * 2);
    } else if (ratio < -0.15) {
      pm.momentum = 'sell';
      pm.momentumStrength = (-ratio - 0.15) / 0.35;
    } else {
      pm.momentum = 'neutral';
      pm.momentumStrength = 0;
    }

    // Add data point every 200ms
    const shouldAddPoint = pm.points.length === 0 ||
      now - pm.points[pm.points.length - 1].timestamp >= 200;

    if (shouldAddPoint) {
      const buyPressure = totalShort > 0 ? shortBuy / totalShort : 0.5;
      const sellPressure = totalShort > 0 ? shortSell / totalShort : 0.5;

      pm.points.push({
        timestamp: now,
        buyPressure,
        sellPressure,
        ratio: pm.currentRatio,
      });

      // Limit points
      const maxPoints = 300;
      if (pm.points.length > maxPoints) {
        pm.points = pm.points.slice(-maxPoints);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESSION STATS - Aggregate session statistics
  // ══════════════════════════════════════════════════════════════════════════
  private updateSessionStats(now: number): void {
    const ss = this.state.sessionStats;
    const { midPrice, cumulativeLevels, trades } = this.state;

    // Update high/low
    ss.sessionHigh = Math.max(ss.sessionHigh, midPrice);
    ss.sessionLow = Math.min(ss.sessionLow, midPrice);

    // Calculate totals from cumulative levels
    let totalBuy = 0;
    let totalSell = 0;
    let maxVolumePrice = midPrice;
    let maxVolume = 0;

    // Volume by price for POC/VAH/VAL calculation
    const volumeByPrice: { price: number; volume: number }[] = [];

    for (const [price, level] of cumulativeLevels) {
      const levelVolume = level.totalBuySize + level.totalSellSize;
      totalBuy += level.totalBuySize;
      totalSell += level.totalSellSize;

      volumeByPrice.push({ price, volume: levelVolume });

      if (levelVolume > maxVolume) {
        maxVolume = levelVolume;
        maxVolumePrice = price;
      }
    }

    ss.totalBuyVolume = totalBuy;
    ss.totalSellVolume = totalSell;
    ss.totalVolume = totalBuy + totalSell;
    ss.delta = totalBuy - totalSell;
    ss.deltaPercent = ss.totalVolume > 0 ? (ss.delta / ss.totalVolume) * 100 : 0;
    ss.poc = maxVolumePrice;

    // Calculate Value Area (70% of volume)
    if (volumeByPrice.length > 0) {
      volumeByPrice.sort((a, b) => b.volume - a.volume);
      const targetVolume = ss.totalVolume * 0.7;
      let accumulatedVolume = 0;
      const valueAreaPrices: number[] = [];

      for (const { price, volume } of volumeByPrice) {
        if (accumulatedVolume >= targetVolume) break;
        valueAreaPrices.push(price);
        accumulatedVolume += volume;
      }

      if (valueAreaPrices.length > 0) {
        ss.vah = Math.max(...valueAreaPrices);
        ss.val = Math.min(...valueAreaPrices);
      }
    }

    // Trade stats
    ss.totalTrades = trades.length;
    if (trades.length > 0) {
      const totalSize = trades.reduce((sum, t) => sum + t.size, 0);
      ss.avgTradeSize = totalSize / trades.length;
      ss.largestTrade = Math.max(...trades.map(t => t.size));
    }

    ss.lastUpdate = now;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════════════════════════
  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  setOnUpdate(callback: (state: MarketState) => void): void {
    this.onUpdate = callback;
  }

  getState(): MarketState {
    return this.state;
  }

  destroy(): void {
    this.stop();
    this.onUpdate = null;
  }
}
