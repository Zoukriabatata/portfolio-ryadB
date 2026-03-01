/**
 * TOOL DEFINITION INTERFACE
 *
 * Contract that every tool module must implement.
 * Provides create, drag, hitTest, handles, and settings schema.
 */

import type {
  ToolType,
  Tool,
  ToolStyle,
  Point,
  HandlePosition,
  Handle,
  PreviewTool,
} from '../types';

// ============ COORDINATE CONVERTERS ============

export interface CoordinateConverters {
  timeToX: (time: number) => number;
  priceToY: (price: number) => number;
  xToTime?: (x: number) => number;
  yToPrice?: (y: number) => number;
}

// ============ TOOL DEFINITION ============

export interface ToolDefinition<T extends Tool = Tool> {
  /** Unique tool type identifier */
  readonly type: ToolType;

  /** Minimum number of points needed to create this tool */
  readonly minPoints: number;

  /** Default style applied to new instances */
  readonly defaultStyle: ToolStyle;

  /**
   * Create a preview tool from the given points during drawing.
   * Returns null if not enough points.
   */
  createFromPoints(points: Point[], style: ToolStyle): PreviewTool | null;

  /**
   * Compute updated tool properties during a drag operation.
   * Returns a partial Tool with only the changed fields.
   */
  updateDrag(
    original: T,
    handle: HandlePosition | null,
    deltaTime: number,
    deltaPrice: number
  ): Partial<Tool>;

  /**
   * Hit-test a tool at the given pixel coordinates.
   * Returns handle info + distance, or null if not hit.
   */
  hitTest(
    tool: T,
    px: number,
    py: number,
    converters: CoordinateConverters,
    tolerance: number
  ): { handle: HandlePosition | null; distance: number } | null;

  /**
   * Get the visual handles for a selected tool.
   */
  getHandles(tool: T, converters: CoordinateConverters): Handle[];

  /**
   * Optional settings schema for the dynamic settings panel.
   */
  readonly settingsSchema?: ToolSettingField[];
}

// ============ SETTINGS SCHEMA ============

export interface ToolSettingField {
  /** Dot-path into the tool object, e.g. 'style.color', 'extendRight' */
  key: string;

  /** Display label */
  label: string;

  /** Control type to render */
  type:
    | 'color'
    | 'number'
    | 'boolean'
    | 'select'
    | 'slider'
    | 'lineStyle'
    | 'lineWidth';

  /** Settings group for collapsible sections */
  group?: string;

  /** Number constraints */
  min?: number;
  max?: number;
  step?: number;

  /** Options for 'select' type */
  options?: { value: string | number; label: string }[];

  /** Conditional visibility — only show this field if condition returns true */
  condition?: (tool: Tool) => boolean;
}
