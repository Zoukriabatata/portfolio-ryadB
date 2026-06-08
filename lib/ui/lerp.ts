// Interpolation helpers for fluid canvas redraws + value transitions (motion P8).
// Keeps bar/value updates from "flashing" — they ease toward the target instead.

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Anime une valeur de `from` vers `to` sur ~`durMs` (ease-out cubic) via rAF.
 * Renvoie une fonction d'annulation. À couper si prefers-reduced-motion.
 */
export function animateValue(
  from: number,
  to: number,
  durMs: number,
  onTick: (v: number) => void,
): () => void {
  if (typeof window === 'undefined') {
    onTick(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durMs);
    const eased = 1 - Math.pow(1 - t, 3);
    onTick(lerp(from, to, eased));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** True si l'utilisateur a demandé moins d'animation. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
