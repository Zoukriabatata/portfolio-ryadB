'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { usePageActive } from '@/hooks/usePageActive';
import {
  getOrderflowEngine,
  resetOrderflowEngine,
  configureOrderflow,
  type FootprintCandle,
  type PriceLevel,
} from '@/lib/orderflow/OrderflowEngine';
import { getTradeAbsorptionEngine } from '@/lib/orderflow/TradeAbsorptionEngine';
import type { PassiveOrderLevel } from '@/types/passive-liquidity';
import { getPassiveLiquiditySimulator } from '@/lib/orderflow/PassiveLiquiditySimulator';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';
import {
  FootprintLayoutEngine,
  type LayoutMetrics,
} from '@/lib/orderflow/FootprintLayoutEngine';
import {
  getToolsEngine,
  resetToolsEngine,
  type ToolType,
  type Tool,
  type HandlePosition,
} from '@/lib/tools/ToolsEngine';
import { getToolsRenderer, type RenderContext } from '@/lib/tools/ToolsRenderer';
import { layoutPersistence, type LayoutData } from '@/lib/tools/LayoutPersistence';
import {
  getInteractionController,
  resetInteractionController,
  type InteractionMode,
} from '@/lib/tools/InteractionController';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { binanceWS } from '@/lib/websocket/BinanceWS';
import { getCMELiveAdapter, getCMEAdapterLabel } from '@/lib/live/getCMELiveAdapter';
import { type TimeframeSeconds, TIMEFRAME_LABELS } from '@/lib/live/HierarchicalAggregator';
import {
  getFootprintDataService,
  resetFootprintDataService,
  type Trade,
  getSessionFootprintService,
  resetSessionFootprintService,
  getOptimizedFootprintService,
  resetOptimizedFootprintService,
} from '@/lib/footprint';
import { getFootprintRenderer, formatVolCluster } from '@/lib/footprint/FootprintCanvasRenderer';
import { getFootprintCache } from '@/lib/footprint/FootprintCache';
import {
  calculateStackedImbalances,
  calculateNakedPOCs,
  calculateUnfinishedAuctions,
} from '@/lib/footprint/FootprintIndicators';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
  type FootprintColors,
} from '@/stores/useFootprintSettingsStore';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import { useTimezoneStore, TIMEZONES, type TimezoneId } from '@/stores/useTimezoneStore';
import { useAlertsStore } from '@/stores/useAlertsStore';
import { buildTPOProfile } from '@/lib/profile/TPOEngine';
import {
  getFootprintWorkerManager,
  resetFootprintWorkerManager,
  type IndicatorsResult,
} from '@/lib/footprint/workers/WorkerManager';
import { BroadcastChannelManager } from '@/lib/sync/BroadcastChannelManager';
import { useChartSyncStore } from '@/stores/useChartSyncStore';
import ToolSettingsPanel from '@/components/tools/ToolSettingsPanel';
const AdvancedToolSettingsModal = dynamic(() => import('@/components/tools/AdvancedToolSettingsModal'), { ssr: false });
import LayoutManagerPanel from '@/components/tools/LayoutManagerPanel';
import {
  getCachedLODState,
  invalidateLODCache,
  formatVolume,
  computeFootprintLOD,
  computeDeltaProfileWidth,
  type LODState,
  type FootprintLODState,
} from '@/lib/rendering';
import {
  resetDxFeedFootprintEngine,
} from '@/lib/dxfeed';
import { isCMESymbol } from '@/lib/utils/symbolUtils';
import {
  MagnetIcon,
  SettingsIcon,
  LayoutIcon,
  CryptoIcon,
  FuturesIcon,
} from '@/components/ui/Icons';
import { ContextMenu, createChartContextMenuItems, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import InlineTextEditor from '@/components/tools/InlineTextEditor';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import dynamic from 'next/dynamic';
const FootprintAdvancedSettings = dynamic(() => import('@/components/settings/FootprintAdvancedSettings'), { ssr: false });
import InlineToolSettings from '@/components/tools/InlineToolSettings';
import { PriceCountdownCompact } from '@/components/trading/PriceCountdown';
import VerticalToolbar from '@/components/tools/VerticalToolbar';
import FootprintReplayControls, { type ReplayState } from '@/components/charts/FootprintReplayControls';

/**
 * FOOTPRINT CHART PRO - Institutional Style
 *
 * Features:
 * - Layout fixe (pas de scroll page)
 * - Tools Engine avec sélection / drag / resize / delete
 * - Sauvegarde / chargement de layouts
 * - Personnalisation complète
 */

interface FootprintChartProProps {
  className?: string;
  onSymbolChange?: (symbol: string) => void;
}

// Symbols - Crypto + CME Futures (flat list for lookups)
const SYMBOLS = [
  // Crypto (Binance)
  { value: 'btcusdt', label: 'BTC/USDT', tickSize: 10, exchange: 'binance' },
  { value: 'ethusdt', label: 'ETH/USDT', tickSize: 1, exchange: 'binance' },
  { value: 'solusdt', label: 'SOL/USDT', tickSize: 0.1, exchange: 'binance' },
  { value: 'bnbusdt', label: 'BNB/USDT', tickSize: 1, exchange: 'binance' },
  { value: 'xrpusdt', label: 'XRP/USDT', tickSize: 0.001, exchange: 'binance' },
  { value: 'adausdt', label: 'ADA/USDT', tickSize: 0.001, exchange: 'binance' },
  { value: 'dogeusdt', label: 'DOGE/USDT', tickSize: 0.0001, exchange: 'binance' },
  { value: 'avaxusdt', label: 'AVAX/USDT', tickSize: 0.1, exchange: 'binance' },
  { value: 'linkusdt', label: 'LINK/USDT', tickSize: 0.01, exchange: 'binance' },
  { value: 'arbusdt', label: 'ARB/USDT', tickSize: 0.001, exchange: 'binance' },
  { value: 'opusdt', label: 'OP/USDT', tickSize: 0.01, exchange: 'binance' },
  { value: 'pepeusdt', label: 'PEPE/USDT', tickSize: 0.0000001, exchange: 'binance' },
  // CME Index Futures
  { value: 'NQ', label: 'E-mini Nasdaq', tickSize: 0.25, exchange: 'cme' },
  { value: 'MNQ', label: 'Micro Nasdaq', tickSize: 0.25, exchange: 'cme' },
  { value: 'ES', label: 'E-mini S&P', tickSize: 0.25, exchange: 'cme' },
  { value: 'MES', label: 'Micro S&P', tickSize: 0.25, exchange: 'cme' },
  { value: 'YM', label: 'E-mini Dow', tickSize: 1, exchange: 'cme' },
  { value: 'GC', label: 'Gold', tickSize: 0.1, exchange: 'cme' },
  { value: 'CL', label: 'Crude Oil', tickSize: 0.01, exchange: 'cme' },
  { value: 'RTY', label: 'E-mini Russell', tickSize: 0.1, exchange: 'cme' },
  { value: 'SI', label: 'Silver', tickSize: 0.005, exchange: 'cme' },
  { value: 'NG', label: 'Natural Gas', tickSize: 0.001, exchange: 'cme' },
];

// Symbol categories for the modal selector
type FootprintAssetCategory = 'crypto' | 'futures';

const FOOTPRINT_ASSET_CATEGORIES: { id: FootprintAssetCategory; label: string; Icon: React.FC<{ size?: number; color?: string }> }[] = [
  { id: 'crypto', label: 'Crypto', Icon: CryptoIcon },
  { id: 'futures', label: 'Futures', Icon: FuturesIcon },
];

const SYMBOL_CATEGORIES: Record<FootprintAssetCategory, Record<string, { value: string; label: string; exchange?: string }[]>> = {
  crypto: {
    'Major': [
      { value: 'btcusdt', label: 'BTC/USDT' },
      { value: 'ethusdt', label: 'ETH/USDT' },
      { value: 'bnbusdt', label: 'BNB/USDT' },
      { value: 'solusdt', label: 'SOL/USDT' },
      { value: 'xrpusdt', label: 'XRP/USDT' },
      { value: 'adausdt', label: 'ADA/USDT' },
    ],
    'Alt': [
      { value: 'dogeusdt', label: 'DOGE/USDT' },
      { value: 'avaxusdt', label: 'AVAX/USDT' },
      { value: 'linkusdt', label: 'LINK/USDT' },
      { value: 'arbusdt', label: 'ARB/USDT' },
      { value: 'opusdt', label: 'OP/USDT' },
      { value: 'pepeusdt', label: 'PEPE/USDT' },
    ],
  },
  futures: {
    'Index': [
      { value: 'NQ', label: 'E-mini Nasdaq', exchange: 'CME' },
      { value: 'MNQ', label: 'Micro Nasdaq', exchange: 'CME' },
      { value: 'ES', label: 'E-mini S&P', exchange: 'CME' },
      { value: 'MES', label: 'Micro S&P', exchange: 'CME' },
      { value: 'YM', label: 'E-mini Dow', exchange: 'CBOT' },
      { value: 'RTY', label: 'E-mini Russell', exchange: 'CME' },
    ],
    'Commodities': [
      { value: 'GC', label: 'Gold', exchange: 'COMEX' },
      { value: 'SI', label: 'Silver', exchange: 'COMEX' },
      { value: 'CL', label: 'Crude Oil', exchange: 'NYMEX' },
      { value: 'NG', label: 'Natural Gas', exchange: 'NYMEX' },
    ],
  },
};

// Timeframes (footprint compatible only - 15m+ removed, candles only)
const TIMEFRAMES: TimeframeSeconds[] = [15, 30, 60, 180, 300];

// Tick-based timeframes (number of trades per candle)
const TICK_TIMEFRAMES = [300, 500, 1000, 2000] as const;
type TickTimeframe = typeof TICK_TIMEFRAMES[number];

const TICK_TF_LABELS: Record<TickTimeframe, string> = {
  300: '300T',
  500: '500T',
  1000: '1000T',
  2000: '2000T',
};

// Timeframe groups for visual separation (like LiveChartPro)
const TF_GROUPS = {
  ticks: TICK_TIMEFRAMES as readonly number[],
  seconds: [15, 30] as TimeframeSeconds[],
  minutes: [60, 180, 300] as TimeframeSeconds[],
};

// Tick sizes by symbol (for footprint aggregation)
// CME: 1 tick = 0.25 points (1 bid x 1 ask = 0.25)
const TICK_SIZE_OPTIONS: Record<string, number[]> = {
  // Crypto
  btcusdt: [5, 10, 25, 50, 100],
  ethusdt: [0.5, 1, 2, 5, 10],
  solusdt: [0.05, 0.1, 0.25, 0.5, 1],
  bnbusdt: [0.5, 1, 2, 5, 10],
  xrpusdt: [0.001, 0.005, 0.01, 0.05, 0.1],
  adausdt: [0.001, 0.005, 0.01, 0.05, 0.1],
  dogeusdt: [0.0001, 0.0005, 0.001, 0.005, 0.01],
  avaxusdt: [0.05, 0.1, 0.25, 0.5, 1],
  linkusdt: [0.01, 0.05, 0.1, 0.25, 0.5],
  arbusdt: [0.001, 0.005, 0.01, 0.05, 0.1],
  opusdt: [0.005, 0.01, 0.05, 0.1, 0.25],
  pepeusdt: [0.0000001, 0.0000005, 0.000001, 0.000005, 0.00001],
  // CME Futures
  NQ: [0.25, 0.5, 1, 2, 4],
  MNQ: [0.25, 0.5, 1, 2, 4],
  ES: [0.25, 0.5, 1, 2, 4],
  MES: [0.25, 0.5, 1, 2, 4],
  YM: [1, 2, 5, 10, 20],
  GC: [0.1, 0.2, 0.5, 1, 2],
  CL: [0.01, 0.02, 0.05, 0.1, 0.2],
  RTY: [0.1, 0.2, 0.5, 1, 2],
  SI: [0.005, 0.01, 0.025, 0.05, 0.1],
  NG: [0.001, 0.005, 0.01, 0.025, 0.05],
};

// Map symbol to exchange for data source routing
const SYMBOL_EXCHANGE: Record<string, 'binance' | 'cme'> = {
  btcusdt: 'binance', ethusdt: 'binance', solusdt: 'binance', bnbusdt: 'binance',
  xrpusdt: 'binance', adausdt: 'binance', dogeusdt: 'binance', avaxusdt: 'binance',
  linkusdt: 'binance', arbusdt: 'binance', opusdt: 'binance', pepeusdt: 'binance',
  NQ: 'cme', MNQ: 'cme', ES: 'cme', MES: 'cme',
  YM: 'cme', GC: 'cme', CL: 'cme', RTY: 'cme', SI: 'cme', NG: 'cme',
};

// Map TF to Binance interval
const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h',
};


// Tool context menu items (adapted from LiveChartPro)
function createToolContextMenuItems(
  tool: Tool,
  engine: ReturnType<typeof getToolsEngine>,
  onCloseMenu: () => void,
  onRenderTools: () => void
): ContextMenuItem[] {
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
        const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = tool as any;
        engine.addTool(toolData);
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
    { id: 'separator-1', label: '', divider: true },
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
      label: tool.visible !== false ? 'Hide' : 'Show',
      icon: tool.visible !== false ? (
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
        engine.updateTool(tool.id, { visible: tool.visible === false });
        onCloseMenu();
        onRenderTools();
      },
    },
    { id: 'separator-2', label: '', divider: true },
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

// Magnet Toggle for Footprint (adapted from LiveChartPro MagnetToggle)
const MAGNET_MODES = [
  { value: 'none' as const, label: 'Off', desc: 'Free movement' },
  { value: 'ohlc' as const, label: 'OHLC', desc: 'Snap to Open/High/Low/Close' },
  { value: 'close' as const, label: 'Close', desc: 'Snap to Close price' },
];

function FootprintMagnetToggle({ colors }: { colors: { currentPriceColor: string; textSecondary: string; surface: string; gridColor: string; textPrimary: string; textMuted: string; background: string } }) {
  const { magnetMode, setMagnetMode } = useCrosshairStore();
  const [showMenu, setShowMenu] = useState(false);
  const isActive = magnetMode !== 'none';

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-8 h-8 flex items-center justify-center rounded text-sm transition-all duration-200 hover:scale-105 active:scale-95"
        style={{
          backgroundColor: isActive ? colors.currentPriceColor : 'transparent',
          color: isActive ? '#fff' : colors.textSecondary,
          boxShadow: isActive ? `0 0 15px ${colors.currentPriceColor}60` : 'none',
        }}
        title={`Magnet: ${magnetMode === 'none' ? 'Off' : magnetMode.toUpperCase()}`}
      >
        <MagnetIcon size={18} color={isActive ? '#fff' : colors.textSecondary} />
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div
            className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 py-1"
            style={{ backgroundColor: colors.surface, border: `1px solid ${colors.gridColor}` }}
          >
            <div className="px-2 py-1 text-[10px] font-semibold uppercase" style={{ color: colors.textMuted }}>
              Magnet Mode
            </div>
            {MAGNET_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => { setMagnetMode(mode.value); setShowMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5 transition-colors"
                style={{
                  backgroundColor: magnetMode === mode.value ? colors.currentPriceColor : 'transparent',
                  color: magnetMode === mode.value ? '#fff' : colors.textPrimary,
                }}
              >
                <span className="font-medium">{mode.label}</span>
                <span className="text-[10px]" style={{ color: magnetMode === mode.value ? '#fff' : colors.textMuted }}>
                  {mode.desc}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Zoom Controls for Footprint
function FootprintZoomControls({ onZoomIn, onZoomOut, onResetView, colors }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  colors: { surface: string; gridColor: string; textSecondary: string };
}) {
  return (
    <div
      className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-lg z-15"
      style={{ backgroundColor: colors.surface + 'dd', border: `1px solid ${colors.gridColor}` }}
    >
      <button onClick={onZoomIn} className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95" style={{ color: colors.textSecondary }} title="Zoom In [+]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
      </button>
      <button onClick={onZoomOut} className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95" style={{ color: colors.textSecondary }} title="Zoom Out [-]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
      </button>
      <div className="w-px h-5" style={{ backgroundColor: colors.gridColor }} />
      <button onClick={onResetView} className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95" style={{ color: colors.textSecondary }} title="Fit Content [Ctrl+0]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
      </button>
    </div>
  );
}

const FootprintChartPro = React.memo(function FootprintChartPro({ className, onSymbolChange }: FootprintChartProProps) {
  const isActive = usePageActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutEngineRef = useRef<FootprintLayoutEngine | null>(null);
  const animationRef = useRef<number | null>(null);

  // Settings store
  const settings = useFootprintSettingsStore();
  const crosshairSettings = useCrosshairStore();
  const { timezone, setTimezone, formatTime, getTimezoneLabel } = useTimezoneStore();

  // State
  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [aggregationMode, setAggregationMode] = useState<'time' | 'tick'>('time');
  const [tickBarSize, setTickBarSize] = useState<TickTimeframe>(500);
  const [tickSize, setTickSize] = useState(10);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0); // Guard against stale async loads
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [textEditorState, setTextEditorState] = useState<{
    isOpen: boolean;
    toolId: string;
    content: string;
    position: { x: number; y: number };
    style: {
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: 'normal' | 'bold';
      color?: string;
      backgroundColor?: string;
    };
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showToolSettings, setShowToolSettings] = useState(false);
  const [showLayoutManager, setShowLayoutManager] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clickPrice?: number } | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [advancedSettingsPosition, setAdvancedSettingsPosition] = useState({ x: 100, y: 100 });
  const [toolPosition, setToolPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [toolSettingsModalPosition, setToolSettingsModalPosition] = useState({ x: 200, y: 150 });

  // Symbol selector modal state
  const [showSymbolSelector, setShowSymbolSelector] = useState(false);
  const [assetCategory, setAssetCategory] = useState<FootprintAssetCategory>('crypto');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');

  // Tool context menu state
  const [toolContextMenu, setToolContextMenu] = useState<{ x: number; y: number; tool: Tool } | null>(null);
  const [showToolProperties, setShowToolProperties] = useState(false);

  // Templates
  const { templates, saveTemplate, getTemplatesByType } = useChartTemplatesStore();
  const [showGrid, setShowGrid] = useState(settings.features.showGrid);

  // Symbol selector: filtered symbols and label
  const currentSymbolCategories = useMemo(() => {
    return SYMBOL_CATEGORIES[assetCategory] || SYMBOL_CATEGORIES.crypto;
  }, [assetCategory]);

  const filteredSymbols = useMemo(() => {
    if (!symbolSearchQuery.trim()) return currentSymbolCategories;
    const query = symbolSearchQuery.toLowerCase();
    const filtered: Record<string, { value: string; label: string; exchange?: string }[]> = {};
    Object.entries(currentSymbolCategories).forEach(([category, symbols]) => {
      const matches = symbols.filter(
        s => s.label.toLowerCase().includes(query) || s.value.toLowerCase().includes(query)
      );
      if (matches.length > 0) filtered[category] = matches;
    });
    return filtered;
  }, [symbolSearchQuery, currentSymbolCategories]);

  const selectedSymbolLabel = useMemo(() => {
    return SYMBOLS.find(s => s.value === symbol)?.label || symbol.toUpperCase();
  }, [symbol]);


  // Refs
  const priceRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const candlesRef = useRef<FootprintCandle[]>([]);
  const currentPriceRef = useRef<number>(0);

  // DOM overlay refs — same pattern as FootprintTESTChart
  const domBidsRef    = useRef<Map<number, number>>(new Map());
  const domAsksRef    = useRef<Map<number, number>>(new Map());
  const hasRealDOMRef = useRef(false);

  // DEBUG: Direct trade tracking (bypasses candle logic)
  const debugTradesRef = useRef<Array<{ price: number; size: number; side: 'BID' | 'ASK'; time: number }>>([]);
  const debugTradeCountRef = useRef(0);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const metricsRef = useRef<LayoutMetrics | null>(null);
  const mousePositionRef = useRef<{ x: number; y: number; price: number; time: number } | null>(null);
  const lodRef = useRef<LODState | null>(null);
  const footprintLodRef = useRef<FootprintLODState | null>(null);
  const vwapDataRef = useRef<{ price: number; time: number }[]>([]);
  const twapDataRef = useRef<{ price: number; time: number }[]>([]);

  // Cell hover state for tooltip
  const hoveredCellRef = useRef<{ candleIdx: number; price: number; level: PriceLevel; candleTotalVol: number } | null>(null);

  // Absorption events for visual markers
  const absorptionEventsRef = useRef<Array<{ price: number; volume: number; side: 'bid' | 'ask'; timestamp: number }>>([]);

  // Replay mode state
  const replayStateRef = useRef<{
    active: boolean;
    currentIndex: number;
    speed: 1 | 2 | 5 | 10;
    playing: boolean;
    allCandles: FootprintCandle[];
    liveCandlesBackup: FootprintCandle[];
  }>({
    active: false,
    currentIndex: 0,
    speed: 1,
    playing: false,
    allCandles: [],
    liveCandlesBackup: [],
  });
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayCallbacksRef = useRef<{
    enter: () => void;
    exit: () => void;
    next: () => void;
    prev: () => void;
    play: () => void;
    pause: () => void;
  }>({ enter: () => {}, exit: () => {}, next: () => {}, prev: () => {}, play: () => {}, pause: () => {} });
  const [replayActive, setReplayActive] = useState(false);
  const [replayState, setReplayState] = useState<ReplayState>({
    active: false,
    currentIndex: 0,
    totalCandles: 0,
    speed: 1,
    playing: false,
  });

  // Passive liquidity hover state for debug tooltip
  const hoveredPassiveLevelRef = useRef<PassiveOrderLevel | null>(null);
  const passiveLevelBoundsRef = useRef<Array<{
    level: PassiveOrderLevel;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // Web Worker cached results for indicators
  const workerIndicatorsRef = useRef<IndicatorsResult | null>(null);
  const workerDataVersionRef = useRef<string>('');

  // Multi-chart sync
  const syncManagerRef = useRef<BroadcastChannelManager | null>(null);
  const syncCrosshairRef = useRef<{ price: number; time: number; visible: boolean } | null>(null);

  // Drag state for panning and zooming
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const isPriceScaleDragRef = useRef(false);
  const priceScaleDragStartRef = useRef<{ y: number; zoomY: number } | null>(null);

  // Available tick sizes
  const availableTickSizes = useMemo(() => {
    return TICK_SIZE_OPTIONS[symbol] || [10];
  }, [symbol]);

  /**
   * Initialize layout engine
   */
  useEffect(() => {
    layoutEngineRef.current = new FootprintLayoutEngine({
      footprintWidth: settings.footprintWidth,
      rowHeight: settings.rowHeight,
      maxVisibleFootprints: settings.maxVisibleFootprints,
      showOHLC: settings.features.showOHLC,
      showDeltaProfile: settings.features.showDeltaProfile,
      showVolumeProfile: false, // VP rendered as overlay — no panel space needed
      deltaProfilePosition: settings.deltaProfilePosition,
      candleGap: settings.candleGap || 3,
    });

    return () => {
      layoutEngineRef.current = null;
    };
  }, [settings.footprintWidth, settings.rowHeight, settings.maxVisibleFootprints, settings.features.showOHLC, settings.features.showDeltaProfile, settings.features.showVolumeProfile, settings.deltaProfilePosition, settings.candleGap]);

  /**
   * Initialize auto-save and restore
   */
  useEffect(() => {
    // Try to restore auto-save on mount
    const autoSave = layoutPersistence.loadAutoSave();
    if (autoSave) {
      layoutPersistence.applyLayout(autoSave);
    }

    // Start auto-save
    layoutPersistence.startAutoSave(() => ({
      chart: { symbol, timeframe, tickSize },
      colors: settings.colors,
      fonts: settings.fonts,
      features: settings.features,
      imbalance: settings.imbalance,
      layout: {
        footprintWidth: settings.footprintWidth,
        rowHeight: settings.rowHeight,
        maxVisibleFootprints: settings.maxVisibleFootprints,
        deltaProfilePosition: settings.deltaProfilePosition,
      },
    }));

    return () => {
      layoutPersistence.stopAutoSave();
    };
  }, [symbol, timeframe, tickSize, settings]);

  // ── DOM overlay — Binance depth subscription (non-CME symbols) ────────────
  const CME_SYMS = useMemo(() => new Set(['mnq', 'mes', 'mym', 'm2k']), []);
  useEffect(() => {
    if (!isActive) return;
    if (!settings.features.showPassiveLiquidity) return;
    hasRealDOMRef.current = false;
    domBidsRef.current = new Map();
    domAsksRef.current = new Map();
    if (CME_SYMS.has(symbol.toLowerCase())) return; // CME DOM populated from simulator each frame
    const SMOOTH = 0.4; // blend factor for fluid DOM rendering
    const unsub = binanceWS.subscribeDepth(symbol.toLowerCase(), (update) => {
      hasRealDOMRef.current = true;
      // Merge bids with smoothing
      update.bids.forEach(([p, q]: [string, string]) => {
        const price = parseFloat(p);
        const qty = parseFloat(q);
        const prev = domBidsRef.current.get(price) || 0;
        if (qty > 0) {
          domBidsRef.current.set(price, prev + (qty - prev) * SMOOTH);
        } else {
          domBidsRef.current.delete(price);
        }
      });
      // Merge asks with smoothing
      update.asks.forEach(([p, q]: [string, string]) => {
        const price = parseFloat(p);
        const qty = parseFloat(q);
        const prev = domAsksRef.current.get(price) || 0;
        if (qty > 0) {
          domAsksRef.current.set(price, prev + (qty - prev) * SMOOTH);
        } else {
          domAsksRef.current.delete(price);
        }
      });
    }, 'futures', '500ms');
    return unsub;
  }, [symbol, settings.features.showPassiveLiquidity, CME_SYMS, isActive]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      if (document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Shift+R: Toggle replay mode
      if (e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (replayStateRef.current.active) {
          replayCallbacksRef.current.exit();
        } else {
          replayCallbacksRef.current.enter();
        }
        return;
      }

      // Escape: Exit replay mode
      if (e.key === 'Escape' && replayStateRef.current.active) {
        e.preventDefault();
        replayCallbacksRef.current.exit();
        return;
      }

      // Arrow keys during replay: step candles
      if (replayStateRef.current.active) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          replayCallbacksRef.current.next();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          replayCallbacksRef.current.prev();
          return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          if (replayStateRef.current.playing) replayCallbacksRef.current.pause();
          else replayCallbacksRef.current.play();
          return;
        }
      }

      // Ctrl+Z: Undo drawing tool action
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        getToolsEngine().undo();
        return;
      }
      // Ctrl+Shift+Z: Redo drawing tool action
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        getToolsEngine().redo();
        return;
      }
      // Ctrl+Y: Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        getToolsEngine().redo();
        return;
      }

      const controller = getInteractionController();
      const handled = controller.handleKeyDown(e);

      if (handled) {
        e.preventDefault();
        // Sync state after keyboard action
        const state = controller.getState();
        if (!state.selectedToolId) {
          setSelectedTool(null);
        }
        if (state.activeTool === 'cursor') {
          setActiveTool('cursor');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const controller = getInteractionController();
      controller.handleKeyUp(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  /**
   * Subscribe to tool events
   */
  useEffect(() => {
    const engine = getToolsEngine();

    const unsubSelect = engine.on('tool:select', (tool) => {
      // Only set selected tool if it's a complete Tool (has id)
      if (tool && 'id' in tool) {
        setSelectedTool(tool as Tool);
        setShowToolSettings(true);
      }
    });

    const unsubDeselect = engine.on('tool:deselect', () => {
      const selected = engine.getSelectedTools();
      if (selected.length === 0) {
        setSelectedTool(null);
        setShowToolSettings(false);
      } else {
        setSelectedTool(selected[0]);
      }
    });

    const unsubDelete = engine.on('tool:delete', () => {
      const selected = engine.getSelectedTools();
      if (selected.length === 0) {
        setSelectedTool(null);
        setShowToolSettings(false);
      }
    });

    // Re-sync selectedTool when any selected tool is updated (style, drag, etc.)
    // Creates a fresh object reference so React detects the change and re-renders panels
    const unsubUpdate = engine.on('tool:update', (updatedTool) => {
      if (!updatedTool || !('id' in updatedTool)) return;
      const updated = updatedTool as Tool;
      // Check if this updated tool is among the currently selected tools
      const selected = engine.getSelectedTools();
      const isSelected = selected.some(t => t.id === updated.id);
      if (isSelected) {
        // Re-fetch from engine and deep-spread to guarantee new references
        const fresh = engine.getTool(updated.id);
        if (fresh) {
          setSelectedTool({ ...fresh, style: { ...fresh.style } });
        }
      }
    });

    return () => {
      unsubSelect();
      unsubDeselect();
      unsubDelete();
      unsubUpdate();
    };
  }, []);

  /**
   * Load footprint data using hybrid approach (klines + live trades)
   *
   * Historical: Klines with takerBuyVolume (fast, no rate limits)
   * Live: WebSocket aggTrades (real-time, exact bid/ask)
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds): Promise<FootprintCandle[]> => {
    const exchange = SYMBOL_EXCHANGE[sym] || 'binance';

    // Increment generation to invalidate previous loads
    const generation = ++loadGenerationRef.current;

    setIsLoading(true);
    setIsRefreshing(false);
    setLoadError(null);
    setLoadingProgress(0);
    setLoadingMessage('Loading footprint data...');

    // CME Futures - Use dxFeed (handled in useEffect, not loadHistory)
    if (exchange === 'cme') {
      console.log(`[FootprintChartPro] CME symbol ${sym} - using dxFeed`);
      return []; // CME uses dxFeed, not Binance historical data
    }

    try {
      resetOptimizedFootprintService();

      const service = getOptimizedFootprintService({
        symbol: sym,
        timeframe: aggregationMode === 'tick' ? 60 : tf, // Use 1m base for tick mode
        tickSize,
        imbalanceRatio: settings.imbalance.ratio,
        totalHours: 24,
        aggregationMode,
        tickBarSize: aggregationMode === 'tick' ? tickBarSize : (settings.features.tickBarSize || 500),
        volumeBarSize: settings.features.volumeBarSize,
        // Skeleton mode: instant OHLC for all historical candles (from klines),
        // real bid/ask footprint only for the last 24 hours (from aggTrades).
        // Avoids fake data caused by Binance rate-limiting cutting tick loads short.
        loadMode: 'skeleton',
      });

      service.setProgressCallback((progress, message) => {
        // Only update if this is still the current load
        if (loadGenerationRef.current !== generation) return;
        setLoadingProgress(progress);
        setLoadingMessage(message);
      });

      // ── Phase 0: Try IndexedDB cache for instant display ──────────────────
      const cached = await getFootprintCache().getCachedCandles(sym, tf);
      if (loadGenerationRef.current !== generation) return [];

      let hasEarlyDisplay = false;

      if (cached && cached.candles.length > 0) {
        // Show cached candles immediately — hide loading overlay
        candlesRef.current = cached.candles;
        setIsLoading(false);
        setIsRefreshing(true);
        setLoadingMessage('Refreshing recent data...');
        hasEarlyDisplay = true;
        console.log(`[FootprintChartPro] Cache hit: ${cached.candles.length} candles shown instantly`);
      }

      console.log(`[FootprintChartPro] Loading footprint for ${sym}...`);

      // ── Phase 1 (skeleton) → Phase 2 (ticks) ─────────────────────────────
      const tickCandles = await service.loadOptimized(
        // onSkeletonReady: show skeleton immediately if no cache was available
        hasEarlyDisplay ? undefined : (skeletonCandles) => {
          if (loadGenerationRef.current !== generation) return;
          if (skeletonCandles.length > 0) {
            candlesRef.current = skeletonCandles;
            setIsLoading(false);
            setIsRefreshing(true);
            setLoadingMessage('Loading tick data...');
            hasEarlyDisplay = true;
            console.log(`[FootprintChartPro] Skeleton ready: ${skeletonCandles.length} OHLC candles displayed`);
          }
        }
      );

      // Guard: if symbol/timeframe changed during load, discard results
      if (loadGenerationRef.current !== generation) {
        console.log(`[FootprintChartPro] Stale load discarded (gen ${generation} vs ${loadGenerationRef.current})`);
        return [];
      }

      // Merge skeleton OHLC (full day) with real tick-based footprint candles (last 4h).
      // Candles outside the tick window get OHLC only (levels = empty Map) — no fake bid/ask.
      const candles = service.mergeWithSkeleton(tickCandles);

      console.log(
        `[FootprintChartPro] ✓ ${candles.length} candles total` +
        ` (${tickCandles.length} with real footprint, ${candles.length - tickCandles.length} OHLC-only)`
      );

      // Cache closed candles for faster subsequent loads
      if (candles.length > 0) {
        getFootprintCache().storeCandles(sym, tf, candles).catch(() => {});
      }

      return candles;
    } catch (error) {
      console.error('Failed to load footprint:', error);

      // Only show error if this is still the current load
      if (loadGenerationRef.current !== generation) return [];

      const errorMsg = error instanceof Error ? error.message : 'Failed to load data';
      setLoadError(errorMsg);
      setLoadingMessage('Error loading data');

      // Auto-dismiss error after 10s
      setTimeout(() => {
        setLoadError(prev => prev === errorMsg ? null : prev);
      }, 10000);

      // Fallback to legacy service
      try {
        const service = getFootprintDataService();
        service.setImbalanceRatio(settings.imbalance.ratio);

        return await service.loadHistory({
          symbol: sym,
          timeframe: tf,
          tickSize,
          hoursBack: 1, // Keep fallback short — 4h caused 40s+ load times
          imbalanceRatio: settings.imbalance.ratio,
        });
      } catch {
        return [];
      }
    } finally {
      if (loadGenerationRef.current === generation) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [tickSize, settings.imbalance.ratio, aggregationMode, tickBarSize]);

  /**
   * Canvas rendering
   */
  const renderCanvas = useCallback(() => {
    const renderStartTime = performance.now();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const layout = layoutEngineRef.current;
    if (!canvas || !container || !layout) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { colors, fonts, features } = settings;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const needsResize = canvas.width !== width * dpr || canvas.height !== height * dpr;
    if (needsResize) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Update layout engine size
    layout.setContainerSize(width, height);

    // Background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    const candles = candlesRef.current;
    const debugTrades = debugTradesRef.current;
    const exchange = SYMBOL_EXCHANGE[symbol] || 'binance';

    // ═══════════════════════════════════════════════════════════════════════
    // DEBUG MODE: If no candles but we have debug trades, render them directly
    // This proves data is flowing even if candle aggregation is broken
    // ═══════════════════════════════════════════════════════════════════════
    if (candles.length === 0 && exchange === 'cme' && debugTrades.length > 0) {
      // Background
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, height);

      // Title
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`DEBUG MODE - ${symbol}`, width / 2, 30);
      ctx.font = '12px system-ui';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(`✓ ${debugTradeCountRef.current} trades received (candle aggregation bypassed)`, width / 2, 50);

      // Calculate price range from debug trades
      const prices = debugTrades.map(t => t.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;
      const padding = priceRange * 0.1;

      // Draw debug trades as colored rectangles
      const tradeWidth = Math.max(4, (width - 100) / Math.min(debugTrades.length, 50));
      const chartTop = 80;
      const chartHeight = height - 120;
      const chartLeft = 60;
      const chartWidth = width - 80;

      // Price axis
      ctx.fillStyle = colors.textMuted;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const price = minPrice - padding + (priceRange + 2 * padding) * (1 - i / 5);
        const y = chartTop + chartHeight * (i / 5);
        ctx.fillText(price.toFixed(2), chartLeft - 5, y + 3);
        ctx.strokeStyle = colors.gridColor;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(width - 20, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw each trade as a bar
      const visibleTrades = debugTrades.slice(-50);
      visibleTrades.forEach((trade, i) => {
        const x = chartLeft + (i / Math.min(visibleTrades.length, 50)) * chartWidth;
        const normalizedPrice = (trade.price - (minPrice - padding)) / (priceRange + 2 * padding);
        const y = chartTop + chartHeight * (1 - normalizedPrice);
        const barHeight = Math.max(3, trade.size * 2);

        // Color by side: ASK (buy) = green, BID (sell) = red
        ctx.fillStyle = trade.side === 'ASK' ? colors.deltaPositive : colors.deltaNegative;
        ctx.fillRect(x, y - barHeight / 2, tradeWidth - 1, barHeight);
      });

      // Legend
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.deltaPositive;
      ctx.fillRect(chartLeft, height - 30, 12, 12);
      ctx.fillStyle = colors.textPrimary;
      ctx.fillText('ASK (Buy)', chartLeft + 18, height - 20);
      ctx.fillStyle = colors.deltaNegative;
      ctx.fillRect(chartLeft + 100, height - 30, 12, 12);
      ctx.fillStyle = colors.textPrimary;
      ctx.fillText('BID (Sell)', chartLeft + 118, height - 20);

      ctx.fillStyle = '#f59e0b';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ Candle aggregation not working - showing raw trades', width / 2, height - 5);

      return;
    }

    if (candles.length === 0) {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';

      if (exchange === 'cme') {
        // CME - Show different messages based on connection state
        ctx.fillText(`${symbol} - CME Futures`, width / 2, height / 2 - 50);

        if (status === 'connected') {
          // Connected but no trades yet
          ctx.font = '12px system-ui';
          ctx.fillStyle = '#f59e0b';  // Orange - waiting
          ctx.fillText('⏳ Waiting for first trade...', width / 2, height / 2 - 20);
          ctx.fillStyle = colors.textMuted;
          ctx.font = '11px system-ui';
          ctx.fillText('dxFeed connected - market may be closed', width / 2, height / 2 + 5);
          ctx.fillText(`Debug trades received: ${debugTradeCountRef.current}`, width / 2, height / 2 + 25);

          // Show market hours info
          ctx.fillStyle = '#6b7280';
          ctx.font = '10px system-ui';
          ctx.fillText('CME Futures: Sun 6pm - Fri 5pm ET (with daily breaks)', width / 2, height / 2 + 50);
        } else if (status === 'connecting') {
          ctx.font = '12px system-ui';
          ctx.fillStyle = '#22c55e';
          ctx.fillText('Connecting to dxFeed...', width / 2, height / 2);
        } else {
          ctx.font = '12px system-ui';
          ctx.fillStyle = colors.deltaNegative;
          ctx.fillText('Disconnected', width / 2, height / 2);
        }
      } else {
        ctx.fillText('Waiting for data...', width / 2, height / 2);
      }
      return;
    }

    // Calculate metrics
    const metrics = layout.calculateMetrics(candles, tickSize);
    metricsRef.current = metrics;

    const { footprintAreaX, footprintAreaY, footprintAreaWidth, footprintAreaHeight } = metrics;
    const zoom = layout.getZoom();
    const rowH = settings.rowHeight * zoom;
    const fpWidth = settings.footprintWidth * zoom;
    const ohlcWidth = 14 * zoom;

    // Grid - Intelligent spacing based on zoom level
    if (features.showGrid) {
      ctx.strokeStyle = colors.gridColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = colors.gridOpacity;

      // Use intelligent grid spacing from layout engine
      const gridLevels = layout.getVisiblePriceLevels(metrics, tickSize);
      for (const price of gridLevels) {
        const y = layout.priceToY(price, metrics);
        if (y < footprintAreaY || y > footprintAreaY + footprintAreaHeight) continue;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════════════════
    // LOD STATE: FOOTPRINT vs CANDLES
    // - visibleBars <= 100 AND timeframe < 15m → FOOTPRINT
    // - visibleBars > 100 OR timeframe >= 15m → CANDLES
    // ═══════════════════════════════════════════════════════════════
    const footprintWidth = layout.getEffectiveFootprintWidth();
    const lod = getCachedLODState(
      metrics.visibleCandles.length,
      footprintWidth,
      rowH,
      100, // threshold
      timeframe
    );
    lodRef.current = lod;

    const isFootprintMode = lod.mode === 'footprint';

    // ── CME DOM: populate domBids/domAsks from simulator each frame ───────────
    if (features.showPassiveLiquidity && CME_SYMS.has(symbol.toLowerCase())) {
      const simulator = getPassiveLiquiditySimulator();

      // Calibrate simulator from visible footprint data
      let totalVolume = 0;
      let totalLevels = 0;
      let maxLevelVolume = 0;
      for (const candle of metrics.visibleCandles) {
        for (const level of candle.levels.values()) {
          const levelVol = level.bidVolume + level.askVolume;
          totalVolume += levelVol;
          totalLevels++;
          maxLevelVolume = Math.max(maxLevelVolume, level.bidVolume, level.askVolume);
        }
      }
      const avgTradeVolume = totalLevels > 0 ? totalVolume / totalLevels : 1;

      // Configure with current price and tick size
      // baseLiquidity adapts to instrument price:
      // - BTC ($100K): ~0.3 BTC per level = ~$30K (realistic for crypto futures)
      // - NQ/ES ($5K-$20K): ~15 contracts per level (CME-style)
      const basePrice = currentPriceRef.current || metrics.visiblePriceMin + (metrics.visiblePriceMax - metrics.visiblePriceMin) / 2;
      const adaptiveBaseLiquidity = basePrice >= 1000 ? Math.max(0.1, 3000 / basePrice) : 15;
      simulator.setConfig({
        basePrice,
        tickSize,
        baseLiquidity: adaptiveBaseLiquidity,
      });

      simulator.calibrateFromFootprint(avgTradeVolume, maxLevelVolume);
      simulator.setVisibleRange(metrics.visiblePriceMin, metrics.visiblePriceMax);
      simulator.tick();

      // Extract bid/ask Maps for the footprintTEST-style DOM renderer
      const simLevels = simulator.getLevelsInRange(metrics.visiblePriceMin, metrics.visiblePriceMax);
      const simBids = new Map<number, number>();
      const simAsks = new Map<number, number>();
      for (const l of simLevels) {
        if (l.remainingVolume > 0) {
          if (l.side === 'bid') simBids.set(l.price, l.remainingVolume);
          else simAsks.set(l.price, l.remainingVolume);
        }
      }
      domBidsRef.current = simBids;
      domAsksRef.current = simAsks;

      // Old rendering removed — DOM drawn via renderDOMOverlay below (after candles)

      passiveLevelBoundsRef.current = [];
    }

    // ═══════════════════════════════════════════════════════════════
    // CHART ENGINE — Layer 1: FootprintEngine (candles, POC, imbalances)
    // ═══════════════════════════════════════════════════════════════
    const fpRenderer = getFootprintRenderer();
    if (isFootprintMode) {
      fpRenderer.renderFootprintCandles({
        ctx, width, height, candles, metrics, layout, colors, fonts, features,
        lod, zoom, rowH, fpWidth, ohlcWidth, tickSize, isFootprintMode,
      });
    } else {
      fpRenderer.renderCandleMode(ctx, layout, metrics, colors, lod, footprintWidth);
    }

    // Developing POC line (polyline connecting POC prices, Phase 2)
    if (isFootprintMode) {
      fpRenderer.renderDevelopingPOC({
        ctx, width, height, candles, metrics, layout, colors, fonts, features,
        lod, zoom, rowH, fpWidth, ohlcWidth, tickSize, isFootprintMode,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: INDICATORS — Stacked Imbalances, Naked POC, Unfinished Auctions
    // Offloaded to Web Worker (async with cached results)
    // ═══════════════════════════════════════════════════════════════
    if (isFootprintMode && metrics.visibleCandles.length > 0) {
      const needsIndicators = features.showStackedImbalances || features.showNakedPOC || features.showUnfinishedAuctions;

      if (needsIndicators) {
        // Check if data changed — dispatch to worker if so
        const lastCandle = metrics.visibleCandles[metrics.visibleCandles.length - 1];
        const dataVersion = `${metrics.visibleCandles.length}-${lastCandle?.time ?? 0}-${lastCandle?.totalTrades ?? 0}`;

        if (dataVersion !== workerDataVersionRef.current) {
          workerDataVersionRef.current = dataVersion;
          const workerMgr = getFootprintWorkerManager();
          workerMgr.computeIndicators(
            metrics.visibleCandles,
            tickSize,
            currentPriceRef.current,
            features.stackedImbalanceMin || 3,
          ).then(result => {
            workerIndicatorsRef.current = result;
          });
        }

        // Render using cached worker results (may be null on first frame)
        const cached = workerIndicatorsRef.current;
        if (cached) {
          if (features.showStackedImbalances && cached.stackedImbalances.length > 0) {
            fpRenderer.renderStackedImbalances(
              ctx, layout, metrics, cached.stackedImbalances, rowH, fpWidth, ohlcWidth, features.showOHLC,
            );
          }
          if (features.showNakedPOC && cached.nakedPOCs.length > 0) {
            fpRenderer.renderNakedPOCs(
              ctx, layout, metrics, cached.nakedPOCs, features.nakedPOCColor || '#fbbf24', width,
            );
          }
          if (features.showUnfinishedAuctions && cached.unfinishedAuctions.length > 0) {
            fpRenderer.renderUnfinishedAuctions(ctx, layout, metrics, cached.unfinishedAuctions, width);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MODULAR RENDERING — Uses cached profile data (single pass)
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // CHART ENGINE — Layer 2: AveragePriceEngine (VWAP/TWAP + bubbles)
    // ═══════════════════════════════════════════════════════════════

    // Volume Bubbles (rendered behind indicators)
    if (features.showVolumeBubbles && metrics.visibleCandles.length > 0) {
      fpRenderer.renderVolumeBubbles(ctx, layout, metrics, colors, features, fpWidth, isFootprintMode);
    }

    // VWAP/TWAP lines
    fpRenderer.renderVWAPTWAP(ctx, layout, metrics, features, ohlcWidth, fpWidth);

    // ═══════════════════════════════════════════════════════════════
    // CHART ENGINE — Layer 3: ProfileEngine (delta/volume/TPO profiles)
    // ═══════════════════════════════════════════════════════════════

    // Compute profile caches once (shared by delta profile + volume profile)
    const profileCaches = fpRenderer.getProfileCaches(candles, metrics);

    // Delta Profile (uses cached deltaByPrice — no longer recreated every frame)
    if (isFootprintMode && features.showDeltaProfile && metrics.visibleCandles.length > 0) {
      fpRenderer.renderDeltaProfile(ctx, layout, metrics, colors, profileCaches, rowH, features);
    }

    // Volume Profile — overlay style (left-anchored, all session candles, like footprintTEST)
    if (features.showVolumeProfile && candles.length > 0) {
      fpRenderer.renderVolumeProfileOverlay(ctx, layout, metrics, candles, tickSize, features?.volumeProfilePocColor || '#e2b93b');
    }

    // DOM overlay — footprintTEST style, right-anchored (after candles + VP)
    if (features.showPassiveLiquidity) {
      // Fallback to last candle close so the overlay shows as soon as historical bars load,
      // without waiting for the first live tick (which can take several seconds).
      const rawPrice = currentPriceRef.current > 0
        ? currentPriceRef.current
        : (candles[candles.length - 1]?.close ?? 0);
      if (rawPrice > 0) {
        // Use real DOM data only — no synthetic fallback (avoids visual noise)
        const safeBids = new Map<number, number>();
        const safeAsks = new Map<number, number>();
        domBidsRef.current.forEach((qty, p) => { if (p < rawPrice) safeBids.set(p, qty); });
        domAsksRef.current.forEach((qty, p) => { if (p > rawPrice) safeAsks.set(p, qty); });
        fpRenderer.renderDOMOverlay(ctx, layout, metrics, safeBids, safeAsks, rawPrice, tickSize);
      }
    }

    // TPO / Market Profile
    if ((features as any).showTPO && metrics.visibleCandles.length > 0) {
      const tpoData = buildTPOProfile(
        metrics.visibleCandles,
        (features as any).tpoPeriod || 30,
        tickSize,
      );
      if (tpoData) {
        fpRenderer.renderTPOProfile(ctx, layout, metrics, tpoData, features, width, rowH);
      }
    }

    // Price scale (must render before price line so the label sits on top)
    const isCME = SYMBOL_EXCHANGE[symbol] === 'cme';
    fpRenderer.renderPriceScale(ctx, layout, metrics, colors, fonts, tickSize, isCME, width);

    // Current price line — rendered after scale so label is not covered by scale background
    if (features.showCurrentPrice) {
      fpRenderer.renderCurrentPriceLine(ctx, layout, metrics, colors, fonts, currentPriceRef.current, width, tickSize);
    }

    // Bid/Ask Spread on price scale (Phase B)
    if (features.showSpread && currentPriceRef.current > 0) {
      // Use last candle's high bid and low ask as approximation
      const lastCandle = metrics.visibleCandles[metrics.visibleCandles.length - 1];
      if (lastCandle && lastCandle.levels.size > 0) {
        // Find best bid/ask from last candle levels
        let bestBid = 0;
        let bestAsk = Infinity;
        lastCandle.levels.forEach((level, price) => {
          if (level.bidVolume > 0 && price > bestBid) bestBid = price;
          if (level.askVolume > 0 && price < bestAsk) bestAsk = price;
        });
        if (bestBid > 0 && bestAsk < Infinity && bestAsk > bestBid) {
          fpRenderer.renderSpread(ctx, layout, metrics, bestBid, bestAsk, width, tickSize);
        }
      }
    }

    // Session separators (Phase B)
    if (features.showSessionSeparators && metrics.visibleCandles.length > 1) {
      fpRenderer.renderSessionSeparators(
        ctx, layout, metrics, isCME,
        metrics.footprintAreaY, metrics.footprintAreaHeight,
        features.customSessions,
      );
    }

    // Absorption events (Phase C)
    if (features.showAbsorptionEvents && absorptionEventsRef.current.length > 0) {
      fpRenderer.renderAbsorptionEvents(
        ctx, layout, metrics, absorptionEventsRef.current,
        metrics.footprintAreaY, metrics.footprintAreaHeight,
      );
    }

    // Alert lines
    {
      const alerts = useAlertsStore.getState().alerts.filter(
        a => !a.triggered && a.symbol.toLowerCase() === symbol.toLowerCase()
      );
      if (alerts.length > 0) {
        fpRenderer.renderAlertLines(
          ctx, layout, metrics, alerts,
          metrics.footprintAreaY, metrics.footprintAreaHeight, width,
        );
      }
    }

    // Session stats header (Phase 4)
    if (isFootprintMode && metrics.visibleCandles.length > 0) {
      fpRenderer.renderSessionHeader(ctx, metrics, profileCaches, colors, width);
    }

    // ═══════════════════════════════════════════════════════════════
    // CHART ENGINE — Layer 4: OrderflowEngine (CVD, Cluster Stat, DOM)
    // ═══════════════════════════════════════════════════════════════
    const clst = settings.clusterStatConfig;
    const clusterEnabled = clst ? clst.enabled : features.showClusterStatic;
    const clusterRowH = clst?.rowHeight ?? 16;
    const clusterNumRows = clusterEnabled
      ? [clst?.showTime ?? features.showHourMarkers, clst?.showAsks ?? true, clst?.showBids ?? true, clst?.showDelta ?? true, clst?.showVolume ?? true].filter(Boolean).length
      : 0;
    const clusterStaticHeight = clusterEnabled ? (clusterRowH * clusterNumRows + 4) : 0;
    const cvdEnabled = settings.cvdConfig ? settings.cvdConfig.enabled : features.showCVDPanel;
    const cvdPanelH = cvdEnabled ? (settings.cvdConfig?.panelHeight || features.cvdPanelHeight || 70) : 0;
    const footerHeight = clusterStaticHeight + cvdPanelH + 6;
    const footerY = height - footerHeight;

    // Footer background
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, footerY, width, footerHeight);

    // Top border of footer
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(width, footerY);
    ctx.stroke();

    // Cluster Statistic panel
    if (clusterEnabled && metrics.visibleCandles.length > 0) {
      fpRenderer.renderClusterStatPanel(
        ctx, layout, metrics, features, colors,
        width, footerY + 2,
        ohlcWidth, fpWidth,
        settings.clusterStatConfig,
        formatTime,
      );
    }

    // CVD Oscillator Panel
    if (cvdEnabled && cvdPanelH > 0) {
      const cvdPanelY = footerY + clusterStaticHeight + 6;
      fpRenderer.renderCVDPanel(
        ctx, layout, metrics, features, colors,
        width, cvdPanelY - cvdPanelH, cvdPanelH,
        ohlcWidth, fpWidth,
        settings.cvdConfig,
      );
    }

    // Footer status bar (Phase 4) — FPS, render time, LOD, candle count
    fpRenderer.renderFooterStatusBar(
      ctx, width, footerY, colors,
      currentPriceRef.current,
      metrics.visibleCandles.length,
      lod.mode,
    );

    // ═══════════════════════════════════════════════════════════════
    // CROSSHAIR - Using CrosshairStore Settings
    // ═══════════════════════════════════════════════════════════════
    if (activeTool === 'crosshair' && mousePositionRef.current) {
      const { x, y, price, time } = mousePositionRef.current;

      // Use crosshair settings from store
      ctx.strokeStyle = crosshairSettings.color;
      ctx.globalAlpha = crosshairSettings.opacity;
      ctx.lineWidth = crosshairSettings.lineWidth;

      // Set line style based on settings
      if (crosshairSettings.lineStyle === 'dashed') {
        ctx.setLineDash([6, 4]);
      } else if (crosshairSettings.lineStyle === 'dotted') {
        ctx.setLineDash([2, 2]);
      } else {
        ctx.setLineDash([]);
      }

      // Vertical line
      if (crosshairSettings.showVerticalLine) {
        ctx.beginPath();
        ctx.moveTo(x, footprintAreaY);
        ctx.lineTo(x, footerY);
        ctx.stroke();
      }

      // Horizontal line
      if (crosshairSettings.showHorizontalLine) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width - 60, y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Price label box (right side) - only if showPriceLabel enabled
      if (crosshairSettings.showPriceLabel) {
        const labelHeight = 18;
        const labelY = y - labelHeight / 2;

        // Background with border - use labelBackground from settings
        ctx.fillStyle = crosshairSettings.labelBackground;
        ctx.fillRect(width - 58, labelY, 56, labelHeight);

        // Price text - use labelTextColor from settings
        ctx.fillStyle = crosshairSettings.labelTextColor;
        ctx.font = `bold 10px "Consolas", "Monaco", monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(`$${price.toFixed(2)}`, width - 4, y + 3);
      }

      // Time label box (bottom, above cluster static) - only if showTimeLabel enabled
      if (crosshairSettings.showTimeLabel) {
        const timeLabelWidth = 60;
        const timeLabelX = x - timeLabelWidth / 2;
        const timeLabelY = footerY - 18;

        // Background with border - use labelBackground from settings
        ctx.fillStyle = crosshairSettings.labelBackground;
        ctx.fillRect(timeLabelX, timeLabelY, timeLabelWidth, 16);

        // Time text - use labelTextColor from settings + timezone-aware formatting
        ctx.fillStyle = crosshairSettings.labelTextColor;
        ctx.font = '9px "Consolas", "Monaco", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatTime(time, 'time'), x, timeLabelY + 11);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CELL HOVER TOOLTIP (Phase A)
    // ═══════════════════════════════════════════════════════════════
    if (hoveredCellRef.current && mousePositionRef.current) {
      const cell = hoveredCellRef.current;
      fpRenderer.renderCellTooltip(
        ctx,
        mousePositionRef.current.x,
        mousePositionRef.current.y,
        cell.price,
        cell.level,
        cell.candleTotalVol,
        width,
        height,
        tickSize,
        colors,
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // REPLAY MODE OVERLAY (Phase F)
    // ═══════════════════════════════════════════════════════════════
    if (replayStateRef.current.active) {
      const r = replayStateRef.current;
      ctx.save();
      // Semi-transparent amber badge top-center
      const badgeText = `REPLAY  ${r.currentIndex + 1} / ${r.allCandles.length}`;
      ctx.font = 'bold 11px "Consolas", "Monaco", monospace';
      const badgeW = ctx.measureText(badgeText).width + 24;
      const badgeX = (width - badgeW) / 2;
      const badgeY = 8;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, 22, 6);
      ctx.fill();
      ctx.stroke();
      // Pulsing dot
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
      ctx.fillStyle = `rgba(245, 158, 11, ${0.6 + 0.4 * pulse})`;
      ctx.beginPath();
      ctx.arc(badgeX + 10, badgeY + 11, 3, 0, Math.PI * 2);
      ctx.fill();
      // Text
      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(badgeText, badgeX + 18, badgeY + 15);
      ctx.restore();
    }

    // === RENDER TOOLS ===
    const renderContext: RenderContext = {
      ctx,
      width,
      height,
      priceToY: (price: number) => layout.priceToY(price, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      // Use proper layout conversion for time coordinates
      timeToX: (time: number) => layout.timeToX(time, metrics),
      xToTime: (x: number) => layout.xToTime(x, metrics),
      tickSize,
      currentPrice: currentPriceRef.current || 0,
      colors: {
        positive: colors.deltaPositive,
        negative: colors.deltaNegative,
        selection: colors.currentPriceColor,
        handle: '#ffffff',
        handleBorder: colors.currentPriceColor,
      },
      altKey: getInteractionController().getState().modifiers.alt,
    };

    getToolsRenderer().render(renderContext);

    // Track FPS
    fpRenderer.trackFrame(renderStartTime);
  }, [settings, tickSize, activeTool, crosshairSettings]);

  /**
   * Animation loop — paused when page is hidden (keep-alive optimization)
   */
  useEffect(() => {
    if (!isActive) return;
    const animate = () => {
      renderCanvas();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Clean up replay interval on unmount
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
      }
      // Clean up web worker
      resetFootprintWorkerManager();
      // Clean up chart sync
      syncManagerRef.current?.close();
      syncManagerRef.current = null;
    };
  }, [isActive, renderCanvas]);

  /**
   * Initialize and connect
   */
  useEffect(() => {
    if (!isActive) return;
    let isMounted = true;
    const MAX_CANDLES = 500; // Keep more candles for history
    const exchange = SYMBOL_EXCHANGE[symbol] || 'binance';

    const init = async () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];

      // Reset services
      resetOrderflowEngine();
      resetFootprintDataService();
      resetSessionFootprintService();
      resetOptimizedFootprintService();
      resetDxFeedFootprintEngine();
      configureOrderflow({ tickSize, imbalanceRatio: settings.imbalance.ratio });
      // Reset worker cached results on symbol/timeframe change
      workerIndicatorsRef.current = null;
      workerDataVersionRef.current = '';

      // ═══════════════════════════════════════════════════════════════════════
      // CME FUTURES — dxFeed (preferred, $29/mo) or Tradovate fallback
      // Configure provider in /boutique.
      // ═══════════════════════════════════════════════════════════════════════
      if (exchange === 'cme') {
        const adapterLabel = getCMEAdapterLabel();
        console.log(`[FootprintChartPro] CME symbol ${symbol} — connecting via ${adapterLabel}`);

        const tradovate = getCMELiveAdapter();
        const footprintService = getOptimizedFootprintService({
          symbol,
          timeframe,
          tickSize,
          imbalanceRatio: settings.imbalance.ratio,
          totalHours: 24,
          aggregationMode: settings.features.aggregationMode,
          tickBarSize: settings.features.tickBarSize,
          volumeBarSize: settings.features.volumeBarSize,
          loadMode: 'skeleton',
        });

        setIsLoading(false);

        // Status updates
        const unsubStatus = tradovate.onStatus((s) => {
          if (!isMounted) return;
          setStatus(s);
          if (statusDotRef.current) {
            statusDotRef.current.style.backgroundColor =
              s === 'connected'  ? settings.colors.deltaPositive :
              s === 'connecting' ? '#eab308' :
              settings.colors.deltaNegative;
          }
        });
        unsubscribersRef.current.push(unsubStatus);

        // Live ticks — same footprint pipeline as Binance
        const unsubTick = tradovate.onTick((tick) => {
          if (!isMounted || replayStateRef.current.active) return;

          currentPriceRef.current = tick.price;
          useAlertsStore.getState().checkAlerts(symbol, tick.price);
          if (priceRef.current) {
            priceRef.current.textContent = tick.price.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          }

          try {
            const updatedCandle = footprintService.processLiveTrade({
              price:        tick.price,
              quantity:     tick.quantity,
              time:         tick.timestamp,
              isBuyerMaker: tick.isBuyerMaker,
            });
            if (updatedCandle) {
              candlesRef.current = footprintService.getCandlesArray();
            }
          } catch { /* ignore — building up history from live ticks */ }

          if (candlesRef.current.length > MAX_CANDLES) {
            candlesRef.current = candlesRef.current.slice(-MAX_CANDLES);
          }

          const lastCandle = candlesRef.current[candlesRef.current.length - 1];
          if (lastCandle && deltaRef.current) {
            const delta = lastCandle.totalDelta;
            deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
            deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
          }
        });
        unsubscribersRef.current.push(unsubTick);

        // Connect and subscribe
        tradovate.connect(symbol);

        return; // Exit early for CME — don't run Binance logic
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CRYPTO (Binance)
      // ═══════════════════════════════════════════════════════════════════════

      // Load historical footprint data (REAL trade data)
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      candlesRef.current = history;
      console.log(`[FootprintChartPro] Initialized with ${history.length} historical candles`);

      const ws = getBinanceLiveWS();
      const engine = getOrderflowEngine();
      const footprintService = getFootprintDataService();
      footprintService.setImbalanceRatio(settings.imbalance.ratio);

      // Status updates
      const unsubStatus = ws.onStatus((s) => {
        if (!isMounted) return;
        setStatus(s);
        if (statusDotRef.current) {
          statusDotRef.current.style.backgroundColor =
            s === 'connected' ? settings.colors.deltaPositive :
            s === 'connecting' ? '#eab308' :
            settings.colors.deltaNegative;
        }
      });
      unsubscribersRef.current.push(unsubStatus);

      // Process live ticks via OptimizedFootprintService
      // Live trades use isBuyerMaker for exact bid/ask classification
      const unsubTick = ws.onTick((tick) => {
        if (!isMounted) return;
        // Skip live updates during replay mode
        if (replayStateRef.current.active) return;

        // Update price display + check alerts
        currentPriceRef.current = tick.price;
        useAlertsStore.getState().checkAlerts(symbol, tick.price);
        if (priceRef.current) {
          priceRef.current.textContent = `$${tick.price.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }

        // Process live trade
        try {
          const service = getOptimizedFootprintService();
          const updatedCandle = service.processLiveTrade({
            price: tick.price,
            quantity: tick.quantity,
            time: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          });

          if (updatedCandle) {
            candlesRef.current = service.getCandlesArray();
          }
        } catch {
          // Fallback to legacy service
          const trade: Trade = {
            id: `${tick.timestamp}_${tick.price}`,
            price: tick.price,
            quantity: tick.quantity,
            time: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          };

          candlesRef.current = footprintService.processLiveTrade(
            trade,
            timeframe,
            tickSize,
            candlesRef.current
          );
        }

        // Limit candles to MAX_CANDLES
        if (candlesRef.current.length > MAX_CANDLES) {
          candlesRef.current = candlesRef.current.slice(-MAX_CANDLES);
        }

        // Update delta display
        const currentCandle = candlesRef.current[candlesRef.current.length - 1];
        if (currentCandle && deltaRef.current) {
          const delta = currentCandle.totalDelta;
          deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
          deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
        }

        // ═══════════════════════════════════════════════════════════════
        // FEED TRADE TO ABSORPTION ENGINE
        // This enables coherent passive liquidity that reacts to trades
        // ═══════════════════════════════════════════════════════════════
        if (settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled) {
          const absorptionEngine = getTradeAbsorptionEngine();
          const absResult = absorptionEngine.feedTrade({
            price: tick.price,
            quantity: tick.quantity,
            timestamp: tick.timestamp,
            isBuyerMaker: tick.isBuyerMaker,
          });

          // Collect significant absorption events for rendering
          if (absResult && absResult.levelExecuted && absResult.volumeAbsorbed > 0) {
            absorptionEventsRef.current.push({
              price: tick.price,
              volume: absResult.volumeAbsorbed,
              side: tick.isBuyerMaker ? 'bid' : 'ask',
              timestamp: tick.timestamp,
            });
            // Keep max 100 events, prune old ones (> 60s)
            const cutoff = Date.now() - 60000;
            absorptionEventsRef.current = absorptionEventsRef.current.filter(e => e.timestamp > cutoff);
          }
        }
      });
      unsubscribersRef.current.push(unsubTick);

      // Also keep the engine-based processing for compatibility
      const unsubFootprint = engine.on('footprint:update', (candle, tf) => {
        if (tf !== timeframe || !isMounted) return;
        // The tick handler already updates candlesRef, this is just for delta display
        if (deltaRef.current) {
          const delta = candle.totalDelta;
          deltaRef.current.textContent = (delta >= 0 ? '+' : '') + formatVol(delta);
          deltaRef.current.style.color = delta >= 0 ? settings.colors.deltaPositive : settings.colors.deltaNegative;
        }
      });
      unsubscribersRef.current.push(unsubFootprint);

      // ═══════════════════════════════════════════════════════════════
      // REAL ORDERBOOK DATA (Binance Depth Stream)
      // Subscribe to depth updates when in realtime mode
      // ═══════════════════════════════════════════════════════════════
      if (settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getPassiveLiquiditySimulator } = require('@/lib/orderflow/PassiveLiquiditySimulator');
        const simulator = getPassiveLiquiditySimulator();

        // Check if realtime mode is enabled (can be toggled in settings)
        const useRealtimeOrderbook = settings.passiveLiquidity.useRealOrderbook ?? false;

        if (useRealtimeOrderbook) {
          simulator.setDataSource('realtime');

          const unsubDepth = ws.onDepthUpdate((depth) => {
            if (!isMounted) return;
            simulator.processOrderbookSnapshot(depth);
          });
          unsubscribersRef.current.push(unsubDepth);

          console.log('[FootprintChartPro] Subscribed to real orderbook data');
        } else {
          simulator.setDataSource('simulation');
        }
      }

      ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
      // Disconnect from dxFeed if connected
      resetDxFeedFootprintEngine();
    };
  }, [symbol, timeframe, tickSize, loadHistory, settings.imbalance.ratio, settings.colors.deltaPositive, settings.colors.deltaNegative, isActive]);

  /**
   * Wheel handler (zoom / scroll)
   */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const layout = layoutEngineRef.current;
    if (!layout) return;

    // Invalidate LOD cache on zoom (will be recomputed on next render)
    invalidateLODCache();

    if (e.shiftKey) {
      layout.scroll(e.deltaY);
    } else {
      // Multiplicative zoom for smooth, proportional scaling
      const factor = e.deltaY > 0 ? 1 / 1.08 : 1.08;
      layout.setZoom(layout.getZoom() * factor);
      layout.setZoomY(layout.getZoomY() * factor);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    const layout = layoutEngineRef.current;
    if (!layout) return;
    invalidateLODCache();
    layout.setZoom(layout.getZoom() * 1.2);
    layout.setZoomY(layout.getZoomY() * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    const layout = layoutEngineRef.current;
    if (!layout) return;
    invalidateLODCache();
    layout.setZoom(layout.getZoom() / 1.2);
    layout.setZoomY(layout.getZoomY() / 1.2);
  }, []);

  const handleResetView = useCallback(() => {
    const layout = layoutEngineRef.current;
    if (!layout) return;
    invalidateLODCache();
    layout.setZoom(1);
    layout.setZoomY(1);
    layout.resetScroll();
  }, []);

  /**
   * Setup interaction controller
   */
  useEffect(() => {
    const controller = getInteractionController();
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;

    // Set callbacks
    controller.setCallbacks({
      onToolSelected: (tool) => {
        setSelectedTool(tool);
      },
      onToolCreated: (tool) => {
        // Apply ONLY visual style settings from store to newly created tool
        // Extension settings (extendLeft, extendRight) should use the engine defaults (false)
        // This prevents persisted old settings from overriding the correct defaults
        if (tool) {
          const toolsEngine = getToolsEngine();
          // Engine already applies default styles during tool creation via getDefaultStyle(),
          // so no additional style override is needed here.

          // For text tools, automatically open the inline editor
          if (tool.type === 'text') {
            const layout = layoutEngineRef.current;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (layout && rect) {
              const textTool = tool as any;
              const metrics = layout.calculateMetrics(candlesRef.current, tickSize);
              const toolX = layout.timeToX(textTool.point.time, metrics);
              const toolY = layout.priceToY(textTool.point.price, metrics);

              toolsEngine.startTextEdit(tool.id);
              setTextEditorState({
                isOpen: true,
                toolId: tool.id,
                content: textTool.content || 'Text',
                position: {
                  x: rect.left + toolX,
                  y: rect.top + toolY,
                },
                style: {
                  fontSize: textTool.fontSize || 14,
                  fontFamily: textTool.fontFamily || 'system-ui, sans-serif',
                  fontWeight: textTool.fontWeight || 'normal',
                  color: textTool.fontColor || textTool.style?.color || '#ffffff',
                  backgroundColor: textTool.backgroundColor || 'rgba(0, 0, 0, 0.85)',
                },
              });
            }
          }
        }
        setSelectedTool(tool);
      },
      onModeChanged: (mode) => {
        // Reset to cursor after drawing completes
        if (mode === 'idle') {
          setActiveTool('cursor');
        }
      },
      onCursorChanged: (cursor) => {
        if (containerRef.current) {
          containerRef.current.style.cursor = cursor;
        }
      },
      requestRedraw: () => {
        // Animation loop handles this
      },
    });

    return () => {
      resetInteractionController();
    };
  }, []);

  /**
   * Update coordinate converter when metrics change
   */
  useEffect(() => {
    const controller = getInteractionController();
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;

    if (layout && metrics) {
      controller.setCoordinateConverter({
        xToTime: (x: number) => layout.xToTime(x, metrics),
        timeToX: (time: number) => layout.timeToX(time, metrics),
        yToPrice: (y: number) => layout.yToPrice(y, metrics),
        priceToY: (price: number) => layout.priceToY(price, metrics),
      });
    }
  }, [metricsRef.current]);

  /**
   * Update active tool in controller
   */
  useEffect(() => {
    const controller = getInteractionController();
    controller.setActiveTool(activeTool);
  }, [activeTool]);

  /**
   * Mouse down handler
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;
    if (!layout || !metrics) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;

    // Check if click is on price scale (right side, last 60px)
    if (x > width - 60) {
      // Start price scale drag for vertical zoom
      isPriceScaleDragRef.current = true;
      priceScaleDragStartRef.current = {
        y: e.clientY,
        zoomY: layout.getZoomY(),
      };
      e.preventDefault();
      return;
    }

    // Check if we should select a tool or pan (cursor tool active)
    if (activeTool === 'cursor' || activeTool === 'crosshair') {
      // First check if clicking on an existing tool
      const toolsEngine = getToolsEngine();
      const point = {
        time: layout.xToTime(x, metrics),
        price: layout.yToPrice(y, metrics),
      };

      const hitResult = toolsEngine.hitTest(
        point,
        (price: number) => layout.priceToY(price, metrics),
        (time: number) => layout.timeToX(time, metrics),
        12 // tolerance in pixels
      );

      if (hitResult) {
        // Clicked on a tool - select it and start dragging
        toolsEngine.selectTool(hitResult.tool.id);
        setSelectedTool(hitResult.tool);

        if (!hitResult.tool.locked) {
          // Start dragging the tool
          toolsEngine.startDrag(hitResult.tool.id, hitResult.handle, point);
        }
        e.preventDefault();
        return;
      }

      // No tool hit - deselect and start panning
      toolsEngine.deselectAll();
      setSelectedTool(null);

      isDraggingRef.current = true;
      // CRITICAL: Lock price range for free diagonal panning
      layout.startPan(metrics);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: 0, // Not used with pan() method
        scrollY: 0,
      };
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
      e.preventDefault();
      return;
    }

    // Update controller with current metrics and bounds for drawing tools
    const controller = getInteractionController();
    controller.setChartBounds(rect);
    controller.setCoordinateConverter({
      xToTime: (x: number) => layout.xToTime(x, metrics),
      timeToX: (time: number) => layout.timeToX(time, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      priceToY: (price: number) => layout.priceToY(price, metrics),
    });

    controller.handleMouseDown(e);
  }, [activeTool]);

  /**
   * Mouse move handler
   */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;
    if (!layout || !metrics) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle price scale drag (vertical zoom)
    if (isPriceScaleDragRef.current && priceScaleDragStartRef.current) {
      const deltaY = priceScaleDragStartRef.current.y - e.clientY; // Up = positive
      // Multiplicative zoom: each 100px of drag = ~2x zoom change
      const factor = Math.pow(1.01, deltaY);
      const newZoomY = Math.max(0.1, Math.min(20, priceScaleDragStartRef.current.zoomY * factor));
      layout.setZoomY(newZoomY);
      invalidateLODCache();
      return;
    }

    // Handle tool dragging
    const toolsEngine = getToolsEngine();
    if (toolsEngine.isDragging()) {
      const point = {
        time: layout.xToTime(x, metrics),
        price: layout.yToPrice(y, metrics),
      };
      toolsEngine.updateDrag(point);
      return;
    }

    // Handle chart panning - FREE diagonal movement
    // Uses pan() with delta movement for smooth professional feel
    if (isDraggingRef.current && dragStartRef.current) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Use pan() for smooth incremental movement with momentum tracking
      layout.pan(deltaX, deltaY);

      // Update reference point for next frame
      dragStartRef.current.x = e.clientX;
      dragStartRef.current.y = e.clientY;

      invalidateLODCache();
      return;
    }

    const price = layout.yToPrice(y, metrics);
    const time = layout.xToTime(x, metrics);

    // Store mouse position for crosshair
    mousePositionRef.current = { x, y, price, time };

    // Broadcast crosshair to synced charts
    const sync = useChartSyncStore.getState();
    if (sync.syncEnabled && sync.syncCrosshair) {
      syncManagerRef.current?.broadcastCrosshair(price, time, true);
    }

    // ═══════════════════════════════════════════════════════════════
    // FOOTPRINT CELL HOVER DETECTION (for tooltip)
    // ═══════════════════════════════════════════════════════════════
    const candleIdx = layout.getCandleIndexAtX(x, metrics);
    if (candleIdx >= 0 && candleIdx < metrics.visibleCandles.length) {
      const candle = metrics.visibleCandles[candleIdx];
      const hoverPrice = layout.yToPrice(y, metrics);
      // Snap to nearest tick
      const precFactor = Math.pow(10, Math.max(Math.round(-Math.log10(tickSize)) + 2, 2));
      const snappedPrice = Math.round(Math.round(hoverPrice / tickSize) * tickSize * precFactor) / precFactor;
      const level = candle.levels.get(snappedPrice);
      hoveredCellRef.current = level
        ? { candleIdx, price: snappedPrice, level, candleTotalVol: candle.totalVolume }
        : null;
    } else {
      hoveredCellRef.current = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // PASSIVE LIQUIDITY HOVER DETECTION
    // ═══════════════════════════════════════════════════════════════
    let foundHoveredLevel: PassiveOrderLevel | null = null;
    for (const bound of passiveLevelBoundsRef.current) {
      if (
        x >= bound.x &&
        x <= bound.x + bound.width &&
        y >= bound.y &&
        y <= bound.y + bound.height
      ) {
        foundHoveredLevel = bound.level;
        break;
      }
    }
    hoveredPassiveLevelRef.current = foundHoveredLevel;

    // Update cursor based on position
    if (containerRef.current) {
      const width = rect.width;
      if (x > width - 60) {
        containerRef.current.style.cursor = 'ns-resize'; // Vertical resize for price scale
      } else if (activeTool === 'crosshair') {
        containerRef.current.style.cursor = 'crosshair';
      } else if (activeTool === 'cursor') {
        containerRef.current.style.cursor = 'grab';
      } else {
        containerRef.current.style.cursor = 'default';
      }
    }

    // Update controller
    const controller = getInteractionController();
    controller.setChartBounds(rect);
    controller.setCoordinateConverter({
      xToTime: (x: number) => layout.xToTime(x, metrics),
      timeToX: (time: number) => layout.timeToX(time, metrics),
      yToPrice: (y: number) => layout.yToPrice(y, metrics),
      priceToY: (price: number) => layout.priceToY(price, metrics),
    });

    controller.handleMouseMove(e);
  }, [activeTool]);

  /**
   * Mouse up handler
   */
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;

    // End tool dragging if active
    const toolsEngine = getToolsEngine();
    if (toolsEngine.isDragging()) {
      toolsEngine.endDrag();
    }

    // Reset drag states
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dragStartRef.current = null;
      // End pan but keep price range locked (don't auto-fit)
      if (layout) {
        layout.endPan(false);
        // Start momentum scrolling for smooth deceleration
        layout.startMomentum();
      }
      if (containerRef.current) {
        containerRef.current.style.cursor = activeTool === 'crosshair' ? 'crosshair' : 'grab';
      }
    }

    if (isPriceScaleDragRef.current) {
      isPriceScaleDragRef.current = false;
      priceScaleDragStartRef.current = null;
    }

    const controller = getInteractionController();
    controller.handleMouseUp(e);
  }, [activeTool]);

  /**
   * Mouse leave handler
   */
  const handleMouseLeave = useCallback(() => {
    // Don't reset drag states on leave - window events will handle mouse up
    mousePositionRef.current = null;
    hoveredPassiveLevelRef.current = null; // Clear hover state
    hoveredCellRef.current = null; // Clear cell tooltip
    const controller = getInteractionController();
    controller.handleMouseLeave();
  }, []);

  /**
   * Double click handler - Edit text or reset view
   */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const layout = layoutEngineRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!layout || !rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;

    // Double-click on price scale = reset Y zoom only
    if (x > width - 60) {
      layout.setZoomY(1);
      layout.resetPriceRange();
      invalidateLODCache();
      return;
    }

    // Check if double-clicking on a text tool to edit it
    const toolsEngine = getToolsEngine();
    const metrics = layout.calculateMetrics(candlesRef.current, tickSize);
    const point = {
      time: layout.xToTime(x, metrics),
      price: layout.yToPrice(y, metrics),
    };

    const hitResult = toolsEngine.hitTest(
      point,
      (price: number) => layout.priceToY(price, metrics),
      (time: number) => layout.timeToX(time, metrics),
      10 // Tolerance in pixels
    );

    // If clicked on a text tool, enter edit mode with inline editor
    if (hitResult && hitResult.tool && hitResult.tool.type === 'text') {
      const textTool = hitResult.tool as any;
      toolsEngine.startTextEdit(hitResult.tool.id);

      // Calculate screen position for the editor
      const toolX = layout.timeToX(textTool.point.time, metrics);
      const toolY = layout.priceToY(textTool.point.price, metrics);

      // Open inline text editor
      setTextEditorState({
        isOpen: true,
        toolId: hitResult.tool.id,
        content: textTool.content || '',
        position: {
          x: rect.left + toolX,
          y: rect.top + toolY,
        },
        style: {
          fontSize: textTool.fontSize || 14,
          fontFamily: textTool.fontFamily || 'system-ui, sans-serif',
          fontWeight: textTool.fontWeight || 'normal',
          color: textTool.fontColor || textTool.style?.color || '#ffffff',
          backgroundColor: textTool.backgroundColor || 'rgba(0, 0, 0, 0.85)',
        },
      });
      return;
    }

    // Double-click on chart = reset entire view
    layout.resetToOptimalView(candlesRef.current.length);
    invalidateLODCache();
  }, []);

  /**
   * Text editor save handler
   */
  const handleTextEditorSave = useCallback((newContent: string) => {
    if (!textEditorState) return;

    const toolsEngine = getToolsEngine();
    if (newContent.trim()) {
      toolsEngine.finishTextEdit(textEditorState.toolId, newContent);
    } else {
      // Empty content - delete the tool
      toolsEngine.cancelTextEdit(textEditorState.toolId);
      toolsEngine.deleteTool(textEditorState.toolId);
    }
    setTextEditorState(null);
  }, [textEditorState]);

  /**
   * Text editor cancel handler
   */
  const handleTextEditorCancel = useCallback(() => {
    if (!textEditorState) return;

    const toolsEngine = getToolsEngine();
    toolsEngine.cancelTextEdit(textEditorState.toolId);
    setTextEditorState(null);
  }, [textEditorState]);

  /**
   * Global mouse event handlers for drag operations
   */
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const layout = layoutEngineRef.current;
      if (!layout) return;

      // Handle price scale drag (vertical zoom)
      if (isPriceScaleDragRef.current && priceScaleDragStartRef.current) {
        const deltaY = priceScaleDragStartRef.current.y - e.clientY;
        const zoomDelta = deltaY * 0.01; // Increased sensitivity
        const newZoomY = Math.max(0.1, Math.min(20, priceScaleDragStartRef.current.zoomY + zoomDelta));
        layout.setZoomY(newZoomY);
        invalidateLODCache();
      }

      // Handle chart panning - FREE diagonal movement
      if (isDraggingRef.current && dragStartRef.current) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        // Use pan() for smooth incremental movement
        layout.pan(deltaX, deltaY);

        // Update reference point for next frame
        dragStartRef.current.x = e.clientX;
        dragStartRef.current.y = e.clientY;

        invalidateLODCache();
      }
    };

    const handleGlobalMouseUp = () => {
      const layout = layoutEngineRef.current;

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragStartRef.current = null;
        // End pan but keep view (don't auto-fit)
        if (layout) {
          layout.endPan(false);
          layout.startMomentum();
        }
        if (containerRef.current) {
          containerRef.current.style.cursor = activeTool === 'crosshair' ? 'crosshair' : 'grab';
        }
      }

      if (isPriceScaleDragRef.current) {
        isPriceScaleDragRef.current = false;
        priceScaleDragStartRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [activeTool]);

  /**
   * Handle layout load
   */
  const handleLoadLayout = useCallback((layout: LayoutData) => {
    // Apply chart settings
    if (layout.chart.symbol !== symbol) {
      setSymbol(layout.chart.symbol);
    }
    if (layout.chart.timeframe !== timeframe) {
      setTimeframe(layout.chart.timeframe as TimeframeSeconds);
    }
    if (layout.chart.tickSize !== tickSize) {
      setTickSize(layout.chart.tickSize);
    }

    // Apply colors, fonts, features
    settings.setColors(layout.colors);
    settings.setFonts(layout.fonts);
    settings.setFeatures(layout.features);
    settings.setImbalance(layout.imbalance);
    settings.setLayout(layout.layout);
  }, [symbol, timeframe, tickSize, settings]);

  /**
   * Handlers
   */
  const handleSymbolChange = useCallback((newSymbol: string) => {
    if (newSymbol === symbol) return;

    // Exit replay mode if active
    if (replayStateRef.current.active) {
      replayCallbacksRef.current.exit();
    }

    const info = SYMBOLS.find(s => s.value === newSymbol);
    const exchange = SYMBOL_EXCHANGE[newSymbol] || 'binance';

    setSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
    setTickSize(info?.tickSize || 10);
    // Broadcast symbol change to synced charts
    const sync = useChartSyncStore.getState();
    if (sync.syncEnabled && sync.syncSymbol) {
      syncManagerRef.current?.broadcastSymbol(newSymbol);
    }

    // Full data cleanup — clear all stale data from previous pair
    resetOrderflowEngine();
    resetFootprintDataService();
    resetSessionFootprintService();
    resetOptimizedFootprintService();
    candlesRef.current = [];
    absorptionEventsRef.current = [];
    workerIndicatorsRef.current = null;
    workerDataVersionRef.current = '';
    currentPriceRef.current = 0;
    vwapDataRef.current = [];
    twapDataRef.current = [];
    debugTradesRef.current = [];
    debugTradeCountRef.current = 0;
    layoutEngineRef.current?.resetScroll();

    if (exchange === 'binance') {
      getBinanceLiveWS().changeSymbol(newSymbol);
    } else {
      // CME → dxFeed/Tradovate: disconnect Binance, adapter handles re-subscribe via main useEffect
      getBinanceLiveWS().disconnect();
      getCMELiveAdapter().changeSymbol(newSymbol);
    }
  }, [symbol]);

  const handleTimeframeChange = useCallback((newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);
    layoutEngineRef.current?.resetScroll();
    // Broadcast timeframe change to synced charts
    const sync = useChartSyncStore.getState();
    if (sync.syncEnabled && sync.syncTimeframe) {
      syncManagerRef.current?.broadcastTimeframe(newTf);
    }
  }, [timeframe]);

  /**
   * Multi-chart sync via BroadcastChannel
   */
  useEffect(() => {
    const mgr = new BroadcastChannelManager('footprint-' + Math.random().toString(36).slice(2, 8));
    syncManagerRef.current = mgr;

    mgr.setListeners({
      onCrosshair: (msg) => {
        const sync = useChartSyncStore.getState();
        if (!sync.syncEnabled || !sync.syncCrosshair) return;
        syncCrosshairRef.current = { price: msg.price, time: msg.time, visible: msg.visible };
      },
      onSymbol: (msg) => {
        const sync = useChartSyncStore.getState();
        if (!sync.syncEnabled || !sync.syncSymbol) return;
        handleSymbolChange(msg.symbol);
      },
      onTimeframe: (msg) => {
        const sync = useChartSyncStore.getState();
        if (!sync.syncEnabled || !sync.syncTimeframe) return;
        handleTimeframeChange(msg.timeframe as TimeframeSeconds);
      },
    });

    return () => {
      mgr.close();
    };
  }, [handleSymbolChange, handleTimeframeChange]);

  const handleToolSelect = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool !== 'cursor' && tool !== 'crosshair') {
      getToolsEngine().deselectAll();
      setSelectedTool(null);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // REPLAY MODE CALLBACKS
  // ═══════════════════════════════════════════════════════════════

  const syncReplayState = useCallback(() => {
    const r = replayStateRef.current;
    setReplayState({
      active: r.active,
      currentIndex: r.currentIndex,
      totalCandles: r.allCandles.length,
      speed: r.speed,
      playing: r.playing,
    });
  }, []);

  const replayApplyIndex = useCallback((index: number) => {
    const r = replayStateRef.current;
    if (!r.active) return;
    r.currentIndex = Math.max(0, Math.min(index, r.allCandles.length - 1));
    candlesRef.current = r.allCandles.slice(0, r.currentIndex + 1);
    syncReplayState();
  }, [syncReplayState]);

  const replayStopInterval = useCallback(() => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
  }, []);

  const replayStartInterval = useCallback(() => {
    replayStopInterval();
    const r = replayStateRef.current;
    const intervalMs = Math.max(50, 1000 / r.speed);
    replayIntervalRef.current = setInterval(() => {
      const rs = replayStateRef.current;
      if (!rs.active || !rs.playing) {
        replayStopInterval();
        return;
      }
      if (rs.currentIndex >= rs.allCandles.length - 1) {
        rs.playing = false;
        replayStopInterval();
        syncReplayState();
        return;
      }
      replayApplyIndex(rs.currentIndex + 1);
    }, intervalMs);
  }, [replayStopInterval, replayApplyIndex, syncReplayState]);

  const handleReplayEnter = useCallback(() => {
    const candles = candlesRef.current;
    if (candles.length < 2) return;
    const r = replayStateRef.current;
    r.active = true;
    r.allCandles = [...candles];
    r.liveCandlesBackup = [...candles];
    r.currentIndex = candles.length - 1;
    r.playing = false;
    r.speed = 1;
    setReplayActive(true);
    syncReplayState();
  }, [syncReplayState]);

  const handleReplayExit = useCallback(() => {
    replayStopInterval();
    const r = replayStateRef.current;
    // Restore live candles
    candlesRef.current = r.liveCandlesBackup;
    r.active = false;
    r.playing = false;
    r.allCandles = [];
    r.liveCandlesBackup = [];
    setReplayActive(false);
    syncReplayState();
  }, [replayStopInterval, syncReplayState]);

  const handleReplayPlay = useCallback(() => {
    const r = replayStateRef.current;
    if (r.currentIndex >= r.allCandles.length - 1) return;
    r.playing = true;
    syncReplayState();
    replayStartInterval();
  }, [syncReplayState, replayStartInterval]);

  const handleReplayPause = useCallback(() => {
    replayStateRef.current.playing = false;
    replayStopInterval();
    syncReplayState();
  }, [replayStopInterval, syncReplayState]);

  const handleReplayNext = useCallback(() => {
    replayApplyIndex(replayStateRef.current.currentIndex + 1);
  }, [replayApplyIndex]);

  const handleReplayPrev = useCallback(() => {
    replayApplyIndex(replayStateRef.current.currentIndex - 1);
  }, [replayApplyIndex]);

  const handleReplayStart = useCallback(() => {
    replayApplyIndex(0);
  }, [replayApplyIndex]);

  const handleReplayEnd = useCallback(() => {
    replayApplyIndex(replayStateRef.current.allCandles.length - 1);
  }, [replayApplyIndex]);

  const handleReplaySeek = useCallback((index: number) => {
    replayApplyIndex(index);
  }, [replayApplyIndex]);

  const handleReplaySpeedChange = useCallback((speed: 1 | 2 | 5 | 10) => {
    replayStateRef.current.speed = speed;
    syncReplayState();
    if (replayStateRef.current.playing) {
      replayStartInterval();
    }
  }, [syncReplayState, replayStartInterval]);

  // Keep the ref in sync with callbacks (for keyboard handler)
  replayCallbacksRef.current = {
    enter: handleReplayEnter,
    exit: handleReplayExit,
    next: handleReplayNext,
    prev: handleReplayPrev,
    play: handleReplayPlay,
    pause: handleReplayPause,
  };

  /**
   * Context menu handlers
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    // Check if right-click is on a tool
    const layout = layoutEngineRef.current;
    const metrics = metricsRef.current;
    const canvas = canvasRef.current;
    if (canvas && layout && metrics) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = layout.xToTime(x, metrics);
      const price = layout.yToPrice(y, metrics);
      const toolsEngine = getToolsEngine();
      const hit = toolsEngine.hitTest(
        { time, price },
        (p: number) => layout.priceToY(p, metrics),
        (t: number) => layout.timeToX(t, metrics),
      );
      if (hit) {
        setToolContextMenu({ x: e.clientX, y: e.clientY, tool: hit.tool });
        return;
      }
    }

    // Get price at click position for alert creation
    const clickPrice = (canvas && layout && metrics)
      ? layout.yToPrice(e.clientY - canvas.getBoundingClientRect().top, metrics)
      : undefined;
    setContextMenu({ x: e.clientX, y: e.clientY, clickPrice });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setToolContextMenu(null);
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid((prev: boolean) => {
      const newValue = !prev;
      settings.setFeatures({ showGrid: newValue });
      return newValue;
    });
  }, [settings]);

  const copyPrice = useCallback(() => {
    if (currentPriceRef.current) {
      navigator.clipboard.writeText(currentPriceRef.current.toString());
      toast.success('Price copied');
    }
  }, []);

  const resetView = useCallback(() => {
    layoutEngineRef.current?.resetScroll();
  }, []);

  /**
   * Save current chart settings as a template
   */
  const handleSaveTemplate = useCallback((name: string) => {
    saveTemplate({
      name,
      type: 'footprint',
      settings: {
        showGrid,
        footprintSettings: {
          features: settings.features,
          imbalance: settings.imbalance,
          layout: {
            footprintWidth: settings.footprintWidth,
            rowHeight: settings.rowHeight,
            maxVisibleFootprints: settings.maxVisibleFootprints,
            deltaProfilePosition: settings.deltaProfilePosition,
          },
        },
        colors: settings.colors as unknown as Record<string, string | number>,
      },
    });
  }, [saveTemplate, showGrid, settings]);

  /**
   * Load a template and apply settings
   */
  const handleLoadTemplate = useCallback((template: ChartTemplate) => {
    if (template.settings.showGrid !== undefined) {
      setShowGrid(template.settings.showGrid);
    }
    if (template.settings.footprintSettings) {
      const fp = template.settings.footprintSettings;
      if (fp.features) {
        settings.setFeatures(fp.features);
      }
      if (fp.imbalance) {
        settings.setImbalance(fp.imbalance);
      }
      if (fp.layout) {
        settings.setLayout(fp.layout);
      }
    }
    if (template.settings.colors) {
      settings.setColors(template.settings.colors as unknown as Partial<FootprintColors>);
    }
  }, [settings]);

  /**
   * Get available templates for this chart type
   */
  const availableTemplates = useMemo(() => {
    return getTemplatesByType('footprint');
  }, [getTemplatesByType, templates]);

  const openAdvancedSettings = useCallback((e?: React.MouseEvent | MouseEvent) => {
    const x = e ? ('clientX' in e ? e.clientX : 100) : 100;
    const y = e ? ('clientY' in e ? e.clientY : 100) : 100;
    setAdvancedSettingsPosition({ x: Math.max(20, x - 200), y: Math.max(60, y - 50) });
    setShowAdvancedSettings(true);
  }, []);

  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    return createChartContextMenuItems({
      onCopyPrice: copyPrice,
      onToggleGrid: toggleGrid,
      onOpenSettings: () => openAdvancedSettings(),
      onResetView: resetView,
      onClearDrawings: () => getToolsEngine().clearAll(),
      onSaveTemplate: () => setShowSaveTemplateModal(true),
      templates: availableTemplates.map(t => ({
        id: t.id,
        name: t.name,
        onLoad: () => handleLoadTemplate(t),
      })),
      showGrid,
      clickPrice: contextMenu?.clickPrice,
      currentPrice: currentPriceRef.current,
      onSetAlert: (price: number) => {
        useAlertsStore.getState().addAlert(symbol, price, currentPriceRef.current);
      },
    });
  }, [copyPrice, toggleGrid, resetView, showGrid, availableTemplates, handleLoadTemplate, openAdvancedSettings, contextMenu, symbol]);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${className || ''}`}
      style={{ backgroundColor: settings.colors.background }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor }}
      >
        {/* Group 1: Symbol & Price */}
        <div className="flex items-center gap-3 pr-3" style={{ borderRight: `1px solid ${settings.colors.gridColor}` }}>
          <div className="relative">
            <button
              onClick={() => setShowSymbolSelector(!showSymbolSelector)}
              className="flex items-center gap-2 text-sm font-bold rounded px-3 py-1.5 border focus:outline-none hover:brightness-110 transition-all"
              style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
            >
              <span>{selectedSymbolLabel}</span>
              <span style={{ color: settings.colors.textMuted }}>▼</span>
            </button>

            {/* Symbol Selector Modal */}
            {showSymbolSelector && (
              <div
                className="absolute top-full left-0 mt-1 w-96 rounded-lg shadow-2xl z-50 max-h-[450px] overflow-hidden"
                style={{ backgroundColor: settings.colors.surface, border: `1px solid ${settings.colors.gridColor}` }}
              >
                {/* Asset Category Tabs */}
                <div className="flex items-center gap-0.5 p-1.5 border-b overflow-x-auto" style={{ borderColor: settings.colors.gridColor }}>
                  {FOOTPRINT_ASSET_CATEGORIES.map((cat) => {
                    const IconComponent = cat.Icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setAssetCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-all duration-300 ease-out ${assetCategory === cat.id ? 'scale-105 shadow-lg' : 'hover:scale-102 active:scale-95'}`}
                        style={{
                          backgroundColor: assetCategory === cat.id ? settings.colors.currentPriceColor : 'transparent',
                          color: assetCategory === cat.id ? '#fff' : settings.colors.textSecondary,
                          boxShadow: assetCategory === cat.id ? `0 0 10px ${settings.colors.currentPriceColor}40` : 'none',
                        }}
                      >
                        <span className={`transition-transform duration-200 ${assetCategory === cat.id ? 'scale-110' : ''}`}>
                          <IconComponent size={16} color={assetCategory === cat.id ? '#fff' : undefined} />
                        </span>
                        <span className="font-medium">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Search Input */}
                <div className="p-2 border-b" style={{ borderColor: settings.colors.gridColor }}>
                  <input
                    type="text"
                    value={symbolSearchQuery}
                    onChange={(e) => setSymbolSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowSymbolSelector(false); setSymbolSearchQuery(''); } }}
                    placeholder={`Search ${assetCategory} symbols...`}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                    style={{ backgroundColor: settings.colors.background, color: settings.colors.textPrimary, border: `1px solid ${settings.colors.gridColor}` }}
                  />
                </div>

                {/* Note for futures */}
                {assetCategory === 'futures' && (
                  <div className="px-3 py-2 text-xs border-b" style={{ borderColor: settings.colors.gridColor, color: settings.colors.textSecondary }}>
                    CME Futures via dxFeed. Connect Interactive Brokers in settings for real-time data.
                  </div>
                )}

                {/* Categories */}
                <div className="overflow-y-auto max-h-64">
                  {Object.keys(filteredSymbols).length === 0 && symbolSearchQuery.trim() && (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={settings.colors.textMuted} strokeWidth="1.5" opacity="0.4">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <span className="text-xs" style={{ color: settings.colors.textMuted }}>
                        No symbols match &ldquo;{symbolSearchQuery}&rdquo;
                      </span>
                    </div>
                  )}
                  {Object.entries(filteredSymbols).map(([category, symbols]) => (
                    <div key={category}>
                      <div className="px-3 py-1.5 text-xs font-semibold sticky top-0" style={{ backgroundColor: settings.colors.surface, color: settings.colors.textMuted }}>
                        {category}
                      </div>
                      <div className="grid grid-cols-2 gap-0.5 px-1 pb-1">
                        {symbols.map(s => (
                          <button
                            key={s.value}
                            onClick={() => { handleSymbolChange(s.value); setShowSymbolSelector(false); setSymbolSearchQuery(''); }}
                            className="text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between"
                            style={{
                              backgroundColor: symbol === s.value ? settings.colors.currentPriceColor : 'transparent',
                              color: symbol === s.value ? '#fff' : settings.colors.textPrimary,
                            }}
                          >
                            <span>{s.label}</span>
                            {s.exchange && <span className="text-[10px]" style={{ color: settings.colors.textMuted }}>{s.exchange}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Backdrop to close modal */}
            {showSymbolSelector && (
              <div className="fixed inset-0 z-40" onClick={() => { setShowSymbolSelector(false); setSymbolSearchQuery(''); }} />
            )}
          </div>

          {/* Exchange badge */}
          <span
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{
              backgroundColor: SYMBOL_EXCHANGE[symbol] === 'binance' ? 'rgba(247, 147, 26, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              color: SYMBOL_EXCHANGE[symbol] === 'binance' ? '#f7931a' : '#3b82f6',
            }}
          >
            {SYMBOL_EXCHANGE[symbol] === 'binance' ? 'Binance' : getCMEAdapterLabel()}
          </span>

          <span ref={priceRef} className="text-xl font-mono font-bold" style={{ color: settings.colors.textPrimary }}>
            {SYMBOL_EXCHANGE[symbol] === 'cme' ? '' : '$'}0.00
          </span>
          <span className="text-xs" style={{ color: settings.colors.textMuted }}>
            Delta: <span ref={deltaRef} style={{ color: settings.colors.deltaPositive }}>+0</span>
          </span>
        </div>

        {/* Group 2: Timeframes (tick-based + time-based) */}
        <div className="flex items-center gap-1 px-3" style={{ borderRight: `1px solid ${settings.colors.gridColor}` }}>
          {/* Tick-based timeframes */}
          <div className="flex items-center rounded p-0.5 mr-1" style={{ backgroundColor: settings.colors.background }}>
            {TICK_TIMEFRAMES.map((tf) => {
              const isActive = aggregationMode === 'tick' && tickBarSize === tf;
              return (
                <button
                  key={`tick-${tf}`}
                  onClick={() => { setAggregationMode('tick'); setTickBarSize(tf); }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${isActive ? '' : 'hover:scale-105 active:scale-95 hover:bg-white/5'}`}
                  style={{
                    backgroundColor: isActive ? settings.colors.currentPriceColor : 'transparent',
                    color: isActive ? '#fff' : settings.colors.textSecondary,
                  }}
                >
                  {TICK_TF_LABELS[tf]}
                </button>
              );
            })}
          </div>
          {/* Time-based timeframes */}
          {Object.entries({ seconds: TF_GROUPS.seconds, minutes: TF_GROUPS.minutes }).map(([group, tfs]) => (
            <div key={group} className="flex items-center rounded p-0.5 mr-1" style={{ backgroundColor: settings.colors.background }}>
              {tfs.map((tf) => {
                const isActive = aggregationMode === 'time' && timeframe === tf;
                return (
                  <button
                    key={tf}
                    onClick={() => { setAggregationMode('time'); handleTimeframeChange(tf as TimeframeSeconds); }}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${isActive ? '' : 'hover:scale-105 active:scale-95 hover:bg-white/5'}`}
                    style={{
                      backgroundColor: isActive ? settings.colors.currentPriceColor : 'transparent',
                      color: isActive ? '#fff' : settings.colors.textSecondary,
                    }}
                  >
                    {TIMEFRAME_LABELS[tf as TimeframeSeconds]}
                  </button>
                );
              })}
            </div>
          ))}
          {aggregationMode === 'time' && <PriceCountdownCompact timeframeSeconds={timeframe} />}
        </div>

        {/* Group 3: Controls */}
        <div className="flex items-center gap-2 pl-3 ml-auto">
          {/* Magnet Toggle */}
          <FootprintMagnetToggle colors={settings.colors} />

          {/* Tick Size */}
          <select
            value={tickSize}
            onChange={(e) => setTickSize(Number(e.target.value))}
            className="text-xs rounded px-2 py-1 border"
            style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
          >
            {availableTickSizes.map(ts => (
              <option key={ts} value={ts}>${ts}</option>
            ))}
          </select>

          {/* Timezone Selector */}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value as TimezoneId)}
            className="text-xs rounded px-2 py-1 border"
            style={{ backgroundColor: settings.colors.background, borderColor: settings.colors.gridColor, color: settings.colors.textPrimary }}
            title="Timezone"
          >
            {(Object.keys(TIMEZONES) as TimezoneId[]).map(tz => (
              <option key={tz} value={tz}>{TIMEZONES[tz].label}</option>
            ))}
          </select>

          {/* Layout Manager */}
          <button
            onClick={() => setShowLayoutManager(!showLayoutManager)}
            className="px-2 py-1.5 rounded text-xs border flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showLayoutManager ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showLayoutManager ? '#fff' : settings.colors.textSecondary,
            }}
            title="Layouts"
          >
            <LayoutIcon size={16} color={showLayoutManager ? '#fff' : settings.colors.textSecondary} />
          </button>

          {/* Orderbook Mode Toggle */}
          {settings.features.showPassiveLiquidity && settings.passiveLiquidity.enabled && (
            <button
              onClick={() => {
                const newValue = !settings.passiveLiquidity.useRealOrderbook;
                settings.setPassiveLiquidity({ useRealOrderbook: newValue });
                const ws = getBinanceLiveWS();
                ws.changeSymbol(symbol);
              }}
              className="px-2 py-1 rounded text-xs border flex items-center gap-1.5 transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: settings.passiveLiquidity.useRealOrderbook
                  ? 'rgba(34, 197, 94, 0.2)'
                  : settings.colors.background,
                borderColor: settings.passiveLiquidity.useRealOrderbook
                  ? '#22c55e'
                  : settings.colors.gridColor,
                color: settings.passiveLiquidity.useRealOrderbook
                  ? '#22c55e'
                  : settings.colors.textSecondary,
              }}
              title={settings.passiveLiquidity.useRealOrderbook
                ? 'Using REAL Binance orderbook - Click to switch to simulation'
                : 'Using SIMULATION - Click to switch to real orderbook'}
            >
              <span className="text-[10px] font-mono">
                {settings.passiveLiquidity.useRealOrderbook ? 'LIVE' : 'SIM'}
              </span>
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: settings.passiveLiquidity.useRealOrderbook ? '#22c55e' : '#6b7280',
                }}
              />
            </button>
          )}

          {/* Replay Mode Toggle */}
          <button
            onClick={() => replayActive ? handleReplayExit() : handleReplayEnter()}
            className="px-2 py-1.5 rounded text-xs border flex items-center gap-1.5 transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: replayActive ? 'rgba(245, 158, 11, 0.2)' : settings.colors.background,
              borderColor: replayActive ? 'rgba(245, 158, 11, 0.4)' : settings.colors.gridColor,
              color: replayActive ? '#f59e0b' : settings.colors.textSecondary,
            }}
            title="Replay Mode (Shift+R)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polygon points="5,3 19,12 5,21" fill={replayActive ? 'currentColor' : 'none'} />
            </svg>
            <span className="text-[10px] font-semibold">REPLAY</span>
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className="px-2 py-1.5 rounded text-xs border flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showAdvancedSettings ? settings.colors.currentPriceColor : settings.colors.background,
              borderColor: settings.colors.gridColor,
              color: showAdvancedSettings ? '#fff' : settings.colors.textSecondary,
            }}
            title="Advanced Settings"
          >
            <SettingsIcon size={16} color={showAdvancedSettings ? '#fff' : settings.colors.textSecondary} />
          </button>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div ref={statusDotRef} className="w-2 h-2 rounded-full" style={{ backgroundColor: settings.colors.textMuted }} />
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Vertical Toolbar — TradingView-style */}
        <VerticalToolbar
          activeTool={activeTool}
          onToolSelect={handleToolSelect}
          onDeleteSelected={() => {
            const toolsEngine = getToolsEngine();
            toolsEngine.deleteSelected();
            setSelectedTool(null);
          }}
          hasSelectedTool={selectedTool !== null}
        />

        {/* Chart column: InlineToolSettings + Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Inline settings bar — visible when a tool is selected on chart */}
          <InlineToolSettings
            selectedTool={selectedTool}
            onOpenAdvanced={(tool) => {
              if (toolPosition) {
                setToolSettingsModalPosition({
                  x: Math.max(50, Math.min(window.innerWidth - 400, toolPosition.x + 20)),
                  y: Math.max(50, Math.min(window.innerHeight - 400, toolPosition.y + 20)),
                });
              }
              setShowToolSettings(true);
            }}
          />

          {/* Chart */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          style={{ cursor: activeTool === 'crosshair' ? 'crosshair' : 'default' }}
        >
          <canvas ref={canvasRef} className="w-full h-full" />

          {/* Zoom Controls */}
          <FootprintZoomControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
            colors={{ surface: settings.colors.surface, gridColor: settings.colors.gridColor, textSecondary: settings.colors.textSecondary }}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${settings.colors.background}ee` }}>
              <div className="flex flex-col items-center gap-3 p-6 rounded-lg" style={{ backgroundColor: settings.colors.surface }}>
                <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: settings.colors.currentPriceColor }} />
                <div className="text-center">
                  <div className="text-sm font-medium mb-1" style={{ color: settings.colors.textPrimary }}>
                    Loading Session...
                  </div>
                  <div className="text-xs mb-2" style={{ color: settings.colors.textSecondary }}>
                    {loadingMessage || 'Initializing...'}
                  </div>
                  {loadingProgress > 0 && (
                    <div className="w-48 h-2 rounded-full overflow-hidden" style={{ backgroundColor: settings.colors.background }}>
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${loadingProgress}%`,
                          backgroundColor: settings.colors.currentPriceColor,
                        }}
                      />
                    </div>
                  )}
                  <div className="text-xs mt-1" style={{ color: settings.colors.textMuted }}>
                    {loadingProgress.toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Refreshing badge — shown while tick data loads after cache/skeleton display */}
          {isRefreshing && !isLoading && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px]"
              style={{ backgroundColor: settings.colors.surface, color: settings.colors.textSecondary, border: `1px solid ${settings.colors.gridColor}` }}>
              <div className="w-2.5 h-2.5 border border-t-transparent rounded-full animate-spin"
                style={{ borderColor: settings.colors.currentPriceColor }} />
              {loadingMessage}
            </div>
          )}

          {/* Error Banner */}
          {loadError && !isLoading && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-lg border border-red-500/30 bg-red-950/90 backdrop-blur-sm shadow-lg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-xs text-red-300">{loadError}</span>
              <button
                onClick={() => {
                  setLoadError(null);
                  loadHistory(symbol, timeframe).then(candles => {
                    if (candles.length > 0) candlesRef.current = candles;
                  });
                }}
                className="px-2 py-0.5 text-[10px] font-medium text-red-300 border border-red-500/40 rounded hover:bg-red-500/20 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => setLoadError(null)}
                className="text-red-500 hover:text-red-300 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Replay Controls */}
          {replayActive && (
            <FootprintReplayControls
              state={replayState}
              onPlay={handleReplayPlay}
              onPause={handleReplayPause}
              onNext={handleReplayNext}
              onPrev={handleReplayPrev}
              onStart={handleReplayStart}
              onEnd={handleReplayEnd}
              onSeek={handleReplaySeek}
              onSpeedChange={handleReplaySpeedChange}
              onExit={handleReplayExit}
              candleTime={replayState.totalCandles > 0 && replayState.currentIndex < replayState.totalCandles
                ? replayStateRef.current.allCandles[replayState.currentIndex]?.time
                : undefined
              }
            />
          )}
        </div>

        {/* Advanced Tool Settings Modal (Floating, Draggable) */}
        {showToolSettings && selectedTool && (
          <AdvancedToolSettingsModal
            isOpen={showToolSettings}
            onClose={() => setShowToolSettings(false)}
            activeTool={selectedTool.type}
            selectedTool={selectedTool}
            initialPosition={toolSettingsModalPosition}
            theme={{
              colors: {
                surface: settings.colors.surface,
                border: settings.colors.gridColor,
                text: settings.colors.textPrimary,
                textSecondary: settings.colors.textSecondary,
                textMuted: settings.colors.textMuted,
                toolActive: settings.colors.deltaPositive,
                background: settings.colors.background,
              },
            }}
          />
        )}

        {/* Inline Text Editor (appears on double-click on text tool) */}
        {textEditorState && (
          <InlineTextEditor
            isOpen={textEditorState.isOpen}
            initialContent={textEditorState.content}
            position={textEditorState.position}
            onSave={handleTextEditorSave}
            onCancel={handleTextEditorCancel}
            style={textEditorState.style}
          />
        )}

        {/* Layout Manager Panel */}
        {showLayoutManager && (
          <div className="w-64 border-l overflow-hidden flex-shrink-0" style={{ borderColor: settings.colors.gridColor }}>
            <LayoutManagerPanel
              currentChart={{ symbol, timeframe, tickSize }}
              currentColors={settings.colors}
              currentFonts={settings.fonts}
              currentFeatures={settings.features}
              currentImbalance={settings.imbalance}
              currentLayout={{
                footprintWidth: settings.footprintWidth,
                rowHeight: settings.rowHeight,
                maxVisibleFootprints: settings.maxVisibleFootprints,
                deltaProfilePosition: settings.deltaProfilePosition,
              }}
              onLoadLayout={handleLoadLayout}
              colors={settings.colors}
              onClose={() => setShowLayoutManager(false)}
            />
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="w-64 border-l p-3 overflow-y-auto flex-shrink-0" style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: settings.colors.textPrimary }}>Settings</h3>

            {/* Presets */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Theme</label>
              <div className="flex flex-wrap gap-1">
                {Object.keys(COLOR_PRESETS).map(preset => (
                  <button
                    key={preset}
                    onClick={() => settings.setColors(COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS])}
                    className="px-2 py-1 rounded text-xs capitalize"
                    style={{ backgroundColor: settings.colors.background, color: settings.colors.textSecondary }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Features */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Features</label>
              {Object.entries(settings.features).map(([key, value]) => (
                <label key={key} className="flex items-center gap-2 mb-1 text-xs cursor-pointer" style={{ color: settings.colors.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => settings.setFeatures({ [key]: e.target.checked })}
                  />
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                </label>
              ))}
            </div>

            {/* Imbalance */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Imbalance Ratio</label>
              <select
                value={settings.imbalance.ratio}
                onChange={(e) => settings.setImbalance({ ratio: Number(e.target.value) })}
                className="w-full text-xs rounded px-2 py-1"
                style={{ backgroundColor: settings.colors.background, color: settings.colors.textPrimary }}
              >
                <option value={2}>200%</option>
                <option value={3}>300%</option>
                <option value={4}>400%</option>
                <option value={5}>500%</option>
              </select>
            </div>

            {/* Layout */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Row Height: {settings.rowHeight}px</label>
              <input
                type="range"
                min={12}
                max={28}
                value={settings.rowHeight}
                onChange={(e) => settings.setLayout({ rowHeight: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Container Opacity */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>
                Container Opacity: {Math.round((settings.colors.footprintContainerOpacity ?? 0.03) * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={20}
                value={(settings.colors.footprintContainerOpacity ?? 0.03) * 100}
                onChange={(e) => settings.setColors({ footprintContainerOpacity: Number(e.target.value) / 100 })}
                className="w-full"
              />
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* COLOR CUSTOMIZATION */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            {/* Background Color */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: settings.colors.textMuted }}>Background Color</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {['#0c0c0c', '#000000', '#0a0e14', '#0d1117', '#1a1a2e', '#16213e', '#1e3a5f', '#ffffff', '#f8f9fa'].map(color => (
                  <button
                    key={color}
                    onClick={() => settings.setColors({ background: color })}
                    className="w-6 h-6 rounded border-2"
                    style={{
                      backgroundColor: color,
                      borderColor: settings.colors.background === color ? settings.colors.currentPriceColor : 'transparent',
                    }}
                    title={color}
                  />
                ))}
              </div>
              <InlineColorSwatch
                value={settings.colors.background}
                onChange={(c) => settings.setColors({ background: c })}
              />
            </div>

            {/* Bullish Candle Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Bullish Candle</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Body</span>
                  <div className="flex gap-1 flex-1">
                    {['#26a69a', '#00c853', '#00bfa5', '#3fb950', '#198754', '#22c55e'].map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleUpBody: color })}
                        className="w-5 h-5 rounded border"
                        style={{
                          backgroundColor: color,
                          borderColor: settings.colors.candleUpBody === color ? '#fff' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <InlineColorSwatch
                    value={settings.colors.candleUpBody}
                    onChange={(c) => settings.setColors({ candleUpBody: c })}
                    size={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Border</span>
                  <InlineColorSwatch
                    value={settings.colors.candleUpBorder}
                    onChange={(c) => settings.setColors({ candleUpBorder: c })}
                    size={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Wick</span>
                  <InlineColorSwatch
                    value={settings.colors.candleUpWick}
                    onChange={(c) => settings.setColors({ candleUpWick: c })}
                    size={5}
                  />
                </div>
              </div>
            </div>

            {/* Bearish Candle Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Bearish Candle</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Body</span>
                  <div className="flex gap-1 flex-1">
                    {['#ef5350', '#ff1744', '#ff5252', '#f85149', '#dc3545', '#ef4444'].map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleDownBody: color })}
                        className="w-5 h-5 rounded border"
                        style={{
                          backgroundColor: color,
                          borderColor: settings.colors.candleDownBody === color ? '#fff' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <InlineColorSwatch
                    value={settings.colors.candleDownBody}
                    onChange={(c) => settings.setColors({ candleDownBody: c })}
                    size={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Border</span>
                  <InlineColorSwatch
                    value={settings.colors.candleDownBorder}
                    onChange={(c) => settings.setColors({ candleDownBorder: c })}
                    size={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Wick</span>
                  <InlineColorSwatch
                    value={settings.colors.candleDownWick}
                    onChange={(c) => settings.setColors({ candleDownWick: c })}
                    size={5}
                  />
                </div>
              </div>
            </div>

            {/* Grid & Surface Colors */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: settings.colors.textMuted }}>Grid & Surface</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Grid</span>
                  <InlineColorSwatch
                    value={settings.colors.gridColor}
                    onChange={(c) => settings.setColors({ gridColor: c })}
                    size={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-12" style={{ color: settings.colors.textSecondary }}>Surface</span>
                  <InlineColorSwatch
                    value={settings.colors.surface}
                    onChange={(c) => settings.setColors({ surface: c })}
                    size={5}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={settings.resetToDefaults}
              className="w-full py-2 rounded text-xs"
              style={{ backgroundColor: settings.colors.deltaNegative, color: '#fff' }}
            >
              Reset to Defaults
            </button>
          </div>
        )}
        </div>{/* close chart column */}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 py-1 text-xs border-t flex-shrink-0"
        style={{ backgroundColor: settings.colors.surface, borderColor: settings.colors.gridColor, color: settings.colors.textMuted }}
      >
        <span>
          {SYMBOL_EXCHANGE[symbol] === 'binance' ? 'Binance' : 'CME'} • {symbol.toUpperCase()} • Footprint {aggregationMode === 'tick' ? `${tickBarSize}T` : TIMEFRAME_LABELS[timeframe]} • Tick {SYMBOL_EXCHANGE[symbol] === 'binance' ? '$' : ''}{tickSize}
        </span>
        <span className="flex items-center gap-3">
          {/* Zoom level indicator */}
          {layoutEngineRef.current && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{
              backgroundColor: settings.colors.gridColor,
              color: settings.colors.textPrimary
            }}>
              Y-Zoom: {layoutEngineRef.current.getZoomY().toFixed(1)}x • {layoutEngineRef.current.getZoomLevelDescription()}
            </span>
          )}
          <span>Drag: Pan | Scroll: Zoom | Double-click: Reset | Del: Remove tool</span>
        </span>
        <span style={{
          color: status === 'connected'
            ? settings.colors.deltaPositive
            : status === 'connecting'
              ? '#eab308'
              : settings.colors.textMuted
        }}>
          {status === 'connected'
            ? `● Live${SYMBOL_EXCHANGE[symbol] === 'cme' ? ' (CME)' : ''}`
            : status === 'connecting'
              ? '◐ Connecting...'
              : '○ Offline'
          }
        </span>
      </div>

      {/* Chart Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={closeContextMenu}
          theme="senzoukria"
        />
      )}

      {/* Tool Context Menu */}
      {toolContextMenu && (
        <ContextMenu
          x={toolContextMenu.x}
          y={toolContextMenu.y}
          items={createToolContextMenuItems(
            toolContextMenu.tool,
            getToolsEngine(),
            () => setToolContextMenu(null),
            () => { /* re-render handled by animation loop */ }
          )}
          onClose={() => setToolContextMenu(null)}
          theme="senzoukria"
        />
      )}

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        onSave={handleSaveTemplate}
      />

      {/* Advanced Settings Modal */}
      <FootprintAdvancedSettings
        isOpen={showAdvancedSettings}
        onClose={() => setShowAdvancedSettings(false)}
        initialPosition={advancedSettingsPosition}
      />

      {/* Tool settings are now handled by InlineToolSettings in the chart column */}
    </div>
  );
});

export default FootprintChartPro;

function formatVol(vol: number): string {
  const abs = Math.abs(vol);
  if (abs >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  if (abs >= 100) return Math.round(vol).toString();
  if (abs >= 10) return vol.toFixed(1);
  return vol.toFixed(2);
}

// formatVolATAS and formatVolCluster are now in FootprintCanvasRenderer
