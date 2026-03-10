'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { usePageActive } from '@/hooks/usePageActive';
import { ChartSkeleton, EmptyState } from '@/components/ui/Skeleton';
import { GEXHistoryBuffer } from '@/lib/calculations/gexHistory';
import type { MultiGreekData, MultiGreekSummary, GreekType } from '@/types/options';
import { GREEK_META } from '@/types/options';
import { RefreshIcon } from '@/components/ui/Icons';
import { useLiveSpot } from '@/lib/useLiveSpot';

const GEXDashboard = dynamic(() => import('@/components/charts/GEXDashboard'), { ssr: false });
const GEXHeatmap = dynamic(() => import('@/components/charts/GEXHeatmap'), { ssr: false });
const CumulativeGEXChart = dynamic(() => import('@/components/charts/CumulativeGEXChart'), { ssr: false });
const OptionsFlowPanel = dynamic(() => import('@/components/widgets/OptionsFlowPanel'), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface LegacyGEXLevel {
  strike: number; callGEX: number; putGEX: number; netGEX: number;
  callOI: number; putOI: number; callVolume: number; putVolume: number;
}
interface LegacyGEXSummary {
  netGEX: number; totalCallGEX: number; totalPutGEX: number;
  callWall: number; putWall: number; zeroGamma: number;
  maxGamma: number; gammaFlip: number; hvl: number;
  regime: 'positive' | 'negative';
}

type ViewMode = 'bars' | 'cumulative' | 'heatmap2D' | 'heatmap3D';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBig(n: number, dec = 2) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(dec)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(dec)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(dec);
}

function pct(a: number, b: number) {
  if (!b) return '—';
  return `${((a - b) / b * 100).toFixed(1)}%`;
}

const ETF_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA'];
const STOCK_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricRow({ label, value, sub, bull }: {
  label: string; value: string; sub?: string; bull?: boolean;
}) {
  const color = bull === undefined ? 'var(--text-primary)' : bull ? '#22c55e' : '#ef4444';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]/40 last:border-0">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <div className="text-right">
        <span className="text-[12px] font-mono font-semibold" style={{ color }}>{value}</span>
        {sub && <span className="text-[10px] text-[var(--text-muted)] ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2 mt-3 first:mt-0">
      {children}
    </p>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GEXPageContent() {
  const [symbol, setSymbol] = useState('QQQ');
  const [expiration, setExpiration] = useState<number | null>(null);
  const [expirations, setExpirations] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<'cboe' | 'error' | null>(null);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const symbolRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('bars');
  const [selectedGreek, setSelectedGreek] = useState<GreekType>('gex');
  const [zoom, setZoom] = useState<'full' | 'atm' | 'tight'>('atm');

  // Live spot price — polls every 10s (faster than full GEX refresh at 30s)
  const liveSpot = useLiveSpot(symbol, 10_000);

  const [multiGreekData, setMultiGreekData] = useState<MultiGreekData[]>([]);
  const [multiGreekSummary, setMultiGreekSummary] = useState<MultiGreekSummary | null>(null);
  const [spotPrice, setSpotPrice] = useState(0);

  // Effective spot: prefer live price (10s) over API price (30s)
  const effectiveSpot = liveSpot.price > 0 ? liveSpot.price : spotPrice;
  const [totalCallOI, setTotalCallOI] = useState(0);
  const [totalPutOI, setTotalPutOI] = useState(0);
  const historyRef = useRef<GEXHistoryBuffer>(new GEXHistoryBuffer());

  const [netFlowByStrike, setNetFlowByStrike] = useState<{ strike: number; callPremium: number; putPremium: number; net: number }[]>([]);
  const [oiByStrike, setOiByStrike] = useState<{ strike: number; callOI: number; putOI: number }[]>([]);
  const [topContracts, setTopContracts] = useState<{ strike: number; type: 'C' | 'P'; expiration: string; volume: number; oi: number; premium: number; iv: number; delta: number; voiRatio: number }[]>([]);
  const [gexByExpiry, setGexByExpiry] = useState<{ label: string; daysToExp: number; callGEX: number; putGEX: number; netGEX: number }[]>([]);

  const [legacyGexData, setLegacyGexData] = useState<LegacyGEXLevel[]>([]);
  const [legacySummary, setLegacySummary] = useState<LegacyGEXSummary | null>(null);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const adaptedLegacyData = useMemo((): LegacyGEXLevel[] => {
    if (selectedGreek === 'gex' && legacyGexData.length > 0) return legacyGexData;
    return multiGreekData.map(d => {
      const v = d[selectedGreek];
      return { strike: d.strike, callGEX: v > 0 ? v : 0, putGEX: v < 0 ? v : 0, netGEX: v, callOI: d.callOI, putOI: d.putOI, callVolume: 0, putVolume: 0 };
    });
  }, [multiGreekData, legacyGexData, selectedGreek]);

  const adaptedLegacySummary = useMemo((): LegacyGEXSummary | null => {
    if (selectedGreek === 'gex' && legacySummary) return legacySummary;
    if (!multiGreekSummary) return null;
    const netVal = multiGreekSummary[`net${selectedGreek.toUpperCase()}` as keyof MultiGreekSummary] as number;
    return { netGEX: netVal, totalCallGEX: netVal > 0 ? netVal : 0, totalPutGEX: netVal < 0 ? netVal : 0, callWall: multiGreekSummary.callWall, putWall: multiGreekSummary.putWall, zeroGamma: multiGreekSummary.zeroGammaLevel, maxGamma: multiGreekSummary.callWall, gammaFlip: multiGreekSummary.zeroGammaLevel, hvl: multiGreekSummary.zeroGammaLevel, regime: multiGreekSummary.regime };
  }, [multiGreekSummary, legacySummary, selectedGreek]);

  const zoomedData = useMemo(() => {
    if (adaptedLegacyData.length === 0) return adaptedLegacyData;
    const strikes = adaptedLegacyData.map(d => d.strike);
    const lo = Math.min(...strikes), hi = Math.max(...strikes), range = hi - lo;
    if (zoom === 'full') return adaptedLegacyData;
    const center = spotPrice || (lo + hi) / 2;
    const half = range * (zoom === 'atm' ? 0.15 : 0.06);
    return adaptedLegacyData.filter(d => d.strike >= center - half && d.strike <= center + half);
  }, [adaptedLegacyData, zoom, spotPrice]);

  // ─── Bias logic ────────────────────────────────────────────────────────────

  const bias = useMemo(() => {
    if (!multiGreekSummary) return null;
    const gexBull = multiGreekSummary.netGEX > 0;
    const flowBull = multiGreekSummary.flowRatio >= 1;
    const aboveZG = spotPrice > multiGreekSummary.zeroGammaLevel;
    const bullCount = [gexBull, flowBull, aboveZG].filter(Boolean).length;
    if (bullCount >= 2) return 'BULLISH';
    if (bullCount === 0) return 'BEARISH';
    return 'NEUTRAL';
  }, [multiGreekSummary, spotPrice]);

  const biasColor = bias === 'BULLISH' ? '#22c55e' : bias === 'BEARISH' ? '#ef4444' : '#eab308';

  // Wall bar position
  const wallBarPct = useMemo(() => {
    const cw = multiGreekSummary?.callWall ?? 0;
    const pw = multiGreekSummary?.putWall ?? 0;
    if (!cw || !pw || cw <= pw || spotPrice <= pw) return 50;
    return Math.min(100, Math.max(0, ((spotPrice - pw) / (cw - pw)) * 100));
  }, [multiGreekSummary, spotPrice]);

  // ─── Data fetch ────────────────────────────────────────────────────────────

  const loadLiveData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const expParam = expiration ? `&expiration=${expiration}` : '';
      const res = await fetch(`/api/gex-live?symbol=${symbol}${expParam}`);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || `API ${res.status}`);
      const data = await res.json();

      setExpirations(data.expirations);
      if (!expiration && data.expirations.length > 0) setExpiration(data.expirations[0]);
      setLegacyGexData(data.legacyData);
      setLegacySummary(data.legacySummary);
      setMultiGreekData(data.multiGreekData);
      setMultiGreekSummary(data.multiGreekSummary);
      setSpotPrice(data.spotPrice);
      setTotalCallOI(data.totalCallOI);
      setTotalPutOI(data.totalPutOI);
      setNetFlowByStrike(data.netFlowByStrike || []);
      setOiByStrike(data.oiByStrike || []);
      setTopContracts(data.topContracts || []);
      setGexByExpiry(data.gexByExpiry || []);

      historyRef.current.push({ timestamp: Date.now(), summary: data.multiGreekSummary, data: data.multiGreekData, spotPrice: data.spotPrice });
      setDataSource('cboe');
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setDataSource('error');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, expiration]);

  useEffect(() => { loadLiveData(); }, [loadLiveData]);
  useEffect(() => { if (expiration) loadLiveData(); }, [expiration, loadLiveData]);

  const isActive = usePageActive();
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(loadLiveData, 30_000);
    return () => clearInterval(t);
  }, [isActive, loadLiveData]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') setSymbolOpen(false);
      if (e.key === 'r' || e.key === 'R') loadLiveData();
      const gs: GreekType[] = ['gex', 'vex', 'cex', 'dex'];
      if (e.key >= '1' && e.key <= '4') setSelectedGreek(gs[+e.key - 1]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [loadLiveData]);

  useEffect(() => {
    if (!symbolOpen) return;
    const h = (e: MouseEvent) => {
      if (symbolRef.current && !symbolRef.current.contains(e.target as Node)) setSymbolOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [symbolOpen]);

  const resetSymbol = (s: string) => {
    setSymbol(s); setExpiration(null);
    setLegacyGexData([]); setLegacySummary(null);
    setMultiGreekData([]); setMultiGreekSummary(null);
    setSymbolOpen(false);
  };

  const s = multiGreekSummary;
  const callWall = s?.callWall ?? 0;
  const putWall = s?.putWall ?? 0;
  const zeroGamma = s?.zeroGammaLevel ?? 0;
  const greekMeta = GREEK_META[selectedGreek];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--background)]">

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">

        {/* Left: Symbol + Greek */}
        <div className="flex items-center gap-3">

          {/* Symbol selector */}
          <div className="relative" ref={symbolRef}>
            <button
              onClick={() => setSymbolOpen(!symbolOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-light)] transition-colors text-sm font-bold text-[var(--text-primary)]"
              style={{ background: 'var(--surface-elevated)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: biasColor ?? '#6b7280' }} />
              {symbol}
              <svg className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${symbolOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {symbolOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-[100] w-56 rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden" style={{ background: '#0d1117' }}>
                <div className="p-2 border-b border-[var(--border)]">
                  <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest px-1 mb-1.5">ETF</p>
                  <div className="grid grid-cols-2 gap-1">
                    {ETF_SYMBOLS.map(s => (
                      <button key={s} onClick={() => resetSymbol(s)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg text-left font-semibold transition-colors ${symbol === s ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest px-1 mb-1.5">Stocks</p>
                  <div className="grid grid-cols-2 gap-1">
                    {STOCK_SYMBOLS.map(s => (
                      <button key={s} onClick={() => resetSymbol(s)}
                        className={`px-2.5 py-1.5 text-xs rounded-lg text-left font-semibold transition-colors ${symbol === s ? 'bg-[var(--primary)]/20 text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-white/5'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-[var(--border)]" />

          {/* Greek tabs */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface-elevated)' }}>
            {(['gex', 'vex', 'cex', 'dex'] as GreekType[]).map((g, i) => {
              const m = GREEK_META[g];
              return (
                <button key={g} onClick={() => setSelectedGreek(g)}
                  title={`${m.fullName} (${i + 1})`}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${selectedGreek === g ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
                  style={selectedGreek === g ? { background: m.color } : undefined}>
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Spot price */}
          {spotPrice > 0 && (
            <span className="text-[12px] font-mono font-bold text-[var(--text-secondary)]">
              ${spotPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Right: status + refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dataSource === 'cboe' ? 'bg-green-500 animate-pulse' : 'bg-[var(--text-dimmed)]'}`} />
            <span className="text-[10px] text-[var(--text-muted)]">
              {dataSource === 'cboe' ? 'CBOE' : 'Loading'}
              {lastUpdate && ` · ${lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </span>
          </div>
          <button onClick={loadLiveData} disabled={isLoading}
            className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-light)] transition-colors disabled:opacity-40">
            <RefreshIcon size={13} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ BODY ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT PANEL (bias + levels) ──────────────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-[var(--border)] flex flex-col overflow-y-auto" style={{ background: 'var(--surface)' }}>
          <div className="p-4 flex flex-col gap-0">

            {/* BIAS */}
            <div className="text-center pb-4 border-b border-[var(--border)]/50 mb-3">
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-2">Market Bias</p>
              {bias ? (
                <>
                  <p className="text-2xl font-black tracking-tight" style={{ color: biasColor }}>{bias}</p>
                  <p className="text-[9px] text-[var(--text-muted)] mt-1">
                    {bias === 'BULLISH' ? '2+ bullish signals' : bias === 'BEARISH' ? '2+ bearish signals' : 'Mixed signals'}
                  </p>
                </>
              ) : (
                <div className="h-8 flex items-center justify-center">
                  <span className="text-[11px] text-[var(--text-muted)]">Loading…</span>
                </div>
              )}
            </div>

            {/* KEY SIGNALS */}
            {s && (
              <>
                <SectionLabel>Signals</SectionLabel>
                <MetricRow
                  label="Net GEX"
                  value={`${s.netGEX >= 0 ? '+' : ''}${fmtBig(s.netGEX)}`}
                  sub={s.regime === 'positive' ? 'dealers long' : 'dealers short'}
                  bull={s.netGEX > 0}
                />
                <MetricRow
                  label="Flow Ratio"
                  value={s.flowRatio.toFixed(2)}
                  sub={s.flowRatio >= 1 ? 'calls' : 'puts'}
                  bull={s.flowRatio >= 1}
                />
                <MetricRow
                  label="Spot vs ZeroΓ"
                  value={`${spotPrice > zeroGamma ? '▲' : '▼'} $${zeroGamma.toFixed(0)}`}
                  bull={spotPrice > zeroGamma}
                />

                {/* WALLS BAR */}
                <div className="mt-4 mb-2">
                  <div className="flex justify-between text-[9px] text-[var(--text-muted)] mb-1">
                    <span className="text-red-400 font-bold">${putWall > 0 ? putWall.toFixed(0) : '—'}</span>
                    <span className="text-[var(--text-secondary)] font-mono text-[10px]">${spotPrice > 0 ? spotPrice.toFixed(1) : '—'}</span>
                    <span className="text-green-400 font-bold">${callWall > 0 ? callWall.toFixed(0) : '—'}</span>
                  </div>
                  <div className="relative h-2 rounded-full overflow-hidden bg-[var(--background)]">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${wallBarPct}%`, background: 'linear-gradient(90deg,#ef4444,#eab308,#22c55e)' }} />
                    <div className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${wallBarPct}%`, transform: 'translateX(-50%)' }} />
                  </div>
                  <div className="flex justify-between text-[9px] mt-1 text-[var(--text-muted)]">
                    <span className="text-red-400">{putWall > 0 && spotPrice > 0 ? pct(putWall, spotPrice) : ''}</span>
                    <span>Put → Spot → Call</span>
                    <span className="text-green-400">{callWall > 0 && spotPrice > 0 ? `+${pct(callWall, spotPrice).replace('-', '')}` : ''}</span>
                  </div>
                </div>

                {/* KEY LEVELS */}
                <SectionLabel>Key Levels</SectionLabel>
                <MetricRow label="Call Wall" value={`$${callWall > 0 ? callWall.toFixed(0) : '—'}`} sub={callWall > 0 && spotPrice > 0 ? `+${((callWall - spotPrice) / spotPrice * 100).toFixed(1)}%` : ''} />
                <MetricRow label="Put Wall" value={`$${putWall > 0 ? putWall.toFixed(0) : '—'}`} sub={putWall > 0 && spotPrice > 0 ? `${((putWall - spotPrice) / spotPrice * 100).toFixed(1)}%` : ''} />
                <MetricRow label="Zero Gamma" value={`$${zeroGamma > 0 ? zeroGamma.toFixed(0) : '—'}`} />
                <MetricRow label="Max Pain" value={`$${s.maxPain > 0 ? s.maxPain.toFixed(0) : '—'}`} />

                {/* OPTIONS METRICS */}
                <SectionLabel>Options</SectionLabel>
                <MetricRow label="GEX Ratio" value={s.gexRatio.toFixed(2)} />
                <MetricRow label="IV Skew" value={`${s.ivSkew > 0 ? '+' : ''}${s.ivSkew.toFixed(1)}%`} bull={s.ivSkew < 0} />
                <MetricRow label="Call IV" value={`${(s.callIV * 100).toFixed(1)}%`} />
                <MetricRow label="Put IV" value={`${(s.putIV * 100).toFixed(1)}%`} />
                <MetricRow
                  label="P/C OI"
                  value={totalCallOI > 0 ? (totalPutOI / totalCallOI).toFixed(2) : '—'}
                  bull={totalCallOI > totalPutOI}
                />
                <MetricRow
                  label="Impl. Move"
                  value={s.impliedMove > 0 ? `±$${s.impliedMove.toFixed(1)}` : '—'}
                  sub={s.impliedMove > 0 && spotPrice > 0 ? `${(s.impliedMove / spotPrice * 100).toFixed(1)}%` : ''}
                />
                <MetricRow
                  label="Net Flow"
                  value={fmtBig(s.netFlow)}
                  bull={s.netFlow > 0}
                />
              </>
            )}

            {/* EXPIRATION SELECTOR */}
            {expirations.length > 0 && (
              <>
                <SectionLabel>Expiration</SectionLabel>
                <div className="flex flex-col gap-1">
                  {expirations.slice(0, 6).map(exp => {
                    const label = new Date(exp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const dte = Math.max(0, Math.round((exp - Date.now() / 1000) / 86400));
                    return (
                      <button key={exp} onClick={() => setExpiration(exp)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition-colors ${expiration === exp ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/3'}`}
                        style={expiration === exp ? { background: 'var(--primary-dark)' } : undefined}>
                        <span className="font-semibold">{label}</span>
                        <span className="text-[10px] opacity-60">{dte}d</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* CBOE note */}
            <p className="text-[9px] text-[var(--text-dimmed)] text-center mt-4 leading-relaxed">
              CBOE delayed ~15min<br />OI = previous close · auto 30s
            </p>
          </div>
        </div>

        {/* ── RIGHT AREA ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Chart toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] shrink-0" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface-elevated)' }}>
              {(['bars', 'cumulative', 'heatmap2D', 'heatmap3D'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${viewMode === m ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                  {m === 'bars' ? 'Bars' : m === 'cumulative' ? 'Cumulative' : m === 'heatmap2D' ? '2D Heat' : '3D'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)]">Zoom</span>
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface-elevated)' }}>
                {(['full', 'atm', 'tight'] as const).map(z => (
                  <button key={z} onClick={() => setZoom(z)}
                    className={`px-2 py-1 text-[11px] rounded-md transition-colors ${zoom === z ? 'bg-[var(--primary-dark)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}>
                    {z === 'full' ? 'Full' : z === 'atm' ? 'ATM' : 'Tight'}
                  </button>
                ))}
              </div>

              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                <span style={{ color: greekMeta.color }}>{greekMeta.symbol}</span> {greekMeta.label}
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading && !adaptedLegacyData.length ? (
              <ChartSkeleton />
            ) : error ? (
              <EmptyState icon="error" title={error}
                action={<button onClick={loadLiveData} className="px-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)]">Retry</button>}
              />
            ) : adaptedLegacyData.length === 0 ? (
              <EmptyState icon="chart" title="No data" description="Select an expiration" />
            ) : viewMode === 'bars' ? (
              <GEXDashboard symbol={`${symbol} ${greekMeta.label}`} spotPrice={effectiveSpot} gexData={zoomedData} summary={adaptedLegacySummary} height="auto" />
            ) : viewMode === 'cumulative' ? (
              <CumulativeGEXChart data={multiGreekData} spotPrice={effectiveSpot} symbol={symbol} selectedGreek={selectedGreek} zeroGammaLevel={s?.zeroGammaLevel || effectiveSpot} callWall={s?.callWall || effectiveSpot} putWall={s?.putWall || effectiveSpot} height="auto" />
            ) : (
              <GEXHeatmap gexData={zoomedData} spotPrice={effectiveSpot} symbol={`${symbol} ${greekMeta.label}`} mode={viewMode === 'heatmap2D' ? '2D' : '3D'} dataType="netGEX" height={500} />
            )}
          </div>

          {/* Flow panels */}
          {netFlowByStrike.length > 0 && (
            <div className="border-t border-[var(--border)] shrink-0" style={{ height: 380 }}>
              <OptionsFlowPanel
                netFlowByStrike={netFlowByStrike}
                oiByStrike={oiByStrike}
                topContracts={topContracts}
                gexByExpiry={gexByExpiry}
                spotPrice={effectiveSpot}
                liveSpot={liveSpot}
                symbol={symbol}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
