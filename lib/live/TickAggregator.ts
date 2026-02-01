/**
 * TICK AGGREGATOR - Agrégation en temps réel
 *
 * Agrège les ticks (trades) reçus en temps réel pour créer
 * des bougies de timeframes personnalisés (15s, 30s, 1m, etc.)
 *
 * LOGIQUE D'AGRÉGATION :
 * =======================
 *
 * 1. Chaque tick contient : { price, quantity, timestamp }
 *
 * 2. On calcule le "slot" temporel du tick :
 *    - Pour 15s : Math.floor(timestamp / 15000) * 15000
 *    - Pour 30s : Math.floor(timestamp / 30000) * 30000
 *
 * 3. Si le tick appartient au même slot que la bougie courante :
 *    - Update high = max(high, price)
 *    - Update low = min(low, price)
 *    - Update close = price
 *    - Accumulate volume
 *
 * 4. Si le tick appartient à un nouveau slot :
 *    - Finalise la bougie précédente
 *    - Crée une nouvelle bougie avec open = price
 *
 * 5. Émet des événements pour le front :
 *    - 'candle:update' : mise à jour de la bougie courante
 *    - 'candle:close' : bougie finalisée
 */

export interface Tick {
  price: number;
  quantity: number;
  timestamp: number; // Unix ms
  isBuyerMaker: boolean;
}

export interface LiveCandle {
  time: number;       // Unix timestamp en SECONDES (pour Lightweight Charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;  // Volume acheteur
  sellVolume: number; // Volume vendeur
  trades: number;     // Nombre de trades
}

export type TimeframeSeconds = 15 | 30 | 60 | 300 | 900 | 3600;

type CandleEventType = 'candle:update' | 'candle:close';
type CandleEventCallback = (candle: LiveCandle, timeframe: TimeframeSeconds) => void;

/**
 * Agrégateur de ticks multi-timeframe
 */
export class TickAggregator {
  // Bougies en cours pour chaque timeframe
  private currentCandles: Map<TimeframeSeconds, LiveCandle | null> = new Map();

  // Historique des bougies fermées (limité)
  private candleHistory: Map<TimeframeSeconds, LiveCandle[]> = new Map();
  private maxHistory = 500; // Garde les 500 dernières bougies

  // Event listeners
  private listeners: Map<CandleEventType, Set<CandleEventCallback>> = new Map();

  // Timeframes actifs
  private activeTimeframes: Set<TimeframeSeconds> = new Set();

  constructor(timeframes: TimeframeSeconds[] = [15, 30, 60]) {
    timeframes.forEach(tf => {
      this.activeTimeframes.add(tf);
      this.currentCandles.set(tf, null);
      this.candleHistory.set(tf, []);
    });

    this.listeners.set('candle:update', new Set());
    this.listeners.set('candle:close', new Set());
  }

  /**
   * Ajoute un timeframe à suivre
   */
  addTimeframe(tf: TimeframeSeconds): void {
    if (!this.activeTimeframes.has(tf)) {
      this.activeTimeframes.add(tf);
      this.currentCandles.set(tf, null);
      this.candleHistory.set(tf, []);
    }
  }

  /**
   * Supprime un timeframe
   */
  removeTimeframe(tf: TimeframeSeconds): void {
    this.activeTimeframes.delete(tf);
    this.currentCandles.delete(tf);
    this.candleHistory.delete(tf);
  }

  /**
   * Traite un nouveau tick
   */
  processTick(tick: Tick): void {
    this.activeTimeframes.forEach(tf => {
      this.processTickForTimeframe(tick, tf);
    });
  }

  /**
   * Traite un tick pour un timeframe spécifique
   */
  private processTickForTimeframe(tick: Tick, tf: TimeframeSeconds): void {
    const tfMs = tf * 1000; // Timeframe en millisecondes
    const slotStart = Math.floor(tick.timestamp / tfMs) * tfMs;
    const slotTime = Math.floor(slotStart / 1000); // En secondes pour le chart

    const currentCandle = this.currentCandles.get(tf);

    // Cas 1 : Première bougie ou nouvelle bougie
    if (!currentCandle || currentCandle.time !== slotTime) {
      // Ferme la bougie précédente si elle existe
      if (currentCandle) {
        this.closeCandle(currentCandle, tf);
      }

      // Crée une nouvelle bougie
      const newCandle: LiveCandle = {
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

      this.currentCandles.set(tf, newCandle);
      this.emit('candle:update', newCandle, tf);
    }
    // Cas 2 : Mise à jour de la bougie courante
    else {
      currentCandle.high = Math.max(currentCandle.high, tick.price);
      currentCandle.low = Math.min(currentCandle.low, tick.price);
      currentCandle.close = tick.price;
      currentCandle.volume += tick.quantity;
      currentCandle.trades += 1;

      if (tick.isBuyerMaker) {
        currentCandle.sellVolume += tick.quantity;
      } else {
        currentCandle.buyVolume += tick.quantity;
      }

      this.emit('candle:update', currentCandle, tf);
    }
  }

  /**
   * Ferme une bougie et l'ajoute à l'historique
   */
  private closeCandle(candle: LiveCandle, tf: TimeframeSeconds): void {
    const history = this.candleHistory.get(tf);
    if (history) {
      history.push({ ...candle });

      // Limite la taille de l'historique
      if (history.length > this.maxHistory) {
        history.shift();
      }
    }

    this.emit('candle:close', candle, tf);
  }

  /**
   * Récupère l'historique des bougies fermées
   */
  getHistory(tf: TimeframeSeconds): LiveCandle[] {
    return [...(this.candleHistory.get(tf) || [])];
  }

  /**
   * Récupère la bougie courante
   */
  getCurrentCandle(tf: TimeframeSeconds): LiveCandle | null {
    return this.currentCandles.get(tf) || null;
  }

  /**
   * Récupère toutes les bougies (historique + courante)
   */
  getAllCandles(tf: TimeframeSeconds): LiveCandle[] {
    const history = this.getHistory(tf);
    const current = this.getCurrentCandle(tf);
    return current ? [...history, current] : history;
  }

  /**
   * S'abonne aux événements
   */
  on(event: CandleEventType, callback: CandleEventCallback): () => void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(callback);
    }

    // Retourne une fonction de désabonnement
    return () => {
      listeners?.delete(callback);
    };
  }

  /**
   * Émet un événement
   */
  private emit(event: CandleEventType, candle: LiveCandle, tf: TimeframeSeconds): void {
    const listeners = this.listeners.get(event);
    listeners?.forEach(callback => {
      try {
        callback(candle, tf);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }

  /**
   * Réinitialise l'agrégateur
   */
  reset(): void {
    this.activeTimeframes.forEach(tf => {
      this.currentCandles.set(tf, null);
      this.candleHistory.set(tf, []);
    });
  }

  /**
   * Charge des données historiques (pour initialiser le chart)
   */
  loadHistory(candles: LiveCandle[], tf: TimeframeSeconds): void {
    const history = this.candleHistory.get(tf);
    if (history) {
      history.length = 0;
      history.push(...candles);
    }
  }
}

/**
 * Labels des timeframes
 */
export const TIMEFRAME_LABELS: Record<TimeframeSeconds, string> = {
  15: '15s',
  30: '30s',
  60: '1m',
  300: '5m',
  900: '15m',
  3600: '1h',
};

/**
 * Instance singleton de l'agrégateur
 */
let aggregatorInstance: TickAggregator | null = null;

export function getAggregator(): TickAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new TickAggregator([15, 30, 60, 300]);
  }
  return aggregatorInstance;
}

export function resetAggregator(): void {
  if (aggregatorInstance) {
    aggregatorInstance.reset();
  }
}
