/**
 * LAYOUT PERSISTENCE MANAGER
 *
 * Sauvegarde et restauration complète du layout :
 * - Outils de dessin
 * - Paramètres de style
 * - Configuration du chart
 * - Thème actif
 *
 * Prêt pour intégration backend API
 */

import type { Tool } from './types';
import { getToolsEngine } from './ToolsEngine';
import { FootprintColors, FootprintFonts, FootprintFeatures, ImbalanceSettings } from '@/stores/useFootprintSettingsStore';

// ============ TYPES ============

export interface ChartSettings {
  symbol: string;
  timeframe: number;
  tickSize: number;
}

export interface LayoutData {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  // Tools
  tools: Tool[];

  // Chart settings
  chart: ChartSettings;

  // Appearance
  colors: FootprintColors;
  fonts: FootprintFonts;
  features: FootprintFeatures;
  imbalance: ImbalanceSettings;

  // Layout dimensions
  layout: {
    footprintWidth: number;
    rowHeight: number;
    maxVisibleFootprints: number;
    deltaProfilePosition: 'left' | 'right';
  };
}

export interface LayoutMeta {
  id: string;
  name: string;
  symbol: string;
  timeframe: number;
  createdAt: number;
  updatedAt: number;
  toolCount: number;
}

// ============ CONSTANTS ============

const STORAGE_KEY = 'orderflow-layouts';
const CURRENT_LAYOUT_KEY = 'orderflow-current-layout';
const AUTO_SAVE_KEY = 'orderflow-autosave';
const VERSION = 1;

// ============ LAYOUT PERSISTENCE ============

export class LayoutPersistence {
  private static instance: LayoutPersistence | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private autoSaveDelay: number = 30000; // 30 seconds
  private lastSavedHash: string = '';

  private constructor() {}

  static getInstance(): LayoutPersistence {
    if (!LayoutPersistence.instance) {
      LayoutPersistence.instance = new LayoutPersistence();
    }
    return LayoutPersistence.instance;
  }

  // ============ SAVE ============

  /**
   * Save layout to localStorage
   */
  saveLayout(
    name: string,
    chart: ChartSettings,
    colors: FootprintColors,
    fonts: FootprintFonts,
    features: FootprintFeatures,
    imbalance: ImbalanceSettings,
    layout: LayoutData['layout'],
    id?: string
  ): string {
    const layoutId = id || this.generateId();
    const now = Date.now();

    const tools = getToolsEngine().getAllTools();

    const layoutData: LayoutData = {
      version: VERSION,
      id: layoutId,
      name,
      createdAt: id ? this.getLayout(id)?.createdAt || now : now,
      updatedAt: now,
      tools,
      chart,
      colors,
      fonts,
      features,
      imbalance,
      layout,
    };

    // Get existing layouts
    const layouts = this.getAllLayoutsRaw();
    layouts[layoutId] = layoutData;

    // Save to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
      localStorage.setItem(CURRENT_LAYOUT_KEY, layoutId);
      console.log(`Layout saved: ${name} (${layoutId})`);
    } catch (e) {
      console.error('Failed to save layout:', e);
      throw new Error('Failed to save layout to localStorage');
    }

    return layoutId;
  }

  /**
   * Auto-save current state
   */
  autoSave(
    chart: ChartSettings,
    colors: FootprintColors,
    fonts: FootprintFonts,
    features: FootprintFeatures,
    imbalance: ImbalanceSettings,
    layout: LayoutData['layout']
  ): void {
    const tools = getToolsEngine().getAllTools();

    const autoSaveData = {
      version: VERSION,
      timestamp: Date.now(),
      tools,
      chart,
      colors,
      fonts,
      features,
      imbalance,
      layout,
    };

    // Check if anything changed
    const hash = this.hashData(autoSaveData);
    if (hash === this.lastSavedHash) return;
    this.lastSavedHash = hash;

    try {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(autoSaveData));
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave(
    getState: () => {
      chart: ChartSettings;
      colors: FootprintColors;
      fonts: FootprintFonts;
      features: FootprintFeatures;
      imbalance: ImbalanceSettings;
      layout: LayoutData['layout'];
    }
  ): void {
    this.stopAutoSave();

    this.autoSaveInterval = setInterval(() => {
      const state = getState();
      this.autoSave(
        state.chart,
        state.colors,
        state.fonts,
        state.features,
        state.imbalance,
        state.layout
      );
    }, this.autoSaveDelay);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  // ============ LOAD ============

  /**
   * Load a specific layout
   */
  loadLayout(id: string): LayoutData | null {
    const layouts = this.getAllLayoutsRaw();
    return layouts[id] || null;
  }

  /**
   * Load the last used layout
   */
  loadCurrentLayout(): LayoutData | null {
    const currentId = localStorage.getItem(CURRENT_LAYOUT_KEY);
    if (currentId) {
      return this.loadLayout(currentId);
    }
    return null;
  }

  /**
   * Load auto-saved data
   */
  loadAutoSave(): Partial<LayoutData> | null {
    try {
      const data = localStorage.getItem(AUTO_SAVE_KEY);
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load auto-save:', e);
      return null;
    }
  }

  /**
   * Apply layout to engines
   */
  applyLayout(layoutData: Partial<LayoutData>): void {
    // Apply tools
    if (layoutData.tools) {
      const engine = getToolsEngine();
      engine.clearAll();
      engine.importFromJSON(JSON.stringify({ tools: layoutData.tools }));
    }
  }

  // ============ DELETE ============

  /**
   * Delete a layout
   */
  deleteLayout(id: string): boolean {
    const layouts = this.getAllLayoutsRaw();

    if (!layouts[id]) return false;

    delete layouts[id];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));

      // Clear current if deleted
      if (localStorage.getItem(CURRENT_LAYOUT_KEY) === id) {
        localStorage.removeItem(CURRENT_LAYOUT_KEY);
      }

      return true;
    } catch (e) {
      console.error('Failed to delete layout:', e);
      return false;
    }
  }

  /**
   * Clear auto-save data
   */
  clearAutoSave(): void {
    localStorage.removeItem(AUTO_SAVE_KEY);
    this.lastSavedHash = '';
  }

  // ============ LIST ============

  /**
   * Get all layouts metadata
   */
  getAllLayouts(): LayoutMeta[] {
    const layouts = this.getAllLayoutsRaw();

    return Object.values(layouts).map(layout => ({
      id: layout.id,
      name: layout.name,
      symbol: layout.chart.symbol,
      timeframe: layout.chart.timeframe,
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
      toolCount: layout.tools.length,
    }));
  }

  /**
   * Get layout by ID
   */
  getLayout(id: string): LayoutData | null {
    const layouts = this.getAllLayoutsRaw();
    return layouts[id] || null;
  }

  /**
   * Get all raw layouts
   */
  private getAllLayoutsRaw(): Record<string, LayoutData> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return {};
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load layouts:', e);
      return {};
    }
  }

  // ============ EXPORT/IMPORT ============

  /**
   * Export layout as JSON file
   */
  exportLayoutAsFile(id: string): void {
    const layout = this.loadLayout(id);
    if (!layout) return;

    const json = JSON.stringify(layout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `layout-${layout.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import layout from JSON file
   */
  async importLayoutFromFile(file: File): Promise<string | null> {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as LayoutData;

      // Validate
      if (!data.version || !data.tools || !data.chart) {
        throw new Error('Invalid layout file');
      }

      // Generate new ID to avoid conflicts
      const newId = this.generateId();
      data.id = newId;
      data.name = `${data.name} (imported)`;
      data.updatedAt = Date.now();

      // Save
      const layouts = this.getAllLayoutsRaw();
      layouts[newId] = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));

      return newId;
    } catch (e) {
      console.error('Failed to import layout:', e);
      return null;
    }
  }

  /**
   * Export all layouts for backup
   */
  exportAllLayouts(): string {
    const layouts = this.getAllLayoutsRaw();
    return JSON.stringify({
      version: VERSION,
      exportedAt: Date.now(),
      layouts,
    }, null, 2);
  }

  /**
   * Import layouts from backup
   */
  importAllLayouts(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (!data.layouts) return false;

      const existingLayouts = this.getAllLayoutsRaw();
      const mergedLayouts = { ...existingLayouts, ...data.layouts };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedLayouts));
      return true;
    } catch (e) {
      console.error('Failed to import layouts:', e);
      return false;
    }
  }

  // ============ UTILITIES ============

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `layout_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Simple hash for change detection
   */
  private hashData(data: object): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Check if has auto-save
   */
  hasAutoSave(): boolean {
    return localStorage.getItem(AUTO_SAVE_KEY) !== null;
  }

  /**
   * Get storage usage
   */
  getStorageUsage(): { used: number; available: number } {
    let totalSize = 0;
    for (const key of [STORAGE_KEY, CURRENT_LAYOUT_KEY, AUTO_SAVE_KEY]) {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length * 2; // UTF-16
      }
    }

    return {
      used: totalSize,
      available: 5 * 1024 * 1024 - totalSize, // ~5MB typical limit
    };
  }
}

// ============ EXPORT SINGLETON ============

export const layoutPersistence = LayoutPersistence.getInstance();
