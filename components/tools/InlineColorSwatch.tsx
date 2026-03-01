'use client';

/**
 * INLINE COLOR SWATCH — Clickable color preview with portal-based ColorPicker.
 *
 * Uses createPortal + position:fixed so the picker is NEVER clipped
 * by overflow:hidden parents. Smart viewport repositioning keeps it on-screen.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface InlineColorSwatchProps {
  value: string;
  onChange: (color: string) => void;
  /** Swatch size multiplier (width/height = size * 4). Default: 6 */
  size?: number;
  /** Use mini HSV picker (compact SV canvas + hue bar + hex). Default: false */
  mini?: boolean;
  /** Enable alpha slider in the popover picker */
  showAlpha?: boolean;
  alpha?: number;
  onAlphaChange?: (alpha: number) => void;
  /** Custom swatch className */
  className?: string;
  /** Custom swatch content (replaces default color block) */
  children?: React.ReactNode;
}

export function InlineColorSwatch({
  value,
  onChange,
  size = 6,
  mini = false,
  showAlpha,
  alpha,
  onAlphaChange,
  className,
  children,
}: InlineColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Compute position when opening
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const pickerW = mini ? 220 : 260;
    const pickerH = mini ? 160 : 380;
    const gap = 8;

    // Default: below the button, right-aligned
    let top = rect.bottom + gap;
    let left = rect.right - pickerW;

    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + pickerW > window.innerWidth - 8) left = window.innerWidth - pickerW - 8;
    if (top + pickerH > window.innerHeight - 8) {
      // Flip above
      top = rect.top - pickerH - gap;
    }
    if (top < 8) top = 8;

    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    // Close on outside click
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    // Close on scroll (parent may have moved)
    const handleScroll = () => updatePosition();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={className || 'rounded cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all'}
        style={!children ? {
          width: size * 4,
          height: size * 4,
          backgroundColor: value,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
          transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
        } : undefined}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            padding: 12,
            borderRadius: 12,
            backgroundColor: 'rgba(15, 15, 20, 0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
            backdropFilter: 'blur(20px)',
            minWidth: 240,
            animation: 'fadeInScale 120ms ease-out',
          }}
        >
          <ColorPicker
            value={value}
            onChange={onChange}
            label=""
            mini={mini}
            showAlpha={showAlpha}
            alpha={alpha}
            onAlphaChange={onAlphaChange}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
