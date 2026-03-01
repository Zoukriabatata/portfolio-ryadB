/**
 * RECTANGLE TOOL DEFINITION
 */

import type { RectangleTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { pointToLineDistance, HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const rectangleDefinition: ToolDefinition<RectangleTool> = {
  type: 'rectangle',
  minPoints: 2,
  defaultStyle: {
    color: '#06b6d4',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#06b6d4',
    fillOpacity: 0.1,
  },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'rectangle',
      topLeft: {
        time: Math.min(points[0].time, points[1].time),
        price: Math.max(points[0].price, points[1].price),
      },
      bottomRight: {
        time: Math.max(points[0].time, points[1].time),
        price: Math.min(points[0].price, points[1].price),
      },
      showMedianLine: true,
      showZones: false,
      zones: [
        { level: 0.25, label: '25%', showLabel: true, lineStyle: 'dotted' },
        { level: 0.5, label: '50%', showLabel: true, lineStyle: 'dashed' },
        { level: 0.75, label: '75%', showLabel: true, lineStyle: 'dotted' },
      ],
      extendLeft: false,
      extendRight: false,
      showPriceLabels: true,
      showPercentLabels: false,
      zoneFillOpacity: 0.05,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: RectangleTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    if (handle === 'top-left') {
      return {
        topLeft: {
          time: original.topLeft.time + deltaTime,
          price: original.topLeft.price + deltaPrice,
        },
      };
    }
    if (handle === 'bottom-right') {
      return {
        bottomRight: {
          time: original.bottomRight.time + deltaTime,
          price: original.bottomRight.price + deltaPrice,
        },
      };
    }
    if (handle === 'top-right') {
      return {
        topLeft: { ...original.topLeft, price: original.topLeft.price + deltaPrice },
        bottomRight: { ...original.bottomRight, time: original.bottomRight.time + deltaTime },
      };
    }
    if (handle === 'bottom-left') {
      return {
        topLeft: { ...original.topLeft, time: original.topLeft.time + deltaTime },
        bottomRight: { ...original.bottomRight, price: original.bottomRight.price + deltaPrice },
      };
    }
    if (handle === 'top') {
      return { topLeft: { ...original.topLeft, price: original.topLeft.price + deltaPrice } };
    }
    if (handle === 'bottom') {
      return { bottomRight: { ...original.bottomRight, price: original.bottomRight.price + deltaPrice } };
    }
    if (handle === 'left') {
      return { topLeft: { ...original.topLeft, time: original.topLeft.time + deltaTime } };
    }
    if (handle === 'right') {
      return { bottomRight: { ...original.bottomRight, time: original.bottomRight.time + deltaTime } };
    }
    // Move entire rectangle
    return {
      topLeft: {
        time: original.topLeft.time + deltaTime,
        price: original.topLeft.price + deltaPrice,
      },
      bottomRight: {
        time: original.bottomRight.time + deltaTime,
        price: original.bottomRight.price + deltaPrice,
      },
    };
  },

  hitTest(tool: RectangleTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x1 = converters.timeToX(tool.topLeft.time);
    const y1 = converters.priceToY(tool.topLeft.price);
    const x2 = converters.timeToX(tool.bottomRight.time);
    const y2 = converters.priceToY(tool.bottomRight.price);

    // Check handles
    if (Math.hypot(px - x1, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'top-left' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x2, py - y2) <= HANDLE_HIT_SIZE) return { handle: 'bottom-right' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x2, py - y1) <= HANDLE_HIT_SIZE) return { handle: 'top-right' as HandlePosition, distance: 0 };
    if (Math.hypot(px - x1, py - y2) <= HANDLE_HIT_SIZE) return { handle: 'bottom-left' as HandlePosition, distance: 0 };

    // Inside
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      return { handle: 'center' as HandlePosition, distance: 0 };
    }

    // Edges
    const edges = [
      pointToLineDistance(px, py, x1, y1, x2, y1),
      pointToLineDistance(px, py, x2, y1, x2, y2),
      pointToLineDistance(px, py, x1, y2, x2, y2),
      pointToLineDistance(px, py, x1, y1, x1, y2),
    ];
    const minEdge = Math.min(...edges);
    if (minEdge <= tolerance) return { handle: null, distance: minEdge };

    return null;
  },

  getHandles(tool: RectangleTool, converters: CoordinateConverters): Handle[] {
    const x1 = converters.timeToX(tool.topLeft.time);
    const y1 = converters.priceToY(tool.topLeft.price);
    const x2 = converters.timeToX(tool.bottomRight.time);
    const y2 = converters.priceToY(tool.bottomRight.price);
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    return [
      { position: 'top-left', x: x1, y: y1, size: HANDLE_SIZE, cursor: 'nw-resize' },
      { position: 'top-right', x: x2, y: y1, size: HANDLE_SIZE, cursor: 'ne-resize' },
      { position: 'bottom-left', x: x1, y: y2, size: HANDLE_SIZE, cursor: 'sw-resize' },
      { position: 'bottom-right', x: x2, y: y2, size: HANDLE_SIZE, cursor: 'se-resize' },
      { position: 'top', x: centerX, y: y1, size: HANDLE_SIZE, cursor: 'ns-resize' },
      { position: 'right', x: x2, y: centerY, size: HANDLE_SIZE, cursor: 'ew-resize' },
      { position: 'bottom', x: centerX, y: y2, size: HANDLE_SIZE, cursor: 'ns-resize' },
      { position: 'left', x: x1, y: centerY, size: HANDLE_SIZE, cursor: 'ew-resize' },
    ];
  },
  settingsSchema: [
    { key: 'style.color', label: 'Border color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Border width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Border style', type: 'lineStyle', group: 'Style' },
    { key: 'style.fillColor', label: 'Fill color', type: 'color', group: 'Style' },
    { key: 'style.fillOpacity', label: 'Fill opacity', type: 'slider', group: 'Style', min: 0, max: 1, step: 0.01 },
    { key: 'showMedianLine', label: 'Median line', type: 'boolean', group: 'Features' },
    { key: 'showZones', label: 'Show zones', type: 'boolean', group: 'Features' },
    { key: 'extendLeft', label: 'Extend left', type: 'boolean', group: 'Behavior' },
    { key: 'extendRight', label: 'Extend right', type: 'boolean', group: 'Behavior' },
    { key: 'showPriceLabels', label: 'Price labels', type: 'boolean', group: 'Labels' },
    { key: 'showPercentLabels', label: 'Percent labels', type: 'boolean', group: 'Labels' },
  ],
};

toolRegistry.register(rectangleDefinition);
export default rectangleDefinition;
