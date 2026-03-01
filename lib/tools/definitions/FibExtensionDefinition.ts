/**
 * FIBONACCI EXTENSION TOOL DEFINITION
 */

import type { FibExtensionTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const fibExtensionDefinition: ToolDefinition<FibExtensionTool> = {
  type: 'fibExtension',
  minPoints: 3,
  defaultStyle: { color: '#ec4899', lineWidth: 1, lineStyle: 'solid' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 3) return null;
    return {
      type: 'fibExtension',
      point1: points[0],
      point2: points[1],
      point3: points[2],
      levels: [0, 0.618, 1.0, 1.618, 2.618],
      showLabels: true,
      showPrices: true,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: FibExtensionTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    if (handle === 'start') {
      return { point1: { time: original.point1.time + deltaTime, price: original.point1.price + deltaPrice } };
    }
    if (handle === 'end') {
      return { point3: { time: original.point3.time + deltaTime, price: original.point3.price + deltaPrice } };
    }
    return {
      point1: { time: original.point1.time + deltaTime, price: original.point1.price + deltaPrice },
      point2: { time: original.point2.time + deltaTime, price: original.point2.price + deltaPrice },
      point3: { time: original.point3.time + deltaTime, price: original.point3.price + deltaPrice },
    };
  },

  hitTest(tool: FibExtensionTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.point1.time);
    const y1 = converters.priceToY(tool.point1.price);
    const x3 = converters.timeToX(tool.point3.time);
    const y3 = converters.priceToY(tool.point3.price);

    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'start' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x3, py - y3) <= HANDLE_HIT_SIZE) return { handle: 'end' as HandlePosition, distance: 0 };

    const swing = tool.point2.price - tool.point1.price;
    for (const level of (tool.levels || [0, 0.618, 1.0, 1.618, 2.618])) {
      const levelPrice = tool.point3.price + swing * level;
      const levelY = converters.priceToY(levelPrice);
      if (Math.abs(py - levelY) <= tolerance) return { handle: null, distance: Math.abs(py - levelY) };
    }

    return null;
  },

  getHandles(tool: FibExtensionTool, converters: CoordinateConverters): Handle[] {
    return [
      {
        position: 'start',
        x: converters.timeToX(tool.point1.time),
        y: converters.priceToY(tool.point1.price),
        size: HANDLE_SIZE,
        cursor: 'move',
      },
      {
        position: 'end',
        x: converters.timeToX(tool.point3.time),
        y: converters.priceToY(tool.point3.price),
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
  ],
};

toolRegistry.register(fibExtensionDefinition);
export default fibExtensionDefinition;
