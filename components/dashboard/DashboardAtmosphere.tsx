"use client";

/**
 * Editorial Terminal atmosphere — "Aurora signal."
 *
 * Three soft lime gradient blobs drift across the viewport on
 * desynchronised long-loop animations. Reads as ambient light
 * breathing across the surface, never as a discrete effect. The
 * desync (62 s / 84 s / 108 s) means the composite movement never
 * resyncs — the user sees fluid organic motion instead of a tape
 * loop.
 *
 * Replaces the previous "halos + blueprint grid + sweep" recipe :
 *   • the grid was too quiet to register at 4 % opacity through
 *     the grain overlay
 *   • the sweep ended up reading as a progress bar on slower polls
 *   • the halos were too symmetric to look alive
 *
 * Implementation notes :
 *   • All three blobs sit on a single fixed-position layer so the
 *     paint cost stays predictable on long sessions (no scroll-
 *     bound layout invalidations).
 *   • `will-change: transform, opacity` lifts each blob to its
 *     own GPU layer so the 60 s+ animations don't cost CPU.
 *   • `mix-blend-mode: screen` lets the blobs reinforce each
 *     other where they overlap (organic specular highlight) and
 *     fade properly over the surface gradient otherwise.
 *   • `prefers-reduced-motion: reduce` freezes each blob at frame
 *     0 — the texture survives, only the drift stops.
 */

import { cn } from "@/lib/utils";

export function DashboardAtmosphere() {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 -z-[1]",
          "overflow-hidden",
          "atmosphere-aurora",
        )}
      >
        <div className="aurora-blob aurora-blob-a" />
        <div className="aurora-blob aurora-blob-b" />
        <div className="aurora-blob aurora-blob-c" />
        <div className="aurora-vignette" />
      </div>

      <style>{`
        /* Surface tint behind the blobs — a subtle lime wash over
           the base black so the aurora has something to "sit on"
           even when the blobs drift to the corners. */
        .atmosphere-aurora {
          background:
            radial-gradient(
              ellipse 90% 70% at 50% 0%,
              rgba(74, 222, 128, 0.04),
              transparent 60%
            ),
            radial-gradient(
              ellipse 70% 80% at 80% 100%,
              rgba(74, 222, 128, 0.025),
              transparent 60%
            );
        }

        .aurora-blob {
          position: absolute;
          width: 65vw;
          height: 65vw;
          max-width: 1100px;
          max-height: 1100px;
          border-radius: 50%;
          filter: blur(110px);
          mix-blend-mode: screen;
          will-change: transform, opacity;
        }

        /* Blob A — the brightest one. Wanders the upper-left
           quadrant. Slowest of the three so the eye keeps
           recognising it. */
        .aurora-blob-a {
          top: -10vh;
          left: -10vw;
          background: radial-gradient(
            circle at center,
            rgba(74, 222, 128, 0.30) 0%,
            rgba(74, 222, 128, 0.10) 40%,
            transparent 70%
          );
          opacity: 0.85;
          animation: aurora-drift-a 62s ease-in-out infinite alternate;
        }

        /* Blob B — secondary. Mid-tone, anchors the bottom-right. */
        .aurora-blob-b {
          bottom: -15vh;
          right: -15vw;
          background: radial-gradient(
            circle at center,
            rgba(74, 222, 128, 0.20) 0%,
            rgba(74, 222, 128, 0.06) 40%,
            transparent 70%
          );
          opacity: 0.8;
          animation: aurora-drift-b 84s ease-in-out infinite alternate;
        }

        /* Blob C — accent. Cooler / deeper tone, drifts across the
           middle band. The slight cyan-shift on this one (still in
           the lime family but towards 140° hue) is the only place
           we let the palette breathe. */
        .aurora-blob-c {
          top: 30vh;
          left: 25vw;
          background: radial-gradient(
            circle at center,
            rgba(60, 200, 150, 0.18) 0%,
            rgba(60, 200, 150, 0.05) 45%,
            transparent 75%
          );
          opacity: 0.7;
          animation: aurora-drift-c 108s ease-in-out infinite alternate;
        }

        /* Edge vignette — deepens the corners so the eye gravitates
           toward the centre band where the bento sits. Static, no
           animation. */
        .aurora-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse 90% 90% at 50% 50%,
            transparent 50%,
            rgba(0, 0, 0, 0.35) 100%
          );
          mix-blend-mode: multiply;
        }

        @keyframes aurora-drift-a {
          0%   {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.85;
          }
          50%  {
            transform: translate3d(15vw, 12vh, 0) scale(1.12);
            opacity: 0.95;
          }
          100% {
            transform: translate3d(-8vw, 22vh, 0) scale(0.92);
            opacity: 0.75;
          }
        }
        @keyframes aurora-drift-b {
          0%   {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.8;
          }
          50%  {
            transform: translate3d(-18vw, -10vh, 0) scale(0.9);
            opacity: 0.7;
          }
          100% {
            transform: translate3d(10vw, -18vh, 0) scale(1.08);
            opacity: 0.85;
          }
        }
        @keyframes aurora-drift-c {
          0%   {
            transform: translate3d(0, 0, 0) scale(0.95);
            opacity: 0.65;
          }
          50%  {
            transform: translate3d(20vw, -8vh, 0) scale(1.18);
            opacity: 0.85;
          }
          100% {
            transform: translate3d(-12vw, 14vh, 0) scale(1.0);
            opacity: 0.7;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-blob {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
