'use client';

/**
 * INLINE TOOL SETTINGS BAR — TradingView-Style
 *
 * Horizontal bar displayed above the chart when a drawing tool is selected.
 * Shows: color, line width, line style, opacity + actions (lock, clone, hide, delete).
 * Not floating/draggable — fixed position in layout.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Tool,
  ToolStyle,
  LineStyle,
  getToolsEngine,
} from '@/lib/tools/ToolsEngine';
import {
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Settings2,
  ChevronDown,
  DollarSign,
} from 'lucide-react';

// Preset colors (TradingView-style palette)
const PRESET_COLORS = [
  '#2962FF', '#e91e63', '#ff9800', '#4caf50',
  '#00bcd4', '#9c27b0', '#ffeb3b', '#795548',
  '#ffffff', '#b2b5be', '#787b86', '#2a2e39',
];

const LINE_WIDTHS = [1, 2, 3, 4];

const LINE_STYLES: { value: LineStyle; label: string; svg: React.ReactNode }[] = [
  {
    value: 'solid', label: 'Solid',
    svg: <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" />,
  },
  {
    value: 'dashed', label: 'Dashed',
    svg: <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />,
  },
  {
    value: 'dotted', label: 'Dotted',
    svg: <line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeDasharray="1.5 2" />,
  },
];

interface InlineToolSettingsProps {
  selectedTool: Tool | null;
  onOpenAdvanced?: (tool: Tool) => void;
}

export default function InlineToolSettings({
  selectedTool,
  onOpenAdvanced,
}: InlineToolSettingsProps) {
  const [style, setStyle] = useState<ToolStyle | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync style with selected tool
  useEffect(() => {
    if (selectedTool) {
      setStyle({ ...selectedTool.style });
    } else {
      setStyle(null);
      setShowColorPicker(false);
      setShowWidthPicker(false);
      setShowStylePicker(false);
    }
  }, [selectedTool]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowWidthPicker(false);
        setShowStylePicker(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool || !style) return;
    const newStyle = { ...style, ...updates };
    setStyle(newStyle);
    getToolsEngine().updateTool(selectedTool.id, { style: newStyle });
  }, [selectedTool, style]);

  const handleDelete = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().deleteTool(selectedTool.id);
  }, [selectedTool]);

  const handleDuplicate = useCallback(() => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = selectedTool;
    const duplicated = { ...toolData };
    if ('price' in duplicated && typeof duplicated.price === 'number') {
      duplicated.price += 10;
    }
    const newTool = engine.addTool(duplicated as Omit<Tool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>);
    engine.selectTool(newTool.id);
  }, [selectedTool]);

  const handleToggleLock = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().updateTool(selectedTool.id, { locked: !selectedTool.locked });
  }, [selectedTool]);

  const handleToggleVisible = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().updateTool(selectedTool.id, { visible: !selectedTool.visible });
  }, [selectedTool]);

  if (!selectedTool || !style) return null;

  return (
    <div
      ref={barRef}
      className="flex items-center gap-0.5 h-8 px-1.5 border-b border-[var(--border)] bg-[var(--background)] flex-shrink-0 select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Tool type label */}
      <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider px-1.5 mr-1">
        {selectedTool.type.replace(/([A-Z])/g, ' $1').trim()}
      </span>

      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => { setShowColorPicker(!showColorPicker); setShowWidthPicker(false); setShowStylePicker(false); }}
          className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors"
          title="Line color"
        >
          <div
            className="w-4 h-4 rounded-sm border border-[var(--border)]"
            style={{ backgroundColor: style.color }}
          />
          <ChevronDown size={10} className="text-[var(--text-dimmed)]" />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 p-2 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50">
            <div className="grid grid-cols-4 gap-1">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => { updateStyle({ color }); setShowColorPicker(false); }}
                  className={`w-6 h-6 rounded-sm border transition-transform hover:scale-110 ${
                    style.color === color ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-[var(--border)]'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Line width */}
      <div className="relative">
        <button
          onClick={() => { setShowWidthPicker(!showWidthPicker); setShowColorPicker(false); setShowStylePicker(false); }}
          className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors"
          title="Line width"
        >
          <div className="flex items-center justify-center w-4 h-4">
            <div
              className="rounded-full"
              style={{
                width: Math.min(style.lineWidth * 2 + 2, 12),
                height: Math.min(style.lineWidth * 2 + 2, 12),
                backgroundColor: 'var(--text-secondary)',
              }}
            />
          </div>
          <ChevronDown size={10} className="text-[var(--text-dimmed)]" />
        </button>
        {showWidthPicker && (
          <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50">
            {LINE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => { updateStyle({ lineWidth: w }); setShowWidthPicker(false); }}
                className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left transition-colors ${
                  style.lineWidth === w ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'hover:bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="w-12 flex items-center">
                  <div className="w-full rounded-full" style={{ height: w, backgroundColor: 'currentColor' }} />
                </div>
                <span className="text-[10px] font-mono">{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Line style */}
      <div className="relative">
        <button
          onClick={() => { setShowStylePicker(!showStylePicker); setShowColorPicker(false); setShowWidthPicker(false); }}
          className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors"
          title="Line style"
        >
          <svg width="16" height="12" viewBox="0 0 20 12" className="text-[var(--text-secondary)]">
            {LINE_STYLES.find(s => s.value === style.lineStyle)?.svg}
          </svg>
          <ChevronDown size={10} className="text-[var(--text-dimmed)]" />
        </button>
        {showStylePicker && (
          <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50">
            {LINE_STYLES.map(ls => (
              <button
                key={ls.value}
                onClick={() => { updateStyle({ lineStyle: ls.value }); setShowStylePicker(false); }}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors ${
                  style.lineStyle === ls.value ? 'bg-[var(--primary)]/15 text-[var(--primary)]' : 'hover:bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                <svg width="28" height="12" viewBox="0 0 20 12">{ls.svg}</svg>
                <span className="text-[10px]">{ls.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Position sizing controls (Long/Short only) */}
      {(selectedTool.type === 'longPosition' || selectedTool.type === 'shortPosition') && (
        <>
          <div className="w-px h-4 bg-[var(--border)] mx-1" />
          {/* Account size */}
          <div className="flex items-center gap-0.5">
            <span className="text-[9px] text-[var(--text-dimmed)]">$</span>
            <input
              type="number"
              value={(selectedTool as any).accountSize || 10000}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 10000;
                getToolsEngine().updateTool(selectedTool.id, { accountSize: val } as any);
              }}
              className="w-14 h-5 text-[10px] font-mono rounded px-1 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              title="Account size ($)"
            />
          </div>
          {/* Risk % */}
          <select
            value={(selectedTool as any).riskPercent || 1}
            onChange={(e) => {
              getToolsEngine().updateTool(selectedTool.id, { riskPercent: parseFloat(e.target.value) } as any);
            }}
            className="h-5 text-[10px] font-mono rounded px-0.5 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer focus:outline-none"
            title="Risk %"
          >
            {[0.5, 1, 2, 3, 5].map(r => (
              <option key={r} value={r}>{r}%</option>
            ))}
          </select>
          {/* Leverage */}
          <select
            value={(selectedTool as any).leverage || 1}
            onChange={(e) => {
              getToolsEngine().updateTool(selectedTool.id, { leverage: parseFloat(e.target.value) } as any);
            }}
            className="h-5 text-[10px] font-mono rounded px-0.5 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer focus:outline-none"
            title="Leverage"
          >
            {[1, 2, 5, 10, 25, 50, 125].map(l => (
              <option key={l} value={l}>{l}x</option>
            ))}
          </select>
          {/* Dollar P&L toggle */}
          <button
            onClick={() => {
              const current = (selectedTool as any).showDollarPnL || false;
              getToolsEngine().updateTool(selectedTool.id, { showDollarPnL: !current } as any);
            }}
            className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
              (selectedTool as any).showDollarPnL ? 'text-green-400 bg-green-400/10' : 'text-[var(--text-muted)] hover:bg-[var(--surface)]'
            }`}
            title="Show Dollar P&L"
          >
            <DollarSign size={13} strokeWidth={1.5} />
          </button>
        </>
      )}

      <div className="w-px h-4 bg-[var(--border)] mx-1" />

      {/* Action buttons */}
      <button
        onClick={handleDuplicate}
        className="flex items-center justify-center w-6 h-6 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        title="Duplicate"
      >
        <Copy size={13} strokeWidth={1.5} />
      </button>

      <button
        onClick={handleToggleLock}
        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
          selectedTool.locked ? 'text-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
        }`}
        title={selectedTool.locked ? 'Unlock' : 'Lock'}
      >
        {selectedTool.locked ? <Lock size={13} strokeWidth={1.5} /> : <Unlock size={13} strokeWidth={1.5} />}
      </button>

      <button
        onClick={handleToggleVisible}
        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
          !selectedTool.visible ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
        }`}
        title={selectedTool.visible ? 'Hide' : 'Show'}
      >
        {selectedTool.visible ? <Eye size={13} strokeWidth={1.5} /> : <EyeOff size={13} strokeWidth={1.5} />}
      </button>

      <button
        onClick={handleDelete}
        className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:bg-red-500/15 hover:text-red-500 transition-colors"
        title="Delete (Del)"
      >
        <Trash2 size={13} strokeWidth={1.5} />
      </button>

      {/* Advanced settings */}
      {onOpenAdvanced && (
        <>
          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
          <button
            onClick={() => onOpenAdvanced(selectedTool)}
            className="flex items-center justify-center w-6 h-6 rounded text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)] transition-colors"
            title="Advanced settings"
          >
            <Settings2 size={13} strokeWidth={1.5} />
          </button>
        </>
      )}
    </div>
  );
}
