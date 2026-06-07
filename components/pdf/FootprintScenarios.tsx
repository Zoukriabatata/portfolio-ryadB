'use client';

import { useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FootprintRow {
  price: string;
  bidVol: number;
  askVol: number;
  delta: number;
  highlight?: 'absorption' | 'imbalance' | 'poc' | 'entry' | 'target' | 'stop';
}

interface Scenario {
  id: string;
  name: string;
  type: 'long' | 'short';
  timeframe: string;
  confluence: string[];
  description: string;
  setup: string;
  entry: string;
  target: string;
  stop: string;
  rows: FootprintRow[];
  annotations: string[];
  sources: SourceRef[];
}

interface SourceRef {
  paper: string;
  page: string;
  figure?: string;
  insight: string;
}

/* ------------------------------------------------------------------ */
/*  Scenario data                                                      */
/* ------------------------------------------------------------------ */

const SCENARIOS: Scenario[] = [
  {
    id: 'absorption-long',
    name: 'Absorption Long — Bid Absorption at Support',
    type: 'long',
    timeframe: '5min footprint + 1min DOM',
    confluence: ['Absorption', 'CVD', 'Volume Profile', 'Heatmap'],
    description:
      'Heavy selling volume absorbed by passive limit orders at the bid. Price won\'t drop despite the pressure. CVD diverges (falls then stabilizes). The heatmap shows a bid wall that holds.',
    setup:
      'Price tags a high-volume level (session POC or profile VAL). The heatmap shows a dense zone at the bid. CVD stops falling despite aggressive market sells.',
    entry: 'When footprint delta flips positive on the candle AFTER the absorption (confirmation). Enter above the high of the absorption candle.',
    target: 'Session POC or profile VAH (first volume resistance level). Typically 1:2 or 1:3 R:R.',
    stop: 'Below the low of the absorption zone (where passive buyers were holding). If the wall gives way, the setup is invalidated.',
    rows: [
      { price: '45,250', bidVol: 120, askVol: 340, delta: -220, highlight: 'target' },
      { price: '45,245', bidVol: 180, askVol: 280, delta: -100 },
      { price: '45,240', bidVol: 250, askVol: 310, delta: -60 },
      { price: '45,235', bidVol: 420, askVol: 290, delta: 130, highlight: 'entry' },
      { price: '45,230', bidVol: 890, askVol: 850, delta: 40, highlight: 'poc' },
      { price: '45,225', bidVol: 1240, askVol: 380, delta: 860, highlight: 'absorption' },
      { price: '45,220', bidVol: 1580, askVol: 420, delta: 1160, highlight: 'absorption' },
      { price: '45,215', bidVol: 980, askVol: 350, delta: 630, highlight: 'stop' },
    ],
    annotations: [
      'Rows 45,220-45,225 show the absorption: bid vol >> ask vol despite the selling pressure.',
      'Cumulative delta across these levels is strongly positive = passive buyers stepping in heavily.',
      'Concave impact (√V law): 1580+1240 = 2820 lots absorbed but price moves only 2 ticks.',
      'Hawkes decay: the impact of this absorption dissipates in ~10 min — act within that window.',
    ],
    sources: [
      { paper: 'Coxon (2023)', page: 'Ch.5 p.36-44', figure: 'Fig 5.6', insight: 'Optimal execution with a time-varying intraday λ — absorption zones line up with the troughs of λ (high liquidity).' },
      { paper: 'Veldman (2024)', page: 'Ch.4 p.27-33', figure: 'Fig 4.2', insight: 'Two-stage impact decay: fast (seconds) then slow (minutes). The "hole" in the heatmap after absorption fills back in 2 phases.' },
      { paper: 'Chen-Horst-Tran (2023)', page: 'Section 2, p.4-6', insight: 'The ratio ρ = 0.3-0.7 means 30-70% of visible volume is "child orders" triggered by the absorption — the true passive volume is even larger.' },
      { paper: 'Nutz-Webster-Zhao (2025)', page: 'Section 3, p.8-12', insight: 'Internalization: 40-60% of the flow is netted internally (CRB). The absorption visible on the tape underestimates the true institutional interest.' },
    ],
  },
  {
    id: 'imbalance-short',
    name: 'Selling Imbalance Short — Ask Stacking',
    type: 'short',
    timeframe: '3min footprint + 15s DOM',
    confluence: ['CVD', 'DOM', 'Absorption', 'TWAP detection'],
    description:
      'The footprint shows a massive imbalance on the ask side (aggressive sellers) while CVD plunges. The DOM shows ask orders stacking up without being consumed. The heatmap shows ask walls stepping down progressively.',
    setup:
      'After a rally, price reaches the profile VAH. CVD starts to diverge (price up, CVD flat/down). The footprint shows 300%+ sell imbalances across several levels.',
    entry: 'Below the low of the candle that shows 3+ consecutive sell-imbalance levels. Confirmed by a growing negative CVD.',
    target: 'Current session POC. If momentum is strong, extend to the VAL. The impact decay (τ₀ ≈ 10min) sets the timing.',
    stop: 'Above the high of the imbalance zone. Invalidation if CVD flips back positive.',
    rows: [
      { price: '45,280', bidVol: 150, askVol: 120, delta: 30, highlight: 'stop' },
      { price: '45,275', bidVol: 90, askVol: 680, delta: -590, highlight: 'imbalance' },
      { price: '45,270', bidVol: 110, askVol: 720, delta: -610, highlight: 'imbalance' },
      { price: '45,265', bidVol: 80, askVol: 950, delta: -870, highlight: 'imbalance' },
      { price: '45,260', bidVol: 200, askVol: 580, delta: -380, highlight: 'entry' },
      { price: '45,255', bidVol: 350, askVol: 400, delta: -50 },
      { price: '45,250', bidVol: 480, askVol: 380, delta: 100, highlight: 'poc' },
      { price: '45,240', bidVol: 300, askVol: 250, delta: 50, highlight: 'target' },
    ],
    annotations: [
      'Levels 45,265-45,275: ask vol 7-10x the bid vol = massive sell imbalance.',
      'Cumulative delta is -2070 across 3 levels — extreme selling pressure.',
      'Session CVD shows a divergence: price at the same level as 20min ago but CVD at -3000.',
      'Hawkes cross-excitation: these aggressive sells will trigger more sells (ρ ≈ 0.5) — a cascade is likely.',
    ],
    sources: [
      { paper: 'Anantha & Jain (2024)', page: 'Section 4, p.7-9', insight: 'The bivariate Hawkes kernel shows that aggressive sells have stronger cross-excitation than buys. Bearish cascades are statistically more violent.' },
      { paper: 'Luwang et al. (2026)', page: 'Section 4.3, Table 4', insight: 'States S1-S3 (aggressive sell): mean recurrence time of 15-30 transitions. When it happens, it is rare but impactful.' },
      { paper: 'Jonuzaj et al. (2024)', page: 'Section 5, p.12-15', insight: 'Trade-flow information persists longer than book information. The footprint\'s sell-imbalance signal is more reliable than the DOM alone.' },
      { paper: 'Doshi et al. (2025)', page: 'Section 4, p.18-22', insight: 'Flow volatility (not the flow itself) predicts spread widening. A sell-imbalance spike = high flow volatility = spreads are about to widen.' },
    ],
  },
  {
    id: 'cvd-divergence-long',
    name: 'CVD Divergence Long — Hidden Accumulation',
    type: 'long',
    timeframe: '15min footprint + 5min CVD',
    confluence: ['CVD', 'Volume Profile', 'Heatmap', 'TWAP/VWAP'],
    description:
      'Price prints lower lows but CVD prints higher lows. Someone is accumulating quietly (probably via TWAP/iceberg). The heatmap shows ask walls being consumed without price rising — buys are absorbed by sellers who keep stepping back.',
    setup:
      'On 15min: price grinds down in a staircase while CVD stays flat or rises. The volume profile shows a POC forming at the bottom of the range. The heatmap shows ask walls moving higher.',
    entry: 'Break of the range high + CVD accelerating. Confirmation: the 5min footprint shows a delta flip (negative → positive). Enter on the retest of the breakout.',
    target: '1.5x-2x extension of the height of the accumulation range. The session VWAP as an intermediate level.',
    stop: 'Below the POC of the accumulation zone. If price returns under the POC = the accumulation has failed.',
    rows: [
      { price: '45,200', bidVol: 450, askVol: 380, delta: 70, highlight: 'target' },
      { price: '45,195', bidVol: 520, askVol: 410, delta: 110 },
      { price: '45,190', bidVol: 380, askVol: 350, delta: 30, highlight: 'entry' },
      { price: '45,185', bidVol: 610, askVol: 590, delta: 20 },
      { price: '45,180', bidVol: 780, askVol: 750, delta: 30, highlight: 'poc' },
      { price: '45,175', bidVol: 650, askVol: 680, delta: -30 },
      { price: '45,170', bidVol: 580, askVol: 620, delta: -40 },
      { price: '45,165', bidVol: 520, askVol: 540, delta: -20, highlight: 'stop' },
    ],
    annotations: [
      'Near-neutral delta on each level (±30) despite high volume = TWAP/iceberg accumulation.',
      'The POC forms at the bottom (45,180) = price "acceptance" — the market finds a fair value.',
      'Session CVD: +2400 despite falling prices = a classic bullish divergence.',
      'Chen-Horst-Tran: TWAP patterns are detectable via FFT. This "too regular" flow is an institutional.',
    ],
    sources: [
      { paper: 'Chen-Horst-Tran (2023)', page: 'Section 1, p.3', insight: 'TWAP/VWAP patterns leave a signature detectable via FFT (constant blips in the volume). A CVD rising steadily on a price decline = a TWAP buy.' },
      { paper: 'Cucuringu et al. (2025)', page: 'Section 4, p.12-18', figure: 'Fig 3-5', insight: 'Volume commonality (a cross-stock factor) helps distinguish "natural" volume from algorithmic execution volume. Abnormal volume on a single instrument = probable institutional execution.' },
      { paper: 'de Witt & Pakkanen (2026)', page: 'Section 2.1.2, p.4-5', figure: 'Fig 2', insight: 'The propagator kernel shows that TWAP accumulation creates a weak transient impact but a cumulative permanent one. The CVD divergence measures exactly that hidden permanent impact.' },
      { paper: 'Tiwari (2025)', page: 'Section 3, p.8-12', insight: 'The Hawkes-LQ controller decomposes the strategy into baseline + trend-following + dynamic. TWAP flow maps to the "baseline" — CVD spikes to the "dynamic" component.' },
    ],
  },
  {
    id: 'dom-trap-short',
    name: 'DOM Spoofing Trap — Fake Wall Short',
    type: 'short',
    timeframe: '1min footprint + tick DOM',
    confluence: ['DOM', 'Heatmap', 'CVD', 'Absorption'],
    description:
      'A massive bid wall appears in the DOM/heatmap, luring longs in. But the wall is pulled (spoof) as soon as price approaches it. CVD shows that real market buys don\'t follow. The footprint shows that the bid activity is passive (not aggressive).',
    setup:
      'A bid wall of 2000+ lots visible across 2-3 levels. The heatmap lights up dense green. BUT: CVD doesn\'t rise proportionally and footprint deltas stay weak/negative on the up candles.',
    entry: 'When the wall disappears (pull) + the footprint shows a negative delta flip. Short at market with the momentum.',
    target: 'Nearest volume profile level below (POC or VAL). The decay of the pull\'s impact = an opportunity window of ~5 min.',
    stop: 'Above the price where the wall was sitting. If the wall comes back and CVD confirms = invalidation.',
    rows: [
      { price: '45,270', bidVol: 60, askVol: 180, delta: -120, highlight: 'stop' },
      { price: '45,265', bidVol: 150, askVol: 350, delta: -200, highlight: 'entry' },
      { price: '45,260', bidVol: 280, askVol: 300, delta: -20 },
      { price: '45,255', bidVol: 180, askVol: 220, delta: -40 },
      { price: '45,250', bidVol: 350, askVol: 280, delta: 70, highlight: 'poc' },
      { price: '45,245', bidVol: 200, askVol: 190, delta: 10 },
      { price: '45,240', bidVol: 170, askVol: 150, delta: 20, highlight: 'target' },
    ],
    annotations: [
      'The bid wall (2000 lots) was visible on the heatmap but the footprint did NOT show large positive deltas.',
      'Bouchaud-Bonart reminder: only 1-3% of daily volume sits in the LOB. A wall = 0.1% of the daily — it can vanish in ms.',
      'CVD during the "climb" toward the wall was flat = no real market buys, just passive repositioning.',
      'After the wall is pulled: a bearish Hawkes cascade. ρ ≈ 0.5 → each sell triggers 0.5 child sells.',
    ],
    sources: [
      { paper: 'Coxon (2023)', page: 'Ch.1 p.8-9', figure: 'Fig 1.1', insight: 'The LOB schematic shows that visible volume is a fraction of real volume. "Walls" are often orders that will be pulled before execution.' },
      { paper: 'Prenzel (2023)', page: 'Ch.2-3', insight: 'Statistical LOB simulation shows that limit orders have a 60-90% cancellation rate. Most orders visible in the DOM will NEVER be executed.' },
      { paper: 'Luwang et al. (2026)', page: 'Section 4.1, Tables 5-7', insight: 'The Markov transition matrix shows that "aggressive" states have the lowest self-transition probability. A fake wall creates an artificial state that does not hold.' },
      { paper: 'Muravyev (2012)', page: 'Section 3, p.8-12', insight: 'Market makers\' inventory risk is the main driver. When a market maker spoofs, they are managing their inventory — the real signal is in the flow, not in the book.' },
    ],
  },
  {
    id: 'vwap-reclaim-long',
    name: 'VWAP Reclaim Long — Institutional Re-entry',
    type: 'long',
    timeframe: '5min footprint + session VWAP',
    confluence: ['TWAP/VWAP', 'Volume Profile', 'CVD', 'Absorption'],
    description:
      'Price slips below the session VWAP then reclaims it with massive positive delta. Institutions that had accumulated below the VWAP ride the breakout. The volume profile shows a POC at the VWAP level = accepted fair value.',
    setup:
      'Price below the VWAP for 30+ min. CVD drifts down slowly (moderate selling flow — no panic). Volume builds at the VWAP (a POC forming). The heatmap shows liquidity building above the VWAP.',
    entry: 'A 5min candle that CLOSES above the VWAP with a delta >2x the average. The footprint shows a bid/ask flip (bids turn aggressive).',
    target: 'Profile VAH or session high. The VWAP acts as support after the reclaim.',
    stop: 'Below the VWAP - 1 ATR. A re-rejection of the VWAP invalidates the setup.',
    rows: [
      { price: '45,260', bidVol: 280, askVol: 200, delta: 80, highlight: 'target' },
      { price: '45,255', bidVol: 520, askVol: 310, delta: 210, highlight: 'entry' },
      { price: '45,250', bidVol: 890, askVol: 720, delta: 170, highlight: 'poc' },
      { price: '45,245', bidVol: 650, askVol: 580, delta: 70 },
      { price: '45,240', bidVol: 480, askVol: 520, delta: -40 },
      { price: '45,235', bidVol: 350, askVol: 410, delta: -60 },
      { price: '45,230', bidVol: 290, askVol: 380, delta: -90, highlight: 'stop' },
    ],
    annotations: [
      'The POC (890 lots) forms exactly at the VWAP (45,250) = the market accepts this price as fair value.',
      'Above the VWAP: bid vol > ask vol (positive delta) = buyers are aggressive.',
      'Below it: ask vol > bid vol (negative delta) = sellers were in control. The VWAP is the exact pivot.',
      'Veldman: optimal execution front-loads when λ is low (liquid hours). A VWAP reclaim during high-volume hours = a strong signal.',
    ],
    sources: [
      { paper: 'Cucuringu et al. (2025)', page: 'Section 5, p.18-22', insight: 'ML-optimized VWAP reduces slippage significantly. The VWAP as a reference level is validated by the research — it is the institutional execution benchmark par excellence.' },
      { paper: 'Veldman (2024)', page: 'Ch.5 p.34-38', insight: 'Optimal execution with an alpha signal (short-term alpha) around the VWAP. The VWAP reclaim is an alpha signal that institutional algos build in.' },
      { paper: 'de Witt & Pakkanen (2026)', page: 'Section 2.1.1, p.4', insight: 'Implementation Shortfall is measured vs the arrival price. The VWAP reclaim aligns your trade with IS minimization — you trade in the direction of cost reduction.' },
      { paper: 'Schlie (2025)', page: 'Ch.2-3', insight: 'Intraday price patterns show that the VWAP is a significant statistical attractor. Price mean-reverts toward the VWAP with a measurable half-life.' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_STYLES: Record<string, { bg: string; label: string; labelColor: string }> = {
  absorption: { bg: 'rgba(34,197,94,0.12)', label: 'ABSORPTION', labelColor: '#22c55e' },
  imbalance: { bg: 'rgba(239,68,68,0.12)', label: 'IMBALANCE', labelColor: '#ef4444' },
  poc: { bg: 'rgba(167,139,250,0.15)', label: 'POC', labelColor: '#a78bfa' },
  entry: { bg: 'rgba(99,102,241,0.15)', label: 'ENTRY', labelColor: 'var(--accent)' },
  target: { bg: 'rgba(16,185,129,0.12)', label: 'TARGET', labelColor: '#10b981' },
  stop: { bg: 'rgba(239,68,68,0.10)', label: 'STOP', labelColor: '#ef4444' },
};

function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const pct = Math.min(Math.abs(delta) / max * 100, 100);
  const color = delta > 0 ? '#22c55e' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color, marginLeft: delta < 0 ? 'auto' : undefined }}
        />
      </div>
      <span className="w-14 text-right font-mono text-xs" style={{ color }}>
        {delta > 0 ? '+' : ''}{delta}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Panel (expandable)                                           */
/* ------------------------------------------------------------------ */

function SourcePanel({ sources }: { sources: SourceRef[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mt-4 rounded-lg border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          Sources & Pages ({sources.length} refs)
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--border)' }}>
          {sources.map((s, i) => (
            <div key={i} className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                  {s.paper}
                </span>
                <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {s.page}
                </span>
                {s.figure && (
                  <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                    {s.figure}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {s.insight}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function FootprintScenarios() {
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0].id);
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];
  const maxDelta = Math.max(...active.rows.map((r) => Math.abs(r.delta)));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Footprint Scenarios — Entry / Target / Stop
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          5 real setups with a schematic footprint, confluences, and exact academic sources (paper + page + figure).
        </p>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{
              borderColor: activeId === s.id ? 'var(--accent)' : 'var(--border)',
              background: activeId === s.id ? 'var(--accent)' : 'var(--surface)',
              color: activeId === s.id ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${s.type === 'long' ? 'bg-green-500' : 'bg-red-500'}`} />
            {s.name.split('—')[0].trim()}
          </button>
        ))}
      </div>

      {/* ── Active scenario ── */}
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Header */}
        <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${active.type === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {active.type}
            </span>
            <span className="rounded px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
              {active.timeframe}
            </span>
            {active.confluence.map((c) => (
              <span key={c} className="rounded px-2 py-0.5 text-[10px]" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>
                {c}
              </span>
            ))}
          </div>
          <h3 className="mt-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {active.name}
          </h3>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {active.description}
          </p>
        </div>

        <div className="grid gap-0 lg:grid-cols-2">
          {/* Left: Footprint grid */}
          <div className="border-b px-5 py-4 lg:border-b-0 lg:border-r" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Footprint Schema
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-tertiary)' }}>
                    <th className="pb-2 text-left font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Bid Vol</th>
                    <th className="pb-2 text-right font-medium">Ask Vol</th>
                    <th className="pb-2 text-right font-medium">Delta</th>
                    <th className="pb-2 text-left font-medium pl-3">Visual</th>
                    <th className="pb-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {active.rows.map((r, i) => {
                    const hl = r.highlight ? HIGHLIGHT_STYLES[r.highlight] : null;
                    return (
                      <tr key={i} style={{ background: hl?.bg }}>
                        <td className="py-1.5 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {r.price}
                        </td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#22c55e' }}>
                          {r.bidVol.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right font-mono" style={{ color: '#ef4444' }}>
                          {r.askVol.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right">
                          <DeltaBar delta={r.delta} max={maxDelta} />
                        </td>
                        <td className="py-1.5 pl-3">
                          {hl && (
                            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: hl.labelColor }}>
                              {hl.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Annotations */}
            <div className="mt-4 space-y-2">
              {active.annotations.map((a, i) => (
                <p key={i} className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="mt-0.5 text-[10px]" style={{ color: 'var(--accent)' }}>{i + 1}.</span>
                  {a}
                </p>
              ))}
            </div>
          </div>

          {/* Right: Setup / Entry / Target / Stop */}
          <div className="space-y-4 px-5 py-4">
            {[
              { label: 'Setup', text: active.setup, color: 'var(--text-secondary)', icon: '🔍' },
              { label: 'Entry', text: active.entry, color: 'var(--accent)', icon: '→' },
              { label: 'Target', text: active.target, color: '#10b981', icon: '◎' },
              { label: 'Stop', text: active.stop, color: '#ef4444', icon: '✕' },
            ].map((item) => (
              <div key={item.label}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: item.color }}>
                  <span className="text-[10px]">{item.icon}</span>
                  {item.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Source panel */}
        <div className="px-5 pb-5">
          <SourcePanel sources={active.sources} />
        </div>
      </div>
    </section>
  );
}
