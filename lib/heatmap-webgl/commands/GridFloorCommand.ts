/**
 * Grid Floor Rendering Command
 *
 * Renders 3D grid lines and axes on the floor plane (z=0).
 * Used as a spatial reference for the 3D surface heatmap.
 *
 * Geometry:
 *  - 11x11 grid lines on the XY plane (z=0)
 *  - X, Y, Z axis lines with distinct colors
 *  - Border outline around the grid
 */

import type { RenderContext } from '../core/RenderContext';
import { grid3dVert, grid3dFrag } from '../shaders/surface3d';

// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Number of grid divisions along each axis (0.0, 0.1, ..., 1.0). */
const GRID_DIVISIONS = 11;

/** Grid lines: 11 along X + 11 along Y = 22 lines = 44 vertices. */
const GRID_VERTEX_COUNT = GRID_DIVISIONS * 2 * 2;

/** Axis lines: X, Y, Z = 3 lines = 6 vertices. */
const AXIS_VERTEX_COUNT = 3 * 2;

/** Border outline: 4 edges = 4 lines = 8 vertices. */
const BORDER_VERTEX_COUNT = 4 * 2;

/** Total vertex count across all line groups. */
const TOTAL_VERTEX_COUNT = GRID_VERTEX_COUNT + AXIS_VERTEX_COUNT + BORDER_VERTEX_COUNT;

// ═══════════════════════════════════════════════════════════════════════════
// COLORS (vec3 RGB)
// ═══════════════════════════════════════════════════════════════════════════

const GRID_COLOR: [number, number, number] = [0.2, 0.25, 0.3];
const AXIS_COLOR: [number, number, number] = [0.4, 0.5, 0.6];
const Z_AXIS_COLOR: [number, number, number] = [0.5, 0.7, 0.5]; // Green tint for height
const BORDER_COLOR: [number, number, number] = [0.3, 0.35, 0.4];

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND
// ═══════════════════════════════════════════════════════════════════════════

export class GridFloorCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  private positionData: Float32Array;
  private colorData: Float32Array;

  private positionBuffer: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private colorBuffer: ReturnType<RenderContext['regl']['buffer']> | null = null;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;

    // Allocate geometry arrays: 3 floats per vertex (vec3)
    this.positionData = new Float32Array(TOTAL_VERTEX_COUNT * 3);
    this.colorData = new Float32Array(TOTAL_VERTEX_COUNT * 3);

    this.buildGeometry();
  }

  // ─── Geometry Construction ──────────────────────────────────────────────

  private buildGeometry(): void {
    let offset = 0;

    // 1. Grid lines on XY plane (z=0)
    // ── Lines along X (constant y) ──
    for (let i = 0; i < GRID_DIVISIONS; i++) {
      const y = i / (GRID_DIVISIONS - 1); // 0.0, 0.1, ..., 1.0
      offset = this.addLine(offset, [0, y, 0], [1, y, 0], GRID_COLOR);
    }

    // ── Lines along Y (constant x) ──
    for (let i = 0; i < GRID_DIVISIONS; i++) {
      const x = i / (GRID_DIVISIONS - 1); // 0.0, 0.1, ..., 1.0
      offset = this.addLine(offset, [x, 0, 0], [x, 1, 0], GRID_COLOR);
    }

    // 2. Axis lines
    // X-axis: (0,0,0) → (1,0,0)
    offset = this.addLine(offset, [0, 0, 0], [1, 0, 0], AXIS_COLOR);
    // Y-axis: (0,0,0) → (0,1,0)
    offset = this.addLine(offset, [0, 0, 0], [0, 1, 0], AXIS_COLOR);
    // Z-axis: (0,0,0) → (0,0,1) — green tint for height
    offset = this.addLine(offset, [0, 0, 0], [0, 0, 1], Z_AXIS_COLOR);

    // 3. Border outline on floor plane
    // (0,0,0) → (1,0,0) → (1,1,0) → (0,1,0) → (0,0,0)
    offset = this.addLine(offset, [0, 0, 0], [1, 0, 0], BORDER_COLOR);
    offset = this.addLine(offset, [1, 0, 0], [1, 1, 0], BORDER_COLOR);
    offset = this.addLine(offset, [1, 1, 0], [0, 1, 0], BORDER_COLOR);
    offset = this.addLine(offset, [0, 1, 0], [0, 0, 0], BORDER_COLOR);
  }

  /**
   * Append a single line segment (2 vertices) into the position and color arrays.
   * Returns the new vertex offset.
   */
  private addLine(
    vertexOffset: number,
    from: [number, number, number],
    to: [number, number, number],
    color: [number, number, number],
  ): number {
    const pi = vertexOffset * 3;

    // Vertex A
    this.positionData[pi] = from[0];
    this.positionData[pi + 1] = from[1];
    this.positionData[pi + 2] = from[2];

    this.colorData[pi] = color[0];
    this.colorData[pi + 1] = color[1];
    this.colorData[pi + 2] = color[2];

    // Vertex B
    this.positionData[pi + 3] = to[0];
    this.positionData[pi + 4] = to[1];
    this.positionData[pi + 5] = to[2];

    this.colorData[pi + 3] = color[0];
    this.colorData[pi + 4] = color[1];
    this.colorData[pi + 5] = color[2];

    return vertexOffset + 2;
  }

  // ─── Rendering ──────────────────────────────────────────────────────────

  /**
   * Draw the grid floor.
   *
   * @param viewProjection  Combined view*projection matrix (mat4 as Float32Array).
   * @param opacity         Overall opacity for the grid (default 0.5).
   */
  render(viewProjection: Float32Array, opacity: number = 0.5): void {
    // Lazy-init the regl draw command and GPU buffers on first render.
    if (!this.drawCommand) {
      this.createDrawCommand();
    }

    this.drawCommand!({
      viewProjection,
      opacity,
    });
  }

  private createDrawCommand(): void {
    const { regl } = this.ctx;

    this.positionBuffer = regl.buffer({
      data: this.positionData,
      usage: 'static',
    });

    this.colorBuffer = regl.buffer({
      data: this.colorData,
      usage: 'static',
    });

    this.drawCommand = regl({
      vert: grid3dVert,
      frag: grid3dFrag,

      attributes: {
        position: { buffer: this.positionBuffer, size: 3 },
        color: { buffer: this.colorBuffer, size: 3 },
      },

      uniforms: {
        viewProjection: regl.prop<{ viewProjection: Float32Array }, 'viewProjection'>('viewProjection'),
        opacity: regl.prop<{ opacity: number }, 'opacity'>('opacity'),
      },

      count: TOTAL_VERTEX_COUNT,
      primitive: 'lines',

      depth: { enable: true },

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Release GPU buffers and the draw command.
   */
  destroy(): void {
    this.positionBuffer?.destroy();
    this.colorBuffer?.destroy();
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.drawCommand = null;
  }
}
