// REFONTE-7/P3 — système de coordonnées partagé.
//
// Une seule source de vérité pour la projection price/time → pixel canvas et
// inverse. Implémenté par HeatmapEngine, consommé par toutes les couches
// overlay canvas2d (BestBidAskLayer, KeyLevelsLayer, AxesLayer, ...) ET les
// couches regl via uniforms uPan (LiquidityHeatmapLayer, TradeBubblesLayer).
//
// Coords retournées en DRAWING BUFFER pixels (pas CSS px). DPR appliqué côté
// canvas size, transparent ici.
//
// Pan/scale model — Option C (cf. trade-off P3) :
//  - panX, panY : translation visuelle non-destructive (modifiée par drag).
//  - scaleX/scaleY = 1 toujours. Le zoom est destructif via setViewport
//    (modifie priceMin/priceMax/timeMin/timeMax). Pas de scale matrice.
//
// Soft-cap niveau 2 (hors-buffer Bybit) : la projection ne clippe rien — un
// prix/time hors viewport peut retourner des coords hors-canvas. C'est
// l'OutOfBufferLayer qui dessine le fond gris + label "No data" sur la zone
// concernée. Les helpers sont purs et déterministes.

export interface RenderTransform {
  // Drawing buffer dimensions (canvas.width / canvas.height en pixels device).
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  // Marge réservée à l'AxesLayer (P3). Largeur du bandeau Y droite + hauteur
  // du bandeau X bas. Couches qui dessinent dans la zone heatmap doivent
  // soustraire ces marges pour ne pas déborder sous les axes opaques.
  readonly axisYWidthPx: number;
  readonly axisXHeightPx: number;

  // Translation matricielle courante (drawing buffer pixels). Pan UI uniquement.
  readonly panX: number;
  readonly panY: number;

  priceToY(price: number): number;
  yToPrice(y: number): number;
  timeToX(time: number): number;
  xToTime(x: number): number;
}
