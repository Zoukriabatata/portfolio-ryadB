// ---------------------------------------------------------------------------
// Economic Calendar — Shared Types
// ---------------------------------------------------------------------------

export interface MarketImpact {
  priceChange: string;
  volumeMultiplier: number;
  volatilityChange: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  event: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  marketImpact?: MarketImpact;
  deviation?: 'beat' | 'miss' | 'inline';
}

export type TimeFilter = 'all' | 'today' | 'tomorrow' | 'week';
export type ImpactLevel = 'high' | 'medium' | 'low';
export type DeviationType = 'beat' | 'miss' | 'inline';
export type SentimentType = 'bullish' | 'bearish' | 'neutral';

export interface CalendarFilters {
  currency: string;
  impact: string;
  time: TimeFilter;
}

// ---------------------------------------------------------------------------
// Event Detail — Knowledge base types
// ---------------------------------------------------------------------------

export interface RiskScenario {
  condition: string;
  explanation: string;
  severity: ImpactLevel;
}

export interface EventDetail {
  description: string;
  whyItMatters: string;
  affectedPairs: string[];
  typicalReaction: {
    beat: string;
    miss: string;
    inline: string;
  };
  frequency: string;
  releaseTime: string;
  source: string;
  importance: string;
  riskScenarios: {
    bearish: RiskScenario;
    bullish: RiskScenario;
  };
  keyLevelToWatch: string;
}

// ---------------------------------------------------------------------------
// Impact Chart
// ---------------------------------------------------------------------------

export interface ImpactDataPoint {
  minutesFromRelease: number;
  priceChange: number;
  volumeSpike: number;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export interface SimulationResult {
  deviation: DeviationType;
  priceChange: number;
  volumeMultiplier: number;
  volatilityChange: number;
  sentiment: SentimentType;
  chartData: ImpactDataPoint[];
}

// ---------------------------------------------------------------------------
// News Themes
// ---------------------------------------------------------------------------

export type NewsThemeId = 'senzoukria' | 'atas' | 'bookmap' | 'sierra' | 'highcontrast';

export interface NewsThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  border: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDimmed: string;
  primary: string;
  primaryGlow: string;
  accent: string;
  high: string;
  medium: string;
  low: string;
  bull: string;
  bullBg: string;
  bear: string;
  bearBg: string;
  warning: string;
  warningBg: string;
  glassBg: string;
  glassBorder: string;
}

export interface NewsThemeConfig {
  id: NewsThemeId;
  name: string;
  label: string;
  preview: [string, string, string]; // 3 preview colors for the selector
  colors: NewsThemeColors;
}
