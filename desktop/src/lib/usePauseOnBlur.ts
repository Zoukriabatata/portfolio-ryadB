// Pause all animations + RAF when the OrderflowV2 window is not the
// foreground window. Saves >90% of GPU/CPU when the user alt-tabs to
// another app (e.g. Valorant) — RAF stops, CSS animations freeze.
//
// Triggers on either signal:
//   • document.visibilityState === 'hidden' (minimised, tab switch)
//   • window blur (alt-tab to another desktop window, even if visible)
//
// Effect: toggles a `data-app-inactive` attribute on <html>. The CSS
// in globals.css uses it to set `animation-play-state: paused` on
// every animated element. Canvas-based code (BlackHole, footprint)
// reads `isAppActive()` directly to skip scheduling RAF frames.

let active = true;
const listeners = new Set<(active: boolean) => void>();

function compute(): boolean {
  if (typeof document === "undefined") return true;
  const hidden = document.hidden;
  const blurred = !document.hasFocus();
  return !(hidden || blurred);
}

function update(): void {
  const next = compute();
  if (next === active) return;
  active = next;
  if (typeof document !== "undefined") {
    document.documentElement.toggleAttribute("data-app-inactive", !next);
  }
  listeners.forEach((fn) => fn(next));
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  document.addEventListener("visibilitychange", update);
  // Initial sync (defer one tick so hydration finishes first).
  setTimeout(update, 0);
}

/** Returns whether the OrderflowV2 window currently has focus AND is
 * visible. Updates synchronously on focus/blur/visibility events. */
export function isAppActive(): boolean {
  return active;
}

/** Subscribe to app-active changes. Returns an unsubscribe fn. */
export function onAppActiveChange(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
