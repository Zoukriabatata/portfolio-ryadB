'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Logo from '@/components/ui/Logo';
import {
  LiveIcon,
  FootprintIcon,
  GexIcon,
  VolatilityIcon,
  HeatmapIcon,
  NewsIcon,
  ReplayIcon,
  BacktestIcon,
} from '@/components/ui/Icons';

const AnimatedFootprintPreview = dynamic(
  () => import('@/components/charts/AnimatedFootprintPreview'),
  { ssr: false }
);

const FEATURES = [
  {
    icon: LiveIcon,
    title: 'Live Charts',
    description: 'Real-time candlestick charts with professional drawing tools and multi-timeframe analysis.',
    color: '#10b981',
  },
  {
    icon: FootprintIcon,
    title: 'Footprint Charts',
    description: 'Orderflow visualization with bid/ask clusters, delta profiles, and imbalance detection.',
    color: '#14b8a6',
  },
  {
    icon: HeatmapIcon,
    title: 'Liquidity Heatmap',
    description: 'WebGL-accelerated orderbook depth visualization with passive order tracking.',
    color: '#06b6d4',
  },
  {
    icon: GexIcon,
    title: 'Gamma Exposure',
    description: 'Real-time GEX analysis with call/put walls, zero gamma levels, and regime detection.',
    color: '#22d3ee',
  },
  {
    icon: VolatilityIcon,
    title: 'Volatility Analysis',
    description: 'IV smile visualization, term structure, and 3D volatility surface mapping.',
    color: '#0ea5e9',
  },
  {
    icon: NewsIcon,
    title: 'Market News',
    description: 'Real-time market news feed with sentiment analysis and economic calendar.',
    color: '#84cc16',
  },
  {
    icon: ReplayIcon,
    title: 'Market Replay',
    description: 'Record and replay market sessions for post-market analysis and training.',
    color: '#8b5cf6',
  },
  {
    icon: BacktestIcon,
    title: 'Backtesting',
    description: 'Test strategies against historical data with detailed performance analytics.',
    color: '#a78bfa',
  },
];

const PRICING = {
  free: {
    name: 'FREE',
    price: '0',
    features: [
      'Live Charts (Crypto)',
      'Basic Footprint',
      'News Feed',
      'Journal (5 entries)',
      'Community Support',
    ],
    limits: [
      'Crypto data only',
      'No replay/backtest',
      'Basic drawing tools',
    ],
  },
  ultra: {
    name: 'SENULTRA',
    price: '50',
    features: [
      'All FREE features',
      'Futures Data (ES, NQ, CL...)',
      'Full Liquidity Heatmap',
      'GEX Dashboard',
      'Volatility Surface',
      'Market Replay',
      'Backtesting Engine',
      'Unlimited Journal',
      'Advanced Drawing Tools',
      'Priority Support',
    ],
    limits: [],
  },
};

const DATA_SOURCES = [
  { name: 'Interactive Brokers', markets: 'Stocks, Options, Futures, Forex', logo: 'IB' },
  { name: 'dxFeed', markets: 'US Equities, Options, CME Futures', logo: 'dX' },
  { name: 'Rithmic', markets: 'CME, CBOT, NYMEX, COMEX', logo: 'R1' },
  { name: 'AMP Futures', markets: 'CME Futures', logo: 'AMP' },
];

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    setMounted(true);

    // Smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';

    // Parallax effect on scroll
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Intersection Observer for fade-in animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in-visible');
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px 50px 0px' }
    );

    // Observe all elements with fade-in class
    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  if (!mounted) return null;

  return (
      <div className="landing-page min-h-screen text-[var(--text-primary)] relative bg-[var(--background)]">
        {/* Animated background */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `
                linear-gradient(var(--primary) 1px, transparent 1px),
                linear-gradient(90deg, var(--primary) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
          <div
            className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-[var(--primary)]/5 rounded-full blur-[150px] float-animation"
            style={{ transform: `translateY(${scrollY * 0.3}px)` }}
          />
          <div
            className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-[var(--accent)]/5 rounded-full blur-[120px] float-animation"
            style={{ animationDelay: '1s', transform: `translateY(${scrollY * -0.2}px)` }}
          />
        </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo size="md" showText={true} animated={true} />

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Pricing</a>
            <a href="#data" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Data Feeds</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Login
            </Link>
            <Link
              href="/live"
              className="px-5 py-2 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white text-sm font-medium rounded-lg transition-all hover:shadow-lg hover:shadow-[var(--primary-glow)]"
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        <div className="max-w-7xl mx-auto px-6 py-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 mb-8">
            <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full animate-pulse" />
            <span className="text-xs text-[var(--primary)]">Professional Trading Intelligence</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-gradient">SENZOUKRIA</span>
            <br />
            <span className="text-[var(--text-primary)]">Trading Platform</span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10">
            Professional orderflow analysis, gamma exposure tracking, and volatility tools for the modern trader.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/auth/register"
              className="group btn-primary shine px-8 py-3.5 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-medium rounded-xl transition-all hover:shadow-xl hover:shadow-[var(--primary-glow)] hover:scale-105 flex items-center gap-2"
            >
              Start Free
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>

            <Link
              href="#pricing"
              className="px-8 py-3.5 bg-[var(--surface)] text-[var(--text-primary)] font-medium rounded-xl border border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface-elevated)] transition-all hover:scale-105 shine"
            >
              SENULTRA — 50€/mois
            </Link>
          </div>

          {/* Chart Preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--primary)]/10 via-[var(--accent)]/10 to-[var(--primary)]/10 rounded-2xl blur-xl" />
            <div className="relative bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-1.5 shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--error)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--warning)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--success)]" />
                </div>
                <span className="text-xs text-[var(--text-muted)] font-mono">BTC/USDT  Footprint  Live</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[var(--success)] rounded-full animate-pulse" />
                  <span className="text-[10px] text-[var(--success)]">Connected</span>
                </div>
              </div>
              <div className="h-[280px] md:h-[380px] relative overflow-hidden rounded-b-xl">
                <AnimatedFootprintPreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14 fade-in fade-in-visible">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              <span className="text-gradient">Professional Tools</span>
            </h2>
            <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
              Everything you need for serious trading analysis.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, index) => (
              <div
                key={feature.title}
                className="fade-in group bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5
                  hover:border-[var(--border-light)] hover-lift feature-card hover-glow"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-110 group-hover:rotate-6"
                  style={{ backgroundColor: `${feature.color}15` }}
                >
                  <feature.icon size={22} color={feature.color} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5 text-[var(--text-primary)]">{feature.title}</h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 relative z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14 fade-in fade-in-visible">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              <span className="text-gradient">Simple Pricing</span>
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              Start free. Upgrade when you need futures data.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* FREE */}
            <div className="fade-in slide-in-left bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 hover-lift">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{PRICING.free.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold text-[var(--text-primary)]">{PRICING.free.price}</span>
                <span className="text-sm text-[var(--text-muted)]">/month</span>
              </div>
              <ul className="space-y-2 mb-6">
                {PRICING.free.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="w-4 h-4 text-[var(--success)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
                {PRICING.free.limits.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-sm text-[var(--text-dimmed)]">
                    <svg className="w-4 h-4 text-[var(--text-dimmed)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                    </svg>
                    {l}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full text-center py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* SENULTRA */}
            <div className="fade-in slide-in-right bg-[var(--surface-elevated)] rounded-xl border border-[var(--primary)]/30 p-6 relative hover-lift pulse-glow">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--primary)] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                Recommended
              </span>
              <h3 className="text-lg font-semibold text-[var(--primary)] mb-1">{PRICING.ultra.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold text-[var(--text-primary)]">{PRICING.ultra.price}</span>
                <span className="text-sm text-[var(--text-muted)]">/month</span>
              </div>
              <ul className="space-y-2 mb-6">
                {PRICING.ultra.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="w-4 h-4 text-[var(--primary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="block w-full text-center py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary-light)] transition-colors"
              >
                Subscribe
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources Section */}
      <section id="data" className="py-20 relative z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14 fade-in fade-in-visible">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              <span className="text-gradient">Data Feeds</span>
            </h2>
            <p className="text-[var(--text-secondary)] text-lg">
              Connect your own broker for real-time futures data.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DATA_SOURCES.map((source) => (
              <div
                key={source.name}
                className="fade-in scale-in bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 text-center hover-lift hover-glow"
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[var(--surface-elevated)] flex items-center justify-center border border-[var(--border)]">
                  <span className="text-sm font-bold text-[var(--primary)]">{source.logo}</span>
                </div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{source.name}</h3>
                <p className="text-xs text-[var(--text-muted)]">{source.markets}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-[var(--border)] relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo size="sm" showText={true} animated={false} />

            <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
              <Link href="/live" className="hover:text-[var(--text-primary)] transition-colors">Live</Link>
              <Link href="/footprint" className="hover:text-[var(--text-primary)] transition-colors">Footprint</Link>
              <Link href="/pricing" className="hover:text-[var(--text-primary)] transition-colors">Pricing</Link>
              <Link href="/auth/login" className="hover:text-[var(--text-primary)] transition-colors">Login</Link>
              <Link href="/auth/register" className="hover:text-[var(--text-primary)] transition-colors">Register</Link>
            </div>

            <div className="text-xs text-[var(--text-dimmed)]">
              &copy; {new Date().getFullYear()} SENZOUKRIA
            </div>
          </div>
        </div>
      </footer>

      {/* Scroll to top button */}
      {scrollY > 500 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 z-50 p-3 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110 fade-in-visible"
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}
    </div>
  );
}
