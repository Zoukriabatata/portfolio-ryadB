'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePageActive } from '@/hooks/usePageActive';
import {
  generateSimulatedGEX,
  generateSimulatedExpirations,
  generateSimulatedMultiGreek,
} from '@/lib/simulation/GEXSimulator';
import { GEXHistoryBuffer } from '@/lib/calculations/gexHistory';
import { GEXKPIGrid } from '@/components/widgets/GEXKPIGrid';
import { GEXIntensityGauge } from '@/components/widgets/GEXIntensityGauge';
import { GEXNarrativePanel } from '@/components/widgets/GEXNarrativePanel';
import type { MultiGreekData, MultiGreekSummary, GreekType } from '@/types/options';
import { GREEK_META } from '@/types/options';
import { GammaIcon, SimulationIcon, RefreshIcon } from '@/components/ui/Icons';

const GEXDashboard = dynamic(
  () => import('@/components/charts/GEXDashboard'),
  { ssr: false }
);

const GEXHeatmap = dynamic(
  () => import('@/components/charts/GEXHeatmap'),
  { ssr: false }
);

const CumulativeGEXChart = dynamic(
  () => import('@/components/charts/CumulativeGEXChart'),
  { ssr: false }
);

type ViewMode = 'bars' | 'cumulative' | 'heatmap2D' | 'heatmap3D';

// Legacy interface for backward compat with existing chart components
interface LegacyGEXLevel {
  strike: number;
  callGEX: number;
  putGEX: number;
  netGEX: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

interface LegacyGEXSummary {
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isSimulation, setIsSimulation] = useState(true);

  // View controls
  const [viewMode, setViewMode] = useState<ViewMode>('bars');
  const [selectedGreek, setSelectedGreek] = useState<GreekType>('gex');
  const [priceZoom, setPriceZoom] = useState({ min: 0, max: 100 });
  const [zoomCenter, setZoomCenter] = useState<number | null>(null);

  // Multi-Greek data (new)
  const [multiGreekData, setMultiGreekData] = useState<MultiGreekData[]>([]);
  const [multiGreekSummary, setMultiGreekSummary] = useState<MultiGreekSummary | null>(null);
  const [spotPrice, setSpotPrice] = useState(0);
  const [totalCallOI, setTotalCallOI] = useState(0);
  const [totalPutOI, setTotalPutOI] = useState(0);
  const historyRef = useRef<GEXHistoryBuffer>(new GEXHistoryBuffer());

  // Legacy data (for existing chart components)
  const [legacyGexData, setLegacyGexData] = useState<LegacyGEXLevel[]>([]);
  const [legacySummary, setLegacySummary] = useState<LegacyGEXSummary | null>(null);

  // Convert MultiGreekData to legacy format based on selected Greek
  const adaptedLegacyData = useMemo((): LegacyGEXLevel[] => {
    if (selectedGreek === 'gex' && legacyGexData.length > 0) {
      return legacyGexData; // Use native legacy data for GEX
    }

    // Adapt multi-Greek data to legacy format for other Greeks
    return multiGreekData.map(d => {
      const value = d[selectedGreek];
      const callPortion = value > 0 ? value : 0;
      const putPortion = value < 0 ? value : 0;

      return {
        strike: d.strike,
        callGEX: callPortion,
        putGEX: putPortion,
        netGEX: value,
        callOI: d.callOI,
        putOI: d.putOI,
        callVolume: 0,
        putVolume: 0,
      };
    });
  }, [multiGreekData, legacyGexData, selectedGreek]);

  const adaptedLegacySummary = useMemo((): LegacyGEXSummary | null => {
    if (selectedGreek === 'gex' && legacySummary) return legacySummary;
    if (!multiGreekSummary) return null;

    const netVal = multiGreekSummary[`net${selectedGreek.toUpperCase()}` as keyof MultiGreekSummary] as number;

    return {
      netGEX: netVal,
      totalCallGEX: netVal > 0 ? netVal : 0,
      totalPutGEX: netVal < 0 ? netVal : 0,
      callWall: multiGreekSummary.callWall,
      putWall: multiGreekSummary.putWall,
      zeroGamma: multiGreekSummary.zeroGammaLevel,
      maxGamma: multiGreekSummary.callWall,
      gammaFlip: multiGreekSummary.zeroGammaLevel,
      hvl: multiGreekSummary.zeroGammaLevel,
      regime: multiGreekSummary.regime,
    };
  }, [multiGreekSummary, legacySummary, selectedGreek]);

  // ─── Data Loading ───

  const loadSimulatedData = useCallback(() => {
    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      // Generate expirations
      const fakeExpirations = generateSimulatedExpirations();
      setExpirations(fakeExpirations);
      if (!expiration) setExpiration(fakeExpirations[0]);

      // Legacy GEX (for bars chart)
      const expDate = expiration || fakeExpirations[0];
      const daysToExp = Math.max(1, Math.ceil((expDate * 1000 - Date.now()) / (1000 * 60 * 60 * 24)));
      const { gexData: simData, summary: simSummary, spotPrice: simSpot } = generateSimulatedGEX(symbol, daysToExp);
      setLegacyGexData(simData);
      setLegacySummary(simSummary);
      setSpotPrice(simSpot);

      // Multi-Greek data (new)
      const multiResult = generateSimulatedMultiGreek(symbol, 5);
      setMultiGreekData(multiResult.data);
      setMultiGreekSummary(multiResult.summary);
      setSpotPrice(multiResult.spotPrice); // Override with multi-Greek spot
      setTotalCallOI(multiResult.totalCallOI);
      setTotalPutOI(multiResult.totalPutOI);
      historyRef.current = multiResult.history;

      setLastUpdate(new Date());
      setIsLoading(false);
    }, 300);
  }, [symbol, expiration]);

  // Initial load
  useEffect(() => {
    loadSimulatedData();
  }, [loadSimulatedData]);

  useEffect(() => {
    if (expiration) loadSimulatedData();
  }, [expiration, loadSimulatedData]);

  // Auto refresh (30s) — only when page is active
  const isActive = usePageActive();
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => loadSimulatedData(), 30_000);
    return () => clearInterval(interval);
  }, [isActive, loadSimulatedData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const greeks: GreekType[] = ['gex', 'vex', 'cex', 'dex'];
      if (e.key >= '1' && e.key <= '4') {
        setSelectedGreek(greeks[parseInt(e.key) - 1]);
      } else if (e.key === 'r' || e.key === 'R') {
        loadSimulatedData();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [loadSimulatedData]);

  // ─── Zoom ───

  const getZoomedData = useCallback(() => {
    const data = adaptedLegacyData;
    if (data.length === 0) return data;
    const strikes = data.map(d => d.strike);
    const minStrike = Math.min(...strikes);
    const maxStrike = Math.max(...strikes);
    const range = maxStrike - minStrike;
    let zoomMin = minStrike + (range * priceZoom.min) / 100;
    let zoomMax = minStrike + (range * priceZoom.max) / 100;
    if (zoomCenter !== null && priceZoom.max - priceZoom.min < 100) {
      const zoomRange = (range * (priceZoom.max - priceZoom.min)) / 100;
      zoomMin = zoomCenter - zoomRange / 2;
      zoomMax = zoomCenter + zoomRange / 2;
    }
    return data.filter(d => d.strike >= zoomMin && d.strike <= zoomMax);
  }, [adaptedLegacyData, priceZoom, zoomCenter]);

  const zoomedGexData = getZoomedData();

  const formatExpDate = (ts: number) => {
    return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const setZoomPreset = (preset: 'full' | 'atm' | 'tight') => {
    switch (preset) {
      case 'full': setPriceZoom({ min: 0, max: 100 }); setZoomCenter(null); break;
      case 'atm': setPriceZoom({ min: 35, max: 65 }); setZoomCenter(spotPrice); break;
      case 'tight': setPriceZoom({ min: 45, max: 55 }); setZoomCenter(spotPrice); break;
    }
  };

  const greekMeta = GREEK_META[selectedGreek];

  return (
    <div className="h-full flex flex-col bg-[var(--background)] p-4 gap-3 overflow-auto">
      {/* ─── Disclaimer ─── */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 animate-fadeIn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z"/></svg>
        <span>Simulated data for educational purposes only. Not financial advice. Do not use for real trading decisions.</span>
      </div>

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-slideUp stagger-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center">
              <GammaIcon size={22} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">
                {greekMeta.fullName}
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                {greekMeta.description}
              </p>
            </div>
          </div>

          {/* Symbol selector */}
          <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-1 border border-[var(--border)]">
            {SYMBOLS.slice(0, 5).map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); setExpiration(null); setLegacyGexData([]); setLegacySummary(null); setMultiGreekData([]); setMultiGreekSummary(null); }}
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
              onChange={(e) => { setSymbol(e.target.value); setExpiration(null); setLegacyGexData([]); setLegacySummary(null); }}
              className="bg-transparent text-[var(--text-muted)] text-sm px-2 py-1 border-none focus:outline-none"
            >
              {SYMBOLS.slice(5).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Greek Selector - Pill toggle */}
          <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
            {(['gex', 'vex', 'cex', 'dex'] as GreekType[]).map((g, i) => {
              const meta = GREEK_META[g];
              return (
                <button
                  key={g}
                  onClick={() => setSelectedGreek(g)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-all duration-200 ${
                    selectedGreek === g
                      ? 'text-white shadow-lg scale-105'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                  style={selectedGreek === g ? {
                    backgroundColor: meta.color,
                    boxShadow: `0 0 12px ${meta.color}40`,
                  } : undefined}
                  title={`${meta.fullName} (${i + 1})`}
                >
                  <span className="mr-1 opacity-70">{meta.symbol}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* SIM badge */}
          <div className="px-3 py-1 text-sm rounded-lg border flex items-center gap-2 bg-[var(--accent)] text-[var(--text-primary)] border-[var(--accent-dark)]">
            <SimulationIcon size={16} color="#fff" /><span>SIM</span>
          </div>

          {lastUpdate && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}

          <button
            onClick={() => loadSimulatedData()}
            disabled={isLoading}
            className="p-1.5 bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] rounded-lg border border-[var(--border-light)] transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95"
          >
            <RefreshIcon size={14} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── KPI Grid ─── */}
      {multiGreekSummary && (
        <div className="animate-slideUp stagger-2">
          <GEXKPIGrid
            summary={multiGreekSummary}
            spotPrice={spotPrice}
            history={historyRef.current}
            totalCallOI={totalCallOI}
            totalPutOI={totalPutOI}
          />
        </div>
      )}

      {/* ─── Controls Row ─── */}
      <div className="flex flex-wrap items-center gap-3 animate-slideUp stagger-3">
        {/* Expiration selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">EXP</span>
          {expirations.slice(0, 6).map(exp => (
            <button
              key={exp}
              onClick={() => setExpiration(exp)}
              className={`px-2.5 py-1 text-[10px] rounded-lg whitespace-nowrap transition-colors ${
                expiration === exp
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                  : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {formatExpDate(exp)}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-[var(--border)]" />

        {/* View Mode Selector */}
        <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
          {(['bars', 'cumulative', 'heatmap2D', 'heatmap3D'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 text-[10px] rounded relative overflow-hidden transition-all duration-300 ${
                viewMode === mode
                  ? 'bg-[var(--primary-dark)] text-[var(--text-primary)] shadow-lg shadow-[var(--primary-glow)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {mode === 'bars' ? 'Bars' : mode === 'cumulative' ? 'Cumulative' : mode === 'heatmap2D' ? '2D Heat' : '3D Surface'}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-[var(--border)]" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">ZOOM</span>
          <div className="flex items-center gap-0.5 bg-[var(--surface)] rounded-lg p-0.5 border border-[var(--border)]">
            {(['full', 'atm', 'tight'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => setZoomPreset(preset)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  (preset === 'full' && priceZoom.min === 0 && priceZoom.max === 100) ||
                  (preset === 'atm' && priceZoom.min === 35) ||
                  (preset === 'tight' && priceZoom.min === 45)
                    ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {preset === 'full' ? 'Full' : preset === 'atm' ? 'ATM' : 'Tight'}
              </button>
            ))}
          </div>
        </div>

        {/* Spot price badge */}
        {spotPrice > 0 && (
          <>
            <div className="h-5 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[10px] font-mono text-blue-400 font-medium">
                {symbol} ${spotPrice.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ─── Chart Area ─── */}
      <div className="flex-1 bg-[var(--surface)] rounded-xl border border-[var(--border)] min-h-[350px] overflow-hidden flex flex-col animate-scaleIn stagger-4">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--text-muted)]">Calculating {greekMeta.fullName}...</span>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={loadSimulatedData}
                className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : adaptedLegacyData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-[var(--text-muted)]">Select an expiration to view data</p>
          </div>
        ) : viewMode === 'bars' ? (
          <div className="flex-1 min-h-0">
            <GEXDashboard
              symbol={`${symbol} ${greekMeta.label}`}
              spotPrice={spotPrice}
              gexData={zoomedGexData}
              summary={adaptedLegacySummary}
              height="auto"
            />
          </div>
        ) : viewMode === 'cumulative' ? (
          <div className="flex-1 min-h-0">
            <CumulativeGEXChart
              data={multiGreekData}
              spotPrice={spotPrice}
              symbol={symbol}
              selectedGreek={selectedGreek}
              zeroGammaLevel={multiGreekSummary?.zeroGammaLevel || spotPrice}
              callWall={multiGreekSummary?.callWall || spotPrice}
              putWall={multiGreekSummary?.putWall || spotPrice}
              height="auto"
            />
          </div>
        ) : (
          <GEXHeatmap
            gexData={zoomedGexData}
            spotPrice={spotPrice}
            symbol={`${symbol} ${greekMeta.label}`}
            mode={viewMode === 'heatmap2D' ? '2D' : '3D'}
            dataType="netGEX"
            height={500}
          />
        )}
      </div>

      {/* ─── Intelligence Panel: Gauge + Narrative ─── */}
      {multiGreekSummary && (
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 animate-slideUp stagger-5">
          {/* Intensity Gauge */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-3 flex items-center justify-center">
            <GEXIntensityGauge
              value={multiGreekSummary.netGEX}
              intensity={multiGreekSummary.gammaIntensity}
              regime={multiGreekSummary.regime}
              size={140}
            />
          </div>

          {/* Narrative */}
          <GEXNarrativePanel
            summary={multiGreekSummary}
            spotPrice={spotPrice}
          />
        </div>
      )}

      {/* ─── Legend ─── */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-[var(--text-muted)] bg-[var(--surface)] rounded-xl py-2 px-4 border border-[var(--border)] animate-fadeIn stagger-6">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-gradient-to-r from-green-500 to-emerald-400 rounded shadow-sm shadow-green-500/50" />
          <span>Positive {greekMeta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-gradient-to-r from-red-500 to-rose-400 rounded shadow-sm shadow-red-500/50" />
          <span>Negative {greekMeta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-gradient-to-r from-yellow-400 to-amber-400 rounded-full" />
          <span>Zero Gamma</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-gradient-to-r from-blue-400 to-blue-300 rounded-full" />
          <span>Spot</span>
        </div>
        <span className="text-[var(--border-light)]">|</span>
        <span className="text-[var(--text-muted)] opacity-60">
          Shortcuts: 1-4 switch Greek, R refresh
        </span>
        {isSimulation && (
          <>
            <span className="text-[var(--border-light)]">|</span>
            <span className="text-[var(--primary-light)]">Simulated</span>
          </>
        )}
      </div>
    </div>
  );
}
