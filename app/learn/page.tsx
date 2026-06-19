import type { Metadata } from 'next';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import { abs, breadcrumbJsonLd, itemListJsonLd } from '@/lib/seo/structuredData';

const PATH = '/learn';
const TITLE = 'Learn Order Flow, Footprint Charts & GEX';
const INTRO =
  'Plain-English guides to reading order flow — footprint charts, delta, imbalance, absorption — and options gamma (GEX) — for futures and crypto traders. No jargon, just how to read what the market is actually doing.';

const META =
  'Plain-English guides to order flow and options gamma: footprint, delta, imbalance, absorption and GEX — for futures and crypto traders.';

export const metadata: Metadata = {
  title: TITLE,
  description: META,
  alternates: { canonical: abs(PATH) },
  openGraph: { title: TITLE, description: META, url: abs(PATH), type: 'website', images: ['/opengraph-image'] },
};

const MONO = 'var(--font-jetbrains-mono)';
const DISPLAY = 'var(--font-fraunces)';

interface Guide {
  title: string;
  path: string;
  blurb: string;
  tag: string;
  pillar?: boolean;
}

const GUIDES: Guide[] = [
  {
    title: 'How to read a footprint chart',
    path: '/learn/how-to-read-a-footprint-chart',
    blurb:
      'The complete beginner guide: bid vs ask, delta, imbalances, absorption and how to read a healthy candle from a trap.',
    tag: 'Footprint · Start here',
    pillar: true,
  },
  {
    title: 'Cumulative delta (CVD) explained',
    path: '/learn/cumulative-delta-explained',
    blurb:
      'What CVD is, how it is built across a session, and how to read the divergences that signal a move running out of fuel.',
    tag: 'Delta',
  },
  {
    title: 'Order flow imbalance explained',
    path: '/learn/order-flow-imbalance',
    blurb:
      'How diagonal imbalances are measured, why stacked imbalances mean momentum, and how unfilled zones become magnets.',
    tag: 'Imbalance',
  },
  {
    title: 'Absorption in trading',
    path: '/learn/absorption-in-trading',
    blurb:
      'Heavy aggression met by a wall of passive orders — how to spot the levels big players are defending, and confirm them.',
    tag: 'Absorption',
  },
  {
    title: 'What is GEX (Gamma Exposure)?',
    path: '/learn/what-is-gex-gamma-exposure',
    blurb:
      'How dealer gamma turns the market mean-reverting or trending — positive vs negative gamma, walls and the zero-gamma flip.',
    tag: 'GEX · Options',
    pillar: true,
  },
  {
    title: 'Gamma walls: call & put wall',
    path: '/learn/gamma-walls-explained',
    blurb:
      'Why a call wall is resistance, a put wall is support, and how the highest-gamma strike pins price.',
    tag: 'Gamma walls',
  },
  {
    title: 'Zero gamma (gamma flip) level',
    path: '/learn/zero-gamma-flip-explained',
    blurb:
      'The price where dealer gamma flips sign — splitting a calm, mean-reverting market from a volatile, trending one.',
    tag: 'Gamma flip',
  },
  {
    title: 'Volatility skew explained',
    path: '/learn/volatility-skew-explained',
    blurb:
      'Put skew vs call skew, the 25-delta risk reversal, and how skew often turns before price does.',
    tag: 'Skew',
  },
];

export default function LearnHubPage() {
  return (
    <>
      <StructuredData
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Learn', path: PATH },
          ]),
          itemListJsonLd(GUIDES.map((g) => ({ name: g.title, path: g.path }))),
        ]}
      />

      <style>{`
        .learn-bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
          background-image:
            linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .learn-bg::before {
          content: ''; position: absolute; border-radius: 50%; filter: blur(110px);
          width: 46vw; height: 46vw; top: -16%; left: -12%;
          background: radial-gradient(circle, rgb(var(--primary-rgb) / 0.07), transparent 70%);
        }
        .learn-bg::after {
          content: ''; position: absolute; border-radius: 50%; filter: blur(110px);
          width: 42vw; height: 42vw; bottom: -18%; right: -12%;
          background: radial-gradient(circle, rgb(var(--accent-rgb) / 0.06), transparent 70%);
        }
      `}</style>

      <div aria-hidden="true" className="learn-bg" />

      <div className="relative z-[1] mx-auto max-w-4xl px-5 py-14 sm:px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)' }}
        >
          <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">Home</Link>
          <span aria-hidden="true">/</span>
          <span style={{ color: 'var(--text-secondary)' }}>Learn</span>
        </nav>

        <header className="mt-6 space-y-4">
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            · The science of orderflow
          </p>
          <h1
            className="leading-tight"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 400,
              fontSize: 'clamp(34px, 5.5vw, 52px)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            Learn <span style={{ fontStyle: 'italic', fontWeight: 600, color: 'var(--primary)' }}>order flow</span>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {INTRO}
          </p>
        </header>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <Link
              key={g.path}
              href={g.path}
              className="group flex flex-col rounded-[var(--radius-lg)] border p-6 transition-all duration-200"
              style={{
                borderColor: g.pillar ? 'rgb(var(--primary-rgb) / 0.28)' : 'var(--border)',
                background: g.pillar ? 'rgb(var(--primary-rgb) / 0.05)' : 'var(--surface)',
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--primary)' }}>
                {g.tag}
              </span>
              <h2
                className="mt-2 text-lg font-semibold transition-colors group-hover:text-[var(--primary-light)]"
                style={{ color: 'var(--text-primary)' }}
              >
                {g.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {g.blurb}
              </p>
              <span
                className="mt-4 text-sm font-medium"
                style={{ color: 'var(--primary)' }}
              >
                Read guide →
              </span>
            </Link>
          ))}
        </div>

        <aside
          className="mt-12 rounded-[var(--radius-lg)] border p-6 text-center"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Want to read these signals on your own market?{' '}
            <Link href="/footprint" style={{ color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              See the live footprint
            </Link>{' '}
            or{' '}
            <Link href="/auth/register" style={{ color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              start a free preview
            </Link>
            .
          </p>
        </aside>
      </div>
    </>
  );
}
