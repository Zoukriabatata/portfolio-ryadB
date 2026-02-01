/**
 * API UTILITIES
 *
 * Data fetching utilities for historical data
 */

export {
  fetchHistoricalCandles,
  fetchInitialHistory,
  loadMoreHistory,
  getCachedHistory,
  clearHistoryCache,
  getIntervalMs,
  calculateFetchLimit,
  type HistoricalDataOptions,
  type HistoricalDataResponse,
} from './historicalData';

export { fetchHistoricalTrades } from './fetchHistoricalTrades';
