/**
 * TOOLS ENGINE - Professional Trading Tools System
 *
 * Institutional architecture
 *
 * Features:
 * - Sélection / désélection au clic
 * - Drag & resize avec handles
 * - Suppression Delete / Backspace
 * - Z-index management
 * - Persistance cross-timeframe
 * - Undo / Redo ready
 */

// ============ TYPES (re-exported from types.ts) ============

export type {
  ToolType,
  LineStyle,
  HandlePosition,
  Point,
  ToolStyle,
  ToolText,
  Handle,
  BaseTool,
  TrendLineTool,
  HorizontalLineTool,
  HorizontalRayTool,
  VerticalLineTool,
  RectangleZone,
  RectangleTool,
  FibRetracementTool,
  PositionTool,
  TextTool,
  ParallelChannelTool,
  FibExtensionTool,
  MeasureTool,
  EllipseTool,
  Tool,
  PreviewTrendLineTool,
  PreviewHorizontalLineTool,
  PreviewHorizontalRayTool,
  PreviewVerticalLineTool,
  PreviewRectangleTool,
  PreviewFibRetracementTool,
  PreviewPositionTool,
  PreviewTextTool,
  PreviewParallelChannelTool,
  PreviewFibExtensionTool,
  PreviewMeasureTool,
  PreviewEllipseTool,
  PreviewTool,
  DrawingState,
  DragState,
  HitTestResult,
  ToolEvent,
  ToolCallback,
} from './types';

import type {
  ToolType,
  LineStyle,
  HandlePosition,
  Point,
  ToolStyle,
  ToolText,
  Handle,
  Tool,
  TrendLineTool,
  HorizontalLineTool,
  HorizontalRayTool,
  VerticalLineTool,
  RectangleTool,
  FibRetracementTool,
  PositionTool,
  TextTool,
  ParallelChannelTool,
  FibExtensionTool,
  MeasureTool,
  EllipseTool,
  PreviewTool,
  DrawingState,
  DragState,
  HitTestResult,
  ToolEvent,
  ToolCallback,
} from './types';

import { toolRegistry } from './registry/ToolRegistry';

// Register all tool definitions (side-effect imports)
import './definitions';

// ============ DEFAULT STYLES ============

export const DEFAULT_STYLES: Record<ToolType, ToolStyle> = {
  cursor: { color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
  crosshair: { color: '#ffffff', lineWidth: 1, lineStyle: 'dashed' },
  trendline: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
  ray: { color: '#8b5cf6', lineWidth: 2, lineStyle: 'solid' },
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
  parallelChannel: {
    color: '#22c55e',
    lineWidth: 1,
    lineStyle: 'solid',
    fillColor: '#22c55e',
    fillOpacity: 0.05
  },
  fibRetracement: { color: '#f59e0b', lineWidth: 1, lineStyle: 'solid' },
  fibExtension: { color: '#ec4899', lineWidth: 1, lineStyle: 'solid' },
  arrow: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid' },
  brush: { color: '#3b82f6', lineWidth: 3, lineStyle: 'solid' },
  highlighter: {
    color: '#eab308',
    lineWidth: 8,
    lineStyle: 'solid',
    fillOpacity: 0.3
  },
  measure: { color: '#8b5cf6', lineWidth: 1, lineStyle: 'dashed' },
  ellipse: { color: '#06b6d4', lineWidth: 1, lineStyle: 'solid', fillColor: '#06b6d4', fillOpacity: 0.08 },
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
  private customDefaultStyles: Map<ToolType, ToolStyle> = new Map();
  private styleHistoryTimer: ReturnType<typeof setTimeout> | null = null;
  private styleHistoryPending = false;

  // Transient animated lineWidth values (not persisted)
  private animatedLineWidths: Map<string, number> = new Map();
  private lineWidthAnimations: Map<string, number> = new Map(); // rAF ids

  // Transient position close fade (0=active, 1=fully faded — not persisted)
  private animatedPositionFade: Map<string, number> = new Map();
  private positionFadeAnimations: Map<string, number> = new Map(); // rAF ids

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

    // Load custom default styles from localStorage
    this.loadDefaultStyles();
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
  updateTool(id: string, updates: Partial<Tool>, saveToHistory = false): Tool | null {
    const tool = this.tools.get(id);
    if (!tool) return null;

    if (saveToHistory) this.saveHistory();

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
    // Clean up any running animations
    const anim = this.lineWidthAnimations.get(id);
    if (anim) { cancelAnimationFrame(anim); this.lineWidthAnimations.delete(id); }
    this.animatedLineWidths.delete(id);
    const fadeAnim = this.positionFadeAnimations.get(id);
    if (fadeAnim) { cancelAnimationFrame(fadeAnim); this.positionFadeAnimations.delete(id); }
    this.animatedPositionFade.delete(id);
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

  // ============ TEXT EDITING ============

  /**
   * Start editing a text tool
   */
  startTextEdit(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (!tool || tool.type !== 'text') return;

    this.updateTool(toolId, { isEditing: true } as Partial<Tool>);
    this.emit('text:edit-start', tool);
  }

  /**
   * Finish editing a text tool
   */
  finishTextEdit(toolId: string, newContent: string): void {
    const tool = this.tools.get(toolId);
    if (!tool || tool.type !== 'text') return;

    this.updateTool(toolId, {
      isEditing: false,
      content: newContent,
    } as Partial<Tool>);
    this.emit('text:edit-end', tool);
  }

  /**
   * Cancel text editing
   */
  cancelTextEdit(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (!tool || tool.type !== 'text') return;

    this.updateTool(toolId, { isEditing: false } as Partial<Tool>);
    this.emit('text:edit-cancel', tool);
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
    const def = toolRegistry.get(type);
    if (def) return points.length >= def.minPoints;
    return false;
  }

  /**
   * Create tool data from points
   */
  private createToolFromPoints(type: ToolType, points: Point[]): PreviewTool | null {
    const style = { ...this.getDefaultStyle(type) };
    const def = toolRegistry.get(type);
    if (def) return def.createFromPoints(points, style);
    return null;
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

    const def = toolRegistry.get(original.type);
    const updates = def
      ? def.updateDrag(original, handle, deltaTime, deltaPrice)
      : {};

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

    const def = toolRegistry.get(tool.type);
    if (def) {
      const result = def.hitTest(tool, px, py, { timeToX, priceToY }, tolerance);
      if (result) return { tool, handle: result.handle, distance: result.distance };
    }
    return null;
  }

  /**
   * Get handles for a tool (for rendering)
   * Returns handles for selected tools with larger size for better visibility
   */
  getToolHandles(
    tool: Tool,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number
  ): Handle[] {
    if (!tool.selected) return [];

    const def = toolRegistry.get(tool.type);
    if (def) return def.getHandles(tool, { timeToX, priceToY });
    return [];
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
        if (tool.type === 'longPosition' || tool.type === 'shortPosition') {
          // Remove deprecated extendRight field
          delete (tool as any).extendRight;
          // Fix invalid endTime (from old extendRight era — endTime was meaningless)
          const pos = tool as any;
          if (!pos.endTime || pos.endTime <= pos.startTime ||
              pos.endTime - pos.startTime > 24 * 3600) {
            pos.endTime = pos.startTime + 20 * 60;
          }
          // Migration: remove auto-lock from closed positions (old behavior)
          if (pos.positionStatus === 'closed' && pos.locked === true) {
            pos.locked = false;
          }
        }
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

  // ============ STYLE UPDATES (UNDO-SAFE) ============

  /**
   * Update a single tool's style with debounced undo history.
   * Saves a snapshot ONCE before a batch of rapid changes (e.g. slider drag),
   * then finalizes after 500ms of inactivity.
   */
  updateToolStyle(id: string, styleUpdates: Partial<ToolStyle>): Tool | null {
    const tool = this.tools.get(id);
    if (!tool) return null;

    if (!this.styleHistoryPending) {
      this.saveHistory();
      this.styleHistoryPending = true;
    }
    if (this.styleHistoryTimer) clearTimeout(this.styleHistoryTimer);
    this.styleHistoryTimer = setTimeout(() => { this.styleHistoryPending = false; }, 500);

    // Animate lineWidth transition
    if (styleUpdates.lineWidth !== undefined && styleUpdates.lineWidth !== tool.style.lineWidth) {
      this.animateLineWidth(id, tool.style.lineWidth, styleUpdates.lineWidth);
    }

    return this.updateTool(id, { style: { ...tool.style, ...styleUpdates } }, false);
  }

  /**
   * Update ALL selected tools' styles at once with debounced undo history.
   */
  updateSelectedToolsStyle(styleUpdates: Partial<ToolStyle>): void {
    const selected = this.getSelectedTools();
    if (selected.length === 0) return;

    if (!this.styleHistoryPending) {
      this.saveHistory();
      this.styleHistoryPending = true;
    }
    if (this.styleHistoryTimer) clearTimeout(this.styleHistoryTimer);
    this.styleHistoryTimer = setTimeout(() => { this.styleHistoryPending = false; }, 500);

    for (const tool of selected) {
      // Animate lineWidth transition for each tool in parallel
      if (styleUpdates.lineWidth !== undefined && styleUpdates.lineWidth !== tool.style.lineWidth) {
        this.animateLineWidth(tool.id, tool.style.lineWidth, styleUpdates.lineWidth);
      }
      this.updateTool(tool.id, { style: { ...tool.style, ...styleUpdates } }, false);
    }
  }

  // ============ LINE WIDTH ANIMATION ============

  /**
   * Get the animated lineWidth for rendering (falls back to style.lineWidth).
   * The renderer should call this instead of reading tool.style.lineWidth directly.
   */
  getAnimatedLineWidth(toolId: string, fallback?: number): number {
    const animated = this.animatedLineWidths.get(toolId);
    if (animated !== undefined) return animated;
    if (fallback !== undefined) return fallback;
    const tool = this.tools.get(toolId);
    return tool?.style.lineWidth ?? 2;
  }

  /**
   * Animate lineWidth for a single tool with cubic-out easing.
   * Duration: 100ms. The chart's existing rAF loop picks up changes automatically.
   */
  private animateLineWidth(toolId: string, from: number, to: number): void {
    // Cancel any running animation for this tool
    const existing = this.lineWidthAnimations.get(toolId);
    if (existing) cancelAnimationFrame(existing);

    const duration = 100; // ms
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const frame = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = easeOutCubic(progress);
      this.animatedLineWidths.set(toolId, from + (to - from) * eased);

      if (progress < 1) {
        this.lineWidthAnimations.set(toolId, requestAnimationFrame(frame));
      } else {
        // Animation done — clean up
        this.animatedLineWidths.delete(toolId);
        this.lineWidthAnimations.delete(toolId);
      }
    };

    // Set initial animated value
    this.animatedLineWidths.set(toolId, from);
    this.lineWidthAnimations.set(toolId, requestAnimationFrame(frame));
  }

  // ============ POSITION FADE ANIMATION ============

  /**
   * Get the animated fade factor for a closed position.
   * Returns 0..1 (0 = active, 1 = fully faded) or null if no animation data.
   */
  getPositionFadeFactor(toolId: string): number | null {
    const value = this.animatedPositionFade.get(toolId);
    return value !== undefined ? value : null;
  }

  /**
   * Start a 120ms easeOutCubic fade for a closed position (0→1).
   * Keeps final value in map so renderer knows it's fully faded.
   */
  animatePositionFade(toolId: string): void {
    const existing = this.positionFadeAnimations.get(toolId);
    if (existing) cancelAnimationFrame(existing);

    const duration = 120;
    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const frame = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      this.animatedPositionFade.set(toolId, easeOutCubic(progress));

      if (progress < 1) {
        this.positionFadeAnimations.set(toolId, requestAnimationFrame(frame));
      } else {
        // Keep final value (1.0) — renderer reads it for closed state
        this.positionFadeAnimations.delete(toolId);
      }
    };

    this.animatedPositionFade.set(toolId, 0);
    this.positionFadeAnimations.set(toolId, requestAnimationFrame(frame));
  }

  /**
   * Clear fade state (for reopen / undo).
   */
  clearPositionFade(toolId: string): void {
    const anim = this.positionFadeAnimations.get(toolId);
    if (anim) cancelAnimationFrame(anim);
    this.positionFadeAnimations.delete(toolId);
    this.animatedPositionFade.delete(toolId);
  }

  // ============ DEFAULT STYLES MANAGEMENT ============

  /**
   * Set custom default style for a tool type
   */
  setDefaultStyle(type: ToolType, style: Partial<ToolStyle>): void {
    const current = this.customDefaultStyles.get(type) || DEFAULT_STYLES[type];
    this.customDefaultStyles.set(type, { ...current, ...style });
    this.saveDefaultStyles();
  }

  /**
   * Get default style for a tool type (custom or fallback to built-in)
   */
  getDefaultStyle(type: ToolType): ToolStyle {
    return this.customDefaultStyles.get(type) || DEFAULT_STYLES[type];
  }

  /**
   * Reset to built-in defaults
   */
  resetDefaultStyle(type: ToolType): void {
    this.customDefaultStyles.delete(type);
    this.saveDefaultStyles();
  }

  /**
   * Save custom default styles to localStorage
   */
  private saveDefaultStyles(): void {
    try {
      const obj = Object.fromEntries(this.customDefaultStyles);
      localStorage.setItem('toolDefaultStyles', JSON.stringify(obj));
    } catch (e) {
      console.error('Failed to save default styles:', e);
    }
  }

  /**
   * Load custom default styles from localStorage.
   * Also performs one-time migration of old Zustand toolDefaults (v3 → engine).
   */
  private loadDefaultStyles(): void {
    try {
      const saved = localStorage.getItem('toolDefaultStyles');
      if (saved) {
        const obj = JSON.parse(saved);
        this.customDefaultStyles = new Map(Object.entries(obj) as [ToolType, ToolStyle][]);
      }

      // One-time migration: import toolDefaults from old Zustand store (v3)
      const zustandRaw = localStorage.getItem('tool-settings-storage');
      if (zustandRaw) {
        try {
          const zustandData = JSON.parse(zustandRaw);
          const oldState = zustandData?.state ?? zustandData;
          if (oldState?.toolDefaults && typeof oldState.toolDefaults === 'object') {
            let migrated = false;
            for (const [toolType, defaults] of Object.entries(oldState.toolDefaults)) {
              if (!this.customDefaultStyles.has(toolType as ToolType) && defaults) {
                this.customDefaultStyles.set(toolType as ToolType, {
                  ...DEFAULT_STYLES[toolType as ToolType],
                  ...(defaults as Partial<ToolStyle>),
                } as ToolStyle);
                migrated = true;
              }
            }
            if (migrated) {
              this.saveDefaultStyles();
              console.log('[ToolsEngine] Migrated toolDefaults from Zustand store');
            }
          }
        } catch { /* ignore parse errors from Zustand key */ }
      }
    } catch (e) {
      console.error('Failed to load default styles:', e);
    }
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
