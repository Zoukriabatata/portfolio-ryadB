/**
 * HISTORY BUFFER - Ring Buffer for Liquidity Time Series
 *
 * Efficient storage and retrieval of historical liquidity data.
 * Uses a ring buffer to maintain fixed memory footprint.
 */

import type {
  LiquidityCell,
  LiquidityColumn,
  CellFlags,
  LiquidityStats,
  PriceRange,
  TimeRange,
} from './types';

const DEFAULT_FLAGS: CellFlags = {
  isWall: false,
  isSpoofSuspect: false,
  isAbsorption: false,
  wallStrength: 0,
  absorptionStrength: 0,
  spoofConfidence: 0,
};

export class HistoryBuffer {
  private columns: LiquidityColumn[];
  private capacity: number;
  private headIndex: number = 0;
  private count: number = 0;
  private columnWidthMs: number;

  // Statistics cache (updated periodically)
  private statsCache: LiquidityStats | null = null;
  private statsCacheTime: number = 0;
  private statsCacheTTL: number = 1000; // Recalculate every 1s

  constructor(capacity: number = 2000, columnWidthMs: number = 250) {
    this.capacity = capacity;
    this.columnWidthMs = columnWidthMs;
    this.columns = new Array(capacity);

    // Pre-allocate columns
    for (let i = 0; i < capacity; i++) {
      this.columns[i] = this.createEmptyColumn(0);
    }
  }

  /**
   * Create an empty column
   */
  private createEmptyColumn(timestamp: number): LiquidityColumn {
    return {
      timestamp,
      cells: new Map(),
      maxBidSize: 0,
      maxAskSize: 0,
      totalBidSize: 0,
      totalAskSize: 0,
      volatility: 0,
      bestBid: 0,
      bestAsk: 0,
    };
  }

  /**
   * Push a new column to the buffer
   */
  push(
    timestamp: number,
    bids: Map<number, number>,
    asks: Map<number, number>,
    bestBid: number,
    bestAsk: number,
    volatility: number = 0
  ): void {
    const column = this.columns[this.headIndex];

    // Reset and reuse the column
    column.timestamp = timestamp;
    column.cells.clear();
    column.maxBidSize = 0;
    column.maxAskSize = 0;
    column.totalBidSize = 0;
    column.totalAskSize = 0;
    column.volatility = volatility;
    column.bestBid = bestBid;
    column.bestAsk = bestAsk;

    // Process bids
    for (const [price, size] of bids) {
      if (size <= 0) continue;

      column.maxBidSize = Math.max(column.maxBidSize, size);
      column.totalBidSize += size;

      const cell = this.getOrCreateCell(column, price, timestamp);
      cell.bidSize = size;
      cell.bidDecay = size; // Will be processed by DecayProcessor
    }

    // Process asks
    for (const [price, size] of asks) {
      if (size <= 0) continue;

      column.maxAskSize = Math.max(column.maxAskSize, size);
      column.totalAskSize += size;

      const cell = this.getOrCreateCell(column, price, timestamp);
      cell.askSize = size;
      cell.askDecay = size;
    }

    // Advance head
    this.headIndex = (this.headIndex + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);

    // Invalidate stats cache
    this.statsCache = null;
  }

  /**
   * Get or create a cell at a price level
   */
  private getOrCreateCell(
    column: LiquidityColumn,
    price: number,
    timestamp: number
  ): LiquidityCell {
    let cell = column.cells.get(price);
    if (!cell) {
      cell = {
        price,
        timestamp,
        bidSize: 0,
        askSize: 0,
        bidDecay: 0,
        askDecay: 0,
        persistence: 0,
        absorptionBid: 0,
        absorptionAsk: 0,
        flags: { ...DEFAULT_FLAGS },
      };
      column.cells.set(price, cell);
    }
    return cell;
  }

  /**
   * Get columns within a time range
   */
  getRange(startTime: number, endTime: number): LiquidityColumn[] {
    const result: LiquidityColumn[] = [];

    for (let i = 0; i < this.count; i++) {
      const index = (this.headIndex - this.count + i + this.capacity) % this.capacity;
      const column = this.columns[index];

      if (column.timestamp >= startTime && column.timestamp <= endTime) {
        result.push(column);
      }
    }

    return result;
  }

  /**
   * Get the most recent N columns
   */
  getLatest(count: number): LiquidityColumn[] {
    const actualCount = Math.min(count, this.count);
    const result: LiquidityColumn[] = [];

    for (let i = 0; i < actualCount; i++) {
      const index = (this.headIndex - actualCount + i + this.capacity) % this.capacity;
      result.push(this.columns[index]);
    }

    return result;
  }

  /**
   * Get all columns (oldest to newest)
   */
  getAll(): LiquidityColumn[] {
    return this.getLatest(this.count);
  }

  /**
   * Get the current column (most recent)
   */
  getCurrent(): LiquidityColumn | null {
    if (this.count === 0) return null;
    const index = (this.headIndex - 1 + this.capacity) % this.capacity;
    return this.columns[index];
  }

  /**
   * Get time range of buffered data
   */
  getTimeRange(): TimeRange | null {
    if (this.count === 0) return null;

    const oldest = this.columns[(this.headIndex - this.count + this.capacity) % this.capacity];
    const newest = this.columns[(this.headIndex - 1 + this.capacity) % this.capacity];

    return {
      start: oldest.timestamp,
      end: newest.timestamp,
    };
  }

  /**
   * Get price range across all buffered data
   */
  getPriceRange(): PriceRange | null {
    if (this.count === 0) return null;

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < this.count; i++) {
      const index = (this.headIndex - this.count + i + this.capacity) % this.capacity;
      const column = this.columns[index];

      for (const price of column.cells.keys()) {
        min = Math.min(min, price);
        max = Math.max(max, price);
      }
    }

    return min < max ? { min, max } : null;
  }

  /**
   * Calculate statistics for normalization
   */
  getStats(forceRecalculate: boolean = false): LiquidityStats {
    const now = Date.now();

    if (!forceRecalculate && this.statsCache && now - this.statsCacheTime < this.statsCacheTTL) {
      return this.statsCache;
    }

    const sizes: number[] = [];

    // Collect all non-zero sizes
    for (let i = 0; i < this.count; i++) {
      const index = (this.headIndex - this.count + i + this.capacity) % this.capacity;
      const column = this.columns[index];

      for (const cell of column.cells.values()) {
        if (cell.bidSize > 0) sizes.push(cell.bidSize);
        if (cell.askSize > 0) sizes.push(cell.askSize);
      }
    }

    if (sizes.length === 0) {
      this.statsCache = {
        mean: 0,
        stdDev: 1,
        min: 0,
        max: 1,
        p5: 0,
        p25: 0,
        p50: 0,
        p75: 1,
        p95: 1,
        p97: 1,
      };
      this.statsCacheTime = now;
      return this.statsCache;
    }

    // Sort for percentiles
    sizes.sort((a, b) => a - b);

    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sizes.length;
    const stdDev = Math.sqrt(variance) || 1;

    const percentile = (arr: number[], p: number): number => {
      const index = Math.floor((arr.length - 1) * p);
      return arr[index];
    };

    this.statsCache = {
      mean,
      stdDev,
      min: sizes[0],
      max: sizes[sizes.length - 1],
      p5: percentile(sizes, 0.05),
      p25: percentile(sizes, 0.25),
      p50: percentile(sizes, 0.50),
      p75: percentile(sizes, 0.75),
      p95: percentile(sizes, 0.95),
      p97: percentile(sizes, 0.97),
    };
    this.statsCacheTime = now;

    return this.statsCache;
  }

  /**
   * Apply decay to all cells
   */
  applyDecay(halfLifeMs: number, deltaMs: number): void {
    const alpha = 1 - Math.exp(-deltaMs * Math.LN2 / halfLifeMs);

    for (let i = 0; i < this.count; i++) {
      const index = (this.headIndex - this.count + i + this.capacity) % this.capacity;
      const column = this.columns[index];

      for (const cell of column.cells.values()) {
        // EMA decay
        cell.bidDecay = cell.bidDecay * (1 - alpha);
        cell.askDecay = cell.askDecay * (1 - alpha);
      }
    }
  }

  /**
   * Get buffer statistics
   */
  getBufferInfo(): {
    count: number;
    capacity: number;
    fillPercent: number;
    columnWidthMs: number;
    totalDurationMs: number;
  } {
    return {
      count: this.count,
      capacity: this.capacity,
      fillPercent: (this.count / this.capacity) * 100,
      columnWidthMs: this.columnWidthMs,
      totalDurationMs: this.count * this.columnWidthMs,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.headIndex = 0;
    this.count = 0;
    this.statsCache = null;

    for (let i = 0; i < this.capacity; i++) {
      this.columns[i] = this.createEmptyColumn(0);
    }
  }

  /**
   * Resize the buffer (preserves most recent data)
   */
  resize(newCapacity: number): void {
    const data = this.getLatest(Math.min(this.count, newCapacity));

    this.capacity = newCapacity;
    this.columns = new Array(newCapacity);
    this.headIndex = 0;
    this.count = 0;

    for (let i = 0; i < newCapacity; i++) {
      this.columns[i] = this.createEmptyColumn(0);
    }

    // Re-insert data
    for (const column of data) {
      const bids = new Map<number, number>();
      const asks = new Map<number, number>();

      for (const [price, cell] of column.cells) {
        if (cell.bidSize > 0) bids.set(price, cell.bidSize);
        if (cell.askSize > 0) asks.set(price, cell.askSize);
      }

      this.push(
        column.timestamp,
        bids,
        asks,
        column.bestBid,
        column.bestAsk,
        column.volatility
      );
    }
  }
}
