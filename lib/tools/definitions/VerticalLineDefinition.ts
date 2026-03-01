/**
 * VERTICAL LINE TOOL DEFINITION
 */

import type { VerticalLineTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_SIZE } from './utils';

const verticalLineDefinition: ToolDefinition<VerticalLineTool> = {
  type: 'verticalLine',
  minPoints: 1,
  defaultStyle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'dashed' },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 1) return null;
    return {
      type: 'verticalLine',
      time: points[0].time,
      showTime: true,
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: VerticalLineTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    return { time: original.time + deltaTime };
  },

  hitTest(tool: VerticalLineTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const lineX = converters.timeToX(tool.time);
    const distance = Math.abs(px - lineX);

    if (distance <= tolerance) {
      return { handle: null, distance };
    }
    return null;
  },

  getHandles(tool: VerticalLineTool, converters: CoordinateConverters): Handle[] {
    const x = converters.timeToX(tool.time);
    return [{
      position: 'start',
      x,
      y: 20,
      size: HANDLE_SIZE,
      cursor: 'ew-resize',
    }];
  },
  settingsSchema: [
    { key: 'style.color', label: 'Color', type: 'color', group: 'Style' },
    { key: 'style.lineWidth', label: 'Width', type: 'lineWidth', group: 'Style' },
    { key: 'style.lineStyle', label: 'Style', type: 'lineStyle', group: 'Style' },
    { key: 'showTime', label: 'Show time', type: 'boolean', group: 'Labels' },
  ],
};

toolRegistry.register(verticalLineDefinition);
export default verticalLineDefinition;
