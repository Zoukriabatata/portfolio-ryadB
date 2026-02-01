/**
 * HIERARCHICAL AGGREGATOR - Agrégation Multi-Timeframes Optimisée
 *
 * Architecture en cascade pour performance maximale :
 *
 *   Ticks (1000+/sec)
 *       │
 *       ▼
 *   ┌─── 15s ◄── PRIMARY (seul calcul direct depuis ticks)
 *       │
 *       ├─► 30s    (2 × 15s)
 *       ├─► 1m     (4 × 15s)
 *       ├─► 3m     (12 × 15s)
 *       ├─► 5m     (20 × 15s)
 *       ├─► 15m    (60 × 15s)
 *       ├─► 30m    (120 × 15s)
 *       ├─► 1h     (240 × 15s)
 *       ├─► 4h     (960 × 15s)
 *       ├─► 1D     (5760 × 15s)
 *       ├─► 3D     (17280 × 15s)
 *       └─► 1W     (40320 × 15s)
 *
 * AVANTAGES :
 * - CPU : 1000 ticks × 1 TF = 1000 calc/sec (vs 12000 en flat)
 * - Mémoire : Réutilisation des données
 * - Scalable : Ajout de TF sans coût supplémentaire
 */

export interface Tick {
  price: number;
  quantity: number;
  timestamp: number;
  isBuyerMaker: boolean;
}

export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  trades: number;
  isClosed?: boolean;
}

// Tous les timeframes supportés (en secondes)
export type TimeframeSeconds =
  | 15 | 30 | 60 | 180 | 300 | 900 | 1800 | 3600 | 14400 | 86400 | 259200 | 604800;

// Configuration des timeframes
export const TIMEFRAME_CONFIG: Record<TimeframeSeconds, { label: string; multiplier: number }> = {
  15:     { label: '15s',  multiplier: 1 },      // Base
  30:     { label: '30s',  multiplier: 2 },      // 2 × 15s
  60:     { label: '1m',   multiplier: 4 },      // 4 × 15s
  180:    { label: '3m',   multiplier: 12 },     // 12 × 15s
  300:    { label: '5m',   multiplier: 20 },     // 20 × 15s
  900:    { label: '15m',  multiplier: 60 },     // 60 × 15s
  1800:   { label: '30m',  multiplier: 120 },    // 120 × 15s
  3600:   { label: '1h',   multiplier: 240 },    // 240 × 15s
  14400:  { label: '4h',   multiplier: 960 },    // 960 × 15s
  86400:  { label: '1D',   multiplier: 5760 },   // 5760 × 15s
  259200: { label: '3D',   multiplier: 17280 },  // 17280 × 15s
  604800: { label: '1W',   multiplier: 40320 },  // 40320 × 15s
};

// Labels pour UI
export const TIMEFRAME_LABELS: Record<TimeframeSeconds, string> = Object.fromEntries(
  Object.entries(TIMEFRAME_CONFIG).map(([k, v]) => [Number(k), v.label])
) as Record<TimeframeSeconds, string>;

// Liste ordonnée des timeframes
export const TIMEFRAMES: TimeframeSeconds[] = [15, 30, 60, 180, 300, 900, 1800, 3600, 14400, 86400, 259200, 604800];

type CandleEventType = 'candle:update' | 'candle:close';
type CandleCallback = (candle: LiveCandle, tf: TimeframeSeconds) => void;

/**
 * Noeud de timeframe dans la hiérarchie
 */
interface TimeframeNode {
  seconds: TimeframeSeconds;
  currentCandle: LiveCandle | null;
  history: LiveCandle[];
  lastUpdateTime: number;
}

/**
 * Agrégateur Hiérarchique Multi-Timeframes
 */
export class HierarchicalAggregator {
  private static PRIMARY_TF: TimeframeSeconds = 15;
  private static MAX_HISTORY = 500;

  private nodes: Map<TimeframeSeconds, TimeframeNode> = new Map();
  private listeners: Map<CandleEventType, Set<CandleCallback>> = new Map();
  private tickCount = 0;
  private lastPrice = 0;

  constructor() {
    // Initialise tous les noeuds
    TIMEFRAMES.forEach(tf => {
      this.nodes.set(tf, {
        seconds: tf,
        currentCandle: null,
        history: [],
        lastUpdateTime: 0,
      });
    });

    this.listeners.set('candle:update', new Set());
    this.listeners.set('candle:close', new Set());
  }

  /**
   * Traite un tick entrant
   */
  processTick(tick: Tick): void {
    this.tickCount++;
    this.lastPrice = tick.price;

    // 1. Calcule uniquement pour le PRIMARY_TF (15s)
    const primaryUpdated = this.processTickForPrimary(tick);

    // 2. Propage vers les timeframes supérieurs si nécessaire
    if (primaryUpdated) {
      this.propagateUpward();
    }
  }

  /**
   * Traite un tick pour le timeframe primaire (15s)
   */
  private processTickForPrimary(tick: Tick): boolean {
    const tf = HierarchicalAggregator.PRIMARY_TF;
    const tfMs = tf * 1000;
    const slotStart = Math.floor(tick.timestamp / tfMs) * tfMs;
    const slotTime = Math.floor(slotStart / 1000);

    const node = this.nodes.get(tf)!;
    const current = node.currentCandle;

    // Nouvelle bougie
    if (!current || current.time !== slotTime) {
      // Ferme l'ancienne
      if (current) {
        current.isClosed = true;
        node.history.push({ ...current });
        if (node.history.length > HierarchicalAggregator.MAX_HISTORY) {
          node.history.shift();
        }
        this.emit('candle:close', current, tf);
      }

      // Crée la nouvelle
      node.currentCandle = {
        time: slotTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.quantity,
        buyVolume: tick.isBuyerMaker ? 0 : tick.quantity,
        sellVolume: tick.isBuyerMaker ? tick.quantity : 0,
        trades: 1,
      };
      node.lastUpdateTime = Date.now();
      this.emit('candle:update', node.currentCandle, tf);
      return true;
    }

    // Met à jour la bougie courante
    current.high = Math.max(current.high, tick.price);
    current.low = Math.min(current.low, tick.price);
    current.close = tick.price;
    current.volume += tick.quantity;
    current.trades++;
    if (tick.isBuyerMaker) {
      current.sellVolume += tick.quantity;
    } else {
      current.buyVolume += tick.quantity;
    }
    node.lastUpdateTime = Date.now();
    this.emit('candle:update', current, tf);

    return false;
  }

  /**
   * Propage les mises à jour vers les timeframes supérieurs
   */
  private propagateUpward(): void {
    const primaryNode = this.nodes.get(HierarchicalAggregator.PRIMARY_TF)!;
    const primaryCandles = this.getAllCandlesForNode(primaryNode);

    // Pour chaque timeframe supérieur
    TIMEFRAMES.filter(tf => tf > HierarchicalAggregator.PRIMARY_TF).forEach(tf => {
      this.aggregateFromPrimary(tf, primaryCandles);
    });
  }

  /**
   * Agrège les bougies primaires pour un timeframe donné
   */
  private aggregateFromPrimary(tf: TimeframeSeconds, primaryCandles: LiveCandle[]): void {
    if (primaryCandles.length === 0) return;

    const node = this.nodes.get(tf)!;
    const tfMs = tf * 1000;

    // Groupe les bougies primaires par slot de ce timeframe
    const slots = new Map<number, LiveCandle[]>();

    primaryCandles.forEach(candle => {
      const slotTime = Math.floor((candle.time * 1000) / tfMs) * (tf);
      if (!slots.has(slotTime)) {
        slots.set(slotTime, []);
      }
      slots.get(slotTime)!.push(candle);
    });

    // Convertit chaque slot en bougie agrégée
    const sortedSlots = Array.from(slots.entries()).sort((a, b) => a[0] - b[0]);
    const newHistory: LiveCandle[] = [];

    sortedSlots.forEach(([slotTime, candles], idx) => {
      const aggregated = this.mergeCandles(candles, slotTime);
      const isLast = idx === sortedSlots.length - 1;

      if (isLast) {
        // Dernière bougie = courante (non fermée)
        const oldCurrent = node.currentCandle;

        if (!oldCurrent || oldCurrent.time !== slotTime) {
          // Nouvelle bougie courante
          if (oldCurrent) {
            oldCurrent.isClosed = true;
            this.emit('candle:close', oldCurrent, tf);
          }
          node.currentCandle = aggregated;
          this.emit('candle:update', aggregated, tf);
        } else if (this.candleChanged(oldCurrent, aggregated)) {
          // Mise à jour bougie courante
          node.currentCandle = aggregated;
          this.emit('candle:update', aggregated, tf);
        }
      } else {
        // Bougie fermée
        aggregated.isClosed = true;
        newHistory.push(aggregated);
      }
    });

    // Met à jour l'historique
    if (newHistory.length > 0) {
      node.history = this.mergeHistory(node.history, newHistory);
      if (node.history.length > HierarchicalAggregator.MAX_HISTORY) {
        node.history = node.history.slice(-HierarchicalAggregator.MAX_HISTORY);
      }
    }
  }

  /**
   * Fusionne plusieurs bougies en une seule
   */
  private mergeCandles(candles: LiveCandle[], slotTime: number): LiveCandle {
    if (candles.length === 0) {
      throw new Error('Cannot merge empty candles array');
    }

    const sorted = [...candles].sort((a, b) => a.time - b.time);

    return {
      time: slotTime,
      open: sorted[0].open,
      high: Math.max(...sorted.map(c => c.high)),
      low: Math.min(...sorted.map(c => c.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((sum, c) => sum + c.volume, 0),
      buyVolume: sorted.reduce((sum, c) => sum + c.buyVolume, 0),
      sellVolume: sorted.reduce((sum, c) => sum + c.sellVolume, 0),
      trades: sorted.reduce((sum, c) => sum + c.trades, 0),
    };
  }

  /**
   * Fusionne l'historique existant avec de nouvelles bougies
   */
  private mergeHistory(existing: LiveCandle[], newCandles: LiveCandle[]): LiveCandle[] {
    const map = new Map<number, LiveCandle>();

    existing.forEach(c => map.set(c.time, c));
    newCandles.forEach(c => map.set(c.time, c));

    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }

  /**
   * Vérifie si une bougie a changé
   */
  private candleChanged(a: LiveCandle, b: LiveCandle): boolean {
    return a.high !== b.high ||
           a.low !== b.low ||
           a.close !== b.close ||
           a.volume !== b.volume;
  }

  /**
   * Récupère toutes les bougies d'un noeud
   */
  private getAllCandlesForNode(node: TimeframeNode): LiveCandle[] {
    const candles = [...node.history];
    if (node.currentCandle) {
      candles.push(node.currentCandle);
    }
    return candles;
  }

  // ========== API PUBLIQUE ==========

  /**
   * Récupère l'historique d'un timeframe
   */
  getHistory(tf: TimeframeSeconds): LiveCandle[] {
    return [...(this.nodes.get(tf)?.history || [])];
  }

  /**
   * Récupère la bougie courante d'un timeframe
   */
  getCurrentCandle(tf: TimeframeSeconds): LiveCandle | null {
    return this.nodes.get(tf)?.currentCandle || null;
  }

  /**
   * Récupère toutes les bougies (historique + courante)
   */
  getAllCandles(tf: TimeframeSeconds): LiveCandle[] {
    const node = this.nodes.get(tf);
    if (!node) return [];
    return this.getAllCandlesForNode(node);
  }

  /**
   * S'abonne aux événements
   */
  on(event: CandleEventType, callback: CandleCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  /**
   * Émet un événement
   */
  private emit(event: CandleEventType, candle: LiveCandle, tf: TimeframeSeconds): void {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(candle, tf); } catch (e) { console.error(e); }
    });
  }

  /**
   * Reset toutes les données
   */
  reset(): void {
    this.nodes.forEach(node => {
      node.currentCandle = null;
      node.history = [];
      node.lastUpdateTime = 0;
    });
    this.tickCount = 0;
    this.lastPrice = 0;
  }

  /**
   * Stats
   */
  getStats() {
    return {
      tickCount: this.tickCount,
      lastPrice: this.lastPrice,
      candleCounts: Object.fromEntries(
        TIMEFRAMES.map(tf => [
          TIMEFRAME_LABELS[tf],
          this.getAllCandles(tf).length
        ])
      ),
    };
  }
}

// ========== SINGLETON ==========

let instance: HierarchicalAggregator | null = null;

export function getAggregator(): HierarchicalAggregator {
  if (!instance) {
    instance = new HierarchicalAggregator();
  }
  return instance;
}

export function resetAggregator(): void {
  instance?.reset();
}
