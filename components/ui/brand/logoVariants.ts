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

/**
 * Résout les couleurs d'une variante de mark (logique pure, testée).
 * Couleurs via variables de thème → la marque suit le thème actif.
 * (Appliquées en `style` côté SVG, pas en attribut.)
 */
export function resolveMarkColors(v: MarkVariant): MarkColors {
  switch (v) {
    case 'mono':
      return { fill: 'rgb(255 255 255 / 0.02)', edge: 'rgb(255 255 255 / 0.14)', symbol: 'var(--text-primary)', electron: 'var(--text-primary)' };
    case 'stone':
      return { fill: 'rgb(255 255 255 / 0.02)', edge: 'rgb(255 255 255 / 0.16)', symbol: 'var(--stone)', electron: 'var(--stone)' };
    case 'light':
      return { fill: 'rgb(7 8 15 / 0.04)', edge: 'rgb(7 8 15 / 0.18)', symbol: '#0a0c16', electron: 'var(--primary-dark)' };
    case 'default':
    default:
      return { fill: 'url(#szFill)', edge: 'url(#szEdge)', symbol: 'var(--text-primary)', electron: 'var(--primary)' };
  }
}
