'use client';

/**
 * INLINE TOOL SETTINGS BAR — TradingView-Style
 *
 * Horizontal bar (h-8) shown above the chart when a drawing tool is active.
 * Very compact, left-to-right: [icon + label] | [color] [width] [style] | [position controls] | [lock] [hide] [clone] [delete] | [presets] [props]
 */

import { useCallback, useEffect, useState, useReducer, useRef } from 'react';
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
  Bookmark,
  Star,
  X,
  Check,
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
  type LucideIcon,
} from 'lucide-react';
import { DynamicToolSettingsPanel } from './DynamicToolSettingsPanel';
import { useToolSettingsStore, type ToolPreset } from '@/stores/useToolSettingsStore';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

// ─── Tool icon + label mapping ────────────────────────────────────────────────

const TOOL_ICONS: Partial<Record<string, LucideIcon>> = {
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

const TOOL_LABELS: Partial<Record<string, string>> = {
  cursor: 'Cursor',
  trendline: 'Trend',
  ray: 'Ray',
  horizontalLine: 'H. Line',
  horizontalRay: 'H. Ray',
  verticalLine: 'V. Line',
  rectangle: 'Rectangle',
  parallelChannel: 'Channel',
  ellipse: 'Ellipse',
  fibRetracement: 'Fibonacci',
  fibExtension: 'Fib. Ext.',
  longPosition: 'Long',
  shortPosition: 'Short',
  arrow: 'Arrow',
  brush: 'Brush',
  highlighter: 'Highlighter',
  measure: 'Measure',
  text: 'Text',
};

// ─── Line width & style ───────────────────────────────────────────────────────

const LINE_WIDTHS = [1, 2, 3, 4];

const LINE_STYLES: { value: LineStyle; label: string; svg: React.ReactNode }[] = [
  {
    value: 'solid', label: 'Solid',
    svg: <line x1="2" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="1.5" />,
  },
  {
    value: 'dashed', label: 'Dashed',
    svg: <line x1="2" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 3" />,
  },
  {
    value: 'dotted', label: 'Dotted',
    svg: <line x1="2" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sep() {
  return <div className="w-px h-4 flex-shrink-0" style={{ backgroundColor: 'var(--border)' }} />;
}

function ActionBtn({
  onClick,
  active,
  activeColor,
  hoverRed,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  activeColor?: string;
  hoverRed?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
        hoverRed
          ? 'text-[var(--text-muted)] hover:bg-red-500/12 hover:text-red-400'
          : active
          ? ''
          : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
      }`}
      style={active ? { color: activeColor, backgroundColor: `${activeColor}1a` } : undefined}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InlineToolSettingsProps {
  selectedTool: Tool | null;
  onOpenAdvanced?: (tool: Tool) => void;
  onRender?: () => void;
}

export default function InlineToolSettings({
  selectedTool,
  onOpenAdvanced,
  onRender,
}: InlineToolSettingsProps) {
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showDynamicSettings, setShowDynamicSettings] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetNameInput, setShowPresetNameInput] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);

  // Force re-render when the engine updates the tool
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

  const { presets, savePreset, deletePreset } = useToolSettingsStore();

  useEffect(() => {
    if (!selectedTool) {
      setShowWidthPicker(false);
      setShowStylePicker(false);
      setShowDynamicSettings(false);
      setShowPresetMenu(false);
      setShowPresetNameInput(false);
    }
  }, [selectedTool]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowWidthPicker(false);
        setShowStylePicker(false);
        setShowDynamicSettings(false);
        setShowPresetMenu(false);
        setShowPresetNameInput(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (showPresetNameInput && presetInputRef.current) {
      presetInputRef.current.focus();
    }
  }, [showPresetNameInput]);

  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool) return;
    getToolsEngine().updateSelectedToolsStyle(updates);
    onRender?.();
  }, [selectedTool, onRender]);

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
    const engine = getToolsEngine();
    const fresh = engine.getTool(selectedTool.id);
    if (fresh) engine.updateTool(selectedTool.id, { locked: !fresh.locked });
  }, [selectedTool?.id]);

  const handleToggleVisible = useCallback(() => {
    if (!selectedTool) return;
    const engine = getToolsEngine();
    const fresh = engine.getTool(selectedTool.id);
    if (fresh) engine.updateTool(selectedTool.id, { visible: !fresh.visible });
  }, [selectedTool?.id]);

  const handleSavePreset = useCallback(() => {
    if (!selectedTool || !presetNameInput.trim()) return;
    const fresh = getToolsEngine().getTool(selectedTool.id) ?? selectedTool;
    savePreset(presetNameInput.trim(), fresh.type, fresh.style as any);
    setPresetNameInput('');
    setShowPresetNameInput(false);
  }, [selectedTool, presetNameInput, savePreset]);

  const handleApplyPreset = useCallback((preset: ToolPreset) => {
    if (!selectedTool) return;
    getToolsEngine().updateSelectedToolsStyle(preset.style as any);
    onRender?.();
    setShowPresetMenu(false);
  }, [selectedTool, onRender]);

  const handleSetAsDefault = useCallback(() => {
    if (!selectedTool) return;
    const fresh = getToolsEngine().getTool(selectedTool.id) ?? selectedTool;
    getToolsEngine().setDefaultStyle(fresh.type as any, fresh.style);
    setShowPresetMenu(false);
  }, [selectedTool]);

  if (!selectedTool) return null;

  const freshTool = getToolsEngine().getTool(selectedTool.id) ?? selectedTool;
  const style = freshTool.style;
  const toolPresets = presets.filter(p => p.toolType === selectedTool.type);
  const ToolIcon = TOOL_ICONS[selectedTool.type];
  const toolLabel = TOOL_LABELS[selectedTool.type] ?? selectedTool.type;
  const isPosition = freshTool.type === 'longPosition' || freshTool.type === 'shortPosition';

  const closeAll = () => {
    setShowWidthPicker(false);
    setShowStylePicker(false);
    setShowPresetMenu(false);
    setShowDynamicSettings(false);
  };

  return (
    <div
      ref={barRef}
      className="flex items-center gap-0.5 h-8 px-1 border-b border-[var(--border)] bg-[var(--background)] flex-shrink-0 select-none overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* ── Tool label ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-2 h-6 rounded flex-shrink-0"
        style={{
          backgroundColor: isPosition
            ? freshTool.type === 'longPosition' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)'
            : 'transparent',
          color: isPosition
            ? freshTool.type === 'longPosition' ? '#22c55e' : '#ef4444'
            : 'var(--text-muted)',
        }}
      >
        {ToolIcon && (
          <ToolIcon
            size={12}
            strokeWidth={1.5}
            className={freshTool.type === 'shortPosition' ? 'rotate-90' : ''}
          />
        )}
        <span className="text-[10px] font-medium whitespace-nowrap">{toolLabel}</span>
      </div>

      <Sep />

      {/* ── Color ──────────────────────────────────────────────────────── */}
      <InlineColorSwatch
        value={style.color}
        onChange={(color) => updateStyle({ color })}
        mini
        showAlpha
        alpha={style.opacity ?? 1}
        onAlphaChange={(a) => updateStyle({ opacity: a })}
        className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors cursor-pointer"
      >
        <div
          className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
          style={{
            backgroundColor: style.color,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
          }}
        />
        <ChevronDown size={9} className="text-[var(--text-dimmed)]" />
      </InlineColorSwatch>

      {/* ── Line width ─────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => { closeAll(); setShowWidthPicker(!showWidthPicker); }}
          className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors"
          title="Line width"
        >
          <div className="w-7 h-4 flex items-center">
            <div
              className="w-full"
              style={{
                height: `${Math.min(style.lineWidth, 4)}px`,
                backgroundColor: 'var(--text-secondary)',
                borderRadius: 99,
              }}
            />
          </div>
          <ChevronDown size={9} className="text-[var(--text-dimmed)]" />
        </button>

        {showWidthPicker && (
          <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50 min-w-[120px]">
            {LINE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => { updateStyle({ lineWidth: w }); setShowWidthPicker(false); }}
                className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded transition-colors ${
                  style.lineWidth === w
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'hover:bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                <div className="w-10 flex items-center">
                  <div className="w-full rounded-full" style={{ height: Math.min(w, 4), backgroundColor: 'currentColor' }} />
                </div>
                <span className="text-[10px] font-mono tabular-nums">{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Line style ─────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => { closeAll(); setShowStylePicker(!showStylePicker); }}
          className="flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--surface)] transition-colors"
          title="Line style"
        >
          <svg width="20" height="12" viewBox="0 0 28 12" className="text-[var(--text-secondary)]">
            {LINE_STYLES.find(s => s.value === style.lineStyle)?.svg}
          </svg>
          <ChevronDown size={9} className="text-[var(--text-dimmed)]" />
        </button>

        {showStylePicker && (
          <div className="absolute top-full left-0 mt-1 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50 min-w-[130px]">
            {LINE_STYLES.map(ls => (
              <button
                key={ls.value}
                onClick={() => { updateStyle({ lineStyle: ls.value }); setShowStylePicker(false); }}
                className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded transition-colors ${
                  style.lineStyle === ls.value
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                    : 'hover:bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                <svg width="24" height="12" viewBox="0 0 28 12">{ls.svg}</svg>
                <span className="text-[10px]">{ls.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Position controls (Long/Short only) ───────────────────────── */}
      {isPosition && (
        <>
          <Sep />
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[var(--text-dimmed)]">$</span>
            <input
              type="number"
              value={(freshTool as any).accountSize || 10000}
              onChange={(e) => {
                getToolsEngine().updateTool(selectedTool.id, { accountSize: parseFloat(e.target.value) || 10000 } as any);
              }}
              className="w-14 h-5 text-[10px] font-mono rounded px-1 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
              title="Account size ($)"
            />
          </div>
          <select
            value={(freshTool as any).riskPercent || 1}
            onChange={(e) => getToolsEngine().updateTool(selectedTool.id, { riskPercent: parseFloat(e.target.value) } as any)}
            className="h-5 text-[10px] font-mono rounded px-0.5 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer focus:outline-none"
            title="Risk %"
          >
            {[0.5, 1, 2, 3, 5].map(r => <option key={r} value={r}>{r}%</option>)}
          </select>
          <select
            value={(freshTool as any).leverage || 1}
            onChange={(e) => getToolsEngine().updateTool(selectedTool.id, { leverage: parseFloat(e.target.value) } as any)}
            className="h-5 text-[10px] font-mono rounded px-0.5 bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)] cursor-pointer focus:outline-none"
            title="Leverage"
          >
            {[1, 2, 5, 10, 25, 50, 125].map(l => <option key={l} value={l}>{l}x</option>)}
          </select>
          <ActionBtn
            onClick={() => {
              const current = (freshTool as any).showDollarPnL || false;
              getToolsEngine().updateTool(selectedTool.id, { showDollarPnL: !current } as any);
            }}
            active={(freshTool as any).showDollarPnL}
            activeColor="#22c55e"
            title="Show Dollar P&L"
          >
            <DollarSign size={12} strokeWidth={1.5} />
          </ActionBtn>
        </>
      )}

      <Sep />

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <ActionBtn onClick={handleDuplicate} title="Duplicate (Ctrl+D)">
        <Copy size={12} strokeWidth={1.5} />
      </ActionBtn>

      <ActionBtn
        onClick={handleToggleLock}
        active={freshTool.locked}
        activeColor="var(--primary)"
        title={freshTool.locked ? 'Unlock' : 'Lock'}
      >
        {freshTool.locked
          ? <Lock size={12} strokeWidth={1.5} />
          : <Unlock size={12} strokeWidth={1.5} />}
      </ActionBtn>

      <ActionBtn
        onClick={handleToggleVisible}
        active={!freshTool.visible}
        activeColor="#f59e0b"
        title={freshTool.visible ? 'Hide' : 'Show'}
      >
        {freshTool.visible
          ? <Eye size={12} strokeWidth={1.5} />
          : <EyeOff size={12} strokeWidth={1.5} />}
      </ActionBtn>

      <ActionBtn onClick={handleDelete} hoverRed title="Delete (Del)">
        <Trash2 size={12} strokeWidth={1.5} />
      </ActionBtn>

      <Sep />

      {/* ── Presets ────────────────────────────────────────────────────── */}
      <div className="relative">
        <ActionBtn
          onClick={() => { closeAll(); setShowPresetMenu(!showPresetMenu); }}
          active={showPresetMenu}
          activeColor="var(--primary)"
          title="Style presets"
        >
          <Bookmark size={12} strokeWidth={1.5} />
        </ActionBtn>

        {showPresetMenu && (
          <div
            className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[var(--border)]">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Style Presets
              </span>
            </div>

            <div className="p-1.5 space-y-0.5">
              {showPresetNameInput ? (
                <div className="flex items-center gap-1 px-1 py-1">
                  <input
                    ref={presetInputRef}
                    type="text"
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePreset();
                      if (e.key === 'Escape') { setShowPresetNameInput(false); setPresetNameInput(''); }
                    }}
                    placeholder="Preset name..."
                    className="flex-1 h-6 text-[11px] rounded px-2 bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetNameInput.trim()}
                    className="w-6 h-6 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-30 transition-colors"
                  >
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => { setShowPresetNameInput(false); setPresetNameInput(''); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-dimmed)] hover:bg-[var(--surface)] transition-colors"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPresetNameInput(true)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"
                >
                  <Bookmark size={11} strokeWidth={1.5} />
                  Save as Preset…
                </button>
              )}

              {toolPresets.length > 0 && (
                <>
                  <div className="h-px bg-[var(--border)] my-1" />
                  {toolPresets.map(preset => (
                    <div key={preset.id} className="flex items-center gap-1 group">
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface)] transition-colors text-left"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: preset.style.color || 'var(--border)' }}
                        />
                        <span className="truncate">{preset.name}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-[var(--text-dimmed)] hover:text-red-400 hover:bg-red-400/10 transition-all"
                      >
                        <X size={10} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              <div className="h-px bg-[var(--border)] my-1" />
              <button
                onClick={handleSetAsDefault}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"
              >
                <Star size={11} strokeWidth={1.5} />
                Set as Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Dynamic tool properties ────────────────────────────────────── */}
      <div className="relative">
        <ActionBtn
          onClick={() => { closeAll(); setShowDynamicSettings(!showDynamicSettings); }}
          active={showDynamicSettings}
          activeColor="var(--primary)"
          title="Tool properties"
        >
          <Settings2 size={12} strokeWidth={1.5} />
        </ActionBtn>

        {showDynamicSettings && (
          <DynamicToolSettingsPanel
            tool={freshTool}
            onUpdate={() => { onRender?.(); }}
          />
        )}
      </div>
    </div>
  );
}
