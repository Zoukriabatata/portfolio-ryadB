/**
 * lib/live/getCMELiveAdapter.ts
 *
 * Returns the best available CME live adapter based on configured providers.
 * Priority: dxFeed (cheaper, no broker) → Tradovate (requires live account)
 *
 * Read from Zustand store via getState() so this works outside React components.
 */

import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { getDxFeedLiveAdapter } from './DxFeedLiveAdapter';
import { getTradovateLiveAdapter } from './TradovateLiveAdapter';
import type { Tick } from './HierarchicalAggregator';

/** Shared public interface for CME live adapters */
export interface CMEAdapter {
  connect(symbol?: string): Promise<void>;
  disconnect(): void;
  changeSymbol(symbol: string): void;
  onStatus(cb: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void): () => void;
  onTick(cb: (tick: Tick) => void): () => void;
  getTickCount(): number;
  getPrice(): number;
}

export function getCMELiveAdapter(): CMEAdapter {
  const configs = useDataFeedStore.getState().configs;

  // Prefer dxFeed if explicitly configured (paid, real-time)
  const dxfeed = configs['dxfeed'];
  if (dxfeed?.status === 'connected' || dxfeed?.status === 'configured') {
    return getDxFeedLiveAdapter();
  }

  // Use Tradovate if explicitly configured
  const tradovate = configs['tradovate'];
  if (tradovate?.status === 'connected' || tradovate?.status === 'configured') {
    return getTradovateLiveAdapter();
  }

  // Default: dxFeed demo mode — 15-min delayed, no credentials needed
  return getDxFeedLiveAdapter();
}

/** Returns a human-readable label for the active CME adapter */
export function getCMEAdapterLabel(): string {
  const configs = useDataFeedStore.getState().configs;
  const dxfeed = configs['dxfeed'];
  if (dxfeed?.status === 'connected' || dxfeed?.status === 'configured') {
    return 'CME · dxFeed';
  }
  const tradovate = configs['tradovate'];
  if (tradovate?.status === 'connected' || tradovate?.status === 'configured') {
    return 'CME · Tradovate';
  }
  return 'CME · démo (15min)';
}

/** True when no live CME feed is configured — data will be 15 minutes delayed. */
export function isCMEDelayedFeed(): boolean {
  const configs = useDataFeedStore.getState().configs;
  const dxfeed = configs['dxfeed'];
  const tradovate = configs['tradovate'];
  return (
    dxfeed?.status !== 'connected' && dxfeed?.status !== 'configured' &&
    tradovate?.status !== 'connected' && tradovate?.status !== 'configured'
  );
}
