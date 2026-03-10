'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import type { FlowItem } from '@/app/api/options-flow/route';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TEAL = '#26beaf';
const BULL = '#34d399';
const BEAR = '#f87171';
const WARN = '#fbbf24';
const GOLD = '#fbbf24';

const SYMBOLS = ['QQQ', 'SPY', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

const TAG_META: Record<FlowItem['tag'], { label: string; color: string; bg: string }> = {
  WHALE:   { label: '🐋 Whale',   color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  UNUSUAL: { label: '⚡ Unusual', color: WARN,       bg: 'rgba(251,191,36,0.10)' },
  BLOCK:   { label: '■ Block',   color: TEAL,       bg: 'rgba(38,190,175,0.10)' },
  SWEEP:   { label: '→ Sweep',   color: '#60a5fa',  bg: 'rgba(96,165,250,0.10)' },
  FLOW:    { label: '· Flow',    color: 'rgba(148,163,184,0.6)', bg: 'rgba(255,255,255,0.03)' },
};

type TypeFilter = 'all' | 'calls' | 'puts';
type TagFilter  = 'all' | 'whale' | 'unusual' | 'block' | 'sweep';
type SortKey    = 'premium' | 'volume' | 'volOiRatio' | 'iv' | 'dte';

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

// ─── Stats row ────────────────────────────────────────────────────────────────
interface FlowStats {
  totalCallPremium: number;
  totalPutPremium:  number;
  unusualCount:     number;
  total:            number;
  spotPrice:        number;
}

function StatsRow({ stats, symbol }: { stats: FlowStats; symbol: string }) {
  const totalFlow   = stats.totalCallPremium + stats.totalPutPremium;
  const callPct     = totalFlow > 0 ? (stats.totalCallPremium / totalFlow) * 100 : 50;
  const bullish     = callPct > 55;
  const bearish     = callPct < 45;
  const sentiment   = bullish ? 'Bullish' : bearish ? 'Bearish' : 'Neutral';
  const sentColor   = bullish ? BULL : bearish ? BEAR : WARN;

  return (
    <div className="flex flex-wrap items-stretch gap-0 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
      {/* Sentiment cell */}
      <div className="flex flex-col justify-center items-center px-5 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 100 }}>
        <span className="text-[8.5px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>Sentiment</span>
        <span className="text-[15px] font-black" style={{ color: sentColor }}>{sentiment}</span>
      </div>

      {/* Call/Put bar */}
      <div className="flex flex-col justify-center px-4 py-2.5 border-r flex-1 min-w-[160px]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex justify-between text-[8.5px] mb-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
          <span style={{ color: `${BULL}bb` }}>Calls {callPct.toFixed(0)}%</span>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Premium Flow</span>
          <span style={{ color: `${BEAR}bb` }}>Puts {(100 - callPct).toFixed(0)}%</span>
        </div>
        <div className="h-2.5 rounded overflow-hidden flex">
          <div style={{ width: `${callPct}%`, background: `linear-gradient(90deg, ${BULL}55, ${BULL}99)`, transition: 'width 0.6s' }} />
          <div style={{ width: `${100 - callPct}%`, background: `linear-gradient(90deg, ${BEAR}99, ${BEAR}55)`, transition: 'width 0.6s' }} />
        </div>
      </div>

      {/* Metric cells */}
      {[
        { l: 'Call Flow',  v: fmtPremium(stats.totalCallPremium), c: `${BULL}cc` },
        { l: 'Put Flow',   v: fmtPremium(stats.totalPutPremium),  c: `${BEAR}cc` },
        { l: 'Unusual',    v: `${stats.unusualCount}`,             c: WARN },
        { l: 'Contracts',  v: `${stats.total}`,                    c: 'rgba(255,255,255,0.5)' },
        { l: `${symbol}`,  v: stats.spotPrice > 0 ? `$${stats.spotPrice.toFixed(2)}` : '—', c: TEAL },
      ].map(m => (
        <div key={m.l} className="flex flex-col justify-center items-center px-4 py-2.5 border-r" style={{ borderColor: 'var(--border)', minWidth: 72 }}>
          <span className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>{m.l}</span>
          <span className="font-mono text-[13px] font-black" style={{ color: m.c }}>{m.v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function FlowRow({ item, idx }: { item: FlowItem; idx: number }) {
  const isCall  = item.type === 'CALL';
  const rowColor = isCall ? `${BULL}08` : `${BEAR}08`;
  const tag     = TAG_META[item.tag];

  return (
    <tr
      className="border-b transition-colors hover:brightness-125"
      style={{ borderColor: 'rgba(255,255,255,0.04)', background: idx % 2 === 0 ? rowColor : 'transparent' }}
    >
      {/* # */}
      <td className="px-3 py-2 text-[10px] font-mono text-center w-8 shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>
        {idx + 1}
      </td>

      {/* Type */}
      <td className="px-2 py-2 w-14">
        <span
          className="text-[10px] font-black px-2 py-0.5 rounded"
          style={isCall
            ? { background: `${BULL}18`, color: BULL, border: `1px solid ${BULL}28` }
            : { background: `${BEAR}18`, color: BEAR, border: `1px solid ${BEAR}28` }
          }
        >
          {item.type}
        </span>
      </td>

      {/* Strike */}
      <td className="px-2 py-2 font-mono text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
        ${item.strike.toFixed(0)}
      </td>

      {/* Expiry + DTE */}
      <td className="px-2 py-2">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>{item.expLabel}</span>
          <span className="text-[9px] font-mono" style={{ color: item.dte <= 3 ? BEAR : item.dte <= 7 ? WARN : 'rgba(255,255,255,0.3)' }}>
            {item.dte}d
          </span>
        </div>
      </td>

      {/* Premium */}
      <td className="px-2 py-2">
        <span
          className="font-mono text-[12px] font-black"
          style={{ color: item.premium >= 1_000_000 ? '#c084fc' : item.premium >= 500_000 ? WARN : 'rgba(255,255,255,0.85)' }}
        >
          {fmtPremium(item.premium)}
        </span>
      </td>

      {/* Volume */}
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
        {fmtNum(item.volume)}
      </td>

      {/* OI */}
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
        {fmtNum(item.oi)}
      </td>

      {/* Vol/OI */}
      <td className="px-2 py-2">
        <span
          className="font-mono text-[11px] font-bold"
          style={{ color: item.volOiRatio >= 2 ? WARN : item.volOiRatio >= 1 ? TEAL : 'rgba(255,255,255,0.4)' }}
        >
          {item.volOiRatio.toFixed(2)}x
        </span>
      </td>

      {/* IV */}
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: item.iv > 50 ? BEAR : item.iv > 30 ? WARN : 'rgba(255,255,255,0.6)' }}>
        {item.iv.toFixed(1)}%
      </td>

      {/* Delta */}
      <td className="px-2 py-2 font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {item.delta.toFixed(2)}Δ
      </td>

      {/* Tag */}
      <td className="px-2 py-2">
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: tag.bg, color: tag.color, border: `1px solid ${tag.color}28` }}
        >
          {tag.label}
        </span>
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function FlowPageContent() {
  const isActive = usePageActive();

  const [symbol,     setSymbol]     = useState('QQQ');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [tagFilter,  setTagFilter]  = useState<TagFilter>('all');
  const [sortKey,    setSortKey]    = useState<SortKey>('premium');
  const [sortDesc,   setSortDesc]   = useState(true);
  const [minPremium, setMinPremium] = useState(25_000);

  const [flows,     setFlows]     = useState<FlowItem[]>([]);
  const [stats,     setStats]     = useState<FlowStats | null>(null);
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
      const params = new URLSearchParams({
        symbol,
        type:       typeFilter,
        tag:        tagFilter,
        minPremium: String(minPremium),
        limit:      '150',
      });
      const res = await fetch(`/api/options-flow?${params}`, { signal: ctrl.signal });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFlows(data.flows ?? []);
      setStats({
        totalCallPremium: data.totalCallPremium ?? 0,
        totalPutPremium:  data.totalPutPremium  ?? 0,
        unusualCount:     data.unusualCount     ?? 0,
        total:            data.total            ?? 0,
        spotPrice:        data.spotPrice        ?? 0,
      });
      setLastRefresh(new Date());
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      setError((err as Error)?.message || 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, [symbol, typeFilter, tagFilter, minPremium]);

  // Refetch when filters change
  useEffect(() => { fetchFlow(); }, [fetchFlow]);

  // Auto-refresh every 90s when page is active
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(fetchFlow, 90_000);
    return () => clearInterval(t);
  }, [isActive, fetchFlow]);

  // Sort
  const sorted = [...flows].sort((a, b) => {
    const v = (x: FlowItem) => {
      if (sortKey === 'premium')    return x.premium;
      if (sortKey === 'volume')     return x.volume;
      if (sortKey === 'volOiRatio') return x.volOiRatio;
      if (sortKey === 'iv')         return x.iv;
      if (sortKey === 'dte')        return x.dte;
      return x.premium;
    };
    return sortDesc ? v(b) - v(a) : v(a) - v(b);
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  const SortTh = ({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) => (
    <th
      className={`px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap ${className}`}
      style={{ color: sortKey === k ? TEAL : 'rgba(255,255,255,0.28)' }}
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortDesc ? '↓' : '↑') : ''}
    </th>
  );

  const MIN_PREMIUM_OPTIONS = [
    { label: '$10K',  value: 10_000  },
    { label: '$25K',  value: 25_000  },
    { label: '$50K',  value: 50_000  },
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
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className="px-2.5 py-1 text-[10px] rounded font-bold transition-all"
              style={symbol === s
                ? { background: `${TEAL}20`, color: TEAL }
                : { color: 'rgba(255,255,255,0.28)' }
              }
            >
              {s}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Type tabs */}
        <div className="flex items-center gap-1">
          {(['all', 'calls', 'puts'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className="px-3 py-1 rounded text-[10px] font-bold capitalize transition-all"
              style={typeFilter === t
                ? t === 'calls' ? { background: `${BULL}18`, color: BULL }
                : t === 'puts'  ? { background: `${BEAR}18`, color: BEAR }
                : { background: `${TEAL}18`, color: TEAL }
                : { color: 'rgba(255,255,255,0.3)', background: 'transparent' }
              }
            >
              {t === 'all' ? 'All' : t === 'calls' ? '↑ Calls' : '↓ Puts'}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Tag filter */}
        <div className="flex items-center gap-1">
          {([
            { v: 'all',     l: 'All Trades' },
            { v: 'whale',   l: '🐋 Whale'   },
            { v: 'unusual', l: '⚡ Unusual'  },
            { v: 'block',   l: '■ Block'    },
            { v: 'sweep',   l: '→ Sweep'    },
          ] as { v: TagFilter; l: string }[]).map(t => (
            <button
              key={t.v}
              onClick={() => setTagFilter(t.v)}
              className="px-2.5 py-1 rounded text-[10px] font-bold transition-all"
              style={tagFilter === t.v
                ? { background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}28` }
                : { color: 'rgba(255,255,255,0.3)', border: '1px solid transparent' }
              }
            >
              {t.l}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-5 shrink-0" style={{ background: 'var(--border)' }} />

        {/* Min Premium */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Min</span>
          <div className="flex items-center gap-0.5">
            {MIN_PREMIUM_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setMinPremium(o.value)}
                className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
                style={minPremium === o.value
                  ? { background: `${TEAL}18`, color: TEAL }
                  : { color: 'rgba(255,255,255,0.25)' }
                }
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right side: status + refresh */}
        <div className="ml-auto flex items-center gap-2.5">
          {lastRefresh && (
            <span className="text-[9px] font-mono hidden md:block" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px]"
            style={flows.length > 0
              ? { background: `${TEAL}0e`, color: TEAL, border: `1px solid ${TEAL}22` }
              : { background: 'rgba(251,191,36,0.06)', color: WARN, border: '1px solid rgba(251,191,36,0.16)' }
            }
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: flows.length > 0 ? TEAL : WARN }} />
            CBOE · Delayed
          </div>
          <button
            onClick={fetchFlow}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'rgba(255,255,255,0.4)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
              className={loading ? 'animate-spin' : ''}>
              <path d="M4 12C4 7.58 7.58 4 12 4c3.37 0 6.26 2.11 7.42 5" />
              <path d="M20 12c0 4.42-3.58 8-8 8-3.37 0-6.26-2.11-7.42-5" />
              <polyline points="20 4 20 9 15 9" />
              <polyline points="4 20 4 15 9 15" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Stats row ── */}
      {stats && <StatsRow stats={stats} symbol={symbol} />}

      {/* ── Error ── */}
      {error && (
        <div className="px-4 py-2 text-[10px] shrink-0"
          style={{ background: 'rgba(248,113,113,0.06)', color: BEAR, borderBottom: '1px solid rgba(248,113,113,0.12)' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && flows.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-7 h-7 border-2 rounded-full animate-spin"
            style={{ borderColor: `${TEAL}25`, borderTopColor: TEAL }} />
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Fetching {symbol} options flow from CBOE…
          </p>
        </div>
      )}

      {/* ── Table ── */}
      {flows.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
              <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <th className="px-3 py-2.5 text-[8.5px] uppercase tracking-wider font-semibold text-center w-8"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>#</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>Type</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>Strike</th>
                <SortTh label="Expiry" k="dte" />
                <SortTh label="Premium" k="premium" />
                <SortTh label="Volume" k="volume" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>OI</th>
                <SortTh label="Vol/OI" k="volOiRatio" />
                <SortTh label="IV" k="iv" />
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>Delta</th>
                <th className="px-2 py-2.5 text-left text-[8.5px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgba(255,255,255,0.28)' }}>Tag</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <FlowRow key={item.id} item={item} idx={i} />
              ))}
            </tbody>
          </table>

          {/* Footer info */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t text-[9px]"
            style={{ borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)' }}>
            <span>{sorted.length} contracts displayed · min premium {fmtPremium(minPremium)}</span>
            <span>CBOE delayed data · not financial advice</span>
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && flows.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="text-4xl opacity-10">📊</span>
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            No flow matching filters for {symbol}
          </p>
          <button
            onClick={fetchFlow}
            className="px-4 py-2 rounded-lg text-[11px] font-bold"
            style={{ background: `${TEAL}18`, color: TEAL, border: `1px solid ${TEAL}30` }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
