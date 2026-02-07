/**
 * HEATMAP V2 - Types simples et clairs
 */

// ============================================================================
// PRIX
// ============================================================================
export interface PricePoint {
  timestamp: number;
  bid: number;
  ask: number;
}

// ============================================================================
// TRADES (Bulles sur la ligne staircase)
// ============================================================================
export interface Trade {
  id: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  // Position sur la timeline (index dans priceHistory)
  historyIndex: number;
  // Animation
  opacity: number;
  scale: number;
}

// Agrégation des trades par niveau de prix (pour afficher le total)
export interface TradeCluster {
  price: number;
  side: 'buy' | 'sell';
  totalSize: number;
  count: number;
  trades: Trade[];
  // Position X moyenne
  avgHistoryIndex: number;
  // Animation
  opacity: number;
  scale: number;
}

// ============================================================================
// ORDRES PASSIFS (Heatmap)
// ============================================================================
export type OrderState =
  | 'appearing'           // Vient d'apparaître
  | 'stable'              // Présent depuis un moment
  | 'reinforcing'         // Volume ajouté (continuation)
  | 'absorbing'           // En train d'être consommé par le prix
  | 'absorbed'            // Complètement consommé (garde trace)
  | 'absorbed_continuing' // Absorbé mais nouveau volume arrive
  | 'fading'              // Disparaît par désintérêt (pas de trades)
  | 'gone';               // Parti

export interface PassiveOrder {
  price: number;
  side: 'bid' | 'ask';
  size: number;
  initialSize: number;      // Taille initiale pour tracking
  displaySize: number;      // Pour animation
  state: OrderState;
  // Timing
  firstSeen: number;        // Quand l'ordre est apparu (pour ligne horizontale)
  lastModified: number;
  stateChangeTime: number;
  lastVolumeAdd: number;    // Dernier ajout de volume
  // Lifecycle
  timesReinforced: number;  // Combien de fois du volume a été ajouté
  wasPartiallyAbsorbed: boolean;
  // Visuel
  opacity: number;
  intensity: number;        // 0-1 basé sur le volume
  // Zone d'intérêt
  isSignificant: boolean;   // Est-ce une zone d'intérêt?
}

// ============================================================================
// ZONE D'INTÉRÊT
// ============================================================================
export interface InterestZone {
  price: number;
  side: 'bid' | 'ask';
  strength: number;         // Force de la zone (0-1)
  totalVolume: number;      // Volume cumulé dans la zone
  orderCount: number;       // Nombre d'ordres dans la zone
  firstSeen: number;
  lastActivity: number;
  wasTestedByPrice: boolean; // Le prix a touché cette zone
}

// ============================================================================
// HEATMAP CELL (pour historique de liquidité)
// ============================================================================
export interface HeatmapCell {
  price: number;
  timeIndex: number;      // Index dans la timeline
  bidIntensity: number;   // 0-1 intensité côté bid
  askIntensity: number;   // 0-1 intensité côté ask
  wasAbsorbed: boolean;   // A été consommé par un trade
  timestamp: number;
}

// ============================================================================
// ÉTAT GLOBAL
// ============================================================================
export interface MarketState {
  // Prix actuel
  currentBid: number;
  currentAsk: number;
  midPrice: number;

  // Historique prix (pour staircase)
  priceHistory: PricePoint[];

  // Trades actifs (bulles visibles)
  trades: Trade[];

  // Clusters de trades (agrégés par prix/côté)
  tradeClusters: TradeCluster[];

  // Niveaux cumulatifs (pour mode cumulatif)
  // Key: prix arrondi
  cumulativeLevels: Map<number, CumulativeLevel>;

  // Ordres passifs (heatmap live)
  bids: Map<number, PassiveOrder>;
  asks: Map<number, PassiveOrder>;

  // Zones d'intérêt (niveaux significatifs)
  interestZones: Map<number, InterestZone>;

  // Historique de liquidité (heatmap cells)
  // Key: "price_timeIndex"
  heatmapHistory: Map<string, HeatmapCell>;

  // Traces résiduelles
  traces: Array<{
    price: number;
    side: 'bid' | 'ask';
    type: 'absorbed' | 'cancelled';
    opacity: number;
    timestamp: number;
  }>;

  // ══════════════════════════════════════════════════════════════════════
  // ADVANCED ORDERFLOW FEATURES
  // ══════════════════════════════════════════════════════════════════════

  // Imbalance levels (bid/ask imbalances)
  imbalances: ImbalanceLevel[];

  // Absorption events (large orders getting eaten)
  absorptionEvents: AbsorptionEvent[];

  // Detected iceberg orders
  icebergs: Map<number, IcebergOrder>;

  // Session VWAP
  vwap: VWAPData;

  // Cumulative Delta tracking
  cumulativeDelta: CumulativeDeltaData;

  // Tape Velocity (Speed of Tape)
  tapeVelocity: TapeVelocityData;

  // Large Trade Alerts
  largeTradeAlerts: LargeTradeAlertsData;

  // Bid/Ask Pressure Meter
  pressureMeter: PressureMeterData;

  // Session Statistics
  sessionStats: SessionStats;

  // Drawing Tools
  drawings: DrawingsData;

  // Timing
  timestamp: number;
}

// ============================================================================
// CONFIG
// ============================================================================
export interface SimulationConfig {
  // Prix
  basePrice: number;
  tickSize: number;
  volatility: number;

  // Trades
  tradeFrequency: number;     // trades/seconde
  avgTradeSize: number;

  // Ordres passifs
  orderBookDepth: number;     // niveaux de chaque côté
  baseLiquidity: number;      // taille moyenne par niveau
  wallProbability: number;    // chance d'avoir un gros mur

  // Animation
  tradeLifetimeMs: number;
  orderFadeInMs: number;
  orderFadeOutMs: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  basePrice: 5000,
  tickSize: 0.5,
  volatility: 0.0001,

  tradeFrequency: 8,
  avgTradeSize: 5,

  orderBookDepth: 30,
  baseLiquidity: 20,
  wallProbability: 0.03,

  tradeLifetimeMs: 2500,
  orderFadeInMs: 300,
  orderFadeOutMs: 500,
};

// ============================================================================
// TRADE FLOW SETTINGS
// ============================================================================
export interface TradeFlowSettings {
  enabled: boolean;
  bubbleShape: 'circle' | 'pie';
  cumulativeMode: boolean;
  filterThreshold: number;      // Taille minimum pour afficher
  showTextLabels: boolean;
  buyColor: string;
  sellColor: string;
  // Épaisseur des ordres passifs
  passiveThickness: 'thin' | 'normal' | 'thick';
}

export const DEFAULT_TRADE_FLOW_SETTINGS: TradeFlowSettings = {
  enabled: true,
  bubbleShape: 'circle',
  cumulativeMode: false,
  filterThreshold: 0,
  showTextLabels: true,
  buyColor: '#00ff88',
  sellColor: '#ff3355',
  passiveThickness: 'normal',
};

// Cluster cumulatif par niveau de prix (pour mode cumulatif)
export interface CumulativeLevel {
  price: number;
  totalBuySize: number;
  totalSellSize: number;
  buyCount: number;
  sellCount: number;
}

// ============================================================================
// IMBALANCE DETECTION
// ============================================================================
export interface ImbalanceLevel {
  price: number;
  type: 'bid_imbalance' | 'ask_imbalance' | 'stacked_imbalance';
  ratio: number;           // Ratio between bid/ask (e.g., 3.0 = 3x more on one side)
  strength: number;        // 0-1 normalized strength
  bidVolume: number;
  askVolume: number;
  timestamp: number;
  consecutiveCount: number; // For stacked imbalances (diagonal)
}

// ============================================================================
// ABSORPTION EVENT
// ============================================================================
export interface AbsorptionEvent {
  id: string;
  price: number;
  side: 'bid' | 'ask';
  absorbedVolume: number;
  aggressorVolume: number;
  timestamp: number;
  duration: number;        // How long the absorption lasted
  isSignificant: boolean;  // Large absorption event
  opacity: number;         // For fade animation
}

// ============================================================================
// ICEBERG DETECTION
// ============================================================================
export interface IcebergOrder {
  price: number;
  side: 'bid' | 'ask';
  visibleSize: number;
  estimatedHiddenSize: number;
  refillCount: number;     // How many times it refilled
  firstSeen: number;
  lastRefill: number;
  confidence: number;      // 0-1 confidence this is an iceberg
}

// ============================================================================
// VWAP
// ============================================================================
export interface VWAPData {
  vwap: number;
  upperBand: number;       // +1 std dev
  lowerBand: number;       // -1 std dev
  cumulativeVolume: number;
  cumulativePV: number;    // Price * Volume sum
}

// ============================================================================
// CUMULATIVE DELTA
// ============================================================================
export interface DeltaPoint {
  timestamp: number;
  delta: number;           // Cumulative delta at this point
  buyVolume: number;       // Buy volume at this candle
  sellVolume: number;      // Sell volume at this candle
  price: number;           // Price at this point
}

export interface CumulativeDeltaData {
  points: DeltaPoint[];
  currentDelta: number;
  sessionHigh: number;
  sessionLow: number;
  maxAbsDelta: number;     // For normalization
}

// ============================================================================
// TAPE VELOCITY (Speed of Tape)
// ============================================================================
export interface VelocityPoint {
  timestamp: number;
  tradesPerSecond: number;
  volumePerSecond: number;
  buyVolume: number;
  sellVolume: number;
}

export interface TapeVelocityData {
  points: VelocityPoint[];
  currentTPS: number;          // Current trades per second
  currentVPS: number;          // Current volume per second
  avgTPS: number;              // Session average TPS
  maxTPS: number;              // Session max TPS
  isAccelerating: boolean;     // TPS > avgTPS * 1.5
  accelerationLevel: 'normal' | 'elevated' | 'high' | 'extreme';
}

// ============================================================================
// LARGE TRADE ALERTS
// ============================================================================
export interface LargeTrade {
  id: string;
  timestamp: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  // Classification
  level: 'large' | 'huge' | 'massive';  // Based on size thresholds
  // Visual state
  opacity: number;
  pulsePhase: number;          // For pulsing animation
  // Position tracking
  historyIndex: number;
}

export interface LargeTradeAlertsData {
  trades: LargeTrade[];
  // Thresholds (dynamic based on session average)
  largeThreshold: number;      // > 2x avg = large
  hugeThreshold: number;       // > 5x avg = huge
  massiveThreshold: number;    // > 10x avg = massive
  // Session stats
  avgTradeSize: number;
  maxTradeSize: number;
  totalLargeTrades: number;
}

// ============================================================================
// BID/ASK PRESSURE METER
// ============================================================================
export interface PressurePoint {
  timestamp: number;
  buyPressure: number;         // 0-1 normalized
  sellPressure: number;        // 0-1 normalized
  ratio: number;               // buy/sell ratio (-1 to 1, 0 = neutral)
}

export interface PressureMeterData {
  points: PressurePoint[];
  // Current state
  currentRatio: number;        // -1 (full sell) to 1 (full buy)
  smoothedRatio: number;       // EMA smoothed ratio
  // Short-term (last 5 seconds)
  shortTermBuyVol: number;
  shortTermSellVol: number;
  // Medium-term (last 30 seconds)
  mediumTermBuyVol: number;
  mediumTermSellVol: number;
  // Momentum
  momentum: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  momentumStrength: number;    // 0-1
}

// ============================================================================
// SESSION STATISTICS
// ============================================================================
export interface SessionStats {
  // Price levels
  sessionHigh: number;
  sessionLow: number;
  sessionOpen: number;
  poc: number;                 // Point of Control
  vah: number;                 // Value Area High
  val: number;                 // Value Area Low
  // Volume
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  delta: number;               // Buy - Sell
  deltaPercent: number;        // Delta as % of total
  // Trade stats
  totalTrades: number;
  avgTradeSize: number;
  largestTrade: number;
  // Time
  sessionStart: number;
  lastUpdate: number;
}

// ============================================================================
// DRAWING TOOLS
// ============================================================================
export type DrawingType = 'hline' | 'rect' | 'text' | 'trendline';

export interface DrawingBase {
  id: string;
  type: DrawingType;
  color: string;
  opacity: number;
  locked: boolean;
  visible: boolean;
  createdAt: number;
}

export interface HorizontalLine extends DrawingBase {
  type: 'hline';
  price: number;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  label?: string;
  showLabel: boolean;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface RectangleZone extends DrawingBase {
  type: 'rect';
  priceTop: number;
  priceBottom: number;
  timeStart: number;          // timestamp or -1 for extend left
  timeEnd: number;            // timestamp or -1 for extend right
  fillColor: string;
  fillOpacity: number;
  borderWidth: number;
  label?: string;
}

export interface TextAnnotation extends DrawingBase {
  type: 'text';
  price: number;
  timestamp: number;
  text: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  backgroundColor?: string;
}

export interface TrendLine extends DrawingBase {
  type: 'trendline';
  startPrice: number;
  startTime: number;
  endPrice: number;
  endTime: number;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  extendRight: boolean;
}

export type Drawing = HorizontalLine | RectangleZone | TextAnnotation | TrendLine;

export interface DrawingsData {
  drawings: Drawing[];
  selectedId: string | null;
  activeToolType: DrawingType | null;
}
