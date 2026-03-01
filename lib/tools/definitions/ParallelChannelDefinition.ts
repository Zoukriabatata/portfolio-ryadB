/**
 * PARALLEL CHANNEL TOOL DEFINITION
 */

import type { ParallelChannelTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { pointToLineDistance, HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const parallelChannelDefinition: ToolDefinition<ParallelChannelTool> = {
  type: 'parallelChannel',
  minPoints: 2,
  defaultStyle: {
    color: '#22c55e',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#22c55e',
    fillOpacity: 0.05,
  },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'parallelChannel',
      startPoint: points[0],
      endPoint: points[1],
      channelWidth: points.length >= 3
        ? Math.abs(points[2].price - points[0].price)
        : Math.abs(points[1].price - points[0].price) * 0.5,
      extendLeft: false,
      extendRight: false,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: ParallelChannelTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
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

  hitTest(tool: ParallelChannelTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.startPoint.time);
    const y1 = converters.priceToY(tool.startPoint.price);
    const x2 = converters.timeToX(tool.endPoint.time);
    const y2 = converters.priceToY(tool.endPoint.price);

    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'start' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x2, py - y2) <= HANDLE_HIT_SIZE) return { handle: 'end' as HandlePosition, distance: 0 };

    // Main line
    const dist1 = pointToLineDistance(px, py, x1, y1, x2, y2);
    // Parallel line (offset by channelWidth)
    const offsetY = converters.priceToY(tool.startPoint.price + tool.channelWidth) - y1;
    const dist2 = pointToLineDistance(px, py, x1, y1 + offsetY, x2, y2 + offsetY);
    const minDist = Math.min(dist1, dist2);
    if (minDist <= tolerance) return { handle: null, distance: minDist };

    // Inside channel
    const channelMinY = Math.min(y1, y1 + offsetY, y2, y2 + offsetY);
    const channelMaxY = Math.max(y1, y1 + offsetY, y2, y2 + offsetY);
    const channelMinX = Math.min(x1, x2);
    const channelMaxX = Math.max(x1, x2);
    if (px >= channelMinX && px <= channelMaxX && py >= channelMinY && py <= channelMaxY) {
      return { handle: 'center' as HandlePosition, distance: 0 };
    }

    return null;
  },

  getHandles(tool: ParallelChannelTool, converters: CoordinateConverters): Handle[] {
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
    { key: 'style.fillColor', label: 'Fill color', type: 'color', group: 'Style' },
    { key: 'style.fillOpacity', label: 'Fill opacity', type: 'slider', group: 'Style', min: 0, max: 1, step: 0.01 },
    { key: 'extendLeft', label: 'Extend left', type: 'boolean', group: 'Behavior' },
    { key: 'extendRight', label: 'Extend right', type: 'boolean', group: 'Behavior' },
  ],
};

toolRegistry.register(parallelChannelDefinition);
export default parallelChannelDefinition;
