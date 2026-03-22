'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import type { ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import { type TimeframeSeconds, TIMEFRAME_LABELS } from '@/lib/live/HierarchicalAggregator';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUIThemeStore } from '@/stores/useUIThemeStore';
import { THEMES } from '@/lib/themes/ThemeSystem';
import { getToolsEngine, type ToolType as EngineToolType } from '@/lib/tools/ToolsEngine';
import { getToolsRenderer } from '@/lib/tools/ToolsRenderer';
import { getInteractionController } from '@/lib/tools/InteractionController';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import InlineToolSettings from '@/components/tools/InlineToolSettings';
import { TextEditor } from '@/components/tools/TextEditor';
import VerticalToolbar from '@/components/tools/VerticalToolbar';
import { SettingsIcon } from '@/components/ui/Icons';
import QuickTradeBar from '@/components/trading/QuickTradeBar';
import { PriceCountdownCompact } from '@/components/trading/PriceCountdown';
import { useTradingStore } from '@/stores/useTradingStore';
import { useAutoContrast } from '@/hooks/useAutoContrast';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import MiniDepthHeatmap from '@/components/charts/MiniDepthHeatmap';

// Lazy load modals (not needed at initial render)
const GlobalSettingsModal = dynamic(() => import('@/components/settings/GlobalSettingsModal'), { ssr: false });
const AdvancedChartSettings = dynamic(() => import('@/components/settings/AdvancedChartSettings'), { ssr: false });
const AdvancedToolSettingsModal = dynamic(() => import('@/components/tools/AdvancedToolSettingsModal'), { ssr: false });
const KeyboardShortcutsModal = dynamic(() => import('@/components/ui/KeyboardShortcutsModal'), { ssr: false });
import { ASSET_CATEGORY_ICONS, ASSET_CATEGORIES } from './constants/symbols';
import { TF_GROUPS } from './constants/timeframes';
import LoadingOverlay from './components/LoadingOverlay';
import ZoomControls from './components/ZoomControls';
import AlertNotifications from './components/AlertNotifications';
import ChartFooter from './components/ChartFooter';
import MagnetToggle from './components/MagnetToggle';
import CustomizeColorsPanel from './components/CustomizeColorsPanel';
import IndicatorSettingsPanel from '@/components/settings/IndicatorSettingsPanel';
import { useChartEngine, useSymbolData, useChartSettings, useDrawingTools, useContextMenu } from './hooks';
import { DEFAULT_CUSTOM_COLORS, type SharedRefs, type CustomColors } from './hooks/types';
import { BroadcastChannelManager } from '@/lib/sync/BroadcastChannelManager';
import { useChartSyncStore } from '@/stores/useChartSyncStore';
import { useLiveVolumeProfile } from '@/hooks/useLiveVolumeProfile';
import { useLiveFootprint } from '@/hooks/useLiveFootprint';
import { ClusterRenderer } from '@/lib/rendering/ClusterRenderer';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import VolumeProfilePanel from './overlays/VolumeProfilePanel';
import FavoritesToolbar from '@/components/tools/FavoritesToolbar';
import { useFavoritesToolbarStore } from '@/stores/useFavoritesToolbarStore';

interface LiveChartProProps {
  className?: string;
  onSymbolChange?: (symbol: string) => void;
  /** Slot rendered at the far-right of the chart header bar */
  headerRight?: React.ReactNode;
}

// Helper function to create tool context menu items
function createToolContextMenuItems(
  tool: any,
  engine: ReturnType<typeof getToolsEngine>,
  onCloseMenu: () => void,
  onRenderTools: () => void
) {
  return [
    {
      id: 'tool-clone',
      label: 'Clone',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      ),
      shortcut: 'Ctrl+D',
      onClick: () => {
        const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = tool;
        engine.addTool(toolData as any);
        onCloseMenu();
        onRenderTools();
      },
    },
    {
      id: 'tool-delete',
      label: 'Delete',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      ),
      shortcut: 'Del',
      danger: true,
      onClick: () => {
        engine.deleteTool(tool.id);
        onCloseMenu();
        onRenderTools();
      },
    },
    {
      id: 'separator-1',
      label: '',
      divider: true,
    },
    {
      id: 'tool-lock',
      label: tool.locked ? 'Unlock' : 'Lock',
      icon: tool.locked ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 019.9-1"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      ),
      onClick: () => {
        engine.updateTool(tool.id, { locked: !tool.locked });
        onCloseMenu();
        onRenderTools();
      },
    },
    {
      id: 'tool-hide',
      label: tool.visible ? 'Hide' : 'Show',
      icon: tool.visible ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ),
      onClick: () => {
        engine.updateTool(tool.id, { visible: !tool.visible });
        onCloseMenu();
        onRenderTools();
      },
    },
    {
      id: 'separator-2',
      label: '',
      divider: true,
    },
    {
      id: 'tool-bring-front',
      label: 'Bring to Front',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="17 11 12 6 7 11"/>
          <polyline points="17 18 12 13 7 18"/>
        </svg>
      ),
      onClick: () => {
        engine.updateTool(tool.id, { zIndex: 9999 });
        onCloseMenu();
        onRenderTools();
      },
    },
    {
      id: 'tool-send-back',
      label: 'Send to Back',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="7 13 12 18 17 13"/>
          <polyline points="7 6 12 11 17 6"/>
        </svg>
      ),
      onClick: () => {
        engine.updateTool(tool.id, { zIndex: 1 });
        onCloseMenu();
        onRenderTools();
      },
    },
  ];
}

export default function LiveChartPro({ className, onSymbolChange, headerRight }: LiveChartProProps) {
  // === SHARED REFS (individual refs first, then wrapped in stable object) ===
  const chartEngineRef = useRef(null);
  const chartContainerRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const candlesRef = useRef<ChartCandle[]>([]);
  const currentPriceRef = useRef(0);
  const priceRef = useRef(null);
  const tickCountRef = useRef(null);
  const statusDotRef = useRef(null);
  const interactionControllerRef = useRef(getInteractionController());
  const toolsEngineRef = useRef(getToolsEngine());
  const toolsRendererRef = useRef(getToolsRenderer());
  const candleDataRef = useRef(new Map());
  const lastHistoryTimeRef = useRef(0);
  const lastAlertCheckRef = useRef(0);
  const unsubscribersRef = useRef([]);
  const handleTimeframeChangeRef = useRef(() => {});
  const sessionHighRef = useRef(0);
  const sessionLowRef = useRef(Infinity);
  const pricePositionRef = useRef(null);
  const pricePositionBarRef = useRef(null);
  const ohlcOpenRef = useRef<HTMLSpanElement>(null);
  const ohlcHighRef = useRef<HTMLSpanElement>(null);
  const ohlcLowRef = useRef<HTMLSpanElement>(null);
  const ohlcCloseRef = useRef<HTMLSpanElement>(null);
  const footerVolumeRef = useRef<HTMLSpanElement>(null);

  // Stable refs object (doesn't change between renders)
  const refs = useMemo<SharedRefs>(() => ({
    chartEngine: chartEngineRef,
    chartContainer: chartContainerRef,
    chartCanvas: chartCanvasRef,
    drawingCanvas: drawingCanvasRef,
    candles: candlesRef,
    currentPrice: currentPriceRef,
    price: priceRef,
    tickCount: tickCountRef,
    statusDot: statusDotRef,
    interactionController: interactionControllerRef,
    toolsEngine: toolsEngineRef,
    toolsRenderer: toolsRendererRef,
    candleData: candleDataRef,
    lastHistoryTime: lastHistoryTimeRef,
    lastAlertCheck: lastAlertCheckRef,
    unsubscribers: unsubscribersRef,
    handleTimeframeChange: handleTimeframeChangeRef,
    sessionHigh: sessionHighRef,
    sessionLow: sessionLowRef,
    pricePosition: pricePositionRef,
    pricePositionBar: pricePositionBarRef,
    ohlcOpen: ohlcOpenRef,
    ohlcHigh: ohlcHighRef,
    ohlcLow: ohlcLowRef,
    ohlcClose: ohlcCloseRef,
    footerVolume: footerVolumeRef,
  }), []);

  // === UI TOGGLE STATE ===
  const symbolBtnRef = useRef<HTMLButtonElement>(null);
  const [symbolDropdownPos, setSymbolDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showDepthMap, setShowDepthMap] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showToolProperties, setShowToolProperties] = useState(false);
  const [customColors, setCustomColors] = useState<CustomColors>(DEFAULT_CUSTOM_COLORS);
  const [editingIndicatorId, setEditingIndicatorId] = useState<string | null>(null);

  // === STORE HOOKS ===
  const { themeId, setTheme, getTheme } = useThemeStore();
  const baseTheme = useMemo(() => getTheme(), [themeId, getTheme]);

  // Subscribe to UI theme changes so colors re-derive from CSS variables
  const uiThemeId = useUIThemeStore((s) => s.activeTheme);

  // Override chart theme colors with CSS variables set by the global UI theme
  const theme = useMemo(() => {
    if (typeof document === 'undefined') return baseTheme;
    const cs = getComputedStyle(document.documentElement);
    const get = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: get('--chart-bg', get('--background', baseTheme.colors.background)),
        surface: get('--surface', baseTheme.colors.surface),
        text: get('--text-primary', baseTheme.colors.text),
        textSecondary: get('--text-secondary', baseTheme.colors.textSecondary),
        textMuted: get('--text-muted', baseTheme.colors.textMuted),
        border: get('--border', baseTheme.colors.border),
        gridLines: get('--chart-grid', baseTheme.colors.gridLines),
        candleUp: get('--candle-up', baseTheme.colors.candleUp),
        candleDown: get('--candle-down', baseTheme.colors.candleDown),
        wickUp: get('--wick-up', baseTheme.colors.wickUp),
        wickDown: get('--wick-down', baseTheme.colors.wickDown),
        crosshair: get('--text-muted', baseTheme.colors.crosshair),
        toolActive: get('--primary', baseTheme.colors.toolActive),
        toolHover: get('--surface-hover', baseTheme.colors.toolHover),
        success: get('--candle-up', baseTheme.colors.success),
        error: get('--candle-down', baseTheme.colors.error),
      },
    };
  }, [baseTheme, uiThemeId]);

  // Contrast text for active buttons: auto black/white based on toolActive luminance
  const { textColor: activeTextColor } = useAutoContrast(theme.colors.toolActive);
  const { positions, activeBroker, connections, placeOrder, closePosition, contractQuantity, showTradeBar, setShowTradeBar } = useTradingStore(
    useShallow(s => ({
      positions: s.positions,
      activeBroker: s.activeBroker,
      connections: s.connections,
      placeOrder: s.placeOrder,
      closePosition: s.closePosition,
      contractQuantity: s.contractQuantity,
      showTradeBar: s.showTradeBar,
      setShowTradeBar: s.setShowTradeBar,
    }))
  );
  const { indicators: indicatorConfigs, toggleIndicator: toggleIndicatorConfig } = useIndicatorStore();
  const { showVolumeProfile, setShowVolumeProfile, vpPanelSide } = usePreferencesStore(
    useShallow(s => ({ showVolumeProfile: s.showVolumeProfile, setShowVolumeProfile: s.setShowVolumeProfile, vpPanelSide: s.vpPanelSide }))
  );
  const customFavorites = useFavoritesToolbarStore(s => s.presets.custom.tools);

  // Trading ref for keyboard hotkeys
  const tradingRef = useRef({ activeBroker, connections, placeOrder, closePosition, contractQuantity, symbol: 'btcusdt', showTradeBar });
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  // === HOOKS ===
  const engine = useChartEngine({ refs, theme, customColors, symbol: 'btcusdt' }); // symbol updated below

  const symbolData = useSymbolData({
    refs,
    theme,
    updatePricePositionIndicator: engine.updatePricePositionIndicator,
    onSymbolChange,
  });

  // Update engine's symbol knowledge for screenshot filename
  // (useChartEngine was initialized with a placeholder, but handleScreenshot uses it via closure on refs)

  // Volume Profile — real-time orderflow from aggTrade
  const vpData = useLiveVolumeProfile(symbolData.symbol, showVolumeProfile);

  // Cluster overlay — footprint bid/ask per price level
  const showClusterOverlay = usePreferencesStore(s => s.showClusterOverlay);
  const clusterOverlayOpacity = usePreferencesStore(s => s.clusterOverlayOpacity);
  const clusterRendererRef = useRef(new ClusterRenderer());
  const { getFootprintForTime } = useLiveFootprint({
    symbol: symbolData.symbol,
    timeframe: symbolData.timeframe,
    enabled: showClusterOverlay,
  });

  useEffect(() => {
    clusterRendererRef.current.setConfig({ opacity: clusterOverlayOpacity });
  }, [clusterOverlayOpacity]);

  // Sync VP levels + settings to chart engine for full-width POC/VAH/VAL lines
  const vpPocEnabled = usePreferencesStore((s) => s.vpPocEnabled);
  const vpPocColor = usePreferencesStore((s) => s.vpPocColor);
  const vpPocWidth = usePreferencesStore((s) => s.vpPocWidth);
  const vpPocStyle = usePreferencesStore((s) => s.vpPocStyle);
  const vpPocLabel = usePreferencesStore((s) => s.vpPocLabel);
  const vpVahEnabled = usePreferencesStore((s) => s.vpVahEnabled);
  const vpVahColor = usePreferencesStore((s) => s.vpVahColor);
  const vpVahWidth = usePreferencesStore((s) => s.vpVahWidth);
  const vpVahStyle = usePreferencesStore((s) => s.vpVahStyle);
  const vpVahLabel = usePreferencesStore((s) => s.vpVahLabel);
  const vpValEnabled = usePreferencesStore((s) => s.vpValEnabled);
  const vpValColor = usePreferencesStore((s) => s.vpValColor);
  const vpValWidth = usePreferencesStore((s) => s.vpValWidth);
  const vpValStyle = usePreferencesStore((s) => s.vpValStyle);
  const vpValLabel = usePreferencesStore((s) => s.vpValLabel);
  const vpBidColor = usePreferencesStore((s) => s.vpBidColor);
  const vpAskColor = usePreferencesStore((s) => s.vpAskColor);
  const vpBarOpacity = usePreferencesStore((s) => s.vpBarOpacity);
  const vpShowBackground = usePreferencesStore((s) => s.vpShowBackground);
  const vpBackgroundColor = usePreferencesStore((s) => s.vpBackgroundColor);
  const vpBackgroundOpacity = usePreferencesStore((s) => s.vpBackgroundOpacity);
  const vpGradientEnabled = usePreferencesStore((s) => s.vpGradientEnabled);
  const vpAskGradientEnd = usePreferencesStore((s) => s.vpAskGradientEnd);
  const vpBidGradientEnd = usePreferencesStore((s) => s.vpBidGradientEnd);

  useEffect(() => {
    if (!showVolumeProfile || !vpData.data.valueArea.poc) {
      refs.chartEngine.current?.setVPLevels(null);
      return;
    }
    refs.chartEngine.current?.setVPLevels({
      poc: vpData.data.valueArea.poc,
      vah: vpData.data.valueArea.vah,
      val: vpData.data.valueArea.val,
      pocEnabled: vpPocEnabled, pocColor: vpPocColor, pocWidth: vpPocWidth, pocStyle: vpPocStyle, pocLabel: vpPocLabel,
      vahEnabled: vpVahEnabled, vahColor: vpVahColor, vahWidth: vpVahWidth, vahStyle: vpVahStyle, vahLabel: vpVahLabel,
      valEnabled: vpValEnabled, valColor: vpValColor, valWidth: vpValWidth, valStyle: vpValStyle, valLabel: vpValLabel,
    });
  }, [showVolumeProfile, vpData.data.valueArea, refs,
    vpPocEnabled, vpPocColor, vpPocWidth, vpPocStyle, vpPocLabel,
    vpVahEnabled, vpVahColor, vpVahWidth, vpVahStyle, vpVahLabel,
    vpValEnabled, vpValColor, vpValWidth, vpValStyle, vpValLabel]);

  const settings = useChartSettings({
    refs,
    timeframe: symbolData.timeframe,
    handleTimeframeChange: symbolData.handleTimeframeChange,
    customColors,
    setCustomColors,
  });

  const drawing = useDrawingTools({
    refs,
    theme,
    symbol: symbolData.symbol,
    clusterRenderer: clusterRendererRef.current,
    getFootprintForTime,
    showClusterOverlay,
  });

  const contextMenuHook = useContextMenu({
    refs,
    symbol: symbolData.symbol,
    timeframe: symbolData.timeframe,
    showGrid: settings.showGrid,
    availableTemplates: settings.availableTemplates,
    handleLoadTemplate: settings.handleLoadTemplate,
    toggleGrid: settings.toggleGrid,
    resetView: engine.resetView,
    handleScreenshot: engine.handleScreenshot,
    copyPrice: settings.copyPrice,
    setAdvancedSettingsPosition: settings.setAdvancedSettingsPosition,
    setShowAdvancedSettings: settings.setShowAdvancedSettings,
    setShowSaveTemplateModal: settings.setShowSaveTemplateModal,
  });

  // Sync timeframe to chart engine for countdown rendering
  useEffect(() => {
    if (refs.chartEngine.current) {
      refs.chartEngine.current.setTimeframeSeconds(symbolData.timeframe);
    }
  }, [refs, symbolData.timeframe]);

  // Keep trading ref in sync
  tradingRef.current = { activeBroker, connections, placeOrder, closePosition, contractQuantity, symbol: symbolData.symbol, showTradeBar };

  // Auto-show tool properties panel when a tool is selected
  useEffect(() => {
    if (drawing.selectedTool) {
      setShowToolProperties(true);
    }
  }, [drawing.selectedTool]);

  // === KEYBOARD SHORTCUTS (inline - too many cross-deps) ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement)?.isContentEditable) return;

      if (e.key === '+' || e.key === '=') { e.preventDefault(); engine.smartZoom(true); return; }
      if (e.key === '-') { e.preventDefault(); engine.smartZoom(false); return; }
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); engine.resetView(); return; }
      if (e.key === 'S' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); engine.handleScreenshot(); return; }
      if (e.key === '?') { setShowShortcuts(prev => !prev); return; }

      const t = tradingRef.current;
      if (t.showTradeBar && t.activeBroker && t.connections[t.activeBroker]?.connected) {
        const price = refs.currentPrice.current;
        if (e.key === 'b' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          t.placeOrder({ broker: t.activeBroker, symbol: t.symbol.toUpperCase(), side: 'buy', type: 'market', quantity: t.contractQuantity, marketPrice: price });
          return;
        }
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          t.placeOrder({ broker: t.activeBroker, symbol: t.symbol.toUpperCase(), side: 'sell', type: 'market', quantity: t.contractQuantity, marketPrice: price });
          return;
        }
        if (e.key === 'x' && !e.ctrlKey) { e.preventDefault(); t.closePosition(t.symbol.toUpperCase()); return; }
        if (e.key === 'f' && !e.ctrlKey) {
          e.preventDefault();
          const allSymbols = new Set(positionsRef.current.map(p => p.symbol));
          allSymbols.forEach(sym => t.closePosition(sym));
          return;
        }
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tfList: TimeframeSeconds[] = [60, 300, 900, 3600, 14400, 86400];
        const currentIdx = tfList.indexOf(symbolData.timeframe);
        if (currentIdx !== -1) {
          const nextIdx = e.key === 'ArrowRight'
            ? Math.min(currentIdx + 1, tfList.length - 1)
            : Math.max(currentIdx - 1, 0);
          if (nextIdx !== currentIdx) {
            e.preventDefault();
            refs.handleTimeframeChange.current(tfList[nextIdx]);
          }
        }
        return;
      }

      refs.interactionController.current.handleKeyDown(e);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      refs.interactionController.current.handleKeyUp(e);
    };

    // Wheel zoom is handled directly by CanvasChartEngine.handleWheel
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [engine, symbolData.timeframe, refs]);

  // === MULTI-CHART SYNC ===
  useEffect(() => {
    const mgr = new BroadcastChannelManager('livechart-' + Math.random().toString(36).slice(2, 8));

    // Register crosshair broadcast
    const chartEngine = refs.chartEngine.current as any;
    if (chartEngine?.setOnCrosshairMove) {
      chartEngine.setOnCrosshairMove((time: number, price: number) => {
        const sync = useChartSyncStore.getState();
        if (sync.syncEnabled && sync.syncCrosshair) {
          mgr.broadcastCrosshair(price, time, true);
        }
      });
    }

    // Listen for incoming sync messages
    mgr.setListeners({
      onSymbol: (msg) => {
        const sync = useChartSyncStore.getState();
        if (sync.syncEnabled && sync.syncSymbol) {
          symbolData.handleSymbolChange(msg.symbol);
        }
      },
      onTimeframe: (msg) => {
        const sync = useChartSyncStore.getState();
        if (sync.syncEnabled && sync.syncTimeframe) {
          symbolData.handleTimeframeChange(msg.timeframe as TimeframeSeconds);
        }
      },
    });

    return () => {
      mgr.close();
    };
  }, [refs, symbolData.handleSymbolChange, symbolData.handleTimeframeChange]);

  // Close symbol dropdown on scroll or resize
  const closeSymbolDropdown = useCallback(() => {
    symbolData.setShowSymbolSearch(false);
    setSymbolDropdownPos(null);
  }, [symbolData]);

  useEffect(() => {
    if (!symbolDropdownPos) return;
    window.addEventListener('scroll', closeSymbolDropdown, true);
    window.addEventListener('resize', closeSymbolDropdown);
    return () => {
      window.removeEventListener('scroll', closeSymbolDropdown, true);
      window.removeEventListener('resize', closeSymbolDropdown);
    };
  }, [symbolDropdownPos, closeSymbolDropdown]);

  return (
    <div
      className={`flex h-full ${className || ''}`}
      style={{ backgroundColor: engine.effectiveColors.background }}
    >
      {/* Vertical Toolbar — TradingView-style */}
      <VerticalToolbar
        activeTool={drawing.mapToolType(drawing.activeTool) || 'cursor'}
        onToolSelect={drawing.handleToolSelect}
        onDeleteSelected={() => {
          if (drawing.selectedTool) {
            refs.toolsEngine.current.deleteTool(drawing.selectedTool.id);
            drawing.setSelectedTool(null);
            drawing.renderDrawingTools();
          }
        }}
        hasSelectedTool={drawing.selectedTool !== null}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center px-1.5 py-0.5 border-b gap-0 overflow-x-auto"
          style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, minHeight: 32, flexShrink: 0, scrollbarWidth: 'none', position: 'relative', zIndex: 10 } as React.CSSProperties}
          onWheel={e => e.stopPropagation()}
        >
          {/* Group 1: Symbol & Price */}
          <div className="flex items-center gap-2.5 pr-2.5" style={{ borderRight: `1px solid ${theme.colors.border}` }}>
            <div className="relative">
              <button
                ref={symbolBtnRef}
                onClick={() => {
                  const rect = symbolBtnRef.current?.getBoundingClientRect();
                  if (symbolData.showSymbolSearch) {
                    closeSymbolDropdown();
                  } else {
                    symbolData.setShowSymbolSearch(true);
                    if (rect) setSymbolDropdownPos({ top: rect.bottom + 4, left: rect.left });
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-bold rounded px-2 py-1 border focus:outline-none hover:bg-opacity-80 transition-colors"
                style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }}
              >
                <span>{symbolData.selectedSymbolLabel}</span>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

            </div>

            <span ref={refs.price} className="text-base font-mono font-bold tabular-nums" style={{ color: theme.colors.text }}>$0.00</span>

            {/* Price Position Indicator */}
            <div ref={refs.pricePosition} className="relative w-4 h-6 rounded border overflow-hidden" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border }} data-tooltip="Session Range" data-tooltip-pos="top">
              <div ref={refs.pricePositionBar} className="absolute inset-x-0 bottom-0 w-full transition-all duration-300" style={{ height: '50%', background: 'linear-gradient(to top, #eab30860, #eab30820)' }} />
              <div className="position-line absolute left-0 right-0 h-0.5 transition-all duration-300" style={{ bottom: '50%', backgroundColor: '#eab308', boxShadow: '0 0 4px #eab308' }} />
            </div>

            {/* OHLC Display — live DOM refs, no re-render */}
            <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono tabular-nums" style={{ color: theme.colors.textSecondary }}>
              <span style={{ color: theme.colors.textMuted }}>O</span>
              <span ref={refs.ohlcOpen}>--</span>
              <span style={{ color: theme.colors.textMuted }}>H</span>
              <span ref={refs.ohlcHigh} style={{ color: theme.colors.success }}>--</span>
              <span style={{ color: theme.colors.textMuted }}>L</span>
              <span ref={refs.ohlcLow} style={{ color: theme.colors.error }}>--</span>
              <span style={{ color: theme.colors.textMuted }}>C</span>
              <span ref={refs.ohlcClose}>--</span>
            </div>

            {/* Active Indicators Pills */}
            {indicatorConfigs.filter(i => i.enabled).length > 0 && (
              <div className="hidden lg:flex items-center gap-0.5">
                {indicatorConfigs.filter(i => i.enabled).map(ind => (
                  <button
                    key={ind.id}
                    onClick={() => setEditingIndicatorId(editingIndicatorId === ind.id ? null : ind.id)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all hover:brightness-125"
                    style={{ backgroundColor: ind.style.color + '22', color: ind.style.color }}
                  >
                    {ind.type}{ind.params.period ? `(${ind.params.period})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Group 2: Timeframes */}
          <div className="flex items-center gap-0.5 px-2.5" style={{ borderRight: `1px solid ${theme.colors.border}` }}>
            {Object.entries(TF_GROUPS).map(([group, tfs]) => (
              <div key={group} className="flex items-center rounded p-px mr-0.5" style={{ backgroundColor: theme.colors.background }}>
                {tfs.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => symbolData.handleTimeframeChange(tf)}
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium transition-all duration-150"
                    style={{
                      backgroundColor: symbolData.timeframe === tf ? theme.colors.toolActive : 'transparent',
                      color: symbolData.timeframe === tf ? activeTextColor : theme.colors.textSecondary,
                    }}
                  >
                    {TIMEFRAME_LABELS[tf]}
                  </button>
                ))}
              </div>
            ))}
            <PriceCountdownCompact timeframeSeconds={symbolData.timeframe} />
          </div>

          {/* Group 3: Controls */}
          <div className="flex items-center gap-1 pl-2.5 ml-auto">
            <MagnetToggle theme={theme} />

            {/* Chart Settings — opens AdvancedChartSettings */}
            <button
              onClick={settings.openAdvancedSettings}
              data-tooltip="Chart Settings"
              className="w-7 h-7 flex items-center justify-center rounded transition-colors"
              style={{ backgroundColor: settings.showAdvancedSettings ? theme.colors.toolActive : 'transparent', color: settings.showAdvancedSettings ? activeTextColor : theme.colors.textSecondary }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </button>

            {/* Indicators Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
                data-tooltip="Indicators"
                className="w-7 h-7 flex items-center justify-center rounded text-sm transition-all duration-150 hover:scale-105 active:scale-95"
                style={{ backgroundColor: indicatorConfigs.some(i => i.enabled) ? theme.colors.toolActive : 'transparent', color: indicatorConfigs.some(i => i.enabled) ? activeTextColor : theme.colors.textSecondary }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </button>
              {showIndicatorMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowIndicatorMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-xl z-50 py-1" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>Indicators</div>
                    {indicatorConfigs.map(ind => {
                      const label = ind.type;
                      return (
                        <div key={ind.id} className="flex items-center hover:bg-[var(--surface-hover)] transition-colors">
                          <button onClick={() => toggleIndicatorConfig(ind.id)} className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs" style={{ color: ind.enabled ? theme.colors.text : theme.colors.textMuted }}>
                            <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: ind.enabled ? ind.style.color : 'transparent', borderColor: ind.style.color }} />
                            <span className="font-medium">{label}</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowIndicatorMenu(false); setEditingIndicatorId(ind.id); }}
                            className="w-6 h-6 flex items-center justify-center rounded transition-colors hover:bg-[var(--surface-hover)] mr-1"
                            style={{ color: theme.colors.textMuted }}
                            title="Settings"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Volume Profile Toggle */}
            <button onClick={() => setShowVolumeProfile(!showVolumeProfile)} data-tooltip="Volume Profile" className="w-7 h-7 flex items-center justify-center rounded text-sm transition-all duration-150 hover:scale-105 active:scale-95" style={{ backgroundColor: showVolumeProfile ? theme.colors.toolActive : 'transparent', color: showVolumeProfile ? activeTextColor : theme.colors.textSecondary }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" rx="1" /><rect x="12" y="6" width="3" height="12" rx="1" /><rect x="17" y="12" width="3" height="6" rx="1" /></svg>
            </button>

            {/* Trade Toggle */}
            <button onClick={() => setShowTradeBar(!showTradeBar)} data-tooltip="Quick Trade" className="w-7 h-7 flex items-center justify-center rounded text-sm transition-all duration-150 hover:scale-105 active:scale-95" style={{ backgroundColor: showTradeBar ? theme.colors.toolActive : 'transparent', color: showTradeBar ? activeTextColor : theme.colors.textSecondary }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </button>

            {/* Global Settings */}
            <button onClick={() => settings.setShowGlobalSettings(true)} data-tooltip="Settings" className="w-7 h-7 flex items-center justify-center rounded text-sm transition-all duration-150 hover:scale-105 active:scale-95" style={{ color: theme.colors.textSecondary }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
            </button>

            <div className="w-px h-4" style={{ backgroundColor: theme.colors.border }} />

            {/* Theme Selector */}
            <div className="relative">
              <button onClick={() => setShowThemePanel(!showThemePanel)} data-tooltip={THEMES.find(t => t.id === themeId)?.name} className="w-7 h-7 flex items-center justify-center rounded transition-all duration-150 hover:scale-105 active:scale-95" style={{ backgroundColor: theme.colors.background, border: `1px solid ${theme.colors.border}` }}>
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.colors.candleUp, boxShadow: `0 0 6px ${theme.colors.candleUp}40` }} />
              </button>
              {showThemePanel && (
                <div className="absolute top-full right-0 mt-1 rounded-lg shadow-2xl z-50 p-1.5 min-w-[160px] animate-slideDown" style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}>
                  {THEMES.map((t, index) => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setShowThemePanel(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all duration-200 ease-out transform ${themeId === t.id ? 'scale-102' : 'hover:scale-102 active:scale-98'}`}
                      style={{ backgroundColor: themeId === t.id ? theme.colors.toolActive : 'transparent', color: themeId === t.id ? activeTextColor : theme.colors.text, animationDelay: `${index * 30}ms` }}
                    >
                      <span className={`w-3 h-3 rounded-full transition-transform duration-200 ${themeId === t.id ? 'scale-125' : ''}`} style={{ backgroundColor: t.colors.candleUp, boxShadow: `0 0 6px ${t.colors.candleUp}` }} />
                      <span className="font-medium">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: theme.colors.textMuted }}>
              <span ref={refs.tickCount} className="font-mono tabular-nums">0</span>
              <div ref={refs.statusDot} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.colors.textMuted }} />
            </div>

            {/* Layout selector slot (Single/Split/Grid) */}
            {headerRight && (
              <>
                <div className="w-px h-4" style={{ backgroundColor: theme.colors.border }} />
                {headerRight}
              </>
            )}
          </div>
        </div>

        {/* Quick Trade Bar */}
        <div style={{ height: showTradeBar ? 34 : 0, overflow: 'hidden', transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <QuickTradeBar
            symbol={symbolData.symbol}
            colors={{ surface: theme.colors.surface, border: theme.colors.border, text: theme.colors.text, textSecondary: theme.colors.textSecondary, textMuted: theme.colors.textMuted, success: theme.colors.success, error: theme.colors.error, background: theme.colors.background }}
          />
        </div>

        {/* Favorites Toolbar — only if has favorites */}
        {customFavorites.length > 0 && (
          <FavoritesToolbar
            activeTool={drawing.mapToolType(drawing.activeTool) || 'cursor'}
            onToolSelect={drawing.handleToolSelect}
            onDeleteSelected={() => {
              if (drawing.selectedTool) {
                refs.toolsEngine.current.deleteTool(drawing.selectedTool.id);
                drawing.setSelectedTool(null);
                drawing.renderDrawingTools();
              }
            }}
            hasSelectedTool={drawing.selectedTool !== null}
            colors={{
              surface: theme.colors.surface,
              background: theme.colors.background,
              gridColor: theme.colors.border,
              textPrimary: theme.colors.text,
              textMuted: theme.colors.textMuted,
              deltaPositive: theme.colors.success,
              deltaNegative: theme.colors.error,
            }}
            preset="custom"
          />
        )}

        {/* Inline Tool Settings — TradingView-style */}
        <InlineToolSettings selectedTool={drawing.selectedTool} onRender={drawing.renderDrawingTools} />

        {/* Chart Area */}
        <div className="flex-1 relative" style={{ isolation: 'isolate' }} onContextMenu={contextMenuHook.handleContextMenu}>
          <div ref={refs.chartContainer} className="w-full h-full">
            <canvas ref={refs.chartCanvas} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair', zIndex: 1 }} />
          </div>

          {/* Volume Profile Panel — side-configurable overlay */}
          {showVolumeProfile && symbolData.viewportState.chartHeight > 0 && (
            <div className="absolute z-[3]" style={vpPanelSide === 'left' ? { left: 0, top: 0 } : { right: 80, top: 0 }}>
              <VolumeProfilePanel
                data={vpData.data}
                priceMin={symbolData.viewportState.priceMin}
                priceMax={symbolData.viewportState.priceMax}
                chartHeight={symbolData.viewportState.chartHeight}
                width={140}
                side={vpPanelSide}
                theme={{ background: engine.effectiveColors.background, border: theme.colors.border, text: theme.colors.text, textMuted: theme.colors.textMuted }}
                vpColors={{ bid: vpBidColor, ask: vpAskColor, opacity: vpBarOpacity }}
                vpBackground={{ show: vpShowBackground, color: vpBackgroundColor, opacity: vpBackgroundOpacity }}
                vpGradient={{ enabled: vpGradientEnabled, askEnd: vpAskGradientEnd, bidEnd: vpBidGradientEnd }}
              />
            </div>
          )}

          {showDepthMap && symbolData.viewportState.chartHeight > 0 && (
            <MiniDepthHeatmap priceMin={symbolData.viewportState.priceMin} priceMax={symbolData.viewportState.priceMax} chartHeight={symbolData.viewportState.chartHeight} onClose={() => setShowDepthMap(false)} />
          )}

          <canvas
            ref={refs.drawingCanvas}
            className="absolute inset-0"
            style={{ zIndex: 5, pointerEvents: (drawing.activeTool !== 'cursor' && drawing.activeTool !== 'crosshair') || drawing.toolCount > 0 || drawing.hasPositionsOrOrders ? 'auto' : 'none' }}
            onMouseDown={drawing.handleCanvasMouseDown}
            onMouseMove={drawing.handleCanvasMouseMove}
            onMouseUp={drawing.handleCanvasMouseUp}
            onMouseLeave={drawing.handleCanvasMouseLeave}
            onContextMenu={drawing.handleCanvasContextMenu}
            onDoubleClick={drawing.handleCanvasDoubleClick}
          />

          <LoadingOverlay loadingPhase={symbolData.loadingPhase} backgroundColor={engine.effectiveColors.background} theme={theme} />
          {symbolData.noData && (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              style={{ backgroundColor: `${engine.effectiveColors.background}e0`, backdropFilter: 'blur(4px)' }}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                  {symbolData.symbol && /^[A-Z]{1,3}$/.test(symbolData.symbol)
                    ? 'Market closed — CME futures trade Sun 6PM – Fri 5PM ET'
                    : 'No data available for this symbol'}
                </span>
              </div>
            </div>
          )}
          <AlertNotifications notifications={symbolData.notifications} onDismiss={symbolData.dismissNotification} theme={theme} />
          <ZoomControls onZoomIn={() => engine.smartZoom(true)} onZoomOut={() => engine.smartZoom(false)} onResetView={engine.resetView} onScreenshot={engine.handleScreenshot} theme={theme} />

          {/* Tool settings handled by InlineToolSettings above */}

          {/* Customize Panel */}
          {settings.showCustomizePanel && (
            <CustomizeColorsPanel
              customColors={customColors}
              setCustomColors={setCustomColors}
              effectiveColors={engine.effectiveColors}
              theme={theme}
              onClose={() => settings.setShowCustomizePanel(false)}
            />
          )}
        </div>

        <ChartFooter timeframe={symbolData.timeframe} activeTool={drawing.activeTool} selectedTool={drawing.selectedTool} status={symbolData.status} symbol={symbolData.symbol} volumeRef={refs.footerVolume} theme={theme} />
      </div>

      {/* Click outside to close theme panel (symbol search has its own portal backdrop) */}
      {showThemePanel && (
        <div className="fixed inset-0 z-40" onClick={() => setShowThemePanel(false)} />
      )}

      {contextMenuHook.contextMenu && (
        <ContextMenu x={contextMenuHook.contextMenu.x} y={contextMenuHook.contextMenu.y} items={contextMenuHook.contextMenuItems} onClose={contextMenuHook.closeContextMenu} theme="senzoukria" />
      )}

      {/* Tool Context Menu */}
      {drawing.toolContextMenu && (
        <ContextMenu
          x={drawing.toolContextMenu.x}
          y={drawing.toolContextMenu.y}
          items={createToolContextMenuItems(
            drawing.toolContextMenu.tool,
            refs.toolsEngine.current,
            () => drawing.setToolContextMenu(null),
            drawing.renderDrawingTools
          )}
          onClose={() => drawing.setToolContextMenu(null)}
          theme="senzoukria"
        />
      )}

      {/* Text Editor Overlay */}
      {drawing.textEditorState && (
        <TextEditor
          tool={drawing.textEditorState.tool}
          position={drawing.textEditorState.position}
          onClose={() => {
            refs.toolsEngine.current.cancelTextEdit(drawing.textEditorState!.tool.id);
            drawing.setTextEditorState(null);
          }}
          onSave={(content) => {
            refs.toolsEngine.current.finishTextEdit(drawing.textEditorState!.tool.id, content);
            drawing.setTextEditorState(null);
            drawing.renderDrawingTools();
          }}
        />
      )}

      <SaveTemplateModal isOpen={settings.showSaveTemplateModal} onClose={() => settings.setShowSaveTemplateModal(false)} onSave={settings.handleSaveTemplate} />
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <GlobalSettingsModal isOpen={settings.showGlobalSettings} onClose={() => settings.setShowGlobalSettings(false)} />

      <AdvancedToolSettingsModal isOpen={settings.showAdvancedSettings && drawing.selectedTool !== null} onClose={() => settings.setShowAdvancedSettings(false)} activeTool={drawing.selectedTool?.type || 'cursor'} selectedTool={drawing.selectedTool} initialPosition={settings.advancedSettingsPosition} theme={theme} />

      <AdvancedChartSettings
        isOpen={settings.showAdvancedSettings && (drawing.activeTool === 'cursor' || drawing.activeTool === 'crosshair')}
        onClose={() => settings.setShowAdvancedSettings(false)}
        initialPosition={settings.advancedSettingsPosition}
        crosshairColor={settings.crosshairSettings.color}
        crosshairWidth={settings.crosshairSettings.width}
        crosshairStyle={settings.crosshairSettings.style}
        candleUpColor={settings.candleSettings.upColor}
        candleDownColor={settings.candleSettings.downColor}
        wickUpColor={settings.candleSettings.wickUp}
        wickDownColor={settings.candleSettings.wickDown}
        candleBorderUp={settings.candleSettings.borderUp}
        candleBorderDown={settings.candleSettings.borderDown}
        backgroundColor={settings.backgroundSettings.color}
        showGrid={settings.backgroundSettings.showGrid}
        gridColor={settings.backgroundSettings.gridColor}
        onCrosshairChange={settings.handleCrosshairChange}
        onCandleChange={settings.handleCandleChange}
        onBackgroundChange={settings.handleBackgroundChange}
      />

      {editingIndicatorId && (
        <IndicatorSettingsPanel
          indicatorId={editingIndicatorId}
          onClose={() => setEditingIndicatorId(null)}
          position={{ x: 300, y: 200 }}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes alertIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      ` }} />

      {/* Symbol Search — fullscreen on mobile, positioned dropdown on desktop */}
      {symbolData.showSymbolSearch && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/60 sm:bg-transparent"
            onTouchStart={(e) => { e.preventDefault(); closeSymbolDropdown(); }}
            onClick={closeSymbolDropdown}
          />
          <div
            className="fixed inset-x-0 bottom-0 sm:bottom-auto sm:inset-x-auto sm:w-96 rounded-t-2xl sm:rounded-lg shadow-2xl z-[9999] max-h-[80vh] sm:max-h-[450px] overflow-hidden"
            style={{
              ...(symbolDropdownPos ? { top: symbolDropdownPos.top, left: symbolDropdownPos.left } : {}),
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
            }}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Asset Category Tabs */}
            <div className="flex items-center gap-0.5 p-1.5 border-b overflow-x-auto" style={{ borderColor: theme.colors.border }}>
              {ASSET_CATEGORIES.map((cat, index) => {
                const IconComponent = ASSET_CATEGORY_ICONS[cat.id];
                return (
                  <button
                    key={cat.id}
                    onClick={() => symbolData.setAssetCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-all duration-300 ease-out transform ${symbolData.assetCategory === cat.id ? 'scale-105 shadow-lg' : 'hover:scale-102 active:scale-95'}`}
                    style={{
                      backgroundColor: symbolData.assetCategory === cat.id ? theme.colors.toolActive : 'transparent',
                      color: symbolData.assetCategory === cat.id ? activeTextColor : theme.colors.textSecondary,
                      boxShadow: symbolData.assetCategory === cat.id ? `0 0 10px ${theme.colors.toolActive}40` : 'none',
                      animationDelay: `${index * 30}ms`,
                    }}
                  >
                    <span className={`transition-transform duration-200 ${symbolData.assetCategory === cat.id ? 'scale-110' : ''}`}>
                      <IconComponent size={16} color={symbolData.assetCategory === cat.id ? activeTextColor : undefined} />
                    </span>
                    <span className="font-medium">{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="p-2 border-b" style={{ borderColor: theme.colors.border }}>
              <input
                type="text"
                value={symbolData.symbolSearchQuery}
                onChange={(e) => symbolData.setSymbolSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { closeSymbolDropdown(); symbolData.setSymbolSearchQuery(''); } }}
                placeholder={`Search ${symbolData.assetCategory} symbols...`}
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                style={{ backgroundColor: theme.colors.background, color: theme.colors.text, border: `1px solid ${theme.colors.border}` }}
              />
            </div>

            {/* Note for futures */}
            {symbolData.assetCategory === 'futures' && (
              <div className="px-3 py-2 text-xs border-b" style={{ borderColor: theme.colors.border, color: theme.colors.textSecondary }}>
                CME Futures via dxFeed. Connectez Interactive Brokers dans les paramètres pour le temps réel.
              </div>
            )}

            {/* Categories */}
            <div className="overflow-y-auto max-h-64">
              {Object.keys(symbolData.filteredSymbols).length === 0 && symbolData.symbolSearchQuery.trim() && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="1.5" opacity="0.4">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span className="text-xs" style={{ color: theme.colors.textMuted }}>
                    No symbols match &ldquo;{symbolData.symbolSearchQuery}&rdquo;
                  </span>
                </div>
              )}
              {Object.entries(symbolData.filteredSymbols).map(([category, symbols]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-semibold sticky top-0" style={{ backgroundColor: theme.colors.surface, color: theme.colors.textMuted }}>
                    {category}
                  </div>
                  <div className="grid grid-cols-2 gap-0.5 px-1 pb-1">
                    {symbols.map(s => (
                      <button
                        key={s.value}
                        onClick={() => { symbolData.handleSymbolChange(s.value); closeSymbolDropdown(); symbolData.setSymbolSearchQuery(''); }}
                        className="text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between"
                        style={{
                          backgroundColor: symbolData.symbol === s.value ? theme.colors.toolActive : 'transparent',
                          color: symbolData.symbol === s.value ? activeTextColor : theme.colors.text,
                        }}
                      >
                        <span>{s.label}</span>
                        {s.exchange && <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>{s.exchange}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
