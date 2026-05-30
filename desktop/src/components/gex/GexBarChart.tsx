import { useEffect, useRef, useState } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";

function fmtGexShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function GexBarChart() {
  const snapshot = useGexStore((s) => s.snapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<"5pct" | "full">("5pct");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot || snapshot.strikes.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const spot = snapshot.spot;
    const visible =
      zoom === "5pct"
        ? snapshot.strikes.filter((s) => Math.abs(s.strike - spot) / spot <= 0.05)
        : snapshot.strikes;
    if (visible.length === 0) return;

    const padL = 60, padR = 20, padT = 20, padB = 40;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const maxAbs = Math.max(
      ...visible.map((s) => Math.max(Math.abs(s.callGex), Math.abs(s.putGex))),
      1,
    );
    const yScale = h / (2 * maxAbs);
    const yZero = padT + h / 2;

    const strikeMin = visible[0].strike;
    const strikeMax = visible[visible.length - 1].strike;
    const strikeRange = Math.max(0.01, strikeMax - strikeMin);
    const xOf = (strike: number) =>
      padL + ((strike - strikeMin) / strikeRange) * w;
    const barWidth = Math.max(2, (w / visible.length) * 0.75);

    // Y grid + zero.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const y = yZero - i * (h / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      ctx.fillStyle = "#9ca3af";
      ctx.font = "11px system-ui, -apple-system";
      ctx.textAlign = "right";
      ctx.fillText(fmtGexShort((i * maxAbs) / 2), padL - 6, y + 3);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(padL, yZero);
    ctx.lineTo(padL + w, yZero);
    ctx.stroke();

    // Bars — subtle vertical gradient, no glow.
    const greenGrad = ctx.createLinearGradient(0, padT, 0, yZero);
    greenGrad.addColorStop(0, "#22c55e");
    greenGrad.addColorStop(1, "#166534");

    const redGrad = ctx.createLinearGradient(0, yZero, 0, padT + h);
    redGrad.addColorStop(0, "#b13059");
    redGrad.addColorStop(1, "#ff3d71");

    for (const s of visible) {
      const xCenter = xOf(s.strike);
      if (s.callGex > 0) {
        const barH = s.callGex * yScale;
        ctx.fillStyle = greenGrad;
        ctx.fillRect(
          xCenter - barWidth / 2,
          yZero - barH,
          barWidth,
          barH,
        );
      }
      if (s.putGex < 0) {
        const barH = -s.putGex * yScale;
        ctx.fillStyle = redGrad;
        ctx.fillRect(
          xCenter - barWidth / 2,
          yZero,
          barWidth,
          barH,
        );
      }
    }

    // X axis ticks.
    const tickEvery = Math.max(1, Math.floor(visible.length / 8));
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "center";
    for (let i = 0; i < visible.length; i += tickEvery) {
      const x = xOf(visible[i].strike);
      ctx.fillText(visible[i].strike.toFixed(0), x, cssH - padB / 2 + 6);
    }

    // Vertical lines.
    const drawVLine = (strike: number | null, color: string, label: string) => {
      if (strike === null || strike < strikeMin || strike > strikeMax) return;
      const x = xOf(strike);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.font = "10px system-ui, -apple-system";
      ctx.fillText(label, x, padT - 6);
    };
    drawVLine(snapshot.spot, "#ffffff", `SPOT ${snapshot.spot.toFixed(2)}`);
    drawVLine(snapshot.zeroGamma, "#f5a623", "ZERO γ");
    drawVLine(snapshot.callWall, "#22c55e", "CALL W");
    drawVLine(snapshot.putWall, "#ff3d71", "PUT W");
  }, [snapshot, zoom]);

  if (!snapshot) {
    return (
      <div className="gex-chart-wrap">
        <div className="gex-chart-title">
          <span>Net GEX by Strike</span>
        </div>
        <div className="gex-chart-empty">Loading snapshot…</div>
      </div>
    );
  }

  return (
    <div className="gex-chart-wrap">
      <div className="gex-chart-title">
        <span>Net GEX by Strike</span>
        <div className="gex-chart-zoom">
          <button
            type="button"
            className={`gex-chart-zoom-btn ${zoom === "5pct" ? "gex-chart-zoom-btn-active" : ""}`}
            onClick={() => setZoom("5pct")}
          >
            ±5%
          </button>
          <button
            type="button"
            className={`gex-chart-zoom-btn ${zoom === "full" ? "gex-chart-zoom-btn-active" : ""}`}
            onClick={() => setZoom("full")}
          >
            Full
          </button>
        </div>
      </div>
      {snapshot.strikes.length === 0 ? (
        <div className="gex-chart-empty">No strike data available.</div>
      ) : (
        <canvas ref={canvasRef} className="gex-chart-canvas" />
      )}
    </div>
  );
}
