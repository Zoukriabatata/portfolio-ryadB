'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface IVSmileProps {
  symbol: string;
  spotPrice: number;
  expiration?: number;
  height?: number;
  animated?: boolean;
}

interface SmilePoint {
  strike: number;
  callIV: number;
  putIV: number;
  moneyness: number;
}

// Generate simulated IV smile data
function generateSmileData(spotPrice: number, daysToExp: number = 30): SmilePoint[] {
  const points: SmilePoint[] = [];
  const strikes = [];

  // Generate strikes from 80% to 120% of spot
  for (let i = -15; i <= 15; i++) {
    strikes.push(spotPrice * (1 + i * 0.015));
  }

  // Base ATM IV varies with time to expiration
  const baseATMIV = 0.18 + Math.sqrt(daysToExp / 365) * 0.08;

  for (const strike of strikes) {
    const moneyness = Math.log(strike / spotPrice);

    // IV smile parameters
    const skew = -0.15; // Put skew (negative = higher IV for puts)
    const curvature = 0.35; // Smile curvature

    // Call IV: slightly lower for ITM calls
    const callIV = baseATMIV + skew * moneyness + curvature * moneyness * moneyness;

    // Put IV: slightly higher for ITM puts (skew effect)
    const putIV = baseATMIV - skew * moneyness + curvature * moneyness * moneyness;

    points.push({
      strike,
      callIV: Math.max(0.05, callIV + (Math.random() - 0.5) * 0.02),
      putIV: Math.max(0.05, putIV + (Math.random() - 0.5) * 0.02),
      moneyness: moneyness * 100,
    });
  }

  return points;
}

export default function IVSmileSimulated({
  symbol,
  spotPrice,
  expiration = 30,
  height = 400,
  animated = true,
}: IVSmileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [hoveredPoint, setHoveredPoint] = useState<SmilePoint | null>(null);
  const [data, setData] = useState<SmilePoint[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Generate initial data
  useEffect(() => {
    setData(generateSmileData(spotPrice || 450, expiration));
  }, [spotPrice, expiration]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  // Draw chart
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: h } = dimensions;
    const padding = { top: 40, right: 80, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = h - padding.top - padding.bottom;

    // Clear
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, width, h);

    // Find data ranges
    const strikes = data.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const allIVs = data.flatMap(d => [d.callIV, d.putIV]);
    const minIV = Math.min(...allIVs) * 0.9;
    const maxIV = Math.max(...allIVs) * 1.1;

    // Scale functions
    const scaleX = (strike: number) =>
      padding.left + ((strike - minStrike) / (maxStrike - minStrike)) * chartWidth;
    const scaleY = (iv: number) =>
      padding.top + ((maxIV - iv) / (maxIV - minIV)) * chartHeight;

    // Grid
    ctx.strokeStyle = '#1a2a1a';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const iv = minIV + (maxIV - minIV) * (i / 5);
      const y = scaleY(iv);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#4a5a4a';
      ctx.font = '10px "Consolas", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${(iv * 100).toFixed(1)}%`, padding.left - 5, y + 4);
    }

    // Vertical grid lines
    const strikeStep = (maxStrike - minStrike) / 6;
    for (let i = 0; i <= 6; i++) {
      const strike = minStrike + strikeStep * i;
      const x = scaleX(strike);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, h - padding.bottom);
      ctx.stroke();

      ctx.fillStyle = '#4a5a4a';
      ctx.textAlign = 'center';
      ctx.fillText(`$${strike.toFixed(0)}`, x, h - padding.bottom + 15);
    }

    // Spot price vertical line
    const spotX = scaleX(spotPrice);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(spotX, padding.top);
    ctx.lineTo(spotX, h - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Put IV curve with animation
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    data.forEach((point, i) => {
      const x = scaleX(point.strike);
      let y = scaleY(point.putIV);

      // Add subtle animation wave
      if (animated) {
        y += Math.sin(timeRef.current * 0.02 + i * 0.3) * 2;
      }

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Call IV curve with animation
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    data.forEach((point, i) => {
      const x = scaleX(point.strike);
      let y = scaleY(point.callIV);

      if (animated) {
        y += Math.sin(timeRef.current * 0.02 + i * 0.3 + Math.PI) * 2;
      }

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw data points
    data.forEach(point => {
      const x = scaleX(point.strike);
      const callY = scaleY(point.callIV);
      const putY = scaleY(point.putIV);

      // Call point
      ctx.beginPath();
      ctx.arc(x, callY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();

      // Put point
      ctx.beginPath();
      ctx.arc(x, putY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    });

    // Highlight hovered point
    if (hoveredPoint) {
      const x = scaleX(hoveredPoint.strike);
      const callY = scaleY(hoveredPoint.callIV);
      const putY = scaleY(hoveredPoint.putIV);

      ctx.beginPath();
      ctx.arc(x, callY, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, putY, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.stroke();
    }

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${symbol} IV Smile - ${expiration} DTE`, padding.left, 25);

    // Legend
    const legendX = width - padding.right + 10;
    ctx.font = '11px "Consolas", monospace';

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(legendX + 6, padding.top + 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('Call IV', legendX + 15, padding.top + 14);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(legendX + 6, padding.top + 30, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('Put IV', legendX + 15, padding.top + 34);

    ctx.fillStyle = '#3b82f6';
    ctx.fillText('Spot', legendX + 5, padding.top + 54);

    // Axis labels
    ctx.fillStyle = '#6a7a6a';
    ctx.font = '11px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Strike Price', width / 2, h - 10);

    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Implied Volatility', 0, 0);
    ctx.restore();

    timeRef.current++;
  }, [data, dimensions, spotPrice, hoveredPoint, animated, expiration, symbol]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      draw();
      if (animated) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw, animated]);

  // Mouse handler for hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const padding = { left: 60, right: 80 };
    const chartWidth = dimensions.width - padding.left - padding.right;

    const strikes = data.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);

    const strike = minStrike + ((x - padding.left) / chartWidth) * (maxStrike - minStrike);

    // Find closest point
    let closest: SmilePoint | null = null;
    let minDist = Infinity;
    for (const point of data) {
      const dist = Math.abs(point.strike - strike);
      if (dist < minDist) {
        minDist = dist;
        closest = point;
      }
    }

    setHoveredPoint(closest);
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      />

      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute bg-[#0a0f0a]/95 border border-green-900/40 rounded-lg p-3 text-xs pointer-events-none"
          style={{
            left: '50%',
            top: 60,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-bold text-green-100 mb-2">Strike: ${hoveredPoint.strike.toFixed(2)}</div>
          <div className="flex justify-between gap-4">
            <span className="text-green-400/70">Call IV:</span>
            <span className="text-green-400 font-mono">{(hoveredPoint.callIV * 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-red-400/70">Put IV:</span>
            <span className="text-red-400 font-mono">{(hoveredPoint.putIV * 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-green-900/30">
            <span className="text-green-500/60">Moneyness:</span>
            <span className="text-green-300/80 font-mono">{hoveredPoint.moneyness.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
