export type MarkVariant = 'default' | 'mono' | 'stone' | 'light';

export interface MarkColors {
  /** remplissage du jeton */
  fill: string;
  /** bord du jeton */
  edge: string;
  /** "Sz" + "79" */
  symbol: string;
  /** électron + accents */
  electron: string;
}

/** Résout les couleurs d'une variante de mark (logique pure, testée). */
export function resolveMarkColors(v: MarkVariant): MarkColors {
  switch (v) {
    case 'mono':
      return { fill: 'rgba(255,255,255,.02)', edge: 'rgba(255,255,255,.14)', symbol: '#e8eaf6', electron: '#e8eaf6' };
    case 'stone':
      return { fill: 'rgba(255,255,255,.02)', edge: 'rgba(255,255,255,.16)', symbol: '#cfd2df', electron: '#cfd2df' };
    case 'light':
      return { fill: 'rgba(7,8,15,.04)', edge: 'rgba(7,8,15,.18)', symbol: '#0a0c16', electron: '#22c55e' };
    case 'default':
    default:
      return { fill: 'url(#szFill)', edge: 'url(#szEdge)', symbol: '#e8eaf6', electron: '#4ade80' };
  }
}
