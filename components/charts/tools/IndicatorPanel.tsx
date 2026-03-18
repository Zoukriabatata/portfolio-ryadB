'use client';

import { useState, useRef, useEffect } from 'react';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import type { IndicatorType } from '@/types/charts';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

const AVAILABLE_INDICATORS: { type: IndicatorType; label: string; defaultParams: Record<string, number>; description: string }[] = [
  { type: 'VWAP', label: 'VWAP', defaultParams: {}, description: 'Volume Weighted Average Price' },
  { type: 'TWAP', label: 'TWAP', defaultParams: {}, description: 'Time Weighted Average Price' },
  { type: 'EMA', label: 'EMA', defaultParams: { period: 20 }, description: 'Exponential Moving Average' },
  { type: 'SMA', label: 'SMA', defaultParams: { period: 50 }, description: 'Simple Moving Average' },
];

interface IndicatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IndicatorPanel({ isOpen, onClose }: IndicatorPanelProps) {
  const { indicators, toggleIndicator, addIndicator, removeIndicator, updateIndicator } = useIndicatorStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddIndicator = (type: IndicatorType) => {
    const config = AVAILABLE_INDICATORS.find(i => i.type === type);
    if (!config) return;

    // Check if already exists (only allow one of each type)
    if (indicators.some(i => i.type === type)) {
      return;
    }

    const id = `${type.toLowerCase()}-${Date.now()}`;
    addIndicator({
      id,
      type,
      enabled: true,
      params: { ...config.defaultParams },
      style: {
        color: type === 'VWAP' ? '#f59e0b' : type === 'TWAP' ? '#3b82f6' : type === 'EMA' ? '#22d3ee' : '#a78bfa',
        lineWidth: 2,
      },
      paneId: 'main',
    });
  };

  const getRandomColor = () => {
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  return (
    <div className="absolute top-12 right-2 z-20 w-72 backdrop-blur rounded-lg shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Indicators</span>
        <button
          onClick={onClose}
          className="text-lg transition-colors"
          style={{ color: 'var(--text-dimmed)' }}
        >
          ×
        </button>
      </div>

      {/* Active Indicators */}
      <div className="p-2 max-h-60 overflow-y-auto">
        {indicators.length === 0 ? (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-dimmed)' }}>No indicators added</p>
        ) : (
          <div className="space-y-1">
            {indicators.map((indicator) => (
              <div
                key={indicator.id}
                className="rounded"
                style={{ backgroundColor: 'var(--surface-elevated)' }}
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleIndicator(indicator.id)}
                    className="w-4 h-4 rounded border flex items-center justify-center"
                    style={{
                      backgroundColor: indicator.enabled ? 'var(--primary)' : 'transparent',
                      borderColor: indicator.enabled ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    {indicator.enabled && (
                      <span className="text-white text-xs">✓</span>
                    )}
                  </button>

                  {/* Color indicator */}
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: indicator.style.color }}
                  />

                  {/* Label */}
                  <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {indicator.type}
                    {indicator.params.period && ` (${indicator.params.period})`}
                  </span>

                  {/* Settings toggle */}
                  <button
                    onClick={() => setExpandedId(expandedId === indicator.id ? null : indicator.id)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-dimmed)' }}
                  >
                    ⚙
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => removeIndicator(indicator.id)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-dimmed)' }}
                  >
                    ×
                  </button>
                </div>

                {/* Expanded settings */}
                {expandedId === indicator.id && (
                  <div className="px-2 pb-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(indicator.params).map(([key, value]) => (
                        <label key={key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] capitalize" style={{ color: 'var(--text-dimmed)' }}>{key}</span>
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => updateIndicator(indicator.id, {
                              params: { ...indicator.params, [key]: Number(e.target.value) }
                            })}
                            className="text-xs rounded px-2 py-1 w-full focus:outline-none"
                            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                          />
                        </label>
                      ))}
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Color</span>
                        <InlineColorSwatch
                          value={indicator.style.color}
                          onChange={(c) => updateIndicator(indicator.id, {
                            style: { ...indicator.style, color: c }
                          })}
                          size={5}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Indicator */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-dimmed)' }}>Add Indicator</p>
        <div className="space-y-1">
          {AVAILABLE_INDICATORS.map((ind) => {
            const isAdded = indicators.some(i => i.type === ind.type);
            return (
              <button
                key={ind.type}
                onClick={() => handleAddIndicator(ind.type)}
                disabled={isAdded}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded transition-colors active:scale-[0.98]"
                style={{
                  backgroundColor: isAdded ? 'var(--surface)' : 'var(--surface-elevated)',
                  color: isAdded ? 'var(--text-dimmed)' : 'var(--text-secondary)',
                  cursor: isAdded ? 'not-allowed' : undefined,
                  opacity: isAdded ? 0.5 : 1,
                }}
              >
                <span className="font-medium">{ind.label}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{ind.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
