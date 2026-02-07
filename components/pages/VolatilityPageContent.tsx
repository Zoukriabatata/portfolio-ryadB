'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { VolatilitySkewChart } from '@/components/charts';
import IVTermStructure from '@/components/charts/IVTermStructure';
import dynamic from 'next/dynamic';

const IVSurface3D = dynamic(() => import('@/components/charts/IVSurface3D'), { ssr: false });
const IVSmileSimulated = dynamic(() => import('@/components/charts/IVSmileSimulated'), { ssr: false });
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import type { EquitySymbol, EquityOptionData } from '@/types/options';
import {
  generateVolatilitySkew,
  generateSimulatedExpirations,
  generateIVSurface,
} from '@/lib/simulation/VolatilitySimulator';
import { ChartSmileIcon, SimulationIcon, LiveIcon, RefreshIcon } from '@/components/ui/Icons';

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

  const fetchExpirations = useCallback(async (autoSelectFirst = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/yahoo/options?symbol=${symbol}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setExpirations(data.expirations || []);

      if (autoSelectFirst && data.expirations?.length > 0) {
        setSelectedExpiration(data.expirations[0]);
      }
    } catch (err) {
      setError('Failed to fetch expirations');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [symbol, setExpirations, setLoading, setSelectedExpiration, setError]);

  const fetchOptionsForExpiration = useCallback(async (expiration: number) => {
    if (!expiration) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/yahoo/options?symbol=${symbol}&expiration=${expiration}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const calls: EquityOptionData[] = (data.calls || []).map((c: EquityOptionData) => ({
        ...c,
        optionType: 'call' as const,
      }));

      const puts: EquityOptionData[] = (data.puts || []).map((p: EquityOptionData) => ({
        ...p,
        optionType: 'put' as const,
      }));

      setOptions(calls, puts, data.underlyingPrice || 0);
    } catch (err) {
      setError('Failed to fetch options data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [symbol, setOptions, setLoading, setError]);

  // Load simulated data
  const loadSimulatedData = useCallback(() => {
    setLoading(true);

    setTimeout(() => {
      const simExpirations = generateSimulatedExpirations();
      setExpirations(simExpirations);

      if (!selectedExpiration && simExpirations.length > 0) {
        setSelectedExpiration(simExpirations[0]);
      }

      const expDate = selectedExpiration || simExpirations[0];
      const daysToExp = expDate
        ? Math.max(1, Math.ceil((expDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
        : 30;

      const simData = generateVolatilitySkew(symbol, 30, daysToExp);
      setSimulatedData(simData);
      setLastUpdate(new Date());
      setLoading(false);
    }, 300);
  }, [symbol, selectedExpiration, setExpirations, setSelectedExpiration, setLoading]);

  useEffect(() => {
    if (isSimulation) {
      loadSimulatedData();
    } else {
      fetchExpirations(true);
    }

    return () => {
      reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, isSimulation]);

  useEffect(() => {
    if (selectedExpiration) {
      if (isSimulation) {
        loadSimulatedData();
      } else {
        fetchOptionsForExpiration(selectedExpiration);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiration, isSimulation]);

  // Get skew data from store or simulation
  const storeSkewData = getVolatilitySkew();
  const skewData = isSimulation && simulatedData
    ? simulatedData.skewData.map(d => ({
        strike: d.strike,
        callIV: d.callIV,
        putIV: d.putIV,
        moneyness: d.moneyness,
      }))
    : storeSkewData;

  const effectiveSpotPrice = isSimulation && simulatedData ? simulatedData.spotPrice : underlyingPrice;
  const atmStrike = isSimulation && simulatedData
    ? simulatedData.skewData.reduce((closest, d) =>
        Math.abs(d.moneyness - 1) < Math.abs(closest.moneyness - 1) ? d : closest
      ).strike
    : getATMStrike();

  const atmIV = skewData.find((d) => d.strike === atmStrike);
  const atmCallIV = atmIV?.callIV ? (atmIV.callIV * 100).toFixed(1) : '---';
  const atmPutIV = atmIV?.putIV ? (atmIV.putIV * 100).toFixed(1) : '---';

  // Generate term structure data from expirations
  const termStructureData = useMemo(() => {
    if (!expirations.length || !skewData.length) return [];

    const baseIV = atmIV?.callIV || 0.25;

    return expirations.map((exp, index) => {
      const daysToExpiry = Math.max(1, Math.ceil((exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24)));
      const expDate = new Date(exp * 1000);
      const expirationLabel = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Simulate IV term structure - typically IV increases with time (contango)
      // with some noise
      const timeAdjustment = 1 + (daysToExpiry / 365) * 0.1;
      const noise = (Math.random() - 0.5) * 0.02;
      const atmIVForExp = baseIV * timeAdjustment + noise;

      return {
        expiration: exp,
        expirationLabel,
        daysToExpiry,
        atmIV: atmIVForExp,
        callIV: atmIVForExp * (1 + (Math.random() - 0.5) * 0.05),
        putIV: atmIVForExp * (1 + (Math.random() - 0.5) * 0.05),
      };
    });
  }, [expirations, skewData, atmIV]);

  const formatExpiration = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col bg-[var(--background)] p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center">
              <ChartSmileIcon size={22} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Volatility Analysis</h1>
              <p className="text-xs text-[var(--text-muted)]">IV Smile & Surface - {symbol} Options</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Symbol selector */}
            <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
              {(['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL'] as EquitySymbol[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    reset();
                    setSymbol(s);
                  }}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    symbol === s
                      ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Simulation Toggle */}
            <button
              onClick={() => setIsSimulation(!isSimulation)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
                isSimulation
                  ? 'bg-[var(--accent)] text-[var(--text-primary)] border-[var(--accent-dark)]'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border-light)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isSimulation ? (
                <>
                  <SimulationIcon size={16} color="#fff" />
                  <span>Simulation</span>
                </>
              ) : (
                <>
                  <LiveIcon size={16} color="currentColor" />
                  <span>Live</span>
                </>
              )}
            </button>

            {lastUpdate && isSimulation && (
              <span className="text-xs text-[var(--text-muted)]">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Expiration selector */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">Exp:</span>
          {expirations.slice(0, 8).map((exp) => (
            <button
              key={exp}
              onClick={() => setSelectedExpiration(exp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedExpiration === exp
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                  : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {formatExpiration(exp)}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--border)]" />

        {/* View Mode */}
        <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
          <button
            onClick={() => setViewMode('smile')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              viewMode === 'smile' ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            IV Smile
          </button>
          <button
            onClick={() => setViewMode('surface3D')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              viewMode === 'surface3D' ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            3D Surface
          </button>
          <button
            onClick={() => setViewMode('termStructure')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              viewMode === 'termStructure' ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Term Structure
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fadeIn">
        <div className="bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface)] rounded-xl p-4 border border-[var(--border-light)] backdrop-blur-sm
          transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-blue-500/10 cursor-default">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Underlying</p>
          <p className="text-xl font-mono font-bold text-blue-400/80 mt-1">
            ${effectiveSpotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface)] rounded-xl p-4 border border-[var(--border-light)] backdrop-blur-sm
          transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg cursor-default">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">ATM Strike</p>
          <p className="text-xl font-mono font-bold text-[var(--text-primary)] mt-1">
            ${atmStrike?.toLocaleString() || '---'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/15 to-[var(--surface)] rounded-xl p-4 border border-emerald-500/15 backdrop-blur-sm
          transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-emerald-500/10 cursor-default">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">ATM Call IV</p>
          <p className="text-xl font-mono font-bold text-emerald-400/80 mt-1">
            {atmCallIV}%
          </p>
        </div>
        <div className="bg-gradient-to-br from-rose-900/15 to-[var(--surface)] rounded-xl p-4 border border-rose-500/15 backdrop-blur-sm
          transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-rose-500/10 cursor-default">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">ATM Put IV</p>
          <p className="text-xl font-mono font-bold text-rose-400/80 mt-1">
            {atmPutIV}%
          </p>
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4">
        {isLoading ? (
          <div className="h-[450px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--text-muted)] text-sm">Loading options data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="h-[450px] flex items-center justify-center">
            <div className="text-red-400 text-center">
              <p>{error}</p>
              <button
                onClick={() => fetchOptionsForExpiration(selectedExpiration!)}
                className="mt-4 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : skewData.length === 0 ? (
          <div className="h-[450px] flex items-center justify-center">
            <span className="text-[var(--text-muted)]">Select an expiration to view volatility data</span>
          </div>
        ) : viewMode === 'smile' ? (
          isSimulation ? (
            <IVSmileSimulated
              symbol={symbol}
              spotPrice={simulatedData?.spotPrice || underlyingPrice || 450}
              expiration={selectedExpiration ? Math.ceil((selectedExpiration * 1000 - Date.now()) / (1000 * 60 * 60 * 24)) : 30}
              height={450}
              animated={true}
            />
          ) : (
            <VolatilitySkewChart height={450} />
          )
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

      {skewData.length > 0 && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 overflow-x-auto">
          <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-4">IV by Strike</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="text-left py-2 px-3">Strike</th>
                <th className="text-right py-2 px-3">Call IV</th>
                <th className="text-right py-2 px-3">Put IV</th>
                <th className="text-right py-2 px-3">Moneyness</th>
              </tr>
            </thead>
            <tbody>
              {skewData
                .filter((d) => d.callIV || d.putIV)
                .slice(0, 20)
                .map((point) => (
                  <tr
                    key={point.strike}
                    className={`border-b border-[var(--border)] ${
                      point.strike === atmStrike ? 'bg-[var(--surface-elevated)]' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono">
                      ${point.strike.toLocaleString()}
                      {point.strike === atmStrike && (
                        <span className="ml-2 text-xs text-blue-400/80">ATM</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-emerald-400/80">
                      {point.callIV ? `${(point.callIV * 100).toFixed(1)}%` : '---'}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-red-400/80">
                      {point.putIV ? `${(point.putIV * 100).toFixed(1)}%` : '---'}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-[var(--text-secondary)]">
                      {point.moneyness.toFixed(3)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
