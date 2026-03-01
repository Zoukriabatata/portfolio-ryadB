/**
 * TOOLS MODULE
 *
 * Professional drawing tools for trading charts
 */

// Types (canonical source)
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
  PreviewTool,
  DrawingState,
  DragState,
  HitTestResult,
  ToolEvent,
  ToolCallback,
} from './types';

// Engine
export {
  ToolsEngine,
  getToolsEngine,
  resetToolsEngine,
  DEFAULT_STYLES,
} from './ToolsEngine';

// Renderer
export {
  ToolsRenderer,
  getToolsRenderer,
  type RenderContext,
} from './ToolsRenderer';

// Interaction
export {
  InteractionController,
  getInteractionController,
  resetInteractionController,
  type InteractionMode,
  type InteractionState,
  type CoordinateConverter,
  type InteractionCallbacks,
} from './InteractionController';

// Persistence
export {
  layoutPersistence,
  type LayoutData,
} from './LayoutPersistence';

// Execution Engine
export {
  evaluateCandle,
  evaluateAllPositions,
  closePosition,
  calculatePnL,
  type CandleData,
  type ExecutionResult,
} from './ExecutionEngine';

// Registry
export { toolRegistry } from './registry/ToolRegistry';
export type { ToolDefinition, ToolSettingField, CoordinateConverters } from './registry/ToolDefinition';
