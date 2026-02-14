/**
 * FOOTPRINT AGGREGATOR - Professional ENGINE
 *
 * Agrégation tick-by-tick professionnelle
 *
 * RÈGLES FONDAMENTALES:
 * 1. Chaque trade = 1 classification (Bid OU Ask)
 * 2. Classification basée sur l'aggressor side
 * 3. Prix TOUJOURS aligné au tick exact
 * 4. Delta = Ask - Bid (immuable)
 * 5. Axe central = Delta 0 (fixe)
 */

import {
  getContractSpec,
  alignToTick,
  type CMEContractSpec,
} from './CMEContractSpecs';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - DONNÉES TICK-BY-TICK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trade individuel CME
 * OBLIGATOIRE: Toutes ces données doivent venir du feed
 */
export interface CMETrade {
  timestamp: number;        // Unix timestamp MILLISECONDS
  price: number;            // Prix EXACT (sera aligné au tick)
  size: number;             // Volume en contrats
  aggressorSide: 'BUY' | 'SELL' | 'UNKNOWN';  // Côté agresseur

  // Optionnel mais recommandé
  tradeId?: string;         // ID unique du trade
  exchangeTimestamp?: number;  // Timestamp exchange (plus précis)

  // Pour classification avancée
  bidPrice?: number;        // Best Bid au moment du trade
  askPrice?: number;        // Best Ask au moment du trade
}

/**
 * Niveau de prix dans le footprint
 * = 1 LIGNE dans le footprint
 */
export interface FootprintLevel {
  price: number;            // Prix aligné au tick

  // Volumes par côté
  bidVolume: number;        // Volume VENDU (hit the bid)
  askVolume: number;        // Volume ACHETÉ (lifted the offer)

  // Nombre de trades
  bidTrades: number;
  askTrades: number;

  // Delta = Ask - Bid
  delta: number;

  // Volume total
  totalVolume: number;

  // Imbalances (calculées)
  imbalanceBuy: boolean;    // Ask/Bid >= ratio sur le niveau DESSOUS
  imbalanceSell: boolean;   // Bid/Ask >= ratio sur le niveau DESSUS

  // POC marker
  isPOC: boolean;
}

/**
 * Candle footprint complète
 * = 1 BOUGIE footprint
 */
export interface FootprintCandle {
  // Identité
  symbol: string;
  timeframe: number;        // Secondes (60 = 1m, 300 = 5m)
  openTime: number;         // Timestamp début (aligné au timeframe)
  closeTime: number;        // Timestamp fin

  // OHLC
  open: number;
  high: number;
  low: number;
  close: number;

  // Footprint data (Map: price -> level)
  levels: Map<number, FootprintLevel>;

  // Aggregats
  totalVolume: number;
  totalBuyVolume: number;   // Tous les Ask hits
  totalSellVolume: number;  // Tous les Bid hits
  totalDelta: number;       // Buy - Sell
  totalTrades: number;

  // Key levels
  poc: number;              // Point of Control (prix avec max volume)
  vah: number;              // Value Area High (70%)
  val: number;              // Value Area Low (70%)

  // State
  isClosed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION BID/ASK - PROFESSIONAL METHODOLOGY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CLASSIFICATION DE L'AGGRESSOR SIDE
 *
 * MÉTHODE 1: Aggressor Side direct (PRÉFÉRÉ)
 * - Si le feed fournit aggressorSide = BUY → ASK (lifted the offer)
 * - Si le feed fournit aggressorSide = SELL → BID (hit the bid)
 *
 * MÉTHODE 2: Quote Rule (si pas d'aggressor)
 * - Trade price >= Ask → ASK (buy market order)
 * - Trade price <= Bid → BID (sell market order)
 * - Trade price au milieu → utiliser tick rule
 *
 * MÉTHODE 3: Tick Rule (fallback)
 * - Prix monte vs trade précédent → ASK
 * - Prix baisse vs trade précédent → BID
 * - Prix égal → reprendre classification précédente
 *
 * ATTENTION:
 * - NE JAMAIS inverser Bid/Ask
 * - BUY = LIFTED THE OFFER = COMPTABILISÉ DANS ASK
 * - SELL = HIT THE BID = COMPTABILISÉ DANS BID
 */

export type ClassificationMethod = 'aggressor' | 'quote' | 'tick';

interface ClassificationContext {
  lastPrice: number;
  lastSide: 'BID' | 'ASK';
  lastBid: number;
  lastAsk: number;
}

export function classifyTrade(
  trade: CMETrade,
  context: ClassificationContext,
  method: ClassificationMethod = 'aggressor'
): 'BID' | 'ASK' {

  // MÉTHODE 1: Aggressor Side (meilleure précision)
  if (method === 'aggressor' && trade.aggressorSide !== 'UNKNOWN') {
    // BUY aggressor = lifted the offer = goes to ASK column
    // SELL aggressor = hit the bid = goes to BID column
    return trade.aggressorSide === 'BUY' ? 'ASK' : 'BID';
  }

  // MÉTHODE 2: Quote Rule
  if (method === 'quote' || (trade.bidPrice && trade.askPrice)) {
    const bid = trade.bidPrice || context.lastBid;
    const ask = trade.askPrice || context.lastAsk;

    if (bid > 0 && ask > 0) {
      if (trade.price >= ask) return 'ASK';
      if (trade.price <= bid) return 'BID';

      // Mid-price: fallback to tick rule
      const mid = (bid + ask) / 2;
      if (trade.price >= mid) return 'ASK';
      return 'BID';
    }
  }

  // MÉTHODE 3: Tick Rule (fallback)
  if (trade.price > context.lastPrice) {
    return 'ASK';  // Prix monte = buy pressure
  } else if (trade.price < context.lastPrice) {
    return 'BID';  // Prix baisse = sell pressure
  }

  // Prix égal: reprendre la dernière classification
  return context.lastSide;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT AGGREGATOR ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class FootprintAggregator {
  private symbol: string;
  private spec: CMEContractSpec;
  private timeframe: number;  // Secondes

  // Candles en cours et historique
  private candles: Map<number, FootprintCandle> = new Map();
  private currentCandleTime: number = 0;

  // Contexte de classification
  private classificationContext: ClassificationContext = {
    lastPrice: 0,
    lastSide: 'ASK',
    lastBid: 0,
    lastAsk: 0,
  };

  // Configuration
  private imbalanceRatio: number;
  private minVolumeDisplay: number;

  constructor(
    symbol: string,
    timeframe: number = 60,
    imbalanceRatio?: number,
    minVolumeDisplay?: number
  ) {
    this.symbol = symbol;
    this.spec = getContractSpec(symbol);
    this.timeframe = timeframe;
    this.imbalanceRatio = imbalanceRatio || this.spec.imbalanceRatio;
    this.minVolumeDisplay = minVolumeDisplay || this.spec.minVolumeFilter;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCESSING TRADES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process un trade individuel
   * CETTE MÉTHODE EST LE CŒUR DU FOOTPRINT
   */
  processTrade(trade: CMETrade): FootprintCandle {
    // 1. ALIGNER LE PRIX AU TICK EXACT
    const alignedPrice = alignToTick(this.symbol, trade.price);

    // 2. CALCULER LE TEMPS DE CANDLE
    const candleTime = this.getCandleTime(trade.timestamp);

    // 3. OBTENIR OU CRÉER LA CANDLE
    let candle = this.candles.get(candleTime);

    if (!candle) {
      // Nouvelle candle
      candle = this.createCandle(candleTime, alignedPrice);
      this.candles.set(candleTime, candle);

      // Marquer l'ancienne candle comme fermée
      if (this.currentCandleTime > 0 && this.currentCandleTime !== candleTime) {
        const prevCandle = this.candles.get(this.currentCandleTime);
        if (prevCandle) {
          prevCandle.isClosed = true;
          this.calculateImbalances(prevCandle);
          this.calculateValueArea(prevCandle);
        }
      }

      this.currentCandleTime = candleTime;
    }

    // 4. CLASSIFIER LE TRADE (BID ou ASK)
    const side = classifyTrade(trade, this.classificationContext);

    // 5. METTRE À JOUR LE CONTEXTE
    this.classificationContext = {
      lastPrice: alignedPrice,
      lastSide: side,
      lastBid: trade.bidPrice || this.classificationContext.lastBid,
      lastAsk: trade.askPrice || this.classificationContext.lastAsk,
    };

    // 6. METTRE À JOUR LA CANDLE
    this.updateCandle(candle, alignedPrice, trade.size, side);

    return candle;
  }

  /**
   * Process un batch de trades (pour données historiques)
   */
  processTradesBatch(trades: CMETrade[]): FootprintCandle[] {
    // Trier par timestamp
    const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sorted) {
      this.processTrade(trade);
    }

    return this.getAllCandles();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANDLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  private getCandleTime(timestamp: number): number {
    // Convertir en secondes si nécessaire
    const timestampSec = timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
    // Aligner au timeframe
    return Math.floor(timestampSec / this.timeframe) * this.timeframe;
  }

  private createCandle(time: number, firstPrice: number): FootprintCandle {
    return {
      symbol: this.symbol,
      timeframe: this.timeframe,
      openTime: time,
      closeTime: time + this.timeframe,
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
      isClosed: false,
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

    // Update level based on side
    if (side === 'ASK') {
      // ACHAT = Lifted the offer = ASK column
      level.askVolume += size;
      level.askTrades++;
      candle.totalBuyVolume += size;
    } else {
      // VENTE = Hit the bid = BID column
      level.bidVolume += size;
      level.bidTrades++;
      candle.totalSellVolume += size;
    }

    // Update level totals
    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;

    // Update candle totals
    candle.totalVolume += size;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades++;

    // Update POC (level with max volume)
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
    };
  }

  private updatePOC(candle: FootprintCandle): void {
    let maxVolume = 0;
    let pocPrice = candle.close;

    candle.levels.forEach((level, price) => {
      level.isPOC = false;  // Reset
      if (level.totalVolume > maxVolume) {
        maxVolume = level.totalVolume;
        pocPrice = price;
      }
    });

    candle.poc = pocPrice;

    // Mark POC level
    const pocLevel = candle.levels.get(pocPrice);
    if (pocLevel) {
      pocLevel.isPOC = true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMBALANCE CALCULATION (PROFESSIONAL METHOD)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * CALCUL DES IMBALANCES - professional methodology
   *
   * Imbalance BUY (niveau N):
   *   Ask[N] / Bid[N-1] >= imbalanceRatio
   *   = Forte pression acheteuse au niveau N vs vendeurs en dessous
   *
   * Imbalance SELL (niveau N):
   *   Bid[N] / Ask[N+1] >= imbalanceRatio
   *   = Forte pression vendeuse au niveau N vs acheteurs au-dessus
   *
   * ATTENTION: On compare DIAGONALEMENT, pas horizontalement !
   */
  private calculateImbalances(candle: FootprintCandle): void {
    const tickSize = this.spec.tickSize;
    const ratio = this.imbalanceRatio;

    candle.levels.forEach((level, price) => {
      level.imbalanceBuy = false;
      level.imbalanceSell = false;

      // Imbalance BUY: Compare Ask[N] vs Bid[N-1]
      // Use precision-safe rounding based on tickSize decimals (fixes PEPE, DOGE, etc.)
      const precisionDigits = Math.max(Math.round(-Math.log10(tickSize)) + 2, 2);
      const factor = Math.pow(10, precisionDigits);
      const levelBelow = candle.levels.get(
        Math.round((price - tickSize) * factor) / factor
      );
      if (levelBelow && levelBelow.bidVolume > 0) {
        if (level.askVolume / levelBelow.bidVolume >= ratio) {
          level.imbalanceBuy = true;
        }
      }

      // Imbalance SELL: Compare Bid[N] vs Ask[N+1]
      const levelAbove = candle.levels.get(
        Math.round((price + tickSize) * factor) / factor
      );
      if (levelAbove && levelAbove.askVolume > 0) {
        if (level.bidVolume / levelAbove.askVolume >= ratio) {
          level.imbalanceSell = true;
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE AREA CALCULATION (70%)
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateValueArea(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    const totalVolume = candle.totalVolume;
    const targetVolume = totalVolume * 0.70;  // 70% of volume

    // Sort levels by volume (descending)
    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[1].totalVolume - a[1].totalVolume);

    let accumulatedVolume = 0;
    const valueAreaPrices: number[] = [];

    // Add levels until we reach 70%
    for (const [price, level] of sortedLevels) {
      valueAreaPrices.push(price);
      accumulatedVolume += level.totalVolume;

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
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  getCurrentCandle(): FootprintCandle | null {
    return this.candles.get(this.currentCandleTime) || null;
  }

  getCandle(time: number): FootprintCandle | null {
    return this.candles.get(time) || null;
  }

  getAllCandles(): FootprintCandle[] {
    return Array.from(this.candles.values())
      .sort((a, b) => a.openTime - b.openTime);
  }

  getRecentCandles(count: number): FootprintCandle[] {
    return this.getAllCandles().slice(-count);
  }

  clear(): void {
    this.candles.clear();
    this.currentCandleTime = 0;
  }

  // Configuration
  setImbalanceRatio(ratio: number): void {
    this.imbalanceRatio = ratio;
  }

  setMinVolumeDisplay(minVol: number): void {
    this.minVolumeDisplay = minVol;
  }

  getSpec(): CMEContractSpec {
    return this.spec;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

const instances: Map<string, FootprintAggregator> = new Map();

export function getFootprintAggregator(
  symbol: string,
  timeframe: number = 60
): FootprintAggregator {
  const key = `${symbol}_${timeframe}`;

  if (!instances.has(key)) {
    instances.set(key, new FootprintAggregator(symbol, timeframe));
  }

  return instances.get(key)!;
}

export function resetFootprintAggregator(symbol: string, timeframe: number = 60): void {
  const key = `${symbol}_${timeframe}`;
  instances.delete(key);
}

export function resetAllAggregators(): void {
  instances.clear();
}
