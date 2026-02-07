/**
 * DXFEED Integration Module
 *
 * Professional CME futures data with 15-minute delay
 * Uses official @dxfeed/api package
 *
 * Endpoint: wss://demo.dxfeed.com/dxfeed
 *
 * Supported Symbols:
 * - /NQ, /MNQ → E-mini/Micro Nasdaq 100
 * - /ES, /MES → E-mini/Micro S&P 500
 * - /GC, /MGC → Gold/Micro Gold
 */

// ═══════════════════════════════════════════════════════════════════════════════
// OFFICIAL DXFEED CLIENT (using @dxfeed/api)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  dxFeedClient,
  getDxFeedClient,
  TradeClassifier,
  CME_SPECS,
  SYMBOL_MAP,
  getDxFeedSymbol,
  getSpec,
  alignToTick,
  type DxFeedTradeEvent,
  type DxFeedQuoteEvent,
  type DxFeedCandleEvent,
  type ClassifiedTrade,
  type CMEFuturesSpec,
} from './DxFeedClient';

export {
  DxFeedFootprintEngine,
  getDxFeedFootprintEngine,
  resetDxFeedFootprintEngine,
  type FootprintLevel,
  type FootprintCandle,
  type FootprintEngineConfig,
} from './DxFeedFootprintEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export {
  dxFeedWS,
  getDxFeedWS,
  CME_TO_DXFEED,
  CME_TICK_SIZES,
  type DxFeedQuote,
  type DxFeedTrade,
  type DxFeedCandle,
} from './DxFeedWS';

export {
  getDxFeedFootprintService,
  resetDxFeedFootprintService,
  DxFeedFootprintService,
  type DxFeedFootprintConfig,
} from './DxFeedFootprintService';
