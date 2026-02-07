/**
 * USE IB CONNECTION HOOK
 *
 * React hook for connecting to the IB Gateway Bridge.
 * Manages lifecycle, provides status, and auto-subscribes to data.
 *
 * Usage:
 *   const { status, connect, changeSymbol, stats } = useIBConnection();
 *
 *   // In your component:
 *   useEffect(() => { connect('ES'); }, []);
 *
 *   // In render loop (via useWebGLHeatmap or similar):
 *   const renderData = getIBConnectionManager().getHeatmapRenderData(w, h);
 */

'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getIBConnectionManager, type IBConnectionManager } from '@/lib/ib/ConnectionManager';
import type { GatewayConnectionStatus } from '@/types/ib-protocol';

const GATEWAY_URL = process.env.NEXT_PUBLIC_IB_GATEWAY_URL || 'ws://localhost:4000';

export interface UseIBConnectionReturn {
  status: GatewayConnectionStatus;
  connect: (symbol?: string) => void;
  disconnect: () => void;
  changeSymbol: (symbol: string) => void;
  isConnected: boolean;
  currentPrice: number;
  stats: {
    tradeCount: number;
    heatmapSnapshots: number;
    footprintCandles: number;
  };
}

async function fetchGatewayToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/ib/token');
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    console.error('[useIBConnection] Failed to fetch gateway token');
    return null;
  }
}

export function useIBConnection(initialSymbol?: string): UseIBConnectionReturn {
  const { data: session } = useSession();
  const [status, setStatus] = useState<GatewayConnectionStatus>('disconnected');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [stats, setStats] = useState({ tradeCount: 0, heatmapSnapshots: 0, footprintCandles: 0 });
  const managerRef = useRef<IBConnectionManager | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectingRef = useRef(false);

  // Get the singleton manager
  useEffect(() => {
    managerRef.current = getIBConnectionManager();

    const cleanup = managerRef.current.onStatus((s) => {
      setStatus(s);
    });

    // Update stats every second
    statsIntervalRef.current = setInterval(() => {
      if (managerRef.current) {
        const s = managerRef.current.getStats();
        setCurrentPrice(s.currentPrice);
        setStats({
          tradeCount: s.tradeCount,
          heatmapSnapshots: s.heatmapSnapshots,
          footprintCandles: s.footprintCandles,
        });
      }
    }, 1000);

    return () => {
      cleanup();
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  const connect = useCallback(async (symbol?: string) => {
    if (!session?.user?.id) {
      console.warn('[useIBConnection] No session available');
      return;
    }

    if (connectingRef.current) return;
    connectingRef.current = true;

    try {
      // Fetch a signed JWT from the API
      const token = await fetchGatewayToken();
      if (!token) {
        console.error('[useIBConnection] Could not obtain gateway token');
        return;
      }

      const mgr = getIBConnectionManager();
      const sym = symbol || initialSymbol || 'ES';
      mgr.connect(GATEWAY_URL, token, sym);
    } finally {
      connectingRef.current = false;
    }
  }, [session, initialSymbol]);

  const disconnect = useCallback(() => {
    getIBConnectionManager().disconnect();
  }, []);

  const changeSymbol = useCallback((symbol: string) => {
    getIBConnectionManager().changeSymbol(symbol);
  }, []);

  // Auto-connect when session is available and initialSymbol provided
  useEffect(() => {
    if (initialSymbol && session?.user?.id) {
      connect(initialSymbol);
    }

    return () => {
      // Don't disconnect on unmount - let the singleton persist
      // across page navigations within the same session
    };
  }, [initialSymbol, session?.user?.id, connect]);

  return {
    status,
    connect,
    disconnect,
    changeSymbol,
    isConnected: status === 'connected',
    currentPrice,
    stats,
  };
}
