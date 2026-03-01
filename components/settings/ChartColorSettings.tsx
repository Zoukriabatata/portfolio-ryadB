'use client';

/**
 * CHART COLOR SETTINGS - Redesigned
 *
 * Panel de personnalisation des couleurs du chart
 * Style professionnel avec meilleur design
 */

import { useState, useRef, useEffect } from 'react';
import { useFootprintSettingsStore, type FootprintColors } from '@/stores/useFootprintSettingsStore';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface ChartColorSettingsProps {
  colors: {
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridColor: string;
  };
  onClose?: () => void;
}


type ColorCategory = 'candle' | 'volume' | 'imbalance' | 'general';

interface ColorItem {
  key: keyof FootprintColors;
  label: string;
  labelFr: string;
  category: ColorCategory;
}

const COLOR_ITEMS: ColorItem[] = [
  // Candles
  { key: 'candleUpBody', label: 'Bullish Body', labelFr: 'Corps Haussier', category: 'candle' },
  { key: 'candleDownBody', label: 'Bearish Body', labelFr: 'Corps Baissier', category: 'candle' },
  { key: 'candleUpBorder', label: 'Bullish Border', labelFr: 'Bordure Haussiere', category: 'candle' },
  { key: 'candleDownBorder', label: 'Bearish Border', labelFr: 'Bordure Baissiere', category: 'candle' },
  { key: 'candleUpWick', label: 'Bullish Wick', labelFr: 'Meche Haussiere', category: 'candle' },
  { key: 'candleDownWick', label: 'Bearish Wick', labelFr: 'Meche Baissiere', category: 'candle' },
  // Volume / Bid-Ask
  { key: 'bidColor', label: 'Bid (Sell)', labelFr: 'Bid (Vente)', category: 'volume' },
  { key: 'askColor', label: 'Ask (Buy)', labelFr: 'Ask (Achat)', category: 'volume' },
  { key: 'bidTextColor', label: 'Bid Text', labelFr: 'Texte Bid', category: 'volume' },
  { key: 'askTextColor', label: 'Ask Text', labelFr: 'Texte Ask', category: 'volume' },
  { key: 'deltaPositive', label: 'Delta +', labelFr: 'Delta +', category: 'volume' },
  { key: 'deltaNegative', label: 'Delta -', labelFr: 'Delta -', category: 'volume' },
  // Imbalance
  { key: 'imbalanceBuyBg', label: 'Buy Imbalance', labelFr: 'Imbalance Achat', category: 'imbalance' },
  { key: 'imbalanceSellBg', label: 'Sell Imbalance', labelFr: 'Imbalance Vente', category: 'imbalance' },
  // General
  { key: 'background', label: 'Background', labelFr: 'Fond', category: 'general' },
  { key: 'surface', label: 'Surface', labelFr: 'Surface', category: 'general' },
  { key: 'gridColor', label: 'Grid', labelFr: 'Grille', category: 'general' },
  { key: 'pocColor', label: 'POC', labelFr: 'POC', category: 'general' },
  { key: 'currentPriceColor', label: 'Current Price', labelFr: 'Prix Actuel', category: 'general' },
  { key: 'textPrimary', label: 'Text Primary', labelFr: 'Texte Principal', category: 'general' },
  { key: 'textSecondary', label: 'Text Secondary', labelFr: 'Texte Secondaire', category: 'general' },
];

export default function ChartColorSettings({ colors, onClose }: ChartColorSettingsProps) {
  const settings = useFootprintSettingsStore();
  const [activeCategory, setActiveCategory] = useState<ColorCategory>('candle');
  const [editingColor, setEditingColor] = useState<keyof FootprintColors | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setEditingColor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateColor = (key: keyof FootprintColors, value: string) => {
    settings.setColors({ [key]: value });
  };

  const filteredItems = COLOR_ITEMS.filter(item => item.category === activeCategory);

  const categories: { id: ColorCategory; label: string; icon: React.ReactNode }[] = [
    {
      id: 'candle',
      label: 'Bougies',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="8" y="6" width="3" height="10" rx="0.5" />
          <line x1="9.5" y1="3" x2="9.5" y2="6" />
          <line x1="9.5" y1="16" x2="9.5" y2="20" />
          <rect x="14" y="9" width="3" height="8" rx="0.5" />
          <line x1="15.5" y1="6" x2="15.5" y2="9" />
          <line x1="15.5" y1="17" x2="15.5" y2="21" />
        </svg>
      ),
    },
    {
      id: 'volume',
      label: 'Bid/Ask',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="8" width="4" height="12" rx="1" />
          <rect x="10" y="4" width="4" height="16" rx="1" />
          <rect x="16" y="10" width="4" height="10" rx="1" />
        </svg>
      ),
    },
    {
      id: 'imbalance',
      label: 'Imbalance',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4m0 14v4m11-11h-4M5 12H1m16.95 6.95l-2.83-2.83M8.88 8.88L6.05 6.05m12.9 0l-2.83 2.83M8.88 15.12l-2.83 2.83" />
        </svg>
      ),
    },
  ];

  return (
    <div
      ref={panelRef}
      className="flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      style={{
        backgroundColor: 'rgba(15, 15, 20, 0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
        width: 320,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2m0 18v2m11-11h-2M3 12H1m17.07 7.07l-1.41-1.41M7.34 7.34L5.93 5.93m12.14 0l-1.41 1.41M7.34 16.66l-1.41 1.41" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Couleurs</h3>
            <p className="text-[10px] text-[var(--text-muted)]">Personnalisation du chart</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div
        className="flex gap-1 px-3 py-2"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      >
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
              activeCategory === cat.id
                ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/5'
            }`}
          >
            {cat.icon}
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Color List */}
      <div className="flex flex-col gap-0.5 p-2 max-h-[320px] overflow-y-auto">
        {filteredItems.map(item => {
          const currentColor = settings.colors[item.key] as string;
          const isEditing = editingColor === item.key;

          return (
            <div key={item.key} className="relative">
              <button
                onClick={() => setEditingColor(isEditing ? null : item.key)}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl transition-all ${
                  isEditing
                    ? 'bg-white/10 ring-1 ring-violet-500/30'
                    : 'hover:bg-white/5'
                }`}
              >
                <span className="text-xs text-[var(--text-muted)]">
                  {item.labelFr}
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg shadow-inner ring-1 ring-white/10"
                    style={{ backgroundColor: currentColor }}
                  />
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-[var(--text-muted)] transition-transform ${isEditing ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>

              {/* Color Picker Dropdown */}
              {isEditing && (
                <div
                  ref={pickerRef}
                  className="absolute right-0 top-full mt-2 p-3 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  style={{
                    backgroundColor: 'rgba(20, 20, 28, 0.98)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
                    minWidth: 230,
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <ColorPicker
                    value={currentColor}
                    onChange={(c) => updateColor(item.key, c)}
                    label=""
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Opacity Sliders */}
      {(activeCategory === 'imbalance' || activeCategory === 'general') && (
        <div
          className="px-4 py-3 space-y-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {activeCategory === 'imbalance' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-muted)]">Opacité Imbalance</span>
                <span className="text-xs font-mono text-violet-400">
                  {Math.round(settings.colors.imbalanceOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={settings.colors.imbalanceOpacity * 100}
                onChange={(e) => settings.setColors({ imbalanceOpacity: Number(e.target.value) / 100 })}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-violet-500"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 ${settings.colors.imbalanceOpacity * 100}%, #27272a ${settings.colors.imbalanceOpacity * 100}%)`,
                }}
              />
            </div>
          )}
          {activeCategory === 'general' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-muted)]">Opacité Grille</span>
                  <span className="text-xs font-mono text-violet-400">
                    {Math.round(settings.colors.gridOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.colors.gridOpacity * 100}
                  onChange={(e) => settings.setColors({ gridOpacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 ${settings.colors.gridOpacity * 100}%, #27272a ${settings.colors.gridOpacity * 100}%)`,
                  }}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-muted)]">Opacité POC</span>
                  <span className="text-xs font-mono text-violet-400">
                    {Math.round(settings.colors.pocOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.colors.pocOpacity * 100}
                  onChange={(e) => settings.setColors({ pocOpacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-violet-500"
                  style={{
                    background: `linear-gradient(to right, #8b5cf6 ${settings.colors.pocOpacity * 100}%, #27272a ${settings.colors.pocOpacity * 100}%)`,
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={() => settings.resetToDefaults()}
          className="text-xs px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-all"
        >
          Réinitialiser
        </button>
        <div className="flex items-center gap-1.5">
          <div
            className="w-4 h-6 rounded"
            style={{ backgroundColor: settings.colors.candleUpBody }}
          />
          <div
            className="w-4 h-6 rounded"
            style={{ backgroundColor: settings.colors.candleDownBody }}
          />
          <span className="text-[10px] text-[var(--text-muted)] ml-1">Preview</span>
        </div>
      </div>
    </div>
  );
}
