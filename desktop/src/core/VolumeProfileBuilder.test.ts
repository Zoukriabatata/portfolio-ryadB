import { describe, it, expect } from "vitest";
import { VolumeProfileBuilder } from "./VolumeProfileBuilder";
import { createGridSystem, type GridSystemSpec } from "./GridSystem";

const SPEC: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 1000,
  nowExchangeMs: 1000,
  tickSize: 1,
  priceMin: 100,
  priceMax: 110,
};

describe("VolumeProfileBuilder", () => {
  it("constructor refuse priceLevels ≤ 0", () => {
    expect(() => new VolumeProfileBuilder(0)).toThrow();
    expect(() => new VolumeProfileBuilder(-5)).toThrow();
  });

  it("empty → poc null, valueArea null, totalVolume 0", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    expect(b.poc(grid)).toBeNull();
    expect(b.valueArea(0.7, grid)).toBeNull();
    expect(b.totalVolume()).toBe(0);
  });

  it("1 trade unique → poc = prix mid-tick de ce trade", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 5, grid);
    // priceIndex(105) = 5, mid-tick = 100 + 5.5 = 105.5
    expect(b.poc(grid)).toBeCloseTo(105.5, 5);
    expect(b.totalVolume()).toBe(5);
  });

  it("addTrade ignore size ≤ 0 ou non-fini", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 0, grid);
    b.addTrade(105, -1, grid);
    b.addTrade(105, NaN, grid);
    expect(b.totalVolume()).toBe(0);
  });

  it("addTrade ignore prix hors viewport", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(999, 100, grid);
    b.addTrade(50, 100, grid);
    expect(b.totalVolume()).toBe(0);
  });

  it("addTrade ignore si grid.priceLevels mismatch", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(20); // mismatch (grid a 10)
    b.addTrade(105, 5, grid);
    expect(b.totalVolume()).toBe(0);
  });

  it("reset() remet tout à 0", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 5, grid);
    b.addTrade(106, 8, grid);
    b.reset();
    expect(b.totalVolume()).toBe(0);
    expect(b.poc(grid)).toBeNull();
  });

  it("addTrade accumule sur le même price", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 3, grid);
    b.addTrade(105, 7, grid);
    expect(b.totalVolume()).toBe(10);
  });

  it("valueArea POC au milieu, extension symétrique 70 %", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    // POC fort au milieu, volumes symétriques décroissants
    b.addTrade(101, 1, grid); // idx 1
    b.addTrade(102, 2, grid); // idx 2
    b.addTrade(103, 5, grid); // idx 3
    b.addTrade(104, 10, grid); // idx 4
    b.addTrade(105, 20, grid); // idx 5 ← POC
    b.addTrade(106, 10, grid); // idx 6
    b.addTrade(107, 5, grid); // idx 7
    b.addTrade(108, 2, grid); // idx 8
    b.addTrade(109, 1, grid); // idx 9
    // total = 56, target 70% = 39.2
    // POC = idx 5 (vol 20). Extend : compare idx4(10) vs idx6(10) → tie, take above → hi=6 (acc=30)
    // Compare idx4(10) vs idx7(5) → below, lo=4 (acc=40 ≥ 39.2). Stop.
    const va = b.valueArea(0.7, grid);
    expect(va).not.toBeNull();
    expect(va!.vah).toBeCloseTo(106.5, 5); // idx 6 mid-tick
    expect(va!.val).toBeCloseTo(104.5, 5); // idx 4 mid-tick
  });

  it("valueArea POC au bord supérieur (extension vers le bas seulement)", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(108, 5, grid); // idx 8
    b.addTrade(109, 20, grid); // idx 9 ← POC bord supérieur
    // total = 25, target 70% = 17.5
    // POC = idx 9 (vol 20 ≥ 17.5). Loop n'execute pas (acc déjà ≥ target).
    const va = b.valueArea(0.7, grid);
    expect(va!.vah).toBeCloseTo(109.5, 5);
    expect(va!.val).toBeCloseTo(109.5, 5);
  });

  it("valueArea POC au bord inférieur (extension vers le haut seulement)", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(100, 30, grid); // idx 0 ← POC bord inférieur
    b.addTrade(101, 5, grid); // idx 1
    b.addTrade(102, 5, grid); // idx 2
    // total = 40, target 70% = 28
    // POC = idx 0 (vol 30 ≥ 28). Loop n'execute pas (acc déjà ≥ target).
    const va = b.valueArea(0.7, grid);
    expect(va!.vah).toBeCloseTo(100.5, 5);
    expect(va!.val).toBeCloseTo(100.5, 5);
  });

  it("valueArea single bucket → VAH = VAL = POC", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 50, grid);
    const va = b.valueArea(0.7, grid);
    expect(va!.vah).toBeCloseTo(105.5, 5);
    expect(va!.val).toBeCloseTo(105.5, 5);
  });

  it("valueArea empty → null", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    expect(b.valueArea(0.7, grid)).toBeNull();
  });

  it("valueArea widthPct = 0 → juste POC", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(104, 5, grid);
    b.addTrade(105, 10, grid);
    b.addTrade(106, 5, grid);
    const va = b.valueArea(0, grid);
    expect(va!.vah).toBeCloseTo(105.5, 5);
    expect(va!.val).toBeCloseTo(105.5, 5);
  });

  it("valueArea widthPct = 1 → couvre toute la range avec volume (dense)", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    // Distribution dense (idx 2..8) : algo n'a pas à traverser de buckets vides
    b.addTrade(102, 5, grid);
    b.addTrade(103, 5, grid);
    b.addTrade(104, 5, grid);
    b.addTrade(105, 10, grid); // POC
    b.addTrade(106, 5, grid);
    b.addTrade(107, 5, grid);
    b.addTrade(108, 5, grid);
    const va = b.valueArea(1, grid);
    expect(va!.vah).toBeCloseTo(108.5, 5);
    expect(va!.val).toBeCloseTo(102.5, 5);
  });

  it("valueArea sparse + widthPct = 1 : extension peut traverser des trous", () => {
    // Avec des buckets vides entre les trades, l'algo va potentiellement
    // étendre jusqu'aux bornes (vol 0 sur les bords). Comportement strict
    // du standard CME : extension par max volume voisin, ties → above.
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(102, 5, grid);
    b.addTrade(105, 10, grid);
    b.addTrade(108, 5, grid);
    const va = b.valueArea(1, grid);
    // Le va inclut au minimum les 3 trades mais peut s'étendre plus loin
    // si l'algo passe à travers des 0. Sanity : VAL ≤ 102.5 ≤ POC ≤ VAH.
    expect(va!.val).toBeLessThanOrEqual(102.5);
    expect(va!.vah).toBeGreaterThanOrEqual(108.5);
  });

  it("toFloat32Array retourne une COPIE défensive", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 5, grid);
    const copy = b.toFloat32Array();
    copy[5] = 9999;
    // L'interne ne change pas
    expect(b.totalVolume()).toBe(5);
  });

  // REFONTE-4c — accessors zero-copy
  it("pocIndex() empty → -1", () => {
    const b = new VolumeProfileBuilder(10);
    expect(b.pocIndex()).toBe(-1);
  });

  it("pocIndex() 1 trade → priceIndex correct", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 5, grid); // priceIndex(105) = 5
    expect(b.pocIndex()).toBe(5);
  });

  it("valueAreaIndices(0.7) empty → null", () => {
    const b = new VolumeProfileBuilder(10);
    expect(b.valueAreaIndices(0.7)).toBeNull();
  });

  it("valueAreaIndices(0.7) cohérent avec valueArea(0.7) en prix", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    // Distribution dense (idx 2..8)
    b.addTrade(102, 5, grid);
    b.addTrade(103, 5, grid);
    b.addTrade(104, 5, grid);
    b.addTrade(105, 10, grid); // POC idx 5
    b.addTrade(106, 5, grid);
    b.addTrade(107, 5, grid);
    b.addTrade(108, 5, grid);
    const idx = b.valueAreaIndices(0.7)!;
    const va = b.valueArea(0.7, grid)!;
    // val/vah indices doivent matcher les prix mid-tick correspondants
    expect(grid.priceMin + (idx.val + 0.5) * grid.tickSize).toBeCloseTo(
      va.val,
      5,
    );
    expect(grid.priceMin + (idx.vah + 0.5) * grid.tickSize).toBeCloseTo(
      va.vah,
      5,
    );
  });

  it("getVolumesView() retourne la MÊME ref à 2 appels (zero-copy)", () => {
    const b = new VolumeProfileBuilder(10);
    const v1 = b.getVolumesView();
    const v2 = b.getVolumesView();
    expect(v1).toBe(v2);
  });

  it("getVolumesView() mutation externe affecte l'interne (preuve zero-copy + responsabilité documentée)", () => {
    const grid = createGridSystem(SPEC);
    const b = new VolumeProfileBuilder(10);
    b.addTrade(105, 5, grid);
    const view = b.getVolumesView() as Float32Array;
    view[5] = 999;
    // L'interne EST modifié — c'est attendu, le contrat est typing-only.
    expect(b.totalVolume()).toBe(999);
  });
});
