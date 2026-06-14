/**
 * Renderer types — extracted from web `stores/useFootprintSettingsStore.ts`,
 * `lib/rendering/LODSystem.ts`, `lib/sessions/SessionConfig.ts`,
 * and `lib/tools/ToolsRenderer.ts`.
 *
 * Pure type extraction so the ported FootprintCanvasRenderer can be consumed
 * without dragging the full Zustand store / tools engine across.
 */

// ────────────────────────────────────────────────────────────────────────────
// Trading sessions
// ────────────────────────────────────────────────────────────────────────────

export interface TradingSession {
  id: string;
  label: string;
  startUTC: number;
  endUTC: number;
  color: string;
  enabled: boolean;
}

export const DEFAULT_SESSIONS: TradingSession[] = [
  { id: 'asia',   label: 'Asia',     startUTC: 0,  endUTC: 8,  color: '#f59e0b', enabled: true },
  { id: 'london', label: 'London',   startUTC: 8,  endUTC: 16, color: '#3b82f6', enabled: true },
  { id: 'ny',     label: 'New York', startUTC: 13, endUTC: 21, color: '#5fa31a', enabled: true },
];

// ────────────────────────────────────────────────────────────────────────────
// LOD state (level of detail)
// ────────────────────────────────────────────────────────────────────────────

export type RenderMode = 'footprint' | 'candles';

export interface LODState {
  mode: RenderMode;
  visibleBars: number;
  threshold: number;
  fontSize: number;
  showSeparator: boolean;
  showImbalances: boolean;
  showPOC: boolean;
  showDeltaProfile: boolean;
  showCellBorders: boolean;
  candleBodyWidth: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Tools renderer integration (type-only stub — drawing tools live in P4)
// ────────────────────────────────────────────────────────────────────────────

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  priceToY: (price: number) => number;
  yToPrice: (y: number) => number;
  timeToX: (time: number) => number;
  xToTime: (x: number) => number;
  tickSize: number;
  colors: {
    positive: string;
    negative: string;
    selection: string;
    handle: string;
    handleBorder: string;
  };
  currentPrice?: number;
  hoveredToolId?: string | null;
  hoveredHandle?: string | null;
  altKey?: boolean;
  dpr?: number;
  candles?: ReadonlyArray<{ time: number; open: number; high: number; low: number; close: number }>;
}

// ────────────────────────────────────────────────────────────────────────────
// Footprint visual settings
// ────────────────────────────────────────────────────────────────────────────

export interface FootprintColors {
  background: string;
  surface: string;

  gridColor: string;
  gridOpacity: number;

  candleUpBody: string;
  candleDownBody: string;
  candleUpBorder: string;
  candleDownBorder: string;
  candleUpWick: string;
  candleDownWick: string;

  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  footprintContainerOpacity: number;

  deltaPositive: string;
  deltaNegative: string;

  clusterDeltaPositive: string;
  clusterDeltaNegative: string;
  clusterDeltaOpacity: number;

  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  imbalanceOpacity: number;

  pocColor: string;
  pocOpacity: number;

  currentPriceColor: string;
  currentPriceLineWidth: number;
  currentPriceLineStyle: 'solid' | 'dashed' | 'dotted';
  currentPriceShowLabel: boolean;
  currentPriceLabelBg: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

export interface FootprintFonts {
  volumeFont: string;
  volumeFontSize: number;
  volumeFontBold: boolean;
  deltaFont: string;
  deltaFontSize: number;
  priceFont: string;
  priceFontSize: number;
}

export interface FootprintFeatures {
  showGrid: boolean;
  showOHLC: boolean;
  // Configurable candle outline (rectangle high→low around each candle).
  showCandleOutline: boolean;
  candleOutlineColor: string;
  candleOutlineWidth: number;
  candleOutlineOpacity: number;
  /** Vertical + horizontal dashed line following the mouse, clipped to
   *  the chart area. Toggleable from the left toolbar. */
  showCrosshair: boolean;
  showDeltaProfile: boolean;
  showPOC: boolean;
  showImbalances: boolean;
  showCurrentPrice: boolean;
  showVolumeProfile: boolean;
  showDeltaPerLevel: boolean;
  showTotalDelta: boolean;
  showClusterStatic: boolean;
  showVWAPTWAP: boolean;
  showHourMarkers: boolean;
  showPassiveLiquidity: boolean;
  showHeatmapCells: boolean;
  heatmapIntensity: number;
  showDevelopingPOC: boolean;
  developingPOCColor: string;
  showLargeTradeHighlight: boolean;
  largeTradeMultiplier: number;
  largeTradeColor: string;
  showStackedImbalances: boolean;
  stackedImbalanceMin: number;
  showNakedPOC: boolean;
  nakedPOCColor: string;
  showUnfinishedAuctions: boolean;
  showSpread: boolean;
  showSessionSeparators: boolean;
  showAbsorptionEvents: boolean;
  showCVDDivergence: boolean;
  volumeFilterThreshold: number;
  volumeFilterMode: 'absolute' | 'relative';
  volumeProfileColor: string;
  volumeProfileOutsideColor: string;
  volumeProfilePocColor: string;
  volumeProfileVahValColor: string;
  volumeProfileOpacity: number;
  deltaProfilePositiveColor: string;
  deltaProfileNegativeColor: string;
  deltaProfileOpacity: number;
  vwapColor: string;
  vwapLineWidth: number;
  vwapShowLabel: boolean;
  twapColor: string;
  twapLineWidth: number;
  twapShowLabel: boolean;
  showVWAP: boolean;
  showTWAP: boolean;
  clusterDisplayMode: 'bid-ask' | 'delta' | 'volume' | 'bid-ask-split';
  showVWAPBands: boolean;
  vwapBandMultipliers: number[];
  vwapBandOpacity: number;
  vwapBandColor: string;
  showCVDPanel: boolean;
  cvdPanelHeight: number;
  cvdLineColor: string;
  customSessions: TradingSession[];
  showTPO: boolean;
  tpoPeriod: 30 | 60;
  tpoMode: 'letters' | 'histogram';
  tpoPosition: 'left' | 'right';
  showVolumeBubbles: boolean;
  volumeBubbleOpacity: number;
  volumeBubbleMaxSize: number;
  volumeBubbleScaling: 'sqrt' | 'linear' | 'log';
  volumeBubblePosition: 'overlay' | 'bottom';
  aggregationMode: 'time' | 'tick' | 'volume';
  tickBarSize: number;
  volumeBarSize: number;
  volumeProfileMode: 'volume' | 'bidask' | 'delta' | 'trades' | 'time';
  absorptionEnabled: boolean;
  absorptionThreshold: number;
  absorptionHighlightColor: string;
  exhaustionEnabled: boolean;
  exhaustionSensitivity: number;
  exhaustionColor: string;
  icebergEnabled: boolean;
  icebergRepeatedPrints: number;
  clusterMinVolume: number;
  clusterMinTrades: number;
  vwapPeriod: 'daily' | 'weekly' | 'monthly' | 'anchored' | 'custom';
  vwapSource: 'hlc3' | 'hl2' | 'close' | 'ohlc4' | 'open';
  vwapVolumeType: 'total' | 'bid' | 'ask';
  vwapColoredDirection: boolean;
  vwapBullishColor: string;
  vwapBearishColor: string;
  vwapSessionStartHour: number;
  vwapSessionStartMinute: number;
  vwapSessionEndHour: number;
  vwapSessionEndMinute: number;
  vwapShowFirstPartialPeriod: boolean;
  vwapSplineTension: number;
  vwapShowBand1: boolean;
  vwapShowBand2: boolean;
  vwapShowBand3: boolean;
  vwapBandMult1: number;
  vwapBandMult2: number;
  vwapBandMult3: number;
  vwapBand1Color: string;
  vwapBand2Color: string;
  vwapBand3Color: string;
  vwapBandLineWidth: number;
  vwapShowFills: boolean;
  vwapFillOpacityInner: number;
  vwapFillOpacityMiddle: number;
  vwapFillOpacityOuter: number;
  twapPeriodSeconds: number;
}

// ────────────────────────────────────────────────────────────────────────────
// CVD / Cluster Stat configs
// ────────────────────────────────────────────────────────────────────────────

export interface CVDConfig {
  enabled: boolean;
  panelHeight: number;
  showAsks: boolean;
  showBids: boolean;
  showDelta: boolean;
  showDeltaVolume: boolean;
  showSessionDelta: boolean;
  showSessionDeltaVolume: boolean;
  showVolume: boolean;
  showVolumePerSecond: boolean;
  showSessionVolume: boolean;
  showTradesCount: boolean;
  showTime: boolean;
  showDuration: boolean;
  backgroundColor: string;
  gridColor: string;
  volumeColor: string;
  askColor: string;
  bidColor: string;
  textColor: string;
  font: string;
  centerAlign: boolean;
  headerColor: string;
  hideHeaders: boolean;
  volumeAlertEnabled: boolean;
  volumeAlertThreshold: number;
  deltaAlertEnabled: boolean;
  deltaAlertThreshold: number;
}

export interface ClusterStatConfig {
  enabled: boolean;
  rowHeight: number;
  showAsks: boolean;
  showBids: boolean;
  showDelta: boolean;
  showDeltaVolume: boolean;
  showSessionDelta: boolean;
  showSessionDeltaVolume: boolean;
  showVolume: boolean;
  showVolumePerSecond: boolean;
  showSessionVolume: boolean;
  showTradesCount: boolean;
  showTime: boolean;
  showDuration: boolean;
  backgroundColor: string;
  gridColor: string;
  volumeColor: string;
  askColor: string;
  bidColor: string;
  textColor: string;
  font: string;
  centerAlign: boolean;
  headerColor: string;
  hideHeaders: boolean;
  volumeAlertEnabled: boolean;
  volumeAlertThreshold: number;
  deltaAlertEnabled: boolean;
  deltaAlertThreshold: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Indicator types — shape expected by the ported renderer (web shape).
// The desktop already has its own indicator computation in
// `./indicators.ts` with a slightly different shape; an adapter will
// translate between them in P1.5.
// ────────────────────────────────────────────────────────────────────────────

export interface StackedImbalance {
  startPrice: number;
  endPrice: number;
  direction: 'bullish' | 'bearish';
  count: number;
  candleTime: number;
}

export interface NakedPOC {
  price: number;
  candleTime: number;
  volume: number;
  tested: boolean;
}

export interface UnfinishedAuction {
  price: number;
  side: 'high' | 'low';
  candleTime: number;
  volume: number;
  tested: boolean;
}

export interface PassiveLiquiditySettings {
  enabled: boolean;
  intensity: number;
  opacity: number;
  focusTicks: number;
  bidColor: string;
  askColor: string;
  maxBarWidth: number;
  stabilityLevel: 'low' | 'medium' | 'high';
  showOnlyPersistent: boolean;
  showStats: boolean;
  useRealOrderbook: boolean;
}
