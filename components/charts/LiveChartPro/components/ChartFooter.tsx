'use client';

import type { RefObject } from 'react';
import { TIMEFRAME_LABELS, type TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';
import type { ToolType } from '@/lib/live/DrawingTools';
import type { Tool } from '@/lib/tools/ToolsEngine';
import type { ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { isCMESymbol } from '@/lib/utils/symbolUtils';

function getExchangeLabel(symbol: string): string {
  if (isCMESymbol(symbol)) return 'CME';
  const upper = symbol.toUpperCase();
  if (upper.endsWith('USDT') || upper.endsWith('BUSD')) return 'Binance Futures';
  return 'Binance';
}

interface ChartFooterProps {
  timeframe: TimeframeSeconds;
  activeTool: ToolType;
  selectedTool: Tool | null;
  status: ConnectionStatus;
  symbol: string;
  volumeRef?: RefObject<HTMLSpanElement | null>;
  theme: {
    colors: {
      surface: string;
      border: string;
      textMuted: string;
      toolActive: string;
      success: string;
      error: string;
    };
  };
}

export default function ChartFooter({ timeframe, activeTool, selectedTool, status, symbol, volumeRef, theme }: ChartFooterProps) {
  return (
    <div
      className="flex items-center justify-between px-2 text-[10px] border-t"
      style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textMuted, height: 24 }}
    >
      <div className="flex items-center gap-3">
        <span className="font-medium">{getExchangeLabel(symbol)}</span>
        <span>{TIMEFRAME_LABELS[timeframe]}</span>
        {volumeRef && (
          <span className="font-mono tabular-nums">
            V <span ref={volumeRef}>--</span>
          </span>
        )}
        {activeTool !== 'cursor' && activeTool !== 'crosshair' && (
          <span style={{ color: theme.colors.toolActive }}>
            {activeTool}
          </span>
        )}
        {selectedTool && (
          <span style={{ color: theme.colors.success }}>
            {selectedTool.type}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <FooterImbalance theme={theme} />
        <span className="flex items-center gap-1" style={{ color: status === 'connected' ? theme.colors.success : theme.colors.textMuted }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status === 'connected' ? theme.colors.success : theme.colors.textMuted }} />
          {status === 'connected' ? 'Live' : 'Offline'}
        </span>
      </div>
    </div>
  );
}

function FooterImbalance({ theme }: { theme: { colors: { border: string; textMuted: string; success: string; error: string } } }) {
  const { bidAskImbalance, spread, midPrice } = useOrderbookStore();

  if (midPrice === 0) return null;

  const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;
  const imbalancePct = Math.round(bidAskImbalance * 100);
  const barWidth = Math.abs(imbalancePct);
  const isBullish = imbalancePct >= 0;

  return (
    <div className="flex items-center gap-3 text-[10px]">
      <span style={{ color: theme.colors.textMuted }}>
        Spread: <span className="font-mono">{spreadBps.toFixed(1)}bps</span>
      </span>
      <div className="flex items-center gap-1.5">
        <span style={{ color: theme.colors.textMuted }}>Imb</span>
        <div className="w-14 h-1.5 rounded-full overflow-hidden relative" style={{ backgroundColor: theme.colors.border }}>
          <div className="absolute inset-y-0 left-1/2 w-px" style={{ backgroundColor: theme.colors.border }} />
          <div
            className="absolute inset-y-0 rounded-full transition-all duration-300"
            style={{
              left: isBullish ? '50%' : undefined,
              right: !isBullish ? '50%' : undefined,
              width: `${Math.min(barWidth, 50)}%`,
              backgroundColor: isBullish ? theme.colors.success : theme.colors.error,
            }}
          />
        </div>
        <span
          className="font-mono w-8 text-right"
          style={{ color: isBullish ? theme.colors.success : theme.colors.error }}
        >
          {imbalancePct > 0 ? '+' : ''}{imbalancePct}%
        </span>
      </div>
    </div>
  );
}
