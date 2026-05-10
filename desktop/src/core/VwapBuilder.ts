// VWAP rolling 24h via buckets minute (1440 buckets). Memory ~23 KB.
// Pas de queue brute des trades (qui ferait ~80 MB sur BTC actif 24h).
//
// Eviction explicite via evict(nowExchangeMs) : nettoie les buckets devenus
// stales sans nouvel ingest (utile si BTC s'arrête de trader, le VWAP doit
// quand même drift hors fenêtre 24h).

const DEFAULT_WINDOW_MS = 24 * 3_600_000; // 24h
const DEFAULT_BUCKET_MS = 60_000; // 1 min

export class VwapBuilder {
  private readonly bucketMs: number;
  private readonly numBuckets: number;
  private readonly buckets: Float64Array; // [sumPV, sumV] × numBuckets
  private headBucket: number = -Infinity;

  constructor(
    windowMs: number = DEFAULT_WINDOW_MS,
    bucketMs: number = DEFAULT_BUCKET_MS,
  ) {
    if (windowMs <= bucketMs) {
      throw new Error(
        `VwapBuilder: windowMs (${windowMs}) must be > bucketMs (${bucketMs})`,
      );
    }
    if (bucketMs <= 0) {
      throw new Error(`VwapBuilder: bucketMs must be > 0, got ${bucketMs}`);
    }
    this.bucketMs = bucketMs;
    this.numBuckets = Math.floor(windowMs / bucketMs);
    this.buckets = new Float64Array(this.numBuckets * 2);
  }

  ingest(price: number, size: number, exchangeMs: number): void {
    if (
      exchangeMs <= 0 ||
      size <= 0 ||
      !Number.isFinite(size) ||
      !Number.isFinite(price)
    ) {
      return;
    }
    const absBucket = Math.floor(exchangeMs / this.bucketMs);
    if (this.headBucket !== -Infinity && absBucket < this.headBucket) {
      return; // out-of-order
    }
    if (absBucket > this.headBucket) {
      this.advanceTo(absBucket);
    }
    const slot = this.bucketToSlot(absBucket);
    this.buckets[slot * 2] += price * size;
    this.buckets[slot * 2 + 1] += size;
  }

  // Bump l'horloge sans nouvel ingest. Vide les buckets qui sont sortis de
  // la fenêtre depuis le dernier headBucket.
  evict(nowExchangeMs: number): void {
    if (this.headBucket === -Infinity) return;
    if (!Number.isFinite(nowExchangeMs) || nowExchangeMs <= 0) return;
    const absHead = Math.floor(nowExchangeMs / this.bucketMs);
    if (absHead <= this.headBucket) return;
    this.advanceTo(absHead);
  }

  vwap(): number | null {
    let sumPV = 0;
    let sumV = 0;
    for (let i = 0; i < this.numBuckets; i++) {
      sumPV += this.buckets[i * 2];
      sumV += this.buckets[i * 2 + 1];
    }
    if (sumV <= 0) return null;
    return sumPV / sumV;
  }

  totalVolume(): number {
    let sumV = 0;
    for (let i = 0; i < this.numBuckets; i++) {
      sumV += this.buckets[i * 2 + 1];
    }
    return sumV;
  }

  private advanceTo(absBucket: number): void {
    const isFirst = this.headBucket === -Infinity;
    const delta = isFirst ? this.numBuckets : absBucket - this.headBucket;
    if (delta >= this.numBuckets) {
      this.buckets.fill(0);
    } else {
      // Clear les slots entre headBucket+1 et absBucket inclus
      for (let b = this.headBucket + 1; b <= absBucket; b++) {
        const slot = this.bucketToSlot(b);
        this.buckets[slot * 2] = 0;
        this.buckets[slot * 2 + 1] = 0;
      }
    }
    this.headBucket = absBucket;
  }

  private bucketToSlot(absBucket: number): number {
    const r = absBucket % this.numBuckets;
    return r < 0 ? r + this.numBuckets : r;
  }
}
