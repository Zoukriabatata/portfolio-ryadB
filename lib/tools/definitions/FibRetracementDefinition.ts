/**
 * FIBONACCI RETRACEMENT TOOL DEFINITION
 */

import type { FibRetracementTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const fibRetracementDefinition: ToolDefinition<FibRetracementTool> = {
  type: 'fibRetracement',
  minPoints: 2,
  defaultStyle: { color: '#f59e0b', lineWidth: 1, lineStyle: 'solid' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'fibRetracement',
      startPoint: points[0],
      endPoint: points[1],
      levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
      showLabels: true,
      showPrices: true,
      extendLeft: false,
      extendRight: false,
      showFills: true,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: FibRetracementTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
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

  hitTest(tool: FibRetracementTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.startPoint.time);
    const y1 = converters.priceToY(tool.startPoint.price);
    const x2 = converters.timeToX(tool.endPoint.time);
    const y2 = converters.priceToY(tool.endPoint.price);

    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'start' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x2, py - y2) <= HANDLE_HIT_SIZE) return { handle: 'end' as HandlePosition, distance: 0 };

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const priceRange = tool.startPoint.price - tool.endPoint.price;
    const levels = tool.levels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

    if (px >= minX - tolerance && px <= maxX + tolerance) {
      for (const level of levels) {
        const levelPrice = tool.endPoint.price + priceRange * level;
        const levelY = converters.priceToY(levelPrice);
        const distance = Math.abs(py - levelY);
        if (distance <= tolerance) return { handle: null, distance };
      }
    }

    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      return { handle: 'center' as HandlePosition, distance: 0 };
    }

    return null;
  },

  getHandles(tool: FibRetracementTool, converters: CoordinateConverters): Handle[] {
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
    { key: 'showLabels', label: 'Show labels', type: 'boolean', group: 'Labels' },
    { key: 'showPrices', label: 'Show prices', type: 'boolean', group: 'Labels' },
    { key: 'showFills', label: 'Zone fills', type: 'boolean', group: 'Features' },
    { key: 'extendLeft', label: 'Extend left', type: 'boolean', group: 'Behavior' },
    { key: 'extendRight', label: 'Extend right', type: 'boolean', group: 'Behavior' },
  ],
};

toolRegistry.register(fibRetracementDefinition);
export default fibRetracementDefinition;
