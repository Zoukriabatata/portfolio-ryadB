import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AtasChartExamples from '@/components/pdf/AtasChartExamples';
import FootprintScenarios from '@/components/pdf/FootprintScenarios';
import ResearchPaywall from '@/components/pdf/ResearchPaywall';
import TimeframeMatrix from '@/components/pdf/TimeframeMatrix';

export const metadata: Metadata = {
  title: 'Research Library',
  description:
    'Academic research synthesis on order flow, CVD, volume profile, absorption, DOM and heatmap — applied to trading.',
};

const MONO = 'var(--font-jetbrains-mono)';

/* Per-tool palette — aligned with the site tokens wherever an equivalent exists
   (teal/amber/red/green), with two curated hues (violet / cyan) for the
   tools without a dedicated token. Single source of truth for the page. */
const TOOL = {
  cvd:        'var(--accent)',  // teal
  volume:     '#a78bfa',        // violet
  absorption: 'var(--warning)', // amber
  dom:        '#06b6d4',        // cyan
  heatmap:    'var(--bear)',    // rouge
  execution:  'var(--bull)',    // vert
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Finding {
  title: string;
  body: string;
}

interface PaperCard {
  id: string;
  tag: string;
  tagColor: string;
  title: string;
  authors: string;
  year: string;
  oneLiner: string;
  findings: Finding[];
}

interface ToolSection {
  tool: string;
  icon: string;
  color: string;
  intro: string;
  insights: string[];
}

/* ------------------------------------------------------------------ */
/*  Data – Tool-specific insights extracted from all 17 papers         */
/* ------------------------------------------------------------------ */

const TOOL_SECTIONS: ToolSection[] = [
  {
    tool: 'CVD — Cumulative Volume Delta',
    icon: 'M3 17l6-6 4 4 8-8',
    color: TOOL.cvd,
    intro:
      'CVD measures cumulative net buy/sell pressure. The literature confirms that Order Flow Imbalance (OFI) — the mathematical foundation of CVD — is the single most powerful predictor of short-term price moves.',
    insights: [
      'OFI linearly predicts high-frequency price changes with a significant R² (Cont et al., confirmed by Coxon, Veldman, Prenzel). CVD is therefore a direct proxy for informational pressure.',
      'Buy/sell order flow exhibits self-excitement (Hawkes processes): a large buy triggers child buys. This means a CVD/price divergence is NOT noise — it is a forming cascade signal (Tiwari, Chen-Horst-Tran, Anantha-Jain).',
      'Buy↔sell cross-excitation is asymmetric: aggressive sells trigger more reactions than buys. Watch bearish CVD divergences more closely (Anantha-Jain, bivariate Hawkes).',
      'CVD information dissipates in ~10 milliseconds on NASDAQ equities (Jonuzaj et al.). For crypto futures the window is wider but still short — acting fast is critical.',
      'CVD broken down by trade size reveals the players: hedge funds take positions 3-4x larger than retail on macro surprises. A CVD spike on large lots = institutional flow (Wang 2025).',
      'Martingale flow (flat CVD) = no directional bias. Only martingale flow unwinds myopically. Any autocorrelation in CVD implies an optimal adjustment of the strategy (Nutz-Webster-Zhao).',
    ],
  },
  {
    tool: 'Volume Profile',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6-4v4m0 0h-6',
    color: TOOL.volume,
    intro:
      'Volume Profile identifies the price levels where volume has traded. Research shows that intraday volume patterns are highly predictable and that liquidity varies systematically over the course of the day.',
    insights: [
      'Intraday volume follows a persistent U-shape: high at the open, troughing mid-session, climbing back into the close. This pattern is stable cross-sectionally and exploitable for timing entries (Harris, Schlie, Luwang et al.).',
      'ML (XGBoost, LSTM) predicts intraday volume with 30-50% higher accuracy than classical models. Commonality (the common volume factor across stocks) improves predictions further (Cucuringu-Li-Zhang).',
      'The impact coefficient λ varies intraday: higher mid-session (less liquidity) and lower at the open/close. Trading in high-volume zones cuts slippage by 20-80% vs TWAP (Coxon, Veldman).',
      'High-volume price levels act as attractors: the profile\'s stationary prices (POC, VAH, VAL) match the stationary distributions of the limit-order-price Markov chains — prices return to them with the shortest recurrence time (Luwang et al.).',
      'For crypto futures: the volume profile must be recalibrated frequently. The impact coefficient shifts significantly during crises (COVID crash, rate hikes) — recalibrate monthly at minimum (Coxon).',
      'The optimal participation rate follows the volume profile: trading proportionally to expected volume (VWAP) is suboptimal. Optimal execution front-loads or back-loads depending on the concavity of impact (Veldman, de Witt).',
    ],
  },
  {
    tool: 'Absorption (Bid/Ask)',
    icon: 'M12 3v18m-9-9h18',
    color: TOOL.absorption,
    intro:
      'Absorption occurs when large aggressive volume is absorbed by passive limit orders without the price moving. It is a key signal of institutional presence.',
    insights: [
      'Absorption is formalized through transient impact: every aggressive trade impacts price, but that impact decays exponentially (half-life ~5-15 min on futures). If price doesn\'t move despite volume = someone is absorbing (Bouchaud propagator, Coxon, Veldman).',
      'The self-excitation ratio ρ = α/(β−α) measures how many child orders a trade generates. High ρ + stable price = massive absorption. NASDAQ stocks have ρ between 0.3 and 0.7 (Chen-Horst-Tran).',
      'Concave impact (square-root law) means doubling volume does not double impact. δ ≈ 0.4-0.7 empirically. When you see 10x normal volume with only 2x the price move = active absorption (Coxon, Veldman, Almgren).',
      'The bid-ask spread widens BEFORE absorption: market makers widen their spreads when they anticipate toxic flow. A widening spread + large volume = an absorption setup in progress (Doshi-Pederzoli-Sert, Muravyev).',
      'LOB resilience (the speed at which the book refills after a market order) is the measurable proxy for absorption. High resilience = strong absorption. The Obizhaeva-Wang model formalizes this concept.',
      'Internalization orders in the Central Risk Book (CRB) are invisible absorption: banks net opposing flows internally before externalizing. 40-60% of flow can be internalized — which you never see on the tape (Nutz-Webster-Zhao).',
    ],
  },
  {
    tool: 'DOM — Depth of Market',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    color: TOOL.dom,
    intro:
      'The DOM (order book) shows the depth of limit orders at each price level. Research reveals complex price-revision dynamics and exploitable patterns.',
    insights: [
      'Price transitions in the DOM follow Markov chains with 9 states (from "Very Aggressive Sell" to "Very Aggressive Buy"). Price inertia (self-transition) peaks at the open and the close, and bottoms out mid-session (Luwang et al.).',
      'Large-caps have 2-3x higher price inertia than small-caps in the DOM. For crypto trading, this implies BTC/ETH will have stickier DOM levels than altcoins (Luwang et al.).',
      'Bid/ask asymmetry is real and measurable: sellers begin their end-of-day repositioning BEFORE buyers (a "Pre-Close" phase on the ask but not on the bid). Watch the ask side of the DOM late in the session (Luwang et al.).',
      'The DOM\'s informational content decays over time: the predictive value of order-book data has fallen progressively, likely due to growing algo competition (Jonuzaj-Sancetta-Taranenko).',
      'Adverse selection on the DOM can be detected: when OFI (flow imbalance) rises by one standard deviation, the next-day return increases by ~1% on options. The DOM therefore predicts future returns too (Muravyev).',
      'Order flow volatility (not the flow itself) is the primary driver of spreads. Rising flow volatility = widening spreads = less visible liquidity in the DOM (Doshi et al.).',
    ],
  },
  {
    tool: 'Liquidity Heatmap',
    icon: 'M4 4h16v16H4z',
    color: TOOL.heatmap,
    intro:
      'The heatmap visualizes the density of limit orders across time and price. Academic models provide the theoretical framework for interpreting what you see.',
    insights: [
      'Order intensity follows a Hawkes process with a time-varying baseline: order density rises exponentially as the close approaches (Samuelson effect). The heatmap naturally lights up late in the session — don\'t mistake it for a signal (Chatziandreou-Karbach).',
      'Dense zones in the heatmap correspond to stationary Markov distributions: neutral and mild prices dominate (>70% of the stationary mass). Empty zones (aggressive prices) have a recurrence time 5-10x longer (Luwang et al.).',
      'Market impact propagates through the heatmap with a decaying exponential kernel: G(τ) = G₀·e^{-τ/τ₀}. When a large trade punches a hole in the heatmap, liquidity rebuilds with this dynamic. τ₀ ≈ 5-15 min for futures (Bouchaud, Coxon, de Witt).',
      'Impact concavity (δ ≈ 0.5) means the liquidity walls in the heatmap are not linearly proportional to their absorption capacity. A 1000-lot wall does not absorb 10x a 100-lot wall — it absorbs only ~3x (square-root law).',
      'Liquidity clusters in the heatmap reflect natural spoofing: only 1-3% of daily volume is actually visible in the LOB at any instant t (Bouchaud-Bonart, Coxon). Apparent walls can vanish in milliseconds.',
      'ML approach to the heatmap: deep-learning models (ConvLSTM, transformers) on LOB snapshots predict very short-term price moves. De Witt\'s CNN architecture (2026) reaches 2.13 bps of slippage vs 5.23 bps for VWAP — the spatial structure of the heatmap contains exploitable information.',
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Data – Key papers with applied takeaways                           */
/* ------------------------------------------------------------------ */

const KEY_PAPERS: PaperCard[] = [
  {
    id: 'hawkes-ofi',
    tag: 'CVD / OFI',
    tagColor: TOOL.cvd,
    title: 'Forecasting High Frequency Order Flow Imbalance',
    authors: 'Anantha & Jain (2024)',
    year: '2024',
    oneLiner:
      'Uses bivariate Hawkes processes to predict the distribution of buy/sell imbalance.',
    findings: [
      {
        title: 'Buy↔sell cross-excitation',
        body: 'Past buy trades affect future sell trades (and vice versa). The Sum of Exponentials kernel gives the best forecasts. Implication: your CVD already captures this dynamic — CVD/price divergences signal a shift in the cross-excitation regime.',
      },
      {
        title: 'Real-time OFI',
        body: 'OFI can be updated tick by tick without a classification algorithm (thanks to order IDs). Normalized OFI = (Sells - Buys) / (Sells + Buys) over a rolling window — which is exactly your normalized CVD.',
      },
    ],
  },
  {
    id: 'lob-markov',
    tag: 'DOM',
    tagColor: TOOL.dom,
    title: 'Intraday Limit Order Price Change Dynamics via Markov Chains',
    authors: 'Luwang, Mukhia et al. (2026)',
    year: '2026',
    oneLiner:
      'Models limit-price transitions as Markov chains on the NASDAQ-100.',
    findings: [
      {
        title: '9 price states',
        body: 'Limit-price changes are categorized from "Very Aggressive Sell" (>-5%) to "Very Aggressive Buy" (>+5%). The stationary distribution shows that ~70%+ of revisions are neutral or mild. Implication: extreme levels in your DOM are rare but informative.',
      },
      {
        title: 'Capitalization gradient',
        body: 'Large-caps: strong inertia, predictable transitions. Small-caps: dynamic, wide spreads. Apply this logic: BTC ≈ large-cap (sticky DOM), altcoins ≈ small-cap (volatile DOM).',
      },
      {
        title: 'Bid/ask asymmetry at the close',
        body: 'The ask side enters its "Pre-Close" phase BEFORE the bid. Sellers reposition their limit orders earlier than buyers late in the session.',
      },
    ],
  },
  {
    id: 'propagator',
    tag: 'Heatmap / Absorption',
    tagColor: TOOL.heatmap,
    title: 'Market Impact Modeling & Optimal Execution (Veldman + Coxon)',
    authors: 'Veldman (2024) & Coxon (2023)',
    year: '2023-24',
    oneLiner:
      'Calibrate the discrete propagator model (DPM) on real futures and equities data.',
    findings: [
      {
        title: 'Two-phase impact decay',
        body: 'Impact decays in two stages: fast (seconds) then slow (minutes). On your heatmap, a liquidity hole fills quickly at first, then slowly. The half-life of the exponential decay ≈ 5-15 min on futures.',
      },
      {
        title: 'Variable intraday λ',
        body: 'The impact coefficient λ varies intraday — higher at midday (illiquid), lower at open/close. Your dense heatmap zones during liquid hours = better absorption. Cost savings: 20-80% vs TWAP by exploiting these patterns.',
      },
      {
        title: 'Square-root law',
        body: 'Impact ∝ √(volume/ADV). Direct implication for the heatmap: a 1000-lot wall is not 10x stronger than a 100-lot wall — it is ~3.2x. Icebergs are therefore more dangerous than visible walls.',
      },
    ],
  },
  {
    id: 'volume-ml',
    tag: 'Volume Profile',
    tagColor: TOOL.volume,
    title: 'Forecasting Intraday Volume with Machine Learning',
    authors: 'Cucuringu, Li & Zhang (2025)',
    year: '2025',
    oneLiner:
      'ML models (XGBoost, LSTM) predict intraday volume using cross-stock commonality.',
    findings: [
      {
        title: 'Commonality factor',
        body: 'A stock\'s volume is partly predictable from the volume of OTHER stocks (a common factor). For crypto: BTC\'s volume predicts that of altcoins. Build a market volume index into your volume profile.',
      },
      {
        title: 'Optimal VWAP',
        body: 'With accurate intraday volume forecasts, the optimal VWAP strategy reduces slippage significantly. Your volume profile provides exactly this data — use it to anticipate high-participation zones.',
      },
    ],
  },
  {
    id: 'rl-execution',
    tag: 'Execution',
    tagColor: TOOL.execution,
    title: 'RL Optimal Execution with Transient Impact (MAP-Elites)',
    authors: 'de Witt & Pakkanen (2026)',
    year: '2026',
    oneLiner:
      'PPO-CNN reaches 2.13 bps of slippage vs 5.23 bps VWAP over $21B of volume.',
    findings: [
      {
        title: 'CNN over market state',
        body: 'The CNN architecture captures the spatial structure of market data (price, volumes, volatility, imbalance). The state of the DOM and heatmap holds information that deep learning can exploit. Implication: your heatmap is not merely visual — it encodes a quantifiable edge.',
      },
      {
        title: 'Market regimes',
        body: 'Regime specialists (liquidity × volatility) improve by 8-10% within their niches. Adapt your reading of the tools to the current regime: a divergent CVD in low volatility ≠ the same signal in high volatility.',
      },
    ],
  },
  {
    id: 'flow-info',
    tag: 'CVD / DOM',
    tagColor: TOOL.cvd,
    title: 'Information Content of Book and Trade Order Flow',
    authors: 'Jonuzaj, Sancetta & Taranenko (2024)',
    year: '2024',
    oneLiner:
      'Trade-flow information is the most persistent; predictability vanishes in ~10ms.',
    findings: [
      {
        title: 'Trade flow > Book flow',
        body: 'Trade flow (tape, CVD) carries more persistent information than order-book data (DOM). Implication: prioritize your CVD and tape reading over pure DOM reading for directional decisions.',
      },
      {
        title: 'Decaying flow value',
        body: 'Over time, the predictive value of flow has declined (rising efficiency). Combine several signals (CVD + heatmap + volume profile) rather than relying on a single one.',
      },
    ],
  },
  {
    id: 'options-flow',
    tag: 'Absorption / Options',
    tagColor: TOOL.absorption,
    title: 'Order Flow & Expected Option Returns + Risky Intraday Order Flow',
    authors: 'Muravyev (2012) & Doshi, Pederzoli, Sert (2025)',
    year: '2012-25',
    oneLiner:
      'Order flow imbalance predicts option returns; flow volatility drives spreads.',
    findings: [
      {
        title: 'Flow → Predictive returns',
        body: '+1 σ of imbalance = +1% next-day return on options. Absorption visible on the futures also predicts option moves. Cross-market signal: futures CVD + options spreads = a powerful combo.',
      },
      {
        title: 'Flow volatility > Flow',
        body: 'It is not the level of flow but its VOLATILITY that drives spreads. An erratic CVD (high flow volatility) = wide spreads = dangerous conditions. Watch the stability of your CVD, not just its direction.',
      },
    ],
  },
  {
    id: 'hawkes-execution',
    tag: 'Execution / CVD',
    tagColor: TOOL.execution,
    title: 'Optimal Execution under Endogenous & Self-Exciting Order Flow',
    authors: 'Chen-Horst-Tran (2023) & Tiwari (2025)',
    year: '2023-25',
    oneLiner:
      'Flow endogeneity (your trades trigger reactions) costs 12-24% more than expected.',
    findings: [
      {
        title: 'Child orders & feedback',
        body: 'Each trade generates ρ child orders on average (ρ = 0.3-0.7). When you see a CVD spike, part of it is organic and part is a chain reaction. Flow is never 100% informative — there is always a mechanical component.',
      },
      {
        title: 'The cost of detectability',
        body: 'TWAP/VWAP patterns are detectable by FFT. HFT algos exploit these patterns. An overly regular (constant) CVD = a signature of algorithmic execution that predators target.',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Data – Practical framework                                         */
/* ------------------------------------------------------------------ */

const FRAMEWORK_STEPS = [
  {
    step: '1',
    label: 'Macro context',
    desc: 'Identify the regime (high/low vol, liquidity) via the intraday volume profile and flow volatility.',
  },
  {
    step: '2',
    label: 'Reading the heatmap',
    desc: 'Spot the liquidity clusters (walls). Remember: only 1-3% of daily volume is visible. Walls follow the square-root law.',
  },
  {
    step: '3',
    label: 'CVD signal',
    desc: 'Look for CVD/price divergences. Rising CVD + flat price = absorption. A divergent CVD in low vol = a strong signal (less Hawkes noise).',
  },
  {
    step: '4',
    label: 'DOM confirmation',
    desc: 'Check the bid/ask asymmetry. DOM inertia gives conviction: strong inertia = likely continuation. Watch the ask into the pre-close.',
  },
  {
    step: '5',
    label: 'Timing via Volume Profile',
    desc: 'Execute in high-volume zones (open, close) to minimize slippage. Avoid the quiet hours where λ is high.',
  },
  {
    step: '6',
    label: 'Risk management',
    desc: 'Monitor flow volatility (not just CVD). Erratic flow = dangerous conditions, cut your size. Information dissipates in <10ms — don\'t hesitate.',
  },
];

/* ------------------------------------------------------------------ */
/*  Reusable sub-components (server components — no 'use client')      */
/* ------------------------------------------------------------------ */

function SvgIcon({ d, color }: { d: string; color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase"
      style={{
        fontFamily: MONO,
        letterSpacing: '0.14em',
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function SectionTitle({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {kicker && (
        <p
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {kicker}
        </p>
      )}
      <h2
        className="font-display text-[clamp(22px,3vw,30px)]"
        style={{
          color: 'var(--text-primary)',
          WebkitFontSmoothing: 'subpixel-antialiased',
        }}
      >
        {children}
      </h2>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PdfResearchPage() {
  /* ── Preview content (visible to everyone) ── */
  const previewContent = (
    <div className="space-y-16">
      <header className="space-y-4">
        <p
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Academy · Order flow research
        </p>
        <h1
          className="font-display text-[clamp(34px,5vw,56px)]"
          style={{
            color: 'var(--text-primary)',
            WebkitFontSmoothing: 'subpixel-antialiased',
          }}
        >
          Research <span className="font-display-accent">Library</span>
        </h1>
        <p
          className="max-w-3xl text-base leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
        >
          A synthesis of <strong>17 academic papers</strong> (2012–2026)
          on order flow, market microstructure and optimal execution
          — filtered and applied to your 5 tools:{' '}
          <strong>CVD, Volume Profile, Absorption, DOM, Heatmap</strong>.
        </p>
        <p
          className="text-sm italic"
          style={{ color: 'var(--text-muted)' }}
        >
          Sources: Tiwari (2025), Chen-Horst-Tran (2023), Nutz-Webster-Zhao
          (2025), Anantha-Jain (2024), Chatziandreou-Karbach (2025),
          Wang (2025), Cucuringu-Li-Zhang (2025), Luwang et al. (2026),
          de Witt-Pakkanen (2026), Coxon (2023), Schlie (2025), Ayyar (2025),
          Veldman (2024), Prenzel (2023), Muravyev (2012), Jonuzaj et al.
          (2024), Doshi-Pederzoli-Sert (2025).
        </p>
      </header>

      {/* ── Key numbers (visible teaser) ── */}
      <section className="space-y-6">
        <SectionTitle kicker="· Overview">Key numbers to remember</SectionTitle>
        <div className="acad-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { stat: '17', label: 'Academic papers analyzed', src: '2012–2026' },
            { stat: '5', label: 'Tools covered in depth', src: 'CVD, VP, Absorption, DOM, Heatmap' },
            { stat: '36', label: 'Implementation ideas', src: '6 per tool' },
            { stat: '5', label: 'ATAS charts with Entry/Target/Stop', src: 'MNQ 300T' },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-center transition-colors duration-200 hover:border-[var(--border-light)]"
            >
              <p className="text-3xl font-semibold tabular-nums" style={{ fontFamily: MONO, color: 'var(--accent)' }}>{item.stat}</p>
              <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
              <p className="mt-1.5 text-[10px]" style={{ fontFamily: MONO, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{item.src}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  /* ── Gated content (behind paywall) ── */
  const gatedContent = (
    <div className="space-y-16">
      {/* ── Tool-by-tool insights ── */}
      <section className="acad-stagger space-y-10">
        <SectionTitle kicker="· 5 tools">Insights by tool</SectionTitle>

        {TOOL_SECTIONS.map((ts) => (
          <div
            key={ts.tool}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-200 hover:border-[var(--border-light)]"
          >
            {/* card header */}
            <div
              className="flex items-center gap-3 border-b px-5 py-4"
              style={{ borderColor: 'var(--border)', background: `color-mix(in srgb, ${ts.color} 5%, transparent)` }}
            >
              <SvgIcon d={ts.icon} color={ts.color} />
              <h3
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: 14,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                }}
              >
                {ts.tool}
              </h3>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {ts.intro}
              </p>
              <ul className="space-y-3">
                {ts.insights.map((ins, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className="mt-1.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: ts.color }}
                    />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {ins}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </section>

      {/* ── Key papers with applied findings ────────────── */}
      <section className="space-y-8">
        <SectionTitle kicker="· 8 papers">Key papers — Applied findings</SectionTitle>

        <div className="acad-stagger grid gap-6 md:grid-cols-2">
          {KEY_PAPERS.map((p) => (
            <article
              key={p.id}
              className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-200 hover:border-[var(--border-light)]"
            >
              <div className="space-y-2 px-5 pt-5">
                <Badge label={p.tag} color={p.tagColor} />
                <h3
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {p.title}
                </h3>
                <p
                  className="text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {p.authors}
                </p>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {p.oneLiner}
                </p>
              </div>

              <div className="mt-auto space-y-3 px-5 pb-5 pt-4">
                {p.findings.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-[var(--radius-md)] border px-4 py-3"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--background)',
                    }}
                  >
                    <p
                      className="text-[11px] font-bold uppercase"
                      style={{ fontFamily: MONO, letterSpacing: '0.1em', color: p.tagColor }}
                    >
                      {f.title}
                    </p>
                    <p
                      className="mt-1 text-[13px] leading-relaxed"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {f.body}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── ATAS-style Chart Examples ─────────────────── */}
      <AtasChartExamples />

      {/* ── Footprint Scenarios ──────────────────────── */}
      <FootprintScenarios />

      {/* ── Timeframe Matrix + Ideas ─────────────────── */}
      <TimeframeMatrix />

      {/* ── Practical framework ────────────────────────── */}
      <section className="space-y-6">
        <SectionTitle kicker="· Workflow">Practical framework — How to combine the 5 tools</SectionTitle>
        <p
          className="max-w-3xl text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          Based on the findings from the 17 papers, here is a sequential workflow
          for using CVD + Volume Profile + Absorption + DOM + Heatmap
          together.
        </p>

        <div className="acad-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FRAMEWORK_STEPS.map((fs) => (
            <div
              key={fs.step}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 transition-colors duration-200 hover:border-[var(--border-light)]"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                  style={{
                    fontFamily: MONO,
                    background: 'var(--accent)',
                    color: '#04161a',
                  }}
                >
                  {fs.step}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                  }}
                >
                  {fs.label}
                </span>
              </div>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {fs.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Formulas reference ─────────────────────────── */}
      <section className="space-y-6">
        <SectionTitle kicker="· Reference">Essential formulas</SectionTitle>

        <div className="acad-stagger space-y-4">
          {[
            {
              name: 'Order Flow Imbalance (normalized CVD)',
              formula:
                'OFI(T, h) = (N_sell − N_buy) / (N_sell + N_buy)  over the window [T−h, T]',
              source: 'Anantha & Jain (2024)',
            },
            {
              name: 'Hawkes intensity (self-exciting flow)',
              formula:
                'λ(t) = μ + ∫₀ᵗ α·e^{−β(t−s)} dN(s)   with ρ = α/(β−α)',
              source: 'Chen-Horst-Tran, Tiwari',
            },
            {
              name: 'Transient Impact (propagator)',
              formula:
                'I(t) = Σ G₀·e^{−τ/τ₀} · σ·√(q/V) · ε(t−τ)',
              source: 'Bouchaud, de Witt, Coxon',
            },
            {
              name: 'Square-root law (instantaneous impact)',
              formula: 'ΔP = σ · (Q/V)^δ   with δ ≈ 0.4–0.7',
              source: 'Almgren, Coxon, Veldman',
            },
            {
              name: 'Implementation Shortfall',
              formula:
                'IS = side · (Σ pᵢ·|qᵢ|/Q₀ − p₀)  = executed VWAP − arrival price',
              source: 'Perold, de Witt',
            },
            {
              name: 'DOM transition probability (Markov)',
              formula:
                'P(X_{n+1} = Sⱼ | Xₙ = Sᵢ) = pᵢⱼ   with Σⱼ pᵢⱼ = 1',
              source: 'Luwang et al.',
            },
          ].map((f) => (
            <div
              key={f.name}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 transition-colors duration-200 hover:border-[var(--border-light)]"
            >
              <div className="flex items-baseline justify-between gap-4">
                <p
                  className="text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {f.name}
                </p>
                <span
                  className="flex-shrink-0 text-[10px] uppercase"
                  style={{ fontFamily: MONO, letterSpacing: '0.06em', color: 'var(--text-muted)' }}
                >
                  {f.source}
                </span>
              </div>
              <p
                className="mt-2.5 font-mono text-sm leading-relaxed"
                style={{ color: 'var(--accent)' }}
              >
                {f.formula}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer
        className="border-t pt-8 text-center"
        style={{
          borderColor: 'var(--border)',
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        17 papers analyzed — Last updated: March 2026
      </footer>
    </div>
  );

  return (
    <>
      <style>{`
        /* Ambient animated background — emerald + champagne, faint grid */
        .academy-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
          background-image:
            linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .academy-bg::before, .academy-bg::after {
          content: ''; position: absolute; border-radius: 50%; filter: blur(100px);
        }
        .academy-bg::before {
          width: 48vw; height: 48vw; top: -14%; left: -12%;
          background: radial-gradient(circle, rgb(var(--primary-rgb) / 0.08), transparent 70%);
          animation: acadGlowA 22s ease-in-out infinite alternate;
        }
        .academy-bg::after {
          width: 44vw; height: 44vw; bottom: -16%; right: -12%;
          background: radial-gradient(circle, rgb(var(--accent-rgb) / 0.07), transparent 70%);
          animation: acadGlowB 28s ease-in-out infinite alternate;
        }
        @keyframes acadGlowA { from { transform: translate(0,0); } to { transform: translate(7vw, 5vw); } }
        @keyframes acadGlowB { from { transform: translate(0,0); } to { transform: translate(-6vw, -7vw); } }
        /* Panel entrance — staggered within each section */
        .acad-stagger > * {
          opacity: 0;
          animation: acadIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .acad-stagger > *:nth-child(1) { animation-delay: 0.05s; }
        .acad-stagger > *:nth-child(2) { animation-delay: 0.11s; }
        .acad-stagger > *:nth-child(3) { animation-delay: 0.17s; }
        .acad-stagger > *:nth-child(4) { animation-delay: 0.23s; }
        .acad-stagger > *:nth-child(5) { animation-delay: 0.29s; }
        .acad-stagger > *:nth-child(6) { animation-delay: 0.35s; }
        .acad-stagger > *:nth-child(n+7) { animation-delay: 0.41s; }
        @keyframes acadIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .academy-bg::before, .academy-bg::after { animation: none; }
          .acad-stagger > * { opacity: 1; animation: none; }
        }
      `}</style>
      <div aria-hidden="true" className="academy-bg" />
      <div className="relative z-[1] mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <ResearchPaywall preview={previewContent}>
          {gatedContent}
        </ResearchPaywall>
      </div>
    </>
  );
}
