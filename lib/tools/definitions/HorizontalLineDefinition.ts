/**
 * HORIZONTAL LINE TOOL DEFINITION
 */

import type { HorizontalLineTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_SIZE } from './utils';

const horizontalLineDefinition: ToolDefinition<HorizontalLineTool> = {
  type: 'horizontalLine',
  minPoints: 1,
  defaultStyle: { color: '#f59e0b', lineWidth: 1, lineStyle: 'dashed' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 1) return null;
    return {
      type: 'horizontalLine',
      price: points[0].price,
      showPrice: true,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: HorizontalLineTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    return { price: original.price + deltaPrice };
  },

  hitTest(tool: HorizontalLineTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const lineY = converters.priceToY(tool.price);
    const distance = Math.abs(py - lineY);

    // Check left anchor point (for dragging)
    const anchorX = 10;
    if (Math.hypot(px - anchorX, py - lineY) <= 12) {
      return { handle: 'start' as HandlePosition, distance: 0 };
    }

    if (distance <= tolerance) {
      return { handle: null, distance };
    }
    return null;
  },

  getHandles(tool: HorizontalLineTool, converters: CoordinateConverters): Handle[] {
    return [{
      position: 'start',
      x: 10,
      y: converters.priceToY(tool.price),
      size: HANDLE_SIZE,
      cursor: 'ns-resize',
    }];
  },
  settingsSchema: [
    { key: 'style.color', label: 'Color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Style', type: 'lineStyle', group: 'Style' },
    { key: 'showPrice', label: 'Show price', type: 'boolean', group: 'Labels' },
  ],
};

toolRegistry.register(horizontalLineDefinition);
export default horizontalLineDefinition;
