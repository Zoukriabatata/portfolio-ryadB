'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  LiveIcon,
  FootprintIcon,
  GexIcon,
  VolatilityIcon,
  NewsIcon,
  HeatmapIcon,
  JournalIcon,
  ReplayIcon,
  BiasIcon,
  DataFeedIcon,
} from '@/components/ui/Icons';

const QUICK_ACTIONS = [
  { href: '/live', label: 'Live Charts', description: 'Real-time candlestick & order flow', Icon: LiveIcon, color: '#10b981' },
  { href: '/footprint', label: 'Footprint', description: 'Delta & volume profile analysis', Icon: FootprintIcon, color: '#14b8a6' },
  { href: '/liquidity', label: 'Heatmap', description: 'Liquidity depth visualization', Icon: HeatmapIcon, color: '#06b6d4' },
  { href: '/gex', label: 'GEX', description: 'Gamma exposure dashboard', Icon: GexIcon, color: '#22d3ee' },
  { href: '/volatility', label: 'Volatility', description: 'IV surface & skew analysis', Icon: VolatilityIcon, color: '#0ea5e9' },
  { href: '/bias', label: 'Bias Engine', description: 'Multi-factor directional bias', Icon: BiasIcon, color: '#f59e0b' },
  { href: '/news', label: 'News', description: 'Economic calendar & events', Icon: NewsIcon, color: '#84cc16' },
  { href: '/journal', label: 'Journal', description: 'Trade logging & analytics', Icon: JournalIcon, color: '#f59e0b' },
  { href: '/replay', label: 'Replay', description: 'Session recording & playback', Icon: ReplayIcon, color: '#8b5cf6' },
  { href: '/boutique', label: 'Data Feeds', description: 'Configure market data sources', Icon: DataFeedIcon, color: '#fbbf24' },
];

const KEYBOARD_HINTS = [
  { keys: 'Alt+1–0', description: 'Navigate between pages' },
  { keys: 'Ctrl+T', description: 'Change theme' },
  { keys: '+/−', description: 'Zoom in/out on charts' },
  { keys: 'Esc', description: 'Close modals & dropdowns' },
];

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState('');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hour = now.getHours();
      setGreeting(
        hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
      );
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fadeIn">
        {/* Welcome Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))' }}
            >
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                {greeting}, Trader
              </h1>
              <p className="text-xs text-[var(--text-muted)]">
                {currentTime} — Ready to analyze the markets
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wider">
            Quick Access
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {QUICK_ACTIONS.map((action, i) => {
              const IconComponent = action.Icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group relative flex flex-col items-center gap-3 p-4 sm:p-5 rounded-xl border border-[var(--border)] hover:border-[var(--border-light)] transition-all duration-300 stagger-fade-up"
                  style={{
                    background: 'var(--surface)',
                    animationDelay: `${i * 0.04}s`,
                  }}
                >
                  {/* Hover glow */}
                  <div
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at 50% 30%, ${action.color}08 0%, transparent 70%)`,
                    }}
                  />
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg relative z-10"
                    style={{
                      background: `${action.color}12`,
                      border: `1px solid ${action.color}20`,
                    }}
                  >
                    <span style={{ color: action.color }}>
                      <IconComponent size={20} />
                    </span>
                  </div>
                  <div className="text-center relative z-10">
                    <div className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--text-primary)] mb-0.5">
                      {action.label}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] leading-tight hidden sm:block">
                      {action.description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {/* Platform Status */}
          <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#10b981] live-dot" />
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Platform Status</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'WebSocket Feed', status: 'Operational', color: '#10b981' },
                { label: 'Data Processing', status: 'Operational', color: '#10b981' },
                { label: 'Options Data (Deribit)', status: 'Operational', color: '#10b981' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">{item.label}</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: `${item.color}15`, color: item.color }}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Getting Started */}
          <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Getting Started</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Open Live Charts', href: '/live', done: false },
                { label: 'Configure Data Feeds', href: '/boutique', done: false },
                { label: 'Set Your Preferences', href: '/account', done: false },
                { label: 'Explore the Journal', href: '/journal', done: false },
              ].map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className="flex items-center gap-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors group"
                >
                  <div className="w-5 h-5 rounded-full border border-[var(--border)] flex items-center justify-center group-hover:border-[var(--primary)] transition-colors">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-[var(--text-dimmed)] group-hover:text-[var(--primary)]">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                  {step.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="rounded-xl border border-[var(--border)] p-5 sm:col-span-2 lg:col-span-1" style={{ background: 'var(--surface)' }}>
            <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2.5">
              {KEYBOARD_HINTS.map((hint) => (
                <div key={hint.keys} className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">{hint.description}</span>
                  <kbd className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-[var(--border)] text-[var(--text-dimmed)]" style={{ background: 'var(--surface-elevated)' }}>
                    {hint.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pb-8">
          <p className="text-[10px] text-[var(--text-dimmed)]">
            Senzoukria v1.0 — Professional Order Flow Analytics
          </p>
        </div>
      </div>
    </div>
  );
}
