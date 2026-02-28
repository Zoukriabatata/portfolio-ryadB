'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ============ HSV ↔ HEX CONVERSIONS ============

function hsvToHex(h: number, s: number, v: number): string {
  const s1 = s / 100;
  const v1 = v / 100;
  const c = v1 * s1;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v1 - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, v: 100 };
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

// ============ PRESETS ============

const PRESET_COLORS = [
  '#22c55e', '#ef4444', '#3b82f6', '#fbbf24',
  '#06b6d4', '#a855f7', '#ec4899', '#f97316',
  '#ffffff', '#a1a1aa', '#525252', '#171717',
];

const COMPACT_COLORS = [
  '#22c55e', '#ef4444', '#3b82f6', '#fbbf24',
  '#a855f7', '#06b6d4', '#ffffff', '#525252',
];

// ============ COMPONENT ============

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function ColorPicker({ value, onChange, label = 'Color', className = '', compact = false }: ColorPickerProps) {
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [bright, setBright] = useState(100);
  const [hexInput, setHexInput] = useState(value);

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSvDragging = useRef(false);
  const isHueDragging = useRef(false);
  const internalUpdate = useRef(false);

  // Sync from external value
  useEffect(() => {
    if (internalUpdate.current) {
      internalUpdate.current = false;
      return;
    }
    const { h, s, v } = hexToHSV(value);
    setHue(h);
    setSat(s);
    setBright(v);
    setHexInput(value);
  }, [value]);

  // Draw SV gradient when hue changes
  useEffect(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // White → pure hue (horizontal)
    const hueColor = hsvToHex(hue, 100, 100);
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);

    // Transparent → black (vertical)
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, '#000000');
    ctx.fillStyle = gradV;
    ctx.fillRect(0, 0, w, h);
  }, [hue]);

  // Draw hue bar once
  useEffect(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) {
      grad.addColorStop(i / 6, hsvToHex(i * 60, 100, 100));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, []);

  const emitColor = useCallback((h: number, s: number, v: number) => {
    internalUpdate.current = true;
    const hex = hsvToHex(h, s, v);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  // SV drag
  const handleSVPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, start = false) => {
    if (start) {
      isSvDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!isSvDragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newS = x * 100;
    const newV = (1 - y) * 100;
    setSat(newS);
    setBright(newV);
    emitColor(hue, newS, newV);
  }, [hue, emitColor]);

  // Hue drag
  const handleHuePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, start = false) => {
    if (start) {
      isHueDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!isHueDragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newH = x * 360;
    setHue(newH);
    emitColor(newH, sat, bright);
  }, [sat, bright, emitColor]);

  const handlePointerUp = useCallback(() => {
    isSvDragging.current = false;
    isHueDragging.current = false;
  }, []);

  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setHexInput(v);
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      const { h, s, v: bv } = hexToHSV(v);
      setHue(h);
      setSat(s);
      setBright(bv);
      internalUpdate.current = true;
      onChange(v);
    }
  }, [onChange]);

  const colors = compact ? COMPACT_COLORS : PRESET_COLORS;

  // SV marker position
  const svMarkerX = `${(sat / 100) * 100}%`;
  const svMarkerY = `${(1 - bright / 100) * 100}%`;
  // Hue marker position
  const hueMarkerX = `${(hue / 360) * 100}%`;

  if (compact) {
    return (
      <div className={className}>
        <label className="block text-[10px] text-[var(--text-muted)] mb-1">{label}</label>
        <div className="flex items-center gap-1.5">
          <div
            className="w-6 h-6 rounded flex-shrink-0"
            style={{ backgroundColor: value, border: '1px solid var(--border)' }}
          />
          <div className="flex-1 grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => onChange(color)}
                className={`w-full aspect-square rounded transition-all hover:scale-110 ${
                  value.toLowerCase() === color.toLowerCase()
                    ? 'ring-1 ring-[var(--primary)]'
                    : ''
                }`}
                style={{ backgroundColor: color, border: '1px solid var(--border)' }}
                title={color}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">{label}</label>

      {/* SV Gradient Canvas */}
      <div className="relative mb-1.5 rounded overflow-hidden" style={{ height: 120, border: '1px solid var(--border)' }}>
        <canvas
          ref={svCanvasRef}
          width={200}
          height={120}
          className="w-full h-full cursor-crosshair"
          onPointerDown={(e) => handleSVPointer(e, true)}
          onPointerMove={handleSVPointer}
          onPointerUp={handlePointerUp}
        />
        {/* SV Marker */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: svMarkerX, top: svMarkerY,
            width: 10, height: 10,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 2px rgba(0,0,0,0.8)',
          }}
        />
      </div>

      {/* Hue Bar */}
      <div className="relative mb-2 rounded overflow-hidden" style={{ height: 14, border: '1px solid var(--border)' }}>
        <canvas
          ref={hueCanvasRef}
          width={200}
          height={14}
          className="w-full h-full cursor-ew-resize"
          onPointerDown={(e) => handleHuePointer(e, true)}
          onPointerMove={handleHuePointer}
          onPointerUp={handlePointerUp}
        />
        {/* Hue Marker */}
        <div
          className="absolute top-0 pointer-events-none"
          style={{
            left: hueMarkerX,
            width: 4, height: '100%',
            transform: 'translateX(-50%)',
            backgroundColor: '#fff',
            borderRadius: 1,
            boxShadow: '0 0 2px rgba(0,0,0,0.6)',
          }}
        />
      </div>

      {/* Preview + HEX Input */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded flex-shrink-0"
          style={{ backgroundColor: value, border: '1px solid var(--border)' }}
        />
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          placeholder="#000000"
          maxLength={7}
          className="flex-1 px-2 py-1 rounded text-xs font-mono focus:outline-none"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Preset colors */}
      <div className="grid grid-cols-6 gap-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-full aspect-square rounded transition-all hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'ring-1 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]'
                : ''
            }`}
            style={{ backgroundColor: color, border: '1px solid var(--border)' }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}
