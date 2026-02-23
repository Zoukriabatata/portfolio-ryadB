// Microstructure Engine — Academic signal extraction types
// Based on: Martin Donate (VPIN/Kalman), Kang (matched filter), Albers et al. (reversals)

export type DeltaSignal = 'noise' | 'weak' | 'moderate' | 'strong';
export type VPINSignal = 'low' | 'medium' | 'high' | 'toxic';

export interface NormalizedDeltaConfig {
  windowSize: number;
  strongThreshold: number;
  moderateThreshold: number;
  weakThreshold: number;
}

export interface VPINConfig {
  bucketSize: number;           // 0 = auto-calibrate from observed volume
  numBuckets: number;           // Rolling window of completed buckets
  highThreshold: number;
  toxicThreshold: number;
  autoCalibrate: boolean;
  calibrationPeriodMs: number;  // Duration for auto bucket size estimation
}

export interface KalmanConfig {
  processNoise: number;         // σ²_η — state transition noise
  observationNoise: number;     // σ²_ε — measurement noise
  initialState: number;
  initialVariance: number;
  adaptiveWindow: number;       // Window for adaptive noise re-estimation
  adaptiveEnabled: boolean;
}

export interface MicrostructureConfig {
  normalizedDelta: NormalizedDeltaConfig;
  vpin: VPINConfig;
  kalman: KalmanConfig;
}

export interface MicrostructureState {
  // Normalized Delta
  deltaNorm: number;
  deltaSignal: DeltaSignal;
  rollingDeltaMean: number;
  rollingDeltaStd: number;

  // VPIN
  vpin: number;
  vpinSignal: VPINSignal;
  vpinBucketProgress: number;
  completedBuckets: number;

  // Kalman Filter
  permanentComponent: number;
  transitoryComponent: number;
  kalmanGain: number;
  signalToNoise: number;

  // Meta
  lastUpdate: number;
  isWarmedUp: boolean;
}

export const DEFAULT_MICROSTRUCTURE_CONFIG: MicrostructureConfig = {
  normalizedDelta: {
    windowSize: 100,
    strongThreshold: 3.0,
    moderateThreshold: 2.0,
    weakThreshold: 1.0,
  },
  vpin: {
    bucketSize: 0,
    numBuckets: 50,
    highThreshold: 0.5,
    toxicThreshold: 0.7,
    autoCalibrate: true,
    calibrationPeriodMs: 300_000,
  },
  kalman: {
    processNoise: 0.01,
    observationNoise: 1.0,
    initialState: 0,
    initialVariance: 1.0,
    adaptiveWindow: 100,
    adaptiveEnabled: true,
  },
};

export const INITIAL_MICROSTRUCTURE_STATE: MicrostructureState = {
  deltaNorm: 0,
  deltaSignal: 'noise',
  rollingDeltaMean: 0,
  rollingDeltaStd: 0,
  vpin: 0,
  vpinSignal: 'low',
  vpinBucketProgress: 0,
  completedBuckets: 0,
  permanentComponent: 0,
  transitoryComponent: 0,
  kalmanGain: 0,
  signalToNoise: 0,
  lastUpdate: 0,
  isWarmedUp: false,
};
