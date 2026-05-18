import { useEffect, useRef } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";

export function GexTermStructure() {
  const snapshot = useGexStore((s) => s.snapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pts = snapshot?.termStructure ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pts.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const xs = pts.map((p) => p.daysToExpiry);
    const ys = pts.map((p) => p.atmIv);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = Math.max(1, xMax - xMin);
    const yRange = Math.max(0.001, yMax - yMin);

    const padL = 50, padR = 20, padT = 16, padB = 30;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const xOf = (d: number) => padL + ((d - xMin) / xRange) * w;
    const yOf = (iv: number) => padT + (1 - (iv - yMin) / yRange) * h;

    // Y axis ticks.
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const iv = yMin + (yRange * i) / 3;
      const y = yOf(iv);
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padL - 6, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
    }

    // Line + gradient fill.
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = xOf(p.daysToExpiry);
      const y = yOf(p.atmIv);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    grad.addColorStop(0, "rgba(34, 197, 94, 0.22)");
    grad.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = grad;
    ctx.lineTo(xOf(pts[pts.length - 1].daysToExpiry), padT + h);
    ctx.lineTo(xOf(pts[0].daysToExpiry), padT + h);
    ctx.closePath();
    ctx.fill();

    // Dots.
    ctx.fillStyle = "#22c55e";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(xOf(p.daysToExpiry), yOf(p.atmIv), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // X axis (DTE labels).
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "center";
    const tickEvery = Math.max(1, Math.floor(pts.length / 6));
    for (let i = 0; i < pts.length; i += tickEvery) {
      const x = xOf(pts[i].daysToExpiry);
      ctx.fillText(`${pts[i].daysToExpiry}D`, x, padT + h + 14);
    }
  }, [pts]);

  return (
    <div className="ts-wrap">
      <div className="ts-title">
        <span>IV Term Structure</span>
      </div>
      {pts.length < 2 ? (
        <div className="ts-empty">Need at least 2 expirations with ATM IV data.</div>
      ) : (
        <canvas ref={canvasRef} className="ts-canvas" />
      )}
    </div>
  );
}
