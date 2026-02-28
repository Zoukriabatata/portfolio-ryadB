'use client';

/**
 * ReplayTradingChart
 *
 * Full trading chart for replay mode — fusion of /live + /footprint.
 * Canvas-based with timeframe selector, footprint toggle, and pro indicators.
 *
 * Features:
 * - Timeframe selector (5s → 1H)
 * - Footprint mode toggle (auto at ≤20 candles, or forced on/off)
 * - Scroll zoom, drag pan, crosshair
 * - Current price line, volume bars, delta labels
 * - VWAP/TWAP lines with std dev bands
 * - Developing POC polyline
 * - CVD (Cumulative Volume Delta) panel
 * - Delta Profile bars
 * - Stacked Imbalances highlighting
 * - Naked POC lines
 * - Unfinished Auction markers
 * - Session separators / hour markers
 * - Heatmap intensity + large trade highlighting
 * - Feeds currentPrice to useMarketStore for QuickTradeBar
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getReplayEngine } from '@/lib/replay';
import type { FootprintCandle } from '@/lib/ib/IBFootprintAdapter';
import { useMarketStore } from '@/stores/useMarketStore';
import { useFootprintSettingsStore } from '@/stores/useFootprintSettingsStore';
import {
  ReplayChartRenderer,
  PRICE_AXIS_W,
  TIME_AXIS_H,
  VOL_PCT,
  type ReplayRenderContext,
} from '@/lib/replay/ReplayChartRenderer';
import {
  getToolsEngine,
  getToolsRenderer,
  getInteractionController,
  type ToolType,
  type RenderContext as ToolsRenderContext,
  type CoordinateConverter,
} from '@/lib/tools';
import ReplaySettingsPanel from './ReplaySettingsPanel';
import VerticalToolbar from '@/components/tools/VerticalToolbar';

interface ReplayTradingChartProps {
  symbol: string;
  isPlaying: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEFRAME OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TIMEFRAMES = [
  { label: '5s',  sec: 5 },
  { label: '15s', sec: 15 },
  { label: '30s', sec: 30 },
  { label: '1m',  sec: 60 },
  { label: '5m',  sec: 300 },
  { label: '15m', sec: 900 },
  { label: '30m', sec: 1800 },
  { label: '1H',  sec: 3600 },
];

type FootprintMode = 'auto' | 'on' | 'off';

// ═══════════════════════════════════════════════════════════════════════════════
// INDICATOR TOGGLE BUTTONS
// ═══════════════════════════════════════════════════════════════════════════════

interface IndicatorToggle {
  key: string;
  label: string;
  featureKey: keyof ReturnType<typeof useFootprintSettingsStore.getState>['features'];
}

// Drawing tools are provided by VerticalToolbar component

const INDICATOR_TOGGLES: IndicatorToggle[] = [
  { key: 'vwap',    label: 'VWAP',  featureKey: 'showVWAPTWAP' },
  { key: 'dpoc',    label: 'dPOC',  featureKey: 'showDevelopingPOC' },
  { key: 'cvd',     label: 'CVD',   featureKey: 'showCVDPanel' },
  { key: 'delta',   label: 'ΔP',    featureKey: 'showDeltaProfile' },
  { key: 'si',      label: 'SI',    featureKey: 'showStackedImbalances' },
  { key: 'npoc',    label: 'nPOC',  featureKey: 'showNakedPOC' },
  { key: 'ua',      label: 'UA',    featureKey: 'showUnfinishedAuctions' },
  { key: 'session', label: 'SEP',   featureKey: 'showSessionSeparators' },
  { key: 'heat',    label: 'Heat',  featureKey: 'showHeatmapCells' },
  { key: 'large',   label: 'LT',    featureKey: 'showLargeTradeHighlight' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReplayTradingChart({ symbol, isPlaying }: ReplayTradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const rendererRef = useRef(new ReplayChartRenderer());

  // UI state (triggers re-render for toolbar)
  const [timeframe, setTimeframe] = useState(60);
  const [fpMode, setFpMode] = useState<FootprintMode>('auto');
  const [showTfPicker, setShowTfPicker] = useState(false);
  const [showIndicators, setShowIndicators] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [showSettings, setShowSettings] = useState(false);

  // Drawing tools refs (initialized lazily to avoid SSR issues)
  const toolsInitRef = useRef(false);
  const coordConverterRef = useRef<CoordinateConverter | null>(null);

  // Footprint settings (features + toggles)
  const features = useFootprintSettingsStore(s => s.features);
  const setFeatures = useFootprintSettingsStore(s => s.setFeatures);

  // Render-loop state (refs, no re-render)
  const st = useRef({
    w: 0, h: 0,
    visibleCount: 40,
    scrollOffset: 0,
    mouseX: -1, mouseY: -1,
    isDragging: false,
    dragStartX: 0, dragStartOffset: 0,
    fpMode: 'auto' as FootprintMode,
  });

  // Keep features ref in sync for draw loop
  const featuresRef = useRef(features);
  useEffect(() => { featuresRef.current = features; }, [features]);

  // Sync fpMode to ref
  useEffect(() => { st.current.fpMode = fpMode; }, [fpMode]);

  // ── Timeframe change ──
  const handleTimeframeChange = useCallback((sec: number) => {
    setTimeframe(sec);
    setShowTfPicker(false);
    try {
      const engine = getReplayEngine();
      engine.setFootprintTimeframe(sec);
    } catch { /* engine not ready */ }
  }, []);

  // ── Resize ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      st.current.w = Math.floor(width);
      st.current.h = Math.floor(height);
    });
    obs.observe(el);
    const r = el.getBoundingClientRect();
    st.current.w = Math.floor(r.width);
    st.current.h = Math.floor(r.height);
    return () => obs.disconnect();
  }, []);

  // ── Scroll zoom ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      st.current.visibleCount = Math.max(5, Math.min(200, st.current.visibleCount + (e.deltaY > 0 ? 3 : -3)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Drawing tools setup ──
  const initTools = useCallback(() => {
    if (toolsInitRef.current) return;
    toolsInitRef.current = true;
    const controller = getInteractionController();
    controller.setCallbacks({ requestRedraw: () => {} });
  }, []);

  const handleToolSelect = useCallback((type: ToolType) => {
    initTools();
    setActiveTool(type);
    const controller = getInteractionController();
    controller.setActiveTool(type);
  }, [initTools]);

  // ── Mouse ──
  const onDown = useCallback((e: React.MouseEvent) => {
    const s = st.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const localY = e.clientY - rect.top;
    const localX = e.clientX - rect.left;

    // Check if click is in minimap area (bottom 24px above time axis)
    const mmY = s.h - TIME_AXIS_H - 24;
    if (localY >= mmY && localY < s.h - TIME_AXIS_H) {
      // Minimap click — navigate to that position
      try {
        const engine = getReplayEngine();
        const allCandles = engine.getFootprintCandles();
        const chartW = s.w - PRICE_AXIS_W;
        const ratio = localX / chartW;
        const targetIdx = Math.floor(ratio * allCandles.length);
        const newOffset = Math.max(0, allCandles.length - targetIdx - Math.floor(s.visibleCount / 2));
        s.scrollOffset = newOffset;
      } catch { /* engine not ready */ }
      return;
    }

    const controller = getInteractionController();
    const isDrawing = controller.getActiveTool() !== 'cursor' && controller.getActiveTool() !== 'crosshair';

    if (isDrawing && coordConverterRef.current) {
      // Drawing mode — pass to tools controller
      if (rect) controller.setChartBounds(rect);
      controller.handleMouseDown(e as unknown as MouseEvent);
      return;
    }

    // Chart pan mode
    s.isDragging = true;
    s.dragStartX = e.clientX;
    s.dragStartOffset = s.scrollOffset;
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    s.mouseX = e.clientX - rect.left;
    s.mouseY = e.clientY - rect.top;

    const controller = getInteractionController();
    const isDrawing = controller.getActiveTool() !== 'cursor' && controller.getActiveTool() !== 'crosshair';

    if (isDrawing && coordConverterRef.current) {
      controller.setChartBounds(rect);
      controller.handleMouseMove(e as unknown as MouseEvent);
      return;
    }

    // Also pass cursor mode events for hover detection
    if (controller.getActiveTool() === 'cursor' && coordConverterRef.current) {
      controller.setChartBounds(rect);
      controller.handleMouseMove(e as unknown as MouseEvent);
    }

    if (s.isDragging) {
      const chartW = s.w - PRICE_AXIS_W;
      const candleW = chartW / s.visibleCount;
      s.scrollOffset = Math.max(0, s.dragStartOffset + Math.round((e.clientX - s.dragStartX) / candleW));
    }
  }, []);

  const onUp = useCallback((e: React.MouseEvent) => {
    st.current.isDragging = false;
    const controller = getInteractionController();
    if (coordConverterRef.current) {
      controller.handleMouseUp(e as unknown as MouseEvent);
    }
  }, []);

  const onLeave = useCallback(() => {
    st.current.isDragging = false;
    st.current.mouseX = -1;
    st.current.mouseY = -1;
  }, []);

  // ── Keyboard: Delete tools ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const controller = getInteractionController();
        controller.handleKeyDown(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAW LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    const s = st.current;
    const f = featuresRef.current;
    const { w, h, visibleCount, scrollOffset, mouseX, mouseY, fpMode: mode } = s;
    if (w < 10 || h < 10) { rafRef.current = requestAnimationFrame(draw); return; }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Data
    const engine = getReplayEngine();
    const allCandles = engine.getFootprintCandles() as FootprintCandle[];
    const price = engine.getCurrentPrice();
    const tickSize = engine.getTickSize();
    if (price > 0) useMarketStore.setState({ currentPrice: price });

    const renderer = rendererRef.current;

    // Background (always)
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    if (allCandles.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for trade data...', w / 2, h / 2);
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Visible slice
    const total = allCandles.length;
    const end = Math.max(0, total - scrollOffset);
    const startIdx = Math.max(0, end - visibleCount);
    const candles = allCandles.slice(startIdx, end);
    if (candles.length === 0) { rafRef.current = requestAnimationFrame(draw); return; }

    // Footprint mode
    const showFP = mode === 'on' || (mode === 'auto' && visibleCount <= 20);

    // Layout
    const chartW = w - PRICE_AXIS_W;
    const volH = h * VOL_PCT;
    const cvdH = f.showCVDPanel ? (f.cvdPanelHeight || 70) : 0;
    const chartH = h - TIME_AXIS_H - volH - cvdH;
    const candleW = chartW / visibleCount;
    const bodyW = Math.max(1, candleW * (showFP ? 0.92 : 0.7));

    // Price range
    let hi = -Infinity, lo = Infinity, maxV = 0;
    for (const c of candles) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
      if (c.totalVolume > maxV) maxV = c.totalVolume;
    }
    const rng = hi - lo || 1;
    hi += rng * 0.05;
    lo -= rng * 0.05;
    const pR = hi - lo;

    const p2y = (p: number) => ((hi - p) / pR) * chartH;
    const y2p = (y: number) => hi - (y / chartH) * pR;

    // Build render context
    const rc: ReplayRenderContext = {
      ctx, w, h, chartW, chartH, volH, cvdH,
      candleW, bodyW, candles, allCandles,
      startIdx, hi, lo, pR, maxV, showFP,
      price, mouseX, mouseY, tickSize, p2y, y2p,
    };

    // ── Render layers ──
    renderer.renderBackground(rc);
    renderer.renderGrid(rc);

    // Session separators (behind candles)
    if (f.showSessionSeparators) renderer.renderSessionSeparators(rc);

    // VWAP bands (behind candles)
    if (f.showVWAPTWAP && f.showVWAP !== false) renderer.renderVWAP(rc, f);

    // TWAP (behind candles)
    if (f.showVWAPTWAP && f.showTWAP !== false) renderer.renderTWAP(rc, f);

    // Developing POC (behind candles)
    if (f.showDevelopingPOC) renderer.renderDevelopingPOC(rc, f);

    // Candles + footprint + volume bars
    renderer.renderCandles(rc, f);

    // Stacked imbalances (overlay on candles)
    if (f.showStackedImbalances && showFP) renderer.renderStackedImbalances(rc, f);

    // Naked POCs
    if (f.showNakedPOC) renderer.renderNakedPOCs(rc);

    // Unfinished auctions
    if (f.showUnfinishedAuctions && showFP) renderer.renderUnfinishedAuctions(rc);

    // Delta Profile
    if (f.showDeltaProfile) renderer.renderDeltaProfile(rc, f);

    // CVD Panel
    if (f.showCVDPanel) renderer.renderCVDPanel(rc, f);

    // Current price line (above indicators)
    renderer.renderCurrentPriceLine(rc);

    // Separators
    renderer.renderSeparators(rc);

    // Time axis
    renderer.renderTimeAxis(rc);

    // Crosshair (top layer)
    renderer.renderCrosshair(rc);

    // ── Drawing Tools ──
    // Update coordinate converter for tools system
    const startIdxCopy = startIdx;
    const converter: CoordinateConverter = {
      xToTime: (x: number) => {
        const idx = Math.floor(x / candleW) + startIdxCopy;
        const c = allCandles[Math.max(0, Math.min(idx, allCandles.length - 1))];
        return c ? c.time : 0;
      },
      timeToX: (time: number) => {
        for (let i = 0; i < allCandles.length; i++) {
          if (allCandles[i].time >= time) {
            return (i - startIdxCopy) * candleW + candleW / 2;
          }
        }
        return chartW;
      },
      yToPrice: y2p,
      priceToY: p2y,
    };
    coordConverterRef.current = converter;
    const controller = getInteractionController();
    controller.setCoordinateConverter(converter);

    // Render tools
    const toolsRenderer = getToolsRenderer();
    const controllerState = controller.getState();
    const toolsRC: ToolsRenderContext = {
      ctx, width: chartW, height: chartH,
      priceToY: p2y, yToPrice: y2p,
      timeToX: converter.timeToX, xToTime: converter.xToTime,
      tickSize,
      colors: {
        positive: '#22c55e',
        negative: '#ef4444',
        selection: '#2962FF',
        handle: '#fff',
        handleBorder: '#2962FF',
      },
      currentPrice: price,
      hoveredToolId: controllerState.hoveredToolId,
      hoveredHandle: controllerState.hoveredHandle ?? undefined,
    };
    toolsRenderer.render(toolsRC);

    // Minimap (overview of all candles with viewport indicator)
    if (allCandles.length > visibleCount) {
      renderer.renderMinimap(rc);
    }

    // HUD
    renderer.renderHUD(rc);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const currentTfLabel = TIMEFRAMES.find(t => t.sec === timeframe)?.label || '1m';

  const toggleFeature = (key: keyof typeof features) => {
    setFeatures({ [key]: !features[key] } as Partial<typeof features>);
  };

  return (
    <div className="w-full h-full flex" style={{ minHeight: 0 }}>
      {/* Vertical Toolbar — TradingView-style */}
      <VerticalToolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
      />
    <div className="flex-1 flex flex-col min-w-0" style={{ minHeight: 0 }}>
      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Timeframe picker */}
        <div className="relative">
          <button
            onClick={() => setShowTfPicker(p => !p)}
            className="px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {currentTfLabel}
          </button>
          {showTfPicker && (
            <div
              className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden"
              style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.sec}
                  onClick={() => handleTimeframeChange(tf.sec)}
                  className="block w-full px-4 py-1.5 text-left text-[10px] font-mono transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                  style={{
                    color: tf.sec === timeframe ? '#10b981' : 'rgba(255,255,255,0.6)',
                    fontWeight: tf.sec === timeframe ? 700 : 400,
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />

        {/* Footprint mode toggle */}
        {(['auto', 'on', 'off'] as FootprintMode[]).map(m => (
          <button
            key={m}
            onClick={() => setFpMode(m)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
            style={{
              background: fpMode === m ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: fpMode === m ? '#10b981' : 'rgba(255,255,255,0.4)',
              fontWeight: fpMode === m ? 700 : 400,
            }}
          >
            {m === 'auto' ? 'FP Auto' : m === 'on' ? 'Footprint' : 'Candles'}
          </button>
        ))}

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />

        {/* Quick indicator toggles */}
        <button
          onClick={() => toggleFeature('showVWAPTWAP')}
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors"
          style={{
            background: features.showVWAPTWAP ? 'rgba(59,130,246,0.15)' : 'transparent',
            color: features.showVWAPTWAP ? '#3b82f6' : 'rgba(255,255,255,0.35)',
          }}
          title="VWAP / TWAP"
        >
          VWAP
        </button>
        <button
          onClick={() => toggleFeature('showDevelopingPOC')}
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors"
          style={{
            background: features.showDevelopingPOC ? 'rgba(251,191,36,0.15)' : 'transparent',
            color: features.showDevelopingPOC ? '#fbbf24' : 'rgba(255,255,255,0.35)',
          }}
          title="Developing POC"
        >
          dPOC
        </button>
        <button
          onClick={() => toggleFeature('showCVDPanel')}
          className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors"
          style={{
            background: features.showCVDPanel ? 'rgba(16,185,129,0.15)' : 'transparent',
            color: features.showCVDPanel ? '#10b981' : 'rgba(255,255,255,0.35)',
          }}
          title="Cumulative Volume Delta"
        >
          CVD
        </button>

        {/* More indicators dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowIndicators(p => !p)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
            style={{
              background: showIndicators ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: 'rgba(255,255,255,0.4)',
            }}
            title="More indicators"
          >
            +
          </button>
          {showIndicators && (
            <div
              className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-hidden py-1"
              style={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 140 }}
            >
              {INDICATOR_TOGGLES.map(t => {
                const active = !!features[t.featureKey];
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleFeature(t.featureKey)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[10px] font-mono transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                    style={{ color: active ? '#10b981' : 'rgba(255,255,255,0.5)' }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: active ? '#10b981' : 'transparent',
                      border: `1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                    }} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />

        {/* Drawing tools — handled by VerticalToolbar on the left */}

        <div className="flex-1" />

        {/* Symbol label */}
        <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {symbol}
        </span>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(p => !p)}
          className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          style={{ color: showSettings ? '#10b981' : 'rgba(255,255,255,0.3)' }}
          title="Chart settings"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Settings Panel */}
      <ReplaySettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ cursor: activeTool !== 'cursor' ? 'crosshair' : 'default' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
    </div>
  );
}
