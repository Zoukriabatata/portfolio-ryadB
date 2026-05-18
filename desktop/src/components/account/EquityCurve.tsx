import { useEffect, useRef } from "react";
import { useAccountStore } from "../../lib/account/useAccountStore";

export function EquityCurve() {
  const points = useAccountStore((s) => s.equityCurve);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas pixel size to its CSS size for crisp lines on HiDPI.
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
    const padX = 8, padY = 12;
    const w = cssW - 2 * padX;
    const h = cssH - 2 * padY;

    // Line.
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padX + ((p.ts - xMin) / xRange) * w;
      const y = padY + (1 - (p.balance - yMin) / yRange) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Subtle gradient fill under the line.
    const grad = ctx.createLinearGradient(0, padY, 0, padY + h);
    grad.addColorStop(0, "rgba(34, 197, 94, 0.25)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = grad;
    ctx.lineTo(padX + w, padY + h);
    ctx.lineTo(padX, padY + h);
    ctx.closePath();
    ctx.fill();
  }, [points]);

  return (
    <div className="equity-wrap">
      <div className="equity-title">Equity Curve · Session</div>
      {points.length < 2 ? (
        <div className="equity-empty">
          Live equity sampling starts after the first PnL tick. Hold tight…
        </div>
      ) : (
        <canvas ref={canvasRef} className="equity-canvas" />
      )}
    </div>
  );
}
