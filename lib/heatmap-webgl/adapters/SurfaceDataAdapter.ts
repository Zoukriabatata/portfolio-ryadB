/**
 * SURFACE DATA ADAPTER
 *
 * Converts MarketState.heatmapHistory into a structured 2D grid
 * suitable for building a 3D surface mesh.
 */

import type { MarketState } from '@/lib/heatmap-v2/types';

export interface SurfaceGridData {
  timeSteps: number;
  priceLevels: number;
  intensities: Float32Array;  // [timeSteps * priceLevels]
  sides: Float32Array;        // [timeSteps * priceLevels] — 0=bid, 1=ask
  timeIndexMin: number;
  timeIndexMax: number;
  priceMin: number;
  priceMax: number;
  tickSize: number;
}

export function adaptMarketStateToSurface(
  state: MarketState,
  priceRange: { min: number; max: number },
  tickSize: number,
): SurfaceGridData | null {
  // Collect time range from heatmapHistory
  let timeMin = Infinity;
  let timeMax = -Infinity;

  state.heatmapHistory.forEach((cell) => {
    if (cell.timeIndex < timeMin) timeMin = cell.timeIndex;
    if (cell.timeIndex > timeMax) timeMax = cell.timeIndex;
  });

  if (timeMin === Infinity || timeMax === -Infinity || timeMax <= timeMin) return null;

  const priceLevels = Math.max(1, Math.ceil((priceRange.max - priceRange.min) / tickSize));
  const timeSteps = Math.max(1, timeMax - timeMin + 1);

  // Cap to prevent excessive memory (LOD)
  const maxSteps = 250;
  const maxLevels = 250;
  const stepSkip = Math.max(1, Math.ceil(timeSteps / maxSteps));
  const levelSkip = Math.max(1, Math.ceil(priceLevels / maxLevels));
  const actualSteps = Math.ceil(timeSteps / stepSkip);
  const actualLevels = Math.ceil(priceLevels / levelSkip);

  const size = actualSteps * actualLevels;
  const intensities = new Float32Array(size);
  const sides = new Float32Array(size);

  // Fill from heatmapHistory
  state.heatmapHistory.forEach((cell) => {
    if (cell.price < priceRange.min || cell.price >= priceRange.max) return;

    const t = Math.floor((cell.timeIndex - timeMin) / stepSkip);
    const p = Math.floor((cell.price - priceRange.min) / tickSize / levelSkip);

    if (t < 0 || t >= actualSteps || p < 0 || p >= actualLevels) return;

    const idx = t * actualLevels + p;
    const combined = Math.max(cell.bidIntensity, cell.askIntensity);

    // Keep the max intensity if multiple cells map to the same grid point (LOD)
    if (combined > intensities[idx]) {
      intensities[idx] = combined;
      sides[idx] = cell.bidIntensity >= cell.askIntensity ? 0 : 1;
    }
  });

  // Add live orderbook as the rightmost column
  const lastCol = actualSteps - 1;
  const addLiveOrders = (orders: Map<number, { size: number; intensity?: number }>, side: number) => {
    let maxSize = 0;
    orders.forEach((o) => { if (o.size > maxSize) maxSize = o.size; });
    if (maxSize === 0) return;

    orders.forEach((order, price) => {
      if (price < priceRange.min || price >= priceRange.max) return;
      const p = Math.floor((price - priceRange.min) / tickSize / levelSkip);
      if (p < 0 || p >= actualLevels) return;

      const idx = lastCol * actualLevels + p;
      const intensity = Math.min(1, order.size / maxSize);
      if (intensity > intensities[idx]) {
        intensities[idx] = intensity;
        sides[idx] = side;
      }
    });
  };

  addLiveOrders(state.bids as Map<number, { size: number }>, 0);
  addLiveOrders(state.asks as Map<number, { size: number }>, 1);

  return {
    timeSteps: actualSteps,
    priceLevels: actualLevels,
    intensities,
    sides,
    timeIndexMin: timeMin,
    timeIndexMax: timeMax,
    priceMin: priceRange.min,
    priceMax: priceRange.max,
    tickSize,
  };
}
