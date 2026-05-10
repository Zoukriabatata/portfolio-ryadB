// Phase B / M4.7c — debounced + idle-scheduled indicator runner.
//
// Bybit BTC 5s can fire 10+ FootprintBar updates per second. Running
// the indicator pipeline on every one of them blocks the main thread
// for a few hundred microseconds at a time, which compounds to
// noticeable jitter on pan/zoom. This runner:
//   1. coalesces bursty calls behind a 200 ms timeout, then
//   2. defers the actual compute to requestIdleCallback so it slots
//      between paint frames instead of jumping the queue.
//
// `requestIdleCallback` is available on every Chromium-based runtime
// — including Tauri's WebView2 on Windows — but the setTimeout
// fallback keeps the runner working in WebKit/Tauri-Mac, which
// historically lacks rIC.

import type { FootprintBar } from "../../components/FootprintBarView";
import {
  computeAllIndicators,
  type IndicatorsConfig,
  type IndicatorsResult,
} from "./indicators";

type IdleCb = (deadline: IdleDeadline) => void;

const ric: (cb: IdleCb) => number =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb) =>
        window.setTimeout(
          () =>
            cb({
              didTimeout: false,
              timeRemaining: () => 0,
            } as IdleDeadline),
          100,
        );

const cic: (id: number) => void =
  typeof cancelIdleCallback === "function"
    ? cancelIdleCallback
    : (id) => clearTimeout(id);

const DEBOUNCE_MS = 200;

export class IndicatorsRunner {
  private debounceTimer: number | null = null;
  private idleHandle: number | null = null;
  private listener: ((result: IndicatorsResult) => void) | null = null;

  setListener(fn: (result: IndicatorsResult) => void) {
    this.listener = fn;
  }

  schedule(
    bars: FootprintBar[],
    config: IndicatorsConfig,
    currentPrice: number,
  ) {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.idleHandle !== null) cic(this.idleHandle);

    // Capture inputs by reference at schedule time. By the time the
    // idle callback fires, the React layer may have produced newer
    // state; we accept the staleness because debouncing is the
    // whole point — the next schedule() will land within 200 ms.
    const snapshot = bars;
    const cfg = config;
    const px = currentPrice;

    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.idleHandle = ric(() => {
        this.idleHandle = null;
        const result = computeAllIndicators(snapshot, cfg, px);
        this.listener?.(result);
      });
    }, DEBOUNCE_MS);
  }

  destroy() {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.idleHandle !== null) cic(this.idleHandle);
    this.debounceTimer = null;
    this.idleHandle = null;
    this.listener = null;
  }
}
