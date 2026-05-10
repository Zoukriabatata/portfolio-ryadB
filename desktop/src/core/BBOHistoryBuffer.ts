// REFONTE-7/P3.5 Fix 3 — historique Best Bid / Best Offer pour rendu staircase
// type Bookmap/ATAS. Ring buffer chronologique alimenté par chaque
// OrderbookSnapshot reçu. Capacité 50 000 = ~5 min à 100 Hz × marge 2×.
//
// Layout interne : Float64Array de [exchangeMs, bestBid, bestAsk] × capacity.
// Float64 nécessaire pour exchangeMs (timestamp ms moderne ~1.7e12 > 2^32).
//
// Aucune allocation en ingest path. visibleEntries écrit dans un Float32Array
// pré-alloué côté caller (BestBidAskLayer scratch).

export class BBOHistoryBuffer {
  private readonly capacity: number;
  private readonly data: Float64Array;
  private writeIdx = 0;
  private _count = 0;

  constructor(capacity = 50_000) {
    if (capacity <= 0 || !Number.isFinite(capacity)) {
      throw new Error(`BBOHistoryBuffer: capacity must be > 0, got ${capacity}`);
    }
    this.capacity = capacity;
    this.data = new Float64Array(capacity * 3);
  }

  ingest(exchangeMs: number, bestBid: number, bestAsk: number): void {
    if (
      !Number.isFinite(exchangeMs) ||
      !Number.isFinite(bestBid) ||
      !Number.isFinite(bestAsk)
    ) {
      return;
    }
    const slot = (this.writeIdx % this.capacity) * 3;
    this.data[slot] = exchangeMs;
    this.data[slot + 1] = bestBid;
    this.data[slot + 2] = bestAsk;
    this.writeIdx++;
    if (this._count < this.capacity) this._count++;
  }

  // Filtre les entries dont exchangeMs ∈ [tMin, tMax] et les écrit
  // chronologiquement dans `out` au format [exchangeMs, bid, ask, ...].
  // out.length doit être >= count * 3 (sinon throw).
  // Retourne le nombre d'entries écrites.
  visibleEntries(tMin: number, tMax: number, out: Float32Array): number {
    if (this._count === 0) return 0;
    // Première position chronologique dans le ring.
    const start =
      this.writeIdx >= this.capacity ? this.writeIdx % this.capacity : 0;
    let written = 0;
    for (let i = 0; i < this._count; i++) {
      const slot = ((start + i) % this.capacity) * 3;
      const ts = this.data[slot];
      if (ts < tMin) continue;
      if (ts > tMax) break;
      const baseOut = written * 3;
      if (baseOut + 3 > out.length) {
        throw new Error(
          `BBOHistoryBuffer: out (${out.length}) trop petit pour ${written + 1} entries × 3`,
        );
      }
      out[baseOut] = ts;
      out[baseOut + 1] = this.data[slot + 1];
      out[baseOut + 2] = this.data[slot + 2];
      written++;
    }
    return written;
  }

  latest(): { exchangeMs: number; bestBid: number; bestAsk: number } | null {
    if (this._count === 0) return null;
    const idx = ((this.writeIdx - 1 + this.capacity) % this.capacity) * 3;
    return {
      exchangeMs: this.data[idx],
      bestBid: this.data[idx + 1],
      bestAsk: this.data[idx + 2],
    };
  }

  count(): number {
    return this._count;
  }

  clear(): void {
    this.writeIdx = 0;
    this._count = 0;
  }
}
