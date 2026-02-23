/**
 * RingBuffer — Fixed-size circular buffer with O(1) incremental statistics
 *
 * Uses running sum/sumSq (adapted Welford's method for ring buffers) to provide
 * O(1) mean, variance, and std. Periodic full recalculation prevents float drift.
 *
 * Memory: capacity * 8 bytes (Float64Array, contiguous, cache-friendly)
 */
export class RingBuffer {
  private buffer: Float64Array;
  private head: number = 0;
  private _count: number = 0;
  private capacity: number;

  // Running statistics
  private _sum: number = 0;
  private _sumSq: number = 0;

  // Drift prevention
  private pushCount: number = 0;
  private readonly RECALC_INTERVAL = 10_000;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error('RingBuffer capacity must be >= 1');
    this.capacity = capacity;
    this.buffer = new Float64Array(capacity);
  }

  push(value: number): void {
    if (this._count === this.capacity) {
      // Buffer full — evict oldest value
      const evicted = this.buffer[this.head];
      this._sum -= evicted;
      this._sumSq -= evicted * evicted;
    } else {
      this._count++;
    }

    this.buffer[this.head] = value;
    this._sum += value;
    this._sumSq += value * value;
    this.head = (this.head + 1) % this.capacity;

    this.pushCount++;
    if (this.pushCount >= this.RECALC_INTERVAL) {
      this.recalculate();
      this.pushCount = 0;
    }
  }

  get mean(): number {
    if (this._count === 0) return 0;
    return this._sum / this._count;
  }

  get variance(): number {
    if (this._count < 2) return 0;
    // Population variance: E[X²] - (E[X])²
    const m = this._sum / this._count;
    const v = this._sumSq / this._count - m * m;
    // Clamp to 0 to avoid negative variance from float precision
    return v > 0 ? v : 0;
  }

  get std(): number {
    return Math.sqrt(this.variance);
  }

  get length(): number {
    return this._count;
  }

  get isFull(): boolean {
    return this._count === this.capacity;
  }

  get sum(): number {
    return this._sum;
  }

  last(): number {
    if (this._count === 0) return 0;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  reset(): void {
    this.buffer.fill(0);
    this.head = 0;
    this._count = 0;
    this._sum = 0;
    this._sumSq = 0;
    this.pushCount = 0;
  }

  /**
   * Full recalculation of sum/sumSq from buffer values.
   * Called periodically to prevent floating-point drift.
   */
  private recalculate(): void {
    let s = 0;
    let sq = 0;
    // Read in insertion order: oldest first
    const start = this._count === this.capacity ? this.head : 0;
    for (let i = 0; i < this._count; i++) {
      const idx = (start + i) % this.capacity;
      const v = this.buffer[idx];
      s += v;
      sq += v * v;
    }
    this._sum = s;
    this._sumSq = sq;
  }
}
