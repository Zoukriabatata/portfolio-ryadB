/**
 * TRADING TOOLS ENGINE
 *
 * Gère les outils de dessin interactifs :
 * - Trend Line
 * - Horizontal Line / Ray
 * - Rectangle (zone)
 * - Position LONG/SHORT (entrée, SL, TP)
 */

// ============ TYPES ============

export type ToolType =
  | 'cursor'
  | 'trendline'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'rectangle'
  | 'longPosition'
  | 'shortPosition';

export interface Point {
  time: number;    // Unix timestamp
  price: number;
}

export interface ToolStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
}

export interface BaseTool {
  id: string;
  type: ToolType;
  style: ToolStyle;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  createdAt: number;
  updatedAt: number;
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

export interface RectangleTool extends BaseTool {
  type: 'rectangle';
  topLeft: Point;
  bottomRight: Point;
}

export interface PositionTool extends BaseTool {
  type: 'longPosition' | 'shortPosition';
  entry: number;
  stopLoss: number;
  takeProfit: number;
  time: number;
  quantity?: number;
  riskReward?: number;
}

export type Tool =
  | TrendLineTool
  | HorizontalLineTool
  | HorizontalRayTool
  | RectangleTool
  | PositionTool;

export interface DrawingState {
  isDrawing: boolean;
  currentTool: ToolType;
  tempPoints: Point[];
}

// ============ DEFAULT STYLES ============

export const DEFAULT_TOOL_STYLES: Record<ToolType, ToolStyle> = {
  cursor: { color: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
  trendline: { color: '#3b82f6', lineWidth: 2, lineStyle: 'solid' },
  horizontalLine: { color: '#f59e0b', lineWidth: 1, lineStyle: 'dashed' },
  horizontalRay: { color: '#8b5cf6', lineWidth: 1, lineStyle: 'solid' },
  rectangle: { color: '#06b6d4', lineWidth: 1, lineStyle: 'solid', fillColor: '#06b6d4', fillOpacity: 0.1 },
  longPosition: { color: '#22c55e', lineWidth: 2, lineStyle: 'solid', fillColor: '#22c55e', fillOpacity: 0.15 },
  shortPosition: { color: '#ef4444', lineWidth: 2, lineStyle: 'solid', fillColor: '#ef4444', fillOpacity: 0.15 },
};

// ============ TRADING TOOLS ENGINE ============

type ToolEventType = 'tool:add' | 'tool:update' | 'tool:delete' | 'tool:select';
type ToolCallback = (tool: Tool | null) => void;

export class TradingToolsEngine {
  private tools: Map<string, Tool> = new Map();
  private drawingState: DrawingState;
  private listeners: Map<ToolEventType, Set<ToolCallback>> = new Map();
  private selectedId: string | null = null;

  constructor() {
    this.drawingState = {
      isDrawing: false,
      currentTool: 'cursor',
      tempPoints: [],
    };

    this.listeners.set('tool:add', new Set());
    this.listeners.set('tool:update', new Set());
    this.listeners.set('tool:delete', new Set());
    this.listeners.set('tool:select', new Set());
  }

  // ============ TOOL MANAGEMENT ============

  /**
   * Ajoute un outil
   */
  addTool<T extends Tool>(toolData: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'selected'>): T {
    const id = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    const newTool = {
      ...toolData,
      id,
      createdAt: now,
      updatedAt: now,
      selected: false,
    } as T;

    this.tools.set(id, newTool);
    this.emit('tool:add', newTool);

    return newTool;
  }

  /**
   * Met à jour un outil
   */
  updateTool(id: string, updates: Partial<Tool>): Tool | null {
    const tool = this.tools.get(id);
    if (!tool) return null;

    const updated: Tool = {
      ...tool,
      ...updates,
      updatedAt: Date.now(),
    } as Tool;

    this.tools.set(id, updated);
    this.emit('tool:update', updated);

    return updated;
  }

  /**
   * Supprime un outil
   */
  deleteTool(id: string): boolean {
    const tool = this.tools.get(id);
    if (!tool) return false;

    this.tools.delete(id);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.emit('tool:delete', tool);

    return true;
  }

  /**
   * Sélectionne un outil
   */
  selectTool(id: string | null): void {
    // Désélectionne l'ancien
    if (this.selectedId) {
      const oldTool = this.tools.get(this.selectedId);
      if (oldTool) {
        oldTool.selected = false;
        this.tools.set(this.selectedId, oldTool);
      }
    }

    // Sélectionne le nouveau
    if (id) {
      const newTool = this.tools.get(id);
      if (newTool) {
        newTool.selected = true;
        this.tools.set(id, newTool);
        this.emit('tool:select', newTool);
      }
    } else {
      this.emit('tool:select', null);
    }

    this.selectedId = id;
  }

  /**
   * Récupère tous les outils
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Récupère un outil par ID
   */
  getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  /**
   * Récupère l'outil sélectionné
   */
  getSelectedTool(): Tool | null {
    return this.selectedId ? this.tools.get(this.selectedId) || null : null;
  }

  // ============ DRAWING STATE ============

  /**
   * Active un outil de dessin
   */
  setActiveTool(type: ToolType): void {
    this.drawingState.currentTool = type;
    this.drawingState.isDrawing = false;
    this.drawingState.tempPoints = [];
    this.selectTool(null);
  }

  /**
   * Commence un dessin
   */
  startDrawing(point: Point): void {
    this.drawingState.isDrawing = true;
    this.drawingState.tempPoints = [point];
  }

  /**
   * Ajoute un point au dessin
   */
  addDrawingPoint(point: Point): void {
    if (!this.drawingState.isDrawing) return;
    this.drawingState.tempPoints.push(point);
  }

  /**
   * Met à jour le dernier point (pour le preview)
   */
  updateLastPoint(point: Point): void {
    if (!this.drawingState.isDrawing || this.drawingState.tempPoints.length === 0) return;

    if (this.drawingState.tempPoints.length === 1) {
      this.drawingState.tempPoints.push(point);
    } else {
      this.drawingState.tempPoints[this.drawingState.tempPoints.length - 1] = point;
    }
  }

  /**
   * Termine le dessin et crée l'outil
   */
  finishDrawing(): Tool | null {
    if (!this.drawingState.isDrawing) return null;

    const { currentTool, tempPoints } = this.drawingState;
    let tool: Tool | null = null;

    const style = { ...DEFAULT_TOOL_STYLES[currentTool] };

    switch (currentTool) {
      case 'trendline':
        if (tempPoints.length >= 2) {
          tool = this.addTool<TrendLineTool>({
            type: 'trendline',
            startPoint: tempPoints[0],
            endPoint: tempPoints[1],
            extendLeft: false,
            extendRight: false,
            style,
            visible: true,
            locked: false,
          });
        }
        break;

      case 'horizontalLine':
        if (tempPoints.length >= 1) {
          tool = this.addTool<HorizontalLineTool>({
            type: 'horizontalLine',
            price: tempPoints[0].price,
            showPrice: true,
            style,
            visible: true,
            locked: false,
          });
        }
        break;

      case 'horizontalRay':
        if (tempPoints.length >= 1) {
          tool = this.addTool<HorizontalRayTool>({
            type: 'horizontalRay',
            startPoint: tempPoints[0],
            direction: 'right',
            style,
            visible: true,
            locked: false,
          });
        }
        break;

      case 'rectangle':
        if (tempPoints.length >= 2) {
          tool = this.addTool<RectangleTool>({
            type: 'rectangle',
            topLeft: {
              time: Math.min(tempPoints[0].time, tempPoints[1].time),
              price: Math.max(tempPoints[0].price, tempPoints[1].price),
            },
            bottomRight: {
              time: Math.max(tempPoints[0].time, tempPoints[1].time),
              price: Math.min(tempPoints[0].price, tempPoints[1].price),
            },
            style,
            visible: true,
            locked: false,
          });
        }
        break;

      case 'longPosition':
      case 'shortPosition':
        if (tempPoints.length >= 2) {
          const entry = tempPoints[0].price;
          const other = tempPoints[1].price;
          const isLong = currentTool === 'longPosition';

          tool = this.addTool<PositionTool>({
            type: currentTool,
            entry,
            stopLoss: isLong ? Math.min(entry, other) : Math.max(entry, other),
            takeProfit: isLong ? Math.max(entry, other) : Math.min(entry, other),
            time: tempPoints[0].time,
            style,
            visible: true,
            locked: false,
          });
        }
        break;
    }

    // Reset drawing state
    this.drawingState.isDrawing = false;
    this.drawingState.tempPoints = [];

    return tool;
  }

  /**
   * Annule le dessin en cours
   */
  cancelDrawing(): void {
    this.drawingState.isDrawing = false;
    this.drawingState.tempPoints = [];
  }

  /**
   * Récupère l'état du dessin
   */
  getDrawingState(): DrawingState {
    return { ...this.drawingState };
  }

  // ============ HIT TESTING ============

  /**
   * Trouve l'outil sous un point
   */
  hitTest(point: Point, tolerance: number = 5): Tool | null {
    for (const tool of this.tools.values()) {
      if (!tool.visible) continue;

      switch (tool.type) {
        case 'horizontalLine':
          if (Math.abs(point.price - tool.price) <= tolerance) {
            return tool;
          }
          break;

        case 'trendline':
          if (this.isPointNearLine(point, tool.startPoint, tool.endPoint, tolerance)) {
            return tool;
          }
          break;

        case 'rectangle':
          if (
            point.time >= tool.topLeft.time &&
            point.time <= tool.bottomRight.time &&
            point.price >= tool.bottomRight.price &&
            point.price <= tool.topLeft.price
          ) {
            return tool;
          }
          break;

        case 'longPosition':
        case 'shortPosition':
          if (
            Math.abs(point.price - tool.entry) <= tolerance ||
            Math.abs(point.price - tool.stopLoss) <= tolerance ||
            Math.abs(point.price - tool.takeProfit) <= tolerance
          ) {
            return tool;
          }
          break;
      }
    }

    return null;
  }

  /**
   * Vérifie si un point est proche d'une ligne
   */
  private isPointNearLine(point: Point, start: Point, end: Point, tolerance: number): boolean {
    const dx = end.time - start.time;
    const dy = end.price - start.price;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return false;

    const t = Math.max(0, Math.min(1,
      ((point.time - start.time) * dx + (point.price - start.price) * dy) / (length * length)
    ));

    const projX = start.time + t * dx;
    const projY = start.price + t * dy;

    const distance = Math.sqrt(
      Math.pow(point.time - projX, 2) + Math.pow(point.price - projY, 2)
    );

    return distance <= tolerance;
  }

  // ============ EVENTS ============

  on(event: ToolEventType, callback: ToolCallback): () => void {
    this.listeners.get(event)?.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: ToolEventType, tool: Tool | null): void {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(tool); } catch (e) { console.error(e); }
    });
  }

  // ============ PERSISTENCE ============

  /**
   * Exporte les outils en JSON
   */
  exportTools(): string {
    return JSON.stringify(Array.from(this.tools.values()));
  }

  /**
   * Importe les outils depuis JSON
   */
  importTools(json: string): void {
    try {
      const tools = JSON.parse(json) as Tool[];
      this.tools.clear();
      tools.forEach(tool => this.tools.set(tool.id, tool));
    } catch (e) {
      console.error('Failed to import tools:', e);
    }
  }

  /**
   * Efface tous les outils
   */
  clearAll(): void {
    this.tools.clear();
    this.selectedId = null;
    this.cancelDrawing();
  }
}

// ============ SINGLETON ============

let toolsEngine: TradingToolsEngine | null = null;

export function getTradingToolsEngine(): TradingToolsEngine {
  if (!toolsEngine) {
    toolsEngine = new TradingToolsEngine();
  }
  return toolsEngine;
}

export function resetTradingToolsEngine(): void {
  toolsEngine?.clearAll();
  toolsEngine = null;
}
