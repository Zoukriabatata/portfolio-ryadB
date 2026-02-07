/**
 * CME CONTRACT SPECIFICATIONS
 *
 * Source officielle: CME Group Contract Specifications
 * Ces valeurs sont CRITIQUES pour un footprint précis
 */

export interface CMEContractSpec {
  symbol: string;
  name: string;
  exchange: 'CME' | 'COMEX' | 'NYMEX';

  // Tick specifications
  tickSize: number;           // Minimum price increment (points)
  tickValue: number;          // Dollar value per tick ($)
  pointValue: number;         // Dollar value per full point ($)

  // Contract size
  multiplier: number;         // Contract multiplier

  // Volume normalization (for micro/mini comparison)
  volumeMultiplier: number;   // 1 for full-size, 10 for micro (vs mini)

  // Footprint recommended settings
  footprintTickAggregation: number;  // Ticks to aggregate (1 = each tick)
  minVolumeFilter: number;           // Minimum volume to display
  imbalanceRatio: number;            // Recommended imbalance ratio
  significantDelta: number;          // Delta considered significant

  // Session times (CT - Central Time)
  regularSessionStart: string;  // "08:30"
  regularSessionEnd: string;    // "15:00"

  // Price formatting
  priceDecimals: number;
  priceFormat: (price: number) => string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// E-MINI NASDAQ 100 (NQ)
// ═══════════════════════════════════════════════════════════════════════════════
export const NQ_SPEC: CMEContractSpec = {
  symbol: 'NQ',
  name: 'E-mini Nasdaq 100',
  exchange: 'CME',

  // 1 tick = 0.25 points = $5.00
  tickSize: 0.25,
  tickValue: 5.00,
  pointValue: 20.00,  // $20 per point (4 ticks)

  multiplier: 20,
  volumeMultiplier: 1,  // Reference for MNQ

  // Footprint settings
  footprintTickAggregation: 1,  // Show each 0.25 tick
  minVolumeFilter: 10,          // Min 10 contracts to show
  imbalanceRatio: 3.0,          // 300% = imbalance
  significantDelta: 50,         // 50+ contracts = significant

  regularSessionStart: '08:30',
  regularSessionEnd: '15:00',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO E-MINI NASDAQ 100 (MNQ)
// ═══════════════════════════════════════════════════════════════════════════════
export const MNQ_SPEC: CMEContractSpec = {
  symbol: 'MNQ',
  name: 'Micro E-mini Nasdaq 100',
  exchange: 'CME',

  // 1 tick = 0.25 points = $0.50 (1/10 of NQ)
  tickSize: 0.25,
  tickValue: 0.50,
  pointValue: 2.00,  // $2 per point

  multiplier: 2,
  volumeMultiplier: 10,  // 10 MNQ = 1 NQ equivalent

  // Footprint settings (adjusted for micro liquidity)
  footprintTickAggregation: 1,
  minVolumeFilter: 50,          // Higher threshold due to micro size
  imbalanceRatio: 3.0,
  significantDelta: 200,        // Need more contracts for significance

  regularSessionStart: '08:30',
  regularSessionEnd: '15:00',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// E-MINI S&P 500 (ES)
// ═══════════════════════════════════════════════════════════════════════════════
export const ES_SPEC: CMEContractSpec = {
  symbol: 'ES',
  name: 'E-mini S&P 500',
  exchange: 'CME',

  // 1 tick = 0.25 points = $12.50
  tickSize: 0.25,
  tickValue: 12.50,
  pointValue: 50.00,  // $50 per point

  multiplier: 50,
  volumeMultiplier: 1,

  // Footprint settings
  footprintTickAggregation: 1,
  minVolumeFilter: 20,
  imbalanceRatio: 3.0,
  significantDelta: 100,

  regularSessionStart: '08:30',
  regularSessionEnd: '15:00',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO E-MINI S&P 500 (MES)
// ═══════════════════════════════════════════════════════════════════════════════
export const MES_SPEC: CMEContractSpec = {
  symbol: 'MES',
  name: 'Micro E-mini S&P 500',
  exchange: 'CME',

  // 1 tick = 0.25 points = $1.25 (1/10 of ES)
  tickSize: 0.25,
  tickValue: 1.25,
  pointValue: 5.00,

  multiplier: 5,
  volumeMultiplier: 10,

  // Footprint settings
  footprintTickAggregation: 1,
  minVolumeFilter: 100,
  imbalanceRatio: 3.0,
  significantDelta: 500,

  regularSessionStart: '08:30',
  regularSessionEnd: '15:00',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOLD FUTURES (GC)
// ═══════════════════════════════════════════════════════════════════════════════
export const GC_SPEC: CMEContractSpec = {
  symbol: 'GC',
  name: 'Gold Futures',
  exchange: 'COMEX',

  // 1 tick = $0.10 = $10.00 (100 oz contract)
  tickSize: 0.10,
  tickValue: 10.00,
  pointValue: 100.00,  // $100 per $1 move

  multiplier: 100,  // 100 troy ounces
  volumeMultiplier: 1,

  // Footprint settings
  footprintTickAggregation: 1,
  minVolumeFilter: 5,
  imbalanceRatio: 3.0,
  significantDelta: 30,

  regularSessionStart: '08:20',
  regularSessionEnd: '13:30',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// MICRO GOLD FUTURES (MGC)
// ═══════════════════════════════════════════════════════════════════════════════
export const MGC_SPEC: CMEContractSpec = {
  symbol: 'MGC',
  name: 'Micro Gold Futures',
  exchange: 'COMEX',

  // 1 tick = $0.10 = $1.00 (10 oz contract, 1/10 of GC)
  tickSize: 0.10,
  tickValue: 1.00,
  pointValue: 10.00,

  multiplier: 10,  // 10 troy ounces
  volumeMultiplier: 10,

  // Footprint settings
  footprintTickAggregation: 1,
  minVolumeFilter: 20,
  imbalanceRatio: 3.0,
  significantDelta: 100,

  regularSessionStart: '08:20',
  regularSessionEnd: '13:30',

  priceDecimals: 2,
  priceFormat: (p) => p.toFixed(2),
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const CME_CONTRACTS: Record<string, CMEContractSpec> = {
  NQ: NQ_SPEC,
  MNQ: MNQ_SPEC,
  ES: ES_SPEC,
  MES: MES_SPEC,
  GC: GC_SPEC,
  MGC: MGC_SPEC,
};

export function getContractSpec(symbol: string): CMEContractSpec {
  const spec = CME_CONTRACTS[symbol.toUpperCase()];
  if (!spec) {
    throw new Error(`Unknown CME contract: ${symbol}`);
  }
  return spec;
}

/**
 * Normalize volume between micro and mini contracts
 * Converts micro volume to mini-equivalent
 */
export function normalizeVolume(symbol: string, volume: number): number {
  const spec = getContractSpec(symbol);
  return volume / spec.volumeMultiplier;
}

/**
 * Align price to exact tick
 * CRITICAL: All prices MUST be aligned to tick grid
 */
export function alignToTick(symbol: string, price: number): number {
  const spec = getContractSpec(symbol);
  return Math.round(price / spec.tickSize) * spec.tickSize;
}

/**
 * Calculate price levels between two prices
 */
export function getPriceLevels(symbol: string, lowPrice: number, highPrice: number): number[] {
  const spec = getContractSpec(symbol);
  const alignedLow = alignToTick(symbol, lowPrice);
  const alignedHigh = alignToTick(symbol, highPrice);

  const levels: number[] = [];
  for (let price = alignedLow; price <= alignedHigh; price += spec.tickSize) {
    // Round to avoid floating point errors
    levels.push(Math.round(price * 100) / 100);
  }

  return levels;
}
