import type { ReactNode } from 'react';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  type FaqItem,
  type BreadcrumbCrumb,
} from '@/lib/seo/structuredData';

const MONO = 'var(--font-jetbrains-mono)';
const DISPLAY = 'var(--font-fraunces)';

export interface ArticleLayoutProps {
  /** H1 + JSON-LD headline. */
  title: string;
  /** Lead paragraph rendered under the H1 (and used as the meta description upstream). */
  intro: string;
  /** Human-readable freshness label, e.g. "June 2026". */
  updated: string;
  /** ISO dates (YYYY-MM-DD) for Article JSON-LD. */
  datePublished: string;
  dateModified: string;
  /** Canonical in-site path, e.g. "/learn/how-to-read-a-footprint-chart". */
  path: string;
  /** Breadcrumb trail (Home → Learn → this article). */
  breadcrumb: BreadcrumbCrumb[];
  /** Visible FAQ + FAQPage JSON-LD. */
  faqs: FaqItem[];
  /** Article body — write semantic HTML (h2/p/ul/strong/a); styled by `.learn-prose`. */
  children: ReactNode;
}

/**
 * Long-form article chrome for the public `/learn` SEO cluster.
 * Server component — content + JSON-LD ship in the initial HTML so Google
 * indexes it without running JS. Mirrors the visual language of
 * `app/academy/page.tsx` (academy-bg, Fraunces / JetBrains Mono, site tokens)
 * but with readable long-form typography via the scoped `.learn-prose` rules.
 */
export default function ArticleLayout({
  title,
  intro,
  updated,
  datePublished,
  dateModified,
  path,
  breadcrumb,
  faqs,
  children,
}: ArticleLayoutProps) {
  return (
    <>
      <StructuredData
        data={[
          articleJsonLd({ title, description: intro, path, datePublished, dateModified }),
          breadcrumbJsonLd(breadcrumb),
          faqJsonLd(faqs),
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
        .learn-prose { color: var(--text-secondary); font-size: 16px; line-height: 1.75; }
        .learn-prose > * + * { margin-top: 1.1rem; }
        .learn-prose h2 {
          font-family: ${DISPLAY}; color: var(--text-primary);
          font-size: clamp(22px, 3vw, 28px); line-height: 1.2; letter-spacing: -0.02em;
          margin-top: 2.6rem; margin-bottom: 0.2rem;
        }
        .learn-prose h3 {
          color: var(--text-primary); font-size: 17px; font-weight: 600;
          margin-top: 1.8rem;
        }
        .learn-prose strong { color: var(--text-primary); font-weight: 600; }
        .learn-prose a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
        .learn-prose a:hover { color: var(--primary-light); }
        .learn-prose ul, .learn-prose ol { padding-left: 1.25rem; }
        .learn-prose li { margin-top: 0.4rem; }
        .learn-prose ul > li { list-style: disc; }
        .learn-prose ol > li { list-style: decimal; }
        .learn-prose code {
          font-family: ${MONO}; font-size: 0.86em; color: var(--accent);
          background: var(--surface); border: 1px solid var(--border);
          padding: 0.08em 0.4em; border-radius: 5px;
        }
        .learn-prose .callout {
          border: 1px solid var(--border); background: var(--surface);
          border-left: 3px solid var(--primary);
          border-radius: var(--radius-md); padding: 14px 18px; margin-top: 1.4rem;
        }
        .learn-prose .callout p { margin: 0; font-size: 15px; }
      `}</style>

      <div aria-hidden="true" className="learn-bg" />

      <article className="relative z-[1] mx-auto max-w-[720px] px-5 py-12 sm:px-6">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)' }}
        >
          {breadcrumb.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {i < breadcrumb.length - 1 ? (
                <Link href={c.path} className="hover:text-[var(--text-secondary)] transition-colors">
                  {c.name}
                </Link>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
              )}
            </span>
          ))}
        </nav>

        {/* Title + lead */}
        <header className="mt-6 space-y-4">
          <h1
            className="leading-tight"
            style={{
              fontFamily: DISPLAY,
              fontWeight: 400,
              fontSize: 'clamp(30px, 5vw, 46px)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h1>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {intro}
          </p>
          <p style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Senzoukria · Learn · Updated {updated}
          </p>
        </header>

        <hr className="my-8" style={{ border: 0, borderTop: '1px solid var(--border)' }} />

        {/* Body */}
        <div className="learn-prose">{children}</div>

        {/* FAQ */}
        {faqs.length > 0 && (
          <section className="mt-14">
            <h2
              style={{
                fontFamily: DISPLAY,
                fontWeight: 400,
                fontSize: 'clamp(22px, 3vw, 28px)',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}
            >
              Frequently asked questions
            </h2>
            <dl className="mt-5 space-y-5">
              {faqs.map((f) => (
                <div key={f.question}>
                  <dt className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {f.question}
                  </dt>
                  <dd className="mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {f.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* CTA */}
        <aside
          className="mt-14 rounded-[var(--radius-lg)] border p-6 text-center"
          style={{
            borderColor: 'rgb(var(--primary-rgb) / 0.22)',
            background: 'rgb(var(--primary-rgb) / 0.05)',
          }}
        >
          <p
            className="text-lg"
            style={{ fontFamily: DISPLAY, fontWeight: 500, color: 'var(--text-primary)' }}
          >
            See it on a live footprint
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Senzoukria renders native footprint charts tick-by-tick from your NinjaTrader,
            Apex / Rithmic or crypto feed. Free preview — no card.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/auth/register" className="landing-btn-primary">
              Start free preview
            </Link>
            <Link
              href="/learn"
              className="text-sm self-center"
              style={{ color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              More guides
            </Link>
          </div>
        </aside>
      </article>
    </>
  );
}
