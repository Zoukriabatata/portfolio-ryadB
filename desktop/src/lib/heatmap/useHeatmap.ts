// Phase B / M6a-1 — React hook that wires the WebGL heatmap
// pipeline: MarketStateAdapter (Tauri events → ring buffer) +
// HeatmapRenderer (regl). The component renders a single
// WebGL canvas and lets this hook drive its lifecycle.

import { useEffect, useRef, useState } from "react";
import { HeatmapRenderer, type RendererStats } from "./HeatmapRenderer";
import { MarketStateAdapter } from "./MarketStateAdapter";
import type { HeatmapMarketState } from "./types";

export type UseHeatmapResult = {
  ready: boolean;
  /** Live read of the renderer's last frame stats (FPS + price
   *  range). Reflects the latest paint, not React state — the
   *  caller polls this from a RAF / setInterval if it wants live
   *  values. Sufficient for an axis overlay refreshed at 4 Hz. */
  stats: RendererStats;
  state: HeatmapMarketState;
  /** Imperative handle to the live renderer instance. The hook
   *  owns the lifecycle; consumers use the ref to push viewport
   *  updates (M6a-2) or query getCellAt() for tooltips without
   *  going through React state. Null while no symbol is mounted. */
  rendererRef: React.RefObject<HeatmapRenderer | null>;
};

export function useHeatmap(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  /** Exchange-suffixed symbol, e.g. "BTCUSDT.BYBIT". Pass null
   *  to tear down. */
  symbol: string | null,
): UseHeatmapResult {
  const adapterRef = useRef<MarketStateAdapter | null>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<RendererStats>({
    fps: 0,
    historyLength: 0,
    midPrice: 0,
    priceRange: [0, 0],
  });
  const [state, setState] = useState<HeatmapMarketState>({
    symbol: null,
    history: [],
    latest: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !symbol) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const renderer = new HeatmapRenderer(canvas);
    const adapter = new MarketStateAdapter();

    rendererRef.current = renderer;
    adapterRef.current = adapter;

    void adapter.start(symbol).then(() => {
      if (cancelled) return;
      adapter.subscribe((s) => {
        // setState identity-clones so React notices; the renderer
        // pulls .history directly so deep-cloning would just be
        // expensive churn.
        setState({
          symbol: s.symbol,
          history: s.history,
          latest: s.latest,
        });
      });
      renderer.start(() => adapter.getState());
      setReady(true);
    });

    return () => {
      cancelled = true;
      renderer.destroy();
      void adapter.stop();
      rendererRef.current = null;
      adapterRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ResizeObserver — keep the canvas DPR-correct + viewport in
  // sync as the route reflows.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const ro = new ResizeObserver(() => {
      const r = rendererRef.current;
      if (!r) return;
      const rect = canvas.getBoundingClientRect();
      r.resize(rect.width, rect.height);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef, ready]);

  // Poll the renderer stats at 4 Hz — enough for an axis overlay
  // without waking React on every frame.
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      const r = rendererRef.current;
      if (!r) return;
      setStats(r.getStats());
    }, 250);
    return () => clearInterval(id);
  }, [ready]);

  return { ready, stats, state, rendererRef };
}
