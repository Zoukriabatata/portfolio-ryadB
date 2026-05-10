import type { GridSystem, OrderbookLevel, OrderbookSnapshot } from "../core";

export interface LiquidityFrame {
  readonly grid: GridSystem;
  // cells[t * grid.priceLevels + p] ∈ [0, 1] (intensité log-scale normalisée)
  readonly cells: Float32Array;
}

function accumulateLevels(
  levels: ReadonlyArray<OrderbookLevel>,
  cells: Float32Array,
  grid: GridSystem,
  startMs: number,
  endMs: number,
): void {
  const oldest = grid.oldestExchangeMs;
  const bucketDur = grid.bucketDurationMs;
  const priceLevels = grid.priceLevels;
  const historyLength = grid.historyLength;
  const nowMs = grid.nowExchangeMs;

  // Clamp à la fenêtre grid
  const clampedStart = startMs < oldest ? oldest : startMs;
  const clampedEnd = endMs > nowMs ? nowMs : endMs;
  if (clampedEnd <= clampedStart) return;

  // Range buckets [tStart, tEnd]
  let tStart = Math.floor((clampedStart - oldest) / bucketDur);
  let tEnd = Math.floor((clampedEnd - 1 - oldest) / bucketDur);
  if (tStart < 0) tStart = 0;
  if (tEnd >= historyLength) tEnd = historyLength - 1;
  if (tStart > tEnd) return;

  for (let l = 0; l < levels.length; l++) {
    const level = levels[l];
    const pIdx = grid.priceIndex(level.price);
    if (pIdx === -1) continue;

    const size = level.size;
    for (let t = tStart; t <= tEnd; t++) {
      const bucketStart = oldest + t * bucketDur;
      const bucketEnd = bucketStart + bucketDur;
      const ovStart = clampedStart > bucketStart ? clampedStart : bucketStart;
      const ovEnd = clampedEnd < bucketEnd ? clampedEnd : bucketEnd;
      const overlap = ovEnd - ovStart;
      if (overlap > 0) {
        cells[t * priceLevels + pIdx] += size * overlap;
      }
    }
  }
}

// Aggrégation pure : intégrale temporelle de la liquidité posée par cellule
// (price × bucket), normalisée log-scale → [0, 1]. Pas d'effets de bord.
export function aggregateOrderbookHistoryToFrame(
  snapshots: ReadonlyArray<OrderbookSnapshot>,
  grid: GridSystem,
): LiquidityFrame {
  const totalCells = grid.historyLength * grid.priceLevels;
  const cells = new Float32Array(totalCells);

  if (snapshots.length === 0) {
    return Object.freeze({ grid, cells });
  }

  // Tri (copie, ne mute pas l'input)
  const sorted = snapshots.slice().sort((a, b) => a.exchangeMs - b.exchangeMs);

  for (let i = 0; i < sorted.length; i++) {
    const snap = sorted[i];
    const startMs = snap.exchangeMs;
    const endMs =
      i < sorted.length - 1 ? sorted[i + 1].exchangeMs : grid.nowExchangeMs;
    if (endMs <= startMs) continue;

    accumulateLevels(snap.bids, cells, grid, startMs, endMs);
    accumulateLevels(snap.asks, cells, grid, startMs, endMs);
  }

  // Σ(size·duration) → moyenne size présente sur le bucket
  const inv = 1 / grid.bucketDurationMs;
  for (let i = 0; i < totalCells; i++) {
    cells[i] *= inv;
  }

  // Max pour normalisation
  let max = 0;
  for (let i = 0; i < totalCells; i++) {
    if (cells[i] > max) max = cells[i];
  }

  if (max > 0) {
    const logMax = Math.log(1 + max);
    for (let i = 0; i < totalCells; i++) {
      cells[i] = Math.log(1 + cells[i]) / logMax;
    }
  }

  return Object.freeze({ grid, cells });
}
