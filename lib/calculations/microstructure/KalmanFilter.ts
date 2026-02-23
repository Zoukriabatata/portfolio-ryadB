/**
 * KalmanFilter — Permanent/transitory decomposition of cumulative delta
 *
 * State-space model:
 *   State equation:       μ_t = μ_{t-1} + η_t,  η ~ N(0, Q)
 *   Observation equation: y_t = μ_t + ε_t,       ε ~ N(0, R)
 *
 * μ_t = permanent component (informational flow — efficient price discovery)
 * ε_t = transitory component (noise — algorithmic/liquidity effects)
 *
 * The filter separates the "true" informational content of cumulative delta
 * from transient microstructure noise, following Martin Donate (TESIS-2025-226, Ch.4).
 *
 * Adaptive mode re-estimates Q and R from observed residuals, making the
 * filter self-tuning without manual parameter selection.
 */

import { RingBuffer } from './RingBuffer';
import type { KalmanConfig } from './types';

const DEFAULT_CONFIG: KalmanConfig = {
  processNoise: 0.01,
  observationNoise: 1.0,
  initialState: 0,
  initialVariance: 1.0,
  adaptiveWindow: 100,
  adaptiveEnabled: true,
};

// Prevent Kalman gain from collapsing to 0 or 1
const K_MIN = 0.01;
const K_MAX = 0.99;

// Re-estimate noise parameters every N steps
const ADAPTIVE_INTERVAL = 50;

export class KalmanFilter {
  private config: KalmanConfig;

  // Filter state
  private mu: number;         // Filtered state estimate (permanent component)
  private P: number;          // State covariance (uncertainty)
  private _K: number = 0.5;   // Kalman gain
  private _residual: number = 0;
  private lastObservation: number = 0;

  // Noise parameters (may be adapted)
  private Q: number;          // Process noise variance σ²_η
  private R: number;          // Observation noise variance σ²_ε

  // Adaptive estimation buffers
  private residualBuffer: RingBuffer;
  private innovationBuffer: RingBuffer;
  private stepCount: number = 0;

  constructor(config?: Partial<KalmanConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.mu = this.config.initialState;
    this.P = this.config.initialVariance;
    this.Q = this.config.processNoise;
    this.R = this.config.observationNoise;
    this.residualBuffer = new RingBuffer(this.config.adaptiveWindow);
    this.innovationBuffer = new RingBuffer(this.config.adaptiveWindow);
  }

  /**
   * Update the filter with a new observation (cumulative delta at candle close).
   *
   * Kalman equations:
   *   Predict:  μ_pred = μ,        P_pred = P + Q
   *   Update:   K = P_pred / (P_pred + R)
   *             μ = μ_pred + K * (y - μ_pred)
   *             P = (1 - K) * P_pred
   */
  update(observation: number): void {
    this.stepCount++;
    this.lastObservation = observation;

    // === PREDICT ===
    const muPred = this.mu;              // Random walk: state doesn't change
    const PPred = this.P + this.Q;       // Uncertainty grows by process noise

    // === UPDATE ===
    const innovation = observation - muPred;
    const S = PPred + this.R;            // Innovation variance

    // Kalman gain with clamping
    let K = S > 0 ? PPred / S : 0.5;
    K = Math.max(K_MIN, Math.min(K_MAX, K));

    this.mu = muPred + K * innovation;
    this.P = (1 - K) * PPred;
    this._K = K;
    this._residual = observation - this.mu;

    // Store for adaptive estimation
    if (this.config.adaptiveEnabled) {
      this.innovationBuffer.push(innovation);
      this.residualBuffer.push(this._residual);

      // Periodically re-estimate noise parameters
      if (this.stepCount % ADAPTIVE_INTERVAL === 0 && this.stepCount >= this.config.adaptiveWindow) {
        this.adaptNoiseParameters();
      }
    }
  }

  /**
   * Re-estimate Q and R from observed residuals and innovations.
   * R_est = Var(residuals)
   * Q_est = Var(innovations) - R_est  (clamped to > 0)
   */
  private adaptNoiseParameters(): void {
    const residualVar = this.residualBuffer.variance;
    const innovationVar = this.innovationBuffer.variance;

    // R = observation noise ≈ variance of post-update residuals
    if (residualVar > 0) {
      this.R = residualVar;
    }

    // Q = process noise ≈ innovation variance minus observation noise
    const qEst = innovationVar - this.R;
    if (qEst > 0) {
      this.Q = qEst;
    } else {
      // Minimum process noise to prevent filter from freezing
      this.Q = this.config.processNoise * 0.1;
    }
  }

  // === Getters — all O(1) ===

  /** Permanent component μ_t — informational flow */
  get permanentComponent(): number { return this.mu; }

  /** Transitory component (y_t - μ_t) — microstructure noise */
  get transitoryComponent(): number { return this._residual; }

  /** Kalman gain K_t ∈ [0.01, 0.99] */
  get kalmanGain(): number { return this._K; }

  /** Signal-to-noise: |permanent| / max(|transitory|, ε) */
  get signalToNoise(): number {
    const absTrans = Math.abs(this._residual);
    if (absTrans < 1e-10) return Math.abs(this.mu) > 1e-10 ? 100 : 0;
    return Math.abs(this.mu) / absTrans;
  }

  /** State variance P_t — filter uncertainty */
  get stateVariance(): number { return this.P; }

  /** True after enough observations for adaptive estimation */
  get isWarmedUp(): boolean { return this.stepCount >= this.config.adaptiveWindow; }

  reset(): void {
    this.mu = this.config.initialState;
    this.P = this.config.initialVariance;
    this.Q = this.config.processNoise;
    this.R = this.config.observationNoise;
    this._K = 0.5;
    this._residual = 0;
    this.lastObservation = 0;
    this.stepCount = 0;
    this.residualBuffer.reset();
    this.innovationBuffer.reset();
  }
}
