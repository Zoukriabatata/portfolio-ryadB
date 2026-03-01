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

import { useCallback, useEffect, useState, useReducer, useRef } from 'react';
import {
  Tool,
  ToolStyle,
  LineStyle,
  getToolsEngine,
} from '@/lib/tools/ToolsEngine';
import { ColorPicker } from '@/components/tools/ColorPicker';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

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
  // Force re-render when the selected tool changes in the engine
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    const unsub = engine.on('tool:update', (updatedTool) => {
      if (updatedTool && 'id' in updatedTool && (updatedTool as Tool).id === selectedTool.id) {
        forceRender();
      }
    });
    return unsub;
  }, [selectedTool?.id]);

  // Read fresh tool from engine — single source of truth
  const freshTool = selectedTool ? (getToolsEngine().getTool(selectedTool.id) ?? selectedTool) : null;
  const style = freshTool?.style ?? null;

  // Extend flags read directly from fresh tool
  const showExtend = freshTool?.type === 'trendline'
    ? { left: freshTool.extendLeft, right: freshTool.extendRight }
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
    const engine = getToolsEngine();
    const fresh = engine.getTool(selectedTool.id);
    if (fresh) engine.updateTool(selectedTool.id, { locked: !fresh.locked });
  }, [selectedTool?.id]);

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

  if (!freshTool || !style) {
    return (
      <div
        className="p-4 text-center"
        style={{ backgroundColor: colors.surface, color: colors.textMuted }}
      >
        <p className="text-sm">Select a tool to edit its properties</p>
      </div>
    );
  }

  const toolTypeLabel = getToolTypeLabel(freshTool.type);

  return (
    <div
      className="p-3 space-y-4 overflow-y-auto"
      style={{ backgroundColor: colors.surface }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getToolIcon(freshTool.type)}</span>
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

      {/* Color — Full HSV picker */}
      <ColorPicker
        value={style.color}
        onChange={(color) => updateStyle({ color })}
        label="Color"
        showAlpha
        alpha={style.opacity ?? 1}
        onAlphaChange={(a) => updateStyle({ opacity: a })}
      />

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
      {(freshTool.type === 'rectangle' || freshTool.type === 'longPosition' || freshTool.type === 'shortPosition') && (
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
      {freshTool.type === 'trendline' && (
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
      {(freshTool.type === 'longPosition' || freshTool.type === 'shortPosition') && (
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
              <div style={{ color: style.color }}>${freshTool.entry.toFixed(2)}</div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: colors.background }}
            >
              <div style={{ color: colors.textMuted }}>Stop Loss</div>
              <div style={{ color: colors.deltaNegative }}>${freshTool.stopLoss.toFixed(2)}</div>
            </div>
            <div
              className="p-2 rounded"
              style={{ backgroundColor: colors.background }}
            >
              <div style={{ color: colors.textMuted }}>Take Profit</div>
              <div style={{ color: colors.deltaPositive }}>${freshTool.takeProfit.toFixed(2)}</div>
            </div>
          </div>
          <div
            className="p-2 rounded text-center"
            style={{ backgroundColor: colors.background }}
          >
            <span style={{ color: colors.textMuted }}>Risk/Reward: </span>
            <span style={{ color: colors.textPrimary }}>
              1:{(Math.abs(freshTool.takeProfit - freshTool.entry) / Math.abs(freshTool.entry - freshTool.stopLoss)).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Horizontal line price */}
      {freshTool.type === 'horizontalLine' && (
        <div>
          <label className="text-xs mb-2 block" style={{ color: colors.textMuted }}>
            Price Level
          </label>
          <input
            type="number"
            step="0.01"
            value={freshTool.price}
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
              checked={freshTool.showPrice}
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
          value={freshTool.text?.content || ''}
          onChange={(e) => updateProperty({
            text: {
              content: e.target.value,
              position: freshTool.text?.position || 'end',
              fontSize: freshTool.text?.fontSize || 11,
              fontColor: freshTool.text?.fontColor || style.color,
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
        {freshTool.text?.content && (
          <div className="mt-2 space-y-2">
            {/* Text Position */}
            <div className="flex gap-1">
              {(['start', 'center', 'end'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => updateProperty({
                    text: { ...freshTool.text!, position: pos }
                  } as Partial<Tool>)}
                  className="flex-1 py-1 rounded text-[10px] capitalize"
                  style={{
                    backgroundColor: freshTool.text?.position === pos ? colors.textPrimary : colors.background,
                    color: freshTool.text?.position === pos ? colors.background : colors.textSecondary,
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
                value={freshTool.text?.fontSize || 11}
                onChange={(e) => updateProperty({
                  text: { ...freshTool.text!, fontSize: Number(e.target.value) }
                } as Partial<Tool>)}
                className="flex-1"
              />
              <span className="text-[10px] w-6" style={{ color: colors.textSecondary }}>
                {freshTool.text?.fontSize || 11}
              </span>
            </div>
            {/* Text Color */}
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: colors.textMuted }}>Color:</span>
              <InlineColorSwatch
                value={freshTool.text?.fontColor || style.color}
                onChange={(c) => updateProperty({
                  text: { ...freshTool.text!, fontColor: c }
                } as Partial<Tool>)}
                size={5}
              />
              <button
                onClick={() => updateProperty({
                  text: { ...freshTool.text!, fontColor: style.color }
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
              checked={freshTool.visible}
              onChange={(e) => updateProperty({ visible: e.target.checked })}
            />
            Visible
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: colors.textSecondary }}>
            <input
              type="checkbox"
              checked={freshTool.locked}
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
