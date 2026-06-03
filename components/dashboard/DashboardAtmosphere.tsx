"use client";

/**
 * Editorial Terminal atmosphere — "Architectural Depth."
 *
 * The previous "Aurora" recipe (three drifting lime blobs +
 * vignette + grain) read as "green dots / grain on dark" — the
 * user reported it as visually noisy. This version commits to a
 * radically calmer background :
 *
 *   • A static three-stop vertical depth gradient. Slightly lighter
 *     mid-band suggests a horizon line that the bento "sits on."
 *   • A single very large soft halo behind the upper third —
 *     barely-perceptible lime, exists only to keep the surface
 *     alive without colouring it.
 *   • One slow horizontal ribbon traverses the viewport every
 *     38 seconds. Sub-1 px tall + 80 px blur means it reads as
 *     ambient motion, never as a scanline.
 *
 * No grain, no multiple blobs, no vignette. The background is now
 * structural, not decorative.
 *
 * Honours `prefers-reduced-motion: reduce` by killing the ribbon
 * animation; the static depth gradient remains.
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
          "atmosphere-depth",
        )}
      >
        <div className="atmosphere-halo" />
        <div className="atmosphere-ribbon" />
      </div>

      <style>{`
        /* Vertical depth gradient — top is deepest black, the
           middle "horizon" is barely lifted toward warm charcoal,
           bottom returns to near-black. The 3-stop ramp gives the
           page a centre of gravity without a single accent colour. */
        .atmosphere-depth {
          background:
            linear-gradient(
              180deg,
              #06060c 0%,
              #0a0a12 38%,
              #0c0d16 50%,
              #08080f 78%,
              #050509 100%
            );
        }

        /* Soft architectural halo anchored to the upper third. Very
           low alpha, very large radius — keeps the surface "lit"
           without colouring the cards in front of it. The halo is
           static; the only motion comes from the ribbon below. */
        .atmosphere-halo {
          position: absolute;
          top: -20vh;
          left: 50%;
          transform: translateX(-50%);
          width: 120vw;
          max-width: 1600px;
          height: 70vh;
          background: radial-gradient(
            ellipse 60% 100% at 50% 30%,
            rgba(74, 222, 128, 0.05) 0%,
            rgba(74, 222, 128, 0.02) 35%,
            transparent 65%
          );
          filter: blur(40px);
        }

        /* A 1 px lime hairline + 80 px wide bloom that travels from
           left to right once per 38 s. Opacity tapers at both ends
           so the cross feels atmospheric, not scripted. The line
           sits at ~62 % of the viewport height so the bento bottom
           rows pick up the most of the bloom — that's where the eye
           naturally lingers on a dashboard. */
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
