/**
 * WebGL Render Context
 * Wrapper around regl for WebGL context management
 */

import createREGL from 'regl';
import type { WebGLRenderConfig } from '../types';

export class RenderContext {
  public regl: ReturnType<typeof createREGL>;
  public gl: WebGLRenderingContext | WebGL2RenderingContext;
  public canvas: HTMLCanvasElement;
  private _isWebGL2: boolean = false;
  private _maxTextureSize: number = 0;
  private _supportsInstancing: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Try WebGL2 first, fall back to WebGL1
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;
    this._isWebGL2 = gl instanceof WebGL2RenderingContext;

    // Check capabilities
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // Create regl context
    // ANGLE_instanced_arrays must be listed for regl to allow divisor in attributes,
    // even on WebGL2 where instancing is native (regl checks its extension registry).
    // Listed as optional so we gracefully fall back to non-instanced rendering if unavailable.
    this.regl = createREGL({
      canvas,
      gl,
      optionalExtensions: [
        'ANGLE_instanced_arrays',
        'OES_vertex_array_object',
        'OES_texture_float',
        'OES_texture_half_float',
      ],
    });

    // Check instancing support from regl (authoritative source)
    this._supportsInstancing = this.regl.hasExtension('ANGLE_instanced_arrays');

    console.debug(`[WebGL] Context created: WebGL${this._isWebGL2 ? '2' : '1'}, Max texture: ${this._maxTextureSize}, Instancing: ${this._supportsInstancing}`);
  }

  get isWebGL2(): boolean {
    return this._isWebGL2;
  }

  get maxTextureSize(): number {
    return this._maxTextureSize;
  }

  get supportsInstancing(): boolean {
    return this._supportsInstancing;
  }

  /**
   * Resize the canvas and update viewport
   */
  resize(width: number, height: number, dpr: number = 1): void {
    const actualWidth = Math.floor(width * dpr);
    const actualHeight = Math.floor(height * dpr);

    if (this.canvas.width !== actualWidth || this.canvas.height !== actualHeight) {
      this.canvas.width = actualWidth;
      this.canvas.height = actualHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  /**
   * Clear the canvas
   */
  clear(color: [number, number, number, number] = [0, 0, 0, 1]): void {
    this.regl.clear({
      color,
      depth: 1,
    });
  }

  /**
   * Create an orthographic projection matrix for 2D rendering
   */
  createProjection(width: number, height: number): number[] {
    // Orthographic projection: maps (0,0)-(width,height) to (-1,-1)-(1,1)
    const left = 0;
    const right = width;
    const bottom = height;
    const top = 0;
    const near = -1;
    const far = 1;

    return [
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, -2 / (far - near), 0,
      -(right + left) / (right - left),
      -(top + bottom) / (top - bottom),
      -(far + near) / (far - near),
      1,
    ];
  }

  /**
   * Check if WebGL context is lost
   */
  isContextLost(): boolean {
    return this.gl.isContextLost();
  }

  /**
   * Destroy the context and release resources
   */
  destroy(): void {
    this.regl.destroy();
  }
}
