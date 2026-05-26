import type Regl from "regl";
import type { GridSystem } from "../core";
import type { Layer } from "./Layer";
import type { PannableLayer } from "./HeatmapEngine";
import type { LiquidityFrame } from "./LiquidityFrame";
import type { RenderTransform } from "./RenderTransform";
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

// REFONTE-7/P3.5 Fix 2 — sample partial selon displayViewport ⊂ dataViewport.
// La texture data couvre dataViewport (× 1.6 plus large que display). Le
// shader sample uniquement la portion correspondant au display + pan.
// Permet pan/zoom léger sans re-bin = sans smear.
//
// Uniforms :
//  - uPanUV = (panX/canvasW, panY/canvasH) : pan visuel non-destructif.
//  - uDisplayMinUV = (timeMin_uv, priceMin_uv) du display dans la texture data.
//  - uDisplayRangeUV = (timeRange_uv, priceRange_uv) du display dans data.
//
// Le shader :
//  1. Calcule worldUV_display ∈ [0,1] = position dans la zone visible (post-pan).
//  2. Map vers UV texture data : sampleUV = displayMinUV + worldUV * displayRangeUV.
//  3. Si sampleUV hors [0,1] de la texture data → fond #0a0a0a (hors-buffer).
//  4. .yx swap pour matcher la layout texture (screen.x = time, screen.y = price).
const FRAG_SRC = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uIntensity;
uniform sampler2D uGradient;
uniform vec2 uPanUV;
uniform vec2 uDisplayMinUV;
uniform vec2 uDisplayRangeUV;
void main() {
  // worldUV ∈ [0,1] = position dans la zone display (post-pan).
  vec2 worldUV = vec2(vUV.x - uPanUV.x, vUV.y + uPanUV.y);
  // Map vers UV texture data.
  vec2 sampleUV = uDisplayMinUV + worldUV * uDisplayRangeUV;
  if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
    gl_FragColor = vec4(0.039, 0.039, 0.039, 1.0); // #0A0A0A
    return;
  }
  // .yx swap : screen.x → texture.y (row = bucket temps),
  //            screen.y → texture.x (col = price level).
  float i = texture2D(uIntensity, sampleUV.yx).r;
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
  // REFONTE-7/P3.5 Fix 2 : transform pour calculer displayMinUV/displayRangeUV
  // dans les uniforms du shader (sample partial selon display ⊂ data).
  private transform: RenderTransform | null = null;

  init(
    regl: Regl.Regl,
    grid: GridSystem,
    _overlayCtx?: CanvasRenderingContext2D,
    transform?: RenderTransform,
  ): void {
    this.regl = regl;
    this.transform = transform ?? null;
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
    // REFONTE-7/P3.5 Fix 2 : uDisplayMinUV/uDisplayRangeUV via closure pour
    // sample partial.
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
        uDisplayMinUV: () => this.computeDisplayMinUV(),
        uDisplayRangeUV: () => this.computeDisplayRangeUV(),
      },
      primitive: "triangle strip",
      count: 4,
      depth: { enable: false },
      blend: { enable: false },
    });
  }

  // REFONTE-7/P3.5 Fix 2 — calcul UV display dans la texture data.
  // Layout texture : .yx swap (screen.x = time = texture.y ; screen.y = price
  // = texture.x). Donc UV vec : (.x = time UV, .y = price UV).
  private computeDisplayMinUV(): [number, number] {
    if (!this.transform) return [0, 0];
    const tr = this.transform;
    const dataPriceRange = tr.getDataPriceMax() - tr.getDataPriceMin();
    const dataTimeRange = tr.getDataTimeMax() - tr.getDataTimeMin();
    if (dataPriceRange <= 0 || dataTimeRange <= 0) return [0, 0];
    return [
      (tr.getDisplayTimeMin() - tr.getDataTimeMin()) / dataTimeRange,
      (tr.getDisplayPriceMin() - tr.getDataPriceMin()) / dataPriceRange,
    ];
  }
  private computeDisplayRangeUV(): [number, number] {
    if (!this.transform) return [1, 1];
    const tr = this.transform;
    const dataPriceRange = tr.getDataPriceMax() - tr.getDataPriceMin();
    const dataTimeRange = tr.getDataTimeMax() - tr.getDataTimeMin();
    if (dataPriceRange <= 0 || dataTimeRange <= 0) return [1, 1];
    const dispPriceRange = tr.getDisplayPriceMax() - tr.getDisplayPriceMin();
    const dispTimeRange = tr.getDisplayTimeMax() - tr.getDisplayTimeMin();
    return [dispTimeRange / dataTimeRange, dispPriceRange / dataPriceRange];
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
        uDisplayMinUV: () => this.computeDisplayMinUV(),
        uDisplayRangeUV: () => this.computeDisplayRangeUV(),
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
