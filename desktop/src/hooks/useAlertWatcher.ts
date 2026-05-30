// Audible price alerts — fires a short beep when the live close
// crosses any user-armed h-line marked `isAlert: true`. Crossings
// are detected against the *previous observed close*, so:
//   • A bar updating from 29350 → 29360 with an alert at 29355
//     triggers exactly once.
//   • A bar oscillating 29350 → 29360 → 29350 → 29360 triggers
//     once on the first crossing, then is auto-removed so it
//     can't double-fire.
//
// The fire path is intentionally minimal: synthesise the beep
// in-process via Web Audio so we don't ship a sound asset, and
// rely on the existing toolDrawings store for both the alert
// state and the remove-on-fire behaviour.

import { useEffect, useRef } from "react";
import { useToolDrawingsStore } from "../stores/useToolDrawingsStore";

// Module-level so repeated triggers reuse one AudioContext (Chrome
// caps the number of AC instances per tab). Lazy-initialised on
// first beep so we don't allocate when the user never arms an
// alert. Some browsers require a user gesture before the AC can
// actually emit sound — `playAlertSound` swallows that failure
// (the user just doesn't hear it). The visual auto-remove still
// fires, so the alert at least acts as a one-shot visual marker.
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Synthesise a short 880 Hz "ding" — 400 ms envelope, attack of
 *  20 ms then exponential decay. Safe to call without user gesture
 *  (it just stays silent on browsers that block autoplay), so the
 *  rest of the alert pipeline (visual removal) is unaffected. */
export function playAlertSound(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    // Two-tone bell: 880 Hz then 660 Hz, both overlapping a touch
    // for that "ding-dong" feel without a sample file.
    const now = ctx.currentTime;
    const peakGain = 0.28;
    for (const [freq, start] of [
      [880, 0],
      [660, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.36);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.4);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* swallow */
  }
}

/** Watches `latestPrice` against every armed h-line alert for the
 *  given symbol and fires `playAlertSound` + auto-removes the
 *  alert the first time price crosses the level. */
export function useAlertWatcher(
  latestPrice: number | null | undefined,
  symbol: string,
): void {
  // Resolved per render to keep the closure in sync with the
  // latest store state. The hook stays inert until at least one
  // alert exists, so the cost on cold charts is the price compare
  // + a Map lookup.
  const lineDrawings = useToolDrawingsStore((s) => s.lineDrawings);
  const removeLineDrawing = useToolDrawingsStore((s) => s.removeLineDrawing);
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    if (latestPrice === null || latestPrice === undefined) return;
    if (!Number.isFinite(latestPrice)) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = latestPrice;
    // First sample only initialises the baseline — there's no
    // "previous" to detect a crossing against yet.
    if (prev === null) return;
    if (prev === latestPrice) return;
    const lo = Math.min(prev, latestPrice);
    const hi = Math.max(prev, latestPrice);
    let fired = false;
    for (const d of lineDrawings) {
      if (d.kind !== "h-line") continue;
      if (!d.isAlert) continue;
      if (d.symbol !== symbol) continue;
      if (d.price >= lo && d.price <= hi) {
        if (!fired) {
          playAlertSound();
          fired = true;
        }
        // Remove the alert so it can't double-fire when price
        // oscillates around the level on the next bar update.
        removeLineDrawing(d.id);
      }
    }
  }, [latestPrice, symbol, lineDrawings, removeLineDrawing]);
}
