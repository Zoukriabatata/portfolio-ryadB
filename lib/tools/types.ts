/**
 * TOOLS TYPE DEFINITIONS
 *
 * All type interfaces for the drawing tools system.
 * Extracted from ToolsEngine.ts for modularity.
 */

// ============ TYPES ============

export type ToolType =
  | 'cursor'
  | 'crosshair'
  | 'trendline'
  | 'ray'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'verticalLine'
  | 'rectangle'
  | 'parallelChannel'
  | 'fibRetracement'
  | 'fibExtension'
  | 'arrow'
  | 'brush'
  | 'highlighter'
  | 'measure'
  | 'longPosition'
  | 'shortPosition'
  | 'text'
  | 'ellipse';

export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type HandlePosition = 'start' | 'end' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface Point {
  time: number;   // Unix timestamp (seconds)
  price: number;
}

export interface ToolStyle {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  opacity?: number;       // General tool opacity (0-1), default 1
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

export interface RectangleZone {
  level: number;        // 0-1 where 0=top, 1=bottom (e.g., 0.5 for median)
  label: string;        // Label to display (e.g., "50%", "VWAP", "POC")
  color?: string;       // Override color for this zone line
  lineStyle?: LineStyle;
  showLabel?: boolean;
  showPrice?: boolean;
}

export interface RectangleTool extends BaseTool {
  type: 'rectangle';
  topLeft: Point;
  bottomRight: Point;
  // Enhanced features
  showMedianLine?: boolean;      // Show 50% horizontal line
  showZones?: boolean;           // Enable zone display
  zones?: RectangleZone[];       // Custom zones (25%, 50%, 75%, etc.)
  extendLeft?: boolean;          // Extend rectangle left
  extendRight?: boolean;         // Extend rectangle right
  showPriceLabels?: boolean;     // Show price labels at edges
  showPercentLabels?: boolean;   // Show percentage labels in zones
  zoneFillOpacity?: number;      // Opacity for zone fills (0-1)
}

export interface FibRetracementTool extends BaseTool {
  type: 'fibRetracement';
  startPoint: Point;
  endPoint: Point;
  levels: number[];  // [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  showLabels: boolean;
  showPrices: boolean;
  extendLeft: boolean;   // Extend lines to left edge
  extendRight: boolean;  // Extend lines to right edge
  showFills: boolean;    // Show zone fills between levels
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
  compactMode: boolean;  // Cleaner, minimal design
  showZoneFill: boolean; // Show profit/risk zone backgrounds
  // Position sizing
  accountSize?: number;       // Account size in $
  riskPercent?: number;        // Risk % of account (default 1)
  leverage?: number;           // Leverage multiplier (default 1)
  showPositionSize?: boolean;  // Show calculated position size
  showDollarPnL?: boolean;     // Show P&L in $ alongside %
}

export interface TextTool extends BaseTool {
  type: 'text';
  point: Point;
  content: string;
  // Editing state
  isEditing: boolean;
  // Anchor mode: 'price-time' follows chart, 'screen-fixed' stays in place
  anchorMode: 'price-time' | 'screen-fixed';
  screenPosition?: { x: number; y: number }; // For screen-fixed mode
  // Typography
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontColor: string;
  backgroundColor?: string;
  padding: number;
  borderRadius: number;
  textAlign: 'left' | 'center' | 'right';
}

export interface ParallelChannelTool extends BaseTool {
  type: 'parallelChannel';
  startPoint: Point;
  endPoint: Point;
  channelWidth: number; // Price distance from main line to parallel line
  extendLeft: boolean;
  extendRight: boolean;
}

export interface FibExtensionTool extends BaseTool {
  type: 'fibExtension';
  point1: Point;  // Swing start
  point2: Point;  // Swing end
  point3: Point;  // Retracement end
  levels: number[];
  showLabels: boolean;
  showPrices: boolean;
}

export interface MeasureTool extends BaseTool {
  type: 'measure';
  startPoint: Point;
  endPoint: Point;
}

export interface EllipseTool extends BaseTool {
  type: 'ellipse';
  center: Point;
  radiusTime: number;   // Horizontal radius in seconds
  radiusPrice: number;  // Vertical radius in price units
}

export type Tool =
  | TrendLineTool
  | HorizontalLineTool
  | HorizontalRayTool
  | VerticalLineTool
  | RectangleTool
  | FibRetracementTool
  | PositionTool
  | TextTool
  | ParallelChannelTool
  | FibExtensionTool
  | MeasureTool
  | EllipseTool;

// Preview tool types - same as Tool union but without id/timestamps
export type PreviewTrendLineTool = Omit<TrendLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewHorizontalLineTool = Omit<HorizontalLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewHorizontalRayTool = Omit<HorizontalRayTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewVerticalLineTool = Omit<VerticalLineTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewRectangleTool = Omit<RectangleTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewFibRetracementTool = Omit<FibRetracementTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewPositionTool = Omit<PositionTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewTextTool = Omit<TextTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewParallelChannelTool = Omit<ParallelChannelTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewFibExtensionTool = Omit<FibExtensionTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewMeasureTool = Omit<MeasureTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;
export type PreviewEllipseTool = Omit<EllipseTool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>;

export type PreviewTool =
  | PreviewTrendLineTool
  | PreviewHorizontalLineTool
  | PreviewHorizontalRayTool
  | PreviewVerticalLineTool
  | PreviewRectangleTool
  | PreviewFibRetracementTool
  | PreviewPositionTool
  | PreviewTextTool
  | PreviewParallelChannelTool
  | PreviewFibExtensionTool
  | PreviewMeasureTool
  | PreviewEllipseTool;

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
  | 'drag:end'
  | 'text:edit-start'
  | 'text:edit-end'
  | 'text:edit-cancel';

export type ToolCallback = (tool: Tool | PreviewTool | null, event?: ToolEvent) => void;
