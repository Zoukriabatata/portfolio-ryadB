/**
 * MEASURE TOOL DEFINITION
 */

import type { MeasureTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { pointToLineDistance, HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const measureDefinition: ToolDefinition<MeasureTool> = {
  type: 'measure',
  minPoints: 2,
  defaultStyle: { color: '#8b5cf6', lineWidth: 1, lineStyle: 'dashed' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'measure',
      startPoint: points[0],
      endPoint: points[1],
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: MeasureTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    if (handle === 'start') {
      return { startPoint: { time: original.startPoint.time + deltaTime, price: original.startPoint.price + deltaPrice } };
    }
    if (handle === 'end') {
      return { endPoint: { time: original.endPoint.time + deltaTime, price: original.endPoint.price + deltaPrice } };
    }
    return {
      startPoint: { time: original.startPoint.time + deltaTime, price: original.startPoint.price + deltaPrice },
      endPoint: { time: original.endPoint.time + deltaTime, price: original.endPoint.price + deltaPrice },
    };
  },

  hitTest(tool: MeasureTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.startPoint.time);
    const y1 = converters.priceToY(tool.startPoint.price);
    const x2 = converters.timeToX(tool.endPoint.time);
    const y2 = converters.priceToY(tool.endPoint.price);

    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'start' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x2, py - y2) <= HANDLE_HIT_SIZE) return { handle: 'end' as HandlePosition, distance: 0 };

    const dist = pointToLineDistance(px, py, x1, y1, x2, y2);
    if (dist <= tolerance) return { handle: null, distance: dist };

    return null;
  },

  getHandles(tool: MeasureTool, converters: CoordinateConverters): Handle[] {
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
  ],
};

toolRegistry.register(measureDefinition);
export default measureDefinition;
