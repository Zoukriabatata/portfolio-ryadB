// Phase B / M4 + M4.5 — Canvas2D footprint renderer with pan/zoom,
// crosshair, and session POC.
//
// Render contract:
//   1. caller creates a renderer with a canvas + theme + an
//      interaction-state getter (the React component owns the state
//      ref so the renderer reads the latest scrollX/cellWidth/hover
//      coords on every frame without React rerenders).
//   2. caller calls setBars(bars) when bar data changes, and
//      render() any time it wants a paint (after interaction events,
//      after data changes, on resize).
//   3. caller calls getCellAtPixel(x,y) when it needs the cell under
//      the cursor (e.g. for tooltip text outside the canvas).
//
// The renderer holds no React/DOM state of its own and runs entirely
// from the caller's getter — keeps it portable to Rithmic / replay
// in M5+.

import {
  DEFAULT_LAYOUT,
  type LayoutConfig,
  type RendererBar,
  type RendererPriceLevel,
} from "./types";
import type { FootprintTheme } from "./theme";
import { SENZOUKRIA_DARK } from "./theme";
import {
  DEFAULT_INTERACTION,
  type InteractionState,
} from "./interactions";
import { sessionPOC } from "./valueArea";

/** Subset of the Zustand FootprintSettings that the renderer
 *  actually consumes. The React layer maps the store to this
 *  shape — keeps the renderer decoupled from Zustand. */
export type RendererMagnetMode = "none" | "ohlc" | "poc";
export type RendererVolumeFormat = "raw" | "K" | "M";

export interface FootprintRendererSettings {
  showGrid: boolean;
  showPocSession: boolean;
  showPocBar: boolean;
  showVolumeTooltip: boolean;
  showOhlcHeader: boolean;
  /** When null the renderer uses the inferred / fallback decimals
   *  passed via `setPriceDecimals`. When numeric it overrides. */
  priceDecimalsOverride: number | null;
  volumeFormat: RendererVolumeFormat;
  magnetMode: RendererMagnetMode;
}

export const DEFAULT_RENDERER_SETTINGS: FootprintRendererSettings = {
  showGrid: true,
  showPocSession: true,
  showPocBar: true,
  showVolumeTooltip: true,
  showOhlcHeader: true,
  priceDecimalsOverride: null,
  volumeFormat: "raw",
  magnetMode: "none",
};

export interface RendererOptions {
  theme?: FootprintTheme;
  layout?: Partial<LayoutConfig>;
  /** Called every frame to read the latest pan/zoom/hover state. */
  getInteractionState?: () => InteractionState;
}

interface FrameLayout {
  chartRight: number;
  chartTop: number;
  chartBottom: number;
  rowH: number;
  totalRows: number;
  gridTop: number;
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  cellWidth: number;
  scrollX: number;
  // bars[i].right = mostRecentRightX - (sortedBars.length-1 - i) * cellWidth
  mostRecentRightX: number;
  sortedBars: RendererBar[];
  sessionPocPrice: number | null;
  // Per-cell column widths derived from cellWidth.
  bidW: number;
  ohlcW: number;
  askW: number;
  profileW: number;
}

export class FootprintCanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private theme: FootprintTheme;
  private layout: LayoutConfig;
  private getInteraction: () => InteractionState;

  // Cached state across calls.
  private bars: RendererBar[] = [];
  private priceDecimals = 2;
  private settings: FootprintRendererSettings = { ...DEFAULT_RENDERER_SETTINGS };
  private lastFrame: FrameLayout | null = null;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("FootprintCanvasRenderer: 2D context unavailable");
    }
    this.ctx = ctx;
    this.theme = opts.theme ?? SENZOUKRIA_DARK;
    this.layout = { ...DEFAULT_LAYOUT, ...(opts.layout ?? {}) };
    this.getInteraction =
      opts.getInteractionState ?? (() => DEFAULT_INTERACTION);
    this.dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    this.applySize(canvas, rect.width || 800, rect.height || 400);
  }

  setTheme(theme: FootprintTheme) {
    this.theme = theme;
  }

  setBars(bars: RendererBar[]) {
    this.bars = bars;
  }

  setPriceDecimals(n: number) {
    this.priceDecimals = n;
  }

  /** Push the user-controlled visibility / format / magnet flags
   *  into the renderer. Caller (React layer) ticks a render after
   *  the call so the canvas reflects the new state. */
  setSettings(s: FootprintRendererSettings) {
    this.settings = s;
  }

  /** Effective price decimals — settings override wins, falls back
   *  to whatever `setPriceDecimals` was called with last. */
  private effectivePriceDecimals(): number {
    return this.settings.priceDecimalsOverride ?? this.priceDecimals;
  }

  /** Convenience for one-shot draws. */
  draw(bars: RendererBar[], priceDecimals = 2) {
    this.setBars(bars);
    this.setPriceDecimals(priceDecimals);
    this.render();
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

  /** Visible bar capacity at the current cell width — used by the
   *  React layer to compute scroll bounds in `clampScrollX`. */
  getVisibleBarsCapacity(): number {
    const cellW = this.getInteraction().cellWidth;
    const usable = this.cssWidth - this.layout.priceAxisWidth - this.layout.paddingLeft;
    return Math.max(1, Math.floor(usable / cellW));
  }

  /** Returns the Y geometry the React layer needs to call
   *  `clampScrollY`. Recomputed off the last frame so it reflects
   *  whatever bars are currently mounted. */
  getYExtent(): { totalContentHeight: number; chartHeight: number } {
    const f = this.lastFrame;
    if (!f) {
      return {
        totalContentHeight: 0,
        chartHeight: Math.max(0, this.cssHeight - this.layout.timeAxisHeight - this.layout.paddingTop),
      };
    }
    return {
      totalContentHeight: f.totalRows * f.rowH,
      chartHeight: f.chartBottom - f.chartTop,
    };
  }

  /** Returns the bar + level under the given canvas-relative pixel,
   *  or null when the pointer is outside the chart area or the cell
   *  is empty. Caller must ensure render() ran at least once first. */
  getCellAtPixel(
    x: number,
    y: number,
  ): { bar: RendererBar; level: RendererPriceLevel } | null {
    const f = this.lastFrame;
    if (!f) return null;
    if (x < this.layout.paddingLeft || x > f.chartRight) return null;
    if (y < f.chartTop || y > f.chartBottom) return null;

    // Figure out which bar's rectangle contains x.
    const offsetFromRight = f.mostRecentRightX - x;
    const barFromRight = Math.floor(offsetFromRight / f.cellWidth);
    const idx = f.sortedBars.length - 1 - barFromRight;
    if (idx < 0 || idx >= f.sortedBars.length) return null;
    const bar = f.sortedBars[idx];

    // Snap y to the nearest price row.
    const rowIdx = Math.floor((y - f.gridTop) / f.rowH);
    if (rowIdx < 0 || rowIdx >= f.totalRows) return null;
    const price = f.maxPrice - rowIdx * f.tickSize;

    // O(N) is fine — N is the levels-per-bar count, typically <50.
    const level = bar.levels.find(
      (l) => Math.abs(l.price - price) < f.tickSize / 2,
    );
    if (!level) return null;
    return { bar, level };
  }

  render() {
    const { ctx, cssWidth, cssHeight, theme, layout } = this;

    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (this.bars.length === 0) {
      this.lastFrame = null;
      this.drawEmpty();
      return;
    }

    const frame = this.computeFrame();
    if (!frame) {
      this.lastFrame = null;
      this.drawEmpty();
      return;
    }
    this.lastFrame = frame;

    // Clip bars + grid + POC to the chart area so vertical pan/zoom
    // can't bleed cells over the price/time axis chrome.
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      layout.paddingLeft,
      frame.chartTop,
      frame.chartRight - layout.paddingLeft,
      frame.chartBottom - frame.chartTop,
    );
    ctx.clip();

    // Background grid — only paint rows whose Y lands inside the
    // visible chart area to skip a few thousand offscreen lines
    // when the user is zoomed in tight. Gated by the user-visible
    // showGrid setting.
    if (this.settings.showGrid) {
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r <= frame.totalRows; r += 5) {
        const y = Math.round(frame.gridTop + r * frame.rowH) + 0.5;
        if (y < frame.chartTop || y > frame.chartBottom) continue;
        ctx.moveTo(layout.paddingLeft, y);
        ctx.lineTo(frame.chartRight, y);
      }
      ctx.stroke();
    }

    // Bars (clip-skip if outside the chart viewport).
    for (let i = 0; i < frame.sortedBars.length; i++) {
      const bar = frame.sortedBars[i];
      const rightX =
        frame.mostRecentRightX -
        (frame.sortedBars.length - 1 - i) * frame.cellWidth;
      const leftX = rightX - frame.cellWidth;
      if (rightX < layout.paddingLeft) continue;
      if (leftX > frame.chartRight) continue;
      this.drawBar(bar, leftX, frame);
    }

    // Session POC overlay (drawn after all bars so it sits on top).
    if (this.settings.showPocSession && frame.sessionPocPrice !== null) {
      this.drawSessionPOC(frame);
    }

    ctx.restore();

    this.drawPriceAxis(frame);
    this.drawTimeAxis(frame);

    // Crosshair + tooltips on top of everything except the chrome.
    const interaction = this.getInteraction();
    if (
      interaction.hoverX !== null &&
      interaction.hoverY !== null &&
      !interaction.isDragging
    ) {
      this.drawCrosshair(interaction.hoverX, interaction.hoverY, frame);
    }
  }

  private computeFrame(): FrameLayout | null {
    const interaction = this.getInteraction();
    const { layout, cssWidth, cssHeight, bars } = this;

    const chartRight = cssWidth - layout.priceAxisWidth;
    const chartTop = layout.paddingTop;
    const chartBottom = cssHeight - layout.timeAxisHeight;
    const chartHeight = chartBottom - chartTop;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const bar of bars) {
      if (bar.low < minPrice) minPrice = bar.low;
      if (bar.high > maxPrice) maxPrice = bar.high;
    }
    if (!isFinite(minPrice) || !isFinite(maxPrice)) return null;

    const tickSize = inferTickSize(bars);
    if (tickSize <= 0) return null;

    const totalRows = Math.max(
      1,
      Math.round((maxPrice - minPrice) / tickSize) + 1,
    );

    // M4.6 — Y axis: when the user has zoomed/panned vertically,
    // honour their rowHeight + scrollY exactly. Otherwise stick to
    // the autofit (centered, capped at layout.rowHeight) so a
    // first-render chart fills the viewport sensibly.
    let rowH: number;
    let gridTop: number;
    if (interaction.userOverrodeY) {
      rowH = Math.max(2, interaction.rowHeight);
      gridTop = chartTop - interaction.scrollY;
    } else {
      rowH = Math.max(2, Math.min(layout.rowHeight, chartHeight / totalRows));
      const usedHeight = rowH * totalRows;
      gridTop = chartTop + Math.max(0, (chartHeight - usedHeight) / 2);
    }

    // Cell width comes from interaction state but the on-bar split
    // (bid/ohlc/ask/profile) scales proportionally so wide cells let
    // numbers breathe and narrow cells degrade to color-only.
    const cellWidth = Math.max(8, interaction.cellWidth);
    const bidW = Math.round(cellWidth * 0.36);
    const ohlcW = Math.max(2, Math.round(cellWidth * 0.06));
    const profileW = Math.round(cellWidth * 0.22);
    const askW = Math.max(0, cellWidth - bidW - ohlcW - profileW);

    const sortedBars = [...bars].sort((a, b) => a.timeMs - b.timeMs);
    const mostRecentRightX = chartRight + interaction.scrollX;

    return {
      chartRight,
      chartTop,
      chartBottom,
      rowH,
      totalRows,
      gridTop,
      minPrice,
      maxPrice,
      tickSize,
      cellWidth,
      scrollX: interaction.scrollX,
      mostRecentRightX,
      sortedBars,
      sessionPocPrice: sessionPOC(sortedBars),
      bidW,
      ohlcW,
      askW,
      profileW,
    };
  }

  private drawBar(bar: RendererBar, leftX: number, f: FrameLayout) {
    const { ctx, theme } = this;
    const bidX = leftX;
    const ohlcX = bidX + f.bidW;
    const askX = ohlcX + f.ohlcW;
    const profileX = askX + f.askW;

    const maxVol = Math.max(1, bar.maxLevelVolume ?? 1);
    const showText = f.cellWidth >= 90 && f.rowH >= 9;

    ctx.font = `${theme.cellFontSize}px ${theme.fontFamily}`;
    ctx.textBaseline = "middle";

    for (const level of bar.levels) {
      const y = priceToY(level.price, f);
      const yTop = y - f.rowH / 2;

      if (level.sellVolume > 0) {
        const intensity = Math.min(1, level.sellVolume / maxVol);
        ctx.fillStyle = lerpHeat(theme.sellHeat, intensity);
        ctx.fillRect(bidX, yTop, f.bidW, f.rowH - 0.5);
        if (showText) {
          ctx.fillStyle =
            intensity > 0.55 ? theme.background : theme.textPrimary;
          ctx.textAlign = "right";
          ctx.fillText(this.formatVolume(level.sellVolume), bidX + f.bidW - 4, y);
        }
      }

      if (level.buyVolume > 0) {
        const intensity = Math.min(1, level.buyVolume / maxVol);
        ctx.fillStyle = lerpHeat(theme.buyHeat, intensity);
        ctx.fillRect(askX, yTop, f.askW, f.rowH - 0.5);
        if (showText) {
          ctx.fillStyle =
            intensity > 0.55 ? theme.background : theme.textPrimary;
          ctx.textAlign = "left";
          ctx.fillText(this.formatVolume(level.buyVolume), askX + 4, y);
        }
      }
    }

    // OHLC center column.
    const yHigh = priceToY(bar.high, f) - f.rowH / 2;
    const yLow = priceToY(bar.low, f) + f.rowH / 2;
    const yOpen = priceToY(bar.open, f);
    const yClose = priceToY(bar.close, f);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyBot = Math.max(yOpen, yClose);
    const wickX = ohlcX + f.ohlcW / 2;

    ctx.strokeStyle = theme.textSecondary;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wickX, yHigh);
    ctx.lineTo(wickX, yLow);
    ctx.stroke();

    ctx.fillStyle = bar.totalDelta >= 0 ? theme.buy : theme.sell;
    ctx.fillRect(
      ohlcX + 1,
      bodyTop,
      Math.max(1, f.ohlcW - 2),
      Math.max(1, bodyBot - bodyTop),
    );

    // Per-bar POC marker (cyan thin line). Distinct from session POC
    // (gold thick line, drawn later in drawSessionPOC).
    if (
      this.settings.showPocBar &&
      bar.poc !== undefined &&
      bar.pocVolume &&
      bar.pocVolume > 0
    ) {
      const yPoc = priceToY(bar.poc, f);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bidX, yPoc);
      ctx.lineTo(askX + f.askW, yPoc);
      ctx.stroke();
    }

    // Volume profile column.
    const profileMaxW = Math.max(1, f.profileW - 2);
    for (const level of bar.levels) {
      const total = level.buyVolume + level.sellVolume;
      const w = Math.max(1, (total / maxVol) * profileMaxW);
      const y = priceToY(level.price, f) - f.rowH / 2 + 1;
      const buyW = total > 0 ? (level.buyVolume / total) * w : 0;
      ctx.fillStyle = theme.profileBuy;
      ctx.fillRect(profileX, y, buyW, f.rowH - 2);
      ctx.fillStyle = theme.profileSell;
      ctx.fillRect(profileX + buyW, y, w - buyW, f.rowH - 2);
    }

    // Bar footer with delta sum (shown only when there's room).
    if (showText) {
      ctx.fillStyle = bar.totalDelta >= 0 ? theme.buy : theme.sell;
      ctx.font = `${theme.cellFontSize}px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const yDelta = f.chartBottom - 4;
      const cx = bidX + (f.bidW + f.ohlcW + f.askW) / 2;
      const deltaLabel =
        (bar.totalDelta >= 0 ? "+" : "") +
        Math.round(bar.totalDelta).toString();
      ctx.fillText(deltaLabel, cx, yDelta);
    }

    // M4.7b — OHLC header on top of each bar. Reads the user
    // setting; only drawn when there's enough horizontal room
    // (≥130px per bar) to fit the four numbers without overlap.
    if (this.settings.showOhlcHeader && f.cellWidth >= 130) {
      const decimals = this.effectivePriceDecimals();
      const cx = bidX + (f.bidW + f.ohlcW + f.askW) / 2;
      const yHdr = f.chartTop + 10;
      ctx.fillStyle = theme.textMuted;
      ctx.font = `9px ${theme.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ohlc =
        `O ${bar.open.toFixed(decimals)}  ` +
        `H ${bar.high.toFixed(decimals)}  ` +
        `L ${bar.low.toFixed(decimals)}  ` +
        `C ${bar.close.toFixed(decimals)}`;
      ctx.fillText(ohlc, cx, yHdr);
    }
  }

  private formatVolume(vol: number): string {
    switch (this.settings.volumeFormat) {
      case "K":
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol >= 1 ? Math.round(vol).toString() : vol.toFixed(2);
      case "M":
        if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
        if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
        return vol >= 1 ? Math.round(vol).toString() : vol.toFixed(2);
      case "raw":
      default:
        if (vol >= 1) return Math.round(vol).toString();
        return vol.toFixed(2);
    }
  }

  private drawSessionPOC(f: FrameLayout) {
    if (f.sessionPocPrice === null) return;
    const { ctx, theme, layout } = this;
    const y = priceToY(f.sessionPocPrice, f);
    ctx.strokeStyle = theme.poc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(layout.paddingLeft, y);
    ctx.lineTo(f.chartRight, y);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  private drawPriceAxis(f: FrameLayout) {
    const { ctx, theme, layout } = this;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(f.chartRight, 0, layout.priceAxisWidth, this.cssHeight);
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(f.chartRight + 0.5, 0);
    ctx.lineTo(f.chartRight + 0.5, this.cssHeight);
    ctx.stroke();

    ctx.fillStyle = theme.textSecondary;
    ctx.font = `${theme.priceFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let r = 0; r <= f.totalRows; r += 5) {
      const price = f.maxPrice - r * f.tickSize;
      const y = f.gridTop + r * f.rowH;
      // Skip labels whose row centre is outside the chart area —
      // happens after Y pan/zoom and would otherwise overlap the
      // time axis chrome.
      if (y < f.chartTop || y > f.chartBottom) continue;
      ctx.fillText(price.toFixed(this.effectivePriceDecimals()), f.chartRight + 6, y);
    }
  }

  private drawTimeAxis(f: FrameLayout) {
    const { ctx, theme, layout } = this;
    const axisY = this.cssHeight - layout.timeAxisHeight;
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, axisY, f.chartRight, layout.timeAxisHeight);
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(0, axisY + 0.5);
    ctx.lineTo(f.chartRight, axisY + 0.5);
    ctx.stroke();

    ctx.fillStyle = theme.textMuted;
    ctx.font = `${theme.priceFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Label every Nth bar to avoid overlap. N depends on cell width.
    const stride = f.cellWidth >= 110 ? 2 : f.cellWidth >= 70 ? 4 : 6;
    for (let i = 0; i < f.sortedBars.length; i += stride) {
      const bar = f.sortedBars[i];
      const rightX =
        f.mostRecentRightX -
        (f.sortedBars.length - 1 - i) * f.cellWidth;
      const cx = rightX - f.cellWidth / 2;
      if (cx < layout.paddingLeft || cx > f.chartRight) continue;
      const date = new Date(bar.timeMs);
      const label = date.toLocaleTimeString("fr-FR", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      ctx.fillText(label, cx, axisY + layout.timeAxisHeight / 2);
    }
  }

  private drawCrosshair(hx: number, hy: number, f: FrameLayout) {
    const { ctx, theme, layout } = this;
    if (hx < layout.paddingLeft || hx > f.chartRight) return;
    if (hy < f.chartTop || hy > f.chartBottom) return;

    // Default snap = nearest row floor.
    const rowIdx = Math.max(
      0,
      Math.min(f.totalRows - 1, Math.floor((hy - f.gridTop) / f.rowH)),
    );
    let snappedY = f.gridTop + rowIdx * f.rowH + f.rowH / 2;
    let snappedPrice = f.maxPrice - rowIdx * f.tickSize;
    let snapPrefix = "";

    // M4.7b — magnet snap. Override the default row-floor snap when
    // the user is in OHLC or POC mode AND a candidate target lies
    // within the magnet radius of the cursor.
    if (this.settings.magnetMode !== "none") {
      const magnet = this.computeMagnetSnap(hx, hy, f);
      if (magnet !== null) {
        snappedY = magnet.y;
        snappedPrice = magnet.price;
        snapPrefix = magnet.prefix;
      }
    }

    // After M4.6 Y pan/zoom, the snapped row can map outside the
    // visible chart area. Suppress the horizontal line + price tag
    // in that case — showing a price the user can't see is worse
    // than not showing one.
    const horizontalVisible =
      snappedY >= f.chartTop && snappedY <= f.chartBottom;

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, f.chartTop);
    ctx.lineTo(Math.round(hx) + 0.5, f.chartBottom);
    if (horizontalVisible) {
      ctx.moveTo(layout.paddingLeft, snappedY);
      ctx.lineTo(f.chartRight, snappedY);
    }
    ctx.stroke();
    ctx.restore();

    // Price tag on the right axis (only when its row is on screen).
    if (horizontalVisible) {
      const priceText = snappedPrice.toFixed(this.effectivePriceDecimals());
      const priceLabel = snapPrefix
        ? `${snapPrefix} ${priceText}`
        : priceText;
      ctx.font = `${theme.priceFontSize}px ${theme.fontFamily}`;
      const tagW = Math.max(48, ctx.measureText(priceLabel).width + 12);
      const tagH = 16;
      const tagX = f.chartRight + 1;
      const tagY = snappedY - tagH / 2;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(tagX, tagY, tagW, tagH);
      ctx.strokeStyle = theme.poc;
      ctx.strokeRect(tagX + 0.5, tagY + 0.5, tagW - 1, tagH - 1);
      ctx.fillStyle = "#fbbf24";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(priceLabel, tagX + 6, snappedY);
    }

    // Volume tooltip near cursor when there's a cell under it.
    // Gated by the user setting — pure visual noise to some users.
    const cell = this.settings.showVolumeTooltip
      ? this.getCellAtPixel(hx, hy)
      : null;
    if (cell) {
      const buy = cell.level.buyVolume;
      const sell = cell.level.sellVolume;
      const delta = buy - sell;
      const lines = [
        `bid ${this.formatVolume(sell)}`,
        `ask ${this.formatVolume(buy)}`,
        `Δ ${delta >= 0 ? "+" : ""}${Math.round(delta)}`,
      ];
      const padX = 8;
      const padY = 6;
      const lineH = 13;
      ctx.font = `${theme.cellFontSize}px ${theme.fontFamily}`;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      const h = lines.length * lineH + padY * 2;
      let tx = hx + 14;
      let ty = hy + 14;
      // Flip the tooltip if it'd run off the chart edges.
      if (tx + w > f.chartRight) tx = hx - w - 14;
      if (ty + h > f.chartBottom) ty = hy - h - 14;
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.fillRect(tx, ty, w, h);
      ctx.strokeStyle = "#334155";
      ctx.strokeRect(tx + 0.5, ty + 0.5, w - 1, h - 1);
      ctx.fillStyle = theme.textPrimary;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], tx + padX, ty + padY + i * lineH);
      }
    }
  }

  /** Compute the magnet snap target near (hx, hy). Returns null
   *  when no candidate is within the magnet radius — the caller
   *  falls back to row-floor snap. */
  private computeMagnetSnap(
    hx: number,
    hy: number,
    f: FrameLayout,
  ): { y: number; price: number; prefix: string } | null {
    if (this.settings.magnetMode === "ohlc") {
      // OHLC magnet needs the bar under the cursor X column.
      const bar = this.getBarAtX(hx, f);
      if (!bar) return null;
      const candidates: { price: number; prefix: string }[] = [
        { price: bar.open, prefix: "O" },
        { price: bar.high, prefix: "H" },
        { price: bar.low, prefix: "L" },
        { price: bar.close, prefix: "C" },
      ];
      let best: { y: number; price: number; prefix: string } | null = null;
      let bestDist = Infinity;
      for (const c of candidates) {
        const y = priceToY(c.price, f);
        const d = Math.abs(y - hy);
        if (d < bestDist) {
          best = { y, price: c.price, prefix: c.prefix };
          bestDist = d;
        }
      }
      // 20px is wide enough to feel sticky, narrow enough that a
      // user who moves between OHLC points still gets free
      // crosshair in the middle of a bar.
      return best && bestDist <= 20 ? best : null;
    }

    if (this.settings.magnetMode === "poc") {
      if (f.sessionPocPrice === null) return null;
      const y = priceToY(f.sessionPocPrice, f);
      if (Math.abs(y - hy) > 30) return null;
      return { y, price: f.sessionPocPrice, prefix: "POC" };
    }

    return null;
  }

  /** Find the bar whose horizontal slot contains x. Returns null
   *  when x is outside the bar grid or no frame has rendered yet. */
  private getBarAtX(x: number, f: FrameLayout): RendererBar | null {
    if (x < this.layout.paddingLeft || x > f.chartRight) return null;
    const offsetFromRight = f.mostRecentRightX - x;
    const barFromRight = Math.floor(offsetFromRight / f.cellWidth);
    const idx = f.sortedBars.length - 1 - barFromRight;
    if (idx < 0 || idx >= f.sortedBars.length) return null;
    return f.sortedBars[idx];
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

function priceToY(price: number, f: FrameLayout): number {
  const idx = Math.round((f.maxPrice - price) / f.tickSize);
  return f.gridTop + idx * f.rowH + f.rowH / 2;
}

function inferTickSize(bars: RendererBar[]): number {
  let smallest = Infinity;
  for (const bar of bars) {
    const sorted = bar.levels.map((l) => l.price).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > 0 && gap < smallest) smallest = gap;
    }
  }
  if (!isFinite(smallest)) return 0.1;
  return smallest;
}

function lerpHeat(ramp: [string, string, string], t: number): string {
  if (t < 0.33) return ramp[0];
  if (t < 0.66) return ramp[1];
  return ramp[2];
}

