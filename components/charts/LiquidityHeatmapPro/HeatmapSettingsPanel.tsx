'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useHeatmapSettingsStore, type HeatmapSettingsState } from '@/stores/useHeatmapSettingsStore';
import type { ColorScheme, SmoothingMode, BubbleShape } from '@/types/heatmap';
import { ColorPicker } from '@/components/tools/ColorPicker';

/** Inline color swatch with unified picker popover */
function InlineColorSwatch({ value, onChange, size = 6 }: {
  value: string;
  onChange: (color: string) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all"
        style={{
          width: size * 4,
          height: size * 4,
          backgroundColor: value,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 right-0 p-3 rounded-xl shadow-2xl"
          style={{
            backgroundColor: 'rgba(20, 20, 28, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            minWidth: 220,
          }}
        >
          <ColorPicker value={value} onChange={onChange} label="" />
        </div>
      )}
    </div>
  );
}

interface HeatmapSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

type SettingsTab = 'general' | 'display' | 'zoom' | 'bestBidAsk' | 'dom' | 'tradeFlow';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'display', label: 'Display' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'bestBidAsk', label: 'Bid/Ask' },
  { id: 'dom', label: 'DOM' },
  { id: 'tradeFlow', label: 'Trade Flow' },
];

export function HeatmapSettingsPanel({ isOpen, onClose, initialPosition }: HeatmapSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const store = useHeatmapSettingsStore();

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[100] bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: 360,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <h3 className="text-sm font-semibold text-white">Heatmap Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-700 rounded transition-colors"
        >
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-green-400 border-b-2 border-green-400 bg-zinc-800/50'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="settings-content p-4 max-h-[400px] overflow-y-auto">
        {activeTab === 'general' && <GeneralTab store={store} />}
        {activeTab === 'display' && <DisplayTab store={store} />}
        {activeTab === 'zoom' && <ZoomTab store={store} />}
        {activeTab === 'bestBidAsk' && <BestBidAskTab store={store} />}
        {activeTab === 'dom' && <DOMTab store={store} />}
        {activeTab === 'tradeFlow' && <TradeFlowTab store={store} />}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-700">
        <button
          onClick={() => store.resetToDefaults()}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Reset
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ============ TAB COMPONENTS ============

interface TabProps {
  store: HeatmapSettingsState;
}

function GeneralTab({ store }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Auto Center */}
      <ToggleOption
        label="Auto Center"
        description="Keep price centered on screen"
        checked={store.autoCenter}
        onChange={store.setAutoCenter}
      />

      {/* Color Scheme */}
      <SelectOption<ColorScheme>
        label="Color Scheme"
        value={store.colorScheme}
        onChange={store.setColorScheme}
        options={[
          { value: 'atas', label: 'Professional' },
          { value: 'bookmap', label: 'Oceanic' },
          { value: 'sierra', label: 'Classic' },
          { value: 'highcontrast', label: 'High Contrast' },
        ]}
      />
    </div>
  );
}

function DisplayTab({ store }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Upper Cut-off */}
      <SliderOption
        label="Upper Cut-off"
        value={store.upperCutoffPercent}
        onChange={store.setUpperCutoffPercent}
        min={50}
        max={100}
        step={1}
        unit="%"
      />

      {/* Contrast */}
      <SliderOption
        label="Contrast"
        value={store.contrast}
        onChange={store.setContrast}
        min={0.5}
        max={3}
        step={0.1}
        unit="x"
      />

      {/* Smoothing Mode */}
      <SelectOption<SmoothingMode>
        label="Smoothing"
        value={store.smoothing}
        onChange={store.setSmoothing}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'manual', label: 'Manual' },
          { value: 'none', label: 'None' },
        ]}
      />

      {/* Smoothing Value (only if manual) */}
      {store.smoothing === 'manual' && (
        <SliderOption
          label="Smoothing Value"
          value={store.smoothingValue}
          onChange={store.setSmoothingValue}
          min={1}
          max={10}
          step={1}
        />
      )}

      {/* Transparency */}
      <ToggleOption
        label="Use Transparency"
        description="Apply alpha channel to colors"
        checked={store.useTransparency}
        onChange={store.setUseTransparency}
      />
    </div>
  );
}

function ZoomTab({ store }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Auto Center Toggle */}
      <ToggleOption
        label="Lock to Market"
        description="Auto-center on current price"
        checked={store.autoCenter}
        onChange={store.setAutoCenter}
      />

      {/* Price Zoom Level */}
      <SliderOption
        label="Price Zoom"
        value={store.zoomLevel}
        onChange={store.setZoomLevel}
        min={0.1}
        max={10}
        step={0.1}
        unit="x"
      />

      {/* Price Offset (when not auto-centered) */}
      {!store.autoCenter && (
        <SliderOption
          label="Price Offset"
          value={store.priceOffset}
          onChange={store.setPriceOffset}
          min={-500}
          max={500}
          step={1}
          unit=""
        />
      )}

      {/* Reset Zoom Button */}
      <div className="pt-2">
        <button
          onClick={() => store.resetZoom()}
          className="w-full px-3 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
        >
          Reset Zoom & Position
        </button>
      </div>

      {/* Help text */}
      <div className="text-xs text-zinc-500 space-y-1 pt-2 border-t border-zinc-700">
        <p><strong>Tips:</strong></p>
        <p>• Right-click + drag: Free pan</p>
        <p>• Shift + wheel: Time zoom</p>
        <p>• Drag price axis: Price zoom</p>
        <p>• Double-click: Reset view</p>
      </div>
    </div>
  );
}

function BestBidAskTab({ store }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Pixel Size */}
      <SliderOption
        label="Bar Width"
        value={store.bestBidAskPixelSize}
        onChange={store.setBestBidAskPixelSize}
        min={20}
        max={100}
        step={5}
        unit="px"
      />

      {/* Best Bid Color */}
      <ColorOption
        label="Best Bid Color"
        value={store.bestBidColor}
        onChange={store.setBestBidColor}
      />

      {/* Best Ask Color */}
      <ColorOption
        label="Best Ask Color"
        value={store.bestAskColor}
        onChange={store.setBestAskColor}
      />
    </div>
  );
}

function DOMTab({ store }: TabProps) {
  return (
    <div className="space-y-4">
      {/* Max Volume Size */}
      <SliderOption
        label="Max Volume Size"
        value={store.maxVolumePixelSize}
        onChange={store.setMaxVolumePixelSize}
        min={20}
        max={200}
        step={10}
        unit="px"
      />

      {/* Ask Background */}
      <ColorOption
        label="Ask Background"
        value={store.domColors.askBackground}
        onChange={(color) => store.setDOMColors({ askBackground: color })}
      />

      {/* Bid Background */}
      <ColorOption
        label="Bid Background"
        value={store.domColors.bidBackground}
        onChange={(color) => store.setDOMColors({ bidBackground: color })}
      />

      {/* Best Bid Text Color */}
      <ColorOption
        label="Best Bid Text"
        value={store.domColors.bestBidTextColor}
        onChange={(color) => store.setDOMColors({ bestBidTextColor: color })}
      />

      {/* Best Ask Text Color */}
      <ColorOption
        label="Best Ask Text"
        value={store.domColors.bestAskTextColor}
        onChange={(color) => store.setDOMColors({ bestAskTextColor: color })}
      />
    </div>
  );
}

function TradeFlowTab({ store }: TabProps) {
  const { tradeFlow } = store;

  return (
    <div className="space-y-4">
      {/* Enable */}
      <ToggleOption
        label="Enable Trade Flow"
        description="Show trade bubbles on heatmap"
        checked={tradeFlow.enabled}
        onChange={(enabled) => store.setTradeFlowSettings({ enabled })}
      />

      {tradeFlow.enabled && (
        <>
          {/* Bubble Size */}
          <SliderOption
            label="Bubble Size"
            value={tradeFlow.bubbleSize || 0.6}
            onChange={(bubbleSize) => store.setTradeFlowSettings({ bubbleSize })}
            min={0.1}
            max={2}
            step={0.1}
            unit="x"
          />

          {/* Bubble Opacity */}
          <SliderOption
            label="Bubble Opacity"
            value={tradeFlow.bubbleOpacity || 0.7}
            onChange={(bubbleOpacity) => store.setTradeFlowSettings({ bubbleOpacity })}
            min={0.1}
            max={1}
            step={0.1}
            unit=""
          />

          {/* Bubble Border Width */}
          <SliderOption
            label="Border Width"
            value={tradeFlow.bubbleBorderWidth ?? 1.5}
            onChange={(bubbleBorderWidth) => store.setTradeFlowSettings({ bubbleBorderWidth })}
            min={0}
            max={4}
            step={0.5}
            unit="px"
          />

          {/* Bubble Shape */}
          <SelectOption<BubbleShape>
            label="Bubble Shape"
            value={tradeFlow.bubbleShape}
            onChange={(bubbleShape) => store.setTradeFlowSettings({ bubbleShape })}
            options={[
              { value: 'circle', label: 'Circle' },
              { value: 'pie', label: 'Pie Chart (mixed)' },
            ]}
          />

          {/* Cumulative Mode */}
          <ToggleOption
            label="Cumulative Mode"
            description="Group trades by price/time"
            checked={tradeFlow.cumulativeMode}
            onChange={(cumulativeMode) => store.setTradeFlowSettings({ cumulativeMode })}
          />

          {/* Filter Threshold */}
          <SliderOption
            label="Filter Threshold"
            value={tradeFlow.filterThreshold}
            onChange={(filterThreshold) => store.setTradeFlowSettings({ filterThreshold })}
            min={0}
            max={2}
            step={0.1}
            unit="x"
          />

          {/* Show Text Labels */}
          <ToggleOption
            label="Show Volume Labels"
            description="Display volume on large bubbles"
            checked={tradeFlow.showTextLabels}
            onChange={(showTextLabels) => store.setTradeFlowSettings({ showTextLabels })}
          />
        </>
      )}
    </div>
  );
}

// ============ REUSABLE COMPONENTS ============

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
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
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
        <span className="text-xs text-zinc-400">
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
        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
      />
    </div>
  );
}

interface SelectOptionProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

function SelectOption<T extends string>({ label, value, onChange, options }: SelectOptionProps<T>) {
  return (
    <div className="space-y-1">
      <span className="text-sm text-white">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full px-3 py-1.5 text-sm bg-zinc-800 border border-zinc-600 rounded text-white focus:outline-none focus:border-green-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ColorOptionProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorOption({ label, value, onChange }: ColorOptionProps) {
  // Parse rgba to hex for the swatch display
  const hexValue = value.startsWith('rgba')
    ? rgbaToHex(value)
    : value.startsWith('#')
    ? value.slice(0, 7)
    : value;

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white">{label}</span>
      <div className="flex items-center gap-2">
        <InlineColorSwatch
          value={hexValue}
          onChange={(c) => onChange(c)}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 px-2 py-1 text-xs bg-zinc-800 border border-zinc-600 rounded text-zinc-400 font-mono"
        />
      </div>
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
