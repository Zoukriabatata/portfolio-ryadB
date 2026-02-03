/**
 * ORDERBOOK SIMULATOR
 *
 * Génère des données d'orderbook simulées pour les symboles non-Bybit
 * Simule le comportement réaliste d'un carnet d'ordres avec:
 * - Liquidité passive qui apparaît et disparaît
 * - Walls qui se forment et se dissolvent
 * - Spoofing occasionnel
 * - Absorption de liquidité
 */

interface SimulationConfig {
  basePrice: number;
  tickSize: number;
  spreadTicks: number;
  maxDepthLevels: number;
  updateIntervalMs: number;
  volatility: number; // 0-1
}

interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface SimulatedOrderbook {
  timestamp: number;
  bids: [string, string][];
  asks: [string, string][];
  bestBid: number;
  bestAsk: number;
}

export class OrderbookSimulator {
  private config: SimulationConfig;
  private currentPrice: number;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private listeners: Set<(orderbook: SimulatedOrderbook) => void> = new Set();

  // Simulation state
  private bids: Map<number, number> = new Map();
  private asks: Map<number, number> = new Map();
  private priceDirection: number = 0; // -1, 0, 1
  private trendStrength: number = 0;
  private wallPrices: { bid: number | null; ask: number | null } = { bid: null, ask: null };
  private wallLifetime: { bid: number; ask: number } = { bid: 0, ask: 0 };

  constructor(config: SimulationConfig) {
    this.config = config;
    this.currentPrice = config.basePrice;
    this.initializeOrderbook();
  }

  /**
   * Initialise le carnet d'ordres avec des niveaux de prix
   */
  private initializeOrderbook(): void {
    this.bids.clear();
    this.asks.clear();

    const { basePrice, tickSize, spreadTicks, maxDepthLevels } = this.config;
    const spread = spreadTicks * tickSize;

    const bestBid = basePrice - spread / 2;
    const bestAsk = basePrice + spread / 2;

    // Génère les bids (décroissant) - Quantités plus élevées et variation plus visible
    for (let i = 0; i < maxDepthLevels; i++) {
      const price = parseFloat((bestBid - i * tickSize).toFixed(2));
      const baseQty = 80 + Math.random() * 150;
      const distanceDecay = Math.exp(-i * 0.03); // Décroissance plus lente
      const randomSpike = Math.random() < 0.1 ? 2 + Math.random() * 3 : 1; // Pics aléatoires
      const quantity = baseQty * distanceDecay * randomSpike;
      this.bids.set(price, quantity);
    }

    // Génère les asks (croissant)
    for (let i = 0; i < maxDepthLevels; i++) {
      const price = parseFloat((bestAsk + i * tickSize).toFixed(2));
      const baseQty = 80 + Math.random() * 150;
      const distanceDecay = Math.exp(-i * 0.03);
      const randomSpike = Math.random() < 0.1 ? 2 + Math.random() * 3 : 1;
      const quantity = baseQty * distanceDecay * randomSpike;
      this.asks.set(price, quantity);
    }
  }

  /**
   * Démarre la simulation
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.updateOrderbook();
      this.notifyListeners();
    }, this.config.updateIntervalMs);
  }

  /**
   * Arrête la simulation
   */
  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Met à jour le carnet d'ordres (simulation tick)
   */
  private updateOrderbook(): void {
    // 1. Mise à jour du trend
    this.updatePriceTrend();

    // 2. Déplace le prix si tendance forte
    if (Math.abs(this.trendStrength) > 0.5) {
      this.movePrice();
    }

    // 3. Mise à jour des quantités (apparition/disparition de liquidité)
    this.updateLiquidity();

    // 4. Gère les walls (formation et dissolution)
    this.manageWalls();

    // 5. Simule occasionnellement du spoofing
    if (Math.random() < 0.01) {
      this.simulateSpoofing();
    }
  }

  /**
   * Met à jour la tendance du prix
   */
  private updatePriceTrend(): void {
    const { volatility } = this.config;

    // Tendance brownienne avec momentum
    const momentumDecay = 0.95;
    const randomWalk = (Math.random() - 0.5) * volatility * 2;

    this.trendStrength = this.trendStrength * momentumDecay + randomWalk;
    this.trendStrength = Math.max(-1, Math.min(1, this.trendStrength));

    this.priceDirection = this.trendStrength > 0.3 ? 1 : this.trendStrength < -0.3 ? -1 : 0;
  }

  /**
   * Déplace le prix (consomme le best bid/ask)
   */
  private movePrice(): void {
    const { tickSize } = this.config;

    if (this.priceDirection > 0) {
      // Prix monte: consomme best ask
      const bestAsk = Math.min(...this.asks.keys());
      this.asks.delete(bestAsk);

      // Ajoute un nouveau niveau ask en haut
      const maxAsk = Math.max(...this.asks.keys());
      const newAskPrice = parseFloat((maxAsk + tickSize).toFixed(2));
      this.asks.set(newAskPrice, 50 + Math.random() * 50);

      // Ajoute un niveau bid
      const maxBid = Math.max(...this.bids.keys());
      const newBidPrice = parseFloat((maxBid + tickSize).toFixed(2));
      this.bids.set(newBidPrice, 50 + Math.random() * 100);

      // Supprime le bid le plus bas
      const minBid = Math.min(...this.bids.keys());
      this.bids.delete(minBid);

      this.currentPrice += tickSize;
    } else if (this.priceDirection < 0) {
      // Prix descend: consomme best bid
      const bestBid = Math.max(...this.bids.keys());
      this.bids.delete(bestBid);

      // Ajoute un nouveau niveau bid en bas
      const minBid = Math.min(...this.bids.keys());
      const newBidPrice = parseFloat((minBid - tickSize).toFixed(2));
      this.bids.set(newBidPrice, 50 + Math.random() * 50);

      // Ajoute un niveau ask
      const minAsk = Math.min(...this.asks.keys());
      const newAskPrice = parseFloat((minAsk - tickSize).toFixed(2));
      this.asks.set(newAskPrice, 50 + Math.random() * 100);

      // Supprime l'ask le plus haut
      const maxAsk = Math.max(...this.asks.keys());
      this.asks.delete(maxAsk);

      this.currentPrice -= tickSize;
    }
  }

  /**
   * Met à jour les quantités de liquidité
   */
  private updateLiquidity(): void {
    // Mise à jour aléatoire des quantités
    for (const [price, qty] of this.bids) {
      if (Math.random() < 0.3) {
        const change = (Math.random() - 0.5) * 20;
        const newQty = Math.max(10, qty + change);
        this.bids.set(price, newQty);
      }
    }

    for (const [price, qty] of this.asks) {
      if (Math.random() < 0.3) {
        const change = (Math.random() - 0.5) * 20;
        const newQty = Math.max(10, qty + change);
        this.asks.set(price, newQty);
      }
    }
  }

  /**
   * Gère la formation et dissolution de walls
   */
  private manageWalls(): void {
    const { tickSize } = this.config;

    // Bid wall
    if (this.wallPrices.bid) {
      this.wallLifetime.bid--;
      if (this.wallLifetime.bid <= 0 || Math.random() < 0.05) {
        // Dissout le wall
        const wallQty = this.bids.get(this.wallPrices.bid) || 0;
        this.bids.set(this.wallPrices.bid, wallQty * 0.3);
        this.wallPrices.bid = null;
      }
    } else if (Math.random() < 0.02) {
      // Forme un nouveau bid wall
      const bestBid = Math.max(...this.bids.keys());
      const wallPrice = parseFloat((bestBid - tickSize * (3 + Math.floor(Math.random() * 5))).toFixed(2));
      this.bids.set(wallPrice, 300 + Math.random() * 200);
      this.wallPrices.bid = wallPrice;
      this.wallLifetime.bid = 50 + Math.floor(Math.random() * 100);
    }

    // Ask wall
    if (this.wallPrices.ask) {
      this.wallLifetime.ask--;
      if (this.wallLifetime.ask <= 0 || Math.random() < 0.05) {
        const wallQty = this.asks.get(this.wallPrices.ask) || 0;
        this.asks.set(this.wallPrices.ask, wallQty * 0.3);
        this.wallPrices.ask = null;
      }
    } else if (Math.random() < 0.02) {
      const bestAsk = Math.min(...this.asks.keys());
      const wallPrice = parseFloat((bestAsk + tickSize * (3 + Math.floor(Math.random() * 5))).toFixed(2));
      this.asks.set(wallPrice, 300 + Math.random() * 200);
      this.wallPrices.ask = wallPrice;
      this.wallLifetime.ask = 50 + Math.floor(Math.random() * 100);
    }
  }

  /**
   * Simule du spoofing (apparition puis disparition rapide)
   */
  private simulateSpoofing(): void {
    const { tickSize } = this.config;
    const side = Math.random() < 0.5 ? 'bid' : 'ask';

    if (side === 'bid') {
      const bestBid = Math.max(...this.bids.keys());
      const spoofPrice = parseFloat((bestBid - tickSize * 2).toFixed(2));
      this.bids.set(spoofPrice, 500 + Math.random() * 300);

      // Retire après 3-5 updates
      setTimeout(() => {
        this.bids.delete(spoofPrice);
      }, this.config.updateIntervalMs * (3 + Math.floor(Math.random() * 3)));
    } else {
      const bestAsk = Math.min(...this.asks.keys());
      const spoofPrice = parseFloat((bestAsk + tickSize * 2).toFixed(2));
      this.asks.set(spoofPrice, 500 + Math.random() * 300);

      setTimeout(() => {
        this.asks.delete(spoofPrice);
      }, this.config.updateIntervalMs * (3 + Math.floor(Math.random() * 3)));
    }
  }

  /**
   * Obtient le snapshot actuel de l'orderbook
   */
  getSnapshot(): SimulatedOrderbook {
    const bidsArray = Array.from(this.bids.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([price, qty]) => [price.toFixed(2), qty.toFixed(2)] as [string, string]);

    const asksArray = Array.from(this.asks.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([price, qty]) => [price.toFixed(2), qty.toFixed(2)] as [string, string]);

    const bestBid = Math.max(...this.bids.keys());
    const bestAsk = Math.min(...this.asks.keys());

    return {
      timestamp: Date.now(),
      bids: bidsArray,
      asks: asksArray,
      bestBid,
      bestAsk,
    };
  }

  /**
   * Écoute les mises à jour
   */
  onUpdate(callback: (orderbook: SimulatedOrderbook) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notifie tous les listeners
   */
  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(cb => cb(snapshot));
  }

  /**
   * Change le prix de base
   */
  setBasePrice(price: number): void {
    this.currentPrice = price;
    this.config.basePrice = price;
    this.initializeOrderbook();
  }
}

/**
 * Crée un simulateur pour un symbole donné
 */
export function createOrderbookSimulator(symbol: string): OrderbookSimulator {
  // Configuration par symbole - valeurs réalistes pour 2025
  const configs: Record<string, Partial<SimulationConfig>> = {
    MNQH5: { basePrice: 22150, tickSize: 0.25, spreadTicks: 2, maxDepthLevels: 100, volatility: 0.7 },
    MESH5: { basePrice: 6250, tickSize: 0.25, spreadTicks: 2, maxDepthLevels: 100, volatility: 0.5 },
    NQH5: { basePrice: 22150, tickSize: 0.25, spreadTicks: 2, maxDepthLevels: 100, volatility: 0.7 },
    ESH5: { basePrice: 6250, tickSize: 0.25, spreadTicks: 2, maxDepthLevels: 100, volatility: 0.5 },
    GCJ5: { basePrice: 2850, tickSize: 0.1, spreadTicks: 2, maxDepthLevels: 80, volatility: 0.4 },
    MGCJ5: { basePrice: 2850, tickSize: 0.1, spreadTicks: 2, maxDepthLevels: 80, volatility: 0.4 },
  };

  const defaultConfig: SimulationConfig = {
    basePrice: 100,
    tickSize: 0.01,
    spreadTicks: 3,
    maxDepthLevels: 80,
    updateIntervalMs: 80,  // Plus rapide
    volatility: 0.6,
  };

  const config = { ...defaultConfig, ...configs[symbol] };
  return new OrderbookSimulator(config);
}
