'use client';

import { useState } from 'react';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import type { AlertZone } from '@/types/heatmap';

interface AlertZoneManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrice: number;
}

export default function AlertZoneManager({ isOpen, onClose, currentPrice }: AlertZoneManagerProps) {
  const { alertZones, addAlertZone, removeAlertZone, updateAlertZone } = useHeatmapSettingsStore();
  const [newZone, setNewZone] = useState<{
    priceMin: number;
    priceMax: number;
    type: 'support' | 'resistance' | 'custom';
  }>({
    priceMin: currentPrice * 0.99,
    priceMax: currentPrice * 1.01,
    type: 'custom',
  });

  if (!isOpen) return null;

  const handleAddZone = () => {
    const zone: AlertZone = {
      id: `zone-${Date.now()}`,
      priceMin: newZone.priceMin,
      priceMax: newZone.priceMax,
      type: newZone.type,
      enabled: true,
      triggered: false,
      notifyOnTouch: true,
      notifyOnBreak: true,
    };
    addAlertZone(zone);
    setNewZone({
      priceMin: currentPrice * 0.99,
      priceMax: currentPrice * 1.01,
      type: 'custom',
    });
  };

  return (
    <div className="absolute top-12 left-2 z-20 w-72 bg-zinc-900/95 backdrop-blur rounded-lg shadow-xl border border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-sm font-medium text-zinc-200">Alert Zones</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 text-lg"
        >
          ×
        </button>
      </div>

      {/* Existing Zones */}
      <div className="p-2 max-h-40 overflow-y-auto">
        {alertZones.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-2">No alert zones defined</p>
        ) : (
          <div className="space-y-1">
            {alertZones.map((zone) => (
              <div
                key={zone.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                  zone.triggered ? 'bg-red-500/20' : 'bg-zinc-800/50'
                }`}
              >
                {/* Enable toggle */}
                <button
                  onClick={() => updateAlertZone(zone.id, { enabled: !zone.enabled })}
                  className={`w-4 h-4 rounded border flex items-center justify-center
                    ${zone.enabled
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-zinc-600'
                    }`}
                >
                  {zone.enabled && <span className="text-white text-xs">✓</span>}
                </button>

                {/* Type indicator */}
                <span className={`w-2 h-2 rounded-full ${
                  zone.type === 'support' ? 'bg-green-500' :
                  zone.type === 'resistance' ? 'bg-red-500' :
                  'bg-blue-500'
                }`} />

                {/* Price range */}
                <span className="text-xs text-zinc-300 flex-1">
                  {zone.priceMin.toFixed(2)} - {zone.priceMax.toFixed(2)}
                </span>

                {/* Triggered indicator */}
                {zone.triggered && (
                  <span className="text-[10px] text-red-400">TRIGGERED</span>
                )}

                {/* Remove */}
                <button
                  onClick={() => removeAlertZone(zone.id)}
                  className="text-zinc-500 hover:text-red-400 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Zone */}
      <div className="p-2 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-500 mb-2">Add New Zone</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500">Min Price</span>
            <input
              type="number"
              value={newZone.priceMin}
              onChange={(e) => setNewZone(z => ({ ...z, priceMin: parseFloat(e.target.value) }))}
              className="bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 w-full"
              step="0.01"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-zinc-500">Max Price</span>
            <input
              type="number"
              value={newZone.priceMax}
              onChange={(e) => setNewZone(z => ({ ...z, priceMax: parseFloat(e.target.value) }))}
              className="bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 w-full"
              step="0.01"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <label className="flex flex-col gap-0.5 flex-1">
            <span className="text-[10px] text-zinc-500">Type</span>
            <select
              value={newZone.type}
              onChange={(e) => setNewZone(z => ({ ...z, type: e.target.value as AlertZone['type'] }))}
              className="bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1"
            >
              <option value="support">Support</option>
              <option value="resistance">Resistance</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <button
          onClick={handleAddZone}
          className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Add Zone
        </button>
      </div>
    </div>
  );
}
