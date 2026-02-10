'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import type { ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import { type TimeframeSeconds, TIMEFRAME_LABELS } from '@/lib/live/HierarchicalAggregator';
import { useThemeStore } from '@/stores/useThemeStore';
import { THEMES } from '@/lib/themes/ThemeSystem';
import { getToolsEngine, type ToolType as EngineToolType } from '@/lib/tools/ToolsEngine';
import { getToolsRenderer } from '@/lib/tools/ToolsRenderer';
import { getInteractionController } from '@/lib/tools/InteractionController';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import ToolSettingsBar from '@/components/tools/ToolSettingsBar';
import AdvancedToolSettingsModal from '@/components/tools/AdvancedToolSettingsModal';
import AdvancedChartSettings from '@/components/settings/AdvancedChartSettings';
import FavoritesToolbar from '@/components/tools/FavoritesToolbar';
import { SettingsIcon } from '@/components/ui/Icons';
import QuickTradeBar from '@/components/trading/QuickTradeBar';
import KeyboardShortcutsModal from '@/components/ui/KeyboardShortcutsModal';
import { PriceCountdownCompact } from '@/components/trading/PriceCountdown';
import { useTradingStore } from '@/stores/useTradingStore';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import MiniDepthHeatmap from '@/components/charts/MiniDepthHeatmap';
import GlobalSettingsModal from '@/components/settings/GlobalSettingsModal';
import { ASSET_CATEGORY_ICONS, ASSET_CATEGORIES } from './constants/symbols';
import { TF_GROUPS } from './constants/timeframes';
import { COLOR_PRESETS } from './constants/colors';
import LoadingOverlay from './components/LoadingOverlay';
import ZoomControls from './components/ZoomControls';
import AlertNotifications from './components/AlertNotifications';
import ChartFooter from './components/ChartFooter';
import MagnetToggle from './components/MagnetToggle';
import { useChartEngine, useSymbolData, useChartSettings, useDrawingTools, useContextMenu } from './hooks';
import { DEFAULT_CUSTOM_COLORS, type SharedRefs, type CustomColors } from './hooks/types';

interface LiveChartProProps {
  className?: string;
  onSymbolChange?: (symbol: string) => void;
}

export default function LiveChartPro({ className, onSymbolChange }: LiveChartProProps) {
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
  }), []);

  // === UI TOGGLE STATE ===
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showTradeBar, setShowTradeBar] = useState(false);
  const [showDepthMap, setShowDepthMap] = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [customColors, setCustomColors] = useState<CustomColors>(DEFAULT_CUSTOM_COLORS);

  // === STORE HOOKS ===
  const { themeId, setTheme, getTheme } = useThemeStore();
  const theme = useMemo(() => getTheme(), [themeId, getTheme]);
  const { positions, activeBroker, connections, placeOrder, closePosition, contractQuantity } = useTradingStore();
  const { indicators: indicatorConfigs, toggleIndicator: toggleIndicatorConfig } = useIndicatorStore();

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

  // Keep trading ref in sync
  tradingRef.current = { activeBroker, connections, placeOrder, closePosition, contractQuantity, symbol: symbolData.symbol, showTradeBar };

  // === KEYBOARD SHORTCUTS (inline - too many cross-deps) ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

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

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        engine.smartZoom(e.deltaY < 0);
      }
    };

    const container = refs.chartContainer.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [engine, symbolData.timeframe, refs]);

  return (
    <div
      className={`flex h-full ${className || ''}`}
      style={{ backgroundColor: engine.effectiveColors.background }}
    >
      {/* FavoritesToolbar - Left Side */}
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
          deltaPositive: theme.colors.toolActive,
          deltaNegative: theme.colors.error,
        }}
        preset="default"
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center px-3 py-1.5 border-b gap-0"
          style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}
        >
          {/* Group 1: Symbol & Price */}
          <div className="flex items-center gap-3 pr-3" style={{ borderRight: `1px solid ${theme.colors.border}` }}>
            <div className="relative">
              <button
                onClick={() => symbolData.setShowSymbolSearch(!symbolData.showSymbolSearch)}
                className="flex items-center gap-2 text-sm font-bold rounded px-3 py-1.5 border focus:outline-none hover:bg-opacity-80 transition-colors"
                style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.text }}
              >
                <span>{symbolData.selectedSymbolLabel}</span>
                <span style={{ color: theme.colors.textMuted }}>▼</span>
              </button>

              {/* Symbol Search Modal */}
              {symbolData.showSymbolSearch && (
                <div
                  className="absolute top-full left-0 mt-1 w-96 rounded-lg shadow-2xl z-50 max-h-[450px] overflow-hidden animate-slideDown"
                  style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
                >
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
                            color: symbolData.assetCategory === cat.id ? '#fff' : theme.colors.textSecondary,
                            boxShadow: symbolData.assetCategory === cat.id ? `0 0 10px ${theme.colors.toolActive}40` : 'none',
                            animationDelay: `${index * 30}ms`,
                          }}
                        >
                          <span className={`transition-transform duration-200 ${symbolData.assetCategory === cat.id ? 'scale-110' : ''}`}>
                            <IconComponent size={16} color={symbolData.assetCategory === cat.id ? '#fff' : undefined} />
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
                      onKeyDown={(e) => { if (e.key === 'Escape') { symbolData.setShowSymbolSearch(false); symbolData.setSymbolSearchQuery(''); } }}
                      placeholder={`Search ${symbolData.assetCategory} symbols...`}
                      autoFocus
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
                              onClick={() => { symbolData.handleSymbolChange(s.value); symbolData.setShowSymbolSearch(false); symbolData.setSymbolSearchQuery(''); }}
                              className="text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between"
                              style={{
                                backgroundColor: symbolData.symbol === s.value ? theme.colors.toolActive : 'transparent',
                                color: symbolData.symbol === s.value ? '#fff' : theme.colors.text,
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
              )}
            </div>

            <span ref={refs.price} className="text-xl font-mono font-bold" style={{ color: theme.colors.text }}>$0.00</span>

            {/* Price Position Indicator */}
            <div ref={refs.pricePosition} className="relative w-5 h-7 rounded border overflow-hidden" style={{ backgroundColor: '#1a1a1a', borderColor: theme.colors.border }} data-tooltip="Session Range" data-tooltip-pos="top">
              <div ref={refs.pricePositionBar} className="absolute inset-x-0 bottom-0 w-full transition-all duration-300" style={{ height: '50%', background: 'linear-gradient(to top, #eab30860, #eab30820)' }} />
              <div className="position-line absolute left-0 right-0 h-0.5 transition-all duration-300" style={{ bottom: '50%', backgroundColor: '#eab308', boxShadow: '0 0 4px #eab308' }} />
            </div>

            {/* Active Indicators Pills */}
            {indicatorConfigs.filter(i => i.enabled).length > 0 && (
              <div className="flex items-center gap-1">
                {indicatorConfigs.filter(i => i.enabled).map(ind => (
                  <span key={ind.id} className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: ind.style.color + '33', color: ind.style.color }}>
                    {ind.type}{ind.params.period ? `(${ind.params.period})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Group 2: Timeframes */}
          <div className="flex items-center gap-1 px-3" style={{ borderRight: `1px solid ${theme.colors.border}` }}>
            {Object.entries(TF_GROUPS).map(([group, tfs]) => (
              <div key={group} className="flex items-center rounded p-0.5 mr-1" style={{ backgroundColor: theme.colors.background }}>
                {tfs.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => symbolData.handleTimeframeChange(tf)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${symbolData.timeframe === tf ? '' : 'hover:scale-105 active:scale-95 hover:bg-white/5'}`}
                    style={{
                      backgroundColor: symbolData.timeframe === tf ? theme.colors.toolActive : 'transparent',
                      color: symbolData.timeframe === tf ? '#fff' : theme.colors.textSecondary,
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
          <div className="flex items-center gap-2 pl-3 ml-auto">
            <MagnetToggle theme={theme} />

            <button
              onClick={() => settings.setShowCustomizePanel(!settings.showCustomizePanel)}
              data-tooltip="Customize Colors"
              className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
              style={{ backgroundColor: settings.showCustomizePanel ? theme.colors.toolActive : 'transparent', color: settings.showCustomizePanel ? '#fff' : theme.colors.textSecondary }}
            >
              <SettingsIcon size={16} color={settings.showCustomizePanel ? '#fff' : theme.colors.textSecondary} />
            </button>

            {/* Indicators Toggle */}
            <div className="relative">
              <button
                onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
                data-tooltip="Indicators"
                className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
                style={{ backgroundColor: indicatorConfigs.some(i => i.enabled) ? '#8b5cf6' : 'transparent', color: indicatorConfigs.some(i => i.enabled) ? '#fff' : theme.colors.textSecondary }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </button>
              {showIndicatorMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowIndicatorMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-xl z-50 py-1" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>Indicators</div>
                    {indicatorConfigs.map(ind => {
                      const label = ind.type === 'SMA' || ind.type === 'EMA' ? `${ind.type} ${ind.params.period}` : ind.type === 'BollingerBands' ? 'Bollinger Bands' : ind.type;
                      return (
                        <button key={ind.id} onClick={() => toggleIndicatorConfig(ind.id)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-white/5" style={{ color: ind.enabled ? theme.colors.text : theme.colors.textMuted }}>
                          <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: ind.enabled ? ind.style.color : 'transparent', borderColor: ind.style.color }} />
                          <span className="font-medium">{label}</span>
                          {ind.enabled && <span className="ml-auto text-[10px]" style={{ color: theme.colors.textMuted }}>ON</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Depth Heatmap Toggle */}
            <button onClick={() => setShowDepthMap(!showDepthMap)} data-tooltip="Depth Map" className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95" style={{ backgroundColor: showDepthMap ? '#06b6d4' : 'transparent', color: showDepthMap ? '#fff' : theme.colors.textSecondary }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
            </button>

            {/* Trade Toggle */}
            <button onClick={() => setShowTradeBar(!showTradeBar)} data-tooltip="Quick Trade" className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95" style={{ backgroundColor: showTradeBar ? '#7c3aed' : 'transparent', color: showTradeBar ? '#fff' : theme.colors.textSecondary }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </button>

            {/* Global Settings */}
            <button onClick={() => settings.setShowGlobalSettings(true)} data-tooltip="Settings" className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95" style={{ color: theme.colors.textSecondary }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
            </button>

            <div className="w-px h-5" style={{ backgroundColor: theme.colors.border }} />

            {/* Theme Selector */}
            <div className="relative">
              <button onClick={() => setShowThemePanel(!showThemePanel)} className="px-2 py-1 rounded text-xs border transition-colors" style={{ backgroundColor: theme.colors.background, borderColor: theme.colors.border, color: theme.colors.textSecondary }}>
                🎨 {THEMES.find(t => t.id === themeId)?.name}
              </button>
              {showThemePanel && (
                <div className="absolute top-full right-0 mt-1 rounded-lg shadow-2xl z-50 p-1.5 min-w-[160px] animate-slideDown" style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}>
                  {THEMES.map((t, index) => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setShowThemePanel(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all duration-200 ease-out transform ${themeId === t.id ? 'scale-102' : 'hover:scale-102 active:scale-98'}`}
                      style={{ backgroundColor: themeId === t.id ? theme.colors.toolActive : 'transparent', color: themeId === t.id ? '#fff' : theme.colors.text, animationDelay: `${index * 30}ms` }}
                    >
                      <span className={`w-3 h-3 rounded-full transition-transform duration-200 ${themeId === t.id ? 'scale-125' : ''}`} style={{ backgroundColor: t.colors.candleUp, boxShadow: `0 0 6px ${t.colors.candleUp}` }} />
                      <span className="font-medium">{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs" style={{ color: theme.colors.textMuted }}>
              <span ref={refs.tickCount}>0</span>
              <div ref={refs.statusDot} className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.colors.textMuted }} />
            </div>
          </div>
        </div>

        {/* Quick Trade Bar */}
        <div style={{ height: showTradeBar ? 38 : 0, overflow: 'hidden', transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <QuickTradeBar
            symbol={symbolData.symbol}
            colors={{ surface: theme.colors.surface, border: theme.colors.border, text: theme.colors.text, textSecondary: theme.colors.textSecondary, textMuted: theme.colors.textMuted, success: theme.colors.success, error: theme.colors.error, background: theme.colors.background }}
          />
        </div>

        {/* Chart Area */}
        <div className="flex-1 relative" onContextMenu={contextMenuHook.handleContextMenu}>
          <div ref={refs.chartContainer} className="w-full h-full">
            <canvas ref={refs.chartCanvas} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />
          </div>

          {showDepthMap && symbolData.viewportState.chartHeight > 0 && (
            <MiniDepthHeatmap priceMin={symbolData.viewportState.priceMin} priceMax={symbolData.viewportState.priceMax} chartHeight={symbolData.viewportState.chartHeight} onClose={() => setShowDepthMap(false)} />
          )}

          <canvas
            ref={refs.drawingCanvas}
            className="absolute inset-0"
            style={{ zIndex: 5, pointerEvents: drawing.activeTool !== 'cursor' && drawing.activeTool !== 'crosshair' ? 'auto' : 'none' }}
            onMouseDown={drawing.handleCanvasMouseDown}
            onMouseMove={drawing.handleCanvasMouseMove}
            onMouseUp={drawing.handleCanvasMouseUp}
            onMouseLeave={drawing.handleCanvasMouseLeave}
          />

          <LoadingOverlay loadingPhase={symbolData.loadingPhase} backgroundColor={engine.effectiveColors.background} theme={theme} />
          <AlertNotifications notifications={symbolData.notifications} onDismiss={symbolData.dismissNotification} theme={theme} />
          <ZoomControls onZoomIn={() => engine.smartZoom(true)} onZoomOut={() => engine.smartZoom(false)} onResetView={engine.resetView} onScreenshot={engine.handleScreenshot} theme={theme} />

          {/* Customize Panel */}
          {settings.showCustomizePanel && (
            <div className="absolute top-2 right-2 w-72 rounded-lg shadow-2xl z-20 overflow-hidden animate-slideInRight" style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}>
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
                <span className="text-sm font-semibold" style={{ color: theme.colors.text }}>Customize Colors</span>
                <button onClick={() => settings.setShowCustomizePanel(false)} className="text-xs" style={{ color: theme.colors.textMuted }}>✕</button>
              </div>
              <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Background</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.background.map(color => (
                      <button key={color} onClick={() => setCustomColors(prev => ({ ...prev, background: color }))} className="w-6 h-6 rounded border-2 transition-transform hover:scale-110" style={{ backgroundColor: color, borderColor: customColors.background === color ? theme.colors.toolActive : 'transparent' }} />
                    ))}
                    <input type="color" value={customColors.background || engine.effectiveColors.background} onChange={(e) => setCustomColors(prev => ({ ...prev, background: e.target.value }))} className="w-6 h-6 rounded cursor-pointer" />
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Bullish Candle</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.candles.bullish.map(color => (
                      <button key={color} onClick={() => setCustomColors(prev => ({ ...prev, candleUp: color, wickUp: color }))} className="w-6 h-6 rounded border-2 transition-transform hover:scale-110" style={{ backgroundColor: color, borderColor: customColors.candleUp === color ? theme.colors.toolActive : 'transparent' }} />
                    ))}
                    <input type="color" value={customColors.candleUp || engine.effectiveColors.candleUp} onChange={(e) => setCustomColors(prev => ({ ...prev, candleUp: e.target.value, wickUp: e.target.value }))} className="w-6 h-6 rounded cursor-pointer" />
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Bearish Candle</div>
                  <div className="flex flex-wrap gap-1">
                    {COLOR_PRESETS.candles.bearish.map(color => (
                      <button key={color} onClick={() => setCustomColors(prev => ({ ...prev, candleDown: color, wickDown: color }))} className="w-6 h-6 rounded border-2 transition-transform hover:scale-110" style={{ backgroundColor: color, borderColor: customColors.candleDown === color ? theme.colors.toolActive : 'transparent' }} />
                    ))}
                    <input type="color" value={customColors.candleDown || engine.effectiveColors.candleDown} onChange={(e) => setCustomColors(prev => ({ ...prev, candleDown: e.target.value, wickDown: e.target.value }))} className="w-6 h-6 rounded cursor-pointer" />
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-2" style={{ color: theme.colors.textMuted }}>Price Line</div>
                  <div className="flex flex-wrap gap-1">
                    {['#7ed321', '#3b82f6', '#f59e0b', '#22d3ee', '#a855f7', '#ef4444'].map(color => (
                      <button key={color} onClick={() => setCustomColors(prev => ({ ...prev, priceLineColor: color }))} className="w-6 h-6 rounded border-2 transition-transform hover:scale-110" style={{ backgroundColor: color, borderColor: customColors.priceLineColor === color ? theme.colors.toolActive : 'transparent' }} />
                    ))}
                    <input type="color" value={customColors.priceLineColor || engine.effectiveColors.priceLineColor} onChange={(e) => setCustomColors(prev => ({ ...prev, priceLineColor: e.target.value }))} className="w-6 h-6 rounded cursor-pointer" />
                  </div>
                </div>
                <button onClick={() => setCustomColors(DEFAULT_CUSTOM_COLORS)} className="w-full py-1.5 rounded text-xs font-medium transition-colors" style={{ backgroundColor: theme.colors.background, color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}` }}>
                  Reset to Theme Defaults
                </button>
              </div>
            </div>
          )}
        </div>

        <ChartFooter timeframe={symbolData.timeframe} activeTool={drawing.activeTool} selectedTool={drawing.selectedTool} status={symbolData.status} theme={theme} />
      </div>

      {/* Click outside to close modals */}
      {(symbolData.showSymbolSearch || showThemePanel) && (
        <div className="fixed inset-0 z-40" onClick={() => { symbolData.setShowSymbolSearch(false); setShowThemePanel(false); }} />
      )}

      {contextMenuHook.contextMenu && (
        <ContextMenu x={contextMenuHook.contextMenu.x} y={contextMenuHook.contextMenu.y} items={contextMenuHook.contextMenuItems} onClose={contextMenuHook.closeContextMenu} theme="senzoukria" />
      )}

      <SaveTemplateModal isOpen={settings.showSaveTemplateModal} onClose={() => settings.setShowSaveTemplateModal(false)} onSave={settings.handleSaveTemplate} />
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <GlobalSettingsModal isOpen={settings.showGlobalSettings} onClose={() => settings.setShowGlobalSettings(false)} />

      {drawing.selectedTool && (
        <ToolSettingsBar
          selectedTool={drawing.selectedTool}
          toolPosition={drawing.toolPosition}
          colors={{ surface: theme.colors.surface, background: theme.colors.background, textPrimary: theme.colors.text, textSecondary: theme.colors.textSecondary, textMuted: theme.colors.textMuted, gridColor: theme.colors.border, deltaPositive: theme.colors.success, deltaNegative: theme.colors.error }}
          onClose={() => { refs.toolsEngine.current.deselectAll(); drawing.setSelectedTool(null); drawing.renderDrawingTools(); }}
          onOpenAdvanced={() => { settings.setAdvancedSettingsPosition({ x: (drawing.toolPosition?.x || 200) + 50, y: (drawing.toolPosition?.y || 150) + 50 }); settings.setShowAdvancedSettings(true); }}
        />
      )}

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

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes alertIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      ` }} />
    </div>
  );
}
