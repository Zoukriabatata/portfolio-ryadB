/**
 * NormalizedDelta — Delta z-score computation
 *
 * Transforms raw delta (askVolume - bidVolume) into a statistically normalized
 * signal. Under H₀ (martingale), E[delta] = 0 and most raw deltas are noise.
 * Only delta > 2σ is statistically distinguishable from microstructure noise.
 *
 * Reference: Martin Donate (TESIS-2025-226), Kang (2512.18648v3)
 */

import { RingBuffer } from './RingBuffer';
import type { DeltaSignal, NormalizedDeltaConfig } from './types';

const DEFAULT_CONFIG: NormalizedDeltaConfig = {
  windowSize: 100,
  strongThreshold: 3.0,
  moderateThreshold: 2.0,
  weakThreshold: 1.0,
};

const STD_EPSILON = 1e-10;

export class NormalizedDelta {
  private config: NormalizedDeltaConfig;
  private deltaBuffer: RingBuffer;
  private _zScore: number = 0;
  private _signal: DeltaSignal = 'noise';

  constructor(config?: Partial<NormalizedDeltaConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deltaBuffer = new RingBuffer(this.config.windowSize);
  }

  /**
   * Push a completed candle's totalDelta into the rolling window.
   * Recomputes z-score and signal classification.
   */
  pushDelta(delta: number): void {
    this.deltaBuffer.push(delta);

    const std = this.deltaBuffer.std;
    if (std < STD_EPSILON) {
      this._zScore = 0;
      this._signal = 'noise';
      return;
    }

    this._zScore = (delta - this.deltaBuffer.mean) / std;
    this._signal = this.classify(Math.abs(this._zScore));
  }

  /**
   * Compute z-score for an individual price level's delta,
   * using the candle-scale rolling statistics as context.
   * This makes per-level deltas comparable to the candle distribution.
   */
  computeLevelZScore(levelDelta: number): number {
    const std = this.deltaBuffer.std;
    if (std < STD_EPSILON || this.deltaBuffer.length < 2) return 0;
    return (levelDelta - this.deltaBuffer.mean) / std;
  }

  private classify(absZ: number): DeltaSignal {
    if (absZ >= this.config.strongThreshold) return 'strong';
    if (absZ >= this.config.moderateThreshold) return 'moderate';
    if (absZ >= this.config.weakThreshold) return 'weak';
    return 'noise';
  }

  get zScore(): number { return this._zScore; }
  get signal(): DeltaSignal { return this._signal; }
  get rollingMean(): number { return this.deltaBuffer.mean; }
  get rollingStd(): number { return this.deltaBuffer.std; }
  get isWarmedUp(): boolean { return this.deltaBuffer.length >= this.config.windowSize / 2; }

  reset(): void {
    this.deltaBuffer.reset();
    this._zScore = 0;
    this._signal = 'noise';
  }
}
