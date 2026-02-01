'use client';

import { useEffect, useCallback } from 'react';
import { VolatilitySkewChart } from '@/components/charts';
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import type { EquitySymbol, EquityOptionData } from '@/types/options';

export default function VolatilityPage() {
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

  useEffect(() => {
    fetchExpirations(true);

    return () => {
      reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (selectedExpiration) {
      fetchOptionsForExpiration(selectedExpiration);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiration]);

  const skewData = getVolatilitySkew();
  const atmStrike = getATMStrike();

  const atmIV = skewData.find((d) => d.strike === atmStrike);
  const atmCallIV = atmIV?.callIV ? (atmIV.callIV * 100).toFixed(1) : '---';
  const atmPutIV = atmIV?.putIV ? (atmIV.putIV * 100).toFixed(1) : '---';

  const formatExpiration = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white mb-2">Volatility Skew</h1>
            <p className="text-zinc-400 text-sm">
              Implied Volatility by strike - {symbol} Options
            </p>
          </div>

          <div className="flex items-center gap-2">
            {(['SPY', 'QQQ'] as EquitySymbol[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  reset();
                  setSymbol(s);
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  symbol === s
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          <span className="text-sm text-zinc-500 whitespace-nowrap">Expiration:</span>
          {expirations.slice(0, 8).map((exp) => (
            <button
              key={exp}
              onClick={() => setSelectedExpiration(exp)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                selectedExpiration === exp
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {formatExpiration(exp)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Underlying Price</p>
          <p className="text-xl font-mono font-semibold text-white mt-1">
            ${underlyingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">ATM Strike</p>
          <p className="text-xl font-mono font-semibold text-white mt-1">
            ${atmStrike?.toLocaleString() || '---'}
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">ATM Call IV</p>
          <p className="text-xl font-mono font-semibold text-emerald-400 mt-1">
            {atmCallIV}%
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">ATM Put IV</p>
          <p className="text-xl font-mono font-semibold text-red-400 mt-1">
            {atmPutIV}%
          </p>
        </div>
      </div>

      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        {isLoading ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400 text-sm">Loading options data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-red-400 text-center">
              <p>{error}</p>
              <button
                onClick={() => fetchOptionsForExpiration(selectedExpiration!)}
                className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-white hover:bg-zinc-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : skewData.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <span className="text-zinc-500">Select an expiration to view volatility skew</span>
          </div>
        ) : (
          <VolatilitySkewChart height={450} />
        )}
      </div>

      {skewData.length > 0 && (
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 overflow-x-auto">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">IV by Strike</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
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
                    className={`border-b border-zinc-800/50 ${
                      point.strike === atmStrike ? 'bg-zinc-800/50' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono">
                      ${point.strike.toLocaleString()}
                      {point.strike === atmStrike && (
                        <span className="ml-2 text-xs text-blue-400">ATM</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-emerald-400">
                      {point.callIV ? `${(point.callIV * 100).toFixed(1)}%` : '---'}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-red-400">
                      {point.putIV ? `${(point.putIV * 100).toFixed(1)}%` : '---'}
                    </td>
                    <td className="text-right py-2 px-3 font-mono text-zinc-400">
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
