'use client';

import { useChartToolsStore } from '@/stores/useChartToolsStore';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';
import type { DrawingTool } from '@/types/charts';

const TOOLS: { id: DrawingTool; icon: string; label: string }[] = [
  { id: 'cursor', icon: '↖', label: 'Cursor' },
  { id: 'trendline', icon: '╱', label: 'Trend Line' },
  { id: 'horizontalLine', icon: '─', label: 'Horizontal Line' },
  { id: 'rectangle', icon: '▢', label: 'Rectangle' },
  { id: 'fibonacci', icon: '⏛', label: 'Fibonacci' },
];

interface DrawingToolbarProps {
  onClearAll?: () => void;
}

export default function DrawingToolbar({ onClearAll }: DrawingToolbarProps) {
  const {
    activeTool,
    defaultStyle,
    setActiveTool,
    setDefaultStyle,
  } = useChartToolsStore();

  return (
    <div className="flex items-center gap-1 backdrop-blur rounded-lg p-1.5 shadow-lg" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Drawing Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className="w-8 h-8 flex items-center justify-center rounded text-lg transition-all active:scale-90"
            style={{
              backgroundColor: activeTool === tool.id ? 'var(--primary)' : undefined,
              color: activeTool === tool.id ? '#fff' : 'var(--text-muted)',
            }}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border)' }} />

      {/* Color Picker */}
      <InlineColorSwatch
        value={defaultStyle.color}
        onChange={(color) => setDefaultStyle({ color })}
        size={5}
      />

      {/* Separator */}
      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border)' }} />

      {/* Line Width */}
      <select
        value={defaultStyle.lineWidth}
        onChange={(e) => setDefaultStyle({ lineWidth: Number(e.target.value) })}
        className="text-xs rounded px-2 py-1 transition-colors focus:outline-none"
        style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        title="Line Width"
      >
        <option value={1}>1px</option>
        <option value={2}>2px</option>
        <option value={3}>3px</option>
        <option value={4}>4px</option>
      </select>

      {/* Line Style */}
      <select
        value={defaultStyle.lineStyle}
        onChange={(e) => setDefaultStyle({ lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
        className="text-xs rounded px-2 py-1 transition-colors focus:outline-none"
        style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        title="Line Style"
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>

      {/* Clear All */}
      {onClearAll && (
        <>
          <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border)' }} />
          <button
            onClick={onClearAll}
            className="px-2 py-1 text-xs rounded transition-all hover:bg-[var(--error)]/15 active:scale-95"
            style={{ color: 'var(--error)' }}
            title="Clear All Drawings"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
