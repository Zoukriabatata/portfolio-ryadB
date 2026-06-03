/**
 * lib/ai/colors.ts
 *
 * Source unique des couleurs de la suite IA, tokenisées sur le design system
 * (voir les variables CSS dans app/globals.css). Ne PAS redéfinir ces maps
 * localement dans les composants — importer d'ici.
 *
 * Convention couleurs :
 *   --bull       vert haussier        (#26d97f)
 *   --bear       rouge baissier       (#f04f4f)
 *   --warning    orange risque/flip   (#e8a020)
 *   --accent     teal secondaire      (#2dd4bf)
 *   --primary    lime marque          (#4ade80)
 *   --text-muted gris neutre          (#515878)
 *
 * Le texte posé sur un fond `--primary` utilise `#06140b` (convention site).
 */

export const ON_PRIMARY = '#06140b';

const BULL    = 'var(--bull)';
const BEAR    = 'var(--bear)';
const WARNING = 'var(--warning)';
const ACCENT  = 'var(--accent)';
const NEUTRAL = 'var(--text-muted)';

// RGB bruts des tokens — pour les fonds/bordures à opacité variable.
const BULL_RGB    = '38,217,127';
const BEAR_RGB    = '240,79,79';
const WARNING_RGB = '232,160,32';
const ACCENT_RGB  = '45,212,191';

export type Bias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface BiasStyle {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
  glow:   string;
  icon:   string; // glyphe (utilisé par AIAgentsPage ; LiveAgentPanel garde ses icônes lucide)
}

export const BIAS_CFG: Record<Bias, BiasStyle> = {
  LONG: {
    label: 'LONG', color: BULL, icon: '↑',
    bg: `rgba(${BULL_RGB},0.08)`, border: `rgba(${BULL_RGB},0.30)`, glow: `rgba(${BULL_RGB},0.15)`,
  },
  SHORT: {
    label: 'SHORT', color: BEAR, icon: '↓',
    bg: `rgba(${BEAR_RGB},0.08)`, border: `rgba(${BEAR_RGB},0.30)`, glow: `rgba(${BEAR_RGB},0.15)`,
  },
  NEUTRAL: {
    label: 'NEUTRAL', color: WARNING, icon: '→',
    bg: `rgba(${WARNING_RGB},0.08)`, border: `rgba(${WARNING_RGB},0.30)`, glow: `rgba(${WARNING_RGB},0.15)`,
  },
};

/** Couleur sémantique d'un régime de marché. Défaut : neutre. */
export const REGIME_COLOR: Record<string, string> = {
  // Haussier
  LONG_GAMMA:             BULL,
  BULLISH:                BULL,
  STABLE:                 BULL,
  HIGH_PROBABILITY_TREND: BULL,
  // Baissier
  SHORT_GAMMA:            BEAR,
  BEARISH:                BEAR,
  TRAPPED_SHORT:          BEAR,
  TRAPPED_LONG:           BEAR,
  GAMMA_SQUEEZE:          BEAR,
  DISTRIBUTION:           BEAR,
  // Risque / transition
  NEAR_FLIP:              WARNING,
  TRANSITION:             WARNING,
  BREAKOUT_WATCH:         WARNING,
  BREAKOUT_ZONE:          WARNING,
  EVENT_RISK:             WARNING,
  // Secondaire (volatilité / range)
  EXPANSION:              ACCENT,
  COMPRESSION:            ACCENT,
  VOLATILE_TREND:         ACCENT,
  RANGE_MARKET:           ACCENT,
  // Neutre
  NEUTRAL:                NEUTRAL,
  CALM:                   NEUTRAL,
  AMBIGUOUS:              NEUTRAL,
};

export const regimeColor = (v: string | undefined | null): string =>
  (v && REGIME_COLOR[v]) || NEUTRAL;

/** Sévérité d'un événement du feed. */
export const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   BEAR,
  MEDIUM: WARNING,
  LOW:    NEUTRAL,
};

/** État de connexion de l'agent live. */
export const STATUS_COLOR: Record<string, string> = {
  live:         BULL,
  connecting:   WARNING,
  reconnecting: WARNING,
  offline:      BEAR,
};

/** Style du badge de mode (feed / agent). */
export const MODE_STYLE: Record<string, { bg: string; color: string }> = {
  SIGNAL: { bg: `rgba(${BEAR_RGB},0.12)`,   color: BEAR   },
  UPDATE: { bg: `rgba(${ACCENT_RGB},0.12)`, color: ACCENT },
};

/** Couleurs des niveaux clés. */
export const LEVEL_COLOR = {
  support:    BULL,
  resistance: BEAR,
  flip:       WARNING,
} as const;

/** Couleurs des lignes d'un setup (entrée / objectif / invalidation). */
export const SETUP_COLOR = {
  entry:        ACCENT,
  target:       BULL,
  invalidation: BEAR,
} as const;

// Réexports pratiques pour les usages directs (accent/warning ponctuels).
export { ACCENT as AI_ACCENT, WARNING as AI_WARNING, NEUTRAL as AI_NEUTRAL, BULL as AI_BULL, BEAR as AI_BEAR };
