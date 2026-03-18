'use client';

/**
 * useLiveAgent
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that connects to /api/ai/agent/stream (SSE) and maintains the
 * latest agent signal in state.
 *
 * Priority:
 *   1. Python FastAPI agent (localhost:8765) — proxied through Next.js
 *   2. Built-in JS simulation — automatic fallback if Python is unreachable
 *
 * Features:
 *   - Auto-reconnect on disconnect (exponential backoff, max 30s)
 *   - Keeps last valid signal across reconnects
 *   - Tracks connection status: connecting / live / reconnecting / offline
 *   - history[] keeps last N signals for mini spark display
 *   - source: 'python' | 'js_fallback' | null — which backend is active
 *
 * Usage:
 *   const { signal, status, source, history } = useLiveAgent()
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedEntry {
  time:     string;
  event:    string;
  message:  string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  mode:     'SIGNAL' | 'UPDATE';
}

export interface AgentSignal {
  timestamp:          string;
  bias:               'LONG' | 'SHORT' | 'NEUTRAL';
  confidence:         number;
  gamma_regime:       'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEAR_FLIP';
  volatility_regime:  'EXPANSION' | 'COMPRESSION';
  flow_state:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  context_state:      'CALM' | 'EVENT_RISK' | 'BREAKOUT_ZONE';
  key_levels: {
    support:    number[];
    resistance: number[];
    gamma_flip: number;
  };
  change_detected: boolean;
  reason:          string;
  events:          { type: string; severity: string; description?: string }[];
  tick:            number;
  mode?:           'SIGNAL' | 'UPDATE';
  source?:         'python_agent' | 'js_fallback';
  // Numeric changes vs previous signal
  delta?: {
    flow_change:      string;
    skew_change:      string;
    price_vs_flip:    string;
    confidence_delta: number;
    ofi_raw:          number;
    rr25_raw:         number;
  };
  // Full rolling event log (Python agent only; length up to 50)
  live_feed?: FeedEntry[];
  // Advanced market dynamics
  gamma_squeeze?:          boolean;
  squeeze_strength?:       number;
  dealer_state?:           string;
  confluence_score?:       number;
  confluence_components?:  { gex: number; flow: number; skew: number; levels: number };
  regime?:                 string;
  setup?:                  { entry: string; target: string; invalidation: string };
  // Adaptive dynamics fields
  adaptive_threshold?:     number;
  dynamic_weights?:        { gex: number; flow: number; skew: number; levels: number };
  signal_confidence?:      number;   // adaptive engine confidence [0, 1]
  persistence_score?:      number;   // flow directional persistence [0, 1]
  signal_quality?:         number;   // agreement × structure quality [0, 1]
}

export type AgentStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type AgentSource = 'python_agent' | 'js_fallback' | null;

export interface UseLiveAgentReturn {
  signal:     AgentSignal | null;
  status:     AgentStatus;
  source:     AgentSource;
  history:    AgentSignal[];
  feedLog:    FeedEntry[];    // rolling event timeline (newest first)
  lastUpdate: Date | null;
  disconnect: () => void;
  reconnect:  () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLiveAgent(options?: {
  interval?:     number;   // ms between ticks (default 3000)
  historyLen?:   number;   // how many signals to keep (default 20)
  autoConnect?:  boolean;  // start on mount (default true)
  enabled?:      boolean;  // can disable (default true)
}): UseLiveAgentReturn {
  const {
    interval    = 3000,
    historyLen  = 20,
    autoConnect = true,
    enabled     = true,
  } = options ?? {};

  const [signal,     setSignal]     = useState<AgentSignal | null>(null);
  const [status,     setStatus]     = useState<AgentStatus>('connecting');
  const [source,     setSource]     = useState<AgentSource>(null);
  const [history,    setHistory]    = useState<AgentSignal[]>([]);
  const [feedLog,    setFeedLog]    = useState<FeedEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const esRef      = useRef<EventSource | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const mountedRef = useRef(true);

  const clearRetry = () => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
  };

  const connect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    clearRetry();

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setStatus(retryCount.current > 0 ? 'reconnecting' : 'connecting');

    // New proxy endpoint — tries Python first, falls back to JS sim
    const url = `/api/ai/agent/stream?interval=${interval}`;
    const es  = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      retryCount.current = 0;
      setStatus('live');
    };

    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(e.data);

        // System messages (not trading signals)
        if (data.type === 'heartbeat') return;
        if (data.type === 'connected') {
          // Backend announces which source it's using
          if (data.source) {
            setSource(data.source as AgentSource);
            // Seed feed with a connection event so the UI never shows empty
            const isPython = data.source === 'python_agent';
            setFeedLog([{
              time:     new Date().toISOString(),
              event:    'AGENT_CONNECTED',
              message:  isPython
                ? 'Python engine · Connexion établie'
                : 'JS Simulation engine · En attente du premier tick…',
              severity: 'LOW',
              mode:     'UPDATE',
            }]);
          }
          return;
        }

        const sig = data as AgentSignal;

        // Track which backend served this signal
        if (sig.source) setSource(sig.source as AgentSource);

        setSignal(sig);
        setLastUpdate(new Date());
        setHistory(prev => [...prev, sig].slice(-historyLen));

        // ── Feed log ──────────────────────────────────────────────────────
        if (sig.live_feed && sig.live_feed.length > 0) {
          // Python mode: agent sends the authoritative rolling feed
          setFeedLog(sig.live_feed as FeedEntry[]);
        } else if (sig.events && sig.events.length > 0) {
          // JS fallback: accumulate events ourselves
          const newEntries: FeedEntry[] = sig.events.map(e => ({
            time:     sig.timestamp,
            event:    e.type,
            message:  e.description ?? e.type.replace(/_/g, ' '),
            severity: (e.severity as FeedEntry['severity']) ?? 'MEDIUM',
            mode:     sig.mode ?? 'UPDATE',
          }));
          setFeedLog(prev => [...newEntries, ...prev].slice(0, 100));
        }
      } catch { /* skip malformed */ }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;

      // Exponential backoff: 2s → 4s → 8s → 16s → max 30s
      const backoff = Math.min(2000 * Math.pow(2, retryCount.current), 30_000);
      retryCount.current++;

      if (retryCount.current <= 10) {
        setStatus('reconnecting');
        retryRef.current = setTimeout(connect, backoff);
      } else {
        setStatus('offline');
      }
    };
  }, [interval, historyLen, enabled]);

  const disconnect = useCallback(() => {
    clearRetry();
    esRef.current?.close();
    esRef.current = null;
    setStatus('offline');
  }, []);

  const reconnect = useCallback(() => {
    retryCount.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoConnect && enabled) connect();

    return () => {
      mountedRef.current = false;
      clearRetry();
      esRef.current?.close();
    };
  }, [connect, autoConnect, enabled]);

  return { signal, status, source, history, feedLog, lastUpdate, disconnect, reconnect };
}
