'use client';

/**
 * LAYOUT MANAGER PANEL
 *
 * Gestion des layouts sauvegardés :
 * - Liste des layouts
 * - Sauvegarde / Chargement
 * - Export / Import
 * - Suppression
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  layoutPersistence,
  LayoutMeta,
  ChartSettings,
  LayoutData,
} from '@/lib/tools/LayoutPersistence';
import {
  FootprintColors,
  FootprintFonts,
  FootprintFeatures,
  ImbalanceSettings,
} from '@/stores/useFootprintSettingsStore';

interface LayoutManagerPanelProps {
  currentChart: ChartSettings;
  currentColors: FootprintColors;
  currentFonts: FootprintFonts;
  currentFeatures: FootprintFeatures;
  currentImbalance: ImbalanceSettings;
  currentLayout: LayoutData['layout'];
  onLoadLayout: (layout: LayoutData) => void;
  colors: {
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridColor: string;
    deltaPositive: string;
    deltaNegative: string;
    currentPriceColor: string;
  };
  onClose?: () => void;
}

export default function LayoutManagerPanel({
  currentChart,
  currentColors,
  currentFonts,
  currentFeatures,
  currentImbalance,
  currentLayout,
  onLoadLayout,
  colors,
  onClose,
}: LayoutManagerPanelProps) {
  const [layouts, setLayouts] = useState<LayoutMeta[]>([]);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [hasAutoSave, setHasAutoSave] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load layouts list
  useEffect(() => {
    refreshLayouts();
  }, []);

  const refreshLayouts = useCallback(() => {
    const allLayouts = layoutPersistence.getAllLayouts();
    setLayouts(allLayouts.sort((a, b) => b.updatedAt - a.updatedAt));
    setHasAutoSave(layoutPersistence.hasAutoSave());
  }, []);

  /**
   * Save current layout
   */
  const handleSave = useCallback(() => {
    if (!newLayoutName.trim()) return;

    setSaving(true);
    try {
      layoutPersistence.saveLayout(
        newLayoutName.trim(),
        currentChart,
        currentColors,
        currentFonts,
        currentFeatures,
        currentImbalance,
        currentLayout
      );
      setNewLayoutName('');
      refreshLayouts();
    } finally {
      setSaving(false);
    }
  }, [
    newLayoutName,
    currentChart,
    currentColors,
    currentFonts,
    currentFeatures,
    currentImbalance,
    currentLayout,
    refreshLayouts,
  ]);

  /**
   * Load a layout
   */
  const handleLoad = useCallback((id: string) => {
    const layout = layoutPersistence.loadLayout(id);
    if (layout) {
      layoutPersistence.applyLayout(layout);
      onLoadLayout(layout);
      setSelectedLayoutId(id);
    }
  }, [onLoadLayout]);

  /**
   * Load auto-save
   */
  const handleLoadAutoSave = useCallback(() => {
    const autoSave = layoutPersistence.loadAutoSave();
    if (autoSave) {
      layoutPersistence.applyLayout(autoSave);
      onLoadLayout(autoSave as LayoutData);
    }
  }, [onLoadLayout]);

  /**
   * Delete a layout
   */
  const handleDelete = useCallback((id: string) => {
    if (confirm('Delete this layout?')) {
      layoutPersistence.deleteLayout(id);
      if (selectedLayoutId === id) {
        setSelectedLayoutId(null);
      }
      refreshLayouts();
    }
  }, [selectedLayoutId, refreshLayouts]);

  /**
   * Export a layout
   */
  const handleExport = useCallback((id: string) => {
    layoutPersistence.exportLayoutAsFile(id);
  }, []);

  /**
   * Export all layouts
   */
  const handleExportAll = useCallback(() => {
    const json = layoutPersistence.exportAllLayouts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `all-layouts-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Import layout from file
   */
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = await layoutPersistence.importLayoutFromFile(file);
    if (id) {
      refreshLayouts();
    } else {
      alert('Failed to import layout');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [refreshLayouts]);

  /**
   * Format date
   */
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Get storage usage
   */
  const storageUsage = layoutPersistence.getStorageUsage();
  const usagePercent = (storageUsage.used / (storageUsage.used + storageUsage.available)) * 100;

  return (
    <div
      className="p-3 space-y-4 overflow-y-auto max-h-[80vh]"
      style={{ backgroundColor: colors.surface }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm" style={{ color: colors.textPrimary }}>
          Layout Manager
        </h3>
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

      {/* Save new layout */}
      <div className="space-y-2">
        <label className="text-xs block" style={{ color: colors.textMuted }}>
          Save Current Layout
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLayoutName}
            onChange={(e) => setNewLayoutName(e.target.value)}
            placeholder="Layout name..."
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{
              backgroundColor: colors.background,
              color: colors.textPrimary,
              border: `1px solid ${colors.gridColor}`,
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={!newLayoutName.trim() || saving}
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
            style={{
              backgroundColor: colors.currentPriceColor,
              color: '#fff',
            }}
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Auto-save recovery */}
      {hasAutoSave && (
        <div
          className="p-2 rounded flex items-center justify-between"
          style={{ backgroundColor: colors.background }}
        >
          <div className="flex items-center gap-2">
            <span className="text-yellow-500">⚠</span>
            <span className="text-xs" style={{ color: colors.textSecondary }}>
              Auto-saved session available
            </span>
          </div>
          <button
            onClick={handleLoadAutoSave}
            className="px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: colors.currentPriceColor,
              color: '#fff',
            }}
          >
            Restore
          </button>
        </div>
      )}

      {/* Layouts list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs" style={{ color: colors.textMuted }}>
            Saved Layouts ({layouts.length})
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded text-xs"
              style={{ backgroundColor: colors.background, color: colors.textSecondary }}
              title="Import layout"
            >
              Import
            </button>
            <button
              onClick={handleExportAll}
              className="px-2 py-1 rounded text-xs"
              style={{ backgroundColor: colors.background, color: colors.textSecondary }}
              title="Export all layouts"
              disabled={layouts.length === 0}
            >
              Export All
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {layouts.length === 0 ? (
          <div
            className="p-4 rounded text-center text-xs"
            style={{ backgroundColor: colors.background, color: colors.textMuted }}
          >
            No saved layouts yet
          </div>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {layouts.map(layout => (
              <div
                key={layout.id}
                className="p-2 rounded transition-colors cursor-pointer group"
                style={{
                  backgroundColor: selectedLayoutId === layout.id
                    ? colors.currentPriceColor + '20'
                    : colors.background,
                  border: `1px solid ${selectedLayoutId === layout.id ? colors.currentPriceColor : 'transparent'}`,
                }}
                onClick={() => handleLoad(layout.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium" style={{ color: colors.textPrimary }}>
                      {layout.name}
                    </div>
                    <div className="text-[10px] flex items-center gap-2" style={{ color: colors.textMuted }}>
                      <span>{layout.symbol.toUpperCase()}</span>
                      <span>•</span>
                      <span>{layout.toolCount} tools</span>
                      <span>•</span>
                      <span>{formatDate(layout.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(layout.id);
                      }}
                      className="p-1 rounded hover:bg-white/10"
                      style={{ color: colors.textMuted }}
                      title="Export"
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(layout.id);
                      }}
                      className="p-1 rounded hover:bg-white/10"
                      style={{ color: colors.deltaNegative }}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage usage */}
      <div className="pt-2 border-t" style={{ borderColor: colors.gridColor }}>
        <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: colors.textMuted }}>
          <span>Storage Usage</span>
          <span>{(storageUsage.used / 1024).toFixed(1)} KB / {((storageUsage.used + storageUsage.available) / 1024 / 1024).toFixed(1)} MB</span>
        </div>
        <div
          className="h-1 rounded overflow-hidden"
          style={{ backgroundColor: colors.background }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${usagePercent}%`,
              backgroundColor: usagePercent > 80 ? colors.deltaNegative : colors.currentPriceColor,
            }}
          />
        </div>
      </div>

      {/* Info */}
      <div
        className="text-[10px] pt-2 border-t"
        style={{ borderColor: colors.gridColor, color: colors.textMuted }}
      >
        <div>Layouts are saved locally in your browser.</div>
        <div>Export layouts to keep backups or share them.</div>
      </div>
    </div>
  );
}
