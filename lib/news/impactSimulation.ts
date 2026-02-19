import type { ImpactDataPoint, ImpactLevel, DeviationType, SimulationResult, SentimentType } from '@/types/news';

// ---------------------------------------------------------------------------
// Seeded RNG for deterministic chart shapes
// ---------------------------------------------------------------------------

function createRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807 + 0) % 2147483647;
    return (state & 0x7fffffff) / 0x7fffffff;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Impact Chart Generation
// ---------------------------------------------------------------------------

const IMPACT_MULTIPLIER: Record<ImpactLevel, number> = {
  high: 2.5,
  medium: 1.2,
  low: 0.5,
};

/**
 * Generates a realistic price impact chart for a given event.
 * Returns data points from -30min to +120min around the release.
 */
export function generateImpactChart(
  eventName: string,
  deviation: DeviationType,
  impact: ImpactLevel
): ImpactDataPoint[] {
  const seed = hashString(eventName + deviation);
  const rng = createRng(seed);
  const mult = IMPACT_MULTIPLIER[impact];

  // Direction: beat = up, miss = down, inline = flat
  const direction = deviation === 'beat' ? 1 : deviation === 'miss' ? -1 : 0;

  const points: ImpactDataPoint[] = [];

  // Pre-release: -30 to 0 (quiet with slight drift)
  for (let t = -30; t < 0; t += 2) {
    const noise = (rng() - 0.5) * 0.1 * mult;
    const drift = (t / 30) * 0.05 * direction * mult; // slight anticipation
    points.push({
      minutesFromRelease: t,
      priceChange: noise + drift,
      volumeSpike: 0.8 + rng() * 0.4,
    });
  }

  // Release moment: sharp move (t=0 to t=5)
  const initialShock = direction * (0.8 + rng() * 1.5) * mult;
  for (let t = 0; t <= 5; t += 1) {
    const progress = t / 5;
    const overshoot = 1 + (rng() * 0.3); // slight overshoot
    const price = initialShock * progress * overshoot;
    points.push({
      minutesFromRelease: t,
      priceChange: price,
      volumeSpike: 3 + rng() * 4 * mult, // massive volume spike
    });
  }

  // Immediate aftermath: t=6 to t=30 (correction then continuation)
  const peakPrice = initialShock * (1 + rng() * 0.3);
  const correctionDepth = 0.3 + rng() * 0.2; // 30-50% correction
  for (let t = 6; t <= 30; t += 2) {
    const phase = (t - 6) / 24;
    // Pull back then resume
    const correction = peakPrice * (1 - correctionDepth * Math.sin(phase * Math.PI));
    const noise = (rng() - 0.5) * 0.15 * mult;
    points.push({
      minutesFromRelease: t,
      priceChange: correction + noise,
      volumeSpike: 2 + rng() * 2 * mult * (1 - phase * 0.5),
    });
  }

  // Extended: t=30 to t=120 (trend continuation or mean reversion)
  const trendFactor = deviation === 'inline' ? 0 : 0.6 + rng() * 0.3;
  const finalTarget = peakPrice * trendFactor;
  for (let t = 32; t <= 120; t += 4) {
    const phase = (t - 30) / 90;
    const trend = finalTarget + (peakPrice - finalTarget) * Math.exp(-phase * 2);
    const noise = (rng() - 0.5) * 0.2 * mult * (1 - phase * 0.3);
    points.push({
      minutesFromRelease: t,
      priceChange: trend + noise,
      volumeSpike: 1.2 + rng() * 1.5 * (1 - phase * 0.5),
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Interactive Simulation
// ---------------------------------------------------------------------------

// Event format info for parsing actual values (mirrors API route data)
const EVENT_RANGES: Record<string, { range: [number, number]; unit: string }> = {
  'Non-Farm Payrolls': { range: [150, 350], unit: 'K' },
  'FOMC Statement': { range: [4.5, 5.75], unit: '%' },
  'CPI m/m': { range: [-0.2, 0.6], unit: '%' },
  'Core CPI m/m': { range: [0.1, 0.5], unit: '%' },
  'Retail Sales m/m': { range: [-1.0, 1.5], unit: '%' },
  'Unemployment Rate': { range: [3.4, 4.2], unit: '%' },
  'GDP q/q': { range: [-0.5, 3.5], unit: '%' },
  'ISM Manufacturing PMI': { range: [46, 55], unit: '' },
  'Initial Jobless Claims': { range: [190, 260], unit: 'K' },
  'ADP Non-Farm Employment Change': { range: [100, 250], unit: 'K' },
  'Crude Oil Inventories': { range: [-8, 8], unit: 'M' },
  'PPI m/m': { range: [-0.3, 0.6], unit: '%' },
  'CB Consumer Confidence': { range: [95, 115], unit: '' },
  'Existing Home Sales': { range: [3.8, 4.5], unit: 'M' },
  'Durable Goods Orders m/m': { range: [-3, 4], unit: '%' },
  'ECB Interest Rate Decision': { range: [3.5, 4.75], unit: '%' },
  'German CPI m/m': { range: [-0.3, 0.5], unit: '%' },
  'German Unemployment Change': { range: [-15, 20], unit: 'K' },
  'Eurozone CPI y/y': { range: [1.5, 4.0], unit: '%' },
  'German ZEW Economic Sentiment': { range: [-10, 25], unit: '' },
  'Eurozone GDP q/q': { range: [-0.3, 0.8], unit: '%' },
  'French CPI m/m': { range: [-0.2, 0.5], unit: '%' },
  'Italian GDP q/q': { range: [-0.2, 0.5], unit: '%' },
  'BOE Interest Rate Decision': { range: [4.0, 5.5], unit: '%' },
  'CPI y/y': { range: [2.0, 5.0], unit: '%' },
  'GDP m/m': { range: [-0.3, 0.5], unit: '%' },
  'Manufacturing PMI': { range: [46, 54], unit: '' },
  'BOJ Interest Rate Decision': { range: [-0.1, 0.5], unit: '%' },
  'Trade Balance': { range: [-2, 3], unit: 'B' },
  'Tankan Manufacturing Index': { range: [-5, 15], unit: '' },
  'RBA Interest Rate Decision': { range: [3.5, 4.75], unit: '%' },
  'Employment Change': { range: [-20, 50], unit: 'K' },
  'CPI q/q': { range: [0.2, 1.5], unit: '%' },
  'BOC Interest Rate Decision': { range: [3.5, 5.25], unit: '%' },
  'SNB Interest Rate Decision': { range: [1.0, 2.0], unit: '%' },
  'RBNZ Interest Rate Decision': { range: [4.0, 5.75], unit: '%' },
  'Employment Change q/q': { range: [-0.5, 1.5], unit: '%' },
  'Manufacturing PMI (CN)': { range: [48, 52], unit: '' },
};

/**
 * Get the range and unit for a given event, for slider configuration.
 */
export function getEventRange(eventName: string): { min: number; max: number; step: number; unit: string } {
  const info = EVENT_RANGES[eventName];
  if (!info) return { min: -5, max: 5, step: 0.1, unit: '%' };

  const [min, max] = info.range;
  const span = max - min;
  const step = span > 100 ? 5 : span > 10 ? 0.5 : 0.05;

  return { min, max, step, unit: info.unit };
}

/**
 * Simulate market impact given a hypothetical actual value vs forecast.
 */
export function simulateImpact(
  eventName: string,
  actualValue: number,
  forecastValue: number,
  impact: ImpactLevel
): SimulationResult {
  const info = EVENT_RANGES[eventName];
  const span = info ? info.range[1] - info.range[0] : 10;
  const threshold = span * 0.05;

  const diff = actualValue - forecastValue;
  const deviation: DeviationType =
    diff > threshold ? 'beat' : diff < -threshold ? 'miss' : 'inline';

  const impactMult = IMPACT_MULTIPLIER[impact];
  const direction = deviation === 'beat' ? 1 : deviation === 'miss' ? -1 : 0;

  // Normalized deviation strength (0 to 1)
  const strength = Math.min(Math.abs(diff) / (span * 0.3), 1);

  const priceChange = direction * strength * 2.5 * impactMult;
  const volumeMultiplier = 1.2 + strength * 3 * (impactMult / 2);
  const volatilityChange = 3 + strength * 15 * (impactMult / 3);

  const sentiment: SentimentType =
    deviation === 'beat' ? 'bullish' : deviation === 'miss' ? 'bearish' : 'neutral';

  const chartData = generateImpactChart(eventName, deviation, impact);

  // Scale chart data by strength
  const scaledChart = chartData.map(p => ({
    ...p,
    priceChange: p.priceChange * strength,
    volumeSpike: 1 + (p.volumeSpike - 1) * strength,
  }));

  return {
    deviation,
    priceChange,
    volumeMultiplier: parseFloat(volumeMultiplier.toFixed(1)),
    volatilityChange: parseFloat(volatilityChange.toFixed(1)),
    sentiment,
    chartData: scaledChart,
  };
}
