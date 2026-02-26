/**
 * ReplayClusterMap
 *
 * Aggregates trades into time-bucketed clusters showing buy/sell volume
 * at each price level. Used for the "Cluster Static" overlay.
 *
 * Each cluster spans a configurable time interval (e.g. 60s).
 * Within each cluster, trades are grouped by rounded price (tick size).
 */

export interface ClusterCell {
  price: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  delta: number;         // buy - sell
  tradeCount: number;
}

export interface ClusterColumn {
  startTime: number;
  endTime: number;
  cells: ClusterCell[];
  totalVolume: number;
  totalDelta: number;
  high: number;
  low: number;
}

export interface ClusterMapData {
  columns: ClusterColumn[];
  maxCellVolume: number;  // For normalization
  intervalMs: number;
}

export class ReplayClusterMap {
  private intervalMs: number;
  private tickSize: number;
  private buckets = new Map<number, Map<number, { buy: number; sell: number; count: number }>>();

  constructor(intervalMs: number = 60_000, tickSize: number = 0.25) {
    this.intervalMs = intervalMs;
    this.tickSize = tickSize;
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  private getBucketKey(timestamp: number): number {
    return Math.floor(timestamp / this.intervalMs) * this.intervalMs;
  }

  addTrade(price: number, size: number, side: 'BID' | 'ASK', timestamp: number): void {
    const bucketKey = this.getBucketKey(timestamp);
    const roundedPrice = this.roundToTick(price);

    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(bucketKey, bucket);
    }

    const cell = bucket.get(roundedPrice) || { buy: 0, sell: 0, count: 0 };
    if (side === 'BID') {
      cell.buy += size;
    } else {
      cell.sell += size;
    }
    cell.count++;
    bucket.set(roundedPrice, cell);
  }

  getData(maxColumns: number = 30): ClusterMapData {
    const sortedKeys = Array.from(this.buckets.keys()).sort((a, b) => a - b);
    // Take the last N columns
    const keys = sortedKeys.slice(-maxColumns);

    let maxCellVolume = 0;

    const columns: ClusterColumn[] = keys.map(key => {
      const bucket = this.buckets.get(key)!;
      let totalVolume = 0;
      let totalDelta = 0;
      let high = -Infinity;
      let low = Infinity;

      const cells: ClusterCell[] = [];
      for (const [price, vol] of bucket.entries()) {
        const total = vol.buy + vol.sell;
        const delta = vol.buy - vol.sell;
        if (total > maxCellVolume) maxCellVolume = total;
        if (price > high) high = price;
        if (price < low) low = price;
        totalVolume += total;
        totalDelta += delta;

        cells.push({
          price,
          buyVolume: vol.buy,
          sellVolume: vol.sell,
          totalVolume: total,
          delta,
          tradeCount: vol.count,
        });
      }

      // Sort cells high to low
      cells.sort((a, b) => b.price - a.price);

      return {
        startTime: key,
        endTime: key + this.intervalMs,
        cells,
        totalVolume,
        totalDelta,
        high: high === -Infinity ? 0 : high,
        low: low === Infinity ? 0 : low,
      };
    });

    return { columns, maxCellVolume, intervalMs: this.intervalMs };
  }

  reset(): void {
    this.buckets.clear();
  }
}
