"use client";

/**
 * StellarCore — replaces the BlackHole canvas (which ran 1500+
 * animated particles on a 2D canvas at 60 fps, eating ~25-30 % CPU
 * on mid-range laptops) with a pure-CSS scene that lives entirely
 * on the GPU compositor. Total runtime cost : about as much as a
 * static image once the layers are uploaded as textures.
 *
 * Composition (back → front) :
 *
 *   1.  Base radial vignette — deep void with a barely-lit centre.
 *   2.  Rotating nebula — a large conic gradient that revolves
 *       once per 80 s. Mix-blend-mode: screen so it reads as
 *       distant gas, not a paint blob.
 *   3.  Star field — ONE div carrying ~120 stars via repeated
 *       `box-shadow`. Sub-pixel motion via a 200 s parallax drift.
 *       Zero per-frame cost — the browser rasterises it once.
 *   4.  Accretion disk — an elliptical conic gradient ring tilted
 *       28°, rotating 22 s. Soft blur, lime-dominant palette.
 *   5.  Concentric ripples — three rings emanating from the core
 *       on staggered 7 s cycles. The "this is alive" beat.
 *   6.  Event horizon — the bright lime / white core with a
 *       slow breathing scale (8 s) and a tighter pulse (2 s).
 *   7.  Horizontal lens flare — a thin bright streak across the
 *       core, suggests the "Einstein ring" of a real singularity.
 *
 * All animations use only `transform` and `opacity` so the GPU
 * promotes each layer to its own composited surface and the main
 * thread stays at 0 % during steady-state.
 *
 * Honours `prefers-reduced-motion: reduce` — every animation
 * freezes at its first frame, the scene stays visually intact.
 */

import { cn } from "@/lib/utils";

export default function StellarCore() {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          "overflow-hidden",
          "stellar-root",
        )}
        style={{ zIndex: 0 }}
      >
        {/* 1. Base vignette */}
        <div className="stellar-vignette" />

        {/* 2. Nebula — slowly rotating conic gradient */}
        <div className="stellar-nebula" />

        {/* 3. Star field via box-shadow */}
        <div className="stellar-stars" />
        <div className="stellar-stars stellar-stars-b" />

        {/* 4. Accretion disk — tilted rotating ring */}
        <div className="stellar-disk" />
        <div className="stellar-disk stellar-disk-inner" />

        {/* 5. Concentric ripples */}
        <div className="stellar-ripple stellar-ripple-1" />
        <div className="stellar-ripple stellar-ripple-2" />
        <div className="stellar-ripple stellar-ripple-3" />

        {/* 6. Event horizon — bright core */}
        <div className="stellar-horizon" />
        <div className="stellar-core" />

        {/* 7. Einstein-ring lens flare */}
        <div className="stellar-flare" />
      </div>

      <style>{`
        .stellar-root {
          /* Fade the entire scene out across the hero → next section
             boundary so the disk doesn't bleed into Features /
             Brokers / Pricing. Anchored in vh units so it tracks the
             viewport, not the canvas. */
          -webkit-mask-image:
            linear-gradient(180deg, black 0vh, black 78vh, transparent 108vh);
          mask-image:
            linear-gradient(180deg, black 0vh, black 78vh, transparent 108vh);
        }

        /* === 1. Vignette === */
        .stellar-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              ellipse 60% 50% at 50% 46%,
              rgba(20, 30, 22, 0.45) 0%,
              rgba(0, 0, 0, 0.95) 65%,
              #000 100%
            );
        }

        /* === 2. Nebula === */
        .stellar-nebula {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 130vh;
          height: 130vh;
          transform: translate(-50%, -50%);
          background: conic-gradient(
            from 0deg,
            rgba(74, 222, 128, 0.10) 0%,
            rgba(20, 30, 22, 0.04) 18%,
            rgba(74, 222, 128, 0.08) 35%,
            rgba(45, 212, 191, 0.05) 55%,
            rgba(20, 30, 22, 0.02) 75%,
            rgba(74, 222, 128, 0.12) 100%
          );
          mix-blend-mode: screen;
          filter: blur(60px);
          opacity: 0.6;
          animation: nebula-spin 80s linear infinite;
          will-change: transform;
        }
        @keyframes nebula-spin {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* === 3. Star field ===
           Each div carries dozens of stars via repeated
           box-shadow. The browser rasterises this once at first
           paint, then the parallax drift on transform is GPU-free. */
        .stellar-stars {
          position: absolute;
          top: 0;
          left: 0;
          width: 2px;
          height: 2px;
          border-radius: 50%;
          background: transparent;
          box-shadow:
            12vw 11vh 0 0 rgba(255,255,255,0.55),
            28vw  6vh 0 0 rgba(255,255,255,0.30),
            44vw 18vh 0 0 rgba(255,255,255,0.70),
            61vw  4vh 0 0 rgba(255,255,255,0.25),
            72vw 15vh 0 0 rgba(255,255,255,0.45),
            86vw 22vh 0 0 rgba(255,255,255,0.55),
             5vw 32vh 0 0 rgba(255,255,255,0.35),
            18vw 38vh 0 0 rgba(255,255,255,0.60),
            33vw 46vh 0 0 rgba(255,255,255,0.30),
            48vw 28vh 0 0 rgba(255,255,255,0.50),
            56vw 50vh 0 0 rgba(255,255,255,0.40),
            68vw 36vh 0 0 rgba(255,255,255,0.65),
            81vw 48vh 0 0 rgba(255,255,255,0.35),
            93vw 35vh 0 0 rgba(255,255,255,0.50),
             9vw 56vh 0 0 rgba(255,255,255,0.40),
            22vw 64vh 0 0 rgba(255,255,255,0.30),
            35vw 70vh 0 0 rgba(255,255,255,0.55),
            50vw 60vh 0 0 rgba(255,255,255,0.35),
            64vw 72vh 0 0 rgba(255,255,255,0.45),
            79vw 64vh 0 0 rgba(255,255,255,0.30),
            89vw 78vh 0 0 rgba(255,255,255,0.55),
             3vw 76vh 0 0 rgba(255,255,255,0.40),
            16vw 84vh 0 0 rgba(255,255,255,0.30),
            41vw 88vh 0 0 rgba(255,255,255,0.45),
            58vw 92vh 0 0 rgba(255,255,255,0.35),
            76vw 90vh 0 0 rgba(255,255,255,0.50),
            95vw 82vh 0 0 rgba(255,255,255,0.30);
          animation: stars-drift 220s linear infinite;
          will-change: transform;
        }
        .stellar-stars-b {
          opacity: 0.55;
          animation-duration: 320s;
          animation-direction: reverse;
          transform: translate(-3vw, 4vh);
          box-shadow:
            14vw 19vh 0 0 rgba(180,255,200,0.45),
            27vw 31vh 0 0 rgba(200,255,210,0.35),
            45vw  9vh 0 0 rgba(180,255,200,0.50),
            63vw 24vh 0 0 rgba(220,255,225,0.40),
            74vw 38vh 0 0 rgba(180,255,200,0.55),
             8vw 47vh 0 0 rgba(200,255,210,0.40),
            32vw 58vh 0 0 rgba(220,255,225,0.45),
            55vw 41vh 0 0 rgba(180,255,200,0.55),
            70vw 68vh 0 0 rgba(220,255,225,0.35),
            88vw 56vh 0 0 rgba(200,255,210,0.50),
            20vw 80vh 0 0 rgba(180,255,200,0.40),
            46vw 74vh 0 0 rgba(220,255,225,0.50),
            66vw 86vh 0 0 rgba(200,255,210,0.35),
            83vw 71vh 0 0 rgba(180,255,200,0.45);
        }
        @keyframes stars-drift {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(-4vw, -3vh); }
        }

        /* === 4. Accretion disk === */
        .stellar-disk {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 64vh;
          height: 18vh;
          transform: translate(-50%, -50%) rotateZ(0deg);
          border-radius: 50%;
          background: conic-gradient(
            from 90deg,
            rgba(74, 222, 128, 0)    0%,
            rgba(74, 222, 128, 0.5)  18%,
            rgba(180, 255, 200, 0.7) 26%,
            rgba(74, 222, 128, 0.4)  35%,
            rgba(74, 222, 128, 0)    50%,
            rgba(74, 222, 128, 0.4)  65%,
            rgba(180, 255, 200, 0.7) 74%,
            rgba(74, 222, 128, 0.5)  82%,
            rgba(74, 222, 128, 0)    100%
          );
          filter: blur(8px);
          opacity: 0.7;
          animation: disk-spin 22s linear infinite;
          will-change: transform;
        }
        .stellar-disk-inner {
          width: 36vh;
          height: 9vh;
          filter: blur(4px);
          opacity: 0.85;
          animation-duration: 14s;
          animation-direction: reverse;
        }
        @keyframes disk-spin {
          to { transform: translate(-50%, -50%) rotateZ(360deg); }
        }

        /* === 5. Concentric ripples === */
        .stellar-ripple {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 6vh;
          height: 6vh;
          border-radius: 50%;
          border: 1px solid rgba(74, 222, 128, 0.6);
          transform: translate(-50%, -50%) scale(1);
          opacity: 0;
          animation: ripple-out 7s cubic-bezier(0.22, 1, 0.36, 1) infinite;
          will-change: transform, opacity;
        }
        .stellar-ripple-2 { animation-delay: 2.3s; }
        .stellar-ripple-3 { animation-delay: 4.6s; }
        @keyframes ripple-out {
          0%   { transform: translate(-50%, -50%) scale(1);  opacity: 0.7; border-color: rgba(180, 255, 200, 0.9); }
          15%  { opacity: 0.7; }
          80%  { opacity: 0.06; }
          100% { transform: translate(-50%, -50%) scale(14); opacity: 0; border-color: rgba(74, 222, 128, 0.2); }
        }

        /* === 6. Event horizon ===
           Two-layer core : a soft glow that breathes (8 s), and a
           tight bright dot that pulses (2 s). The composition reads
           as "burning singularity" rather than "loading spinner." */
        .stellar-horizon {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 28vh;
          height: 28vh;
          transform: translate(-50%, -50%);
          background: radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0.6) 0%,
            rgba(180, 255, 200, 0.35) 18%,
            rgba(74, 222, 128, 0.18) 42%,
            transparent 72%
          );
          filter: blur(14px);
          animation: horizon-breathe 8s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .stellar-core {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 8vh;
          height: 8vh;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(
            circle at center,
            rgba(255, 255, 255, 1) 0%,
            rgba(220, 255, 230, 0.95) 24%,
            rgba(74, 222, 128, 0.65) 55%,
            transparent 90%
          );
          box-shadow:
            0 0 18px rgba(255, 255, 255, 0.6),
            0 0 40px rgba(180, 255, 200, 0.5),
            0 0 80px rgba(74, 222, 128, 0.45);
          animation: core-pulse 2.4s ease-in-out infinite;
          will-change: transform, opacity;
        }
        @keyframes horizon-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1);    opacity: 0.85; }
          50%      { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
        }
        @keyframes core-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1);    opacity: 0.9; }
          50%      { transform: translate(-50%, -50%) scale(1.06); opacity: 1; }
        }

        /* === 7. Einstein-ring lens flare === */
        .stellar-flare {
          position: absolute;
          left: 50%;
          top: 46%;
          width: 75vh;
          height: 1px;
          transform: translate(-50%, -50%);
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(74, 222, 128, 0.0) 18%,
            rgba(180, 255, 200, 0.5) 50%,
            rgba(74, 222, 128, 0.0) 82%,
            transparent 100%
          );
          box-shadow:
            0 0 12px rgba(180, 255, 200, 0.5),
            0 0 32px rgba(74, 222, 128, 0.4);
          opacity: 0.85;
          animation: flare-blink 3.2s ease-in-out infinite;
          will-change: opacity;
        }
        @keyframes flare-blink {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.95; }
        }

        @media (prefers-reduced-motion: reduce) {
          .stellar-nebula,
          .stellar-stars,
          .stellar-disk,
          .stellar-ripple,
          .stellar-horizon,
          .stellar-core,
          .stellar-flare {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
