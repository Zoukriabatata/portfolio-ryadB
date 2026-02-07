/**
 * LIQUIDITY HEATMAP PRO - TYPES
 *
 * Types locaux pour le composant LiquidityHeatmapPro
 */

export interface Point {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface MouseState {
  position: Point | null;
  isOverPriceAxis: boolean;
  isOverCanvas: boolean;
  isDragging: boolean;
  dragType: 'zoom' | 'pan' | null;
}

export interface ContextMenuState {
  isOpen: boolean;
  position: Point;
  priceAtCursor: number | null;
}

export interface HeatmapLayout {
  // Zone principale de la heatmap
  heatmapArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Échelle des prix (à droite)
  priceLadder: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Timeline (au-dessus de la stats bar)
  timeline?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Barre de stats (en bas)
  statsBar: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Zone DOM (à gauche, optionnel)
  domArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface RenderConfig {
  // Device pixel ratio
  dpr: number;
  // Taille du tick
  tickSize: number;
  // Largeur d'une colonne de temps
  columnWidth: number;
  // Hauteur d'une cellule de prix
  cellHeight: number;
  // Couleur de fond
  backgroundColor: string;
  // Couleur de la grille
  gridColor: string;
  // Police
  fontFamily: string;
  fontSize: number;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  tickSize: 0.25,
  columnWidth: 5,
  cellHeight: 4,
  backgroundColor: '#06080d',
  gridColor: 'rgba(255, 255, 255, 0.05)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
};

export interface OrderbookLevel {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
}

export interface OrderbookSnapshot {
  timestamp: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
}
