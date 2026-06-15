import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeatmapEngine } from "../render/HeatmapEngine";
import { LiquidityHeatmapLayer } from "../render/LiquidityHeatmapLayer";
import { TradeBubblesLayer } from "../render/TradeBubblesLayer";
import { KeyLevelsLayer } from "../render/KeyLevelsLayer";
import { VolumeProfileLayer } from "../render/VolumeProfileLayer";
import { CrosshairLayer } from "../render/CrosshairLayer";
import { BestBidAskLayer } from "../render/BestBidAskLayer";
import { AxesLayer } from "../render/AxesLayer";
import { DomPanel } from "./DomPanel";
import type { HeatmapEngine as HeatmapEngineType } from "../render/HeatmapEngine";
import { OrderbookAdapter } from "../adapters/OrderbookAdapter";
import { TradesAdapter } from "../adapters/TradesAdapter";
import { ViewportController } from "./ViewportController";
import { BridgeDepthHeatmapAdapter, type BridgeDepthEvent } from "../adapters/BridgeDepthHeatmapAdapter";
import { inferTickSize } from "../lib/heatmap/inferTickSize";
import type { OrderbookSnapshot } from "../core";

const TICK_SIZE = 0.1; // fallback tick when it can't be inferred from data
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

export function HeatmapLive() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const snapsRef = useRef<HTMLSpanElement>(null);
  const tradesRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const pocRef = useRef<HTMLSpanElement>(null);
  const vwapRef = useRef<HTMLSpanElement>(null);
  const lockBtnRef = useRef<HTMLButtonElement>(null);
  // REFONTE-5 — ref engine pour DomPanel (lit getLastOrderbookSnap à 10 Hz).
  const engineRef = useRef<HeatmapEngineType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const srcLabel = readHeatmapSource();

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
        canvas.width = w;
        canvas.height = h;
        overlay.width = w;
        overlay.height = h;
      }
    };
    const initialRect = canvas.getBoundingClientRect();
    applySize(initialRect.width, initialRect.height);

    let cancelled = false;
    let snapCount = 0;
    let tradeCount = 0;

    // Built lazily on the first valid snapshot — tick size must be known
    // before HeatmapEngine construction (it is readonly), so we infer it from
    // the ladder. This also removes the old BTC-only hardcode.
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

    function buildEngine(firstSnap: OrderbookSnapshot) {
      const mid = (firstSnap.bids[0].price + firstSnap.asks[0].price) / 2;
      const ladder = [
        ...firstSnap.bids.map((l) => l.price),
        ...firstSnap.asks.map((l) => l.price),
      ];
      const tickSize = inferTickSize(ladder) ?? TICK_SIZE;
      const half = HALF_TICKS * tickSize;

      const eng = new HeatmapEngine({
        canvas: canvas!,
        overlayCanvas: overlay!,
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
      bubblesLayer.setCanvasSize(canvas!.width, canvas!.height);

      const wrapper = canvas!.parentElement;
      ro = wrapper
        ? new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (!r) return;
            applySize(r.width, r.height);
            bubblesLayer.setCanvasSize(canvas!.width, canvas!.height);
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
        canvas: canvas!,
        initialPriceMin: mid - half,
        initialPriceMax: mid + half,
        tickSize,
        engine: eng,
        getCurrentPrice: () => {
          try {
            return eng.getTradesBuffer().currentPrice();
          } catch {
            return null;
          }
        },
      });

      const updateLockUi = () => {
        if (lockBtnRef.current) {
          lockBtnRef.current.textContent = viewportController!.isAutoFollowEnabled()
            ? "🔓 follow ON"
            : "🔒 follow OFF";
        }
      };
      updateLockUi();
      if (lockBtnRef.current) {
        lockBtnRef.current.onclick = () => {
          viewportController!.setAutoFollow(!viewportController!.isAutoFollowEnabled());
          updateLockUi();
        };
      }

      canvas!.addEventListener("mousemove", onMouseMove);
      canvas!.addEventListener("mouseleave", onMouseLeave);

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
        if (
          snap.bids.length > 0 &&
          snap.asks.length > 0 &&
          Number.isFinite(snap.bids[0].price) &&
          Number.isFinite(snap.asks[0].price)
        ) {
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
      source === "bridge"
        ? new BridgeDepthHeatmapAdapter("bridge-depth-update" as BridgeDepthEvent)
        : source === "quantower"
          ? new BridgeDepthHeatmapAdapter("quantower-depth-update" as BridgeDepthEvent)
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
            invoke("crypto_orderbook_subscribe", {
              args: { exchange: "bybit", symbol: "BTCUSDT" },
            }),
            invoke("crypto_subscribe", {
              args: { exchange: "bybit", symbol: "BTCUSDT" },
            }),
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

  return (
    <div className="heatmap-route-grid">
      <DomPanel engineRef={engineRef} />
      <div className="heatmap-canvas-zone">
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      />
      <canvas
        ref={overlayRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          padding: "8px 12px",
          background: "rgba(20, 20, 20, 0.92)",
          color: "#ffffff",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 1.6,
          borderRadius: 4,
          border: "1px solid #1f1f1f",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "auto",
          zIndex: 3,
        }}
      >
        Senzoukria · {srcLabel === "bridge"
          ? "NinjaTrader bridge"
          : srcLabel === "quantower"
            ? "Quantower bridge"
            : "Bybit BTCUSDT"}
        <br />
        Status: <span ref={statusRef}>idle</span>
        <br />
        FPS&nbsp;: <span ref={fpsRef}>—</span>
        <br />
        Snaps&nbsp;: <span ref={snapsRef}>0</span>
        <br />
        Trades: <span ref={tradesRef}>0</span>
        <br />
        POC&nbsp;: <span ref={pocRef}>—</span>
        <br />
        VWAP&nbsp;: <span ref={vwapRef}>—</span>
        <br />
        <button
          ref={lockBtnRef}
          style={{
            marginTop: 4,
            padding: "2px 8px",
            background: "#0a0a0a",
            border: "1px solid #1f1f1f",
            color: "#ffffff",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
            borderRadius: 3,
          }}
        >
          follow ON
        </button>
      </div>
      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            padding: "8px 12px",
            background: "rgba(255, 61, 113, 0.18)",
            color: "#ff3d71",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            borderRadius: 4,
            border: "1px solid #ff3d71",
            maxWidth: "60%",
            zIndex: 3,
          }}
        >
          {error}
        </div>
      )}
      </div>
    </div>
  );
}
