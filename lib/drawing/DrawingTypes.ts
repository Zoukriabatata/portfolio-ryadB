/**
 * TYPES POUR LE SYSTÈME DE DESSIN
 */

// Types d'outils disponibles
export type DrawingToolType =
  | 'cursor'
  | 'trendline'
  | 'horizontalLine'
  | 'verticalLine'
  | 'ray'
  | 'rectangle'
  | 'fibonacci'
  | 'text';

// Style d'un dessin
export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
}

// Point géométrique
export interface DrawingPoint {
  time: number;   // Unix timestamp (secondes)
  price: number;
}

// Dessin complet
export interface Drawing {
  id: string;
  type: DrawingToolType;
  points: DrawingPoint[];
  style: DrawingStyle;
  text?: string;           // Pour les annotations texte
  visible: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

// État du mode dessin
export interface DrawingMode {
  active: boolean;
  tool: DrawingToolType;
  inProgress: Drawing | null;
}

// Niveaux Fibonacci par défaut
export const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// Couleurs prédéfinies
export const DRAWING_COLORS = [
  '#ef4444', // Rouge
  '#f97316', // Orange
  '#eab308', // Jaune
  '#22c55e', // Vert
  '#06b6d4', // Cyan
  '#3b82f6', // Bleu
  '#8b5cf6', // Violet
  '#ec4899', // Rose
  '#ffffff', // Blanc
  '#6b7280', // Gris
];

// Style par défaut
export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#3b82f6',
  lineWidth: 2,
  lineStyle: 'solid',
  fillOpacity: 0.1,
};

// Génère un ID unique
export function generateDrawingId(): string {
  return `drawing_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
