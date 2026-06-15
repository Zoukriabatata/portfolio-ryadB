# Heatmap — NinjaTrader / Quantower Bridge Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the desktop liquidity heatmap (`/heatmap`) draw its order-book depth from the NinjaTrader bridge or the Quantower bridge, following the same source the footprint uses — instead of being hardcoded to Bybit BTCUSDT.

**Architecture:** A new `BridgeDepthHeatmapAdapter` (mirror of `OrderbookAdapter`) subscribes to the bridges' existing `bridge-depth-update` / `quantower-depth-update` Tauri events (`DepthSnapshot[]`) and converts them to the engine's `OrderbookSnapshot`. `HeatmapLive` reads the footprint's `orderflow.dataSource` localStorage pref to choose the adapter. Because `HeatmapEngine.tickSize` is `readonly`, the engine is now **built lazily on the first snapshot**, inferring tick size from the price grid — which also removes the hardcoded BTC tick/mid. Scope is **depth/liquidity only**; trade-driven overlays (bubbles, volume profile, VWAP) from the bridge are an explicit phase 2.

**Tech Stack:** TypeScript, React, Tauri events (`@tauri-apps/api/event`), regl/WebGL (existing `HeatmapEngine`), Vitest (desktop config: `include: ["src/**/*.test.ts"]`, `environment: node`).

---

## Background facts (verified)

- **Engine snapshot type** (`desktop/src/core/types.ts`):
  ```ts
  export interface OrderbookLevel { price: number; size: number }
  export interface OrderbookSnapshot { exchangeMs: number; bids: OrderbookLevel[]; asks: OrderbookLevel[] }
  ```
- **Bridge depth payload** (`desktop/src/lib/bridge_depth/api.ts`, same shape for Quantower):
  ```ts
  type DepthLevel = { price: number; volume: number };
  type DepthSnapshot = { symbol: string; bids: DepthLevel[]; asks: DepthLevel[]; lastUpdateNs: number };
  ```
  Bids sorted best-first (high→low), asks best-first (low→high).
- **Events** (Rust, verified): NT → `"bridge-depth-update"`, Quantower → `"quantower-depth-update"`, both emit `DepthSnapshot[]` (a batch, one entry per dirty book).
- **Source pref** (`desktop/src/components/MultiSourceFootprint.tsx`): `localStorage["orderflow.dataSource"]` ∈ `"rithmic" | "bridge" | "quantower"`.
- **Engine tick** (`desktop/src/render/HeatmapEngine.ts:229`): `private readonly tickSize` — fixed at construction. Must be known before `new HeatmapEngine(...)`.
- **`OrderbookAdapter`** (`desktop/src/adapters/OrderbookAdapter.ts`) is the pattern to mirror: pure `parse*` function + class with `start(cb)` / `dispose()`.
- **Out of scope (Rithmic):** there is no L2 depth event wired for Rithmic; when `dataSource === "rithmic"` the heatmap keeps the existing Bybit demo path.

---

## File Structure

**Create:**
- `desktop/src/lib/heatmap/inferTickSize.ts` — pure helper: smallest positive gap between adjacent price levels.
- `desktop/src/lib/heatmap/inferTickSize.test.ts` — tests.
- `desktop/src/adapters/BridgeDepthHeatmapAdapter.ts` — bridge depth → `OrderbookSnapshot` (pure parse fn + listener class).
- `desktop/src/adapters/BridgeDepthHeatmapAdapter.test.ts` — tests.

**Modify:**
- `desktop/src/dev/HeatmapLive.tsx` — defer engine creation to first snapshot; source-select the data subscription; bridge path = depth only.

---

## Task 1: `inferTickSize` helper

**Files:**
- Create: `desktop/src/lib/heatmap/inferTickSize.ts`
- Test: `desktop/src/lib/heatmap/inferTickSize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `desktop/src/lib/heatmap/inferTickSize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { inferTickSize } from "./inferTickSize";

describe("inferTickSize", () => {
  it("infers 0.25 from an ES-style ladder", () => {
    const prices = [5000.0, 5000.25, 5000.5, 5000.75, 5001.0];
    expect(inferTickSize(prices)).toBeCloseTo(0.25, 10);
  });

  it("infers 0.1 from a BTC-style ladder with gaps (missing levels)", () => {
    // 0.1 grid but with a hole between 100.1 and 100.4
    const prices = [100.0, 100.1, 100.4, 100.5];
    expect(inferTickSize(prices)).toBeCloseTo(0.1, 10);
  });

  it("ignores duplicate / unsorted prices", () => {
    const prices = [101.0, 100.0, 100.0, 100.5, 100.5];
    expect(inferTickSize(prices)).toBeCloseTo(0.5, 10);
  });

  it("returns null when fewer than 2 distinct prices", () => {
    expect(inferTickSize([100.0])).toBeNull();
    expect(inferTickSize([100.0, 100.0])).toBeNull();
    expect(inferTickSize([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd desktop && npx vitest run src/lib/heatmap/inferTickSize.test.ts`
Expected: FAIL — `Cannot find module './inferTickSize'`.

- [ ] **Step 3: Implement the helper**

Create `desktop/src/lib/heatmap/inferTickSize.ts`:

```ts
/**
 * Infer the price tick size from a set of order-book level prices by taking the
 * smallest positive gap between adjacent (sorted, de-duplicated) prices.
 *
 * Robust to missing levels (holes in the ladder): the true tick is the GCD-ish
 * minimum gap, and a full L2 book of depth ~10+ almost always contains at least
 * one pair of adjacent on-grid levels. Returns null if it can't be determined
 * (fewer than 2 distinct prices).
 *
 * Float-safe: gaps are rounded to 1e-9 before taking the min so FP noise
 * (e.g. 0.30000000000000004) doesn't produce a spurious tiny tick.
 */
export function inferTickSize(prices: readonly number[]): number | null {
  const distinct = Array.from(
    new Set(prices.filter((p) => Number.isFinite(p))),
  ).sort((a, b) => a - b);
  if (distinct.length < 2) return null;

  let min = Infinity;
  for (let i = 1; i < distinct.length; i++) {
    const gap = Math.round((distinct[i] - distinct[i - 1]) * 1e9) / 1e9;
    if (gap > 0 && gap < min) min = gap;
  }
  return Number.isFinite(min) ? min : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd desktop && npx vitest run src/lib/heatmap/inferTickSize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/lib/heatmap/inferTickSize.ts desktop/src/lib/heatmap/inferTickSize.test.ts
git commit -m "feat(heatmap): inferTickSize helper from order-book ladder"
```

---

## Task 2: `BridgeDepthHeatmapAdapter`

**Files:**
- Create: `desktop/src/adapters/BridgeDepthHeatmapAdapter.ts`
- Test: `desktop/src/adapters/BridgeDepthHeatmapAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `desktop/src/adapters/BridgeDepthHeatmapAdapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickAndConvertDepthBatch } from "./BridgeDepthHeatmapAdapter";

const batch = [
  {
    symbol: "ES 06-26",
    lastUpdateNs: 1_700_000_000_000_000_000,
    bids: [{ price: 5000.25, volume: 12 }, { price: 5000.0, volume: 30 }],
    asks: [{ price: 5000.5, volume: 8 }, { price: 5000.75, volume: 20 }],
  },
  {
    symbol: "NQ 06-26",
    lastUpdateNs: 1_700_000_000_000_000_000,
    bids: [{ price: 18000.0, volume: 5 }],
    asks: [{ price: 18000.25, volume: 7 }],
  },
];

describe("pickAndConvertDepthBatch", () => {
  it("converts the matching symbol: volume->size, lastUpdateNs->exchangeMs(ms)", () => {
    const snap = pickAndConvertDepthBatch(batch, "ES 06-26");
    expect(snap).not.toBeNull();
    expect(snap!.exchangeMs).toBe(1_700_000_000_000); // floor(ns / 1e6)
    expect(snap!.bids).toEqual([
      { price: 5000.25, size: 12 },
      { price: 5000.0, size: 30 },
    ]);
    expect(snap!.asks[0]).toEqual({ price: 5000.5, size: 8 });
  });

  it("falls back to the first entry when symbol is null", () => {
    const snap = pickAndConvertDepthBatch(batch, null);
    expect(snap!.bids[0].price).toBe(5000.25); // ES, the first entry
  });

  it("returns null when the symbol is absent and not falling back", () => {
    expect(pickAndConvertDepthBatch(batch, "CL 06-26")).toBeNull();
  });

  it("returns null for an empty or malformed batch", () => {
    expect(pickAndConvertDepthBatch([], null)).toBeNull();
    expect(pickAndConvertDepthBatch(null as unknown as [], null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd desktop && npx vitest run src/adapters/BridgeDepthHeatmapAdapter.test.ts`
Expected: FAIL — `Cannot find module './BridgeDepthHeatmapAdapter'`.

- [ ] **Step 3: Implement the adapter**

Create `desktop/src/adapters/BridgeDepthHeatmapAdapter.ts`:

```ts
// Bridges (NinjaTrader / Quantower) push L2 depth as a batch of DepthSnapshot
// on "bridge-depth-update" / "quantower-depth-update". This adapter converts
// the active symbol's snapshot into the heatmap engine's OrderbookSnapshot.
//
// Shape diff handled here:
//   DepthLevel { price, volume }  ->  OrderbookLevel { price, size }
//   lastUpdateNs (u64 ns)         ->  exchangeMs = floor(ns / 1e6)
//
// The bridge connects to ONE chart, so the batch is usually a single symbol;
// `symbol === null` (current active symbol unknown) picks the first entry.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { OrderbookSnapshot } from "../core";

export type BridgeDepthEvent = "bridge-depth-update" | "quantower-depth-update";

interface DepthLevel { price: number; volume: number }
interface DepthSnapshot {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastUpdateNs: number;
}

function convertOne(d: DepthSnapshot): OrderbookSnapshot {
  const exchangeMs = Math.floor(d.lastUpdateNs / 1_000_000);
  const bids = new Array(d.bids.length);
  for (let i = 0; i < d.bids.length; i++) {
    bids[i] = { price: d.bids[i].price, size: d.bids[i].volume };
  }
  const asks = new Array(d.asks.length);
  for (let i = 0; i < d.asks.length; i++) {
    asks[i] = { price: d.asks[i].price, size: d.asks[i].volume };
  }
  return { exchangeMs, bids, asks };
}

/** Pure, testable: pick the target symbol from a batch and convert it. When
 *  `symbol` is null, fall back to the first snapshot. Returns null if the batch
 *  is empty/invalid or the named symbol is absent. */
export function pickAndConvertDepthBatch(
  batch: DepthSnapshot[],
  symbol: string | null,
): OrderbookSnapshot | null {
  if (!Array.isArray(batch) || batch.length === 0) return null;
  const chosen = symbol == null
    ? batch[0]
    : batch.find((d) => d.symbol === symbol) ?? null;
  if (!chosen || !Array.isArray(chosen.bids) || !Array.isArray(chosen.asks)) {
    return null;
  }
  return convertOne(chosen);
}

export class BridgeDepthHeatmapAdapter {
  private unlisten: UnlistenFn | null = null;

  constructor(private readonly event: BridgeDepthEvent) {}

  /** `getSymbol` is read on every batch so the active contract can change
   *  without re-subscribing; return null to always take the first entry. */
  async start(
    callback: (snap: OrderbookSnapshot) => void,
    getSymbol: () => string | null = () => null,
  ): Promise<void> {
    this.unlisten = await listen<DepthSnapshot[]>(this.event, (e) => {
      const snap = pickAndConvertDepthBatch(e.payload, getSymbol());
      if (snap) callback(snap);
    });
  }

  dispose(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd desktop && npx vitest run src/adapters/BridgeDepthHeatmapAdapter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/adapters/BridgeDepthHeatmapAdapter.ts desktop/src/adapters/BridgeDepthHeatmapAdapter.test.ts
git commit -m "feat(heatmap): bridge depth -> OrderbookSnapshot adapter"
```

---

## Task 3: Wire `HeatmapLive` to the footprint source (defer engine build, infer tick)

**Files:**
- Modify: `desktop/src/dev/HeatmapLive.tsx`

The current effect (lines ~35-264) builds the engine immediately with `TICK_SIZE = 0.1` / `INITIAL_MID = 100_000`, then connects to Bybit BTCUSDT and starts `OrderbookAdapter` + `TradesAdapter`. We restructure so the engine is built on the first valid snapshot (tick inferred from the ladder), and the data subscription is chosen from `orderflow.dataSource`.

- [ ] **Step 1: Add imports and a source reader**

At the top of `desktop/src/dev/HeatmapLive.tsx`, add to the existing import block (the `OrderbookSnapshot` type import is required because the new `onSnap` handler annotates it explicitly):

```ts
import { BridgeDepthHeatmapAdapter, type BridgeDepthEvent } from "../adapters/BridgeDepthHeatmapAdapter";
import { inferTickSize } from "../lib/heatmap/inferTickSize";
import type { OrderbookSnapshot } from "../core";
```

Below the existing `const TICK_SIZE = 0.1;` line, add:

```ts
const HALF_TICKS = 100; // initial visible half-range, in ticks, around mid

type HeatSource = "crypto" | "bridge" | "quantower";

function readHeatmapSource(): HeatSource {
  try {
    const v = localStorage.getItem("orderflow.dataSource");
    if (v === "bridge") return "bridge";
    if (v === "quantower") return "quantower";
    return "crypto"; // rithmic + default → existing Bybit demo path
  } catch {
    return "crypto";
  }
}
```

- [ ] **Step 2: Replace the effect body with a deferred-build structure**

Replace the whole `useEffect(() => { ... }, [])` body (lines ~35-264) with the version below. It keeps every existing behaviour for the crypto path and adds the two bridge paths; the engine + layers + viewportController + crosshair listeners + FPS ticker are created once, inside `buildEngine(firstSnap)`.

```tsx
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const source = readHeatmapSource();
    const dpr = window.devicePixelRatio || 1;
    const applySize = (clientW: number, clientH: number) => {
      const w = Math.max(1, Math.floor(clientW * dpr));
      const h = Math.max(1, Math.floor(clientH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        overlay.width = w; overlay.height = h;
      }
    };
    const initialRect = canvas.getBoundingClientRect();
    applySize(initialRect.width, initialRect.height);

    let cancelled = false;
    let snapCount = 0;
    let tradeCount = 0;

    // Built lazily on first snapshot (tick must be known before construction).
    let engine: HeatmapEngineType | null = null;
    let viewportController: ViewportController | null = null;
    let ro: ResizeObserver | null = null;
    let ticker = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (!engine) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      engine.setCrosshair(x, y);
    };
    const onMouseLeave = () => engine?.clearCrosshair();

    function buildEngine(firstSnap: { bids: { price: number }[]; asks: { price: number }[] }) {
      const mid = (firstSnap.bids[0].price + firstSnap.asks[0].price) / 2;
      const ladder = [
        ...firstSnap.bids.map((l) => l.price),
        ...firstSnap.asks.map((l) => l.price),
      ];
      const tickSize = inferTickSize(ladder) ?? TICK_SIZE;
      const half = HALF_TICKS * tickSize;

      const eng = new HeatmapEngine({
        canvas,
        overlayCanvas: overlay,
        viewport: { priceMin: mid - half, priceMax: mid + half },
        tickSize,
      });
      engineRef.current = eng;
      engine = eng;

      const liquidityLayer = new LiquidityHeatmapLayer();
      const bubblesLayer = new TradeBubblesLayer();
      const keyLevelsLayer = new KeyLevelsLayer();
      const volumeProfileLayer = new VolumeProfileLayer();
      const bestBidAskLayer = new BestBidAskLayer();
      const crosshairLayer = new CrosshairLayer();
      const axesLayer = new AxesLayer();
      bubblesLayer.setCanvasSize(canvas.width, canvas.height);

      const wrapper = canvas.parentElement;
      ro = wrapper
        ? new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (!r) return;
            applySize(r.width, r.height);
            bubblesLayer.setCanvasSize(canvas.width, canvas.height);
          })
        : null;
      if (wrapper && ro) ro.observe(wrapper);

      eng.addLayer(liquidityLayer, 1, () => eng.getLiquidityFrame());
      eng.addLayer(bubblesLayer, 5, () => eng.getTradesBuffer());
      eng.addLayer(keyLevelsLayer, 10, () => eng.getKeyLevelsSnapshot());
      eng.addLayer(bestBidAskLayer, 12, () => eng.getBBOHistory());
      eng.addLayer(crosshairLayer, 15, () => eng.getCrosshairData());
      eng.addLayer(volumeProfileLayer, 20, () => eng.getVolumeProfileSnapshot());
      eng.addLayer(axesLayer, 25, () => undefined);

      if (import.meta.env.VITE_DEV_SANITY === "true") eng.enableDevSanity();
      eng.start();

      viewportController = new ViewportController({
        canvas,
        initialPriceMin: mid - half,
        initialPriceMax: mid + half,
        tickSize,
        engine: eng,
        getCurrentPrice: () => {
          try { return eng.getTradesBuffer().currentPrice(); } catch { return null; }
        },
      });

      const updateLockUi = () => {
        if (lockBtnRef.current) {
          lockBtnRef.current.textContent = viewportController!.isAutoFollowEnabled()
            ? "🔓 follow ON" : "🔒 follow OFF";
        }
      };
      updateLockUi();
      if (lockBtnRef.current) {
        lockBtnRef.current.onclick = () => {
          viewportController!.setAutoFollow(!viewportController!.isAutoFollowEnabled());
          updateLockUi();
        };
      }

      canvas.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("mouseleave", onMouseLeave);

      ticker = window.setInterval(() => {
        if (!engine) return;
        if (fpsRef.current) fpsRef.current.textContent = String(engine.getFps() | 0);
        viewportController!.tickAutoFollow();
        updateLockUi();
        const kl = engine.getKeyLevelsSnapshot();
        if (pocRef.current) pocRef.current.textContent = kl.poc != null ? kl.poc.toFixed(2) : "—";
        if (vwapRef.current) vwapRef.current.textContent = kl.vwap != null ? kl.vwap.toFixed(2) : "—";
      }, 250);
    }

    const onSnap = (snap: OrderbookSnapshot) => {
      if (cancelled) return;
      if (!engine) {
        if (snap.bids.length > 0 && snap.asks.length > 0
            && Number.isFinite(snap.bids[0].price) && Number.isFinite(snap.asks[0].price)) {
          buildEngine(snap);
        } else {
          return; // wait for a two-sided snapshot
        }
      }
      snapCount++;
      if (snapsRef.current) snapsRef.current.textContent = String(snapCount);
      if (statusRef.current && statusRef.current.textContent !== "live") {
        statusRef.current.textContent = "live";
      }
      engine!.setOrderbook(snap);
    };

    const orderbookAdapter = new OrderbookAdapter();
    const tradesAdapter = new TradesAdapter();
    const bridgeAdapter =
      source === "bridge"    ? new BridgeDepthHeatmapAdapter("bridge-depth-update" as BridgeDepthEvent)
    : source === "quantower" ? new BridgeDepthHeatmapAdapter("quantower-depth-update" as BridgeDepthEvent)
    : null;

    (async () => {
      try {
        if (statusRef.current) statusRef.current.textContent = "connecting";
        if (bridgeAdapter) {
          // Bridge is already connected via the footprint; just listen. Depth
          // only — trade-driven overlays (bubbles/VP/VWAP) are phase 2.
          if (statusRef.current) statusRef.current.textContent = "waiting bridge";
          await bridgeAdapter.start(onSnap);
        } else {
          await invoke("crypto_connect", { args: { exchange: "bybit" } });
          if (cancelled) return;
          await Promise.all([
            invoke("crypto_orderbook_subscribe", { args: { exchange: "bybit", symbol: "BTCUSDT" } }),
            invoke("crypto_subscribe", { args: { exchange: "bybit", symbol: "BTCUSDT" } }),
          ]);
          if (cancelled) return;
          if (statusRef.current) statusRef.current.textContent = "subscribed";
          await Promise.all([
            orderbookAdapter.start(onSnap),
            tradesAdapter.start((trade) => {
              if (cancelled || !engine) return;
              tradeCount++;
              if (tradesRef.current) tradesRef.current.textContent = String(tradeCount);
              engine.setTrade(trade);
            }),
          ]);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          if (statusRef.current) statusRef.current.textContent = "error";
        }
      }
    })();

    return () => {
      cancelled = true;
      if (ticker) window.clearInterval(ticker);
      ro?.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      viewportController?.dispose();
      orderbookAdapter.dispose();
      tradesAdapter.dispose();
      bridgeAdapter?.dispose();
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);
```

- [ ] **Step 2b: Remove now-unused module constants**

Delete the now-unused `INITIAL_MID` and `INITIAL_HALF_TICKS` constants (lines ~17-18) if they remain — `buildEngine` derives mid from data and uses `HALF_TICKS`. Keep `TICK_SIZE` (used as the fallback in `buildEngine`).

- [ ] **Step 3: Make the status label reflect the source**

In the JSX stats overlay, replace the hardcoded line `Senzoukria · Bybit BTCUSDT` (line ~311) with a source-aware label. Add near the other refs (top of component): `const srcLabel = readHeatmapSource();` then render:

```tsx
        Senzoukria · {srcLabel === "bridge" ? "NinjaTrader bridge"
          : srcLabel === "quantower" ? "Quantower bridge"
          : "Bybit BTCUSDT"}
```

- [ ] **Step 4: Typecheck**

Run: `cd desktop && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Run the full desktop test suite (no regressions)**

Run: `cd desktop && npx vitest run`
Expected: all pass (existing suites + the 2 new ones from Tasks 1-2).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/dev/HeatmapLive.tsx
git commit -m "feat(heatmap): source-select bridge depth, lazy engine + inferred tick"
```

---

## Task 4: Manual end-to-end verification

**Files:** none (manual).

- [ ] **Step 1: Crypto path unchanged**

Run: `cd desktop && npm run tauri dev`. With `orderflow.dataSource` unset (or `rithmic`), open **Heatmap** → it connects to Bybit BTCUSDT and renders liquidity as before. Stats label reads `Bybit BTCUSDT`.

- [ ] **Step 2: NinjaTrader bridge path**

In the Footprint module, switch source to **NinjaTrader bridge** and confirm depth is flowing (DOM populated). Open **Heatmap** → label reads `NinjaTrader bridge`, status goes `waiting bridge` → `live`, and the liquidity heatmap renders for the bridge contract (e.g. ES) with a correct price grid (ticks at 0.25, not 0.1). Trade bubbles / volume profile may be empty (phase 2).

- [ ] **Step 3: Quantower bridge path**

Switch the footprint source to **Quantower**, confirm depth flows, open **Heatmap** → label `Quantower bridge`, liquidity renders.

- [ ] **Step 4: Note any gaps** for phase 2 (trades overlays from bridge, live source-switch without remount).

---

## Notes for the implementer

- **Phase 2 (explicitly deferred):** trade-driven overlays (bubbles, volume profile, VWAP, key-level POC) from the bridge trade stream; and reacting to a source switch while `/heatmap` is mounted (today the source is read once on mount — navigate away and back after switching). Don't build these now.
- **Why lazy engine build:** `HeatmapEngine.tickSize` is `readonly`; building after the first snapshot lets us infer the real tick and removes the BTC-only hardcode. The crypto path now also infers tick (~0.1 for BTC) — verify it still renders.
- **Symbol selection:** `getSymbol` defaults to null → first entry in the batch, which is correct because a bridge streams a single chart/contract. If a future build streams multiple, thread the footprint's active symbol into `getSymbol`.
