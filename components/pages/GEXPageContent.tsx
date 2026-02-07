'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  generateSimulatedGEX,
  generateSimulatedExpirations,
  type SimulatedGEXLevel,
  type SimulatedGEXSummary,
} from '@/lib/simulation/GEXSimulator';
import { GammaIcon, SimulationIcon, LiveIcon, RefreshIcon } from '@/components/ui/Icons';

const GEXDashboard = dynamic(
  () => import('@/components/charts/GEXDashboard'),
  { ssr: false }
);

const GEXHeatmap = dynamic(
  () => import('@/components/charts/GEXHeatmap'),
  { ssr: false }
);

type ViewMode = 'bars' | 'heatmap2D' | 'heatmap3D';
type DataType = 'netGEX' | 'netIV';

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

export default function GEXPageContent() {
  const [symbol, setSymbol] = useState('SPY');
  const [expiration, setExpiration] = useState<number | null>(null);
  const [expirations, setExpirations] = useState<number[]>([]);
  const [gexData, setGexData] = useState<GEXLevel[]>([]);
  const [summary, setSummary] = useState<GEXSummary | null>(null);
  const [spotPrice, setSpotPrice] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isSimulation, setIsSimulation] = useState(true); // Default to simulation

  // View and zoom controls
  const [viewMode, setViewMode] = useState<ViewMode>('bars');
  const [dataType, setDataType] = useState<DataType>('netGEX');
  const [priceZoom, setPriceZoom] = useState({ min: 0, max: 100 }); // Percentage of price range
  const [zoomCenter, setZoomCenter] = useState<number | null>(null); // Center around spot price

  // Load simulated data
  const loadSimulatedData = useCallback(() => {
    setIsLoading(true);
    setError(null);

    // Simulate network delay
    setTimeout(() => {
      // Generate fake expirations
      const fakeExpirations = generateSimulatedExpirations();
      setExpirations(fakeExpirations);

      if (!expiration) {
        setExpiration(fakeExpirations[0]);
      }

      // Calculate days to expiration
      const expDate = expiration || fakeExpirations[0];
      const daysToExp = Math.max(1, Math.ceil((expDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)));

      // Generate simulated GEX data
      const { gexData: simData, summary: simSummary, spotPrice: simSpot } = generateSimulatedGEX(symbol, daysToExp);

      setGexData(simData);
      setSummary(simSummary);
      setSpotPrice(simSpot);
      setLastUpdate(new Date());
      setIsLoading(false);
    }, 500);
  }, [symbol, expiration]);

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

        // GEX = Gamma x OI x 100 x Spot^2
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
    if (isSimulation) {
      loadSimulatedData();
    } else {
      fetchExpirations();
    }
  }, [fetchExpirations, loadSimulatedData, isSimulation]);

  useEffect(() => {
    if (expiration && !isSimulation) {
      fetchGEX();
    } else if (expiration && isSimulation) {
      loadSimulatedData();
    }
  }, [expiration, fetchGEX, loadSimulatedData, isSimulation]);

  // Auto refresh every 5 minutes (or 30s for simulation)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isSimulation) {
        loadSimulatedData();
      } else if (expiration) {
        fetchGEX();
      }
    }, isSimulation ? 30 * 1000 : 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [expiration, fetchGEX, loadSimulatedData, isSimulation]);

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

  // Calculate zoomed GEX data
  const getZoomedGexData = useCallback(() => {
    if (gexData.length === 0) return gexData;

    const strikes = gexData.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const range = maxStrike - minStrike;

    // Calculate zoom bounds based on percentage or spot price centering
    let zoomMin = minStrike + (range * priceZoom.min) / 100;
    let zoomMax = minStrike + (range * priceZoom.max) / 100;

    // If we have a zoom center (spot price), adjust the view
    if (zoomCenter !== null && priceZoom.max - priceZoom.min < 100) {
      const zoomRange = (range * (priceZoom.max - priceZoom.min)) / 100;
      zoomMin = zoomCenter - zoomRange / 2;
      zoomMax = zoomCenter + zoomRange / 2;
    }

    return gexData.filter(d => d.strike >= zoomMin && d.strike <= zoomMax);
  }, [gexData, priceZoom, zoomCenter]);

  // Zoom presets
  const setZoomPreset = (preset: 'full' | 'atm' | 'tight' | 'custom') => {
    switch (preset) {
      case 'full':
        setPriceZoom({ min: 0, max: 100 });
        setZoomCenter(null);
        break;
      case 'atm':
        setPriceZoom({ min: 35, max: 65 });
        setZoomCenter(spotPrice);
        break;
      case 'tight':
        setPriceZoom({ min: 45, max: 55 });
        setZoomCenter(spotPrice);
        break;
    }
  };

  const zoomedGexData = getZoomedGexData();

  return (
    <div className="h-full flex flex-col bg-[var(--background)] p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center">
              <GammaIcon size={22} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Gamma Exposure</h1>
              <p className="text-xs text-[var(--text-muted)]">Options Market Analysis</p>
            </div>
          </div>

          {/* Symbol selector */}
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
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
                    ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
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
              className="bg-transparent text-[var(--text-muted)] text-sm px-2 py-1 border-none focus:outline-none"
            >
              {SYMBOLS.slice(5).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Simulation Toggle */}
          <button
            onClick={() => {
              setIsSimulation(!isSimulation);
              setGexData([]);
              setSummary(null);
              setExpiration(null);
            }}
            className={`px-3 py-1 text-sm rounded-lg border transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95 ${
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
                <span>Live Data</span>
              </>
            )}
          </button>

          {lastUpdate && (
            <span className="text-xs text-[var(--text-muted)]">
              Updated: {lastUpdate.toLocaleTimeString()}
              {isSimulation && ' (Simulated)'}
            </span>
          )}
          <button
            onClick={() => isSimulation ? loadSimulatedData() : fetchGEX()}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] rounded-lg border border-[var(--border-light)] transition-all duration-200 disabled:opacity-50 flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            <RefreshIcon size={14} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Expiration selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">Exp:</span>
          {expirations.slice(0, 8).map(exp => (
            <button
              key={exp}
              onClick={() => setExpiration(exp)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                expiration === exp
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                  : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {formatExpDate(exp)}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-[var(--border)]" />

        {/* View Mode Selector */}
        <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
          {(['bars', 'heatmap2D', 'heatmap3D'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs rounded relative overflow-hidden
                transition-all duration-300 ease-out transform
                ${viewMode === mode
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)] shadow-lg shadow-[var(--primary-glow)] scale-105'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] active:scale-95'
                }`}
            >
              <span className="relative z-10">
                {mode === 'bars' ? 'Bars' : mode === 'heatmap2D' ? '2D Heatmap' : '3D Surface'}
              </span>
              {viewMode === mode && (
                <span className="absolute inset-0 bg-[var(--primary-glow)] animate-pulse opacity-30" />
              )}
            </button>
          ))}
        </div>

        {/* Data Type Selector (for heatmaps) */}
        {viewMode !== 'bars' && (
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
            <button
              onClick={() => setDataType('netGEX')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                dataType === 'netGEX' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Net GEX
            </button>
            <button
              onClick={() => setDataType('netIV')}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                dataType === 'netIV' ? 'bg-[var(--accent)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Net IV
            </button>
          </div>
        )}

        <div className="h-6 w-px bg-[var(--border)]" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Zoom:</span>
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
            <button
              onClick={() => setZoomPreset('full')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                priceZoom.min === 0 && priceZoom.max === 100 ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Full
            </button>
            <button
              onClick={() => setZoomPreset('atm')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                priceZoom.min === 35 && priceZoom.max === 65 ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              ATM ±15%
            </button>
            <button
              onClick={() => setZoomPreset('tight')}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                priceZoom.min === 45 && priceZoom.max === 55 ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Tight ±5%
            </button>
          </div>

          {/* Custom Zoom Slider */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="50"
              value={priceZoom.min}
              onChange={(e) => setPriceZoom(prev => ({ ...prev, min: Number(e.target.value) }))}
              className="w-16 h-1 accent-[var(--primary)]"
            />
            <span className="text-xs text-[var(--text-muted)] w-20 text-center">
              {(100 - priceZoom.max + priceZoom.min).toFixed(0)}% range
            </span>
            <input
              type="range"
              min="50"
              max="100"
              value={priceZoom.max}
              onChange={(e) => setPriceZoom(prev => ({ ...prev, max: Number(e.target.value) }))}
              className="w-16 h-1 accent-[var(--primary)]"
            />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 animate-fadeIn">
          {/* Regime */}
          <div className={`rounded-xl p-4 border backdrop-blur-sm relative overflow-hidden
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg cursor-default
            ${summary.regime === 'positive'
              ? 'bg-gradient-to-br from-green-500/20 to-green-900/10 border-green-500/30 hover:shadow-green-500/20'
              : 'bg-gradient-to-br from-red-500/20 to-red-900/10 border-red-500/30 hover:shadow-red-500/20'
          }`}>
            <div className={`absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-30 ${
              summary.regime === 'positive' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Gamma Regime</p>
            <p className={`text-lg font-bold mt-1 flex items-center gap-2 ${
              summary.regime === 'positive' ? 'text-green-400' : 'text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full animate-pulse ${
                summary.regime === 'positive' ? 'bg-green-400' : 'bg-red-400'
              }`} />
              {summary.regime === 'positive' ? 'Positive' : 'Negative'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {summary.regime === 'positive' ? 'Low volatility expected' : 'High volatility expected'}
            </p>
          </div>

          {/* Net GEX */}
          <div className="bg-gradient-to-br from-[var(--surface-elevated)] to-[var(--surface)] rounded-xl p-4 border border-[var(--border-light)] backdrop-blur-sm
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:border-[var(--border-focus)] cursor-default">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Net GEX</p>
            <p className={`text-xl font-mono font-bold mt-1 ${
              summary.netGEX >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatGEX(summary.netGEX)}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {summary.netGEX >= 0 ? 'Dealers long gamma' : 'Dealers short gamma'}
            </p>
          </div>

          {/* Zero Gamma / Gamma Flip */}
          <div className="bg-gradient-to-br from-yellow-900/15 to-[var(--surface)] rounded-xl p-4 border border-yellow-500/15 backdrop-blur-sm relative overflow-hidden
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-yellow-500/10 cursor-default">
            <div className="absolute top-0 right-0 w-12 h-12 rounded-full blur-2xl opacity-20 bg-yellow-500" />
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Zero Gamma (HVL)</p>
            <p className="text-xl font-mono font-bold text-yellow-400/80 mt-1">
              ${summary.zeroGamma.toFixed(2)}
            </p>
            <p className={`text-[10px] mt-1 ${spotPrice >= summary.zeroGamma ? 'text-green-400' : 'text-red-400'}`}>
              {spotPrice >= summary.zeroGamma ? '^ Above - Bullish' : 'v Below - Bearish'}
            </p>
          </div>

          {/* Spot Price */}
          <div className="bg-gradient-to-br from-blue-900/15 to-[var(--surface)] rounded-xl p-4 border border-blue-500/15 backdrop-blur-sm relative overflow-hidden
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-blue-500/10 cursor-default">
            <div className="absolute top-0 right-0 w-12 h-12 rounded-full blur-2xl opacity-20 bg-blue-500" />
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Spot Price</p>
            <p className="text-xl font-mono font-bold text-blue-400/80 mt-1">
              ${spotPrice.toFixed(2)}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{symbol}</p>
          </div>

          {/* Call Wall */}
          <div className="bg-gradient-to-br from-[var(--primary-glow)] to-[var(--surface)] rounded-xl p-4 border border-emerald-500/15 backdrop-blur-sm
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-[var(--primary-glow)] cursor-default">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Call Wall</p>
            <p className="text-xl font-mono font-bold text-[var(--primary-light)] mt-1">
              ${summary.callWall.toFixed(0)}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {((summary.callWall - spotPrice) / spotPrice * 100).toFixed(1)}% away
            </p>
          </div>

          {/* Put Wall */}
          <div className="bg-gradient-to-br from-rose-900/15 to-[var(--surface)] rounded-xl p-4 border border-rose-500/15 backdrop-blur-sm
            transition-all duration-300 ease-out transform hover:scale-102 hover:shadow-lg hover:shadow-rose-500/10 cursor-default">
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">Put Wall</p>
            <p className="text-xl font-mono font-bold text-rose-400/80 mt-1">
              ${summary.putWall.toFixed(0)}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              {((spotPrice - summary.putWall) / spotPrice * 100).toFixed(1)}% away
            </p>
          </div>
        </div>
      )}

      {/* GEX Chart */}
      <div className="flex-1 bg-[var(--surface)] rounded-xl border border-[var(--border)] min-h-[400px] overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--text-muted)]">Calculating GEX...</span>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchGEX}
                className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : gexData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-[var(--text-muted)]">Select an expiration to view GEX data</p>
          </div>
        ) : viewMode === 'bars' ? (
          <div className="flex-1 min-h-0">
            <GEXDashboard
              symbol={symbol}
              spotPrice={spotPrice}
              gexData={zoomedGexData}
              summary={summary}
              height="auto"
            />
          </div>
        ) : (
          <GEXHeatmap
            gexData={zoomedGexData}
            spotPrice={spotPrice}
            symbol={symbol}
            mode={viewMode === 'heatmap2D' ? '2D' : '3D'}
            dataType={dataType}
            height={500}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs text-[var(--text-muted)] bg-[var(--surface)] rounded-xl py-3 px-4 border border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-emerald-400 rounded shadow-sm shadow-green-500/50" />
          <span>Call GEX (Positive)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gradient-to-r from-red-500 to-rose-400 rounded shadow-sm shadow-red-500/50" />
          <span>Put GEX (Negative)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-gradient-to-r from-yellow-400 to-amber-400 rounded-full" />
          <span>Zero Gamma Level</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full" />
          <span>Spot Price</span>
        </div>
        {isSimulation && (
          <>
            <span className="text-[var(--border-light)]">|</span>
            <span className="text-[var(--primary-light)]">Data simulated for demo</span>
          </>
        )}
      </div>
    </div>
  );
}
