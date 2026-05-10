import type { GridSystem, Trade } from "../core";

// Ring buffer trades (insertion order). Capacité fixe, allocation one-shot.
// Out-of-order tolerated mais pas réordonné chronologiquement.
//
// Layout interne : Float64Array(capacity * 4) où chaque slot =
//   [exchangeMs, price, size, side01]
// avec side01 = 0 pour "bid" (couleur --bid), 1 pour "ask" (couleur --ask).
// Float64 nécessaire pour l'exchangeMs (Float32 perd la précision ms).
//
// scratch median pré-alloué pour `medianRecentVolume`, capé par défaut à 256
// (largement plus que les ~50 demandés par le mapping radius).
const STRIDE = 4;
const DEFAULT_MEDIAN_SCRATCH = 256;

export class TradesBuffer {
  private readonly capacity: number;
  private readonly storage: Float64Array;
  private readonly medianScratch: Float64Array;
  private writeIdx = 0;
  private count = 0;

  constructor(capacity: number, medianScratchSize = DEFAULT_MEDIAN_SCRATCH) {
    if (capacity <= 0) {
      throw new Error(
        `TradesBuffer: capacity must be > 0, got ${capacity}`,
      );
    }
    this.capacity = capacity;
    this.storage = new Float64Array(capacity * STRIDE);
    this.medianScratch = new Float64Array(medianScratchSize);
  }

  ingest(trade: Trade): void {
    const base = this.writeIdx * STRIDE;
    this.storage[base + 0] = trade.exchangeMs;
    this.storage[base + 1] = trade.price;
    this.storage[base + 2] = trade.size;
    this.storage[base + 3] = trade.side === "ask" ? 1 : 0;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  // Filtre les trades dont exchangeMs ∈ [grid.oldestExchangeMs, grid.nowExchangeMs]
  // et écrit [tDelta, price, size, side01] par trade dans `out` (Float32Array).
  // tDelta = exchangeMs - grid.oldestExchangeMs ∈ [0, historyDurationMs] ; tient
  // largement dans Float32 (< 1 µs d'erreur sur 5 min). Aucune allocation.
  visibleTrades(grid: GridSystem, out: Float32Array): number {
    if (this.count === 0) return 0;
    const oldest = grid.oldestExchangeMs;
    const now = grid.nowExchangeMs;
    let outIdx = 0;
    let visible = 0;

    // Walk backwards from latest. Trades arrive globalement triés (Bybit pass-through),
    // donc dès qu'on croise un t < oldest, on s'arrête.
    const start = (this.writeIdx - 1 + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const slot = (start - i + this.capacity) % this.capacity;
      const base = slot * STRIDE;
      const t = this.storage[base];
      if (t < oldest) break;
      if (t > now) continue;
      if (outIdx + STRIDE > out.length) {
        throw new Error(
          `TradesBuffer.visibleTrades: out buffer too small (${out.length} for ${visible + 1} trades minimum)`,
        );
      }
      out[outIdx + 0] = t - oldest;
      out[outIdx + 1] = this.storage[base + 1];
      out[outIdx + 2] = this.storage[base + 2];
      out[outIdx + 3] = this.storage[base + 3];
      outIdx += STRIDE;
      visible++;
    }
    return visible;
  }

  // Médiane des sizes des `n` derniers trades. Retourne 0 si buffer vide.
  // Aucune allocation (utilise medianScratch pré-alloué).
  medianRecentVolume(n: number): number {
    if (this.count === 0 || n <= 0) return 0;
    const k = Math.min(n, this.count, this.medianScratch.length);
    if (k === 0) return 0;
    const start = (this.writeIdx - 1 + this.capacity) % this.capacity;
    for (let i = 0; i < k; i++) {
      const slot = (start - i + this.capacity) % this.capacity;
      this.medianScratch[i] = this.storage[slot * STRIDE + 2];
    }
    const view = this.medianScratch.subarray(0, k);
    view.sort();
    const mid = Math.floor(k / 2);
    if (k % 2 === 0) {
      return (view[mid - 1] + view[mid]) / 2;
    }
    return view[mid];
  }

  // Prix du dernier trade ingéré. null si buffer vide.
  currentPrice(): number | null {
    if (this.count === 0) return null;
    const last = (this.writeIdx - 1 + this.capacity) % this.capacity;
    return this.storage[last * STRIDE + 1];
  }

  size(): number {
    return this.count;
  }
}
