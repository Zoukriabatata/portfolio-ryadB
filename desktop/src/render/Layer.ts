import type Regl from "regl";
import type { GridSystem } from "../core";

// Contrat unifié : chaque couche du moteur respecte ce cycle de vie.
// Générique sur TData : chaque couche a son type de payload.
//
// `dirty` est écrit UNIQUEMENT par l'engine (true → demande update,
// false → reset après update). Les couches ne touchent jamais leur
// propre flag, ne le lisent jamais (cf. contrat utilisateur REFONTE-3).
export interface Layer<TData = unknown> {
  dirty: boolean;
  // overlayCtx : optionnel, fourni par l'engine si un canvas 2D overlay est
  // passé via spec.overlayCanvas. Couches regl pures (Liquidity, TradeBubbles)
  // l'ignorent. Couches canvas2d (KeyLevels) le requièrent (throw si undefined).
  init(
    regl: Regl.Regl,
    grid: GridSystem,
    overlayCtx?: CanvasRenderingContext2D,
  ): void;
  update(grid: GridSystem, data: TData): void;
  // draw() : appelée à chaque frame (60 fps). Pour les couches qui écrivent
  // sur l'overlayCtx (canvas 2D), NE PAS appeler clearRect : l'engine
  // clear l'overlay une fois par frame avant les draws (REFONTE-4c).
  // Couche overlay = "write only". Pour les couches regl, comportement
  // inchangé (regl.clear est aussi appelé par l'engine).
  draw(): void;
  destroy(): void;
  // Optionnelle : appelée par l'engine quand le viewport change. La couche
  // réajuste ses buffers/textures si dimensions changent, no-op sinon
  // (idempotente). Couches qui n'ont rien à faire l'omettent.
  onViewportChange?(grid: GridSystem): void;
}
