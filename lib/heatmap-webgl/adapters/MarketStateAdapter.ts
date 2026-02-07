/**
 * Market State Adapter
 * Converts heatmap-v2 MarketState to WebGL RenderData format
 */

import type { RenderData } from '../HybridRenderer';
import type { PassiveOrderData, TradeData } from '../types';
import type { MarketState } from '@/lib/heatmap-v2/types';

interface PriceRange {
  min: number;
  max: number;
}

interface AdapterConfig {
  width: number;
  height: number;
  tickSize: number;
  contrast?: number;
  upperCutoff?: number;
  colors?: {
    bidColor?: string;
    askColor?: string;
    buyColor?: string;
    sellColor?: string;
    gridColor?: string;
  };
  gridStep?: number;
  showGrid?: boolean;
  showDeltaProfile?: boolean;
  showVolumeProfile?: boolean;
}

/**
 * Convert MarketState to WebGL RenderData
 */
export function adaptMarketState(
  state: MarketState,
  priceRange: PriceRange,
  config: AdapterConfig
): RenderData {
  const { width, height, tickSize, contrast = 1.5, upperCutoff = 0.8 } = config;
  const priceSpan = priceRange.max - priceRange.min;

  // Calculate max sizes for normalization
  let maxBidSize = 0;
  let maxAskSize = 0;

  state.bids.forEach((order) => {
    maxBidSize = Math.max(maxBidSize, order.size);
  });
  state.asks.forEach((order) => {
    maxAskSize = Math.max(maxAskSize, order.size);
  });

  const maxSize = Math.max(maxBidSize, maxAskSize, 1);

  // Convert passive orders
  const passiveOrders: PassiveOrderData[] = [];

  // Compute dynamic time range from heatmap history
  let minTimeIndex = Infinity;
  let maxTimeIndex = -Infinity;

  state.heatmapHistory.forEach((cell) => {
    if (cell.timeIndex < minTimeIndex) minTimeIndex = cell.timeIndex;
    if (cell.timeIndex > maxTimeIndex) maxTimeIndex = cell.timeIndex;
  });

  const totalTimeIndices = Math.max(1, maxTimeIndex - minTimeIndex);
  const rightEdgeX = width - 10;
  const columnWidth = Math.max(2, Math.min(20, (width - 10) / totalTimeIndices));

  // Process heatmap history cells → time-series passive orders
  state.heatmapHistory.forEach((cell) => {
    // Map timeIndex to X position: oldest at left, newest near right edge
    const normalizedTime = (cell.timeIndex - minTimeIndex) / totalTimeIndices;
    const x = normalizedTime * (width - 10);

    if (cell.bidIntensity > 0) {
      passiveOrders.push({
        price: cell.price,
        size: cell.bidIntensity * maxSize,
        side: 'bid',
        intensity: cell.bidIntensity,
        x,
        cellWidth: columnWidth,
        state: cell.wasAbsorbed ? 'absorbed' : undefined,
      });
    }

    if (cell.askIntensity > 0) {
      passiveOrders.push({
        price: cell.price,
        size: cell.askIntensity * maxSize,
        side: 'ask',
        intensity: cell.askIntensity,
        x,
        cellWidth: columnWidth,
        state: cell.wasAbsorbed ? 'absorbed' : undefined,
      });
    }
  });

  // Also add current live orders at the right edge (no cellWidth override)

  state.bids.forEach((order, price) => {
    if (price >= priceRange.min && price <= priceRange.max) {
      passiveOrders.push({
        price,
        size: order.size,
        side: 'bid',
        intensity: Math.min(1, order.size / maxSize),
        x: rightEdgeX,
      });
    }
  });

  state.asks.forEach((order, price) => {
    if (price >= priceRange.min && price <= priceRange.max) {
      passiveOrders.push({
        price,
        size: order.size,
        side: 'ask',
        intensity: Math.min(1, order.size / maxSize),
        x: rightEdgeX,
      });
    }
  });

  // Convert trades
  const now = Date.now();
  const maxTradeAge = 30000; // 30 seconds

  const trades: TradeData[] = state.trades
    .filter((trade) => trade.timestamp > now - maxTradeAge)
    .map((trade) => {
      const tradeTimeOffset = now - trade.timestamp;
      const x = rightEdgeX - (tradeTimeOffset / maxTradeAge) * width * 0.5;

      return {
        price: trade.price,
        size: trade.size,
        side: trade.side,
        x,
        buyRatio: trade.side === 'buy' ? 1 : 0,
        age: tradeTimeOffset / maxTradeAge,
      };
    });

  // Extract best bid/ask points from price history
  const bestBidPoints: { x: number; price: number }[] = [];
  const bestAskPoints: { x: number; price: number }[] = [];

  if (state.priceHistory.length > 0) {
    const historyLength = state.priceHistory.length;
    const startTime = state.priceHistory[0]?.timestamp || 0;
    const endTime = state.priceHistory[historyLength - 1]?.timestamp || 0;
    const timeSpan = endTime - startTime || 1;

    state.priceHistory.forEach((point) => {
      const x = ((point.timestamp - startTime) / timeSpan) * width;
      bestBidPoints.push({ x, price: point.bid });
      bestAskPoints.push({ x, price: point.ask });
    });
  }

  // Generate grid lines
  const gridHorizontalPrices: number[] = [];
  const gridVerticalPositions: number[] = [];

  if (config.showGrid !== false) {
    const gridStep = config.gridStep || tickSize * 10;

    // Horizontal grid lines (price levels)
    const startPrice = Math.ceil(priceRange.min / gridStep) * gridStep;
    for (let price = startPrice; price <= priceRange.max; price += gridStep) {
      gridHorizontalPrices.push(price);
    }

    // Vertical grid lines (time intervals)
    const verticalStep = width / 10;
    for (let x = 0; x <= width; x += verticalStep) {
      gridVerticalPositions.push(x);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELTA PROFILE & VOLUME PROFILE
  // ═══════════════════════════════════════════════════════════════════════════
  let deltaProfile: { bars: { price: number; bidValue: number; askValue: number }[]; maxValue: number } | undefined;
  let volumeProfile: { bars: { price: number; bidValue: number; askValue: number }[]; maxValue: number } | undefined;

  if ((config.showDeltaProfile || config.showVolumeProfile) && state.cumulativeLevels.size > 0) {
    const profileBars: { price: number; bidValue: number; askValue: number }[] = [];
    let maxDeltaValue = 1;
    let maxVolumeValue = 1;

    // Extract cumulative levels within price range
    state.cumulativeLevels.forEach((level) => {
      if (level.price >= priceRange.min && level.price <= priceRange.max) {
        profileBars.push({
          price: level.price,
          bidValue: level.totalBuySize,
          askValue: level.totalSellSize,
        });

        // Track max values for normalization
        maxDeltaValue = Math.max(maxDeltaValue, level.totalBuySize, level.totalSellSize);
        maxVolumeValue = Math.max(maxVolumeValue, level.totalBuySize + level.totalSellSize);
      }
    });

    // Sort by price (ascending)
    profileBars.sort((a, b) => a.price - b.price);

    if (config.showDeltaProfile && profileBars.length > 0) {
      deltaProfile = {
        bars: profileBars,
        maxValue: maxDeltaValue,
      };
    }

    if (config.showVolumeProfile && profileBars.length > 0) {
      volumeProfile = {
        bars: profileBars,
        maxValue: maxVolumeValue,
      };
    }
  }

  return {
    priceMin: priceRange.min,
    priceMax: priceRange.max,
    tickSize,
    currentPrice: state.midPrice,
    passiveOrders,
    trades,
    bestBidPoints,
    bestAskPoints,
    gridHorizontalPrices,
    gridVerticalPositions,
    contrast,
    upperCutoff,
    colors: config.colors,
    deltaProfile,
    volumeProfile,
  };
}

/**
 * Create an empty RenderData for when no market state is available
 */
export function createEmptyRenderData(
  priceMin: number,
  priceMax: number,
  tickSize: number
): RenderData {
  return {
    priceMin,
    priceMax,
    tickSize,
    currentPrice: (priceMin + priceMax) / 2,
    passiveOrders: [],
    trades: [],
    contrast: 1.5,
    upperCutoff: 0.8,
  };
}
