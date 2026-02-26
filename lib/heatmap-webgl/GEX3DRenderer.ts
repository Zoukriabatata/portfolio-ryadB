/**
 * GEX 3D Renderer
 *
 * Lightweight WebGL renderer for the GEX 3D surface chart.
 * Uses the same RenderContext + CameraController pattern as Heatmap3DRenderer
 * but with a GEXSurfaceCommand instead of the orderbook surface.
 */

import { RenderContext } from './core/RenderContext';
import { CameraController } from './core/CameraController';
import { GridFloorCommand } from './commands/GridFloorCommand';
import { GEXSurfaceCommand, type GEXGridData, type GEXSurfaceRenderParams } from './commands/GEXSurfaceCommand';
import { grid3dVert, grid3dFrag } from './shaders/surface3d';

export interface GEX3DConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr?: number;
}

export interface GEX3DColors {
  callColor: [number, number, number];
  putColor: [number, number, number];
  zeroColor: [number, number, number];
  bgColor: [number, number, number, number];
}

const DEFAULT_COLORS: GEX3DColors = {
  callColor: [0.13, 0.77, 0.37],  // #22c55e
  putColor: [0.94, 0.27, 0.27],   // #ef4444
  zeroColor: [0.2, 0.2, 0.25],
  bgColor: [0.02, 0.02, 0.063, 1],
};

export class GEX3DRenderer {
  private ctx: RenderContext;
  public camera: CameraController;
  private surfaceCommand: GEXSurfaceCommand;
  private gridCommand: GridFloorCommand;

  private width: number;
  private height: number;
  private dpr: number;
  private _isInitialized = false;
  private colors: GEX3DColors = DEFAULT_COLORS;

  // Store grid dimensions for overlay projection
  private _strikeLevels = 0;
  private _timeSteps = 0;

  constructor(config: GEX3DConfig) {
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

    this.surfaceCommand = new GEXSurfaceCommand(this.ctx);
    this.gridCommand = new GridFloorCommand(this.ctx);

    this.resize(config.width, config.height);
    this._isInitialized = true;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get strikeLevels(): number { return this._strikeLevels; }
  get timeSteps(): number { return this._timeSteps; }

  setColors(colors: Partial<GEX3DColors>): void {
    this.colors = { ...this.colors, ...colors };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.ctx.resize(width, height, this.dpr);
  }

  updateData(grid: GEXGridData): void {
    this._strikeLevels = grid.strikeLevels;
    this._timeSteps = grid.timeSteps;
    this.surfaceCommand.update(grid);
  }

  /**
   * Project a 3D world point to 2D screen coordinates.
   * Used by the overlay to position axis labels.
   */
  projectToScreen(worldX: number, worldY: number, worldZ: number): { x: number; y: number } | null {
    const aspect = this.width / this.height;
    const vp = this.camera.getViewProjectionMatrix(aspect);

    const x = worldX * vp[0] + worldY * vp[4] + worldZ * vp[8] + vp[12];
    const y = worldX * vp[1] + worldY * vp[5] + worldZ * vp[9] + vp[13];
    const w = worldX * vp[3] + worldY * vp[7] + worldZ * vp[11] + vp[15];

    if (Math.abs(w) < 1e-6) return null;

    const ndcX = x / w;
    const ndcY = y / w;

    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
    };
  }

  render(): void {
    if (!this._isInitialized) return;

    const aspect = this.width / this.height;
    const vp = this.camera.getViewProjectionMatrix(aspect);

    this.ctx.regl.poll();
    this.ctx.regl.clear({
      color: this.colors.bgColor,
      depth: 1,
    });

    // Grid floor
    this.gridCommand.render(vp, 0.35);

    // Surface
    this.surfaceCommand.render({
      viewProjection: vp,
      heightScale: 0.6,
      opacity: 0.92,
      lightDir: [0.4, 0.8, 0.6],
      ambientStrength: 0.35,
      gridEnabled: true,
      callColor: this.colors.callColor,
      putColor: this.colors.putColor,
      zeroColor: this.colors.zeroColor,
    });
  }

  tick(): boolean {
    return this.camera.tick();
  }

  destroy(): void {
    this._isInitialized = false;
    this.surfaceCommand.destroy();
    this.gridCommand.destroy();
    this.ctx.destroy();
  }
}
