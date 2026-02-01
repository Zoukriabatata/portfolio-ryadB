'use client';

import { useEffect, useRef, memo } from 'react';

interface ChartContainerProps {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  onMount?: (container: HTMLDivElement) => (() => void) | void;
}

/**
 * A container component that bypasses React's DOM reconciliation.
 * This prevents "removeChild" errors with libraries like Lightweight Charts
 * that manipulate the DOM directly.
 */
function ChartContainerInner({ id, className, style, onMount }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mountedRef.current) return;

    mountedRef.current = true;

    // Call onMount and store cleanup function
    if (onMount) {
      const cleanup = onMount(container);
      if (typeof cleanup === 'function') {
        cleanupRef.current = cleanup;
      }
    }

    return () => {
      // Run cleanup
      if (cleanupRef.current) {
        try {
          cleanupRef.current();
        } catch {
          // Ignore cleanup errors
        }
        cleanupRef.current = null;
      }

      // Force clear container outside React's control
      if (container) {
        requestAnimationFrame(() => {
          try {
            container.innerHTML = '';
          } catch {
            // Ignore
          }
        });
      }

      mountedRef.current = false;
    };
  }, [onMount]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      style={style}
      // Suppress hydration warning since we manage DOM manually
      suppressHydrationWarning
    />
  );
}

// Memo to prevent unnecessary re-renders
export const ChartContainer = memo(ChartContainerInner);
