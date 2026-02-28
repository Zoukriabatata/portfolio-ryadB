'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useToolSettingsStore } from '@/stores/useToolSettingsStore';
import { useCrosshairStore, type CrosshairSettings } from '@/stores/useCrosshairStore';
import type { ToolType, LineStyle, Tool } from '@/lib/tools/ToolsEngine';
import { getToolsEngine } from '@/lib/tools/ToolsEngine';

/**
 * ADVANCED TOOL SETTINGS MODAL
 *
 * Fenêtre flottante déplaçable pour les réglages avancés des outils
 * - Apparaît sur la chart (superposée)
 * - Draggable par le header
 * - Paramètres avancés par type d'outil
 * - Inclut les réglages du crosshair
 */

interface AdvancedToolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: ToolType | string;
  selectedTool?: Tool | null; // Currently selected tool on chart for live updates
  initialPosition?: { x: number; y: number };
  theme: {
    colors: {
      surface: string;
      border: string;
      text: string;
      textSecondary: string;
      textMuted: string;
      toolActive: string;
      background: string;
    };
  };
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

const FIB_DEFAULT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

// Tool type aliases - normalize to canonical engine types
const TOOL_TYPE_ALIASES: Record<string, string> = {
  hline: 'horizontalLine',
  vline: 'verticalLine',
  fibonacciRetracement: 'fibRetracement',
};

// Normalize tool type to match engine types
function normalizeToolType(type: string): string {
  return TOOL_TYPE_ALIASES[type] || type;
}

export default function AdvancedToolSettingsModal({
  isOpen,
  onClose,
  activeTool,
  selectedTool,
  initialPosition = { x: 100, y: 100 },
  theme,
}: AdvancedToolSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const { getToolDefault, setToolDefault } = useToolSettingsStore();
  const crosshairStore = useCrosshairStore();
  const defaultSettings = getToolDefault(activeTool);

  // Use the selected tool's actual values if available, otherwise use defaults
  // Merge style properties with direct tool properties
  const toolSettings = selectedTool
    ? {
        ...defaultSettings,
        color: selectedTool.style?.color || defaultSettings.color,
        lineWidth: selectedTool.style?.lineWidth || defaultSettings.lineWidth,
        lineStyle: selectedTool.style?.lineStyle || defaultSettings.lineStyle,
        extendLeft: (selectedTool as any).extendLeft ?? defaultSettings.extendLeft,
        extendRight: (selectedTool as any).extendRight ?? defaultSettings.extendRight,
        showPrice: (selectedTool as any).showPrice ?? (selectedTool as any).showPrices ?? defaultSettings.showPrice,
        showTime: (selectedTool as any).showTime ?? defaultSettings.showTime,
        showLabels: (selectedTool as any).showLabels ?? defaultSettings.showLabels,
        showRR: (selectedTool as any).showRR,
        showPnL: (selectedTool as any).showPnL,
        fillOpacity: selectedTool.style?.fillOpacity ?? defaultSettings.fillOpacity,
      } as Record<string, unknown>
    : defaultSettings;

  // Tab state for different settings sections
  const [activeTab, setActiveTab] = useState<'tool' | 'crosshair'>('tool');

  // Dragging logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== headerRef.current && !headerRef.current?.contains(e.target as Node)) {
      return;
    }
    e.preventDefault();
    setDragState({
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: position.x,
      offsetY: position.y,
    });
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.isDragging) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;

      setPosition({
        x: Math.max(0, dragState.offsetX + deltaX),
        y: Math.max(0, dragState.offsetY + deltaY),
      });
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({ ...prev, isDragging: false }));
    };

    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const TOOL_LABELS: Record<string, string> = {
    trendline: 'Ligne de Tendance',
    horizontalLine: 'Ligne Horizontale',
    hline: 'Ligne Horizontale',
    horizontalRay: 'Rayon Horizontal',
    ray: 'Rayon',
    verticalLine: 'Ligne Verticale',
    vline: 'Ligne Verticale',
    rectangle: 'Rectangle',
    fibRetracement: 'Fibonacci',
    fibonacciRetracement: 'Fibonacci',
    longPosition: 'Position Long',
    shortPosition: 'Position Short',
    text: 'Texte',
    parallelChannel: 'Canal Parallèle',
    arrow: 'Flèche',
    brush: 'Pinceau',
    highlighter: 'Surligneur',
    measure: 'Mesure',
    crosshair: 'Crosshair',
    cursor: 'Curseur',
  };

  const toolLabel = TOOL_LABELS[activeTool] || activeTool;

  return (
    <div
      ref={modalRef}
      className="fixed z-50 rounded-xl shadow-2xl overflow-hidden draggable-modal"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 320,
        maxWidth: 400,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px ${theme.colors.border}`,
      }}
    >
      {/* Header - Draggable */}
      <div
        ref={headerRef}
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-4 py-3 border-b cursor-move select-none"
        style={{
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 hover:brightness-110 cursor-pointer" onClick={onClose} />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          </div>
          <span className="text-sm font-semibold ml-2" style={{ color: theme.colors.text }}>
            Réglages - {toolLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--surface)]/50 transition-colors"
          style={{ color: theme.colors.textMuted }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: theme.colors.border }}>
        <button
          onClick={() => setActiveTab('tool')}
          className="flex-1 px-4 py-2.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: activeTab === 'tool' ? theme.colors.toolActive + '20' : 'transparent',
            color: activeTab === 'tool' ? theme.colors.toolActive : theme.colors.textSecondary,
            borderBottom: activeTab === 'tool' ? `2px solid ${theme.colors.toolActive}` : '2px solid transparent',
          }}
        >
          Outil
        </button>
        <button
          onClick={() => setActiveTab('crosshair')}
          className="flex-1 px-4 py-2.5 text-xs font-medium transition-colors"
          style={{
            backgroundColor: activeTab === 'crosshair' ? theme.colors.toolActive + '20' : 'transparent',
            color: activeTab === 'crosshair' ? theme.colors.toolActive : theme.colors.textSecondary,
            borderBottom: activeTab === 'crosshair' ? `2px solid ${theme.colors.toolActive}` : '2px solid transparent',
          }}
        >
          Crosshair
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {activeTab === 'tool' ? (
          <ToolSettingsContent
            activeTool={activeTool}
            toolSettings={toolSettings}
            setToolDefault={setToolDefault}
            selectedTool={selectedTool}
            theme={theme}
          />
        ) : (
          <CrosshairSettingsContent
            crosshairStore={crosshairStore}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
}

// Tool Settings Content
function ToolSettingsContent({
  activeTool,
  toolSettings,
  setToolDefault,
  selectedTool,
  theme,
}: {
  activeTool: string;
  toolSettings: Record<string, unknown>;
  setToolDefault: (tool: string, settings: Record<string, unknown>) => void;
  selectedTool?: Tool | null;
  theme: AdvancedToolSettingsModalProps['theme'];
}) {
  const handleChange = (key: string, value: unknown) => {
    // Update defaults for future tools (store both alias and canonical type)
    setToolDefault(activeTool, { [key]: value });
    const canonicalType = normalizeToolType(activeTool);
    if (canonicalType !== activeTool) {
      setToolDefault(canonicalType, { [key]: value });
    }

    // Also update the currently selected tool on the chart for live preview
    // Use normalized type comparison to handle aliases (hline vs horizontalLine)
    const selectedToolType = selectedTool?.type || '';
    const normalizedActiveTool = normalizeToolType(activeTool);

    if (selectedTool && selectedToolType === normalizedActiveTool) {
      const toolsEngine = getToolsEngine();

      // Map settings key to tool property - handle style vs direct props
      const styleKeys = ['color', 'lineWidth', 'lineStyle', 'fillOpacity'];
      if (styleKeys.includes(key)) {
        // Update style property
        toolsEngine.updateTool(selectedTool.id, {
          style: { ...selectedTool.style, [key]: value },
        } as Partial<Tool>);
      } else {
        // Update direct property
        toolsEngine.updateTool(selectedTool.id, { [key]: value } as Partial<Tool>);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Appearance Section */}
      <div>
        <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
          Apparence
        </h4>

        {/* Color */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Couleur</span>
          <input
            type="color"
            value={(toolSettings.color as string) || '#3b82f6'}
            onChange={(e) => handleChange('color', e.target.value)}
            className="w-8 h-6 rounded cursor-pointer"
          />
        </div>

        {/* Line Width */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Épaisseur</span>
          <input
            type="range"
            min="1"
            max="10"
            value={(toolSettings.lineWidth as number) || 2}
            onChange={(e) => handleChange('lineWidth', parseInt(e.target.value))}
            className="w-24 accent-[var(--primary)]"
          />
          <span className="text-xs w-6 text-right" style={{ color: theme.colors.text }}>
            {(toolSettings.lineWidth as number) || 2}px
          </span>
        </div>

        {/* Line Style */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Style</span>
          <select
            value={(toolSettings.lineStyle as string) || 'solid'}
            onChange={(e) => handleChange('lineStyle', e.target.value)}
            className="px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <option value="solid">Solide</option>
            <option value="dashed">Tirets</option>
            <option value="dotted">Points</option>
          </select>
        </div>

        {/* Fill Opacity (for rectangle, positions) */}
        {['rectangle', 'longPosition', 'shortPosition'].includes(normalizeToolType(activeTool)) && (
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Opacité remplissage</span>
            <input
              type="range"
              min="0"
              max="100"
              value={((toolSettings.fillOpacity as number) || 0.1) * 100}
              onChange={(e) => handleChange('fillOpacity', parseInt(e.target.value) / 100)}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="text-xs w-8 text-right" style={{ color: theme.colors.text }}>
              {Math.round(((toolSettings.fillOpacity as number) || 0.1) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Extension Options - For Trendline, Rays */}
      {['trendline', 'horizontalRay', 'ray'].includes(normalizeToolType(activeTool)) && (
        <div>
          <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
            Extension
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.extendLeft as boolean) || false}
                onChange={(e) => handleChange('extendLeft', e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Étendre à gauche</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.extendRight as boolean) || false}
                onChange={(e) => handleChange('extendRight', e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Étendre à droite</span>
            </label>
          </div>
        </div>
      )}

      {/* Extension Options - For Fibonacci (IMPORTANT: No extension by default) */}
      {normalizeToolType(activeTool) === 'fibRetracement' && (
        <div>
          <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
            Extension des lignes
          </h4>
          <p className="text-[10px] mb-2" style={{ color: theme.colors.textMuted }}>
            Par défaut: aucune extension (lignes limitées aux points d'ancrage)
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.extendLeft as boolean) || false}
                onChange={(e) => handleChange('extendLeft', e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Étendre à gauche</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.extendRight as boolean) || false}
                onChange={(e) => handleChange('extendRight', e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Étendre à droite</span>
            </label>
          </div>
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.showFills as boolean) ?? true}
                onChange={(e) => handleChange('showFills', e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Afficher les zones colorées</span>
            </label>
          </div>
        </div>
      )}

      {/* Labels Options */}
      {['horizontalLine', 'verticalLine', 'fibRetracement'].includes(normalizeToolType(activeTool)) && (
        <div>
          <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
            Labels
          </h4>
          <div className="space-y-2">
            {normalizeToolType(activeTool) === 'horizontalLine' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(toolSettings.showPrice as boolean) ?? true}
                  onChange={(e) => handleChange('showPrice', e.target.checked)}
                  className="w-4 h-4 accent-[var(--primary)]"
                />
                <span className="text-xs" style={{ color: theme.colors.text }}>Afficher le prix</span>
              </label>
            )}
            {normalizeToolType(activeTool) === 'verticalLine' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(toolSettings.showTime as boolean) ?? true}
                  onChange={(e) => handleChange('showTime', e.target.checked)}
                  className="w-4 h-4 accent-[var(--primary)]"
                />
                <span className="text-xs" style={{ color: theme.colors.text }}>Afficher l'heure</span>
              </label>
            )}
            {normalizeToolType(activeTool) === 'fibRetracement' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(toolSettings.showLabels as boolean) ?? true}
                    onChange={(e) => handleChange('showLabels', e.target.checked)}
                    className="w-4 h-4 accent-[var(--primary)]"
                  />
                  <span className="text-xs" style={{ color: theme.colors.text }}>Afficher les niveaux</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(toolSettings.showPrices as boolean) ?? true}
                    onChange={(e) => handleChange('showPrices', e.target.checked)}
                    className="w-4 h-4 accent-[var(--primary)]"
                  />
                  <span className="text-xs" style={{ color: theme.colors.text }}>Afficher les prix</span>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* Rectangle Zones */}
      {activeTool === 'rectangle' && (
        <div>
          <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
            Zones
          </h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.showMedianLine as boolean) ?? true}
                onChange={(e) => handleChange('showMedianLine', e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Ligne médiane (50%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.showZones as boolean) || false}
                onChange={(e) => handleChange('showZones', e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Afficher zones (25%, 75%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(toolSettings.showPriceLabels as boolean) ?? true}
                onChange={(e) => handleChange('showPriceLabels', e.target.checked)}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <span className="text-xs" style={{ color: theme.colors.text }}>Labels de prix</span>
            </label>
          </div>
        </div>
      )}

      {/* Position Tool Settings - Enhanced Design */}
      {['longPosition', 'shortPosition'].includes(normalizeToolType(activeTool)) && (
        <div className="space-y-4">
          {/* Position Type Header */}
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              backgroundColor: activeTool === 'longPosition'
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${activeTool === 'longPosition'
                ? 'rgba(34, 197, 94, 0.25)'
                : 'rgba(239, 68, 68, 0.25)'}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{
                backgroundColor: activeTool === 'longPosition'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : 'rgba(239, 68, 68, 0.2)',
              }}
            >
              {activeTool === 'longPosition' ? '⬆' : '⬇'}
            </div>
            <div>
              <h4
                className="text-sm font-semibold"
                style={{
                  color: activeTool === 'longPosition' ? '#22c55e' : '#ef4444',
                }}
              >
                Position {activeTool === 'longPosition' ? 'Long' : 'Short'}
              </h4>
              <p className="text-[10px]" style={{ color: theme.colors.textMuted }}>
                {activeTool === 'longPosition' ? 'Achat / Haussier' : 'Vente / Baissier'}
              </p>
            </div>
          </div>

          {/* Display Options */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Affichage
            </h4>
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📊</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Risk/Reward</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Afficher le ratio R:R</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showRR', !(toolSettings.showRR ?? true))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showRR ?? true)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showRR ?? true) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">💰</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>P&L Estimé</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Profit/Perte potentiel</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showPnL', !(toolSettings.showPnL ?? false))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showPnL ?? false)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showPnL ?? false) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎯</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Labels de prix</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Entrée, SL, TP</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showPriceLabels', !(toolSettings.showPriceLabels ?? true))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showPriceLabels ?? true)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showPriceLabels ?? true) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Extension & Zone Settings */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Extension & Zones
            </h4>
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">➡️</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Étendre à droite</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Position s'étend au bord droit</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('extendRight', !(toolSettings.extendRight ?? false))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.extendRight ?? false)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.extendRight ?? false) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎨</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Zones colorées</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Fond profit/risque</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showZoneFill', !(toolSettings.showZoneFill ?? true))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showZoneFill ?? true)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showZoneFill ?? true) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📱</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Mode compact</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Design minimal</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('compactMode', !(toolSettings.compactMode ?? false))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.compactMode ?? false)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.compactMode ?? false) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Position Sizing */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Position Sizing
            </h4>
            <div className="space-y-3">
              {/* Account Size */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">💼</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Taille du compte</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Capital total en USD</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>$</span>
                  <input
                    type="number"
                    value={Number(toolSettings.accountSize) || 10000}
                    onChange={(e) => handleChange('accountSize', parseFloat(e.target.value) || 10000)}
                    className="w-20 h-6 text-xs font-mono rounded px-2 text-right focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    style={{ backgroundColor: theme.colors.surface, color: theme.colors.text, border: `1px solid ${theme.colors.border}` }}
                  />
                </div>
              </div>

              {/* Risk % */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚠️</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Risque par trade</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>% du compte risqué</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[0.5, 1, 2, 3, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => handleChange('riskPercent', r)}
                      className="px-2 py-1 rounded text-[10px] font-mono transition-colors"
                      style={{
                        backgroundColor: (toolSettings.riskPercent ?? 1) === r
                          ? (activeTool === 'longPosition' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)')
                          : theme.colors.background,
                        color: (toolSettings.riskPercent ?? 1) === r
                          ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                          : theme.colors.textMuted,
                        border: `1px solid ${(toolSettings.riskPercent ?? 1) === r
                          ? (activeTool === 'longPosition' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)')
                          : theme.colors.border}`,
                      }}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Leverage */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚡</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Levier</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Multiplicateur de position</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {[1, 2, 5, 10, 25, 50, 125].map(l => (
                    <button
                      key={l}
                      onClick={() => handleChange('leverage', l)}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
                      style={{
                        backgroundColor: (toolSettings.leverage ?? 1) === l
                          ? (activeTool === 'longPosition' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)')
                          : theme.colors.background,
                        color: (toolSettings.leverage ?? 1) === l
                          ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                          : theme.colors.textMuted,
                        border: `1px solid ${(toolSettings.leverage ?? 1) === l
                          ? (activeTool === 'longPosition' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)')
                          : theme.colors.border}`,
                      }}
                    >
                      {l}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Show Position Size toggle */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">📐</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>Afficher taille</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Quantité calculée sur le chart</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showPositionSize', !(toolSettings.showPositionSize ?? false))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showPositionSize ?? false)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showPositionSize ?? false) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>

              {/* Show Dollar P&L toggle */}
              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: theme.colors.background }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">💲</span>
                  <div>
                    <span className="text-xs" style={{ color: theme.colors.text }}>P&L en dollars</span>
                    <p className="text-[9px]" style={{ color: theme.colors.textMuted }}>Afficher +$xxx / -$xxx</p>
                  </div>
                </div>
                <button
                  onClick={() => handleChange('showDollarPnL', !(toolSettings.showDollarPnL ?? false))}
                  className="w-10 h-5 rounded-full transition-all"
                  style={{
                    backgroundColor: (toolSettings.showDollarPnL ?? false)
                      ? (activeTool === 'longPosition' ? '#22c55e' : '#ef4444')
                      : theme.colors.textMuted,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform"
                    style={{
                      transform: (toolSettings.showDollarPnL ?? false) ? 'translateX(20px)' : 'translateX(2px)',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Presets Rapides
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  handleChange('showRR', true);
                  handleChange('showPnL', true);
                  handleChange('showPriceLabels', true);
                  handleChange('showZoneFill', true);
                  handleChange('extendRight', false);
                }}
                className="px-3 py-2 rounded-lg text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                Tout afficher
              </button>
              <button
                onClick={() => {
                  handleChange('showRR', false);
                  handleChange('showPnL', false);
                  handleChange('showPriceLabels', false);
                  handleChange('showZoneFill', false);
                  handleChange('compactMode', true);
                }}
                className="px-3 py-2 rounded-lg text-[10px] font-medium transition-colors"
                style={{
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                Minimal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Tool Settings - Full Configuration */}
      {activeTool === 'text' && (
        <div className="space-y-4">
          {/* Anchor Mode - CRITICAL for text behavior */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Mode d'ancrage
            </h4>
            <p className="text-[10px] mb-2" style={{ color: theme.colors.textMuted }}>
              Définit comment le texte se comporte lors du pan/zoom
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleChange('anchorMode', 'price-time')}
                className="p-3 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: (toolSettings.anchorMode ?? 'price-time') === 'price-time'
                    ? 'rgba(59, 130, 246, 0.2)'
                    : theme.colors.background,
                  border: `1px solid ${(toolSettings.anchorMode ?? 'price-time') === 'price-time' ? '#3b82f6' : theme.colors.border}`,
                  color: (toolSettings.anchorMode ?? 'price-time') === 'price-time' ? '#3b82f6' : theme.colors.text,
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">⚓</span>
                  <span>Ancré</span>
                  <span className="text-[9px]" style={{ color: theme.colors.textMuted }}>
                    Suit le prix/temps
                  </span>
                </div>
              </button>
              <button
                onClick={() => handleChange('anchorMode', 'screen-fixed')}
                className="p-3 rounded-lg text-xs font-medium transition-all"
                style={{
                  backgroundColor: toolSettings.anchorMode === 'screen-fixed'
                    ? 'rgba(59, 130, 246, 0.2)'
                    : theme.colors.background,
                  border: `1px solid ${toolSettings.anchorMode === 'screen-fixed' ? '#3b82f6' : theme.colors.border}`,
                  color: toolSettings.anchorMode === 'screen-fixed' ? '#3b82f6' : theme.colors.text,
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg">📌</span>
                  <span>Fixe</span>
                  <span className="text-[9px]" style={{ color: theme.colors.textMuted }}>
                    Position écran fixe
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Typography */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Typographie
            </h4>

            {/* Font Size */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Taille</span>
              <input
                type="range"
                min="10"
                max="32"
                value={(toolSettings.fontSize as number) || 14}
                onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
                className="w-24 accent-blue-500"
              />
              <span className="text-xs w-8 text-right" style={{ color: theme.colors.text }}>
                {(toolSettings.fontSize as number) || 14}px
              </span>
            </div>

            {/* Font Weight */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Graisse</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleChange('fontWeight', 'normal')}
                  className="px-3 py-1 rounded text-xs transition-colors"
                  style={{
                    backgroundColor: (toolSettings.fontWeight ?? 'normal') === 'normal' ? '#3b82f6' : theme.colors.background,
                    color: (toolSettings.fontWeight ?? 'normal') === 'normal' ? '#fff' : theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  Normal
                </button>
                <button
                  onClick={() => handleChange('fontWeight', 'bold')}
                  className="px-3 py-1 rounded text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: toolSettings.fontWeight === 'bold' ? '#3b82f6' : theme.colors.background,
                    color: toolSettings.fontWeight === 'bold' ? '#fff' : theme.colors.text,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  Gras
                </button>
              </div>
            </div>

            {/* Text Alignment */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Alignement</span>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => handleChange('textAlign', align)}
                    className="w-8 h-8 rounded flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: (toolSettings.textAlign ?? 'left') === align ? '#3b82f6' : theme.colors.background,
                      color: (toolSettings.textAlign ?? 'left') === align ? '#fff' : theme.colors.text,
                      border: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    {align === 'left' && '⬅'}
                    {align === 'center' && '⬌'}
                    {align === 'right' && '➡'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Colors */}
          <div>
            <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
              Couleurs
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: theme.colors.textSecondary }}>Texte</label>
                <input
                  type="color"
                  value={(toolSettings.fontColor as string) || '#ffffff'}
                  onChange={(e) => handleChange('fontColor', e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: theme.colors.textSecondary }}>Fond</label>
                <input
                  type="color"
                  value={(toolSettings.backgroundColor as string) || '#000000'}
                  onChange={(e) => handleChange('backgroundColor', e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Edit Hint */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)' }}
          >
            <p className="text-[10px]" style={{ color: '#3b82f6' }}>
              💡 Double-cliquez sur le texte pour l'éditer
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Crosshair Settings Content
function CrosshairSettingsContent({
  crosshairStore,
  theme,
}: {
  crosshairStore: CrosshairSettings;
  theme: AdvancedToolSettingsModalProps['theme'];
}) {
  return (
    <div className="space-y-4">
      {/* Appearance */}
      <div>
        <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
          Apparence
        </h4>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Couleur</span>
          <input
            type="color"
            value={crosshairStore.color}
            onChange={(e) => crosshairStore.setColor(e.target.value)}
            className="w-8 h-6 rounded cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Épaisseur</span>
          <input
            type="range"
            min="1"
            max="5"
            value={crosshairStore.lineWidth}
            onChange={(e) => crosshairStore.setLineWidth(parseInt(e.target.value))}
            className="w-24 accent-[var(--primary)]"
          />
          <span className="text-xs w-6 text-right" style={{ color: theme.colors.text }}>
            {crosshairStore.lineWidth}px
          </span>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Style</span>
          <select
            value={crosshairStore.lineStyle}
            onChange={(e) => crosshairStore.setLineStyle(e.target.value as 'solid' | 'dashed' | 'dotted')}
            className="px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <option value="solid">Solide</option>
            <option value="dashed">Tirets</option>
            <option value="dotted">Points</option>
          </select>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Opacité</span>
          <input
            type="range"
            min="10"
            max="100"
            value={crosshairStore.opacity * 100}
            onChange={(e) => crosshairStore.setOpacity(parseInt(e.target.value) / 100)}
            className="w-24 accent-[var(--primary)]"
          />
          <span className="text-xs w-8 text-right" style={{ color: theme.colors.text }}>
            {Math.round(crosshairStore.opacity * 100)}%
          </span>
        </div>
      </div>

      {/* Visibility */}
      <div>
        <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
          Visibilité
        </h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={crosshairStore.showHorizontalLine}
              onChange={(e) => crosshairStore.setShowHorizontalLine(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-xs" style={{ color: theme.colors.text }}>Ligne horizontale</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={crosshairStore.showVerticalLine}
              onChange={(e) => crosshairStore.setShowVerticalLine(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-xs" style={{ color: theme.colors.text }}>Ligne verticale</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={crosshairStore.showPriceLabel}
              onChange={(e) => crosshairStore.setShowPriceLabel(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-xs" style={{ color: theme.colors.text }}>Label de prix</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={crosshairStore.showTimeLabel}
              onChange={(e) => crosshairStore.setShowTimeLabel(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)]"
            />
            <span className="text-xs" style={{ color: theme.colors.text }}>Label de temps</span>
          </label>
        </div>
      </div>

      {/* Magnet Mode */}
      <div>
        <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
          Mode Magnet
        </h4>
        <div className="space-y-2">
          {[
            { value: 'none', label: 'Désactivé', desc: 'Mouvement libre' },
            { value: 'ohlc', label: 'OHLC', desc: 'Accroche Open/High/Low/Close' },
            { value: 'close', label: 'Close', desc: 'Accroche au prix de clôture' },
          ].map((mode) => (
            <label key={mode.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="magnetMode"
                checked={crosshairStore.magnetMode === mode.value}
                onChange={() => crosshairStore.setMagnetMode(mode.value as 'none' | 'ohlc' | 'close')}
                className="w-4 h-4 accent-[var(--primary)]"
              />
              <div>
                <span className="text-xs" style={{ color: theme.colors.text }}>{mode.label}</span>
                <span className="text-[10px] ml-2" style={{ color: theme.colors.textMuted }}>
                  {mode.desc}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Label Style */}
      <div>
        <h4 className="text-xs font-semibold uppercase mb-3" style={{ color: theme.colors.textMuted }}>
          Style des labels
        </h4>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Fond</span>
          <input
            type="color"
            value={crosshairStore.labelBackground}
            onChange={(e) => crosshairStore.setLabelBackground(e.target.value)}
            className="w-8 h-6 rounded cursor-pointer"
          />
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: theme.colors.textSecondary }}>Texte</span>
          <input
            type="color"
            value={crosshairStore.labelTextColor}
            onChange={(e) => crosshairStore.setLabelTextColor(e.target.value)}
            className="w-8 h-6 rounded cursor-pointer"
          />
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={() => crosshairStore.resetToDefaults()}
        className="w-full py-2 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: theme.colors.background,
          color: theme.colors.textSecondary,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        Réinitialiser les paramètres
      </button>
    </div>
  );
}
