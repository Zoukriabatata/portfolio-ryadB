/**
 * HEATMAP 3D RENDERER
 *
 * Orchestrator for the 3D surface heatmap view.
 * Parallel to HybridRenderer but renders a 3D terrain instead of 2D.
 */

import { RenderContext } from './core/RenderContext';
import { TextureManager } from './core/TextureManager';
import { CameraController } from './core/CameraController';
import { SurfaceMeshCommand } from './commands/SurfaceMeshCommand';
import { GridFloorCommand } from './commands/GridFloorCommand';
import type { SurfaceGridData } from './adapters/SurfaceDataAdapter';
import type { ThemeName } from './themes';

export interface Heatmap3DConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr?: number;
}

export interface Heatmap3DRenderSettings {
  contrast: number;
  upperCutoff: number;
  heightScale: number;
  showGridLines: boolean;
  lightDirection: [number, number, number];
  ambientStrength: number;
  opacity: number;
}

const DEFAULT_SETTINGS: Heatmap3DRenderSettings = {
  contrast: 1.2,
  upperCutoff: 0.85,
  heightScale: 0.8,
  showGridLines: true,
  lightDirection: [0.3, 0.8, 0.5],
  ambientStrength: 0.35,
  opacity: 0.95,
};

export class Heatmap3DRenderer {
  private ctx: RenderContext;
  private textureManager: TextureManager;
  private surfaceCommand: SurfaceMeshCommand;
  private gridCommand: GridFloorCommand;
  public camera: CameraController;

  private width: number;
  private height: number;
  private dpr: number;
  private startTime = Date.now();
  private _isInitialized = false;

  constructor(config: Heatmap3DConfig) {
    this.width = config.width;
    this.height = config.height;
    this.dpr = config.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1);

    this.ctx = new RenderContext(config.canvas);
    this.textureManager = new TextureManager(this.ctx);
    // Explicitly create gradient textures (setTheme short-circuits when default matches)
    this.textureManager.createBidGradient();
    this.textureManager.createAskGradient();

    this.camera = new CameraController();
    this.surfaceCommand = new SurfaceMeshCommand(this.ctx, this.textureManager);
    this.gridCommand = new GridFloorCommand(this.ctx);

    // Set canvas size
    this.resize(config.width, config.height);
    this._isInitialized = true;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isWebGL(): boolean {
    return true;
  }

  setTheme(themeName: ThemeName): void {
    this.textureManager.setTheme(themeName);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.ctx.resize(width, height, this.dpr);
    this.camera.setDirty();
  }

  updateData(grid: SurfaceGridData): void {
    this.surfaceCommand.update(grid);
  }

  render(settings?: Partial<Heatmap3DRenderSettings>): void {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const aspect = this.width / this.height;
    const vp = this.camera.getViewProjectionMatrix(aspect);
    const time = (Date.now() - this.startTime) / 1000;

    // Clear color + depth
    this.ctx.regl.clear({
      color: [0.039, 0.047, 0.063, 1],
      depth: 1,
    });

    // 1. Grid floor
    this.gridCommand.render(vp, 0.4);

    // 2. Surface mesh
    this.surfaceCommand.render({
      viewProjection: vp,
      heightScale: s.heightScale,
      contrast: s.contrast,
      upperCutoff: s.upperCutoff,
      opacity: s.opacity,
      lightDir: s.lightDirection,
      ambientStrength: s.ambientStrength,
      gridEnabled: s.showGridLines,
      gridSpacingX: 0.05,
      gridSpacingY: 0.05,
      time,
    });
  }

  attachControls(canvas: HTMLCanvasElement): () => void {
    return this.camera.attachToCanvas(canvas);
  }

  destroy(): void {
    this._isInitialized = false;
    this.surfaceCommand.destroy();
    this.gridCommand.destroy();
    this.ctx.destroy();
  }
}
