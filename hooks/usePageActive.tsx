'use client';

import { createContext, useContext } from 'react';

/**
 * Context that indicates whether a keep-alive page is currently visible.
 * Defaults to `true` so components outside keep-alive containers work normally.
 */
const PageActiveContext = createContext(true);

export const PageActiveProvider = PageActiveContext.Provider;

/**
 * Returns `true` if the current keep-alive page is the active (visible) one.
 * Use this to pause polling, timers, and WebSocket subscriptions when hidden.
 */
export function usePageActive(): boolean {
  return useContext(PageActiveContext);
}
