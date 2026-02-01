/**
 * ORDERFLOW ENGINE - Moteur d'agrégation Bid x Ask par niveau de prix
 *
 * Architecture style ATAS / NinjaTrader :
 *
 *   Trade (price, qty, side)
 *          │
 *          ▼
 *   ┌─────────────────────────────────────┐
 *   │     ORDERFLOW ENGINE                │
 *   │  ┌─────────────────────────────┐    │
 *   │  │  Price Level Map            │    │
 *   │  │  99500: { bid: 1.2, ask: 0.8 }   │
 *   │  │  99510: { bid: 0.5, ask: 2.1 }   │
 *   │  │  99520: { bid: 0.3, ask: 1.5 }   │
 *   │  └─────────────────────────────┘    │
 *   │                                     │
 *   │  POC, Delta, Imbalances             │
 *   └─────────────────────────────────────┘
 *          │
 *          ▼
 *   FootprintCandle (ready for rendering)
 */

import type { Tick, TimeframeSeconds } from '../live/HierarchicalAggregator';

// ============ TYPES ============

/** Niveau de prix avec volumes Bid/Ask */
export interface PriceLevel {
  price: number;
  bidVolume: number;      // Sell market orders (hit the bid)
  askVolume: number;      // Buy market orders (hit the ask)
  bidTrades: number;      // Nombre de trades bid
  askTrades: number;      // Nombre de trades ask
  delta: number;          // askVolume - bidVolume
  totalVolume: number;    // bidVolume + askVolume
  imbalanceBuy: boolean;  // Ask >> Bid (buyers aggressive)
  imbalanceSell: boolean; // Bid >> Ask (sellers aggressive)
}

/** Bougie Footprint complète */
export interface FootprintCandle {
  time: number;           // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;

  // Footprint data
  levels: Map<number, PriceLevel>;  // price -> PriceLevel

  // Aggregates
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;

  // Key levels
  poc: number;            // Point of Control (highest volume price)
  vah: number;            // Value Area High
  val: number;            // Value Area Low

  // Status
  isClosed: boolean;
}

/** Configuration du moteur */
export interface OrderflowConfig {
  tickSize: number;           // Taille du tick pour regroupement (ex: 10 pour BTC)
  imbalanceRatio: number;     // Ratio pour détecter imbalances (ex: 3.0 = 300%)
  valueAreaPercent: number;   // % pour Value Area (ex: 0.70 = 70%)
  maxLevels: number;          // Max niveaux par bougie (performance)
}

const DEFAULT_CONFIG: OrderflowConfig = {
  tickSize: 10,
  imbalanceRatio: 3.0,
  valueAreaPercent: 0.70,
  maxLevels: 200,
};

// ============ ORDERFLOW ENGINE ============

type FootprintEventType = 'footprint:update' | 'footprint:close';
type FootprintCallback = (candle: FootprintCandle, tf: TimeframeSeconds) => void;

/**
 * Moteur d'agrégation Orderflow
 */
export class OrderflowEngine {
  private config: OrderflowConfig;
  private candles: Map<TimeframeSeconds, Map<number, FootprintCandle>> = new Map();
  private currentCandles: Map<TimeframeSeconds, FootprintCandle | null> = new Map();
  private listeners: Map<FootprintEventType, Set<FootprintCallback>> = new Map();

  // Timeframes supportés
  private timeframes: TimeframeSeconds[] = [15, 30, 60, 180, 300, 900, 1800, 3600];

  constructor(config: Partial<OrderflowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize maps
    this.timeframes.forEach(tf => {
      this.candles.set(tf, new Map());
      this.currentCandles.set(tf, null);
    });

    this.listeners.set('footprint:update', new Set());
    this.listeners.set('footprint:close', new Set());
  }

  /**
   * Configure le tick size dynamiquement
   */
  setTickSize(tickSize: number): void {
    this.config.tickSize = tickSize;
  }

  /**
   * Configure le ratio d'imbalance
   */
  setImbalanceRatio(ratio: number): void {
    this.config.imbalanceRatio = ratio;
  }

  /**
   * Traite un tick et met à jour tous les timeframes
   */
  processTick(tick: Tick): void {
    this.timeframes.forEach(tf => {
      this.processTickForTimeframe(tick, tf);
    });
  }

  /**
   * Traite un tick pour un timeframe spécifique
   */
  private processTickForTimeframe(tick: Tick, tf: TimeframeSeconds): void {
    const tfMs = tf * 1000;
    const slotStart = Math.floor(tick.timestamp / tfMs) * tfMs;
    const slotTime = Math.floor(slotStart / 1000);

    let candle = this.currentCandles.get(tf);

    // Nouvelle bougie nécessaire ?
    if (!candle || candle.time !== slotTime) {
      // Ferme l'ancienne bougie
      if (candle) {
        candle.isClosed = true;
        this.finalizeCandleMetrics(candle);

        // Stocke dans l'historique
        const history = this.candles.get(tf)!;
        history.set(candle.time, candle);

        // Limite la taille de l'historique
        if (history.size > 500) {
          const oldest = Array.from(history.keys())[0];
          history.delete(oldest);
        }

        this.emit('footprint:close', candle, tf);
      }

      // Crée nouvelle bougie
      candle = this.createNewCandle(slotTime, tick.price);
      this.currentCandles.set(tf, candle);
    }

    // Met à jour la bougie avec le tick
    this.updateCandleWithTick(candle, tick);

    // Émet l'update
    this.emit('footprint:update', candle, tf);
  }

  /**
   * Crée une nouvelle bougie footprint vide
   */
  private createNewCandle(time: number, price: number): FootprintCandle {
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

  /**
   * Met à jour une bougie avec un nouveau tick
   */
  private updateCandleWithTick(candle: FootprintCandle, tick: Tick): void {
    const { tickSize, imbalanceRatio } = this.config;

    // Arrondit le prix au tick size
    const priceLevel = Math.round(tick.price / tickSize) * tickSize;

    // OHLC
    candle.high = Math.max(candle.high, tick.price);
    candle.low = Math.min(candle.low, tick.price);
    candle.close = tick.price;

    // Récupère ou crée le niveau de prix
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

    // isBuyerMaker = true signifie que l'acheteur était le maker
    // Donc le vendeur a "hit the bid" = SELL market order
    if (tick.isBuyerMaker) {
      // Sell market order (hit bid)
      level.bidVolume += tick.quantity;
      level.bidTrades++;
      candle.totalSellVolume += tick.quantity;
    } else {
      // Buy market order (hit ask)
      level.askVolume += tick.quantity;
      level.askTrades++;
      candle.totalBuyVolume += tick.quantity;
    }

    // Met à jour les métriques du niveau
    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Détecte les imbalances (diagonal comparison ATAS-style)
    // Buy imbalance: askVolume at this level >> bidVolume at level below
    // Sell imbalance: bidVolume at this level >> askVolume at level above
    const levelBelow = candle.levels.get(priceLevel - tickSize);
    const levelAbove = candle.levels.get(priceLevel + tickSize);

    level.imbalanceBuy = levelBelow
      ? level.askVolume > 0 && levelBelow.bidVolume > 0 &&
        (level.askVolume / levelBelow.bidVolume) >= imbalanceRatio
      : false;

    level.imbalanceSell = levelAbove
      ? level.bidVolume > 0 && levelAbove.askVolume > 0 &&
        (level.bidVolume / levelAbove.askVolume) >= imbalanceRatio
      : false;

    // Met à jour les totaux de la bougie
    candle.totalVolume += tick.quantity;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Recalcule POC (niveau avec le plus de volume)
    this.updatePOC(candle);
  }

  /**
   * Met à jour le Point of Control
   */
  private updatePOC(candle: FootprintCandle): void {
    let maxVolume = 0;
    let pocPrice = candle.close;

    candle.levels.forEach((level, price) => {
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
    });

    candle.poc = pocPrice;
  }

  /**
   * Finalise les métriques d'une bougie (VAH, VAL, etc.)
   */
  private finalizeCandleMetrics(candle: FootprintCandle): void {
    const { valueAreaPercent } = this.config;

    // Trie les niveaux par volume décroissant
    const sortedLevels = Array.from(candle.levels.values())
      .sort((a, b) => b.totalVolume - a.totalVolume);

    if (sortedLevels.length === 0) return;

    // Calcule Value Area (70% du volume autour du POC)
    const targetVolume = candle.totalVolume * valueAreaPercent;
    let accumulatedVolume = 0;
    const valueAreaLevels: number[] = [];

    for (const level of sortedLevels) {
      valueAreaLevels.push(level.price);
      accumulatedVolume += level.totalVolume;
      if (accumulatedVolume >= targetVolume) break;
    }

    if (valueAreaLevels.length > 0) {
      candle.vah = Math.max(...valueAreaLevels);
      candle.val = Math.min(...valueAreaLevels);
    }
  }

  // ============ API PUBLIQUE ============

  /**
   * Récupère la bougie courante d'un timeframe
   */
  getCurrentCandle(tf: TimeframeSeconds): FootprintCandle | null {
    return this.currentCandles.get(tf) || null;
  }

  /**
   * Récupère l'historique des bougies
   */
  getHistory(tf: TimeframeSeconds, limit: number = 100): FootprintCandle[] {
    const history = this.candles.get(tf);
    if (!history) return [];

    const candles = Array.from(history.values())
      .sort((a, b) => a.time - b.time);

    return candles.slice(-limit);
  }

  /**
   * Récupère toutes les bougies (historique + courante)
   */
  getAllCandles(tf: TimeframeSeconds, limit: number = 100): FootprintCandle[] {
    const history = this.getHistory(tf, limit - 1);
    const current = this.getCurrentCandle(tf);

    if (current) {
      history.push(current);
    }

    return history;
  }

  /**
   * S'abonne aux événements
   */
  on(event: FootprintEventType, callback: FootprintCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  /**
   * Émet un événement
   */
  private emit(event: FootprintEventType, candle: FootprintCandle, tf: TimeframeSeconds): void {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(candle, tf); } catch (e) { console.error(e); }
    });
  }

  /**
   * Reset toutes les données
   */
  reset(): void {
    this.timeframes.forEach(tf => {
      this.candles.get(tf)?.clear();
      this.currentCandles.set(tf, null);
    });
  }

  /**
   * Récupère la configuration actuelle
   */
  getConfig(): OrderflowConfig {
    return { ...this.config };
  }
}

// ============ SINGLETON ============

let instance: OrderflowEngine | null = null;

export function getOrderflowEngine(): OrderflowEngine {
  if (!instance) {
    instance = new OrderflowEngine();
  }
  return instance;
}

export function resetOrderflowEngine(): void {
  instance?.reset();
}

export function configureOrderflow(config: Partial<OrderflowConfig>): void {
  if (!instance) {
    instance = new OrderflowEngine(config);
  } else {
    if (config.tickSize) instance.setTickSize(config.tickSize);
    if (config.imbalanceRatio) instance.setImbalanceRatio(config.imbalanceRatio);
  }
}
