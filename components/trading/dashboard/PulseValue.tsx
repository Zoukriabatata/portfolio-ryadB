'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface PulseValueProps {
  /** The numeric value to watch — comparisons drive the flash color. */
  value:    number;
  /** Pre-formatted display text (e.g. "+$1,234.50"). */
  display:  string;
  /** Color for positive values (defaults to current text color via inherit). */
  color?:   string;
  /** Extra styles applied to the value span. */
  style?:   CSSProperties;
  /** Inline className for sizing/positioning. */
  className?: string;
}

/**
 * Briefly flashes its background green when `value` increases, red when
 * it decreases. Useful to draw the eye to changing P&L numbers without
 * being overwhelming.
 *
 * Implementation notes:
 *   - The pulse fades over ~700ms via CSS transition (no animation lib)
 *   - We only flash on REAL changes — first render does nothing
 *   - Equal values are no-ops
 */
export default function PulseValue({ value, display, color, style, className }: PulseValueProps) {
  const prevRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;

    if (prev === null) return;          // Skip initial render
    if (prev === value) return;         // No change

    setFlash(value > prev ? 'up' : 'down');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlash(null), 700);
  }, [value]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const flashBg =
    flash === 'up'   ? 'rgba(16,185,129,0.22)' :
    flash === 'down' ? 'rgba(239,68,68,0.22)'  :
    'transparent';

  return (
    <span
      className={className}
      style={{
        ...style,
        color:           color ?? style?.color,
        background:      flashBg,
        transition:      'background 700ms ease-out',
        borderRadius:    '4px',
        padding:         '0 4px',
        margin:          '0 -4px',
        display:         'inline-block',
      }}
    >
      {display}
    </span>
  );
}
