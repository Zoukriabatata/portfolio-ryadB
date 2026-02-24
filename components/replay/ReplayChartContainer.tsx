'use client';

import { useState, useCallback } from 'react';

interface ReplayChartContainerProps {
  symbol: string;
  children: React.ReactNode; // The heatmap/chart view
}

type ChartMode = 'heatmap' | 'footprint';
type OverlayTool = 'crosshair' | 'hline' | 'trendline' | 'rectangle' | 'measure' | null;

/**
 * ReplayChartContainer wraps the chart area with a mode toggle
 * and a toolbar for drawing tools. The actual chart rendering
 * is delegated to children (IBLiquidityView for heatmap mode).
 */
export default function ReplayChartContainer({ symbol, children }: ReplayChartContainerProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('heatmap');
  const [activeTool, setActiveTool] = useState<OverlayTool>(null);

  const tools: { id: OverlayTool; label: string; icon: string }[] = [
    { id: 'crosshair', label: 'Crosshair', icon: '+' },
    { id: 'hline', label: 'H-Line', icon: '―' },
    { id: 'trendline', label: 'Trend', icon: '/' },
    { id: 'rectangle', label: 'Rect', icon: '□' },
    { id: 'measure', label: 'Measure', icon: '⇔' },
  ];

  const toggleTool = useCallback((tool: OverlayTool) => {
    setActiveTool(prev => prev === tool ? null : tool);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Toolbar (top-left, absolute) */}
      <div className="absolute top-12 left-3 z-20 flex flex-col gap-1 animate-fadeIn">
        {/* Chart mode toggle */}
        <div className="flex rounded-lg overflow-hidden"
          style={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['heatmap', 'footprint'] as const).map(mode => (
            <button key={mode}
              onClick={() => setChartMode(mode)}
              className="px-2 py-1 text-[9px] font-medium capitalize transition-all"
              style={{
                background: chartMode === mode ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: chartMode === mode ? 'var(--primary)' : 'rgba(255,255,255,0.4)',
              }}>
              {mode}
            </button>
          ))}
        </div>

        {/* Drawing tools */}
        <div className="flex flex-col rounded-lg overflow-hidden"
          style={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {tools.map(tool => (
            <button key={tool.id}
              onClick={() => toggleTool(tool.id)}
              className="w-7 h-7 flex items-center justify-center text-[10px] transition-all"
              title={tool.label}
              style={{
                background: activeTool === tool.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: activeTool === tool.id ? 'var(--primary)' : 'rgba(255,255,255,0.35)',
              }}>
              {tool.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol + mode indicator */}
      <div className="absolute top-12 right-3 z-20 flex items-center gap-2 px-2 py-1 rounded-lg text-[10px]"
        style={{ background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="font-mono font-bold" style={{ color: 'var(--primary)' }}>{symbol}</span>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{chartMode}</span>
        {activeTool && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            <span style={{ color: 'var(--primary)' }}>{activeTool}</span>
          </>
        )}
      </div>

      {/* Chart content */}
      {children}
    </div>
  );
}
