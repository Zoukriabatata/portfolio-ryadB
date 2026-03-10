'use client';

/**
 * TOOL SETTINGS PANEL — Right-sidebar detailed settings panel.
 * Clean, TradingView-style: visual line width/style selectors, toggle switches, icon header.
 */

import { useCallback, useEffect, useReducer } from 'react';
import {
  Tool,
  ToolStyle,
  LineStyle,
  getToolsEngine,
} from '@/lib/tools/ToolsEngine';
import { ColorPicker } from '@/components/tools/ColorPicker';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';
import {
  TrendingUp,
  MoveRight,
  Minus,
  ArrowRight,
  SeparatorVertical,
  Square,
  Columns2,
  Circle,
  GitBranch,
  GitFork,
  ArrowUpRight,
  Pen,
  Highlighter,
  Ruler,
  Type,
  MousePointer2,
  Copy,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';

// ─── Tool icon mapping ────────────────────────────────────────────────────────

const PANEL_TOOL_ICONS: Partial<Record<string, LucideIcon>> = {
  cursor: MousePointer2,
  trendline: TrendingUp,
  ray: MoveRight,
  horizontalLine: Minus,
  horizontalRay: ArrowRight,
  verticalLine: SeparatorVertical,
  rectangle: Square,
  parallelChannel: Columns2,
  ellipse: Circle,
  fibRetracement: GitBranch,
  fibExtension: GitFork,
  longPosition: ArrowUpRight,
  shortPosition: ArrowUpRight,
  arrow: ArrowUpRight,
  brush: Pen,
  highlighter: Highlighter,
  measure: Ruler,
  text: Type,
};

const PANEL_TOOL_LABELS: Partial<Record<string, string>> = {
  cursor: 'Cursor',
  trendline: 'Trend Line',
  ray: 'Ray',
  horizontalLine: 'Horizontal Line',
  horizontalRay: 'Horizontal Ray',
  verticalLine: 'Vertical Line',
  rectangle: 'Rectangle',
  parallelChannel: 'Parallel Channel',
  ellipse: 'Ellipse',
  fibRetracement: 'Fib. Retracement',
  fibExtension: 'Fib. Extension',
  longPosition: 'Long Position',
  shortPosition: 'Short Position',
  arrow: 'Arrow',
  brush: 'Brush',
  highlighter: 'Highlighter',
  measure: 'Measure',
  text: 'Text',
};

// ─── Line width / style ───────────────────────────────────────────────────────

const LINE_WIDTHS = [1, 2, 3, 4, 5];

const LINE_STYLES: { value: LineStyle; label: string; svg: React.ReactNode }[] = [
  {
    value: 'solid', label: 'Solid',
    svg: <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="1.5" />,
  },
  {
    value: 'dashed', label: 'Dashed',
    svg: <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 3" />,
  },
  {
    value: 'dotted', label: 'Dotted',
    svg: <line x1="2" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />,
  },
];

// ─── UI primitives ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
      {children}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-[14px] w-[26px] flex-shrink-0 cursor-pointer rounded-full transition-colors duration-150 focus:outline-none"
      style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--border)' }}
    >
      <span
        className="pointer-events-none inline-block h-[10px] w-[10px] rounded-full bg-white shadow-sm transition-transform duration-150"
        style={{
          margin: '2px',
          transform: checked ? 'translateX(12px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ToolSettingsPanel({
  selectedTool,
  colors,
  onClose,
}: ToolSettingsPanelProps) {
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

  const freshTool = selectedTool ? (getToolsEngine().getTool(selectedTool.id) ?? selectedTool) : null;
  const style = freshTool?.style ?? null;

  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool) return;
    getToolsEngine().updateSelectedToolsStyle(updates);
  }, [selectedTool]);

  const updateProperty = useCallback((updates: Partial<Tool>) => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    for (const tool of engine.getSelectedTools()) {
      engine.updateTool(tool.id, updates);
    }
  }, [selectedTool]);

  const handleDelete = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().deleteTool(selectedTool.id);
    onClose?.();
  }, [selectedTool, onClose]);

  const handleDuplicate = useCallback(() => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    const { id, createdAt, updatedAt, selected, zIndex, ...toolData } = selectedTool;
    const dup = { ...toolData };
    if ('price' in dup && typeof dup.price === 'number') dup.price += 10;
    if ('entry' in dup && typeof dup.entry === 'number') (dup as Record<string, unknown>).entry = (dup.entry as number) + 10;
    const newTool = engine.addTool(dup as Omit<Tool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>);
    engine.selectTool(newTool.id);
  }, [selectedTool]);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!freshTool || !style) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-32 p-4 text-center">
        <div style={{ color: 'var(--text-dimmed)' }}>
          <Square size={20} strokeWidth={1} />
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
          Select a tool to edit
        </p>
      </div>
    );
  }

  const ToolIcon = PANEL_TOOL_ICONS[freshTool.type];
  const toolLabel = PANEL_TOOL_LABELS[freshTool.type] ?? freshTool.type;
  const isPosition = freshTool.type === 'longPosition' || freshTool.type === 'shortPosition';
  const isTrendline = freshTool.type === 'trendline';
  const isHLine = freshTool.type === 'horizontalLine';
  const extendLeft = isTrendline ? (freshTool as any).extendLeft : false;
  const extendRight = isTrendline ? (freshTool as any).extendRight : false;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ backgroundColor: colors.surface }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-2.5 sticky top-0"
        style={{
          borderBottom: `1px solid ${colors.gridColor}`,
          backgroundColor: colors.surface,
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-2">
          {ToolIcon && (
            <span style={{ color: 'var(--primary)' }}>
              <ToolIcon
                size={13}
                strokeWidth={1.5}
                className={freshTool.type === 'shortPosition' ? 'rotate-90' : ''}
              />
            </span>
          )}
          <span className="text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
            {toolLabel}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-white/8"
            style={{ color: colors.textMuted }}
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="p-3 space-y-5">

        {/* ── Color ─────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <SectionLabel>Color</SectionLabel>
          <ColorPicker
            value={style.color}
            onChange={(color) => updateStyle({ color })}
            mini
            showAlpha
            alpha={style.opacity ?? 1}
            onAlphaChange={(a) => updateStyle({ opacity: a })}
          />
        </div>

        {/* ── Line Width ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <SectionLabel>Width</SectionLabel>
          <div className="flex items-center gap-1">
            {LINE_WIDTHS.map(w => {
              const active = style.lineWidth === w;
              return (
                <button
                  key={w}
                  onClick={() => updateStyle({ lineWidth: w })}
                  className="flex-1 flex flex-col items-center gap-1.5 py-2 rounded-md transition-all"
                  style={{
                    backgroundColor: active ? 'var(--surface-elevated)' : 'var(--background)',
                    border: `1px solid ${active ? 'var(--primary)' : colors.gridColor}`,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: Math.min(w, 4),
                      backgroundColor: active ? 'var(--primary)' : colors.textMuted,
                      borderRadius: 99,
                    }}
                  />
                  <span
                    className="text-[9px] font-mono tabular-nums"
                    style={{ color: active ? 'var(--primary)' : colors.textMuted }}
                  >
                    {w}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Line Style ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <SectionLabel>Style</SectionLabel>
          <div className="space-y-1">
            {LINE_STYLES.map(({ value, label, svg }) => {
              const active = style.lineStyle === value;
              return (
                <button
                  key={value}
                  onClick={() => updateStyle({ lineStyle: value })}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md transition-all"
                  style={{
                    backgroundColor: active ? 'var(--surface-elevated)' : 'transparent',
                    border: `1px solid ${active ? 'var(--primary)' : 'transparent'}`,
                  }}
                >
                  <svg
                    width="34" height="12" viewBox="0 0 34 12"
                    style={{ color: active ? 'var(--primary)' : colors.textMuted }}
                  >
                    {svg}
                  </svg>
                  <span
                    className="text-[11px]"
                    style={{ color: active ? colors.textPrimary : colors.textSecondary }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Fill opacity (shapes + positions) ───────────────────────── */}
        {(freshTool.type === 'rectangle' || isPosition) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <SectionLabel>Fill opacity</SectionLabel>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: colors.textMuted }}>
                {Math.round((style.fillOpacity || 0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={(style.fillOpacity || 0) * 100}
              onChange={(e) => updateStyle({ fillOpacity: Number(e.target.value) / 100 })}
              className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
              style={{ backgroundColor: colors.gridColor }}
            />
          </div>
        )}

        {/* ── Extend line (trendline) ──────────────────────────────────── */}
        {isTrendline && (
          <div className="space-y-2">
            <SectionLabel>Extend line</SectionLabel>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: colors.textSecondary }}>Left</span>
                <Toggle
                  checked={extendLeft}
                  onChange={(v) => updateProperty({ extendLeft: v } as Partial<Tool>)}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: colors.textSecondary }}>Right</span>
                <Toggle
                  checked={extendRight}
                  onChange={(v) => updateProperty({ extendRight: v } as Partial<Tool>)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Horizontal line price ────────────────────────────────────── */}
        {isHLine && (
          <div className="space-y-2">
            <SectionLabel>Price level</SectionLabel>
            <input
              type="number"
              step="0.01"
              value={(freshTool as any).price}
              onChange={(e) => updateProperty({ price: Number(e.target.value) } as Partial<Tool>)}
              className="w-full px-2 py-1.5 rounded-md text-[11px] font-mono focus:outline-none focus:border-[var(--primary)] transition-colors"
              style={{
                backgroundColor: colors.background,
                color: colors.textPrimary,
                border: `1px solid ${colors.gridColor}`,
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: colors.textSecondary }}>Show price label</span>
              <Toggle
                checked={(freshTool as any).showPrice}
                onChange={(v) => updateProperty({ showPrice: v } as Partial<Tool>)}
              />
            </div>
          </div>
        )}

        {/* ── Position details (Long/Short) ────────────────────────────── */}
        {isPosition && (
          <div className="space-y-2">
            <SectionLabel>Position</SectionLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Entry', value: (freshTool as any).entry, color: style.color },
                { label: 'Stop Loss', value: (freshTool as any).stopLoss, color: colors.deltaNegative },
                { label: 'Take Profit', value: (freshTool as any).takeProfit, color: colors.deltaPositive },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="p-2 rounded-md text-center"
                  style={{ backgroundColor: colors.background, border: `1px solid ${colors.gridColor}` }}
                >
                  <div className="text-[9px] mb-0.5" style={{ color: colors.textMuted }}>{label}</div>
                  <div className="text-[10px] font-mono tabular-nums" style={{ color }}>
                    {typeof value === 'number' ? value.toFixed(2) : '—'}
                  </div>
                </div>
              ))}
            </div>
            {typeof (freshTool as any).entry === 'number' && typeof (freshTool as any).stopLoss === 'number' && typeof (freshTool as any).takeProfit === 'number' && (
              <div
                className="flex items-center justify-between px-2.5 py-1.5 rounded-md"
                style={{ backgroundColor: colors.background, border: `1px solid ${colors.gridColor}` }}
              >
                <span className="text-[10px]" style={{ color: colors.textMuted }}>Risk / Reward</span>
                <span className="text-[11px] font-semibold font-mono tabular-nums" style={{ color: colors.textPrimary }}>
                  1 : {(Math.abs((freshTool as any).takeProfit - (freshTool as any).entry) / Math.abs((freshTool as any).entry - (freshTool as any).stopLoss)).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Attached text ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <SectionLabel>Label</SectionLabel>
          <input
            type="text"
            value={(freshTool as any).text?.content || ''}
            onChange={(e) => updateProperty({
              text: {
                content: e.target.value,
                position: (freshTool as any).text?.position || 'end',
                fontSize: (freshTool as any).text?.fontSize || 11,
                fontColor: (freshTool as any).text?.fontColor || style.color,
              }
            } as Partial<Tool>)}
            placeholder="Add label…"
            className="w-full px-2 py-1.5 rounded-md text-[11px] focus:outline-none focus:border-[var(--primary)] transition-colors"
            style={{
              backgroundColor: colors.background,
              color: colors.textPrimary,
              border: `1px solid ${colors.gridColor}`,
            }}
          />

          {(freshTool as any).text?.content && (
            <div className="space-y-2">
              {/* Position */}
              <div className="flex gap-1">
                {(['start', 'center', 'end'] as const).map(pos => {
                  const active = (freshTool as any).text?.position === pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => updateProperty({ text: { ...(freshTool as any).text!, position: pos } } as Partial<Tool>)}
                      className="flex-1 py-1 rounded-md text-[10px] capitalize transition-all"
                      style={{
                        backgroundColor: active ? 'var(--surface-elevated)' : colors.background,
                        border: `1px solid ${active ? 'var(--primary)' : colors.gridColor}`,
                        color: active ? 'var(--primary)' : colors.textSecondary,
                      }}
                    >
                      {pos}
                    </button>
                  );
                })}
              </div>
              {/* Color */}
              <div className="flex items-center gap-2">
                <span className="text-[10px]" style={{ color: colors.textMuted }}>Color</span>
                <InlineColorSwatch
                  value={(freshTool as any).text?.fontColor || style.color}
                  onChange={(c) => updateProperty({ text: { ...(freshTool as any).text!, fontColor: c } } as Partial<Tool>)}
                  size={4}
                />
                <button
                  onClick={() => updateProperty({ text: { ...(freshTool as any).text!, fontColor: style.color } } as Partial<Tool>)}
                  className="text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--surface)]"
                  style={{ color: colors.textSecondary, border: `1px solid ${colors.gridColor}` }}
                >
                  Match line
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Visibility / Lock ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <SectionLabel>Options</SectionLabel>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: colors.textSecondary }}>Visible</span>
              <Toggle
                checked={freshTool.visible}
                onChange={(v) => updateProperty({ visible: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: colors.textSecondary }}>Locked</span>
              <Toggle
                checked={freshTool.locked}
                onChange={(v) => updateProperty({ locked: v })}
              />
            </div>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1" style={{ borderTop: `1px solid ${colors.gridColor}` }}>
          <button
            onClick={handleDuplicate}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] transition-colors hover:bg-[var(--surface)]"
            style={{
              color: colors.textSecondary,
              border: `1px solid ${colors.gridColor}`,
            }}
          >
            <Copy size={12} strokeWidth={1.5} />
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] transition-colors hover:bg-red-500/12 hover:text-red-400 hover:border-red-500/30"
            style={{
              color: colors.textSecondary,
              border: `1px solid ${colors.gridColor}`,
            }}
          >
            <Trash2 size={12} strokeWidth={1.5} />
            Delete
          </button>
        </div>

      </div>
    </div>
  );
}
