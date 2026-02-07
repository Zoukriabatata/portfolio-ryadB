/**
 * PASSIVE LIQUIDITY TYPES
 *
 * Data structures for trade-reactive passive order simulation.
 * These types enable coherent passive volume behavior where:
 * - Orders have initial and remaining volume
 * - Trades cause absorption (volume decreases)
 * - Status tracks lifecycle (active → absorbing → executed/spoofed)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Status of a passive order level */
export type PassiveOrderStatus = 'active' | 'absorbing' | 'executed' | 'spoofed';

/** Side of the passive order */
export type PassiveOrderSide = 'bid' | 'ask';

// ═══════════════════════════════════════════════════════════════════════════════
// CORE DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A passive order level at a specific price
 *
 * This represents a "resting order" in the order book.
 * When price interacts with this level, volume is absorbed.
 */
export interface PassiveOrderLevel {
  // ─── Core Identity ───
  price: number;
  side: PassiveOrderSide;

  // ─── Volume Tracking ───
  initialVolume: number;      // Volume when order was placed
  remainingVolume: number;    // Current remaining volume
  absorbedVolume: number;     // Total volume absorbed by trades

  // ─── Timestamps ───
  timestampCreated: number;   // When this level was generated
  lastInteraction: number;    // Last trade interaction time
  lastUpdate: number;         // Last update (any kind)

  // ─── Status Management ───
  status: PassiveOrderStatus;
  absorptionRate: number;     // Current absorption speed (contracts/sec)

  // ─── Visual Properties ───
  opacity: number;            // Current display opacity (0-1)
  displayWidth: number;       // Current bar width factor (0-1), shrinks during absorption

  // ─── Stability Tracking ───
  consecutiveSnapshots: number;  // How many snapshots this level has existed
  isPersistent: boolean;         // Has met stability threshold

  // ─── Iceberg Order ───
  isIceberg: boolean;            // Is this an iceberg order?
  hiddenVolume: number;          // Volume hidden behind the visible portion
  visiblePortion: number;        // Size of each visible "slice"
  refillCount: number;           // How many times this iceberg has refilled
  totalIcebergVolume: number;    // Total iceberg volume (visible + hidden)
}

/**
 * Trade event for absorption processing
 *
 * Maps directly from BinanceLiveWS tick data.
 * isBuyerMaker determines which side absorbs:
 * - true = SELL aggressor → hits BID passive
 * - false = BUY aggressor → lifts ASK passive
 */
export interface AbsorptionTradeEvent {
  price: number;
  quantity: number;
  timestamp: number;
  isBuyerMaker: boolean;
  tradeId?: string;
}

/**
 * Result of processing a trade for absorption
 */
export interface AbsorptionResult {
  /** The level that was affected, or null if no match */
  affectedLevel: PassiveOrderLevel | null;

  /** Volume that was absorbed from the passive order */
  volumeAbsorbed: number;

  /** True if the level was fully executed (remainingVolume <= 0) */
  levelExecuted: boolean;

  /** True if this was detected as spoofing */
  levelSpoofed: boolean;

  /** True if an iceberg order was refilled (hidden volume revealed) */
  icebergRefilled?: boolean;
}

/**
 * Spoofing detection event
 *
 * Triggered when an order disappears without corresponding trades.
 */
export interface SpoofingEvent {
  price: number;
  side: PassiveOrderSide;
  volumeRemoved: number;      // How much volume disappeared
  timestampDetected: number;
  confidence: number;         // 0-1, how confident we are this was spoofing
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT & STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Snapshot of all passive liquidity at a point in time
 */
export interface CoherentPassiveLiquiditySnapshot {
  /** Map of all levels, key = `${price}_${side}` */
  levels: Map<string, PassiveOrderLevel>;

  /** Maximum volumes for normalization */
  maxBidVolume: number;
  maxAskVolume: number;

  /** Timestamp of snapshot */
  timestamp: number;

  /** Statistics */
  totalAbsorbed: number;
  totalLevels: number;
  activeLevels: number;

  /** Recent spoofing events */
  spoofingEvents: SpoofingEvent[];
}

/**
 * Statistics for the absorption engine
 */
export interface AbsorptionStatistics {
  totalTradesProcessed: number;
  totalVolumeAbsorbed: number;
  totalLevelsExecuted: number;
  totalSpoofingDetected: number;
  absorptionRate: number;  // Volume/second being absorbed
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the coherent passive liquidity simulator
 */
export interface CoherentSimulatorConfig {
  // ─── Price/Tick Configuration ───
  basePrice: number;
  tickSize: number;
  depth: number;              // Number of levels per side

  // ─── Volume Generation ───
  baseLiquidity: number;      // Average volume per level
  wallProbability: number;    // Probability of generating a large order (0-1)
  wallMultiplier: number;     // Multiplier for wall orders
  spreadTicks: number;        // Minimum spread from current price

  // ─── Absorption Animation ───
  absorptionAnimationDuration: number;  // ms for shrink animation
  executionFadeOutDuration: number;     // ms to fade out executed orders

  // ─── Spoofing Detection ───
  spoofingDetectionEnabled: boolean;
  spoofingMinLifetimeMs: number;        // Orders disappearing faster = potential spoof
  spoofingMinVolumeRatio: number;       // Min absorbed ratio to NOT be considered spoof

  // ─── Stability ───
  minPresenceMs: number;      // Minimum time before displaying
  minSnapshots: number;       // Minimum snapshots before displaying
  fadeInMs: number;           // Fade in duration
  fadeOutMs: number;          // Fade out duration

  // ─── Regeneration ───
  regenerationEnabled: boolean;
  regenerationIntervalMs: number;       // How often to add new liquidity
  regenerationVolumeRatio: number;      // Percentage of base liquidity to add

  // ─── Iceberg Orders ───
  icebergEnabled: boolean;              // Enable iceberg order simulation
  icebergProbability: number;           // Probability of a level being an iceberg (0-1)
  icebergHiddenMultiplier: number;      // Hidden volume = visible * multiplier (2-10x typical)
  icebergMinVisiblePortion: number;     // Minimum visible portion size

  // ─── Data Source ───
  dataSource: 'simulation' | 'realtime'; // Use simulated data or real Binance orderbook
  realtimeDepthLevels: number;           // Number of orderbook levels to display (5, 10, 20)
}

/**
 * Default configuration values
 */
export const DEFAULT_COHERENT_CONFIG: CoherentSimulatorConfig = {
  // Price/Tick
  basePrice: 5000,
  tickSize: 0.5,
  depth: 50,

  // Volume Generation
  baseLiquidity: 15,
  wallProbability: 0.08,
  wallMultiplier: 4,
  spreadTicks: 1,

  // Absorption Animation
  absorptionAnimationDuration: 1500,  // Increased from 300 for more visible effect
  executionFadeOutDuration: 800,

  // Spoofing Detection
  spoofingDetectionEnabled: true,
  spoofingMinLifetimeMs: 500,
  spoofingMinVolumeRatio: 0.1,

  // Stability
  minPresenceMs: 300,
  minSnapshots: 6,
  fadeInMs: 200,
  fadeOutMs: 500,

  // Regeneration
  regenerationEnabled: true,
  regenerationIntervalMs: 5000,   // Increased from 2000 to keep absorbed state visible longer
  regenerationVolumeRatio: 0.2,   // Slower refill

  // Iceberg Orders
  icebergEnabled: true,
  icebergProbability: 0.05,        // 5% chance of being an iceberg
  icebergHiddenMultiplier: 4,      // Hidden = 4x visible (so total = 5x visible)
  icebergMinVisiblePortion: 5,     // Minimum 5 contracts visible

  // Data Source
  dataSource: 'realtime',           // Use real Binance orderbook data by default
  realtimeDepthLevels: 20,         // Use 20 levels from Binance depth stream
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate level key from price and side
 */
export function getLevelKey(price: number, side: PassiveOrderSide): string {
  return `${price}_${side}`;
}

/**
 * Parse level key back to price and side
 */
export function parseLevelKey(key: string): { price: number; side: PassiveOrderSide } {
  const [priceStr, side] = key.split('_');
  return { price: parseFloat(priceStr), side: side as PassiveOrderSide };
}

/**
 * Create a new passive order level with default values
 */
export function createPassiveOrderLevel(
  price: number,
  side: PassiveOrderSide,
  volume: number,
  timestamp: number = Date.now(),
  icebergConfig?: { hiddenVolume: number; visiblePortion: number }
): PassiveOrderLevel {
  const isIceberg = icebergConfig !== undefined && icebergConfig.hiddenVolume > 0;

  return {
    price,
    side,
    initialVolume: volume,
    remainingVolume: volume,
    absorbedVolume: 0,
    timestampCreated: timestamp,
    lastInteraction: timestamp,
    lastUpdate: timestamp,
    status: 'active',
    absorptionRate: 0,
    opacity: 0,  // Starts invisible, fades in
    displayWidth: 1,  // Full width initially
    consecutiveSnapshots: 0,
    isPersistent: false,
    // Iceberg fields
    isIceberg,
    hiddenVolume: icebergConfig?.hiddenVolume ?? 0,
    visiblePortion: icebergConfig?.visiblePortion ?? volume,
    refillCount: 0,
    totalIcebergVolume: isIceberg ? volume + (icebergConfig?.hiddenVolume ?? 0) : volume,
  };
}

/**
 * Format volume for display (420, 1.2K, 15.3K)
 */
export function formatPassiveVolume(volume: number): string {
  const abs = Math.abs(volume);
  if (abs >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  if (abs >= 100) return Math.round(volume).toString();
  if (abs >= 10) return volume.toFixed(1);
  if (abs >= 1) return volume.toFixed(1);
  return volume.toFixed(2);
}
