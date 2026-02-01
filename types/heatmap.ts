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
