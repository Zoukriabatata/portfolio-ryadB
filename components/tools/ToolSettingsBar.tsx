'use client';

/**
 * FLOATING TOOL SETTINGS BAR
 *
 * Professional minimal floating toolbar that appears near a selected tool.
 * Provides quick access to common settings without blocking the chart.
 *
 * Features:
 * - Appears near the selected tool position
 * - Draggable
 * - Auto-hides on click outside
 * - Quick color/opacity/thickness/style controls
 * - Lock/Hide/Delete actions
 * - Advanced settings button
 */

import { useCallback, useEffect, useState, useReducer, useRef } from 'react';
import {
  Tool,
  ToolStyle,
  LineStyle,
  getToolsEngine,
} from '@/lib/tools/ToolsEngine';
import { ColorPicker } from '@/components/tools/ColorPicker';

// Global timestamp: when ToolSettingsBar last received a pointerdown/mousedown
// Set via native capture-phase listener so it fires BEFORE any React handler
let _lastToolbarInteraction = 0;
export function getLastToolbarInteraction(): number {
  return _lastToolbarInteraction;
}

interface ToolSettingsBarProps {
  selectedTool: Tool | null;
  /** Position hint from tool location on chart */
  toolPosition?: { x: number; y: number };
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
  onOpenAdvanced?: (tool: Tool) => void;
  /** Called when user interacts with the bar (prevents chart deselection) */
  onInteractionStart?: () => void;
}


// Line widths
const LINE_WIDTHS = [1, 2, 3, 4, 5];

// Line styles
const LINE_STYLES: { value: LineStyle; label: string; icon: string }[] = [
  { value: 'solid', label: 'Solid', icon: '───' },
  { value: 'dashed', label: 'Dashed', icon: '- - -' },
  { value: 'dotted', label: 'Dotted', icon: '···' },
];

export default function ToolSettingsBar({
  selectedTool,
  toolPosition,
  colors,
  onClose,
  onOpenAdvanced,
  onInteractionStart,
}: ToolSettingsBarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasBeenMoved, setHasBeenMoved] = useState(false); // Track if user manually moved the bar

  // Helper: get mouse position relative to the chart container
  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    if (!barRef.current) return { x: clientX, y: clientY };

    // Find the parent container with position: relative (the chart area)
    let parent = barRef.current.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.position === 'relative' || style.position === 'absolute') {
        const rect = parent.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      }
      parent = parent.parentElement;
    }

    return { x: clientX, y: clientY };
  }, []);

  // Initialize position based on tool location (only if user hasn't manually moved it)
  useEffect(() => {
    if (toolPosition && !isDragging && !hasBeenMoved) {
      setPosition({
        x: toolPosition.x,
        y: Math.max(8, toolPosition.y - 50),
      });
    }
  }, [toolPosition, isDragging, hasBeenMoved]);

  // Reset hasBeenMoved when selectedTool changes (new tool selected)
  useEffect(() => {
    setHasBeenMoved(false);
  }, [selectedTool?.id]);

  // Set global timestamp on ANY pointer/mouse interaction via native capture-phase
  // This fires BEFORE React's delegated event system, guaranteeing the timestamp
  // is set before handleCanvasMouseDown in useDrawingTools checks it
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const markInteraction = () => { _lastToolbarInteraction = Date.now(); };
    el.addEventListener('pointerdown', markInteraction, true); // capture phase
    el.addEventListener('mousedown', markInteraction, true);   // capture phase
    return () => {
      el.removeEventListener('pointerdown', markInteraction, true);
      el.removeEventListener('mousedown', markInteraction, true);
    };
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowWidthPicker(false);
        setShowStylePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle dragging (convert viewport coords to chart-local coords)
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rel = getRelativePos(e.clientX, e.clientY);
      setPosition({
        x: rel.x - dragOffset.x,
        y: rel.y - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setHasBeenMoved(true); // Mark as manually moved
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, getRelativePos]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    // Drag offset is relative to the bar's position within the chart container
    const rel = getRelativePos(e.clientX, e.clientY);
    setDragOffset({
      x: rel.x - position.x,
      y: rel.y - position.y,
    });
  }, [position, getRelativePos]);

  // Force re-render when the selected tool's style changes in the engine
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

  // Read fresh tool from engine — single source of truth (no local state)
  const freshTool = selectedTool ? (getToolsEngine().getTool(selectedTool.id) ?? selectedTool) : null;
  const style = freshTool?.style ?? null;

  // Update ALL selected tools (multi-edit safe, undo-safe)
  const updateStyle = useCallback((updates: Partial<ToolStyle>) => {
    if (!selectedTool) return;
    getToolsEngine().updateSelectedToolsStyle(updates);
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
    const duplicateData = { ...toolData };

    if ('price' in duplicateData && typeof duplicateData.price === 'number') {
      duplicateData.price += 10;
    }

    const newTool = engine.addTool(duplicateData as Omit<Tool, 'id' | 'createdAt' | 'updatedAt' | 'selected' | 'zIndex'>);
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

  if (!selectedTool || !style) {
    return null;
  }

  return (
    <div
      ref={barRef}
      className="absolute z-30 select-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, 0)',
      }}
      onMouseDown={(e) => { e.stopPropagation(); onInteractionStart?.(); }}
      onPointerDown={(e) => { e.stopPropagation(); onInteractionStart?.(); }}
    >
      {/* Main toolbar container */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-2xl cursor-move"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.95)',
          border: `1px solid ${colors.gridColor}`,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(34, 197, 94, 0.3)',
        }}
        onMouseDown={handleDragStart}
      >
        {/* Tool Type Badge - Enhanced for Long/Short positions */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: selectedTool.type === 'longPosition'
              ? 'rgba(34, 197, 94, 0.15)'
              : selectedTool.type === 'shortPosition'
                ? 'rgba(239, 68, 68, 0.15)'
                : colors.background,
            color: selectedTool.type === 'longPosition'
              ? '#22c55e'
              : selectedTool.type === 'shortPosition'
                ? '#ef4444'
                : colors.textPrimary,
            border: selectedTool.type === 'longPosition'
              ? '1px solid rgba(34, 197, 94, 0.3)'
              : selectedTool.type === 'shortPosition'
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : 'none',
          }}
        >
          <span className="text-sm">{getToolIcon(selectedTool.type)}</span>
          <span className="hidden sm:inline font-semibold">{getToolTypeLabel(selectedTool.type)}</span>
        </div>

        <Divider color={colors.gridColor} />

        {/* Color Picker */}
        <div className="relative">
          <button
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowWidthPicker(false);
              setShowStylePicker(false);
            }}
            className="w-7 h-7 rounded-lg border-2 hover:scale-105 transition-transform"
            style={{
              backgroundColor: style.color,
              borderColor: showColorPicker ? '#22c55e' : 'rgba(255,255,255,0.2)',
            }}
            title="Color"
          />
          {showColorPicker && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              style={{
                backgroundColor: 'rgba(15, 15, 20, 0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
                minWidth: 240,
                backdropFilter: 'blur(20px)',
              }}
            >
              <ColorPicker
                value={style.color}
                onChange={(c) => updateStyle({ color: c })}
                label=""
                showAlpha
                alpha={style.opacity ?? 1}
                onAlphaChange={(a) => updateStyle({ opacity: a })}
              />
            </div>
          )}
        </div>

        {/* Line Width */}
        <div className="relative">
          <button
            onClick={() => {
              setShowWidthPicker(!showWidthPicker);
              setShowColorPicker(false);
              setShowStylePicker(false);
            }}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: colors.textPrimary }}
            title={`Width: ${style.lineWidth}px`}
          >
            <div
              className="rounded-full"
              style={{
                width: Math.min(style.lineWidth * 2 + 4, 14),
                height: Math.min(style.lineWidth * 2 + 4, 14),
                backgroundColor: 'currentColor',
              }}
            />
          </button>
          {showWidthPicker && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-1 rounded-lg shadow-2xl z-50 flex gap-0.5"
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.gridColor}`,
              }}
            >
              {LINE_WIDTHS.map(width => (
                <button
                  key={width}
                  onClick={() => {
                    updateStyle({ lineWidth: width });
                    setShowWidthPicker(false);
                  }}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded hover:bg-white/10 transition-colors"
                  style={{
                    backgroundColor: style.lineWidth === width ? colors.background : 'transparent',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: width * 2 + 4,
                      height: width * 2 + 4,
                      backgroundColor: colors.textPrimary,
                    }}
                  />
                  <span className="text-[9px]" style={{ color: colors.textMuted }}>{width}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line Style */}
        <div className="relative">
          <button
            onClick={() => {
              setShowStylePicker(!showStylePicker);
              setShowColorPicker(false);
              setShowWidthPicker(false);
            }}
            className="px-2 py-1 text-[11px] font-mono rounded-lg hover:bg-white/10 transition-colors"
            style={{ color: colors.textPrimary }}
            title="Line Style"
          >
            {LINE_STYLES.find(s => s.value === style.lineStyle)?.icon || '───'}
          </button>
          {showStylePicker && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-1 rounded-lg shadow-2xl z-50"
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.gridColor}`,
              }}
            >
              {LINE_STYLES.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    updateStyle({ lineStyle: value });
                    setShowStylePicker(false);
                  }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/10 transition-colors"
                  style={{
                    backgroundColor: style.lineStyle === value ? colors.background : 'transparent',
                  }}
                >
                  <span className="text-[11px] font-mono w-10" style={{ color: colors.textPrimary }}>{icon}</span>
                  <span className="text-[10px]" style={{ color: colors.textMuted }}>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider color={colors.gridColor} />

        {/* Opacity Slider */}
        <div className="flex items-center gap-1 px-1">
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={style.opacity ?? 1}
            onChange={(e) => updateStyle({ opacity: parseFloat(e.target.value) })}
            className="w-10 h-1 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
            title={`Opacity: ${Math.round((style.opacity ?? 1) * 100)}%`}
          />
          <span className="text-[9px] w-6" style={{ color: colors.textMuted }}>
            {Math.round((style.opacity ?? 1) * 100)}%
          </span>
        </div>

        <Divider color={colors.gridColor} />

        {/* Quick Actions */}
        <div className="flex items-center gap-0.5">
          {/* Lock */}
          <ActionButton
            onClick={handleToggleLock}
            active={freshTool!.locked}
            activeColor="#fbbf24"
            colors={colors}
            title={freshTool!.locked ? 'Unlock' : 'Lock'}
          >
            {freshTool!.locked ? <LockClosedIcon /> : <LockOpenIcon />}
          </ActionButton>

          {/* Visibility */}
          <ActionButton
            onClick={handleToggleVisible}
            active={!freshTool!.visible}
            activeColor={colors.textMuted}
            colors={colors}
            title={freshTool!.visible ? 'Hide' : 'Show'}
          >
            {freshTool!.visible ? <EyeIcon /> : <EyeSlashIcon />}
          </ActionButton>

          {/* Duplicate */}
          <ActionButton
            onClick={handleDuplicate}
            colors={colors}
            title="Duplicate (Ctrl+D)"
          >
            <DuplicateIcon />
          </ActionButton>

          {/* Delete */}
          <ActionButton
            onClick={handleDelete}
            colors={colors}
            hoverColor="rgba(239, 68, 68, 0.2)"
            title="Delete (Del)"
          >
            <TrashIcon />
          </ActionButton>
        </div>

        <Divider color={colors.gridColor} />

        {/* Advanced Settings */}
        <button
          onClick={() => onOpenAdvanced?.(selectedTool)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: colors.textMuted }}
          title="Advanced Settings"
        >
          <SettingsIcon />
        </button>

        {/* Close */}
        <button
          onClick={() => {
            getToolsEngine().deselectAll();
            onClose?.();
          }}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          style={{ color: colors.textMuted }}
          title="Close (Esc)"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Drag indicator */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[var(--border)] rounded-full opacity-50" />
    </div>
  );
}

// ============ COMPONENTS ============

function Divider({ color }: { color: string }) {
  return <div className="w-px h-5 mx-0.5" style={{ backgroundColor: color, opacity: 0.5 }} />;
}

interface ActionButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  activeColor?: string;
  hoverColor?: string;
  colors: { textMuted: string };
  title: string;
}

function ActionButton({ onClick, children, active, activeColor, hoverColor, colors, title }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded transition-colors"
      style={{
        color: active ? activeColor : colors.textMuted,
        backgroundColor: active ? `${activeColor}20` : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = hoverColor || 'rgba(255,255,255,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
      title={title}
    >
      {children}
    </button>
  );
}

// ============ ICONS ============

function LockClosedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ============ HELPERS ============

function getToolTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    trendline: 'Trend',
    horizontalLine: 'H-Line',
    horizontalRay: 'Ray',
    verticalLine: 'V-Line',
    rectangle: 'Rect',
    fibRetracement: 'Fib',
    longPosition: 'Long',
    shortPosition: 'Short',
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
    fibRetracement: '📐',
    longPosition: '⬆',
    shortPosition: '⬇',
    text: 'T',
  };
  return icons[type] || '•';
}
