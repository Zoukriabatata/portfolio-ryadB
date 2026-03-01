'use client';

/**
 * INLINE TOOL SETTINGS BAR — TradingView-Style
 *
 * Horizontal bar displayed above the chart when a drawing tool is selected.
 * Shows: color, line width, line style, opacity + actions (lock, clone, hide, delete).
 * Reads directly from selectedTool prop — single source of truth.
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
  Bookmark,
  Star,
  X,
  Check,
} from 'lucide-react';
import { DynamicToolSettingsPanel } from './DynamicToolSettingsPanel';
import { useToolSettingsStore, type ToolPreset } from '@/stores/useToolSettingsStore';
import { ColorPicker } from '@/components/tools/ColorPicker';

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
  onRender?: () => void;
}

export default function InlineToolSettings({
  selectedTool,
  onOpenAdvanced,
  onRender,
}: InlineToolSettingsProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showDynamicSettings, setShowDynamicSettings] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [showPresetNameInput, setShowPresetNameInput] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);

  // Preset store
  const { presets, savePreset, deletePreset, setAsDefault } = useToolSettingsStore();

  // Close dropdowns when tool deselected
  useEffect(() => {
    if (!selectedTool) {
      setShowColorPicker(false);
      setShowWidthPicker(false);
      setShowStylePicker(false);
      setShowDynamicSettings(false);
      setShowPresetMenu(false);
      setShowPresetNameInput(false);
    }
  }, [selectedTool]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
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

  // Focus preset name input when shown
  useEffect(() => {
    if (showPresetNameInput && presetInputRef.current) {
      presetInputRef.current.focus();
    }
  }, [showPresetNameInput]);

  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool) return;
    // Multi-tool bulk editing with debounced undo + lineWidth animation
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
    getToolsEngine().updateTool(selectedTool.id, { locked: !selectedTool.locked });
  }, [selectedTool]);

  const handleToggleVisible = useCallback(() => {
    if (!selectedTool) return;
    getToolsEngine().updateTool(selectedTool.id, { visible: !selectedTool.visible });
  }, [selectedTool]);

  const handleSavePreset = useCallback(() => {
    if (!selectedTool || !presetNameInput.trim()) return;
    savePreset(presetNameInput.trim(), selectedTool.type, selectedTool.style as any);
    setPresetNameInput('');
    setShowPresetNameInput(false);
  }, [selectedTool, presetNameInput, savePreset]);

  const handleApplyPreset = useCallback((preset: ToolPreset) => {
    if (!selectedTool) return;
    // Apply preset style to ALL selected tools (multi-edit)
    getToolsEngine().updateSelectedToolsStyle(preset.style as any);
    onRender?.();
    setShowPresetMenu(false);
  }, [selectedTool, onRender]);

  const handleSetAsDefault = useCallback(() => {
    if (!selectedTool) return;
    // Write to engine (single source of truth for defaults)
    getToolsEngine().setDefaultStyle(selectedTool.type as any, selectedTool.style);
    setShowPresetMenu(false);
  }, [selectedTool]);

  if (!selectedTool) return null;

  // Read style directly from selectedTool — single source of truth
  const style = selectedTool.style;

  // Filter presets for current tool type
  const toolPresets = presets.filter(p => p.toolType === selectedTool.type);

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
          onClick={() => { setShowColorPicker(!showColorPicker); setShowWidthPicker(false); setShowStylePicker(false); setShowPresetMenu(false); }}
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
          <div className="absolute top-full left-0 mt-1 p-2 rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-xl z-50" style={{ width: 220 }}>
            <ColorPicker
              value={style.color}
              onChange={(color) => updateStyle({ color })}
              label=""
            />
          </div>
        )}
      </div>

      {/* Line width */}
      <div className="relative">
        <button
          onClick={() => { setShowWidthPicker(!showWidthPicker); setShowColorPicker(false); setShowStylePicker(false); setShowPresetMenu(false); }}
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
          onClick={() => { setShowStylePicker(!showStylePicker); setShowColorPicker(false); setShowWidthPicker(false); setShowPresetMenu(false); }}
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

      {/* Presets */}
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <div className="relative">
        <button
          onClick={() => { setShowPresetMenu(!showPresetMenu); setShowColorPicker(false); setShowWidthPicker(false); setShowStylePicker(false); setShowDynamicSettings(false); }}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
            showPresetMenu
              ? 'text-[var(--primary)] bg-[var(--primary)]/10'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
          }`}
          title="Style Presets"
        >
          <Bookmark size={13} strokeWidth={1.5} />
        </button>
        {showPresetMenu && (
          <div className="absolute right-0 top-full mt-1 w-[220px] bg-[#111315] border border-[#1C1F23] rounded-[10px] shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-[#1C1F23]">
              <span className="text-[11px] font-medium text-[#8a8f98] uppercase tracking-wider">
                Style Presets
              </span>
            </div>

            <div className="p-1.5">
              {/* Save as Preset */}
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
                    className="flex-1 h-6 text-[11px] rounded px-2 bg-[#1C1F23] text-[#e5e7eb] border border-[#2a2e35] focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetNameInput.trim()}
                    className="w-6 h-6 flex items-center justify-center rounded text-green-400 hover:bg-green-400/10 disabled:opacity-30 transition-colors"
                  >
                    <Check size={12} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => { setShowPresetNameInput(false); setPresetNameInput(''); }}
                    className="w-6 h-6 flex items-center justify-center rounded text-[#666] hover:bg-[#1C1F23] transition-colors"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPresetNameInput(true)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] text-[#8a8f98] hover:bg-[#1C1F23] transition-colors"
                >
                  <Bookmark size={12} strokeWidth={1.5} />
                  <span>Save as Preset...</span>
                </button>
              )}

              {/* Preset list */}
              {toolPresets.length > 0 && (
                <>
                  <div className="h-px bg-[#1C1F23] my-1" />
                  {toolPresets.map(preset => (
                    <div
                      key={preset.id}
                      className="flex items-center gap-1 group"
                    >
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-[#c9cdd4] hover:bg-[#1C1F23] transition-colors text-left"
                      >
                        <div
                          className="w-3 h-3 rounded-sm border border-[#333]"
                          style={{ backgroundColor: preset.style.color || '#666' }}
                        />
                        <span className="truncate">{preset.name}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                        className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-[#555] hover:text-red-400 hover:bg-red-400/10 transition-all"
                      >
                        <X size={10} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Set as Default */}
              <div className="h-px bg-[#1C1F23] my-1" />
              <button
                onClick={handleSetAsDefault}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-[11px] text-[#8a8f98] hover:bg-[#1C1F23] transition-colors"
              >
                <Star size={12} strokeWidth={1.5} />
                <span>Set as Default</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Advanced settings (dynamic panel) */}
      <div className="w-px h-4 bg-[var(--border)] mx-0.5" />
      <div className="relative">
        <button
          onClick={() => { setShowDynamicSettings(!showDynamicSettings); setShowPresetMenu(false); }}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
            showDynamicSettings
              ? 'text-[var(--primary)] bg-[var(--primary)]/10'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
          }`}
          title="Tool properties"
        >
          <Settings2 size={13} strokeWidth={1.5} />
        </button>
        {showDynamicSettings && (
          <DynamicToolSettingsPanel
            tool={selectedTool}
            onUpdate={() => {
              onRender?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
