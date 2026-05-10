import type { GridSystem } from "./GridSystem";

// Profil de volume par price level. Rebuild from-scratch chaque tick depuis
// TradesBuffer (pas incremental ingest/evict). Coût rebuild = O(N_trades),
// trivial à 10 Hz pour ≤50k trades.
//
// Volumes indexés par priceIndex du grid courant. Si viewport change avec
// dim change, l'engine recrée un nouveau builder (cf. setViewport).
export class VolumeProfileBuilder {
  private readonly volumes: Float32Array;
  private readonly priceLevels: number;

  constructor(priceLevels: number) {
    if (priceLevels <= 0) {
      throw new Error(
        `VolumeProfileBuilder: priceLevels must be > 0, got ${priceLevels}`,
      );
    }
    this.priceLevels = priceLevels;
    this.volumes = new Float32Array(priceLevels);
  }

  reset(): void {
    this.volumes.fill(0);
  }

  addTrade(price: number, size: number, grid: GridSystem): void {
    if (size <= 0 || !Number.isFinite(size)) return;
    if (grid.priceLevels !== this.priceLevels) return;
    const pIdx = grid.priceIndex(price);
    if (pIdx === -1) return;
    this.volumes[pIdx] += size;
  }

  totalVolume(): number {
    let sum = 0;
    for (let i = 0; i < this.priceLevels; i++) sum += this.volumes[i];
    return sum;
  }

  // Retourne le PRIX mid-tick du bucket avec volume max. null si vide.
  poc(grid: GridSystem): number | null {
    let maxIdx = -1;
    let maxVol = 0;
    for (let i = 0; i < this.priceLevels; i++) {
      if (this.volumes[i] > maxVol) {
        maxVol = this.volumes[i];
        maxIdx = i;
      }
    }
    if (maxIdx === -1) return null;
    return grid.priceMin + (maxIdx + 0.5) * grid.tickSize;
  }

  // Value Area : extension alternée stricte autour du POC jusqu'à atteindre
  // widthPct du volume total. Algo institutionnel standard (CME/ATAS/Sierra).
  // null si total volume = 0. widthPct = 0 → juste POC. widthPct = 1 → tout.
  valueArea(
    widthPct: number,
    grid: GridSystem,
  ): { vah: number; val: number } | null {
    let total = 0;
    let pocIdx = -1;
    let pocVol = 0;
    for (let i = 0; i < this.priceLevels; i++) {
      total += this.volumes[i];
      if (this.volumes[i] > pocVol) {
        pocVol = this.volumes[i];
        pocIdx = i;
      }
    }
    if (total <= 0 || pocIdx === -1) return null;

    const target = total * widthPct;
    let acc = pocVol;
    let lo = pocIdx;
    let hi = pocIdx;

    while (acc < target && (lo > 0 || hi < this.priceLevels - 1)) {
      const volBelow = lo > 0 ? this.volumes[lo - 1] : -1;
      const volAbove =
        hi < this.priceLevels - 1 ? this.volumes[hi + 1] : -1;
      if (volAbove >= volBelow && volAbove >= 0) {
        hi++;
        acc += volAbove;
      } else if (volBelow >= 0) {
        lo--;
        acc += volBelow;
      } else {
        break; // safety net (ne devrait pas arriver vu la condition while)
      }
    }

    return {
      vah: grid.priceMin + (hi + 0.5) * grid.tickSize,
      val: grid.priceMin + (lo + 0.5) * grid.tickSize,
    };
  }

  // Copie défensive pour la VolumeProfileLayer REFONTE-4c (consommation lente,
  // hors frame loop). Allocation OK ici.
  toFloat32Array(): Float32Array {
    return new Float32Array(this.volumes);
  }

  // REFONTE-4c — accessors zero-copy pour la VolumeProfileLayer.
  // Pas de modification de la logique métier existante (poc/valueArea inchangés).

  // Index (priceIndex) du bucket avec volume max. -1 si vide.
  pocIndex(): number {
    let maxIdx = -1;
    let maxVol = 0;
    for (let i = 0; i < this.priceLevels; i++) {
      if (this.volumes[i] > maxVol) {
        maxVol = this.volumes[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  // {val, vah} en INDICES (algo strictement identique à valueArea sans
  // mapping prix). null si total = 0.
  valueAreaIndices(
    widthPct: number,
  ): { val: number; vah: number } | null {
    let total = 0;
    let pocIdx = -1;
    let pocVol = 0;
    for (let i = 0; i < this.priceLevels; i++) {
      total += this.volumes[i];
      if (this.volumes[i] > pocVol) {
        pocVol = this.volumes[i];
        pocIdx = i;
      }
    }
    if (total <= 0 || pocIdx === -1) return null;
    const target = total * widthPct;
    let acc = pocVol;
    let lo = pocIdx;
    let hi = pocIdx;
    while (acc < target && (lo > 0 || hi < this.priceLevels - 1)) {
      const volBelow = lo > 0 ? this.volumes[lo - 1] : -1;
      const volAbove =
        hi < this.priceLevels - 1 ? this.volumes[hi + 1] : -1;
      if (volAbove >= volBelow && volAbove >= 0) {
        hi++;
        acc += volAbove;
      } else if (volBelow >= 0) {
        lo--;
        acc += volBelow;
      } else {
        break;
      }
    }
    return { val: lo, vah: hi };
  }

  // Vue zero-copy en lecture seule sur le buffer interne.
  // DO NOT MUTATE — la layer qui consomme s'engage à ne lire que.
  // Float32Array natif n'a pas de Readonly runtime, contrat purement TS.
  getVolumesView(): Readonly<Float32Array> {
    return this.volumes;
  }
}
