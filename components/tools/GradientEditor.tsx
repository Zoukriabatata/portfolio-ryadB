'use client';

/**
 * GRADIENT EDITOR — Visual gradient stop editor with canvas preview.
 *
 * Features:
 *  - Canvas-rendered gradient bar preview
 *  - Draggable circle handles for each stop
 *  - Click bar to add stop, X button to delete
 *  - Selected stop: position slider + ColorPicker for color
 *  - Optional preset gradients
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { GradientStop, HeatmapGradient } from '@/lib/heatmap-webgl/themes/OrderflowTheme';
import { ColorPicker } from './ColorPicker';
import { X } from 'lucide-react';

// ============ BUILT-IN PRESETS ============

const PRESET_GRADIENTS: HeatmapGradient[] = [
  {
    name: 'Green',
    stops: [
      { position: 0, color: '#001a0a' },
      { position: 0.5, color: '#22c55e' },
      { position: 1, color: '#bbf7d0' },
    ],
  },
  {
    name: 'Red',
    stops: [
      { position: 0, color: '#1a0000' },
      { position: 0.5, color: '#ef4444' },
      { position: 1, color: '#fecaca' },
    ],
  },
  {
    name: 'Blue',
    stops: [
      { position: 0, color: '#000a1a' },
      { position: 0.5, color: '#3b82f6' },
      { position: 1, color: '#bfdbfe' },
    ],
  },
  {
    name: 'Magma',
    stops: [
      { position: 0, color: '#000000' },
      { position: 0.25, color: '#4a0080' },
      { position: 0.5, color: '#ff4500' },
      { position: 0.75, color: '#ffa500' },
      { position: 1, color: '#ffffff' },
    ],
  },
  {
    name: 'Cyan',
    stops: [
      { position: 0, color: '#001020' },
      { position: 0.5, color: '#06b6d4' },
      { position: 1, color: '#cffafe' },
    ],
  },
];

// ============ COMPONENT ============

interface GradientEditorProps {
  stops: GradientStop[];
  onChange: (stops: GradientStop[]) => void;
  presets?: HeatmapGradient[];
  minStops?: number;
  maxStops?: number;
  compact?: boolean;
  className?: string;
  label?: string;
}

export function GradientEditor({
  stops,
  onChange,
  presets,
  minStops = 2,
  maxStops = 12,
  compact = false,
  className = '',
  label,
}: GradientEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);

  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  // Draw gradient bar
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (sortedStops.length < 2) {
      ctx.fillStyle = sortedStops[0]?.color || '#333';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (const stop of sortedStops) {
      grad.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, [sortedStops]);

  // Handle click on bar to add stop
  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIndex.current !== null) return;
    if (stops.length >= maxStops) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const pos = Math.max(0, Math.min(1, x));

    // Interpolate color at this position
    const color = interpolateColorAt(sortedStops, pos);

    const newStops = [...stops, { position: pos, color }];
    onChange(newStops);
    setSelectedIndex(newStops.length - 1);
  }, [stops, maxStops, sortedStops, onChange]);

  // Drag handlers
  const handleStopPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    draggingIndex.current = index;
    setSelectedIndex(index);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingIndex.current === null) return;
    const bar = barRef.current;
    if (!bar) return;

    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

    const newStops = [...stops];
    newStops[draggingIndex.current] = { ...newStops[draggingIndex.current], position: x };
    onChange(newStops);
  }, [stops, onChange]);

  const handlePointerUp = useCallback(() => {
    draggingIndex.current = null;
  }, []);

  // Delete stop
  const handleDeleteStop = useCallback((index: number) => {
    if (stops.length <= minStops) return;
    const newStops = stops.filter((_, i) => i !== index);
    onChange(newStops);
    setSelectedIndex(null);
  }, [stops, minStops, onChange]);

  // Update selected stop color
  const handleStopColorChange = useCallback((color: string) => {
    if (selectedIndex === null || selectedIndex >= stops.length) return;
    const newStops = [...stops];
    newStops[selectedIndex] = { ...newStops[selectedIndex], color };
    onChange(newStops);
  }, [selectedIndex, stops, onChange]);

  // Update selected stop position
  const handleStopPositionChange = useCallback((pos: number) => {
    if (selectedIndex === null || selectedIndex >= stops.length) return;
    const newStops = [...stops];
    newStops[selectedIndex] = { ...newStops[selectedIndex], position: Math.max(0, Math.min(1, pos)) };
    onChange(newStops);
  }, [selectedIndex, stops, onChange]);

  const allPresets = presets || PRESET_GRADIENTS;
  const barHeight = compact ? 20 : 28;

  return (
    <div className={className}>
      {label && <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">{label}</label>}

      {/* Gradient bar + handles */}
      <div
        ref={barRef}
        className="relative rounded overflow-visible cursor-crosshair mb-2"
        style={{ height: barHeight, border: '1px solid var(--border)' }}
        onClick={handleBarClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          width={300}
          height={barHeight}
          className="w-full h-full rounded pointer-events-none"
        />

        {/* Stop handles */}
        {stops.map((stop, i) => (
          <div
            key={i}
            className="absolute pointer-events-auto"
            style={{
              left: `${stop.position * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => handleStopPointerDown(e, i)}
          >
            <div
              className={`rounded-full cursor-grab active:cursor-grabbing transition-shadow ${
                selectedIndex === i ? 'ring-2 ring-[var(--primary)]' : ''
              }`}
              style={{
                width: compact ? 10 : 14,
                height: compact ? 10 : 14,
                backgroundColor: stop.color,
                border: '2px solid #fff',
                boxShadow: '0 0 3px rgba(0,0,0,0.8)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Selected stop editor */}
      {selectedIndex !== null && selectedIndex < stops.length && !compact && (
        <div className="flex items-start gap-2 mb-2 p-2 rounded" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex-1">
            {/* Position slider */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-[var(--text-muted)] w-8">Pos</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stops[selectedIndex].position}
                onChange={(e) => handleStopPositionChange(parseFloat(e.target.value))}
                className="flex-1 h-1 accent-[var(--primary)]"
              />
              <span className="text-[10px] font-mono text-[var(--text-muted)] w-8 text-right">
                {Math.round(stops[selectedIndex].position * 100)}%
              </span>
            </div>

            {/* Color picker */}
            <ColorPicker
              value={stops[selectedIndex].color}
              onChange={handleStopColorChange}
              label=""
              compact
            />
          </div>

          {/* Delete button */}
          {stops.length > minStops && (
            <button
              onClick={() => handleDeleteStop(selectedIndex)}
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors flex-shrink-0"
              title="Remove stop"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* Presets */}
      {!compact && (
        <div>
          <div className="text-[9px] text-[var(--text-muted)] mb-1">Presets</div>
          <div className="flex items-center gap-1">
            {allPresets.map((preset, i) => (
              <button
                key={i}
                onClick={() => { onChange([...preset.stops]); setSelectedIndex(null); }}
                className="flex-1 h-4 rounded transition-all hover:scale-105"
                style={{
                  background: buildCSSGradient(preset.stops),
                  border: '1px solid var(--border)',
                }}
                title={preset.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ HELPERS ============

function buildCSSGradient(stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const s = sorted.map(st => `${st.color} ${st.position * 100}%`).join(', ');
  return `linear-gradient(to right, ${s})`;
}

function interpolateColorAt(sortedStops: GradientStop[], pos: number): string {
  if (sortedStops.length === 0) return '#888888';
  if (sortedStops.length === 1) return sortedStops[0].color;
  if (pos <= sortedStops[0].position) return sortedStops[0].color;
  if (pos >= sortedStops[sortedStops.length - 1].position) return sortedStops[sortedStops.length - 1].color;

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const a = sortedStops[i];
    const b = sortedStops[i + 1];
    if (pos >= a.position && pos <= b.position) {
      const t = (pos - a.position) / (b.position - a.position);
      return lerpColor(a.color, b.color, t);
    }
  }
  return sortedStops[0].color;
}

function lerpColor(hex1: string, hex2: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
