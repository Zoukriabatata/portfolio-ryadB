'use client';

import Link from 'next/link';

export function LegalFooter() {
  return (
    <footer className="bg-zinc-900/30 border-t border-zinc-800 py-4 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        <p className="text-zinc-600 text-xs text-center md:text-left">
          SENZOUKRIA is a visualization software. It does not include, store or redistribute CME market data.
          Each user must subscribe to their own data feed via their broker. Not financial advice.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <Link href="/legal/terms" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Terms
          </Link>
          <Link href="/legal/privacy" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Privacy
          </Link>
          <Link href="/pricing" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            Pricing
          </Link>
        </div>
      </div>
    </footer>
  );
}
