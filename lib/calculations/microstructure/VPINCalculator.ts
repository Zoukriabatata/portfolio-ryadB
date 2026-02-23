/**
 * VPINCalculator — Volume-Synchronized Probability of Informed Trading
 *
 * VPIN measures order flow toxicity using volume-bucketed (event-time) analysis.
 * Unlike clock-time metrics, volume buckets naturally adjust for activity level.
 *
 * Formula: VPIN = (1/n) * Σ |V_sell - V_buy| / V_bucket
 *
 * Range: [0, 1] where:
 *   0 = perfectly balanced flow (no toxicity)
 *   1 = completely one-sided flow (maximum toxicity)
 *
 * Reference: Martin Donate (TESIS-2025-226), Easley, Lopez de Prado & O'Hara (2012)
 */

import { RingBuffer } from './RingBuffer';
import type { VPINConfig, VPINSignal } from './types';

const DEFAULT_CONFIG: VPINConfig = {
  bucketSize: 0,
  numBuckets: 50,
  highThreshold: 0.5,
  toxicThreshold: 0.7,
  autoCalibrate: true,
  calibrationPeriodMs: 300_000,
};

export class VPINCalculator {
  private config: VPINConfig;

  // Current bucket accumulation
  private bucketBuyVol: number = 0;
  private bucketSellVol: number = 0;
  private bucketTotalVol: number = 0;

  // Completed buckets: stores |buyVol - sellVol| / totalVol per bucket
  private imbalanceBuffer: RingBuffer;

  // Calibration state
  private calibrationVolume: number = 0;
  private calibrationStart: number = 0;
  private calibrated: boolean = false;
  private effectiveBucketSize: number = 0;

  // Cached state
  private _completedBuckets: number = 0;

  constructor(config?: Partial<VPINConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.imbalanceBuffer = new RingBuffer(this.config.numBuckets);

    if (this.config.bucketSize > 0) {
      this.effectiveBucketSize = this.config.bucketSize;
      this.calibrated = true;
    }
  }

  /**
   * Process a single trade tick.
   * Accumulates volume into current bucket. When bucket fills,
   * computes order imbalance and starts a new bucket.
   * Handles trades that straddle bucket boundaries.
   */
  processTick(quantity: number, isBuy: boolean, timestamp: number): void {
    // Auto-calibration phase
    if (!this.calibrated && this.config.autoCalibrate) {
      if (this.calibrationStart === 0) {
        this.calibrationStart = timestamp;
      }

      this.calibrationVolume += quantity;
      const elapsed = timestamp - this.calibrationStart;

      if (elapsed >= this.config.calibrationPeriodMs && this.calibrationVolume > 0) {
        // Estimate daily volume from calibration period, then divide by numBuckets
        const dailyMs = 24 * 60 * 60 * 1000;
        const estimatedDailyVol = (this.calibrationVolume / elapsed) * dailyMs;
        this.effectiveBucketSize = estimatedDailyVol / this.config.numBuckets;
        this.calibrated = true;
        // Don't return — process this tick normally
      } else {
        return; // Still calibrating
      }
    }

    if (this.effectiveBucketSize <= 0) return;

    let remaining = quantity;

    while (remaining > 0) {
      const spaceInBucket = this.effectiveBucketSize - this.bucketTotalVol;
      const fill = Math.min(remaining, spaceInBucket);

      if (isBuy) {
        this.bucketBuyVol += fill;
      } else {
        this.bucketSellVol += fill;
      }
      this.bucketTotalVol += fill;
      remaining -= fill;

      // Bucket full — finalize
      if (this.bucketTotalVol >= this.effectiveBucketSize) {
        this.finalizeBucket();
      }
    }
  }

  private finalizeBucket(): void {
    if (this.bucketTotalVol <= 0) return;

    // Order imbalance for this bucket: |V_buy - V_sell| / V_total
    const imbalance = Math.abs(this.bucketBuyVol - this.bucketSellVol) / this.bucketTotalVol;
    this.imbalanceBuffer.push(imbalance);
    this._completedBuckets++;

    // Reset bucket
    this.bucketBuyVol = 0;
    this.bucketSellVol = 0;
    this.bucketTotalVol = 0;
  }

  /**
   * VPIN = mean of order imbalances across completed buckets.
   * O(1) — RingBuffer tracks running sum.
   */
  get vpin(): number {
    if (this.imbalanceBuffer.length === 0) return 0;
    return this.imbalanceBuffer.mean;
  }

  get signal(): VPINSignal {
    const v = this.vpin;
    if (v >= this.config.toxicThreshold) return 'toxic';
    if (v >= this.config.highThreshold) return 'high';
    if (v >= 0.3) return 'medium';
    return 'low';
  }

  get bucketProgress(): number {
    if (this.effectiveBucketSize <= 0) return 0;
    return Math.min(this.bucketTotalVol / this.effectiveBucketSize, 1);
  }

  get completedBuckets(): number {
    return this._completedBuckets;
  }

  get isWarmedUp(): boolean {
    return this.calibrated && this.imbalanceBuffer.length >= this.config.numBuckets;
  }

  get bucketSize(): number {
    return this.effectiveBucketSize;
  }

  setBucketSize(size: number): void {
    this.effectiveBucketSize = size;
    this.calibrated = true;
  }

  reset(): void {
    this.bucketBuyVol = 0;
    this.bucketSellVol = 0;
    this.bucketTotalVol = 0;
    this.imbalanceBuffer.reset();
    this.calibrationVolume = 0;
    this.calibrationStart = 0;
    this._completedBuckets = 0;

    if (this.config.bucketSize > 0) {
      this.effectiveBucketSize = this.config.bucketSize;
      this.calibrated = true;
    } else {
      this.effectiveBucketSize = 0;
      this.calibrated = false;
    }
  }
}
