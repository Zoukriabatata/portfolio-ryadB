/**
 * DXFEED FOOTPRINT ENGINE - Professional
 *
 * Agrégation tick-by-tick professional standard
 *
 * RÈGLES FONDAMENTALES:
 * 1. Chaque niveau = 1 TICK EXACT (0.25 pour NQ/ES, 0.10 pour GC)
 * 2. ASK = colonne DROITE (achats agressifs)
 * 3. BID = colonne GAUCHE (ventes agressives)
 * 4. Delta = ASK - BID
 * 5. Axe Delta = 0 est FIXE et CENTRAL (immuable)
 *
 * DIFFÉRENCE FOOTPRINT TIME-BASED vs TICK-BASED:
 * - Time-based: Nouvelle candle toutes les X secondes
 * - Tick-based: Nouvelle candle tous les N trades
 * - Volume-based: Nouvelle candle tous les V contrats
 *
 * Ici on implémente TIME-BASED (1m, 5m, 15m) standard.
 */

import {
  dxFeedClient,
  getDxFeedSymbol,
  getSpec,
  alignToTick,
  type ClassifiedTrade,
  type DxFeedQuoteEvent,
  type CMEFuturesSpec,
} from './DxFeedClient';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Un niveau de prix dans le footprint
 * = 1 LIGNE dans le footprint (correspondant à 1 TICK exact)
 */
export interface FootprintLevel {
  price: number;            // Prix aligné au tick exact

  // Volumes par côté
  bidVolume: number;        // Volume vendu (hit the bid)
  askVolume: number;        // Volume acheté (lifted the offer)

  // Nombre de trades
  bidTrades: number;
  askTrades: number;

  // Delta = Ask - Bid
  delta: number;

  // Volume total
  totalVolume: number;

  // Imbalances (calculées diagonalement)
  imbalanceBuy: boolean;    // Ask[N] / Bid[N-1] >= ratio
  imbalanceSell: boolean;   // Bid[N] / Ask[N+1] >= ratio

  // Marqueurs
  isPOC: boolean;           // Point of Control
  isValueArea: boolean;     // Dans la Value Area (70%)
}

/**
 * Une candle footprint complète
 * = 1 BOUGIE footprint
 */
export interface FootprintCandle {
  symbol: string;
  timeframe: number;        // Secondes (60 = 1m, 300 = 5m, 900 = 15m)

  // Temps
  openTime: number;         // Timestamp début (aligné au timeframe)
  closeTime: number;        // Timestamp fin
  isClosed: boolean;

  // OHLC
  open: number;
  high: number;
  low: number;
  close: number;

  // Footprint data: Map<price (aligned), level>
  levels: Map<number, FootprintLevel>;

  // Aggregats
  totalVolume: number;
  totalBuyVolume: number;   // Somme Ask
  totalSellVolume: number;  // Somme Bid
  totalDelta: number;       // totalBuyVolume - totalSellVolume
  totalTrades: number;

  // Key levels
  poc: number;              // Point of Control (prix max volume)
  vah: number;              // Value Area High
  val: number;              // Value Area Low
}

export interface FootprintEngineConfig {
  symbol: string;
  timeframe: number;        // Secondes
  imbalanceRatio: number;   // Ratio pour imbalances (default 3.0)
}

type CandleCallback = (candles: FootprintCandle[]) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTPRINT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class DxFeedFootprintEngine {
  private config: FootprintEngineConfig;
  private spec: CMEFuturesSpec;

  // Candles storage
  private candles: Map<number, FootprintCandle> = new Map();
  private currentCandleTime: number = 0;

  // Subscriptions
  private unsubscribers: (() => void)[] = [];

  // Callbacks
  private candleCallback: CandleCallback | null = null;
  private statusCallback: StatusCallback | null = null;

  // State
  private lastQuote: DxFeedQuoteEvent | null = null;

  constructor(config: Partial<FootprintEngineConfig> = {}) {
    this.config = {
      symbol: config.symbol || 'NQ',
      timeframe: config.timeframe || 60,  // 1 minute default
      imbalanceRatio: config.imbalanceRatio || 3.0,
    };

    this.spec = getSpec(this.config.symbol);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<FootprintEngineConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.symbol) {
      this.spec = getSpec(config.symbol);
    }
  }

  onCandles(callback: CandleCallback): void {
    console.log('[DxFeedFootprintEngine] Candle callback registered');
    this.candleCallback = callback;
  }

  onStatus(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    this.emitStatus('connecting', 'Connecting to dxFeed...');

    try {
      // Connect to dxFeed
      const connected = await dxFeedClient.connect();

      if (!connected) {
        this.emitStatus('error', 'Failed to connect to dxFeed');
        return false;
      }

      const dxSymbol = getDxFeedSymbol(this.config.symbol);

      console.log(`[DxFeedFootprintEngine] Subscribing to ${this.config.symbol} (dxSymbol: ${dxSymbol})`);

      // Subscribe to quotes FIRST (for bid/ask classification)
      const unsubQuote = dxFeedClient.subscribeQuotes(this.config.symbol, (quote) => {
        this.lastQuote = quote;
      });
      this.unsubscribers.push(unsubQuote);
      console.log('[DxFeedFootprintEngine] ✓ Quote subscription registered');

      // Subscribe to trades
      const unsubTrade = dxFeedClient.subscribeTrades(this.config.symbol, (trade) => {
        this.processTrade(trade);
      });
      this.unsubscribers.push(unsubTrade);
      console.log('[DxFeedFootprintEngine] ✓ Trade subscription registered');

      // Status updates
      const unsubStatus = dxFeedClient.onStatus((status, message) => {
        this.emitStatus(status, message);
      });
      this.unsubscribers.push(unsubStatus);

      this.emitStatus('connected', `Streaming ${dxSymbol}`);

      // NE PAS émettre d'état vide - attendre le premier trade
      // L'UI affichera "Waiting for first trade..." jusqu'au premier trade
      console.log('[DxFeedFootprintEngine] Ready - waiting for first trade...');

      return true;
    } catch (error) {
      console.error('[DxFeedFootprint] Connection error:', error);
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
  // TRADE PROCESSING - CŒUR DU FOOTPRINT
  // ═══════════════════════════════════════════════════════════════════════════

  private processedTradeCount = 0;
  private firstTradeReceived = false;

  /**
   * Process un trade classifié (avec bid/ask déjà déterminé)
   * TICK-BY-TICK: Crée une candle IMMÉDIATEMENT au premier trade
   * Ne dépend PAS de la clôture de timeframe pour afficher quelque chose
   */
  private processTrade(trade: ClassifiedTrade): void {
    this.processedTradeCount++;

    // Log pour debugging
    if (this.processedTradeCount <= 10) {
      console.log(`[DxFeedFootprintEngine] ▶ Trade #${this.processedTradeCount}:`, {
        symbol: trade.symbol,
        price: trade.price,
        size: trade.size,
        side: trade.side,
        timestamp: trade.timestamp,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATION DU TRADE
    // ═══════════════════════════════════════════════════════════════════════
    if (!trade.price || trade.price <= 0) {
      console.warn('[DxFeedFootprintEngine] Invalid trade price:', trade.price);
      return;
    }
    if (!trade.size || trade.size <= 0) {
      console.warn('[DxFeedFootprintEngine] Invalid trade size:', trade.size);
      return;
    }

    const { timeframe } = this.config;

    // ═══════════════════════════════════════════════════════════════════════
    // 1. ALIGNER LE PRIX AU TICK EXACT
    // ═══════════════════════════════════════════════════════════════════════
    const alignedPrice = alignToTick(this.config.symbol, trade.price);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. CALCULER LE TEMPS DE CANDLE
    // Utilise Date.now() si timestamp invalide (fallback robuste)
    // ═══════════════════════════════════════════════════════════════════════
    let timestamp: number;
    if (trade.timestamp && trade.timestamp > 0) {
      // Convertir ms → seconds si nécessaire
      timestamp = trade.timestamp > 1e12
        ? Math.floor(trade.timestamp / 1000)
        : trade.timestamp;
    } else {
      // Fallback: utiliser l'heure actuelle
      timestamp = Math.floor(Date.now() / 1000);
      console.warn('[DxFeedFootprintEngine] Using fallback timestamp');
    }

    const candleTime = Math.floor(timestamp / timeframe) * timeframe;

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CRÉER OU OBTENIR LA CANDLE - TOUJOURS créer au premier trade
    // ═══════════════════════════════════════════════════════════════════════
    let candle = this.candles.get(candleTime);

    if (!candle) {
      // Log création de candle
      if (!this.firstTradeReceived) {
        console.log(`[DxFeedFootprintEngine] ✓ FIRST TRADE - Creating initial candle at ${new Date(candleTime * 1000).toISOString()}`);
        this.firstTradeReceived = true;
      }

      // Créer nouvelle candle
      candle = this.createCandle(candleTime, alignedPrice);
      this.candles.set(candleTime, candle);

      // Fermer la candle précédente si elle existe
      if (this.currentCandleTime > 0 && this.currentCandleTime !== candleTime) {
        const prevCandle = this.candles.get(this.currentCandleTime);
        if (prevCandle && !prevCandle.isClosed) {
          this.finalizeCandle(prevCandle);
        }
      }

      this.currentCandleTime = candleTime;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. METTRE À JOUR LA CANDLE AVEC LE TRADE
    // ═══════════════════════════════════════════════════════════════════════
    this.updateCandle(candle, alignedPrice, trade.size, trade.side);

    // ═══════════════════════════════════════════════════════════════════════
    // 5. ÉMETTRE IMMÉDIATEMENT - JAMAIS de tableau vide après premier trade
    // ═══════════════════════════════════════════════════════════════════════
    if (this.processedTradeCount <= 5) {
      console.log(`[DxFeedFootprintEngine] Emitting after trade #${this.processedTradeCount}:`, {
        candlesCount: this.candles.size,
        currentVolume: candle.totalVolume,
        levelsCount: candle.levels.size,
        hasCallback: !!this.candleCallback,
      });
    }

    // CRITIQUE: Toujours émettre au moins 1 candle
    this.emitCandles();
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

  /**
   * Mettre à jour une candle avec un trade
   *
   * RÈGLES:
   * - ASK (buy aggressor) → colonne DROITE → totalBuyVolume
   * - BID (sell aggressor) → colonne GAUCHE → totalSellVolume
   */
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

    // Get or create level for this price
    let level = candle.levels.get(price);
    if (!level) {
      level = this.createLevel(price);
      candle.levels.set(price, level);
    }

    // Update level based on trade side
    if (side === 'ASK') {
      // BUY AGGRESSOR = lifted the offer = ASK column (RIGHT)
      level.askVolume += size;
      level.askTrades++;
      candle.totalBuyVolume += size;
    } else {
      // SELL AGGRESSOR = hit the bid = BID column (LEFT)
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

    // Update POC (level with maximum volume)
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

  /**
   * Finaliser une candle quand elle se ferme
   * Calcule les imbalances et la value area
   */
  private finalizeCandle(candle: FootprintCandle): void {
    candle.isClosed = true;
    this.calculateImbalances(candle);
    this.calculateValueArea(candle);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMBALANCE CALCULATION (PROFESSIONAL METHODOLOGY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * CALCUL DES IMBALANCES - professional standard
   *
   * Les imbalances sont calculées DIAGONALEMENT, pas horizontalement !
   *
   * Imbalance BUY (au niveau N):
   *   Ask[N] / Bid[N-1] >= imbalanceRatio
   *   Signification: Les acheteurs au niveau N dominent
   *   les vendeurs UN TICK EN-DESSOUS
   *
   * Imbalance SELL (au niveau N):
   *   Bid[N] / Ask[N+1] >= imbalanceRatio
   *   Signification: Les vendeurs au niveau N dominent
   *   les acheteurs UN TICK AU-DESSUS
   *
   * ERREUR COMMUNE: Comparer Ask[N] / Bid[N] (même ligne)
   * C'EST FAUX - la comparaison correcte est toujours diagonale
   */
  private calculateImbalances(candle: FootprintCandle): void {
    const { imbalanceRatio } = this.config;
    const tickSize = this.spec.tickSize;

    candle.levels.forEach((level, price) => {
      level.imbalanceBuy = false;
      level.imbalanceSell = false;

      // Prix du niveau en-dessous (arrondi pour éviter float errors)
      const priceBelow = Math.round((price - tickSize) * 10000) / 10000;
      // Prix du niveau au-dessus
      const priceAbove = Math.round((price + tickSize) * 10000) / 10000;

      // Imbalance BUY: Ask[N] / Bid[N-1] >= ratio
      const levelBelow = candle.levels.get(priceBelow);
      if (levelBelow && levelBelow.bidVolume > 0 && level.askVolume > 0) {
        if (level.askVolume / levelBelow.bidVolume >= imbalanceRatio) {
          level.imbalanceBuy = true;
        }
      }

      // Imbalance SELL: Bid[N] / Ask[N+1] >= ratio
      const levelAbove = candle.levels.get(priceAbove);
      if (levelAbove && levelAbove.askVolume > 0 && level.bidVolume > 0) {
        if (level.bidVolume / levelAbove.askVolume >= imbalanceRatio) {
          level.imbalanceSell = true;
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE AREA (70%)
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateValueArea(candle: FootprintCandle): void {
    if (candle.levels.size === 0) return;

    const totalVolume = candle.totalVolume;
    const targetVolume = totalVolume * 0.70;  // 70% of total volume

    // Sort levels by volume (descending)
    const sortedLevels = Array.from(candle.levels.entries())
      .sort((a, b) => b[1].totalVolume - a[1].totalVolume);

    let accumulatedVolume = 0;
    const valueAreaPrices: number[] = [];

    // Add levels starting from highest volume until we reach 70%
    for (const [price, level] of sortedLevels) {
      level.isValueArea = false;  // Reset

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
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private emitStatus(
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    message?: string
  ): void {
    this.statusCallback?.(status, message);
  }

  private lastEmitLog = 0;
  private emitCount = 0;

  private emitCandles(): void {
    const candlesArray = Array.from(this.candles.values())
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-500);  // Keep last 500 candles

    this.emitCount++;

    // ═══════════════════════════════════════════════════════════════════════
    // PROTECTION: Ne JAMAIS émettre un tableau vide si on a déjà reçu des trades
    // ═══════════════════════════════════════════════════════════════════════
    if (candlesArray.length === 0) {
      if (this.firstTradeReceived) {
        console.error('[DxFeedFootprintEngine] BUG: Attempting to emit 0 candles after trades received!');
      }
      // Ne pas émettre de tableau vide - l'UI garde son état précédent
      return;
    }

    // Log les premières émissions et ensuite périodiquement
    const now = Date.now();
    if (this.emitCount <= 5 || now - this.lastEmitLog > 5000) {
      this.lastEmitLog = now;
      const latest = candlesArray[candlesArray.length - 1];
      console.log(`[DxFeedFootprintEngine] 📊 Emit #${this.emitCount}: ${candlesArray.length} candle(s)`, {
        latestTime: new Date(latest.openTime * 1000).toLocaleTimeString(),
        latestVolume: latest.totalVolume,
        latestDelta: latest.totalDelta,
        levelsCount: latest.levels.size,
      });
    }

    // Émettre au callback UI
    if (this.candleCallback) {
      this.candleCallback(candlesArray);
    } else {
      console.warn('[DxFeedFootprintEngine] No callback registered!');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inject a simulated trade directly into the engine
   * Used for testing/simulation without external data source
   */
  injectTrade(trade: { price: number; size: number; side: 'BID' | 'ASK'; timestamp?: number }): void {
    const classifiedTrade: ClassifiedTrade = {
      symbol: this.config.symbol,
      price: trade.price,
      size: trade.size,
      side: trade.side,
      timestamp: trade.timestamp || Date.now(),
      tickDirection: trade.side === 'ASK' ? 'UP' : 'DOWN',  // Simulated direction
    };
    this.processTrade(classifiedTrade);
  }

  /**
   * Start in simulation mode (no external connection)
   * Emits status as connected immediately
   */
  startSimulationMode(): void {
    console.log('[DxFeedFootprintEngine] Starting in SIMULATION mode');
    this.emitStatus('connected', `SIMULATION MODE - ${this.config.symbol}`);
  }

  getCandles(): FootprintCandle[] {
    return Array.from(this.candles.values())
      .sort((a, b) => a.openTime - b.openTime);
  }

  getCurrentCandle(): FootprintCandle | null {
    return this.candles.get(this.currentCandleTime) || null;
  }

  getSpec(): CMEFuturesSpec {
    return this.spec;
  }

  clear(): void {
    this.candles.clear();
    this.currentCandleTime = 0;
    this.processedTradeCount = 0;
    this.firstTradeReceived = false;
    this.emitCount = 0;
    this.lastEmitLog = 0;
    console.log('[DxFeedFootprintEngine] State cleared');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

let instance: DxFeedFootprintEngine | null = null;

export function getDxFeedFootprintEngine(
  config?: Partial<FootprintEngineConfig>
): DxFeedFootprintEngine {
  if (!instance) {
    instance = new DxFeedFootprintEngine(config);
  } else if (config) {
    instance.setConfig(config);
  }
  return instance;
}

export function resetDxFeedFootprintEngine(): void {
  if (instance) {
    instance.disconnect();
    instance.clear();
  }
  instance = null;
}
