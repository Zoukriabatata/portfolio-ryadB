/**
 * HORIZONTAL RAY TOOL DEFINITION
 */

import type { HorizontalRayTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_SIZE } from './utils';

const horizontalRayDefinition: ToolDefinition<HorizontalRayTool> = {
  type: 'horizontalRay',
  minPoints: 1,
  defaultStyle: { color: '#8b5cf6', lineWidth: 1, lineStyle: 'solid' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 1) return null;
    return {
      type: 'horizontalRay',
      startPoint: points[0],
      direction: 'right',
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: HorizontalRayTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    return {
      startPoint: {
        time: original.startPoint.time + deltaTime,
        price: original.startPoint.price + deltaPrice,
      },
    };
  },

  hitTest(tool: HorizontalRayTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x = converters.timeToX(tool.startPoint.time);
    const y = converters.priceToY(tool.startPoint.price);

    if (Math.hypot(px - x, py - y) <= 12) {
      return { handle: 'start' as HandlePosition, distance: 0 };
    }

    const distance = Math.abs(py - y);
    // Only hit if on the correct side of the ray
    const onRaySide = tool.direction === 'right' ? px >= x : px <= x;
    if (distance <= tolerance && onRaySide) {
      return { handle: null, distance };
    }
    return null;
  },

  getHandles(tool: HorizontalRayTool, converters: CoordinateConverters): Handle[] {
    return [{
      position: 'start',
      x: converters.timeToX(tool.startPoint.time),
      y: converters.priceToY(tool.startPoint.price),
      size: HANDLE_SIZE,
      cursor: 'move',
    }];
  },
  settingsSchema: [
    { key: 'style.color', label: 'Color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Style', type: 'lineStyle', group: 'Style' },
    { key: 'direction', label: 'Direction', type: 'select', group: 'Behavior', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
  ],
};

toolRegistry.register(horizontalRayDefinition);
export default horizontalRayDefinition;
