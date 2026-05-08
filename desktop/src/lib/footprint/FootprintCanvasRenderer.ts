// Phase B / M4 — slim Canvas2D footprint renderer with the
// Senzoukria theme. Mirrors the column layout of the web renderer
// (bid · ohlc · ask · profile per bar) but ships under 500 LOC and
// has no external deps beyond the theme module.
//
// Render contract:
//   1. caller creates a renderer with a canvas + theme
//   2. on every frame (or whenever bars change) caller invokes
//      `renderer.draw(bars, priceDecimals?)`
//   3. renderer auto-handles DPR scaling on `resize(width, height)`
//
// The renderer is purely imperative — no internal animation loop,
// no React state. The React wrapper (`<FootprintCanvas/>`) decides
// when to call `draw()`.

import {
  DEFAULT_LAYOUT,
  barTotalWidth,
  type LayoutConfig,
  type RendererBar,
} from "./types";
import type { FootprintTheme } from "./theme";
import { SENZOUKRIA_DARK } from "./theme";

export interface RendererOptions {
  theme?: FootprintTheme;
  layout?: Partial<LayoutConfig>;
}

export class FootprintCanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private theme: FootprintTheme;
  private layout: LayoutConfig;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("FootprintCanvasRenderer: 2D context unavailable");
    }
    this.ctx = ctx;
    this.theme = opts.theme ?? SENZOUKRIA_DARK;
    this.layout = { ...DEFAULT_LAYOUT, ...(opts.layout ?? {}) };
    this.dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    this.applySize(canvas, rect.width || 800, rect.height || 400);
  }

  setTheme(theme: FootprintTheme) {
    this.theme = theme;
  }

  resize(width: number, height: number) {
    const canvas = this.ctx.canvas;
    this.applySize(canvas, width, height);
  }

  private applySize(canvas: HTMLCanvasElement, width: number, height: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = width;
    this.cssHeight = height;
    canvas.width = Math.max(1, Math.floor(width * this.dpr));
    canvas.height = Math.max(1, Math.floor(height * this.dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(bars: RendererBar[], priceDecimals = 2) {
    const { ctx, cssWidth, cssHeight, theme, layout } = this;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (bars.length === 0) {
      this.drawEmpty();
      return;
    }

    const barW = barTotalWidth(layout);
    const stepX = barW + layout.barGap;

    // Right edge of the chart area = canvas - price axis.
    const chartRight = cssWidth - layout.priceAxisWidth;
    const chartTop = layout.paddingTop;
    const chartBottom = cssHeight - layout.timeAxisHeight;
    const chartHeight = chartBottom - chartTop;

    // Compute global price range across all visible bars so all bars
    // share the same Y axis. Drop bars whose levels fall outside the
    // chart height — that limits per-bar zoom but keeps the layout
    // aligned across the whole canvas, which is what footprint
    // traders expect.
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const bar of bars) {
      if (bar.low < minPrice) minPrice = bar.low;
      if (bar.high > maxPrice) maxPrice = bar.high;
    }
    if (!isFinite(minPrice) || !isFinite(maxPrice)) {
      this.drawEmpty();
      return;
    }

    // Tick spacing inferred from the densest bar's level grid. Every
    // bar shares the same tick (engine groups by rounded price), so
    // any non-empty bar yields a valid value.
    const tickSize = inferTickSize(bars);
    if (tickSize <= 0) {
      this.drawEmpty();
      return;
    }

    // How many price rows fit into the chart height? If too many,
    // the Y axis will compress — that's intentional, the alternative
    // (scrolling) doesn't fit a single-screen overview.
    const totalRows = Math.max(
      1,
      Math.round((maxPrice - minPrice) / tickSize) + 1,
    );
    const rowH = Math.max(2, Math.min(layout.rowHeight, chartHeight / totalRows));
    const usedHeight = rowH * totalRows;
    // Center the price grid vertically when the chart is taller than
    // the rows need.
    const gridTop = chartTop + Math.max(0, (chartHeight - usedHeight) / 2);

    const priceToY = (price: number): number => {
      const idx = Math.round((maxPrice - price) / tickSize);
      return gridTop + idx * rowH + rowH / 2;
    };

    // Bars are right-anchored: the most recent bar sits flush
    // against the price axis, older bars stack to the left.
    const sortedBars = [...bars].sort((a, b) => a.timeMs - b.timeMs);
    const visibleN = Math.min(
      sortedBars.length,
      Math.floor((chartRight - layout.paddingLeft) / stepX),
    );
    const startIdx = sortedBars.length - visibleN;

    // Background grid (faint horizontal lines every 5 rows).
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r <= totalRows; r += 5) {
      const y = Math.round(gridTop + r * rowH) + 0.5;
      ctx.moveTo(layout.paddingLeft, y);
      ctx.lineTo(chartRight, y);
    }
    ctx.stroke();

    for (let i = 0; i < visibleN; i++) {
      const bar = sortedBars[startIdx + i];
      const x = chartRight - (visibleN - i) * stepX;
      this.drawBar(bar, x, gridTop, rowH, priceToY);
    }

    // Axes painted last so they sit on top.
    this.drawPriceAxis(
      maxPrice,
      tickSize,
      totalRows,
      gridTop,
      rowH,
      chartRight,
      priceDecimals,
    );
    this.drawTimeAxis(
      sortedBars.slice(startIdx, startIdx + visibleN),
      chartRight,
      cssHeight,
      stepX,
      visibleN,
    );
  }

  private drawBar(
    bar: RendererBar,
    x: number,
    gridTop: number,
    rowH: number,
    priceToY: (p: number) => number,
  ) {
    const { ctx, theme, layout } = this;
    const bidX = x;
    const ohlcX = bidX + layout.bidWidth;
    const askX = ohlcX + layout.ohlcWidth;
    const profileX = askX + layout.askWidth;

    const maxVol = Math.max(1, bar.maxLevelVolume ?? 1);

    // Cells: one row per level. Buy on the right (ask) col, sell on
    // the left (bid) col, both aligned to the same Y so the eye can
    // read the imbalance horizontally.
    ctx.font = `${theme.cellFontSize}px ${theme.fontFamily}`;
    ctx.textBaseline = "middle";
    for (const level of bar.levels) {
      const y = priceToY(level.price);
      const yTop = y - rowH / 2;

      // Bid (sell aggressors) cell — left side.
      if (level.sellVolume > 0) {
        const intensity = Math.min(1, level.sellVolume / maxVol);
        ctx.fillStyle = lerpHeat(theme.sellHeat, intensity);
        ctx.fillRect(bidX, yTop, layout.bidWidth, rowH - 0.5);
        if (rowH >= 9) {
          ctx.fillStyle =
            intensity > 0.55 ? theme.background : theme.textPrimary;
          ctx.textAlign = "right";
          ctx.fillText(
            formatVol(level.sellVolume),
            bidX + layout.bidWidth - 4,
            y,
          );
        }
      }

      // Ask (buy aggressors) cell — right side.
      if (level.buyVolume > 0) {
        const intensity = Math.min(1, level.buyVolume / maxVol);
        ctx.fillStyle = lerpHeat(theme.buyHeat, intensity);
        ctx.fillRect(askX, yTop, layout.askWidth, rowH - 0.5);
        if (rowH >= 9) {
          ctx.fillStyle =
            intensity > 0.55 ? theme.background : theme.textPrimary;
          ctx.textAlign = "left";
          ctx.fillText(formatVol(level.buyVolume), askX + 4, y);
        }
      }
    }

    // OHLC outline in the centre column (open/close as ticks, body
    // shaded by delta sign).
    const yHigh = priceToY(bar.high) - rowH / 2;
    const yLow = priceToY(bar.low) + rowH / 2;
    const yOpen = priceToY(bar.open);
    const yClose = priceToY(bar.close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyBot = Math.max(yOpen, yClose);
    const wickX = ohlcX + layout.ohlcWidth / 2;

    ctx.strokeStyle = theme.textSecondary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wickX, yHigh);
    ctx.lineTo(wickX, yLow);
    ctx.stroke();

    ctx.fillStyle =
      bar.totalDelta >= 0 ? theme.buy : theme.sell;
    ctx.fillRect(
      ohlcX + 1,
      bodyTop,
      layout.ohlcWidth - 2,
      Math.max(1, bodyBot - bodyTop),
    );

    // POC marker (yellow tick on the highest-volume row).
    if (bar.poc !== undefined && bar.pocVolume && bar.pocVolume > 0) {
      const yPoc = priceToY(bar.poc);
      ctx.strokeStyle = theme.poc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bidX, yPoc);
      ctx.lineTo(askX + layout.askWidth, yPoc);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Volume profile column on the right of the bar — single bar
    // showing total volume per price as a horizontal line.
    const profileMaxW = layout.profileWidth - 2;
    for (const level of bar.levels) {
      const total = level.buyVolume + level.sellVolume;
      const w = Math.max(1, (total / maxVol) * profileMaxW);
      const y = priceToY(level.price) - rowH / 2 + 1;
      const buyW = total > 0 ? (level.buyVolume / total) * w : 0;
      ctx.fillStyle = theme.profileBuy;
      ctx.fillRect(profileX, y, buyW, rowH - 2);
      ctx.fillStyle = theme.profileSell;
      ctx.fillRect(profileX + buyW, y, w - buyW, rowH - 2);
    }

    // Bar separator + footer with delta + total.
    ctx.fillStyle =
      bar.totalDelta >= 0 ? theme.buy : theme.sell;
    ctx.font = `${theme.cellFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const yDelta =
      gridTop +
      Math.max(0, this.cssHeight - this.layout.timeAxisHeight - gridTop) -
      4;
    if (yDelta > gridTop) {
      const deltaLabel =
        (bar.totalDelta >= 0 ? "+" : "") +
        Math.round(bar.totalDelta).toString();
      ctx.fillText(
        deltaLabel,
        bidX + (layout.bidWidth + layout.ohlcWidth + layout.askWidth) / 2,
        yDelta,
      );
    }
  }

  private drawPriceAxis(
    maxPrice: number,
    tickSize: number,
    totalRows: number,
    gridTop: number,
    rowH: number,
    chartRight: number,
    priceDecimals: number,
  ) {
    const { ctx, theme, layout } = this;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(chartRight, 0, layout.priceAxisWidth, this.cssHeight);
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(chartRight + 0.5, 0);
    ctx.lineTo(chartRight + 0.5, this.cssHeight);
    ctx.stroke();

    ctx.fillStyle = theme.textSecondary;
    ctx.font = `${theme.priceFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    // Label every 5th row to avoid cramming.
    for (let r = 0; r <= totalRows; r += 5) {
      const price = maxPrice - r * tickSize;
      const y = gridTop + r * rowH;
      ctx.fillText(price.toFixed(priceDecimals), chartRight + 6, y);
    }
  }

  private drawTimeAxis(
    visibleBars: RendererBar[],
    chartRight: number,
    canvasHeight: number,
    stepX: number,
    visibleN: number,
  ) {
    const { ctx, theme, layout } = this;
    const axisY = canvasHeight - layout.timeAxisHeight;

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, axisY, chartRight, layout.timeAxisHeight);
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(0, axisY + 0.5);
    ctx.lineTo(chartRight, axisY + 0.5);
    ctx.stroke();

    ctx.fillStyle = theme.textMuted;
    ctx.font = `${theme.priceFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Label every 4th bar to avoid overlap.
    for (let i = 0; i < visibleN; i += 4) {
      const bar = visibleBars[i];
      if (!bar) continue;
      const x = chartRight - (visibleN - i) * stepX + barTotalWidth(layout) / 2;
      const date = new Date(bar.timeMs);
      const label =
        date.toLocaleTimeString("fr-FR", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      ctx.fillText(label, x, axisY + layout.timeAxisHeight / 2);
    }
  }

  private drawEmpty() {
    const { ctx, theme, cssWidth, cssHeight } = this;
    ctx.fillStyle = theme.textMuted;
    ctx.font = `${theme.headerFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Waiting for ticks…", cssWidth / 2, cssHeight / 2);
  }
}

function inferTickSize(bars: RendererBar[]): number {
  // Find the smallest non-zero gap between consecutive level prices
  // across all visible bars. The footprint engine groups by rounded
  // price so this is the engine's tick size.
  let smallest = Infinity;
  for (const bar of bars) {
    const sorted = bar.levels.map((l) => l.price).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > 0 && gap < smallest) smallest = gap;
    }
  }
  if (!isFinite(smallest)) return 0.10; // crypto-friendly default
  return smallest;
}

function lerpHeat(ramp: [string, string, string], t: number): string {
  // Discrete lookup is fine — the eye doesn't see a 3-step gradient
  // as banded once the cells are <14px tall.
  if (t < 0.33) return ramp[0];
  if (t < 0.66) return ramp[1];
  return ramp[2];
}

function formatVol(vol: number): string {
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`;
  if (vol >= 1) return Math.round(vol).toString();
  return vol.toFixed(2);
}
