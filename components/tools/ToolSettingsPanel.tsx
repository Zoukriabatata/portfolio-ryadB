'use client';

/**
 * TOOL SETTINGS PANEL
 *
 * Panneau de configuration pour l'outil sélectionné
 * Professional style with:
 * - Couleur
 * - Épaisseur
 * - Opacité
 * - Style de ligne
 * - Texte attaché
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Tool,
  ToolStyle,
  LineStyle,
  getToolsEngine,
} from '@/lib/tools/ToolsEngine';
import { ColorPicker } from '@/components/tools/ColorPicker';

/** Inline color swatch with unified picker popover */
function InlineColorSwatch({ value, onChange, size = 6 }: {
  value: string;
  onChange: (color: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all"
        style={{
          width: size * 4,
          height: size * 4,
          backgroundColor: value,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 right-0 p-3 rounded-xl shadow-2xl"
          style={{
            backgroundColor: 'rgba(20, 20, 28, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            minWidth: 220,
          }}
        >
          <ColorPicker value={value} onChange={onChange} label="" />
        </div>
      )}
    </div>
  );
}

interface ToolSettingsPanelProps {
  selectedTool: Tool | null;
  colors: {
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridColor: string;
    deltaPositive: string;
    deltaNegative: string;
  };
  onClose?: () => void;
}

// Preset colors
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#ffffff', // white
  '#71717a', // gray
];

// Line widths
const LINE_WIDTHS = [1, 2, 3, 4, 5];

// Line styles
const LINE_STYLES: { value: LineStyle; label: string; preview: string }[] = [
  { value: 'solid', label: 'Solid', preview: '━━━━━' },
  { value: 'dashed', label: 'Dashed', preview: '━ ━ ━' },
  { value: 'dotted', label: 'Dotted', preview: '• • • •' },
];

export default function ToolSettingsPanel({
  selectedTool,
  colors,
  onClose,
}: ToolSettingsPanelProps) {
  // Read style directly from selectedTool — single source of truth (no local state)
  const style = selectedTool?.style ?? null;

  // Extend flags read directly from tool
  const showExtend = selectedTool?.type === 'trendline'
    ? { left: selectedTool.extendLeft, right: selectedTool.extendRight }
    : { left: false, right: false };

  /**
   * Update style on ALL selected tools (multi-edit safe, undo-safe)
   */
  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool) return;
    getToolsEngine().updateSelectedToolsStyle(updates);
  }, [selectedTool]);

  /**
   * Update tool property (non-style — e.g. extend, visibility)
   */
  const updateProperty = useCallback((updates: Partial<Tool>) => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    for (const tool of engine.getSelectedTools()) {
      engine.updateTool(tool.id, updates);
    }
  }, [selectedTool]);

  /**
   * Delete tool
   */
  const handleDelete = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().deleteTool(selectedTool.id);
    onClose?.();
  }, [selectedTool, onClose]);

  /**
   * Lock/Unlock tool
   */
  const handleToggleLock = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().updateTool(selectedTool.id, { locked: !selectedTool.locked });
  }, [selectedTool]);

  /**
   * Duplicate tool
   */
  const handleDuplicate = useCallback(() => {
    if (!selectedTool) return;

    const engine = getToolsEngine();
    const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = selectedTool;

    // Offset the duplicate slightly
    const offsetPrice = 10;
    const duplicateData = { ...toolData };

    if ('price' in duplicateData && typeof duplicateData.price === 'number') {
      duplicateData.price += offsetPrice;
    }
    if ('entry' in duplicateData && 'stopLoss' in duplicateData && 'takeProfit' in duplicateData) {
      if (typeof duplicateData.entry === 'number') {
        (duplicateData as Record<string, unknown>).entry = duplicateData.entry + offsetPrice;
      }
      if (typeof duplicateData.stopLoss === 'number') {
        (duplicateData as Record<string, unknown>).stopLoss = duplicateData.stopLoss + offsetPrice;
      }
      if (typeof duplicateData.takeProfit === 'number') {
        (duplicateData as Record<string, unknown>).takeProfit = duplicateData.takeProfit + offsetPrice;
      }
    }

    const newTool = engine.addTool(duplicateData as Omit<Tool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>);
    engine.selectTool(newTool.id);
  }, [selectedTool]);

  if (!selectedTool || !style) {
    return (
      <div
        className="p-4 text-center"
        style={{ backgroundColor: colors.surface, color: colors.textMuted }}
      >
        <p className="text-sm">Select a tool to edit its properties</p>
      </div>
    );
  }

  const toolTypeLabel = getToolTypeLabel(selectedTool.type);

  return (
    <div
      className="p-3 space-y-4 overflow-y-auto"
      style={{ backgroundColor: colors.surface }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getToolIcon(selectedTool.type)}</span>
          <span className="font-medium text-sm" style={{ color: colors.textPrimary }}>
            {toolTypeLabel}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            style={{ color: colors.textMuted }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Color */}
      <div>
        <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
          Color
        </label>
        <div className="grid grid-cols-8 gap-1">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              onClick={() => updateStyle({ color })}
              className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
              style={{
                backgroundColor: color,
                borderColor: style.color === color ? '#fff' : 'transparent',
              }}
            />
          ))}
        </div>
        {/* Custom color input */}
        <div className="mt-2 flex items-center gap-2">
          <InlineColorSwatch
            value={style.color}
            onChange={(c) => updateStyle({ color: c })}
          />
          <input
            type="text"
            value={style.color}
            onChange={(e) => updateStyle({ color: e.target.value })}
            className="flex-1 px-2 py-1 rounded text-xs font-mono"
            style={{
              backgroundColor: colors.background,
              color: colors.textPrimary,
              border: `1px solid ${colors.gridColor}`,
            }}
          />
        </div>
      </div>

      {/* Line Width */}
      <div>
        <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
          Line Width: {style.lineWidth}px
        </label>
        <div className="flex items-center gap-1">
          {LINE_WIDTHS.map(width => (
            <button
              key={width}
              onClick={() => updateStyle({ lineWidth: width })}
              className="flex-1 py-2 rounded text-xs transition-colors"
              style={{
                backgroundColor: style.lineWidth === width ? colors.textPrimary : colors.background,
                color: style.lineWidth === width ? colors.background : colors.textSecondary,
              }}
            >
              {width}
            </button>
          ))}
        </div>
      </div>

      {/* Line Style */}
      <div>
        <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
          Line Style
        </label>
        <div className="flex flex-col gap-1">
          {LINE_STYLES.map(({ value, label, preview }) => (
            <button
              key={value}
              onClick={() => updateStyle({ lineStyle: value })}
              className="flex items-center justify-between px-3 py-2 rounded text-xs transition-colors"
              style={{
                backgroundColor: style.lineStyle === value ? colors.textPrimary : colors.background,
                color: style.lineStyle === value ? colors.background : colors.textSecondary,
              }}
            >
              <span>{label}</span>
              <span className="font-mono opacity-60">{preview}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fill (for rectangles and positions) */}
      {(selectedTool.type === 'rectangle' || selectedTool.type === 'longPosition' || selectedTool.type === 'shortPosition') && (
        <div>
          <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
            Fill Opacity: {Math.round((style.fillOpacity || 0) * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={(style.fillOpacity || 0) * 100}
            onChange={(e) => updateStyle({ fillOpacity: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </div>
      )}

      {/* Extend options for trendline */}
      {selectedTool.type === 'trendline' && (
        <div>
          <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
            Extend Line
          </label>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
              <input
                type="checkbox"
                checked={showExtend.left}
                onChange={(e) => {
                  updateProperty({ extendLeft: e.target.checked } as Partial<Tool>);
                }}
              />
              Left
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
              <input
                type="checkbox"
                checked={showExtend.right}
                onChange={(e) => {
                  updateProperty({ extendRight: e.target.checked } as Partial<Tool>);
                }}
              />
              Right
            </label>
          </div>
        </div>
      )}

      {/* Position details */}
      {(selectedTool.type === 'longPosition' || selectedTool.type === 'shortPosition') && (
        <div className="space-y-2">
          <label className="text-xs block" style={{ color: colors.textMuted }}>
            Position Details
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div
              className="p-2 rounded"
              style={{ backgroundColor: colors.background }}
            >
              <div style={{ color: colors.textMuted }}>Entry</div>
              <div style={{ color: style.color }}>${selectedTool.entry.toFixed(2)}</div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: colors.background }}
            >
              <div style={{ color: colors.textMuted }}>Stop Loss</div>
              <div style={{ color: colors.deltaNegative }}>${selectedTool.stopLoss.toFixed(2)}</div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: colors.background }}
            >
              <div style={{ color: colors.textMuted }}>Take Profit</div>
              <div style={{ color: colors.deltaPositive }}>${selectedTool.takeProfit.toFixed(2)}</div>
            </div>
          </div>
          <div
            className="p-2 rounded text-center"
            style={{ backgroundColor: colors.background }}
          >
            <span style={{ color: colors.textMuted }}>Risk/Reward: </span>
            <span style={{ color: colors.textPrimary }}>
              1:{(Math.abs(selectedTool.takeProfit - selectedTool.entry) / Math.abs(selectedTool.entry - selectedTool.stopLoss)).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Horizontal line price */}
      {selectedTool.type === 'horizontalLine' && (
        <div>
          <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
            Price Level
          </label>
          <input
            type="number"
            step="0.01"
            value={selectedTool.price}
            onChange={(e) => updateProperty({ price: Number(e.target.value) } as Partial<Tool>)}
            className="w-full px-2 py-1 rounded text-xs font-mono"
            style={{
              backgroundColor: colors.background,
              color: colors.textPrimary,
              border: `1px solid ${colors.gridColor}`,
            }}
          />
          <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input
              type="checkbox"
              checked={selectedTool.showPrice}
              onChange={(e) => updateProperty({ showPrice: e.target.checked } as Partial<Tool>)}
            />
            Show price label
          </label>
        </div>
      )}

      {/* Attached Text */}
      <div>
        <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
          Attached Text
        </label>
        <input
          type="text"
          value={selectedTool.text?.content || ''}
          onChange={(e) => updateProperty({
            text: {
              content: e.target.value,
              position: selectedTool.text?.position || 'end',
              fontSize: selectedTool.text?.fontSize || 11,
              fontColor: selectedTool.text?.fontColor || style.color,
            }
          } as Partial<Tool>)}
          placeholder="Add label..."
          className="w-full px-2 py-1 rounded text-xs"
          style={{
            backgroundColor: colors.background,
            color: colors.textPrimary,
            border: `1px solid ${colors.gridColor}`,
          }}
        />
        {selectedTool.text?.content && (
          <div className="mt-2 space-y-2">
            {/* Text Position */}
            <div className="flex gap-1">
              {(['start', 'center', 'end'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => updateProperty({
                    text: { ...selectedTool.text!, position: pos }
                  } as Partial<Tool>)}
                  className="flex-1 py-1 rounded text-[10px] capitalize"
                  style={{
                    backgroundColor: selectedTool.text?.position === pos ? colors.textPrimary : colors.background,
                    color: selectedTool.text?.position === pos ? colors.background : colors.textSecondary,
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
            {/* Text Size */}
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: colors.textMuted }}>Size:</span>
              <input
                type="range"
                min={8}
                max={16}
                value={selectedTool.text?.fontSize || 11}
                onChange={(e) => updateProperty({
                  text: { ...selectedTool.text!, fontSize: Number(e.target.value) }
                } as Partial<Tool>)}
                className="flex-1"
              />
              <span className="text-[10px] w-6" style={{ color: colors.textSecondary }}>
                {selectedTool.text?.fontSize || 11}
              </span>
            </div>
            {/* Text Color */}
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: colors.textMuted }}>Color:</span>
              <InlineColorSwatch
                value={selectedTool.text?.fontColor || style.color}
                onChange={(c) => updateProperty({
                  text: { ...selectedTool.text!, fontColor: c }
                } as Partial<Tool>)}
                size={5}
              />
              <button
                onClick={() => updateProperty({
                  text: { ...selectedTool.text!, fontColor: style.color }
                } as Partial<Tool>)}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ backgroundColor: colors.background, color: colors.textSecondary }}
              >
                Match line
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visibility */}
      <div>
        <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
          Options
        </label>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input
              type="checkbox"
              checked={selectedTool.visible}
              onChange={(e) => updateProperty({ visible: e.target.checked })}
            />
            Visible
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input
              type="checkbox"
              checked={selectedTool.locked}
              onChange={handleToggleLock}
            />
            Locked
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t space-y-2" style={{ borderColor: colors.gridColor }}>
        <button
          onClick={handleDuplicate}
          className="w-full py-2 rounded text-xs transition-colors hover:opacity-80"
          style={{ backgroundColor: colors.background, color: colors.textSecondary }}
        >
          Duplicate
        </button>
        <button
          onClick={handleDelete}
          className="w-full py-2 rounded text-xs text-white transition-colors hover:opacity-80"
          style={{ backgroundColor: colors.deltaNegative }}
        >
          Delete
        </button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div
        className="text-[10px] pt-2 border-t"
        style={{ borderColor: colors.gridColor, color: colors.textMuted }}
      >
        <div>Delete/Backspace: Remove tool</div>
        <div>Escape: Deselect</div>
        <div>Ctrl+Z: Undo</div>
        <div>Ctrl+Y: Redo</div>
      </div>
    </div>
  );
}

// ============ HELPERS ============

function getToolTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trendline: 'Trend Line',
    horizontalLine: 'Horizontal Line',
    horizontalRay: 'Horizontal Ray',
    verticalLine: 'Vertical Line',
    rectangle: 'Rectangle',
    fibRetracement: 'Fibonacci Retracement',
    longPosition: 'Long Position',
    shortPosition: 'Short Position',
    text: 'Text',
  };
  return labels[type] || type;
}

function getToolIcon(type: string): string {
  const icons: Record<string, string> = {
    trendline: '╱',
    horizontalLine: '─',
    horizontalRay: '→',
    verticalLine: '│',
    rectangle: '▢',
    fibRetracement: '🔢',
    longPosition: '▲',
    shortPosition: '▼',
    text: 'T',
  };
  return icons[type] || '•';
}
