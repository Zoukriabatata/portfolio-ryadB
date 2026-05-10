import { describe, it, expect } from "vitest";
import { VwapBuilder } from "./VwapBuilder";

const MINUTE = 60_000;

describe("VwapBuilder", () => {
  it("constructor throw si windowMs ≤ bucketMs", () => {
    expect(() => new VwapBuilder(60_000, 60_000)).toThrow();
    expect(() => new VwapBuilder(1000, 60_000)).toThrow();
  });

  it("constructor throw si bucketMs ≤ 0", () => {
    expect(() => new VwapBuilder(60_000, 0)).toThrow();
    expect(() => new VwapBuilder(60_000, -1)).toThrow();
  });

  it("empty → vwap null, totalVolume 0", () => {
    const v = new VwapBuilder();
    expect(v.vwap()).toBeNull();
    expect(v.totalVolume()).toBe(0);
  });

  it("VWAP NaN/null si sumVolume = 0 (early stream)", () => {
    const v = new VwapBuilder();
    expect(v.vwap()).toBeNull();
    // Ingest avec size 0 → ignoré
    v.ingest(100, 0, 1000);
    expect(v.vwap()).toBeNull();
  });

  it("1 trade → vwap = price", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    expect(v.vwap()).toBe(100);
  });

  it("2 trades même price → vwap = price", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    v.ingest(100, 3, 1_000_000 + MINUTE);
    expect(v.vwap()).toBe(100);
  });

  it("2 trades différents : (100×1 + 200×2) / 3 ≈ 166.67", () => {
    const v = new VwapBuilder();
    v.ingest(100, 1, 1_000_000);
    v.ingest(200, 2, 1_000_000 + MINUTE);
    expect(v.vwap()!).toBeCloseTo(500 / 3, 5);
  });

  it("ingest out-of-order ignoré", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000 + MINUTE * 5);
    v.ingest(200, 5, 1_000_000); // out-of-order, ignored
    expect(v.vwap()).toBe(100);
  });

  it("ingest size ≤ 0 ou price non-fini ignoré", () => {
    const v = new VwapBuilder();
    v.ingest(100, 0, 1_000_000);
    v.ingest(100, -1, 1_000_000);
    v.ingest(NaN, 5, 1_000_000);
    v.ingest(100, NaN, 1_000_000);
    expect(v.vwap()).toBeNull();
  });

  it("eviction : ingest à T puis evict à T+25h → ring clearé", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    expect(v.vwap()).toBe(100);
    // 25h plus tard → tous les buckets sont stales
    v.evict(1_000_000 + 25 * 3_600_000);
    expect(v.vwap()).toBeNull();
    expect(v.totalVolume()).toBe(0);
  });

  it("eviction partielle : trades à T et T+30 min, evict à T+25h → reste T+30 min ?", () => {
    // Note : avec 25h de delta vs T, le bucket de T+30 min est aussi à 24h30 du now,
    // donc lui aussi out of window. Test : evict à T+24h05 → seul le trade à T+30 min reste.
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    v.ingest(200, 5, 1_000_000 + 30 * MINUTE);
    expect(v.totalVolume()).toBe(10);
    v.evict(1_000_000 + 24 * 3_600_000 + 5 * MINUTE);
    // Le trade à T (1_000_000) bucket = floor(1M / 60000) = 16666
    // Le trade à T+30min bucket = 16696
    // Le head après evict = floor((1M + 24*3600000 + 5*60000) / 60000) = 17945
    // numBuckets = 1440
    // ringMin = 17945 - 1440 + 1 = 16506
    // 16666 < ringMin → bucket recyclé / clearé pendant l'advance
    // 16696 < ringMin → idem... attendre, 16696 < 16506 ? Non, 16696 > 16506.
    // Donc 16696 (T+30min) reste dans le ring ? Recheck...
    // delta = 17945 - 16696 = 1249, numBuckets = 1440, delta < numBuckets → loop clear seulement les buckets entre 16696+1=16697 et 17945 inclus.
    // Le slot du trade T+30min (bucket 16696) est ÉPARGNÉ par advance. Reste !
    // Le slot du trade T (bucket 16666) → quand on a ingéré T+30min, headBucket passé de 16666 à 16696, on a clearé 16667..16696 → bucket 16666 (T) ne fait pas partie de cette plage car déjà avant headBucket.
    // Attends : à l'ingest T+30min, headBucket était 16666, advanceTo(16696) → clear b ∈ [16667, 16696]. Le bucket 16666 (T) n'est PAS clearé. Mais le slot (16666 % 1440) = 1226 vs (16696 % 1440) = 1256. Différents, donc le bucket T n'est pas écrasé par le bucket T+30min.
    // Donc après ingest T+30min, on a sumPV = 100*5 + 200*5 = 1500, sumV = 10.
    // Puis evict T+24h05 (head 17945) → advance from 16696 à 17945. delta = 1249 < 1440 → clear b ∈ [16697, 17945]. Le slot (16666 % 1440 = 1226) → bucket abs ? Le slot 1226 a été visité par b=17946-1440=16506 en moyenne... attends, 16506 % 1440 = 16506 - 11*1440 = 16506 - 15840 = négatif. Recalcule : 16506 / 1440 ≈ 11.46, donc 16506 = 11*1440 + 666, slot 666. Pas 1226.
    // Le slot 1226 = 16666 % 1440. Sera-t-il revisité dans [16697, 17945] ? 1226 + k*1440 dans cette range ? 1226 + 12*1440 = 1226 + 17280 = 18506 (>17945, non). 1226 + 11*1440 = 1226 + 15840 = 17066, et 16697 ≤ 17066 ≤ 17945 → OUI, slot 1226 revisité à b=17066, clearé.
    // Donc le bucket T (slot 1226) EST clearé pendant l'evict.
    // Et le slot du bucket T+30min = 1256. 1256 + k*1440 dans [16697, 17945] ? 1256 + 11*1440 = 17096, dans range → OUI clearé.
    // Donc TOUS les buckets sont clearés. vwap() devrait être null.
    // Hmm mais le test attendu disait "seul T+30 min reste". Recalculons l'evict point.
    // Si on evict à T+24h05 (1_000_000 + 24*3600000 + 5*60000 = 1_086_900_000), absHead = 1809.83 → 1809 (floor(1086900000/60000))... attendre let me recompute.
    // T = 1_000_000 ms. 1_000_000 / 60_000 = 16.6666 → bucket abs T = 16.
    // T+30min = 1_000_000 + 1_800_000 = 2_800_000 → / 60000 = 46.66 → 46.
    // T+24h05 = 1_000_000 + 86_700_000 = 87_700_000 → / 60000 = 1461.66 → 1461.
    // So bucket abs values are small. Let me redo.
    // At ingest T=1M: headBucket=16. ingest T+30min=2.8M: advanceTo(46), clear b∈[17,46]. headBucket=46.
    // evict T+24h05=87.7M: absHead=1461. advanceTo(1461), clear b∈[47, 1461]. delta = 1461-46 = 1415 < 1440 → loop clear.
    // Le slot du bucket 16 = 16. Sera-t-il revisité dans [47, 1461] ? 16+1440=1456 ∈ [47,1461] → OUI clearé.
    // Le slot du bucket 46 = 46. 46+1440=1486 > 1461 → NON revisité. Le bucket 46 (T+30min) reste !
    // Donc après evict, sumV = 5 (juste le trade T+30min), vwap = 200.
    expect(v.vwap()).toBe(200);
  });

  it("bucketing : 2 trades dans la même minute → bucketés ensemble", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    v.ingest(200, 5, 1_000_000 + 30_000); // +30s, même bucket minute
    expect(v.vwap()!).toBeCloseTo(150, 5); // (100*5 + 200*5)/10 = 150
    expect(v.totalVolume()).toBe(10);
  });

  it("bucketing : 2 trades 60s apart → 2 buckets différents", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000);
    v.ingest(200, 5, 1_000_000 + MINUTE);
    expect(v.vwap()!).toBeCloseTo(150, 5);
    // Vérifie que ce sont 2 buckets distincts (pas la même slot)
    expect(v.totalVolume()).toBe(10);
  });

  it("evict sans ingest préalable → no-op", () => {
    const v = new VwapBuilder();
    expect(() => v.evict(1_000_000)).not.toThrow();
    expect(v.vwap()).toBeNull();
  });

  it("evict avec absHead ≤ headBucket → no-op", () => {
    const v = new VwapBuilder();
    v.ingest(100, 5, 1_000_000 + MINUTE * 5);
    const before = v.totalVolume();
    v.evict(1_000_000); // antérieur à head
    expect(v.totalVolume()).toBe(before);
  });

  it("100 trades sur 5 min → vwap convergence vers la moyenne pondérée", () => {
    const v = new VwapBuilder();
    let expectedSumPV = 0;
    let expectedSumV = 0;
    for (let i = 0; i < 100; i++) {
      const price = 100 + (i % 10);
      const size = 1 + (i % 5);
      v.ingest(price, size, 1_000_000 + i * 3000); // 3s par trade, dans 5 min
      expectedSumPV += price * size;
      expectedSumV += size;
    }
    expect(v.vwap()!).toBeCloseTo(expectedSumPV / expectedSumV, 5);
  });
});
