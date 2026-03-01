/**
 * ELLIPSE TOOL DEFINITION
 */

import type { EllipseTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_SIZE } from './utils';

const ellipseDefinition: ToolDefinition<EllipseTool> = {
  type: 'ellipse',
  minPoints: 2,
  defaultStyle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'solid', fillColor: '#06b6d4', fillOpacity: 0.08 },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 2) return null;
    return {
      type: 'ellipse',
      center: points[0],
      radiusTime: Math.abs(points[1].time - points[0].time),
      radiusPrice: Math.abs(points[1].price - points[0].price),
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: EllipseTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    if (handle === 'center' || !handle) {
      return { center: { time: original.center.time + deltaTime, price: original.center.price + deltaPrice } };
    }
    return {};
  },

  hitTest(tool: EllipseTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const cx = converters.timeToX(tool.center.time);
    const cy = converters.priceToY(tool.center.price);
    const rx = Math.abs(converters.timeToX(tool.center.time + tool.radiusTime) - cx);
    const ry = Math.abs(converters.priceToY(tool.center.price + tool.radiusPrice) - cy);
    if (rx === 0 || ry === 0) return null;

    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    const normDist = Math.sqrt(nx * nx + ny * ny);

    // Hit on edge
    if (Math.abs(normDist - 1) * Math.min(rx, ry) <= tolerance) {
      return { handle: null, distance: Math.abs(normDist - 1) * Math.min(rx, ry) };
    }
    // Inside
    if (normDist <= 1) {
      return { handle: 'center' as HandlePosition, distance: 0 };
    }

    return null;
  },

  getHandles(tool: EllipseTool, converters: CoordinateConverters): Handle[] {
    return [{
      position: 'center',
      x: converters.timeToX(tool.center.time),
      y: converters.priceToY(tool.center.price),
      size: HANDLE_SIZE,
      cursor: 'move',
    }];
  },
  settingsSchema: [
    { key: 'style.color', label: 'Border color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Border width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Border style', type: 'lineStyle', group: 'Style' },
    { key: 'style.fillColor', label: 'Fill color', type: 'color', group: 'Style' },
    { key: 'style.fillOpacity', label: 'Fill opacity', type: 'slider', group: 'Style', min: 0, max: 1, step: 0.01 },
  ],
};

toolRegistry.register(ellipseDefinition);
export default ellipseDefinition;
