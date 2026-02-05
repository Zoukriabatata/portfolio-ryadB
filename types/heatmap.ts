// Advanced Heatmap Types

export interface LiquidityDelta {
  price: number;
  previousQty: number;
  currentQty: number;
  delta: number;           // currentQty - previousQty
  isAddition: boolean;
  timestamp: number;
}

export interface WhaleOrder {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
  standardDeviations: number;  // How many std devs above mean
  timestamp: number;
  isActive: boolean;
}

export interface LiquidityVelocity {
  price: number;
  additionRate: number;    // Volume added per second
  removalRate: number;     // Volume removed per second
  netRate: number;
  windowSeconds: number;
}

export interface TimeWeightedLevel {
  price: number;
  timeAtLevel: number;     // Seconds liquidity has been present
  volumeTimeProduct: number;  // Integral of volume over time
  averageVolume: number;
}

export interface AlertZone {
  id: string;
  priceMin: number;
  priceMax: number;
  type: 'support' | 'resistance' | 'custom';
  enabled: boolean;
  triggered: boolean;
  notifyOnTouch: boolean;
  notifyOnBreak: boolean;
}

export interface AbsorptionEvent {
  price: number;
  volumeAbsorbed: number;
  side: 'bid' | 'ask';
  timestamp: number;
  priceImpact: number;
}

export interface HeatmapRenderOptions {
  colorScheme: 'atas' | 'bookmap' | 'custom';
  showGrid: boolean;
  showPriceLadder: boolean;
  cellSize: number;
  smoothing: 'low' | 'medium' | 'high';
  contrast: number;
}

export interface DeltaVisualization {
  showBars: boolean;
  showText: boolean;
  barWidth: number;
  threshold: number;  // Minimum delta to display
}

export interface VelocityVisualization {
  showArrows: boolean;
  arrowScale: number;
  colorByDirection: boolean;
}

export interface StackedDepthData {
  price: number;
  cumulativeBidVolume: number;
  cumulativeAskVolume: number;
  depth: number;  // Position in orderbook
}

export interface HeatmapSettings {
  // Display modes
  showLiquidityDelta: boolean;
  showWhaleHighlights: boolean;
  showVelocityBars: boolean;
  showStackedDepth: boolean;
  showTimeWeighted: boolean;
  showAlertZones: boolean;
  showAbsorption: boolean;

  // Thresholds
  whaleThresholdStdDev: number;    // Default: 3.0
  velocityWindowSeconds: number;    // Default: 30
  absorptionVolumeThreshold: number;

  // Visualization colors
  deltaColorPositive: string;
  deltaColorNegative: string;
  whaleColor: string;
  absorptionColor: string;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  showLiquidityDelta: true,
  showWhaleHighlights: true,
  showVelocityBars: false,
  showStackedDepth: false,
  showTimeWeighted: false,
  showAlertZones: true,
  showAbsorption: true,

  whaleThresholdStdDev: 3.0,
  velocityWindowSeconds: 30,
  absorptionVolumeThreshold: 100,

  deltaColorPositive: '#22c55e',
  deltaColorNegative: '#ef4444',
  whaleColor: '#facc15',
  absorptionColor: '#f97316',
};

// ============ LIQUIDITY HEATMAP PRO TYPES ============

export type ColorScheme = 'atas' | 'bookmap' | 'custom';
export type SmoothingMode = 'auto' | 'manual' | 'none';
export type BubbleShape = 'circle' | 'pie';
export type FootprintStyle = 'bid_ask' | 'delta' | 'volume';
export type PassiveThickness = 'thin' | 'normal' | 'thick';

export interface TradeFlowSettings {
  enabled: boolean;
  buyColor: string;
  sellColor: string;
  bubbleShape: BubbleShape;
  cumulativeMode: boolean;
  filterThreshold: number;
  showTextLabels: boolean;
  bubbleSize: number;  // 0.1 to 2.0 multiplier
  bubbleOpacity: number; // 0.1 to 1.0
  bubbleBorderWidth: number; // 0 to 3
  bubbleBorderColor: string;
}

export interface DOMColorSettings {
  askBackground: string;
  bidBackground: string;
  bestBidTextColor: string;
  bestAskTextColor: string;
}

export interface StaircaseLineSettings {
  // Line appearance
  lineWidth: number;        // 1-10, default 3
  showGlow: boolean;        // Enable glow effect
  glowIntensity: number;    // 0.1-1.5, default 0.7

  // Spread fill
  showSpreadFill: boolean;  // Fill area between bid/ask
  spreadFillOpacity: number; // 0.1-0.5, default 0.15

  // Trail animation
  showTrail: boolean;       // Enable animated trail effect
  trailLength: number;      // 1-5 seconds
  trailFadeSpeed: number;   // Animation speed 0.5-2.0
}

export const DEFAULT_STAIRCASE_LINE_SETTINGS: StaircaseLineSettings = {
  lineWidth: 3,
  showGlow: true,
  glowIntensity: 0.7,
  showSpreadFill: true,
  spreadFillOpacity: 0.15,
  showTrail: false,
  trailLength: 2,
  trailFadeSpeed: 1.0,
};

export interface LiquidityDisplayFeatures {
  // Profiles
  showDeltaProfile: boolean;
  showVolumeProfile: boolean;
  showVWAP: boolean;

  // Orderflow indicators
  showImbalances: boolean;
  showAbsorption: boolean;
  showIcebergs: boolean;

  // Footprint
  showFootprintNumbers: boolean;
  footprintStyle: FootprintStyle;

  // Panels
  showTimeSales: boolean;
  showCumulativeDelta: boolean;
  showDOMLadder: boolean;
  showTapeVelocity: boolean;
  showLargeTradeAlerts: boolean;
  showPressureMeter: boolean;
  showSessionStats: boolean;

  // Drawing
  showDrawings: boolean;

  // Style
  passiveThickness: PassiveThickness;

  // Staircase Line (Best Bid/Ask)
  staircaseLine: StaircaseLineSettings;
}

export const DEFAULT_LIQUIDITY_DISPLAY_FEATURES: LiquidityDisplayFeatures = {
  // Profiles
  showDeltaProfile: true,
  showVolumeProfile: true,
  showVWAP: true,

  // Orderflow indicators
  showImbalances: true,
  showAbsorption: true,
  showIcebergs: true,

  // Footprint
  showFootprintNumbers: true,
  footprintStyle: 'bid_ask',

  // Panels
  showTimeSales: true,
  showCumulativeDelta: true,
  showDOMLadder: true,
  showTapeVelocity: true,
  showLargeTradeAlerts: true,
  showPressureMeter: true,
  showSessionStats: true,

  // Drawing
  showDrawings: true,

  // Style
  passiveThickness: 'normal',

  // Staircase Line
  staircaseLine: DEFAULT_STAIRCASE_LINE_SETTINGS,
};

export interface HeatmapProSettings {
  // General
  autoCenter: boolean;
  colorScheme: ColorScheme;

  // Display
  upperCutoffPercent: number;
  contrast: number;
  smoothing: SmoothingMode;
  smoothingValue: number;
  useTransparency: boolean;

  // Best Bid/Ask
  bestBidAskPixelSize: number;
  bestBidColor: string;
  bestAskColor: string;

  // DOM
  domColors: DOMColorSettings;
  maxVolumePixelSize: number;

  // Trade Flow
  tradeFlow: TradeFlowSettings;

  // Zoom/Pan
  zoomLevel: number;
  priceOffset: number;

  // Display Features
  displayFeatures: LiquidityDisplayFeatures;
}

export const DEFAULT_HEATMAP_PRO_SETTINGS: HeatmapProSettings = {
  // General
  autoCenter: true,
  colorScheme: 'atas',

  // Display
  upperCutoffPercent: 95,
  contrast: 1.5,
  smoothing: 'auto',
  smoothingValue: 5,
  useTransparency: true,

  // Best Bid/Ask
  bestBidAskPixelSize: 50,
  bestBidColor: '#22c55e',
  bestAskColor: '#ef4444',

  // DOM
  domColors: {
    askBackground: 'rgba(239, 68, 68, 0.3)',
    bidBackground: 'rgba(34, 197, 94, 0.3)',
    bestBidTextColor: '#22c55e',
    bestAskTextColor: '#ef4444',
  },
  maxVolumePixelSize: 50,

  // Trade Flow
  tradeFlow: {
    enabled: true,
    buyColor: 'rgba(34, 197, 94, 0.7)',
    sellColor: 'rgba(239, 68, 68, 0.7)',
    bubbleShape: 'circle',
    cumulativeMode: true,
    filterThreshold: 0.3,
    showTextLabels: false,
    bubbleSize: 0.6,
    bubbleOpacity: 0.7,
    bubbleBorderWidth: 1.5,
    bubbleBorderColor: 'auto',
  },

  // Zoom/Pan
  zoomLevel: 1,
  priceOffset: 0,

  // Display Features
  displayFeatures: DEFAULT_LIQUIDITY_DISPLAY_FEATURES,
};

export interface TradeEvent {
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
  buyVolume?: number;
  sellVolume?: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface HeatmapCell {
  price: number;
  timestamp: number;
  intensity: number;
  quantity: number;
}

export interface HeatmapRenderData {
  cells: HeatmapCell[];
  bids: Map<number, number>;
  asks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  trades: TradeEvent[];
  priceRange: PriceRange;
  tickSize: number;
}

export interface HeatmapStats {
  askTotal: number;
  bidTotal: number;
  delta: number;
  volume: number;
}
