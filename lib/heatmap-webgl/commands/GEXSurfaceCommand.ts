/**
 * GEX 3D Surface Command
 *
 * Renders a 3D mesh surface from GEX data.
 * X-axis = strike, Y-axis = time, Z-axis = GEX magnitude.
 * Color encodes sign: positive (calls) = green, negative (puts) = red.
 */

import type { RenderContext } from '../core/RenderContext';
import { gexSurfaceVert, gexSurfaceFrag } from '../shaders/gexSurface3d';

export interface GEXGridData {
  /** Number of strike levels (columns) */
  strikeLevels: number;
  /** Number of time steps (rows) */
  timeSteps: number;
  /** Flat array: strikeLevels * timeSteps signed GEX values */
  values: Float32Array;
  /** Max absolute value for normalization */
  maxAbsValue: number;
}

export interface GEXSurfaceRenderParams {
  viewProjection: Float32Array;
  heightScale: number;
  opacity: number;
  lightDir: [number, number, number];
  ambientStrength: number;
  gridEnabled: boolean;
  callColor: [number, number, number];
  putColor: [number, number, number];
  zeroColor: [number, number, number];
}

export class GEXSurfaceCommand {
  private ctx: RenderContext;

  private drawCommand: any = null;

  // CPU-side buffers
  private positions: Float32Array | null = null;
  private normals: Float32Array | null = null;
  private valuesAttr: Float32Array | null = null;
  private indices: Uint32Array | null = null;

  // GPU-side buffers

  private positionBuf: any = null;

  private normalBuf: any = null;

  private valueBuf: any = null;

  private elementsBuf: any = null;

  private elementCount = 0;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  /**
   * Feed new GEX grid data. Rebuilds the mesh geometry.
   */
  update(grid: GEXGridData): void {
    const S = grid.strikeLevels;
    const T = grid.timeSteps;
    if (S < 2 || T < 2) return;

    const vertCount = S * T;
    const triCount = (S - 1) * (T - 1) * 2;

    // Allocate / reuse typed arrays
    if (!this.positions || this.positions.length < vertCount * 3) {
      this.positions = new Float32Array(vertCount * 3);
      this.normals = new Float32Array(vertCount * 3);
      this.valuesAttr = new Float32Array(vertCount);
      this.indices = new Uint32Array(triCount * 3);
    }

    const pos = this.positions;
    const nrm = this.normals!;
    const val = this.valuesAttr!;
    const idx = this.indices!;
    const maxAbs = grid.maxAbsValue || 1;

    // Fill vertex data
    for (let t = 0; t < T; t++) {
      for (let s = 0; s < S; s++) {
        const vi = t * S + s;
        const rawValue = grid.values[vi] || 0;
        const normalized = rawValue / maxAbs; // [-1, 1]

        // x = strike (0..1), y = time (0..1), z = abs magnitude (0..1)
        pos[vi * 3] = s / (S - 1);
        pos[vi * 3 + 1] = t / (T - 1);
        pos[vi * 3 + 2] = Math.abs(normalized);

        val[vi] = normalized;
      }
    }

    // Compute normals via finite differences
    for (let t = 0; t < T; t++) {
      for (let s = 0; s < S; s++) {
        const vi = t * S + s;

        // Tangent along strike direction (dStrike)
        let dsX: number, dsY: number, dsZ: number;
        if (s > 0 && s < S - 1) {
          const prev = vi - 1, next = vi + 1;
          dsX = pos[next * 3] - pos[prev * 3];
          dsY = pos[next * 3 + 1] - pos[prev * 3 + 1];
          dsZ = pos[next * 3 + 2] - pos[prev * 3 + 2];
        } else if (s === 0) {
          const next = vi + 1;
          dsX = pos[next * 3] - pos[vi * 3];
          dsY = pos[next * 3 + 1] - pos[vi * 3 + 1];
          dsZ = pos[next * 3 + 2] - pos[vi * 3 + 2];
        } else {
          const prev = vi - 1;
          dsX = pos[vi * 3] - pos[prev * 3];
          dsY = pos[vi * 3 + 1] - pos[prev * 3 + 1];
          dsZ = pos[vi * 3 + 2] - pos[prev * 3 + 2];
        }

        // Tangent along time direction (dTime)
        let dtX: number, dtY: number, dtZ: number;
        if (t > 0 && t < T - 1) {
          const prev = (t - 1) * S + s, next = (t + 1) * S + s;
          dtX = pos[next * 3] - pos[prev * 3];
          dtY = pos[next * 3 + 1] - pos[prev * 3 + 1];
          dtZ = pos[next * 3 + 2] - pos[prev * 3 + 2];
        } else if (t === 0) {
          const next = (t + 1) * S + s;
          dtX = pos[next * 3] - pos[vi * 3];
          dtY = pos[next * 3 + 1] - pos[vi * 3 + 1];
          dtZ = pos[next * 3 + 2] - pos[vi * 3 + 2];
        } else {
          const prev = (t - 1) * S + s;
          dtX = pos[vi * 3] - pos[prev * 3];
          dtY = pos[vi * 3 + 1] - pos[prev * 3 + 1];
          dtZ = pos[vi * 3 + 2] - pos[prev * 3 + 2];
        }

        // Cross product: ds × dt
        let nx = dsY * dtZ - dsZ * dtY;
        let ny = dsZ * dtX - dsX * dtZ;
        let nz = dsX * dtY - dsY * dtX;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-8) {
          const invLen = 1 / len;
          nx *= invLen;
          ny *= invLen;
          nz *= invLen;
        } else {
          nx = 0; ny = 0; nz = 1;
        }

        // Ensure normal points "up" (positive z)
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }

        nrm[vi * 3] = nx;
        nrm[vi * 3 + 1] = ny;
        nrm[vi * 3 + 2] = nz;
      }
    }

    // Build index buffer (two triangles per quad)
    let idxOff = 0;
    for (let t = 0; t < T - 1; t++) {
      for (let s = 0; s < S - 1; s++) {
        const tl = t * S + s;
        const tr = t * S + (s + 1);
        const bl = (t + 1) * S + s;
        const br = (t + 1) * S + (s + 1);

        idx[idxOff++] = tl;
        idx[idxOff++] = tr;
        idx[idxOff++] = br;

        idx[idxOff++] = tl;
        idx[idxOff++] = br;
        idx[idxOff++] = bl;
      }
    }

    this.elementCount = idxOff;

    // Upload to GPU
    const { regl } = this.ctx;
    const posData = pos.subarray(0, vertCount * 3);
    const nrmData = nrm.subarray(0, vertCount * 3);
    const valData = val.subarray(0, vertCount);
    const idxData = idx.subarray(0, idxOff);

    if (this.positionBuf) {
      this.positionBuf(posData);
      this.normalBuf(nrmData);
      this.valueBuf(valData);
      this.elementsBuf(idxData);
    } else {
      this.positionBuf = regl.buffer({ data: posData, usage: 'dynamic' });
      this.normalBuf = regl.buffer({ data: nrmData, usage: 'dynamic' });
      this.valueBuf = regl.buffer({ data: valData, usage: 'dynamic' });
      this.elementsBuf = regl.elements({ data: idxData, usage: 'dynamic', type: 'uint32' });
      this.createDrawCommand();
    }
  }

  private createDrawCommand(): void {
    const { regl } = this.ctx;

    this.drawCommand = regl({
      vert: gexSurfaceVert,
      frag: gexSurfaceFrag,

      attributes: {
        position: { buffer: this.positionBuf, size: 3 },
        normal: { buffer: this.normalBuf, size: 3 },
        value: { buffer: this.valueBuf, size: 1 },
      },

      elements: this.elementsBuf,

      uniforms: {
        viewProjection: regl.prop<GEXSurfaceRenderParams, 'viewProjection'>('viewProjection'),
        heightScale: regl.prop<GEXSurfaceRenderParams, 'heightScale'>('heightScale'),
        opacity: regl.prop<GEXSurfaceRenderParams, 'opacity'>('opacity'),
        lightDir: regl.prop<GEXSurfaceRenderParams, 'lightDir'>('lightDir'),
        ambientStrength: regl.prop<GEXSurfaceRenderParams, 'ambientStrength'>('ambientStrength'),
      
        gridEnabled: regl.prop<any, 'gridEnabled'>('gridEnabled'),
        callColor: regl.prop<GEXSurfaceRenderParams, 'callColor'>('callColor'),
        putColor: regl.prop<GEXSurfaceRenderParams, 'putColor'>('putColor'),
        zeroColor: regl.prop<GEXSurfaceRenderParams, 'zeroColor'>('zeroColor'),
      },

      depth: { enable: true },
      cull: { enable: false }, // Render both sides for better visibility

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

  render(params: GEXSurfaceRenderParams): void {
    if (!this.drawCommand || this.elementCount === 0) return;

    this.drawCommand({
      viewProjection: params.viewProjection,
      heightScale: params.heightScale,
      opacity: params.opacity,
      lightDir: params.lightDir,
      ambientStrength: params.ambientStrength,
      gridEnabled: params.gridEnabled ? 1 : 0,
      callColor: params.callColor,
      putColor: params.putColor,
      zeroColor: params.zeroColor,
    });
  }

  destroy(): void {
    this.positionBuf?.destroy();
    this.normalBuf?.destroy();
    this.valueBuf?.destroy();
    this.elementsBuf?.destroy();
    this.drawCommand = null;
  }
}
