/**
 * TEXT TOOL DEFINITION
 */

import type { TextTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

const textDefinition: ToolDefinition<TextTool> = {
  type: 'text',
  minPoints: 1,
  defaultStyle: {
    color: '#ffffff',
    lineWidth: 0,
    lineStyle: 'solid',
    fontSize: 14,
    fontColor: '#ffffff',
    fontFamily: 'system-ui',
  },

  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
    if (points.length < 1) return null;
    return {
      type: 'text',
      point: points[0],
      content: 'Text',
      isEditing: true,
      anchorMode: 'price-time',
      fontSize: 14,
      fontFamily: 'system-ui, sans-serif',
      fontWeight: 'normal',
      fontColor: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 6,
      borderRadius: 4,
      textAlign: 'left',
      style,
      visible: true,
      locked: false,
    };
  },

  updateDrag(original: TextTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
    return {
      point: {
        time: original.point.time + deltaTime,
        price: original.point.price + deltaPrice,
      },
    };
  },

  hitTest(tool: TextTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
    const x = converters.timeToX(tool.point.time);
    const y = converters.priceToY(tool.point.price);

    // Approximate text bounding box
    const width = Math.max(40, tool.content.length * (tool.fontSize * 0.6));
    const height = tool.fontSize + tool.padding * 2;

    if (px >= x && px <= x + width && py >= y - height / 2 && py <= y + height / 2) {
      return { handle: null, distance: 0 };
    }

    if (Math.hypot(px - x, py - y) <= HANDLE_HIT_SIZE) {
      return { handle: 'start' as HandlePosition, distance: 0 };
    }

    return null;
  },

  getHandles(tool: TextTool, converters: CoordinateConverters): Handle[] {
    return [{
      position: 'start',
      x: converters.timeToX(tool.point.time),
      y: converters.priceToY(tool.point.price),
      size: HANDLE_SIZE,
      cursor: 'move',
    }];
  },
  settingsSchema: [
    { key: 'fontColor', label: 'Text color', type: 'color', group: 'Typography' },
    { key: 'fontSize', label: 'Font size', type: 'slider', group: 'Typography', min: 8, max: 48, step: 1 },
    { key: 'fontWeight', label: 'Weight', type: 'select', group: 'Typography', options: [{ value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }] },
    { key: 'textAlign', label: 'Align', type: 'select', group: 'Typography', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
    { key: 'backgroundColor', label: 'Background', type: 'color', group: 'Style' },
    { key: 'borderRadius', label: 'Radius', type: 'slider', group: 'Style', min: 0, max: 16, step: 1 },
    { key: 'padding', label: 'Padding', type: 'slider', group: 'Style', min: 0, max: 20, step: 1 },
  ],
};

toolRegistry.register(textDefinition);
export default textDefinition;
