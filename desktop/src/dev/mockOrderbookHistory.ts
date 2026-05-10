import type { GridSystem, OrderbookLevel, OrderbookSnapshot } from "../core";

// PRNG xorshift32 — deterministe, reproductible, pas de Math.random.
function xorshift32(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    // Map [-2^31, 2^31) → [0, 1)
    return ((s >>> 0) / 0x100000000);
  };
}

const LEVELS_PER_SIDE = 20;
const DEFAULT_SEED = 0xC0FFEE;

// Génère N snapshots couvrant la fenêtre [oldestExchangeMs, nowExchangeMs].
// Mid-price marche aléatoire deterministe autour du centre du viewport,
// 20 niveaux bid + 20 ask par snapshot, sizes ∈ [10, 60].
export function mockOrderbookHistory(
  grid: GridSystem,
  snapshotCount: number,
  seed: number = DEFAULT_SEED,
): OrderbookSnapshot[] {
  if (snapshotCount <= 0) return [];

  const rand = xorshift32(seed);
  const center = (grid.priceMin + grid.priceMax) / 2;
  const minMid = grid.priceMin + 10 * grid.tickSize;
  const maxMid = grid.priceMax - 10 * grid.tickSize;
  const dt = grid.historyDurationMs / snapshotCount;

  let mid = center;
  const out: OrderbookSnapshot[] = new Array(snapshotCount);

  for (let i = 0; i < snapshotCount; i++) {
    const exchangeMs = grid.oldestExchangeMs + Math.floor(i * dt);
    // drift ±5 ticks
    mid += (rand() - 0.5) * grid.tickSize * 10;
    if (mid < minMid) mid = minMid;
    else if (mid > maxMid) mid = maxMid;

    const bids: OrderbookLevel[] = new Array(LEVELS_PER_SIDE);
    const asks: OrderbookLevel[] = new Array(LEVELS_PER_SIDE);
    for (let k = 1; k <= LEVELS_PER_SIDE; k++) {
      bids[k - 1] = {
        price: mid - k * grid.tickSize,
        size: 10 + rand() * 50,
      };
      asks[k - 1] = {
        price: mid + k * grid.tickSize,
        size: 10 + rand() * 50,
      };
    }
    out[i] = { exchangeMs, bids, asks };
  }
  return out;
}
