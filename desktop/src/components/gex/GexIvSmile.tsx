import { useEffect, useRef } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";

export function GexIvSmile() {
  const snapshot = useGexStore((s) => s.snapshot);
  const selected = useGexStore((s) => s.selectedExpiration);
  const setSelected = useGexStore((s) => s.setSelectedExpiration);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const smile =
    snapshot?.ivSmiles.find((s) => s.expiration === selected) ??
    snapshot?.ivSmiles[0] ??
    null;

  let atmIv: number | null = null;
  if (smile && snapshot && smile.points.length > 0) {
    let best = smile.points[0];
    let bestDist = Math.abs(best.strike - snapshot.spot);
    for (const p of smile.points) {
      const d = Math.abs(p.strike - snapshot.spot);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    atmIv = best.iv;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !smile || !snapshot || smile.points.length < 2) return;
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
    const pts = smile.points.filter(
      (p) => Math.abs(p.strike - spot) / spot <= 0.05,
    );
    if (pts.length < 2) return;

    const padL = 50, padR = 20, padT = 16, padB = 36;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    const xs = pts.map((p) => p.strike);
    const ivs = pts.map((p) => p.iv);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ivs), yMax = Math.max(...ivs);
    const xRange = Math.max(0.01, xMax - xMin);
    const yRange = Math.max(0.001, yMax - yMin);

    const xOf = (s: number) => padL + ((s - xMin) / xRange) * w;
    const yOf = (iv: number) => padT + (1 - (iv - yMin) / yRange) * h;

    // Y axis (IV %).
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const iv = yMin + (yRange * i) / 4;
      const y = yOf(iv);
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padL - 6, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
    }

    // Spot vertical.
    if (spot >= xMin && spot <= xMax) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(xOf(spot), padT);
      ctx.lineTo(xOf(spot), padT + h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const sorted = [...pts].sort((a, b) => a.strike - b.strike);
    const drawSegment = (color: string, filterFn: (s: number) => boolean) => {
      const seg = sorted.filter((p) => filterFn(p.strike));
      if (seg.length < 1) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      seg.forEach((p, i) => {
        const x = xOf(p.strike), y = yOf(p.iv);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      for (const p of seg) {
        ctx.beginPath();
        ctx.arc(xOf(p.strike), yOf(p.iv), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawSegment("#ff3d71", (s) => s < spot);
    drawSegment("#22c55e", (s) => s >= spot);

    // X ticks.
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px system-ui, -apple-system";
    ctx.textAlign = "center";
    const tickEvery = Math.max(1, Math.floor(sorted.length / 6));
    for (let i = 0; i < sorted.length; i += tickEvery) {
      const x = xOf(sorted[i].strike);
      ctx.fillText(sorted[i].strike.toFixed(0), x, padT + h + 16);
    }
  }, [smile, snapshot]);

  if (!snapshot || !smile) {
    return (
      <div className="gex-smile-wrap">
        <div className="gex-smile-title">
          <span>IV Smile</span>
        </div>
        <div className="gex-smile-empty">No IV data yet.</div>
      </div>
    );
  }

  return (
    <div className="gex-smile-wrap">
      <div className="gex-smile-title">
        <span>
          IV Smile
          {atmIv !== null && (
            <span className="gex-smile-atm">
              · ATM IV
              <span className="gex-smile-atm-value">
                {(atmIv * 100).toFixed(2)}%
              </span>
            </span>
          )}
        </span>
        <select
          className="gex-smile-picker"
          value={smile.expiration}
          onChange={(e) => setSelected(e.target.value)}
        >
          {snapshot.ivSmiles.map((s) => (
            <option key={s.expiration} value={s.expiration}>
              {s.expiration} · {s.daysToExpiry}D
            </option>
          ))}
        </select>
      </div>
      {smile.points.length < 2 ? (
        <div className="gex-smile-empty">
          Not enough strikes with IV data for this expiration.
        </div>
      ) : (
        <canvas ref={canvasRef} className="gex-smile-canvas" />
      )}
    </div>
  );
}
