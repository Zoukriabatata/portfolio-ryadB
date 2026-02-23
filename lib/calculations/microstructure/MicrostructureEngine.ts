/**
 * MicrostructureEngine — Facade composing academic signal extraction
 *
 * Combines NormalizedDelta, VPINCalculator, and KalmanFilter into a single
 * engine with a unified processTick() / onCandleClose() interface.
 *
 * Follows the UnifiedOrderflowEngine pattern: multi-sub-engine composition
 * with a single getState() aggregation method.
 *
 * Performance: O(1) per tick, O(1) per candle close, ~3KB memory.
 */

import { NormalizedDelta } from './NormalizedDelta';
import { VPINCalculator } from './VPINCalculator';
import { KalmanFilter } from './KalmanFilter';
import type { MicrostructureConfig, MicrostructureState } from './types';
import { DEFAULT_MICROSTRUCTURE_CONFIG, INITIAL_MICROSTRUCTURE_STATE } from './types';

export class MicrostructureEngine {
  private normalizedDelta: NormalizedDelta;
  private vpinCalculator: VPINCalculator;
  private kalmanFilter: KalmanFilter;

  private cumulativeDelta: number = 0;
  private _lastUpdate: number = 0;

  constructor(config?: Partial<MicrostructureConfig>) {
    const c = {
      normalizedDelta: { ...DEFAULT_MICROSTRUCTURE_CONFIG.normalizedDelta, ...config?.normalizedDelta },
      vpin: { ...DEFAULT_MICROSTRUCTURE_CONFIG.vpin, ...config?.vpin },
      kalman: { ...DEFAULT_MICROSTRUCTURE_CONFIG.kalman, ...config?.kalman },
    };

    this.normalizedDelta = new NormalizedDelta(c.normalizedDelta);
    this.vpinCalculator = new VPINCalculator(c.vpin);
    this.kalmanFilter = new KalmanFilter(c.kalman);
  }

  /**
   * Process a single trade tick (called per WebSocket message).
   * Updates VPIN (volume-bucketed) and running cumulative delta.
   * O(1) per call.
   */
  processTick(tick: { quantity: number; isBuyerMaker: boolean; timestamp: number }): void {
    const isBuy = !tick.isBuyerMaker;
    const signedDelta = isBuy ? tick.quantity : -tick.quantity;
    this.cumulativeDelta += signedDelta;
    this._lastUpdate = tick.timestamp;

    // VPIN accumulates every tick into volume buckets
    this.vpinCalculator.processTick(tick.quantity, isBuy, tick.timestamp);
  }

  /**
   * Called when a footprint candle closes.
   * Triggers NormalizedDelta (z-score) and Kalman filter (permanent/transitory).
   * These operate on candle-level data, not per-tick.
   */
  onCandleClose(candleDelta: number): void {
    this.normalizedDelta.pushDelta(candleDelta);
    this.kalmanFilter.update(this.cumulativeDelta);
  }

  /**
   * Get complete microstructure state. O(1) — reads cached values.
   */
  getState(): MicrostructureState {
    return {
      // Normalized Delta
      deltaNorm: this.normalizedDelta.zScore,
      deltaSignal: this.normalizedDelta.signal,
      rollingDeltaMean: this.normalizedDelta.rollingMean,
      rollingDeltaStd: this.normalizedDelta.rollingStd,

      // VPIN
      vpin: this.vpinCalculator.vpin,
      vpinSignal: this.vpinCalculator.signal,
      vpinBucketProgress: this.vpinCalculator.bucketProgress,
      completedBuckets: this.vpinCalculator.completedBuckets,

      // Kalman
      permanentComponent: this.kalmanFilter.permanentComponent,
      transitoryComponent: this.kalmanFilter.transitoryComponent,
      kalmanGain: this.kalmanFilter.kalmanGain,
      signalToNoise: this.kalmanFilter.signalToNoise,

      // Meta
      lastUpdate: this._lastUpdate,
      isWarmedUp:
        this.normalizedDelta.isWarmedUp &&
        this.vpinCalculator.isWarmedUp &&
        this.kalmanFilter.isWarmedUp,
    };
  }

  /**
   * Per-level z-score for rendering individual footprint price levels.
   */
  getLevelZScore(levelDelta: number): number {
    return this.normalizedDelta.computeLevelZScore(levelDelta);
  }

  get currentCumulativeDelta(): number {
    return this.cumulativeDelta;
  }

  getNormalizedDelta(): NormalizedDelta { return this.normalizedDelta; }
  getVPINCalculator(): VPINCalculator { return this.vpinCalculator; }
  getKalmanFilter(): KalmanFilter { return this.kalmanFilter; }

  reset(): void {
    this.normalizedDelta.reset();
    this.vpinCalculator.reset();
    this.kalmanFilter.reset();
    this.cumulativeDelta = 0;
    this._lastUpdate = 0;
  }
}

// ============ SINGLETON ============

let instance: MicrostructureEngine | null = null;

export function getMicrostructureEngine(config?: Partial<MicrostructureConfig>): MicrostructureEngine {
  if (!instance) {
    instance = new MicrostructureEngine(config);
  }
  return instance;
}

export function resetMicrostructureEngine(): void {
  instance?.reset();
  instance = null;
}
