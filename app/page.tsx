'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  LiveIcon,
  FootprintIcon,
  HeatmapIcon,
  GexIcon,
  VolatilityIcon,
  ChartIcon,
} from '@/components/ui/Icons';

const FEATURES = [
  {
    Icon: LiveIcon,
    title: 'Live Trading',
    description: 'Real-time market data with WebSocket feeds from multiple exchanges',
    color: '#10b981',
    href: '/live',
  },
  {
    Icon: FootprintIcon,
    title: 'Footprint Charts',
    description: 'Advanced orderflow visualization with bid/ask volume analysis',
    color: '#14b8a6',
    href: '/footprint',
  },
  {
    Icon: HeatmapIcon,
    title: 'Liquidity Heatmap',
    description: 'Visualize market depth and liquidity zones in real-time',
    color: '#06b6d4',
    href: '/liquidity',
  },
  {
    Icon: GexIcon,
    title: 'GEX Analysis',
    description: 'Gamma exposure tracking for options-driven market movements',
    color: '#22d3ee',
    href: '/gex',
  },
  {
    Icon: VolatilityIcon,
    title: 'IV Surface',
    description: 'Implied volatility surface and skew analysis for options',
    color: '#0ea5e9',
    href: '/volatility',
  },
  {
    Icon: ChartIcon,
    title: 'Market Replay',
    description: 'Review and analyze historical market sessions frame-by-frame',
    color: '#8b5cf6',
    href: '/replay',
  },
];

const STATS = [
  { value: '5ms', label: 'Average Latency' },
  { value: '99.9%', label: 'Uptime' },
  { value: '10+', label: 'Data Sources' },
  { value: '24/7', label: 'Live Support' },
];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const sessionData = useSession();
  const session = sessionData?.data;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-[var(--background)]">
      {/* Hero Section */}
      <section className="relative min-h-[600px] flex items-center justify-center px-6 py-20">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 via-transparent to-[var(--accent)]/5" />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />

        <div className="relative max-w-6xl mx-auto text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] animate-fade-in">
            <span className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
            Production Ready • Real-time Data
          </div>

          {/* Main Heading */}
          <div className="space-y-4 animate-fade-in-up">
            <h1 className="text-5xl md:text-7xl font-bold text-[var(--text-primary)] tracking-tight">
              Professional
              <span className="block mt-2 bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-[var(--primary)] bg-clip-text text-transparent animate-gradient">
                Order Flow Analytics
              </span>
            </h1>
            <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-3xl mx-auto leading-relaxed">
              Institutional-grade market microstructure analysis.
              Real-time liquidity heatmaps, footprint charts, and gamma exposure tracking.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            {session ? (
              <Link
                href="/live"
                className="px-8 py-4 bg-[var(--primary)] text-white rounded-xl font-semibold hover:bg-[var(--primary-light)] transition-all hover:scale-105 shadow-lg hover:shadow-xl"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/register"
                  className="px-8 py-4 bg-[var(--primary)] text-white rounded-xl font-semibold hover:bg-[var(--primary-light)] transition-all hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/auth/login"
                  className="px-8 py-4 bg-[var(--surface)] text-[var(--text-primary)] rounded-xl font-semibold border border-[var(--border)] hover:border-[var(--border-light)] hover:bg-[var(--surface-elevated)] transition-all"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-12 max-w-4xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            {STATS.map((stat, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-20 bg-[var(--surface)]/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold text-[var(--text-primary)]">
              Everything You Need
            </h2>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
              Professional trading tools built for serious traders and institutions
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, idx) => (
              <Link
                key={idx}
                href={feature.href}
                className="group relative bg-[var(--background)] rounded-2xl border border-[var(--border)] p-8 hover:border-[var(--border-light)] transition-all hover:-translate-y-1 hover:shadow-xl"
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                {/* Icon */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `${feature.color}15` }}
                >
                  <feature.Icon size={28} color={feature.color} />
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>

                {/* Arrow */}
                <div className="absolute bottom-8 right-8 w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                  <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] rounded-3xl p-12 md:p-16 overflow-hidden">
            {/* Background Pattern */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                backgroundSize: '40px 40px',
              }}
            />

            <div className="relative text-center space-y-6">
              <h2 className="text-3xl md:text-5xl font-bold text-white">
                Ready to Start Trading?
              </h2>
              <p className="text-lg text-white/90 max-w-2xl mx-auto">
                Join thousands of traders using professional-grade analytics to make better decisions.
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                {session ? (
                  <Link
                    href="/live"
                    className="px-8 py-4 bg-white text-[var(--primary)] rounded-xl font-semibold hover:shadow-xl transition-all hover:scale-105"
                  >
                    Go to Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/auth/register"
                      className="px-8 py-4 bg-white text-[var(--primary)] rounded-xl font-semibold hover:shadow-xl transition-all hover:scale-105"
                    >
                      Get Started Free
                    </Link>
                    <Link
                      href="/pricing"
                      className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-xl font-semibold border-2 border-white/30 hover:bg-white/20 transition-all"
                    >
                      View Pricing
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-[var(--border)] bg-[var(--surface)]/30">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-[var(--text-muted)]">
              © 2026 OrderFlow v2. Professional Trading Analytics.
            </div>
            <div className="flex items-center gap-6">
              <Link href="/legal/terms" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                Terms
              </Link>
              <Link href="/legal/privacy" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                Privacy
              </Link>
              <Link href="/pricing" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                Pricing
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
