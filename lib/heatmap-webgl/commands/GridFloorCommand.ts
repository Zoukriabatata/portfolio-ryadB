/**
 * Grid Floor Rendering Command
 *
 * Renders 3D grid lines and axes on the floor plane (z=0).
 * Used as a spatial reference for the 3D surface heatmap.
 *
 * Features:
 *  - Configurable grid density with major/minor line distinction
 *  - Mid-price highlight line (cyan)
 *  - X, Y, Z axis lines with distinct colors
 *  - Border outline around the grid
 */

import type { RenderContext } from '../core/RenderContext';
import { grid3dVert, grid3dFrag } from '../shaders/surface3d';

// ═══════════════════════════════════════════════════════════════════════════
// COLORS (vec3 RGB)
// ═══════════════════════════════════════════════════════════════════════════

const GRID_MINOR: [number, number, number] = [0.03, 0.03, 0.06];
const GRID_MAJOR: [number, number, number] = [0.06, 0.06, 0.12];
const AXIS_COLOR: [number, number, number] = [0.08, 0.08, 0.14];
const Z_AXIS_COLOR: [number, number, number] = [0.10, 0.10, 0.18];
const BORDER_COLOR: [number, number, number] = [0.04, 0.04, 0.08];
const MID_PRICE_COLOR: [number, number, number] = [1.0, 1.0, 1.0];

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND
// ═══════════════════════════════════════════════════════════════════════════

export class GridFloorCommand {
  private ctx: RenderContext;
  private drawCommand: ReturnType<RenderContext['regl']> | null = null;

  private positionData!: Float32Array;
  private colorData!: Float32Array;
  private totalVertexCount = 0;

  private positionBuffer: ReturnType<RenderContext['regl']['buffer']> | null = null;
  private colorBuffer: ReturnType<RenderContext['regl']['buffer']> | null = null;

  private divisions = 11;
  private majorEvery = 5; // Every 5th line is major
  private midPriceY = -1; // Normalized [0,1], -1 = hidden

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
    this.rebuildGeometry();
  }

  // ─── Configuration ────────────────────────────────────────────────────

  setDivisions(n: number): void {
    n = Math.max(5, Math.min(50, n));
    if (n === this.divisions) return;
    this.divisions = n;
    this.rebuildGeometry();
    this.uploadBuffers();
  }

  setMidPriceLine(normalizedY: number): void {
    if (Math.abs(normalizedY - this.midPriceY) < 0.001) return;
    this.midPriceY = normalizedY;
    this.rebuildGeometry();
    this.uploadBuffers();
  }

  // ─── Geometry Construction ────────────────────────────────────────────

  private rebuildGeometry(): void {
    const n = this.divisions;
    const gridVertCount = n * 2 * 2; // n lines along X + n lines along Y, 2 vertices each
    const axisVertCount = 3 * 2;
    const borderVertCount = 4 * 2;
    const midPriceVertCount = this.midPriceY >= 0 && this.midPriceY <= 1 ? 2 : 0;
    const total = gridVertCount + axisVertCount + borderVertCount + midPriceVertCount;

    this.positionData = new Float32Array(total * 3);
    this.colorData = new Float32Array(total * 3);
    this.totalVertexCount = total;

    let offset = 0;

    // 1. Grid lines on XY plane (z=0)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const isMajor = i % this.majorEvery === 0 || i === n - 1;
      const color = isMajor ? GRID_MAJOR : GRID_MINOR;
      // Lines along X (constant y)
      offset = this.addLine(offset, [0, t, 0], [1, t, 0], color);
    }
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const isMajor = i % this.majorEvery === 0 || i === n - 1;
      const color = isMajor ? GRID_MAJOR : GRID_MINOR;
      // Lines along Y (constant x)
      offset = this.addLine(offset, [t, 0, 0], [t, 1, 0], color);
    }

    // 2. Axis lines
    offset = this.addLine(offset, [0, 0, 0], [1, 0, 0], AXIS_COLOR);
    offset = this.addLine(offset, [0, 0, 0], [0, 1, 0], AXIS_COLOR);
    offset = this.addLine(offset, [0, 0, 0], [0, 0, 1], Z_AXIS_COLOR);

    // 3. Border outline
    offset = this.addLine(offset, [0, 0, 0], [1, 0, 0], BORDER_COLOR);
    offset = this.addLine(offset, [1, 0, 0], [1, 1, 0], BORDER_COLOR);
    offset = this.addLine(offset, [1, 1, 0], [0, 1, 0], BORDER_COLOR);
    offset = this.addLine(offset, [0, 1, 0], [0, 0, 0], BORDER_COLOR);

    // 4. Mid-price highlight line
    if (this.midPriceY >= 0 && this.midPriceY <= 1) {
      offset = this.addLine(offset, [0, this.midPriceY, 0], [1, this.midPriceY, 0], MID_PRICE_COLOR);
    }
  }

  private addLine(
    vertexOffset: number,
    from: [number, number, number],
    to: [number, number, number],
    color: [number, number, number],
  ): number {
    const pi = vertexOffset * 3;

    this.positionData[pi] = from[0];
    this.positionData[pi + 1] = from[1];
    this.positionData[pi + 2] = from[2];
    this.colorData[pi] = color[0];
    this.colorData[pi + 1] = color[1];
    this.colorData[pi + 2] = color[2];

    this.positionData[pi + 3] = to[0];
    this.positionData[pi + 4] = to[1];
    this.positionData[pi + 5] = to[2];
    this.colorData[pi + 3] = color[0];
    this.colorData[pi + 4] = color[1];
    this.colorData[pi + 5] = color[2];

    return vertexOffset + 2;
  }

  private uploadBuffers(): void {
    if (this.positionBuffer) {
      this.positionBuffer(this.positionData);
    }
    if (this.colorBuffer) {
      this.colorBuffer(this.colorData);
    }
    // Force draw command recreation if vertex count changed
    if (this.drawCommand) {
      this.drawCommand = null;
      this.positionBuffer?.destroy();
      this.colorBuffer?.destroy();
      this.positionBuffer = null;
      this.colorBuffer = null;
    }
  }

  // ─── Rendering ────────────────────────────────────────────────────────

  render(viewProjection: Float32Array, opacity: number = 0.5): void {
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
      usage: 'dynamic',
    });

    this.colorBuffer = regl.buffer({
      data: this.colorData,
      usage: 'dynamic',
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

      count: this.totalVertexCount,
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

  // ─── Cleanup ──────────────────────────────────────────────────────────

  destroy(): void {
    this.positionBuffer?.destroy();
    this.colorBuffer?.destroy();
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.drawCommand = null;
  }
}
