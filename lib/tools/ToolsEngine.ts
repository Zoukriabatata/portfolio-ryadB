/**
 * TOOLS ENGINE - Professional Trading Tools System
 *
 * Architecture style TradingView / ATAS / NinjaTrader
 *
 * Features:
 * - Sélection / désélection au clic
 * - Drag & resize avec handles
 * - Suppression Delete / Backspace
 * - Z-index management
 * - Persistance cross-timeframe
 * - Undo / Redo ready
 */

// ============ TYPES ============

export type ToolType =
  | 'cursor'
  | 'crosshair'
  | 'trendline'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'verticalLine'
  | 'rectangle'
  | 'fibRetracement'
  | 'longPosition'
  | 'shortPosition'
  | 'text';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type HandlePosition = 'start' | 'end' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface Point {
  time: number;   // Unix timestamp (seconds)
  price: number;
}

export interface ToolStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
}

export interface ToolText {
  content: string;
  position: 'start' | 'end' | 'center' | 'above' | 'below';
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
}

export interface Handle {
  position: HandlePosition;
  x: number;
  y: number;
  size: number;
  cursor: string;
}

export interface BaseTool {
  id: string;
  type: ToolType;
  style: ToolStyle;
  text?: ToolText;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
  timeframe?: number;  // Si défini, n'apparaît que sur ce timeframe
  symbol?: string;     // Si défini, n'apparaît que sur ce symbol
}

export interface TrendLineTool extends BaseTool {
  type: 'trendline';
  startPoint: Point;
  endPoint: Point;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface HorizontalLineTool extends BaseTool {
  type: 'horizontalLine';
  price: number;
  showPrice: boolean;
}

export interface HorizontalRayTool extends BaseTool {
  type: 'horizontalRay';
  startPoint: Point;
  direction: 'left' | 'right';
}

export interface VerticalLineTool extends BaseTool {
  type: 'verticalLine';
  time: number;
  showTime: boolean;
}

export interface RectangleTool extends BaseTool {
  type: 'rectangle';
  topLeft: Point;
  bottomRight: Point;
}

export interface FibRetracementTool extends BaseTool {
  type: 'fibRetracement';
  startPoint: Point;
  endPoint: Point;
  levels: number[];  // [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  showLabels: boolean;
  showPrices: boolean;
}

export interface PositionTool extends BaseTool {
  type: 'longPosition' | 'shortPosition';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  startTime: number;  // Left boundary time
  endTime: number;    // Right boundary time
  quantity?: number;
  riskReward?: number;
  showRR?: boolean;
  showPnL?: boolean;
}

export interface TextTool extends BaseTool {
  type: 'text';
  point: Point;
  content: string;
}

export type Tool =
  | TrendLineTool
  | HorizontalLineTool
  | HorizontalRayTool
  | VerticalLineTool
  | RectangleTool
  | FibRetracementTool
  | PositionTool
  | TextTool;

// Preview tool types - same as Tool union but without id/timestamps
export type PreviewTrendLineTool = Omit<TrendLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewHorizontalLineTool = Omit<HorizontalLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewHorizontalRayTool = Omit<HorizontalRayTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewVerticalLineTool = Omit<VerticalLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewRectangleTool = Omit<RectangleTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewFibRetracementTool = Omit<FibRetracementTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewPositionTool = Omit<PositionTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewTextTool = Omit<TextTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;

export type PreviewTool =
  | PreviewTrendLineTool
  | PreviewHorizontalLineTool
  | PreviewHorizontalRayTool
  | PreviewVerticalLineTool
  | PreviewRectangleTool
  | PreviewFibRetracementTool
  | PreviewPositionTool
  | PreviewTextTool;

export interface DrawingState {
  isDrawing: boolean;
  activeTool: ToolType;
  tempPoints: Point[];
  previewTool: PreviewTool | null;
}

export interface DragState {
  isDragging: boolean;
  toolId: string | null;
  handle: HandlePosition | null;
  startPoint: Point;
  originalTool: Tool | null;
}

export interface HitTestResult {
  tool: Tool;
  handle: HandlePosition | null;
  distance: number;
}

// ============ DEFAULT STYLES ============

export const DEFAULT_STYLES: Record<ToolType, ToolStyle> = {
  cursor: { color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
  crosshair: { color: '#ffffff', lineWidth: 1, lineStyle: 'dashed' },
  trendline: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
  horizontalLine: { color: '#f59e0b', lineWidth: 1, lineStyle: 'dashed' },
  horizontalRay: { color: '#8b5cf6', lineWidth: 1, lineStyle: 'solid' },
  verticalLine: { color: '#06b6d4', lineWidth: 1, lineStyle: 'dashed' },
  rectangle: {
    color: '#06b6d4',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#06b6d4',
    fillOpacity: 0.1
  },
  fibRetracement: { color: '#f59e0b', lineWidth: 1, lineStyle: 'solid' },
  longPosition: {
    color: '#22c55e',
    lineWidth: 2,
    lineStyle: 'solid',
    fillColor: '#22c55e',
    fillOpacity: 0.1
  },
  shortPosition: {
    color: '#ef4444',
    lineWidth: 2,
    lineStyle: 'solid',
    fillColor: '#ef4444',
    fillOpacity: 0.1
  },
  text: {
    color: '#ffffff',
    lineWidth: 0,
    lineStyle: 'solid',
    fontSize: 14,
    fontColor: '#ffffff',
    fontFamily: 'system-ui'
  },
};

// ============ EVENTS ============

export type ToolEvent =
  | 'tool:add'
  | 'tool:update'
  | 'tool:delete'
  | 'tool:select'
  | 'tool:deselect'
  | 'drawing:start'
  | 'drawing:update'
  | 'drawing:end'
  | 'drag:start'
  | 'drag:update'
  | 'drag:end';

type ToolCallback = (tool: Tool | PreviewTool | null, event?: ToolEvent) => void;

// ============ TOOLS ENGINE ============

export class ToolsEngine {
  private tools: Map<string, Tool> = new Map();
  private drawingState: DrawingState;
  private dragState: DragState;
  private listeners: Map<ToolEvent, Set<ToolCallback>> = new Map();
  private selectedIds: Set<string> = new Set();
  private nextZIndex: number = 1;
  private history: Tool[][] = [];
  private historyIndex: number = -1;
  private maxHistory: number = 50;

  constructor() {
    this.drawingState = {
      isDrawing: false,
      activeTool: 'cursor',
      tempPoints: [],
      previewTool: null,
    };

    this.dragState = {
      isDragging: false,
      toolId: null,
      handle: null,
      startPoint: { time: 0, price: 0 },
      originalTool: null,
    };

    // Initialize event listeners
    const events: ToolEvent[] = [
      'tool:add', 'tool:update', 'tool:delete', 'tool:select', 'tool:deselect',
      'drawing:start', 'drawing:update', 'drawing:end',
      'drag:start', 'drag:update', 'drag:end'
    ];
    events.forEach(e => this.listeners.set(e, new Set()));
  }

  // ============ TOOL CRUD ============

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Add a new tool
   */
  addTool<T extends Tool>(
    toolData: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>
  ): T {
    const id = this.generateId();
    const now = Date.now();

    const tool = {
      ...toolData,
      id,
      createdAt: now,
      updatedAt: now,
      selected: false,
      zIndex: this.nextZIndex++,
    } as T;

    this.tools.set(id, tool);
    this.saveHistory();
    this.emit('tool:add', tool);

    return tool;
  }

  /**
   * Update a tool
   */
  updateTool(id: string, updates: Partial<Tool>): Tool | null {
    const tool = this.tools.get(id);
    if (!tool) return null;

    const updated = {
      ...tool,
      ...updates,
      id, // Prevent ID change
      updatedAt: Date.now(),
    } as Tool;

    this.tools.set(id, updated);
    this.emit('tool:update', updated);

    return updated;
  }

  /**
   * Delete a tool
   */
  deleteTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) return false;

    this.tools.delete(id);
    this.selectedIds.delete(id);
    this.saveHistory();
    this.emit('tool:delete', tool);

    return true;
  }

  /**
   * Delete selected tools
   */
  deleteSelected(): number {
    const deleted: Tool[] = [];

    this.selectedIds.forEach(id => {
      const tool = this.tools.get(id);
      if (tool && !tool.locked) {
        this.tools.delete(id);
        deleted.push(tool);
      }
    });

    this.selectedIds.clear();

    if (deleted.length > 0) {
      this.saveHistory();
      deleted.forEach(t => this.emit('tool:delete', t));
    }

    return deleted.length;
  }

  /**
   * Get a tool by ID
   */
  getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  /**
   * Get all tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Get tools for specific context
   */
  getToolsForContext(symbol?: string, timeframe?: number): Tool[] {
    return this.getAllTools().filter(tool => {
      if (tool.symbol && tool.symbol !== symbol) return false;
      if (tool.timeframe && tool.timeframe !== timeframe) return false;
      return true;
    });
  }

  // ============ SELECTION ============

  /**
   * Select a tool
   */
  selectTool(id: string, addToSelection: boolean = false): void {
    const tool = this.tools.get(id);
    if (!tool) return;

    // Clear previous selection if not adding
    if (!addToSelection) {
      this.selectedIds.forEach(selectedId => {
        if (selectedId !== id) {
          const t = this.tools.get(selectedId);
          if (t) {
            t.selected = false;
            this.emit('tool:deselect', t);
          }
        }
      });
      this.selectedIds.clear();
    }

    // Select the tool
    tool.selected = true;
    this.selectedIds.add(id);

    // Bring to front
    tool.zIndex = this.nextZIndex++;

    this.emit('tool:select', tool);
  }

  /**
   * Deselect a tool
   */
  deselectTool(id: string): void {
    const tool = this.tools.get(id);
    if (!tool) return;

    tool.selected = false;
    this.selectedIds.delete(id);
    this.emit('tool:deselect', tool);
  }

  /**
   * Deselect all
   */
  deselectAll(): void {
    this.selectedIds.forEach(id => {
      const tool = this.tools.get(id);
      if (tool) {
        tool.selected = false;
        this.emit('tool:deselect', tool);
      }
    });
    this.selectedIds.clear();
  }

  /**
   * Get selected tools
   */
  getSelectedTools(): Tool[] {
    return Array.from(this.selectedIds)
      .map(id => this.tools.get(id))
      .filter((t): t is Tool => t !== undefined);
  }

  /**
   * Check if any tool is selected
   */
  hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  // ============ DRAWING ============

  /**
   * Set active drawing tool
   */
  setActiveTool(type: ToolType): void {
    this.cancelDrawing();
    this.drawingState.activeTool = type;

    if (type !== 'cursor' && type !== 'crosshair') {
      this.deselectAll();
    }
  }

  /**
   * Get active tool type
   */
  getActiveTool(): ToolType {
    return this.drawingState.activeTool;
  }

  /**
   * Start drawing
   */
  startDrawing(point: Point): void {
    if (this.drawingState.activeTool === 'cursor' || this.drawingState.activeTool === 'crosshair') {
      return;
    }

    this.drawingState.isDrawing = true;
    this.drawingState.tempPoints = [point];
    this.emit('drawing:start', null);
  }

  /**
   * Update drawing preview
   */
  updateDrawing(point: Point): void {
    if (!this.drawingState.isDrawing) return;

    const { tempPoints, activeTool } = this.drawingState;

    if (tempPoints.length === 1) {
      tempPoints.push(point);
    } else {
      tempPoints[tempPoints.length - 1] = point;
    }

    // Create preview tool
    this.drawingState.previewTool = this.createToolFromPoints(activeTool, tempPoints);
    this.emit('drawing:update', this.drawingState.previewTool);
  }

  /**
   * Finish drawing
   */
  finishDrawing(): Tool | null {
    if (!this.drawingState.isDrawing) return null;

    const { tempPoints, activeTool } = this.drawingState;
    let tool: Tool | null = null;

    // Validate minimum points
    if (this.validateDrawing(activeTool, tempPoints)) {
      const toolData = this.createToolFromPoints(activeTool, tempPoints);
      if (toolData) {
        tool = this.addTool(toolData);
        this.selectTool(tool.id);
      }
    }

    this.drawingState.isDrawing = false;
    this.drawingState.tempPoints = [];
    this.drawingState.previewTool = null;
    this.emit('drawing:end', tool);

    return tool;
  }

  /**
   * Cancel drawing
   */
  cancelDrawing(): void {
    this.drawingState.isDrawing = false;
    this.drawingState.tempPoints = [];
    this.drawingState.previewTool = null;
  }

  /**
   * Get drawing state
   */
  getDrawingState(): DrawingState {
    return { ...this.drawingState };
  }

  /**
   * Validate drawing has enough points
   */
  private validateDrawing(type: ToolType, points: Point[]): boolean {
    switch (type) {
      case 'trendline':
      case 'rectangle':
      case 'fibRetracement':
      case 'longPosition':
      case 'shortPosition':
        return points.length >= 2;
      case 'horizontalLine':
      case 'horizontalRay':
      case 'verticalLine':
      case 'text':
        return points.length >= 1;
      default:
        return false;
    }
  }

  /**
   * Create tool data from points
   */
  private createToolFromPoints(type: ToolType, points: Point[]): PreviewTool | null {
    const style = { ...DEFAULT_STYLES[type] };
    const base = { style, visible: true, locked: false };

    switch (type) {
      case 'trendline':
        if (points.length < 2) return null;
        return {
          ...base,
          type: 'trendline',
          startPoint: points[0],
          endPoint: points[1],
          extendLeft: false,
          extendRight: false,
        };

      case 'horizontalLine':
        if (points.length < 1) return null;
        return {
          ...base,
          type: 'horizontalLine',
          price: points[0].price,
          showPrice: true,
        };

      case 'horizontalRay':
        if (points.length < 1) return null;
        return {
          ...base,
          type: 'horizontalRay',
          startPoint: points[0],
          direction: 'right',
        };

      case 'verticalLine':
        if (points.length < 1) return null;
        return {
          ...base,
          type: 'verticalLine',
          time: points[0].time,
          showTime: true,
        };

      case 'rectangle':
        if (points.length < 2) return null;
        return {
          ...base,
          type: 'rectangle',
          topLeft: {
            time: Math.min(points[0].time, points[1].time),
            price: Math.max(points[0].price, points[1].price),
          },
          bottomRight: {
            time: Math.max(points[0].time, points[1].time),
            price: Math.min(points[0].price, points[1].price),
          },
        };

      case 'fibRetracement':
        if (points.length < 2) return null;
        return {
          ...base,
          type: 'fibRetracement',
          startPoint: points[0],
          endPoint: points[1],
          levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
          showLabels: true,
          showPrices: true,
        };

      case 'longPosition':
      case 'shortPosition':
        if (points.length < 2) return null;
        const entry = points[0].price;
        const other = points[1].price;
        const isLong = type === 'longPosition';
        return {
          ...base,
          type,
          entry,
          stopLoss: isLong ? Math.min(entry, other) : Math.max(entry, other),
          takeProfit: isLong ? Math.max(entry, other) : Math.min(entry, other),
          startTime: Math.min(points[0].time, points[1].time),
          endTime: Math.max(points[0].time, points[1].time),
          showRR: true,
          showPnL: false,
        };

      case 'text':
        if (points.length < 1) return null;
        return {
          ...base,
          type: 'text',
          point: points[0],
          content: 'Text',
        };

      default:
        return null;
    }
  }

  // ============ DRAG & DROP ============

  /**
   * Start dragging
   */
  startDrag(toolId: string, handle: HandlePosition | null, point: Point): void {
    const tool = this.tools.get(toolId);
    if (!tool || tool.locked) return;

    this.dragState = {
      isDragging: true,
      toolId,
      handle,
      startPoint: point,
      originalTool: JSON.parse(JSON.stringify(tool)),
    };

    this.emit('drag:start', tool);
  }

  /**
   * Update drag
   */
  updateDrag(point: Point): void {
    if (!this.dragState.isDragging || !this.dragState.toolId || !this.dragState.originalTool) {
      return;
    }

    const deltaTime = point.time - this.dragState.startPoint.time;
    const deltaPrice = point.price - this.dragState.startPoint.price;
    const original = this.dragState.originalTool;
    const handle = this.dragState.handle;

    let updates: Partial<Tool> = {};

    switch (original.type) {
      case 'trendline': {
        const orig = original as TrendLineTool;
        if (handle === 'start') {
          updates = {
            startPoint: {
              time: orig.startPoint.time + deltaTime,
              price: orig.startPoint.price + deltaPrice,
            },
          };
        } else if (handle === 'end') {
          updates = {
            endPoint: {
              time: orig.endPoint.time + deltaTime,
              price: orig.endPoint.price + deltaPrice,
            },
          };
        } else {
          // Move entire line
          updates = {
            startPoint: {
              time: orig.startPoint.time + deltaTime,
              price: orig.startPoint.price + deltaPrice,
            },
            endPoint: {
              time: orig.endPoint.time + deltaTime,
              price: orig.endPoint.price + deltaPrice,
            },
          };
        }
        break;
      }

      case 'horizontalLine': {
        const orig = original as HorizontalLineTool;
        updates = { price: orig.price + deltaPrice };
        break;
      }

      case 'rectangle': {
        const orig = original as RectangleTool;
        if (handle === 'top-left') {
          updates = {
            topLeft: {
              time: orig.topLeft.time + deltaTime,
              price: orig.topLeft.price + deltaPrice,
            },
          };
        } else if (handle === 'bottom-right') {
          updates = {
            bottomRight: {
              time: orig.bottomRight.time + deltaTime,
              price: orig.bottomRight.price + deltaPrice,
            },
          };
        } else if (handle === 'top-right') {
          updates = {
            topLeft: { ...orig.topLeft, price: orig.topLeft.price + deltaPrice },
            bottomRight: { ...orig.bottomRight, time: orig.bottomRight.time + deltaTime },
          };
        } else if (handle === 'bottom-left') {
          updates = {
            topLeft: { ...orig.topLeft, time: orig.topLeft.time + deltaTime },
            bottomRight: { ...orig.bottomRight, price: orig.bottomRight.price + deltaPrice },
          };
        } else {
          // Move entire rectangle
          updates = {
            topLeft: {
              time: orig.topLeft.time + deltaTime,
              price: orig.topLeft.price + deltaPrice,
            },
            bottomRight: {
              time: orig.bottomRight.time + deltaTime,
              price: orig.bottomRight.price + deltaPrice,
            },
          };
        }
        break;
      }

      case 'longPosition':
      case 'shortPosition': {
        const orig = original as PositionTool;
        if (handle === 'start') {
          // Drag entry line (price only)
          updates = { entry: orig.entry + deltaPrice };
        } else if (handle === 'end') {
          // Drag TP line (price only)
          updates = { takeProfit: orig.takeProfit + deltaPrice };
        } else if (handle === 'center') {
          // Drag SL line (price only)
          updates = { stopLoss: orig.stopLoss + deltaPrice };
        } else if (handle === 'top-left') {
          // Resize left boundary
          updates = { startTime: orig.startTime + deltaTime };
        } else if (handle === 'top-right') {
          // Resize right boundary
          updates = { endTime: orig.endTime + deltaTime };
        } else {
          // Move entire position (both time and price)
          updates = {
            entry: orig.entry + deltaPrice,
            stopLoss: orig.stopLoss + deltaPrice,
            takeProfit: orig.takeProfit + deltaPrice,
            startTime: orig.startTime + deltaTime,
            endTime: orig.endTime + deltaTime,
          };
        }
        break;
      }
    }

    this.updateTool(this.dragState.toolId, updates);
    this.emit('drag:update', this.tools.get(this.dragState.toolId) || null);
  }

  /**
   * End drag
   */
  endDrag(): void {
    if (this.dragState.isDragging && this.dragState.toolId) {
      this.saveHistory();
      this.emit('drag:end', this.tools.get(this.dragState.toolId) || null);
    }

    this.dragState = {
      isDragging: false,
      toolId: null,
      handle: null,
      startPoint: { time: 0, price: 0 },
      originalTool: null,
    };
  }

  /**
   * Check if dragging
   */
  isDragging(): boolean {
    return this.dragState.isDragging;
  }

  // ============ HIT TESTING ============

  /**
   * Hit test at a point (returns closest tool)
   */
  hitTest(
    point: Point,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number,
    tolerance: number = 10
  ): HitTestResult | null {
    const results: HitTestResult[] = [];

    // Test in reverse z-order (top to bottom)
    const tools = this.getAllTools().reverse();

    for (const tool of tools) {
      if (!tool.visible) continue;

      const result = this.hitTestTool(tool, point, priceToY, timeToX, tolerance);
      if (result) {
        results.push(result);
      }
    }

    // Return closest
    if (results.length === 0) return null;
    return results.reduce((a, b) => a.distance < b.distance ? a : b);
  }

  /**
   * Hit test a specific tool
   */
  private hitTestTool(
    tool: Tool,
    point: Point,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number,
    tolerance: number
  ): HitTestResult | null {
    const px = timeToX(point.time);
    const py = priceToY(point.price);

    switch (tool.type) {
      case 'horizontalLine': {
        const lineY = priceToY(tool.price);
        const distance = Math.abs(py - lineY);
        if (distance <= tolerance) {
          return { tool, handle: null, distance };
        }
        break;
      }

      case 'trendline': {
        const x1 = timeToX(tool.startPoint.time);
        const y1 = priceToY(tool.startPoint.price);
        const x2 = timeToX(tool.endPoint.time);
        const y2 = priceToY(tool.endPoint.price);

        // Check handles first
        if (tool.selected) {
          const handleSize = 8;
          if (Math.hypot(px - x1, py - y1) <= handleSize) {
            return { tool, handle: 'start', distance: 0 };
          }
          if (Math.hypot(px - x2, py - y2) <= handleSize) {
            return { tool, handle: 'end', distance: 0 };
          }
        }

        // Check line
        const distance = this.pointToLineDistance(px, py, x1, y1, x2, y2);
        if (distance <= tolerance) {
          return { tool, handle: null, distance };
        }
        break;
      }

      case 'rectangle': {
        const x1 = timeToX(tool.topLeft.time);
        const y1 = priceToY(tool.topLeft.price);
        const x2 = timeToX(tool.bottomRight.time);
        const y2 = priceToY(tool.bottomRight.price);

        // Check handles first (if selected)
        if (tool.selected) {
          const handleSize = 8;
          if (Math.hypot(px - x1, py - y1) <= handleSize) {
            return { tool, handle: 'top-left', distance: 0 };
          }
          if (Math.hypot(px - x2, py - y2) <= handleSize) {
            return { tool, handle: 'bottom-right', distance: 0 };
          }
          if (Math.hypot(px - x2, py - y1) <= handleSize) {
            return { tool, handle: 'top-right', distance: 0 };
          }
          if (Math.hypot(px - x1, py - y2) <= handleSize) {
            return { tool, handle: 'bottom-left', distance: 0 };
          }
        }

        // Check if inside rectangle
        if (px >= x1 && px <= x2 && py >= y1 && py <= y2) {
          return { tool, handle: 'center', distance: 0 };
        }

        // Check edges
        const edges = [
          this.pointToLineDistance(px, py, x1, y1, x2, y1), // top
          this.pointToLineDistance(px, py, x2, y1, x2, y2), // right
          this.pointToLineDistance(px, py, x1, y2, x2, y2), // bottom
          this.pointToLineDistance(px, py, x1, y1, x1, y2), // left
        ];
        const minEdge = Math.min(...edges);
        if (minEdge <= tolerance) {
          return { tool, handle: null, distance: minEdge };
        }
        break;
      }

      case 'longPosition':
      case 'shortPosition': {
        const entryY = priceToY(tool.entry);
        const slY = priceToY(tool.stopLoss);
        const tpY = priceToY(tool.takeProfit);
        const leftX = timeToX(tool.startTime);
        const rightX = timeToX(tool.endTime);
        const topY = Math.min(entryY, slY, tpY);
        const bottomY = Math.max(entryY, slY, tpY);

        // Check handles if selected
        if (tool.selected) {
          const handleSize = 8;

          // Corner handles for resizing width
          if (Math.hypot(px - leftX, py - topY) <= handleSize) {
            return { tool, handle: 'top-left', distance: 0 };
          }
          if (Math.hypot(px - rightX, py - topY) <= handleSize) {
            return { tool, handle: 'top-right', distance: 0 };
          }

          // Price line handles (on left edge)
          if (Math.abs(py - entryY) <= handleSize && Math.abs(px - leftX) <= handleSize * 2) {
            return { tool, handle: 'start', distance: 0 };
          }
          if (Math.abs(py - tpY) <= handleSize && Math.abs(px - leftX) <= handleSize * 2) {
            return { tool, handle: 'end', distance: 0 };
          }
          if (Math.abs(py - slY) <= handleSize && Math.abs(px - leftX) <= handleSize * 2) {
            return { tool, handle: 'center', distance: 0 };
          }
        }

        // Check if inside position bounds
        if (px >= leftX && px <= rightX && py >= topY && py <= bottomY) {
          return { tool, handle: null, distance: 0 };
        }

        // Check lines (within X bounds)
        if (px >= leftX && px <= rightX) {
          const distances = [
            Math.abs(py - entryY),
            Math.abs(py - slY),
            Math.abs(py - tpY),
          ];
          const minDist = Math.min(...distances);
          if (minDist <= tolerance) {
            return { tool, handle: null, distance: minDist };
          }
        }
        break;
      }
    }

    return null;
  }

  /**
   * Calculate point to line segment distance
   */
  private pointToLineDistance(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.hypot(px - x1, py - y1);
    }

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.hypot(px - projX, py - projY);
  }

  /**
   * Get handles for a tool (for rendering)
   */
  getToolHandles(
    tool: Tool,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number
  ): Handle[] {
    if (!tool.selected) return [];

    const handles: Handle[] = [];
    const size = 8;

    switch (tool.type) {
      case 'trendline': {
        handles.push({
          position: 'start',
          x: timeToX(tool.startPoint.time),
          y: priceToY(tool.startPoint.price),
          size,
          cursor: 'move',
        });
        handles.push({
          position: 'end',
          x: timeToX(tool.endPoint.time),
          y: priceToY(tool.endPoint.price),
          size,
          cursor: 'move',
        });
        break;
      }

      case 'rectangle': {
        const x1 = timeToX(tool.topLeft.time);
        const y1 = priceToY(tool.topLeft.price);
        const x2 = timeToX(tool.bottomRight.time);
        const y2 = priceToY(tool.bottomRight.price);

        handles.push({ position: 'top-left', x: x1, y: y1, size, cursor: 'nw-resize' });
        handles.push({ position: 'top-right', x: x2, y: y1, size, cursor: 'ne-resize' });
        handles.push({ position: 'bottom-left', x: x1, y: y2, size, cursor: 'sw-resize' });
        handles.push({ position: 'bottom-right', x: x2, y: y2, size, cursor: 'se-resize' });
        break;
      }

      case 'longPosition':
      case 'shortPosition': {
        const leftX = timeToX(tool.startTime);
        const rightX = timeToX(tool.endTime);
        const topY = Math.min(priceToY(tool.entry), priceToY(tool.stopLoss), priceToY(tool.takeProfit));

        // Corner handles for width resizing
        handles.push({
          position: 'top-left',
          x: leftX,
          y: topY,
          size,
          cursor: 'ew-resize',
        });
        handles.push({
          position: 'top-right',
          x: rightX,
          y: topY,
          size,
          cursor: 'ew-resize',
        });

        // Price line handles (on left edge)
        handles.push({
          position: 'start',
          x: leftX,
          y: priceToY(tool.entry),
          size,
          cursor: 'ns-resize',
        });
        handles.push({
          position: 'center',
          x: leftX,
          y: priceToY(tool.stopLoss),
          size,
          cursor: 'ns-resize',
        });
        handles.push({
          position: 'end',
          x: leftX,
          y: priceToY(tool.takeProfit),
          size,
          cursor: 'ns-resize',
        });
        break;
      }
    }

    return handles;
  }

  // ============ HISTORY (UNDO/REDO) ============

  /**
   * Save current state to history
   */
  private saveHistory(): void {
    // Remove any future states
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Save current state
    const state = Array.from(this.tools.values()).map(t => JSON.parse(JSON.stringify(t)));
    this.history.push(state);

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Undo last action
   */
  undo(): boolean {
    if (this.historyIndex <= 0) return false;

    this.historyIndex--;
    this.restoreFromHistory();
    return true;
  }

  /**
   * Redo last undone action
   */
  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) return false;

    this.historyIndex++;
    this.restoreFromHistory();
    return true;
  }

  /**
   * Restore state from history
   */
  private restoreFromHistory(): void {
    const state = this.history[this.historyIndex];
    if (!state) return;

    this.tools.clear();
    this.selectedIds.clear();

    state.forEach(tool => {
      this.tools.set(tool.id, tool);
      if (tool.selected) {
        this.selectedIds.add(tool.id);
      }
    });
  }

  // ============ EVENTS ============

  /**
   * Subscribe to event
   */
  on(event: ToolEvent, callback: ToolCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: ToolEvent, tool: Tool | PreviewTool | null): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(tool, event);
      } catch (e) {
        console.error(`Error in tool event handler:`, e);
      }
    });
  }

  // ============ SERIALIZATION ============

  /**
   * Export all tools to JSON
   */
  exportToJSON(): string {
    const data = {
      version: 1,
      tools: Array.from(this.tools.values()),
      nextZIndex: this.nextZIndex,
    };
    return JSON.stringify(data);
  }

  /**
   * Import tools from JSON
   */
  importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json);

      if (!data.tools || !Array.isArray(data.tools)) {
        return false;
      }

      this.tools.clear();
      this.selectedIds.clear();

      data.tools.forEach((tool: Tool) => {
        this.tools.set(tool.id, tool);
      });

      this.nextZIndex = data.nextZIndex || this.tools.size + 1;
      this.saveHistory();

      return true;
    } catch (e) {
      console.error('Failed to import tools:', e);
      return false;
    }
  }

  /**
   * Clear all tools
   */
  clearAll(): void {
    this.tools.clear();
    this.selectedIds.clear();
    this.nextZIndex = 1;
    this.cancelDrawing();
    this.endDrag();
    this.saveHistory();
  }
}

// ============ SINGLETON ============

let toolsEngine: ToolsEngine | null = null;

export function getToolsEngine(): ToolsEngine {
  if (!toolsEngine) {
    toolsEngine = new ToolsEngine();
  }
  return toolsEngine;
}

export function resetToolsEngine(): void {
  toolsEngine?.clearAll();
  toolsEngine = null;
}
