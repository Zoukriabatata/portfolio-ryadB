import type { IndicatorLineStyle, IndicatorSource } from '@/types/charts';

export function computeSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(0); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

export function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values[0];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { ema = values[0]; } else { ema = values[i] * k + ema * (1 - k); }
    result.push(i < period - 1 ? 0 : ema);
  }
  return result;
}

/**
 * Extract source prices from candles based on source type
 */
export function getSourceValues(
  candles: { open: number; high: number; low: number; close: number }[],
  source: IndicatorSource = 'close'
): number[] {
  switch (source) {
    case 'open': return candles.map(c => c.open);
    case 'high': return candles.map(c => c.high);
    case 'low': return candles.map(c => c.low);
    case 'hl2': return candles.map(c => (c.high + c.low) / 2);
    case 'hlc3': return candles.map(c => (c.high + c.low + c.close) / 3);
    case 'ohlc4': return candles.map(c => (c.open + c.high + c.low + c.close) / 4);
    case 'close':
    default: return candles.map(c => c.close);
  }
}

/**
 * Convert lineStyle string to canvas dash pattern
 */
export function lineStyleToDash(style?: IndicatorLineStyle): number[] {
  if (style === 'dashed') return [6, 4];
  if (style === 'dotted') return [2, 3];
  return [];
}

export function drawIndicatorLine(
  ctx: CanvasRenderingContext2D,
  values: number[],
  candles: { time: number }[],
  startIndex: number,
  endIndex: number,
  chartWidth: number,
  chartHeight: number,
  priceMin: number,
  priceMax: number,
  color: string,
  lineWidth: number,
  dash?: number[],
  opacity?: number,
) {
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = opacity ?? 0.85;
  if (dash && dash.length > 0) ctx.setLineDash(dash);
  ctx.beginPath();

  let started = false;
  for (let i = startIndex; i < Math.min(endIndex, values.length); i++) {
    if (values[i] === 0) continue;
    const x = ((i - startIndex) / (endIndex - startIndex)) * chartWidth;
    const y = ((priceMax - values[i]) / priceRange) * chartHeight;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
