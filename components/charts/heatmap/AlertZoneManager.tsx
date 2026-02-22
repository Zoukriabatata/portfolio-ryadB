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
    <div className="absolute top-12 left-2 z-20 w-72 backdrop-blur rounded-lg shadow-xl" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Alert Zones</span>
        <button
          onClick={onClose}
          className="text-lg transition-colors"
          style={{ color: 'var(--text-dimmed)' }}
        >
          ×
        </button>
      </div>

      {/* Existing Zones */}
      <div className="p-2 max-h-40 overflow-y-auto">
        {alertZones.length === 0 ? (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-dimmed)' }}>No alert zones defined</p>
        ) : (
          <div className="space-y-1">
            {alertZones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded"
                style={{
                  backgroundColor: zone.triggered ? 'var(--bear-bg)' : 'var(--surface-elevated)',
                }}
              >
                {/* Enable toggle */}
                <button
                  onClick={() => updateAlertZone(zone.id, { enabled: !zone.enabled })}
                  className="w-4 h-4 rounded border flex items-center justify-center"
                  style={{
                    backgroundColor: zone.enabled ? 'var(--primary)' : 'transparent',
                    borderColor: zone.enabled ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  {zone.enabled && <span className="text-white text-xs">✓</span>}
                </button>

                {/* Type indicator */}
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: zone.type === 'support' ? 'var(--bull)' :
                      zone.type === 'resistance' ? 'var(--bear)' : 'var(--primary)',
                  }}
                />

                {/* Price range */}
                <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {zone.priceMin.toFixed(2)} - {zone.priceMax.toFixed(2)}
                </span>

                {/* Triggered indicator */}
                {zone.triggered && (
                  <span className="text-[10px]" style={{ color: 'var(--bear)' }}>TRIGGERED</span>
                )}

                {/* Remove */}
                <button
                  onClick={() => removeAlertZone(zone.id)}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Zone */}
      <div className="p-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-[10px] mb-2" style={{ color: 'var(--text-dimmed)' }}>Add New Zone</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Min Price</span>
            <input
              type="number"
              value={newZone.priceMin}
              onChange={(e) => setNewZone(z => ({ ...z, priceMin: parseFloat(e.target.value) }))}
              className="text-xs rounded px-2 py-1 w-full focus:outline-none"
              style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              step="0.01"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Max Price</span>
            <input
              type="number"
              value={newZone.priceMax}
              onChange={(e) => setNewZone(z => ({ ...z, priceMax: parseFloat(e.target.value) }))}
              className="text-xs rounded px-2 py-1 w-full focus:outline-none"
              style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              step="0.01"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <label className="flex flex-col gap-0.5 flex-1">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Type</span>
            <select
              value={newZone.type}
              onChange={(e) => setNewZone(z => ({ ...z, type: e.target.value as AlertZone['type'] }))}
              className="text-xs rounded px-2 py-1 focus:outline-none"
              style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <option value="support">Support</option>
              <option value="resistance">Resistance</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <button
          onClick={handleAddZone}
          className="w-full px-3 py-1.5 text-xs rounded transition-colors active:scale-[0.98]"
          style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
        >
          Add Zone
        </button>
      </div>
    </div>
  );
}
