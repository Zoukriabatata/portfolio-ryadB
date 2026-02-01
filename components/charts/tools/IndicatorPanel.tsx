'use client';

import { useState } from 'react';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import type { IndicatorType } from '@/types/charts';

const AVAILABLE_INDICATORS: { type: IndicatorType; label: string; defaultParams: Record<string, number>; description: string }[] = [
  { type: 'VWAP', label: 'VWAP', defaultParams: {}, description: 'Volume Weighted Average Price' },
  { type: 'TWAP', label: 'TWAP', defaultParams: {}, description: 'Time Weighted Average Price' },
  { type: 'VolumeProfile', label: 'Volume Profile', defaultParams: { bars: 50 }, description: 'Volume by price level' },
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
        color: type === 'VWAP' ? '#f59e0b' : type === 'TWAP' ? '#3b82f6' : '#22c55e',
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
    <div className="absolute top-12 right-2 z-20 w-72 bg-zinc-900/95 backdrop-blur rounded-lg shadow-xl border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Indicators</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-lg"
        >
          ×
        </button>
      </div>

      {/* Active Indicators */}
      <div className="p-2 max-h-60 overflow-y-auto">
        {indicators.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-2">No indicators added</p>
        ) : (
          <div className="space-y-1">
            {indicators.map((indicator) => (
              <div
                key={indicator.id}
                className="bg-zinc-800/50 rounded"
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleIndicator(indicator.id)}
                    className={`w-4 h-4 rounded border flex items-center justify-center
                      ${indicator.enabled
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-zinc-600'
                      }`}
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
                  <span className="text-xs text-zinc-300 flex-1">
                    {indicator.type}
                    {indicator.params.period && ` (${indicator.params.period})`}
                  </span>

                  {/* Settings toggle */}
                  <button
                    onClick={() => setExpandedId(expandedId === indicator.id ? null : indicator.id)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    ⚙
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => removeIndicator(indicator.id)}
                    className="text-zinc-500 hover:text-red-400 text-xs"
                  >
                    ×
                  </button>
                </div>

                {/* Expanded settings */}
                {expandedId === indicator.id && (
                  <div className="px-2 pb-2 pt-1 border-t border-zinc-700/50">
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(indicator.params).map(([key, value]) => (
                        <label key={key} className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-zinc-500 capitalize">{key}</span>
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => updateIndicator(indicator.id, {
                              params: { ...indicator.params, [key]: Number(e.target.value) }
                            })}
                            className="bg-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 w-full"
                          />
                        </label>
                      ))}
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-500">Color</span>
                        <input
                          type="color"
                          value={indicator.style.color}
                          onChange={(e) => updateIndicator(indicator.id, {
                            style: { ...indicator.style, color: e.target.value }
                          })}
                          className="w-full h-6 rounded cursor-pointer"
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
      <div className="p-2 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-500 mb-1.5">Add Indicator</p>
        <div className="space-y-1">
          {AVAILABLE_INDICATORS.map((ind) => {
            const isAdded = indicators.some(i => i.type === ind.type);
            return (
              <button
                key={ind.type}
                onClick={() => handleAddIndicator(ind.type)}
                disabled={isAdded}
                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded transition-colors ${
                  isAdded
                    ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                <span className="font-medium">{ind.label}</span>
                <span className="text-[10px] text-zinc-500">{ind.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
