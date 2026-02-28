'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReplayState } from '@/lib/replay';
import { getReplayEngine } from '@/lib/replay';
import { useReplayUIStore } from '@/stores/useReplayUIStore';
import { formatTime } from './utils';

interface ReplayStatsOverlayProps {
  state: ReplayState;
}

interface LiveMetrics {
  currentPrice: number;
  vwap: number;
  twap: number;
  sessionHigh: number;
  sessionLow: number;
  totalVolume: number;
  totalDelta: number;
  tradesPerMin: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
}

export default function ReplayStatsOverlay({ state }: ReplayStatsOverlayProps) {
  const { statsMinimized, toggleStatsMinimized } = useReplayUIStore();
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Poll engine for live metrics every 500ms
  useEffect(() => {
    if (state.status === 'idle') return;

    const update = () => {
      try {
        const engine = getReplayEngine();
        const price = engine.getCurrentPrice();
        const vwap = engine.getCurrentVWAP();
        const twap = engine.getCurrentTWAP();
        const vp = engine.getVolumeProfile();
        const candles = engine.getFootprintCandles();

        let sessionHigh = 0, sessionLow = Infinity, totalVolume = 0, totalDelta = 0;
        for (const c of candles) {
          if (c.high > sessionHigh) sessionHigh = c.high;
          if (c.low < sessionLow) sessionLow = c.low;
          totalVolume += c.totalVolume;
          totalDelta += c.totalDelta;
        }
        if (sessionLow === Infinity) sessionLow = 0;

        const elapsed = state.currentTime > 0 && state.startTime > 0
          ? (state.currentTime - state.startTime) / 1000 / 60
          : 0;
        const tradesPerMin = elapsed > 0.1 ? state.tradeFedCount / elapsed : 0;

        setMetrics({
          currentPrice: price,
          vwap,
          twap,
          sessionHigh,
          sessionLow,
          totalVolume,
          totalDelta,
          tradesPerMin,
          pocPrice: vp?.poc ?? 0,
          vahPrice: vp?.vah ?? 0,
          valPrice: vp?.val ?? 0,
        });
      } catch { /* engine not ready */ }
    };

    update();
    intervalRef.current = setInterval(update, 500);
    return () => clearInterval(intervalRef.current);
  }, [state.status, state.currentTime, state.startTime, state.tradeFedCount]);

  if (state.status === 'idle') return null;

  const elapsed = state.currentTime > 0 && state.startTime > 0
    ? state.currentTime - state.startTime
    : 0;
  const elapsedSec = Math.floor(elapsed / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const elapsedS = elapsedSec % 60;
  const elapsedStr = elapsedMin > 0
    ? `${elapsedMin}m ${elapsedS}s`
    : `${elapsedS}s`;

  if (statsMinimized) {
    return (
      <button
        onClick={toggleStatsMinimized}
        className="absolute top-3 right-3 z-20 glass rounded-lg px-2.5 py-1.5 text-[10px] font-mono transition-all hover:scale-105"
        style={{ border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}
      >
        {state.tradeFedCount}/{state.totalTrades}
        {metrics && metrics.currentPrice > 0 && (
          <span style={{ color: 'var(--primary)', marginLeft: 6 }}>
            {metrics.currentPrice.toFixed(2)}
          </span>
        )}
      </button>
    );
  }

  const m = metrics;
  const fmtVol = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v).toString();
  const fmtP = (v: number) => v > 0 ? v.toFixed(2) : '—';

  return (
    <div
      className="absolute top-3 right-3 z-20 glass rounded-xl p-3 animate-fadeIn cursor-pointer"
      style={{ border: '1px solid var(--glass-border)', minWidth: '185px' }}
      onClick={toggleStatsMinimized}
      title="Click to minimize"
    >
      <div className="space-y-1">
        {/* Price */}
        {m && m.currentPrice > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Price</span>
            <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--primary)' }}>
              {fmtP(m.currentPrice)}
            </span>
          </div>
        )}

        {/* Trades */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Trades</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
            {state.tradeFedCount.toLocaleString()} / {state.totalTrades.toLocaleString()}
          </span>
        </div>

        {/* Trades/min */}
        {m && m.tradesPerMin > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Trades/min</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              {Math.round(m.tradesPerMin)}
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />

        {/* High / Low */}
        {m && m.sessionHigh > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>H / L</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ color: '#22c55e' }}>{fmtP(m.sessionHigh)}</span>
              <span style={{ color: 'var(--text-dimmed)' }}> / </span>
              <span style={{ color: '#ef4444' }}>{fmtP(m.sessionLow)}</span>
            </span>
          </div>
        )}

        {/* Volume */}
        {m && m.totalVolume > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Volume</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
              {fmtVol(m.totalVolume)}
            </span>
          </div>
        )}

        {/* Delta */}
        {m && m.totalVolume > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Delta</span>
            <span className="text-[10px] font-mono font-bold" style={{
              color: m.totalDelta >= 0 ? '#22c55e' : '#ef4444'
            }}>
              {m.totalDelta >= 0 ? '+' : ''}{fmtVol(m.totalDelta)}
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />

        {/* VWAP */}
        {m && m.vwap > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold" style={{ color: '#e2b93b' }}>VWAP</span>
            <span className="text-[10px] font-mono" style={{ color: '#e2b93b' }}>
              {fmtP(m.vwap)}
            </span>
          </div>
        )}

        {/* TWAP */}
        {m && m.twap > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold" style={{ color: '#5eaeff' }}>TWAP</span>
            <span className="text-[10px] font-mono" style={{ color: '#5eaeff' }}>
              {fmtP(m.twap)}
            </span>
          </div>
        )}

        {/* POC */}
        {m && m.pocPrice > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold" style={{ color: '#ffc107' }}>POC</span>
            <span className="text-[10px] font-mono" style={{ color: '#ffc107' }}>
              {fmtP(m.pocPrice)}
            </span>
          </div>
        )}

        {/* VAH / VAL */}
        {m && m.vahPrice > 0 && m.valPrice > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: '#7c85f6' }}>VA</span>
            <span className="text-[10px] font-mono" style={{ color: '#7c85f6' }}>
              {fmtP(m.valPrice)} — {fmtP(m.vahPrice)}
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />

        {/* Elapsed */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Elapsed</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {elapsedStr}
          </span>
        </div>

        {/* Time */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Time</span>
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
            {formatTime(state.currentTime)}
          </span>
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Speed</span>
          <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--primary)' }}>
            {state.speed}x
          </span>
        </div>
      </div>
    </div>
  );
}
