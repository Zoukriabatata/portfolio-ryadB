'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCrosshairStore } from '@/stores/useCrosshairStore';
import type { ToolType, LineStyle } from '@/lib/tools/ToolsEngine';
import { getToolsEngine } from '@/lib/tools/ToolsEngine';
import { ColorPicker } from '@/components/tools/ColorPicker';

/**
 * SIMPLE TOOL SETTINGS BAR (Draggable)
 *
 * Barre de réglages rapide qui apparaît quand on sélectionne un outil
 * - Draggable par le header
 * - Reste visible jusqu'à clic extérieur ou ESC
 * - Couleur, Épaisseur, Style de ligne
 * - Bouton pour ouvrir les réglages avancés
 */

interface SimpleToolSettingsBarProps {
  activeTool: ToolType | string;
  onSettingsChange: (settings: Partial<ToolSettings>) => void;
  onOpenAdvanced: () => void;
  onClose?: () => void;
  persistUntilDismiss?: boolean; // Keep visible until explicit dismiss
  initialPosition?: { x: number; y: number };
  theme: {
    colors: {
      surface: string;
      border: string;
      text: string;
      textSecondary: string;
      textMuted: string;
      toolActive: string;
    };
  };
}

interface ToolSettings {
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  fillColor?: string;
  fillOpacity?: number;
}


const LINE_WIDTHS = [1, 2, 3, 4, 5];

const LINE_STYLES: { value: LineStyle; label: string; icon: string }[] = [
  { value: 'solid', label: 'Solide', icon: '━━━' },
  { value: 'dashed', label: 'Tirets', icon: '╌╌╌' },
  { value: 'dotted', label: 'Points', icon: '···' },
];

// Tools that should show the settings bar
const TOOLS_WITH_SETTINGS: (ToolType | string)[] = [
  'trendline',
  'ray',
  'horizontalLine',
  'hline',
  'horizontalRay',
  'verticalLine',
  'vline',
  'rectangle',
  'parallelChannel',
  'fibRetracement',
  'fibonacciRetracement',
  'fibExtension',
  'fibonacciExtension',
  'arrow',
  'brush',
  'highlighter',
  'measure',
  'longPosition',
  'shortPosition',
  'text',
];

export default function SimpleToolSettingsBar({
  activeTool,
  onSettingsChange,
  onOpenAdvanced,
  onClose,
  persistUntilDismiss = true,
  initialPosition,
  theme,
}: SimpleToolSettingsBarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLineStyles, setShowLineStyles] = useState(false);
  const [isHoveringSettings, setIsHoveringSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const barRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const lineStylesRef = useRef<HTMLDivElement>(null);

  // Get current tool defaults from engine (single source of truth)
  const engine = getToolsEngine();
  const toolSettings = engine.getDefaultStyle(activeTool as ToolType);
  const currentColor = toolSettings.color || '#3b82f6';
  const currentWidth = toolSettings.lineWidth || 2;
  const currentStyle = toolSettings.lineStyle || 'solid';

  // Handle click outside to close (if persistUntilDismiss is true)
  useEffect(() => {
    if (!persistUntilDismiss) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    // Delay adding the listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [persistUntilDismiss, onClose]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
      if (lineStylesRef.current && !lineStylesRef.current.contains(e.target as Node)) {
        setShowLineStyles(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('button, input')) return;

    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Don't show for cursor/crosshair
  if (!TOOLS_WITH_SETTINGS.includes(activeTool)) {
    return null;
  }

  const handleColorChange = (color: string) => {
    engine.setDefaultStyle(activeTool as ToolType, { color });
    onSettingsChange({ color });
    setShowColorPicker(false);
  };

  const handleWidthChange = (lineWidth: number) => {
    engine.setDefaultStyle(activeTool as ToolType, { lineWidth });
    onSettingsChange({ lineWidth });
  };

  const handleStyleChange = (lineStyle: LineStyle) => {
    engine.setDefaultStyle(activeTool as ToolType, { lineStyle });
    onSettingsChange({ lineStyle });
    setShowLineStyles(false);
  };

  return (
    <div
      ref={barRef}
      className="fixed z-50 animate-slideInLeft"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-xl"
        style={{
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drag Handle */}
        <div
          className="flex items-center gap-1 cursor-grab active:cursor-grabbing px-1 py-1 -ml-1 rounded hover:bg-white/10"
          onMouseDown={handleDragStart}
          title="Drag to move"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
            <circle cx="2" cy="2" r="1.5" fill={theme.colors.textMuted} />
            <circle cx="8" cy="2" r="1.5" fill={theme.colors.textMuted} />
            <circle cx="2" cy="7" r="1.5" fill={theme.colors.textMuted} />
            <circle cx="8" cy="7" r="1.5" fill={theme.colors.textMuted} />
            <circle cx="2" cy="12" r="1.5" fill={theme.colors.textMuted} />
            <circle cx="8" cy="12" r="1.5" fill={theme.colors.textMuted} />
          </svg>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Color Picker */}
        <div className="relative" ref={colorPickerRef}>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-7 h-7 rounded-md border-2 transition-all hover:scale-110 active:scale-95"
            style={{
              backgroundColor: currentColor,
              borderColor: showColorPicker ? theme.colors.toolActive : theme.colors.border,
              boxShadow: `0 0 8px ${currentColor}40`,
            }}
            title="Couleur"
          />

          {showColorPicker && (
            <div
              className="absolute top-full left-0 mt-2 p-3 rounded-xl shadow-2xl z-50 animate-slideDown"
              style={{
                backgroundColor: 'rgba(20, 20, 28, 0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                minWidth: 220,
              }}
            >
              <ColorPicker
                value={currentColor}
                onChange={(c) => handleColorChange(c)}
                label=""
              />
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Line Width */}
        <div className="flex items-center gap-1">
          {LINE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => handleWidthChange(width)}
              className="w-6 h-6 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
              style={{
                backgroundColor: currentWidth === width ? theme.colors.toolActive : 'transparent',
                color: currentWidth === width ? '#fff' : theme.colors.textSecondary,
              }}
              title={`${width}px`}
            >
              <div
                className="rounded-full"
                style={{
                  width: width * 2 + 2,
                  height: width * 2 + 2,
                  backgroundColor: 'currentColor',
                }}
              />
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Line Style */}
        <div className="relative" ref={lineStylesRef}>
          <button
            onClick={() => setShowLineStyles(!showLineStyles)}
            className="px-2 py-1 rounded text-xs font-mono transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showLineStyles ? theme.colors.toolActive : 'transparent',
              color: showLineStyles ? '#fff' : theme.colors.textSecondary,
            }}
            title="Style de ligne"
          >
            {LINE_STYLES.find((s) => s.value === currentStyle)?.icon || '━━━'}
          </button>

          {showLineStyles && (
            <div
              className="absolute top-full left-0 mt-2 py-1 rounded-lg shadow-xl z-50 animate-slideDown min-w-[100px]"
              style={{
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              {LINE_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => handleStyleChange(style.value)}
                  className="w-full px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-[var(--surface)]"
                  style={{
                    backgroundColor: currentStyle === style.value ? theme.colors.toolActive : 'transparent',
                    color: currentStyle === style.value ? '#fff' : theme.colors.text,
                  }}
                >
                  <span className="font-mono">{style.icon}</span>
                  <span>{style.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Advanced Settings Button */}
        <button
          onClick={onOpenAdvanced}
          onMouseEnter={() => setIsHoveringSettings(true)}
          onMouseLeave={() => setIsHoveringSettings(false)}
          className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'transparent',
            color: theme.colors.textSecondary,
          }}
          title="Réglages avancés"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300"
            style={{
              transform: isHoveringSettings ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95 hover:bg-red-500/20"
          style={{
            color: theme.colors.textMuted,
          }}
          title="Fermer (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
