'use client';

/**
 * ReplaySettingsPanel
 *
 * Floating settings panel for customizing replay chart indicators,
 * colors, and thresholds. Reads/writes useFootprintSettingsStore.
 */

import { useState, useRef, useEffect } from 'react';
import { useFootprintSettingsStore } from '@/stores/useFootprintSettingsStore';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface ReplaySettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'indicators' | 'colors' | 'thresholds';

export default function ReplaySettingsPanel({ isOpen, onClose }: ReplaySettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('indicators');
  const { features, colors, imbalance, setFeatures, setColors, setImbalance } = useFootprintSettingsStore();

  if (!isOpen) return null;

  return (
    <div className="absolute top-12 right-2 z-50 rounded-xl overflow-hidden" style={{
      background: '#12121a',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      width: 320,
      maxHeight: 480,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>Chart Settings</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.06)]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-2 pt-2 gap-1">
        {(['indicators', 'colors', 'thresholds'] as SettingsTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 rounded text-[10px] font-mono transition-colors"
            style={{
              background: tab === t ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
              fontWeight: tab === t ? 700 : 400,
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 py-3 overflow-y-auto" style={{ maxHeight: 380 }}>
        {tab === 'indicators' && (
          <div className="space-y-1.5">
            <Toggle label="VWAP / TWAP" value={features.showVWAPTWAP} onChange={v => setFeatures({ showVWAPTWAP: v })} />
            <Toggle label="  ├─ VWAP" value={features.showVWAP} onChange={v => setFeatures({ showVWAP: v })} indent />
            <Toggle label="  ├─ TWAP" value={features.showTWAP} onChange={v => setFeatures({ showTWAP: v })} indent />
            <Toggle label="  └─ VWAP Bands" value={features.showVWAPBands} onChange={v => setFeatures({ showVWAPBands: v })} indent />
            <Divider />
            <Toggle label="Developing POC" value={features.showDevelopingPOC} onChange={v => setFeatures({ showDevelopingPOC: v })} />
            <Toggle label="CVD Panel" value={features.showCVDPanel} onChange={v => setFeatures({ showCVDPanel: v })} />
            <Toggle label="Delta Profile" value={features.showDeltaProfile} onChange={v => setFeatures({ showDeltaProfile: v })} />
            <Divider />
            <Toggle label="Stacked Imbalances" value={features.showStackedImbalances} onChange={v => setFeatures({ showStackedImbalances: v })} />
            <Toggle label="Naked POC" value={features.showNakedPOC} onChange={v => setFeatures({ showNakedPOC: v })} />
            <Toggle label="Unfinished Auctions" value={features.showUnfinishedAuctions} onChange={v => setFeatures({ showUnfinishedAuctions: v })} />
            <Divider />
            <Toggle label="Session Separators" value={features.showSessionSeparators} onChange={v => setFeatures({ showSessionSeparators: v })} />
            <Toggle label="Heatmap Cells" value={features.showHeatmapCells} onChange={v => setFeatures({ showHeatmapCells: v })} />
            <Toggle label="Large Trade Highlight" value={features.showLargeTradeHighlight} onChange={v => setFeatures({ showLargeTradeHighlight: v })} />
          </div>
        )}

        {tab === 'colors' && (
          <div className="space-y-2">
            <ColorRow label="VWAP" value={features.vwapColor} onChange={v => setFeatures({ vwapColor: v })} />
            <ColorRow label="TWAP" value={features.twapColor} onChange={v => setFeatures({ twapColor: v })} />
            <ColorRow label="Developing POC" value={features.developingPOCColor} onChange={v => setFeatures({ developingPOCColor: v })} />
            <ColorRow label="Naked POC" value={features.nakedPOCColor} onChange={v => setFeatures({ nakedPOCColor: v })} />
            <ColorRow label="Large Trade" value={features.largeTradeColor} onChange={v => setFeatures({ largeTradeColor: v })} />
            <ColorRow label="CVD Line" value={features.cvdLineColor} onChange={v => setFeatures({ cvdLineColor: v })} />
            <Divider />
            <ColorRow label="Delta +" value={features.deltaProfilePositiveColor} onChange={v => setFeatures({ deltaProfilePositiveColor: v })} />
            <ColorRow label="Delta −" value={features.deltaProfileNegativeColor} onChange={v => setFeatures({ deltaProfileNegativeColor: v })} />
            <Divider />
            <ColorRow label="Candle Up" value={colors.candleUpBody} onChange={v => setColors({ candleUpBody: v, candleUpBorder: v, candleUpWick: v })} />
            <ColorRow label="Candle Down" value={colors.candleDownBody} onChange={v => setColors({ candleDownBody: v, candleDownBorder: v, candleDownWick: v })} />
          </div>
        )}

        {tab === 'thresholds' && (
          <div className="space-y-3">
            <SliderRow label="Imbalance Ratio" value={imbalance.ratio} min={1.5} max={6} step={0.5} onChange={v => setImbalance({ ratio: v })} format={v => `${v.toFixed(1)}x`} />
            <SliderRow label="Stacked Min Levels" value={features.stackedImbalanceMin} min={2} max={8} step={1} onChange={v => setFeatures({ stackedImbalanceMin: v })} format={v => `${v}`} />
            <SliderRow label="Large Trade Mult." value={features.largeTradeMultiplier} min={2} max={10} step={0.5} onChange={v => setFeatures({ largeTradeMultiplier: v })} format={v => `${v.toFixed(1)}x`} />
            <Divider />
            <SliderRow label="VWAP Line Width" value={features.vwapLineWidth} min={1} max={4} step={0.5} onChange={v => setFeatures({ vwapLineWidth: v })} format={v => `${v}px`} />
            <SliderRow label="TWAP Line Width" value={features.twapLineWidth} min={1} max={4} step={0.5} onChange={v => setFeatures({ twapLineWidth: v })} format={v => `${v}px`} />
            <SliderRow label="VWAP Band Opacity" value={features.vwapBandOpacity} min={0.02} max={0.2} step={0.02} onChange={v => setFeatures({ vwapBandOpacity: v })} format={v => `${Math.round(v * 100)}%`} />
            <Divider />
            <SliderRow label="CVD Panel Height" value={features.cvdPanelHeight} min={40} max={120} step={10} onChange={v => setFeatures({ cvdPanelHeight: v })} format={v => `${v}px`} />
            <SliderRow label="Heatmap Intensity" value={features.heatmapIntensity} min={0.1} max={0.8} step={0.05} onChange={v => setFeatures({ heatmapIntensity: v })} format={v => `${Math.round(v * 100)}%`} />
            <SliderRow label="Delta Profile α" value={features.deltaProfileOpacity} min={0.2} max={1} step={0.1} onChange={v => setFeatures({ deltaProfileOpacity: v })} format={v => `${Math.round(v * 100)}%`} />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Toggle({ label, value, onChange, indent }: { label: string; value: boolean; onChange: (v: boolean) => void; indent?: boolean }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-0.5" style={{ paddingLeft: indent ? 8 : 0 }}>
      <span className="text-[10px] font-mono" style={{ color: value ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        className="w-7 h-4 rounded-full transition-colors relative"
        style={{ background: value ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
          style={{ left: value ? 14 : 2, background: value ? '#4ade80' : 'rgba(255,255,255,0.3)' }}
        />
      </div>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
    <div className="flex items-center justify-between" ref={ref}>
      <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-6 h-5 rounded cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all"
          style={{ backgroundColor: value || '#ffffff', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
        />
        {open && (
          <div className="absolute z-50 mt-1 right-0" style={{
            width: 220,
            padding: 8,
            borderRadius: 8,
            backgroundColor: '#1c1f26',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <ColorPicker value={value || '#ffffff'} onChange={onChange} label="" />
          </div>
        )}
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '4px 0' }} />;
}
