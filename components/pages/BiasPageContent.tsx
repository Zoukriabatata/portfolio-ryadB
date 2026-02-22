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
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] animate-slideUp stagger-1">
        <div className="flex items-center gap-3">
          {/* Contract selector */}
          <div className="flex items-center gap-1 bg-[var(--background)] rounded-lg p-0.5">
            {CONTRACTS.map(c => (
              <button
                key={c.id}
                onClick={() => setContract(c.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  contract === c.id
                    ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              GVS Bias
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              {etfSymbol} GEX → {contract}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Spot price */}
          <div className="text-xs font-mono text-[var(--text-secondary)]">
            {contract} {biasResult.esSpot.toFixed(0)}
          </div>

          {/* LIVE / SIM badge */}
          <div className={`px-2 py-1 rounded text-[10px] font-bold ${
            priceSource === 'yahoo-finance'
              ? 'bg-[var(--success-bg)] text-[var(--success)]'
              : 'bg-[var(--warning-bg)] text-[var(--warning)]'
          }`}>
            {priceSource === 'yahoo-finance' ? 'LIVE' : 'SIM'}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
      <div className="flex-1 overflow-auto p-3 space-y-3">
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

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="text-sm font-bold font-mono" style={{ color }}>
        {value.toFixed(0)}
      </div>
      <div className="text-[9px] font-mono text-[var(--text-muted)]">
        {diff > 0 ? '+' : ''}{diff.toFixed(0)} ({pctDiff > 0 ? '+' : ''}{pctDiff.toFixed(2)}%)
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--text-primary)]">Volatility Skew</span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
            style={{ backgroundColor: `${skewColor}15`, color: skewColor }}
          >
            {skew.skewSignal}
          </span>
        </div>
        <span className="text-[9px] font-mono" style={{ color: skewColor }}>
          Score: {skew.totalVolScore > 0 ? '+' : ''}{skew.totalVolScore.toFixed(0)}
        </span>
      </div>

      <div className="px-3 py-2 space-y-2.5">
        {/* Skew Ratio Bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-[var(--text-muted)]">Put/Call Skew</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: skewColor }}>
              {skew.skewRatio.toFixed(3)}
            </span>
          </div>
          <div className="relative h-2 bg-[var(--background)] rounded-full overflow-hidden">
            {/* Center marker at ratio 1.0 */}
            <div className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)]" style={{ left: '40%' }} />
            <div
              className="absolute top-0 bottom-0 rounded-full transition-all duration-500"
              style={{
                left: Math.min(skewBarPct, 40) + '%',
                width: Math.abs(skewBarPct - 40) + '%',
                backgroundColor: skewColor,
                opacity: 0.7,
              }}
            />
            {/* Needle */}
            <div
              className="absolute top-[-1px] bottom-[-1px] w-1 rounded-full"
              style={{ left: `${skewBarPct}%`, backgroundColor: skewColor }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] text-[#22c55e]">Bullish</span>
            <span className="text-[8px] text-[var(--text-muted)]">1.0</span>
            <span className="text-[8px] text-[#ef4444]">Bearish</span>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-2">
          {/* ATM IV */}
          <div className="text-center">
            <div className="text-[9px] text-[var(--text-muted)]">ATM IV</div>
            <div className="text-[11px] font-bold font-mono" style={{ color: ivColor }}>
              {(skew.atmIV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] uppercase font-bold" style={{ color: ivColor }}>
              {skew.ivLevel}
            </div>
          </div>

          {/* 25D Put IV */}
          <div className="text-center">
            <div className="text-[9px] text-[var(--text-muted)]">25D Put IV</div>
            <div className="text-[11px] font-bold font-mono text-[#ef4444]">
              {(skew.put25IV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] text-[var(--text-muted)]">
              +{(skew.skew25D * 100).toFixed(1)}pp
            </div>
          </div>

          {/* 25D Call IV */}
          <div className="text-center">
            <div className="text-[9px] text-[var(--text-muted)]">25D Call IV</div>
            <div className="text-[11px] font-bold font-mono text-[#22c55e]">
              {(skew.call25IV * 100).toFixed(1)}%
            </div>
            <div className="text-[8px] text-[var(--text-muted)]">base</div>
          </div>
        </div>

        {/* Term Structure */}
        <div className="flex items-center justify-between px-1 py-1 rounded bg-[var(--background)]">
          <span className="text-[9px] text-[var(--text-muted)]">Term Structure</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: termColor }} />
            <span className="text-[10px] font-bold uppercase" style={{ color: termColor }}>
              {skew.termStructure}
            </span>
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              {skew.termSpread > 0 ? '+' : ''}{(skew.termSpread * 100).toFixed(1)}pp
            </span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="flex items-center gap-2 text-[8px] text-[var(--text-muted)]">
          <span>Skew: <b style={{ color: skewColor }}>{skew.skewScore > 0 ? '+' : ''}{skew.skewScore}</b></span>
          <span>IV: <b style={{ color: ivColor }}>{skew.ivScore > 0 ? '+' : ''}{skew.ivScore}</b></span>
          <span>Term: <b style={{ color: termColor }}>{skew.termScore > 0 ? '+' : ''}{skew.termScore}</b></span>
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border)]">
        <span className="text-[11px] font-bold" style={{ color }}>{title}</span>
        <span className="text-[9px] text-[var(--text-muted)] ml-2">({levels.length})</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {levels.slice(0, 8).map((level, i) => {
          const dist = Math.abs(level.price - spot);
          return (
            <div key={i} className="flex items-center justify-between px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: level.color }} />
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  {level.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-[var(--text-primary)]">
                  {level.price.toFixed(0)}
                </span>
                <span className="text-[9px] font-mono text-[var(--text-muted)] w-12 text-right">
                  {dist.toFixed(0)} pts
                </span>
                {/* Strength bar */}
                <div className="w-12 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${level.strength}%`, backgroundColor: level.color }}
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
