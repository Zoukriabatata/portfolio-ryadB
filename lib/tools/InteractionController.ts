/**
 * INTERACTION CONTROLLER
 *
 * Professional interaction state machine for trading charts
 * Handles all mouse/keyboard events with proper state transitions
 *
 * Architecture based on TradingView / ATAS / NinjaTrader
 */

import {
  getToolsEngine,
  type ToolType,
  type Tool,
  type HandlePosition,
  type Point,
} from './ToolsEngine';

// ============ INTERACTION STATES ============

export type InteractionMode =
  | 'idle'           // Normal chart interaction (pan, zoom, crosshair)
  | 'drawing'        // Creating a new tool
  | 'selecting'      // Selecting tools (click to select)
  | 'dragging'       // Moving or resizing a tool
  | 'panning'        // Chart pan/scroll
  | 'zooming';       // Chart zoom

export interface InteractionState {
  mode: InteractionMode;
  activeTool: ToolType;
  isMouseDown: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  selectedToolId: string | null;
  dragHandle: HandlePosition | null;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
}

export interface CoordinateConverter {
  xToTime: (x: number) => number;
  timeToX: (time: number) => number;
  yToPrice: (y: number) => number;
  priceToY: (price: number) => number;
}

export interface InteractionCallbacks {
  onToolSelected?: (tool: Tool | null) => void;
  onToolCreated?: (tool: Tool) => void;
  onToolUpdated?: (tool: Tool) => void;
  onModeChanged?: (mode: InteractionMode) => void;
  onCursorChanged?: (cursor: string) => void;
  requestRedraw?: () => void;
}

// ============ INTERACTION CONTROLLER ============

export class InteractionController {
  private state: InteractionState;
  private converter: CoordinateConverter | null = null;
  private callbacks: InteractionCallbacks = {};
  private chartBounds: DOMRect | null = null;

  constructor() {
    this.state = {
      mode: 'idle',
      activeTool: 'cursor',
      isMouseDown: false,
      startPoint: null,
      currentPoint: null,
      selectedToolId: null,
      dragHandle: null,
      modifiers: { shift: false, ctrl: false, alt: false },
    };
  }

  // ============ CONFIGURATION ============

  setCoordinateConverter(converter: CoordinateConverter): void {
    this.converter = converter;
  }

  setCallbacks(callbacks: InteractionCallbacks): void {
    this.callbacks = callbacks;
  }

  setChartBounds(bounds: DOMRect): void {
    this.chartBounds = bounds;
  }

  // ============ TOOL SELECTION ============

  setActiveTool(type: ToolType): void {
    const engine = getToolsEngine();

    // Cancel any ongoing drawing
    if (this.state.mode === 'drawing') {
      engine.cancelDrawing();
    }

    // Reset state
    this.state.activeTool = type;
    this.state.mode = type === 'cursor' || type === 'crosshair' ? 'idle' : 'idle';
    this.state.isMouseDown = false;
    this.state.startPoint = null;

    // Update engine
    engine.setActiveTool(type);

    // Deselect if selecting a drawing tool
    if (type !== 'cursor' && type !== 'crosshair') {
      engine.deselectAll();
      this.state.selectedToolId = null;
      this.callbacks.onToolSelected?.(null);
    }

    this.updateCursor();
    this.callbacks.onModeChanged?.(this.state.mode);
  }

  getActiveTool(): ToolType {
    return this.state.activeTool;
  }

  getMode(): InteractionMode {
    return this.state.mode;
  }

  getState(): InteractionState {
    return { ...this.state };
  }

  // ============ COORDINATE CONVERSION ============

  private screenToChart(screenX: number, screenY: number): Point | null {
    if (!this.converter || !this.chartBounds) return null;

    const x = screenX - this.chartBounds.left;
    const y = screenY - this.chartBounds.top;

    return {
      time: this.converter.xToTime(x),
      price: this.converter.yToPrice(y),
    };
  }

  private chartToScreen(point: Point): { x: number; y: number } | null {
    if (!this.converter) return null;

    return {
      x: this.converter.timeToX(point.time),
      y: this.converter.priceToY(point.price),
    };
  }

  // ============ MOUSE HANDLERS ============

  handleMouseDown(e: MouseEvent | React.MouseEvent): void {
    const point = this.screenToChart(e.clientX, e.clientY);
    if (!point) return;

    this.state.isMouseDown = true;
    this.state.startPoint = point;
    this.state.currentPoint = point;
    this.state.modifiers = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    };

    const engine = getToolsEngine();
    const { activeTool } = this.state;

    // ---- DRAWING MODE ----
    if (activeTool !== 'cursor' && activeTool !== 'crosshair') {
      this.state.mode = 'drawing';
      engine.deselectAll();
      engine.setActiveTool(activeTool);
      engine.startDrawing(point);
      this.callbacks.onModeChanged?.('drawing');
      this.callbacks.requestRedraw?.();
      return;
    }

    // ---- SELECTION / DRAG MODE ----
    const hitResult = engine.hitTest(
      point,
      this.converter!.priceToY,
      this.converter!.timeToX,
      10
    );

    if (hitResult) {
      // Select the tool
      engine.selectTool(hitResult.tool.id, e.shiftKey);
      this.state.selectedToolId = hitResult.tool.id;
      this.callbacks.onToolSelected?.(hitResult.tool);

      // Start drag if clicking on selected tool or handle
      if (hitResult.tool.selected || hitResult.handle) {
        this.state.mode = 'dragging';
        this.state.dragHandle = hitResult.handle;
        engine.startDrag(hitResult.tool.id, hitResult.handle, point);
        this.callbacks.onModeChanged?.('dragging');
      } else {
        this.state.mode = 'selecting';
      }
    } else {
      // Clicked on empty space - deselect all
      engine.deselectAll();
      this.state.selectedToolId = null;
      this.state.mode = 'idle';
      this.callbacks.onToolSelected?.(null);
    }

    this.callbacks.requestRedraw?.();
  }

  handleMouseMove(e: MouseEvent | React.MouseEvent): void {
    const point = this.screenToChart(e.clientX, e.clientY);
    if (!point) return;

    this.state.currentPoint = point;
    this.state.modifiers = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    };

    const engine = getToolsEngine();

    // ---- DRAWING MODE ----
    if (this.state.mode === 'drawing') {
      // Apply modifiers for snapping
      const snappedPoint = this.applyModifierSnapping(
        this.state.startPoint!,
        point,
        this.state.modifiers
      );
      engine.updateDrawing(snappedPoint);
      this.callbacks.requestRedraw?.();
      return;
    }

    // ---- DRAGGING MODE ----
    if (this.state.mode === 'dragging') {
      const snappedPoint = this.applyModifierSnapping(
        this.state.startPoint!,
        point,
        this.state.modifiers
      );
      engine.updateDrag(snappedPoint);
      this.callbacks.requestRedraw?.();
      return;
    }

    // ---- IDLE MODE - Update cursor based on hit test ----
    this.updateCursorForPosition(point);
  }

  handleMouseUp(e: MouseEvent | React.MouseEvent): void {
    const point = this.screenToChart(e.clientX, e.clientY);
    const engine = getToolsEngine();

    // ---- FINISH DRAWING ----
    if (this.state.mode === 'drawing') {
      const newTool = engine.finishDrawing();

      if (newTool) {
        this.state.selectedToolId = newTool.id;
        this.callbacks.onToolCreated?.(newTool);
        this.callbacks.onToolSelected?.(newTool);
      }

      // Reset to cursor mode after drawing
      this.state.mode = 'idle';
      this.state.activeTool = 'cursor';
      engine.setActiveTool('cursor');
      this.callbacks.onModeChanged?.('idle');
    }

    // ---- FINISH DRAGGING ----
    if (this.state.mode === 'dragging') {
      engine.endDrag();
      this.state.mode = 'idle';
      this.state.dragHandle = null;
      this.callbacks.onModeChanged?.('idle');

      // Update selected tool reference
      if (this.state.selectedToolId) {
        const tool = engine.getTool(this.state.selectedToolId);
        if (tool) {
          this.callbacks.onToolUpdated?.(tool);
        }
      }
    }

    // Reset mouse state
    this.state.isMouseDown = false;
    this.state.startPoint = null;

    this.updateCursor();
    this.callbacks.requestRedraw?.();
  }

  handleMouseLeave(): void {
    // Cancel drawing if mouse leaves chart
    if (this.state.mode === 'drawing') {
      const engine = getToolsEngine();
      engine.cancelDrawing();
      this.state.mode = 'idle';
      this.callbacks.onModeChanged?.('idle');
    }

    this.state.isMouseDown = false;
    this.state.currentPoint = null;
    this.callbacks.requestRedraw?.();
  }

  // ============ KEYBOARD HANDLERS ============

  handleKeyDown(e: KeyboardEvent): boolean {
    const engine = getToolsEngine();

    // Update modifiers
    this.state.modifiers = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    };

    // Escape - cancel drawing or deselect
    if (e.key === 'Escape') {
      if (this.state.mode === 'drawing') {
        engine.cancelDrawing();
        this.state.mode = 'idle';
        this.state.activeTool = 'cursor';
        engine.setActiveTool('cursor');
        this.callbacks.onModeChanged?.('idle');
        this.callbacks.requestRedraw?.();
        return true;
      }

      if (engine.hasSelection()) {
        engine.deselectAll();
        this.state.selectedToolId = null;
        this.callbacks.onToolSelected?.(null);
        this.callbacks.requestRedraw?.();
        return true;
      }
    }

    // Delete - remove selected tools
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (engine.hasSelection() && document.activeElement?.tagName !== 'INPUT') {
        engine.deleteSelected();
        this.state.selectedToolId = null;
        this.callbacks.onToolSelected?.(null);
        this.callbacks.requestRedraw?.();
        return true;
      }
    }

    // Undo (Ctrl+Z)
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      engine.undo();
      this.callbacks.requestRedraw?.();
      return true;
    }

    // Redo (Ctrl+Y or Ctrl+Shift+Z)
    if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
      engine.redo();
      this.callbacks.requestRedraw?.();
      return true;
    }

    return false;
  }

  handleKeyUp(e: KeyboardEvent): void {
    this.state.modifiers = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    };
  }

  // ============ MODIFIER SNAPPING ============

  private applyModifierSnapping(
    start: Point,
    current: Point,
    modifiers: { shift: boolean; ctrl: boolean; alt: boolean }
  ): Point {
    if (!modifiers.shift) return current;

    const dx = current.time - start.time;
    const dy = current.price - start.price;

    // Calculate angle
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const absAngle = Math.abs(angle);

    // Snap to horizontal (0°)
    if (absAngle < 15 || absAngle > 165) {
      return { time: current.time, price: start.price };
    }

    // Snap to vertical (90°)
    if (absAngle > 75 && absAngle < 105) {
      return { time: start.time, price: current.price };
    }

    // Snap to 45° diagonal
    if (absAngle > 30 && absAngle < 60) {
      const avgDelta = (Math.abs(dx) + Math.abs(dy)) / 2;
      return {
        time: start.time + Math.sign(dx) * avgDelta,
        price: start.price + Math.sign(dy) * avgDelta,
      };
    }

    // Snap to -45° diagonal
    if (absAngle > 120 && absAngle < 150) {
      const avgDelta = (Math.abs(dx) + Math.abs(dy)) / 2;
      return {
        time: start.time + Math.sign(dx) * avgDelta,
        price: start.price - Math.sign(dy) * avgDelta,
      };
    }

    return current;
  }

  // ============ CURSOR MANAGEMENT ============

  private updateCursor(): void {
    let cursor = 'default';

    switch (this.state.activeTool) {
      case 'cursor':
        cursor = 'default';
        break;
      case 'crosshair':
        cursor = 'crosshair';
        break;
      case 'trendline':
      case 'horizontalLine':
      case 'horizontalRay':
      case 'verticalLine':
      case 'rectangle':
      case 'fibRetracement':
      case 'longPosition':
      case 'shortPosition':
      case 'text':
        cursor = 'crosshair';
        break;
    }

    if (this.state.mode === 'dragging') {
      cursor = this.state.dragHandle ? 'grabbing' : 'move';
    }

    this.callbacks.onCursorChanged?.(cursor);
  }

  private updateCursorForPosition(point: Point): void {
    if (!this.converter) return;

    const engine = getToolsEngine();
    const hitResult = engine.hitTest(
      point,
      this.converter.priceToY,
      this.converter.timeToX,
      10
    );

    let cursor = 'default';

    if (this.state.activeTool !== 'cursor' && this.state.activeTool !== 'crosshair') {
      cursor = 'crosshair';
    } else if (hitResult) {
      if (hitResult.handle) {
        // Get cursor from handle
        const handles = engine.getToolHandles(
          hitResult.tool,
          this.converter.priceToY,
          this.converter.timeToX
        );
        const handle = handles.find(h => h.position === hitResult.handle);
        cursor = handle?.cursor || 'move';
      } else {
        cursor = 'move';
      }
    } else if (this.state.activeTool === 'crosshair') {
      cursor = 'crosshair';
    }

    this.callbacks.onCursorChanged?.(cursor);
  }

  // ============ RESET ============

  reset(): void {
    const engine = getToolsEngine();
    engine.cancelDrawing();
    engine.endDrag();
    engine.deselectAll();

    this.state = {
      mode: 'idle',
      activeTool: 'cursor',
      isMouseDown: false,
      startPoint: null,
      currentPoint: null,
      selectedToolId: null,
      dragHandle: null,
      modifiers: { shift: false, ctrl: false, alt: false },
    };

    this.callbacks.onToolSelected?.(null);
    this.callbacks.onModeChanged?.('idle');
    this.updateCursor();
  }
}

// ============ SINGLETON ============

let interactionController: InteractionController | null = null;

export function getInteractionController(): InteractionController {
  if (!interactionController) {
    interactionController = new InteractionController();
  }
  return interactionController;
}

export function resetInteractionController(): void {
  interactionController?.reset();
  interactionController = null;
}
