/**
 * ATAS DATA LOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all trade data fetching for the ATAS footprint engine.
 *
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Previous problem: 10K trade hard cap → only loads ~10 minutes of BTC history.
 *
 * New approach — three loading modes:
 *
 *   1. WINDOW mode (default, fast)
 *      Loads the last N hours of ticks. Fast, practical for live charts.
 *      Suitable for: all pairs, all timeframes.
 *      Example: last 4 hours of BTCUSDT → ~480K trades max
 *
 *   2. FULL DAY mode (comprehensive)
 *      Loads an entire UTC trading day (00:00:00 → 23:59:59).
 *      Reconstructs all 1440 M1 candles with full footprint data.
 *      Suitable for: low/mid volume pairs (ETH, SOL, etc.)
 *      BTC note: ~2.9M trades/day → practical only with maxTradesPerChunk cap.
 *      Progress callback fires as each hour chunk completes.
 *
 *   3. SKELETON mode (instant OHLC, deferred footprint)
 *      Fetches klines for 1440-candle OHLC skeleton in 1 request.
 *      Footprint tick data loaded for the last N hours only.
 *      Remaining candles have OHLC but no bid/ask levels.
 *      Recommended for: BTC, high-frequency pairs, slow connections.
 *
 * PAGINATION STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 * Binance aggTrades endpoint returns max 1000 trades per request.
 * To cover a time window, we paginate forward using the last trade's T+1.
 *
 * To maximize throughput, the time window is split into parallel chunks:
 *   - Each chunk fetches its segment sequentially (forward pagination)
 *   - Chunks run in parallel (controlled by MAX_PARALLEL_CHUNKS)
 *   - Results from all chunks are merged and sorted before processing
 *
 * Rate limits:
 *   - Binance Futures: 2400 request-weight/minute
 *   - aggTrades limit=1000 costs 20 weight
 *   - Maximum safe: ~120 requests/minute = 2 requests/second
 *   - This loader uses 200ms inter-request delay per chunk to stay safe
 *
 * FULL DAY FEASIBILITY
 * ─────────────────────────────────────────────────────────────────────────────
 *   Pair      Trades/day    Requests needed    Time (4 parallel)
 *   BTCUSDT   ~2,000,000    ~2,000             ~240 seconds (impractical)
 *   ETHUSDT   ~600,000      ~600               ~75 seconds
 *   SOLUSDT   ~200,000      ~200               ~25 seconds
 *   Others    <100,000      <100               <13 seconds
 *
 * For BTC: use SKELETON mode. The engine correctly shows OHLC for all 1440
 * candles and full footprint for the most recent N hours.
 */

import { throttledFetch } from '@/lib/api/throttledFetch';
import type { RawTick } from './ATASFootprintEngine';

// ─── Global rate-limit backoff ─────────────────────────────────────────────
// Shared across ALL concurrent fetchChunk calls so that when one chunk hits
// a 418/429 ban, every other in-flight chunk pauses before its next request
// instead of hammering Binance simultaneously and worsening the ban.
let _backoffUntilMs = 0;

function setGlobalBackoff(ms: number): void {
  _backoffUntilMs = Math.max(_backoffUntilMs, Date.now() + ms);
}

async function waitGlobalBackoff(signal?: AbortSignal): Promise<void> {
  const delay = _backoffUntilMs - Date.now();
  if (delay <= 0) return;
  console.warn(`[ATASLoader] Global backoff: waiting ${(delay / 1000).toFixed(0)}s before next request`);
  await new Promise<void>(resolve => {
    const tid = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => { clearTimeout(tid); resolve(); }, { once: true });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LoadMode = 'window' | 'fullday' | 'skeleton';

export interface LoadConfig {
  /** Binance symbol, e.g. "BTCUSDT" */
  symbol: string;

  /** Loading mode (default: 'window') */
  mode?: LoadMode;

  /** WINDOW mode: hours to look back from now (default: 24) */
  hoursBack?: number;

  /** FULLDAY mode: date as UTC midnight milliseconds. If omitted, uses today. */
  dayStartMs?: number;

  /**
   * Maximum trades to fetch per time chunk.
   * Lower = faster load, less complete data.
   * null = no cap (fetch everything in the chunk).
   * Default: null for ETHUSDT/others, 50_000 for BTCUSDT.
   */
  maxTradesPerChunk?: number | null;

  /**
   * Number of parallel time chunks.
   * Higher = faster overall load but more concurrent requests.
   * Default: 2 (reduced from 4 to avoid triggering Binance 418 IP bans)
   */
  parallelChunks?: number;

  /**
   * AbortSignal to cancel an in-progress load.
   */
  signal?: AbortSignal;

  /**
   * SKELETON mode: Binance kline interval string ('1m', '5m', '15m', '1h', …)
   * Defaults to '1m'.
   */
  intervalStr?: string;

  /**
   * SKELETON mode: number of kline candles to fetch.
   * Defaults to 1440 (full day at 1m).
   */
  skeletonLimit?: number;
}

export type ProgressCallback = (
  percent: number,
  message: string,
  partialTicks?: RawTick[]
) => void;

/** Binance aggTrade response shape */
interface BinanceAggTrade {
  a: number;   // Aggregate trade ID
  p: string;   // Price
  q: string;   // Quantity
  T: number;   // Trade time (ms)
  m: boolean;  // isBuyerMaker
}

/** Kline (candlestick) entry from Binance */
interface BinanceKline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OHLC SKELETON (from klines — used in skeleton mode)
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCSkeleton {
  /** Unix seconds (lightweight-charts format) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Load OHLC skeleton from Binance klines — 1 request covers 1500 candles.
 * Used in skeleton mode to provide OHLC for all 1440 daily candles instantly.
 *
 * @param symbol        e.g. "BTCUSDT"
 * @param startMs       Start of day (UTC midnight) in ms
 * @param intervalStr   Binance interval string: "1m", "5m", etc.
 * @param limit         Max candles (default 1440 for full M1 day)
 */
export async function loadOHLCSkeleton(
  symbol: string,
  startMs: number,
  intervalStr: string = '1m',
  limit: number = 1440,
  signal?: AbortSignal
): Promise<OHLCSkeleton[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval: intervalStr,
    startTime: startMs.toString(),
    limit: Math.min(limit, 1500).toString(),
  });

  let data: unknown[][] = [];
  let retryCount = 0;
  const MAX_RETRIES = 4;
  while (retryCount <= MAX_RETRIES) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await throttledFetch(`/api/binance/fapi/v1/klines?${params}`, { signal });
    if (response.status === 429 || response.status === 418) {
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
      const baseWait   = response.status === 418 ? 30_000 : 2_000; // 418 = IP ban, wait longer
      const waitMs     = Math.max(retryAfter * 1000, baseWait) * Math.pow(2, retryCount);
      console.warn(`[ATASLoader] Klines ${response.status}, retry ${retryCount + 1}/${MAX_RETRIES} in ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      retryCount++;
      continue;
    }
    if (!response.ok) throw new Error(`Klines request failed: ${response.status}`);
    data = await response.json() as unknown[][];
    break;
  }

  return data.map(k => ({
    time: Math.floor((k[0] as number) / 1000),
    open:   parseFloat(k[1] as string),
    high:   parseFloat(k[2] as string),
    low:    parseFloat(k[3] as string),
    close:  parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TICK LOADER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load raw ticks for a time range, with pagination and parallel chunks.
 *
 * Returns ticks sorted by timestampMs ascending (CRITICAL for OHLC accuracy).
 * Fires the progress callback as each chunk completes.
 *
 * @param symbol        e.g. "BTCUSDT"
 * @param startMs       Range start (inclusive) in milliseconds
 * @param endMs         Range end (exclusive) in milliseconds
 * @param config        Loader configuration
 * @param onProgress    Optional progress callback
 */
export async function loadTickRange(
  symbol: string,
  startMs: number,
  endMs: number,
  config: Pick<LoadConfig, 'maxTradesPerChunk' | 'parallelChunks' | 'signal'> = {},
  onProgress?: ProgressCallback
): Promise<RawTick[]> {
  const {
    maxTradesPerChunk = null,
    parallelChunks = 2,
    signal,
  } = config;

  const totalDuration = endMs - startMs;
  const chunkDuration = Math.ceil(totalDuration / parallelChunks);

  // Build non-overlapping time chunks
  const chunks: { start: number; end: number; index: number }[] = [];
  for (let i = 0; i < parallelChunks; i++) {
    const chunkStart = startMs + i * chunkDuration;
    const chunkEnd = Math.min(chunkStart + chunkDuration, endMs);
    if (chunkStart < endMs) {
      chunks.push({ start: chunkStart, end: chunkEnd, index: i });
    }
  }

  let completedChunks = 0;
  const totalChunks = chunks.length;

  onProgress?.(0, `Starting ${totalChunks} parallel streams for ${symbol}...`);

  // Fetch all chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map(chunk =>
      fetchChunk(symbol, chunk.start, chunk.end, maxTradesPerChunk, signal).then(ticks => {
        completedChunks++;
        const pct = (completedChunks / totalChunks) * 90;
        onProgress?.(pct, `Loaded chunk ${completedChunks}/${totalChunks} (${ticks.length.toLocaleString()} trades)`, ticks);
        return ticks;
      })
    )
  );

  // Merge all chunks — each chunk is already sorted internally
  // Final sort ensures strict global order (handles any timestamp overlap between chunks)
  let allTicks: RawTick[] = [];
  for (const chunk of chunkResults) {
    allTicks = allTicks.concat(chunk);
  }

  // Sort by timestamp — critical for OHLC correctness
  allTicks.sort((a, b) => a.timestampMs - b.timestampMs);

  // Deduplicate by tradeId if available (prevents double-counting at chunk boundaries)
  const seen = new Set<number>();
  const deduped: RawTick[] = [];
  for (const tick of allTicks) {
    if (tick.tradeId !== undefined) {
      if (seen.has(tick.tradeId)) continue;
      seen.add(tick.tradeId);
    }
    deduped.push(tick);
  }

  onProgress?.(100, `Ready: ${deduped.length.toLocaleString()} ticks loaded`);
  return deduped;
}

/**
 * Fetch a single time chunk with sequential forward pagination.
 * This is the inner pagination loop that Binance requires.
 *
 * Each request returns up to 1000 trades. We advance `currentStart`
 * to last_trade_T + 1 after each page until the chunk end is reached
 * or the trade cap is hit.
 */
async function fetchChunk(
  symbol: string,
  startMs: number,
  endMs: number,
  maxTrades: number | null,
  signal?: AbortSignal
): Promise<RawTick[]> {
  const trades: RawTick[] = [];
  let currentStart = startMs;
  let pageCount = 0;

  while (currentStart < endMs) {
    if (signal?.aborted) break;

    // Respect per-chunk trade cap
    if (maxTrades !== null && trades.length >= maxTrades) break;

    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      startTime: currentStart.toString(),
      endTime: endMs.toString(),
      limit: '1000',
    });

    let data: BinanceAggTrade[] = [];

    // Retry loop for 429 rate-limit responses
    let retryCount = 0;
    const MAX_RETRIES = 4;
    let fetchOk = false;

    while (retryCount <= MAX_RETRIES) {
      if (signal?.aborted) break;
      // Wait if another chunk already triggered a global backoff
      await waitGlobalBackoff(signal);
      if (signal?.aborted) break;
      try {
        const response = await throttledFetch(
          `/api/binance/fapi/v1/aggTrades?${params}`,
          { signal }
        );

        if (response.status === 429 || response.status === 418) {
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
          const baseWait   = response.status === 418 ? 60_000 : 3_000;
          const waitMs     = Math.max(retryAfter * 1000, baseWait) * Math.pow(2, retryCount);
          // Broadcast the backoff to all concurrent chunk fetchers
          setGlobalBackoff(waitMs);
          console.warn(`[ATASLoader] aggTrades ${response.status}, global backoff ${(waitMs / 1000).toFixed(0)}s (retry ${retryCount + 1}/${MAX_RETRIES})`);
          await waitGlobalBackoff(signal);
          retryCount++;
          continue;
        }

        if (!response.ok) {
          console.error(`[ATASLoader] HTTP ${response.status} fetching chunk`);
          break;
        }

        data = await response.json() as BinanceAggTrade[];
        fetchOk = true;
        break;
      } catch (err) {
        if ((err as Error).name === 'AbortError') break;
        console.error('[ATASLoader] Fetch error:', err);
        break;
      }
    }

    if (!fetchOk) break;

    if (!Array.isArray(data) || data.length === 0) break;

    // Parse Binance format → RawTick
    for (const t of data) {
      trades.push({
        tradeId:      t.a,
        price:        parseFloat(t.p),
        quantity:     parseFloat(t.q),
        timestampMs:  t.T,
        isBuyerMaker: t.m,
      });
    }

    pageCount++;

    // Advance cursor: last trade time + 1 ms (avoids re-fetching same trade)
    const lastT = data[data.length - 1].T;
    if (lastT <= currentStart) break;  // No progress — safety exit
    currentStart = lastT + 1;

    // If page returned fewer than 1000 trades, we've reached the end
    if (data.length < 1000) break;
  }

  console.log(`[ATASLoader] Chunk ${startMs}-${endMs}: ${trades.length} trades in ${pageCount} pages`);
  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL LOADERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the most recent N hours of tick data (WINDOW mode).
 * This is the default for live charts — fast, always fresh.
 *
 * @param symbol        e.g. "BTCUSDT"
 * @param hoursBack     How many hours to look back (default: 24)
 * @param config        Additional loader options
 * @param onProgress    Optional progress callback
 */
export async function loadRecentWindow(
  symbol: string,
  hoursBack: number = 24,
  config: Omit<LoadConfig, 'symbol' | 'mode' | 'hoursBack'> = {},
  onProgress?: ProgressCallback
): Promise<RawTick[]> {
  const now = Date.now();
  const startMs = now - hoursBack * 60 * 60 * 1000;

  return loadTickRange(symbol, startMs, now, config, onProgress);
}

/**
 * Load a full UTC trading day (FULLDAY mode).
 * Fetches from 00:00:00 UTC to 23:59:59 UTC on the specified day.
 *
 * WARNING: For BTCUSDT this can require 1000-2000+ HTTP requests.
 * Use maxTradesPerChunk to cap the load time at the cost of completeness.
 * For most pairs (ETH, SOL, etc.) this is fully practical.
 *
 * @param symbol        e.g. "ETHUSDT"
 * @param dayStartMs    UTC midnight of the target day. Defaults to today.
 * @param config        Loader config (consider setting maxTradesPerChunk)
 * @param onProgress    Progress callback — fires per chunk
 */
export async function loadFullDay(
  symbol: string,
  dayStartMs?: number,
  config: Omit<LoadConfig, 'symbol' | 'mode' | 'dayStartMs'> = {},
  onProgress?: ProgressCallback
): Promise<RawTick[]> {
  // Default to today's UTC midnight
  const startMs = dayStartMs ?? getTodayUTCMidnight();
  const endMs   = startMs + 24 * 60 * 60 * 1000;  // exactly 24 hours

  // Use 24 chunks (1 hour each) for full-day loading
  const fullDayConfig: typeof config = {
    parallelChunks: 24,
    ...config,
  };

  return loadTickRange(symbol, startMs, endMs, fullDayConfig, onProgress);
}

/**
 * Get UTC midnight for today as milliseconds.
 */
export function getTodayUTCMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Get UTC midnight for a specific date string (YYYY-MM-DD).
 */
export function getUTCMidnight(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED LOADER (used by the footprint chart component)
// ─────────────────────────────────────────────────────────────────────────────

export interface FootprintLoadResult {
  /** Raw ticks sorted by timestampMs ascending */
  ticks: RawTick[];

  /** OHLC skeleton candles (only present in skeleton mode) */
  skeleton?: OHLCSkeleton[];

  /** Number of HTTP requests made */
  requestCount: number;

  /** Load duration in milliseconds */
  durationMs: number;
}

/**
 * Master loader — selects the right strategy based on mode.
 *
 * Recommended mode per pair:
 *   BTCUSDT → 'skeleton' (too many trades for full day)
 *   ETHUSDT → 'window' (4h default) or 'fullday' (25 seconds)
 *   Others  → 'window' or 'fullday'
 *
 * @param config           Full load configuration
 * @param onProgress       Progress callback
 * @param onSkeletonReady  Skeleton mode only: fired after OHLC is loaded, before ticks.
 *                         Use to display the chart immediately while ticks load in background.
 */
export async function loadFootprintData(
  config: LoadConfig,
  onProgress?: ProgressCallback,
  onSkeletonReady?: (skeleton: OHLCSkeleton[]) => void
): Promise<FootprintLoadResult> {
  const startTime = performance.now();

  const {
    symbol,
    mode = 'window',
    hoursBack = 24,
    dayStartMs,
    maxTradesPerChunk = null,
    parallelChunks = 2,
    signal,
    intervalStr = '1m',
    skeletonLimit = 1440,
  } = config;

  const loaderConfig = { maxTradesPerChunk, parallelChunks, signal };

  let ticks: RawTick[] = [];
  let skeleton: OHLCSkeleton[] | undefined;

  switch (mode) {
    case 'window': {
      onProgress?.(0, `Loading last ${hoursBack}h of ticks for ${symbol}...`);
      ticks = await loadRecentWindow(symbol, hoursBack, loaderConfig, onProgress);
      break;
    }

    case 'fullday': {
      onProgress?.(0, `Loading full trading day for ${symbol}...`);
      ticks = await loadFullDay(symbol, dayStartMs, loaderConfig, onProgress);
      break;
    }

    case 'skeleton': {
      // Fetch klines and ticks in parallel — they are independent
      onProgress?.(5, `Loading OHLC skeleton + ticks for ${symbol}...`);
      const dayStart = dayStartMs ?? getTodayUTCMidnight();

      const [skeletonResult, ticksResult] = await Promise.all([
        loadOHLCSkeleton(symbol, dayStart, intervalStr, skeletonLimit, signal).then(sk => {
          onProgress?.(15, `OHLC skeleton: ${sk.length} candles loaded`);
          // Notify caller that skeleton is ready — allows early chart display
          onSkeletonReady?.(sk);
          return sk;
        }),
        loadRecentWindow(
          symbol,
          hoursBack,
          loaderConfig,
          (pct, msg, partial) => onProgress?.(20 + pct * 0.8, msg, partial)
        ),
      ]);

      skeleton = skeletonResult;
      ticks = ticksResult;
      break;
    }
  }

  const durationMs = performance.now() - startTime;

  // Estimate requests made (not exact but useful for logging)
  const requestCount = Math.ceil(ticks.length / 1000) + (skeleton ? 1 : 0);

  console.log(
    `[ATASLoader] ${mode} mode: ${ticks.length.toLocaleString()} ticks` +
    ` in ${(durationMs / 1000).toFixed(1)}s (~${requestCount} requests)`
  );

  return { ticks, skeleton, requestCount, durationMs };
}
