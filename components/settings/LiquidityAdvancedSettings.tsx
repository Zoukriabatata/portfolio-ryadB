'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHeatmapSettingsStore, type HeatmapSettingsState } from '@/stores/useHeatmapSettingsStore';
import type { FootprintStyle, PassiveThickness, BubbleShape } from '@/types/heatmap';

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

type SettingsTab = 'display' | 'orderflow' | 'panels' | 'alerts' | 'tradeflow' | 'drawing';

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'display',
    label: 'Display',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    id: 'orderflow',
    label: 'Orderflow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 22h20L12 2z" />
        <line x1="12" y1="8" x2="12" y2="16" />
      </svg>
    ),
  },
  {
    id: 'panels',
    label: 'Panels',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: 'tradeflow',
    label: 'Trade Flow',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    id: 'drawing',
    label: 'Drawing',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
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
      <div className="bg-zinc-900/95 backdrop-blur-xl rounded-xl border border-zinc-700/50 shadow-2xl overflow-hidden">
        {/* Header - Draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50 cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-semibold text-white">Liquidity Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-700/50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-700/50 bg-zinc-800/30 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'text-green-400 border-b-2 border-green-400 bg-zinc-800/50'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-green-400' : 'text-zinc-500'}>
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
          {activeTab === 'panels' && <PanelsTab store={store} />}
          {activeTab === 'alerts' && <AlertsTab store={store} />}
          {activeTab === 'tradeflow' && <TradeFlowTab store={store} />}
          {activeTab === 'drawing' && <DrawingTab store={store} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-700/50 bg-zinc-800/30">
          <button
            onClick={() => store.resetToDefaults()}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-medium"
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

function DisplayTab({ store }: TabProps) {
  const features = store.displayFeatures;

  return (
    <div className="space-y-4">
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
          <label className="text-xs font-medium text-zinc-400">Passive Order Thickness</label>
          <div className="flex gap-2">
            {(['thin', 'normal', 'thick'] as PassiveThickness[]).map((thickness) => (
              <button
                key={thickness}
                onClick={() => store.setPassiveThickness(thickness)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  features.passiveThickness === thickness
                    ? 'bg-green-600 text-white border border-green-500'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
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
            <label className="text-xs font-medium text-zinc-400">Footprint Style</label>
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
                      ? 'bg-green-600 text-white border border-green-500'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
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

function PanelsTab({ store }: TabProps) {
  const features = store.displayFeatures;

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
      <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
        <p className="text-xs text-zinc-500">
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
                        ? 'bg-green-600 text-white border border-green-500'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
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
          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <p className="text-xs text-zinc-500">
              <span className="text-green-400">Tip:</span> Click and drag to draw. Double-click to reset view.
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
    <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-green-400">{icon}</span>}
        <h4 className="text-xs font-semibold text-white uppercase tracking-wide">{title}</h4>
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
        <div className="text-sm text-white">{label}</div>
        {description && <div className="text-xs text-zinc-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? 'bg-green-600' : 'bg-zinc-600'
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
        <span className="text-sm text-white">{label}</span>
        <span className="text-xs text-zinc-400 font-mono">
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
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
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
      <label className="text-xs text-zinc-400 block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hexValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-zinc-600 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-400 font-mono focus:outline-none focus:border-green-500"
        />
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut, action }: { shortcut: string; action: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{action}</span>
      <kbd className="px-2 py-0.5 bg-zinc-700 rounded text-zinc-300 font-mono text-[10px]">
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
