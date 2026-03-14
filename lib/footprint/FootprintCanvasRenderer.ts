/**
 * FOOTPRINT CANVAS RENDERER — Modular, cached rendering engine
 *
 * Extracted from FootprintChartPro's monolithic renderCanvas (~1700 lines)
 * into a class with:
 * - Dirty flags (viewport, data, crosshair, tools, settings)
 * - Cached computations (deltaByPrice, volumeByPrice, session stats)
 * - Single-pass cell rendering (merged bars + text)
 * - String formatting cache
 * - FPS tracking
 */

import type { FootprintCandle, PriceLevel } from '@/lib/orderflow/OrderflowEngine';
import type { LayoutMetrics } from '@/lib/orderflow/FootprintLayoutEngine';
import { FootprintLayoutEngine } from '@/lib/orderflow/FootprintLayoutEngine';
import type {
  FootprintColors,
  FootprintFonts,
  FootprintFeatures,
  PassiveLiquiditySettings,
} from '@/stores/useFootprintSettingsStore';
import type { LODState } from '@/lib/rendering';
import type { RenderContext } from '@/lib/tools/ToolsRenderer';
import { catmullRomSpline } from '@/lib/indicators/VwapTwap';

// ============ TYPES ============

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  candles: FootprintCandle[];
  metrics: LayoutMetrics;
  layout: FootprintLayoutEngine;
  colors: FootprintColors;
  fonts: FootprintFonts;
  features: FootprintFeatures;
  lod: LODState;
  zoom: number;
  rowH: number;
  fpWidth: number;
  ohlcWidth: number;
  tickSize: number;
  isFootprintMode: boolean;
}

export interface SessionStats {
  pocPrice: number;
  pocVolume: number;
  vah: number;
  val: number;
  totalVolume: number;
  totalDelta: number;
  valueAreaPrices: Set<number>;
}

type DirtyFlag = 'viewport' | 'data' | 'crosshair' | 'tools' | 'settings';

// ============ CACHES ============

interface ProfileCaches {
  deltaByPrice: Map<number, number>;
  maxDelta: number;
  volumeByPrice: Map<number, { total: number; bid: number; ask: number }>;
  maxVolume: number;
  sessionStats: SessionStats;
}

// ============ RENDERER CLASS ============

export class FootprintCanvasRenderer {
  // Dirty flags — skip recalculation when nothing changed
  private dirtyFlags: Record<DirtyFlag, boolean> = {
    viewport: true,
    data: true,
    crosshair: true,
    tools: true,
    settings: true,
  };

  // Cached profile computations (expensive, rebuilt only when data changes)
  private profileCaches: ProfileCaches | null = null;
  private cachedCandleCount = 0;
  private cachedCandleTime = 0; // last candle timestamp for invalidation

  // String formatting cache — avoids allocations every frame
  private volStringCache = new Map<string, string>();
  private volCacheHits = 0;
  private volCacheMisses = 0;

  // FPS tracking
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private _currentFps = 0;
  private _lastRenderMs = 0;

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  markDirty(flag: DirtyFlag): void {
    this.dirtyFlags[flag] = true;
  }

  markAllDirty(): void {
    this.dirtyFlags.viewport = true;
    this.dirtyFlags.data = true;
    this.dirtyFlags.crosshair = true;
    this.dirtyFlags.tools = true;
    this.dirtyFlags.settings = true;
  }

  get currentFps(): number {
    return this._currentFps;
  }

  get lastRenderMs(): number {
    return this._lastRenderMs;
  }

  /**
   * Invalidate profile caches (call when candles change)
   */
  invalidateData(): void {
    this.dirtyFlags.data = true;
    this.profileCaches = null;
  }

  /**
   * Clear string cache periodically to avoid unbounded growth
   */
  clearStringCache(): void {
    if (this.volStringCache.size > 5000) {
      this.volStringCache.clear();
      this.volCacheHits = 0;
      this.volCacheMisses = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CACHED COMPUTATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get or compute profile caches (deltaByPrice, volumeByPrice, session stats)
   * Only recomputed when candle data actually changes
   */
  getProfileCaches(candles: FootprintCandle[], metrics: LayoutMetrics): ProfileCaches {
    const lastCandle = candles[candles.length - 1];
    const newCandleTime = lastCandle?.time ?? 0;
    const newCandleCount = metrics.visibleCandles.length;

    // Check if we can reuse cached data
    if (
      this.profileCaches &&
      !this.dirtyFlags.data &&
      this.cachedCandleCount === newCandleCount &&
      this.cachedCandleTime === newCandleTime
    ) {
      return this.profileCaches;
    }

    // Recompute — single pass over all visible candles
    const deltaByPrice = new Map<number, number>();
    const volumeByPrice = new Map<number, { total: number; bid: number; ask: number }>();
    let maxDelta = 1;
    let maxVolume = 1;
    let pocPrice = 0;
    let pocVolume = 0;
    let totalVolume = 0;
    let totalDelta = 0;

    for (const candle of metrics.visibleCandles) {
      totalDelta += candle.totalDelta;

      candle.levels.forEach((level, price) => {
        // Delta profile
        const currentDelta = deltaByPrice.get(price) || 0;
        const newDelta = currentDelta + level.delta;
        deltaByPrice.set(price, newDelta);
        maxDelta = Math.max(maxDelta, Math.abs(newDelta));

        // Volume profile
        const currentVol = volumeByPrice.get(price) || { total: 0, bid: 0, ask: 0 };
        currentVol.total += level.totalVolume;
        currentVol.bid += level.bidVolume;
        currentVol.ask += level.askVolume;
        volumeByPrice.set(price, currentVol);

        if (currentVol.total > maxVolume) {
          maxVolume = currentVol.total;
        }
        if (currentVol.total > pocVolume) {
          pocVolume = currentVol.total;
          pocPrice = price;
        }
        totalVolume += level.totalVolume;
      });
    }

    // Calculate VAH/VAL (70% value area)
    const sortedPrices = Array.from(volumeByPrice.entries())
      .sort((a, b) => b[1].total - a[1].total);
    const targetVolume = totalVolume * 0.7;
    let accumulatedVolume = 0;
    const valueAreaPrices = new Set<number>();

    for (const [price, data] of sortedPrices) {
      valueAreaPrices.add(price);
      accumulatedVolume += data.total;
      if (accumulatedVolume >= targetVolume) break;
    }

    const valueAreaArray = Array.from(valueAreaPrices);
    const vah = valueAreaArray.length > 0 ? Math.max(...valueAreaArray) : 0;
    const val = valueAreaArray.length > 0 ? Math.min(...valueAreaArray) : 0;

    this.profileCaches = {
      deltaByPrice,
      maxDelta,
      volumeByPrice,
      maxVolume,
      sessionStats: { pocPrice, pocVolume, vah, val, totalVolume, totalDelta, valueAreaPrices },
    };
    this.cachedCandleCount = newCandleCount;
    this.cachedCandleTime = newCandleTime;
    this.dirtyFlags.data = false;

    return this.profileCaches;
  }

  // ═══════════════════════════════════════════════════════════════
  // STRING FORMATTING (CACHED)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cached version of formatVolATAS — avoids string allocations per frame
   */
  formatVolCached(vol: number, zoom: number): string {
    // Skip caching for very small values
    if (Math.abs(vol) < 1) return '';

    // Use rounded vol as key (avoid floating point precision issues)
    const rounded = Math.round(vol);
    const zoomBucket = zoom < 0.5 ? 0 : zoom < 0.8 ? 1 : zoom < 1.2 ? 2 : 3;
    const key = `${rounded}:${zoomBucket}`;

    const cached = this.volStringCache.get(key);
    if (cached !== undefined) {
      this.volCacheHits++;
      return cached;
    }

    this.volCacheMisses++;
    const result = formatVolATAS(vol, zoom);
    this.volStringCache.set(key, result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // SUB-RENDERERS
  // ═══════════════════════════════════════════════════════════════

  renderBackground(ctx: CanvasRenderingContext2D, width: number, height: number, bgColor: string): void {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  renderGrid(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    tickSize: number,
    width: number,
  ): void {
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = colors.gridOpacity;

    const gridLevels = layout.getVisiblePriceLevels(metrics, tickSize);
    const { footprintAreaY, footprintAreaHeight } = metrics;

    for (const price of gridLevels) {
      const y = layout.priceToY(price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Render footprint candles — SINGLE PASS (bars + text merged)
   * Previously was two separate forEach loops over candle.levels
   */
  renderFootprintCandles(params: RenderParams): void {
    const { ctx, layout, metrics, colors, fonts, features, zoom, rowH, fpWidth, ohlcWidth } = params;
    const { footprintAreaY, footprintAreaHeight } = metrics;

    // Dynamic font scaling with zoom (Phase 2)
    const baseFontSize = fonts.volumeFontSize || 10;
    const fontSize = Math.max(7, Math.min(14, Math.round(baseFontSize * zoom * 0.9)));
    const fontFamily = fonts.volumeFont || '"Consolas", "Monaco", "Courier New", monospace';
    const boldPrefix = fonts.volumeFontBold ? 'bold ' : '';
    const monoFont = `${boldPrefix}${fontSize}px ${fontFamily}`;
    const boldMonoFont = `bold ${fontSize}px ${fontFamily}`;

    // Heatmap gradient LUT (cold → hot: transparent → blue → cyan → yellow → white)
    const heatmapEnabled = features.showHeatmapCells ?? false;
    const heatmapIntensity = features.heatmapIntensity ?? 0.4;

    // Large trade highlight settings
    const largeTradeEnabled = features.showLargeTradeHighlight ?? false;
    const largeTradeMultiplier = features.largeTradeMultiplier ?? 2.0;
    const largeTradeColor = features.largeTradeColor ?? '#ffd700';

    metrics.visibleCandles.forEach((candle, idx) => {
      const fpX = layout.getFootprintX(idx, metrics);

      // === OHLC CANDLE (thin candle on left) ===
      if (features.showOHLC) {
        this.renderOHLCCandle(ctx, layout, metrics, colors, candle, fpX, ohlcWidth);
      }

      // === FOOTPRINT CELLS — SINGLE PASS (bars + text combined) ===
      // Skip entirely for OHLC-only candles (skeleton mode — no real tick data)
      if (candle.levels.size === 0) return;

      const cellStartX = fpX + (features.showOHLC ? ohlcWidth : 0);
      const centerX = cellStartX + fpWidth / 2;
      const isBullish = candle.close >= candle.open;

      // Container
      const containerX = cellStartX + 2;
      const containerW = fpWidth - 4;
      const containerTop = layout.priceToY(candle.high, metrics) - rowH / 2;
      const containerBottom = layout.priceToY(candle.low, metrics) + rowH / 2;
      const containerH = containerBottom - containerTop;

      // Container background
      const containerOpacity = colors.footprintContainerOpacity ?? 0.03;
      ctx.fillStyle = isBullish ? colors.deltaPositive : colors.deltaNegative;
      ctx.globalAlpha = containerOpacity;
      ctx.fillRect(containerX, containerTop, containerW, containerH);
      ctx.globalAlpha = 1;

      // Container border
      ctx.strokeStyle = isBullish ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(containerX, containerTop, containerW, containerH);

      // Left color indicator bar
      ctx.fillStyle = isBullish ? colors.deltaPositive : colors.deltaNegative;
      ctx.fillRect(containerX, containerTop, 2, containerH);

      // Max level volume for normalization + avg for large trade detection
      let maxLevelVol = 1;
      let totalLevelVol = 0;
      let levelCount = 0;
      candle.levels.forEach(level => {
        const totalVol = level.bidVolume + level.askVolume;
        maxLevelVol = Math.max(maxLevelVol, level.bidVolume, level.askVolume);
        totalLevelVol += totalVol;
        levelCount++;
      });
      const avgLevelVol = levelCount > 0 ? totalLevelVol / levelCount : 1;

      const barMaxW = (fpWidth / 2) - 8;

      // ═══════════════════════════════════════════════════════════════
      // SINGLE PASS: heatmap + bars + POC + large trade + text
      // ═══════════════════════════════════════════════════════════════
      // Volume filter settings
      const volFilterThreshold = features.volumeFilterThreshold ?? 0;
      const volFilterMode = features.volumeFilterMode ?? 'relative';

      candle.levels.forEach((level, price) => {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY - rowH || y > footprintAreaY + footprintAreaHeight + rowH) return;

        // Volume filter: skip low-volume levels
        if (volFilterThreshold > 0) {
          const levelVol = level.bidVolume + level.askVolume;
          const threshold = volFilterMode === 'relative'
            ? maxLevelVol * (volFilterThreshold / 100)
            : volFilterThreshold;
          if (levelVol < threshold) return;
        }

        const cellY = y - rowH / 2;
        const barH = rowH - 2;
        const isPOC = price === candle.poc;
        const textY = y + fontSize / 3;
        const totalVol = level.bidVolume + level.askVolume;

        // ─── LAYER 0: Heatmap cell background (Phase 2) ───
        if (heatmapEnabled && totalVol > 0) {
          const intensity = Math.min(1, totalVol / maxLevelVol);
          const heatColor = this.getHeatmapColor(intensity);
          ctx.fillStyle = heatColor;
          ctx.globalAlpha = intensity * heatmapIntensity;
          ctx.fillRect(cellStartX + 2, cellY + 1, fpWidth - 4, rowH - 2);
          ctx.globalAlpha = 1;
        }

        // ─── LAYER 1: Delta bars ───
        const clusterMode = features.clusterDisplayMode ?? 'bid-ask';
        if (clusterMode === 'bid-ask' || clusterMode === 'bid-ask-split') {
          // Two-sided bars (bid left, ask right)
          if (level.bidVolume > 0) {
            const intensity = level.bidVolume / maxLevelVol;
            const bidW = intensity * barMaxW;
            ctx.fillStyle = colors.bidColor;
            ctx.globalAlpha = 0.15 + intensity * 0.25;
            ctx.fillRect(centerX - 2 - bidW, cellY + 1, bidW, barH);
            ctx.globalAlpha = 1;
          }
          if (level.askVolume > 0) {
            const intensity = level.askVolume / maxLevelVol;
            const askW = intensity * barMaxW;
            ctx.fillStyle = colors.askColor;
            ctx.globalAlpha = 0.15 + intensity * 0.25;
            ctx.fillRect(centerX + 2, cellY + 1, askW, barH);
            ctx.globalAlpha = 1;
          }
        } else if (clusterMode === 'delta') {
          // Single centered bar colored by delta direction
          const delta = level.askVolume - level.bidVolume;
          const absDelta = Math.abs(delta);
          const maxDelta = maxLevelVol; // normalize against max level vol
          const intensity = Math.min(1, absDelta / maxDelta);
          const fullBarW = (fpWidth - 8) * intensity;
          ctx.fillStyle = delta >= 0 ? colors.deltaPositive : colors.deltaNegative;
          ctx.globalAlpha = 0.2 + intensity * 0.3;
          ctx.fillRect(centerX - fullBarW / 2, cellY + 1, fullBarW, barH);
          ctx.globalAlpha = 1;
        } else if (clusterMode === 'volume') {
          // Single centered bar showing total volume
          const intensity = Math.min(1, totalVol / maxLevelVol);
          const fullBarW = (fpWidth - 8) * intensity;
          // Gradient from muted to bright based on intensity
          const r = Math.round(80 + intensity * 100);
          const g = Math.round(130 + intensity * 80);
          const b = Math.round(220 - intensity * 40);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.globalAlpha = 0.2 + intensity * 0.35;
          ctx.fillRect(centerX - fullBarW / 2, cellY + 1, fullBarW, barH);
          ctx.globalAlpha = 1;
        }

        // ─── LAYER 2: POC highlight ───
        if (isPOC && features.showPOC) {
          ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
          ctx.fillRect(cellStartX + 2, cellY + 1, fpWidth - 4, rowH - 2);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(cellStartX + 1, cellY + 2, 2, rowH - 4);
        }

        // ─── LAYER 2.5: Large trade highlight (Phase 2) ───
        if (largeTradeEnabled && totalVol > largeTradeMultiplier * avgLevelVol) {
          // Glowing border
          ctx.strokeStyle = largeTradeColor;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.7;
          ctx.strokeRect(cellStartX + 2, cellY + 1, fpWidth - 4, rowH - 2);
          ctx.globalAlpha = 1;
        }

        // ─── LAYER 3: Text (bid, separator, ask) ───
        const isLargeTrade = largeTradeEnabled && totalVol > largeTradeMultiplier * avgLevelVol;

        if (clusterMode === 'bid-ask' || clusterMode === 'bid-ask-split') {
          // ── Bid x Ask / Bid | Ask modes ──
          const separator = clusterMode === 'bid-ask' ? 'x' : '|';

          // Bid text
          if (level.bidVolume > 0) {
            if (features.showImbalances && level.imbalanceSell) {
              ctx.fillStyle = '#ff4757';
              ctx.font = boldMonoFont;
            } else if (isLargeTrade) {
              ctx.fillStyle = largeTradeColor;
              ctx.font = boldMonoFont;
            } else {
              ctx.fillStyle = isPOC ? '#fbbf24' : colors.bidTextColor;
              ctx.font = isPOC ? boldMonoFont : monoFont;
            }
            ctx.textAlign = 'right';
            ctx.fillText(this.formatVolCached(level.bidVolume, zoom), centerX - 5, textY);
          }

          // Separator
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = 0.6;
          ctx.font = `${fontSize - 1}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(separator, centerX, textY);
          ctx.globalAlpha = 1;

          // Ask text
          if (level.askVolume > 0) {
            if (features.showImbalances && level.imbalanceBuy) {
              ctx.fillStyle = '#2ed573';
              ctx.font = boldMonoFont;
            } else if (isLargeTrade) {
              ctx.fillStyle = largeTradeColor;
              ctx.font = boldMonoFont;
            } else {
              ctx.fillStyle = isPOC ? '#fbbf24' : colors.askTextColor;
              ctx.font = isPOC ? boldMonoFont : monoFont;
            }
            ctx.textAlign = 'left';
            ctx.fillText(this.formatVolCached(level.askVolume, zoom), centerX + 5, textY);
          }
        } else if (clusterMode === 'delta') {
          // ── Delta mode: single centered value ──
          const delta = level.askVolume - level.bidVolume;
          const deltaStr = (delta >= 0 ? '+' : '') + this.formatVolCached(Math.abs(delta), zoom);
          if (isLargeTrade) {
            ctx.fillStyle = largeTradeColor;
            ctx.font = boldMonoFont;
          } else {
            ctx.fillStyle = isPOC ? '#fbbf24' : (delta >= 0 ? colors.deltaPositive : colors.deltaNegative);
            ctx.font = isPOC ? boldMonoFont : monoFont;
          }
          ctx.textAlign = 'center';
          ctx.fillText(deltaStr, centerX, textY);
        } else if (clusterMode === 'volume') {
          // ── Volume mode: single centered total ──
          const volStr = this.formatVolCached(totalVol, zoom);
          const intensity = Math.min(1, totalVol / maxLevelVol);
          if (isLargeTrade) {
            ctx.fillStyle = largeTradeColor;
            ctx.font = boldMonoFont;
          } else {
            // Brightness based on intensity
            const brightness = Math.round(160 + intensity * 95);
            ctx.fillStyle = isPOC ? '#fbbf24' : `rgb(${brightness},${brightness},${brightness})`;
            ctx.font = isPOC ? boldMonoFont : monoFont;
          }
          ctx.textAlign = 'center';
          ctx.fillText(volStr, centerX, textY);
        }
      });

      // Vertical separator
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fpX + totalFpWidth, footprintAreaY);
      ctx.lineTo(fpX + totalFpWidth, footprintAreaY + footprintAreaHeight);
      ctx.stroke();
    });
  }

  /**
   * Render OHLC candle stick (thin bar on the left)
   */
  private renderOHLCCandle(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    candle: FootprintCandle,
    fpX: number,
    ohlcWidth: number,
  ): void {
    const isBullish = candle.close >= candle.open;
    const ohlcX = fpX;
    const openY = layout.priceToY(candle.open, metrics);
    const closeY = layout.priceToY(candle.close, metrics);
    const highY = layout.priceToY(candle.high, metrics);
    const lowY = layout.priceToY(candle.low, metrics);

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(1, Math.abs(closeY - openY));
    const bodyX = ohlcX + 2;
    const bodyW = ohlcWidth - 4;

    // Wick
    ctx.strokeStyle = isBullish ? colors.candleUpWick : colors.candleDownWick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW / 2, highY);
    ctx.lineTo(bodyX + bodyW / 2, lowY);
    ctx.stroke();

    // Body
    ctx.fillStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
    ctx.fillRect(bodyX, bodyTop, bodyW, bodyHeight);

    // Border
    ctx.strokeStyle = isBullish ? colors.candleUpBorder : colors.candleDownBorder;
    ctx.strokeRect(bodyX, bodyTop, bodyW, bodyHeight);
  }

  /**
   * Render candle mode (when zoomed out, no footprint cells)
   */
  renderCandleMode(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    lod: LODState,
    footprintWidth: number,
  ): void {
    metrics.visibleCandles.forEach((candle, idx) => {
      const fpX = layout.getFootprintX(idx, metrics);
      const isBullish = candle.close >= candle.open;

      const openY = Math.round(layout.priceToY(candle.open, metrics));
      const closeY = Math.round(layout.priceToY(candle.close, metrics));
      const highY = Math.round(layout.priceToY(candle.high, metrics));
      const lowY = Math.round(layout.priceToY(candle.low, metrics));

      const bodyTop = Math.min(openY, closeY);
      const bodyBottom = Math.max(openY, closeY);
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      const candleWidth = Math.max(2, Math.round(footprintWidth * lod.candleBodyWidth));
      const candleX = Math.round(fpX + (footprintWidth - candleWidth) / 2);
      const centerX = Math.round(fpX + footprintWidth / 2) + 0.5;

      // Wick
      ctx.strokeStyle = isBullish ? colors.candleUpWick : colors.candleDownWick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, highY + 0.5);
      ctx.lineTo(centerX, lowY + 0.5);
      ctx.stroke();

      // Body
      ctx.fillStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
      ctx.fillRect(candleX, bodyTop, candleWidth, bodyHeight);

      // Border (only if wide enough)
      if (candleWidth > 3) {
        ctx.strokeStyle = isBullish ? colors.candleUpBorder : colors.candleDownBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(candleX + 0.5, bodyTop + 0.5, candleWidth - 1, bodyHeight - 1);
      }
    });
  }

  /**
   * Render VWAP/TWAP lines
   */
  renderVWAPTWAP(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    features: FootprintFeatures,
    ohlcWidth: number,
    fpWidth: number,
  ): void {
    if (!features.showVWAPTWAP || metrics.visibleCandles.length === 0) return;

    const vwapColor = features.vwapColor || '#e2b93b';
    const twapColor = features.twapColor || '#5eaeff';
    const vwapLW = features.vwapLineWidth || 2.5;
    const twapLW = features.twapLineWidth || 2;
    const showVWAP = features.showVWAP !== false;
    const showTWAP = features.showTWAP !== false;
    const { footprintAreaY, footprintAreaHeight } = metrics;

    // Calculate VWAP + standard deviation for bands
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    let cumulativeTPSquared = 0; // For standard deviation bands
    const vwapPoints: { x: number; y: number; stdDev: number }[] = [];

    metrics.visibleCandles.forEach((candle, idx) => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.totalVolume;
      cumulativeVolume += candle.totalVolume;
      cumulativeTPSquared += (typicalPrice * typicalPrice) * candle.totalVolume;

      const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
      // Standard deviation: sqrt(E[X²] - E[X]²)
      const meanSquare = cumulativeVolume > 0 ? cumulativeTPSquared / cumulativeVolume : 0;
      const variance = Math.max(0, meanSquare - vwap * vwap);
      const stdDev = Math.sqrt(variance);

      const fpX = layout.getFootprintX(idx, metrics);
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      const x = fpX + totalFpWidth / 2;
      const y = layout.priceToY(vwap, metrics);

      if (y >= footprintAreaY && y <= footprintAreaY + footprintAreaHeight) {
        vwapPoints.push({ x, y, stdDev });
      }
    });

    const splineTension = 0.4;

    // Draw VWAP
    if (showVWAP && vwapPoints.length > 1) {
      // Glow
      ctx.save();
      ctx.strokeStyle = vwapColor;
      ctx.lineWidth = vwapLW * 2.4;
      ctx.globalAlpha = 0.12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      catmullRomSpline(ctx, vwapPoints, splineTension);
      ctx.stroke();
      ctx.restore();

      // Main line
      ctx.save();
      ctx.strokeStyle = vwapColor;
      ctx.lineWidth = vwapLW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      catmullRomSpline(ctx, vwapPoints, splineTension);
      ctx.stroke();
      ctx.restore();

      // Label
      if (features.vwapShowLabel !== false) {
        const lastVP = vwapPoints[vwapPoints.length - 1];
        ctx.font = 'bold 9px "Consolas", monospace';
        const tw = ctx.measureText('VWAP').width;
        ctx.fillStyle = vwapColor;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(lastVP.x + 4, lastVP.y - 8, tw + 8, 14, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0a0f';
        ctx.textAlign = 'left';
        ctx.fillText('VWAP', lastVP.x + 8, lastVP.y + 2);
      }

      // ─── VWAP Standard Deviation Bands ───
      if (features.showVWAPBands !== false && vwapPoints.length > 1) {
        const multipliers = features.vwapBandMultipliers || [1, 2];
        const bandOpacity = features.vwapBandOpacity ?? 0.06;
        const bandColor = features.vwapBandColor || vwapColor;

        for (const mult of multipliers) {
          const upperPoints: { x: number; y: number }[] = [];
          const lowerPoints: { x: number; y: number }[] = [];

          for (const pt of vwapPoints) {
            if (pt.stdDev <= 0) continue;
            const offset = pt.stdDev * mult;
            // Convert price offset to Y offset via layout
            const vwapPrice = layout.yToPrice(pt.y, metrics);
            const upperY = layout.priceToY(vwapPrice + offset, metrics);
            const lowerY = layout.priceToY(vwapPrice - offset, metrics);
            upperPoints.push({ x: pt.x, y: upperY });
            lowerPoints.push({ x: pt.x, y: lowerY });
          }

          if (upperPoints.length > 1) {
            // Filled band between upper and lower (spline fill)
            ctx.save();
            ctx.fillStyle = bandColor;
            ctx.globalAlpha = bandOpacity;
            ctx.beginPath();
            catmullRomSpline(ctx, upperPoints, splineTension);
            // Trace back along lower points in reverse for closed fill
            const lowerRev = [...lowerPoints].reverse();
            // Continue path: move to last lower point then spline backwards
            ctx.lineTo(lowerRev[0].x, lowerRev[0].y);
            for (let i = 1; i < lowerRev.length; i++) ctx.lineTo(lowerRev[i].x, lowerRev[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Dashed spline lines for upper and lower bounds
            ctx.save();
            ctx.strokeStyle = bandColor;
            ctx.lineWidth = 1;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.35;
            ctx.setLineDash([4, 4]);

            // Upper band
            ctx.beginPath();
            catmullRomSpline(ctx, upperPoints, splineTension);
            ctx.stroke();

            // Lower band
            ctx.beginPath();
            catmullRomSpline(ctx, lowerPoints, splineTension);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();

            // Band label at the right edge
            const lastUP = upperPoints[upperPoints.length - 1];
            ctx.font = '8px "Consolas", monospace';
            ctx.fillStyle = bandColor;
            ctx.globalAlpha = 0.5;
            ctx.textAlign = 'left';
            ctx.fillText(`${mult}σ`, lastUP.x + 4, lastUP.y + 3);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // Calculate TWAP
    let twapSum = 0;
    const twapPoints: { x: number; y: number }[] = [];

    metrics.visibleCandles.forEach((candle, idx) => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      twapSum += typicalPrice;
      const twap = twapSum / (idx + 1);

      const fpX = layout.getFootprintX(idx, metrics);
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      const x = fpX + totalFpWidth / 2;
      const y = layout.priceToY(twap, metrics);

      if (y >= footprintAreaY && y <= footprintAreaY + footprintAreaHeight) {
        twapPoints.push({ x, y });
      }
    });

    // Draw TWAP
    if (showTWAP && twapPoints.length > 1) {
      // Glow
      ctx.save();
      ctx.strokeStyle = twapColor;
      ctx.lineWidth = twapLW * 2.5;
      ctx.globalAlpha = 0.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      ctx.beginPath();
      catmullRomSpline(ctx, twapPoints, splineTension);
      ctx.stroke();
      ctx.restore();

      // Main line (dashed spline)
      ctx.save();
      ctx.strokeStyle = twapColor;
      ctx.lineWidth = twapLW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      catmullRomSpline(ctx, twapPoints, splineTension);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Label
      if (features.twapShowLabel !== false) {
        const lastTP = twapPoints[twapPoints.length - 1];
        ctx.font = 'bold 9px "Consolas", monospace';
        const tw2 = ctx.measureText('TWAP').width;
        ctx.fillStyle = twapColor;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(lastTP.x + 4, lastTP.y + 2, tw2 + 8, 14, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0a0a0f';
        ctx.textAlign = 'left';
        ctx.fillText('TWAP', lastTP.x + 8, lastTP.y + 12);
      }
    }
  }

  /**
   * Render delta profile panel (uses cached deltaByPrice)
   */
  renderDeltaProfile(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    caches: ProfileCaches,
    rowH: number,
    features?: FootprintFeatures,
  ): void {
    const dpPos = layout.getDeltaProfilePosition(metrics);
    const dpWidth = dpPos.width;
    const dpX = dpPos.x;
    const { footprintAreaY, footprintAreaHeight } = metrics;

    // Background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(dpX, footprintAreaY, dpWidth, footprintAreaHeight);

    // Left border
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dpX, footprintAreaY);
    ctx.lineTo(dpX, footprintAreaY + footprintAreaHeight);
    ctx.stroke();

    // Center line
    const centerLineX = dpX + dpWidth / 2;
    ctx.strokeStyle = colors.textMuted;
    ctx.globalAlpha = 0.15;
    ctx.setLineDash([1, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerLineX, footprintAreaY);
    ctx.lineTo(centerLineX, footprintAreaY + footprintAreaHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Delta bars — use settings colors if available
    const dpBarMaxWidth = (dpWidth - 10) / 2;
    const dpPositiveColor = features?.deltaProfilePositiveColor || '#22c55e';
    const dpNegativeColor = features?.deltaProfileNegativeColor || '#ef4444';
    const dpOpacity = features?.deltaProfileOpacity ?? 0.7;

    caches.deltaByPrice.forEach((delta, price) => {
      const y = layout.priceToY(price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) return;

      const barWidth = (Math.abs(delta) / caches.maxDelta) * dpBarMaxWidth;
      const isPositive = delta >= 0;
      const barH = Math.max(2, rowH * 0.5);
      const intensity = Math.abs(delta) / caches.maxDelta;
      const baseColor = isPositive ? dpPositiveColor : dpNegativeColor;

      // Glow for high-intensity
      if (intensity > 0.6) {
        ctx.save();
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = 0.08;
        if (isPositive) {
          ctx.fillRect(centerLineX - 1, y - barH / 2 - 1, barWidth + 2, barH + 2);
        } else {
          ctx.fillRect(centerLineX - barWidth - 1, y - barH / 2 - 1, barWidth + 2, barH + 2);
        }
        ctx.restore();
      }

      ctx.fillStyle = baseColor;
      ctx.globalAlpha = (0.35 + intensity * 0.55) * dpOpacity;

      if (isPositive) {
        ctx.fillRect(centerLineX, y - barH / 2, barWidth, barH);
      } else {
        ctx.fillRect(centerLineX - barWidth, y - barH / 2, barWidth, barH);
      }
    });
    ctx.globalAlpha = 1;
  }

  /**
   * Render professional volume profile panel (bid/ask split, per-tick resolution)
   *
   * Features:
   * - Bid/ask dual-colored bars (left=bid red, right=ask green)
   * - POC highlighted with arrow marker + glow
   * - Value area shading band
   * - Volume text on significant levels
   * - Gradient intensity per bar
   * - VAH/VAL/POC extended lines with pill labels
   */
  renderVolumeProfile(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    caches: ProfileCaches,
    rowH: number,
    width: number,
    features?: FootprintFeatures,
  ): void {
    const vpPos = layout.getVolumeProfilePosition(metrics);
    const vpWidth = vpPos.width;
    const vpX = vpPos.x;
    const { footprintAreaY, footprintAreaHeight } = metrics;
    const { sessionStats, volumeByPrice, maxVolume } = caches;

    // Background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(vpX, footprintAreaY, vpWidth, footprintAreaHeight);

    // Left border
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vpX, footprintAreaY);
    ctx.lineTo(vpX, footprintAreaY + footprintAreaHeight);
    ctx.stroke();

    // Colors — use settings
    const pocColor = features?.volumeProfilePocColor || '#e2b93b';
    const vaColor = features?.volumeProfileColor || '#5e7ce2';
    const outsideColor = features?.volumeProfileOutsideColor || '#3a3f4b';
    const vahValLineColor = features?.volumeProfileVahValColor || '#7c85f6';
    const vpOpacity = features?.volumeProfileOpacity ?? 0.7;
    const bidBarColor = colors.bidColor || '#ef5350';
    const askBarColor = colors.askColor || '#26a69a';
    const barMaxWidth = vpWidth - 8;
    const barH = Math.max(2, Math.min(rowH * 0.75, 14));
    const barGap = Math.max(0.5, (rowH - barH) * 0.3);

    // ── Value Area shading band ──
    if (sessionStats.vah !== sessionStats.val) {
      const vahY = layout.priceToY(sessionStats.vah, metrics);
      const valY = layout.priceToY(sessionStats.val, metrics);
      const topY = Math.max(footprintAreaY, Math.min(vahY, valY));
      const bottomY = Math.min(footprintAreaY + footprintAreaHeight, Math.max(vahY, valY));
      ctx.fillStyle = vaColor;
      ctx.globalAlpha = 0.04 * vpOpacity;
      ctx.fillRect(vpX, topY, vpWidth, bottomY - topY);
      ctx.globalAlpha = 1;
    }

    // ── Per-tick bid/ask split bars ──
    // Sort prices for ordered rendering
    const sortedPrices = Array.from(volumeByPrice.entries())
      .filter(([price]) => {
        const y = layout.priceToY(price, metrics);
        return y >= footprintAreaY - barH && y <= footprintAreaY + footprintAreaHeight + barH;
      })
      .sort((a, b) => b[0] - a[0]); // high to low

    for (const [price, data] of sortedPrices) {
      const y = layout.priceToY(price, metrics);
      const isPOC = price === sessionStats.pocPrice;
      const isValueArea = sessionStats.valueAreaPrices.has(price);
      const intensity = data.total / maxVolume;
      const totalBarW = (data.total / maxVolume) * barMaxWidth;

      // Bar Y position (centered on price level)
      const barY = y - barH / 2;

      // ── POC highlight: glow background ──
      if (isPOC) {
        ctx.save();
        ctx.fillStyle = pocColor;
        ctx.globalAlpha = 0.12 * vpOpacity;
        ctx.fillRect(vpX + 1, barY - 2, totalBarW + 6, barH + 4);
        ctx.restore();
      }

      // Split into bid and ask portions
      const bidW = data.total > 0 ? (data.bid / data.total) * totalBarW : 0;
      const askW = data.total > 0 ? (data.ask / data.total) * totalBarW : 0;
      const barLeft = vpX + 4;

      // ── Bid bar (left portion, red) ──
      if (bidW > 0.5) {
        if (isPOC) {
          ctx.fillStyle = pocColor;
          ctx.globalAlpha = 0.85 * vpOpacity;
        } else if (isValueArea) {
          ctx.fillStyle = bidBarColor;
          ctx.globalAlpha = (0.35 + intensity * 0.5) * vpOpacity;
        } else {
          ctx.fillStyle = bidBarColor;
          ctx.globalAlpha = (0.15 + intensity * 0.25) * vpOpacity;
        }
        ctx.fillRect(barLeft, barY, bidW, barH);
      }

      // ── Ask bar (right portion, green) ──
      if (askW > 0.5) {
        if (isPOC) {
          ctx.fillStyle = pocColor;
          ctx.globalAlpha = 0.7 * vpOpacity;
        } else if (isValueArea) {
          ctx.fillStyle = askBarColor;
          ctx.globalAlpha = (0.35 + intensity * 0.5) * vpOpacity;
        } else {
          ctx.fillStyle = askBarColor;
          ctx.globalAlpha = (0.15 + intensity * 0.25) * vpOpacity;
        }
        ctx.fillRect(barLeft + bidW, barY, askW, barH);
      }

      // ── Thin separator between bid/ask ──
      if (bidW > 1 && askW > 1) {
        ctx.fillStyle = colors.surface;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(barLeft + bidW - 0.5, barY, 1, barH);
      }

      // ── Outline for POC bar ──
      if (isPOC && totalBarW > 2) {
        ctx.strokeStyle = pocColor;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9 * vpOpacity;
        ctx.strokeRect(barLeft, barY, totalBarW, barH);
      }

      // ── Volume text for significant levels ──
      if (barH >= 8 && totalBarW > 30 && intensity > 0.15) {
        ctx.globalAlpha = isPOC ? 0.95 : 0.7;
        ctx.fillStyle = isPOC ? '#ffffff' : colors.textSecondary;
        ctx.font = `${isPOC ? 'bold ' : ''}${barH >= 12 ? 8 : 7}px "Consolas", monospace`;
        ctx.textAlign = 'left';
        const volText = data.total >= 1000 ? `${(data.total / 1000).toFixed(1)}K` : Math.round(data.total).toString();
        const textX = barLeft + totalBarW + 3;
        if (textX + 30 < vpX + vpWidth) {
          ctx.fillText(volText, textX, y + 3);
        }
      }

      ctx.globalAlpha = 1;
    }

    // ── POC arrow marker ──
    const pocY = layout.priceToY(sessionStats.pocPrice, metrics);
    if (pocY >= footprintAreaY && pocY <= footprintAreaY + footprintAreaHeight) {
      ctx.save();
      ctx.fillStyle = pocColor;
      ctx.globalAlpha = 0.9;
      // Small triangle pointing right at POC
      const arrowX = vpX + 1;
      ctx.beginPath();
      ctx.moveTo(arrowX, pocY - 4);
      ctx.lineTo(arrowX + 5, pocY);
      ctx.lineTo(arrowX, pocY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ── Extended VAH/VAL/POC lines ──
    if (sessionStats.vah !== sessionStats.val) {
      const vahY = layout.priceToY(sessionStats.vah, metrics);
      const valY = layout.priceToY(sessionStats.val, metrics);
      const sessPocY = layout.priceToY(sessionStats.pocPrice, metrics);

      // VAH Line (dashed)
      if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
        this.renderExtendedLine(ctx, vahValLineColor, 0, vpX + vpWidth, vahY, footprintAreaY, footprintAreaHeight, true);
      }

      // VAL Line (dashed)
      if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
        this.renderExtendedLine(ctx, vahValLineColor, 0, vpX + vpWidth, valY, footprintAreaY, footprintAreaHeight, true);
      }

      // POC Line (golden, solid, extends across chart)
      if (sessPocY >= footprintAreaY && sessPocY <= footprintAreaY + footprintAreaHeight) {
        this.renderExtendedLine(ctx, pocColor, 0, vpX - 5, sessPocY, footprintAreaY, footprintAreaHeight, false);
      }

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Pill labels (left edge)
      ctx.font = 'bold 8px "Consolas", monospace';

      if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
        this.renderPillLabel(ctx, 'VAH', 3, vahY - 9, vahValLineColor);
      }
      if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
        this.renderPillLabel(ctx, 'VAL', 3, valY + 1, vahValLineColor);
      }
      if (sessPocY >= footprintAreaY && sessPocY <= footprintAreaY + footprintAreaHeight) {
        this.renderPillLabel(ctx, 'POC', 3, sessPocY - 5, pocColor);
      }

      // VP side labels
      ctx.textAlign = 'right';
      ctx.font = 'bold 7px "Consolas", monospace';
      if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
        ctx.fillStyle = vahValLineColor;
        ctx.globalAlpha = 0.7;
        ctx.fillText('VAH', vpX + vpWidth - 2, vahY - 2);
        ctx.globalAlpha = 1;
      }
      if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
        ctx.fillStyle = vahValLineColor;
        ctx.globalAlpha = 0.7;
        ctx.fillText('VAL', vpX + vpWidth - 2, valY + 8);
        ctx.globalAlpha = 1;
      }
    }

    // POC label in VP area with volume
    if (pocY >= footprintAreaY && pocY <= footprintAreaY + footprintAreaHeight) {
      ctx.fillStyle = pocColor;
      ctx.font = 'bold 7px "Consolas", monospace';
      ctx.textAlign = 'right';
      const pocVol = sessionStats.pocVolume;
      const pocLabel = pocVol >= 1000 ? `POC ${(pocVol / 1000).toFixed(1)}K` : `POC ${Math.round(pocVol)}`;
      ctx.fillText(pocLabel, vpX + vpWidth - 2, pocY + 3);
    }

    // ── Volume profile summary at top ──
    ctx.save();
    ctx.font = 'bold 7px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.textMuted;
    ctx.globalAlpha = 0.6;
    const totalStr = sessionStats.totalVolume >= 1000000 ? `${(sessionStats.totalVolume / 1000000).toFixed(1)}M`
      : sessionStats.totalVolume >= 1000 ? `${(sessionStats.totalVolume / 1000).toFixed(0)}K`
      : Math.round(sessionStats.totalVolume).toString();
    ctx.fillText(`VP: ${totalStr}`, vpX + vpWidth / 2, footprintAreaY + 9);
    ctx.restore();
  }

  /**
   * Render current price line
   */
  renderCurrentPriceLine(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    fonts: FootprintFonts,
    currentPrice: number,
    width: number,
  ): void {
    if (currentPrice <= 0) return;

    const priceY = layout.priceToY(currentPrice, metrics);
    const { footprintAreaY, footprintAreaHeight } = metrics;
    if (priceY < footprintAreaY || priceY > footprintAreaY + footprintAreaHeight) return;

    // Line style
    ctx.strokeStyle = colors.currentPriceColor;
    ctx.lineWidth = colors.currentPriceLineWidth || 1;

    const lineStyle = colors.currentPriceLineStyle || 'dashed';
    if (lineStyle === 'dashed') ctx.setLineDash([4, 2]);
    else if (lineStyle === 'dotted') ctx.setLineDash([2, 2]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(0, priceY);
    ctx.lineTo(width - 62, priceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    if (colors.currentPriceShowLabel !== false) {
      const labelH = 18;
      const labelY = priceY - labelH / 2;

      ctx.fillStyle = colors.currentPriceLabelBg || colors.currentPriceColor;
      ctx.fillRect(width - 60, labelY, 60, labelH);

      // Triangle pointer
      ctx.beginPath();
      ctx.moveTo(width - 62, priceY);
      ctx.lineTo(width - 60, priceY - 4);
      ctx.lineTo(width - 60, priceY + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        width - 4,
        priceY + 4,
      );
    }
  }

  /**
   * Render price scale (right column)
   */
  renderPriceScale(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    fonts: FootprintFonts,
    tickSize: number,
    isCME: boolean,
    width: number,
  ): void {
    const { footprintAreaY, footprintAreaHeight } = metrics;

    // Background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(width - 60, footprintAreaY, 60, footprintAreaHeight);

    // Left border
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - 60, footprintAreaY);
    ctx.lineTo(width - 60, footprintAreaY + footprintAreaHeight);
    ctx.stroke();

    // Price labels
    ctx.fillStyle = colors.textSecondary;
    ctx.font = `${fonts.priceFontSize}px "Consolas", "Monaco", monospace`;
    ctx.textAlign = 'right';

    const priceLevels = layout.getVisiblePriceLevels(metrics, tickSize);
    const zoomY = layout.getZoomY();
    const labelSkip = zoomY < 0.3 ? 3 : zoomY < 0.7 ? 2 : 1;

    priceLevels.forEach((price, idx) => {
      if (idx % labelSkip !== 0) return;

      const y = layout.priceToY(price, metrics);
      const labelPadding = 15;
      if (y < footprintAreaY - labelPadding || y > footprintAreaY + footprintAreaHeight + labelPadding) return;

      // Tick mark
      ctx.strokeStyle = colors.gridColor;
      ctx.beginPath();
      ctx.moveTo(width - 60, y);
      ctx.lineTo(width - 56, y);
      ctx.stroke();

      const formattedPrice = layout.formatPriceWithZoom(price, tickSize, isCME);
      const prefix = isCME ? '' : '$';
      ctx.fillText(`${prefix}${formattedPrice}`, width - 4, y + 3);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE B: SPREAD + SESSION SEPARATORS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Render bid/ask spread zone on the price scale
   */
  renderSpread(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    bestBid: number,
    bestAsk: number,
    width: number,
    tickSize: number,
  ): void {
    if (bestBid <= 0 || bestAsk <= 0 || bestAsk <= bestBid) return;

    const bidY = layout.priceToY(bestBid, metrics);
    const askY = layout.priceToY(bestAsk, metrics);
    const topY = Math.min(bidY, askY);
    const h = Math.abs(bidY - askY);
    if (h < 1) return;

    // Spread zone on price scale
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.fillRect(width - 60, topY, 60, h);

    // Spread label
    const spread = bestAsk - bestBid;
    const pricePrecision = Math.max(Math.round(-Math.log10(tickSize)), 0);
    const midY = topY + h / 2;
    ctx.font = 'bold 7px "Consolas", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(96, 165, 250, 0.8)';
    ctx.fillText(`${spread.toFixed(pricePrecision)}`, width - 30, midY + 3);
  }

  /**
   * Render session separator lines (00:00 UTC for crypto, CME session times)
   */
  renderSessionSeparators(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    isCME: boolean,
    footprintAreaY: number,
    footprintAreaHeight: number,
    customSessions?: Array<{ id: string; label: string; startUTC: number; endUTC: number; color: string; enabled: boolean }>,
  ): void {
    const { visibleCandles } = metrics;
    if (visibleCandles.length < 2) return;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const sessions = customSessions?.filter(s => s.enabled);

    for (let i = 1; i < visibleCandles.length; i++) {
      const prevTime = visibleCandles[i - 1].time;
      const currTime = visibleCandles[i].time;
      const prevHourUTC = new Date(prevTime * 1000).getUTCHours();
      const currHourUTC = new Date(currTime * 1000).getUTCHours();
      const prevDay = Math.floor(prevTime / 86400);
      const currDay = Math.floor(currTime / 86400);
      const dayChanged = currDay > prevDay;

      // Check custom sessions first
      if (sessions && sessions.length > 0) {
        for (const session of sessions) {
          const startH = session.startUTC;
          // Detect when we cross session start boundary
          let crossedStart = false;
          if (startH <= 23) {
            if (dayChanged && currHourUTC >= startH) {
              crossedStart = true;
            } else if (prevHourUTC < startH && currHourUTC >= startH) {
              crossedStart = true;
            }
          }

          if (crossedStart) {
            const x = layout.getFootprintX(i, metrics);
            ctx.strokeStyle = session.color + '40'; // 25% opacity
            ctx.beginPath();
            ctx.moveTo(x, footprintAreaY);
            ctx.lineTo(x, footprintAreaY + footprintAreaHeight);
            ctx.stroke();

            // Label at top with session color
            ctx.font = 'bold 7px "Consolas", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = session.color + '80'; // 50% opacity
            ctx.fillText(session.label, x, footprintAreaY + 10);
          }
        }
      } else {
        // Fallback: original behavior
        let isBoundary = false;
        let label = '';

        if (isCME) {
          if (prevHourUTC < 14 && currHourUTC >= 14) {
            isBoundary = true;
            label = 'RTH Open';
          }
          if (prevHourUTC < 21 && currHourUTC >= 21) {
            isBoundary = true;
            label = 'RTH Close';
          }
        } else {
          if (dayChanged) {
            isBoundary = true;
            label = '00:00 UTC';
          }
        }

        if (isBoundary) {
          const x = layout.getFootprintX(i, metrics);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.beginPath();
          ctx.moveTo(x, footprintAreaY);
          ctx.lineTo(x, footprintAreaY + footprintAreaHeight);
          ctx.stroke();

          ctx.font = 'bold 7px "Consolas", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillText(label, x, footprintAreaY + 10);
        }
      }
    }

    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE C: ABSORPTION EVENTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Render absorption event markers — pulsing circles at price levels
   */
  renderAbsorptionEvents(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    events: Array<{ price: number; volume: number; side: 'bid' | 'ask'; timestamp: number }>,
    footprintAreaY: number,
    footprintAreaHeight: number,
  ): void {
    const now = Date.now();

    ctx.save();
    for (const event of events) {
      const age = now - event.timestamp;
      if (age > 30000) continue; // Fade after 30s

      const y = layout.priceToY(event.price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;

      // Find x position — use rightmost area
      const x = metrics.visibleCandles.length > 0
        ? layout.getFootprintX(metrics.visibleCandles.length - 1, metrics) - 8
        : 40;

      const opacity = Math.max(0, 1 - age / 30000);
      const radius = Math.min(12, 4 + Math.sqrt(event.volume) * 1.5);

      // Glow
      ctx.globalAlpha = opacity * 0.3;
      ctx.fillStyle = event.side === 'bid' ? '#00e5ff' : '#ff4081';
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.fill();

      // Core circle
      ctx.globalAlpha = opacity * 0.7;
      ctx.fillStyle = event.side === 'bid' ? '#00bcd4' : '#e91e63';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.globalAlpha = opacity;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: INFO DISPLAY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Render session stats header — compact bar at top of chart
   * Shows: Vol | Delta | POC | VAH | VAL | Imbalances
   */
  renderSessionHeader(
    ctx: CanvasRenderingContext2D,
    metrics: LayoutMetrics,
    caches: ProfileCaches,
    colors: FootprintColors,
    width: number,
  ): void {
    const { sessionStats } = caches;
    const headerY = metrics.footprintAreaY + 2;
    const headerH = 16;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.fillRect(0, headerY, width - 60, headerH);

    // Bottom border
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, headerY + headerH);
    ctx.lineTo(width - 60, headerY + headerH);
    ctx.stroke();

    // Stats text
    ctx.font = '9px "Consolas", monospace';
    ctx.textAlign = 'left';
    const textY = headerY + 11;
    let x = 8;

    // Volume
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Vol:', x, textY);
    x += 24;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(this.formatCompact(sessionStats.totalVolume), x, textY);
    x += ctx.measureText(this.formatCompact(sessionStats.totalVolume)).width + 12;

    // Delta
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Delta:', x, textY);
    x += 32;
    ctx.fillStyle = sessionStats.totalDelta >= 0 ? '#22c55e' : '#ef4444';
    const deltaStr = (sessionStats.totalDelta >= 0 ? '+' : '') + this.formatCompact(sessionStats.totalDelta);
    ctx.fillText(deltaStr, x, textY);
    x += ctx.measureText(deltaStr).width + 12;

    // POC
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('POC:', x, textY);
    x += 26;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(sessionStats.pocPrice.toFixed(2), x, textY);
    x += ctx.measureText(sessionStats.pocPrice.toFixed(2)).width + 12;

    // VAH
    if (sessionStats.vah > 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('VAH:', x, textY);
      x += 26;
      ctx.fillStyle = '#7c85f6';
      ctx.fillText(sessionStats.vah.toFixed(2), x, textY);
      x += ctx.measureText(sessionStats.vah.toFixed(2)).width + 8;

      // VAL
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('VAL:', x, textY);
      x += 26;
      ctx.fillStyle = '#7c85f6';
      ctx.fillText(sessionStats.val.toFixed(2), x, textY);
    }
  }

  /**
   * Render footer status bar — performance + info
   * Left: Price | Time  Center: LOD | Candles | Levels  Right: FPS | Render
   */
  renderFooterStatusBar(
    ctx: CanvasRenderingContext2D,
    width: number,
    footerY: number,
    colors: FootprintColors,
    currentPrice: number,
    visibleCandleCount: number,
    lodMode: string,
  ): void {
    const barH = 16;
    const barY = footerY - barH;

    // Background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.fillRect(0, barY, width, barH);

    // Top border
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(width, barY);
    ctx.stroke();

    ctx.font = '8px "Consolas", monospace';
    const textY = barY + 11;

    // Left: Price
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'left';
    if (currentPrice > 0) {
      ctx.fillText(`Price: $${currentPrice.toFixed(2)}`, 8, textY);
    }

    // Center: LOD + Candles
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b7280';
    const centerText = `LOD: ${lodMode.toUpperCase()} | Candles: ${visibleCandleCount}`;
    ctx.fillText(centerText, width / 2, textY);

    // Right: FPS + Render time
    ctx.textAlign = 'right';
    const fpsColor = this._currentFps >= 50 ? '#22c55e' : this._currentFps >= 30 ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = fpsColor;
    ctx.fillText(`FPS: ${this._currentFps}`, width - 70, textY);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`${this._lastRenderMs.toFixed(1)}ms`, width - 8, textY);
  }

  /**
   * Render CVD (Cumulative Volume Delta) oscillator panel
   */
  renderCVDPanel(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    features: FootprintFeatures,
    colors: FootprintColors,
    width: number,
    panelY: number,
    panelHeight: number,
    ohlcWidth: number,
    fpWidth: number,
  ): void {
    if (!features.showCVDPanel || metrics.visibleCandles.length === 0) return;

    const lineColor = features.cvdLineColor || '#22c55e';

    // Background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    ctx.fillRect(0, panelY, width, panelHeight);

    // Top border
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, panelY);
    ctx.lineTo(width, panelY);
    ctx.stroke();

    // Calculate CVD points
    let cumDelta = 0;
    const cvdPoints: { x: number; value: number }[] = [];

    metrics.visibleCandles.forEach((candle, idx) => {
      cumDelta += candle.totalDelta;
      const fpX = layout.getFootprintX(idx, metrics);
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      const x = fpX + totalFpWidth / 2;
      cvdPoints.push({ x, value: cumDelta });
    });

    if (cvdPoints.length < 2) return;

    // Auto-scale
    let minVal = Infinity, maxVal = -Infinity;
    for (const pt of cvdPoints) {
      if (pt.value < minVal) minVal = pt.value;
      if (pt.value > maxVal) maxVal = pt.value;
    }
    const range = maxVal - minVal || 1;
    const padding = 8;
    const drawH = panelHeight - padding * 2;

    const valueToY = (val: number) => {
      return panelY + padding + drawH - ((val - minVal) / range) * drawH;
    };

    // Zero line
    const zeroY = valueToY(0);
    if (zeroY > panelY + padding && zeroY < panelY + panelHeight - padding) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(width, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw CVD line with gradient coloring
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    for (let i = 1; i < cvdPoints.length; i++) {
      const prev = cvdPoints[i - 1];
      const curr = cvdPoints[i];
      const rising = curr.value >= prev.value;
      ctx.strokeStyle = rising ? lineColor : '#ef4444';
      ctx.beginPath();
      ctx.moveTo(prev.x, valueToY(prev.value));
      ctx.lineTo(curr.x, valueToY(curr.value));
      ctx.stroke();
    }

    // Fill area under/over zero line
    ctx.save();
    ctx.globalAlpha = 0.06;
    const clampedZeroY = Math.max(panelY + padding, Math.min(panelY + panelHeight - padding, zeroY));

    // Positive fill (green above zero)
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(cvdPoints[0].x, clampedZeroY);
    for (const pt of cvdPoints) {
      const y = valueToY(pt.value);
      ctx.lineTo(pt.x, Math.min(y, clampedZeroY));
    }
    ctx.lineTo(cvdPoints[cvdPoints.length - 1].x, clampedZeroY);
    ctx.closePath();
    ctx.fill();

    // Negative fill (red below zero)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(cvdPoints[0].x, clampedZeroY);
    for (const pt of cvdPoints) {
      const y = valueToY(pt.value);
      ctx.lineTo(pt.x, Math.max(y, clampedZeroY));
    }
    ctx.lineTo(cvdPoints[cvdPoints.length - 1].x, clampedZeroY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Label "CVD" + current value
    const lastVal = cvdPoints[cvdPoints.length - 1].value;
    const valStr = this.formatCompact(lastVal);
    ctx.font = 'bold 9px "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('CVD', 6, panelY + 12);
    ctx.fillStyle = lastVal >= 0 ? lineColor : '#ef4444';
    ctx.fillText(valStr, 30, panelY + 12);

    // Min/Max labels
    ctx.font = '7px "Consolas", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'right';
    ctx.fillText(this.formatCompact(maxVal), width - 6, panelY + 10);
    ctx.fillText(this.formatCompact(minVal), width - 6, panelY + panelHeight - 4);
  }

  /**
   * Render TPO (Time Price Opportunity) / Market Profile
   */
  renderTPOProfile(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    tpoData: { rows: Map<number, { price: number; letters: string[]; count: number }>; pocPrice: number; vahPrice: number; valPrice: number; ibHigh: number; ibLow: number; pocCount: number },
    features: FootprintFeatures,
    width: number,
    rowH: number,
  ): void {
    const { footprintAreaY, footprintAreaHeight } = metrics;
    const position = (features as any).tpoPosition || 'right';
    const mode = (features as any).tpoMode || 'letters';
    const panelWidth = mode === 'letters' ? 120 : 80;
    const panelX = position === 'right' ? width - panelWidth : 0;

    // Panel background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
    ctx.fillRect(panelX, footprintAreaY, panelWidth, footprintAreaHeight);

    // Border
    ctx.strokeStyle = 'rgba(100, 100, 120, 0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(position === 'right' ? panelX : panelX + panelWidth, footprintAreaY);
    ctx.lineTo(position === 'right' ? panelX : panelX + panelWidth, footprintAreaY + footprintAreaHeight);
    ctx.stroke();

    const maxCount = tpoData.pocCount || 1;

    for (const [price, row] of tpoData.rows) {
      const y = layout.priceToY(price, metrics);
      if (y < footprintAreaY - rowH || y > footprintAreaY + footprintAreaHeight + rowH) continue;

      const isPOC = price === tpoData.pocPrice;
      const isVA = price >= tpoData.valPrice && price <= tpoData.vahPrice;
      const isIB = price >= tpoData.ibLow && price <= tpoData.ibHigh;

      if (mode === 'letters') {
        // Draw TPO letters
        ctx.font = '8px "Consolas", monospace';
        ctx.textAlign = 'left';
        const letterStr = row.letters.join('');
        const displayStr = letterStr.length > 14 ? letterStr.slice(0, 14) + '..' : letterStr;

        if (isPOC) {
          ctx.fillStyle = '#fbbf24';
        } else if (isIB) {
          ctx.fillStyle = '#60a5fa';
        } else if (isVA) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
        }
        ctx.fillText(displayStr, panelX + 4, y + 3);
      } else {
        // Histogram mode
        const intensity = row.count / maxCount;
        const barW = (panelWidth - 8) * intensity;

        if (isPOC) {
          ctx.fillStyle = '#fbbf24';
        } else if (isVA) {
          ctx.fillStyle = 'rgba(100, 120, 220, 0.6)';
        } else {
          ctx.fillStyle = 'rgba(100, 120, 220, 0.3)';
        }
        ctx.fillRect(panelX + 4, y - rowH / 2 + 1, barW, rowH - 2);
      }
    }

    // POC, VAH, VAL, IB labels
    ctx.font = 'bold 7px "Consolas", monospace';
    ctx.textAlign = position === 'right' ? 'right' : 'left';
    const labelX = position === 'right' ? panelX + panelWidth - 4 : panelX + 4;

    // POC
    const pocY = layout.priceToY(tpoData.pocPrice, metrics);
    if (pocY >= footprintAreaY && pocY <= footprintAreaY + footprintAreaHeight) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('POC', labelX, pocY - 2);
    }
    // VAH
    const vahY = layout.priceToY(tpoData.vahPrice, metrics);
    if (vahY >= footprintAreaY && vahY <= footprintAreaY + footprintAreaHeight) {
      ctx.fillStyle = '#7c85f6';
      ctx.fillText('VAH', labelX, vahY - 2);
    }
    // VAL
    const valY = layout.priceToY(tpoData.valPrice, metrics);
    if (valY >= footprintAreaY && valY <= footprintAreaY + footprintAreaHeight) {
      ctx.fillStyle = '#7c85f6';
      ctx.fillText('VAL', labelX, valY - 2);
    }

    // Title
    ctx.font = 'bold 8px "Consolas", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    ctx.fillText('TPO', panelX + 4, footprintAreaY + 10);
  }

  /**
   * Render alert lines on the chart — horizontal lines at alert prices
   */
  renderAlertLines(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    alerts: Array<{ id: string; price: number; direction: 'above' | 'below'; triggered: boolean }>,
    footprintAreaY: number,
    footprintAreaHeight: number,
    width: number,
  ): void {
    if (alerts.length === 0) return;

    ctx.save();
    ctx.lineWidth = 1;

    for (const alert of alerts) {
      if (alert.triggered) continue;

      const y = layout.priceToY(alert.price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;

      const color = alert.direction === 'above' ? '#22c55e' : '#ef4444';

      // Dashed line
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Bell icon + price label on right
      const priceStr = `${alert.direction === 'above' ? '▲' : '▼'} $${alert.price.toFixed(2)}`;
      ctx.font = 'bold 8px "Consolas", monospace';
      const tw = ctx.measureText(priceStr).width;
      const labelX = width - tw - 28;

      // Label background
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(labelX - 4, y - 7, tw + 22, 14, 3);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Bell icon (simple)
      ctx.fillStyle = '#000';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🔔', labelX, y + 3);

      // Price text
      ctx.fillStyle = '#000';
      ctx.font = 'bold 8px "Consolas", monospace';
      ctx.fillText(priceStr, labelX + 12, y + 3);
    }

    ctx.restore();
  }

  /**
   * Format number compactly (1.2K, 3.5M, etc.)
   */
  private formatCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return Math.round(value).toString();
  }

  // ═══════════════════════════════════════════════════════════════
  // FPS TRACKING
  // ═══════════════════════════════════════════════════════════════

  trackFrame(renderStartTime: number): void {
    this._lastRenderMs = performance.now() - renderStartTime;
    this.frameCount++;

    const now = performance.now();
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= 1000) {
      this._currentFps = Math.round((this.frameCount / elapsed) * 1000);
      this.frameCount = 0;
      this.lastFpsTime = now;

      // Periodic cache cleanup
      this.clearStringCache();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Render developing POC line — polyline connecting POC prices across candles
   */
  renderDevelopingPOC(params: RenderParams): void {
    const { ctx, layout, metrics, features, fpWidth, ohlcWidth } = params;
    if (!features.showDevelopingPOC) return;
    if (metrics.visibleCandles.length < 2) return;

    const { footprintAreaY, footprintAreaHeight } = metrics;
    const pocColor = features.developingPOCColor || '#fbbf24';
    const points: { x: number; y: number }[] = [];

    metrics.visibleCandles.forEach((candle, idx) => {
      if (!candle.poc) return;

      const fpX = layout.getFootprintX(idx, metrics);
      const totalFpWidth = (features.showOHLC ? ohlcWidth : 0) + fpWidth;
      const x = fpX + totalFpWidth / 2;
      const y = layout.priceToY(candle.poc, metrics);

      if (y >= footprintAreaY && y <= footprintAreaY + footprintAreaHeight) {
        points.push({ x, y });
      }
    });

    if (points.length < 2) return;

    // Glow layer
    ctx.save();
    ctx.strokeStyle = pocColor;
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.12;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();

    // Main line
    ctx.strokeStyle = pocColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // POC dots at each point
    for (const pt of points) {
      ctx.fillStyle = pocColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Label on the last point
    const last = points[points.length - 1];
    ctx.font = 'bold 8px "Consolas", monospace';
    const tw = ctx.measureText('dPOC').width;
    ctx.fillStyle = pocColor;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(last.x + 6, last.y - 7, tw + 6, 12, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0a0f';
    ctx.textAlign = 'left';
    ctx.fillText('dPOC', last.x + 9, last.y + 3);
  }

  /**
   * Get heatmap color for a given intensity (0-1)
   * Gradient: transparent → dark blue → cyan → yellow → white
   */
  /**
   * Render stacked imbalance zones — semi-transparent rectangles over imbalance areas
   */
  renderStackedImbalances(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    imbalances: import('@/types/footprint').StackedImbalance[],
    rowH: number,
    fpWidth: number,
    ohlcWidth: number,
    showOHLC: boolean,
  ): void {
    if (imbalances.length === 0) return;

    const { footprintAreaY, footprintAreaHeight } = metrics;

    for (const si of imbalances) {
      const startY = layout.priceToY(si.endPrice, metrics) - rowH / 2; // endPrice is higher
      const endY = layout.priceToY(si.startPrice, metrics) + rowH / 2;

      if (endY < footprintAreaY || startY > footprintAreaY + footprintAreaHeight) continue;

      // Find the candle index for this imbalance
      const candleIdx = metrics.visibleCandles.findIndex(c => c.time === si.candleTime);
      if (candleIdx < 0) continue;

      const fpX = layout.getFootprintX(candleIdx, metrics);
      const cellStartX = fpX + (showOHLC ? ohlcWidth : 0);
      const rectH = endY - startY;

      // Semi-transparent zone
      const isBullish = si.direction === 'bullish';
      ctx.fillStyle = isBullish ? '#22c55e' : '#ef4444';
      ctx.globalAlpha = 0.12;
      ctx.fillRect(cellStartX + 1, startY, fpWidth - 2, rectH);
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = isBullish ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.strokeRect(cellStartX + 1, startY, fpWidth - 2, rectH);
      ctx.globalAlpha = 1;

      // Label
      ctx.font = 'bold 7px "Consolas", monospace';
      ctx.fillStyle = isBullish ? '#22c55e' : '#ef4444';
      ctx.globalAlpha = 0.8;
      ctx.textAlign = 'left';
      ctx.fillText(`SI ${si.count}`, cellStartX + 3, startY + 8);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Render naked POC lines — dashed horizontal lines from the candle to the right edge
   */
  renderNakedPOCs(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    nakedPOCs: import('@/types/footprint').NakedPOC[],
    color: string,
    width: number,
  ): void {
    if (nakedPOCs.length === 0) return;

    const { footprintAreaY, footprintAreaHeight } = metrics;

    for (const npoc of nakedPOCs) {
      if (npoc.tested) continue;

      const y = layout.priceToY(npoc.price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;

      // Find candle X position for the start of the line
      const candleIdx = metrics.visibleCandles.findIndex(c => c.time === npoc.candleTime);
      const startX = candleIdx >= 0 ? layout.getFootprintX(candleIdx, metrics) : 0;

      // Dashed line from candle to right edge
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Small diamond marker at origin
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(startX, y - 3);
      ctx.lineTo(startX + 3, y);
      ctx.lineTo(startX, y + 3);
      ctx.lineTo(startX - 3, y);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.font = 'bold 7px "Consolas", monospace';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.textAlign = 'left';
      ctx.fillText('nPOC', startX + 6, y - 3);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Render unfinished auction markers — triangles at high/low with dashed extension
   */
  renderUnfinishedAuctions(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    auctions: import('@/types/footprint').UnfinishedAuction[],
    width: number,
  ): void {
    if (auctions.length === 0) return;

    const { footprintAreaY, footprintAreaHeight } = metrics;

    for (const ua of auctions) {
      if (ua.tested) continue;

      const y = layout.priceToY(ua.price, metrics);
      if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;

      const candleIdx = metrics.visibleCandles.findIndex(c => c.time === ua.candleTime);
      const startX = candleIdx >= 0 ? layout.getFootprintX(candleIdx, metrics) : 0;

      // Color based on side
      const color = ua.side === 'high' ? '#f59e0b' : '#8b5cf6'; // Amber for high, purple for low

      // Triangle marker
      const triSize = 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ua.side === 'high') {
        // Up triangle
        ctx.moveTo(startX, y - triSize);
        ctx.lineTo(startX + triSize, y + triSize);
        ctx.lineTo(startX - triSize, y + triSize);
      } else {
        // Down triangle
        ctx.moveTo(startX, y + triSize);
        ctx.lineTo(startX + triSize, y - triSize);
        ctx.lineTo(startX - triSize, y - triSize);
      }
      ctx.closePath();
      ctx.fill();

      // Dashed extension line
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(startX + triSize + 2, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private getHeatmapColor(intensity: number): string {
    if (intensity < 0.25) {
      // Transparent → dark blue
      const t = intensity / 0.25;
      const r = Math.round(10 * t);
      const g = Math.round(20 * t);
      const b = Math.round(80 * t);
      return `rgb(${r},${g},${b})`;
    } else if (intensity < 0.5) {
      // Dark blue → cyan
      const t = (intensity - 0.25) / 0.25;
      const r = Math.round(10 + 10 * t);
      const g = Math.round(20 + 180 * t);
      const b = Math.round(80 + 140 * t);
      return `rgb(${r},${g},${b})`;
    } else if (intensity < 0.75) {
      // Cyan → yellow
      const t = (intensity - 0.5) / 0.25;
      const r = Math.round(20 + 235 * t);
      const g = Math.round(200 + 55 * t);
      const b = Math.round(220 - 200 * t);
      return `rgb(${r},${g},${b})`;
    } else {
      // Yellow → white
      const t = (intensity - 0.75) / 0.25;
      const r = 255;
      const g = 255;
      const b = Math.round(20 + 235 * t);
      return `rgb(${r},${g},${b})`;
    }
  }

  private renderExtendedLine(
    ctx: CanvasRenderingContext2D,
    color: string,
    startX: number,
    endX: number,
    y: number,
    _areaY: number,
    _areaHeight: number,
    dashed: boolean,
  ): void {
    // Glow
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.08;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.restore();

    // Main line
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1 : 1.5;
    ctx.globalAlpha = dashed ? 0.6 : 0.8;
    if (dashed) ctx.setLineDash([4, 3]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private renderPillLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    ctx.font = 'bold 8px "Consolas", monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(x, y, tw + 6, 12, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0a0f';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 3, y + 9);
  }

  /**
   * Render volume bubbles — circles at each candle center, sized by volume,
   * colored by delta direction, with buy/sell pie-chart split.
   */
  renderVolumeBubbles(
    ctx: CanvasRenderingContext2D,
    layout: FootprintLayoutEngine,
    metrics: LayoutMetrics,
    colors: FootprintColors,
    features: FootprintFeatures,
    fpWidth: number,
    isFootprintMode: boolean,
  ): void {
    const candles = metrics.visibleCandles;
    if (candles.length === 0) return;

    const opacity = features.volumeBubbleOpacity ?? 0.6;
    const maxRadius = features.volumeBubbleMaxSize ?? 30;
    const scaling = features.volumeBubbleScaling ?? 'sqrt';
    const { footprintAreaY, footprintAreaHeight } = metrics;

    // Find max volume for normalization
    let maxVol = 0;
    for (const c of candles) {
      if (c.totalVolume > maxVol) maxVol = c.totalVolume;
    }
    if (maxVol === 0) return;

    ctx.save();

    candles.forEach((candle, idx) => {
      const vol = candle.totalVolume;
      if (vol < 1) return;

      const fpX = layout.getFootprintX(idx, metrics);
      const centerX = fpX + fpWidth / 2;

      // Y = midpoint between open and close
      const midPrice = (candle.open + candle.close) / 2;
      const centerY = layout.priceToY(midPrice, metrics);

      // Clamp to chart area
      if (centerY < footprintAreaY - maxRadius || centerY > footprintAreaY + footprintAreaHeight + maxRadius) return;

      // Size calculation
      const normalizedVol = vol / maxVol;
      let radius: number;
      switch (scaling) {
        case 'linear': radius = normalizedVol * maxRadius; break;
        case 'log': radius = (Math.log(normalizedVol * 100 + 1) / Math.log(101)) * maxRadius; break;
        default: radius = Math.sqrt(normalizedVol) * maxRadius; break; // sqrt
      }
      radius = Math.max(3, Math.min(maxRadius, radius));

      const bidVol = candle.totalSellVolume;
      const askVol = candle.totalBuyVolume;
      const buyRatio = askVol / (bidVol + askVol); // ask = buyer-initiated
      const isBullish = candle.close >= candle.open;

      // Outer glow
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
      ctx.globalAlpha = opacity * 0.1;
      ctx.fill();

      // Pie chart: buy (ask) side on top, sell (bid) side on bottom
      const startAngle = -Math.PI / 2;
      const splitAngle = startAngle + buyRatio * Math.PI * 2;

      // Buy (ask) slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, splitAngle);
      ctx.closePath();
      ctx.fillStyle = colors.candleUpBody;
      ctx.globalAlpha = opacity * 0.55;
      ctx.fill();

      // Sell (bid) slice
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, splitAngle, startAngle + Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = colors.candleDownBody;
      ctx.globalAlpha = opacity * 0.55;
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isBullish ? colors.candleUpBody : colors.candleDownBody;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = opacity * 0.8;
      ctx.stroke();

      // Divider line between slices
      if (buyRatio > 0.05 && buyRatio < 0.95) {
        const dx = Math.cos(splitAngle) * radius;
        const dy = Math.sin(splitAngle) * radius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(centerX + dx, centerY + dy);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = opacity;
        ctx.stroke();
      }

      // Volume label (only for large bubbles)
      if (radius >= 14) {
        ctx.globalAlpha = opacity * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${radius >= 22 ? 9 : 7}px "Consolas", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const volLabel = vol >= 1000 ? `${(vol / 1000).toFixed(1)}K` : Math.round(vol).toString();
        ctx.fillText(volLabel, centerX, centerY);
      }
    });

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Render cell hover tooltip with bid/ask/delta breakdown
   */
  renderCellTooltip(
    ctx: CanvasRenderingContext2D,
    mouseX: number,
    mouseY: number,
    price: number,
    level: { bidVolume: number; askVolume: number; delta: number; totalVolume: number; imbalanceBuy: boolean; imbalanceSell: boolean },
    candleTotalVol: number,
    canvasWidth: number,
    canvasHeight: number,
    tickSize: number,
    colors: { textPrimary: string; textSecondary: string; textMuted: string; bidColor: string; askColor: string },
  ): void {
    const padding = 10;
    const lineHeight = 16;
    const tooltipWidth = 185;
    const tooltipHeight = padding * 2 + lineHeight * 4 + 4;

    // Position: offset from cursor, flip if near edges
    let tx = mouseX + 18;
    let ty = mouseY - tooltipHeight / 2;
    if (tx + tooltipWidth > canvasWidth - 65) tx = mouseX - tooltipWidth - 18;
    if (ty < 5) ty = 5;
    if (ty + tooltipHeight > canvasHeight - 5) ty = canvasHeight - tooltipHeight - 5;

    // Background with rounded corners
    ctx.save();
    ctx.fillStyle = 'rgba(12, 12, 18, 0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx, ty, tooltipWidth, tooltipHeight, 6);
    ctx.fill();
    ctx.stroke();

    const font = '10px "Consolas", "Monaco", monospace';
    const boldFont = 'bold 10px "Consolas", "Monaco", monospace';
    const x = tx + padding;
    let y = ty + padding + 11;

    // Line 1: Price
    const pricePrecision = Math.max(Math.round(-Math.log10(tickSize)), 0);
    ctx.font = boldFont;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`$${price.toFixed(pricePrecision)}`, x, y);

    // Imbalance badge
    if (level.imbalanceBuy || level.imbalanceSell) {
      const badge = level.imbalanceBuy ? 'IMB BUY' : 'IMB SELL';
      const badgeColor = level.imbalanceBuy ? '#26a69a' : '#ef5350';
      ctx.font = 'bold 8px "Consolas", monospace';
      const bw = ctx.measureText(badge).width + 8;
      const bx = tx + tooltipWidth - padding - bw;
      ctx.fillStyle = badgeColor;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.roundRect(bx, y - 10, bw, 13, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, bx + 4, y);
    }

    y += lineHeight + 2;

    // Line 2: Bid | Ask
    ctx.font = font;
    ctx.fillStyle = colors.bidColor;
    ctx.fillText(`Bid: ${level.bidVolume.toFixed(1)}`, x, y);
    ctx.fillStyle = colors.textMuted;
    ctx.fillText('|', x + 78, y);
    ctx.fillStyle = colors.askColor;
    ctx.fillText(`Ask: ${level.askVolume.toFixed(1)}`, x + 88, y);

    y += lineHeight;

    // Line 3: Delta | Vol
    const deltaSign = level.delta >= 0 ? '+' : '';
    ctx.fillStyle = level.delta >= 0 ? '#26a69a' : '#ef5350';
    ctx.fillText(`Delta: ${deltaSign}${level.delta.toFixed(1)}`, x, y);
    ctx.fillStyle = colors.textMuted;
    ctx.fillText('|', x + 78, y);
    ctx.fillStyle = colors.textSecondary;
    ctx.fillText(`Vol: ${level.totalVolume.toFixed(1)}`, x + 88, y);

    y += lineHeight;

    // Line 4: % of candle
    const pct = candleTotalVol > 0 ? (level.totalVolume / candleTotalVol * 100) : 0;
    ctx.fillStyle = colors.textMuted;
    ctx.fillText(`${pct.toFixed(1)}% of candle`, x, y);

    // Volume bar visualization
    const barMaxW = 60;
    const barH = 4;
    const barX = tx + tooltipWidth - padding - barMaxW;
    const barY = y - 5;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(barX, barY, barMaxW, barH);
    const fillW = Math.min(barMaxW, barMaxW * Math.min(pct / 30, 1)); // Normalize to ~30% max
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(barX, barY, fillW, barH);

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════
// STANDALONE FORMAT FUNCTIONS (exported for backward compatibility)
// ═══════════════════════════════════════════════════════════════

export function formatVolATAS(vol: number, zoom: number = 1): string {
  const abs = Math.abs(vol);
  if (abs < 1) return '';

  if (zoom < 0.5) {
    if (abs >= 1000000) return `${Math.round(vol / 1000000)}M`;
    if (abs >= 1000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 100) return Math.round(vol / 10) * 10 + '';
    return Math.round(vol).toString();
  } else if (zoom < 0.8) {
    if (abs >= 100000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 10000) return `${(vol / 1000).toFixed(0)}K`;
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return Math.round(vol).toString();
  } else if (zoom < 1.2) {
    if (abs >= 10000) return `${Math.round(vol / 1000)}K`;
    if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return Math.round(vol).toString();
  } else {
    if (abs >= 100000) return `${(vol / 1000).toFixed(1)}K`;
    if (abs >= 10000) return Math.round(vol).toLocaleString();
    return Math.round(vol).toString();
  }
}

export function formatVolCluster(vol: number): string {
  const abs = Math.abs(vol);
  if (abs < 0.1) return '0';
  if (abs >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${Math.round(vol / 1000)}K`;
  if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return Math.round(vol).toString();
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════

let _renderer: FootprintCanvasRenderer | null = null;

export function getFootprintRenderer(): FootprintCanvasRenderer {
  if (!_renderer) {
    _renderer = new FootprintCanvasRenderer();
  }
  return _renderer;
}

export function resetFootprintRenderer(): void {
  _renderer = null;
}
