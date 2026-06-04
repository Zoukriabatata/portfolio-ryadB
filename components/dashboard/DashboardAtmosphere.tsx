"use client";

/**
 * Editorial Terminal atmosphere — "Mono Editorial Depth."
 *
 * Strict noir / blanc palette as requested. The lime brand is now
 * confined to one element only — the slow horizontal ribbon — so it
 * reads as a deliberate signal, not surface decoration. Everything
 * else is pure greyscale.
 *
 * Layers (back → front) :
 *
 *   1.  Vertical depth gradient — neutral black ramp, no blue
 *       undertone. Five stops so the "horizon" lift at the centre
 *       reads smoothly without banding.
 *
 *   2.  Architectural blueprint grid — 80 × 80 px white hairlines
 *       at ~2 % alpha. Fades to nothing near the edges via a
 *       radial mask so it never frames the viewport. References the
 *       "graph paper" trader metaphor without colouring it.
 *
 *   3.  White overhead halo — soft elliptical white glow anchored
 *       to the top third. ~5 % alpha through a 60 px blur. Acts as
 *       the room's overhead light source — gives the surface a
 *       direction.
 *
 *   4.  Lime ribbon — single brand-coloured element. 1 px hairline
 *       + 80 px bloom traversing left → right every 38 s. The only
 *       moving element on the surface; the only chromatic accent.
 *
 * `prefers-reduced-motion: reduce` freezes the ribbon — the
 * static depth, grid, and halo stay intact.
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
          "atmosphere-mono",
        )}
      >
        <div className="atmosphere-grid" />
        <div className="atmosphere-halo" />
        <div className="atmosphere-ribbon" />
      </div>

      <style>{`
        /* === Layer 1 — neutral vertical depth ramp ===
           Pure greyscale, no blue / warm undertones. The centre
           lift to #0e0e0e suggests a horizon the bento sits on. */
        .atmosphere-mono {
          background:
            linear-gradient(
              180deg,
              #050505 0%,
              #0a0a0a 28%,
              #0e0e0e 50%,
              #0a0a0a 72%,
              #040404 100%
            );
        }

        /* === Layer 2 — architectural blueprint grid ===
           Two perpendicular linear-gradients give us hairlines at
           the chosen cadence without a SVG round-trip. The radial
           mask softens the grid to nothing near the viewport edges
           so it reads as substrate, not wallpaper. */
        .atmosphere-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(
              to right,
              rgba(255, 255, 255, 0.02) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(255, 255, 255, 0.02) 1px,
              transparent 1px
            );
          background-size: 80px 80px;
          mask-image: radial-gradient(
            ellipse 55% 50% at 50% 45%,
            black 40%,
            transparent 85%
          );
          -webkit-mask-image: radial-gradient(
            ellipse 55% 50% at 50% 45%,
            black 40%,
            transparent 85%
          );
        }

        /* === Layer 3 — white overhead halo ===
           Anchored to the top third. ~5 % alpha gives the surface a
           subtle "lit from above" feel without ever touching the
           card content. Pure white so the palette stays monochrome. */
        .atmosphere-halo {
          position: absolute;
          top: -15vh;
          left: 50%;
          transform: translateX(-50%);
          width: 120vw;
          max-width: 1600px;
          height: 70vh;
          background: radial-gradient(
            ellipse 55% 100% at 50% 30%,
            rgba(255, 255, 255, 0.045) 0%,
            rgba(255, 255, 255, 0.02) 35%,
            transparent 65%
          );
          filter: blur(50px);
        }

        /* === Layer 4 — the one chromatic accent ===
           A 1 px lime hairline + 80 px bloom that travels left → right
           once per 38 s along the 62 % vertical band (where the
           bento's mid-row sits — that's where the bloom is most
           useful). The lone moving element on the surface. */
        .atmosphere-ribbon {
          position: absolute;
          top: 62%;
          left: 0;
          width: 100%;
          height: 1px;
          background: rgba(74, 222, 128, 0.45);
          box-shadow:
            0 0 32px rgba(74, 222, 128, 0.30),
            0 0 80px rgba(74, 222, 128, 0.15);
          opacity: 0;
          transform: translateX(-110%);
          animation: ribbon-traverse 38s linear infinite;
          will-change: transform, opacity;
        }

        @keyframes ribbon-traverse {
          0%   { transform: translateX(-110%); opacity: 0; }
          12%  { opacity: 0.55; }
          50%  { opacity: 0.45; }
          88%  { opacity: 0.35; }
          100% { transform: translateX(110%); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .atmosphere-ribbon {
            animation: none !important;
            display: none;
          }
        }
      `}</style>
    </>
  );
}
