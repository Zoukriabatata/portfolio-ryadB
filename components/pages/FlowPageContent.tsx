'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { usePageActive } from '@/hooks/usePageActive';
import type { FlowItem } from '@/app/api/options-flow/route';
import { useTrackChartVisit } from '@/hooks/dashboard/useTrackChartVisit';
import { themeColor, themeAlpha } from '@/lib/ui/themeColors';
import { useUIThemeStore } from '@/stores/useUIThemeStore';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Data-semantic colors resolved from the active SENZOUKRIA palette (theme-aware,
// zero hardcoded hex). These hex values feed `${COLOR}NN` alpha-suffix inline
// styles, so they must be resolved hex at render time — `useFlowColors()` reads
// them via themeColor() on the client and re-resolves when the theme changes.
interface FlowColors {
  teal: string;   // --accent (neutral / spot / structure)
  bull: string;   // --bull
  bear: string;   // --bear
  warn: string;   // --warning
  primary: string; // --primary (active / CTA / whale emphasis)
}

function useFlowColors(): FlowColors {
  // Subscribe to the active theme so colors re-resolve on theme change.
  const activeTheme = useUIThemeStore((s) => s.activeTheme);
  return useMemo<FlowColors>(() => ({
    teal:    themeColor('--accent'),
    bull:    themeColor('--bull'),
    bear:    themeColor('--bear'),
    warn:    themeColor('--warning'),
    primary: themeColor('--primary'),
  }), [activeTheme]);
}

const SYMBOLS = ['QQQ', 'SPY', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

type TagMeta = Record<FlowItem['tag'], { label: string; color: string; bg: string }>;

function tagMeta(c: FlowColors): TagMeta {
  return {
    WHALE:   { label: 'Whale',   color: c.primary, bg: themeAlpha('--primary', 0.12) },
    UNUSUAL: { label: 'Unusual', color: c.warn,    bg: themeAlpha('--warning', 0.10) },
    BLOCK:   { label: 'Block',   color: c.teal,    bg: themeAlpha('--accent', 0.10) },
    SWEEP:   { label: 'Sweep',   color: c.teal,    bg: themeAlpha('--accent', 0.10) },
    FLOW:    { label: 'Flow',    color: 'var(--text-secondary)', bg: 'var(--surface)' },
  };
}

type TypeFilter = 'all' | 'calls' | 'puts';
type TagFilter  = 'all' | 'whale' | 'unusual' | 'block' | 'sweep';
type SortKey    = 'premium' | 'volume' | 'volOiRatio' | 'iv' | 'dte' | 'gamma' | 'vega' | 'theta';
type ViewTab    = 'table' | 'chart' | 'heatmap';

function fmtPremium(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(n: number, dec = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(dec);
}

// ─── Top Unusual Cards ─────────────────────────────────────────────────────────
function TopUnusualCards({ trades }: { trades: FlowItem[] }) {
  const c = useFlowColors();
  const tags = tagMeta(c);
  if (trades.length === 0) return null;
  return (
    <div className="flex gap-2 px-4 py-2.5 overflow-x-auto shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
      {trades.map((t, i) => {
        const isCall = t.type === 'CALL';
        const tag = tags[t.tag];
        return (
          <div key={t.id} className="flex-shrink-0 rounded-lg px-3 py-2 min-w-[180px]"
            style={{ background: isCall ? `${c.bull}08` : `${c.bear}08`, border: `1px solid ${isCall ? c.bull : c.bear}20` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: tag.bg, color: tag.color }}>
                {tag.label}
              </span>
              <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>#{i + 1}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[10px] font-black" style={{ color: isCall ? c.bull : c.bear }}>{t.type}</span>
              <span className="text-[14px] font-black font-mono" style={{ color: 'var(--text-primary)' }}>${t.strike}</span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{t.expLabel}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-black font-mono"
                style={{ color: t.premium >= 1_000_000 ? c.primary : c.warn }}>
                {fmtPremium(t.premium)}
              </span>
              <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                {fmtNum(t.volume)} vol · {t.volOiRatio.toFixed(1)}x
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Premium Flow Chart (Call vs Put by Strike) ────────────────────────────────
function PremiumFlowChart({ data, spotPrice }: { data: { strike: number; callPremium: number; putPremium: number }[]; spotPrice: number }) {
  const c = useFlowColors();
  if (data.length === 0) return <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>No data</div>;

  const maxPremium = Math.max(...data.map(d => Math.max(d.callPremium, d.putPremium)), 1);
  // Show top 30 strikes by total premium
  const top = [...data].sort((a, b) => (b.callPremium + b.putPremium) - (a.callPremium + a.putPremium)).slice(0, 30).sort((a, b) => a.strike - b.strike);

  return (
    <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: 'var(--text-dimmed)' }}>
        Premium Flow by Strike
      </h3>
      <div className="flex flex-col gap-0.5">
        {top.map(d => {
          const isSpot = Math.abs(d.strike - spotPrice) < spotPrice * 0.005;
          return (
            <div key={d.strike} className="flex items-center gap-2 h-5">
              <span className="text-[9px] font-mono w-14 text-right shrink-0"
                style={{ color: isSpot ? c.teal : 'var(--text-muted)', fontWeight: isSpot ? 900 : 400 }}>
                ${d.strike}
              </span>
              {/* Put bar (left, red) */}
              <div className="flex-1 flex justify-end">
                <div className="h-3 rounded-l transition-all"
                  style={{ width: `${(d.putPremium / maxPremium) * 100}%`, background: `${c.bear}88`, minWidth: d.putPremium > 0 ? 2 : 0 }} />
              </div>
              {/* Divider */}
              <div className="w-px h-4 shrink-0" style={{ background: isSpot ? c.teal : 'var(--border)' }} />
              {/* Call bar (right, green) */}
              <div className="flex-1">
                <div className="h-3 rounded-r transition-all"
                  style={{ width: `${(d.callPremium / maxPremium) * 100}%`, background: `${c.bull}88`, minWidth: d.callPremium > 0 ? 2 : 0 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center gap-6 mt-3">
        <span className="flex items-center gap-1.5 text-[9px]" style={{ color: c.bear }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: `${c.bear}88` }} /> Put Premium
        </span>
        <span className="flex items-center gap-1.5 text-[9px]" style={{ color: c.bull }}>
          <span className="w-2.5 h-2.5 rounded" style={{ background: `${c.bull}88` }} /> Call Premium
        </span>
      </div>
    </div>
  );
}

// ─── Strike × Expiry Heatmap ──────────────────────────────────────────────────
function StrikeExpiryHeatmap({ data }: { data: { strike: number; expLabel: string; dte: number; callPremium: number; putPremium: number; totalVolume: number }[] }) {
  const c = useFlowColors();
  if (data.length === 0) return <div className="flex-1 flex items-center justify-center text-[11px]" style={{ color: 'var(--text-dimmed)' }}>No data</div>;

  // Get unique strikes and expiries
  const strikes = [...new Set(data.map(d => d.strike))].sort((a, b) => a - b);
  const expiries = [...new Set(data.map(d => d.expLabel))].sort((a, b) => {
    const ad = data.find(d => d.expLabel === a)?.dte ?? 0;
    const bd = data.find(d => d.expLabel === b)?.dte ?? 0;
    return ad - bd;
  });

  // Limit grid size
  const topStrikes = strikes.length > 20 ? strikes.slice(Math.floor((strikes.length - 20) / 2), Math.floor((strikes.length - 20) / 2) + 20) : strikes;
  const topExpiries = expiries.slice(0, 8);

  const maxPrem = Math.max(...data.map(d => d.callPremium + d.putPremium), 1);

  const getCell = (strike: number, expLabel: string) => {
    return data.find(d => d.strike === strike && d.expLabel === expLabel);
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
      <h3 className="text-[10px] uppercase tracking-wider mb-3 font-bold" style={{ color: 'var(--text-dimmed)' }}>
        Strike × Expiry Heatmap (Premium Intensity)
      </h3>
      <div className="overflow-auto">
        <table className="border-collapse text-[9px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-right font-mono" style={{ color: 'var(--text-dimmed)' }}>Strike</th>
              {topExpiries.map(exp => (
                <th key={exp} className="px-2 py-1.5 text-center font-mono" style={{ color: 'var(--text-dimmed)' }}>{exp}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topStrikes.map(strike => (
              <tr key={strike}>
                <td className="px-2 py-0.5 text-right font-mono font-bold" style={{ color: 'var(--text-muted)' }}>${strike}</td>
                {topExpiries.map(exp => {
                  const cell = getCell(strike, exp);
                  if (!cell) return <td key={exp} className="px-1 py-0.5"><div className="w-full h-5 rounded" style={{ background: 'var(--surface)' }} /></td>;
                  const total = cell.callPremium + cell.putPremium;
                  const intensity = Math.pow(total / maxPrem, 0.5); // sqrt for better distribution
                  const isCallDominant = cell.callPremium > cell.putPremium;
                  const baseColor = isCallDominant ? c.bull : c.bear;
                  return (
                    <td key={exp} className="px-1 py-0.5">
                      <div className="h-5 rounded flex items-center justify-center" title={`$${strike} ${exp}: ${fmtPremium(total)}`}
                        style={{ background: `${baseColor}${Math.round(intensity * 200 + 10).toString(16).padStart(2, '0')}`, minWidth: 48 }}>
                        {total > maxPrem * 0.05 && (
                          <span className="font-mono font-bold" style={{ color: `${baseColor}`, fontSize: 8 }}>
                            {fmtPremium(total)}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────
interface FlowStats {
  totalCallPremium: number;
  totalPutPremium:  number;
  unusualCount:     number;
  total:            number;
  spotPrice:        number;
  avgSentiment:     number;
}

function StatsRow({ stats, symbol }: { stats: FlowStats; symbol: string }) {
  const c = useFlowColors();
  const totalFlow   = stats.totalCallPremium + stats.totalPutPremium;
  const callPct     = totalFlow > 0 ? (stats.totalCallPremium / totalFlow) * 100 : 50;

  // Multi-factor sentiment
  const s = stats.avgSentiment;
  const sentiment = s > 0.15 ? 'Bullish' : s < -0.15 ? 'Bearish' : 'Neutral';
  const sentColor = s > 0.15 ? c.bull : s < -0.15 ? c.bear : c.warn;

  return (
    <div className="flex flex-wrap items-stretch gap-0 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
      {/* Sentiment cell — now multi-factor */}
      <div className="flex flex-col justify-center items-center px-5 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 100 }}>
        <span className="text-[8.5px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-dimmed)' }}>Sentiment</span>
        <span className="text-[15px] font-black" style={{ color: sentColor }}>{sentiment}</span>
        <span className="text-[8px] font-mono" style={{ color: `${sentColor}88` }}>{(s * 100).toFixed(0)}%</span>
      </div>

      {/* Call/Put bar */}
      <div className="flex flex-col justify-center px-4 py-2.5 border-r flex-1 min-w-[160px]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex justify-between text-[8.5px] mb-1.5" style={{ color: 'var(--text-dimmed)' }}>
          <span style={{ color: `${c.bull}bb` }}>Calls {callPct.toFixed(0)}%</span>
          <span style={{ color: 'var(--text-muted)' }}>Premium Flow</span>
          <span style={{ color: `${c.bear}bb` }}>Puts {(100 - callPct).toFixed(0)}%</span>
        </div>
        <div className="h-2.5 rounded overflow-hidden flex">
          <div style={{ width: `${callPct}%`, background: `linear-gradient(90deg, ${c.bull}55, ${c.bull}99)`, transition: 'width 0.6s' }} />
          <div style={{ width: `${100 - callPct}%`, background: `linear-gradient(90deg, ${c.bear}99, ${c.bear}55)`, transition: 'width 0.6s' }} />
        </div>
      </div>

      {/* Metric cells */}
      {[
        { l: 'Call Flow',  v: fmtPremium(stats.totalCallPremium), c: `${c.bull}cc` },
        { l: 'Put Flow',   v: fmtPremium(stats.totalPutPremium),  c: `${c.bear}cc` },
        { l: 'Unusual',    v: `${stats.unusualCount}`,             c: c.warn },
        { l: 'Contracts',  v: `${stats.total}`,                    c: 'var(--text-muted)' },
        { l: `${symbol}`,  v: stats.spotPrice > 0 ? `$${stats.spotPrice.toFixed(2)}` : '—', c: c.teal },
      ].map(m => (
        <div key={m.l} className="flex flex-col justify-center items-center px-4 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 72 }}>
          <span className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-dimmed)' }}>{m.l}</span>
          <span className="font-mono text-[13px] font-black" style={{ color: m.c }}>{m.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function FlowRow({ item, idx }: { item: FlowItem; idx: number }) {
  const c = useFlowColors();
  const isCall  = item.type === 'CALL';
  const rowColor = isCall ? `${c.bull}08` : `${c.bear}08`;
  const tag     = tagMeta(c)[item.tag];

  return (
    <tr className="border-b transition-colors hover:brightness-125"
      style={{ borderColor: 'var(--border)', background: idx % 2 === 0 ? rowColor : 'transparent' }}>
      <td className="px-3 py-2 text-[10px] font-mono text-center w-8 shrink-0" style={{ color: 'var(--text-dimmed)' }}>{idx + 1}</td>
      <td className="px-2 py-2 w-14">
        <span className="text-[10px] font-black px-2 py-0.5 rounded"
          style={isCall ? { background: `${c.bull}18`, color: c.bull, border: `1px solid ${c.bull}28` } : { background: `${c.bear}18`, color: c.bear, border: `1px solid ${c.bear}28` }}>
          {item.type}
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>${item.strike.toFixed(0)}</td>
      <td className="px-2 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{item.expLabel}</span>
          <span className="text-[9px] font-mono" style={{ color: item.dte <= 3 ? c.bear : item.dte <= 7 ? c.warn : 'var(--text-dimmed)' }}>{item.dte}d</span>
        </div>
      </td>
      <td className="px-2 py-2">
        <span className="font-mono text-[12px] font-black" style={{ color: item.premium >= 1_000_000 ? c.primary : item.premium >= 500_000 ? c.warn : 'var(--text-primary)' }}>
          {fmtPremium(item.premium)}
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>{fmtNum(item.volume)}</td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtNum(item.oi)}</td>
      <td className="px-2 py-2">
        <span className="font-mono text-[11px] font-bold" style={{ color: item.volOiRatio >= 2 ? c.warn : item.volOiRatio >= 1 ? c.teal : 'var(--text-muted)' }}>
          {item.volOiRatio.toFixed(2)}x
        </span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: item.iv > 50 ? c.bear : item.iv > 30 ? c.warn : 'var(--text-secondary)' }}>{item.iv.toFixed(1)}%</td>
      <td className="px-2 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.delta.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{(item.gamma * 1000).toFixed(1)}</td>
      <td className="px-2 py-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.vega.toFixed(2)}</td>
      <td className="px-2 py-2 font-mono text-[10px]" style={{ color: item.theta < -0.5 ? `${c.bear}aa` : 'var(--text-muted)' }}>{item.theta.toFixed(2)}</td>
      <td className="px-2 py-2">
        <span className="text-[9px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: tag.bg, color: tag.color, border: `1px solid ${tag.color}28` }}>
          {tag.label}
        </span>
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FlowPageContent() {
  const isActive = usePageActive();
  const c = useFlowColors();

  const [symbol,     setSymbol]     = useState('QQQ');
  useTrackChartVisit(symbol, '/flow');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tagFilter,  setTagFilter]  = useState<TagFilter>('all');
  const [sortKey,    setSortKey]    = useState<SortKey>('premium');
  const [sortDesc,   setSortDesc]   = useState(true);
  const [minPremium, setMinPremium] = useState(25_000);
  const [viewTab,    setViewTab]    = useState<ViewTab>('table');

  const [flows,     setFlows]     = useState<FlowItem[]>([]);
  const [stats,     setStats]     = useState<FlowStats | null>(null);
  const [premiumByStrike, setPremiumByStrike] = useState<{ strike: number; callPremium: number; putPremium: number }[]>([]);
  const [strikeExpiry,    setStrikeExpiry]    = useState<{ strike: number; expLabel: string; dte: number; callPremium: number; putPremium: number; totalVolume: number }[]>([]);
  const [topUnusual,      setTopUnusual]      = useState<FlowItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchFlow = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ symbol, type: typeFilter, tag: tagFilter, minPremium: String(minPremium), limit: '150' });
      const res = await fetch(`/api/options-flow?${params}`, { signal: ctrl.signal });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      setFlows(data.flows ?? []);
      setStats({
        totalCallPremium: data.totalCallPremium ?? 0,
        totalPutPremium:  data.totalPutPremium  ?? 0,
        unusualCount:     data.unusualCount     ?? 0,
        total:            data.total            ?? 0,
        spotPrice:        data.spotPrice        ?? 0,
        avgSentiment:     data.avgSentiment     ?? 0,
      });
      setPremiumByStrike(data.premiumByStrike ?? []);
      setStrikeExpiry(data.strikeExpiry ?? []);
      setTopUnusual(data.topUnusual ?? []);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError((err as Error)?.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, [symbol, typeFilter, tagFilter, minPremium]);

  useEffect(() => { fetchFlow(); }, [fetchFlow]);
  useEffect(() => { if (!isActive) return; const t = setInterval(fetchFlow, 90_000); return () => clearInterval(t); }, [isActive, fetchFlow]);

  const sorted = useMemo(() => [...flows].sort((a, b) => {
    const v = (x: FlowItem) => {
      if (sortKey === 'premium')    return x.premium;
      if (sortKey === 'volume')     return x.volume;
      if (sortKey === 'volOiRatio') return x.volOiRatio;
      if (sortKey === 'iv')         return x.iv;
      if (sortKey === 'dte')        return x.dte;
      if (sortKey === 'gamma')      return x.gamma;
      if (sortKey === 'vega')       return x.vega;
      if (sortKey === 'theta')      return x.theta;
      return x.premium;
    };
    return sortDesc ? v(b) - v(a) : v(a) - v(b);
  }), [flows, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => { if (sortKey === key) setSortDesc(d => !d); else { setSortKey(key); setSortDesc(true); } };

  const SortTh = ({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) => (
    <th className={`px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap ${className}`}
      style={{ color: sortKey === k ? c.teal : 'var(--text-dimmed)' }} onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortDesc ? '↓' : '↑') : ''}
    </th>
  );

  const MIN_PREMIUM_OPTIONS = [
    { label: '$10K',  value: 10_000 },
    { label: '$25K',  value: 25_000 },
    { label: '$50K',  value: 50_000 },
    { label: '$100K', value: 100_000 },
    { label: '$250K', value: 250_000 },
    { label: '$500K', value: 500_000 },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Header ── */}
      <header className="flex flex-wrap items-center gap-2 px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* Symbol */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {SYMBOLS.map(s => (
            <button key={s} onClick={() => setSymbol(s)} className="px-2.5 py-1 text-[10px] rounded font-bold transition-all"
              style={symbol === s ? { background: `${c.teal}20`, color: c.teal } : { color: 'var(--text-dimmed)' }}>{s}</button>
          ))}
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Type */}
        <div className="flex items-center gap-1">
          {(['all', 'calls', 'puts'] as TypeFilter[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className="px-3 py-1 rounded text-[10px] font-bold capitalize transition-all"
              style={typeFilter === t
                ? t === 'calls' ? { background: `${c.bull}18`, color: c.bull } : t === 'puts' ? { background: `${c.bear}18`, color: c.bear } : { background: `${c.teal}18`, color: c.teal }
                : { color: 'var(--text-dimmed)' }
              }>{t === 'all' ? 'All' : t === 'calls' ? '↑ Calls' : '↓ Puts'}</button>
          ))}
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Tag filter */}
        <div className="flex items-center gap-1">
          {([
            { v: 'all', l: 'All Trades' }, { v: 'whale', l: 'Whale' }, { v: 'unusual', l: 'Unusual' },
            { v: 'block', l: 'Block' }, { v: 'sweep', l: 'Sweep' },
          ] as { v: TagFilter; l: string }[]).map(t => (
            <button key={t.v} onClick={() => setTagFilter(t.v)} className="px-2.5 py-1 rounded text-[10px] font-bold transition-all"
              style={tagFilter === t.v ? { background: `${c.teal}18`, color: c.teal, border: `1px solid ${c.teal}28` } : { color: 'var(--text-dimmed)', border: '1px solid transparent' }}>
              {t.l}
            </button>
          ))}
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Min Premium */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>Min</span>
          <div className="flex items-center gap-0.5">
            {MIN_PREMIUM_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setMinPremium(o.value)} className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
                style={minPremium === o.value ? { background: `${c.teal}18`, color: c.teal } : { color: 'var(--text-dimmed)' }}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* View tabs */}
        <div className="flex items-center gap-1">
          {([
            { v: 'table', l: 'Table' }, { v: 'chart', l: 'Chart' }, { v: 'heatmap', l: 'Heatmap' },
          ] as { v: ViewTab; l: string }[]).map(t => (
            <button key={t.v} onClick={() => setViewTab(t.v)} className="px-2.5 py-1 rounded text-[10px] font-bold transition-all"
              style={viewTab === t.v ? { background: `${c.teal}18`, color: c.teal } : { color: 'var(--text-dimmed)' }}>{t.l}</button>
          ))}
        </div>

        {/* Right: status + refresh */}
        <div className="ml-auto flex items-center gap-2.5">
          {lastRefresh && (
            <span className="text-[9px] font-mono hidden md:block" style={{ color: 'var(--text-dimmed)' }}>
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px]"
            style={flows.length > 0
              ? { background: `${c.teal}0e`, color: c.teal, border: `1px solid ${c.teal}22` }
              : { background: themeAlpha('--warning', 0.06), color: c.warn, border: `1px solid ${themeAlpha('--warning', 0.16)}` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: flows.length > 0 ? c.teal : c.warn }} />
            CBOE · Delayed
          </div>
          <button onClick={fetchFlow} disabled={loading}
            className="p-1.5 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={loading ? 'animate-spin' : ''}>
              <path d="M4 12C4 7.58 7.58 4 12 4c3.37 0 6.26 2.11 7.42 5" /><path d="M20 12c0 4.42-3.58 8-8 8-3.37 0-6.26-2.11-7.42-5" />
              <polyline points="20 4 20 9 15 9" /><polyline points="4 20 4 15 9 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Stats row ── */}
      {stats && <StatsRow stats={stats} symbol={symbol} />}

      {/* ── Top Unusual Cards ── */}
      {topUnusual.length > 0 && <TopUnusualCards trades={topUnusual} />}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-1.5 px-4 py-2 text-[10px] shrink-0"
          style={{ background: 'var(--bear-bg)', color: 'var(--bear)', borderBottom: '1px solid rgb(var(--bear-rgb) / 0.12)' }}>
          <AlertTriangle size={12} strokeWidth={2} /> {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && flows.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: `${c.teal}25`, borderTopColor: c.teal }} />
          <p className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Fetching {symbol} options flow from CBOE…</p>
        </div>
      )}

      {/* ── Content by tab ── */}
      {flows.length > 0 && viewTab === 'table' && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="px-3 py-2.5 text-[8.5px] uppercase tracking-wider font-semibold text-center w-8" style={{ color: 'var(--text-dimmed)' }}>#</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Type</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Strike</th>
                <SortTh label="Expiry" k="dte" />
                <SortTh label="Premium" k="premium" />
                <SortTh label="Volume" k="volume" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>OI</th>
                <SortTh label="Vol/OI" k="volOiRatio" />
                <SortTh label="IV" k="iv" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Δ</th>
                <SortTh label="Γ" k="gamma" />
                <SortTh label="V" k="vega" />
                <SortTh label="Θ" k="theta" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-dimmed)' }}>Tag</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => <FlowRow key={item.id} item={item} idx={i} />)}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2.5 border-t text-[9px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}>
            <span>{sorted.length} contracts displayed · min premium {fmtPremium(minPremium)}</span>
            <span>CBOE delayed data · not financial advice</span>
          </div>
        </div>
      )}

      {flows.length > 0 && viewTab === 'chart' && (
        <PremiumFlowChart data={premiumByStrike} spotPrice={stats?.spotPrice ?? 0} />
      )}

      {flows.length > 0 && viewTab === 'heatmap' && (
        <StrikeExpiryHeatmap data={strikeExpiry} />
      )}

      {/* ── Empty ── */}
      {!loading && flows.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Inbox size={34} strokeWidth={1.25} style={{ color: 'var(--text-dimmed)', opacity: 0.5 }} />
          <p className="text-[12px]" style={{ color: 'var(--text-dimmed)' }}>No flow matching filters for {symbol}</p>
          <button onClick={fetchFlow} className="px-4 py-2 rounded-lg text-[11px] font-bold"
            style={{ background: `${c.teal}18`, color: c.teal, border: `1px solid ${c.teal}30` }}>Retry</button>
        </div>
      )}
    </div>
  );
}
