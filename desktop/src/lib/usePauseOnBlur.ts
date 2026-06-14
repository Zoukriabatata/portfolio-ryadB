// Pause all animations + RAF ONLY when the OrderflowV2 window is truly
// hidden (minimised, or the OS/tab has hidden its surface). It keeps
// running while merely unfocused so a trading setup — Orderflow on one
// monitor, NinjaTrader / the broker focused on another — never freezes.
//
// Rationale: an earlier version also paused on window `blur`, which
// meant the chart stopped the instant the user clicked any other app.
// For an orderflow tool that's the opposite of what you want. We now
// gate purely on `document.hidden`: when minimised, rendering is wasted
// anyway (and the Rust backend keeps ingesting ticks, so the chart is
// current again on restore). Event-driven work (alerts, sounds, bar
// state) is never paused — only RAF rendering + CSS animations.
//
// Effect: toggles a `data-app-inactive` attribute on <html>. The CSS
// in globals.css uses it to set `animation-play-state: paused` on
// every animated element. Canvas-based code (BlackHole, footprint)
// reads `isAppActive()` directly to skip scheduling RAF frames.

let active = true;
const listeners = new Set<(active: boolean) => void>();

function compute(): boolean {
  if (typeof document === "undefined") return true;
  // Active whenever the window is visible — focus is irrelevant. Only a
  // truly hidden window (minimised / surface hidden) pauses rendering.
  return !document.hidden;
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
