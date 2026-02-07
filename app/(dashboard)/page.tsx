'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LiveIcon,
  FootprintIcon,
  HeatmapIcon,
  GexIcon,
  VolatilityIcon,
  NewsIcon,
  ReplayIcon,
  BacktestIcon,
  JournalIcon,
  DataFeedIcon,
} from '@/components/ui/Icons';

const QUICK_LAUNCH = [
  { href: '/live', label: 'Live', Icon: LiveIcon, color: '#10b981', desc: 'Real-time charts' },
  { href: '/footprint', label: 'Footprint', Icon: FootprintIcon, color: '#14b8a6', desc: 'Order flow' },
  { href: '/liquidity', label: 'Liquidity', Icon: HeatmapIcon, color: '#06b6d4', desc: 'Heatmap' },
  { href: '/gex', label: 'GEX', Icon: GexIcon, color: '#22d3ee', desc: 'Gamma exposure' },
  { href: '/volatility', label: 'Volatility', Icon: VolatilityIcon, color: '#0ea5e9', desc: 'IV surface' },
  { href: '/news', label: 'News', Icon: NewsIcon, color: '#84cc16', desc: 'Market news' },
  { href: '/replay', label: 'Replay', Icon: ReplayIcon, color: '#8b5cf6', desc: 'Session replay' },
  { href: '/backtest', label: 'Backtest', Icon: BacktestIcon, color: '#a78bfa', desc: 'Strategy testing' },
  { href: '/journal', label: 'Journal', Icon: JournalIcon, color: '#f59e0b', desc: 'Trade journal' },
  { href: '/boutique', label: 'Data Feeds', Icon: DataFeedIcon, color: '#fbbf24', desc: 'Configure feeds' },
];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--success-bg)] border border-[var(--success)]/20">
              <span className="w-1.5 h-1.5 bg-[var(--success)] rounded-full animate-pulse" />
              <span className="text-xs font-medium text-[var(--success)]">All Systems Operational</span>
            </div>
          </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
              <span className="text-sm font-bold text-[var(--primary)]">F</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Free Plan</span>
                <span className="px-2 py-0.5 text-[10px] font-medium bg-[var(--surface-elevated)] text-[var(--text-muted)] rounded-full border border-[var(--border)]">
                  Active
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Crypto data only. Upgrade for futures access.</p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="px-4 py-2 bg-[var(--primary)] text-white text-xs font-medium rounded-lg hover:bg-[var(--primary-light)] transition-colors"
          >
            Upgrade to SENULTRA
          </Link>
        </div>

        {/* Quick Launch Grid */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Quick Launch</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {QUICK_LAUNCH.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="group bg-[var(--surface)] rounded-xl border border-[var(--border)] p-4 hover:border-[var(--border-light)] hover:-translate-y-0.5 transition-all cursor-pointer">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${item.color}12` }}
                  >
                    <item.Icon size={18} color={item.color} />
                  </div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.label}</h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Market Overview */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Market Overview</h2>
            <div className="space-y-3">
              <MarketRow symbol="BTC/USDT" price="97,432.50" change="+2.14%" positive />
              <MarketRow symbol="ETH/USDT" price="3,245.80" change="-0.87%" positive={false} />
              <MarketRow symbol="ES (S&P 500)" price="5,987.25" change="+0.43%" positive />
              <MarketRow symbol="NQ (Nasdaq)" price="21,345.00" change="+0.61%" positive />
            </div>
            <Link
              href="/live"
              className="block mt-4 text-center py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Open Live Charts
            </Link>
          </div>

          {/* Data Feed Status */}
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Data Feed Status</h2>
            <div className="space-y-3">
              <FeedRow name="Binance WebSocket" status="connected" latency="12ms" />
              <FeedRow name="Deribit Options" status="connected" latency="45ms" />
              <FeedRow name="Interactive Brokers" status="not_configured" />
              <FeedRow name="Rithmic" status="not_configured" />
            </div>
            <Link
              href="/boutique"
              className="block mt-4 text-center py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Configure Data Feeds
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketRow({ symbol, price, change, positive }: { symbol: string; price: string; change: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[var(--text-primary)] font-medium">{symbol}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-[var(--text-secondary)] font-mono">{price}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${positive ? 'text-[var(--bull)] bg-[var(--bull-bg)]' : 'text-[var(--bear)] bg-[var(--bear-bg)]'}`}>
          {change}
        </span>
      </div>
    </div>
  );
}

function FeedRow({ name, status, latency }: { name: string; status: 'connected' | 'error' | 'not_configured'; latency?: string }) {
  const statusConfig = {
    connected: { color: 'var(--success)', label: 'Connected', bg: 'var(--success-bg)' },
    error: { color: 'var(--error)', label: 'Error', bg: 'var(--error-bg)' },
    not_configured: { color: 'var(--text-dimmed)', label: 'Not configured', bg: 'var(--surface-elevated)' },
  }[status];

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-[var(--text-primary)]">{name}</span>
      <div className="flex items-center gap-2">
        {latency && <span className="text-[11px] text-[var(--text-muted)] font-mono">{latency}</span>}
        <span
          className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
          style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusConfig.color }} />
          {statusConfig.label}
        </span>
      </div>
    </div>
  );
}
