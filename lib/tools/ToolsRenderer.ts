/**
 * TOOLS RENDERER
 *
 * Rendu professionnel des outils sur canvas
 * Style TradingView avec :
 * - Handles de sélection
 * - Labels de prix
 * - Zones colorées
 * - Lignes étendues
 */

import { Tool, PreviewTool, Handle, ToolsEngine, getToolsEngine } from './ToolsEngine';

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
}

// ============ TOOLS RENDERER ============

export class ToolsRenderer {
  private engine: ToolsEngine;

  constructor() {
    this.engine = getToolsEngine();
  }

  /**
   * Render all tools
   */
  render(context: RenderContext): void {
    const { ctx } = context;
    const tools = this.engine.getAllTools();

    // Render tools in z-order
    tools.forEach(tool => {
      if (!tool.visible) return;
      this.renderTool(tool, context);
    });

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

    // Apply style
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = tool.style.lineWidth;
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
    }

    // Render attached text
    if (tool.text?.content) {
      this.renderAttachedText(tool, context);
    }

    // Render handles if selected
    if (tool.selected) {
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
    const y = priceToY(tool.price);

    // Line
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Price label
    if (tool.showPrice) {
      this.renderPriceLabel(ctx, tool.price, width - 5, y, tool.style.color, 'right');
    }

    // Selection highlight
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = tool.style.lineWidth + 2;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ============ HORIZONTAL RAY ============

  private renderHorizontalRay(tool: Tool & { type: 'horizontalRay' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;
    const y = priceToY(tool.startPoint.price);
    const x = timeToX(tool.startPoint.time);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tool.direction === 'right' ? width : 0, y);
    ctx.stroke();

    // Start point marker
    ctx.fillStyle = tool.style.color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ============ VERTICAL LINE ============

  private renderVerticalLine(tool: Tool & { type: 'verticalLine' }, context: RenderContext): void {
    const { ctx, height, timeToX } = context;
    const x = timeToX(tool.time);

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
      ctx.fillText(label, x, height - 5);
    }
  }

  // ============ TRENDLINE ============

  private renderTrendline(tool: Tool & { type: 'trendline' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;

    const x1 = timeToX(tool.startPoint.time);
    const y1 = priceToY(tool.startPoint.price);
    const x2 = timeToX(tool.endPoint.time);
    const y2 = priceToY(tool.endPoint.price);

    // Calculate extension points
    let startX = x1, startY = y1, endX = x2, endY = y2;

    if (tool.extendLeft || tool.extendRight) {
      const dx = x2 - x1;
      const dy = y2 - y1;

      if (dx !== 0) {
        const slope = dy / dx;

        if (tool.extendLeft) {
          startX = 0;
          startY = y1 - (x1 * slope);
        }

        if (tool.extendRight) {
          endX = width;
          endY = y2 + ((width - x2) * slope);
        }
      }
    }

    // Line
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Endpoint markers
    ctx.fillStyle = tool.style.color;
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x2, y2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Selection highlight
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = tool.style.lineWidth + 3;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // ============ RECTANGLE ============

  private renderRectangle(tool: Tool & { type: 'rectangle' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;

    const x1 = timeToX(tool.topLeft.time);
    const y1 = priceToY(tool.topLeft.price);
    const x2 = timeToX(tool.bottomRight.time);
    const y2 = priceToY(tool.bottomRight.price);

    const w = x2 - x1;
    const h = y2 - y1;

    // Fill
    if (tool.style.fillColor) {
      ctx.fillStyle = tool.style.fillColor;
      ctx.globalAlpha = tool.style.fillOpacity || 0.1;
      ctx.fillRect(x1, y1, w, h);
      ctx.globalAlpha = 1;
    }

    // Border
    ctx.strokeRect(x1, y1, w, h);

    // Selection highlight
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1 - 2, y1 - 2, w + 4, h + 4);
      ctx.setLineDash([]);
    }
  }

  // ============ FIBONACCI RETRACEMENT ============

  private renderFibRetracement(tool: Tool & { type: 'fibRetracement' }, context: RenderContext): void {
    const { ctx, width, priceToY, timeToX } = context;

    const x1 = timeToX(tool.startPoint.time);
    const x2 = timeToX(tool.endPoint.time);
    const startPrice = tool.startPoint.price;
    const endPrice = tool.endPoint.price;
    const priceRange = endPrice - startPrice;

    // Draw levels
    tool.levels.forEach((level, index) => {
      const price = startPrice + priceRange * level;
      const y = priceToY(price);

      // Level line
      ctx.strokeStyle = tool.style.color;
      ctx.globalAlpha = 0.5 + (level === 0.618 ? 0.3 : 0);
      ctx.beginPath();
      ctx.moveTo(Math.min(x1, x2), y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Fill between levels
      if (index > 0) {
        const prevLevel = tool.levels[index - 1];
        const prevPrice = startPrice + priceRange * prevLevel;
        const prevY = priceToY(prevPrice);

        ctx.fillStyle = tool.style.color;
        ctx.globalAlpha = 0.05;
        ctx.fillRect(Math.min(x1, x2), Math.min(y, prevY), width - Math.min(x1, x2), Math.abs(y - prevY));
        ctx.globalAlpha = 1;
      }

      // Labels
      if (tool.showLabels) {
        ctx.fillStyle = tool.style.color;
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${(level * 100).toFixed(1)}%`, Math.min(x1, x2) + 5, y - 3);
      }

      if (tool.showPrices) {
        ctx.textAlign = 'right';
        ctx.fillText(`$${price.toFixed(2)}`, width - 5, y - 3);
      }
    });

    // Main trendline
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, priceToY(startPrice));
    ctx.lineTo(x2, priceToY(endPrice));
    ctx.stroke();
  }

  // ============ POSITION (LONG/SHORT) ============

  private renderPosition(tool: Tool & { type: 'longPosition' | 'shortPosition' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX, colors } = context;

    const entryY = priceToY(tool.entry);
    const slY = priceToY(tool.stopLoss);
    const tpY = priceToY(tool.takeProfit);
    const leftX = timeToX(tool.startTime);
    const rightX = timeToX(tool.endTime);
    const posWidth = rightX - leftX;

    const isLong = tool.type === 'longPosition';
    const riskColor = colors.negative;
    const profitColor = colors.positive;

    // Risk zone (SL)
    ctx.fillStyle = riskColor;
    ctx.globalAlpha = tool.style.fillOpacity || 0.1;
    ctx.fillRect(leftX, Math.min(entryY, slY), posWidth, Math.abs(slY - entryY));

    // Profit zone (TP)
    ctx.fillStyle = profitColor;
    ctx.fillRect(leftX, Math.min(entryY, tpY), posWidth, Math.abs(tpY - entryY));
    ctx.globalAlpha = 1;

    // Entry line
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(leftX, entryY);
    ctx.lineTo(rightX, entryY);
    ctx.stroke();

    // SL line
    ctx.strokeStyle = riskColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(leftX, slY);
    ctx.lineTo(rightX, slY);
    ctx.stroke();

    // TP line
    ctx.strokeStyle = profitColor;
    ctx.beginPath();
    ctx.moveTo(leftX, tpY);
    ctx.lineTo(rightX, tpY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left and right borders
    ctx.strokeStyle = tool.style.color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(leftX, Math.min(entryY, slY, tpY));
    ctx.lineTo(leftX, Math.max(entryY, slY, tpY));
    ctx.moveTo(rightX, Math.min(entryY, slY, tpY));
    ctx.lineTo(rightX, Math.max(entryY, slY, tpY));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Labels
    const labelX = leftX + 5;
    ctx.font = 'bold 11px monospace';

    // Entry label
    ctx.fillStyle = tool.style.color;
    ctx.textAlign = 'left';
    const posIcon = isLong ? '▲ LONG' : '▼ SHORT';
    ctx.fillText(`${posIcon} Entry: $${tool.entry.toFixed(2)}`, labelX, entryY - 5);

    // SL label
    ctx.fillStyle = riskColor;
    const slPips = Math.abs(tool.entry - tool.stopLoss);
    ctx.fillText(`SL: $${tool.stopLoss.toFixed(2)} (${slPips.toFixed(2)})`, labelX, slY + 12);

    // TP label
    ctx.fillStyle = profitColor;
    const tpPips = Math.abs(tool.takeProfit - tool.entry);
    ctx.fillText(`TP: $${tool.takeProfit.toFixed(2)} (${tpPips.toFixed(2)})`, labelX, tpY - 5);

    // R:R ratio
    if (tool.showRR && slPips > 0) {
      const rr = tpPips / slPips;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      const rrX = leftX + Math.min(posWidth / 2, 200);
      ctx.fillText(`R:R 1:${rr.toFixed(2)}`, rrX, entryY - 5);
    }

    // Selection indicator
    if (tool.selected) {
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      const topY = Math.min(entryY, slY, tpY);
      const bottomY = Math.max(entryY, slY, tpY);
      ctx.strokeRect(leftX - 2, topY - 2, posWidth + 4, bottomY - topY + 4);
      ctx.setLineDash([]);
    }
  }

  // ============ TEXT ============

  private renderText(tool: Tool & { type: 'text' }, context: RenderContext): void {
    const { ctx, priceToY, timeToX } = context;

    const x = timeToX(tool.point.time);
    const y = priceToY(tool.point.price);

    ctx.font = `${tool.style.fontSize || 14}px ${tool.style.fontFamily || 'system-ui'}`;
    ctx.fillStyle = tool.style.fontColor || tool.style.color;
    ctx.textAlign = 'left';

    // Background
    const metrics = ctx.measureText(tool.content);
    const padding = 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      x - padding,
      y - (tool.style.fontSize || 14) - padding,
      metrics.width + padding * 2,
      (tool.style.fontSize || 14) + padding * 2
    );

    // Text
    ctx.fillStyle = tool.style.fontColor || tool.style.color;
    ctx.fillText(tool.content, x, y);

    // Selection box
    if (tool.selected) {
      ctx.strokeStyle = context.colors.selection;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        x - padding - 2,
        y - (tool.style.fontSize || 14) - padding - 2,
        metrics.width + padding * 2 + 4,
        (tool.style.fontSize || 14) + padding * 2 + 4
      );
      ctx.setLineDash([]);
    }
  }

  // ============ HANDLES ============

  private renderHandles(tool: Tool, context: RenderContext): void {
    const { ctx, priceToY, timeToX, colors } = context;
    const handles = this.engine.getToolHandles(tool, priceToY, timeToX);

    handles.forEach(handle => {
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(handle.x + 1, handle.y + 1, handle.size / 2 + 1, 0, Math.PI * 2);
      ctx.fill();

      // Handle fill
      ctx.fillStyle = colors.handle;
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, handle.size / 2, 0, Math.PI * 2);
      ctx.fill();

      // Handle border
      ctx.strokeStyle = colors.handleBorder;
      ctx.lineWidth = 2;
      ctx.stroke();
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
}

// ============ SINGLETON ============

let renderer: ToolsRenderer | null = null;

export function getToolsRenderer(): ToolsRenderer {
  if (!renderer) {
    renderer = new ToolsRenderer();
  }
  return renderer;
}
