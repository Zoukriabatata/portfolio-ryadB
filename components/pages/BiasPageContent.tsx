'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { generateSimulatedMultiGreek } from '@/lib/simulation/GEXSimulator';
import { generateVolatilitySkew } from '@/lib/simulation/VolatilitySimulator';
import {
  calculateInstitutionalBias,
  type FuturesContract,
  type BiasResult,
  type SkewAnalysis,
} from '@/lib/analysis/institutionalBias';
import { BiasGauge } from '@/components/widgets/BiasGauge';
import { ZoneMapChart } from '@/components/charts/ZoneMapChart';
import { TradePlanPanel } from '@/components/widgets/TradePlanPanel';

// ─── Contract config ────────────────────────────────────────

const CONTRACTS: { id: FuturesContract; label: string; etf: string }[] = [
  { id: 'MES', label: 'MES', etf: 'SPY' },
  { id: 'ES', label: 'ES', etf: 'SPY' },
  { id: 'MNQ', label: 'MNQ', etf: 'QQQ' },
  { id: 'NQ', label: 'NQ', etf: 'QQQ' },
];

// ─── Component ──────────────────────────────────────────────

export default function BiasPageContent() {
  const [contract, setContract] = useState<FuturesContract>('MES');
  const [refreshKey, setRefreshKey] = useState(0);
  const [realSpotPrice, setRealSpotPrice] = useState<number | undefined>();
  const [priceSource, setPriceSource] = useState<'yahoo-finance' | 'fallback' | null>(null);

  const etfSymbol = CONTRACTS.find(c => c.id === contract)?.etf || 'SPY';

  // Fetch real ETF price
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/market/etf-price?symbol=${etfSymbol}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) {
          setRealSpotPrice(data.price);
          setPriceSource(data.source);
        }
      } catch {
        if (!cancelled) {
          setRealSpotPrice(undefined);
          setPriceSource('fallback');
        }
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [etfSymbol]);

  // Generate data (anchored on real price when available)
  const simResult = useMemo(() => {
    return generateSimulatedMultiGreek(etfSymbol, 5, realSpotPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etfSymbol, refreshKey, realSpotPrice]);

  // Generate volatility skew data for term structure
  const volData = useMemo(() => {
    return generateVolatilitySkew(etfSymbol, 25, 30, realSpotPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etfSymbol, refreshKey, realSpotPrice]);

  // Calculate bias
  const biasResult: BiasResult | null = useMemo(() => {
    if (!simResult) return null;
    return calculateInstitutionalBias(
      simResult.summary,
      simResult.spotPrice,
      contract,
      simResult.data,
      volData?.termStructure,
    );
  }, [simResult, contract, volData]);

  // Auto-refresh (30s) — only when page is active
  const isActive = usePageActive();
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') setRefreshKey(k => k + 1);
      if (e.key === '1') setContract('MES');
      if (e.key === '2') setContract('ES');
      if (e.key === '3') setContract('MNQ');
      if (e.key === '4') setContract('NQ');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  if (!biasResult) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
        Loading bias analysis...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--background)]">
      {/* ─── Disclaimer ─── */}
      <div className={`flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b text-[10px] animate-fadeIn ${
        priceSource === 'yahoo-finance'
          ? 'bg-[var(--success-bg)] border-[var(--success)]/20 text-[var(--success)]'
          : 'bg-[var(--warning-bg)] border-[var(--warning)]/20 text-[var(--warning)]'
      }`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z"/></svg>
        <span>
          {priceSource === 'yahoo-finance'
            ? `Live ${etfSymbol} price anchored. GEX/skew data is simulated. Not financial advice.`
            : 'Simulated data for educational purposes only. Not financial advice. Do not use for real trading decisions.'}
        </span>
      </div>

      {/* ── Header Bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-[var(--border)] animate-slideUp stagger-1"
        style={{ background: 'linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 94%, var(--primary) 6%) 100%)' }}>
        <div className="flex items-center gap-5">
          {/* Contract selector */}
          <div className="flex items-center gap-0.5 bg-[var(--background)] rounded-xl p-1 border border-[var(--border)]">
            {CONTRACTS.map(c => {
              const isActive = contract === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setContract(c.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-250 ${
                    isActive
                      ? 'bg-[var(--primary)] text-white shadow-lg scale-[1.02]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                  style={isActive ? { boxShadow: '0 2px 16px color-mix(in srgb, var(--primary) 40%, transparent 60%)' } : undefined}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Title + Direction badge */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" style={{ color: biasResult.direction === 'long' ? '#22c55e' : biasResult.direction === 'short' ? '#ef4444' : 'var(--text-muted)' }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
              </svg>
              <span className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                GVS Bias
              </span>
            </div>
            <span className="text-[10px] px-3 py-1 rounded-full font-bold tracking-wide flex items-center gap-1.5 border"
              style={{
                backgroundColor: biasResult.direction === 'long' ? '#22c55e12' : biasResult.direction === 'short' ? '#ef444412' : '#6b728012',
                color: biasResult.direction === 'long' ? '#22c55e' : biasResult.direction === 'short' ? '#ef4444' : '#6b7280',
                borderColor: biasResult.direction === 'long' ? '#22c55e25' : biasResult.direction === 'short' ? '#ef444425' : '#6b728025',
                boxShadow: `0 0 16px ${biasResult.direction === 'long' ? '#22c55e10' : biasResult.direction === 'short' ? '#ef444410' : 'transparent'}`,
              }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: biasResult.direction === 'long' ? '#22c55e' : biasResult.direction === 'short' ? '#ef4444' : '#6b7280' }} />
              {biasResult.direction.toUpperCase()} {biasResult.strength}
            </span>
            <span className="text-[10px] text-[var(--text-dimmed)] font-mono px-2 py-0.5 bg-[var(--background)] rounded-md border border-[var(--border)]">
              {etfSymbol} GEX &rarr; {contract}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Spot price */}
          <div className="text-sm font-mono font-bold px-3.5 py-1.5 rounded-xl bg-[var(--background)] border border-[var(--border)]"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
            <span className="text-[var(--text-dimmed)] text-[10px] mr-1">{contract}</span>
            <span className="text-[var(--text-primary)]">{biasResult.esSpot.toFixed(0)}</span>
          </div>

          {/* LIVE / SIM badge */}
          <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border ${
            priceSource === 'yahoo-finance'
              ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20'
              : 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${priceSource === 'yahoo-finance' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
            {priceSource === 'yahoo-finance' ? 'LIVE' : 'SIM'}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl hover:bg-[var(--surface-hover)] transition-all duration-200 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:scale-105 active:scale-95 border border-transparent hover:border-[var(--border)]"
            title="Refresh (R)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0115.87-5.87L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 01-15.87 5.87L3 16" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Top Row: Gauge + Zone Map */}
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3 animate-scaleIn stagger-2">
          {/* Left: Bias Gauge */}
          <div className="space-y-3">
            <BiasGauge
              biasScore={biasResult.biasScore}
              bias={biasResult.bias}
              direction={biasResult.direction}
              strength={biasResult.strength}
            />

            {/* Skew Analysis Panel */}
            {biasResult.skewAnalysis && (
              <SkewPanel skew={biasResult.skewAnalysis} />
            )}

            {/* Key levels grid */}
            <div className="grid grid-cols-2 gap-2">
              <LevelCard
                label="Call Wall"
                value={biasResult.levels.find(l => l.label === 'Call Wall')?.price || 0}
                color="#ef4444"
                spot={biasResult.esSpot}
              />
              <LevelCard
                label="Put Wall"
                value={biasResult.levels.find(l => l.label === 'Put Wall')?.price || 0}
                color="#22c55e"
                spot={biasResult.esSpot}
              />
              <LevelCard
                label="Zero Gamma"
                value={biasResult.levels.find(l => l.label === 'Zero Gamma')?.price || 0}
                color="#eab308"
                spot={biasResult.esSpot}
              />
              <LevelCard
                label="Max Pain"
                value={biasResult.levels.find(l => l.label === 'Max Pain')?.price || 0}
                color="#a78bfa"
                spot={biasResult.esSpot}
              />
              <LevelCard
                label="Range High"
                value={biasResult.rangeHigh}
                color="#06b6d4"
                spot={biasResult.esSpot}
              />
              <LevelCard
                label="Range Low"
                value={biasResult.rangeLow}
                color="#06b6d4"
                spot={biasResult.esSpot}
              />
            </div>
          </div>

          {/* Right: Zone Map */}
          <div className="min-h-[400px]">
            <ZoneMapChart
              levels={biasResult.levels}
              esSpot={biasResult.esSpot}
              rangeHigh={biasResult.rangeHigh}
              rangeLow={biasResult.rangeLow}
            />
          </div>
        </div>

        {/* Bottom: Trade Plan */}
        <div className="animate-slideUp stagger-3">
          <TradePlanPanel
            plan={biasResult.tradePlan}
            bias={biasResult.bias}
            direction={biasResult.direction}
            biasScore={biasResult.biasScore}
          />
        </div>

        {/* Support & Resistance summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-slideUp stagger-4">
          <LevelList
            title="Supports"
            levels={biasResult.supports}
            spot={biasResult.esSpot}
            color="#22c55e"
          />
          <LevelList
            title="Resistances"
            levels={biasResult.resistances}
            spot={biasResult.esSpot}
            color="#ef4444"
          />
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center gap-4 text-[9px] text-[var(--text-muted)] px-1 animate-fadeIn stagger-5">
          <span><kbd className="px-1 py-0.5 bg-[var(--surface)] rounded text-[8px]">1-4</kbd> Switch contract</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--surface)] rounded text-[8px]">R</kbd> Refresh</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function LevelCard({ label, value, color, spot }: {
  label: string;
  value: number;
  color: string;
  spot: number;
}) {
  const diff = value - spot;
  const pctDiff = (diff / spot) * 100;
  const isAbove = diff > 0;

  return (
    <div
      className="rounded-2xl border px-4 py-3.5 transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 group relative overflow-hidden backdrop-blur-sm"
      style={{
        borderColor: `${color}18`,
        background: `linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 97%, ${color} 3%) 100%)`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 28px ${color}12, 0 0 0 1px ${color}20`; e.currentTarget.style.borderColor = `${color}35`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = `${color}18`; }}
    >
      {/* Glass gradient overlay on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${color}08 0%, transparent 40%, ${color}04 100%)` }} />

      <div className="relative flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full transition-shadow duration-300 group-hover:shadow-[0_0_10px]" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}40` }} />
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] tracking-wide uppercase">{label}</span>
        </div>
        <span className="text-[8px] font-bold font-mono px-2 py-0.5 rounded-full uppercase tracking-widest border" style={{ backgroundColor: `${color}08`, color, borderColor: `${color}15` }}>
          {isAbove ? 'Above' : 'Below'}
        </span>
      </div>
      <div className="relative text-xl font-bold font-mono tracking-tight leading-none mb-1.5" style={{ color }}>
        {value.toFixed(0)}
      </div>
      <div className="relative flex items-center gap-1.5">
        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill={isAbove ? '#22c55e' : '#ef4444'}>
          {isAbove ? <path d="M6 2l4 6H2z" /> : <path d="M6 10L2 4h8z" />}
        </svg>
        <span className="text-[10px] font-mono font-medium" style={{ color: isAbove ? '#22c55e' : '#ef4444' }}>
          {diff > 0 ? '+' : ''}{diff.toFixed(0)} pts
        </span>
        <span className="text-[9px] font-mono text-[var(--text-dimmed)]">
          ({pctDiff > 0 ? '+' : ''}{pctDiff.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}

function SkewPanel({ skew }: { skew: SkewAnalysis }) {
  const skewColor = skew.skewSignal === 'bearish' ? '#ef4444'
    : skew.skewSignal === 'bullish' ? '#22c55e' : '#6b7280';
  const ivColor = skew.ivLevel === 'high' ? '#ef4444'
    : skew.ivLevel === 'low' ? '#22c55e' : '#eab308';
  const termColor = skew.termStructure === 'backwardation' ? '#ef4444'
    : skew.termStructure === 'contango' ? '#22c55e' : '#6b7280';

  // Skew bar visualization: map ratio from 0.8-1.3 to 0%-100%
  const skewBarPct = Math.max(0, Math.min(100, ((skew.skewRatio - 0.8) / 0.5) * 100));

  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden"
      style={{ background: 'linear-gradient(160deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 97%, var(--primary) 3%) 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${skewColor}06 0%, transparent 70%)` }}>
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4" style={{ color: skewColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" /><path d="M7 16c2-4 4-8 6-6s4-2 6-4" />
          </svg>
          <span className="text-[12px] font-bold text-[var(--text-primary)] tracking-tight">Volatility Skew</span>
          <span
            className="text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border"
            style={{ backgroundColor: `${skewColor}10`, color: skewColor, borderColor: `${skewColor}20` }}
          >
            {skew.skewSignal}
          </span>
        </div>
        <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border" style={{ color: skewColor, backgroundColor: `${skewColor}08`, borderColor: `${skewColor}15` }}>
          {skew.totalVolScore > 0 ? '+' : ''}{skew.totalVolScore.toFixed(0)}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Skew Ratio Bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-[var(--text-secondary)]">Put/Call Skew Ratio</span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg" style={{ color: skewColor, backgroundColor: `${skewColor}10` }}>
              {skew.skewRatio.toFixed(3)}
            </span>
          </div>
          <div className="relative h-2.5 bg-[var(--background)] rounded-full overflow-hidden border border-[var(--border)]">
            {/* Gradient background */}
            <div className="absolute inset-0 opacity-20" style={{ background: `linear-gradient(90deg, #22c55e, #6b7280 40%, #ef4444)` }} />
            {/* Center marker at ratio 1.0 */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-muted)]/40" style={{ left: '40%' }} />
            <div
              className="absolute top-0 bottom-0 rounded-full transition-all duration-700 ease-out"
              style={{
                left: Math.min(skewBarPct, 40) + '%',
                width: Math.abs(skewBarPct - 40) + '%',
                backgroundColor: skewColor,
                opacity: 0.6,
              }}
            />
            {/* Needle with glow */}
            <div
              className="absolute top-[-2px] bottom-[-2px] w-1.5 rounded-full transition-all duration-700 ease-out"
              style={{ left: `${skewBarPct}%`, backgroundColor: skewColor, boxShadow: `0 0 8px ${skewColor}60` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-medium text-[#22c55e]">Bullish</span>
            <span className="text-[9px] text-[var(--text-dimmed)] font-mono">1.0</span>
            <span className="text-[9px] font-medium text-[#ef4444]">Bearish</span>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-2">
          {/* ATM IV */}
          <div className="text-center p-2 rounded-xl bg-[var(--background)] border border-[var(--border)]">
            <div className="text-[9px] text-[var(--text-muted)] mb-0.5">ATM IV</div>
            <div className="text-[13px] font-bold font-mono" style={{ color: ivColor }}>
              {(skew.atmIV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] uppercase font-bold mt-0.5 px-1.5 py-0.5 rounded-full inline-block" style={{ color: ivColor, backgroundColor: `${ivColor}12` }}>
              {skew.ivLevel}
            </div>
          </div>

          {/* 25D Put IV */}
          <div className="text-center p-2 rounded-xl bg-[var(--background)] border border-[var(--border)]">
            <div className="text-[9px] text-[var(--text-muted)] mb-0.5">25D Put IV</div>
            <div className="text-[13px] font-bold font-mono text-[#ef4444]">
              {(skew.put25IV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] text-[#ef4444]/60 font-mono mt-0.5">
              +{(skew.skew25D * 100).toFixed(1)}pp
            </div>
          </div>

          {/* 25D Call IV */}
          <div className="text-center p-2 rounded-xl bg-[var(--background)] border border-[var(--border)]">
            <div className="text-[9px] text-[var(--text-muted)] mb-0.5">25D Call IV</div>
            <div className="text-[13px] font-bold font-mono text-[#22c55e]">
              {(skew.call25IV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] text-[var(--text-dimmed)] font-mono mt-0.5">base</div>
          </div>
        </div>

        {/* Term Structure */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border)]">
          <span className="text-[10px] font-medium text-[var(--text-secondary)]">Term Structure</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: termColor, boxShadow: `0 0 6px ${termColor}40` }} />
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: termColor }}>
              {skew.termStructure}
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-lg" style={{ color: termColor, backgroundColor: `${termColor}10` }}>
              {skew.termSpread > 0 ? '+' : ''}{(skew.termSpread * 100).toFixed(1)}pp
            </span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="flex items-center gap-3 px-2 py-1.5 text-[9px]">
          <span className="text-[var(--text-muted)]">Scores:</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: skewColor }} />
            Skew <b style={{ color: skewColor }}>{skew.skewScore > 0 ? '+' : ''}{skew.skewScore}</b>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ivColor }} />
            IV <b style={{ color: ivColor }}>{skew.ivScore > 0 ? '+' : ''}{skew.ivScore}</b>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: termColor }} />
            Term <b style={{ color: termColor }}>{skew.termScore > 0 ? '+' : ''}{skew.termScore}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function LevelList({ title, levels, spot, color }: {
  title: string;
  levels: Array<{ price: number; label: string; strength: number; color: string; source: string }>;
  spot: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] overflow-hidden"
      style={{ background: 'linear-gradient(160deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 97%, var(--primary) 3%) 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2.5"
        style={{ background: `linear-gradient(135deg, ${color}05 0%, transparent 70%)` }}>
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }} />
        <span className="text-[12px] font-bold tracking-tight" style={{ color }}>{title}</span>
        <span className="text-[9px] text-[var(--text-dimmed)] font-mono font-medium ml-auto bg-[var(--background)] px-2 py-0.5 rounded-md border border-[var(--border)]">{levels.length}</span>
      </div>
      <div className="divide-y divide-[var(--border)]/30">
        {levels.slice(0, 8).map((level, i) => {
          const dist = Math.abs(level.price - spot);
          return (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--surface-hover)] transition-all duration-200 group">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full transition-all duration-300 group-hover:scale-125 group-hover:shadow-[0_0_8px]" style={{ backgroundColor: level.color }} />
                <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {level.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono font-bold text-[var(--text-primary)]">
                  {level.price.toFixed(0)}
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)] w-14 text-right px-1.5 py-0.5 bg-[var(--background)] rounded border border-[var(--border)]">
                  {dist.toFixed(0)} pts
                </span>
                {/* Strength bar */}
                <div className="w-16 h-2 bg-[var(--background)] rounded-full overflow-hidden border border-[var(--border)]">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${level.strength}%`, backgroundColor: level.color, boxShadow: `0 0 6px ${level.color}30` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
