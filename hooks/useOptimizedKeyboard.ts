/**
 * OPTIMIZED KEYBOARD SHORTCUTS HOOK
 *
 * Performance-optimized keyboard handler that:
 * - Uses Map for O(1) lookup instead of array iteration
 * - Debounces rapid key presses
 * - Prevents duplicate event listeners
 * - Properly cleans up on unmount
 */

import { useEffect, useRef, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean; // Cmd on Mac
  action: (event: KeyboardEvent) => void;
  description?: string;
  preventDefault?: boolean;
  stopPropagation?: boolean;
}

interface UseOptimizedKeyboardOptions {
  /** Enable shortcuts (default: true) */
  enabled?: boolean;
  /** Debounce delay in ms (default: 0) */
  debounce?: number;
  /** Log shortcuts for debugging (default: false) */
  debug?: boolean;
}

/**
 * Generates a unique key for a shortcut
 */
function generateShortcutKey(shortcut: Omit<KeyboardShortcut, 'action' | 'description'>): string {
  const parts: string[] = [];

  if (shortcut.ctrl) parts.push('ctrl');
  if (shortcut.shift) parts.push('shift');
  if (shortcut.alt) parts.push('alt');
  if (shortcut.meta) parts.push('meta');

  parts.push(shortcut.key.toLowerCase());

  return parts.join('+');
}

/**
 * Optimized keyboard shortcuts with Map-based O(1) lookup
 *
 * @example
 * ```tsx
 * function ChartComponent() {
 *   useOptimizedKeyboard([
 *     { key: '+', action: () => zoom(1.1), description: 'Zoom in' },
 *     { key: '-', action: () => zoom(0.9), description: 'Zoom out' },
 *     { key: 's', ctrl: true, action: save, preventDefault: true },
 *   ]);
 * }
 * ```
 */
export function useOptimizedKeyboard(
  shortcuts: KeyboardShortcut[],
  options: UseOptimizedKeyboardOptions = {}
) {
  const { enabled = true, debounce = 0, debug = false } = options;

  // Use Map for O(1) lookup instead of iterating array
  const shortcutsMapRef = useRef<Map<string, KeyboardShortcut>>(new Map());
  const lastTriggerRef = useRef<Map<string, number>>(new Map());
  const handlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  // Update shortcuts map when shortcuts change
  useEffect(() => {
    const map = new Map<string, KeyboardShortcut>();

    shortcuts.forEach((shortcut) => {
      const key = generateShortcutKey(shortcut);
      map.set(key, shortcut);

      if (debug) {
        console.log(`[Keyboard] Registered: ${key} - ${shortcut.description || 'No description'}`);
      }
    });

    shortcutsMapRef.current = map;
  }, [shortcuts, debug]);

  // Optimized keyboard handler with memoization
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Build current key combination
      const parts: string[] = [];

      if (event.ctrlKey) parts.push('ctrl');
      if (event.shiftKey) parts.push('shift');
      if (event.altKey) parts.push('alt');
      if (event.metaKey) parts.push('meta');

      parts.push(event.key.toLowerCase());

      const keyCombo = parts.join('+');

      // O(1) lookup in Map
      const shortcut = shortcutsMapRef.current.get(keyCombo);

      if (!shortcut) return;

      // Debounce check
      if (debounce > 0) {
        const now = Date.now();
        const lastTrigger = lastTriggerRef.current.get(keyCombo) || 0;

        if (now - lastTrigger < debounce) {
          if (debug) {
            console.log(`[Keyboard] Debounced: ${keyCombo}`);
          }
          return;
        }

        lastTriggerRef.current.set(keyCombo, now);
      }

      // Prevent default if specified
      if (shortcut.preventDefault !== false) {
        event.preventDefault();
      }

      // Stop propagation if specified
      if (shortcut.stopPropagation) {
        event.stopPropagation();
      }

      if (debug) {
        console.log(`[Keyboard] Triggered: ${keyCombo}`);
      }

      // Execute action
      try {
        shortcut.action(event);
      } catch (error) {
        console.error(`[Keyboard] Error executing ${keyCombo}:`, error);
      }
    },
    [enabled, debounce, debug]
  );

  // Attach/detach event listener
  useEffect(() => {
    if (!enabled) return;

    // Store handler ref for cleanup
    handlerRef.current = handleKeyDown;

    // Attach listener
    window.addEventListener('keydown', handleKeyDown);

    if (debug) {
      console.log(`[Keyboard] Attached ${shortcutsMapRef.current.size} shortcuts`);
    }

    // Cleanup
    return () => {
      if (handlerRef.current) {
        window.removeEventListener('keydown', handlerRef.current);
        handlerRef.current = null;
      }

      if (debug) {
        console.log('[Keyboard] Detached shortcuts');
      }
    };
  }, [enabled, handleKeyDown, debug]);

  return {
    shortcuts: Array.from(shortcutsMapRef.current.values()),
    count: shortcutsMapRef.current.size,
  };
}

/**
 * Hook for global keyboard shortcuts that persist across all components
 */
export function useGlobalKeyboard(shortcuts: KeyboardShortcut[], options?: UseOptimizedKeyboardOptions) {
  return useOptimizedKeyboard(shortcuts, { ...options, enabled: true });
}

/**
 * Hook for conditional keyboard shortcuts (e.g., only when modal is open)
 */
export function useConditionalKeyboard(
  shortcuts: KeyboardShortcut[],
  condition: boolean,
  options?: UseOptimizedKeyboardOptions
) {
  return useOptimizedKeyboard(shortcuts, { ...options, enabled: condition });
}

/**
 * Formats shortcuts for help display
 */
export function formatShortcuts(shortcuts: KeyboardShortcut[]): Array<{ combo: string; description: string }> {
  return shortcuts
    .filter((s) => s.description)
    .map((s) => ({
      combo: generateShortcutKey(s)
        .split('+')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' + '),
      description: s.description!,
    }));
}
