/**
 * INTERACTION CONTROLLER
 *
 * Professional interaction state machine for trading charts
 * Handles all mouse/keyboard events with proper state transitions
 *
 * Institutional architecture
 */

import type { ToolType, Tool, HandlePosition, Point } from './types';
import { getToolsEngine } from './ToolsEngine';

// OHLC data for magnet snapping
export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type MagnetMode = 'none' | 'ohlc' | 'close';

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
  hoveredToolId: string | null;
  hoveredHandle: HandlePosition | null;
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
  onToolDeleted?: () => void;
  onModeChanged?: (mode: InteractionMode) => void;
  onActiveToolChanged?: (tool: ToolType) => void;
  onCursorChanged?: (cursor: string) => void;
  requestRedraw?: () => void;
  getOHLCAtTime?: (time: number) => OHLCData | null;
}

// ============ INTERACTION CONTROLLER ============

export class InteractionController {
  private state: InteractionState;
  private converter: CoordinateConverter | null = null;
  private callbacks: InteractionCallbacks = {};
  private chartBounds: DOMRect | null = null;
  private magnetMode: MagnetMode = 'none';
  private magnetThreshold: number = 30; // Pixels threshold for snapping (increased for better UX)
  private stayInDrawingMode: boolean = false; // Professional style: keep tool active after drawing

  // Performance optimization: throttle hover hit testing
  private lastHoverCheckTime = 0;
  private hoverCheckThrottleMs = 16; // ~60fps
  private pendingHoverCheck: Point | null = null;
  private hoverCheckTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.state = {
      mode: 'idle',
      activeTool: 'cursor',
      isMouseDown: false,
      startPoint: null,
      currentPoint: null,
      selectedToolId: null,
      dragHandle: null,
      hoveredToolId: null,
      hoveredHandle: null,
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

  setMagnetMode(mode: MagnetMode): void {
    this.magnetMode = mode;
  }

  getMagnetMode(): MagnetMode {
    return this.magnetMode;
  }

  setStayInDrawingMode(enabled: boolean): void {
    this.stayInDrawingMode = enabled;
  }

  getStayInDrawingMode(): boolean {
    return this.stayInDrawingMode;
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
    this.state.mode = 'idle'; // Always start in idle mode when selecting a new tool
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
    // Don't emit mode change here - it will be emitted when drawing actually starts/ends
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

  getCoordinateConverter(): CoordinateConverter | null {
    return this.converter;
  }

  /**
   * Get the currently hovered tool ID
   */
  getHoveredToolId(): string | null {
    return this.state.hoveredToolId;
  }

  /**
   * Get the currently hovered handle
   */
  getHoveredHandle(): HandlePosition | null {
    return this.state.hoveredHandle;
  }

  // ============ COORDINATE CONVERSION ============

  private screenToChart(screenX: number, screenY: number, applyMagnet: boolean = true): Point | null {
    if (!this.converter || !this.chartBounds) return null;

    const x = screenX - this.chartBounds.left;
    const y = screenY - this.chartBounds.top;

    let point: Point = {
      time: this.converter.xToTime(x),
      price: this.converter.yToPrice(y),
    };

    // Apply magnet snapping if enabled
    if (applyMagnet && this.magnetMode !== 'none') {
      point = this.applyMagnetSnapping(point, y);
    }

    return point;
  }

  /**
   * Apply magnet snapping to snap price to OHLC values
   */
  private applyMagnetSnapping(point: Point, screenY: number): Point {
    if (!this.callbacks.getOHLCAtTime || !this.converter) {
      return point;
    }

    const ohlc = this.callbacks.getOHLCAtTime(point.time);
    if (!ohlc) {
      return point;
    }

    // Get the prices to snap to based on mode
    let pricesToSnap: number[];
    if (this.magnetMode === 'ohlc') {
      pricesToSnap = [ohlc.open, ohlc.high, ohlc.low, ohlc.close];
    } else if (this.magnetMode === 'close') {
      pricesToSnap = [ohlc.close];
    } else {
      return point;
    }

    // Find the closest price within threshold
    let closestPrice = point.price;
    let closestDistance = Infinity;

    for (const price of pricesToSnap) {
      const priceY = this.converter.priceToY(price);
      const distance = Math.abs(priceY - screenY);

      if (distance < this.magnetThreshold && distance < closestDistance) {
        closestDistance = distance;
        closestPrice = price;
      }
    }

    return {
      time: point.time,
      price: closestPrice,
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

    // Prevent chart pan/zoom when handling drawing/tool interaction
    e.preventDefault();
    e.stopPropagation();

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
      15 // Larger tolerance for easier selection
    );

    if (hitResult) {
      // Select the tool
      engine.selectTool(hitResult.tool.id, e.shiftKey);
      this.state.selectedToolId = hitResult.tool.id;
      this.callbacks.onToolSelected?.(hitResult.tool);

      // Start drag if clicking on selected tool or handle
      if (hitResult.tool.selected || hitResult.handle) {
        // Alt-Drag Cloning
        if (this.state.modifiers.alt && !hitResult.tool.locked) {
          e.preventDefault();
          e.stopPropagation();

          // Clone the tool (exclude metadata fields)
          const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = hitResult.tool;
          const clonedTool = engine.addTool(toolData as any);

          // Select the clone and start dragging it
          engine.deselectAll();
          engine.selectTool(clonedTool.id);
          this.state.selectedToolId = clonedTool.id;
          this.callbacks.onToolSelected?.(clonedTool);

          // Start dragging the cloned tool (not the original)
          this.state.mode = 'dragging';
          this.state.dragHandle = hitResult.handle;
          engine.startDrag(clonedTool.id, hitResult.handle, point);
          this.callbacks.onModeChanged?.('dragging');
        } else {
          // Normal drag without Alt
          this.state.mode = 'dragging';
          this.state.dragHandle = hitResult.handle;
          engine.startDrag(hitResult.tool.id, hitResult.handle, point);
          this.callbacks.onModeChanged?.('dragging');
        }
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

    // Prevent chart interaction during drawing/dragging
    if (this.state.mode === 'drawing' || this.state.mode === 'dragging') {
      e.preventDefault();
      e.stopPropagation();
    }

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

    // ---- IDLE MODE - Update cursor based on hit test (throttled) ----
    this.updateCursorForPositionThrottled(point);
  }

  /**
   * Throttled version of updateCursorForPosition for performance
   * Only performs expensive hit testing at 60fps instead of every mouse move
   */
  private updateCursorForPositionThrottled(point: Point): void {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastHoverCheckTime;

    if (timeSinceLastCheck >= this.hoverCheckThrottleMs) {
      // Enough time has passed, check immediately
      this.lastHoverCheckTime = now;
      this.updateCursorForPosition(point);
      this.pendingHoverCheck = null;

      // Clear any pending timeout
      if (this.hoverCheckTimeout) {
        clearTimeout(this.hoverCheckTimeout);
        this.hoverCheckTimeout = null;
      }
    } else {
      // Too soon - queue this check for later
      this.pendingHoverCheck = point;

      // Only set timeout if not already pending
      if (!this.hoverCheckTimeout) {
        this.hoverCheckTimeout = setTimeout(() => {
          if (this.pendingHoverCheck) {
            this.lastHoverCheckTime = Date.now();
            this.updateCursorForPosition(this.pendingHoverCheck);
            this.pendingHoverCheck = null;
          }
          this.hoverCheckTimeout = null;
        }, this.hoverCheckThrottleMs - timeSinceLastCheck);
      }
    }
  }

  handleMouseUp(e: MouseEvent | React.MouseEvent): void {
    // Prevent chart from receiving up event during drawing/dragging
    if (this.state.mode === 'drawing' || this.state.mode === 'dragging') {
      e.preventDefault();
      e.stopPropagation();
    }

    const point = this.screenToChart(e.clientX, e.clientY);
    const engine = getToolsEngine();

    // ---- FINISH DRAWING ----
    if (this.state.mode === 'drawing') {
      // Instant creation for position tools: single click → auto TP/SL
      const { activeTool } = this.state;
      if (
        (activeTool === 'longPosition' || activeTool === 'shortPosition') &&
        this.state.startPoint && point
      ) {
        const dx = Math.abs(point.time - this.state.startPoint.time);
        const dy = Math.abs(point.price - this.state.startPoint.price);
        const isClick = dx < 1 && dy < 0.5;

        if (isClick) {
          const entry = this.state.startPoint.price;
          const offset = entry * 0.002; // 0.2% auto offset
          const autoTP = activeTool === 'longPosition' ? entry + offset : entry - offset;
          const secondPoint = {
            time: this.state.startPoint.time + 20 * 60, // Fixed 20-candle width (times in seconds)
            price: autoTP,
          };
          engine.updateDrawing(secondPoint);
        }
      }

      const newTool = engine.finishDrawing();

      if (newTool) {
        // Keep the tool selected so the settings bar stays visible
        this.state.selectedToolId = newTool.id;
        engine.selectTool(newTool.id);
        this.callbacks.onToolCreated?.(newTool);
        this.callbacks.onToolSelected?.(newTool);
      }

      // Reset to idle mode
      this.state.mode = 'idle';
      this.callbacks.onModeChanged?.('idle');

      // Professional style: if stay-in-drawing-mode is enabled, keep the tool active
      if (!this.stayInDrawingMode) {
        // Return to cursor after drawing
        this.state.activeTool = 'cursor';
        engine.setActiveTool('cursor');
        this.callbacks.onActiveToolChanged?.('cursor');
      }
      // else: keep activeTool unchanged for next drawing
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
    // If actively drawing or dragging, keep going — window events handle completion
    if (this.state.mode === 'drawing' || this.state.mode === 'dragging') {
      return;
    }

    this.state.isMouseDown = false;
    this.state.currentPoint = null;
    this.callbacks.requestRedraw?.();
  }

  // ============ KEYBOARD HANDLERS ============

  handleKeyDown(e: KeyboardEvent): boolean {
    // Guard against undefined e.key (IME composition, dead keys, etc.)
    if (!e.key) return false;

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
        this.callbacks.onActiveToolChanged?.('cursor');
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
        this.callbacks.onToolDeleted?.();
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

    // Duplicate selected tool (Ctrl+D / Cmd+D)
    if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const selected = engine.getSelectedTools();

      if (selected.length > 0) {
        const clonedIds: string[] = [];

        for (const tool of selected) {
          // Extract props without id/metadata
          const { id, createdAt, updatedAt, selected: _, zIndex, ...toolData } = tool;

          // Clone with offset for visibility (simplified - works for most tools)
          const cloned = engine.addTool({
            ...toolData,
          } as any);

          clonedIds.push(cloned.id);
        }

        // Select clones
        engine.deselectAll();
        clonedIds.forEach(id => engine.selectTool(id, true));
        this.callbacks.requestRedraw?.();
        return true;
      }
    }

    // Professional single-letter tool shortcuts
    // Only trigger if no input/textarea is focused
    const activeEl = document.activeElement;
    const isInputFocused =
      activeEl instanceof HTMLInputElement ||
      activeEl instanceof HTMLTextAreaElement ||
      activeEl?.getAttribute('contenteditable') === 'true';

    if (!isInputFocused && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const TOOL_SHORTCUTS: Record<string, ToolType> = {
        'v': 'cursor',
        'c': 'crosshair',
        't': 'trendline',
        'h': 'horizontalLine',
        'e': 'horizontalRay', // Extended horizontal
        'i': 'verticalLine',
        'r': 'rectangle',
        'p': 'parallelChannel',
        'f': 'fibRetracement',
        'l': 'longPosition',
        's': 'shortPosition',
        'a': 'arrow',
        'b': 'brush',
        'n': 'text', // Note
        'm': 'measure',
      };

      const toolType = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (toolType) {
        e.preventDefault();
        this.setActiveTool(toolType);
        engine.setActiveTool(toolType);
        this.callbacks.onActiveToolChanged?.(toolType);
        return true;
      }
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
      15 // Larger tolerance for easier selection
    );

    let cursor = 'default';

    // Update hover state
    const prevHoveredId = this.state.hoveredToolId;
    const prevHoveredHandle = this.state.hoveredHandle;

    if (hitResult) {
      this.state.hoveredToolId = hitResult.tool.id;
      this.state.hoveredHandle = hitResult.handle;
    } else {
      this.state.hoveredToolId = null;
      this.state.hoveredHandle = null;
    }

    // Request redraw if hover state changed
    if (prevHoveredId !== this.state.hoveredToolId || prevHoveredHandle !== this.state.hoveredHandle) {
      this.callbacks.requestRedraw?.();
    }

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
      hoveredToolId: null,
      hoveredHandle: null,
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
