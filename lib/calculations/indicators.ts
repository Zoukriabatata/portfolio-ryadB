import type { Candle, Trade } from '@/types/market';

export interface VolumeProfileLevel {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  percentage: number; // % of total volume
}

export interface VolumeProfile {
  levels: VolumeProfileLevel[];
  poc: number; // Point of Control (price with highest volume)
  vah: number; // Value Area High (70% of volume)
  val: number; // Value Area Low
  totalVolume: number;
}

export interface ClusterLevel {
  price: number;
  bid: number;
  ask: number;
  volume: number;
  delta: number;
  deltaPercent: number;
}

export interface VWAPData {
  time: number;
  vwap: number;
  upperBand1: number; // +1 std dev
  lowerBand1: number; // -1 std dev
  upperBand2: number; // +2 std dev
  lowerBand2: number; // -2 std dev
}

export interface TWAPData {
  time: number;
  twap: number;
}

/**
 * Calculate Volume Profile from candles
 */
export function calculateVolumeProfile(
  candles: Candle[],
  tickSize: number = 1,
  valueAreaPercent: number = 0.7
): VolumeProfile {
  if (candles.length === 0) {
    return { levels: [], poc: 0, vah: 0, val: 0, totalVolume: 0 };
  }

  // Find price range
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  candles.forEach(c => {
    minPrice = Math.min(minPrice, c.low);
    maxPrice = Math.max(maxPrice, c.high);
  });

  // Round to tick size
  minPrice = Math.floor(minPrice / tickSize) * tickSize;
  maxPrice = Math.ceil(maxPrice / tickSize) * tickSize;

  // Create price levels
  const volumeByPrice = new Map<number, { buy: number; sell: number }>();

  candles.forEach(candle => {
    // Distribute volume across the candle's price range
    const priceRange = candle.high - candle.low;
    const isBullish = candle.close >= candle.open;

    for (let price = Math.floor(candle.low / tickSize) * tickSize; price <= candle.high; price += tickSize) {
      if (!volumeByPrice.has(price)) {
        volumeByPrice.set(price, { buy: 0, sell: 0 });
      }

      const level = volumeByPrice.get(price)!;
      // Approximate volume distribution
      const volumeAtLevel = candle.volume / Math.max(1, Math.ceil(priceRange / tickSize));

      if (isBullish) {
        level.buy += volumeAtLevel * 0.6;
        level.sell += volumeAtLevel * 0.4;
      } else {
        level.buy += volumeAtLevel * 0.4;
        level.sell += volumeAtLevel * 0.6;
      }
    }
  });

  // Convert to array and calculate totals
  let totalVolume = 0;
  let maxVolume = 0;
  let pocPrice = 0;

  const levels: VolumeProfileLevel[] = [];

  volumeByPrice.forEach((vol, price) => {
    const volume = vol.buy + vol.sell;
    totalVolume += volume;

    if (volume > maxVolume) {
      maxVolume = volume;
      pocPrice = price;
    }

    levels.push({
      price,
      volume,
      buyVolume: vol.buy,
      sellVolume: vol.sell,
      delta: vol.buy - vol.sell,
      percentage: 0, // Will be calculated below
    });
  });

  // Calculate percentages and sort by price
  levels.forEach(l => {
    l.percentage = totalVolume > 0 ? (l.volume / totalVolume) * 100 : 0;
  });

  levels.sort((a, b) => b.price - a.price);

  // Calculate Value Area (70% of volume around POC)
  const targetVolume = totalVolume * valueAreaPercent;
  let accumulatedVolume = 0;
  let vah = pocPrice;
  let val = pocPrice;

  // Sort by volume descending to find value area
  const levelsByVolume = [...levels].sort((a, b) => b.volume - a.volume);

  for (const level of levelsByVolume) {
    accumulatedVolume += level.volume;
    if (level.price > vah) vah = level.price;
    if (level.price < val) val = level.price;

    if (accumulatedVolume >= targetVolume) break;
  }

  return {
    levels,
    poc: pocPrice,
    vah,
    val,
    totalVolume,
  };
}

/**
 * Calculate VWAP (Volume Weighted Average Price) with bands
 */
export function calculateVWAP(candles: Candle[]): VWAPData[] {
  if (candles.length === 0) return [];

  const result: VWAPData[] = [];
  let cumulativeTPV = 0; // Typical Price × Volume
  let cumulativeVolume = 0;
  let cumulativeTPV2 = 0; // For standard deviation

  candles.forEach(candle => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    cumulativeTPV2 += typicalPrice * typicalPrice * candle.volume;

    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;

    // Calculate standard deviation
    const variance = cumulativeVolume > 0
      ? (cumulativeTPV2 / cumulativeVolume) - (vwap * vwap)
      : 0;
    const stdDev = Math.sqrt(Math.max(0, variance));

    result.push({
      time: candle.time,
      vwap,
      upperBand1: vwap + stdDev,
      lowerBand1: vwap - stdDev,
      upperBand2: vwap + 2 * stdDev,
      lowerBand2: vwap - 2 * stdDev,
    });
  });

  return result;
}

/**
 * Calculate TWAP (Time Weighted Average Price)
 */
export function calculateTWAP(candles: Candle[], period: number = 20): TWAPData[] {
  if (candles.length === 0) return [];

  const result: TWAPData[] = [];

  candles.forEach((candle, i) => {
    const start = Math.max(0, i - period + 1);
    const slice = candles.slice(start, i + 1);

    // Simple average of typical prices
    const sumTP = slice.reduce((sum, c) => sum + (c.high + c.low + c.close) / 3, 0);
    const twap = sumTP / slice.length;

    result.push({
      time: candle.time,
      twap,
    });
  });

  return result;
}

/**
 * Build cluster data from trades
 */
export function buildClusters(
  trades: Trade[],
  tickSize: number
): Map<number, ClusterLevel> {
  const clusters = new Map<number, ClusterLevel>();

  trades.forEach(trade => {
    const price = Math.round(trade.price / tickSize) * tickSize;

    if (!clusters.has(price)) {
      clusters.set(price, {
        price,
        bid: 0,
        ask: 0,
        volume: 0,
        delta: 0,
        deltaPercent: 0,
      });
    }

    const cluster = clusters.get(price)!;

    if (trade.isBuyerMaker) {
      // Seller initiated (hit bid)
      cluster.bid += trade.quantity;
    } else {
      // Buyer initiated (lift ask)
      cluster.ask += trade.quantity;
    }

    cluster.volume = cluster.bid + cluster.ask;
    cluster.delta = cluster.ask - cluster.bid;
    cluster.deltaPercent = cluster.volume > 0 ? (cluster.delta / cluster.volume) * 100 : 0;
  });

  return clusters;
}

/**
 * Calculate cumulative delta from trades
 */
export function calculateCumulativeDelta(trades: Trade[]): { time: number; delta: number }[] {
  let cumDelta = 0;
  const result: { time: number; delta: number }[] = [];

  trades.forEach(trade => {
    if (trade.isBuyerMaker) {
      cumDelta -= trade.quantity;
    } else {
      cumDelta += trade.quantity;
    }

    result.push({
      time: trade.time,
      delta: cumDelta,
    });
  });

  return result;
}
