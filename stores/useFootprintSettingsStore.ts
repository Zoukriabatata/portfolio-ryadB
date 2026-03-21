/**
 * FOOTPRINT SETTINGS STORE
 *
 * Gère tous les paramètres de personnalisation du footprint chart
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type TradingSession, DEFAULT_SESSIONS } from '@/lib/sessions/SessionConfig';

// ============ TYPES ============

export interface FootprintColors {
  // Background
  background: string;
  surface: string;

  // Grid
  gridColor: string;
  gridOpacity: number;

  // Candle OHLC
  candleUpBody: string;
  candleDownBody: string;
  candleUpBorder: string;
  candleDownBorder: string;
  candleUpWick: string;
  candleDownWick: string;

  // Footprint
  bidColor: string;
  askColor: string;
  bidTextColor: string;
  askTextColor: string;
  footprintContainerOpacity: number; // 0-1, opacity of candle container background

  // Delta
  deltaPositive: string;
  deltaNegative: string;

  // Cluster Static Delta (bottom panel)
  clusterDeltaPositive: string;
  clusterDeltaNegative: string;
  clusterDeltaOpacity: number;

  // Imbalance
  imbalanceBuyBg: string;
  imbalanceSellBg: string;
  imbalanceOpacity: number;

  // POC
  pocColor: string;
  pocOpacity: number;

  // Price line (customizable)
  currentPriceColor: string;
  currentPriceLineWidth: number;
  currentPriceLineStyle: 'solid' | 'dashed' | 'dotted';
  currentPriceShowLabel: boolean;
  currentPriceLabelBg: string;

  // Text
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
  showDeltaProfile: boolean;
  showPOC: boolean;
  showImbalances: boolean;
  showCurrentPrice: boolean;
  showVolumeProfile: boolean;
  showDeltaPerLevel: boolean;
  showTotalDelta: boolean;
  showClusterStatic: boolean;   // Bottom panel with Ask/Bid/Delta/Volume per candle
  showVWAPTWAP: boolean;        // VWAP/TWAP combined line
  showHourMarkers: boolean;     // Hour labels at bottom (13h, 14h, etc.)
  showPassiveLiquidity: boolean; // Passive orders from heatmap (simulation)
  // Phase 2: Visual polish
  showHeatmapCells: boolean;           // Heatmap background on cells based on volume
  heatmapIntensity: number;            // 0-1, heatmap gradient strength
  showDevelopingPOC: boolean;          // Polyline connecting POCs across candles
  developingPOCColor: string;          // Default: '#fbbf24' (gold)
  showLargeTradeHighlight: boolean;    // Highlight abnormally large levels
  largeTradeMultiplier: number;        // Threshold: level.totalVol > multiplier * avgLevelVol
  largeTradeColor: string;             // Default: '#ffd700' (gold)
  // Phase 3: Indicators
  showStackedImbalances: boolean;      // Stacked imbalance zones
  stackedImbalanceMin: number;         // Min consecutive levels (3-10)
  showNakedPOC: boolean;               // Naked POC lines
  nakedPOCColor: string;               // Default: '#fbbf24'
  showUnfinishedAuctions: boolean;     // Unfinished auction markers
  // Phase V2: Session & Spread
  showSpread: boolean;                 // Bid/ask spread on price scale
  showSessionSeparators: boolean;      // Session boundary lines
  showAbsorptionEvents: boolean;       // Absorption event markers
  // Volume filter
  volumeFilterThreshold: number;       // 0 = show all
  volumeFilterMode: 'absolute' | 'relative'; // Fixed qty or % of max
  // Volume Profile settings
  volumeProfileColor: string;          // Bar color inside value area
  volumeProfileOutsideColor: string;   // Bar color outside value area
  volumeProfilePocColor: string;       // POC bar color
  volumeProfileVahValColor: string;    // VAH/VAL line color
  volumeProfileOpacity: number;        // 0-1
  // Delta Profile settings
  deltaProfilePositiveColor: string;   // Positive delta bar color
  deltaProfileNegativeColor: string;   // Negative delta bar color
  deltaProfileOpacity: number;         // 0-1
  // VWAP/TWAP settings
  vwapColor: string;
  vwapLineWidth: number;               // 1-5
  vwapShowLabel: boolean;
  twapColor: string;
  twapLineWidth: number;               // 1-5
  twapShowLabel: boolean;
  showVWAP: boolean;                   // Individual toggle for VWAP
  showTWAP: boolean;                   // Individual toggle for TWAP
  // Cluster display mode
  clusterDisplayMode: 'bid-ask' | 'delta' | 'volume' | 'bid-ask-split';
  // VWAP Bands
  showVWAPBands: boolean;
  vwapBandMultipliers: number[];       // [1, 2] = 1σ, 2σ
  vwapBandOpacity: number;             // 0-1, fill opacity
  vwapBandColor: string;               // Band line color (defaults to VWAP color)
  // CVD Panel
  showCVDPanel: boolean;
  cvdPanelHeight: number;              // 40-120px
  cvdLineColor: string;
  // Custom Sessions
  customSessions: TradingSession[];
  // TPO / Market Profile
  showTPO: boolean;
  tpoPeriod: 30 | 60;
  tpoMode: 'letters' | 'histogram';
  tpoPosition: 'left' | 'right';
  // Volume Bubbles
  showVolumeBubbles: boolean;
  volumeBubbleOpacity: number;       // 0-1
  volumeBubbleMaxSize: number;       // Max radius in px
  volumeBubbleScaling: 'sqrt' | 'linear' | 'log';
  volumeBubblePosition: 'overlay' | 'bottom'; // overlay candles or below in volume section
  // Aggregation mode
  aggregationMode: 'time' | 'tick' | 'volume';
  tickBarSize: number;
  volumeBarSize: number;

  // ── NEW: Professional orderflow features ───────────────────────────────────

  // Volume Profile visualization mode (Delta Profile is now a sub-mode here)
  volumeProfileMode: 'volume' | 'bidask' | 'delta' | 'trades' | 'time';

  // Absorption detection — large passive orders absorbing aggression
  absorptionEnabled: boolean;
  absorptionThreshold: number;       // Multiplier vs avg level volume (1.0–5.0)
  absorptionHighlightColor: string;

  // Exhaustion detection — clusters with falling volume near highs/lows
  exhaustionEnabled: boolean;
  exhaustionSensitivity: number;     // 1 (loose) → 5 (strict)
  exhaustionColor: string;

  // Iceberg detection — repeated prints at same price suggesting hidden orders
  icebergEnabled: boolean;
  icebergRepeatedPrints: number;     // Min consecutive identical prints (2–5)

  // Cluster filters — hide noise below threshold
  clusterMinVolume: number;          // 0 = show all
  clusterMinTrades: number;          // 0 = show all

  // ── VWAP Advanced (full ATAS spec) ────────────────────────────────────────
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
  vwapSplineTension: number;         // 0-1, default 0.4
  vwapShowBand1: boolean;
  vwapShowBand2: boolean;
  vwapShowBand3: boolean;
  vwapBandMult1: number;             // default 1.0
  vwapBandMult2: number;             // default 2.0
  vwapBandMult3: number;             // default 3.0
  vwapBand1Color: string;
  vwapBand2Color: string;
  vwapBand3Color: string;
  vwapBandLineWidth: number;
  vwapShowFills: boolean;
  vwapFillOpacityInner: number;
  vwapFillOpacityMiddle: number;
  vwapFillOpacityOuter: number;
  twapPeriodSeconds: number;         // TWAP granularity, default 60
}

// ── CVD Config (ATAS-grade) ────────────────────────────────────────────────

export interface CVDConfig {
  enabled: boolean;
  panelHeight: number;               // 40-150px
  // Rows
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
  // Visualization
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
  // Alerts
  volumeAlertEnabled: boolean;
  volumeAlertThreshold: number;
  deltaAlertEnabled: boolean;
  deltaAlertThreshold: number;
}

// ── Cluster Statistic Config (ATAS-grade) ─────────────────────────────────

export interface ClusterStatConfig {
  enabled: boolean;
  rowHeight: number;                 // 12-24px
  // Rows
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
  // Visualization
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
  // Alerts
  volumeAlertEnabled: boolean;
  volumeAlertThreshold: number;
  deltaAlertEnabled: boolean;
  deltaAlertThreshold: number;
}

// ── DOM Config (ATAS-grade) ────────────────────────────────────────────────

export interface DOMConfig {
  enabled: boolean;
  visualMode: 'levels' | 'heatmap';
  useAutoSize: boolean;
  proportionVolume: boolean;
  width: number;                     // px
  rightToLeft: boolean;
  // Levels Mode colors
  bidRowColor: string;
  bidTextColor: string;
  askRowColor: string;
  bidBackground: string;
  askBackground: string;
  bestBidBackground: string;
  bestAskBackground: string;
  // Cumulative Mode
  cumulativeAskColor: string;
  cumulativeBidColor: string;
  showCumulativeValues: boolean;
  // Filters
  focusTicks: number;
  showOnlyPersistent: boolean;
  // Scale
  useCustomScale: boolean;
  customScale: number;
  customHeightPerLevel: number;
}

// Passive Liquidity Settings (Simulation mode)
export interface PassiveLiquiditySettings {
  enabled: boolean;
  intensity: number;          // 0-1, visual intensity
  opacity: number;            // 0-1, bar opacity (20-35% recommended)
  focusTicks: number;         // Show only ±N ticks from current price (0 = show all)
  bidColor: string;           // Bid passive color (cyan/green)
  askColor: string;           // Ask passive color (red)
  maxBarWidth: number;        // Maximum bar width in pixels
  // Stability settings
  stabilityLevel: 'low' | 'medium' | 'high'; // Preset stability levels
  showOnlyPersistent: boolean;  // Show only persistent liquidity
  showStats: boolean;           // Show absorption stats panel
  // Data source
  useRealOrderbook: boolean;    // Use real Binance orderbook instead of simulation
}

export interface ImbalanceSettings {
  ratio: number;           // 2.0 = 200%, 3.0 = 300%
  minVolume: number;       // Volume minimum pour considérer
  highlightStrength: number; // 0-1 opacité
}

export interface FootprintSettings {
  colors: FootprintColors;
  fonts: FootprintFonts;
  features: FootprintFeatures;
  imbalance: ImbalanceSettings;
  passiveLiquidity: PassiveLiquiditySettings;
  cvdConfig: CVDConfig;
  clusterStatConfig: ClusterStatConfig;
  domConfig: DOMConfig;

  // Layout
  footprintWidth: number;
  rowHeight: number;
  maxVisibleFootprints: number;
  deltaProfilePosition: 'left' | 'right';
  candleGap: number;

  // Actions
  setColors: (colors: Partial<FootprintColors>) => void;
  setFonts: (fonts: Partial<FootprintFonts>) => void;
  setFeatures: (features: Partial<FootprintFeatures>) => void;
  setImbalance: (imbalance: Partial<ImbalanceSettings>) => void;
  setPassiveLiquidity: (settings: Partial<PassiveLiquiditySettings>) => void;
  setCVDConfig: (c: Partial<CVDConfig>) => void;
  setClusterStatConfig: (c: Partial<ClusterStatConfig>) => void;
  setDOMConfig: (c: Partial<DOMConfig>) => void;
  setLayout: (layout: { footprintWidth?: number; rowHeight?: number; maxVisibleFootprints?: number; deltaProfilePosition?: 'left' | 'right'; candleGap?: number }) => void;
  resetToDefaults: () => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
}

// ============ DEFAULTS ============

const DEFAULT_COLORS: FootprintColors = {
  // Professional Dark Theme
  background: '#0c0c0c',
  surface: '#141414',
  gridColor: '#1e1e1e',
  gridOpacity: 0.4,

  // Candle colors - professional muted tones
  candleUpBody: '#26a69a',
  candleDownBody: '#ef5350',
  candleUpBorder: '#26a69a',
  candleDownBorder: '#ef5350',
  candleUpWick: '#26a69a',
  candleDownWick: '#ef5350',

  // Footprint bid/ask - slightly muted for readability
  bidColor: '#ef5350',
  askColor: '#26a69a',
  bidTextColor: '#f48fb1',  // Softer pink for bid text
  askTextColor: '#80cbc4',  // Softer teal for ask text
  footprintContainerOpacity: 0, // Off by default (ATAS-style)

  // Delta colors
  deltaPositive: '#26a69a',
  deltaNegative: '#ef5350',

  // Cluster Static Delta (bottom panel)
  clusterDeltaPositive: '#26a69a',
  clusterDeltaNegative: '#ef5350',
  clusterDeltaOpacity: 0.35,

  // Imbalance (now used for bright number colors, not backgrounds)
  imbalanceBuyBg: '#26a69a',
  imbalanceSellBg: '#ef5350',
  imbalanceOpacity: 0.35,

  // POC - gold/amber tone
  pocColor: '#ffc107',
  pocOpacity: 0.15,

  // Current price line - customizable
  currentPriceColor: '#2196f3',
  currentPriceLineWidth: 1,
  currentPriceLineStyle: 'dashed' as const,
  currentPriceShowLabel: true,
  currentPriceLabelBg: '#2196f3',

  // Text hierarchy
  textPrimary: '#e0e0e0',
  textSecondary: '#9e9e9e',
  textMuted: '#616161',
};

const DEFAULT_FONTS: FootprintFonts = {
  // Professional monospace stack for pixel-perfect alignment
  volumeFont: '"Consolas", "Monaco", "Courier New", monospace',
  volumeFontSize: 10,
  volumeFontBold: false,
  deltaFont: '"Consolas", "Monaco", "Courier New", monospace',
  deltaFontSize: 11,
  priceFont: '"Consolas", "Monaco", "Courier New", monospace',
  priceFontSize: 10,
};

const DEFAULT_FEATURES: FootprintFeatures = {
  showGrid: true,
  showOHLC: false,
  showDeltaProfile: false,
  showPOC: true,
  showImbalances: true,
  showCurrentPrice: true,
  showVolumeProfile: true,    // Session volume profile (VAH/VAL/POC)
  showDeltaPerLevel: false,
  showTotalDelta: true,
  showClusterStatic: true,    // Bottom panel with Ask/Bid/Delta/Volume
  showVWAPTWAP: true,         // VWAP/TWAP combined line
  showHourMarkers: true,      // Hour labels (13h, 14h, etc.)
  showPassiveLiquidity: true, // Passive liquidity from heatmap (simulation)
  // Phase 2: Visual polish
  showHeatmapCells: false,
  heatmapIntensity: 0.4,
  showDevelopingPOC: false,
  developingPOCColor: '#fbbf24',
  showLargeTradeHighlight: false,
  largeTradeMultiplier: 2.0,
  largeTradeColor: '#ffd700',
  // Phase 3: Indicators
  showStackedImbalances: false,
  stackedImbalanceMin: 3,
  showNakedPOC: false,
  nakedPOCColor: '#fbbf24',
  showUnfinishedAuctions: false,  // Off by default (can be noisy)
  // Phase V2
  showSpread: true,
  showSessionSeparators: true,
  showAbsorptionEvents: false,   // Off by default (needs live data)
  volumeFilterThreshold: 0,      // 0 = show all
  volumeFilterMode: 'relative' as const,
  // Volume Profile
  volumeProfileColor: '#5e7ce2',
  volumeProfileOutsideColor: '#3a3f4b',
  volumeProfilePocColor: '#e2b93b',
  volumeProfileVahValColor: '#7c85f6',
  volumeProfileOpacity: 0.7,
  // Delta Profile
  deltaProfilePositiveColor: '#22c55e',
  deltaProfileNegativeColor: '#ef4444',
  deltaProfileOpacity: 0.7,
  // VWAP/TWAP
  vwapColor: '#e2b93b',
  vwapLineWidth: 2.5,
  vwapShowLabel: true,
  twapColor: '#5eaeff',
  twapLineWidth: 2,
  twapShowLabel: true,
  showVWAP: true,
  showTWAP: true,
  // Cluster display mode
  clusterDisplayMode: 'bid-ask' as const,
  // VWAP Bands
  showVWAPBands: false,
  vwapBandMultipliers: [1, 2],
  vwapBandOpacity: 0.06,
  vwapBandColor: '#e2b93b',
  // CVD Panel
  showCVDPanel: false,
  cvdPanelHeight: 70,
  cvdLineColor: '#22c55e',
  // Custom Sessions
  customSessions: DEFAULT_SESSIONS,
  // TPO / Market Profile
  showTPO: false,
  tpoPeriod: 30 as const,
  tpoMode: 'letters' as const,
  tpoPosition: 'right' as const,
  // Volume Bubbles
  showVolumeBubbles: false,
  volumeBubbleOpacity: 0.6,
  volumeBubbleMaxSize: 30,
  volumeBubbleScaling: 'sqrt' as const,
  volumeBubblePosition: 'overlay' as const,
  // Aggregation Modes (tick/volume bars)
  aggregationMode: 'time' as const,
  tickBarSize: 500,
  volumeBarSize: 100,

  // ── Professional orderflow features ───────────────────────────────────────
  volumeProfileMode: 'volume' as const,
  absorptionEnabled: false,
  absorptionThreshold: 2.0,
  absorptionHighlightColor: '#ff9800',
  exhaustionEnabled: false,
  exhaustionSensitivity: 3,
  exhaustionColor: '#9c27b0',
  icebergEnabled: false,
  icebergRepeatedPrints: 3,
  clusterMinVolume: 0,
  clusterMinTrades: 0,

  // ── VWAP Advanced ─────────────────────────────────────────────────────────
  vwapPeriod: 'daily' as const,
  vwapSource: 'hlc3' as const,
  vwapVolumeType: 'total' as const,
  vwapColoredDirection: false,
  vwapBullishColor: '#26a69a',
  vwapBearishColor: '#ef5350',
  vwapSessionStartHour: 0,
  vwapSessionStartMinute: 0,
  vwapSessionEndHour: 23,
  vwapSessionEndMinute: 59,
  vwapShowFirstPartialPeriod: true,
  vwapSplineTension: 0.4,
  vwapShowBand1: false,
  vwapShowBand2: false,
  vwapShowBand3: false,
  vwapBandMult1: 1.0,
  vwapBandMult2: 2.0,
  vwapBandMult3: 3.0,
  vwapBand1Color: '#e2b93b',
  vwapBand2Color: '#e2b93b',
  vwapBand3Color: '#e2b93b',
  vwapBandLineWidth: 1,
  vwapShowFills: true,
  vwapFillOpacityInner: 0.08,
  vwapFillOpacityMiddle: 0.04,
  vwapFillOpacityOuter: 0.02,
  twapPeriodSeconds: 60,
};

const DEFAULT_CVD_CONFIG: CVDConfig = {
  enabled: false,
  panelHeight: 70,
  showAsks: true,
  showBids: true,
  showDelta: true,
  showDeltaVolume: false,
  showSessionDelta: false,
  showSessionDeltaVolume: false,
  showVolume: false,
  showVolumePerSecond: false,
  showSessionVolume: false,
  showTradesCount: false,
  showTime: false,
  showDuration: false,
  backgroundColor: '#0a0a0f',
  gridColor: '#1e1e1e',
  volumeColor: '#5eaeff',
  askColor: '#26a69a',
  bidColor: '#ef5350',
  textColor: '#e0e0e0',
  font: 'Consolas',
  centerAlign: true,
  headerColor: '#9e9e9e',
  hideHeaders: false,
  volumeAlertEnabled: false,
  volumeAlertThreshold: 0,
  deltaAlertEnabled: false,
  deltaAlertThreshold: 0,
};

const DEFAULT_CLUSTER_STAT_CONFIG: ClusterStatConfig = {
  enabled: true,
  rowHeight: 16,
  showAsks: true,
  showBids: true,
  showDelta: true,
  showDeltaVolume: false,
  showSessionDelta: false,
  showSessionDeltaVolume: false,
  showVolume: true,
  showVolumePerSecond: false,
  showSessionVolume: false,
  showTradesCount: false,
  showTime: true,
  showDuration: false,
  backgroundColor: '#0a0a0f',
  gridColor: '#1e1e1e',
  volumeColor: '#5eaeff',
  askColor: '#26a69a',
  bidColor: '#ef5350',
  textColor: '#e0e0e0',
  font: 'Consolas',
  centerAlign: true,
  headerColor: '#9e9e9e',
  hideHeaders: false,
  volumeAlertEnabled: false,
  volumeAlertThreshold: 0,
  deltaAlertEnabled: false,
  deltaAlertThreshold: 0,
};

const DEFAULT_DOM_CONFIG: DOMConfig = {
  enabled: true,
  visualMode: 'levels',
  useAutoSize: true,
  proportionVolume: true,
  width: 120,
  rightToLeft: false,
  bidRowColor: '#ef5350',
  bidTextColor: '#f48fb1',
  askRowColor: '#26a69a',
  bidBackground: 'rgba(239,83,80,0.08)',
  askBackground: 'rgba(38,166,154,0.08)',
  bestBidBackground: 'rgba(239,83,80,0.20)',
  bestAskBackground: 'rgba(38,166,154,0.20)',
  cumulativeAskColor: '#26a69a',
  cumulativeBidColor: '#ef5350',
  showCumulativeValues: false,
  focusTicks: 0,
  showOnlyPersistent: true,
  useCustomScale: false,
  customScale: 1.0,
  customHeightPerLevel: 16,
};

const DEFAULT_PASSIVE_LIQUIDITY: PassiveLiquiditySettings = {
  enabled: true,
  intensity: 0.85,          // 85% intensity (more visible)
  opacity: 0.5,             // 50% opacity (clearly visible)
  focusTicks: 0,            // Show all (0 = no focus filter)
  bidColor: '#00e5ff',      // Bright cyan for bid passive
  askColor: '#ff5252',      // Bright red for ask passive
  maxBarWidth: 120,         // Max bar width in pixels (wider)
  // Stability settings
  stabilityLevel: 'medium', // Preset stability levels
  showOnlyPersistent: true, // Show only persistent liquidity (filtered)
  showStats: true,          // Show absorption stats panel
  // Data source
  useRealOrderbook: true,   // Use real Binance orderbook data (not simulation)
};

const DEFAULT_IMBALANCE: ImbalanceSettings = {
  ratio: 3.0,
  minVolume: 0.1,
  highlightStrength: 0.35,
};

// ============ STORE ============

export const useFootprintSettingsStore = create<FootprintSettings>()(
  persist(
    (set) => ({
      colors: DEFAULT_COLORS,
      fonts: DEFAULT_FONTS,
      features: DEFAULT_FEATURES,
      imbalance: DEFAULT_IMBALANCE,
      passiveLiquidity: DEFAULT_PASSIVE_LIQUIDITY,
      cvdConfig: DEFAULT_CVD_CONFIG,
      clusterStatConfig: DEFAULT_CLUSTER_STAT_CONFIG,
      domConfig: DEFAULT_DOM_CONFIG,

      footprintWidth: 70,
      rowHeight: 13,
      maxVisibleFootprints: 100,
      deltaProfilePosition: 'right' as const,
      candleGap: 3,

      setColors: (colors) =>
        set((state) => ({
          colors: { ...state.colors, ...colors },
        })),

      setFonts: (fonts) =>
        set((state) => ({
          fonts: { ...state.fonts, ...fonts },
        })),

      setFeatures: (features) =>
        set((state) => ({
          features: { ...state.features, ...features },
        })),

      setImbalance: (imbalance) =>
        set((state) => ({
          imbalance: { ...state.imbalance, ...imbalance },
        })),

      setPassiveLiquidity: (settings) =>
        set((state) => ({
          passiveLiquidity: { ...state.passiveLiquidity, ...settings },
        })),

      setCVDConfig: (c) =>
        set((state) => ({
          cvdConfig: { ...state.cvdConfig, ...c },
        })),

      setClusterStatConfig: (c) =>
        set((state) => ({
          clusterStatConfig: { ...state.clusterStatConfig, ...c },
        })),

      setDOMConfig: (c) =>
        set((state) => ({
          domConfig: { ...state.domConfig, ...c },
        })),

      setLayout: (layout) =>
        set((state) => ({
          ...state,
          ...layout,
        })),

      resetToDefaults: () =>
        set({
          colors: DEFAULT_COLORS,
          fonts: DEFAULT_FONTS,
          features: DEFAULT_FEATURES,
          imbalance: DEFAULT_IMBALANCE,
          passiveLiquidity: DEFAULT_PASSIVE_LIQUIDITY,
          cvdConfig: DEFAULT_CVD_CONFIG,
          clusterStatConfig: DEFAULT_CLUSTER_STAT_CONFIG,
          domConfig: DEFAULT_DOM_CONFIG,
          footprintWidth: 70,
          rowHeight: 13,
          maxVisibleFootprints: 100,
          deltaProfilePosition: 'right' as const,
          candleGap: 3,
        }),

      exportSettings: (): string => {
        const state: FootprintSettings = useFootprintSettingsStore.getState();
        return JSON.stringify({
          version: 5,
          timestamp: Date.now(),
          settings: {
            colors: state.colors,
            fonts: state.fonts,
            features: state.features,
            imbalance: state.imbalance,
            passiveLiquidity: state.passiveLiquidity,
            footprintWidth: state.footprintWidth,
            rowHeight: state.rowHeight,
            maxVisibleFootprints: state.maxVisibleFootprints,
            deltaProfilePosition: state.deltaProfilePosition,
            candleGap: state.candleGap,
          },
        }, null, 2);
      },

      importSettings: (json: string) => {
        try {
          const data = JSON.parse(json);
          if (!data?.settings) return false;
          const s = data.settings;
          set({
            colors: { ...DEFAULT_COLORS, ...(s.colors || {}) },
            fonts: { ...DEFAULT_FONTS, ...(s.fonts || {}) },
            features: { ...DEFAULT_FEATURES, ...(s.features || {}) },
            imbalance: { ...DEFAULT_IMBALANCE, ...(s.imbalance || {}) },
            passiveLiquidity: { ...DEFAULT_PASSIVE_LIQUIDITY, ...(s.passiveLiquidity || {}) },
            footprintWidth: s.footprintWidth ?? 70,
            rowHeight: s.rowHeight ?? 16,
            maxVisibleFootprints: s.maxVisibleFootprints ?? 100,
            deltaProfilePosition: s.deltaProfilePosition ?? 'right',
            candleGap: s.candleGap ?? 3,
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'footprint-settings',
      skipHydration: true,
      version: 9, // v9: container opacity 0, heatmap off, stacked imbalances off
      partialize: (state) => ({
        colors: state.colors,
        fonts: state.fonts,
        features: state.features,
        imbalance: state.imbalance,
        passiveLiquidity: state.passiveLiquidity,
        cvdConfig: state.cvdConfig,
        clusterStatConfig: state.clusterStatConfig,
        domConfig: state.domConfig,
        footprintWidth: state.footprintWidth,
        rowHeight: state.rowHeight,
        maxVisibleFootprints: state.maxVisibleFootprints,
        deltaProfilePosition: state.deltaProfilePosition,
        candleGap: state.candleGap,
      }),
      migrate: (persistedState: any, version: number) => {
        if (version < 7) {
          const state = persistedState as Partial<FootprintSettings>;
          return {
            ...state,
            features: { ...DEFAULT_FEATURES, ...(state?.features || {}) },
            colors:   { ...DEFAULT_COLORS,   ...(state?.colors   || {}) },
            fonts:    { ...DEFAULT_FONTS,     ...(state?.fonts    || {}) },
            cvdConfig: DEFAULT_CVD_CONFIG,
            clusterStatConfig: DEFAULT_CLUSTER_STAT_CONFIG,
            domConfig: DEFAULT_DOM_CONFIG,
          };
        }
        return persistedState;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FootprintSettings>;
        return {
          ...currentState,
          ...persisted,
          features:         { ...DEFAULT_FEATURES,          ...(persisted?.features          || {}) },
          colors:           { ...DEFAULT_COLORS,            ...(persisted?.colors            || {}) },
          fonts:            { ...DEFAULT_FONTS,             ...(persisted?.fonts             || {}) },
          imbalance:        { ...DEFAULT_IMBALANCE,         ...(persisted?.imbalance         || {}) },
          passiveLiquidity: { ...DEFAULT_PASSIVE_LIQUIDITY, ...(persisted?.passiveLiquidity  || {}) },
          cvdConfig:        { ...DEFAULT_CVD_CONFIG,        ...(persisted?.cvdConfig         || {}) },
          clusterStatConfig:{ ...DEFAULT_CLUSTER_STAT_CONFIG,...(persisted?.clusterStatConfig|| {}) },
          domConfig:        { ...DEFAULT_DOM_CONFIG,        ...(persisted?.domConfig         || {}) },
        };
      },
    }
  )
);

// ============ PRESETS (derived from global UI themes) ============

import { UI_THEMES, type UIThemeColors, type UIThemeId } from '@/stores/useUIThemeStore';

/**
 * Build FootprintColors from a global UIThemeColors definition.
 * This keeps the footprint canvas visually consistent with the rest of the app.
 */
export function buildFootprintColorsFromUITheme(c: UIThemeColors): FootprintColors {
  return {
    background: c.background,
    surface: c.surface,
    gridColor: c.chartGrid,
    gridOpacity: 0.3,

    candleUpBody: c.candleUp,
    candleDownBody: c.candleDown,
    candleUpBorder: c.candleUp,
    candleDownBorder: c.candleDown,
    candleUpWick: c.wickUp,
    candleDownWick: c.wickDown,

    bidColor: c.candleDown,
    askColor: c.candleUp,
    bidTextColor: c.candleDown,
    askTextColor: c.candleUp,
    footprintContainerOpacity: 0.03,

    deltaPositive: c.candleUp,
    deltaNegative: c.candleDown,

    clusterDeltaPositive: c.candleUp,
    clusterDeltaNegative: c.candleDown,
    clusterDeltaOpacity: 0.35,

    imbalanceBuyBg: c.candleUp,
    imbalanceSellBg: c.candleDown,
    imbalanceOpacity: 0.35,

    pocColor: c.accent,
    pocOpacity: 0.15,

    currentPriceColor: c.primary,
    currentPriceLineWidth: 1,
    currentPriceLineStyle: 'dashed' as const,
    currentPriceShowLabel: true,
    currentPriceLabelBg: c.primary,

    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,
    textMuted: c.textMuted,
  };
}

// Build COLOR_PRESETS from all global UI themes
export const COLOR_PRESETS: Record<string, FootprintColors> = Object.fromEntries(
  UI_THEMES.map(theme => [theme.id, buildFootprintColorsFromUITheme(theme.colors)])
);

// Theme labels for UI (derived from global themes)
export const THEME_LABELS: Record<string, string> = Object.fromEntries(
  UI_THEMES.map(theme => [theme.id, theme.name])
);

/**
 * Sync footprint colors when the global UI theme changes.
 * Call this from any component that mounts the footprint chart.
 */
export function syncFootprintWithUITheme(themeId: UIThemeId): void {
  const theme = UI_THEMES.find(t => t.id === themeId);
  if (!theme) return;
  const colors = buildFootprintColorsFromUITheme(theme.colors);
  useFootprintSettingsStore.getState().setColors(colors);
}
