import type { Metadata } from 'next';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import {
  abs,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  type FaqItem,
} from '@/lib/seo/structuredData';

const PATH = '/compare';
const TITLE_META = 'Best Footprint Software (2026 Comparison)';
const H1 = 'Senzoukria vs ATAS, Bookmap, Sierra Chart & Quantower';
const META =
  'How Senzoukria compares to ATAS, Bookmap, Sierra Chart and Quantower for footprint and order flow — features, brokers (Apex/Rithmic) and price.';

export const metadata: Metadata = {
  title: TITLE_META,
  description: META,
  keywords: [
    'best footprint software',
    'ATAS alternative',
    'Bookmap alternative',
    'Sierra Chart alternative',
    'Quantower alternative',
    'orderflow software comparison',
    'cheap footprint software',
    'footprint software for Apex',
  ],
  alternates: { canonical: abs(PATH) },
  openGraph: { title: H1, description: META, url: abs(PATH), type: 'article', images: ['/opengraph-image'] },
};

const MONO = 'var(--font-jetbrains-mono)';
const DISPLAY = 'var(--font-fraunces)';

/* ── Comparison matrix ──────────────────────────────────────────────
   Senzoukria column = exact product facts. Competitor cells reflect
   general, widely-known positioning as of 2026 — kept conservative and
   neutral, with a "verify on vendor sites" note below the table. No
   invented competitor prices. */
const PLATFORMS = ['Senzoukria', 'ATAS', 'Bookmap', 'Sierra Chart', 'Quantower'] as const;

type Cell = 'yes' | 'no' | 'partial' | string;

const ROWS: { feature: string; values: Cell[] }[] = [
  { feature: 'Native footprint (delta, imbalance, absorption)', values: ['yes', 'yes', 'partial', 'yes', 'yes'] },
  { feature: 'Liquidity heatmap / DOM', values: ['yes', 'partial', 'yes', 'partial', 'partial'] },
  { feature: 'Integrated GEX / options flow', values: ['yes', 'no', 'no', 'no', 'no'] },
  { feature: 'NinjaTrader bridge (reuse your NT feed)', values: ['yes', 'no', 'no', 'no', 'no'] },
  { feature: 'Apex / Rithmic support', values: ['yes', 'yes', 'yes', 'yes', 'yes'] },
  { feature: 'Crypto feeds (Binance · Bybit · Deribit)', values: ['yes', 'yes', 'yes', 'partial', 'yes'] },
  { feature: 'Pricing', values: ['$29/mo flat', 'Premium / tiered', 'Premium / tiered', 'Tiered', 'Tiered'] },
  { feature: 'Platform', values: ['Windows', 'Windows', 'Windows', 'Windows', 'Windows'] },
];

const FAQS: FaqItem[] = [
  {
    question: 'What is the best footprint software for Apex traders?',
    answer:
      'For Apex (which runs on Rithmic), the main options are Senzoukria, ATAS and Quantower. Senzoukria is the cheapest at $29/month flat and can read your Apex feed through a NinjaTrader bridge or via Rithmic directly, so you keep your existing setup. ATAS and Quantower are mature standalone platforms that also connect to Rithmic.',
  },
  {
    question: 'What is the cheapest order flow / footprint software?',
    answer:
      'Senzoukria is among the most affordable professional footprint tools at $29/month on a single flat plan, with no per-exchange add-ons. ATAS, Bookmap and Sierra Chart are generally premium-priced with tiered plans — check each vendor for current pricing.',
  },
  {
    question: 'What is a good ATAS alternative?',
    answer:
      'Senzoukria is a cheaper ATAS alternative ($29/month) that focuses on footprint, delta and absorption, adds integrated GEX, and bridges your NinjaTrader (Apex / Rithmic) feed instead of being a separate platform. Quantower and Exocharts are other alternatives, each with a different balance of features and price.',
  },
  {
    question: 'Does Senzoukria work with NinjaTrader?',
    answer:
      'Yes. Senzoukria installs one NinjaScript file in NinjaTrader and reads the same tick feed NinjaTrader shows you — locally, with no extra credentials and no proxy lag. This is ideal for Apex and Rithmic accounts you already run in NinjaTrader.',
  },
  {
    question: 'Senzoukria vs Bookmap — which is better?',
    answer:
      'Bookmap is the reference for the real-time liquidity heatmap and DOM visualization. Senzoukria is footprint-first — bid/ask volume, delta, imbalance and absorption matched to your broker-side volume — with its own heatmap, at a flat $29/month. Choose Bookmap if liquidity heatmap is your primary read; Senzoukria for footprint-led order flow on Apex / Rithmic.',
  },
];

function Mark({ v }: { v: Cell }) {
  if (v === 'yes') return <span style={{ color: 'var(--bull, #34d399)', fontWeight: 700 }}>✓</span>;
  if (v === 'no') return <span style={{ color: 'var(--text-dimmed)' }}>—</span>;
  if (v === 'partial') return <span style={{ color: 'var(--warning, #f59e0b)' }}>~</span>;
  return <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{v}</span>;
}

export default function ComparePage() {
  return (
    <>
      <StructuredData
        data={[
          articleJsonLd({ title: H1, description: META, path: PATH, datePublished: '2026-06-19', dateModified: '2026-06-19' }),
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Compare', path: PATH },
          ]),
          faqJsonLd(FAQS),
        ]}
      />

      <style>{`
        .cmp-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
          background-image:
            linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .cmp-bg::before { content:''; position:absolute; border-radius:50%; filter:blur(110px);
          width:46vw; height:46vw; top:-16%; left:-12%;
          background: radial-gradient(circle, rgb(var(--primary-rgb) / 0.07), transparent 70%); }
        .cmp-prose { color: var(--text-secondary); font-size: 16px; line-height: 1.75; }
        .cmp-prose > * + * { margin-top: 1rem; }
        .cmp-prose h2 { font-family:${DISPLAY}; color:var(--text-primary); font-size:clamp(22px,3vw,28px);
          letter-spacing:-0.02em; margin-top:2.6rem; margin-bottom:.2rem; }
        .cmp-prose h3 { color:var(--text-primary); font-size:17px; font-weight:600; margin-top:1.6rem; }
        .cmp-prose strong { color: var(--text-primary); }
        .cmp-prose a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
        .cmp-table { width:100%; border-collapse:collapse; font-size:14px; }
        .cmp-table th, .cmp-table td { padding:11px 12px; border-bottom:1px solid var(--border); text-align:center; }
        .cmp-table th:first-child, .cmp-table td:first-child { text-align:left; color:var(--text-secondary); }
        .cmp-table thead th { color:var(--text-primary); font-weight:600; }
        .cmp-table thead th:nth-child(2) { color: var(--primary); }
        .cmp-table tbody td:nth-child(2) { background: rgb(var(--primary-rgb) / 0.05); }
      `}</style>

      <div aria-hidden="true" className="cmp-bg" />

      <div className="relative z-[1] mx-auto max-w-[820px] px-5 py-12 sm:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">Home</Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: 'var(--text-secondary)' }}>Compare</span>
        </nav>

        <header className="mt-6 space-y-4">
          <h1 className="leading-tight" style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 'clamp(28px,5vw,44px)', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            {H1}
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            An honest comparison of the main footprint and order-flow platforms — what each is best at, and
            where <strong>Senzoukria</strong> fits: footprint on your Apex / Rithmic feed, integrated GEX, a flat
            $29/month price.
          </p>
          <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Senzoukria · Compare · Updated June 2026
          </p>
        </header>

        <hr className="my-8" style={{ border: 0, borderTop: '1px solid var(--border)' }} />

        {/* Comparison table */}
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border" style={{ borderColor: 'var(--border)' }}>
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Feature</th>
                {PLATFORMS.map((p) => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.feature}>
                  <td>{r.feature}</td>
                  {r.values.map((v, i) => <td key={i}><Mark v={v} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          ✓ yes · ~ partial / via add-on · — no. Competitor capabilities reflect general positioning as of 2026;
          verify current specs and pricing on each vendor&apos;s site.
        </p>

        <div className="cmp-prose mt-2">
          <h2>Where Senzoukria is different</h2>
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li style={{ listStyle: 'disc' }}><strong>NinjaTrader bridge.</strong> Instead of being a separate platform, Senzoukria reads the same tick feed your NinjaTrader already shows — one NinjaScript file, no extra credentials, no proxy lag. Perfect for Apex / Rithmic accounts.</li>
            <li style={{ listStyle: 'disc' }}><strong>Integrated GEX.</strong> Gamma exposure and options context live next to your footprint — most footprint tools don&apos;t bundle this.</li>
            <li style={{ listStyle: 'disc' }}><strong>One flat price.</strong> $29/month, a single plan, no per-exchange add-ons.</li>
            <li style={{ listStyle: 'disc' }}><strong>Fast, focused setup.</strong> Footprint, delta, imbalance and absorption with broker-matched volume — running in minutes.</li>
          </ul>

          <h2>Senzoukria vs each platform</h2>

          <h3>vs ATAS</h3>
          <p>ATAS is a mature, polished footprint platform with deep customization and a large community. Senzoukria is lighter and cheaper ($29 flat), bridges your existing NinjaTrader (Apex / Rithmic) feed rather than being a separate platform, and bundles GEX. Choose <strong>ATAS</strong> for the most feature-complete footprint suite; <strong>Senzoukria</strong> if you want footprint on your Apex / NT setup without the price or the learning curve. See our <Link href="/learn/how-to-read-a-footprint-chart">footprint guide</Link>.</p>

          <h3>vs Bookmap</h3>
          <p>Bookmap is the reference for the real-time liquidity heatmap and DOM. Senzoukria is footprint-first — bid/ask volume, delta and <Link href="/learn/absorption-in-trading">absorption</Link> matched to your broker-side volume — with its own heatmap, at a flat $29. Choose <strong>Bookmap</strong> if liquidity heatmap is your #1 read; <strong>Senzoukria</strong> for footprint-led order flow on Apex / Rithmic.</p>

          <h3>vs Sierra Chart</h3>
          <p>Sierra Chart is extremely powerful and low-latency, but has a dated interface and a steep learning curve. Senzoukria trades some of that depth for a modern, focused footprint experience that installs in minutes on your NinjaTrader / Apex / Rithmic feed. Choose <strong>Sierra Chart</strong> for maximum power and customization; <strong>Senzoukria</strong> for fast setup and a cleaner read.</p>

          <h3>vs Quantower</h3>
          <p>Quantower is a modern multi-broker platform with footprint and DOM, Rithmic-native. Senzoukria is narrower — footprint / order-flow focused — but adds the NinjaTrader bridge and integrated GEX at a flat $29/month. Choose <strong>Quantower</strong> for a broad multi-asset platform; <strong>Senzoukria</strong> for a focused, cheaper footprint tool on your Apex / Rithmic feed.</p>

          <h2>Which should you choose?</h2>
          <ul style={{ paddingLeft: '1.25rem' }}>
            <li style={{ listStyle: 'disc' }}><strong>Apex / Rithmic trader who already uses NinjaTrader, wants footprint + GEX cheaply</strong> → Senzoukria.</li>
            <li style={{ listStyle: 'disc' }}><strong>Liquidity heatmap is your main read</strong> → Bookmap.</li>
            <li style={{ listStyle: 'disc' }}><strong>Maximum power, customization, lowest latency</strong> → Sierra Chart.</li>
            <li style={{ listStyle: 'disc' }}><strong>Most feature-complete footprint suite</strong> → ATAS.</li>
            <li style={{ listStyle: 'disc' }}><strong>Broad modern multi-asset platform</strong> → Quantower.</li>
          </ul>
        </div>

        {/* FAQ */}
        <section className="mt-14">
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: 'clamp(22px,3vw,28px)', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Frequently asked questions
          </h2>
          <dl className="mt-5 space-y-5">
            {FAQS.map((f) => (
              <div key={f.question}>
                <dt className="font-semibold" style={{ color: 'var(--text-primary)' }}>{f.question}</dt>
                <dd className="mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA */}
        <aside className="mt-14 rounded-[var(--radius-lg)] border p-6 text-center"
          style={{ borderColor: 'rgb(var(--primary-rgb) / 0.22)', background: 'rgb(var(--primary-rgb) / 0.05)' }}>
          <p className="text-lg" style={{ fontFamily: DISPLAY, fontWeight: 500, color: 'var(--text-primary)' }}>
            Try Senzoukria on your own feed
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Footprint, delta, imbalance and integrated GEX on your NinjaTrader, Apex / Rithmic or crypto feed.
            Free preview — no card.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/auth/register" className="landing-btn-primary">Start free preview</Link>
            <Link href="/learn" className="text-sm self-center" style={{ color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Learn order flow
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
