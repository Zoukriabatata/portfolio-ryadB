'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHeatmapSettingsStore, type HeatmapSettingsState } from '@/stores/useHeatmapSettingsStore';
import type { FootprintStyle, PassiveThickness, BubbleShape, ColorScheme } from '@/types/heatmap';

/**
 * LIQUIDITY ADVANCED SETTINGS MODAL
 * Professional floating draggable window for liquidity heatmap customization
 * - Display settings (profiles, VWAP)
 * - Orderflow indicators (imbalances, absorption, icebergs)
 * - Panel toggles (time & sales, DOM, etc.)
 * - Alerts configuration
 * - Trade flow settings
 * - Drawing tools
 */

interface LiquidityAdvancedSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

type SettingsTab = 'display' | 'orderflow' | 'levels' | 'panels' | 'alerts' | 'tradeflow' | 'drawing';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'display',
    label: 'Display',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="6" y1="7" x2="6" y2="13" strokeOpacity="0.5" />
        <line x1="10" y1="9" x2="10" y2="13" strokeOpacity="0.5" />
        <line x1="14" y1="6" x2="14" y2="13" strokeOpacity="0.5" />
        <line x1="18" y1="8" x2="18" y2="13" strokeOpacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'orderflow',
    label: 'Orderflow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12h6" />
        <path d="M4 8h4" />
        <path d="M4 16h5" />
        <path d="M14 12h6" />
        <path d="M16 8h4" />
        <path d="M15 16h5" />
        <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
        <polygon points="10,12 7,10 7,14" fill="currentColor" fillOpacity="0.3" />
        <polygon points="14,12 17,10 17,14" fill="currentColor" fillOpacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'levels',
    label: 'Key Levels',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="3" y1="6" x2="21" y2="6" strokeDasharray="4 2" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" strokeDasharray="4 2" />
        <circle cx="5" cy="6" r="2" fill="currentColor" fillOpacity="0.3" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.3" />
        <circle cx="19" cy="18" r="2" fill="currentColor" fillOpacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'panels',
    label: 'Panels',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" fillOpacity="0.1" />
        <rect x="13" y="3" width="8" height="5" rx="2" />
        <rect x="13" y="10" width="8" height="11" rx="2" fill="currentColor" fillOpacity="0.1" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
      </svg>
    ),
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        <circle cx="18" cy="5" r="3" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'tradeflow',
    label: 'Trade Flow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="4" fill="currentColor" fillOpacity="0.15" />
        <circle cx="16" cy="10" r="5" fill="currentColor" fillOpacity="0.1" />
        <circle cx="10" cy="16" r="3" />
        <circle cx="17" cy="18" r="2" fill="currentColor" fillOpacity="0.2" />
        <path d="M8 8l8 2" strokeOpacity="0.3" />
        <path d="M16 10l-6 6" strokeOpacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'drawing',
    label: 'Drawing',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        <line x1="15" y1="5" x2="19" y2="9" />
        <line x1="2" y1="22" x2="7.5" y2="20.5" strokeOpacity="0.4" />
      </svg>
    ),
  },
];

export default function LiquidityAdvancedSettings({
  isOpen,
  onClose,
  initialPosition,
}: LiquidityAdvancedSettingsProps) {
  const store = useHeatmapSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Dragging logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.settings-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 440, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 550, e.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed z-[1000] select-none animate-in fade-in slide-in-from-right-4 duration-200"
      style={{
        left: position.x,
        top: position.y,
        width: 420,
      }}
    >
      {/* Modal Container */}
      <div className="bg-[var(--surface)] backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header - Draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Liquidity Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--surface)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}>
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content p-4 max-h-[400px] overflow-y-auto">
          {activeTab === 'display' && <DisplayTab store={store} />}
          {activeTab === 'orderflow' && <OrderflowTab store={store} />}
          {activeTab === 'levels' && <KeyLevelsTab store={store} />}
          {activeTab === 'panels' && <PanelsTab store={store} />}
          {activeTab === 'alerts' && <AlertsTab store={store} />}
          {activeTab === 'tradeflow' && <TradeFlowTab store={store} />}
          {activeTab === 'drawing' && <DrawingTab store={store} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
          <button
            onClick={() => store.resetToDefaults()}
            className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-[var(--primary)] hover:bg-[var(--primary-light)] text-[var(--text-primary)] rounded-lg transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ TAB COMPONENTS ============

interface TabProps {
  store: HeatmapSettingsState;
}

const THEME_OPTIONS: { value: ColorScheme; label: string; description: string }[] = [
  { value: 'atas', label: 'ATAS Pro', description: 'Professional green/red gradients' },
  { value: 'bookmap', label: 'Bookmap', description: 'Blue/pink oceanic style' },
  { value: 'sierra', label: 'Sierra', description: 'Warm earthy tones' },
  { value: 'highcontrast', label: 'High Contrast', description: 'Accessibility-focused' },
];

function DisplayTab({ store }: TabProps) {
  const features = store.displayFeatures;

  return (
    <div className="space-y-4">
      {/* Theme Section */}
      <SettingsSection title="Color Theme" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
        </svg>
      }>
        <div className="grid grid-cols-2 gap-2">
          {THEME_OPTIONS.map((theme) => (
            <button
              key={theme.value}
              onClick={() => store.setColorScheme(theme.value)}
              className={`p-3 rounded-lg text-left transition-all ${
                store.colorScheme === theme.value
                  ? 'bg-[var(--primary)]/20 border-2 border-[var(--primary)]'
                  : 'bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border)]'
              }`}
            >
              <div className="text-xs font-medium text-[var(--text-primary)]">{theme.label}</div>
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{theme.description}</div>
              {/* Color preview */}
              <div className="flex gap-1 mt-2">
                {theme.value === 'atas' && (
                  <>
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#0d3320] via-[#16a34a] to-[#86efac]" />
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#450a0a] via-[#dc2626] to-[#fca5a5]" />
                  </>
                )}
                {theme.value === 'bookmap' && (
                  <>
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#003566] via-[#00b4d8] to-[#90e0ef]" />
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#6b2737] via-[#c9184a] to-[#ff758f]" />
                  </>
                )}
                {theme.value === 'sierra' && (
                  <>
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#1f4037] via-[#2d6a4f] to-[#52b788]" />
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#5c1a1b] via-[#9b2226] to-[#e85d04]" />
                  </>
                )}
                {theme.value === 'highcontrast' && (
                  <>
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#006400] via-[#00ff00] to-[#7fff00]" />
                    <div className="w-4 h-2 rounded-sm bg-gradient-to-r from-[#8b0000] via-[#ff0000] to-[#ff6347]" />
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Performance Section */}
      <SettingsSection title="Performance" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12,2 2,7 12,12 22,7" />
          <polyline points="2,17 12,22 22,17" />
          <polyline points="2,12 12,17 22,12" />
        </svg>
      }>
        <ToggleOption
          label="WebGL Rendering"
          description="GPU-accelerated rendering for better performance (recommended)"
          checked={store.useWebGL}
          onChange={store.setUseWebGL}
        />
        {store.useWebGL && (
          <div className="mt-2 px-3 py-2 bg-purple-900/30 border border-purple-800/50 rounded-lg">
            <p className="text-[10px] text-purple-300">
              WebGL enabled - GPU rendering active for smooth 60 FPS with 500+ orders
            </p>
          </div>
        )}
      </SettingsSection>

      {/* Profiles Section */}
      <SettingsSection title="Profiles" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      }>
        <ToggleOption
          label="Delta Profile"
          description="Show bid/ask volume difference per price level"
          checked={features.showDeltaProfile}
          onChange={store.setShowDeltaProfile}
        />
        <ToggleOption
          label="Volume Profile"
          description="Show total volume distribution"
          checked={features.showVolumeProfile}
          onChange={store.setShowVolumeProfile}
        />
        <ToggleOption
          label="VWAP Line"
          description="Volume-weighted average price"
          checked={features.showVWAP}
          onChange={store.setShowVWAP}
        />
      </SettingsSection>

      {/* Style Section */}
      <SettingsSection title="Style" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      }>
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Passive Order Thickness</label>
          <div className="flex gap-2">
            {(['thin', 'normal', 'thick'] as PassiveThickness[]).map((thickness) => (
              <button
                key={thickness}
                onClick={() => store.setPassiveThickness(thickness)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  features.passiveThickness === thickness
                    ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                }`}
              >
                {thickness.charAt(0).toUpperCase() + thickness.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Best Bid/Ask Line Section */}
      <SettingsSection title="Best Bid/Ask Line" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12h4l3-9 6 18 3-9h4" />
        </svg>
      }>
        <SliderOption
          label="Line Width"
          value={features.staircaseLine?.lineWidth ?? 3}
          onChange={store.setStaircaseLineWidth}
          min={1}
          max={10}
          step={1}
          unit="px"
        />

        <ToggleOption
          label="Glow Effect"
          description="Add luminous glow around the line"
          checked={features.staircaseLine?.showGlow ?? true}
          onChange={store.setStaircaseShowGlow}
        />

        {(features.staircaseLine?.showGlow ?? true) && (
          <SliderOption
            label="Glow Intensity"
            value={features.staircaseLine?.glowIntensity ?? 0.7}
            onChange={store.setStaircaseGlowIntensity}
            min={0.1}
            max={1.5}
            step={0.1}
          />
        )}

        <ToggleOption
          label="Spread Fill"
          description="Fill area between bid and ask lines"
          checked={features.staircaseLine?.showSpreadFill ?? true}
          onChange={store.setStaircaseShowSpreadFill}
        />

        {(features.staircaseLine?.showSpreadFill ?? true) && (
          <SliderOption
            label="Fill Opacity"
            value={features.staircaseLine?.spreadFillOpacity ?? 0.15}
            onChange={store.setStaircaseSpreadFillOpacity}
            min={0.05}
            max={0.5}
            step={0.05}
          />
        )}

        <ToggleOption
          label="Trail Animation"
          description="Animated trail effect following price"
          checked={features.staircaseLine?.showTrail ?? false}
          onChange={store.setStaircaseShowTrail}
        />

        {(features.staircaseLine?.showTrail ?? false) && (
          <>
            <SliderOption
              label="Trail Length"
              value={features.staircaseLine?.trailLength ?? 2}
              onChange={store.setStaircaseTrailLength}
              min={1}
              max={5}
              step={0.5}
              unit="s"
            />
            <SliderOption
              label="Fade Speed"
              value={features.staircaseLine?.trailFadeSpeed ?? 1}
              onChange={store.setStaircaseTrailFadeSpeed}
              min={0.5}
              max={2}
              step={0.1}
              unit="x"
            />
          </>
        )}
      </SettingsSection>

      {/* Grid & Ticks Section */}
      <SettingsSection title="Grid & Ticks" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <line x1="8" y1="3" x2="8" y2="21" />
          <line x1="13" y1="3" x2="13" y2="21" />
          <line x1="18" y1="3" x2="18" y2="21" />
          <line x1="3" y1="8" x2="21" y2="8" />
          <line x1="3" y1="13" x2="21" y2="13" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      }>
        <ToggleOption
          label="Major Grid"
          description="Show prominent grid lines"
          checked={features.grid?.showMajorGrid ?? true}
          onChange={store.setShowMajorGrid}
        />

        <ToggleOption
          label="Minor Grid"
          description="Show subtle background grid"
          checked={features.grid?.showMinorGrid ?? true}
          onChange={store.setShowMinorGrid}
        />

        {(features.grid?.showMajorGrid || features.grid?.showMinorGrid) && (
          <>
            <SliderOption
              label="Major Interval"
              value={features.grid?.majorGridInterval ?? 10}
              onChange={store.setMajorGridInterval}
              min={2}
              max={20}
              step={1}
              unit=" ticks"
            />

            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)]">Grid Style</label>
              <div className="flex gap-2">
                {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => store.setGridStyle(style)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      (features.grid?.gridStyle ?? 'solid') === style
                        ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                    }`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <ToggleOption
          label="Tick Marks"
          description="Show marks on price axis"
          checked={features.grid?.showTickMarks ?? true}
          onChange={store.setShowTickMarks}
        />

        {(features.grid?.showTickMarks ?? true) && (
          <SliderOption
            label="Tick Size"
            value={features.grid?.tickSize ?? 5}
            onChange={store.setTickSize}
            min={3}
            max={15}
            step={1}
            unit="px"
          />
        )}

        <ToggleOption
          label="Highlight Round Numbers"
          description="Emphasize key price levels"
          checked={features.grid?.highlightRoundNumbers ?? true}
          onChange={store.setHighlightRoundNumbers}
        />

        {(features.grid?.highlightRoundNumbers ?? true) && (
          <SliderOption
            label="Round Number Interval"
            value={features.grid?.roundNumberInterval ?? 100}
            onChange={store.setRoundNumberInterval}
            min={10}
            max={1000}
            step={10}
          />
        )}

        {/* Label Precision */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Label Precision</label>
          <div className="flex gap-2">
            {(['auto', 0, 1, 2, 3, 4] as const).map((prec) => (
              <button
                key={String(prec)}
                onClick={() => store.setLabelPrecision(prec)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  (features.grid?.labelPrecision ?? 'auto') === prec
                    ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                }`}
              >
                {prec === 'auto' ? 'Auto' : `${prec}d`}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Time Axis Section */}
      <SettingsSection title="Time Axis" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
      }>
        <ToggleOption
          label="Show Time Axis"
          description="Display time labels at the bottom"
          checked={features.grid?.showTimeAxis ?? true}
          onChange={store.setShowTimeAxis}
        />

        {(features.grid?.showTimeAxis ?? true) && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--text-muted)]">Time Format</label>
              <div className="flex gap-2">
                {(['24h', '12h'] as const).map((format) => (
                  <button
                    key={format}
                    onClick={() => store.setTimeFormat(format)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      (features.grid?.timeFormat ?? '24h') === format
                        ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                    }`}
                  >
                    {format === '24h' ? '24H (14:30)' : '12H (2:30 PM)'}
                  </button>
                ))}
              </div>
            </div>

            <ToggleOption
              label="Session Markers"
              description="Show market session boundaries"
              checked={features.grid?.showSessionMarkers ?? false}
              onChange={store.setShowSessionMarkers}
            />
          </>
        )}
      </SettingsSection>

      {/* Passive Orders Section */}
      <SettingsSection title="Passive Orders" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="3" height="9" fill="currentColor" opacity="0.5" />
          <rect x="14" y="10" width="3" height="6" fill="currentColor" opacity="0.5" />
        </svg>
      }>
        <ToggleOption
          label="Glow Effect"
          description="Luminous glow on high-intensity orders"
          checked={features.passiveOrders?.glowEnabled ?? true}
          onChange={store.setPassiveGlowEnabled}
        />

        {(features.passiveOrders?.glowEnabled ?? true) && (
          <SliderOption
            label="Glow Intensity"
            value={features.passiveOrders?.glowIntensity ?? 0.8}
            onChange={store.setPassiveGlowIntensity}
            min={0.1}
            max={1.5}
            step={0.1}
          />
        )}

        <ToggleOption
          label="Pulse Animation"
          description="Pulsing effect on new orders"
          checked={features.passiveOrders?.pulseEnabled ?? true}
          onChange={store.setPassivePulseEnabled}
        />

        {(features.passiveOrders?.pulseEnabled ?? true) && (
          <SliderOption
            label="Pulse Speed"
            value={features.passiveOrders?.pulseSpeed ?? 2.0}
            onChange={store.setPassivePulseSpeed}
            min={0.5}
            max={3.0}
            step={0.1}
            unit="x"
          />
        )}

        <ToggleOption
          label="Visual States"
          description="Color-coded order states (new, absorbed, fading)"
          checked={features.passiveOrders?.showStates ?? true}
          onChange={store.setPassiveShowStates}
        />

        <ToggleOption
          label="Iceberg Detection"
          description="Highlight detected iceberg orders"
          checked={features.passiveOrders?.icebergDetection ?? true}
          onChange={store.setPassiveIcebergDetection}
        />

        {(features.passiveOrders?.icebergDetection ?? true) && (
          <SliderOption
            label="Iceberg Threshold"
            value={features.passiveOrders?.icebergThreshold ?? 3}
            onChange={store.setPassiveIcebergThreshold}
            min={1}
            max={10}
            step={1}
            unit=" refills"
          />
        )}

        {/* State color legend */}
        {(features.passiveOrders?.showStates ?? true) && (
          <div className="mt-2 p-2 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] mb-2">State Colors:</div>
            <div className="flex flex-wrap gap-2 text-[9px]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-300" />
                <span className="text-yellow-300">New</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">Stable</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-400" />
                <span className="text-orange-400">Absorbed</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[var(--surface-elevated)]" />
                <span className="text-[var(--text-muted)]">Fading</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded border-2 border-cyan-400 bg-transparent" />
                <span className="text-cyan-400">Iceberg</span>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function OrderflowTab({ store }: TabProps) {
  const features = store.displayFeatures;

  return (
    <div className="space-y-4">
      {/* Indicators Section */}
      <SettingsSection title="Orderflow Indicators" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      }>
        <ToggleOption
          label="Imbalances"
          description="Highlight aggressive bid/ask imbalances"
          checked={features.showImbalances}
          onChange={(show) => store.setDisplayFeatures({ showImbalances: show })}
        />
        <ToggleOption
          label="Absorption"
          description="Detect large order absorption zones"
          checked={features.showAbsorption}
          onChange={store.setShowAbsorptionFeature}
        />
        <ToggleOption
          label="Icebergs"
          description="Detect hidden iceberg orders"
          checked={features.showIcebergs}
          onChange={store.setShowIcebergs}
        />
      </SettingsSection>

      {/* Footprint Section */}
      <SettingsSection title="Footprint Display" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      }>
        <ToggleOption
          label="Show Numbers"
          description="Display volume numbers on footprint"
          checked={features.showFootprintNumbers}
          onChange={store.setShowFootprintNumbers}
        />

        {features.showFootprintNumbers && (
          <div className="mt-3 space-y-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">Footprint Style</label>
            <div className="flex gap-2">
              {([
                { value: 'bid_ask', label: 'Bid x Ask' },
                { value: 'delta', label: 'Delta' },
                { value: 'volume', label: 'Volume' },
              ] as { value: FootprintStyle; label: string }[]).map((style) => (
                <button
                  key={style.value}
                  onClick={() => store.setFootprintStyle(style.value)}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    features.footprintStyle === style.value
                      ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                      : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

function KeyLevelsTab({ store }: TabProps) {
  const features = store.displayFeatures;
  const keyLevels = features.keyLevels;

  return (
    <div className="space-y-4">
      {/* Value Area */}
      <SettingsSection title="Value Area" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
          <rect x="6" y="8" width="12" height="8" strokeDasharray="3 3" />
        </svg>
      }>
        <ToggleOption
          label="Point of Control (POC)"
          description="Highest volume price level"
          checked={keyLevels?.showPOC ?? true}
          onChange={store.setShowPOC}
        />
        <ToggleOption
          label="Value Area High (VAH)"
          description="Upper boundary of 70% volume"
          checked={keyLevels?.showVAH ?? true}
          onChange={store.setShowVAH}
        />
        <ToggleOption
          label="Value Area Low (VAL)"
          description="Lower boundary of 70% volume"
          checked={keyLevels?.showVAL ?? true}
          onChange={store.setShowVAL}
        />

        {/* Color legend */}
        <div className="mt-2 p-2 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
          <div className="text-[10px] text-[var(--text-muted)] mb-2">Value Area Colors:</div>
          <div className="flex flex-wrap gap-3 text-[9px]">
            <div className="flex items-center gap-1">
              <div className="w-6 h-0.5 bg-amber-500" />
              <span className="text-amber-400">POC</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-0.5 bg-purple-500" />
              <span className="text-purple-400">VAH/VAL</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* VWAP */}
      <SettingsSection title="VWAP" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 12h4l3-9 6 18 3-9h4" />
        </svg>
      }>
        <ToggleOption
          label="Show VWAP Line"
          description="Volume Weighted Average Price"
          checked={keyLevels?.showVWAP ?? true}
          onChange={store.setShowKeyLevelVWAP}
        />

        <div className="mt-2 p-2 bg-cyan-900/20 rounded-lg border border-cyan-800/30">
          <div className="flex items-center gap-2 text-[10px] text-cyan-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>VWAP resets at session start</span>
          </div>
        </div>
      </SettingsSection>

      {/* Session Levels */}
      <SettingsSection title="Session Levels" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
      }>
        <ToggleOption
          label="Session High/Low"
          description="Display current session extremes"
          checked={keyLevels?.showSessionHighLow ?? false}
          onChange={store.setShowSessionHighLow}
        />

        {(keyLevels?.showSessionHighLow ?? false) && (
          <div className="mt-2 p-2 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] mb-2">Session Colors:</div>
            <div className="flex flex-wrap gap-3 text-[9px]">
              <div className="flex items-center gap-1">
                <div className="w-6 h-0.5 bg-cyan-400" />
                <span className="text-cyan-400">High</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-6 h-0.5 bg-pink-400" />
                <span className="text-pink-400">Low</span>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Round Numbers */}
      <SettingsSection title="Round Numbers" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      }>
        <ToggleOption
          label="Show Round Numbers"
          description="Highlight psychological price levels"
          checked={keyLevels?.showRoundNumbers ?? true}
          onChange={store.setShowKeyRoundNumbers}
        />

        {(keyLevels?.showRoundNumbers ?? true) && (
          <SliderOption
            label="Interval"
            value={keyLevels?.roundNumberInterval ?? 100}
            onChange={store.setKeyRoundNumberInterval}
            min={10}
            max={1000}
            step={10}
          />
        )}

        <div className="mt-2 p-2 bg-amber-900/20 rounded-lg border border-amber-800/30">
          <div className="text-[10px] text-amber-400/80">
            Round numbers act as psychological support/resistance levels. Common intervals:
            <ul className="mt-1 ml-3 text-amber-400/60 list-disc">
              <li>BTC: 1000, 5000, 10000</li>
              <li>ETH: 100, 500</li>
              <li>Stocks: 10, 50, 100</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

      {/* Tips */}
      <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)]">
          <span className="text-[var(--primary)]">Tip:</span> Key levels are calculated in real-time based on the current session&apos;s volume profile.
          POC shows where most trading occurred.
        </p>
      </div>
    </div>
  );
}

function PanelsTab({ store }: TabProps) {
  const features = store.displayFeatures;
  const timeSalesSettings = features.timeSales;

  return (
    <div className="space-y-4">
      {/* Data Panels */}
      <SettingsSection title="Data Panels" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
        </svg>
      }>
        <ToggleOption
          label="Time & Sales"
          description="Live trade tape feed"
          checked={features.showTimeSales}
          onChange={store.setShowTimeSales}
        />
        <ToggleOption
          label="Cumulative Delta"
          description="Running delta chart"
          checked={features.showCumulativeDelta}
          onChange={store.setShowCumulativeDelta}
        />
        <ToggleOption
          label="DOM Ladder"
          description="Depth of market ladder view"
          checked={features.showDOMLadder}
          onChange={store.setShowDOMLadder}
        />
        <ToggleOption
          label="Tape Velocity"
          description="Trade flow speed indicator"
          checked={features.showTapeVelocity}
          onChange={store.setShowTapeVelocity}
        />
      </SettingsSection>

      {/* Time & Sales Settings */}
      {features.showTimeSales && (
        <SettingsSection title="Time & Sales Settings" icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M2 12h20" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }>
          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">Panel Position</label>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => store.setTimeSalesPosition(pos)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    (timeSalesSettings?.position ?? 'right') === pos
                      ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                      : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                  }`}
                >
                  {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <SliderOption
            label="Panel Width"
            value={timeSalesSettings?.width ?? 280}
            onChange={store.setTimeSalesWidth}
            min={200}
            max={400}
            step={20}
            unit="px"
          />

          <SliderOption
            label="Max Rows"
            value={timeSalesSettings?.maxRows ?? 100}
            onChange={store.setTimeSalesMaxRows}
            min={20}
            max={500}
            step={10}
          />

          <ToggleOption
            label="Cumulative Volume"
            description="Show running total column"
            checked={timeSalesSettings?.showCumulativeVolume ?? true}
            onChange={store.setTimeSalesShowCumulative}
          />

          <ToggleOption
            label="Aggregate by Price"
            description="Group trades at same price level"
            checked={timeSalesSettings?.aggregateByPrice ?? false}
            onChange={store.setTimeSalesAggregateByPrice}
          />

          <SliderOption
            label="Min Size Filter"
            value={timeSalesSettings?.minSizeFilter ?? 0}
            onChange={store.setTimeSalesMinSizeFilter}
            min={0}
            max={100}
            step={1}
          />

          <SliderOption
            label="Large Trade Highlight"
            value={timeSalesSettings?.largeTradeThreshold ?? 10}
            onChange={store.setTimeSalesLargeThreshold}
            min={2}
            max={50}
            step={1}
            unit="x avg"
          />

          {/* Info box */}
          <div className="mt-2 p-2 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)]">
              <span className="text-[var(--primary)]">Tip:</span> Hover over the panel to pause auto-scroll.
              Large trades are highlighted with a colored border.
            </div>
          </div>
        </SettingsSection>
      )}
    </div>
  );
}

function AlertsTab({ store }: TabProps) {
  const features = store.displayFeatures;

  return (
    <div className="space-y-4">
      {/* Alert Indicators */}
      <SettingsSection title="Alert Indicators" icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      }>
        <ToggleOption
          label="Large Trade Alerts"
          description="Highlight significant trades"
          checked={features.showLargeTradeAlerts}
          onChange={store.setShowLargeTradeAlerts}
        />
        <ToggleOption
          label="Pressure Meter"
          description="Buy/sell pressure gauge"
          checked={features.showPressureMeter}
          onChange={store.setShowPressureMeter}
        />
        <ToggleOption
          label="Session Stats"
          description="Session volume and delta statistics"
          checked={features.showSessionStats}
          onChange={store.setShowSessionStats}
        />
      </SettingsSection>

      {/* Tips */}
      <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
        <p className="text-xs text-[var(--text-muted)]">
          <span className="text-amber-400">Tip:</span> Large trade alerts trigger when a trade exceeds 2x the average size.
        </p>
      </div>
    </div>
  );
}

function TradeFlowTab({ store }: TabProps) {
  const { tradeFlow } = store;

  return (
    <div className="space-y-4">
      {/* Enable */}
      <ToggleOption
        label="Enable Trade Bubbles"
        description="Show trade visualization on heatmap"
        checked={tradeFlow.enabled}
        onChange={(enabled) => store.setTradeFlowSettings({ enabled })}
      />

      {tradeFlow.enabled && (
        <>
          {/* Bubble Style */}
          <SettingsSection title="Bubble Style" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          }>
            <div className="space-y-3">
              <div className="flex gap-2">
                {([
                  { value: 'circle', label: 'Circle' },
                  { value: 'pie', label: 'Pie Chart' },
                ] as { value: BubbleShape; label: string }[]).map((shape) => (
                  <button
                    key={shape.value}
                    onClick={() => store.setTradeFlowSettings({ bubbleShape: shape.value })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      tradeFlow.bubbleShape === shape.value
                        ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                        : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                    }`}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>

              <SliderOption
                label="Bubble Size"
                value={tradeFlow.bubbleSize || 0.6}
                onChange={(bubbleSize) => store.setTradeFlowSettings({ bubbleSize })}
                min={0.1}
                max={2}
                step={0.1}
                unit="x"
              />

              <SliderOption
                label="Opacity"
                value={tradeFlow.bubbleOpacity || 0.7}
                onChange={(bubbleOpacity) => store.setTradeFlowSettings({ bubbleOpacity })}
                min={0.1}
                max={1}
                step={0.1}
              />

              {/* Size Scaling */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-muted)]">Size Scaling</label>
                <div className="flex gap-2">
                  {([
                    { value: 'sqrt', label: 'Square Root', desc: 'Balanced' },
                    { value: 'linear', label: 'Linear', desc: 'Proportional' },
                    { value: 'log', label: 'Logarithmic', desc: 'Compressed' },
                  ] as const).map((scale) => (
                    <button
                      key={scale.value}
                      onClick={() => store.setTradeFlowSettings({ sizeScaling: scale.value })}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                        (tradeFlow.sizeScaling || 'sqrt') === scale.value
                          ? 'bg-[var(--primary)] text-[var(--text-primary)] border border-[var(--primary)]'
                          : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border)]'
                      }`}
                      title={scale.desc}
                    >
                      {scale.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Visual Effects */}
          <SettingsSection title="Visual Effects" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
            </svg>
          }>
            <ToggleOption
              label="Pop-in Animation"
              description="Elastic animation when bubbles appear"
              checked={tradeFlow.popInAnimation ?? true}
              onChange={(popInAnimation) => store.setTradeFlowSettings({ popInAnimation })}
            />

            <ToggleOption
              label="Glow Effect"
              description="Luminous glow on large trades"
              checked={tradeFlow.glowEnabled ?? true}
              onChange={(glowEnabled) => store.setTradeFlowSettings({ glowEnabled })}
            />

            {(tradeFlow.glowEnabled ?? true) && (
              <SliderOption
                label="Glow Intensity"
                value={tradeFlow.glowIntensity ?? 0.6}
                onChange={(glowIntensity) => store.setTradeFlowSettings({ glowIntensity })}
                min={0.1}
                max={1.5}
                step={0.1}
              />
            )}

            <ToggleOption
              label="Glass Gradient"
              description="Inner highlight for 3D effect"
              checked={tradeFlow.showGradient ?? true}
              onChange={(showGradient) => store.setTradeFlowSettings({ showGradient })}
            />

            <ToggleOption
              label="Ripple Effect"
              description="Animated ripple on large trades"
              checked={tradeFlow.rippleEnabled ?? true}
              onChange={(rippleEnabled) => store.setTradeFlowSettings({ rippleEnabled })}
            />

            <SliderOption
              label="Large Trade Threshold"
              value={tradeFlow.largeTradeThreshold ?? 2.0}
              onChange={(largeTradeThreshold) => store.setTradeFlowSettings({ largeTradeThreshold })}
              min={1}
              max={5}
              step={0.5}
              unit="x avg"
            />
          </SettingsSection>

          {/* Border */}
          <SettingsSection title="Border" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          }>
            <SliderOption
              label="Border Width"
              value={tradeFlow.bubbleBorderWidth ?? 1.5}
              onChange={(bubbleBorderWidth) => store.setTradeFlowSettings({ bubbleBorderWidth })}
              min={0}
              max={3}
              step={0.5}
              unit="px"
            />
            <ColorOption
              label="Border Color"
              value={tradeFlow.bubbleBorderColor === 'auto' ? '#ffffff' : tradeFlow.bubbleBorderColor}
              onChange={(bubbleBorderColor) => store.setTradeFlowSettings({ bubbleBorderColor })}
            />
            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="autoBorder"
                checked={tradeFlow.bubbleBorderColor === 'auto'}
                onChange={(e) => store.setTradeFlowSettings({
                  bubbleBorderColor: e.target.checked ? 'auto' : '#ffffff'
                })}
                className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] focus:ring-[var(--primary)] focus:ring-offset-[var(--background)]"
              />
              <label htmlFor="autoBorder" className="text-xs text-[var(--text-muted)]">
                Auto (match buy/sell color)
              </label>
            </div>
          </SettingsSection>

          {/* Behavior */}
          <SettingsSection title="Behavior" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M12 4h9M3 9h18M3 15h18M4 4l4 4-4 4" />
            </svg>
          }>
            <ToggleOption
              label="Cumulative Mode"
              description="Group trades by price/time"
              checked={tradeFlow.cumulativeMode}
              onChange={(cumulativeMode) => store.setTradeFlowSettings({ cumulativeMode })}
            />
            <ToggleOption
              label="Show Labels"
              description="Display volume on bubbles"
              checked={tradeFlow.showTextLabels}
              onChange={(showTextLabels) => store.setTradeFlowSettings({ showTextLabels })}
            />
            <SliderOption
              label="Min Size Filter"
              value={tradeFlow.filterThreshold}
              onChange={(filterThreshold) => store.setTradeFlowSettings({ filterThreshold })}
              min={0}
              max={2}
              step={0.1}
              unit="x"
            />
          </SettingsSection>

          {/* Colors */}
          <SettingsSection title="Colors" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
            </svg>
          }>
            <div className="flex gap-4">
              <ColorOption
                label="Buy"
                value={tradeFlow.buyColor}
                onChange={(buyColor) => store.setTradeFlowSettings({ buyColor })}
              />
              <ColorOption
                label="Sell"
                value={tradeFlow.sellColor}
                onChange={(sellColor) => store.setTradeFlowSettings({ sellColor })}
              />
            </div>
          </SettingsSection>

          {/* Effects preview */}
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] mb-2">Active Effects:</div>
            <div className="flex flex-wrap gap-1.5">
              {(tradeFlow.popInAnimation ?? true) && (
                <span className="px-2 py-0.5 bg-purple-900/40 text-purple-300 rounded text-[9px]">Pop-in</span>
              )}
              {(tradeFlow.glowEnabled ?? true) && (
                <span className="px-2 py-0.5 bg-yellow-900/40 text-yellow-300 rounded text-[9px]">Glow</span>
              )}
              {(tradeFlow.showGradient ?? true) && (
                <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded text-[9px]">Glass</span>
              )}
              {(tradeFlow.rippleEnabled ?? true) && (
                <span className="px-2 py-0.5 bg-cyan-900/40 text-cyan-300 rounded text-[9px]">Ripple</span>
              )}
              {tradeFlow.bubbleShape === 'pie' && (
                <span className="px-2 py-0.5 bg-green-900/40 text-green-300 rounded text-[9px]">Pie Chart</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DrawingTab({ store }: TabProps) {
  const features = store.displayFeatures;

  return (
    <div className="space-y-4">
      {/* Enable */}
      <ToggleOption
        label="Enable Drawing Tools"
        description="Allow drawing on the chart"
        checked={features.showDrawings}
        onChange={store.setShowDrawings}
      />

      {features.showDrawings && (
        <>
          {/* Shortcuts Reference */}
          <SettingsSection title="Keyboard Shortcuts" icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12" />
            </svg>
          }>
            <div className="space-y-2">
              <ShortcutRow shortcut="V" action="Selection tool" />
              <ShortcutRow shortcut="H" action="Horizontal line" />
              <ShortcutRow shortcut="T" action="Trendline" />
              <ShortcutRow shortcut="R" action="Rectangle" />
              <ShortcutRow shortcut="X" action="Text annotation" />
              <ShortcutRow shortcut="Esc" action="Cancel / Deselect" />
              <ShortcutRow shortcut="Del" action="Delete selected" />
            </div>
          </SettingsSection>

          {/* Tips */}
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)]">
              <span className="text-[var(--primary)]">Tip:</span> Click and drag to draw. Double-click to reset view.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ============ REUSABLE COMPONENTS ============

function SettingsSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-[var(--primary)]">{icon}</span>}
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">{title}</h4>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

interface ToggleOptionProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleOption({ label, description, checked, onChange }: ToggleOptionProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-[var(--text-primary)]">{label}</div>
        {description && <div className="text-xs text-[var(--text-muted)]">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--surface-elevated)]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

interface SliderOptionProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

function SliderOption({ label, value, onChange, min, max, step, unit }: SliderOptionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-primary)]">{label}</span>
        <span className="text-xs text-[var(--text-muted)] font-mono">
          {value.toFixed(step < 1 ? 1 : 0)}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
      />
    </div>
  );
}

interface ColorOptionProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorOption({ label, value, onChange }: ColorOptionProps) {
  // Parse rgba to hex for color input
  const hexValue = value.startsWith('rgba')
    ? rgbaToHex(value)
    : value.startsWith('#')
    ? value.slice(0, 7)
    : value;

  return (
    <div className="flex-1">
      <label className="text-xs text-[var(--text-muted)] block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hexValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-[var(--border)] bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text-muted)] font-mono focus:outline-none focus:border-[var(--primary)]"
        />
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut, action }: { shortcut: string; action: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--text-muted)]">{action}</span>
      <kbd className="px-2 py-0.5 bg-[var(--surface-elevated)] rounded text-[var(--text-secondary)] font-mono text-[10px]">
        {shortcut}
      </kbd>
    </div>
  );
}

// Helper function to convert rgba to hex
function rgbaToHex(rgba: string): string {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#000000';
  const [, r, g, b] = match;
  return `#${[r, g, b].map(x => parseInt(x).toString(16).padStart(2, '0')).join('')}`;
}
