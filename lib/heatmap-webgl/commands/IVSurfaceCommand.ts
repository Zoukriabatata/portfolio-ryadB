/**
 * IV 3D Surface Command
 *
 * Renders a 3D mesh surface from Implied Volatility data.
 * X-axis = strike, Y-axis = expiration, Z-axis = IV height.
 * Color encodes IV magnitude: blue (low) -> green -> yellow -> red (high).
 */

import type { RenderContext } from '../core/RenderContext';
import { ivSurfaceVert, ivSurfaceFrag } from '../shaders/ivSurface3d';

export interface IVGridData {
  /** Number of strike levels (columns) */
  strikeLevels: number;
  /** Number of expiration steps (rows) */
  expirySteps: number;
  /** Flat array: strikeLevels * expirySteps IV values (0-1 normalized) */
  values: Float32Array;
  /** Min IV for normalization */
  minIV: number;
  /** Max IV for normalization */
  maxIV: number;
}

export interface IVSurfaceRenderParams {
  viewProjection: Float32Array;
  heightScale: number;
  opacity: number;
  lightDir: [number, number, number];
  ambientStrength: number;
  gridEnabled: boolean;
}

export class IVSurfaceCommand {
  private ctx: RenderContext;
  private drawCommand: any = null;

  private positions: Float32Array | null = null;
  private normals: Float32Array | null = null;
  private valuesAttr: Float32Array | null = null;
  private indices: Uint32Array | null = null;

  private positionBuf: any = null;
  private normalBuf: any = null;
  private valueBuf: any = null;
  private elementsBuf: any = null;
  private elementCount = 0;

  constructor(ctx: RenderContext) {
    this.ctx = ctx;
  }

  update(grid: IVGridData): void {
    const S = grid.strikeLevels;
    const E = grid.expirySteps;
    if (S < 2 || E < 2) return;

    const vertCount = S * E;
    const triCount = (S - 1) * (E - 1) * 2;

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
    const range = grid.maxIV - grid.minIV || 1;

    // Fill vertex data
    for (let e = 0; e < E; e++) {
      for (let s = 0; s < S; s++) {
        const vi = e * S + s;
        const rawIV = grid.values[vi] || 0;
        const normalized = (rawIV - grid.minIV) / range; // [0, 1]

        // x = strike (0..1), y = expiry (0..1), z = IV height (0..1)
        pos[vi * 3] = s / (S - 1);
        pos[vi * 3 + 1] = e / (E - 1);
        pos[vi * 3 + 2] = normalized;

        val[vi] = normalized;
      }
    }

    // Compute normals via finite differences
    for (let e = 0; e < E; e++) {
      for (let s = 0; s < S; s++) {
        const vi = e * S + s;

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

        let deX: number, deY: number, deZ: number;
        if (e > 0 && e < E - 1) {
          const prev = (e - 1) * S + s, next = (e + 1) * S + s;
          deX = pos[next * 3] - pos[prev * 3];
          deY = pos[next * 3 + 1] - pos[prev * 3 + 1];
          deZ = pos[next * 3 + 2] - pos[prev * 3 + 2];
        } else if (e === 0) {
          const next = (e + 1) * S + s;
          deX = pos[next * 3] - pos[vi * 3];
          deY = pos[next * 3 + 1] - pos[vi * 3 + 1];
          deZ = pos[next * 3 + 2] - pos[vi * 3 + 2];
        } else {
          const prev = (e - 1) * S + s;
          deX = pos[vi * 3] - pos[prev * 3];
          deY = pos[vi * 3 + 1] - pos[prev * 3 + 1];
          deZ = pos[vi * 3 + 2] - pos[prev * 3 + 2];
        }

        // Cross product: ds × de
        let nx = dsY * deZ - dsZ * deY;
        let ny = dsZ * deX - dsX * deZ;
        let nz = dsX * deY - dsY * deX;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1e-8) {
          const invLen = 1 / len;
          nx *= invLen; ny *= invLen; nz *= invLen;
        } else {
          nx = 0; ny = 0; nz = 1;
        }

        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }

        nrm[vi * 3] = nx;
        nrm[vi * 3 + 1] = ny;
        nrm[vi * 3 + 2] = nz;
      }
    }

    // Build index buffer
    let idxOff = 0;
    for (let e = 0; e < E - 1; e++) {
      for (let s = 0; s < S - 1; s++) {
        const tl = e * S + s;
        const tr = e * S + (s + 1);
        const bl = (e + 1) * S + s;
        const br = (e + 1) * S + (s + 1);

        idx[idxOff++] = tl;
        idx[idxOff++] = tr;
        idx[idxOff++] = br;

        idx[idxOff++] = tl;
        idx[idxOff++] = br;
        idx[idxOff++] = bl;
      }
    }

    this.elementCount = idxOff;

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
      vert: ivSurfaceVert,
      frag: ivSurfaceFrag,

      attributes: {
        position: { buffer: this.positionBuf, size: 3 },
        normal: { buffer: this.normalBuf, size: 3 },
        value: { buffer: this.valueBuf, size: 1 },
      },

      elements: this.elementsBuf,

      uniforms: {
        viewProjection: regl.prop<IVSurfaceRenderParams, 'viewProjection'>('viewProjection'),
        heightScale: regl.prop<IVSurfaceRenderParams, 'heightScale'>('heightScale'),
        opacity: regl.prop<IVSurfaceRenderParams, 'opacity'>('opacity'),
        lightDir: regl.prop<IVSurfaceRenderParams, 'lightDir'>('lightDir'),
        ambientStrength: regl.prop<IVSurfaceRenderParams, 'ambientStrength'>('ambientStrength'),
        gridEnabled: regl.prop<any, 'gridEnabled'>('gridEnabled'),
      },

      depth: { enable: true },
      cull: { enable: false },

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

  render(params: IVSurfaceRenderParams): void {
    if (!this.drawCommand || this.elementCount === 0) return;

    this.drawCommand({
      viewProjection: params.viewProjection,
      heightScale: params.heightScale,
      opacity: params.opacity,
      lightDir: params.lightDir,
      ambientStrength: params.ambientStrength,
      gridEnabled: params.gridEnabled ? 1 : 0,
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
