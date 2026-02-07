/**
 * Yahoo Finance Integration Module
 *
 * FREE CME futures data via Yahoo Finance
 * No API key required!
 *
 * Supported Symbols:
 * - NQ=F  → E-mini Nasdaq 100
 * - ES=F  → E-mini S&P 500
 * - YM=F  → E-mini Dow
 * - RTY=F → E-mini Russell 2000
 * - GC=F  → Gold
 * - CL=F  → Crude Oil
 */

export {
  yahooFuturesWS,
  getYahooFuturesWS,
  CME_TO_YAHOO,
  CME_TICK_SIZES,
  type YahooQuote,
  type YahooPricingData,
} from './YahooFuturesWS';

export {
  getYahooFootprintService,
  resetYahooFootprintService,
  YahooFootprintService,
  type YahooFootprintConfig,
} from './YahooFootprintService';
