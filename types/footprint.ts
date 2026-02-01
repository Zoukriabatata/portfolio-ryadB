// Advanced Footprint Types

export type ImbalanceDirection = 'bullish' | 'bearish' | 'neutral';

// Contenu du cluster (quoi afficher)
export type ClusterContent = 'bidXAsk';  // Bid x Ask uniquement

// Mode d'affichage - Delta Profile uniquement (bid gauche, ask droite)
export type ClusterDisplayMode = 'deltaProfile';

// Legacy type for compatibility
export type FootprintType = 'bidxask' | 'delta' | 'volumeProfile' | 'bidAskDelta' | 'bidAskProfile';

// Configuration visuelle du footprint
export interface FootprintStyleConfig {
  // Arrière-plan
  background: string;
  backgroundOpacity: number;

  // Bordure du footprint (conteneur)
  footprintBorderColor: string;
  footprintBorderWidth: number;
  footprintBorderRadius: number;
  footprintBorderOpacity: number;

  // Bougie
  candleBodyWidth: number;       // Épaisseur du corps de la bougie
  candleWickWidth: number;       // Épaisseur de la mèche
  candleBorderWidth: number;     // Bordure de la bougie
  candleBorderColor: string;     // Couleur bordure + mèche ('auto' = même que bougie)
  candleBullishColor: string;
  candleBearishColor: string;
  candleBodyOpacity: number;

  // Volume footprint
  volumeBidColor: string;
  volumeAskColor: string;
  volumeBarOpacity: number;

  // Texte des valeurs
  priceTextColor: string;
  volumeTextColor: string;
  bidTextColor: string;
  askTextColor: string;
  pocTextColor: string;

  // Imbalances
  imbalanceBuyColor: string;
  imbalanceSellColor: string;
  imbalanceOpacity: number;

  // POC
  pocBackgroundColor: string;
  pocBorderColor: string;
  pocOpacity: number;

  // Grille
  gridColor: string;
  gridOpacity: number;
}

export const DEFAULT_STYLE_CONFIG: FootprintStyleConfig = {
  // Arrière-plan
  background: '#0a0a0a',
  backgroundOpacity: 1,

  // Bordure du footprint
  footprintBorderColor: '#333333',
  footprintBorderWidth: 1,
  footprintBorderRadius: 0,
  footprintBorderOpacity: 0.5,

  // Bougie (ATAS style: pas de bougie visible, juste footprint)
  candleBodyWidth: 4,
  candleWickWidth: 2,
  candleBorderWidth: 1,
  candleBorderColor: 'auto',      // 'auto' = même couleur que la bougie (bordure + mèche)
  candleBullishColor: '#00d4aa',  // Cyan-vert ATAS
  candleBearishColor: '#ff4466',  // Rouge-rose ATAS
  candleBodyOpacity: 0.08,

  // Volume footprint (ATAS style: rouge/cyan)
  volumeBidColor: '#ff4466',      // Rouge-rose pour bid/sell
  volumeAskColor: '#00d4aa',      // Cyan pour ask/buy
  volumeBarOpacity: 0.7,

  // Texte des valeurs (ATAS style)
  priceTextColor: '#ffffff',
  volumeTextColor: '#666666',
  bidTextColor: '#ff6688',        // Rouge clair pour bid
  askTextColor: '#00ddbb',        // Cyan pour ask
  pocTextColor: '#ffaa00',

  // Imbalances (ATAS style: fond coloré intense)
  imbalanceBuyColor: '#00ffaa',
  imbalanceSellColor: '#ff4466',
  imbalanceOpacity: 0.6,

  // POC
  pocBackgroundColor: '#444444',
  pocBorderColor: '#666666',
  pocOpacity: 0.3,

  // Grille
  gridColor: '#1a1a1a',
  gridOpacity: 1,
};

export interface ImbalanceCell {
  price: number;
  ratio: number;           // bid/ask or ask/bid ratio
  direction: ImbalanceDirection;
  isStrong: boolean;       // ratio >= threshold (e.g., 3x)
}

export interface StackedImbalance {
  startPrice: number;
  endPrice: number;
  direction: 'bullish' | 'bearish';
  count: number;           // Number of consecutive imbalances
  candleTime: number;
}

export interface AbsorptionEvent {
  price: number;
  volume: number;
  side: 'bid' | 'ask';
  priceChange: number;     // How much price moved after absorption
  timestamp: number;
}

export interface NakedPOC {
  price: number;
  candleTime: number;
  volume: number;
  tested: boolean;         // Has price revisited this level?
}

export interface VolumeCluster {
  priceStart: number;
  priceEnd: number;
  totalVolume: number;
  isHighVolume: boolean;   // > 2 std dev from mean
}

export interface PressureGradient {
  price: number;
  aggressiveBuyVolume: number;    // Lifted asks (taker buys)
  aggressiveSellVolume: number;   // Hit bids (taker sells)
  intensity: number;              // 0-1 normalized pressure
}

export interface FootprintSettings {
  // Type de footprint (legacy)
  footprintType: FootprintType;

  // Cluster settings (ATAS style)
  clusterContent: ClusterContent;
  clusterDisplayMode: ClusterDisplayMode;

  // Imbalance settings
  imbalanceRatio: number;          // 3.0 = 3x ratio for imbalance
  stackedMinLevels: number;        // 3 = minimum 3 consecutive
  absorptionVolumeThreshold: number;
  absorptionPriceThreshold: number; // Max price movement for absorption

  // Display toggles
  showCumulativeDelta: boolean;
  showNakedPOC: boolean;
  showAbsorption: boolean;
  showStackedImbalances: boolean;
  highlightVolumeClusters: boolean;
  showImbalances: boolean;
  showCandle: boolean;
  showVolumeBars: boolean;
  showPOC: boolean;
  showGrid: boolean;

  // Style configuration
  styleConfig: FootprintStyleConfig;
}

export const DEFAULT_FOOTPRINT_SETTINGS: FootprintSettings = {
  // Type de footprint (legacy)
  footprintType: 'bidxask',

  // Cluster settings (ATAS style)
  clusterContent: 'bidXAsk',
  clusterDisplayMode: 'deltaProfile',

  // Imbalance settings
  imbalanceRatio: 3.0,
  stackedMinLevels: 3,
  absorptionVolumeThreshold: 100,
  absorptionPriceThreshold: 0.1,

  // Display toggles
  showCumulativeDelta: true,
  showNakedPOC: true,
  showAbsorption: true,
  showStackedImbalances: true,
  highlightVolumeClusters: true,
  showImbalances: true,
  showCandle: true,
  showVolumeBars: true,
  showPOC: true,
  showGrid: true,

  // Style configuration
  styleConfig: { ...DEFAULT_STYLE_CONFIG },
};
