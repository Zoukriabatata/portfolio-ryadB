// Senzoukria logo — desktop v2 (UI-8).
//
// Refresh of the original web port with:
//  • S letter recentred on x=24 of the 0-48 viewBox (was off to the
//    left with asymmetric control points). The new path uses mirrored
//    cubic Béziers so the top arc and bottom arc are symmetric.
//  • Continuous animations: dashed orbit slowly rotates, S glow
//    breathes, energy sparks fade in/out with stagger.
//  • Hover boost: subtle scale + brighter glow.
// All animations are pure CSS keyframes — no JS / RAF cost on idle.
//
// Stylable via CSS variables: --logo-bright #7ed321, --logo-mid
// #5fa31a, --logo-dark #16a34a.

interface Props {
  size?: number;
  /** Show the "SENZOUKRIA" wordmark next to the icon. */
  showText?: boolean;
  /** Disable continuous animations (e.g. for the favicon-style usage). */
  static?: boolean;
  className?: string;
}

export function SenzoukriaLogo({
  size = 32,
  showText = true,
  static: isStatic = false,
  className,
}: Props) {
  return (
    <div className={`senz-logo ${className ?? ""}`}>
      <style>{`
        @keyframes senzOrbit {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
        @keyframes senzPulse {
          0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 1px rgba(126, 211, 33, 0.5)); }
          50%      { opacity: 1;    filter: drop-shadow(0 0 6px rgba(126, 211, 33, 0.85)); }
        }
        @keyframes senzSpark {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        @keyframes senzHexBreath {
          0%, 100% { fill-opacity: 0.14; }
          50%      { fill-opacity: 0.22; }
        }
        .senz-orbit { transform-box: fill-box; transform-origin: center; }
        .senz-spark { transform-box: fill-box; transform-origin: center; }
      `}</style>

      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="senzGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--logo-bright, #7ed321)" />
            <stop offset="50%" stopColor="var(--logo-mid, #5fa31a)" />
            <stop offset="100%" stopColor="var(--logo-dark, #16a34a)" />
          </linearGradient>
          <linearGradient id="senzGradS" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="50%" stopColor="#7ed321" />
            <stop offset="100%" stopColor="#5fa31a" />
          </linearGradient>
          <filter id="senzGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="senzSoftGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* Outer hexagon — scientific frame */}
        <path
          d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
          fill="url(#senzGrad)"
          stroke="url(#senzGrad)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          style={
            isStatic
              ? { fillOpacity: 0.18 }
              : { animation: "senzHexBreath 6s ease-in-out infinite", fillOpacity: 0.18 }
          }
        />

        {/* Dashed energy orbit — slowly rotating */}
        <g className="senz-orbit" style={isStatic ? undefined : { animation: "senzOrbit 18s linear infinite" }}>
          <circle
            cx="24"
            cy="24"
            r="12"
            fill="none"
            stroke="url(#senzGrad)"
            strokeWidth="1.4"
            strokeDasharray="2.5 3"
            opacity="0.65"
          />
        </g>

        {/* Centred S letter — symmetric cubic Béziers, mirrored top/bottom
            around the viewBox centre (24, 24). All anchor points are
            equidistant from x=24 so the glyph reads as perfectly centred.
            Top arc:    (30,13) → (18,13) → (14,18) → (24,24)
            Bottom arc: (24,24) → (34,30) → (30,35) → (18,35) */}
        <path
          d="M 30 13
             C 30 13, 18 12, 15 16
             C 13 19, 14 22, 24 24
             C 34 26, 35 29, 33 32
             C 30 36, 18 35, 18 35"
          fill="none"
          stroke="url(#senzGradS)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#senzGlow)"
          style={isStatic ? undefined : { animation: "senzPulse 3.6s ease-in-out infinite" }}
        />

        {/* Energy sparks — staggered fade/scale */}
        <circle
          cx="8"
          cy="24"
          r="1.6"
          fill="var(--logo-bright, #7ed321)"
          className="senz-spark"
          style={isStatic ? undefined : { animation: "senzSpark 2.8s ease-in-out infinite" }}
        />
        <circle
          cx="40"
          cy="24"
          r="1.6"
          fill="var(--logo-bright, #7ed321)"
          className="senz-spark"
          style={
            isStatic
              ? undefined
              : { animation: "senzSpark 2.8s ease-in-out infinite", animationDelay: "0.95s" }
          }
        />
        <circle
          cx="24"
          cy="8"
          r="1.6"
          fill="var(--logo-bright, #7ed321)"
          className="senz-spark"
          style={
            isStatic
              ? undefined
              : { animation: "senzSpark 2.8s ease-in-out infinite", animationDelay: "1.85s" }
          }
        />
        <circle
          cx="24"
          cy="40"
          r="1.2"
          fill="var(--logo-mid, #5fa31a)"
          opacity="0.55"
          className="senz-spark"
          style={
            isStatic
              ? undefined
              : { animation: "senzSpark 2.8s ease-in-out infinite", animationDelay: "1.4s" }
          }
        />
      </svg>

      {showText && (
        <span className="senz-wordmark">
          SENZOU<span className="senz-wordmark-tail">KRIA</span>
        </span>
      )}
    </div>
  );
}
