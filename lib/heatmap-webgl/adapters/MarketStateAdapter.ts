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
  deltaProfileMode?: 'mirrored' | 'stacked' | 'net';
  // Layout margins (CSS pixels)
  priceAxisWidth?: number;
  deltaProfileWidth?: number;
  volumeProfileWidth?: number;
  // Horizontal pan offset (CSS pixels)
  panX?: number;
}

/**
 * Convert MarketState to WebGL RenderData
 * All x positions are in CSS pixel space relative to the full canvas width.
 * The renderer should NOT add any additional baseX offset.
 */
export function adaptMarketState(
  state: MarketState,
  priceRange: PriceRange,
  config: AdapterConfig
): RenderData {
  const { width, height, tickSize, contrast = 1.5, upperCutoff = 0.8 } = config;
  const panX = config.panX || 0;

  // Layout zones (CSS pixels)
  const leftMargin = config.deltaProfileWidth || 0;
  const rightMargin = (config.priceAxisWidth || 60) + (config.volumeProfileWidth || 0);
  const heatmapWidth = Math.max(100, width - leftMargin - rightMargin);
  const heatmapLeft = leftMargin;
  const heatmapRight = leftMargin + heatmapWidth;

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSIVE ORDERS (heatmap cells)
  // ═══════════════════════════════════════════════════════════════════════════
  const passiveOrders: PassiveOrderData[] = [];

  // Compute dynamic time range from heatmap history
  let minTimeIndex = Infinity;
  let maxTimeIndex = -Infinity;

  state.heatmapHistory.forEach((cell) => {
    if (cell.timeIndex < minTimeIndex) minTimeIndex = cell.timeIndex;
    if (cell.timeIndex > maxTimeIndex) maxTimeIndex = cell.timeIndex;
  });

  const totalTimeIndices = Math.max(1, maxTimeIndex - minTimeIndex);
  // Subtract 1px gap between columns (Bookmap-style grid), min 3px
  const rawColumnWidth = heatmapWidth / Math.max(1, totalTimeIndices);
  const columnWidth = Math.max(3, rawColumnWidth - 1);

  // Process heatmap history cells → time-series passive orders
  // PERF: Skip cells that are off-screen or invisible (intensity < 0.01)
  state.heatmapHistory.forEach((cell) => {
    // Skip invisible cells
    if (cell.bidIntensity < 0.01 && cell.askIntensity < 0.01) return;
    // Skip cells outside price range
    if (cell.price < priceRange.min || cell.price > priceRange.max) return;

    const normalizedTime = (cell.timeIndex - minTimeIndex) / totalTimeIndices;
    const x = heatmapLeft + normalizedTime * heatmapWidth + panX;

    // Skip cells off-screen horizontally
    if (x + columnWidth < 0 || x > width) return;

    if (cell.bidIntensity >= 0.01) {
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

    if (cell.askIntensity >= 0.01) {
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

  // Current live orders at the right edge of heatmap area
  const liveColumnWidth = Math.max(columnWidth, 8);
  const rightEdgeX = heatmapRight - liveColumnWidth;

  state.bids.forEach((order, price) => {
    if (price >= priceRange.min && price <= priceRange.max) {
      passiveOrders.push({
        price,
        size: order.size,
        side: 'bid',
        intensity: Math.min(1, order.size / maxSize),
        x: rightEdgeX,
        cellWidth: liveColumnWidth,
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
        cellWidth: liveColumnWidth,
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADES
  // ═══════════════════════════════════════════════════════════════════════════
  const now = Date.now();
  const maxTradeAge = 30000; // 30 seconds

  // Filter recent trades
  const recentTrades = state.trades.filter((trade) => trade.timestamp > now - maxTradeAge);

  // Find max trade size for normalization (so bubbles scale relative to actual data)
  let maxTradeSize = 0;
  for (const trade of recentTrades) {
    if (trade.size > maxTradeSize) maxTradeSize = trade.size;
  }
  const tradeNormFactor = maxTradeSize > 0 ? 100 / maxTradeSize : 1;

  const trades: TradeData[] = recentTrades.map((trade) => {
    const tradeTimeOffset = now - trade.timestamp;
    const x = heatmapRight - (tradeTimeOffset / maxTradeAge) * heatmapWidth + panX;

    return {
      price: trade.price,
      // Normalize size to 0-100 range so sqrt scaling produces visible differentiation
      size: trade.size * tradeNormFactor,
      side: trade.side,
      x: Math.max(heatmapLeft, x),
      buyRatio: trade.side === 'buy' ? 1 : 0,
      age: tradeTimeOffset / maxTradeAge,
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BEST BID/ASK STAIRCASE LINES
  // ═══════════════════════════════════════════════════════════════════════════
  const bestBidPoints: { x: number; price: number }[] = [];
  const bestAskPoints: { x: number; price: number }[] = [];

  if (state.priceHistory.length > 0) {
    const historyLength = state.priceHistory.length;
    const startTime = state.priceHistory[0]?.timestamp || 0;
    const endTime = state.priceHistory[historyLength - 1]?.timestamp || 0;
    const timeSpan = endTime - startTime || 1;

    state.priceHistory.forEach((point) => {
      const normalizedTime = (point.timestamp - startTime) / timeSpan;
      const x = heatmapLeft + normalizedTime * heatmapWidth + panX;
      bestBidPoints.push({ x, price: point.bid });
      bestAskPoints.push({ x, price: point.ask });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRID LINES
  // ═══════════════════════════════════════════════════════════════════════════
  const gridHorizontalPrices: number[] = [];
  const gridVerticalPositions: number[] = [];

  if (config.showGrid !== false) {
    const gridStep = config.gridStep || tickSize * 10;

    // Horizontal grid lines (price levels)
    const startPrice = Math.ceil(priceRange.min / gridStep) * gridStep;
    for (let price = startPrice; price <= priceRange.max; price += gridStep) {
      gridHorizontalPrices.push(price);
    }

    // Vertical grid lines within heatmap area
    const numVertical = 8;
    const verticalStep = heatmapWidth / numVertical;
    for (let i = 0; i <= numVertical; i++) {
      gridVerticalPositions.push(heatmapLeft + i * verticalStep);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TIME LABELS (for time axis rendering)
  // ═══════════════════════════════════════════════════════════════════════════
  const timeLabels: { time: Date; x: number }[] = [];

  if (state.priceHistory.length > 1) {
    const historyLength = state.priceHistory.length;
    const startTime = state.priceHistory[0]?.timestamp || 0;
    const endTime = state.priceHistory[historyLength - 1]?.timestamp || 0;
    const timeSpan = endTime - startTime || 1;

    // Generate ~6-8 evenly spaced time labels
    const numLabels = Math.min(8, Math.max(3, Math.floor(heatmapWidth / 100)));
    const labelStep = Math.max(1, Math.floor(historyLength / numLabels));

    for (let i = 0; i < historyLength; i += labelStep) {
      const point = state.priceHistory[i];
      const normalizedTime = (point.timestamp - startTime) / timeSpan;
      const x = heatmapLeft + normalizedTime * heatmapWidth + panX;
      timeLabels.push({ time: new Date(point.timestamp), x });
    }
    // Always include the last point
    const lastPoint = state.priceHistory[historyLength - 1];
    const lastNormTime = (lastPoint.timestamp - startTime) / timeSpan;
    const lastX = heatmapLeft + lastNormTime * heatmapWidth + panX;
    timeLabels.push({ time: new Date(lastPoint.timestamp), x: lastX });
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

    const isNetMode = config.deltaProfileMode === 'net';
    state.cumulativeLevels.forEach((level) => {
      if (level.price >= priceRange.min && level.price <= priceRange.max) {
        profileBars.push({
          price: level.price,
          bidValue: level.totalBuySize,
          askValue: level.totalSellSize,
        });

        if (isNetMode) {
          maxDeltaValue = Math.max(maxDeltaValue, Math.abs(level.totalBuySize - level.totalSellSize));
        } else {
          maxDeltaValue = Math.max(maxDeltaValue, level.totalBuySize, level.totalSellSize);
        }
        maxVolumeValue = Math.max(maxVolumeValue, level.totalBuySize + level.totalSellSize);
      }
    });

    profileBars.sort((a, b) => a.price - b.price);

    if (config.showDeltaProfile && profileBars.length > 0) {
      deltaProfile = { bars: profileBars, maxValue: maxDeltaValue };
    }

    if (config.showVolumeProfile && profileBars.length > 0) {
      volumeProfile = { bars: profileBars, maxValue: maxVolumeValue };
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
    timeLabels,
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
