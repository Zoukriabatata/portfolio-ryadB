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

export type ColorScheme = 'magma' | 'deepocean' | 'senzoukria' | 'atas' | 'bookmap' | 'sierra' | 'highcontrast';
export type SmoothingMode = 'auto' | 'manual' | 'none';
export type BubbleShape = 'circle' | 'pie';
export type FootprintStyle = 'bid_ask' | 'delta' | 'volume';
export type PassiveThickness = 'thin' | 'normal' | 'thick';

// Key Levels Settings
export interface KeyLevelsSettings {
  showPOC: boolean;         // Point of Control
  showVAH: boolean;         // Value Area High
  showVAL: boolean;         // Value Area Low
  showVWAP: boolean;        // VWAP line
  showSessionHighLow: boolean;
  showRoundNumbers: boolean;
  roundNumberInterval: number;  // e.g., 100, 1000
  // Colors (optional - uses theme defaults if not set)
  pocColor?: string;
  vahColor?: string;
  valColor?: string;
  vwapColor?: string;
}

export const DEFAULT_KEY_LEVELS_SETTINGS: KeyLevelsSettings = {
  showPOC: true,
  showVAH: true,
  showVAL: true,
  showVWAP: true,
  showSessionHighLow: false,
  showRoundNumbers: true,
  roundNumberInterval: 100,
};

export type SizeScaling = 'sqrt' | 'linear' | 'log';

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

  // Enhanced effects
  glowEnabled: boolean;        // Glow on large trades
  glowIntensity: number;       // 0.1 to 1.5
  showGradient: boolean;       // Glass-like inner highlight
  rippleEnabled: boolean;      // Ripple effect on large trades
  largeTradeThreshold: number; // Multiplier for "large" trade detection
  sizeScaling: SizeScaling;    // How to scale bubble size with volume
  popInAnimation: boolean;     // Pop-in animation for new bubbles
}

export interface PassiveOrderSettings {
  // Glow effect
  glowEnabled: boolean;
  glowIntensity: number;  // 0.1 to 1.5

  // Pulse animation for new orders
  pulseEnabled: boolean;
  pulseSpeed: number;     // 0.5 to 3.0

  // State visualization
  showStates: boolean;
  newOrderColor: string;
  absorbedColor: string;
  icebergColor: string;

  // Iceberg detection
  icebergDetection: boolean;
  icebergThreshold: number;  // Minimum refill count to flag as iceberg
}

export const DEFAULT_PASSIVE_ORDER_SETTINGS: PassiveOrderSettings = {
  glowEnabled: true,
  glowIntensity: 0.8,
  pulseEnabled: true,
  pulseSpeed: 2.0,
  showStates: true,
  newOrderColor: '#fef08a',     // Yellow
  absorbedColor: '#fb923c',     // Orange
  icebergColor: '#22d3d1',      // Cyan
  icebergDetection: true,
  icebergThreshold: 3,
};

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

export type GridStyle = 'solid' | 'dashed' | 'dotted';
export type TickStyle = 'line' | 'triangle' | 'dot';

export interface GridSettings {
  // Major/minor grid
  showMajorGrid: boolean;
  showMinorGrid: boolean;
  majorGridInterval: number;  // Ticks between major lines (e.g., 10)
  majorGridColor: string;
  majorGridOpacity: number;   // 0.1-1.0
  minorGridColor: string;
  minorGridOpacity: number;   // 0.05-0.5
  gridStyle: GridStyle;

  // Tick marks
  showTickMarks: boolean;
  tickStyle: TickStyle;
  tickSize: number;           // 3-10px
  tickColor: string;

  // Labels
  showPriceLabels: boolean;
  highlightRoundNumbers: boolean;
  roundNumberInterval: number; // e.g., 100 for highlight every 100
  labelPrecision: 'auto' | number; // Auto or fixed decimals
  labelColor: string;
  highlightColor: string;

  // Time axis
  showTimeAxis: boolean;
  showSessionMarkers: boolean;
  timeFormat: '12h' | '24h';
  showTimezone: boolean;
  timezone: string;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  // Major/minor grid
  showMajorGrid: true,
  showMinorGrid: true,
  majorGridInterval: 10,
  majorGridColor: '#ffffff',
  majorGridOpacity: 0.15,
  minorGridColor: '#ffffff',
  minorGridOpacity: 0.05,
  gridStyle: 'solid',

  // Tick marks
  showTickMarks: true,
  tickStyle: 'line',
  tickSize: 5,
  tickColor: '#6b7280',

  // Labels
  showPriceLabels: true,
  highlightRoundNumbers: true,
  roundNumberInterval: 100,
  labelPrecision: 'auto',
  labelColor: '#9ca3af',
  highlightColor: '#ffffff',

  // Time axis
  showTimeAxis: true,
  showSessionMarkers: false,
  timeFormat: '24h',
  showTimezone: false,
  timezone: 'local',
};

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

export interface TimeSalesSettings {
  // Display
  maxRows: number;              // Max trades to show (default: 100)
  showCumulativeVolume: boolean;
  aggregateByPrice: boolean;    // Group trades by price level

  // Filtering
  minSizeFilter: number;        // Minimum trade size to show (0 = all)
  largeTradeThreshold: number;  // Multiplier for highlighting (default: 10x avg)

  // Panel position
  position: 'left' | 'right';
  width: number;                // Panel width in pixels
}

export const DEFAULT_TIME_SALES_SETTINGS: TimeSalesSettings = {
  maxRows: 100,
  showCumulativeVolume: true,
  aggregateByPrice: false,
  minSizeFilter: 0,
  largeTradeThreshold: 10,
  position: 'right',
  width: 280,
};

export type DeltaProfileMode = 'mirrored' | 'stacked' | 'net';

export interface DeltaProfileSettings {
  mode: DeltaProfileMode;
  opacity: number;            // 0.1-1.0
  bidColor: string;           // '' = use theme default
  askColor: string;           // '' = use theme default
  highlightPOC: boolean;
  showCenterLine: boolean;
  showLabels: boolean;
  labelThreshold: number;     // 0-1 as % of max
}

export const DEFAULT_DELTA_PROFILE_SETTINGS: DeltaProfileSettings = {
  mode: 'mirrored',
  opacity: 0.85,
  bidColor: '',
  askColor: '',
  highlightPOC: true,
  showCenterLine: true,
  showLabels: false,
  labelThreshold: 0.5,
};

export interface LiquidityDisplayFeatures {
  // Profiles
  showDeltaProfile: boolean;
  showVolumeProfile: boolean;
  showVWAP: boolean;
  deltaProfile: DeltaProfileSettings;

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

  // Grid & Ticks
  grid: GridSettings;

  // Passive Orders (Enhanced)
  passiveOrders: PassiveOrderSettings;

  // Time & Sales Panel
  timeSales: TimeSalesSettings;

  // Key Levels (POC, VAH/VAL, VWAP, etc.)
  keyLevels: KeyLevelsSettings;
}

export const DEFAULT_LIQUIDITY_DISPLAY_FEATURES: LiquidityDisplayFeatures = {
  // Profiles
  showDeltaProfile: true,
  showVolumeProfile: true,
  showVWAP: true,
  deltaProfile: DEFAULT_DELTA_PROFILE_SETTINGS,

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

  // Grid & Ticks
  grid: DEFAULT_GRID_SETTINGS,

  // Passive Orders
  passiveOrders: DEFAULT_PASSIVE_ORDER_SETTINGS,

  // Time & Sales
  timeSales: DEFAULT_TIME_SALES_SETTINGS,

  // Key Levels
  keyLevels: DEFAULT_KEY_LEVELS_SETTINGS,
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
  colorScheme: 'magma',

  // Display
  upperCutoffPercent: 95,
  contrast: 1.5,
  smoothing: 'auto',
  smoothingValue: 5,
  useTransparency: true,

  // Best Bid/Ask
  bestBidAskPixelSize: 50,
  bestBidColor: '#22d3ee',
  bestAskColor: '#f472b6',

  // DOM
  domColors: {
    askBackground: 'rgba(244, 114, 182, 0.3)',
    bidBackground: 'rgba(34, 211, 238, 0.3)',
    bestBidTextColor: '#22d3ee',
    bestAskTextColor: '#f472b6',
  },
  maxVolumePixelSize: 50,

  // Trade Flow
  tradeFlow: {
    enabled: true,
    buyColor: 'rgba(34, 211, 238, 0.7)',
    sellColor: 'rgba(244, 114, 182, 0.7)',
    bubbleShape: 'circle',
    cumulativeMode: true,
    filterThreshold: 0.3,
    showTextLabels: false,
    bubbleSize: 0.6,
    bubbleOpacity: 0.7,
    bubbleBorderWidth: 1.5,
    bubbleBorderColor: 'auto',
    // Enhanced effects
    glowEnabled: true,
    glowIntensity: 0.6,
    showGradient: true,
    rippleEnabled: true,
    largeTradeThreshold: 2.0,
    sizeScaling: 'sqrt',
    popInAnimation: true,
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
