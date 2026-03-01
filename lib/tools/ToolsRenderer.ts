/**
 * TOOLS RENDERER
 *
 * Rendu professionnel des outils sur canvas
 * Professional style with:
 * - Handles de sélection
 * - Labels de prix
 * - Zones colorées
 * - Lignes étendues
 */

import type { Tool, PreviewTool, Handle, RectangleZone, ParallelChannelTool, FibExtensionTool, MeasureTool, EllipseTool } from './types';
import { ToolsEngine, getToolsEngine } from './ToolsEngine';
import { usePreferencesStore } from '@/stores/usePreferencesStore';

// ============ TYPES ============

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  priceToY: (price: number) => number;
  yToPrice: (y: number) => number;
  timeToX: (time: number) => number;
  xToTime: (x: number) => number;
  tickSize: number;
  colors: {
    positive: string;
    negative: string;
    selection: string;
    handle: string;
    handleBorder: string;
  };
  currentPrice?: number;  // Current live price for position tracking arrows
  hoveredToolId?: string | null;
  hoveredHandle?: string | null;
  dpr?: number; // Device pixel ratio for sharp rendering
}

// ============ PIXEL-PERFECT HELPERS ============

/**
 * Align coordinate to pixel boundary for crisp 1px lines
 * For odd stroke widths (1px, 3px), add 0.5 to center on pixel
 * For even stroke widths (2px, 4px), use integer coordinates
 */
function alignToPixel(coord: number, strokeWidth: number = 1): number {
  const rounded = Math.round(coord);
  return strokeWidth % 2 === 1 ? rounded + 0.5 : rounded;
}

/**
 * Round coordinate to nearest integer for fills and even strokes
 */
function roundCoord(coord: number): number {
  return Math.round(coord);
}

// ============ TOOLS RENDERER ============

export class ToolsRenderer {
  private engine: ToolsEngine;
  private pathCache: Map<string, { tool: Tool; path: Path2D; timestamp: number }> = new Map();
  private lastRenderTime = 0;
  private frameRequest: number | null = null;

  constructor() {
    this.engine = getToolsEngine();
  }

  /**
   * Check if a tool is visible in the current viewport
   * Returns true if the tool intersects with the visible area
   */
  private isToolVisible(tool: Tool, context: RenderContext): boolean {
    const { width, height, priceToY, timeToX, xToTime, yToPrice } = context;

    // Get viewport bounds
    const viewportMinPrice = yToPrice(height);
    const viewportMaxPrice = yToPrice(0);
    const viewportMinTime = xToTime(0);
    const viewportMaxTime = xToTime(width);

    // Check each tool type
    switch (tool.type) {
      case 'horizontalLine':
      case 'horizontalRay': {
        const price = tool.type === 'horizontalLine' ? tool.price : (tool as any).startPoint?.price;
        return price >= viewportMinPrice && price <= viewportMaxPrice;
      }

      case 'verticalLine': {
        const time = (tool as any).time;
        return time >= viewportMinTime && time <= viewportMaxTime;
      }

      case 'trendline':
      case 'rectangle':
      case 'fibRetracement': {
        const startPoint = (tool as any).startPoint;
        const endPoint = (tool as any).endPoint || (tool as any).bottomRight;
        if (!startPoint || !endPoint) return true; // Render if we can't determine bounds

        const minPrice = Math.min(startPoint.price, endPoint.price);
        const maxPrice = Math.max(startPoint.price, endPoint.price);
        const minTime = Math.min(startPoint.time, endPoint.time);
        const maxTime = Math.max(startPoint.time, endPoint.time);

        // Check if tool bounds intersect with viewport
        const priceOverlap = minPrice <= viewportMaxPrice && maxPrice >= viewportMinPrice;
        const timeOverlap = minTime <= viewportMaxTime && maxTime >= viewportMinTime;
        return priceOverlap && timeOverlap;
      }

      case 'longPosition':
      case 'shortPosition':
      case 'text': {
        const price = (tool as any).price || (tool as any).point?.price;
        const time = (tool as any).time || (tool as any).point?.time;
        if (!price || !time) return true;

        const priceVisible = price >= viewportMinPrice && price <= viewportMaxPrice;
        const timeVisible = time >= viewportMinTime && time <= viewportMaxTime;
        return priceVisible && timeVisible;
      }

      default:
        return true; // Render unknown types
    }
  }

  /**
   * Render all tools with viewport culling
   */
  render(context: RenderContext): void {
    const { ctx } = context;
    const tools = this.engine.getAllTools();

    let renderedCount = 0;
    let culledCount = 0;

    // Render tools in z-order, skip invisible ones
    tools.forEach(tool => {
      if (!tool.visible) return;

      // Viewport culling: skip tools outside visible area
      if (!this.isToolVisible(tool, context)) {
        culledCount++;
        return;
      }

      renderedCount++;
      this.renderTool(tool, context);
    });

    // Debug info (comment out in production)
    // console.log(`Rendered: ${renderedCount}, Culled: ${culledCount}`);

    // Render preview if drawing
    const drawingState = this.engine.getDrawingState();
    if (drawingState.previewTool) {
      ctx.globalAlpha = 0.6;
      // Create a mock tool with default values for rendering
      const previewAsTool = {
        ...drawingState.previewTool,
        id: 'preview',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        selected: false,
        zIndex: 9999,
      } as Tool;
      this.renderTool(previewAsTool, context);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Render a single tool
   */
  private renderTool(tool: Tool, context: RenderContext): void {
    const { ctx } = context;
    const isHovered = context.hoveredToolId === tool.id;

    // Apply style — flat, no glow
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = tool.selected
      ? tool.style.lineWidth + 1
      : isHovered
        ? tool.style.lineWidth + 0.5
        : tool.style.lineWidth;
    this.setLineDash(ctx, tool.style.lineStyle);

    switch (tool.type) {
      case 'horizontalLine':
        this.renderHorizontalLine(tool, context);
        break;
      case 'horizontalRay':
        this.renderHorizontalRay(tool, context);
        break;
      case 'verticalLine':
        this.renderVerticalLine(tool, context);
        break;
      case 'trendline':
        this.renderTrendline(tool, context);
        break;
      case 'rectangle':
        this.renderRectangle(tool, context);
        break;
      case 'fibRetracement':
        this.renderFibRetracement(tool, context);
        break;
      case 'longPosition':
      case 'shortPosition':
        this.renderPosition(tool, context);
        break;
      case 'text':
        this.renderText(tool, context);
        break;
      case 'parallelChannel':
        this.renderParallelChannel(tool as any, context);
        break;
      case 'fibExtension':
        this.renderFibExtension(tool as any, context);
        break;
      case 'measure':
        this.renderMeasure(tool as any, context);
        break;
      case 'ellipse':
        this.renderEllipse(tool as any, context);
        break;
    }

    // Render attached text
    if (tool.text?.content) {
      this.renderAttachedText(tool, context);
    }

    // Render handles if selected (skip for position tools — they have custom handles)
    if (tool.selected && tool.type !== 'longPosition' && tool.type !== 'shortPosition') {
      this.renderHandles(tool, context);
    }

    // Reset line dash
    ctx.setLineDash([]);
  }

  /**
   * Set line dash based on style
   */
  private setLineDash(ctx: CanvasRenderingContext2D, style: string): void {
    switch (style) {
      case 'dashed':
        ctx.setLineDash([8, 4]);
        break;
      case 'dotted':
        ctx.setLineDash([2, 2]);
        break;
      default:
        ctx.setLineDash([]);
    }
  }

  // ============ HORIZONTAL LINE ============

  private renderHorizontalLine(tool: Tool & { type: 'horizontalLine' }, context: RenderContext): void {
    const { ctx, width, priceToY } = context;

    // FIXED: Pixel-perfect Y coordinate
    const rawY = priceToY(tool.price);
    const lineWidth = tool.style.lineWidth;
    const y = alignToPixel(rawY, lineWidth);

    // Selection highlight (draw first)
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = lineWidth + 4;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Main line - pixel-perfect
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = lineWidth;
    this.setLineDash(ctx, tool.style.lineStyle);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label
    if (tool.showPrice) {
      this.renderPriceLabel(ctx, tool.price, width - 5, roundCoord(rawY), tool.style.color, 'right');
    }

    // Left anchor point (for visual feedback)
    const anchorSize = tool.selected ? 6 : 4;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(10, roundCoord(rawY), anchorSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ============ HORIZONTAL RAY ============

  private renderHorizontalRay(tool: Tool & { type: 'horizontalRay' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;
    const lineWidth = tool.style.lineWidth || 1;
    // FIXED: Pixel-perfect coordinates for crisp horizontal line
    const rawY = priceToY(tool.startPoint.price);
    const y = alignToPixel(rawY, lineWidth);
    const x = roundCoord(timeToX(tool.startPoint.time));

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(roundCoord(tool.direction === 'right' ? width : 0), y);
    ctx.stroke();

    // Start point marker
    ctx.fillStyle = tool.style.color;
    ctx.beginPath();
    ctx.arc(x, roundCoord(rawY), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============ VERTICAL LINE ============

  private renderVerticalLine(tool: Tool & { type: 'verticalLine' }, context: RenderContext): void {
    const { ctx, height, timeToX } = context;

    // FIXED: Pixel-perfect X coordinate
    const rawX = timeToX(tool.time);
    const lineWidth = tool.style.lineWidth;
    const x = alignToPixel(rawX, lineWidth);

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Time label
    if (tool.showTime) {
      const date = new Date(tool.time * 1000);
      const label = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

      ctx.fillStyle = tool.style.color;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, roundCoord(rawX), height - 5);
    }
  }

  // ============ TRENDLINE ============

  private renderTrendline(tool: Tool & { type: 'trendline' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;

    // FIXED: Use pixel-perfect coordinates
    const x1 = roundCoord(timeToX(tool.startPoint.time));
    const y1 = roundCoord(priceToY(tool.startPoint.price));
    const x2 = roundCoord(timeToX(tool.endPoint.time));
    const y2 = roundCoord(priceToY(tool.endPoint.price));

    // Calculate extension points
    let startX = x1, startY = y1, endX = x2, endY = y2;

    if (tool.extendLeft || tool.extendRight) {
      const dx = x2 - x1;
      const dy = y2 - y1;

      if (dx !== 0) {
        const slope = dy / dx;

        if (tool.extendLeft) {
          startX = 0;
          startY = roundCoord(y1 - (x1 * slope));
        }

        if (tool.extendRight) {
          endX = width;
          endY = roundCoord(y2 + ((width - x2) * slope));
        }
      }
    }

    // FIXED: Pixel-aligned line coordinates
    const lineWidth = tool.style.lineWidth;
    const alignedStartX = alignToPixel(startX, lineWidth);
    const alignedStartY = alignToPixel(startY, lineWidth);
    const alignedEndX = alignToPixel(endX, lineWidth);
    const alignedEndY = alignToPixel(endY, lineWidth);

    // Selection highlight (draw first, behind the line)
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = lineWidth + 4;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(alignedStartX, alignedStartY);
      ctx.lineTo(alignedEndX, alignedEndY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Line - pixel-perfect
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(alignedStartX, alignedStartY);
    ctx.lineTo(alignedEndX, alignedEndY);
    ctx.stroke();

    // Endpoint markers (always visible, not just when selected)
    const markerSize = tool.selected ? 6 : 4;

    // Start point - use integer coordinates for fills
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x1, y1, markerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // End point
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x2, y2, markerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ============ RECTANGLE (Enhanced with Zones) ============

  private renderRectangle(tool: Tool & { type: 'rectangle' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX, width } = context;

    // FIXED: Pixel-perfect coordinates
    const x1 = roundCoord(timeToX(tool.topLeft.time));
    const y1 = roundCoord(priceToY(tool.topLeft.price));
    const x2 = roundCoord(timeToX(tool.bottomRight.time));
    const y2 = roundCoord(priceToY(tool.bottomRight.price));

    // Normalize coordinates (handle inverted rectangles)
    let minX = Math.min(x1, x2);
    let maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const h = maxY - minY;

    // Handle extensions
    const extendedLeft = tool.extendLeft ? 0 : minX;
    const extendedRight = tool.extendRight ? width : maxX;
    const w = extendedRight - extendedLeft;

    // Selection highlight (draw first)
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([]);
      ctx.strokeRect(extendedLeft - 2, minY - 2, w + 4, h + 4);
      ctx.globalAlpha = 1;
    }

    // Fill
    if (tool.style.fillColor) {
      ctx.fillStyle = tool.style.fillColor;
      ctx.globalAlpha = tool.style.fillOpacity || 0.15;
      ctx.fillRect(extendedLeft, minY, w, h);
      ctx.globalAlpha = 1;
    }

    // Zone fills (alternating subtle backgrounds)
    if (tool.showZones && tool.zones && tool.zones.length > 0) {
      const sortedZones = [...tool.zones].sort((a, b) => a.level - b.level);
      let prevY = minY;

      sortedZones.forEach((zone, index) => {
        const zoneY = minY + h * zone.level;
        const zoneHeight = zoneY - prevY;

        // Alternate zone fill colors
        if (index % 2 === 1) {
          ctx.fillStyle = tool.style.fillColor || tool.style.color;
          ctx.globalAlpha = tool.zoneFillOpacity || 0.05;
          ctx.fillRect(extendedLeft, prevY, w, zoneHeight);
          ctx.globalAlpha = 1;
        }

        prevY = zoneY;
      });
    }

    // Border (main rectangle)
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = tool.style.lineWidth;
    this.setLineDash(ctx, tool.style.lineStyle);
    ctx.strokeRect(extendedLeft, minY, w, h);
    ctx.setLineDash([]);

    // Render zones
    if (tool.showZones && tool.zones && tool.zones.length > 0) {
      tool.zones.forEach(zone => {
        this.renderRectangleZone(tool, zone, extendedLeft, extendedRight, minY, maxY, h, context);
      });
    }

    // Render median line (if enabled and zones not shown)
    if (tool.showMedianLine && !tool.showZones) {
      const medianY = minY + h * 0.5;
      ctx.strokeStyle = tool.style.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(extendedLeft, medianY);
      ctx.lineTo(extendedRight, medianY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Median label
      ctx.fillStyle = tool.style.color;
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('50%', extendedLeft + 4, medianY - 3);

      // Median price
      if (tool.showPriceLabels) {
        const medianPrice = tool.bottomRight.price + (tool.topLeft.price - tool.bottomRight.price) * 0.5;
        ctx.textAlign = 'right';
        ctx.fillText(medianPrice.toFixed(2), extendedRight - 4, medianY - 3);
      }
    }

    // Price labels at top/bottom
    if (tool.showPriceLabels) {
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';

      // Top price
      ctx.fillStyle = tool.style.color;
      ctx.globalAlpha = 0.9;
      ctx.fillText(tool.topLeft.price.toFixed(2), extendedRight - 4, minY + 10);

      // Bottom price
      ctx.fillText(tool.bottomRight.price.toFixed(2), extendedRight - 4, maxY - 4);
      ctx.globalAlpha = 1;
    }

    // Extension indicators
    if (tool.extendLeft || tool.extendRight) {
      ctx.fillStyle = tool.style.color;
      ctx.globalAlpha = 0.5;
      const arrowSize = 6;

      if (tool.extendLeft) {
        // Left arrow indicator
        ctx.beginPath();
        ctx.moveTo(extendedLeft + arrowSize, minY + h/2 - arrowSize);
        ctx.lineTo(extendedLeft, minY + h/2);
        ctx.lineTo(extendedLeft + arrowSize, minY + h/2 + arrowSize);
        ctx.fill();
      }

      if (tool.extendRight) {
        // Right arrow indicator
        ctx.beginPath();
        ctx.moveTo(extendedRight - arrowSize, minY + h/2 - arrowSize);
        ctx.lineTo(extendedRight, minY + h/2);
        ctx.lineTo(extendedRight - arrowSize, minY + h/2 + arrowSize);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Corner indicators when not selected (subtle)
    if (!tool.selected) {
      const cornerSize = 4;
      ctx.fillStyle = tool.style.color;
      ctx.globalAlpha = 0.6;
      // Top-left (original bounds)
      ctx.fillRect(minX - cornerSize/2, minY - cornerSize/2, cornerSize, cornerSize);
      // Top-right (original bounds)
      ctx.fillRect(maxX - cornerSize/2, minY - cornerSize/2, cornerSize, cornerSize);
      // Bottom-left (original bounds)
      ctx.fillRect(minX - cornerSize/2, maxY - cornerSize/2, cornerSize, cornerSize);
      // Bottom-right (original bounds)
      ctx.fillRect(maxX - cornerSize/2, maxY - cornerSize/2, cornerSize, cornerSize);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Render a single zone line within a rectangle
   */
  private renderRectangleZone(
    tool: Tool & { type: 'rectangle' },
    zone: { level: number; label: string; color?: string; lineStyle?: string; showLabel?: boolean; showPrice?: boolean },
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    height: number,
    context: RenderContext
  ): void {
    const { ctx } = context;
    const y = minY + height * zone.level;

    // Zone line
    ctx.strokeStyle = zone.color || tool.style.color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;

    // Set line style
    switch (zone.lineStyle) {
      case 'dotted':
        ctx.setLineDash([2, 2]);
        break;
      case 'dashed':
        ctx.setLineDash([6, 4]);
        break;
      default:
        ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Zone label
    if (zone.showLabel !== false) {
      ctx.fillStyle = zone.color || tool.style.color;
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.globalAlpha = 0.8;
      ctx.fillText(zone.label, minX + 4, y - 3);
      ctx.globalAlpha = 1;
    }

    // Zone price
    if (zone.showPrice !== false && tool.showPriceLabels) {
      const zonePrice = tool.bottomRight.price + (tool.topLeft.price - tool.bottomRight.price) * (1 - zone.level);
      ctx.fillStyle = zone.color || tool.style.color;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.globalAlpha = 0.7;
      ctx.fillText(zonePrice.toFixed(2), maxX - 4, y - 3);
      ctx.globalAlpha = 1;
    }
  }

  // ============ FIBONACCI RETRACEMENT ============

  private renderFibRetracement(tool: Tool & { type: 'fibRetracement' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;

    // FIXED: Pixel-perfect coordinates for crisp rendering
    const x1 = roundCoord(timeToX(tool.startPoint.time));
    const x2 = roundCoord(timeToX(tool.endPoint.time));
    const startPrice = tool.startPoint.price;
    const endPrice = tool.endPoint.price;
    const priceRange = endPrice - startPrice;
    const lineWidth = tool.style.lineWidth || 1;

    // Calculate boundaries based on extension settings
    // FIXED: Respect extendLeft and extendRight settings - DEFAULT is NO extension
    const leftBound = tool.extendLeft ? 0 : Math.min(x1, x2);
    const rightBound = tool.extendRight ? roundCoord(width) : Math.max(x1, x2);

    // Draw levels
    tool.levels.forEach((level, index) => {
      const price = startPrice + priceRange * level;
      // FIXED: Use alignToPixel for horizontal lines to ensure crisp 1px rendering
      const y = alignToPixel(priceToY(price), lineWidth);

      // Level line
      ctx.strokeStyle = tool.style.color;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = 0.5 + (level === 0.618 ? 0.3 : 0);
      ctx.beginPath();
      ctx.moveTo(leftBound, y);
      ctx.lineTo(rightBound, y);  // USE CALCULATED BOUNDS
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Fill between levels - only if showFills is enabled
      if (tool.showFills && index > 0) {
        const prevLevel = tool.levels[index - 1];
        const prevPrice = startPrice + priceRange * prevLevel;
        const prevY = roundCoord(priceToY(prevPrice));
        const currY = roundCoord(priceToY(price));

        ctx.fillStyle = tool.style.fillColor || tool.style.color;
        ctx.globalAlpha = tool.style.fillOpacity || 0.05;
        ctx.fillRect(leftBound, Math.min(currY, prevY), rightBound - leftBound, Math.abs(currY - prevY));
        ctx.globalAlpha = 1;
      }

      // Labels
      if (tool.showLabels) {
        ctx.fillStyle = tool.style.color;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${(level * 100).toFixed(1)}%`, leftBound + 5, roundCoord(priceToY(price)) - 3);
      }

      if (tool.showPrices) {
        ctx.textAlign = 'right';
        ctx.fillText(`$${price.toFixed(2)}`, rightBound - 5, roundCoord(priceToY(price)) - 3);
      }
    });

    // Main trendline - FIXED: use alignToPixel for crisp diagonal line
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(alignToPixel(x1, 2), alignToPixel(priceToY(startPrice), 2));
    ctx.lineTo(alignToPixel(x2, 2), alignToPixel(priceToY(endPrice), 2));
    ctx.stroke();
  }

  // ============ POSITION (LONG/SHORT) - Professional Style ============

  private renderPosition(tool: Tool & { type: 'longPosition' | 'shortPosition' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX, width } = context;

    // ═══ VIEWPORT CLIPPING — prevent overflow into price scale / VP panel ═══
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, context.height);
    ctx.clip();

    const entryY = Math.round(priceToY(tool.entry));
    const slY = Math.round(priceToY(tool.stopLoss));
    const tpY = Math.round(priceToY(tool.takeProfit));
    const leftX = Math.round(timeToX(tool.startTime));
    const rightX = Math.min(Math.round(timeToX(tool.endTime)), Math.round(width));

    const isLong = tool.type === 'longPosition';

    // ═══ Read settings from store ═══
    const prefs = usePreferencesStore.getState();
    const tpColor = prefs.posTpColor;
    const slColor = prefs.posSlColor;
    const posEntryColor = prefs.posEntryColor;
    const zoneAlpha = prefs.posZoneOpacity;
    const showFill = prefs.posShowZoneFill;
    const showLabels = prefs.posShowLabels;
    const defaultCompact = prefs.posDefaultCompact;
    const smartArrowEnabled = prefs.posSmartArrow;
    const dynamicOpacityEnabled = prefs.posDynamicOpacity;
    const opacityCurve = prefs.posOpacityCurve;
    const opacityIntensity = (prefs.posOpacityIntensity ?? 60) / 100;

    // ═══ Colors (from settings) ═══
    const profitLine = tpColor;
    const riskLine = slColor;
    const entryColor = posEntryColor;

    // Zone fills with configurable opacity
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const profitFill = hexToRgba(profitLine, zoneAlpha);
    const riskFill = hexToRgba(riskLine, zoneAlpha);

    // ═══ Metrics ═══
    const risk = Math.abs(tool.entry - tool.stopLoss);
    const reward = Math.abs(tool.takeProfit - tool.entry);
    const rr = risk > 0 ? (reward / risk).toFixed(2) : '0.00';
    const pnlPct = ((reward / tool.entry) * 100).toFixed(2);
    const riskPct = ((risk / tool.entry) * 100).toFixed(2);

    // Position sizing
    const accountSize = tool.accountSize || 10000;
    const riskPercent = tool.riskPercent || 1;
    const leverage = tool.leverage || 1;
    const dollarRisk = accountSize * (riskPercent / 100);
    const positionSize = risk > 0 ? dollarRisk / risk : 0;
    const leveragedSize = positionSize * leverage;
    const dollarPnL = leveragedSize * reward;
    const dollarLoss = dollarRisk;
    const showPosSize = tool.showPositionSize === true;
    const showDollarPnL = tool.showDollarPnL === true;

    // ═══ EXPONENTIAL OPACITY ENGINE — Zone Fill ═══
    // Curve function: maps linear progress [0,1] → opacity multiplier
    const applyCurve = (t: number): number => {
      if (!dynamicOpacityEnabled) return t;
      switch (opacityCurve) {
        case 'exponential': return Math.pow(t, 1.8);
        case 'aggressive': return Math.pow(t, 2.5);
        default: return t; // linear
      }
    };

    if (showFill && tool.showZoneFill !== false) {
      const livePrice = context.currentPrice || 0;
      const priceInRange = livePrice > 0
        && livePrice > Math.min(tool.stopLoss, tool.takeProfit)
        && livePrice < Math.max(tool.stopLoss, tool.takeProfit);

      const baseAlpha = zoneAlpha;
      const dynamicFactor = 0.45 * opacityIntensity;
      const maxAlpha = Math.min(baseAlpha + dynamicFactor, 0.57);
      const zoneW = rightX - leftX;

      if (priceInRange && dynamicOpacityEnabled) {
        const livePriceY = Math.round(priceToY(livePrice));

        // Progress toward TP or SL (0 = at entry, 1 = at target)
        const tpDist = Math.abs(tool.takeProfit - tool.entry);
        const slDist = Math.abs(tool.stopLoss - tool.entry);
        const profitProgress = tpDist > 0
          ? Math.min(1, Math.max(0, (isLong ? livePrice - tool.entry : tool.entry - livePrice) / tpDist))
          : 0;
        const riskProgress = slDist > 0
          ? Math.min(1, Math.max(0, (isLong ? tool.entry - livePrice : livePrice - tool.entry) / slDist))
          : 0;

        // --- Profit zone (entry ↔ TP) ---
        if (profitProgress > 0) {
          // Reached portion: directional gradient (intense near price, soft near entry)
          const reachedAlpha = baseAlpha + applyCurve(profitProgress) * dynamicFactor;
          const clampedAlpha = Math.min(reachedAlpha, maxAlpha);
          const reachedTop = Math.min(entryY, livePriceY);
          const reachedH = Math.abs(livePriceY - entryY);
          if (reachedH > 1) {
            const grad = ctx.createLinearGradient(0, entryY, 0, livePriceY);
            grad.addColorStop(0, hexToRgba(profitLine, baseAlpha * 0.5));
            grad.addColorStop(1, hexToRgba(profitLine, clampedAlpha));
            ctx.fillStyle = grad;
            ctx.fillRect(leftX, reachedTop, zoneW, reachedH);
          }
          // Unreached portion (live price → TP) — static dim
          const unTop = Math.min(tpY, livePriceY);
          const unH = Math.abs(livePriceY - tpY);
          if (unH > 1) {
            ctx.fillStyle = hexToRgba(profitLine, baseAlpha * 0.25);
            ctx.fillRect(leftX, unTop, zoneW, unH);
          }
        } else {
          // No profit progress — static base
          ctx.fillStyle = hexToRgba(profitLine, baseAlpha * 0.3);
          ctx.fillRect(leftX, Math.min(entryY, tpY), zoneW, Math.abs(tpY - entryY));
        }

        // --- Risk zone (entry ↔ SL) ---
        if (riskProgress > 0) {
          const reachedAlpha = baseAlpha + applyCurve(riskProgress) * dynamicFactor;
          const clampedAlpha = Math.min(reachedAlpha, maxAlpha);
          const reachedTop = Math.min(entryY, livePriceY);
          const reachedH = Math.abs(livePriceY - entryY);
          if (reachedH > 1) {
            const grad = ctx.createLinearGradient(0, entryY, 0, livePriceY);
            grad.addColorStop(0, hexToRgba(riskLine, baseAlpha * 0.5));
            grad.addColorStop(1, hexToRgba(riskLine, clampedAlpha));
            ctx.fillStyle = grad;
            ctx.fillRect(leftX, reachedTop, zoneW, reachedH);
          }
          // Unreached portion
          const unTop = Math.min(slY, livePriceY);
          const unH = Math.abs(livePriceY - slY);
          if (unH > 1) {
            ctx.fillStyle = hexToRgba(riskLine, baseAlpha * 0.25);
            ctx.fillRect(leftX, unTop, zoneW, unH);
          }
        } else {
          ctx.fillStyle = hexToRgba(riskLine, baseAlpha * 0.3);
          ctx.fillRect(leftX, Math.min(entryY, slY), zoneW, Math.abs(slY - entryY));
        }
      } else {
        // Static fill — no live price or dynamic disabled
        ctx.fillStyle = hexToRgba(profitLine, baseAlpha);
        ctx.fillRect(leftX, Math.min(entryY, tpY), zoneW, Math.abs(tpY - entryY));
        ctx.fillStyle = hexToRgba(riskLine, baseAlpha);
        ctx.fillRect(leftX, Math.min(entryY, slY), zoneW, Math.abs(slY - entryY));
      }
    }

    // ═══ ENTRY LINE ═══
    ctx.strokeStyle = entryColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(leftX, entryY + 0.5);
    ctx.lineTo(rightX, entryY + 0.5);
    ctx.stroke();

    // ═══ TP LINE ═══
    ctx.strokeStyle = profitLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(leftX, tpY + 0.5);
    ctx.lineTo(rightX, tpY + 0.5);
    ctx.stroke();

    // ═══ SL LINE ═══
    ctx.strokeStyle = riskLine;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(leftX, slY + 0.5);
    ctx.lineTo(rightX, slY + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // ═══ SMART PRICE-FOLLOW ARROW (Advanced) ═══
    const livePrice = context.currentPrice || 0;
    if (smartArrowEnabled && livePrice > 0) {
      const livePriceY = Math.round(priceToY(livePrice));
      const arrowX = rightX + 6;
      const arrowSize = 5;

      // Direction & color — smooth transition
      const inProfit = isLong ? livePrice > tool.entry : livePrice < tool.entry;
      const inLoss = isLong ? livePrice < tool.entry : livePrice > tool.entry;
      const priceDelta = Math.abs(livePrice - tool.entry);
      const neutralZone = tool.entry * 0.0001; // 0.01% dead zone
      const isNeutral = priceDelta < neutralZone;
      const arrowColor = isNeutral ? entryColor : inProfit ? tpColor : slColor;
      const arrowUp = isLong ? livePrice > tool.entry : livePrice < tool.entry;

      // Arrow opacity: subtle when neutral, stronger when directional
      const dist = Math.abs(livePrice - tool.entry) / tool.entry;
      const arrowOpacity = Math.min(0.9, 0.4 + dist * 20);

      // Connector: horizontal from entry rightX → arrowX
      ctx.strokeStyle = hexToRgba(arrowColor, 0.2);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(rightX, entryY + 0.5);
      ctx.lineTo(arrowX, entryY + 0.5);
      ctx.stroke();

      // Connector: vertical from entry → live price
      if (Math.abs(livePriceY - entryY) > 4) {
        // Gradient connector — fades from entry to price
        const connGrad = ctx.createLinearGradient(0, entryY, 0, livePriceY);
        connGrad.addColorStop(0, hexToRgba(arrowColor, 0.1));
        connGrad.addColorStop(1, hexToRgba(arrowColor, 0.35));
        ctx.strokeStyle = connGrad;
        ctx.beginPath();
        ctx.moveTo(arrowX, entryY);
        ctx.lineTo(arrowX, livePriceY);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Triangle arrow at live price
      ctx.fillStyle = arrowColor;
      ctx.globalAlpha = arrowOpacity;
      ctx.beginPath();
      if (isNeutral) {
        // Neutral: small diamond
        ctx.moveTo(arrowX - 3, livePriceY);
        ctx.lineTo(arrowX, livePriceY - 3);
        ctx.lineTo(arrowX + 3, livePriceY);
        ctx.lineTo(arrowX, livePriceY + 3);
      } else if (arrowUp) {
        ctx.moveTo(arrowX - arrowSize, livePriceY + arrowSize);
        ctx.lineTo(arrowX, livePriceY - arrowSize);
        ctx.lineTo(arrowX + arrowSize, livePriceY + arrowSize);
      } else {
        ctx.moveTo(arrowX - arrowSize, livePriceY - arrowSize);
        ctx.lineTo(arrowX, livePriceY + arrowSize);
        ctx.lineTo(arrowX + arrowSize, livePriceY - arrowSize);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // % badge next to arrow
      const priceDiffPct = ((livePrice - tool.entry) / tool.entry) * 100;
      const badgeSign = isLong ? priceDiffPct : -priceDiffPct;
      const badgeText = `${badgeSign >= 0 ? '+' : ''}${badgeSign.toFixed(2)}%`;
      ctx.font = '9px "SF Mono", Consolas, monospace';
      const textW = ctx.measureText(badgeText).width;
      const badgeX = arrowX + arrowSize + 3;
      const badgeY = livePriceY - 7;

      ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, textW + 8, 14, 3);
      ctx.fill();

      ctx.fillStyle = arrowColor;
      ctx.globalAlpha = arrowOpacity;
      ctx.textAlign = 'left';
      ctx.fillText(badgeText, badgeX + 4, badgeY + 10);
      ctx.globalAlpha = 1;
    }

    // ═══ Settings flags ═══
    const showRR = showLabels && tool.showRR !== false;
    const showPnL = showLabels && tool.showPnL !== false;
    const compact = defaultCompact || tool.compactMode === true;

    // ═══ RIGHT-SIDE ENTRY LABEL ═══
    if (!compact && showLabels) {
      const hasExtraRow = showRR || showPosSize;
      const labelW = hasExtraRow ? (showPosSize ? 150 : 130) : 110;
      const labelH = hasExtraRow ? (showPosSize && showRR ? 38 : 28) : 18;
      const labelPad = 8;
      const labelRightX = rightX - labelW - 12;

      const entryLabelY = entryY - labelH / 2;
      ctx.fillStyle = 'rgba(20, 20, 25, 0.92)';
      ctx.beginPath();
      ctx.roundRect(labelRightX, entryLabelY, labelW, labelH, 4);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(isLong ? tpColor : slColor, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Position type badge
      ctx.fillStyle = isLong ? tpColor : slColor;
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(isLong ? '▲ LONG' : '▼ SHORT', labelRightX + labelPad, entryLabelY + 12);

      // Price
      ctx.fillStyle = '#e5e5e5';
      ctx.font = 'bold 11px "SF Mono", Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(tool.entry.toFixed(2), labelRightX + labelW - labelPad, entryLabelY + 12);

      let nextLineY = entryLabelY + 24;

      // R:R ratio (conditional)
      if (showRR) {
        ctx.fillStyle = '#737373';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(`R:R  1 : ${rr}`, labelRightX + labelPad, nextLineY);
        nextLineY += 11;
      }

      // Position size (conditional)
      if (showPosSize) {
        ctx.fillStyle = '#8b8b8b';
        ctx.font = '9px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Qty: ${leveragedSize.toFixed(4)}`, labelRightX + labelPad, nextLineY);
        ctx.textAlign = 'right';
        ctx.fillText(`$${dollarRisk.toFixed(0)} risk`, labelRightX + labelW - labelPad, nextLineY);
      }
    }

    // ═══ RIGHT-SIDE TP LABEL ═══
    if (!compact && showLabels) {
      const tpLabelW = (showPnL || showDollarPnL) ? 120 : 75;
      const tpLabelH = (showPnL || showDollarPnL) ? 24 : 16;
      const tpLabelX = rightX - tpLabelW - 12;
      const tpLabelY = tpY - tpLabelH / 2;

      ctx.fillStyle = hexToRgba(profitLine, 0.12);
      ctx.beginPath();
      ctx.roundRect(tpLabelX, tpLabelY, tpLabelW, tpLabelH, 4);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(profitLine, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = profitLine;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`TP  ${tool.takeProfit.toFixed(2)}`, tpLabelX + 6, tpLabelY + 10);

      if (showPnL || showDollarPnL) {
        ctx.fillStyle = profitLine;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'right';
        const tpRightText = showDollarPnL ? `+$${dollarPnL.toFixed(0)}` : `+${pnlPct}%`;
        ctx.fillText(tpRightText, tpLabelX + tpLabelW - 6, tpLabelY + 10);

        ctx.fillStyle = hexToRgba(profitLine, 0.5);
        ctx.font = '9px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'left';
        const tpBottomText = showDollarPnL && showPnL ? `+${pnlPct}% | +${reward.toFixed(2)}` : `+${reward.toFixed(2)}`;
        ctx.fillText(tpBottomText, tpLabelX + 6, tpLabelY + 21);
      }
    }

    // ═══ RIGHT-SIDE SL LABEL ═══
    if (!compact && showLabels) {
      const slLabelW = (showPnL || showDollarPnL) ? 120 : 75;
      const slLabelH = (showPnL || showDollarPnL) ? 24 : 16;
      const slLabelX = rightX - slLabelW - 12;
      const slLabelY = slY - slLabelH / 2;

      ctx.fillStyle = hexToRgba(riskLine, 0.12);
      ctx.beginPath();
      ctx.roundRect(slLabelX, slLabelY, slLabelW, slLabelH, 4);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(riskLine, 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = riskLine;
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`SL  ${tool.stopLoss.toFixed(2)}`, slLabelX + 6, slLabelY + 10);

      if (showPnL || showDollarPnL) {
        ctx.fillStyle = riskLine;
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'right';
        const slRightText = showDollarPnL ? `-$${dollarLoss.toFixed(0)}` : `-${riskPct}%`;
        ctx.fillText(slRightText, slLabelX + slLabelW - 6, slLabelY + 10);

        ctx.fillStyle = hexToRgba(riskLine, 0.5);
        ctx.font = '9px "SF Mono", Consolas, monospace';
        ctx.textAlign = 'left';
        const slBottomText = showDollarPnL && showPnL ? `-${riskPct}% | -${risk.toFixed(2)}` : `-${risk.toFixed(2)}`;
        ctx.fillText(slBottomText, slLabelX + 6, slLabelY + 21);
      }
    }

    // ═══ DRAG HANDLES (only when selected or hovered) ═══
    const isActive = tool.selected || context.hoveredToolId === tool.id;

    if (isActive) {
      const handleRadius = 5;

      // Line handles on left edge
      const lineHandles = [
        { x: leftX, y: entryY, color: entryColor },
        { x: leftX, y: tpY, color: profitLine },
        { x: leftX, y: slY, color: riskLine },
      ];

      lineHandles.forEach(h => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.6)';
        ctx.fill();
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 4 corner resize handles
      const topY = Math.min(entryY, tpY, slY);
      const bottomY = Math.max(entryY, tpY, slY);
      const corners = [
        { x: leftX, y: topY },
        { x: rightX, y: topY },
        { x: leftX, y: bottomY },
        { x: rightX, y: bottomY },
      ];

      corners.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.6)';
        ctx.fill();
        ctx.strokeStyle = '#737373';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // ═══ SELECTION INDICATOR ═══
    if (tool.selected) {
      const topY = Math.min(entryY, slY, tpY);
      const bottomY = Math.max(entryY, slY, tpY);

      // Subtle zone glow instead of blue border
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(leftX, topY, rightX - leftX, bottomY - topY);

      // Additional right-side handles when selected
      const rightHandles = [
        { x: rightX, y: entryY, color: entryColor },
        { x: rightX, y: tpY, color: profitLine },
        { x: rightX, y: slY, color: riskLine },
      ];

      rightHandles.forEach(h => {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.6)';
        ctx.fill();
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // ═══ RESTORE VIEWPORT CLIP ═══
    ctx.restore();
  }

  // ============ TEXT ============

  private renderText(tool: Tool & { type: 'text' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX, width, height } = context;

    // Determine position based on anchor mode
    let x: number, y: number;

    if (tool.anchorMode === 'screen-fixed' && tool.screenPosition) {
      // Fixed position on screen - doesn't move with chart
      x = tool.screenPosition.x;
      y = tool.screenPosition.y;
    } else {
      // Default: price-time anchored - follows chart pan/zoom
      x = timeToX(tool.point.time);
      y = priceToY(tool.point.price);
    }

    // Use tool-specific typography settings
    const fontSize = tool.fontSize || tool.style.fontSize || 14;
    const fontFamily = tool.fontFamily || tool.style.fontFamily || 'system-ui, sans-serif';
    const fontWeight = tool.fontWeight || 'normal';
    const fontColor = tool.fontColor || tool.style.fontColor || tool.style.color;
    const bgColor = tool.backgroundColor || 'rgba(0, 0, 0, 0.6)';
    const padding = tool.padding || 6;
    const borderRadius = tool.borderRadius || 4;
    const textAlign = tool.textAlign || 'left';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = textAlign;

    // Measure text
    const metrics = ctx.measureText(tool.content);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    // Calculate box position based on text align
    let boxX = x - padding;
    if (textAlign === 'center') {
      boxX = x - textWidth / 2 - padding;
    } else if (textAlign === 'right') {
      boxX = x - textWidth - padding;
    }
    const boxY = y - textHeight - padding;
    const boxW = textWidth + padding * 2;
    const boxH = textHeight + padding * 2;

    // Background with rounded corners
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, borderRadius);
      ctx.fill();
    }

    // Text
    ctx.fillStyle = fontColor;
    let textX = x;
    if (textAlign === 'center') {
      textX = x;
    } else if (textAlign === 'right') {
      textX = x;
    }
    ctx.fillText(tool.content, textX, y - padding / 2);

    // Editing indicator
    if (tool.isEditing) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(boxX - 2, boxY - 2, boxW + 4, boxH + 4);

      // Cursor blink effect would be handled in the React component
    }

    // Selection box
    if (tool.selected && !tool.isEditing) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(boxX - 2, boxY - 2, boxW + 4, boxH + 4);
      ctx.setLineDash([]);

      // Anchor mode indicator
      const anchorIcon = tool.anchorMode === 'screen-fixed' ? '📌' : '⚓';
      ctx.font = '10px system-ui';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(anchorIcon, boxX + boxW, boxY - 4);
    }
  }

  // ============ HANDLES ============

  private renderHandles(tool: Tool, context: RenderContext): void {
    const { ctx, priceToY, timeToX, colors } = context;
    const handles = this.engine.getToolHandles(tool, priceToY, timeToX);

    handles.forEach(handle => {
      const size = handle.size;
      const halfSize = size / 2;

      // Professional style: square handles for corners, round for edges/points
      const isCorner =
        handle.position === 'top-left' ||
        handle.position === 'top-right' ||
        handle.position === 'bottom-left' ||
        handle.position === 'bottom-right';

      // Handle fill - white (flat, no glow)
      ctx.fillStyle = '#ffffff';

      if (isCorner) {
        ctx.fillRect(handle.x - halfSize, handle.y - halfSize, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, halfSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Handle border - tool color for visual connection
      ctx.strokeStyle = tool.style.color;
      ctx.lineWidth = 2;

      if (isCorner) {
        ctx.strokeRect(handle.x - halfSize, handle.y - halfSize, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, halfSize, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Inner dot for precision targeting (smaller for compact handles)
      ctx.fillStyle = tool.style.color;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ============ ATTACHED TEXT ============

  private renderAttachedText(tool: Tool, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;
    const text = tool.text;
    if (!text?.content) return;

    // Calculate position based on tool type and text position
    let x = 0, y = 0;

    switch (tool.type) {
      case 'horizontalLine': {
        y = priceToY(tool.price);
        x = text.position === 'start' ? 10 :
            text.position === 'center' ? context.width / 2 :
            context.width - 70;
        break;
      }
      case 'trendline': {
        const x1 = timeToX(tool.startPoint.time);
        const y1 = priceToY(tool.startPoint.price);
        const x2 = timeToX(tool.endPoint.time);
        const y2 = priceToY(tool.endPoint.price);

        if (text.position === 'start') {
          x = x1; y = y1;
        } else if (text.position === 'end') {
          x = x2; y = y2;
        } else {
          x = (x1 + x2) / 2; y = (y1 + y2) / 2;
        }
        y -= 10; // Offset above line
        break;
      }
      case 'rectangle': {
        const rx1 = timeToX(tool.topLeft.time);
        const ry1 = priceToY(tool.topLeft.price);
        const rx2 = timeToX(tool.bottomRight.time);
        const ry2 = priceToY(tool.bottomRight.price);

        if (text.position === 'start') {
          x = rx1 + 5; y = ry1 + 15;
        } else if (text.position === 'end') {
          x = rx2 - 5; y = ry2 - 5;
        } else {
          x = (rx1 + rx2) / 2; y = (ry1 + ry2) / 2;
        }
        break;
      }
      case 'longPosition':
      case 'shortPosition': {
        const posLeftX = timeToX(tool.startTime);
        const posRightX = timeToX(tool.endTime);
        y = priceToY(tool.entry);
        x = text.position === 'start' ? posLeftX + 5 :
            text.position === 'center' ? (posLeftX + posRightX) / 2 :
            posRightX - 150;
        break;
      }
      default:
        return;
    }

    // Render text with background
    const fontSize = text.fontSize || 11;
    const fontColor = text.fontColor || tool.style.color;

    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(text.content);
    const padding = 3;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(
      x - padding,
      y - fontSize - padding,
      metrics.width + padding * 2,
      fontSize + padding * 2
    );

    // Text
    ctx.fillStyle = fontColor;
    ctx.textAlign = 'left';
    ctx.fillText(text.content, x, y - 2);
  }

  // ============ HELPERS ============

  private renderPriceLabel(
    ctx: CanvasRenderingContext2D,
    price: number,
    x: number,
    y: number,
    color: string,
    align: CanvasTextAlign
  ): void {
    const label = `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    ctx.font = 'bold 10px monospace';
    const metrics = ctx.measureText(label);
    const padding = 3;

    // Background
    const bgX = align === 'right' ? x - metrics.width - padding * 2 : x;
    ctx.fillStyle = color;
    ctx.fillRect(bgX, y - 8, metrics.width + padding * 2, 16);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = align;
    ctx.fillText(label, align === 'right' ? x - padding : x + padding, y + 4);
  }

  private renderSelectionLine(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    color: string
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ════════════════════════════════════════════
  // NEW TOOLS: Parallel Channel, Fib Extension, Measure, Ellipse
  // ════════════════════════════════════════════

  private renderParallelChannel(tool: ParallelChannelTool, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;
    const x1 = timeToX(tool.startPoint.time);
    const y1 = priceToY(tool.startPoint.price);
    const x2 = timeToX(tool.endPoint.time);
    const y2 = priceToY(tool.endPoint.price);

    // Offset for parallel line
    const offsetY1 = priceToY(tool.startPoint.price + tool.channelWidth);
    const offsetY2 = priceToY(tool.endPoint.price + tool.channelWidth);
    const dy1 = offsetY1 - y1;
    const dy2 = offsetY2 - y2;

    // Main line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Parallel line
    ctx.beginPath();
    ctx.moveTo(x1, y1 + dy1);
    ctx.lineTo(x2, y2 + dy2);
    ctx.stroke();

    // Center line (dashed)
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + dy1 / 2);
    ctx.lineTo(x2, y2 + dy2 / 2);
    ctx.stroke();
    ctx.restore();

    // Fill between lines
    ctx.fillStyle = tool.style.fillColor || tool.style.color;
    ctx.globalAlpha = tool.style.fillOpacity ?? 0.08;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 + dy2);
    ctx.lineTo(x1, y1 + dy1);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private renderFibExtension(tool: FibExtensionTool, context: RenderContext): void {
    const { ctx, priceToY, timeToX, width } = context;
    const x1 = timeToX(tool.point1.time);
    const y1 = priceToY(tool.point1.price);
    const x2 = timeToX(tool.point2.time);
    const y2 = priceToY(tool.point2.price);
    const x3 = timeToX(tool.point3.time);
    const y3 = priceToY(tool.point3.price);

    // Draw swing lines (point1 -> point2, point2 -> point3)
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
    ctx.restore();

    // Extension levels
    const swing = tool.point2.price - tool.point1.price;
    const levels = tool.levels || [0, 0.618, 1.0, 1.618, 2.618];
    const colors = ['#787b86', '#f7525f', '#ff9800', '#2196f3', '#9c27b0'];

    levels.forEach((level, idx) => {
      const levelPrice = tool.point3.price + swing * level;
      const levelY = priceToY(levelPrice);
      const color = colors[idx % colors.length];

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(level === 1.0 ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.min(x1, x2, x3), levelY);
      ctx.lineTo(width, levelY);
      ctx.stroke();

      // Labels
      if (tool.showLabels) {
        ctx.font = '9px "Consolas", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(`${(level * 100).toFixed(1)}%`, 4, levelY - 3);
      }
      if (tool.showPrices) {
        ctx.font = '9px "Consolas", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(levelPrice.toFixed(2), width - 4, levelY - 3);
      }
    });
    ctx.setLineDash([]);
  }

  private renderMeasure(tool: MeasureTool, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;
    const x1 = timeToX(tool.startPoint.time);
    const y1 = priceToY(tool.startPoint.price);
    const x2 = timeToX(tool.endPoint.time);
    const y2 = priceToY(tool.endPoint.price);

    // Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead at end
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();

    // Info popup
    const priceChange = tool.endPoint.price - tool.startPoint.price;
    const pctChange = (priceChange / tool.startPoint.price) * 100;
    const timeDiffSec = Math.abs(tool.endPoint.time - tool.startPoint.time);
    const timeDiffMin = Math.floor(timeDiffSec / 60);
    const timeDiffHr = Math.floor(timeDiffMin / 60);

    const timeStr = timeDiffHr > 0
      ? `${timeDiffHr}h ${timeDiffMin % 60}m`
      : `${timeDiffMin}m`;

    const lines = [
      `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}`,
      `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`,
      timeStr,
    ];

    // Draw popup
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    ctx.font = 'bold 10px "Consolas", monospace';
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const popW = maxW + 16;
    const popH = lines.length * 14 + 8;
    const popX = midX - popW / 2;
    const popY = midY - popH - 10;

    ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
    ctx.beginPath();
    ctx.roundRect(popX, popY, popW, popH, 4);
    ctx.fill();

    ctx.strokeStyle = priceChange >= 0 ? '#22c55e' : '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(popX, popY, popW, popH, 4);
    ctx.stroke();

    ctx.fillStyle = priceChange >= 0 ? '#22c55e' : '#ef4444';
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0
        ? (priceChange >= 0 ? '#22c55e' : '#ef4444')
        : i === 1
          ? (priceChange >= 0 ? '#86efac' : '#fca5a5')
          : '#9ca3af';
      ctx.fillText(line, midX, popY + 14 + i * 14);
    });
  }

  private renderEllipse(tool: EllipseTool, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;
    const cx = timeToX(tool.center.time);
    const cy = priceToY(tool.center.price);
    const rx = Math.abs(timeToX(tool.center.time + tool.radiusTime) - cx);
    const ry = Math.abs(priceToY(tool.center.price + tool.radiusPrice) - cy);

    if (rx < 1 || ry < 1) return;

    // Fill
    ctx.fillStyle = tool.style.fillColor || tool.style.color;
    ctx.globalAlpha = tool.style.fillOpacity ?? 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Stroke
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============ SINGLETON ============

let renderer: ToolsRenderer | null = null;

export function getToolsRenderer(): ToolsRenderer {
  if (!renderer) {
    renderer = new ToolsRenderer();
  }
  return renderer;
}
