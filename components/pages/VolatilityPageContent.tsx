'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import IVTermStructure from '@/components/charts/IVTermStructure';
import dynamic from 'next/dynamic';
import { ChartSkeleton, EmptyState } from '@/components/ui/Skeleton';
import { usePageActive } from '@/hooks/usePageActive';
import { useLiveSpot } from '@/lib/useLiveSpot';

const IVSurface3D = dynamic(() => import('@/components/charts/IVSurface3D'), { ssr: false });
const IVSmileChart = dynamic(() => import('@/components/charts/IVSmileChart'), { ssr: false });
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import type { EquitySymbol } from '@/types/options';
import { RefreshIcon } from '@/components/ui/Icons';

type ViewMode = 'smile' | 'surface3D' | 'termStructure';

// ─── Teal accent (tradytics-style) ───
const TEAL = '#26beaf';

export default function VolatilityPageContent() {
  const {
    symbol,
    setSymbol,
    selectedExpiration,
    setSelectedExpiration,
    expirations,
    setExpirations,
    underlyingPrice,
    isLoading,
    setLoading,
    error,
    setError,
    getATMStrike,
    reset,
  } = useEquityOptionsStore();

  const isActive = usePageActive();
  const liveSpot = useLiveSpot(symbol, 10_000);

  const [viewMode, setViewMode] = useState<ViewMode>('smile');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'cboe' | 'error' | null>(null);

  const [liveSkewData, setLiveSkewData] = useState<{ strike: number; callIV: number | null; putIV: number | null; moneyness: number }[]>([]);
  const [liveSurfaceData, setLiveSurfaceData] = useState<{ strike: number; expiration: number; iv: number }[]>([]);
  const [liveTermStructure, setLiveTermStructure] = useState<{ expiration: number; expirationLabel: string; daysToExpiry: number; atmIV: number; callIV: number; putIV: number }[]>([]);
  const [liveSpotPrice, setLiveSpotPrice] = useState(0);

  const loadLiveData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const expParam = selectedExpiration ? `&expiration=${selectedExpiration}` : '';
      const res = await fetch(`/api/volatility-live?symbol=${symbol}${expParam}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || `API returned ${res.status}`);
      }
      const data = await res.json();
      setExpirations(data.expirations);
      if (!selectedExpiration && data.expirations.length > 0) setSelectedExpiration(data.expirations[0]);
      setLiveSkewData(data.skewData);
      setLiveSurfaceData(data.surfaceData);
      setLiveTermStructure(data.termStructure);
      setLiveSpotPrice(data.spotPrice);
      setDataSource('cboe');
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setDataSource('error');
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedExpiration, setExpirations, setSelectedExpiration, setLoading, setError]);

  useEffect(() => {
    loadLiveData();
    return () => { reset(); };
  }, [symbol]);

  useEffect(() => {
    if (selectedExpiration) loadLiveData();
  }, [selectedExpiration]);

  // Auto-refresh every 30s when tab is active
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(loadLiveData, 30_000);
    return () => clearInterval(t);
  }, [isActive, loadLiveData]);

  // ─── Derived metrics ───
  const skewData = liveSkewData;
  const spot = liveSpot.price > 0 ? liveSpot.price : liveSpotPrice || underlyingPrice;
  const atmStrike = skewData.length > 0
    ? skewData.reduce((c, d) => Math.abs(d.moneyness - 1) < Math.abs(c.moneyness - 1) ? d : c).strike
    : getATMStrike();
  const atmRow = skewData.find(d => d.strike === atmStrike);
  const atmCallIV = atmRow?.callIV ? atmRow.callIV * 100 : null;
  const atmPutIV = atmRow?.putIV ? atmRow.putIV * 100 : null;
  const skewRatio = atmCallIV && atmPutIV ? atmPutIV / atmCallIV : null;
  const dte = selectedExpiration
    ? Math.max(1, Math.ceil((selectedExpiration * 1000 - Date.now()) / 86_400_000))
    : null;

  // IV spread across all strikes (max put skew)
  const maxPutSkew = useMemo(() => {
    let max = 0;
    skewData.forEach(d => {
      if (d.putIV && d.callIV) max = Math.max(max, d.putIV - d.callIV);
    });
    return max > 0 ? (max * 100).toFixed(1) : null;
  }, [skewData]);

  const tableData = useMemo(() => {
    const filtered = skewData.filter(d => d.callIV || d.putIV);
    if (!atmStrike || filtered.length === 0) return filtered.slice(0, 20);
    const idx = filtered.findIndex(d => d.strike === atmStrike);
    if (idx < 0) return filtered.slice(0, 20);
    return filtered.slice(Math.max(0, idx - 9), Math.min(filtered.length, idx + 10));
  }, [skewData, atmStrike]);

  const maxIV = useMemo(() => {
    let max = 0;
    tableData.forEach(d => {
      if (d.callIV && d.callIV > max) max = d.callIV;
      if (d.putIV && d.putIV > max) max = d.putIV;
    });
    return max || 1;
  }, [tableData]);

  const formatExp = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const isLive = dataSource === 'cboe';

  return (
    <div className="h-full flex flex-col bg-[var(--background)] overflow-hidden">

      {/* ══════════════════════════════════════════════════════
          TOP BAR: logo · symbols · LIVE · refresh
      ══════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-[var(--border)] shrink-0">

        {/* Left: icon + symbol pills */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black"
            style={{ background: `${TEAL}22`, border: `1px solid ${TEAL}55`, color: TEAL }}
          >
            IV
          </div>
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] hidden sm:block whitespace-nowrap">
            Volatility Skew
          </span>

          {/* Symbol pills */}
          <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
            {(['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL'] as EquitySymbol[]).map(s => (
              <button
                key={s}
                onClick={() => { reset(); setSymbol(s); }}
                className={`px-2.5 py-1 text-[11px] rounded font-medium transition-all duration-150 ${
                  symbol === s
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
                style={symbol === s ? { background: `${TEAL}22`, color: TEAL } : {}}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Right: status + time + refresh */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] border"
            style={isLive
              ? { background: `${TEAL}12`, color: TEAL, borderColor: `${TEAL}30` }
              : { background: 'rgba(255,200,0,0.08)', color: 'rgba(255,200,0,0.8)', borderColor: 'rgba(255,200,0,0.2)' }
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: isLive ? TEAL : 'rgba(255,200,0,0.8)', animation: isLive ? 'pulse 2s infinite' : 'none' }}
            />
            {isLive ? 'CBOE · delayed ~15min' : isLoading ? 'Loading…' : 'Error'}
          </div>
          {lastUpdate && (
            <span className="text-[9px] text-[var(--text-muted)] hidden md:block font-mono">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={loadLiveData}
            disabled={isLoading}
            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-all disabled:opacity-40 hover:scale-105 active:scale-95"
          >
            <RefreshIcon size={13} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          METRICS STRIP: 6 key stats
      ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-6 border-b border-[var(--border)] shrink-0">
        <MetricCell
          label="Spot"
          value={spot > 0 ? `$${spot.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          color={TEAL}
          live
        />
        <MetricCell
          label="ATM Strike"
          value={atmStrike ? `$${atmStrike.toLocaleString()}` : '—'}
          color="var(--text-primary)"
        />
        <MetricCell
          label="Call IV"
          value={atmCallIV ? `${atmCallIV.toFixed(1)}%` : '—'}
          color="#34d399"
        />
        <MetricCell
          label="Put IV"
          value={atmPutIV ? `${atmPutIV.toFixed(1)}%` : '—'}
          color="#f87171"
        />
        <MetricCell
          label="P/C Skew"
          value={skewRatio ? skewRatio.toFixed(2) : '—'}
          color={skewRatio ? (skewRatio > 1.05 ? '#f87171' : skewRatio < 0.95 ? '#34d399' : 'var(--text-primary)') : 'var(--text-muted)'}
          sub={skewRatio ? (skewRatio > 1.05 ? 'Put premium' : skewRatio < 0.95 ? 'Call premium' : 'Neutral') : undefined}
        />
        <MetricCell
          label={dte ? `DTE · ${dte}d` : 'DTE'}
          value={maxPutSkew ? `+${maxPutSkew}%` : '—'}
          color="rgba(255,200,60,0.9)"
          sub="max put spread"
        />
      </div>

      {/* ══════════════════════════════════════════════════════
          CONTROLS: expiry tabs + view toggle
      ══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)] shrink-0">Expiry</span>
        <div className="flex items-center gap-1 flex-1">
          {expirations.slice(0, 9).map(exp => (
            <button
              key={exp}
              onClick={() => setSelectedExpiration(exp)}
              className="px-2.5 py-1 text-[10px] rounded-lg whitespace-nowrap transition-all duration-150 font-medium"
              style={selectedExpiration === exp
                ? { background: `${TEAL}20`, color: TEAL, border: `1px solid ${TEAL}40` }
                : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
              }
            >
              {formatExp(exp)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)] shrink-0">
          {([
            { key: 'smile' as const, label: 'IV Skew' },
            { key: 'surface3D' as const, label: '3D Surface' },
            { key: 'termStructure' as const, label: 'Term Structure' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className="px-2.5 py-1 text-[10px] rounded transition-all duration-150"
              style={viewMode === key
                ? { background: `${TEAL}20`, color: TEAL }
                : { color: 'var(--text-muted)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CHART
      ══════════════════════════════════════════════════════ */}
      <div
        className="flex-1 min-h-0 relative"
        onWheel={e => { if (viewMode === 'smile' && skewData.length > 0) e.stopPropagation(); }}
      >
        {isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <EmptyState
            icon="error"
            title={error}
            action={
              <button
                onClick={loadLiveData}
                className="px-4 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)] text-sm"
              >
                Retry
              </button>
            }
          />
        ) : skewData.length === 0 ? (
          <EmptyState icon="chart" title="No data" description="Select an expiration above" />
        ) : viewMode === 'smile' ? (
          <IVSmileChart
            data={skewData}
            spotPrice={spot}
            symbol={symbol}
            dte={dte ?? undefined}
            height={420}
          />
        ) : viewMode === 'surface3D' ? (
          <IVSurface3D
            symbol={symbol}
            spotPrice={spot || 450}
            surfaceData={liveSurfaceData.length > 0 ? liveSurfaceData : undefined}
            height={420}
          />
        ) : (
          <IVTermStructure
            symbol={symbol}
            data={liveTermStructure}
            height={420}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          IV TABLE — compact, scrollable
      ══════════════════════════════════════════════════════ */}
      {tableData.length > 0 && (
        <div className="border-t border-[var(--border)] shrink-0" style={{ maxHeight: 210, overflowY: 'auto' }}>
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th left>Strike</Th>
                <Th>Moneyness</Th>
                <Th>Call IV</Th>
                <Th>Call Bar</Th>
                <Th>Put IV</Th>
                <Th>Put Bar</Th>
                <Th>Skew</Th>
              </tr>
            </thead>
            <tbody>
              {tableData.map(row => {
                const isATM = row.strike === atmStrike;
                const sp = row.callIV && row.putIV ? ((row.putIV - row.callIV) * 100) : null;
                return (
                  <tr
                    key={row.strike}
                    className="transition-colors hover:bg-[var(--surface-hover)]"
                    style={{
                      borderTop: '1px solid var(--border)',
                      background: isATM ? `${TEAL}0d` : undefined,
                    }}
                  >
                    {/* Strike */}
                    <td className="py-1.5 px-3 font-mono font-medium" style={{ color: isATM ? TEAL : 'var(--text-primary)' }}>
                      ${row.strike.toLocaleString()}
                      {isATM && (
                        <span
                          className="ml-1.5 text-[8px] px-1.5 py-0.5 rounded font-sans font-semibold"
                          style={{ background: `${TEAL}22`, color: TEAL }}
                        >
                          ATM
                        </span>
                      )}
                    </td>
                    {/* Moneyness */}
                    <td className="py-1.5 px-3 font-mono text-center" style={{ color: 'var(--text-muted)' }}>
                      {row.moneyness.toFixed(3)}
                    </td>
                    {/* Call IV */}
                    <td className="py-1.5 px-3 font-mono text-right font-semibold" style={{ color: '#34d399' }}>
                      {row.callIV ? `${(row.callIV * 100).toFixed(1)}%` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    {/* Call bar */}
                    <td className="py-1.5 px-2 w-20">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${((row.callIV || 0) / maxIV) * 100}%`, background: '#34d399', opacity: 0.55 }}
                        />
                      </div>
                    </td>
                    {/* Put IV */}
                    <td className="py-1.5 px-3 font-mono text-right font-semibold" style={{ color: '#f87171' }}>
                      {row.putIV ? `${(row.putIV * 100).toFixed(1)}%` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    {/* Put bar */}
                    <td className="py-1.5 px-2 w-20">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${((row.putIV || 0) / maxIV) * 100}%`, background: '#f87171', opacity: 0.55 }}
                        />
                      </div>
                    </td>
                    {/* Skew spread */}
                    <td
                      className="py-1.5 px-3 font-mono text-right"
                      style={{
                        color: sp !== null ? (sp > 0 ? '#f87171' : '#34d399') : 'var(--text-muted)',
                        opacity: 0.85,
                      }}
                    >
                      {sp !== null ? `${sp > 0 ? '+' : ''}${sp.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function MetricCell({
  label, value, color, sub, live,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  live?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 border-r border-[var(--border)] last:border-r-0 flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        {live && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: TEAL }} />}
        <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      </div>
      <span className="font-mono font-bold text-sm leading-tight" style={{ color }}>{value}</span>
      {sub && <span className="text-[8.5px] text-[var(--text-muted)] leading-none">{sub}</span>}
    </div>
  );
}

function Th({ children, left }: { children?: React.ReactNode; left?: boolean }) {
  return (
    <th
      className={`py-1.5 px-3 text-[9px] font-medium uppercase tracking-wider ${left ? 'text-left' : 'text-right'}`}
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </th>
  );
}
