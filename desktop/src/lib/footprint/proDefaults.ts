/**
 * Default values for the ported Pro renderer — extracted from web
 * `stores/useFootprintSettingsStore.ts`.
 *
 * The desktop Pro adapter seeds the renderer with these defaults; the
 * desktop's lighter-weight `FootprintRendererSettings` (from
 * FootprintCanvasRenderer.ts) is mapped over them in `setSettings()`.
 */

import type {
  FootprintColors,
  FootprintFonts,
  FootprintFeatures,
  CVDConfig,
  ClusterStatConfig,
} from './rendererTypes';
import { DEFAULT_SESSIONS } from './rendererTypes';

// Senzoukria palette: NOIR / BLANC / VERT only.
// SENZ_GREEN = #7ed321 — the active "SENZOUKRIA" theme primary on the
// website (see `stores/useUIThemeStore.ts`, theme id `senzoukria`,
// "Senku green - kingdom of science"). The CSS default `--primary`
// (#7ed321) is OVERRIDDEN at runtime by this theme, which is what the
// user actually sees on orderflow-v2.vercel.app. We hard-pin the
// desktop chart palette to it for a 1:1 brand match.
const SENZ_GREEN = '#7ed321';
const SENZ_WHITE = '#ffffff';
// Volume profile distinct colors per user spec (2026-05-10):
//   POC = violet, VAH = white, VAL = green, bars = white+green mix.
const SENZ_POC_VIOLET = '#a855f7';

export const PRO_DEFAULT_COLORS: FootprintColors = {
  background: '#0a0a0a',
  // surface = price-scale & axis strips. Kept very close to the gradient's
  // bottom (#070707) so it reads as the same dark-grey/black band, not a
  // separate bluish panel.
  surface: '#0a0a0a',
  gridColor: 'rgba(255, 255, 255, 0.06)',
  gridOpacity: 1,

  // Candles: bullish = green, bearish = white.
  candleUpBody: SENZ_GREEN,
  candleDownBody: SENZ_WHITE,
  candleUpBorder: SENZ_GREEN,
  candleDownBorder: SENZ_WHITE,
  candleUpWick: SENZ_GREEN,
  candleDownWick: SENZ_WHITE,

  // Footprint sides: bid = white, ask = green.
  bidColor: SENZ_WHITE,
  askColor: SENZ_GREEN,
  bidTextColor: SENZ_WHITE,
  askTextColor: SENZ_GREEN,
  footprintContainerOpacity: 0,

  deltaPositive: SENZ_GREEN,
  deltaNegative: SENZ_WHITE,

  clusterDeltaPositive: SENZ_GREEN,
  clusterDeltaNegative: SENZ_WHITE,
  clusterDeltaOpacity: 0.35,

  imbalanceBuyBg: SENZ_GREEN,
  imbalanceSellBg: SENZ_WHITE,
  imbalanceOpacity: 0.35,

  // POC marker color is violet (user spec) to stand out distinctly
  // from the green/white footprint cells.
  pocColor: SENZ_POC_VIOLET,
  pocOpacity: 0.18,

  currentPriceColor: SENZ_GREEN,
  currentPriceLineWidth: 1,
  currentPriceLineStyle: 'dashed',
  currentPriceShowLabel: true,
  currentPriceLabelBg: SENZ_GREEN,

  textPrimary: SENZ_WHITE,
  textSecondary: 'rgba(255, 255, 255, 0.70)',
  textMuted: 'rgba(255, 255, 255, 0.40)',
};

export const PRO_DEFAULT_FONTS: FootprintFonts = {
  volumeFont: '"Consolas", "Monaco", "Courier New", monospace',
  volumeFontSize: 10,
  volumeFontBold: false,
  deltaFont: '"Consolas", "Monaco", "Courier New", monospace',
  deltaFontSize: 11,
  priceFont: '"Consolas", "Monaco", "Courier New", monospace',
  priceFontSize: 10,
};

export const PRO_DEFAULT_FEATURES: FootprintFeatures = {
  showGrid: true,
  showOHLC: true,
  showCrosshair: true,
  showDeltaProfile: false,
  showPOC: true,
  showImbalances: true,
  showCurrentPrice: true,
  showVolumeProfile: true,
  showDeltaPerLevel: false,
  showTotalDelta: true,
  showClusterStatic: false,
  showVWAPTWAP: false,
  showHourMarkers: true,
  showPassiveLiquidity: false,
  showHeatmapCells: true,
  heatmapIntensity: 0.4,
  showDevelopingPOC: false,
  developingPOCColor: SENZ_GREEN,
  showLargeTradeHighlight: false,
  largeTradeMultiplier: 2.0,
  largeTradeColor: SENZ_GREEN,
  showStackedImbalances: false,
  stackedImbalanceMin: 3,
  showNakedPOC: false,
  nakedPOCColor: SENZ_GREEN,
  showUnfinishedAuctions: false,
  showSpread: false,
  showSessionSeparators: false,
  showAbsorptionEvents: false,
  volumeFilterThreshold: 0,
  volumeFilterMode: 'relative',
  // Volume profile (user spec 2026-05-10):
  //   • bars in the value area  → green
  //   • bars outside value area → white
  //   • POC line/marker         → violet
  //   • VAH line                → white   (set via renderer constants)
  //   • VAL line                → green   (set via renderer constants)
  volumeProfileColor: SENZ_GREEN,
  volumeProfileOutsideColor: 'rgba(255, 255, 255, 0.65)',
  volumeProfilePocColor: SENZ_POC_VIOLET,
  volumeProfileVahValColor: SENZ_WHITE,
  volumeProfileOpacity: 0.7,
  deltaProfilePositiveColor: SENZ_GREEN,
  deltaProfileNegativeColor: SENZ_WHITE,
  deltaProfileOpacity: 0.7,
  vwapColor: SENZ_GREEN,
  vwapLineWidth: 2.5,
  vwapShowLabel: true,
  twapColor: SENZ_WHITE,
  twapLineWidth: 2,
  twapShowLabel: true,
  showVWAP: false,
  showTWAP: false,
  clusterDisplayMode: 'bid-ask',
  showVWAPBands: false,
  vwapBandMultipliers: [1, 2],
  vwapBandOpacity: 0.06,
  vwapBandColor: SENZ_GREEN,
  showCVDPanel: false,
  cvdPanelHeight: 70,
  cvdLineColor: SENZ_GREEN,
  customSessions: DEFAULT_SESSIONS,
  showTPO: false,
  tpoPeriod: 30,
  tpoMode: 'letters',
  tpoPosition: 'right',
  showVolumeBubbles: false,
  volumeBubbleOpacity: 0.6,
  volumeBubbleMaxSize: 30,
  volumeBubbleScaling: 'sqrt',
  volumeBubblePosition: 'overlay',
  aggregationMode: 'time',
  tickBarSize: 500,
  volumeBarSize: 100,
  volumeProfileMode: 'volume',
  absorptionEnabled: false,
  absorptionThreshold: 2.0,
  absorptionHighlightColor: SENZ_GREEN,
  exhaustionEnabled: false,
  exhaustionSensitivity: 3,
  exhaustionColor: SENZ_WHITE,
  icebergEnabled: false,
  icebergRepeatedPrints: 3,
  clusterMinVolume: 0,
  clusterMinTrades: 0,
  vwapPeriod: 'daily',
  vwapSource: 'hlc3',
  vwapVolumeType: 'total',
  vwapColoredDirection: false,
  vwapBullishColor: SENZ_GREEN,
  vwapBearishColor: SENZ_WHITE,
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
  vwapBand1Color: SENZ_GREEN,
  vwapBand2Color: SENZ_GREEN,
  vwapBand3Color: SENZ_GREEN,
  vwapBandLineWidth: 1,
  vwapShowFills: true,
  vwapFillOpacityInner: 0.08,
  vwapFillOpacityMiddle: 0.04,
  vwapFillOpacityOuter: 0.02,
  twapPeriodSeconds: 60,
};

export const PRO_DEFAULT_CVD_CONFIG: CVDConfig = {
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
  gridColor: 'rgba(255, 255, 255, 0.06)',
  volumeColor: SENZ_GREEN,
  askColor: SENZ_GREEN,
  bidColor: SENZ_WHITE,
  textColor: SENZ_WHITE,
  font: 'Consolas',
  centerAlign: true,
  headerColor: 'rgba(255, 255, 255, 0.70)',
  hideHeaders: false,
  volumeAlertEnabled: false,
  volumeAlertThreshold: 0,
  deltaAlertEnabled: false,
  deltaAlertThreshold: 0,
};

export const PRO_DEFAULT_CLUSTER_STAT_CONFIG: ClusterStatConfig = {
  enabled: false,
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
  // Grey-black background — neutral grey (no blue tint), kept
  // darker than the time axis strip so the cluster panel reads as
  // its own zone of chrome rather than blending into the axis.
  backgroundColor: '#0a0a0a',
  gridColor: 'rgba(255, 255, 255, 0.06)',
  volumeColor: SENZ_GREEN,
  askColor: SENZ_GREEN,
  bidColor: SENZ_WHITE,
  textColor: SENZ_WHITE,
  font: 'Consolas',
  centerAlign: true,
  headerColor: 'rgba(255, 255, 255, 0.70)',
  hideHeaders: false,
  volumeAlertEnabled: false,
  volumeAlertThreshold: 0,
  deltaAlertEnabled: false,
  deltaAlertThreshold: 0,
};
