/**
 * TRENDLINE TOOL DEFINITION
 */

import type { TrendLineTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { pointToLineDistance, HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const trendLineDefinition: ToolDefinition<TrendLineTool> = {
  type: 'trendline',
  minPoints: 2,
  defaultStyle: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'trendline',
      startPoint: points[0],
      endPoint: points[1],
      extendLeft: false,
      extendRight: false,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: TrendLineTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    if (handle === 'start') {
      return {
        startPoint: {
          time: original.startPoint.time + deltaTime,
          price: original.startPoint.price + deltaPrice,
        },
      };
    }
    if (handle === 'end') {
      return {
        endPoint: {
          time: original.endPoint.time + deltaTime,
          price: original.endPoint.price + deltaPrice,
        },
      };
    }
    // Move entire line
    return {
      startPoint: {
        time: original.startPoint.time + deltaTime,
        price: original.startPoint.price + deltaPrice,
      },
      endPoint: {
        time: original.endPoint.time + deltaTime,
        price: original.endPoint.price + deltaPrice,
      },
    };
  },

  hitTest(tool: TrendLineTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.startPoint.time);
    const y1 = converters.priceToY(tool.startPoint.price);
    const x2 = converters.timeToX(tool.endPoint.time);
    const y2 = converters.priceToY(tool.endPoint.price);

    // Check handles first (larger hit area)
    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) {
      return { handle: 'start' as HandlePosition, distance: 0 };
    }
    if (Math.hypot(px - x2, py - y2) <= HANDLE_HIT_SIZE) {
      return { handle: 'end' as HandlePosition, distance: 0 };
    }

    // Check line
    const distance = pointToLineDistance(px, py, x1, y1, x2, y2);
    if (distance <= tolerance) {
      return { handle: null, distance };
    }
    return null;
  },

  getHandles(tool: TrendLineTool, converters: CoordinateConverters): Handle[] {
    return [
      {
        position: 'start',
        x: converters.timeToX(tool.startPoint.time),
        y: converters.priceToY(tool.startPoint.price),
        size: HANDLE_SIZE,
        cursor: 'move',
      },
      {
        position: 'end',
        x: converters.timeToX(tool.endPoint.time),
        y: converters.priceToY(tool.endPoint.price),
        size: HANDLE_SIZE,
        cursor: 'move',
      },
    ];
  },

  settingsSchema: [
    { key: 'style.color', label: 'Color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Style', type: 'lineStyle', group: 'Style' },
    { key: 'extendLeft', label: 'Extend left', type: 'boolean', group: 'Behavior' },
    { key: 'extendRight', label: 'Extend right', type: 'boolean', group: 'Behavior' },
  ],
};

toolRegistry.register(trendLineDefinition);
export default trendLineDefinition;
