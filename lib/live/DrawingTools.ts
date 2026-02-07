/**
 * Drawing Tools System for Live Chart
 *
 * Manages drawing objects on the chart (trendlines, rectangles, etc.)
 */

export type ToolType =
  | 'cursor'
  | 'crosshair'
  | 'trendline'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'rectangle'
  | 'parallelChannel'
  | 'fibonacciRetracement'
  | 'fibonacciExtension'
  | 'text'
  | 'arrow'
  | 'brush'
  | 'highlighter'
  | 'measure'
  | 'longPosition'
  | 'shortPosition';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingObject {
  id: string;
  type: ToolType;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;
  locked: boolean;
  visible: boolean;
  selected: boolean;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
  fontFamily?: string;
  showLabel?: boolean;
  extendLeft?: boolean;
  extendRight?: boolean;
}

const DEFAULT_STYLE: DrawingStyle = {
  color: '#2962ff',
  lineWidth: 2,
  lineStyle: 'solid',
  fillOpacity: 0.2,
  fontSize: 12,
  showLabel: true,
};

export class DrawingToolsManager {
  private drawings: Map<string, DrawingObject> = new Map();
  private activeToolType: ToolType = 'cursor';
  private currentDrawing: DrawingObject | null = null;
  private selectedId: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {}

  // Tool selection
  setActiveTool(type: ToolType): void {
    this.activeToolType = type;
    this.currentDrawing = null;
    this.emit();
  }

  getActiveTool(): ToolType {
    return this.activeToolType;
  }

  // Drawing lifecycle
  startDrawing(point: DrawingPoint): void {
    if (this.activeToolType === 'cursor' || this.activeToolType === 'crosshair') {
      return;
    }

    const id = `drawing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.currentDrawing = {
      id,
      type: this.activeToolType,
      points: [point],
      style: { ...DEFAULT_STYLE },
      locked: false,
      visible: true,
      selected: false,
    };

    // Single-click tools
    if (this.activeToolType === 'hline' || this.activeToolType === 'vline') {
      this.completeDrawing();
    }

    this.emit();
  }

  updateDrawing(point: DrawingPoint): void {
    if (!this.currentDrawing) return;

    const numPoints = this.getRequiredPoints(this.currentDrawing.type);

    if (this.currentDrawing.points.length < numPoints) {
      // Update last point for preview
      if (this.currentDrawing.points.length === 1) {
        this.currentDrawing.points[1] = point;
      } else {
        this.currentDrawing.points[this.currentDrawing.points.length - 1] = point;
      }
    }

    this.emit();
  }

  addPoint(point: DrawingPoint): void {
    if (!this.currentDrawing) return;

    const numPoints = this.getRequiredPoints(this.currentDrawing.type);

    if (this.currentDrawing.points.length < numPoints) {
      this.currentDrawing.points.push(point);

      if (this.currentDrawing.points.length >= numPoints) {
        this.completeDrawing();
      }
    }

    this.emit();
  }

  completeDrawing(): void {
    if (!this.currentDrawing) return;

    this.drawings.set(this.currentDrawing.id, this.currentDrawing);
    this.currentDrawing = null;

    // Don't reset tool for common tools
    if (!['trendline', 'hline', 'rectangle'].includes(this.activeToolType)) {
      this.activeToolType = 'cursor';
    }

    this.emit();
  }

  cancelDrawing(): void {
    this.currentDrawing = null;
    this.emit();
  }

  // Get required points for each tool type
  private getRequiredPoints(type: ToolType): number {
    switch (type) {
      case 'hline':
      case 'vline':
      case 'text':
      case 'arrow':
        return 1;
      case 'trendline':
      case 'ray':
      case 'rectangle':
      case 'parallelChannel':
      case 'measure':
      case 'longPosition':
      case 'shortPosition':
        return 2;
      case 'fibonacciRetracement':
      case 'fibonacciExtension':
        return 2;
      case 'brush':
      case 'highlighter':
        return Infinity; // Freeform
      default:
        return 2;
    }
  }

  // Drawing management
  getDrawings(): DrawingObject[] {
    return Array.from(this.drawings.values());
  }

  getCurrentDrawing(): DrawingObject | null {
    return this.currentDrawing;
  }

  getDrawing(id: string): DrawingObject | undefined {
    return this.drawings.get(id);
  }

  deleteDrawing(id: string): void {
    this.drawings.delete(id);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    this.emit();
  }

  clearAllDrawings(): void {
    this.drawings.clear();
    this.selectedId = null;
    this.currentDrawing = null;
    this.emit();
  }

  // Selection
  selectDrawing(id: string | null): void {
    // Deselect previous
    if (this.selectedId) {
      const prev = this.drawings.get(this.selectedId);
      if (prev) {
        prev.selected = false;
      }
    }

    this.selectedId = id;

    if (id) {
      const drawing = this.drawings.get(id);
      if (drawing) {
        drawing.selected = true;
      }
    }

    this.emit();
  }

  getSelectedDrawing(): DrawingObject | null {
    return this.selectedId ? this.drawings.get(this.selectedId) || null : null;
  }

  // Hit testing
  hitTest(
    point: DrawingPoint,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number,
    threshold: number = 10
  ): DrawingObject | null {
    for (const drawing of this.drawings.values()) {
      if (!drawing.visible) continue;

      if (this.isPointNearDrawing(point, drawing, priceToY, timeToX, threshold)) {
        return drawing;
      }
    }
    return null;
  }

  private isPointNearDrawing(
    point: DrawingPoint,
    drawing: DrawingObject,
    priceToY: (price: number) => number,
    timeToX: (time: number) => number,
    threshold: number
  ): boolean {
    const px = timeToX(point.time);
    const py = priceToY(point.price);

    switch (drawing.type) {
      case 'hline': {
        const lineY = priceToY(drawing.points[0].price);
        return Math.abs(py - lineY) < threshold;
      }

      case 'vline': {
        const lineX = timeToX(drawing.points[0].time);
        return Math.abs(px - lineX) < threshold;
      }

      case 'trendline':
      case 'ray': {
        if (drawing.points.length < 2) return false;
        const x1 = timeToX(drawing.points[0].time);
        const y1 = priceToY(drawing.points[0].price);
        const x2 = timeToX(drawing.points[1].time);
        const y2 = priceToY(drawing.points[1].price);

        return this.distanceToLine(px, py, x1, y1, x2, y2) < threshold;
      }

      case 'rectangle': {
        if (drawing.points.length < 2) return false;
        const x1 = timeToX(drawing.points[0].time);
        const y1 = priceToY(drawing.points[0].price);
        const x2 = timeToX(drawing.points[1].time);
        const y2 = priceToY(drawing.points[1].price);

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        return px >= minX - threshold && px <= maxX + threshold &&
               py >= minY - threshold && py <= maxY + threshold;
      }

      default:
        return false;
    }
  }

  private distanceToLine(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Style updates
  updateStyle(id: string, style: Partial<DrawingStyle>): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.style = { ...drawing.style, ...style };
      this.emit();
    }
  }

  // Move drawing
  moveDrawing(id: string, deltaTime: number, deltaPrice: number): void {
    const drawing = this.drawings.get(id);
    if (drawing && !drawing.locked) {
      drawing.points = drawing.points.map(p => ({
        time: p.time + deltaTime,
        price: p.price + deltaPrice,
      }));
      this.emit();
    }
  }

  // Lock/unlock
  toggleLock(id: string): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.locked = !drawing.locked;
      this.emit();
    }
  }

  // Visibility
  toggleVisibility(id: string): void {
    const drawing = this.drawings.get(id);
    if (drawing) {
      drawing.visible = !drawing.visible;
      this.emit();
    }
  }

  // Event system
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach(listener => listener());
  }

  // Serialization
  toJSON(): string {
    return JSON.stringify(Array.from(this.drawings.entries()));
  }

  fromJSON(json: string): void {
    try {
      const entries = JSON.parse(json);
      this.drawings = new Map(entries);
      this.emit();
    } catch (e) {
      console.error('Failed to parse drawings:', e);
    }
  }
}

// Singleton instance
let instance: DrawingToolsManager | null = null;

export function getDrawingToolsManager(): DrawingToolsManager {
  if (!instance) {
    instance = new DrawingToolsManager();
  }
  return instance;
}

export function resetDrawingToolsManager(): void {
  instance = null;
}

// Tool definitions for UI
export const DRAWING_TOOLS: { id: ToolType; label: string; icon: string; group: string }[] = [
  // Cursor
  { id: 'cursor', label: 'Cursor', icon: '↖', group: 'select' },
  { id: 'crosshair', label: 'Crosshair', icon: '＋', group: 'select' },

  // Lines
  { id: 'trendline', label: 'Trend Line', icon: '╱', group: 'lines' },
  { id: 'ray', label: 'Ray', icon: '→', group: 'lines' },
  { id: 'hline', label: 'Horizontal Line', icon: '―', group: 'lines' },
  { id: 'vline', label: 'Vertical Line', icon: '│', group: 'lines' },
  { id: 'parallelChannel', label: 'Parallel Channel', icon: '⫽', group: 'lines' },

  // Shapes
  { id: 'rectangle', label: 'Rectangle', icon: '▭', group: 'shapes' },

  // Fibonacci
  { id: 'fibonacciRetracement', label: 'Fib Retracement', icon: '⊟', group: 'fibonacci' },
  { id: 'fibonacciExtension', label: 'Fib Extension', icon: '⊞', group: 'fibonacci' },

  // Annotations
  { id: 'text', label: 'Text', icon: 'T', group: 'annotations' },
  { id: 'arrow', label: 'Arrow', icon: '↗', group: 'annotations' },

  // Drawing
  { id: 'brush', label: 'Brush', icon: '✎', group: 'drawing' },
  { id: 'highlighter', label: 'Highlighter', icon: '🖍', group: 'drawing' },

  // Measure
  { id: 'measure', label: 'Measure', icon: '📏', group: 'measure' },

  // Trading
  { id: 'longPosition', label: 'Long Position', icon: '📈', group: 'trading' },
  { id: 'shortPosition', label: 'Short Position', icon: '📉', group: 'trading' },
];

export const TOOL_GROUPS = [
  { id: 'select', label: 'Select' },
  { id: 'lines', label: 'Lines' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'fibonacci', label: 'Fibonacci' },
  { id: 'annotations', label: 'Annotations' },
  { id: 'drawing', label: 'Drawing' },
  { id: 'measure', label: 'Measure' },
  { id: 'trading', label: 'Trading' },
];
