/**
 * Surface Mesh Rendering Command
 *
 * Renders orderbook grid data as a 3D terrain surface mesh.
 * Each grid point becomes a vertex whose height (z) is proportional to
 * its intensity, creating a landscape of bid/ask liquidity.
 *
 * Features:
 * - Per-vertex normals for smooth Lambert + rim lighting
 * - Bid/ask gradient sampling via shared TextureManager textures
 * - Optional grid lines on the surface (via fwidth / OES_standard_derivatives)
 * - Depth testing + backface culling for correct 3D rendering
 * - Alpha blending for opacity control
 */

import type REGL from 'regl';
import type { RenderContext } from '../core/RenderContext';
import type { TextureManager } from '../core/TextureManager';
import type { SurfaceGridData } from '../adapters/SurfaceDataAdapter';
import { surface3dVert, surface3dFrag } from '../shaders/surface3d';

export interface SurfaceMeshRenderParams {
  viewProjection: Float32Array;
  heightScale: number;
  contrast: number;
  upperCutoff: number;
  opacity: number;
  lightDir: [number, number, number];
  ambientStrength: number;
  gridEnabled: boolean;
  gridSpacingX: number;
  gridSpacingY: number;
  time: number;
}

export class SurfaceMeshCommand {
  private ctx: RenderContext;
  private textureManager: TextureManager;

  // Regl buffers
  private positionBuf: REGL.Buffer | null = null;
  private normalBuf: REGL.Buffer | null = null;
  private intensityBuf: REGL.Buffer | null = null;
  private sideBuf: REGL.Buffer | null = null;
  private elementsBuf: REGL.Elements | null = null;

  // CPU-side typed arrays (reused across updates to reduce allocations)
  private positions: Float32Array | null = null;
  private normals: Float32Array | null = null;
  private vertexIntensities: Float32Array | null = null;
  private vertexSides: Float32Array | null = null;
  private indices: Uint16Array | null = null;

  // Current grid dimensions for draw call
  private elementCount: number = 0;
  private vertexCount: number = 0;

  // Lazily created draw command
  private drawCommand: REGL.DrawCommand | null = null;

  constructor(ctx: RenderContext, textureManager: TextureManager) {
    this.ctx = ctx;
    this.textureManager = textureManager;
  }

  // ── Mesh Building ───────────────────────────────────────────────────────

  /**
   * Build or rebuild the surface mesh from grid data.
   * Call this whenever the underlying orderbook snapshot changes.
   */
  update(grid: SurfaceGridData): void {
    const T = grid.timeSteps;
    const P = grid.priceLevels;
    const vertCount = T * P;
    const quadCount = (T - 1) * (P - 1);
    const triCount = quadCount * 2;
    const idxCount = triCount * 3;

    // Bail out if grid is degenerate
    if (T < 2 || P < 2) return;

    // ── 1. Allocate / re-use typed arrays ─────────────────────────────

    if (!this.positions || this.positions.length < vertCount * 3) {
      this.positions = new Float32Array(vertCount * 3);
      this.normals = new Float32Array(vertCount * 3);
      this.vertexIntensities = new Float32Array(vertCount);
      this.vertexSides = new Float32Array(vertCount);
    }

    if (!this.indices || this.indices.length < idxCount) {
      this.indices = new Uint16Array(idxCount);
    }

    const positions = this.positions;
    const normals = this.normals!;
    const vertexIntensities = this.vertexIntensities!;
    const vertexSides = this.vertexSides!;
    const indices = this.indices;

    // ── 2. Fill vertex positions, intensity, side ─────────────────────

    const invT = 1 / (T - 1);
    const invP = 1 / (P - 1);

    for (let t = 0; t < T; t++) {
      for (let p = 0; p < P; p++) {
        const vi = t * P + p;
        const gridIdx = t * P + p; // intensities layout matches vertex layout

        const x = t * invT;
        const y = p * invP;
        const z = grid.intensities[gridIdx];

        positions[vi * 3] = x;
        positions[vi * 3 + 1] = y;
        positions[vi * 3 + 2] = z;

        vertexIntensities[vi] = z;
        vertexSides[vi] = grid.sides[gridIdx];
      }
    }

    // ── 3. Compute per-vertex normals via finite differences ──────────

    for (let t = 0; t < T; t++) {
      for (let p = 0; p < P; p++) {
        const vi = t * P + p;

        // Tangent along time axis (dx)
        let dxX: number, dxY: number, dxZ: number;
        if (t === 0) {
          // Forward difference
          const a = vi;
          const b = (t + 1) * P + p;
          dxX = positions[b * 3] - positions[a * 3];
          dxY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dxZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        } else if (t === T - 1) {
          // Backward difference
          const a = (t - 1) * P + p;
          const b = vi;
          dxX = positions[b * 3] - positions[a * 3];
          dxY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dxZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        } else {
          // Central difference
          const a = (t - 1) * P + p;
          const b = (t + 1) * P + p;
          dxX = positions[b * 3] - positions[a * 3];
          dxY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dxZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        }

        // Tangent along price axis (dy)
        let dyX: number, dyY: number, dyZ: number;
        if (p === 0) {
          const a = vi;
          const b = t * P + (p + 1);
          dyX = positions[b * 3] - positions[a * 3];
          dyY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dyZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        } else if (p === P - 1) {
          const a = t * P + (p - 1);
          const b = vi;
          dyX = positions[b * 3] - positions[a * 3];
          dyY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dyZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        } else {
          const a = t * P + (p - 1);
          const b = t * P + (p + 1);
          dyX = positions[b * 3] - positions[a * 3];
          dyY = positions[b * 3 + 1] - positions[a * 3 + 1];
          dyZ = positions[b * 3 + 2] - positions[a * 3 + 2];
        }

        // Cross product: dx x dy
        let nx = dxY * dyZ - dxZ * dyY;
        let ny = dxZ * dyX - dxX * dyZ;
        let nz = dxX * dyY - dxY * dyX;

        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-8) {
          const invLen = 1 / len;
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;
        } else {
          // Degenerate — point straight up
          nx = 0;
          ny = 0;
          nz = 1;
        }

        normals[vi * 3] = nx;
        normals[vi * 3 + 1] = ny;
        normals[vi * 3 + 2] = nz;
      }
    }

    // ── 4. Build index buffer (two triangles per quad) ────────────────

    let idx = 0;
    for (let t = 0; t < T - 1; t++) {
      for (let p = 0; p < P - 1; p++) {
        const topLeft = t * P + p;
        const topRight = (t + 1) * P + p;
        const bottomRight = (t + 1) * P + (p + 1);
        const bottomLeft = t * P + (p + 1);

        // Triangle 1
        indices[idx++] = topLeft;
        indices[idx++] = topRight;
        indices[idx++] = bottomRight;

        // Triangle 2
        indices[idx++] = topLeft;
        indices[idx++] = bottomRight;
        indices[idx++] = bottomLeft;
      }
    }

    this.elementCount = idxCount;
    this.vertexCount = vertCount;

    // ── 5. Upload to GPU buffers ──────────────────────────────────────

    const { regl } = this.ctx;

    const posData = positions.subarray(0, vertCount * 3);
    const normData = normals.subarray(0, vertCount * 3);
    const intData = vertexIntensities.subarray(0, vertCount);
    const sideData = vertexSides.subarray(0, vertCount);
    const idxData = indices.subarray(0, idxCount);

    if (this.positionBuf) {
      this.positionBuf(posData);
    } else {
      this.positionBuf = regl.buffer({ data: posData, usage: 'dynamic' });
    }

    if (this.normalBuf) {
      this.normalBuf(normData);
    } else {
      this.normalBuf = regl.buffer({ data: normData, usage: 'dynamic' });
    }

    if (this.intensityBuf) {
      this.intensityBuf(intData);
    } else {
      this.intensityBuf = regl.buffer({ data: intData, usage: 'dynamic' });
    }

    if (this.sideBuf) {
      this.sideBuf(sideData);
    } else {
      this.sideBuf = regl.buffer({ data: sideData, usage: 'dynamic' });
    }

    if (this.elementsBuf) {
      this.elementsBuf(idxData);
    } else {
      this.elementsBuf = regl.elements({
        data: idxData,
        primitive: 'triangles',
        type: 'uint16',
        usage: 'dynamic',
      });
    }

    // Invalidate draw command if buffers were newly created
    // (the command captures buffer references at creation time)
    if (!this.drawCommand) {
      this.createDrawCommand();
    }
  }

  // ── Draw Command ────────────────────────────────────────────────────────

  /**
   * Lazily create the regl draw command. Called once after the first update().
   */
  private createDrawCommand(): void {
    const { regl } = this.ctx;
    const bidGradient = this.textureManager.getTexture('bidGradient');
    const askGradient = this.textureManager.getTexture('askGradient');

    if (!bidGradient || !askGradient) {
      console.error('[SurfaceMeshCommand] Missing gradient textures');
      return;
    }

    if (!this.positionBuf || !this.normalBuf || !this.intensityBuf || !this.sideBuf || !this.elementsBuf) {
      console.error('[SurfaceMeshCommand] Buffers not ready');
      return;
    }

    this.drawCommand = regl({
      vert: surface3dVert,
      frag: surface3dFrag,

      attributes: {
        position: { buffer: this.positionBuf, size: 3 },
        normal: { buffer: this.normalBuf, size: 3 },
        intensity: { buffer: this.intensityBuf, size: 1 },
        side: { buffer: this.sideBuf, size: 1 },
      },

      elements: this.elementsBuf,

      uniforms: {
        viewProjection: regl.prop<SurfaceMeshRenderParams, 'viewProjection'>('viewProjection'),
        heightScale: regl.prop<SurfaceMeshRenderParams, 'heightScale'>('heightScale'),
        contrast: regl.prop<SurfaceMeshRenderParams, 'contrast'>('contrast'),
        upperCutoff: regl.prop<SurfaceMeshRenderParams, 'upperCutoff'>('upperCutoff'),
        opacity: regl.prop<SurfaceMeshRenderParams, 'opacity'>('opacity'),
        lightDir: regl.prop<SurfaceMeshRenderParams, 'lightDir'>('lightDir'),
        ambientStrength: regl.prop<SurfaceMeshRenderParams, 'ambientStrength'>('ambientStrength'),
        gridEnabled: regl.prop<{ gridEnabled: number }, 'gridEnabled'>('gridEnabled'),
        gridSpacingX: regl.prop<SurfaceMeshRenderParams, 'gridSpacingX'>('gridSpacingX'),
        gridSpacingY: regl.prop<SurfaceMeshRenderParams, 'gridSpacingY'>('gridSpacingY'),
        time: regl.prop<SurfaceMeshRenderParams, 'time'>('time'),
        bidGradient,
        askGradient,
      },

      depth: { enable: true },
      cull: { enable: true, face: 'back' },

      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one',
        },
      },

      // Required by the fragment shader for fwidth() grid lines
      // Listed here so regl requests the extension from the driver
    });

    console.debug('[SurfaceMeshCommand] Draw command created');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  /**
   * Issue the GPU draw call with the given camera/lighting parameters.
   * `update()` must have been called at least once before rendering.
   */
  render(params: SurfaceMeshRenderParams): void {
    if (!this.drawCommand || this.elementCount === 0) return;

    this.drawCommand({
      viewProjection: params.viewProjection,
      heightScale: params.heightScale,
      contrast: params.contrast,
      upperCutoff: params.upperCutoff,
      opacity: params.opacity,
      lightDir: params.lightDir,
      ambientStrength: params.ambientStrength,
      gridEnabled: params.gridEnabled ? 1 : 0,
      gridSpacingX: params.gridSpacingX,
      gridSpacingY: params.gridSpacingY,
      time: params.time,
    });
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Release all GPU resources. Safe to call multiple times.
   */
  destroy(): void {
    this.positionBuf?.destroy();
    this.normalBuf?.destroy();
    this.intensityBuf?.destroy();
    this.sideBuf?.destroy();
    this.elementsBuf?.destroy();

    this.positionBuf = null;
    this.normalBuf = null;
    this.intensityBuf = null;
    this.sideBuf = null;
    this.elementsBuf = null;

    this.drawCommand = null;
    this.positions = null;
    this.normals = null;
    this.vertexIntensities = null;
    this.vertexSides = null;
    this.indices = null;

    this.elementCount = 0;
    this.vertexCount = 0;
  }
}
