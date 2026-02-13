/**
 * FOOTPRINT WEB WORKER
 *
 * Offloads heavy O(n²) and O(n*m) computations from the main thread:
 * - Profile caches (delta/volume profiles, POC, VAH/VAL)
 * - Naked POCs detection (O(n²))
 * - Unfinished auctions detection (O(n²))
 * - Stacked imbalances (per-candle, batched)
 *
 * Candle data is serialized (Maps → arrays) for transfer.
 */

// ============ SERIALIZED TYPES (no Map/Set) ============

interface SerializedPriceLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  bidTrades: number;
  askTrades: number;
  delta: number;
  totalVolume: number;
  imbalanceBuy: boolean;
  imbalanceSell: boolean;
}

interface SerializedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: [number, SerializedPriceLevel][];
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  totalDelta: number;
  totalTrades: number;
  poc: number;
  vah: number;
  val: number;
  isClosed: boolean;
}

// ============ MESSAGE TYPES ============

interface ComputeProfilesRequest {
  type: 'computeProfiles';
  id: number;
  candles: SerializedCandle[];
}

interface ComputeIndicatorsRequest {
  type: 'computeIndicators';
  id: number;
  candles: SerializedCandle[];
  tickSize: number;
  currentPrice: number;
  minConsecutive: number;
}

type WorkerRequest = ComputeProfilesRequest | ComputeIndicatorsRequest;

interface ProfileResult {
  deltaByPrice: [number, number][];
  maxDelta: number;
  volumeByPrice: [number, { total: number; bid: number; ask: number }][];
  maxVolume: number;
  sessionStats: {
    pocPrice: number;
    pocVolume: number;
    vah: number;
    val: number;
    totalVolume: number;
    totalDelta: number;
    valueAreaPrices: number[];
  };
}

interface IndicatorResult {
  stackedImbalances: {
    startPrice: number;
    endPrice: number;
    direction: 'bullish' | 'bearish';
    count: number;
    candleTime: number;
  }[];
  nakedPOCs: {
    price: number;
    candleTime: number;
    volume: number;
    tested: boolean;
  }[];
  unfinishedAuctions: {
    price: number;
    side: 'high' | 'low';
    candleTime: number;
    volume: number;
    tested: boolean;
  }[];
}

// ============ COMPUTATIONS ============

function computeProfiles(candles: SerializedCandle[]): ProfileResult {
  const deltaByPrice = new Map<number, number>();
  const volumeByPrice = new Map<number, { total: number; bid: number; ask: number }>();
  let maxDelta = 1;
  let maxVolume = 1;
  let pocPrice = 0;
  let pocVolume = 0;
  let totalVolume = 0;
  let totalDelta = 0;

  for (const candle of candles) {
    totalDelta += candle.totalDelta;

    for (const [price, level] of candle.levels) {
      // Delta profile
      const currentDelta = deltaByPrice.get(price) || 0;
      const newDelta = currentDelta + level.delta;
      deltaByPrice.set(price, newDelta);
      maxDelta = Math.max(maxDelta, Math.abs(newDelta));

      // Volume profile
      const currentVol = volumeByPrice.get(price) || { total: 0, bid: 0, ask: 0 };
      currentVol.total += level.totalVolume;
      currentVol.bid += level.bidVolume;
      currentVol.ask += level.askVolume;
      volumeByPrice.set(price, currentVol);

      if (currentVol.total > maxVolume) {
        maxVolume = currentVol.total;
      }
      if (currentVol.total > pocVolume) {
        pocVolume = currentVol.total;
        pocPrice = price;
      }
      totalVolume += level.totalVolume;
    }
  }

  // Value Area (70%)
  const sortedPrices = Array.from(volumeByPrice.entries())
    .sort((a, b) => b[1].total - a[1].total);
  const targetVolume = totalVolume * 0.7;
  let accumulatedVolume = 0;
  const valueAreaPrices: number[] = [];

  for (const [price, data] of sortedPrices) {
    valueAreaPrices.push(price);
    accumulatedVolume += data.total;
    if (accumulatedVolume >= targetVolume) break;
  }

  const vah = valueAreaPrices.length > 0 ? Math.max(...valueAreaPrices) : 0;
  const val = valueAreaPrices.length > 0 ? Math.min(...valueAreaPrices) : 0;

  return {
    deltaByPrice: Array.from(deltaByPrice.entries()),
    maxDelta,
    volumeByPrice: Array.from(volumeByPrice.entries()),
    maxVolume,
    sessionStats: { pocPrice, pocVolume, vah, val, totalVolume, totalDelta, valueAreaPrices },
  };
}

function computeStackedImbalances(
  candles: SerializedCandle[],
  tickSize: number,
  minConsecutive: number,
): IndicatorResult['stackedImbalances'] {
  const results: IndicatorResult['stackedImbalances'] = [];
  const precisionDigits = Math.max(Math.round(-Math.log10(tickSize)) + 2, 2);
  const factor = Math.pow(10, precisionDigits);

  for (const candle of candles) {
    const sortedLevels = candle.levels.slice().sort((a, b) => a[0] - b[0]);
    if (sortedLevels.length < minConsecutive) continue;

    let currentDirection: 'bullish' | 'bearish' | null = null;
    let startPrice = 0;
    let endPrice = 0;
    let count = 0;
    let lastPrice = -Infinity;

    for (const [price, level] of sortedLevels) {
      const isConsecutive =
        Math.abs(Math.round((price - lastPrice) * factor) / factor - tickSize) < tickSize * 0.1;

      const direction: 'bullish' | 'bearish' | null =
        level.imbalanceBuy ? 'bullish' :
        level.imbalanceSell ? 'bearish' :
        null;

      if (direction && direction === currentDirection && isConsecutive) {
        endPrice = price;
        count++;
      } else {
        if (currentDirection && count >= minConsecutive) {
          results.push({ startPrice, endPrice, direction: currentDirection, count, candleTime: candle.time });
        }
        if (direction) {
          currentDirection = direction;
          startPrice = price;
          endPrice = price;
          count = 1;
        } else {
          currentDirection = null;
          count = 0;
        }
      }
      lastPrice = price;
    }

    if (currentDirection && count >= minConsecutive) {
      results.push({ startPrice, endPrice, direction: currentDirection, count, candleTime: candle.time });
    }
  }

  return results;
}

function computeNakedPOCs(
  candles: SerializedCandle[],
  currentPrice: number,
): IndicatorResult['nakedPOCs'] {
  const nakedPOCs: IndicatorResult['nakedPOCs'] = [];

  for (let i = 0; i < candles.length - 1; i++) {
    const candle = candles[i];
    if (!candle.poc) continue;

    const pocPrice = candle.poc;
    let tested = false;

    for (let j = i + 1; j < candles.length; j++) {
      if (candles[j].low <= pocPrice && candles[j].high >= pocPrice) {
        tested = true;
        break;
      }
    }

    if (!tested) {
      const pocLevel = candle.levels.find(([p]) => p === pocPrice);
      nakedPOCs.push({
        price: pocPrice,
        candleTime: candle.time,
        volume: pocLevel ? pocLevel[1].totalVolume : 0,
        tested: false,
      });
    }
  }

  return nakedPOCs;
}

function computeUnfinishedAuctions(
  candles: SerializedCandle[],
  tickSize: number,
): IndicatorResult['unfinishedAuctions'] {
  const results: IndicatorResult['unfinishedAuctions'] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    const highLevel = candle.levels.find(([p]) => p === candle.high);
    if (highLevel) {
      const [, hl] = highLevel;
      if (hl.askVolume === 0 && hl.bidVolume > 0) {
        let tested = false;
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].high > candle.high) { tested = true; break; }
        }
        results.push({ price: candle.high, side: 'high', candleTime: candle.time, volume: hl.bidVolume, tested });
      }
    }

    const lowLevel = candle.levels.find(([p]) => p === candle.low);
    if (lowLevel) {
      const [, ll] = lowLevel;
      if (ll.bidVolume === 0 && ll.askVolume > 0) {
        let tested = false;
        for (let j = i + 1; j < candles.length; j++) {
          if (candles[j].low < candle.low) { tested = true; break; }
        }
        results.push({ price: candle.low, side: 'low', candleTime: candle.time, volume: ll.askVolume, tested });
      }
    }
  }

  return results;
}

// ============ MESSAGE HANDLER ============

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'computeProfiles': {
      const result = computeProfiles(msg.candles);
      self.postMessage({ type: 'profiles', id: msg.id, result });
      break;
    }
    case 'computeIndicators': {
      const result: IndicatorResult = {
        stackedImbalances: computeStackedImbalances(msg.candles, msg.tickSize, msg.minConsecutive),
        nakedPOCs: computeNakedPOCs(msg.candles, msg.currentPrice),
        unfinishedAuctions: computeUnfinishedAuctions(msg.candles, msg.tickSize),
      };
      self.postMessage({ type: 'indicators', id: msg.id, result });
      break;
    }
  }
};
