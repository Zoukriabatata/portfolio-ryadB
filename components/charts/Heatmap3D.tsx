'use client';

/**
 * HEATMAP 3D v2 — React component
 *
 * 3D terrain visualization of orderbook depth with:
 * - Canvas2D overlay (HUD, axis labels, color legend, crosshair)
 * - Camera inertia & smooth transitions
 * - Keyboard shortcuts & camera presets
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { SimulationEngine } from '@/lib/heatmap-v2/SimulationEngine';
import { LiveDataEngine, resetLiveDataEngine } from '@/lib/heatmap-v2/LiveDataEngine';
import type { MarketState, Trade, PricePoint, SimulationConfig } from '@/lib/heatmap-v2/types';
import { Heatmap3DRenderer } from '@/lib/heatmap-webgl/Heatmap3DRenderer';
import { adaptMarketStateToSurface, type SurfaceGridData } from '@/lib/heatmap-webgl/adapters/SurfaceDataAdapter';
// Settings are local to 3D view (independent from 2D heatmap store)

// Camera preset definitions (matches CameraController.CAMERA_PRESETS)
const CAMERA_PRESETS = [
  { name: 'isometric', label: 'Iso',   shortcut: '1' },
  { name: 'top',       label: 'Top',   shortcut: '2' },
  { name: 'front',     label: 'Front', shortcut: '3' },
  { name: 'side',      label: 'Side',  shortcut: '4' },
  { name: 'overview',  label: '3/4',   shortcut: '5' },
] as const;

export type DataMode = 'simulation' | 'live';

interface Heatmap3DProps {
  height?: number;
  config?: Partial<SimulationConfig>;
  symbol?: string;
  initialMode?: DataMode;
}

// ── 3D→2D projection helper ──────────────────────────────────────────────

function project(
  vp: Float32Array,
  wx: number, wy: number, wz: number,
  canvasW: number, canvasH: number,
): { x: number; y: number } | null {
  const x = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
  const y = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
  const w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
  if (w <= 0.001) return null;
  return {
    x: (x / w * 0.5 + 0.5) * canvasW,
    y: (1 - (y / w * 0.5 + 0.5)) * canvasH,
  };
}

// ── Overlay drawing functions ────────────────────────────────────────────

interface OverlayData {
  midPrice: number;
  currentBid: number;
  currentAsk: number;
  grid: SurfaceGridData | null;
  trades: Trade[];
  priceHistory: PricePoint[];
  crosshairScreen: { x: number; y: number } | null;
  crosshairWorld: { worldX: number; worldY: number } | null;
}

interface OverlayOptions {
  showTrades: boolean;
  showProfile: boolean;
  showPriceLine: boolean;
  showSpreadBand: boolean;
  showLiquidityWalls: boolean;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  data: OverlayData,
  tickSize: number,
  options: OverlayOptions,
) {
  ctx.clearRect(0, 0, w, h);

  if (data.grid) {
    drawAxisLabels(ctx, w, h, vp, data.grid, tickSize);
    if (options.showProfile) drawVolumeProfile(ctx, w, h, vp, data.grid);
    if (options.showLiquidityWalls) drawLiquidityWalls(ctx, w, h, vp, data.grid);
    // Staircase + spread band drawn BELOW bubbles
    if (options.showSpreadBand) drawSpreadBand(ctx, w, h, vp, data);
    if (options.showPriceLine) drawPriceLine(ctx, w, h, vp, data, tickSize);
    // Bubbles on TOP of staircase
    if (options.showTrades) drawTradeBubbles(ctx, w, h, vp, data);
  }
  drawHUD(ctx, data);
  drawColorLegend(ctx, h);
  if (data.crosshairScreen && data.crosshairWorld && data.grid) {
    drawCrosshair(ctx, w, h, data, tickSize);
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, data: OverlayData) {
  const spread = data.currentAsk - data.currentBid;
  const precision = data.midPrice >= 100 ? 2 : data.midPrice >= 1 ? 4 : 6;

  // Count recent trades
  const now = Date.now();
  const recentTrades = data.trades.filter(t => now - t.timestamp < 10000);
  const buyCount = recentTrades.filter(t => t.side === 'buy').length;
  const sellCount = recentTrades.filter(t => t.side === 'sell').length;
  const hasTrades = recentTrades.length > 0;

  const panelW = 180;
  const panelH = hasTrades ? 80 : 64;
  const px = 10;
  const py = 10;

  // Panel background — dark navy, minimal
  ctx.fillStyle = 'rgba(5, 5, 16, 0.65)';
  roundedRect(ctx, px, py, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 0.5;
  roundedRect(ctx, px, py, panelW, panelH, 6);
  ctx.stroke();

  const lx = px + 12; // left text x
  const rx = px + panelW - 12; // right text x

  // Mid price — white, clean
  ctx.font = 'bold 14px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(244, 244, 245, 0.95)';
  ctx.fillText(data.midPrice.toFixed(precision), lx, py + 22);

  // Spread — small, right-aligned
  ctx.font = '9px Consolas, Monaco, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(90, 101, 119, 0.6)';
  ctx.fillText(`spread ${spread.toFixed(precision)}`, rx, py + 22);

  // Separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  ctx.moveTo(lx, py + 29);
  ctx.lineTo(rx, py + 29);
  ctx.stroke();

  // Bid / Ask row — cyan / pink
  ctx.font = '10px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.fillText(data.currentBid.toFixed(precision), lx, py + 43);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(244, 114, 182, 0.85)';
  ctx.fillText(data.currentAsk.toFixed(precision), rx, py + 43);

  // Bid/Ask labels (tiny)
  ctx.font = '8px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(34, 211, 238, 0.4)';
  ctx.fillText('BID', lx, py + 54);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(244, 114, 182, 0.4)';
  ctx.fillText('ASK', rx, py + 54);

  // Trade activity bar (last 10s)
  if (hasTrades) {
    const totalTrades = buyCount + sellCount;
    const buyRatio = totalTrades > 0 ? buyCount / totalTrades : 0.5;
    const barX = lx;
    const barY = py + 60;
    const barW = panelW - 24;
    const barH = 3;
    const buyW = Math.max(1, buyRatio * barW);

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    roundedRect(ctx, barX, barY, barW, barH, 1.5);
    ctx.fill();

    // Buy bar (cyan)
    ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
    roundedRect(ctx, barX, barY, buyW, barH, 1.5);
    ctx.fill();

    // Sell bar (magenta)
    if (barW - buyW > 1) {
      ctx.fillStyle = 'rgba(244, 114, 182, 0.5)';
      ctx.fillRect(barX + buyW, barY, barW - buyW, barH);
    }

    // Trade count labels
    ctx.font = '8px Consolas, Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
    ctx.fillText(`${buyCount}`, barX, barY + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244, 114, 182, 0.55)';
    ctx.fillText(`${sellCount}`, barX + barW, barY + 12);
  }
}

// ── Staircase Price Line (projected onto 3D surface) ────────────────────

function drawPriceLine(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  data: OverlayData,
  tickSize: number,
) {
  const grid = data.grid!;
  const priceRange = grid.priceMax - grid.priceMin;
  if (priceRange <= 0) return;

  const precision = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 4;
  const history = data.priceHistory;
  const timeIdxMin = grid.timeIndexMin;
  const timeIdxMax = grid.timeIndexMax;
  const timeSpan = timeIdxMax - timeIdxMin;
  if (timeSpan <= 0) return;

  // Build staircase screen points from priceHistory
  // Each PricePoint maps to a historyIndex (its array position)
  // We draw horizontal steps at each price, with vertical transitions between
  const stairPoints: { x: number; y: number }[] = [];

  // Sample priceHistory entries that fall within the grid's time range
  const startIdx = Math.max(0, timeIdxMin);
  const endIdx = Math.min(history.length - 1, timeIdxMax);

  if (endIdx < startIdx || history.length === 0) {
    // Fallback: flat line at current mid price
    drawFlatPriceLine(ctx, w, h, vp, data.midPrice, grid, precision);
    return;
  }

  // Project staircase: for each step, horizontal line then vertical step
  let prevScreenPt: { x: number; y: number } | null = null;

  for (let i = startIdx; i <= endIdx; i++) {
    const pt = history[i];
    if (!pt) continue;
    const mid = (pt.bid + pt.ask) / 2;
    const normX = (i - timeIdxMin) / timeSpan;
    const normY = (mid - grid.priceMin) / priceRange;
    if (normY < -0.1 || normY > 1.1) continue;

    // Project at z slightly above floor
    const screenPt = project(vp, normX, normY, 0.005, w, h);
    if (!screenPt) continue;
    if (screenPt.x < -100 || screenPt.x > w + 100 || screenPt.y < -100 || screenPt.y > h + 100) continue;

    if (prevScreenPt) {
      // Horizontal step at previous Y (staircase: move X first, keep Y)
      stairPoints.push({ x: screenPt.x, y: prevScreenPt.y });
    }
    // Then the actual point (vertical step to new Y)
    stairPoints.push(screenPt);
    prevScreenPt = screenPt;
  }

  if (stairPoints.length < 2) {
    drawFlatPriceLine(ctx, w, h, vp, data.midPrice, grid, precision);
    return;
  }

  // Subtle glow pass
  ctx.strokeStyle = 'rgba(244, 244, 245, 0.08)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stairPoints[0].x, stairPoints[0].y);
  for (let i = 1; i < stairPoints.length; i++) {
    ctx.lineTo(stairPoints[i].x, stairPoints[i].y);
  }
  ctx.stroke();

  // Main staircase line — white, thin
  ctx.strokeStyle = 'rgba(244, 244, 245, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stairPoints[0].x, stairPoints[0].y);
  for (let i = 1; i < stairPoints.length; i++) {
    ctx.lineTo(stairPoints[i].x, stairPoints[i].y);
  }
  ctx.stroke();

  // Current price label at the right end
  const lastPt = stairPoints[stairPoints.length - 1];
  const labelText = data.midPrice.toFixed(precision);
  ctx.font = 'bold 10px Consolas, Monaco, monospace';
  const measured = ctx.measureText(labelText);
  const labelW = measured.width + 12;
  const labelH = 16;
  const labelX = lastPt.x + 8;
  const labelY = lastPt.y - labelH / 2;

  // Arrow
  ctx.fillStyle = 'rgba(244, 244, 245, 0.85)';
  ctx.beginPath();
  ctx.moveTo(lastPt.x + 2, lastPt.y);
  ctx.lineTo(lastPt.x + 8, lastPt.y - 4);
  ctx.lineTo(lastPt.x + 8, lastPt.y + 4);
  ctx.closePath();
  ctx.fill();

  // Label background — white pill
  ctx.fillStyle = 'rgba(244, 244, 245, 0.9)';
  roundedRect(ctx, labelX, labelY, labelW, labelH, 3);
  ctx.fill();

  // Label text
  ctx.textAlign = 'left';
  ctx.fillStyle = '#050510';
  ctx.fillText(labelText, labelX + 6, labelY + 12);
}

/** Fallback when priceHistory is empty/out of range: flat dashed line at current price */
function drawFlatPriceLine(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  midPrice: number,
  grid: SurfaceGridData,
  precision: number,
) {
  const priceRange = grid.priceMax - grid.priceMin;
  const midY = (midPrice - grid.priceMin) / priceRange;
  if (midY < 0 || midY > 1) return;

  const segments = 16;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = project(vp, t, midY, 0.005, w, h);
    if (p && p.x >= -50 && p.x <= w + 50 && p.y >= -50 && p.y <= h + 50) {
      points.push(p);
    }
  }
  if (points.length < 2) return;

  ctx.strokeStyle = 'rgba(244, 244, 245, 0.4)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  const lastPt = points[points.length - 1];
  ctx.font = 'bold 10px Consolas, Monaco, monospace';
  const labelText = midPrice.toFixed(precision);
  const measured = ctx.measureText(labelText);
  const labelW = measured.width + 12;
  const labelH = 16;
  const labelX = lastPt.x + 8;
  const labelY = lastPt.y - labelH / 2;

  ctx.fillStyle = 'rgba(244, 244, 245, 0.85)';
  ctx.beginPath();
  ctx.moveTo(lastPt.x + 2, lastPt.y);
  ctx.lineTo(lastPt.x + 8, lastPt.y - 4);
  ctx.lineTo(lastPt.x + 8, lastPt.y + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(244, 244, 245, 0.9)';
  roundedRect(ctx, labelX, labelY, labelW, labelH, 3);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#050510';
  ctx.fillText(labelText, labelX + 6, labelY + 12);
}

// ── Bid/Ask Spread Band (shaded area between bid and ask on staircase) ──

function drawSpreadBand(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  data: OverlayData,
) {
  const grid = data.grid!;
  const priceRange = grid.priceMax - grid.priceMin;
  if (priceRange <= 0) return;

  const history = data.priceHistory;
  const timeIdxMin = grid.timeIndexMin;
  const timeIdxMax = grid.timeIndexMax;
  const timeSpan = timeIdxMax - timeIdxMin;
  if (timeSpan <= 0 || history.length === 0) return;

  const startIdx = Math.max(0, timeIdxMin);
  const endIdx = Math.min(history.length - 1, timeIdxMax);
  if (endIdx < startIdx) return;

  // Collect bid and ask projected points
  const bidPoints: { x: number; y: number }[] = [];
  const askPoints: { x: number; y: number }[] = [];

  let prevBid: { x: number; y: number } | null = null;
  let prevAsk: { x: number; y: number } | null = null;

  for (let i = startIdx; i <= endIdx; i++) {
    const pt = history[i];
    if (!pt) continue;
    const normX = (i - timeIdxMin) / timeSpan;
    const bidY = (pt.bid - grid.priceMin) / priceRange;
    const askY = (pt.ask - grid.priceMin) / priceRange;

    const bidScreen = project(vp, normX, bidY, 0.004, w, h);
    const askScreen = project(vp, normX, askY, 0.004, w, h);
    if (!bidScreen || !askScreen) continue;

    // Staircase steps for bid
    if (prevBid) bidPoints.push({ x: bidScreen.x, y: prevBid.y });
    bidPoints.push(bidScreen);
    prevBid = bidScreen;

    // Staircase steps for ask
    if (prevAsk) askPoints.push({ x: askScreen.x, y: prevAsk.y });
    askPoints.push(askScreen);
    prevAsk = askScreen;
  }

  if (bidPoints.length < 2 || askPoints.length < 2) return;

  // Fill the spread band (area between bid and ask)
  ctx.beginPath();
  // Forward along ask (top)
  ctx.moveTo(askPoints[0].x, askPoints[0].y);
  for (let i = 1; i < askPoints.length; i++) {
    ctx.lineTo(askPoints[i].x, askPoints[i].y);
  }
  // Backward along bid (bottom)
  for (let i = bidPoints.length - 1; i >= 0; i--) {
    ctx.lineTo(bidPoints[i].x, bidPoints[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.fill();

  // Thin bid/ask border lines — cyan / pink
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(bidPoints[0].x, bidPoints[0].y);
  for (let i = 1; i < bidPoints.length; i++) ctx.lineTo(bidPoints[i].x, bidPoints[i].y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(244, 114, 182, 0.2)';
  ctx.beginPath();
  ctx.moveTo(askPoints[0].x, askPoints[0].y);
  for (let i = 1; i < askPoints.length; i++) ctx.lineTo(askPoints[i].x, askPoints[i].y);
  ctx.stroke();
}

// ── Liquidity Walls (large passive orders highlighted) ──────────────────

function drawLiquidityWalls(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  grid: SurfaceGridData,
) {
  const P = grid.priceLevels;
  const T = grid.timeSteps;
  if (P < 2 || T < 2) return;

  // Look at the latest time column for current liquidity walls
  const lastT = T - 1;
  let maxIntensity = 0;
  for (let p = 0; p < P; p++) {
    const v = grid.intensities[lastT * P + p];
    if (v > maxIntensity) maxIntensity = v;
  }
  if (maxIntensity < 0.01) return;

  const threshold = maxIntensity * 0.6; // Top 40% = wall

  for (let p = 0; p < P; p++) {
    const idx = lastT * P + p;
    const intensity = grid.intensities[idx];
    if (intensity < threshold) continue;

    const normY = p / (P - 1);
    const screen = project(vp, 1.0, normY, 0.01, w, h);
    if (!screen || screen.x < 0 || screen.x > w || screen.y < 0 || screen.y > h) continue;

    const isBid = grid.sides[idx] < 0.5;
    const strength = (intensity - threshold) / (maxIntensity - threshold); // 0-1
    const alpha = 0.3 + strength * 0.5;
    const size = 3 + strength * 6;

    // Small circle marker (cleaner than diamond)
    ctx.fillStyle = isBid
      ? `rgba(34, 211, 238, ${alpha * 0.8})`
      : `rgba(244, 114, 182, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Thin border
    ctx.strokeStyle = isBid
      ? `rgba(34, 211, 238, ${alpha * 0.5})`
      : `rgba(244, 114, 182, ${alpha * 0.5})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Horizontal line extending left to show the wall level
    ctx.strokeStyle = isBid
      ? `rgba(34, 211, 238, ${alpha * 0.15})`
      : `rgba(244, 114, 182, ${alpha * 0.15})`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    const leftPt = project(vp, 0.7, normY, 0, w, h);
    if (leftPt) {
      ctx.beginPath();
      ctx.moveTo(leftPt.x, leftPt.y);
      ctx.lineTo(screen.x, screen.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}

function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  grid: SurfaceGridData,
  tickSize: number,
) {
  const { priceMin, priceMax } = grid;
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0) return;

  const precision = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 4;

  // ── Price axis (along Y=1 right edge) ──
  const priceSteps = 8;
  ctx.font = '8px Consolas, Monaco, monospace';

  for (let i = 0; i <= priceSteps; i++) {
    const t = i / priceSteps;
    const price = priceMin + t * priceRange;
    const screen = project(vp, 1.02, t, 0, w, h);
    if (!screen || screen.x < 0 || screen.x > w - 10 || screen.y < 10 || screen.y > h - 10) continue;

    // Small tick
    ctx.strokeStyle = 'rgba(200, 210, 220, 0.08)';
    ctx.lineWidth = 0.5;
    const tickStart = project(vp, 1.0, t, 0, w, h);
    if (tickStart) {
      ctx.beginPath();
      ctx.moveTo(tickStart.x, tickStart.y);
      ctx.lineTo(screen.x, screen.y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(200, 210, 220, 0.4)';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(precision), screen.x + 3, screen.y + 3);
  }

  // ── Time axis (along X at Y=0 bottom edge) ──
  const timeSteps = 6;
  const totalTimeMs = (grid.timeIndexMax - grid.timeIndexMin) * 360;
  for (let i = 0; i <= timeSteps; i++) {
    const t = i / timeSteps;
    const screen = project(vp, t, -0.02, 0, w, h);
    if (!screen || screen.x < 30 || screen.x > w - 30 || screen.y < 10 || screen.y > h - 5) continue;

    const secsAgo = ((1 - t) * totalTimeMs / 1000);
    const label = secsAgo < 1 ? 'Now' : `-${Math.round(secsAgo)}s`;

    ctx.fillStyle = 'rgba(200, 210, 220, 0.35)';
    ctx.textAlign = 'center';
    ctx.fillText(label, screen.x, screen.y + 10);
  }
}

function drawColorLegend(ctx: CanvasRenderingContext2D, canvasH: number) {
  const x = 12;
  const barH = 80;
  const y = canvasH / 2 - barH / 2;
  const barW = 6;

  // Background
  ctx.fillStyle = 'rgba(5, 5, 16, 0.45)';
  roundedRect(ctx, x - 4, y - 14, barW + 34, barH + 26, 4);
  ctx.fill();

  // Gradient bar — thermal: blue (low) → green → yellow → red → white (high)
  const grad = ctx.createLinearGradient(x, y + barH, x, y);
  grad.addColorStop(0.0, 'rgba(5, 5, 16, 0.8)');
  grad.addColorStop(0.15, 'rgba(10, 42, 90, 0.9)');
  grad.addColorStop(0.30, 'rgba(10, 122, 106, 0.9)');
  grad.addColorStop(0.50, 'rgba(106, 186, 26, 0.95)');
  grad.addColorStop(0.70, 'rgba(186, 186, 10, 0.95)');
  grad.addColorStop(0.85, 'rgba(218, 122, 10, 0.95)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.95)');
  ctx.fillStyle = grad;
  roundedRect(ctx, x, y, barW, barH, 2);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 0.5;
  roundedRect(ctx, x, y, barW, barH, 2);
  ctx.stroke();

  // Labels
  ctx.font = '7px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  const lx = x + barW + 4;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('High', lx, y + 5);
  ctx.fillStyle = 'rgba(186, 186, 10, 0.4)';
  ctx.fillText('Mid', lx, y + barH * 0.5);
  ctx.fillStyle = 'rgba(10, 42, 90, 0.5)';
  ctx.fillText('Low', lx, y + barH - 2);
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  data: OverlayData,
  tickSize: number,
) {
  const ch = data.crosshairScreen!;
  const world = data.crosshairWorld!;
  const grid = data.grid!;

  // Check bounds
  if (world.worldX < 0 || world.worldX > 1 || world.worldY < 0 || world.worldY > 1) return;

  // Minimal crosshair lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 6]);

  ctx.beginPath();
  ctx.moveTo(ch.x, 0);
  ctx.lineTo(ch.x, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, ch.y);
  ctx.lineTo(w, ch.y);
  ctx.stroke();

  ctx.setLineDash([]);

  // Crosshair dot
  ctx.fillStyle = 'rgba(244, 244, 245, 0.8)';
  ctx.beginPath();
  ctx.arc(ch.x, ch.y, 2, 0, Math.PI * 2);
  ctx.fill();

  // Compute real-world values
  const price = grid.priceMin + world.worldY * (grid.priceMax - grid.priceMin);
  const precision = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 4;

  const timeRatio = 1 - world.worldX;
  const totalTimeMs = (grid.timeIndexMax - grid.timeIndexMin) * 360;
  const secsAgo = (timeRatio * totalTimeMs) / 1000;
  const timeLabel = secsAgo < 1 ? 'Now' : `-${Math.round(secsAgo)}s`;

  // Look up intensity at crosshair position
  const tIdx = Math.round(world.worldX * (grid.timeSteps - 1));
  const pIdx = Math.round(world.worldY * (grid.priceLevels - 1));
  let intensityVal = 0;
  let sideLabel = '';
  if (tIdx >= 0 && tIdx < grid.timeSteps && pIdx >= 0 && pIdx < grid.priceLevels) {
    const idx = tIdx * grid.priceLevels + pIdx;
    intensityVal = grid.intensities[idx];
    sideLabel = grid.sides[idx] < 0.5 ? 'Bid' : 'Ask';
  }

  // Compact tooltip
  const padding = 7;
  const lineHeight = 13;
  const hasIntensity = intensityVal > 0.001;
  const rowCount = hasIntensity ? 3 : 2;
  const boxW = 120;
  const boxH = rowCount * lineHeight + padding * 2;

  // Position avoiding edges
  let tx = ch.x + 12;
  let ty = ch.y - boxH - 4;
  if (tx + boxW > w - 10) tx = ch.x - boxW - 12;
  if (ty < 10) ty = ch.y + 12;

  ctx.fillStyle = 'rgba(5, 5, 16, 0.85)';
  roundedRect(ctx, tx, ty, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 0.5;
  roundedRect(ctx, tx, ty, boxW, boxH, 4);
  ctx.stroke();

  ctx.font = '9px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  let row = 0;

  // Price — white
  ctx.fillStyle = 'rgba(244, 244, 245, 0.9)';
  ctx.fillText(price.toFixed(precision), tx + padding, ty + padding + 9 + row * lineHeight);
  ctx.fillStyle = 'rgba(90, 101, 119, 0.5)';
  ctx.textAlign = 'right';
  ctx.fillText(timeLabel, tx + boxW - padding, ty + padding + 9 + row * lineHeight);
  row++;

  // Side + intensity — cyan/magenta
  if (hasIntensity) {
    ctx.textAlign = 'left';
    ctx.fillStyle = sideLabel === 'Bid' ? 'rgba(34, 211, 238, 0.7)' : 'rgba(244, 114, 182, 0.7)';
    ctx.fillText(sideLabel, tx + padding, ty + padding + 9 + row * lineHeight);

    // Mini intensity bar
    const barX = tx + padding + 28;
    const barY2 = ty + padding + 2 + row * lineHeight;
    const barW = boxW - padding * 2 - 28;
    const barH2 = 3;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(barX, barY2, barW, barH2);
    ctx.fillStyle = sideLabel === 'Bid' ? 'rgba(34, 211, 238, 0.45)' : 'rgba(244, 114, 182, 0.45)';
    ctx.fillRect(barX, barY2, intensityVal * barW, barH2);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(200, 210, 220, 0.5)';
    ctx.fillText(`${(intensityVal * 100).toFixed(0)}%`, tx + boxW - padding, ty + padding + 9 + row * lineHeight);
    row++;
  }
}

// ── Trade Bubbles (projected onto 3D surface) ──────────────────────────

function drawTradeBubbles(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  data: OverlayData,
) {
  const grid = data.grid!;
  const { trades } = data;
  if (trades.length === 0) return;

  const priceRange = grid.priceMax - grid.priceMin;
  if (priceRange <= 0) return;

  const timeRange = grid.timeIndexMax - grid.timeIndexMin;
  if (timeRange <= 0) return;

  // Find max trade size for relative sizing
  let maxSize = 0;
  for (const t of trades) {
    if (t.size > maxSize) maxSize = t.size;
  }
  if (maxSize === 0) return;

  const now = Date.now();

  for (const trade of trades) {
    // Normalize position to [0, 1] range
    const normY = (trade.price - grid.priceMin) / priceRange;
    if (normY < -0.05 || normY > 1.05) continue;

    // Time: historyIndex maps to the X axis
    const normX = timeRange > 0 ? (trade.historyIndex - grid.timeIndexMin) / timeRange : 0.5;
    if (normX < -0.05 || normX > 1.05) continue;

    // Project to screen — place bubbles slightly above the surface (z=0.02)
    const screen = project(vp, normX, normY, 0.02, w, h);
    if (!screen || screen.x < -20 || screen.x > w + 20 || screen.y < -20 || screen.y > h + 20) continue;

    // Size: sqrt scaling, smaller max to avoid clutter
    const relSize = trade.size / maxSize;
    const radius = 2.5 + Math.sqrt(relSize) * 14;

    // Age fade
    const ageMs = now - trade.timestamp;
    const ageFade = Math.max(0.1, 1 - ageMs / 25000);
    const alpha = Math.min(1, trade.opacity * ageFade);

    const isBuy = trade.side === 'buy';
    // Cyan for buys, pink for sells
    const r = isBuy ? 34 : 244;
    const g = isBuy ? 211 : 114;
    const b = isBuy ? 238 : 182;

    // Glow for large trades (subtle)
    if (relSize > 0.5) {
      const glowR = radius * 1.8;
      const glow = ctx.createRadialGradient(screen.x, screen.y, radius * 0.3, screen.x, screen.y, glowR);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.1})`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bubble fill
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
    ctx.fill();

    // Border
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.55})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Size label for notable trades
    if (relSize > 0.2 && radius > 7) {
      ctx.font = `${Math.min(9, radius * 0.6)}px Consolas, Monaco, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
      const sizeLabel = trade.size >= 1000 ? `${(trade.size / 1000).toFixed(1)}K`
        : trade.size >= 1 ? trade.size.toFixed(1)
        : trade.size.toFixed(3);
      ctx.fillText(sizeLabel, screen.x, screen.y + 3);
    }
  }
}

// ── Volume Profile (aggregate liquidity per price level on the right edge) ──

function drawVolumeProfile(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  grid: SurfaceGridData,
) {
  const P = grid.priceLevels;
  const T = grid.timeSteps;
  if (P < 2 || T < 2) return;

  // Aggregate intensity per price level (last 25% of time columns)
  const startCol = Math.floor(T * 0.75);
  const bidProfile = new Float32Array(P);
  const askProfile = new Float32Array(P);
  let maxVal = 0;

  for (let p = 0; p < P; p++) {
    let bidSum = 0;
    let askSum = 0;
    for (let t = startCol; t < T; t++) {
      const idx = t * P + p;
      const intensity = grid.intensities[idx];
      if (grid.sides[idx] < 0.5) {
        bidSum += intensity;
      } else {
        askSum += intensity;
      }
    }
    bidProfile[p] = bidSum;
    askProfile[p] = askSum;
    const total = bidSum + askSum;
    if (total > maxVal) maxVal = total;
  }

  if (maxVal === 0) return;

  // Draw profile bars along the right edge
  const maxBarWidth = 35;
  const step = Math.max(1, Math.floor(P / 40));

  for (let p = 0; p < P; p += step) {
    const normY = p / (P - 1);
    const screen = project(vp, 1.01, normY, 0, w, h);
    if (!screen || screen.x < 0 || screen.x > w - 5 || screen.y < 5 || screen.y > h - 5) continue;

    const total = bidProfile[p] + askProfile[p];
    if (total < maxVal * 0.03) continue;

    const barWidth = (total / maxVal) * maxBarWidth;
    const barHeight = Math.max(1.5, Math.min(4, h / P * 0.8));
    const bidWidth = total > 0 ? (bidProfile[p] / total) * barWidth : 0;

    const bx = screen.x + 3;
    const by = screen.y - barHeight / 2;

    // Bid (cyan)
    if (bidWidth > 0.5) {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
      ctx.fillRect(bx, by, bidWidth, barHeight);
    }

    // Ask (magenta)
    const askWidth = barWidth - bidWidth;
    if (askWidth > 0.5) {
      ctx.fillStyle = 'rgba(244, 114, 182, 0.25)';
      ctx.fillRect(bx + bidWidth, by, askWidth, barHeight);
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export const Heatmap3D = React.memo(function Heatmap3D({
  height = 600,
  config,
  symbol = 'btcusdt',
  initialMode = 'simulation',
}: Heatmap3DProps) {
  const isActive = usePageActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Heatmap3DRenderer | null>(null);
  const simulationRef = useRef<SimulationEngine | null>(null);
  const liveEngineRef = useRef<LiveDataEngine | null>(null);
  const animationRef = useRef<number>(0);
  const stateRef = useRef<MarketState | null>(null);
  const cleanupControlsRef = useRef<(() => void) | null>(null);
  const crosshairRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const overlayDirtyRef = useRef(true);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [isReady, setIsReady] = useState(false);
  const [dataMode] = useState<DataMode>(initialMode);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Surface settings (match Heatmap3DRenderer defaults)
  const [heightScale, setHeightScale] = useState(0.55);
  const [surfaceOpacity, setSurfaceOpacity] = useState(0.90);
  const [localContrast, setLocalContrast] = useState(1.4);
  const [ambientStrength, setAmbientStrength] = useState(0.18);
  const [upperCutoff, setUpperCutoff] = useState(85);

  // Layer toggles
  const [showGrid, setShowGrid] = useState(true);
  const [showTrades, setShowTrades] = useState(true);
  const [showProfile, setShowProfile] = useState(true);
  const [showPriceLine, setShowPriceLine] = useState(true);
  const [showSpreadBand, setShowSpreadBand] = useState(true);
  const [showLiquidityWalls, setShowLiquidityWalls] = useState(true);

  const tickSize = config?.tickSize || 0.5;

  // Initialize renderer + data engine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    const renderer = new Heatmap3DRenderer({
      canvas: canvasRef.current,
      width: rect.width,
      height: rect.height,
    });
    rendererRef.current = renderer;

    // Attach orbit controls
    cleanupControlsRef.current = renderer.attachControls(canvasRef.current);

    // Setup overlay canvas
    if (overlayCanvasRef.current) {
      const dpr = window.devicePixelRatio || 1;
      overlayCanvasRef.current.width = rect.width * dpr;
      overlayCanvasRef.current.height = rect.height * dpr;
      overlayCanvasRef.current.style.width = `${rect.width}px`;
      overlayCanvasRef.current.style.height = `${rect.height}px`;
      const octx = overlayCanvasRef.current.getContext('2d');
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Data engine
    const onUpdate = (state: MarketState) => {
      stateRef.current = state;
    };

    if (dataMode === 'simulation') {
      const sim = new SimulationEngine(config);
      sim.setOnUpdate(onUpdate);
      sim.start();
      simulationRef.current = sim;
    } else {
      resetLiveDataEngine();
      const live = new LiveDataEngine({ symbol, tickSize });
      live.setOnUpdate(onUpdate);
      live.start();
      liveEngineRef.current = live;
    }

    setIsReady(true);

    return () => {
      cleanupControlsRef.current?.();
      cleanupControlsRef.current = null;
      simulationRef.current?.destroy();
      simulationRef.current = null;
      liveEngineRef.current?.destroy();
      liveEngineRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
      setIsReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode, symbol]);

  // Pause/resume
  useEffect(() => {
    if (isActive) {
      simulationRef.current?.start();
      liveEngineRef.current?.start();
    } else {
      simulationRef.current?.stop();
    }
  }, [isActive]);

  // Resize
  useEffect(() => {
    if (!containerRef.current || !rendererRef.current) return;

    const ro = new ResizeObserver(() => {
      const rect = containerRef.current!.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      rendererRef.current?.resize(rect.width, rect.height);

      // Resize overlay canvas
      if (overlayCanvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        overlayCanvasRef.current.width = rect.width * dpr;
        overlayCanvasRef.current.height = rect.height * dpr;
        overlayCanvasRef.current.style.width = `${rect.width}px`;
        overlayCanvasRef.current.style.height = `${rect.height}px`;
        const octx = overlayCanvasRef.current.getContext('2d');
        if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      overlayDirtyRef.current = true;
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isReady) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const camera = rendererRef.current?.camera;
      if (!camera) return;

      switch (e.key) {
        case '1': camera.goToPreset('isometric'); break;
        case '2': camera.goToPreset('top'); break;
        case '3': camera.goToPreset('front'); break;
        case '4': camera.goToPreset('side'); break;
        case '5': camera.goToPreset('overview'); break;
        case 'r': case 'R': camera.reset(); break;
        default: return;
      }
      overlayDirtyRef.current = true;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReady]);

  // Render loop
  useEffect(() => {
    if (!isActive || !isReady) return;

    let lastDataUpdate = 0;
    const DATA_THROTTLE = 100;

    const render = () => {
      const renderer = rendererRef.current;
      const state = stateRef.current;

      if (renderer?.isInitialized) {
        const now = Date.now();

        // Apply camera inertia/transitions
        const cameraMoved = renderer.camera.tick();
        if (cameraMoved) overlayDirtyRef.current = true;

        // Throttle data adapter
        if (state && now - lastDataUpdate > DATA_THROTTLE) {
          lastDataUpdate = now;

          const priceRange = {
            min: state.midPrice - 75 * tickSize,
            max: state.midPrice + 75 * tickSize,
          };

          const grid = adaptMarketStateToSurface(state, priceRange, tickSize);
          if (grid) {
            renderer.updateData(grid, state.midPrice);
            overlayDirtyRef.current = true;
          }
        }

        // Render WebGL surface
        renderer.render({
          contrast: localContrast,
          upperCutoff: upperCutoff / 100,
          heightScale,
          showGridLines: showGrid,
          opacity: surfaceOpacity,
          ambientStrength,
        });

        // Render Canvas2D overlay (only when dirty)
        if (overlayDirtyRef.current) {
          const octx = overlayCanvasRef.current?.getContext('2d');
          if (octx && state) {
            const { w, h } = sizeRef.current;
            const aspect = w / h;
            const vp = renderer.camera.getViewProjectionMatrix(aspect);
            const gridData = renderer.getLastGridData();

            // Crosshair world position
            let crosshairWorld: { worldX: number; worldY: number } | null = null;
            const ch = crosshairRef.current;
            if (ch) {
              crosshairWorld = renderer.unprojectToFloor(ch.screenX, ch.screenY, w, h);
            }

            drawOverlay(octx, w, h, vp, {
              midPrice: state.midPrice,
              currentBid: state.currentBid,
              currentAsk: state.currentAsk,
              grid: gridData,
              trades: state.trades || [],
              priceHistory: state.priceHistory || [],
              crosshairScreen: ch ? { x: ch.screenX, y: ch.screenY } : null,
              crosshairWorld,
            }, tickSize, { showTrades, showProfile, showPriceLine, showSpreadBand, showLiquidityWalls });

            overlayDirtyRef.current = false;
          }
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isReady, localContrast, upperCutoff, heightScale, surfaceOpacity, ambientStrength, showGrid, showTrades, showProfile, showPriceLine, showSpreadBand, showLiquidityWalls, tickSize]);

  // Mouse handlers for crosshair (use refs, not state, to avoid re-renders)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    crosshairRef.current = {
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
    };
    overlayDirtyRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = null;
    overlayDirtyRef.current = true;
  }, []);

  const handleResetCamera = useCallback(() => {
    rendererRef.current?.camera.reset();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: '#050510' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ cursor: 'grab' }}
      />

      {/* Canvas2D overlay (pointer-events: none) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ pointerEvents: 'none' }}
      />

      {/* ── Settings Panel — top right ── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        {/* Toggle settings button */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={`bg-black/75 backdrop-blur-sm rounded-md px-2.5 py-1 border text-[9px] uppercase tracking-wider transition-colors self-end ${
            settingsOpen ? 'border-amber-500/30 text-amber-400/80' : 'border-white/[0.06] text-white/35 hover:text-white/60'
          }`}
        >
          Settings
        </button>

        {settingsOpen && (
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/[0.08] w-52 overflow-hidden">
            {/* Surface section */}
            <div className="px-3 pt-2.5 pb-2">
              <div className="text-[7px] text-white/25 uppercase tracking-[0.15em] mb-2">Surface</div>

              {/* Sliders */}
              {([
                { label: 'Height', value: heightScale, set: setHeightScale, min: 0.1, max: 2, step: 0.05 },
                { label: 'Opacity', value: surfaceOpacity, set: setSurfaceOpacity, min: 0.1, max: 1, step: 0.05 },
                { label: 'Contrast', value: localContrast, set: setLocalContrast, min: 0.5, max: 3, step: 0.1 },
                { label: 'Ambient', value: ambientStrength, set: setAmbientStrength, min: 0.1, max: 0.8, step: 0.05 },
                { label: 'Cutoff', value: upperCutoff, set: setUpperCutoff, min: 50, max: 100, step: 1 },
              ] as const).map((s) => (
                <div key={s.label} className="flex items-center justify-between mb-1.5">
                  <span className="text-[8px] text-white/40 w-12">{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={s.value}
                    onChange={(e) => s.set(parseFloat(e.target.value))}
                    className="flex-1 mx-2 h-0.5 accent-amber-500"
                  />
                  <span className="text-[8px] text-white/30 w-7 text-right font-mono">
                    {s.label === 'Cutoff' ? `${s.value}%` : s.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Layers section */}
            <div className="border-t border-white/[0.05] px-3 pt-2 pb-2">
              <div className="text-[7px] text-white/25 uppercase tracking-[0.15em] mb-1.5">Layers</div>
              {([
                { label: 'Grid', active: showGrid, toggle: () => setShowGrid(!showGrid) },
                { label: 'Price Line', active: showPriceLine, toggle: () => setShowPriceLine(!showPriceLine) },
                { label: 'Spread Band', active: showSpreadBand, toggle: () => setShowSpreadBand(!showSpreadBand) },
                { label: 'Trades', active: showTrades, toggle: () => setShowTrades(!showTrades) },
                { label: 'Profile', active: showProfile, toggle: () => setShowProfile(!showProfile) },
                { label: 'Liq. Walls', active: showLiquidityWalls, toggle: () => setShowLiquidityWalls(!showLiquidityWalls) },
              ] as const).map((item) => (
                <button
                  key={item.label}
                  onClick={item.toggle}
                  className={`flex items-center w-full py-0.5 text-[9px] transition-colors ${
                    item.active ? 'text-amber-400/80' : 'text-white/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-2 flex-shrink-0 ${item.active ? 'bg-amber-500/60' : 'bg-white/10'}`} />
                  {item.label}
                </button>
              ))}
            </div>

            {/* Camera section */}
            <div className="border-t border-white/[0.05] px-3 pt-2 pb-2.5">
              <div className="text-[7px] text-white/25 uppercase tracking-[0.15em] mb-1.5">Camera</div>
              <div className="flex gap-1 flex-wrap">
                {CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => rendererRef.current?.camera.goToPreset(preset.name)}
                    className="bg-white/[0.04] rounded px-1.5 py-0.5 text-[8px] text-white/35 hover:text-white/60 hover:bg-white/[0.08] transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={handleResetCamera}
                  className="bg-white/[0.04] rounded px-1.5 py-0.5 text-[8px] text-white/35 hover:text-white/60 hover:bg-white/[0.08] transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Camera Presets — bottom right (always visible) */}
      <div className="absolute bottom-2.5 right-3 flex gap-0.5 z-10">
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => rendererRef.current?.camera.goToPreset(preset.name)}
            className="bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 border border-white/[0.06] text-[8px] text-white/30 uppercase tracking-wider hover:text-white/60 hover:border-white/10 transition-colors"
            title={`${preset.label} view (${preset.shortcut})`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Mode Badge — bottom left */}
      <div className="absolute bottom-2.5 left-3 z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-md px-2.5 py-1 border border-white/[0.06]">
          <span className="text-[8px] text-amber-400/70 uppercase tracking-widest font-medium">
            3D
          </span>
          <span className="text-[8px] text-white/20 ml-1.5">
            Drag | Scroll | Shift+Pan | 1-5
          </span>
        </div>
      </div>

      {/* Loading */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <span className="text-xs text-white/50">Initializing 3D...</span>
          </div>
        </div>
      )}
    </div>
  );
});
