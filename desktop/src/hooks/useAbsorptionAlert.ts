import { useEffect } from "react";
import { useFootprintSettingsStore } from "../stores/useFootprintSettingsStore";
import { playAlertSound } from "./useAlertWatcher";

/**
 * Absorption sound alert.
 *
 * The footprint renderer (FootprintProAdapter) dispatches a
 * `senzoukria:absorption-alert` window event ONCE per freshly-closed candle
 * that contains an absorption zone (deduped by bar time, fired only on the
 * closed bar — never the still-forming live bar). This hook turns that event
 * into the synthesised alert tone (reused from useAlertWatcher, no asset
 * needed). Gated by the user's "Use alert" toggle.
 */
export function useAbsorptionAlert(): void {
  const enabled = useFootprintSettingsStore((s) => s.absorptionZoneUseAlert);
  useEffect(() => {
    if (!enabled) return;
    const handler = () => playAlertSound();
    window.addEventListener("senzoukria:absorption-alert", handler);
    return () => window.removeEventListener("senzoukria:absorption-alert", handler);
  }, [enabled]);
}
