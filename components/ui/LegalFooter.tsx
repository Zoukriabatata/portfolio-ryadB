'use client';

import Link from 'next/link';

const LEGAL_LINKS = [
  { label: 'Terms', href: '/legal/terms' },
  { label: 'Privacy', href: '/legal/privacy' },
  { label: 'Pricing', href: '/pricing' },
];

export function LegalFooter() {
  return (
    <footer
      className="border-t py-4 px-6"
      style={{ background: 'rgb(var(--surface-rgb) / 0.4)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <p
          className="text-xs text-center md:text-left leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          <strong style={{ color: 'var(--text-secondary)' }}>SENZOUKRIA</strong> is a
          visualization software. It does not include, store or redistribute CME market data.
          Each user must subscribe to their own data feed via their broker. Not financial advice.
        </p>
        <div className="flex items-center gap-5 flex-shrink-0">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: '10px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
