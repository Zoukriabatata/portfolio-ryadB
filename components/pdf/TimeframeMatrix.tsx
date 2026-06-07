'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TfRow {
  tool: string;
  color: string;
  scalping: TfCell;
  intraday: TfCell;
  swing: TfCell;
  ideal: string;
  why: string;
}

interface TfCell {
  tf: string;
  rating: 1 | 2 | 3; // 1=ok, 2=good, 3=best
  note: string;
}

interface IdeaCard {
  tool: string;
  color: string;
  ideas: string[];
}

/* ------------------------------------------------------------------ */
/*  Data — Timeframe matrix                                            */
/* ------------------------------------------------------------------ */

const TF_ROWS: TfRow[] = [
  {
    tool: 'CVD',
    color: 'var(--accent)',
    scalping: {
      tf: '1s–15s tick chart',
      rating: 3,
      note: 'Tick-level CVD captures Hawkes cascades in real time. The info dissipates in ~10ms (Jonuzaj) — this is the native timeframe of CVD.',
    },
    intraday: {
      tf: '1min–5min',
      rating: 2,
      note: 'CVD/price divergences on 5min are the most actionable. The signal-to-noise ratio is optimal because Hawkes child orders (ρ≈0.5) have time to play out.',
    },
    swing: {
      tf: '15min–1h',
      rating: 1,
      note: 'Aggregated CVD loses granularity. Use cumulative session CVD rather than per-candle CVD. Cumulative delta over 4h+ reveals the institutional bias.',
    },
    ideal: '1min–5min (intraday) / Tick (scalp)',
    why: 'OFI is linearly predictive at high frequency (Cont et al.). Beyond 15min, the Hawkes signal is diluted by the natural mean-reversion of the flow (Nutz-Webster-Zhao).',
  },
  {
    tool: 'Volume Profile',
    color: '#a78bfa',
    scalping: {
      tf: '30s–1min bins',
      rating: 1,
      note: 'Too little volume per bin to build a reliable profile. Use the running session profile as an overlay rather than a per-candle profile.',
    },
    intraday: {
      tf: '5min–30min composites',
      rating: 3,
      note: 'The 30min composite profile captures intraday POC/VAH/VAL with enough data. The U-shaped volume pattern (Harris, Schlie) is visible and tradable.',
    },
    swing: {
      tf: 'Daily / Weekly composites',
      rating: 2,
      note: 'The weekly profile identifies multi-day fair value zones. The weekly POC = key institutional level. Recalibrate λ monthly (Coxon).',
    },
    ideal: '30min composite (intraday) / Daily (swing)',
    why: 'The volume profile requires a large enough sample for statistical convergence. Markov stationary distributions (Luwang) show that 30min is the minimum for a meaningful profile on futures.',
  },
  {
    tool: 'Absorption',
    color: '#f59e0b',
    scalping: {
      tf: '5s–30s',
      rating: 3,
      note: 'Absorption is an ultra-short-term phenomenon. Impact decay is 5-15min (propagator). Detect at the tick, act on 30s-1min.',
    },
    intraday: {
      tf: '1min–5min',
      rating: 2,
      note: 'Absorption on 5min confirms support/resistance levels. Cross-check with intraday λ: absorption during high-volume hours (open/close) = more reliable.',
    },
    swing: {
      tf: '15min–1h',
      rating: 1,
      note: 'Absorption gets diluted in aggregated volume. On 1h, the signal is drowned out. Use the volume profile instead to identify swing zones of interest.',
    },
    ideal: '5s–1min (detection) → 5min (confirmation)',
    why: 'The propagator kernel G(τ) = G₀·e^{-τ/τ₀} with τ₀ ≈ 5-15min (Coxon, Veldman). Absorption must be detected within this window, otherwise the signal has expired.',
  },
  {
    tool: 'DOM / Depth',
    color: '#06b6d4',
    scalping: {
      tf: 'Tick / 1s refresh',
      rating: 3,
      note: 'The DOM is tick-native. The Markov transition matrix (Luwang) shows that price inertia changes at every transition — the tick DOM is the only one that captures this.',
    },
    intraday: {
      tf: '1min snapshots',
      rating: 2,
      note: '1min DOM snapshots show how walls evolve. The 60-90% cancellation rate (Prenzel) makes the instantaneous DOM misleading — averaged snapshots are more stable.',
    },
    swing: {
      tf: 'Aggregated / Useless',
      rating: 1,
      note: 'The DOM is a real-time tool. Its information content decays over time (Jonuzaj). Beyond 15min, the DOM has no predictive value — use the volume profile.',
    },
    ideal: 'Tick / 1s (real-time reading)',
    why: 'The DOM is the instantaneous order book. Its information dissipates in ~10ms in equities (Jonuzaj). It is intrinsically a scalping / tape reading tool.',
  },
  {
    tool: 'Heatmap',
    color: '#ef4444',
    scalping: {
      tf: '1s–5s refresh',
      rating: 2,
      note: 'A fast-refreshing heatmap shows liquidity pulls/adds in real time. But spoofing patterns appear/disappear too quickly to be confirmed.',
    },
    intraday: {
      tf: '1min–5min accumulation',
      rating: 3,
      note: 'The 5min heatmap accumulates enough data to see real liquidity clusters. The Samuelson effect (Chatziandreou) is visible: density rising into the close.',
    },
    swing: {
      tf: '15min–1h composites',
      rating: 2,
      note: 'The composite heatmap shows structural liquidity zones. Walls persisting over several hours = real institutional levels (not spoofing).',
    },
    ideal: '5min accumulation (intraday) / 1s (scalp confirm)',
    why: 'The heatmap is the visual overlay of the DOM over time. The propagator decay (τ₀ ≈ 5-15min) dictates the useful window. On 5min, clusters that persist are statistically significant.',
  },
  {
    tool: 'TWAP / VWAP',
    color: '#10b981',
    scalping: {
      tf: 'Session VWAP',
      rating: 2,
      note: 'The session VWAP is a scalping benchmark. Price vs VWAP shows whether aggressive buyers or sellers dominate the session.',
    },
    intraday: {
      tf: 'Session VWAP + developing VWAP',
      rating: 3,
      note: 'The developing VWAP is the institutional benchmark par excellence (de Witt). VWAP reclaims/rejections are the most reliable intraday signals.',
    },
    swing: {
      tf: 'Weekly/Monthly VWAP anchored',
      rating: 2,
      note: 'The VWAP anchored to the start of the week/month shows the average cost of recent positions. Price below the monthly VWAP = most recent positions are underwater.',
    },
    ideal: 'Session VWAP developing (intraday)',
    why: 'The VWAP is the universal execution benchmark (Almgren-Chriss, de Witt). Implementation Shortfall is measured vs VWAP / arrival price. Institutions trade TOWARD the VWAP — it pulls price in.',
  },
];

/* ------------------------------------------------------------------ */
/*  Data — Ideas per tool                                              */
/* ------------------------------------------------------------------ */

const IDEAS: IdeaCard[] = [
  {
    tool: 'CVD',
    color: 'var(--accent)',
    ideas: [
      'Filter CVD by lot size: "large-lot" CVD (>50 contracts) vs "small-lot" CVD (<5). The divergence between the two reveals institutional vs retail flow.',
      'CVD velocity: the derivative of CVD (rate of change) is more predictive than raw CVD. An accelerating CVD = Hawkes cascade in progress, a decelerating CVD = end of cascade.',
      'Multi-timeframe CVD: compare 1min CVD vs 15min CVD. If both diverge from price = high conviction. If only the 1min diverges = short-term noise.',
      'CVD session reset: don\'t accumulate CVD over 24h. Resetting at each session (Asia, London, NY) gives a cleaner signal because participants change.',
      'CVD + options OFI: cross futures CVD with options order imbalance. +1σ of options OFI = +1% next-day return (Muravyev). Double confirmation.',
      'CVD alert: trigger an alert when CVD deviates >2σ from its 30min moving average. Statistically, 95% of major reversals are preceded by a CVD divergence >2σ.',
    ],
  },
  {
    tool: 'Volume Profile',
    color: '#a78bfa',
    ideas: [
      'Developing composite profile: display the profile being built in real time during the session. A migrating POC = the market searching for a new fair value.',
      'Naked POC scanner: flag prior-day POCs that have NOT been retested. These are statistical "magnets" — price returns to them with high probability.',
      'Volume Profile + time: color the profile by WHEN the volume was traded (start vs end of session). Closing volume carries more weight (Luwang: the close = a distinct phase).',
      'VAH/VAL as zones, not lines: use ±1 tick around VAH/VAL. The Markov stationary distribution shows that prices "oscillate" around these levels.',
      'Volume profile by day of week: some volume patterns are recurring (Friday = positioning, Monday = gap fill). Commonality factor (Cucuringu).',
      'Delta Profile: instead of total volume, display the delta (buy-sell) per price level. Levels with extreme delta = zones of past one-directional aggression.',
    ],
  },
  {
    tool: 'Absorption',
    color: '#f59e0b',
    ideas: [
      'Real-time absorption score: ratio of (volume traded at the level) / (price movement). A ratio >5x normal = active absorption. Based on the square-root law (δ≈0.5).',
      'Absorption timer: once detected, display a countdown based on the propagator decay (τ₀ ≈ 10min). Absorption loses relevance after τ₀ — trade before it or skip it.',
      'Absorption vs exhaustion: distinguish absorption (passive buyers stepping in) from exhaustion (aggressors running out of steam). Key: absorption has a diverging CVD, exhaustion has a flattening CVD.',
      'Absorption heatmap: overlay an "absorption zones" layer on the standard heatmap. Color in gold the levels where the volume/movement ratio is >3σ above the mean.',
      'Multi-level absorption: absorption at 1 level = weak. Across 3+ consecutive levels = strong (an institution with a target price range). Matches a TWAP iceberg.',
      'Absorption + spread: monitor the spread during absorption. Stable spread + absorption = confident market maker. Widening spread + absorption = toxic flow (Doshi et al.).',
    ],
  },
  {
    tool: 'DOM / Depth',
    color: '#06b6d4',
    ideas: [
      'Rolling DOM imbalance ratio: (bid depth - ask depth) / (bid depth + ask depth) over the top 5 levels. Update at the tick. A ratio >0.3 or <-0.3 = strong imbalance.',
      'DOM persistence score: track how long a wall stays in place. Walls persisting >2 min are "real" (60-90% of orders are cancelled in <1min — Prenzel).',
      'DOM velocity: the rate at which orders are added/removed from the DOM. A "fast" DOM (high modification rate) = nervous market makers = imminent volatility.',
      'DOM asymmetry by time: the ask side enters its Pre-Close phase BEFORE the bid (Luwang). Display a "bid-ask temporal asymmetry" indicator that alerts on this phenomenon.',
      'DOM + trade size filter: orders <5 lots in the DOM are HFT noise. Filtering to show only orders >20 lots gives a more readable "institutional" DOM.',
      'Iceberg reconstruction: when a bid level is consumed but immediately reloads at the same price = probable iceberg order. Count the "reloads" as an indicator of hidden size.',
    ],
  },
  {
    tool: 'Heatmap',
    color: '#ef4444',
    ideas: [
      'Delta heatmap: instead of showing total volume per cell (price × time), show the delta (bid-ask). Red zones = sellers dominate, green = buyers dominate.',
      'Liquidity flow arrows: add directional arrows on the heatmap showing the migration of liquidity walls. If ask walls move down = progressive selling pressure.',
      'Heatmap decay overlay: overlay the exponential decay kernel G(τ) on the heatmap. Recent zones weigh more than older ones — a time-weighted heatmap.',
      'Heatmap + VWAP line: draw the session VWAP on the heatmap. Liquidity clusters AROUND the VWAP = confirmed fair value. Clusters FAR from the VWAP = target prices.',
      '"Wall pull" alert: trigger an alert when a wall of >500 lots disappears in <500ms. It is a spoofing/repositioning signal with an action window of ~5-10 min.',
      'Heatmap "memory" mode: let you see walls that WERE there but were pulled (ghost liquidity). Levels that are frequently "ghosted" = recurring spoofing levels.',
    ],
  },
  {
    tool: 'TWAP / VWAP',
    color: '#10b981',
    ideas: [
      'VWAP bands: draw the ±1σ and ±2σ bands around the VWAP. Price at ±2σ = statistical extreme, high probability of mean-reversion toward the VWAP.',
      'TWAP detector: scan the tape for regular execution patterns (constant volume every X seconds). TWAPs are detectable via FFT (Chen-Horst-Tran).',
      'VWAP slope: the slope of the VWAP indicates the institutional bias. Rising VWAP = buying is weighted toward higher prices. Flat VWAP = neutral distribution.',
      'Multiple session VWAPs: display the Asia, London, NY VWAPs simultaneously. Convergence of 2+ VWAPs = an ultra-strong level. Divergence = regime change.',
      'VWAP reclaim/reject counter: count how many times price crosses the VWAP during the session. <3 crossings = strong trend. >8 crossings = range/chop.',
      'Implementation Shortfall tracker: compute your IS vs the VWAP in real time. Show whether your execution beats or lags the institutional benchmark.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Rating display                                                     */
/* ------------------------------------------------------------------ */

const RATING_LABELS = ['', '○ Usable', '◉ Good', '★ Optimal'] as const;
const RATING_COLORS = ['', 'var(--text-tertiary)', '#a78bfa', '#22c55e'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function TimeframeMatrix() {
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null);

  return (
    <>
      {/* ── Timeframe Matrix ── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Ideal Timeframe by Tool & Confluence
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Based on the statistical properties of each tool (Hawkes decay, Markov convergence, propagator kernel, etc.)
          </p>
        </div>

        <div className="space-y-4">
          {TF_ROWS.map((row) => (
            <div
              key={row.tool}
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {/* Tool header */}
              <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: row.color }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.tool}</span>
                </div>
                <span className="rounded px-2 py-0.5 text-[10px] font-bold" style={{ background: `${row.color}22`, color: row.color }}>
                  IDEAL: {row.ideal}
                </span>
              </div>

              {/* 3 columns: scalping / intraday / swing */}
              <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: 'var(--border)' }}>
                {(['scalping', 'intraday', 'swing'] as const).map((style) => {
                  const cell = row[style];
                  return (
                    <div key={style} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                          {style}
                        </span>
                        <span className="text-[10px] font-bold" style={{ color: RATING_COLORS[cell.rating] }}>
                          {RATING_LABELS[cell.rating]}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold" style={{ color: row.color }}>
                        {cell.tf}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {cell.note}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Why */}
              <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Why: </span>
                  {row.why}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ideas per tool ── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Implementation Ideas by Tool
          </h2>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            36 concrete ideas drawn from the papers to improve each tool on your platform.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {IDEAS.map((card) => {
            const isOpen = expandedIdea === card.tool;
            return (
              <div
                key={card.tool}
                className="overflow-hidden rounded-xl border transition-all"
                style={{
                  borderColor: isOpen ? card.color : 'var(--border)',
                  background: 'var(--surface)',
                }}
              >
                <button
                  onClick={() => setExpandedIdea(isOpen ? null : card.tool)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: card.color }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {card.tool}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: 'var(--border)', color: 'var(--text-tertiary)' }}>
                      {card.ideas.length} ideas
                    </span>
                  </div>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ color: 'var(--text-tertiary)', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="space-y-2 border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--border)' }}>
                    {card.ideas.map((idea, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: `${card.color}22`, color: card.color }}>
                          {i + 1}
                        </span>
                        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          {idea}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
