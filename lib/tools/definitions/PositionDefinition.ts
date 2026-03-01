/**
 * POSITION TOOL DEFINITION (longPosition + shortPosition)
 */

import type { PositionTool, Point, ToolStyle, HandlePosition, Handle, PreviewTool, Tool } from '../types';
import type { ToolDefinition, CoordinateConverters } from '../registry/ToolDefinition';
import { toolRegistry } from '../registry/ToolRegistry';
import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './utils';

function createPositionDefinition(isLong: boolean): ToolDefinition<PositionTool> {
  const type = isLong ? 'longPosition' : 'shortPosition';

  return {
    type,
    minPoints: 2,
    defaultStyle: {
      color: isLong ? '#22c55e' : '#ef4444',
      lineWidth: 2,
      lineStyle: 'solid',
      fillColor: isLong ? '#22c55e' : '#ef4444',
      fillOpacity: 0.1,
    },

    createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null {
      if (points.length < 2) return null;
      const entry = points[0].price;
      const other = points[1].price;
      const posStartTime = Math.min(points[0].time, points[1].time);
      // Fixed compact width: 20 candles (~20min on 1m chart) — times are in SECONDS
      const fixedWidth = 20 * 60;
      return {
        type,
        entry,
        stopLoss: isLong ? Math.min(entry, other) : Math.max(entry, other),
        takeProfit: isLong ? Math.max(entry, other) : Math.min(entry, other),
        startTime: posStartTime,
        endTime: posStartTime + fixedWidth,
        showRR: true,
        showPnL: false,
        compactMode: true,
        showZoneFill: true,
        accountSize: 10000,
        riskPercent: 1,
        leverage: 1,
        showPositionSize: false,
        showDollarPnL: false,
        style,
        visible: true,
        locked: false,
      };
    },

    updateDrag(original: PositionTool, handle: HandlePosition | null, deltaTime: number, deltaPrice: number): Partial<Tool> {
      let updates: Partial<PositionTool> = {};

      if (handle === 'start') {
        updates = { entry: original.entry + deltaPrice };
      } else if (handle === 'end') {
        updates = { takeProfit: original.takeProfit + deltaPrice };
      } else if (handle === 'center') {
        updates = { stopLoss: original.stopLoss + deltaPrice };
      } else if (handle === 'right') {
        updates = { endTime: original.endTime + deltaTime };
      } else if (handle === 'left') {
        updates = { startTime: original.startTime + deltaTime };
      } else if (handle === 'top-left') {
        updates = {
          takeProfit: isLong ? original.takeProfit + deltaPrice : original.takeProfit,
          stopLoss: isLong ? original.stopLoss : original.stopLoss + deltaPrice,
          startTime: original.startTime + deltaTime,
        };
      } else if (handle === 'top-right') {
        updates = {
          takeProfit: isLong ? original.takeProfit + deltaPrice : original.takeProfit,
          stopLoss: isLong ? original.stopLoss : original.stopLoss + deltaPrice,
          endTime: original.endTime + deltaTime,
        };
      } else if (handle === 'bottom-left') {
        updates = {
          stopLoss: isLong ? original.stopLoss + deltaPrice : original.stopLoss,
          takeProfit: isLong ? original.takeProfit : original.takeProfit + deltaPrice,
          startTime: original.startTime + deltaTime,
        };
      } else if (handle === 'bottom-right') {
        updates = {
          stopLoss: isLong ? original.stopLoss + deltaPrice : original.stopLoss,
          takeProfit: isLong ? original.takeProfit : original.takeProfit + deltaPrice,
          endTime: original.endTime + deltaTime,
        };
      } else {
        updates = {
          entry: original.entry + deltaPrice,
          stopLoss: original.stopLoss + deltaPrice,
          takeProfit: original.takeProfit + deltaPrice,
          startTime: original.startTime + deltaTime,
          endTime: original.endTime + deltaTime,
        };
      }

      // Constraint: prevent TP/SL from crossing entry
      const u = updates as Record<string, number>;
      const newEntry = u.entry ?? original.entry;
      const newTP = u.takeProfit ?? original.takeProfit;
      const newSL = u.stopLoss ?? original.stopLoss;

      if (isLong) {
        if ('takeProfit' in u && newTP < newEntry) u.takeProfit = newEntry;
        if ('stopLoss' in u && newSL > newEntry) u.stopLoss = newEntry;
      } else {
        if ('takeProfit' in u && newTP > newEntry) u.takeProfit = newEntry;
        if ('stopLoss' in u && newSL < newEntry) u.stopLoss = newEntry;
      }

      return updates;
    },

    hitTest(tool: PositionTool, px: number, py: number, converters: CoordinateConverters, tolerance: number) {
      const entryY = converters.priceToY(tool.entry);
      const slY = converters.priceToY(tool.stopLoss);
      const tpY = converters.priceToY(tool.takeProfit);
      const leftX = converters.timeToX(tool.startTime);
      const rightX = converters.timeToX(tool.endTime);
      const topY = Math.min(entryY, slY, tpY);
      const bottomY = Math.max(entryY, slY, tpY);

      // Corner handles
      if (Math.hypot(px - leftX, py - topY) <= HANDLE_HIT_SIZE) return { handle: 'top-left' as HandlePosition, distance: 0 };
      if (Math.hypot(px - rightX, py - topY) <= HANDLE_HIT_SIZE) return { handle: 'top-right' as HandlePosition, distance: 0 };
      if (Math.hypot(px - leftX, py - bottomY) <= HANDLE_HIT_SIZE) return { handle: 'bottom-left' as HandlePosition, distance: 0 };
      if (Math.hypot(px - rightX, py - bottomY) <= HANDLE_HIT_SIZE) return { handle: 'bottom-right' as HandlePosition, distance: 0 };

      // Right-center handle (horizontal resize — adjust endTime)
      const midY = (topY + bottomY) / 2;
      if (Math.abs(px - rightX) <= HANDLE_HIT_SIZE && Math.abs(py - midY) <= HANDLE_HIT_SIZE) {
        return { handle: 'right' as HandlePosition, distance: 0 };
      }

      // Left-center handle (horizontal resize — adjust startTime)
      if (Math.abs(px - leftX) <= HANDLE_HIT_SIZE && Math.abs(py - midY) <= HANDLE_HIT_SIZE) {
        return { handle: 'left' as HandlePosition, distance: 0 };
      }

      // Price line handles (left or right edge)
      const nearLeftEdge = Math.abs(px - leftX) <= HANDLE_HIT_SIZE * 2;
      const nearRightEdge = Math.abs(px - rightX) <= HANDLE_HIT_SIZE * 2;
      if (Math.abs(py - entryY) <= HANDLE_HIT_SIZE && (nearLeftEdge || nearRightEdge)) {
        return { handle: 'start' as HandlePosition, distance: 0 };
      }
      if (Math.abs(py - tpY) <= HANDLE_HIT_SIZE && (nearLeftEdge || nearRightEdge)) {
        return { handle: 'end' as HandlePosition, distance: 0 };
      }
      if (Math.abs(py - slY) <= HANDLE_HIT_SIZE && (nearLeftEdge || nearRightEdge)) {
        return { handle: 'center' as HandlePosition, distance: 0 };
      }

      // Inside bounds
      if (px >= leftX && px <= rightX && py >= topY && py <= bottomY) {
        return { handle: null, distance: 0 };
      }

      // Lines within X bounds
      if (px >= leftX && px <= rightX) {
        const distances = [Math.abs(py - entryY), Math.abs(py - slY), Math.abs(py - tpY)];
        const minDist = Math.min(...distances);
        if (minDist <= tolerance) return { handle: null, distance: minDist };
      }

      return null;
    },

    getHandles(tool: PositionTool, converters: CoordinateConverters): Handle[] {
      const leftX = converters.timeToX(tool.startTime);
      const rightX = converters.timeToX(tool.endTime);
      const topY = Math.min(converters.priceToY(tool.entry), converters.priceToY(tool.stopLoss), converters.priceToY(tool.takeProfit));
      const bottomY = Math.max(converters.priceToY(tool.entry), converters.priceToY(tool.stopLoss), converters.priceToY(tool.takeProfit));

      const midY = (topY + bottomY) / 2;
      return [
        { position: 'top-left', x: leftX, y: topY, size: HANDLE_SIZE, cursor: 'nwse-resize' },
        { position: 'top-right', x: rightX, y: topY, size: HANDLE_SIZE, cursor: 'nesw-resize' },
        { position: 'bottom-left', x: leftX, y: bottomY, size: HANDLE_SIZE, cursor: 'nesw-resize' },
        { position: 'bottom-right', x: rightX, y: bottomY, size: HANDLE_SIZE, cursor: 'nwse-resize' },
        { position: 'left', x: leftX, y: midY, size: HANDLE_SIZE, cursor: 'ew-resize' },
        { position: 'right', x: rightX, y: midY, size: HANDLE_SIZE, cursor: 'ew-resize' },
        { position: 'start', x: leftX, y: converters.priceToY(tool.entry), size: HANDLE_SIZE, cursor: 'ns-resize' },
        { position: 'center', x: leftX, y: converters.priceToY(tool.stopLoss), size: HANDLE_SIZE, cursor: 'ns-resize' },
        { position: 'end', x: leftX, y: converters.priceToY(tool.takeProfit), size: HANDLE_SIZE, cursor: 'ns-resize' },
      ];
    },

    settingsSchema: [
      { key: 'style.color', label: 'Color', type: 'color', group: 'Style' },
      { key: 'style.lineWidth', label: 'Line width', type: 'lineWidth', group: 'Style' },
      { key: 'compactMode', label: 'Compact mode', type: 'boolean', group: 'Display' },
      { key: 'showZoneFill', label: 'Zone fills', type: 'boolean', group: 'Display' },
      { key: 'showRR', label: 'Show R:R', type: 'boolean', group: 'Labels' },
      { key: 'showPnL', label: 'Show P&L %', type: 'boolean', group: 'Labels' },
      { key: 'showDollarPnL', label: 'Show $ P&L', type: 'boolean', group: 'Labels' },
      { key: 'showPositionSize', label: 'Show position size', type: 'boolean', group: 'Labels' },
      { key: 'accountSize', label: 'Account size ($)', type: 'number', group: 'Position sizing', min: 100, max: 10000000, step: 100 },
      { key: 'riskPercent', label: 'Risk %', type: 'slider', group: 'Position sizing', min: 0.1, max: 10, step: 0.1 },
      { key: 'leverage', label: 'Leverage', type: 'number', group: 'Position sizing', min: 1, max: 200, step: 1 },
    ],
  };
}

const longPositionDefinition = createPositionDefinition(true);
const shortPositionDefinition = createPositionDefinition(false);

toolRegistry.register(longPositionDefinition);
toolRegistry.register(shortPositionDefinition);

export { longPositionDefinition, shortPositionDefinition };
