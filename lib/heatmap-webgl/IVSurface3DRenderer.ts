/**
 * IV Surface 3D Renderer
 *
 * WebGL renderer for the Implied Volatility 3D surface chart.
 * Uses the same RenderContext + CameraController pattern as GEX3DRenderer.
 *
 * Features:
 *  - Smooth shaded 3D surface with IV color ramp
 *  - Camera presets, orbit, zoom, pan with inertia
 *  - Canvas 2D overlay for axis labels
 */

import { RenderContext } from './core/RenderContext';
import { CameraController } from './core/CameraController';
import { GridFloorCommand } from './commands/GridFloorCommand';
import { IVSurfaceCommand, type IVGridData, type IVSurfaceRenderParams } from './commands/IVSurfaceCommand';

export interface IVSurface3DConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr?: number;
}

export class IVSurface3DRenderer {
  private ctx: RenderContext;
  public camera: CameraController;
  private surfaceCommand: IVSurfaceCommand;
  private gridCommand: GridFloorCommand;

  private width: number;
  private height: number;
  private dpr: number;
  private _isInitialized = false;

  constructor(config: IVSurface3DConfig) {
    this.width = config.width;
    this.height = config.height;
    this.dpr = config.dpr ?? window.devicePixelRatio;

    this.ctx = new RenderContext(config.canvas);
    this.camera = new CameraController({
      azimuth: -0.7,
      elevation: 0.5,
      distance: 2.6,
      target: [0.5, 0.5, 0],
    });

    this.surfaceCommand = new IVSurfaceCommand(this.ctx);
    this.gridCommand = new GridFloorCommand(this.ctx);

    this.resize(config.width, config.height);
    this._isInitialized = true;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.ctx.resize(width, height, this.dpr);
  }

  updateData(grid: IVGridData): void {
    this.surfaceCommand.update(grid);
  }

  render(): void {
    if (!this._isInitialized) return;

    const aspect = this.width / this.height;
    const vp = this.camera.getViewProjectionMatrix(aspect);

    this.ctx.regl.poll();
    this.ctx.regl.clear({
      color: [0.02, 0.02, 0.063, 1],
      depth: 1,
    });

    this.gridCommand.render(vp, 0.35);

    this.surfaceCommand.render({
      viewProjection: vp,
      heightScale: 0.6,
      opacity: 0.92,
      lightDir: [0.4, 0.8, 0.6],
      ambientStrength: 0.35,
      gridEnabled: true,
    });
  }

  tick(): boolean {
    return this.camera.tick();
  }

  /**
   * Project a 3D world point to 2D screen coordinates.
   * Used by the overlay to position axis labels.
   */
  projectToScreen(worldX: number, worldY: number, worldZ: number): { x: number; y: number } | null {
    const aspect = this.width / this.height;
    const vp = this.camera.getViewProjectionMatrix(aspect);

    // Apply VP matrix
    const x = worldX * vp[0] + worldY * vp[4] + worldZ * vp[8] + vp[12];
    const y = worldX * vp[1] + worldY * vp[5] + worldZ * vp[9] + vp[13];
    const w = worldX * vp[3] + worldY * vp[7] + worldZ * vp[11] + vp[15];

    if (Math.abs(w) < 1e-6) return null;

    // NDC to screen
    const ndcX = x / w;
    const ndcY = y / w;

    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
    };
  }

  destroy(): void {
    this._isInitialized = false;
    this.surfaceCommand.destroy();
    this.gridCommand.destroy();
    this.ctx.destroy();
  }
}
