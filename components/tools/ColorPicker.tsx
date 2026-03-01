'use client';

/**
 * UNIFIED COLOR PICKER — Single component used across entire app.
 *
 * Modes:
 *  compact=true  → Swatch grid only (for inline bars)
 *  compact=false → Full HSV picker + alpha + HEX/RGBA inputs + presets + recent colors
 *
 * Features:
 *  - Saturation/Value 2D canvas
 *  - Hue horizontal slider
 *  - Alpha/Opacity horizontal slider
 *  - HEX input with validation
 *  - RGB channel inputs + Alpha %
 *  - Preset color swatches
 *  - Recent colors (localStorage)
 *  - Copy to clipboard
 *  - Live preview swatch
 *  - onChangeEnd for commit (undo snapshot)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { hsvToHex, hexToHSV, hexToRGB, rgbToHex, getRecentColors, addRecentColor } from '@/lib/utils/colorUtils';
import { Copy, Check } from 'lucide-react';

import { PICKER_PRESETS, TOOL_PRESETS_COMPACT } from '@/lib/utils/colorPresets';

const PRESET_COLORS = PICKER_PRESETS;
const COMPACT_COLORS = TOOL_PRESETS_COMPACT;

// ============ COMPONENT ============

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Called when a drag ends (pointer up) — use for undo snapshots */
  onChangeEnd?: (color: string) => void;
  label?: string;
  className?: string;
  compact?: boolean;
  /** Mini mode: small SV canvas (80px) + hue bar + hex input. No presets/RGB/recent. */
  mini?: boolean;
  showRGB?: boolean;
  showRecent?: boolean;
  /** Enable alpha/opacity slider (0-1). Default: false */
  showAlpha?: boolean;
  /** Current alpha value 0-1. Only used when showAlpha=true */
  alpha?: number;
  /** Called when alpha changes. Only used when showAlpha=true */
  onAlphaChange?: (alpha: number) => void;
}

export function ColorPicker({
  value,
  onChange,
  onChangeEnd,
  label = 'Color',
  className = '',
  compact = false,
  mini = false,
  showRGB = true,
  showRecent = true,
  showAlpha = false,
  alpha: externalAlpha,
  onAlphaChange,
}: ColorPickerProps) {
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [bright, setBright] = useState(100);
  const [localAlpha, setLocalAlpha] = useState(externalAlpha ?? 1);
  const [hexInput, setHexInput] = useState(value);
  const [copied, setCopied] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);
  const alphaCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSvDragging = useRef(false);
  const isHueDragging = useRef(false);
  const isAlphaDragging = useRef(false);
  const internalUpdate = useRef(false);

  // Resolve alpha — prefer external, fall back to local
  const currentAlpha = externalAlpha ?? localAlpha;

  // Load recent colors
  useEffect(() => {
    if (showRecent && !compact) {
      setRecentColors(getRecentColors());
    }
  }, [showRecent, compact]);

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

  // Sync external alpha
  useEffect(() => {
    if (externalAlpha !== undefined) {
      setLocalAlpha(externalAlpha);
    }
  }, [externalAlpha]);

  // Draw SV gradient when hue changes
  useEffect(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    const hueColor = hsvToHex(hue, 100, 100);
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(0, 0, w, h);

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

  // Draw alpha bar when color changes
  useEffect(() => {
    if (!showAlpha) return;
    const canvas = alphaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Checkerboard background (transparency indicator)
    const checkSize = 5;
    for (let x = 0; x < w; x += checkSize) {
      for (let y = 0; y < h; y += checkSize) {
        ctx.fillStyle = ((x + y) / checkSize) % 2 === 0 ? '#cccccc' : '#999999';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    // Alpha gradient overlay
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    const rgb = hexToRGB(value);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, [value, showAlpha]);

  const emitColor = useCallback((h: number, s: number, v: number) => {
    internalUpdate.current = true;
    const hex = hsvToHex(h, s, v);
    setHexInput(hex);
    onChange(hex);
    // Save to recent
    if (showRecent) {
      addRecentColor(hex);
      setRecentColors(getRecentColors());
    }
  }, [onChange, showRecent]);

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

  // Alpha drag
  const handleAlphaPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, start = false) => {
    if (start) {
      isAlphaDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!isAlphaDragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newAlpha = Math.round(x * 100) / 100;
    setLocalAlpha(newAlpha);
    onAlphaChange?.(newAlpha);
  }, [onAlphaChange]);

  const handlePointerUp = useCallback(() => {
    const wasDragging = isSvDragging.current || isHueDragging.current || isAlphaDragging.current;
    isSvDragging.current = false;
    isHueDragging.current = false;
    isAlphaDragging.current = false;
    if (wasDragging) {
      onChangeEnd?.(hsvToHex(hue, sat, bright));
    }
  }, [hue, sat, bright, onChangeEnd]);

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

  const handleCopyHex = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);

  const handleRGBChange = useCallback((channel: 'r' | 'g' | 'b', val: number) => {
    const rgb = hexToRGB(value);
    rgb[channel] = Math.max(0, Math.min(255, val));
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const { h, s, v } = hexToHSV(hex);
    setHue(h);
    setSat(s);
    setBright(v);
    setHexInput(hex);
    internalUpdate.current = true;
    onChange(hex);
  }, [value, onChange]);

  const handleAlphaInput = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    const a = clamped / 100;
    setLocalAlpha(a);
    onAlphaChange?.(a);
  }, [onAlphaChange]);

  const colors = compact ? COMPACT_COLORS : PRESET_COLORS;

  // SV marker position
  const svMarkerX = `${(sat / 100) * 100}%`;
  const svMarkerY = `${(1 - bright / 100) * 100}%`;
  // Hue marker position
  const hueMarkerX = `${(hue / 360) * 100}%`;
  // Alpha marker position
  const alphaMarkerX = `${currentAlpha * 100}%`;

  // ═══ COMPACT MODE ═══
  if (compact) {
    return (
      <div className={className}>
        <label className="block text-[10px] text-[var(--text-muted)] mb-1">{label}</label>
        <div className="flex items-center gap-1.5">
          <div
            className="w-6 h-6 rounded flex-shrink-0"
            style={{ backgroundColor: value, border: '1px solid var(--border)', transition: 'background-color 0.15s ease' }}
          />
          <div className="flex-1 grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => onChange(color)}
                className={`w-full aspect-square rounded hover:scale-110 ${
                  value.toLowerCase() === color.toLowerCase()
                    ? 'ring-1 ring-[var(--primary)]'
                    : ''
                }`}
                style={{ backgroundColor: color, border: '1px solid var(--border)', transition: 'transform 0.1s ease' }}
                title={color}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ═══ MINI MODE — compact HSV: small SV + hue bar + hex ═══
  if (mini) {
    return (
      <div className={className}>
        {label && <label className="block text-[10px] text-[var(--text-muted)] mb-1">{label}</label>}

        <div className="flex gap-2 items-start">
          {/* SV square — small */}
          <div className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 80, height: 80, border: '1px solid var(--border)' }}>
            <canvas
              ref={svCanvasRef}
              width={80}
              height={80}
              className="w-full h-full cursor-crosshair"
              onPointerDown={(e) => handleSVPointer(e, true)}
              onPointerMove={handleSVPointer}
              onPointerUp={handlePointerUp}
            />
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

          {/* Right column: hue + hex + preview */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Hue bar */}
            <div className="relative rounded overflow-hidden" style={{ height: 12, border: '1px solid var(--border)' }}>
              <canvas
                ref={hueCanvasRef}
                width={200}
                height={12}
                className="w-full h-full cursor-ew-resize"
                onPointerDown={(e) => handleHuePointer(e, true)}
                onPointerMove={handleHuePointer}
                onPointerUp={handlePointerUp}
              />
              <div
                className="absolute top-0 pointer-events-none"
                style={{
                  left: hueMarkerX,
                  width: 3, height: '100%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#fff',
                  borderRadius: 1,
                  boxShadow: '0 0 2px rgba(0,0,0,0.6)',
                }}
              />
            </div>

            {/* Preview + HEX */}
            <div className="flex items-center gap-1">
              <div
                className="w-5 h-5 rounded flex-shrink-0"
                style={{ backgroundColor: value, border: '1px solid var(--border)' }}
              />
              <input
                type="text"
                value={hexInput}
                onChange={handleHexChange}
                maxLength={7}
                className="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[10px] font-mono focus:outline-none"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══ FULL MODE ═══
  const rgb = hexToRGB(value);

  return (
    <div className={className}>
      {label && <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">{label}</label>}

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
        <div
          className="absolute pointer-events-none"
          style={{
            left: svMarkerX, top: svMarkerY,
            width: 12, height: 12,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 3px rgba(0,0,0,0.8)',
          }}
        />
      </div>

      {/* Hue Bar */}
      <div className="relative mb-1.5 rounded overflow-hidden" style={{ height: 14, border: '1px solid var(--border)' }}>
        <canvas
          ref={hueCanvasRef}
          width={200}
          height={14}
          className="w-full h-full cursor-ew-resize"
          onPointerDown={(e) => handleHuePointer(e, true)}
          onPointerMove={handleHuePointer}
          onPointerUp={handlePointerUp}
        />
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

      {/* Alpha Bar */}
      {showAlpha && (
        <div className="relative mb-1.5 rounded overflow-hidden" style={{ height: 14, border: '1px solid var(--border)' }}>
          <canvas
            ref={alphaCanvasRef}
            width={200}
            height={14}
            className="w-full h-full cursor-ew-resize"
            onPointerDown={(e) => handleAlphaPointer(e, true)}
            onPointerMove={handleAlphaPointer}
            onPointerUp={handlePointerUp}
          />
          <div
            className="absolute top-0 pointer-events-none"
            style={{
              left: alphaMarkerX,
              width: 4, height: '100%',
              transform: 'translateX(-50%)',
              backgroundColor: '#fff',
              borderRadius: 1,
              boxShadow: '0 0 2px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      )}

      {/* HEX + Preview + Copy */}
      <div className="flex items-center gap-1.5 mb-2">
        <div
          className="w-7 h-7 rounded flex-shrink-0"
          style={{
            backgroundColor: showAlpha
              ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${currentAlpha})`
              : value,
            border: '1px solid var(--border)',
            transition: 'background-color 0.15s ease',
          }}
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
        <button
          onClick={handleCopyHex}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--surface)] transition-colors"
          style={{ color: copied ? '#22c55e' : 'var(--text-muted)' }}
          title="Copy HEX"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>

      {/* RGB + Alpha Inputs */}
      {showRGB && (
        <div className="flex items-center gap-1 mb-2">
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch} className="flex-1">
              <label className="block text-[9px] text-[var(--text-muted)] text-center uppercase mb-0.5">{ch}</label>
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[ch]}
                onChange={(e) => handleRGBChange(ch, parseInt(e.target.value) || 0)}
                className="w-full px-1.5 py-0.5 rounded text-[10px] font-mono text-center focus:outline-none"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          ))}
          {showAlpha && (
            <div className="flex-1">
              <label className="block text-[9px] text-[var(--text-muted)] text-center uppercase mb-0.5">A</label>
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(currentAlpha * 100)}
                onChange={(e) => handleAlphaInput(parseInt(e.target.value) || 0)}
                className="w-full px-1.5 py-0.5 rounded text-[10px] font-mono text-center focus:outline-none"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Preset colors */}
      <div className="grid grid-cols-6 gap-1 mb-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => { onChange(color); if (showRecent) { addRecentColor(color); setRecentColors(getRecentColors()); } }}
            className={`w-full aspect-square rounded hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'ring-1 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]'
                : ''
            }`}
            style={{ backgroundColor: color, border: '1px solid var(--border)', transition: 'transform 0.1s ease' }}
            title={color}
          />
        ))}
      </div>

      {/* Recent colors */}
      {showRecent && recentColors.length > 0 && (
        <div className="mt-1">
          <div className="text-[9px] text-[var(--text-muted)] mb-0.5">Recent</div>
          <div className="flex items-center gap-1">
            {recentColors.map((color, i) => (
              <button
                key={`${color}-${i}`}
                onClick={() => onChange(color)}
                className={`w-5 h-5 rounded-sm hover:scale-110 ${
                  value.toLowerCase() === color.toLowerCase() ? 'ring-1 ring-[var(--primary)]' : ''
                }`}
                style={{ backgroundColor: color, border: '1px solid var(--border)', transition: 'transform 0.1s ease' }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
