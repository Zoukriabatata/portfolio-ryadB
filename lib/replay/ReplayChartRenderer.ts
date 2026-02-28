/**
 * REPLAY CHART RENDERER
 *
 * Modular rendering engine for the replay trading chart.
 * Extracted from ReplayTradingChart.tsx monolithic draw() into
 * individual render methods, each responsible for one visual layer.
 *
 * New features: VWAP, TWAP, VWAP Bands, Developing POC, CVD Panel,
 * Delta Profile, Stacked Imbalances, Naked POCs, Unfinished Auctions,
 * Session Separators, Heatmap Cells, Large Trade Highlighting.
 */

import type { FootprintCandle, PriceLevel } from '@/lib/ib/IBFootprintAdapter';
import type { FootprintFeatures, FootprintColors } from '@/stores/useFootprintSettingsStore';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReplayRenderContext {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  chartW: number;
  chartH: number;
  volH: number;
  cvdH: number;
  candleW: number;
  bodyW: number;
  candles: FootprintCandle[];
  allCandles: FootprintCandle[];
  startIdx: number;
  hi: number;
  lo: number;
  pR: number;
  maxV: number;
  showFP: boolean;
  price: number;
  mouseX: number;
  mouseY: number;
  tickSize: number;
  p2y: (price: number) => number;
  y2p: (y: number) => number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const PRICE_AXIS_W = 70;
export const TIME_AXIS_H = 24;
export const VOL_PCT = 0.15;

const DEFAULT_COLORS = {
  bg: '#0a0a0f',
  up: '#10b981',
  down: '#ef4444',
  upFill: 'rgba(16,185,129,0.35)',
  downFill: 'rgba(239,68,68,0.35)',
  grid: 'rgba(255,255,255,0.04)',
  gridText: 'rgba(255,255,255,0.3)',
  priceLine: '#f59e0b',
  volUp: 'rgba(16,185,129,0.3)',
  volDown: 'rgba(239,68,68,0.3)',
  fpBid: 'rgba(239,68,68,0.7)',
  fpAsk: 'rgba(16,185,129,0.7)',
  fpImbBuy: 'rgba(16,185,129,1)',
  fpImbSell: 'rgba(239,68,68,1)',
  fpPoc: 'rgba(16,185,129,0.15)',
  fpCell: 'rgba(255,255,255,0.03)',
  crosshair: 'rgba(255,255,255,0.15)',
  vwap: '#3b82f6',
  twap: '#f97316',
  dpoc: '#fbbf24',
  cvdUp: '#10b981',
  cvdDown: '#ef4444',
  nakedPoc: '#fbbf24',
  stackedBullish: 'rgba(16,185,129,0.12)',
  stackedBearish: 'rgba(239,68,68,0.12)',
  unfinishedAuction: '#a855f7',
  sessionSeparator: 'rgba(255,255,255,0.08)',
  largeTrade: '#ffd700',
};

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ReplayChartRenderer {

  // ── Background ──
  renderBackground(rc: ReplayRenderContext, transparent = false): void {
    const { ctx, w, h } = rc;
    // Semi-transparent when heatmap layer is behind
    ctx.fillStyle = transparent ? 'rgba(10,10,15,0.85)' : DEFAULT_COLORS.bg;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Grid ──
  renderGrid(rc: ReplayRenderContext): void {
    const { ctx, chartW, chartH, hi, lo, pR, w, p2y } = rc;
    ctx.strokeStyle = DEFAULT_COLORS.grid;
    ctx.lineWidth = 1;
    const steps = 8;
    const pStep = pR / steps;
    ctx.font = '9px monospace';
    ctx.fillStyle = DEFAULT_COLORS.gridText;
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const p = lo + i * pStep;
      const y = p2y(p);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      ctx.fillText(p.toFixed(2), w - 4, y + 3);
    }
  }

  // ── Candles ──
  renderCandles(rc: ReplayRenderContext, features?: FootprintFeatures): void {
    const { ctx, candles, candleW, bodyW, chartH, volH, maxV, showFP, hi, lo, pR, p2y } = rc;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = i * candleW;
      const cx = x + candleW / 2;
      const up = c.close >= c.open;

      if (showFP) {
        this.renderFootprintCandle(rc, c, x, i, features);
      } else {
        const oY = p2y(c.open), cY = p2y(c.close), hY = p2y(c.high), lY = p2y(c.low);
        const top = Math.min(oY, cY), bH = Math.max(1, Math.abs(cY - oY));

        ctx.strokeStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, hY); ctx.lineTo(cx, lY); ctx.stroke();

        if (bH < 2) {
          ctx.fillStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
          ctx.fillRect(cx - bodyW / 2, top, bodyW, 1);
        } else {
          ctx.fillStyle = up ? DEFAULT_COLORS.upFill : DEFAULT_COLORS.downFill;
          ctx.fillRect(cx - bodyW / 2, top, bodyW, bH);
          ctx.strokeStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - bodyW / 2, top, bodyW, bH);
        }
      }

      // Volume bars
      const vH = maxV > 0 ? (c.totalVolume / maxV) * volH * 0.85 : 0;
      ctx.fillStyle = c.close >= c.open ? DEFAULT_COLORS.volUp : DEFAULT_COLORS.volDown;
      ctx.fillRect(x + 1, chartH + volH - vH, candleW - 2, vH);
    }
  }

  // ── Single Footprint Candle ──
  private renderFootprintCandle(
    rc: ReplayRenderContext,
    candle: FootprintCandle,
    x: number,
    candleIdx: number,
    features?: FootprintFeatures,
  ): void {
    const { ctx, candleW, bodyW, hi, lo, pR, chartH, p2y } = rc;
    const up = candle.close >= candle.open;
    const levels = Array.from(candle.levels.values()).sort((a, b) => b.price - a.price);

    if (levels.length === 0) {
      const oY = p2y(candle.open), cY = p2y(candle.close);
      ctx.strokeStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + candleW * 0.1, Math.min(oY, cY), candleW * 0.8, Math.max(1, Math.abs(cY - oY)));
      return;
    }

    let maxLV = 0;
    let totalLevelVol = 0;
    for (const l of levels) {
      if (l.totalVolume > maxLV) maxLV = l.totalVolume;
      totalLevelVol += l.totalVolume;
    }
    const avgLevelVol = levels.length > 0 ? totalLevelVol / levels.length : 0;

    // Tick size from price gaps
    const prices = levels.map(l => l.price);
    let tick = rc.tickSize || 1;
    if (prices.length > 1) {
      const diffs: number[] = [];
      for (let i = 1; i < prices.length; i++) diffs.push(Math.abs(prices[i] - prices[i - 1]));
      const minDiff = Math.min(...diffs.filter(d => d > 0));
      if (minDiff > 0) tick = minDiff;
    }

    const cellH = Math.max(2, (tick / pR) * chartH);
    const half = bodyW / 2;
    const cx = x + candleW / 2;

    for (const lv of levels) {
      const y = p2y(lv.price);
      const intensity = maxLV > 0 ? lv.totalVolume / maxLV : 0;

      // Heatmap cell intensity
      if (features?.showHeatmapCells) {
        const alpha = intensity * (features.heatmapIntensity || 0.4);
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`;
        ctx.fillRect(cx - half, y - cellH / 2, bodyW, cellH);
      }

      // Cell bg (POC vs normal)
      ctx.fillStyle = lv.price === candle.poc ? DEFAULT_COLORS.fpPoc : DEFAULT_COLORS.fpCell;
      ctx.fillRect(cx - half, y - cellH / 2, bodyW, cellH);

      // Bid/ask bars
      const bW = (half - 2) * (maxLV > 0 ? lv.bidVolume / maxLV : 0);
      const aW = (half - 2) * (maxLV > 0 ? lv.askVolume / maxLV : 0);

      ctx.fillStyle = lv.imbalanceSell ? DEFAULT_COLORS.fpImbSell : `rgba(239,68,68,${0.2 + intensity * 0.6})`;
      ctx.fillRect(cx - 1 - bW, y - cellH / 2 + 0.5, bW, cellH - 1);

      ctx.fillStyle = lv.imbalanceBuy ? DEFAULT_COLORS.fpImbBuy : `rgba(16,185,129,${0.2 + intensity * 0.6})`;
      ctx.fillRect(cx + 1, y - cellH / 2 + 0.5, aW, cellH - 1);

      // Large trade highlighting
      if (features?.showLargeTradeHighlight && lv.totalVolume > avgLevelVol * (features.largeTradeMultiplier || 3)) {
        ctx.strokeStyle = features.largeTradeColor || DEFAULT_COLORS.largeTrade;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - half + 0.5, y - cellH / 2 + 0.5, bodyW - 1, cellH - 1);
        // Glow
        ctx.shadowColor = features.largeTradeColor || DEFAULT_COLORS.largeTrade;
        ctx.shadowBlur = 4;
        ctx.strokeRect(cx - half + 0.5, y - cellH / 2 + 0.5, bodyW - 1, cellH - 1);
        ctx.shadowBlur = 0;
      }

      // Volume text
      if (cellH >= 10 && candleW > 50) {
        ctx.font = `${Math.min(9, cellH - 2)}px monospace`;
        if (lv.bidVolume > 0) {
          ctx.fillStyle = DEFAULT_COLORS.fpBid;
          ctx.textAlign = 'right';
          ctx.fillText(fmtV(lv.bidVolume), cx - 3, y + 3);
        }
        if (lv.askVolume > 0) {
          ctx.fillStyle = DEFAULT_COLORS.fpAsk;
          ctx.textAlign = 'left';
          ctx.fillText(fmtV(lv.askVolume), cx + 3, y + 3);
        }
      }

      // Center divider
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(cx - 0.5, y - cellH / 2, 1, cellH);
    }

    // Body outline
    const oY = p2y(candle.open), cY = p2y(candle.close);
    ctx.strokeStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - half, Math.min(oY, cY), bodyW, Math.max(1, Math.abs(cY - oY)));

    // Wicks
    const hY = p2y(candle.high), lY = p2y(candle.low);
    ctx.strokeStyle = up ? DEFAULT_COLORS.up : DEFAULT_COLORS.down;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, hY); ctx.lineTo(cx, Math.min(oY, cY));
    ctx.moveTo(cx, Math.max(oY, cY)); ctx.lineTo(cx, lY);
    ctx.stroke();

    // Delta label
    if (candleW > 30) {
      const d = candle.totalDelta;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = d >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
      ctx.fillText((d >= 0 ? '+' : '') + fmtV(d), cx, lY + 12);
    }
  }

  // ── Current Price Line ──
  renderCurrentPriceLine(rc: ReplayRenderContext): void {
    const { ctx, chartW, price, hi, lo, p2y, w } = rc;
    if (price <= 0 || price < lo || price > hi) return;

    const py = p2y(price);
    ctx.strokeStyle = DEFAULT_COLORS.priceLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(chartW, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = DEFAULT_COLORS.priceLine;
    ctx.fillRect(chartW, py - 8, PRICE_AXIS_W, 16);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(price.toFixed(2), chartW + PRICE_AXIS_W / 2, py + 3);
  }

  // ── Time Axis ──
  renderTimeAxis(rc: ReplayRenderContext): void {
    const { ctx, candles, candleW, h } = rc;
    ctx.fillStyle = DEFAULT_COLORS.gridText;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const tStep = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += tStep) {
      const c = candles[i];
      const x = i * candleW + candleW / 2;
      const d = new Date(c.time * 1000);
      ctx.fillText(
        `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
        x, h - 4,
      );
    }
  }

  // ── Crosshair ──
  renderCrosshair(rc: ReplayRenderContext): void {
    const { ctx, chartW, chartH, volH, mouseX, mouseY, p2y, w } = rc;
    const y2p = rc.y2p;
    if (mouseX < 0 || mouseX >= chartW || mouseY < 0 || mouseY >= chartH) return;

    ctx.strokeStyle = DEFAULT_COLORS.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, mouseY); ctx.lineTo(chartW, mouseY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mouseX, 0); ctx.lineTo(mouseX, chartH + volH); ctx.stroke();
    ctx.setLineDash([]);

    const cp = y2p(mouseY);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(chartW, mouseY - 8, PRICE_AXIS_W, 16);
    ctx.fillStyle = '#000';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(cp.toFixed(2), chartW + PRICE_AXIS_W / 2, mouseY + 3);
  }

  // ── Separators ──
  renderSeparators(rc: ReplayRenderContext): void {
    const { ctx, chartW, chartH, h } = rc;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, chartH); ctx.lineTo(chartW, chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, h); ctx.stroke();
  }

  // ── HUD ──
  renderHUD(rc: ReplayRenderContext): void {
    const { ctx, candles, showFP, chartH, volH, cvdH } = rc;
    const modeLabel = showFP ? 'FOOTPRINT' : 'CANDLES';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${candles.length} candles · ${modeLabel}`, 8, chartH + volH + cvdH + 14);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── VWAP Line ──
  renderVWAP(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, candleW, chartW, chartH, p2y, hi, lo } = rc;
    if (candles.length < 2) return;

    // Compute VWAP per visible candle (cumulative from start of visible range)
    // For replay accuracy, compute from all candles from session start
    const allCandles = rc.allCandles;
    let cumTPV = 0, cumVol = 0, cumTP2 = 0;

    interface VWAPAtCandle { x: number; vwap: number; upper1: number; lower1: number; upper2: number; lower2: number; }
    const vwapLine: VWAPAtCandle[] = [];

    for (let i = 0; i < allCandles.length; i++) {
      const c = allCandles[i];
      const tp = (c.high + c.low + c.close) / 3;
      cumTPV += tp * c.totalVolume;
      cumVol += c.totalVolume;
      cumTP2 += tp * tp * c.totalVolume;

      // Only plot visible candles
      const visIdx = i - rc.startIdx;
      if (visIdx < 0 || visIdx >= candles.length) continue;
      if (cumVol <= 0) continue;

      const vwap = cumTPV / cumVol;
      const variance = cumTP2 / cumVol - vwap * vwap;
      const stdDev = Math.sqrt(Math.max(0, variance));

      vwapLine.push({
        x: visIdx * candleW + candleW / 2,
        vwap,
        upper1: vwap + stdDev,
        lower1: vwap - stdDev,
        upper2: vwap + 2 * stdDev,
        lower2: vwap - 2 * stdDev,
      });
    }

    if (vwapLine.length < 2) return;

    // VWAP Bands
    if (features.showVWAPBands) {
      const bandOpacity = features.vwapBandOpacity || 0.06;

      // 1σ band fill
      ctx.fillStyle = `rgba(59, 130, 246, ${bandOpacity})`;
      ctx.beginPath();
      for (let i = 0; i < vwapLine.length; i++) {
        const pt = vwapLine[i];
        const y = p2y(pt.upper1);
        if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
      }
      for (let i = vwapLine.length - 1; i >= 0; i--) {
        ctx.lineTo(vwapLine[i].x, p2y(vwapLine[i].lower1));
      }
      ctx.closePath();
      ctx.fill();

      // 2σ band fill (lighter)
      ctx.fillStyle = `rgba(59, 130, 246, ${bandOpacity * 0.5})`;
      ctx.beginPath();
      for (let i = 0; i < vwapLine.length; i++) {
        const pt = vwapLine[i];
        if (i === 0) ctx.moveTo(pt.x, p2y(pt.upper2)); else ctx.lineTo(pt.x, p2y(pt.upper2));
      }
      for (let i = vwapLine.length - 1; i >= 0; i--) {
        ctx.lineTo(vwapLine[i].x, p2y(vwapLine[i].upper1));
      }
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < vwapLine.length; i++) {
        const pt = vwapLine[i];
        if (i === 0) ctx.moveTo(pt.x, p2y(pt.lower1)); else ctx.lineTo(pt.x, p2y(pt.lower1));
      }
      for (let i = vwapLine.length - 1; i >= 0; i--) {
        ctx.lineTo(vwapLine[i].x, p2y(vwapLine[i].lower2));
      }
      ctx.closePath();
      ctx.fill();

      // Band border lines (dashed)
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = `rgba(59, 130, 246, 0.35)`;
      for (const key of ['upper1', 'lower1', 'upper2', 'lower2'] as const) {
        ctx.beginPath();
        for (let i = 0; i < vwapLine.length; i++) {
          const pt = vwapLine[i];
          const y = p2y(pt[key]);
          if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // VWAP line glow
    ctx.strokeStyle = `rgba(59, 130, 246, 0.12)`;
    ctx.lineWidth = (features.vwapLineWidth || 2) * 2.4;
    ctx.beginPath();
    for (let i = 0; i < vwapLine.length; i++) {
      const pt = vwapLine[i];
      const y = p2y(pt.vwap);
      if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
    }
    ctx.stroke();

    // VWAP main line
    ctx.strokeStyle = features.vwapColor || DEFAULT_COLORS.vwap;
    ctx.lineWidth = features.vwapLineWidth || 2;
    ctx.beginPath();
    for (let i = 0; i < vwapLine.length; i++) {
      const pt = vwapLine[i];
      const y = p2y(pt.vwap);
      if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
    }
    ctx.stroke();

    // VWAP label
    if (features.vwapShowLabel !== false) {
      const last = vwapLine[vwapLine.length - 1];
      const ly = p2y(last.vwap);
      if (ly > 0 && ly < chartH) {
        drawBadge(ctx, 'VWAP', last.x + 6, ly, features.vwapColor || DEFAULT_COLORS.vwap);
      }
    }
  }

  // ── TWAP Line ──
  renderTWAP(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, candleW, chartH, p2y } = rc;
    if (candles.length < 2) return;

    // Compute TWAP per visible candle
    const allCandles = rc.allCandles;
    let cumPriceTime = 0, cumTime = 0;

    interface TWAPAtCandle { x: number; twap: number; }
    const twapLine: TWAPAtCandle[] = [];

    for (let i = 0; i < allCandles.length; i++) {
      const c = allCandles[i];
      const tp = (c.open + c.high + c.low + c.close) / 4;
      const dur = 1; // equal weight per candle
      cumPriceTime += tp * dur;
      cumTime += dur;

      const visIdx = i - rc.startIdx;
      if (visIdx < 0 || visIdx >= candles.length) continue;
      if (cumTime <= 0) continue;

      twapLine.push({ x: visIdx * candleW + candleW / 2, twap: cumPriceTime / cumTime });
    }

    if (twapLine.length < 2) return;

    // TWAP line (dashed)
    ctx.strokeStyle = features.twapColor || DEFAULT_COLORS.twap;
    ctx.lineWidth = features.twapLineWidth || 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < twapLine.length; i++) {
      const pt = twapLine[i];
      const y = p2y(pt.twap);
      if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // TWAP label
    if (features.twapShowLabel !== false) {
      const last = twapLine[twapLine.length - 1];
      const ly = p2y(last.twap);
      if (ly > 0 && ly < chartH) {
        drawBadge(ctx, 'TWAP', last.x + 6, ly, features.twapColor || DEFAULT_COLORS.twap);
      }
    }
  }

  // ── Developing POC ──
  renderDevelopingPOC(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, candleW, chartH, p2y } = rc;
    if (candles.length < 2) return;

    interface POCPoint { x: number; poc: number; }
    const pocLine: POCPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.poc > 0) {
        pocLine.push({ x: i * candleW + candleW / 2, poc: c.poc });
      }
    }

    if (pocLine.length < 2) return;

    const color = features.developingPOCColor || DEFAULT_COLORS.dpoc;

    // Glow
    ctx.strokeStyle = `${color}20`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < pocLine.length; i++) {
      const pt = pocLine[i];
      const y = p2y(pt.poc);
      if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
    }
    ctx.stroke();

    // Main line
    ctx.strokeStyle = `${color}aa`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pocLine.length; i++) {
      const pt = pocLine[i];
      const y = p2y(pt.poc);
      if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
    }
    ctx.stroke();

    // Dots at each POC
    ctx.fillStyle = `${color}cc`;
    for (const pt of pocLine) {
      const y = p2y(pt.poc);
      ctx.beginPath();
      ctx.arc(pt.x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label
    const last = pocLine[pocLine.length - 1];
    const ly = p2y(last.poc);
    if (ly > 0 && ly < chartH) {
      drawBadge(ctx, 'dPOC', last.x + 6, ly, color);
    }
  }

  // ── CVD Panel ──
  renderCVDPanel(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, candleW, chartW, chartH, volH, w } = rc;
    if (candles.length < 2) return;

    const cvdH = features.cvdPanelHeight || 70;
    const panelTop = chartH + volH;
    const panelBottom = panelTop + cvdH;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, panelTop, chartW, cvdH);

    // Separator line
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, panelTop); ctx.lineTo(chartW, panelTop); ctx.stroke();

    // Compute CVD
    let cumDelta = 0;
    const cvdPoints: { x: number; cvd: number }[] = [];
    for (let i = 0; i < candles.length; i++) {
      cumDelta += candles[i].totalDelta;
      cvdPoints.push({ x: i * candleW + candleW / 2, cvd: cumDelta });
    }

    const maxCVD = Math.max(...cvdPoints.map(p => Math.abs(p.cvd)), 1);
    const cvdP2y = (v: number) => panelTop + cvdH / 2 - (v / maxCVD) * (cvdH / 2 - 6);
    const zeroY = cvdP2y(0);

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(chartW, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Fill areas
    // Above zero (green)
    ctx.fillStyle = 'rgba(16,185,129,0.08)';
    ctx.beginPath();
    ctx.moveTo(cvdPoints[0].x, zeroY);
    for (const pt of cvdPoints) {
      const y = cvdP2y(pt.cvd);
      ctx.lineTo(pt.x, Math.min(y, zeroY));
    }
    ctx.lineTo(cvdPoints[cvdPoints.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fill();

    // Below zero (red)
    ctx.fillStyle = 'rgba(239,68,68,0.08)';
    ctx.beginPath();
    ctx.moveTo(cvdPoints[0].x, zeroY);
    for (const pt of cvdPoints) {
      const y = cvdP2y(pt.cvd);
      ctx.lineTo(pt.x, Math.max(y, zeroY));
    }
    ctx.lineTo(cvdPoints[cvdPoints.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fill();

    // CVD line with color segments
    ctx.lineWidth = 1.5;
    for (let i = 1; i < cvdPoints.length; i++) {
      const prev = cvdPoints[i - 1];
      const curr = cvdPoints[i];
      ctx.strokeStyle = curr.cvd >= prev.cvd ? DEFAULT_COLORS.cvdUp : DEFAULT_COLORS.cvdDown;
      ctx.beginPath();
      ctx.moveTo(prev.x, cvdP2y(prev.cvd));
      ctx.lineTo(curr.x, cvdP2y(curr.cvd));
      ctx.stroke();
    }

    // CVD label
    const lastCVD = cvdPoints[cvdPoints.length - 1].cvd;
    ctx.fillStyle = lastCVD >= 0 ? DEFAULT_COLORS.cvdUp : DEFAULT_COLORS.cvdDown;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CVD ${lastCVD >= 0 ? '+' : ''}${fmtV(lastCVD)}`, 6, panelTop + 12);
  }

  // ── Delta Profile ──
  renderDeltaProfile(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, chartW, chartH, p2y, hi, lo, pR, tickSize } = rc;
    if (candles.length < 1) return;

    // Aggregate delta per price level across all visible candles
    const deltaByPrice = new Map<number, number>();
    for (const c of candles) {
      for (const [, lv] of c.levels) {
        const rounded = Math.round(lv.price / tickSize) * tickSize;
        deltaByPrice.set(rounded, (deltaByPrice.get(rounded) || 0) + lv.delta);
      }
    }

    if (deltaByPrice.size === 0) return;

    const maxDelta = Math.max(...Array.from(deltaByPrice.values()).map(Math.abs), 1);
    const profileW = 50; // pixels for delta profile
    const profileX = chartW - profileW;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(profileX, 0, profileW, chartH);

    // Draw bars
    const cellH = Math.max(1, (tickSize / pR) * chartH);
    const posColor = features.deltaProfilePositiveColor || '#10b981';
    const negColor = features.deltaProfileNegativeColor || '#ef4444';
    const opacity = features.deltaProfileOpacity || 0.6;

    for (const [price, delta] of deltaByPrice) {
      const y = p2y(price);
      if (y < 0 || y > chartH) continue;

      const barW = (Math.abs(delta) / maxDelta) * (profileW - 4);
      if (delta >= 0) {
        ctx.fillStyle = `${posColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
        ctx.fillRect(profileX + 2, y - cellH / 2, barW, Math.max(1, cellH - 1));
      } else {
        ctx.fillStyle = `${negColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
        ctx.fillRect(profileX + profileW - 2 - barW, y - cellH / 2, barW, Math.max(1, cellH - 1));
      }
    }

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ΔP', profileX + profileW / 2, 10);
  }

  // ── Session Separators ──
  renderSessionSeparators(rc: ReplayRenderContext): void {
    const { ctx, candles, candleW, chartH, volH, cvdH } = rc;
    if (candles.length < 2) return;

    ctx.strokeStyle = DEFAULT_COLORS.sessionSeparator;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    let lastHour = -1;
    for (let i = 0; i < candles.length; i++) {
      const d = new Date(candles[i].time * 1000);
      const hour = d.getHours();
      if (lastHour !== -1 && hour !== lastHour) {
        const x = i * candleW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, chartH + volH + cvdH);
        ctx.stroke();

        // Hour label
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${hour}h`, x, 10);
      }
      lastHour = hour;
    }
    ctx.setLineDash([]);
  }

  // ── Stacked Imbalances ──
  renderStackedImbalances(rc: ReplayRenderContext, features: FootprintFeatures): void {
    const { ctx, candles, candleW, bodyW, p2y, tickSize, chartH } = rc;
    const minConsecutive = features.stackedImbalanceMin || 3;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const levels = Array.from(c.levels.values()).sort((a, b) => a.price - b.price);
      if (levels.length < minConsecutive) continue;

      const cx = i * candleW + candleW / 2;
      const half = bodyW / 2;

      // Find consecutive imbalances in same direction
      let currentDir: 'buy' | 'sell' | null = null;
      let startPrice = 0;
      let endPrice = 0;
      let count = 0;
      let lastPrice = -Infinity;

      const flushStreak = () => {
        if (count >= minConsecutive && currentDir) {
          const y1 = p2y(endPrice + tickSize / 2);
          const y2 = p2y(startPrice - tickSize / 2);
          const color = currentDir === 'buy' ? DEFAULT_COLORS.stackedBullish : DEFAULT_COLORS.stackedBearish;
          const borderColor = currentDir === 'buy' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';

          ctx.fillStyle = color;
          ctx.fillRect(cx - half - 2, y1, bodyW + 4, y2 - y1);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - half - 2, y1, bodyW + 4, y2 - y1);

          // Label
          if (bodyW > 30) {
            ctx.fillStyle = currentDir === 'buy' ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`SI ${count}`, cx, y1 - 2);
          }
        }
      };

      for (const lv of levels) {
        const isConsecutive = lastPrice === -Infinity || Math.abs(lv.price - lastPrice - tickSize) < tickSize * 0.5;
        const dir: 'buy' | 'sell' | null = lv.imbalanceBuy ? 'buy' : lv.imbalanceSell ? 'sell' : null;

        if (dir && dir === currentDir && isConsecutive) {
          endPrice = lv.price;
          count++;
        } else {
          flushStreak();
          currentDir = dir;
          startPrice = lv.price;
          endPrice = lv.price;
          count = dir ? 1 : 0;
        }
        lastPrice = lv.price;
      }
      flushStreak();
    }
  }

  // ── Naked POCs ──
  renderNakedPOCs(rc: ReplayRenderContext): void {
    const { ctx, candles, candleW, chartW, chartH, p2y, price } = rc;
    if (candles.length < 2) return;

    // Calculate naked POCs: POC levels not revisited by subsequent price action
    const nakedPOCs: { candleIdx: number; price: number }[] = [];

    for (let i = 0; i < candles.length - 1; i++) {
      const poc = candles[i].poc;
      if (poc <= 0) continue;

      let tested = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= poc && candles[j].high >= poc) {
          tested = true;
          break;
        }
      }
      if (!tested) {
        nakedPOCs.push({ candleIdx: i, price: poc });
      }
    }

    for (const np of nakedPOCs) {
      const y = p2y(np.price);
      if (y < 0 || y > chartH) continue;

      const startX = np.candleIdx * candleW + candleW;

      // Dashed line
      ctx.strokeStyle = `${DEFAULT_COLORS.nakedPoc}80`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Diamond marker at origin
      const dx = np.candleIdx * candleW + candleW / 2;
      ctx.fillStyle = `${DEFAULT_COLORS.nakedPoc}cc`;
      ctx.beginPath();
      ctx.moveTo(dx, y - 4);
      ctx.lineTo(dx + 3, y);
      ctx.lineTo(dx, y + 4);
      ctx.lineTo(dx - 3, y);
      ctx.closePath();
      ctx.fill();

      // Label
      drawBadge(ctx, 'nPOC', chartW - 36, y, DEFAULT_COLORS.nakedPoc);
    }
  }

  // ── Unfinished Auctions ──
  renderUnfinishedAuctions(rc: ReplayRenderContext): void {
    const { ctx, candles, candleW, chartW, chartH, p2y, tickSize } = rc;
    if (candles.length < 2) return;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.levels.size === 0) continue;
      const cx = i * candleW + candleW / 2;

      // Check high — if top level has 0 bid volume (no one selling there)
      const levels = Array.from(c.levels.values()).sort((a, b) => b.price - a.price);
      const topLevel = levels[0];
      const bottomLevel = levels[levels.length - 1];

      // Unfinished at high: bid volume = 0 at the highest level
      if (topLevel && topLevel.bidVolume === 0 && topLevel.askVolume > 0) {
        const y = p2y(topLevel.price);
        if (y >= 0 && y <= chartH) {
          // Triangle marker pointing up
          ctx.fillStyle = `${DEFAULT_COLORS.unfinishedAuction}80`;
          ctx.beginPath();
          ctx.moveTo(cx - 4, y + 2);
          ctx.lineTo(cx + 4, y + 2);
          ctx.lineTo(cx, y - 4);
          ctx.closePath();
          ctx.fill();

          // Extension line
          ctx.strokeStyle = `${DEFAULT_COLORS.unfinishedAuction}40`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(cx + 6, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Unfinished at low: ask volume = 0 at the lowest level
      if (bottomLevel && bottomLevel.askVolume === 0 && bottomLevel.bidVolume > 0) {
        const y = p2y(bottomLevel.price);
        if (y >= 0 && y <= chartH) {
          // Triangle marker pointing down
          ctx.fillStyle = `${DEFAULT_COLORS.unfinishedAuction}80`;
          ctx.beginPath();
          ctx.moveTo(cx - 4, y - 2);
          ctx.lineTo(cx + 4, y - 2);
          ctx.lineTo(cx, y + 4);
          ctx.closePath();
          ctx.fill();

          // Extension line
          ctx.strokeStyle = `${DEFAULT_COLORS.unfinishedAuction}40`;
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(cx + 6, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  /**
   * Render minimap — small overview bar showing all candles with viewport indicator.
   * Drawn at the very bottom of the chart, above time axis.
   */
  renderMinimap(rc: ReplayRenderContext): void {
    const { ctx, allCandles, candles, startIdx, chartW } = rc;
    if (allCandles.length < 2) return;

    const mmH = 24;
    const mmY = rc.h - TIME_AXIS_H - mmH;
    const mmW = chartW;

    // Background
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mmY);
    ctx.lineTo(mmW, mmY);
    ctx.stroke();

    // Find global hi/lo
    let gHi = -Infinity, gLo = Infinity;
    for (const c of allCandles) {
      if (c.high > gHi) gHi = c.high;
      if (c.low < gLo) gLo = c.low;
    }
    const gRange = gHi - gLo || 1;

    // Draw mini candles
    const cw = mmW / allCandles.length;
    for (let i = 0; i < allCandles.length; i++) {
      const c = allCandles[i];
      const x = i * cw;
      const isBull = c.close >= c.open;

      const hY = mmY + ((gHi - c.high) / gRange) * (mmH - 2) + 1;
      const lY = mmY + ((gHi - c.low) / gRange) * (mmH - 2) + 1;

      ctx.strokeStyle = isBull ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
      ctx.lineWidth = Math.max(0.5, Math.min(cw * 0.6, 3));
      ctx.beginPath();
      ctx.moveTo(x + cw / 2, hY);
      ctx.lineTo(x + cw / 2, lY);
      ctx.stroke();
    }

    // Viewport indicator (highlighted region)
    const vStart = (startIdx / allCandles.length) * mmW;
    const vEnd = ((startIdx + candles.length) / allCandles.length) * mmW;

    ctx.fillStyle = 'rgba(16,185,129,0.08)';
    ctx.fillRect(vStart, mmY, vEnd - vStart, mmH);

    ctx.strokeStyle = 'rgba(16,185,129,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vStart, mmY, vEnd - vStart, mmH);

    // Minimap label
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${allCandles.length} candles`, mmW - 4, mmY + 8);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS

// ═══════════════════════════════════════════════════════════════════════════════

function fmtV(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (a >= 1) return v.toFixed(0);
  return v.toFixed(2);
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.font = 'bold 8px monospace';
  const w = ctx.measureText(label).width + 6;
  ctx.fillStyle = `${color}30`;
  ctx.fillRect(x, y - 5, w, 11);
  ctx.fillStyle = `${color}cc`;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 3, y + 3);
}
