'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import IVTermStructure from '@/components/charts/IVTermStructure';
import dynamic from 'next/dynamic';

const IVSurface3D = dynamic(() => import('@/components/charts/IVSurface3D'), { ssr: false });
const IVSmileChart = dynamic(() => import('@/components/charts/IVSmileChart'), { ssr: false });
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import type { EquitySymbol } from '@/types/options';
import {
  generateVolatilitySkew,
  generateSimulatedExpirations,
} from '@/lib/simulation/VolatilitySimulator';
import { ChartSmileIcon, SimulationIcon, RefreshIcon } from '@/components/ui/Icons';

type ViewMode = 'smile' | 'surface3D' | 'termStructure';

export default function VolatilityPageContent() {
  const {
    symbol,
    setSymbol,
    selectedExpiration,
    setSelectedExpiration,
    expirations,
    setExpirations,
    setOptions,
    underlyingPrice,
    isLoading,
    setLoading,
    error,
    setError,
    getVolatilitySkew,
    getATMStrike,
    reset,
  } = useEquityOptionsStore();

  const [isSimulation, setIsSimulation] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('smile');
  const [simulatedData, setSimulatedData] = useState<ReturnType<typeof generateVolatilitySkew> | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // ─── Data Fetching (unchanged) ───

  const loadSimulatedData = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const simExpirations = generateSimulatedExpirations();
      setExpirations(simExpirations);
      if (!selectedExpiration && simExpirations.length > 0) setSelectedExpiration(simExpirations[0]);
      const expDate = selectedExpiration || simExpirations[0];
      const daysToExp = expDate ? Math.max(1, Math.ceil((expDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24))) : 30;
      const simData = generateVolatilitySkew(symbol, 30, daysToExp);
      setSimulatedData(simData);
      setLastUpdate(new Date());
      setLoading(false);
    }, 300);
  }, [symbol, selectedExpiration, setExpirations, setSelectedExpiration, setLoading]);

  useEffect(() => {
    loadSimulatedData();
    return () => { reset(); };
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedExpiration) loadSimulatedData();
  }, [selectedExpiration]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Computed Data ───

  const storeSkewData = getVolatilitySkew();
  const skewData = isSimulation && simulatedData
    ? simulatedData.skewData.map(d => ({ strike: d.strike, callIV: d.callIV, putIV: d.putIV, moneyness: d.moneyness }))
    : storeSkewData;

  const effectiveSpotPrice = isSimulation && simulatedData ? simulatedData.spotPrice : underlyingPrice;
  const atmStrike = isSimulation && simulatedData
    ? simulatedData.skewData.reduce((closest, d) => Math.abs(d.moneyness - 1) < Math.abs(closest.moneyness - 1) ? d : closest).strike
    : getATMStrike();

  const atmIV = skewData.find((d) => d.strike === atmStrike);
  const atmCallIV = atmIV?.callIV ? (atmIV.callIV * 100).toFixed(1) : '---';
  const atmPutIV = atmIV?.putIV ? (atmIV.putIV * 100).toFixed(1) : '---';

  const skewRatio = atmIV?.callIV && atmIV?.putIV
    ? (atmIV.putIV / atmIV.callIV).toFixed(2)
    : '---';

  const dte = selectedExpiration
    ? Math.max(1, Math.ceil((selectedExpiration * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
    : undefined;

  // Table data: centered around ATM, limited rows
  const tableData = useMemo(() => {
    const filtered = skewData.filter(d => d.callIV || d.putIV);
    if (!atmStrike || filtered.length === 0) return filtered.slice(0, 15);
    const atmIdx = filtered.findIndex(d => d.strike === atmStrike);
    if (atmIdx < 0) return filtered.slice(0, 15);
    const start = Math.max(0, atmIdx - 7);
    const end = Math.min(filtered.length, atmIdx + 8);
    return filtered.slice(start, end);
  }, [skewData, atmStrike]);

  const maxIVInTable = useMemo(() => {
    let max = 0;
    tableData.forEach(d => {
      if (d.callIV && d.callIV > max) max = d.callIV;
      if (d.putIV && d.putIV > max) max = d.putIV;
    });
    return max || 1;
  }, [tableData]);

  const termStructureData = useMemo(() => {
    if (!expirations.length || !skewData.length) return [];
    const baseIV = atmIV?.callIV || 0.25;
    return expirations.map((exp) => {
      const daysToExpiry = Math.max(1, Math.ceil((exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24)));
      const expDate = new Date(exp * 1000);
      const expirationLabel = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeAdjustment = 1 + (daysToExpiry / 365) * 0.1;
      const noise = (Math.random() - 0.5) * 0.02;
      const atmIVForExp = baseIV * timeAdjustment + noise;
      return {
        expiration: exp, expirationLabel, daysToExpiry, atmIV: atmIVForExp,
        callIV: atmIVForExp * (1 + (Math.random() - 0.5) * 0.05),
        putIV: atmIVForExp * (1 + (Math.random() - 0.5) * 0.05),
      };
    });
  }, [expirations, skewData, atmIV]);

  const formatExp = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const handleRefresh = () => {
    loadSimulatedData();
  };

  return (
    <div className="h-full flex flex-col bg-[var(--background)] p-4 gap-3 overflow-auto">

      {/* ─── Header Row ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-slideUp stagger-1">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ChartSmileIcon size={20} color="#fff" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)] leading-tight">Volatility Smile</h1>
            <p className="text-[10px] text-[var(--text-muted)]">{symbol} Options IV Analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Symbol pills */}
          <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
            {(['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL'] as EquitySymbol[]).map((s) => (
              <button
                key={s}
                onClick={() => { reset(); setSymbol(s); }}
                className={`px-2.5 py-1 text-[11px] rounded font-medium transition-all duration-200 ${
                  symbol === s
                    ? 'bg-[var(--primary-dark)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* SIM badge */}
          <div className="px-3 py-1 text-sm rounded-lg border flex items-center gap-1.5 bg-[var(--accent)] text-[var(--text-primary)] border-[var(--accent-dark)]">
            <SimulationIcon size={14} color="#fff" /><span>SIM</span>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] rounded-lg border border-[var(--border-light)] transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95"
          >
            <RefreshIcon size={14} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
          </button>

          {lastUpdate && (
            <span className="text-[10px] text-[var(--text-muted)]">{lastUpdate.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* ─── Metrics Strip ─── */}
      <div className="flex items-center gap-0 bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden text-xs animate-slideUp stagger-2">
        <Metric label="Spot" value={`$${effectiveSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color="text-blue-400" />
        <Sep />
        <Metric label="ATM" value={atmStrike ? `$${atmStrike.toLocaleString()}` : '---'} />
        <Sep />
        <Metric label="Call IV" value={`${atmCallIV}%`} color="text-emerald-400" />
        <Sep />
        <Metric label="Put IV" value={`${atmPutIV}%`} color="text-rose-400" />
        <Sep />
        <Metric
          label="P/C Skew"
          value={skewRatio}
          color={skewRatio !== '---' && parseFloat(skewRatio) > 1.05 ? 'text-rose-400' : skewRatio !== '---' && parseFloat(skewRatio) < 0.95 ? 'text-emerald-400' : 'text-[var(--text-primary)]'}
        />
        <Sep />
        <Metric label="DTE" value={dte ? `${dte}d` : '---'} color="text-amber-400" />
        {effectiveSpotPrice > 0 && (
          <>
            <Sep />
            <div className="flex items-center gap-1.5 px-4 py-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="font-mono font-medium text-blue-400">{symbol}</span>
            </div>
          </>
        )}
      </div>

      {/* ─── Controls Row ─── */}
      <div className="flex flex-wrap items-center gap-3 animate-slideUp stagger-3">
        {/* Expirations */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap mr-1">EXP</span>
          {expirations.slice(0, 8).map((exp) => (
            <button
              key={exp}
              onClick={() => setSelectedExpiration(exp)}
              className={`px-2.5 py-1 text-[10px] rounded-lg whitespace-nowrap transition-colors ${
                selectedExpiration === exp
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                  : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {formatExp(exp)}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-[var(--border)]" />

        {/* View Mode */}
        <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
          {([
            { key: 'smile' as const, label: 'IV Smile' },
            { key: 'surface3D' as const, label: '3D Surface' },
            { key: 'termStructure' as const, label: 'Term Structure' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`px-2.5 py-1 text-[10px] rounded transition-all duration-200 ${
                viewMode === key
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)] shadow-lg shadow-[var(--primary-glow)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Chart ─── */}
      <div className="flex-1 bg-[var(--surface)] rounded-xl border border-[var(--border)] min-h-[350px] overflow-hidden animate-scaleIn stagger-4"
        onWheel={(e) => { if (viewMode === 'smile' && skewData.length > 0) e.stopPropagation(); }}
      >
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center min-h-[350px]">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--text-muted)] text-sm">Loading {symbol} options...</span>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center min-h-[350px]">
            <div className="text-center">
              <p className="text-red-400 mb-3">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)] text-sm"
              >
                Retry
              </button>
            </div>
          </div>
        ) : skewData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center min-h-[350px]">
            <span className="text-[var(--text-muted)]">Select an expiration to view data</span>
          </div>
        ) : viewMode === 'smile' ? (
          <IVSmileChart
            data={skewData}
            spotPrice={effectiveSpotPrice}
            symbol={symbol}
            dte={dte}
            height={450}
          />
        ) : viewMode === 'surface3D' ? (
          <IVSurface3D
            symbol={symbol}
            spotPrice={simulatedData?.spotPrice || underlyingPrice || 450}
            height={450}
          />
        ) : (
          <IVTermStructure
            symbol={symbol}
            data={termStructureData}
            height={450}
          />
        )}
      </div>

      {/* ─── IV Table ─── */}
      {tableData.length > 0 && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden animate-slideUp stagger-5">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">IV by Strike</span>
            <span className="text-[10px] text-[var(--text-muted)]">{tableData.length} strikes near ATM</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
                  <th className="text-left py-2 px-3 font-medium">Strike</th>
                  <th className="text-right py-2 px-3 font-medium w-[90px]">Call IV</th>
                  <th className="py-2 px-1 w-[80px]" />
                  <th className="text-right py-2 px-3 font-medium w-[90px]">Put IV</th>
                  <th className="py-2 px-1 w-[80px]" />
                  <th className="text-right py-2 px-3 font-medium">Spread</th>
                  <th className="text-right py-2 px-3 font-medium">Money.</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((point) => {
                  const isATM = point.strike === atmStrike;
                  const callPct = point.callIV ? point.callIV / maxIVInTable : 0;
                  const putPct = point.putIV ? point.putIV / maxIVInTable : 0;
                  const spread = point.callIV && point.putIV
                    ? ((point.putIV - point.callIV) * 100).toFixed(1)
                    : null;

                  return (
                    <tr
                      key={point.strike}
                      className={`border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-hover)] ${
                        isATM ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      <td className="py-1.5 px-3 font-mono font-medium">
                        <span className={isATM ? 'text-blue-400' : 'text-[var(--text-primary)]'}>
                          ${point.strike.toLocaleString()}
                        </span>
                        {isATM && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-sans font-medium">ATM</span>
                        )}
                      </td>
                      <td className="text-right py-1.5 px-3 font-mono text-emerald-400">
                        {point.callIV ? `${(point.callIV * 100).toFixed(1)}%` : '---'}
                      </td>
                      <td className="py-1.5 px-1">
                        <div className="w-full bg-[var(--surface-elevated)] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/60"
                            style={{ width: `${callPct * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="text-right py-1.5 px-3 font-mono text-rose-400">
                        {point.putIV ? `${(point.putIV * 100).toFixed(1)}%` : '---'}
                      </td>
                      <td className="py-1.5 px-1">
                        <div className="w-full bg-[var(--surface-elevated)] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-500/60"
                            style={{ width: `${putPct * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className={`text-right py-1.5 px-3 font-mono ${
                        spread !== null && parseFloat(spread) > 0 ? 'text-rose-400/70' : 'text-emerald-400/70'
                      }`}>
                        {spread !== null ? `${parseFloat(spread) > 0 ? '+' : ''}${spread}` : '---'}
                      </td>
                      <td className="text-right py-1.5 px-3 font-mono text-[var(--text-muted)]">
                        {point.moneyness.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small reusable pieces ───

function Metric({ label, value, color = 'text-[var(--text-primary)]' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">{label}</span>
      <span className={`font-mono font-semibold text-sm ${color} whitespace-nowrap`}>{value}</span>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-8 bg-[var(--border)]" />;
}
