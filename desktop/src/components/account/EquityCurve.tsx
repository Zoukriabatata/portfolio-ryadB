import { useEffect, useRef } from "react";
import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtHourMin(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function EquityCurve() {
  const points = useAccountStore((s) => s.equityCurve);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const xs = points.map((p) => p.ts);
    const ys = points.map((p) => p.balance);
    const xMin = xs[0], xMax = xs[xs.length - 1];
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = Math.max(1, xMax - xMin);
    const yRange = Math.max(1, yMax - yMin);
    const padL = 8, padR = 8, padT = 12, padB = 12;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    // Faint grid (horizontal mid line).
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + h / 2);
    ctx.lineTo(padL + w, padT + h / 2);
    ctx.stroke();

    // Equity line.
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padL + ((p.ts - xMin) / xRange) * w;
      const y = padT + (1 - (p.balance - yMin) / yRange) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill under line.
    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, "rgba(34, 197, 94, 0.28)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = grad;
    ctx.lineTo(padL + w, padT + h);
    ctx.lineTo(padL, padT + h);
    ctx.closePath();
    ctx.fill();

    // Last-point marker.
    const last = points[points.length - 1];
    const lx = padL + ((last.ts - xMin) / xRange) * w;
    const ly = padT + (1 - (last.balance - yMin) / yRange) * h;
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(34, 197, 94, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.stroke();
  }, [points]);

  const hasData = points.length >= 2;
  const yMin = hasData ? Math.min(...points.map((p) => p.balance)) : null;
  const yMax = hasData ? Math.max(...points.map((p) => p.balance)) : null;
  const tStart = hasData ? points[0].ts : null;
  const tEnd = hasData ? points[points.length - 1].ts : null;

  return (
    <div className="equity-wrap">
      <div className="equity-title">
        <span>Equity Curve · Session</span>
        {hasData && (
          <span className="equity-range">
            {fmtHourMin(tStart!)} → {fmtHourMin(tEnd!)} · {points.length} pts
          </span>
        )}
      </div>
      {hasData ? (
        <div className="equity-body">
          <div className="equity-axis-y">
            <span>${yMax!.toFixed(0)}</span>
            <span>${yMin!.toFixed(0)}</span>
          </div>
          <canvas ref={canvasRef} className="equity-canvas" />
        </div>
      ) : (
        <div className="equity-empty">
          Live equity sampling starts after the first PnL tick. Hold tight…
        </div>
      )}
    </div>
  );
}
