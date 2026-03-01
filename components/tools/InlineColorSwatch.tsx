'use client';

/**
 * INLINE COLOR SWATCH — Clickable color preview with popover ColorPicker.
 *
 * Shared component replacing 6 identical duplications across the codebase.
 * Used in settings panels, modals, and tool bars for inline color editing.
 */

import { useState, useEffect, useRef } from 'react';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface InlineColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
  /** Swatch size multiplier (width/height = size * 4). Default: 6 */
  size?: number;
  /** Enable alpha slider in the popover picker */
  showAlpha?: boolean;
  alpha?: number;
  onAlphaChange?: (alpha: number) => void;
}

export function InlineColorSwatch({
  value,
  onChange,
  size = 6,
  showAlpha,
  alpha,
  onAlphaChange,
}: InlineColorSwatchProps) {
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
          transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
        }}
      />
      {open && (
        <div
          className="absolute z-50 mt-1 right-0 p-3 rounded-xl shadow-2xl"
          style={{
            backgroundColor: 'rgba(20, 20, 28, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(12px)',
            minWidth: 220,
          }}
        >
          <ColorPicker
            value={value}
            onChange={onChange}
            label=""
            showAlpha={showAlpha}
            alpha={alpha}
            onAlphaChange={onAlphaChange}
          />
        </div>
      )}
    </div>
  );
}
