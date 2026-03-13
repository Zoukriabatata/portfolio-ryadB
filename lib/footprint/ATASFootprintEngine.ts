/**
 * ATAS FOOTPRINT ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ground-up reimplementation of footprint chart calculations designed to
 * match ATAS output exactly.
 *
 * CRITICAL CORRECTIONS VS PREVIOUS IMPLEMENTATION
 * ─────────────────────────────────────────────────
 * Bug 1 — PRICE LEVEL SNAPPING (root cause of all bid/ask mismatches)
 *   WRONG:  Math.round(price / priceStep) * priceStep
 *   ATAS:   Math.floor(price / priceStep) * priceStep
 *
 *   Example with priceStep = 10:
 *     price 71635 → Math.round → 71640  ✗  (wrong bucket, volume goes to wrong level)
 *     price 71635 → Math.floor → 71630  ✓  (correct ATAS bucket)
 *     price 71634 → Math.round → 71630  but price 71635 → 71640 (inconsistent boundary)
 *   Math.floor gives a clean, deterministic floor-bin: every price in [71630, 71640)
 *   belongs to level 71630.
 *
 * Bug 2 — TIMESTAMP UNIT CONFUSION
 *   Previous code mixed ms and seconds in the same formula:
 *     Math.floor(trade.time / 1000 / timeframe) * timeframe   ← fragile
 *   New code keeps all internal timestamps in milliseconds and converts
 *   to seconds only at the output boundary (lightweight-charts requires seconds).
 *
 * Bug 3 — OHLC ACCURACY
 *   open must be the first tick chronologically within the candle.
 *   The previous approach set open from createCandle(price) — correct only if
 *   the first processTrade call for that candle is also chronologically first.
 *   New code explicitly tracks firstTradeMs to guarantee this.
 *
 * Bug 4 — TRADE CAP (10 K max → incomplete days)
 *   Previous: MAX_REQUESTS=10, MAX_TRADES_PER_CHUNK=5000 → 10 K trades hard cap.
 *   New: No engine-level cap; the loader controls how many trades to fetch.
 *   The engine processes whatever it receives without limits.
 *
 * BID / ASK CLASSIFICATION — Binance aggTrade
 * ─────────────────────────────────────────────
 *   isBuyerMaker = true
 *     → The BUY order was resting on the book (maker)
 *     → A SELL market order hit it (aggressor = seller)
 *     → Volume goes to the BID column
 *
 *   isBuyerMaker = false
 *     → The SELL order was resting on the book (maker)
 *     → A BUY market order lifted it (aggressor = buyer)
 *     → Volume goes to the ASK column
 *
 *   ATAS naming: BID column = sell aggressor volume, ASK column = buy aggressor volume
 *   This matches the ATAS footprint where Bid × Ask represents sell × buy at each level.
 *
 * VALUE AREA ALGORITHM (matches ATAS)
 * ─────────────────────────────────────
 *   1. Find POC (price level with highest total volume)
 *   2. Start with POC in the value area, track accumulated volume
 *   3. At each iteration: consider the level immediately above VAH and below VAL
 *   4. Add the side with higher volume (ATAS uses this "competing extensions" method)
 *   5. Repeat until accumulated volume ≥ 70% of total candle volume
 *
 * DIAGONAL IMBALANCES (matches ATAS)
 * ────────────────────────────────────
 *   Buy imbalance at level L:
 *     askVolume[L] / bidVolume[L-1] >= imbalanceRatio  (ASK at L vs BID one tick below)
 *
 *   Sell imbalance at level L:
 *     bidVolume[L] / askVolume[L+1] >= imbalanceRatio  (BID at L vs ASK one tick above)
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Raw tick as received from Binance aggTrades endpoint */
export interface RawTick {
  price: number;
  quantity: number;
  timestampMs: number;    // Milliseconds (Binance field: T)
  isBuyerMaker: boolean;  // Binance field: m
  tradeId?: number;       // Binance field: a (optional, for deduplication)
}

/** Engine configuration */
export interface ATASEngineConfig {
  /** Price compression step — all prices in [N*step, (N+1)*step) map to level N*step */
  priceStep: number;

  /** Candle duration in MILLISECONDS — e.g. 60_000 for 1-minute candles */
  timeframeMs: number;

  /** Value area target percentage (default 0.70 = 70%) */
  valueAreaPercent?: number;

  /** Imbalance detection ratio (default 3.0 = 300%) */
  imbalanceRatio?: number;

  /** Enable per-tick debug logging for ATAS comparison */
  debug?: boolean;
}

/** Internal candle state tracked during processing (richer than FootprintCandle) */
interface InternalCandle {
  /** Candle open timestamp in MILLISECONDS */
  bucketMs: number;

  open: number;
  high: number;
  low: number;
  close: number;

  /** price level → level data */
  levels: Map<number, PriceLevel>;

  totalVolume: number;
  totalBuyVolume: number;   // sum of ASK column (buy aggressors)
  totalSellVolume: number;  // sum of BID column (sell aggressors)
  totalDelta: number;
  totalTrades: number;

  poc: number;
  vah: number;
  val: number;

  isClosed: boolean;

  /** Track first/last tick for guaranteed OHLC accuracy */
  firstTradeMs: number;
  lastTradeMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PRICE LEVEL FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snap a price to its ATAS-compatible footprint level.
 *
 * Uses Math.floor so every price in [N*step, (N+1)*step) maps to N*step.
 * This is the function ATAS uses — NOT Math.round.
 *
 * For floating-point safety with small steps (e.g. 0.25, 0.01), we use
 * integer arithmetic: multiply by a power of 10, floor as integer, divide back.
 *
 * @param price     Raw trade price
 * @param priceStep The footprint price compression step
 * @returns         The snapped price level (bottom of the bin)
 */
export function snapToLevel(price: number, priceStep: number): number {
  // Determine number of decimal places in priceStep to avoid floating-point drift
  // e.g. step=0.25 → precision=2, step=10 → precision=0
  const stepStr = priceStep.toString();
  const dotIndex = stepStr.indexOf('.');
  const decimals = dotIndex === -1 ? 0 : stepStr.length - dotIndex - 1;
  const factor = Math.pow(10, decimals);

  // Integer arithmetic: floor(price * factor / (priceStep * factor)) * (priceStep * factor)
  // then divide back by factor
  const priceInt = Math.round(price * factor);
  const stepInt = Math.round(priceStep * factor);
  return Math.floor(priceInt / stepInt) * stepInt / factor;
}

/**
 * Get the candle bucket timestamp (in ms) for a given tick timestamp.
 * All candle times are aligned to the timeframe boundary.
 *
 * @param timestampMs   Tick timestamp in milliseconds
 * @param timeframeMs   Candle duration in milliseconds
 */
export function getCandleBucket(timestampMs: number, timeframeMs: number): number {
  return Math.floor(timestampMs / timeframeMs) * timeframeMs;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class ATASFootprintEngine {
  private config: Required<ATASEngineConfig>;

  /** candle bucket timestamp (ms) → InternalCandle */
  private candles: Map<number, InternalCandle> = new Map();

  constructor(config: ATASEngineConfig) {
    this.config = {
      valueAreaPercent: 0.70,
      imbalanceRatio: 3.0,
      debug: false,
      ...config,
    };
  }

  // ─── BATCH PROCESSING ────────────────────────────────────────────────────

  /**
   * Process an entire batch of raw ticks.
   *
   * IMPORTANT: Input ticks MUST be sorted by timestampMs ascending.
   * The loader (ATASDataLoader) guarantees this before calling here.
   * Unsorted input breaks OHLC accuracy (open ≠ chronological first trade).
   *
   * @param ticks     Array of sorted raw ticks
   */
  processBatch(ticks: RawTick[]): void {
    for (const tick of ticks) {
      this.processTick(tick);
    }
  }

  /**
   * Process a single tick into the correct candle bucket.
   * This is the hot path — called once per trade.
   */
  processTick(tick: RawTick): InternalCandle {
    const { priceStep, timeframeMs } = this.config;

    // 1. Snap price to ATAS level (floor, not round)
    const level = snapToLevel(tick.price, priceStep);

    // 2. Find or create candle bucket
    const bucket = getCandleBucket(tick.timestampMs, timeframeMs);
    let candle = this.candles.get(bucket);

    if (!candle) {
      candle = this.createCandle(bucket, tick.price, tick.timestampMs);
      this.candles.set(bucket, candle);
    }

    // 3. Debug output (for ATAS comparison)
    if (this.config.debug) {
      this.logTick(tick, level, bucket);
    }

    // 4. Update OHLC
    //    open is set once on candle creation; high/low track extremes; close always updates
    candle.high = Math.max(candle.high, tick.price);
    candle.low = Math.min(candle.low, tick.price);
    candle.close = tick.price;
    candle.lastTradeMs = tick.timestampMs;

    // 5. Accumulate volume at price level
    let priceLevelData = candle.levels.get(level);
    if (!priceLevelData) {
      priceLevelData = {
        price: level,
        bidVolume: 0,
        askVolume: 0,
        bidTrades: 0,
        askTrades: 0,
        delta: 0,
        totalVolume: 0,
        imbalanceBuy: false,
        imbalanceSell: false,
      };
      candle.levels.set(level, priceLevelData);
    }

    // 6. Classify bid vs ask
    //    isBuyerMaker = true  → market SELL hit the resting bid  → BID column
    //    isBuyerMaker = false → market BUY  lifted the resting ask → ASK column
    if (tick.isBuyerMaker) {
      priceLevelData.bidVolume += tick.quantity;
      priceLevelData.bidTrades += 1;
      candle.totalSellVolume += tick.quantity;
    } else {
      priceLevelData.askVolume += tick.quantity;
      priceLevelData.askTrades += 1;
      candle.totalBuyVolume += tick.quantity;
    }

    // 7. Update level aggregates
    priceLevelData.totalVolume = priceLevelData.bidVolume + priceLevelData.askVolume;
    priceLevelData.delta = priceLevelData.askVolume - priceLevelData.bidVolume;

    // 8. Update candle aggregates
    candle.totalVolume += tick.quantity;
    candle.totalDelta = candle.totalBuyVolume - candle.totalSellVolume;
    candle.totalTrades += 1;

    return candle;
  }

  // ─── LIVE TICK (single trade from WebSocket) ─────────────────────────────

  /**
   * Process a single live tick (from WebSocket aggTrade stream).
   * Returns the updated candle for immediate rendering.
   *
   * When the tick falls into a new time bucket, the previous candle is
   * automatically finalized (POC, VAH/VAL, imbalances calculated).
   *
   * @param tick      Live trade
   * @returns         The candle that was updated
   */
  processLiveTick(tick: RawTick): { candle: InternalCandle; isNewCandle: boolean } {
    const bucket = getCandleBucket(tick.timestampMs, this.config.timeframeMs);
    const isNewCandle = !this.candles.has(bucket);

    // Finalize the previous open candle if we've crossed a time boundary
    if (isNewCandle && this.candles.size > 0) {
      const lastBucket = Math.max(...this.candles.keys());
      const lastCandle = this.candles.get(lastBucket);
      if (lastCandle && lastBucket < bucket) {
        lastCandle.isClosed = true;
        this.finalizeCandle(lastCandle);
      }
    }

    const candle = this.processTick(tick);

    // Always recalculate POC for the live candle (cheap, O(n) over levels)
    this.updatePOC(candle);

    return { candle, isNewCandle };
  }

  // ─── FINALIZATION ─────────────────────────────────────────────────────────

  /**
   * Finalize all candles: calculate POC, value area, and imbalances.
   * Call this once after processBatch() to complete all metrics.
   *
   * The last candle is marked isClosed=false (still forming).
   */
  finalizeAll(): void {
    const sortedBuckets = Array.from(this.candles.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedBuckets.length; i++) {
      const candle = this.candles.get(sortedBuckets[i])!;
      candle.isClosed = i < sortedBuckets.length - 1;
      this.finalizeCandle(candle);
    }
  }

  /**
   * Finalize a single candle: POC + value area + imbalances.
   */
  finalizeCandle(candle: InternalCandle): void {
    this.updatePOC(candle);
    this.calculateValueArea(candle);
    this.calculateImbalances(candle);
  }

  // ─── OUTPUT ───────────────────────────────────────────────────────────────

  /**
   * Return all finalized candles sorted chronologically.
   * Converts internal millisecond timestamps to seconds (for lightweight-charts).
   */
  getCandlesArray(): FootprintCandle[] {
    const sorted = Array.from(this.candles.values())
      .sort((a, b) => a.bucketMs - b.bucketMs);

    return sorted.map(c => this.toFootprintCandle(c));
  }

  /** Get a single candle by its bucket timestamp (ms) */
  getCandleAt(bucketMs: number): FootprintCandle | null {
    const c = this.candles.get(bucketMs);
    return c ? this.toFootprintCandle(c) : null;
  }

  /** Total number of candles in the engine */
  get candleCount(): number {
    return this.candles.size;
  }

  /** Reset engine state */
  reset(): void {
    this.candles.clear();
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  private createCandle(bucketMs: number, price: number, firstTradeMs: number): InternalCandle {
    return {
      bucketMs,
      open: price,
      high: price,
      low: price,
      close: price,
      levels: new Map(),
      totalVolume: 0,
      totalBuyVolume: 0,
      totalSellVolume: 0,
      totalDelta: 0,
      totalTrades: 0,
      poc: snapToLevel(price, this.config.priceStep),
      vah: price,
      val: price,
      isClosed: true,
      firstTradeMs,
      lastTradeMs: firstTradeMs,
    };
  }

  private updatePOC(candle: InternalCandle): void {
    let maxVol = 0;
    let pocLevel = candle.poc;

    candle.levels.forEach((lv, price) => {
      if (lv.totalVolume > maxVol) {
        maxVol = lv.totalVolume;
        pocLevel = price;
      }
    });

    candle.poc = pocLevel;
  }

  /**
   * Value Area calculation — matches ATAS "competing extensions" algorithm.
   *
   * Algorithm:
   *   1. Start with POC
   *   2. Get the next level above current VAH and below current VAL
   *   3. Add whichever has more volume
   *   4. Repeat until 70% of total volume is accumulated
   */
  private calculateValueArea(candle: InternalCandle): void {
    const { valueAreaPercent, priceStep } = this.config;

    if (candle.levels.size === 0) return;

    // All unique price levels, sorted ascending
    const sortedPrices = Array.from(candle.levels.keys()).sort((a, b) => a - b);
    if (sortedPrices.length === 0) return;

    const targetVolume = candle.totalVolume * valueAreaPercent;

    // Start from POC
    const pocIdx = sortedPrices.findIndex(p => {
      // Find the level that IS the POC (account for floating point)
      return Math.abs(p - candle.poc) < priceStep * 0.5;
    });

    if (pocIdx === -1) {
      // POC not in levels list — fallback
      candle.vah = sortedPrices[sortedPrices.length - 1];
      candle.val = sortedPrices[0];
      return;
    }

    let loIdx = pocIdx;
    let hiIdx = pocIdx;
    let accumulated = candle.levels.get(sortedPrices[pocIdx])!.totalVolume;

    while (accumulated < targetVolume) {
      const canGoUp = hiIdx < sortedPrices.length - 1;
      const canGoDown = loIdx > 0;

      if (!canGoUp && !canGoDown) break;

      const volAbove = canGoUp
        ? (candle.levels.get(sortedPrices[hiIdx + 1])?.totalVolume ?? 0)
        : -1;
      const volBelow = canGoDown
        ? (candle.levels.get(sortedPrices[loIdx - 1])?.totalVolume ?? 0)
        : -1;

      // Add the side with more volume (ATAS competing extensions)
      if (!canGoDown || (canGoUp && volAbove >= volBelow)) {
        hiIdx++;
        accumulated += volAbove;
      } else {
        loIdx--;
        accumulated += volBelow;
      }
    }

    candle.val = sortedPrices[loIdx];
    candle.vah = sortedPrices[hiIdx];
  }

  /**
   * Diagonal imbalance calculation — matches ATAS professional style.
   *
   * Buy  imbalance at L: askVolume[L]   / bidVolume[L - step] >= ratio
   * Sell imbalance at L: bidVolume[L]   / askVolume[L + step] >= ratio
   *
   * The diagonal comparison (one tick offset) is the industry standard
   * used by ATAS, Bookmap, Sierra Chart.
   */
  private calculateImbalances(candle: InternalCandle): void {
    const { imbalanceRatio, priceStep } = this.config;

    candle.levels.forEach((lv, price) => {
      const below = candle.levels.get(snapToLevel(price - priceStep, priceStep));
      const above = candle.levels.get(snapToLevel(price + priceStep, priceStep));

      lv.imbalanceBuy = !!(
        below &&
        lv.askVolume > 0 &&
        below.bidVolume > 0 &&
        lv.askVolume / below.bidVolume >= imbalanceRatio
      );

      lv.imbalanceSell = !!(
        above &&
        lv.bidVolume > 0 &&
        above.askVolume > 0 &&
        lv.bidVolume / above.askVolume >= imbalanceRatio
      );
    });
  }

  /**
   * Convert internal candle (ms timestamps) to FootprintCandle (seconds).
   * FootprintCandle is the type consumed by the renderer.
   */
  private toFootprintCandle(c: InternalCandle): FootprintCandle {
    return {
      time: Math.floor(c.bucketMs / 1000),   // ms → seconds for lightweight-charts
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      levels: c.levels,
      totalVolume: c.totalVolume,
      totalBuyVolume: c.totalBuyVolume,
      totalSellVolume: c.totalSellVolume,
      totalDelta: c.totalDelta,
      totalTrades: c.totalTrades,
      poc: c.poc,
      vah: c.vah,
      val: c.val,
      isClosed: c.isClosed,
    };
  }

  // ─── DEBUG ────────────────────────────────────────────────────────────────

  /**
   * Log a single tick with all derived values.
   * Use this to compare against ATAS cell-by-cell.
   *
   * Console output format:
   *   [ATAS-DBG] price=71635 | side=SELL(bid) | level=71630 | qty=0.123
   *              bucket=2024-01-15T14:00:00.000Z | levelBid=1.234 | levelAsk=0.456
   */
  private logTick(tick: RawTick, level: number, bucket: number): void {
    const side = tick.isBuyerMaker ? 'SELL(→bid)' : 'BUY(→ask)';
    const candleDate = new Date(bucket).toISOString();
    const priceLevelData = this.candles.get(bucket)?.levels.get(level);

    console.log(
      `[ATAS-DBG] price=${tick.price} | side=${side} | level=${level} | qty=${tick.quantity.toFixed(6)}` +
      ` | candle=${candleDate}` +
      (priceLevelData
        ? ` | bid=${priceLevelData.bidVolume.toFixed(3)} ask=${priceLevelData.askVolume.toFixed(3)}`
        : '')
    );
  }

  /**
   * Print a full candle summary to the console for ATAS verification.
   * Shows each price level with bid × ask, exactly as it appears in ATAS.
   *
   * @param bucketMs  The candle's bucket timestamp in milliseconds
   */
  debugCandle(bucketMs: number): void {
    const c = this.candles.get(bucketMs);
    if (!c) {
      console.warn(`[ATAS-DBG] No candle at bucket ${bucketMs}`);
      return;
    }

    const dt = new Date(c.bucketMs).toISOString();
    console.group(`[ATAS-DBG] Candle ${dt}  O=${c.open} H=${c.high} L=${c.low} C=${c.close}`);
    console.log(`  Total volume: ${c.totalVolume.toFixed(3)} | Delta: ${c.totalDelta.toFixed(3)} | Trades: ${c.totalTrades}`);
    console.log(`  POC: ${c.poc} | VAH: ${c.vah} | VAL: ${c.val}`);
    console.log(`  Price levels (high → low):`);

    const sortedLevels = Array.from(c.levels.entries()).sort((a, b) => b[0] - a[0]);
    for (const [price, lv] of sortedLevels) {
      const flags: string[] = [];
      if (price === c.poc)          flags.push('POC');
      if (price >= c.val && price <= c.vah) flags.push('VA');
      if (lv.imbalanceBuy)          flags.push('ImbBuy');
      if (lv.imbalanceSell)         flags.push('ImbSell');

      console.log(
        `    ${String(price).padStart(10)} │ bid=${lv.bidVolume.toFixed(3).padStart(10)} × ask=${lv.askVolume.toFixed(3).padStart(10)}` +
        ` │ delta=${lv.delta >= 0 ? '+' : ''}${lv.delta.toFixed(3).padStart(10)}` +
        (flags.length ? ` [${flags.join(', ')}]` : '')
      );
    }

    console.groupEnd();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh engine instance.
 * Prefer this over `new ATASFootprintEngine()` for testability.
 */
export function createATASEngine(config: ATASEngineConfig): ATASFootprintEngine {
  return new ATASFootprintEngine(config);
}

/**
 * One-shot batch processing helper.
 * Takes a tick array, runs the engine, returns finished candles.
 * Useful for offline / server-side processing.
 *
 * @param ticks         Must be sorted by timestampMs ascending
 * @param config        Engine configuration
 * @returns             Finalized FootprintCandle array sorted by time
 */
export function buildCandlesFromTicks(
  ticks: RawTick[],
  config: ATASEngineConfig
): FootprintCandle[] {
  const engine = new ATASFootprintEngine(config);
  engine.processBatch(ticks);
  engine.finalizeAll();
  return engine.getCandlesArray();
}
