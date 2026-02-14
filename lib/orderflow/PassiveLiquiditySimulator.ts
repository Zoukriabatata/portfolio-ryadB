/**
 * INTELLIGENT PASSIVE LIQUIDITY SIMULATOR
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÈGLE ABSOLUE : La footprint est la source de vérité
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - Le passif COUVRE toute la plage de prix visible
 * - Le passif est CONSOMMÉ par chaque trade footprint
 * - Pas de passif décoratif - chaque niveau réagit aux trades
 * - Création forcée si un trade arrive sans passif correspondant
 */

import {
  type PassiveOrderLevel,
  type PassiveOrderStatus,
  type PassiveOrderSide,
  type AbsorptionTradeEvent,
  type AbsorptionResult,
  type CoherentPassiveLiquiditySnapshot,
  type CoherentSimulatorConfig,
  type SpoofingEvent,
  DEFAULT_COHERENT_CONFIG,
  getLevelKey,
  createPassiveOrderLevel,
} from '@/types/passive-liquidity';

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY TYPES (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PassiveLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  rawBidVolume: number;
  rawAskVolume: number;
  intensity: number;
  isInterestZone: boolean;
  firstSeen: number;
  lastSeen: number;
  consecutiveSnapshots: number;
  opacity: number;
  isPersistent: boolean;
  distanceFromPrice: number;
}

export interface StablePassiveLevel extends PassiveLevel {
  displayBidVolume: number;
  displayAskVolume: number;
  displayIntensity: number;
  status?: PassiveOrderStatus;
  remainingVolume?: number;
  initialVolume?: number;
}

export interface PassiveLiquiditySnapshot {
  levels: Map<number, PassiveLevel>;
  stableLevels: StablePassiveLevel[];
  maxBidVolume: number;
  maxAskVolume: number;
  timestamp: number;
}

export interface PassiveLiquidityConfig {
  basePrice: number;
  tickSize: number;
  depth: number;
  baseLiquidity: number;
  wallProbability: number;
  wallMultiplier: number;
  spreadTicks: number;
}

export interface StabilityConfig {
  minPresenceMs: number;
  minSnapshots: number;
  fadeInMs: number;
  fadeOutMs: number;
  smoothingFactor: number;
  minVolumeThreshold: number;
  priorityTicksFromPrice: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENT PASSIVE LIQUIDITY SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class PassiveLiquiditySimulator {
  private config: CoherentSimulatorConfig;
  private levels: Map<string, PassiveOrderLevel>;
  private legacyLevels: Map<number, PassiveLevel>;
  private stableLevels: StablePassiveLevel[];

  private maxBidVolume: number = 0;
  private maxAskVolume: number = 0;
  private maxInitialBidVolume: number = 0;
  private maxInitialAskVolume: number = 0;
  private seed: number;
  private lastUpdateTime: number = 0;

  // Visible price range tracking
  private visibleMin: number = 0;
  private visibleMax: number = 0;
  private lastGeneratedMin: number = 0;
  private lastGeneratedMax: number = 0;

  // Statistics
  private totalAbsorbed: number = 0;
  private totalLevelsExecuted: number = 0;
  private spoofingEvents: SpoofingEvent[] = [];

  // Scheduled removals and regenerations
  private scheduledRemovals: Map<string, number> = new Map();
  private scheduledRegenerations: Map<string, { time: number; price: number; side: PassiveOrderSide }> = new Map();
  private lastRegenerationTick: number = 0;

  // Volume calibration from actual footprint data
  private volumeScale: number = 1.0; // Multiplier for passive volumes based on actual trade activity
  private averageTradeVolume: number = 1.0;

  constructor(config: Partial<CoherentSimulatorConfig> = {}) {
    this.config = { ...DEFAULT_COHERENT_CONFIG, ...config };
    this.seed = Date.now();
    this.levels = new Map();
    this.legacyLevels = new Map();
    this.stableLevels = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════════

  setConfig(config: Partial<PassiveLiquidityConfig | CoherentSimulatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setStabilityConfig(stability: Partial<StabilityConfig>): void {
    if (stability.minPresenceMs !== undefined) this.config.minPresenceMs = stability.minPresenceMs;
    if (stability.minSnapshots !== undefined) this.config.minSnapshots = stability.minSnapshots;
    if (stability.fadeInMs !== undefined) this.config.fadeInMs = stability.fadeInMs;
    if (stability.fadeOutMs !== undefined) this.config.fadeOutMs = stability.fadeOutMs;
  }

  /**
   * Calibrate passive liquidity volumes based on actual footprint trade volumes
   * This ensures passive levels match the scale of real trading activity
   *
   * @param avgTradeVolume - Average volume per trade from footprint
   * @param maxLevelVolume - Maximum volume at any single price level
   */
  calibrateFromFootprint(avgTradeVolume: number, maxLevelVolume: number): void {
    this.averageTradeVolume = avgTradeVolume;
    // Scale passive volume to be 1.5-3x average trade volume (realistic orderbook depth)
    // For crypto futures (small contract quantities), this keeps volumes realistic
    const ratio = avgTradeVolume / Math.max(0.01, this.config.baseLiquidity);
    this.volumeScale = Math.max(0.5, Math.min(5, ratio * 2));

    console.debug(`[PassiveLiquidity] Calibrated: avgTrade=${avgTradeVolume.toFixed(4)}, maxLevel=${maxLevelVolume.toFixed(4)}, baseLiq=${this.config.baseLiquidity.toFixed(4)}, scale=${this.volumeScale.toFixed(2)}`);

    // Force regeneration with new scale
    this.lastGeneratedMin = 0;
    this.lastGeneratedMax = 0;
  }

  /**
   * Set visible price range - generates levels to cover the entire range
   */
  setVisibleRange(minPrice: number, maxPrice: number): void {
    this.visibleMin = minPrice;
    this.visibleMax = maxPrice;

    // In realtime mode, don't generate fake levels - real orderbook is the source
    if (this.config.dataSource === 'realtime') return;

    // Only regenerate if range changed significantly
    const rangeChanged = Math.abs(minPrice - this.lastGeneratedMin) > this.config.tickSize * 5 ||
                         Math.abs(maxPrice - this.lastGeneratedMax) > this.config.tickSize * 5;

    if (rangeChanged || this.levels.size === 0) {
      this.generateLevelsForRange(minPrice, maxPrice);
      this.lastGeneratedMin = minPrice;
      this.lastGeneratedMax = maxPrice;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RANDOM & UTILS
  // ═══════════════════════════════════════════════════════════════════════════════

  private random(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private roundToTick(price: number): number {
    return Math.round(price / this.config.tickSize) * this.config.tickSize;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTELLIGENT LEVEL GENERATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Calculate BID volume at a given price (ABOVE current price)
   * Volume decreases as we move further from current price
   * Scaled by volumeScale to match actual footprint trade volumes
   */
  private calculateBidVolume(distanceFromCurrent: number, maxDistance: number): number {
    const { baseLiquidity, wallProbability, wallMultiplier } = this.config;

    // Volume decreases as distance from current price increases
    const distanceRatio = Math.abs(distanceFromCurrent) / maxDistance;
    const positionFactor = Math.max(0.2, 1 - distanceRatio * 0.6);

    // Apply volume scale from footprint calibration
    let volume = baseLiquidity * this.volumeScale * positionFactor * (0.5 + this.random() * 0.5);

    // Wall detection - more likely at round numbers
    const isWall = this.random() < wallProbability;
    if (isWall) {
      volume *= wallMultiplier * (1 + this.random() * 0.5);
    }

    // Min volume scales with baseLiquidity (small for crypto, larger for CME)
    const minVol = Math.max(0.001, baseLiquidity * 0.05);
    return Math.max(minVol, Math.round(volume * 1000) / 1000);
  }

  /**
   * Calculate ASK volume at a given price (BELOW current price)
   * Volume decreases as we move further from current price
   * Scaled by volumeScale to match actual footprint trade volumes
   */
  private calculateAskVolume(distanceFromCurrent: number, maxDistance: number): number {
    const { baseLiquidity, wallProbability, wallMultiplier } = this.config;

    // Volume decreases as distance from current price increases
    const distanceRatio = Math.abs(distanceFromCurrent) / maxDistance;
    const positionFactor = Math.max(0.2, 1 - distanceRatio * 0.6);

    // Apply volume scale from footprint calibration
    let volume = baseLiquidity * this.volumeScale * positionFactor * (0.5 + this.random() * 0.5);

    // Wall detection
    const isWall = this.random() < wallProbability;
    if (isWall) {
      volume *= wallMultiplier * (1 + this.random() * 0.5);
    }

    // Min volume scales with baseLiquidity (small for crypto, larger for CME)
    const minVol = Math.max(0.001, baseLiquidity * 0.05);
    return Math.max(minVol, Math.round(volume * 1000) / 1000);
  }

  /**
   * Create or update a passive level
   * May create an iceberg order based on probability
   */
  private createOrUpdateLevel(price: number, side: PassiveOrderSide, volume: number, timestamp: number): void {
    const levelKey = getLevelKey(price, side);

    // Skip if level already exists and is active with remaining volume
    const existing = this.levels.get(levelKey);
    if (existing && existing.status !== 'executed' && existing.status !== 'spoofed' && existing.remainingVolume > 0) {
      return;
    }

    // Determine if this should be an iceberg order
    const { icebergEnabled, icebergProbability, icebergHiddenMultiplier, icebergMinVisiblePortion } = this.config;
    const isIceberg = icebergEnabled && this.random() < icebergProbability && volume >= icebergMinVisiblePortion;

    let icebergConfig: { hiddenVolume: number; visiblePortion: number } | undefined;

    if (isIceberg) {
      // Iceberg: visible portion is smaller, hidden volume is larger
      const visiblePortion = Math.max(icebergMinVisiblePortion, volume * 0.3); // Show ~30% of base volume
      const hiddenVolume = visiblePortion * icebergHiddenMultiplier; // Hide 4x more
      icebergConfig = { hiddenVolume, visiblePortion };
      volume = visiblePortion; // Initial visible volume is just the portion
    }

    // Create level - IMMEDIATELY VISIBLE
    const level = createPassiveOrderLevel(price, side, volume, timestamp, icebergConfig);
    level.isPersistent = true;
    level.opacity = 1;
    level.consecutiveSnapshots = 100;

    this.levels.set(levelKey, level);

    // Track max for normalization (use total iceberg volume for proper scaling)
    const maxVolume = level.isIceberg ? level.totalIcebergVolume : volume;
    if (side === 'bid') {
      this.maxInitialBidVolume = Math.max(this.maxInitialBidVolume, maxVolume);
    } else {
      this.maxInitialAskVolume = Math.max(this.maxInitialAskVolume, maxVolume);
    }
  }

  /**
   * Generate passive levels for the entire visible price range
   *
   * ORDERFLOW LOGIC (professional style):
   * - BID passif = AU-DESSUS du prix actuel seulement
   * - ASK passif = EN-DESSOUS du prix actuel seulement
   * - Un seul cote par niveau de prix selon position relative au current price
   */
  private generateLevelsForRange(minPrice: number, maxPrice: number): void {
    const { tickSize, basePrice } = this.config;
    const now = Date.now();

    // Round prices to ticks
    const startPrice = this.roundToTick(minPrice);
    const endPrice = this.roundToTick(maxPrice);
    const currentPrice = basePrice || (startPrice + endPrice) / 2;
    const maxDistance = Math.max(1, (endPrice - startPrice) / 2);

    // Generate levels for EVERY tick in the visible range
    for (let price = startPrice; price <= endPrice; price += tickSize) {
      const roundedPrice = this.roundToTick(price);
      const distanceFromCurrent = roundedPrice - currentPrice; // Negative = below, Positive = above

      // ═══════════════════════════════════════════════════════════════
      // STRICTLY ABOVE current price → BID passif seulement
      // (Acheteurs passifs qui attendent d'être frappés par vendeurs agressifs)
      // ═══════════════════════════════════════════════════════════════
      if (distanceFromCurrent > 0) {
        const bidVolume = this.calculateBidVolume(distanceFromCurrent, maxDistance);
        this.createOrUpdateLevel(roundedPrice, 'bid', bidVolume, now);
      }

      // ═══════════════════════════════════════════════════════════════
      // STRICTLY BELOW current price → ASK passif seulement
      // (Vendeurs passifs qui attendent d'être frappés par acheteurs agressifs)
      // ═══════════════════════════════════════════════════════════════
      if (distanceFromCurrent < 0) {
        const askVolume = this.calculateAskVolume(Math.abs(distanceFromCurrent), maxDistance);
        this.createOrUpdateLevel(roundedPrice, 'ask', askVolume, now);
      }
    }

    this.lastUpdateTime = now;
    this.rebuildLegacyLevels();
    this.updateStableLevels();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TRADE ABSORPTION (CORE FEATURE)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Process an incoming trade and absorb matching passive liquidity
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * RÈGLE : Professional style
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * - BID passif est AU-DESSUS du prix actuel
   * - ASK passif est EN-DESSOUS du prix actuel
   *
   * Donc:
   * - BUY agressif (isBuyerMaker=false) → prix monte → consomme BID passif
   * - SELL agressif (isBuyerMaker=true) → prix descend → consomme ASK passif
   */
  processTrade(trade: AbsorptionTradeEvent): AbsorptionResult {
    // INVERSÉ par rapport au standard: BUY consomme BID, SELL consomme ASK
    const targetSide: PassiveOrderSide = trade.isBuyerMaker ? 'ask' : 'bid';
    const price = this.roundToTick(trade.price);
    const levelKey = getLevelKey(price, targetSide);
    let level = this.levels.get(levelKey);

    // DEBUG: Log trade processing
    const debugInterval = 50; // Log every 50 trades
    if (Math.random() < 1 / debugInterval) {
      console.debug(`[PassiveLiquidity] Trade: ${trade.isBuyerMaker ? 'SELL' : 'BUY'} @ ${price} qty=${trade.quantity.toFixed(3)} → ${targetSide.toUpperCase()}`,
        level ? `[EXISTS: remaining=${level.remainingVolume.toFixed(1)}, status=${level.status}]` : '[NO LEVEL - CREATING]');
    }

    // ═══════════════════════════════════════════════════════════════
    // CRÉATION FORCÉE (simulation only)
    // In realtime mode, the real orderbook is the source of truth
    // - no fake levels are created for unmatched trades
    // ═══════════════════════════════════════════════════════════════
    const needsCreation = !level || level.status === 'executed' || level.status === 'spoofed';

    if (needsCreation) {
      // In realtime mode: skip forced creation - real orderbook will provide data
      if (this.config.dataSource === 'realtime') {
        return {
          affectedLevel: null,
          volumeAbsorbed: 0,
          levelExecuted: false,
          levelSpoofed: false,
        } as AbsorptionResult;
      }

      // Simulation mode: Create with MORE volume than trade so absorption is visible
      const baseVolume = Math.max(trade.quantity * 3, this.config.baseLiquidity);
      const newLevel = createPassiveOrderLevel(price, targetSide, baseVolume, trade.timestamp);
      newLevel.isPersistent = true;
      newLevel.opacity = 1;
      newLevel.consecutiveSnapshots = 100;
      this.levels.set(levelKey, newLevel);
      level = newLevel;

      if (targetSide === 'bid') {
        this.maxInitialBidVolume = Math.max(this.maxInitialBidVolume, baseVolume);
      } else {
        this.maxInitialAskVolume = Math.max(this.maxInitialAskVolume, baseVolume);
      }
    }

    const activeLevel = level!;

    // ═══════════════════════════════════════════════════════════════
    // CONSOMMATION STRICTE
    // ═══════════════════════════════════════════════════════════════
    const volumeToAbsorb = Math.min(trade.quantity, activeLevel.remainingVolume);
    activeLevel.remainingVolume -= volumeToAbsorb;
    activeLevel.absorbedVolume += volumeToAbsorb;
    activeLevel.lastInteraction = trade.timestamp;
    activeLevel.lastUpdate = trade.timestamp;
    activeLevel.status = 'absorbing';

    // Absorption rate
    const timeSinceCreation = trade.timestamp - activeLevel.timestampCreated;
    if (timeSinceCreation > 0) {
      activeLevel.absorptionRate = activeLevel.absorbedVolume / (timeSinceCreation / 1000);
    }

    // Update display width (bars SHRINK)
    activeLevel.displayWidth = activeLevel.initialVolume > 0
      ? activeLevel.remainingVolume / activeLevel.initialVolume
      : 0;

    this.totalAbsorbed += volumeToAbsorb;

    // ═══════════════════════════════════════════════════════════════
    // EXÉCUTION COMPLÈTE ou ICEBERG REFILL
    // ═══════════════════════════════════════════════════════════════
    let levelExecuted = activeLevel.remainingVolume <= 0;
    let icebergRefilled = false;

    if (levelExecuted) {
      // Check if this is an iceberg with hidden volume
      if (activeLevel.isIceberg && activeLevel.hiddenVolume > 0) {
        // ICEBERG REFILL: Reveal more hidden volume
        const refillAmount = Math.min(activeLevel.visiblePortion, activeLevel.hiddenVolume);
        activeLevel.hiddenVolume -= refillAmount;
        activeLevel.remainingVolume = refillAmount;
        activeLevel.initialVolume = refillAmount; // Reset initial for display width calculation
        activeLevel.refillCount++;
        activeLevel.status = 'active'; // Back to active, not executed
        activeLevel.displayWidth = 1; // Reset to full width
        levelExecuted = false; // Not actually executed, just refilled
        icebergRefilled = true;

        // Visual pulse effect for iceberg refill (brief absorbing state)
        activeLevel.lastInteraction = trade.timestamp;
      } else {
        // Normal execution (not iceberg or iceberg fully depleted)
        activeLevel.status = 'executed';
        activeLevel.remainingVolume = 0;
        activeLevel.displayWidth = 0;
        this.totalLevelsExecuted++;
        this.scheduleRemoval(levelKey);
      }
    }

    this.rebuildLegacyLevels();

    return {
      affectedLevel: activeLevel,
      volumeAbsorbed: volumeToAbsorb,
      levelExecuted,
      levelSpoofed: false,
      icebergRefilled, // New field to indicate iceberg behavior
    } as AbsorptionResult;
  }

  private scheduleRemoval(levelKey: string): void {
    const level = this.levels.get(levelKey);
    if (!level) return;

    const removalTime = Date.now() + this.config.executionFadeOutDuration;
    this.scheduledRemovals.set(levelKey, removalTime);

    // Also schedule regeneration if enabled
    if (this.config.regenerationEnabled) {
      const regenTime = removalTime + this.config.regenerationIntervalMs;
      this.scheduledRegenerations.set(levelKey, {
        time: regenTime,
        price: level.price,
        side: level.side,
      });
    }
  }

  private processScheduledRemovals(): void {
    const now = Date.now();

    for (const [key, removalTime] of this.scheduledRemovals) {
      if (now >= removalTime) {
        this.levels.delete(key);
        this.scheduledRemovals.delete(key);
      }
    }
  }

  /**
   * Process scheduled regenerations - market maker replaces consumed orders
   */
  private processScheduledRegenerations(): void {
    if (!this.config.regenerationEnabled) return;

    const now = Date.now();

    for (const [key, regen] of this.scheduledRegenerations) {
      if (now >= regen.time) {
        // Check if level doesn't already exist (might have been recreated by forced creation)
        const existing = this.levels.get(key);
        if (!existing || existing.status === 'executed' || existing.status === 'spoofed') {
          // Regenerate the level with new volume
          const midPrice = this.config.basePrice || (this.visibleMin + this.visibleMax) / 2;
          const maxDistance = Math.max(1, (this.visibleMax - this.visibleMin) / 2);
          const distanceFromMid = regen.price - midPrice;

          const volume = regen.side === 'bid'
            ? this.calculateBidVolume(distanceFromMid, maxDistance)
            : this.calculateAskVolume(distanceFromMid, maxDistance);

          // Create regenerated level with fade-in effect
          const level = createPassiveOrderLevel(regen.price, regen.side, volume, now);
          level.isPersistent = true;
          level.opacity = 0; // Start invisible, will fade in
          level.consecutiveSnapshots = 0;
          level.status = 'active';

          this.levels.set(key, level);

          // Track max for normalization
          if (regen.side === 'bid') {
            this.maxInitialBidVolume = Math.max(this.maxInitialBidVolume, volume);
          } else {
            this.maxInitialAskVolume = Math.max(this.maxInitialAskVolume, volume);
          }
        }

        this.scheduledRegenerations.delete(key);
      }
    }
  }

  /**
   * Gradually refill partially consumed levels (market maker replenishing)
   */
  private processGradualRefill(): void {
    if (!this.config.regenerationEnabled) return;

    const now = Date.now();

    // Only refill every regenerationIntervalMs
    if (now - this.lastRegenerationTick < this.config.regenerationIntervalMs) return;
    this.lastRegenerationTick = now;

    for (const level of this.levels.values()) {
      // Skip executed, spoofed, or absorbing levels
      if (level.status !== 'active') continue;

      // Only refill if significantly consumed (less than 70% remaining)
      const consumedRatio = 1 - (level.remainingVolume / level.initialVolume);
      if (consumedRatio < 0.3) continue;

      // Add back some volume (market maker replenishing)
      const refillAmount = level.initialVolume * this.config.regenerationVolumeRatio;
      level.remainingVolume = Math.min(
        level.initialVolume,
        level.remainingVolume + refillAmount
      );

      // Update display width
      level.displayWidth = level.remainingVolume / level.initialVolume;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SPOOFING DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  detectSpoofing(price: number, side: PassiveOrderSide): SpoofingEvent | null {
    const levelKey = getLevelKey(price, side);
    const level = this.levels.get(levelKey);

    if (!level || !this.config.spoofingDetectionEnabled) return null;

    const lifetime = Date.now() - level.timestampCreated;
    const absorbedRatio = level.initialVolume > 0 ? level.absorbedVolume / level.initialVolume : 0;

    if (lifetime < this.config.spoofingMinLifetimeMs && absorbedRatio < this.config.spoofingMinVolumeRatio) {
      const event: SpoofingEvent = {
        price: level.price,
        side: level.side,
        volumeRemoved: level.remainingVolume,
        timestampDetected: Date.now(),
        confidence: 1 - (absorbedRatio + lifetime / this.config.spoofingMinLifetimeMs) / 2,
      };

      level.status = 'spoofed';
      this.spoofingEvents.push(event);
      if (this.spoofingEvents.length > 100) {
        this.spoofingEvents = this.spoofingEvents.slice(-100);
      }

      return event;
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TICK UPDATE
  // ═══════════════════════════════════════════════════════════════════════════════

  tick(): void {
    const now = Date.now();
    this.lastUpdateTime = now;

    // Process scheduled operations
    this.processScheduledRemovals();

    // Skip fake regeneration/refill in realtime mode - real orderbook is truth
    if (this.config.dataSource !== 'realtime') {
      this.processScheduledRegenerations();
      this.processGradualRefill();
    }

    // Update opacities and statuses
    for (const [, level] of this.levels) {
      level.lastUpdate = now;

      // Transition absorbing → active after delay
      if (level.status === 'absorbing') {
        const timeSinceInteraction = now - level.lastInteraction;
        if (timeSinceInteraction > this.config.absorptionAnimationDuration) {
          level.status = 'active';
        }
      }

      // Executed levels fade out
      if (level.status === 'executed') {
        const fadeProgress = Math.min(1, (now - level.lastInteraction) / this.config.fadeOutMs);
        level.opacity = Math.max(0, 1 - fadeProgress);
      }

      // Regenerated levels fade in (opacity starts at 0)
      if (level.status === 'active' && level.opacity < 1) {
        const timeSinceCreation = now - level.timestampCreated;
        const fadeInProgress = Math.min(1, timeSinceCreation / this.config.fadeInMs);
        level.opacity = fadeInProgress;
        level.consecutiveSnapshots++;
        if (level.consecutiveSnapshots >= this.config.minSnapshots) {
          level.isPersistent = true;
        }
      }
    }

    // Recalculate max volumes
    this.maxBidVolume = 0;
    this.maxAskVolume = 0;
    for (const level of this.levels.values()) {
      if (level.opacity > 0.1 && level.status !== 'executed') {
        if (level.side === 'bid') {
          this.maxBidVolume = Math.max(this.maxBidVolume, level.remainingVolume);
        } else {
          this.maxAskVolume = Math.max(this.maxAskVolume, level.remainingVolume);
        }
      }
    }

    this.rebuildLegacyLevels();
    this.updateStableLevels();
  }

  tickUpdate(): void {
    this.tick();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LEGACY COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════════════════

  private rebuildLegacyLevels(): void {
    this.legacyLevels.clear();

    for (const level of this.levels.values()) {
      const price = level.price;

      if (!this.legacyLevels.has(price)) {
        this.legacyLevels.set(price, {
          price,
          bidVolume: 0,
          askVolume: 0,
          rawBidVolume: 0,
          rawAskVolume: 0,
          intensity: 0,
          isInterestZone: false,
          firstSeen: level.timestampCreated,
          lastSeen: level.lastUpdate,
          consecutiveSnapshots: level.consecutiveSnapshots,
          opacity: level.opacity,
          isPersistent: level.isPersistent,
          distanceFromPrice: Math.abs(price - this.config.basePrice),
        });
      }

      const legacyLevel = this.legacyLevels.get(price)!;

      if (level.side === 'bid') {
        legacyLevel.bidVolume = level.remainingVolume;
        legacyLevel.rawBidVolume = level.initialVolume;
      } else {
        legacyLevel.askVolume = level.remainingVolume;
        legacyLevel.rawAskVolume = level.initialVolume;
      }

      legacyLevel.opacity = Math.max(legacyLevel.opacity, level.opacity);
      legacyLevel.isPersistent = legacyLevel.isPersistent || level.isPersistent;

      const bidIntensity = this.maxBidVolume > 0 ? legacyLevel.bidVolume / this.maxBidVolume : 0;
      const askIntensity = this.maxAskVolume > 0 ? legacyLevel.askVolume / this.maxAskVolume : 0;
      legacyLevel.intensity = Math.max(bidIntensity, askIntensity);
    }
  }

  private updateStableLevels(): void {
    this.stableLevels = [];

    for (const level of this.levels.values()) {
      if (level.opacity < 0.05) continue;
      if (level.status === 'executed' && level.opacity <= 0) continue;

      const legacyLevel = this.legacyLevels.get(level.price);
      if (!legacyLevel) continue;

      const stableLevel: StablePassiveLevel = {
        ...legacyLevel,
        displayBidVolume: legacyLevel.bidVolume * level.opacity,
        displayAskVolume: legacyLevel.askVolume * level.opacity,
        displayIntensity: legacyLevel.intensity * level.opacity,
        status: level.status,
        remainingVolume: level.remainingVolume,
        initialVolume: level.initialVolume,
      };

      if (!this.stableLevels.some(l => l.price === level.price)) {
        this.stableLevels.push(stableLevel);
      }
    }

    this.stableLevels.sort((a, b) => b.price - a.price);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════════

  getCoherentSnapshot(): CoherentPassiveLiquiditySnapshot {
    return {
      levels: this.levels,
      maxBidVolume: this.maxBidVolume,
      maxAskVolume: this.maxAskVolume,
      timestamp: this.lastUpdateTime,
      totalAbsorbed: this.totalAbsorbed,
      totalLevels: this.levels.size,
      activeLevels: Array.from(this.levels.values()).filter(l => l.status === 'active' || l.status === 'absorbing').length,
      spoofingEvents: this.spoofingEvents.slice(-10),
    };
  }

  getSnapshot(): PassiveLiquiditySnapshot {
    return {
      levels: this.legacyLevels,
      stableLevels: this.stableLevels,
      maxBidVolume: this.maxInitialBidVolume || this.maxBidVolume || 1,
      maxAskVolume: this.maxInitialAskVolume || this.maxAskVolume || 1,
      timestamp: this.lastUpdateTime,
    };
  }

  getLevel(price: number, side: PassiveOrderSide): PassiveOrderLevel | undefined {
    return this.levels.get(getLevelKey(this.roundToTick(price), side));
  }

  getLevelsInRange(minPrice: number, maxPrice: number): PassiveOrderLevel[] {
    const result: PassiveOrderLevel[] = [];
    for (const level of this.levels.values()) {
      if (level.price >= minPrice && level.price <= maxPrice && level.opacity > 0.05) {
        result.push(level);
      }
    }
    return result.sort((a, b) => b.price - a.price);
  }

  getStableLevelsInRange(minPrice: number, maxPrice: number): StablePassiveLevel[] {
    return this.stableLevels.filter(level => level.price >= minPrice && level.price <= maxPrice);
  }

  getStableLevelsNearPrice(centerPrice: number, ticksRange: number): StablePassiveLevel[] {
    const { tickSize } = this.config;
    const minPrice = centerPrice - ticksRange * tickSize;
    const maxPrice = centerPrice + ticksRange * tickSize;
    return this.getStableLevelsInRange(minPrice, maxPrice);
  }

  getStatistics() {
    const levels = Array.from(this.levels.values());
    const bidLevels = levels.filter(l => l.side === 'bid');
    const askLevels = levels.filter(l => l.side === 'ask');

    const totalBidVolume = bidLevels.reduce((sum, l) => sum + l.remainingVolume, 0);
    const totalAskVolume = askLevels.reduce((sum, l) => sum + l.remainingVolume, 0);
    const totalBidAbsorbed = bidLevels.reduce((sum, l) => sum + l.absorbedVolume, 0);
    const totalAskAbsorbed = askLevels.reduce((sum, l) => sum + l.absorbedVolume, 0);

    // Iceberg stats
    const icebergLevels = levels.filter(l => l.isIceberg);
    const totalHiddenVolume = icebergLevels.reduce((sum, l) => sum + l.hiddenVolume, 0);
    const totalRefills = icebergLevels.reduce((sum, l) => sum + l.refillCount, 0);

    return {
      // Global stats
      totalAbsorbed: this.totalAbsorbed,
      totalLevelsExecuted: this.totalLevelsExecuted,
      totalSpoofingDetected: this.spoofingEvents.length,

      // Level counts
      totalLevels: levels.length,
      activeLevels: levels.filter(l => l.status === 'active').length,
      absorbingLevels: levels.filter(l => l.status === 'absorbing').length,
      executedLevels: levels.filter(l => l.status === 'executed').length,

      // Bid/Ask breakdown
      bidLevels: bidLevels.length,
      askLevels: askLevels.length,
      totalBidVolume: Math.round(totalBidVolume * 10) / 10,
      totalAskVolume: Math.round(totalAskVolume * 10) / 10,
      totalBidAbsorbed: Math.round(totalBidAbsorbed * 10) / 10,
      totalAskAbsorbed: Math.round(totalAskAbsorbed * 10) / 10,

      // Imbalance (positive = more bid volume = bullish support)
      volumeImbalance: Math.round((totalBidVolume - totalAskVolume) * 10) / 10,
      absorptionImbalance: Math.round((totalBidAbsorbed - totalAskAbsorbed) * 10) / 10,

      // Pending regenerations
      pendingRegenerations: this.scheduledRegenerations.size,

      // Iceberg stats
      icebergCount: icebergLevels.length,
      totalHiddenVolume: Math.round(totalHiddenVolume * 10) / 10,
      totalIcebergRefills: totalRefills,
    };
  }

  getSpoofingEvents(): SpoofingEvent[] {
    return this.spoofingEvents.slice(-10);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // REAL ORDERBOOK DATA (Binance Depth Stream)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Process real orderbook data from Binance depth stream
   *
   * Replaces simulated levels with real orderbook data.
   * Format: { bids: [[price, qty], ...], asks: [[price, qty], ...] }
   */
  processOrderbookSnapshot(orderbook: {
    bids: [string, string][];
    asks: [string, string][];
  }): void {
    // Only process if in realtime mode
    if (this.config.dataSource !== 'realtime') {
      return;
    }

    const now = Date.now();

    // Track which levels we've seen in this snapshot
    const seenLevels = new Set<string>();

    // Process bids (passive buyers)
    for (const [priceStr, qtyStr] of orderbook.bids) {
      const price = parseFloat(priceStr);
      const quantity = parseFloat(qtyStr);

      if (quantity <= 0) continue;

      const roundedPrice = this.roundToTick(price);
      const levelKey = getLevelKey(roundedPrice, 'bid');
      seenLevels.add(levelKey);

      const existing = this.levels.get(levelKey);

      if (existing) {
        // Smooth volume transition to avoid jitter (EMA-style)
        const smoothing = 0.4; // 40% new value, 60% old → stable display
        const smoothedVolume = existing.remainingVolume + (quantity - existing.remainingVolume) * smoothing;

        // Detect significant absorption (>10% drop after smoothing)
        const volumeDiff = existing.remainingVolume - smoothedVolume;
        if (volumeDiff > existing.initialVolume * 0.1) {
          existing.absorbedVolume += volumeDiff;
          existing.status = 'absorbing';
          existing.lastInteraction = now;
        } else if (smoothedVolume > existing.remainingVolume * 1.05) {
          // Volume increased >5% → back to active (refill)
          existing.status = 'active';
        }
        existing.remainingVolume = smoothedVolume;
        // Update initialVolume to track the max seen (for bar width normalization)
        existing.initialVolume = Math.max(existing.initialVolume, smoothedVolume);
        existing.lastUpdate = now;
        existing.displayWidth = existing.initialVolume > 0
          ? existing.remainingVolume / existing.initialVolume
          : 1;
      } else {
        // Create new level from real data
        const level = createPassiveOrderLevel(roundedPrice, 'bid', quantity, now);
        level.isPersistent = true;
        level.opacity = 1;
        level.consecutiveSnapshots = 100;
        this.levels.set(levelKey, level);
      }

      this.maxInitialBidVolume = Math.max(this.maxInitialBidVolume, quantity);
    }

    // Process asks (passive sellers)
    for (const [priceStr, qtyStr] of orderbook.asks) {
      const price = parseFloat(priceStr);
      const quantity = parseFloat(qtyStr);

      if (quantity <= 0) continue;

      const roundedPrice = this.roundToTick(price);
      const levelKey = getLevelKey(roundedPrice, 'ask');
      seenLevels.add(levelKey);

      const existing = this.levels.get(levelKey);

      if (existing) {
        // Smooth volume transition to avoid jitter (EMA-style)
        const smoothing = 0.4;
        const smoothedVolume = existing.remainingVolume + (quantity - existing.remainingVolume) * smoothing;

        const volumeDiff = existing.remainingVolume - smoothedVolume;
        if (volumeDiff > existing.initialVolume * 0.1) {
          existing.absorbedVolume += volumeDiff;
          existing.status = 'absorbing';
          existing.lastInteraction = now;
        } else if (smoothedVolume > existing.remainingVolume * 1.05) {
          existing.status = 'active';
        }
        existing.remainingVolume = smoothedVolume;
        existing.initialVolume = Math.max(existing.initialVolume, smoothedVolume);
        existing.lastUpdate = now;
        existing.displayWidth = existing.initialVolume > 0
          ? existing.remainingVolume / existing.initialVolume
          : 1;
      } else {
        // Create new level from real data
        const level = createPassiveOrderLevel(roundedPrice, 'ask', quantity, now);
        level.isPersistent = true;
        level.opacity = 1;
        level.consecutiveSnapshots = 100;
        this.levels.set(levelKey, level);
      }

      this.maxInitialAskVolume = Math.max(this.maxInitialAskVolume, quantity);
    }

    // Mark levels that disappeared as potentially spoofed or executed
    for (const [levelKey, level] of this.levels) {
      if (!seenLevels.has(levelKey) && level.status === 'active') {
        // Level disappeared from orderbook
        const lifetime = now - level.timestampCreated;
        const absorbedRatio = level.initialVolume > 0 ? level.absorbedVolume / level.initialVolume : 0;

        if (lifetime < 500 && absorbedRatio < 0.1) {
          // Likely spoofing - disappeared quickly with little absorption
          level.status = 'spoofed';
          this.spoofingEvents.push({
            price: level.price,
            side: level.side,
            volumeRemoved: level.remainingVolume,
            timestampDetected: now,
            confidence: Math.min(1, 1 - (absorbedRatio + lifetime / 500) / 2),
          });
        } else {
          // Normal removal - mark as executed and fade out
          level.status = 'executed';
          level.remainingVolume = 0;
          this.scheduleRemoval(levelKey);
        }
      }
    }

    this.lastUpdateTime = now;
    this.rebuildLegacyLevels();
    this.updateStableLevels();
  }

  /**
   * Check if currently using real orderbook data
   */
  isRealtimeMode(): boolean {
    return this.config.dataSource === 'realtime';
  }

  /**
   * Switch between simulation and realtime mode
   */
  setDataSource(source: 'simulation' | 'realtime'): void {
    if (this.config.dataSource !== source) {
      this.config.dataSource = source;
      // Clear existing levels when switching modes
      this.levels.clear();
      this.legacyLevels.clear();
      this.stableLevels = [];
      this.maxBidVolume = 0;
      this.maxAskVolume = 0;
      this.maxInitialBidVolume = 0;
      this.maxInitialAskVolume = 0;
      console.debug(`[PassiveLiquiditySimulator] Switched to ${source} mode`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let simulatorInstance: PassiveLiquiditySimulator | null = null;

export function getPassiveLiquiditySimulator(): PassiveLiquiditySimulator {
  if (!simulatorInstance) {
    simulatorInstance = new PassiveLiquiditySimulator();
  }
  return simulatorInstance;
}

export function resetPassiveLiquiditySimulator(): void {
  simulatorInstance = null;
}
