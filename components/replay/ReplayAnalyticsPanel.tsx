'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { ReplayState } from '@/lib/replay/ReplayEngine';
import { getReplayEngine } from '@/lib/replay';
import type { VolumeProfileData } from '@/lib/replay/indicators/ReplayVolumeProfile';
import { formatDuration, formatTime, getSpeedLabel } from './utils';

interface ReplayAnalyticsPanelProps {
  state: ReplayState;
}

type AnalyticsTab = 'session' | 'flow' | 'trades';

export default function ReplayAnalyticsPanel({ state }: ReplayAnalyticsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<AnalyticsTab>('session');
  const [vpData, setVpData] = useState<VolumeProfileData | null>(null);
  const vpInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll volume profile data every 2s
  useEffect(() => {
    if (collapsed) return;
    const update = () => {
      try {
        const engine = getReplayEngine();
        setVpData(engine.getVolumeProfile());
      } catch { /* ignore */ }
    };
    update();
    vpInterval.current = setInterval(update, 2000);
    return () => { if (vpInterval.current) clearInterval(vpInterval.current); };
  }, [collapsed]);

  // Session stats
  const stats = useMemo(() => {
    const elapsed = state.currentTime - state.startTime;
    const totalDuration = state.endTime - state.startTime;
    const tradesPerMin = elapsed > 60000 ? (state.tradeFedCount / (elapsed / 60000)) : 0;
    const progress = (state.progress || 0) * 100;
    const depthPerMin = elapsed > 60000 ? (state.depthIndex / (elapsed / 60000)) : 0;
    const remainingTrades = state.totalTrades - state.tradeFedCount;
    const estimatedRemainingMs = tradesPerMin > 0 ? (remainingTrades / tradesPerMin) * 60000 / state.speed : 0;

    return {
      elapsed,
      totalDuration,
      tradesFed: state.tradeFedCount,
      totalTrades: state.totalTrades,
      tradesPerMin: tradesPerMin.toFixed(1),
      depthPerMin: depthPerMin.toFixed(1),
      progress: progress.toFixed(1),
      depthSnapshots: state.totalDepthSnapshots,
      depthIndex: state.depthIndex,
      speed: state.speed,
      remainingTrades,
      estimatedRemainingMs,
    };
  }, [state]);

  // Volume flow stats
  const flowStats = useMemo(() => {
    if (!vpData || vpData.levels.length === 0) return null;

    const buyPct = vpData.totalVolume > 0 ? (vpData.totalBuyVolume / vpData.totalVolume * 100) : 50;
    const totalDelta = vpData.totalBuyVolume - vpData.totalSellVolume;
    const deltaRatio = vpData.totalSellVolume > 0 ? vpData.totalBuyVolume / vpData.totalSellVolume : 0;

    // Top 5 levels by volume
    const topLevels = [...vpData.levels]
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 5);

    // Value area width
    const vaWidth = vpData.vah - vpData.val;

    return {
      poc: vpData.poc,
      vah: vpData.vah,
      val: vpData.val,
      vaWidth,
      totalVolume: vpData.totalVolume,
      totalBuy: vpData.totalBuyVolume,
      totalSell: vpData.totalSellVolume,
      buyPct,
      totalDelta,
      deltaRatio: deltaRatio.toFixed(2),
      priceRange: vpData.highPrice - vpData.lowPrice,
      highPrice: vpData.highPrice,
      lowPrice: vpData.lowPrice,
      topLevels,
      levelCount: vpData.levels.length,
    };
  }, [vpData]);

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        className="absolute bottom-20 right-3 z-20 px-2 py-1 rounded-lg text-[10px] font-medium transition-all hover:brightness-110"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        Analytics ▸
      </button>
    );
  }

  return (
    <div className="absolute bottom-20 right-3 z-20 w-64 rounded-xl overflow-hidden animate-slideInRight"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)', maxHeight: 'calc(100vh - 160px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Analytics
        </span>
        <button onClick={() => setCollapsed(true)}
          className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          ◂
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
        {(['session', 'flow', 'trades'] as AnalyticsTab[]).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1 text-[9px] font-medium capitalize transition-all"
            style={{
              background: tab === t ? 'rgba(16,185,129,0.08)' : 'transparent',
              color: tab === t ? 'var(--primary)' : 'var(--text-dimmed)',
              borderBottom: tab === t ? '1.5px solid var(--primary)' : '1.5px solid transparent',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2 text-[10px] overflow-y-auto" style={{ maxHeight: 400 }}>

        {/* ═══ SESSION TAB ═══ */}
        {tab === 'session' && (
          <>
            {/* Progress */}
            <div>
              <div className="flex justify-between mb-1">
                <span style={{ color: 'var(--text-muted)' }}>Progress</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{stats.progress}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${stats.progress}%`,
                  background: 'var(--primary)',
                }} />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <StatRow label="Symbol" value={state.symbol} highlight />
              <StatRow label="Speed" value={getSpeedLabel(stats.speed)} highlight />
              <StatRow label="Trades Fed" value={`${stats.tradesFed.toLocaleString()} / ${stats.totalTrades.toLocaleString()}`} />
              <StatRow label="Remaining" value={stats.remainingTrades.toLocaleString()} />
              <StatRow label="Trades/min" value={stats.tradesPerMin} />
              <StatRow label="Depth/min" value={stats.depthPerMin} />
              <StatRow label="Elapsed" value={formatDuration(stats.elapsed)} />
              <StatRow label="Total Duration" value={formatDuration(stats.totalDuration)} />
              <StatRow label="Depth Snaps" value={`${stats.depthIndex} / ${stats.depthSnapshots.toLocaleString()}`} />
              <StatRow label="ETA" value={stats.estimatedRemainingMs > 0 ? formatDuration(stats.estimatedRemainingMs) : '—'} />
            </div>

            {/* Time range */}
            <div className="pt-1.5 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: 'var(--text-muted)' }}>Start</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{formatTime(state.startTime)}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ color: 'var(--text-muted)' }}>Current</span>
                <span className="font-mono" style={{ color: 'var(--primary)' }}>{formatTime(state.currentTime)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>End</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{formatTime(state.endTime)}</span>
              </div>
            </div>
          </>
        )}

        {/* ═══ FLOW TAB ═══ */}
        {tab === 'flow' && (
          <>
            {flowStats ? (
              <>
                {/* Buy/Sell ratio bar */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span style={{ color: 'rgba(16,185,129,0.8)' }}>Buy {flowStats.buyPct.toFixed(1)}%</span>
                    <span style={{ color: 'rgba(239,68,68,0.8)' }}>Sell {(100 - flowStats.buyPct).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-l-full transition-all" style={{
                      width: `${flowStats.buyPct}%`,
                      background: 'rgba(16,185,129,0.6)',
                    }} />
                    <div className="h-full rounded-r-full transition-all" style={{
                      width: `${100 - flowStats.buyPct}%`,
                      background: 'rgba(239,68,68,0.6)',
                    }} />
                  </div>
                </div>

                {/* Delta */}
                <div className="flex justify-between items-center py-1 px-2 rounded-lg"
                  style={{ background: flowStats.totalDelta >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Net Delta</span>
                  <span className="font-mono font-bold" style={{
                    color: flowStats.totalDelta >= 0 ? 'rgb(16,185,129)' : 'rgb(239,68,68)',
                  }}>
                    {flowStats.totalDelta >= 0 ? '+' : ''}{formatVol(flowStats.totalDelta)}
                  </span>
                </div>

                {/* Key levels */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <StatRow label="Total Volume" value={formatVol(flowStats.totalVolume)} />
                  <StatRow label="B/S Ratio" value={flowStats.deltaRatio} />
                  <StatRow label="POC" value={flowStats.poc.toFixed(2)} highlight />
                  <StatRow label="VA Width" value={flowStats.vaWidth.toFixed(2)} />
                  <StatRow label="VAH" value={flowStats.vah.toFixed(2)} />
                  <StatRow label="VAL" value={flowStats.val.toFixed(2)} />
                  <StatRow label="High" value={flowStats.highPrice.toFixed(2)} />
                  <StatRow label="Low" value={flowStats.lowPrice.toFixed(2)} />
                  <StatRow label="Range" value={flowStats.priceRange.toFixed(2)} />
                  <StatRow label="Price Levels" value={flowStats.levelCount.toString()} />
                </div>

                {/* Top volume levels */}
                {flowStats.topLevels.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[9px] font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                      Top Volume Levels
                    </span>
                    {flowStats.topLevels.map((level, i) => (
                      <div key={level.price} className="flex items-center gap-2 mb-1">
                        <span className="text-[8px] w-3 text-right font-mono" style={{ color: 'var(--text-dimmed)' }}>
                          {i + 1}
                        </span>
                        <span className="font-mono text-[9px] flex-1" style={{ color: level.isPOC ? 'var(--primary)' : 'var(--text-secondary)' }}>
                          {level.price.toFixed(2)}
                        </span>
                        <div className="flex gap-1 items-center">
                          <span className="text-[8px] font-mono" style={{ color: 'rgba(16,185,129,0.7)' }}>
                            {formatVol(level.buyVolume)}
                          </span>
                          <span style={{ color: 'var(--text-dimmed)' }}>|</span>
                          <span className="text-[8px] font-mono" style={{ color: 'rgba(239,68,68,0.7)' }}>
                            {formatVol(level.sellVolume)}
                          </span>
                        </div>
                        {/* Mini bar */}
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div className="h-full rounded-full" style={{
                            width: `${level.pct * 100}%`,
                            background: level.delta >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <span style={{ color: 'var(--text-dimmed)' }}>Collecting flow data...</span>
              </div>
            )}
          </>
        )}

        {/* ═══ TRADES TAB ═══ */}
        {tab === 'trades' && (
          <TradesTab state={state} />
        )}
      </div>
    </div>
  );
}

/**
 * Trades tab — shows user's simulated trades during replay
 */
function TradesTab({ state }: { state: ReplayState }) {
  // Get trades from the trading store (QuickTrade during replay)
  const [trades, setTrades] = useState<{ side: string; price: number; size: number; pnl: number; time: number }[]>([]);

  useEffect(() => {
    // Try to get closed trades from trading store
    try {
      // Dynamic import to avoid SSR issues
      const store = require('@/stores/useTradingStore').useTradingStore;
      const state = store.getState();
      setTrades((state.closedTrades || []).map((t: { side: string; price: number; size: number; pnl: number; closedAt: number }) => ({
        side: t.side,
        price: t.price,
        size: t.size,
        pnl: t.pnl || 0,
        time: t.closedAt || 0,
      })));
    } catch { /* no trades available */ }
  }, [state.tradeFedCount]); // re-check when trades are fed

  const summary = useMemo(() => {
    if (trades.length === 0) return null;
    const winners = trades.filter(t => t.pnl > 0);
    const losers = trades.filter(t => t.pnl < 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const grossProfit = winners.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
    const winRate = trades.length > 0 ? (winners.length / trades.length * 100) : 0;
    const avgWin = winners.length > 0 ? grossProfit / winners.length : 0;
    const avgLoss = losers.length > 0 ? grossLoss / losers.length : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const maxWin = winners.length > 0 ? Math.max(...winners.map(t => t.pnl)) : 0;
    const maxLoss = losers.length > 0 ? Math.min(...losers.map(t => t.pnl)) : 0;

    return {
      total: trades.length,
      winners: winners.length,
      losers: losers.length,
      winRate,
      totalPnl,
      grossProfit,
      grossLoss,
      profitFactor,
      avgWin,
      avgLoss,
      maxWin,
      maxLoss,
    };
  }, [trades]);

  if (!summary) {
    return (
      <div className="text-center py-6">
        <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>No trades yet</div>
        <div className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
          Use QuickTrade to place simulated orders during replay
        </div>
      </div>
    );
  }

  return (
    <>
      {/* P&L Header */}
      <div className="text-center py-1 px-2 rounded-lg" style={{
        background: summary.totalPnl >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
      }}>
        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Total P&L</div>
        <div className="text-lg font-bold font-mono" style={{
          color: summary.totalPnl >= 0 ? 'rgb(16,185,129)' : 'rgb(239,68,68)',
        }}>
          {summary.totalPnl >= 0 ? '+' : ''}{summary.totalPnl.toFixed(2)}
        </div>
      </div>

      {/* Win rate bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span style={{ color: 'rgba(16,185,129,0.8)' }}>{summary.winners}W</span>
          <span className="font-mono font-bold" style={{
            color: summary.winRate >= 50 ? 'rgb(16,185,129)' : 'rgb(239,68,68)',
          }}>{summary.winRate.toFixed(1)}%</span>
          <span style={{ color: 'rgba(239,68,68,0.8)' }}>{summary.losers}L</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-l-full" style={{
            width: `${summary.winRate}%`,
            background: 'rgba(16,185,129,0.6)',
          }} />
          <div className="h-full rounded-r-full" style={{
            width: `${100 - summary.winRate}%`,
            background: 'rgba(239,68,68,0.6)',
          }} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <StatRow label="Total Trades" value={summary.total.toString()} />
        <StatRow label="Profit Factor" value={summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)} highlight />
        <StatRow label="Avg Winner" value={`+${summary.avgWin.toFixed(2)}`} color="rgb(16,185,129)" />
        <StatRow label="Avg Loser" value={`-${summary.avgLoss.toFixed(2)}`} color="rgb(239,68,68)" />
        <StatRow label="Best Trade" value={`+${summary.maxWin.toFixed(2)}`} color="rgb(16,185,129)" />
        <StatRow label="Worst Trade" value={summary.maxLoss.toFixed(2)} color="rgb(239,68,68)" />
        <StatRow label="Gross Profit" value={`+${summary.grossProfit.toFixed(2)}`} color="rgb(16,185,129)" />
        <StatRow label="Gross Loss" value={`-${summary.grossLoss.toFixed(2)}`} color="rgb(239,68,68)" />
      </div>

      {/* Recent trades list */}
      <div className="pt-1.5 mt-1 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[9px] font-semibold block mb-1" style={{ color: 'var(--text-muted)' }}>
          Recent Trades
        </span>
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {trades.slice(-10).reverse().map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5 px-1 rounded"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
              <span className="text-[8px] font-bold w-6"
                style={{ color: t.side === 'buy' ? 'rgb(16,185,129)' : 'rgb(239,68,68)' }}>
                {t.side === 'buy' ? 'BUY' : 'SELL'}
              </span>
              <span className="font-mono text-[8px] flex-1" style={{ color: 'var(--text-secondary)' }}>
                {t.price.toFixed(2)} × {t.size}
              </span>
              <span className="font-mono text-[8px] font-bold" style={{
                color: t.pnl >= 0 ? 'rgb(16,185,129)' : 'rgb(239,68,68)',
              }}>
                {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StatRow({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="font-mono" style={{ color: color || (highlight ? 'var(--primary)' : 'var(--text-secondary)') }}>{value}</span>
    </div>
  );
}

function formatVol(vol: number): string {
  const abs = Math.abs(vol);
  if (abs >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toFixed(1);
}
