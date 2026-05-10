import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeatmapEngine } from "../render/HeatmapEngine";
import { LiquidityHeatmapLayer } from "../render/LiquidityHeatmapLayer";
import { TradeBubblesLayer } from "../render/TradeBubblesLayer";
import { KeyLevelsLayer } from "../render/KeyLevelsLayer";
import { VolumeProfileLayer } from "../render/VolumeProfileLayer";
import { CrosshairLayer } from "../render/CrosshairLayer";
import { DomPanel } from "./DomPanel";
import type { HeatmapEngine as HeatmapEngineType } from "../render/HeatmapEngine";
import { OrderbookAdapter } from "../adapters/OrderbookAdapter";
import { TradesAdapter } from "../adapters/TradesAdapter";
import { ViewportController } from "./ViewportController";

const INITIAL_MID = 100_000;
const INITIAL_HALF_TICKS = 100;
const TICK_SIZE = 0.1;

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

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
    let viewportInitialized = false;
    const HALF_RANGE = INITIAL_HALF_TICKS * TICK_SIZE;

    const initialPriceMin = INITIAL_MID - INITIAL_HALF_TICKS * TICK_SIZE;
    const initialPriceMax = INITIAL_MID + INITIAL_HALF_TICKS * TICK_SIZE;

    const engine = new HeatmapEngine({
      canvas,
      overlayCanvas: overlay,
      viewport: { priceMin: initialPriceMin, priceMax: initialPriceMax },
      tickSize: TICK_SIZE,
    });
    engineRef.current = engine;

    const liquidityLayer = new LiquidityHeatmapLayer();
    const bubblesLayer = new TradeBubblesLayer();
    const keyLevelsLayer = new KeyLevelsLayer();
    const volumeProfileLayer = new VolumeProfileLayer();
    const crosshairLayer = new CrosshairLayer();
    bubblesLayer.setCanvasSize(canvas.width, canvas.height);

    // ResizeObserver : suit le wrapper parent pour redimensionner les 2
    // canvases quand la fenêtre Tauri est resize. Bonus REFONTE-4b.5.
    const wrapper = canvas.parentElement;
    const ro = wrapper
      ? new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const r = entry.contentRect;
          applySize(r.width, r.height);
          bubblesLayer.setCanvasSize(canvas.width, canvas.height);
        })
      : null;
    ro?.observe(wrapper!);

    engine.addLayer(liquidityLayer, 1, () => engine.getLiquidityFrame());
    engine.addLayer(bubblesLayer, 5, () => engine.getTradesBuffer());
    engine.addLayer(keyLevelsLayer, 10, () => engine.getKeyLevelsSnapshot());
    engine.addLayer(crosshairLayer, 15, () => engine.getCrosshairData());
    engine.addLayer(
      volumeProfileLayer,
      20,
      () => engine.getVolumeProfileSnapshot(),
    );

    // REFONTE-5 — listeners crosshair sur le canvas regl. mousemove
    // capture seulement (pas de compute lookup), engine.setCrosshair
    // stocke x/y, le tick rAF suivant compute via getCrosshairData.
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      engine.setCrosshair(x, y);
    };
    const onMouseLeave = () => engine.clearCrosshair();
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    if (import.meta.env.DEV) {
      engine.enableDevSanity();
    }

    engine.start();

    const orderbookAdapter = new OrderbookAdapter();
    const tradesAdapter = new TradesAdapter();

    const viewportController = new ViewportController({
      canvas,
      initialPriceMin,
      initialPriceMax,
      tickSize: TICK_SIZE,
      onViewportChange: (priceMin, priceMax) => {
        engine.setViewport({ priceMin, priceMax });
      },
      getCurrentPrice: () => {
        try {
          return engine.getTradesBuffer().currentPrice();
        } catch {
          return null;
        }
      },
    });

    const updateLockUi = () => {
      if (lockBtnRef.current) {
        lockBtnRef.current.textContent =
          viewportController.isAutoFollowEnabled()
            ? "🔓 follow ON"
            : "🔒 follow OFF";
      }
    };
    updateLockUi();

    if (lockBtnRef.current) {
      lockBtnRef.current.onclick = () => {
        viewportController.setAutoFollow(
          !viewportController.isAutoFollowEnabled(),
        );
        updateLockUi();
      };
    }

    (async () => {
      try {
        if (statusRef.current) statusRef.current.textContent = "connecting";
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
          orderbookAdapter.start((snap) => {
            if (cancelled) return;
            // REFONTE-5 : auto-init viewport depuis le 1er snap valide.
            // Évite la cascade canvas-noir si trades arrivent en retard
            // (cf. leçon §5.E hot-reload Tauri).
            if (
              !viewportInitialized &&
              snap.bids.length > 0 &&
              snap.asks.length > 0
            ) {
              const mid = (snap.bids[0].price + snap.asks[0].price) / 2;
              if (Number.isFinite(mid)) {
                viewportController.applyExternalViewport(
                  mid - HALF_RANGE,
                  mid + HALF_RANGE,
                );
                viewportInitialized = true;
              }
            }
            snapCount++;
            if (snapsRef.current) {
              snapsRef.current.textContent = String(snapCount);
            }
            if (statusRef.current && statusRef.current.textContent !== "live") {
              statusRef.current.textContent = "live";
            }
            engine.setOrderbook(snap);
          }),
          tradesAdapter.start((trade) => {
            if (cancelled) return;
            tradeCount++;
            if (tradesRef.current) {
              tradesRef.current.textContent = String(tradeCount);
            }
            engine.setTrade(trade);
          }),
        ]);
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          if (statusRef.current) statusRef.current.textContent = "error";
        }
      }
    })();

    const ticker = window.setInterval(() => {
      if (fpsRef.current) {
        fpsRef.current.textContent = String(engine.getFps() | 0);
      }
      viewportController.tickAutoFollow();
      updateLockUi();
      const kl = engine.getKeyLevelsSnapshot();
      if (pocRef.current) {
        pocRef.current.textContent = kl.poc != null ? kl.poc.toFixed(2) : "—";
      }
      if (vwapRef.current) {
        vwapRef.current.textContent =
          kl.vwap != null ? kl.vwap.toFixed(2) : "—";
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(ticker);
      ro?.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      viewportController.dispose();
      orderbookAdapter.dispose();
      tradesAdapter.dispose();
      engine.destroy();
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
          background: "rgba(0,0,0,0.7)",
          color: "#e6e6e6",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 1.6,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.1)",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "auto",
          zIndex: 3,
        }}
      >
        REFONTE-4b live (Bybit BTCUSDT)
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
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#e6e6e6",
            fontFamily: "inherit",
            fontSize: 11,
            cursor: "pointer",
            borderRadius: 3,
          }}
        >
          🔓 follow ON
        </button>
      </div>
      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            padding: "8px 12px",
            background: "rgba(150,30,30,0.85)",
            color: "#fff",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            borderRadius: 4,
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
