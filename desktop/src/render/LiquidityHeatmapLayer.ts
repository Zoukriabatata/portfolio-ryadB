import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { PannableLayer } from "./HeatmapEngine";
import type { LiquidityFrame } from "./LiquidityFrame";
import { intensityToUint8 } from "./intensityToUint8";
import { buildGradientTexture256 } from "./gradient";

const VERT_SRC = `
precision mediump float;
attribute vec2 aPosition;
varying vec2 vUV;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUV = aPosition * 0.5 + 0.5;
}
`;

// Sampling sans if/switch : intensité (texture R) → gradient (texture 256×1
// linéaire). Le gradient est prébaké à l'init ; la GPU interpole entre les
// 256 pixels du gradient via le filtre 'linear'.
//
// REFONTE-7/P3 : ajout uniform uPanUV pour pan visuel non-destructif.
// uPanUV = (panX/canvasW, panY/canvasH) en drawing buffer pixels normalisés.
// Convention :
//  - panX > 0 (drag RIGHT) → contenu glisse à droite → screen X montre ce qui
//    était à gauche → worldUV.x = vUV.x - panX/W.
//  - panY > 0 (drag DOWN) → contenu glisse en bas → screen Y montre ce qui
//    était en haut → worldUV.y = vUV.y + panY/H (vUV.y=1 = top screen).
// Hors [0,1] → fond #0A0A0A (--bg-primary). OutOfBufferLayer dessinera
// "No data" par-dessus si la zone est hors-buffer Bybit.
const FRAG_SRC = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uIntensity;
uniform sampler2D uGradient;
uniform vec2 uPanUV;
void main() {
  vec2 worldUV = vec2(vUV.x - uPanUV.x, vUV.y + uPanUV.y);
  if (worldUV.x < 0.0 || worldUV.x > 1.0 || worldUV.y < 0.0 || worldUV.y > 1.0) {
    gl_FragColor = vec4(0.039, 0.039, 0.039, 1.0); // #0A0A0A
    return;
  }
  // .yx swap : screen.x → texture.y (row = bucket temps),
  //            screen.y → texture.x (col = price level).
  float i = texture2D(uIntensity, worldUV.yx).r;
  vec3 color = texture2D(uGradient, vec2(i, 0.5)).rgb;
  gl_FragColor = vec4(color, 1.0);
}
`;

const FULL_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

export class LiquidityHeatmapLayer
  implements Layer<LiquidityFrame>, PannableLayer
{
  // dirty flag — écrit par l'engine uniquement (REFONTE-3 contract).
  // La couche ne le lit ni ne le modifie elle-même.
  public dirty = false;
  private regl: Regl.Regl | null = null;
  private intensityTex: Regl.Texture2D | null = null;
  private gradientTex: Regl.Texture2D | null = null;
  private positionBuf: Regl.Buffer | null = null;
  private uint8Cells: Uint8Array | null = null;
  private drawCmd: Regl.DrawCommand | null = null;
  private historyLength = 0;
  private priceLevels = 0;
  // REFONTE-7/P3 : pan en drawing buffer pixels, push par engine via setPan().
  // Lu via closure dans le uniform uPanUV.
  private _panX = 0;
  private _panY = 0;

  init(regl: Regl.Regl, grid: GridSystem): void {
    this.regl = regl;
    this.historyLength = grid.historyLength;
    this.priceLevels = grid.priceLevels;
    const size = this.historyLength * this.priceLevels;
    // Companion buffer alloué une fois ; réécrit en place dans update().
    this.uint8Cells = new Uint8Array(size);

    // Texture intensité : MAJ par subimage() à chaque update (équivalent
    // texture du pattern regl.buffer({ usage: 'dynamic' })).
    // SWAP width/height : le buffer cells est laid out [t * priceLevels + p]
    // donc chaque "row" du buffer fait priceLevels éléments. WebGL lit
    // data[i] comme texel (x = i % width, y = i / width) → width DOIT être
    // priceLevels pour qu'un row = un t. Le shader compense avec vUV.yx.
    this.intensityTex = regl.texture({
      width: this.priceLevels,
      height: this.historyLength,
      format: "luminance",
      type: "uint8",
      data: this.uint8Cells,
      min: "nearest",
      mag: "nearest",
      wrapS: "clamp",
      wrapT: "clamp",
    });

    // Gradient : 256×1 RGBA8, statique, construit une fois depuis CSS vars.
    const gradientData = buildGradientTexture256();
    this.gradientTex = regl.texture({
      width: 256,
      height: 1,
      format: "rgba",
      type: "uint8",
      data: gradientData,
      min: "linear",
      mag: "linear",
      wrapS: "clamp",
      wrapT: "clamp",
    });

    // Quad plein écran : statique.
    this.positionBuf = regl.buffer({
      data: FULL_QUAD,
      usage: "static",
    });

    // Closure directe sur intensityTex/gradientTex (pas de regl.prop pour
    // les uniforms — leçon CLAUDE.md §5.B sur les vec en regl.prop).
    // REFONTE-7/P3 : uPanUV via closure (vec2 = banni regl.prop).
    this.drawCmd = regl({
      vert: VERT_SRC,
      frag: FRAG_SRC,
      attributes: { aPosition: this.positionBuf },
      uniforms: {
        uIntensity: this.intensityTex,
        uGradient: this.gradientTex,
        uPanUV: (context: { viewportWidth: number; viewportHeight: number }) => [
          context.viewportWidth > 0 ? this._panX / context.viewportWidth : 0,
          context.viewportHeight > 0 ? this._panY / context.viewportHeight : 0,
        ],
      },
      primitive: "triangle strip",
      count: 4,
      depth: { enable: false },
      blend: { enable: false },
    });
  }

  // REFONTE-7/P3 — push pan depuis l'engine. Pas d'allocation, pas de
  // re-bind buffers. La closure de uPanUV lit ces valeurs au prochain draw.
  setPan(panX: number, panY: number): void {
    this._panX = panX;
    this._panY = panY;
  }

  update(_grid: GridSystem, data: LiquidityFrame): void {
    if (!this.intensityTex || !this.uint8Cells) {
      throw new Error("LiquidityHeatmapLayer: update called before init");
    }
    if (data.cells.length !== this.uint8Cells.length) {
      throw new Error(
        `LiquidityHeatmapLayer: frame.cells.length (${data.cells.length}) ≠ ` +
          `uint8Cells.length (${this.uint8Cells.length}). ` +
          `Resize non géré en REFONTE-2.`,
      );
    }
    intensityToUint8(data.cells, this.uint8Cells);
    this.intensityTex.subimage(this.uint8Cells);
  }

  draw(): void {
    if (this.drawCmd) {
      this.drawCmd();
    }
  }

  // Idempotent : no-op si dimensions identiques. Sinon recrée la texture
  // intensité + buffer companion. Le gradient (256×1, indépendant du grid)
  // est conservé. positionBuf (quad clip-space) idem.
  onViewportChange(grid: GridSystem): void {
    if (
      grid.historyLength === this.historyLength &&
      grid.priceLevels === this.priceLevels
    ) {
      return;
    }
    if (!this.regl) return;
    this.intensityTex?.destroy();
    this.intensityTex = null;
    this.historyLength = grid.historyLength;
    this.priceLevels = grid.priceLevels;
    this.uint8Cells = new Uint8Array(this.historyLength * this.priceLevels);
    this.intensityTex = this.regl.texture({
      width: this.priceLevels,
      height: this.historyLength,
      format: "luminance",
      type: "uint8",
      data: this.uint8Cells,
      min: "nearest",
      mag: "nearest",
      wrapS: "clamp",
      wrapT: "clamp",
    });
    // Le draw command capture intensityTex via closure ; il faut le
    // re-fabriquer pour pointer sur la nouvelle texture.
    const regl = this.regl;
    this.drawCmd = regl({
      vert: VERT_SRC,
      frag: FRAG_SRC,
      attributes: { aPosition: this.positionBuf! },
      uniforms: {
        uIntensity: this.intensityTex,
        uGradient: this.gradientTex!,
        uPanUV: (context: { viewportWidth: number; viewportHeight: number }) => [
          context.viewportWidth > 0 ? this._panX / context.viewportWidth : 0,
          context.viewportHeight > 0 ? this._panY / context.viewportHeight : 0,
        ],
      },
      primitive: "triangle strip",
      count: 4,
      depth: { enable: false },
      blend: { enable: false },
    });
  }

  destroy(): void {
    this.intensityTex?.destroy();
    this.gradientTex?.destroy();
    this.positionBuf?.destroy();
    this.intensityTex = null;
    this.gradientTex = null;
    this.positionBuf = null;
    this.drawCmd = null;
    this.uint8Cells = null;
    this.regl = null;
  }
}
