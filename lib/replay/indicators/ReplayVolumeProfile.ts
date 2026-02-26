/**
 * Replay Volume Profile
 *
 * Builds a volume-at-price distribution from replayed trades.
 * Used to display horizontal volume bars alongside the replay chart.
 *
 * Features:
 * - POC (Point of Control) — price level with highest volume
 * - Value Area (70% of total volume) — VAH and VAL
 * - Buy vs Sell volume per level (delta)
 */

export interface VolumeProfileLevel {
  price: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;        // buyVolume - sellVolume
  pct: number;          // percentage of total volume (0-1)
  isPOC: boolean;
  isValueArea: boolean;
}

export interface VolumeProfileData {
  levels: VolumeProfileLevel[];
  poc: number;           // POC price
  vah: number;           // Value Area High
  val: number;           // Value Area Low
  totalVolume: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  highPrice: number;
  lowPrice: number;
}

export class ReplayVolumeProfile {
  private volumeMap = new Map<number, { buy: number; sell: number }>();
  private tickSize: number;
  private totalVolume = 0;
  private totalBuy = 0;
  private totalSell = 0;
  private highPrice = -Infinity;
  private lowPrice = Infinity;

  constructor(tickSize: number = 0.25) {
    this.tickSize = tickSize;
  }

  /**
   * Round price to nearest tick
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.tickSize) * this.tickSize;
  }

  /**
   * Add a trade to the profile
   */
  addTrade(price: number, size: number, side: 'BID' | 'ASK'): void {
    const roundedPrice = this.roundToTick(price);

    if (roundedPrice > this.highPrice) this.highPrice = roundedPrice;
    if (roundedPrice < this.lowPrice) this.lowPrice = roundedPrice;

    const existing = this.volumeMap.get(roundedPrice) || { buy: 0, sell: 0 };
    if (side === 'BID') {
      existing.buy += size;
      this.totalBuy += size;
    } else {
      existing.sell += size;
      this.totalSell += size;
    }
    this.volumeMap.set(roundedPrice, existing);
    this.totalVolume += size;
  }

  /**
   * Compute the full profile with POC and Value Area
   */
  getProfile(): VolumeProfileData {
    if (this.volumeMap.size === 0) {
      return {
        levels: [],
        poc: 0,
        vah: 0,
        val: 0,
        totalVolume: 0,
        totalBuyVolume: 0,
        totalSellVolume: 0,
        highPrice: 0,
        lowPrice: 0,
      };
    }

    // Build sorted levels
    const entries = Array.from(this.volumeMap.entries()).map(([price, vol]) => ({
      price,
      totalVolume: vol.buy + vol.sell,
      buyVolume: vol.buy,
      sellVolume: vol.sell,
    }));

    entries.sort((a, b) => b.price - a.price); // High to low

    // Find POC (max volume level)
    let pocPrice = entries[0].price;
    let maxVol = 0;
    for (const e of entries) {
      if (e.totalVolume > maxVol) {
        maxVol = e.totalVolume;
        pocPrice = e.price;
      }
    }

    // Compute Value Area (70% of total volume around POC)
    const valueAreaTarget = this.totalVolume * 0.7;
    const pocIdx = entries.findIndex(e => e.price === pocPrice);

    let vaVolume = entries[pocIdx]?.totalVolume || 0;
    let vaHigh = pocIdx;
    let vaLow = pocIdx;

    while (vaVolume < valueAreaTarget && (vaHigh > 0 || vaLow < entries.length - 1)) {
      const aboveVol = vaHigh > 0 ? entries[vaHigh - 1].totalVolume : 0;
      const belowVol = vaLow < entries.length - 1 ? entries[vaLow + 1].totalVolume : 0;

      if (aboveVol >= belowVol && vaHigh > 0) {
        vaHigh--;
        vaVolume += entries[vaHigh].totalVolume;
      } else if (vaLow < entries.length - 1) {
        vaLow++;
        vaVolume += entries[vaLow].totalVolume;
      } else {
        break;
      }
    }

    const vahPrice = entries[vaHigh]?.price || pocPrice;
    const valPrice = entries[vaLow]?.price || pocPrice;

    // Build final levels with metadata
    const levels: VolumeProfileLevel[] = entries.map(e => ({
      price: e.price,
      totalVolume: e.totalVolume,
      buyVolume: e.buyVolume,
      sellVolume: e.sellVolume,
      delta: e.buyVolume - e.sellVolume,
      pct: this.totalVolume > 0 ? e.totalVolume / this.totalVolume : 0,
      isPOC: e.price === pocPrice,
      isValueArea: e.price <= vahPrice && e.price >= valPrice,
    }));

    return {
      levels,
      poc: pocPrice,
      vah: vahPrice,
      val: valPrice,
      totalVolume: this.totalVolume,
      totalBuyVolume: this.totalBuy,
      totalSellVolume: this.totalSell,
      highPrice: this.highPrice,
      lowPrice: this.lowPrice,
    };
  }

  /**
   * Reset the profile
   */
  reset(): void {
    this.volumeMap.clear();
    this.totalVolume = 0;
    this.totalBuy = 0;
    this.totalSell = 0;
    this.highPrice = -Infinity;
    this.lowPrice = Infinity;
  }
}
