'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const GEXDashboard = dynamic(
  () => import('@/components/charts/GEXDashboard'),
  { ssr: false }
);

interface GEXLevel {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

interface GEXSummary {
  netGEX: number;
  totalCallGEX: number;
  totalPutGEX: number;
  callWall: number;
  putWall: number;
  zeroGamma: number;
  maxGamma: number;
  gammaFlip: number;
  hvl: number;
  regime: 'positive' | 'negative';
}

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META'];

export default function GEXPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [expiration, setExpiration] = useState<number | null>(null);
  const [expirations, setExpirations] = useState<number[]>([]);
  const [gexData, setGexData] = useState<GEXLevel[]>([]);
  const [summary, setSummary] = useState<GEXSummary | null>(null);
  const [spotPrice, setSpotPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch expirations
  const fetchExpirations = useCallback(async () => {
    try {
      const res = await fetch(`/api/yahoo/options?symbol=${symbol}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setExpirations(data.expirations || []);
      if (data.expirations?.length > 0 && !expiration) {
        setExpiration(data.expirations[0]);
      }
    } catch (err) {
      console.error('Failed to fetch expirations:', err);
    }
  }, [symbol, expiration]);

  // Fetch options and calculate GEX
  const fetchGEX = useCallback(async () => {
    if (!expiration) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/yahoo/options?symbol=${symbol}&expiration=${expiration}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const calls = data.calls || [];
      const puts = data.puts || [];
      const underlyingPrice = data.underlyingPrice || 0;

      setSpotPrice(underlyingPrice);

      // Calculate GEX for each strike
      const strikeMap = new Map<number, GEXLevel>();

      // Process calls
      calls.forEach((c: { strike: number; openInterest: number; volume: number; gamma: number }) => {
        const strike = c.strike;
        const existing = strikeMap.get(strike) || {
          strike,
          callGEX: 0,
          putGEX: 0,
          netGEX: 0,
          callOI: 0,
          putOI: 0,
          callVolume: 0,
          putVolume: 0,
        };

        // GEX = Gamma × OI × 100 × Spot²
        const gamma = c.gamma || 0;
        const oi = c.openInterest || 0;
        const gex = gamma * oi * 100 * underlyingPrice * underlyingPrice / 1e9;

        existing.callGEX = gex;
        existing.callOI = oi;
        existing.callVolume = c.volume || 0;
        strikeMap.set(strike, existing);
      });

      // Process puts
      puts.forEach((p: { strike: number; openInterest: number; volume: number; gamma: number }) => {
        const strike = p.strike;
        const existing = strikeMap.get(strike) || {
          strike,
          callGEX: 0,
          putGEX: 0,
          netGEX: 0,
          callOI: 0,
          putOI: 0,
          callVolume: 0,
          putVolume: 0,
        };

        // Put GEX is negative (dealers are short puts)
        const gamma = p.gamma || 0;
        const oi = p.openInterest || 0;
        const gex = -gamma * oi * 100 * underlyingPrice * underlyingPrice / 1e9;

        existing.putGEX = gex;
        existing.putOI = oi;
        existing.putVolume = p.volume || 0;
        existing.netGEX = existing.callGEX + gex;
        strikeMap.set(strike, existing);
      });

      // Convert to array and sort by strike
      const gexLevels = Array.from(strikeMap.values())
        .filter(l => l.callOI > 0 || l.putOI > 0)
        .sort((a, b) => a.strike - b.strike);

      setGexData(gexLevels);

      // Calculate summary
      let totalCallGEX = 0;
      let totalPutGEX = 0;
      let maxCallGEX = 0;
      let maxCallGEXStrike = 0;
      let maxPutGEX = 0;
      let maxPutGEXStrike = 0;

      gexLevels.forEach(l => {
        totalCallGEX += l.callGEX;
        totalPutGEX += l.putGEX;

        if (l.callGEX > maxCallGEX) {
          maxCallGEX = l.callGEX;
          maxCallGEXStrike = l.strike;
        }
        if (Math.abs(l.putGEX) > Math.abs(maxPutGEX)) {
          maxPutGEX = l.putGEX;
          maxPutGEXStrike = l.strike;
        }
      });

      // Find zero gamma level (where cumulative GEX crosses zero)
      let cumulativeGEX = 0;
      let zeroGammaLevel = underlyingPrice;

      for (let i = 0; i < gexLevels.length; i++) {
        const prevCum = cumulativeGEX;
        cumulativeGEX += gexLevels[i].netGEX;

        if (prevCum < 0 && cumulativeGEX >= 0) {
          zeroGammaLevel = gexLevels[i].strike;
          break;
        }
        if (prevCum >= 0 && cumulativeGEX < 0) {
          zeroGammaLevel = gexLevels[i].strike;
          break;
        }
      }

      const netGEX = totalCallGEX + totalPutGEX;
      const regime = underlyingPrice >= zeroGammaLevel ? 'positive' : 'negative';

      setSummary({
        netGEX,
        totalCallGEX,
        totalPutGEX,
        callWall: maxCallGEXStrike,
        putWall: maxPutGEXStrike,
        zeroGamma: zeroGammaLevel,
        maxGamma: maxCallGEXStrike,
        gammaFlip: zeroGammaLevel,
        hvl: zeroGammaLevel,
        regime,
      });

      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GEX data');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, expiration]);

  // Initial fetch
  useEffect(() => {
    fetchExpirations();
  }, [fetchExpirations]);

  useEffect(() => {
    if (expiration) {
      fetchGEX();
    }
  }, [expiration, fetchGEX]);

  // Auto refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (expiration) fetchGEX();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [expiration, fetchGEX]);

  const formatExpDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatGEX = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (absValue >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(2);
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">Gamma Exposure (GEX)</h1>

          {/* Symbol selector */}
          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            {SYMBOLS.slice(0, 5).map(s => (
              <button
                key={s}
                onClick={() => {
                  setSymbol(s);
                  setExpiration(null);
                  setGexData([]);
                  setSummary(null);
                }}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  symbol === s
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setExpiration(null);
                setGexData([]);
                setSummary(null);
              }}
              className="bg-transparent text-zinc-400 text-sm px-2 py-1 border-none focus:outline-none"
            >
              {SYMBOLS.slice(5).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-xs text-zinc-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchGEX}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Expiration selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <span className="text-xs text-zinc-500 whitespace-nowrap">Expiration:</span>
        {expirations.slice(0, 10).map(exp => (
          <button
            key={exp}
            onClick={() => setExpiration(exp)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
              expiration === exp
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            {formatExpDate(exp)}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Regime */}
          <div className={`rounded-xl p-4 border ${
            summary.regime === 'positive'
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Gamma Regime</p>
            <p className={`text-lg font-bold mt-1 ${
              summary.regime === 'positive' ? 'text-green-400' : 'text-red-400'
            }`}>
              {summary.regime === 'positive' ? '🟢 Positive' : '🔴 Negative'}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {summary.regime === 'positive' ? 'Low volatility expected' : 'High volatility expected'}
            </p>
          </div>

          {/* Net GEX */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Net GEX</p>
            <p className={`text-xl font-mono font-bold mt-1 ${
              summary.netGEX >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatGEX(summary.netGEX)}
            </p>
          </div>

          {/* Zero Gamma / Gamma Flip */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Zero Gamma (HVL)</p>
            <p className="text-xl font-mono font-bold text-yellow-400 mt-1">
              ${summary.zeroGamma.toFixed(2)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">
              {spotPrice >= summary.zeroGamma ? '↑ Above' : '↓ Below'}
            </p>
          </div>

          {/* Spot Price */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Spot Price</p>
            <p className="text-xl font-mono font-bold text-blue-400 mt-1">
              ${spotPrice.toFixed(2)}
            </p>
          </div>

          {/* Call Wall */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Call Wall</p>
            <p className="text-xl font-mono font-bold text-green-400 mt-1">
              ${summary.callWall.toFixed(0)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Max Call GEX</p>
          </div>

          {/* Put Wall */}
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Put Wall</p>
            <p className="text-xl font-mono font-bold text-red-400 mt-1">
              ${summary.putWall.toFixed(0)}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">Max Put GEX</p>
          </div>
        </div>
      )}

      {/* GEX Chart */}
      <div className="flex-1 bg-zinc-900/30 rounded-xl border border-zinc-800 min-h-[400px]">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400">Calculating GEX...</span>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchGEX}
                className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700"
              >
                Retry
              </button>
            </div>
          </div>
        ) : gexData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-zinc-500">Select an expiration to view GEX data</p>
          </div>
        ) : (
          <GEXDashboard
            symbol={symbol}
            spotPrice={spotPrice}
            gexData={gexData}
            summary={summary}
            height={Math.max(400, gexData.length * 8)}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>Call GEX (Positive)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span>Put GEX (Negative)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-yellow-400" />
          <span>Zero Gamma Level</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-1 bg-blue-400" />
          <span>Spot Price</span>
        </div>
      </div>
    </div>
  );
}
