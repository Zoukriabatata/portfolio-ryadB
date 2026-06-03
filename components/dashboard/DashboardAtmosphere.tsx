"use client";

/**
 * Editorial Terminal atmosphere — three CSS-only layers that paint
 * subtle depth behind the bento without ever competing with the
 * widgets in front. All layers are `pointer-events-none` and sit on
 * a positioned-absolute layer below the dashboard content.
 *
 * Layer breakdown :
 *
 *   1.  Blueprint grid          — hairline graph-paper reference at
 *                                 4 % opacity. Grounds the editorial
 *                                 aesthetic in a "trading chart"
 *                                 metaphor without screaming it.
 *
 *   2.  Orbiting halos          — two large radial-gradient ellipses
 *                                 anchored at opposite corners. Each
 *                                 rotates on a 40-60 s loop so the
 *                                 light slowly breathes across the
 *                                 surface. Drop-shadow blur softens
 *                                 the edges to nothing.
 *
 *   3.  Phosphor sweep          — a single vertical line travels
 *                                 bottom → top once every 22 s with
 *                                 a wide blur radius. Reads as
 *                                 ambient CRT signal, never as a
 *                                 scanner / pulse / progress bar.
 *
 * Honours `prefers-reduced-motion` by killing the orbit + sweep
 * animations (the grid + halos stay static at their initial frame
 * so the page still has texture).
 */

import { cn } from "@/lib/utils";

export function DashboardAtmosphere() {
  return (
    <>
      {/* Layer 1 — blueprint grid. Fixed position so it doesn't shift
          on scroll which would ruin the "graph paper substrate"
          illusion. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 -z-[1]",
          "atmosphere-grid",
        )}
      />

      {/* Layer 2 — two orbiting halos. Wrapped in their own div so
          we can rotate the wrapper rather than each gradient
          (avoids subpixel artefacts on long-running animations). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-[1]",
          "overflow-hidden",
        )}
      >
        <div className="atmosphere-halo atmosphere-halo-tl" />
        <div className="atmosphere-halo atmosphere-halo-br" />
      </div>

      {/* Layer 3 — phosphor sweep. One slim horizontal band that
          rises from below the viewport, peaks in the middle, and
          fades into the top. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 -z-[1]",
          "overflow-hidden",
        )}
      >
        <div className="atmosphere-sweep" />
      </div>

      <style>{`
        /* === Blueprint grid ===
           4 % opacity lime hairlines on a 48 px × 48 px grid. Two
           perpendicular linear-gradients stacked do the job without
           a SVG round-trip. */
        .atmosphere-grid {
          background-image:
            linear-gradient(
              to right,
              rgba(74, 222, 128, 0.04) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(74, 222, 128, 0.04) 1px,
              transparent 1px
            );
          background-size: 48px 48px;
          mask-image: radial-gradient(
            ellipse at 50% 40%,
            black 35%,
            transparent 80%
          );
        }

        /* === Orbiting halos ===
           Each halo is a single radial gradient inside a wrapper
           rotating around the centre. transform-origin set so the
           gradient orbits roughly the viewport diagonal, never
           crossing the centre (it would draw attention to the grid
           middle which is where the widgets live). */
        .atmosphere-halo {
          position: absolute;
          width: 80vw;
          height: 80vw;
          max-width: 1200px;
          max-height: 1200px;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.55;
          will-change: transform;
        }
        .atmosphere-halo-tl {
          top: -30vw;
          left: -25vw;
          background: radial-gradient(
            circle at center,
            rgba(74, 222, 128, 0.20) 0%,
            rgba(74, 222, 128, 0.06) 45%,
            transparent 70%
          );
          animation: halo-orbit-a 56s ease-in-out infinite alternate;
        }
        .atmosphere-halo-br {
          bottom: -35vw;
          right: -30vw;
          background: radial-gradient(
            circle at center,
            rgba(74, 222, 128, 0.14) 0%,
            rgba(74, 222, 128, 0.04) 40%,
            transparent 70%
          );
          animation: halo-orbit-b 72s ease-in-out infinite alternate;
        }
        @keyframes halo-orbit-a {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          50%  { transform: translate3d(6vw, 4vw, 0) scale(1.08); }
          100% { transform: translate3d(-3vw, 7vw, 0) scale(0.96); }
        }
        @keyframes halo-orbit-b {
          0%   { transform: translate3d(0, 0, 0) scale(0.95); }
          50%  { transform: translate3d(-5vw, -4vw, 0) scale(1.05); }
          100% { transform: translate3d(4vw, -6vw, 0) scale(1.0); }
        }

        /* === Phosphor sweep ===
           A 1 px lime line + 60 px wide blurred bloom that travels
           from below-viewport to above-viewport once per 22 s.
           Opacity tapers at both ends so the entrance + exit feel
           atmospheric, not scripted. */
        .atmosphere-sweep {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: rgba(74, 222, 128, 0.35);
          box-shadow:
            0 0 24px rgba(74, 222, 128, 0.25),
            0 0 60px rgba(74, 222, 128, 0.15);
          will-change: transform, opacity;
          animation: phosphor-sweep 22s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        @keyframes phosphor-sweep {
          0%   { transform: translateY(110vh); opacity: 0; }
          10%  { opacity: 0.6; }
          50%  { transform: translateY(50vh); opacity: 0.5; }
          90%  { opacity: 0.4; }
          100% { transform: translateY(-10vh); opacity: 0; }
        }

        /* === Reduced motion ===
           Freeze the orbit + sweep but keep the grid + halos so the
           texture survives. */
        @media (prefers-reduced-motion: reduce) {
          .atmosphere-halo,
          .atmosphere-sweep {
            animation: none !important;
          }
          .atmosphere-sweep {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
