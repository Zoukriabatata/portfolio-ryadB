"use client";

/**
 * Inline SVG sparkline with a draw-on animation + a phosphor halo on
 * the final point. We render our own path instead of pulling
 * recharts / visx because (1) we only need one curve, (2) the
 * draw-on stroke-dashoffset trick is two CSS keyframes worth of
 * code, and (3) a 200kB chart lib for a 100px line would be the
 * opposite of "Editorial Terminal."
 */

import { useId, useMemo } from "react";

import { cn } from "@/lib/utils";

export interface WatchlistSparklineProps {
  /** 1H closes (any length, but expects ≥ 2). Order = oldest → newest. */
  data: number[];
  /** Direction of the 24h move — drives stroke colour. */
  direction: "up" | "down";
  /** Render dimensions. Stroke width auto-scales with height. */
  width: number;
  height: number;
  /** When true, paint a phosphor-glow dot on the final point. */
  showLastDot?: boolean;
  className?: string;
}

export function WatchlistSparkline({
  data,
  direction,
  width,
  height,
  showLastDot = false,
  className,
}: WatchlistSparklineProps) {
  // SVG def IDs must be unique per instance — useId() gives us a
  // stable React-tree-derived ID that survives re-renders without
  // colliding with other sparklines on the same page.
  const gradientId = useId();
  const clipId = useId();

  const { pathD, areaD, lastPoint, valid } = useMemo(() => {
    if (!Array.isArray(data) || data.length < 2) {
      return { pathD: "", areaD: "", lastPoint: null, valid: false };
    }
    const clean = data.filter((n) => Number.isFinite(n));
    if (clean.length < 2) {
      return { pathD: "", areaD: "", lastPoint: null, valid: false };
    }
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = Math.max(max - min, 1e-9);
    // Inset 2px each side so the stroke doesn't clip on the edges
    // when the line touches min/max.
    const pad = 2;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const stepX = w / (clean.length - 1);

    const points = clean.map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + h - ((v - min) / range) * h;
      return [x, y] as const;
    });

    const path = points
      .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
      .join(" ");

    // Closed area under the curve for the soft fill. Goes path →
    // bottom-right → bottom-left → close.
    const last = points[points.length - 1];
    const first = points[0];
    const area = `${path} L${last[0]},${height} L${first[0]},${height} Z`;

    return {
      pathD: path,
      areaD: area,
      lastPoint: last,
      valid: true,
    };
  }, [data, width, height]);

  if (!valid || !lastPoint) {
    // Skeleton track when prices haven't arrived. Width matches the
    // expected sparkline footprint so the layout doesn't reflow on
    // first paint.
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("block", className)}
        aria-hidden
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="var(--text-dimmed, rgba(255,255,255,0.08))"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const stroke =
    direction === "up" ? "var(--primary)" : "var(--bear)";
  const fillStop =
    direction === "up"
      ? "rgba(74, 222, 128, 0.18)"
      : "rgba(240, 79, 79, 0.18)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("block overflow-visible", className)}
      aria-hidden
    >
      <defs>
        <linearGradient
          id={`grad-${gradientId}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={fillStop} />
          <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
        </linearGradient>
        <clipPath id={`clip-${clipId}`}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>

      {/* Soft fill under the curve. */}
      <path d={areaD} fill={`url(#grad-${gradientId})`} />

      {/* The curve itself — animated draw-on via stroke-dashoffset.
          Using a CSS animation rather than Framer Motion because
          the SVG-level path animation is more reliable across
          browsers and avoids React reconciliation cost. */}
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={Math.max(1.25, Math.min(2, height / 28))}
        strokeLinecap="round"
        strokeLinejoin="round"
        // pathLength normalises the stroke length to 1 so the
        // dasharray / dashoffset draw-on animation works without
        // measuring the path at runtime.
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={0}
        style={{
          animation: "sparkline-draw 900ms ease-out both",
        }}
      />

      {showLastDot && (
        <>
          {/* Phosphor halo — second filled circle below the dot,
              uses radial blur via filter. */}
          <circle
            cx={lastPoint[0]}
            cy={lastPoint[1]}
            r={4}
            fill={stroke}
            opacity={0.35}
            style={{
              filter: `drop-shadow(0 0 6px ${stroke})`,
            }}
          />
          <circle
            cx={lastPoint[0]}
            cy={lastPoint[1]}
            r={2}
            fill={stroke}
          />
        </>
      )}

      <style>{`
        @keyframes sparkline-draw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );
}
