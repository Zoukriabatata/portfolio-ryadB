'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Map route prefixes to human-readable feature names
const ROUTE_LABELS: Record<string, { name: string; icon: string }> = {
  '/live':       { name: 'Live Charts & Order Flow', icon: 'M3 3v18h18' },
  '/orderflow':  { name: 'Footprint Charts', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
  '/liquidity':  { name: 'Liquidity Heatmap', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' },
  '/gex':        { name: 'GEX Dashboard', icon: 'M18 20V10M12 20V4M6 20v-6' },
  '/volatility': { name: 'Volatility Surface', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  '/journal':    { name: 'Trading Journal', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14v14H6.5' },
  '/backtest':   { name: 'Backtesting Engine', icon: 'M12 22V12m0-10v4m-8 4H2m20 0h-2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M17.66 17.66l1.41 1.41M4.93 4.93l1.41 1.41' },
  '/replay':     { name: 'Session Replay', icon: 'M5 3l14 9-14 9V3z' },
  '/bias':       { name: 'GVS Bias Engine', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  '/academy':    { name: 'Research Academy', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 7l-9-5 9-5 9 5-9 5z' },
  '/news':       { name: 'News & Events Calendar', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l4 4v10a2 2 0 01-2 2z' },
  '/ai':         { name: 'AI Trading Assistant', icon: 'M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zM4 6a2 2 0 012-2h.01M18 6a2 2 0 012 2v.01M20 18a2 2 0 01-2 2h-.01M4 18a2 2 0 01-2-2v-.01M3 12H1m22 0h-2m-9 9v2M12 1v2' },
  '/boutique':   { name: 'Data Provider Marketplace', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
  '/footprint':  { name: 'Footprint Analysis', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18' },
};

const PRO_FEATURES = [
  { label: 'Footprint charts (delta, volume, imbalance)', icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
  { label: 'Liquidity heatmap (WebGL, real-time)', icon: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' },
  { label: 'GEX dashboard & gamma exposure', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { label: 'Volatility surface & IV skew analysis', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { label: 'GVS Bias engine (institutional signals)', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { label: 'Trading journal with analytics', icon: 'M4 19.5A2.5 2.5 0 016.5 17H20' },
  { label: 'Backtesting & session replay', icon: 'M5 3l14 9-14 9V3z' },
  { label: 'AI trading assistant (Claude-powered)', icon: 'M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2z' },
  { label: 'All symbols, all timeframes', icon: 'M3 3v18h18' },
  { label: 'Up to 2 devices simultaneously', icon: 'M9 17H5a2 2 0 00-2 2v2h18v-2a2 2 0 00-2-2h-4' },
  { label: 'Multi-broker (IB, Rithmic, dxFeed, AMP)', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
];

function UpgradeContent() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '';
  const isExpired = searchParams.get('expired') === '1';

  // Find the feature the user was trying to access
  const matchedRoute = Object.keys(ROUTE_LABELS).find(r => from.startsWith(r));
  const featureInfo = matchedRoute ? ROUTE_LABELS[matchedRoute] : null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 relative overflow-hidden" style={{ backgroundColor: '#0a0a0f' }}>
      {/* Background orbs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb, 74 222 128) / 0.07), transparent 65%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb, 139 92 246) / 0.05), transparent 65%)', filter: 'blur(80px)' }} />

      <div className="relative z-10 w-full max-w-2xl mx-auto">

        {/* Lock icon + headline */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
            style={{ background: 'rgb(var(--primary-rgb, 74 222 128) / 0.08)', border: '1px solid rgb(var(--primary-rgb, 74 222 128) / 0.2)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--primary-light, #86efac)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>

          {isExpired ? (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-white/90 mb-3">
                Your subscription has expired
              </h1>
              <p className="text-white/45 text-sm leading-relaxed max-w-sm mx-auto">
                Renew your PRO plan to regain access to all professional tools.
              </p>
            </>
          ) : featureInfo ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-4"
                style={{ background: 'rgb(var(--primary-rgb, 74 222 128) / 0.08)', color: 'var(--primary-light, #86efac)', border: '1px solid rgb(var(--primary-rgb, 74 222 128) / 0.15)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={featureInfo.icon} />
                </svg>
                {featureInfo.name}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white/90 mb-3">
                PRO plan required
              </h1>
              <p className="text-white/45 text-sm leading-relaxed max-w-sm mx-auto">
                <span style={{ color: 'var(--primary-light, #86efac)' }}>{featureInfo.name}</span> is only available on the PRO plan.
                Upgrade to unlock the full professional suite.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-white/90 mb-3">
                PRO plan required
              </h1>
              <p className="text-white/45 text-sm leading-relaxed max-w-sm mx-auto">
                This feature is only available on the PRO plan. Upgrade to unlock the full professional suite.
              </p>
            </>
          )}
        </div>

        {/* Price card */}
        <div className="rounded-2xl p-6 mb-6 relative overflow-hidden"
          style={{ background: 'rgb(var(--primary-rgb, 74 222 128) / 0.04)', border: '1px solid rgb(var(--primary-rgb, 74 222 128) / 0.15)' }}>
          {/* Launch badge */}
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase"
              style={{ background: 'rgb(var(--primary-rgb, 74 222 128) / 0.12)', color: 'var(--primary-light, #86efac)', border: '1px solid rgb(var(--primary-rgb, 74 222 128) / 0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--primary-light, #86efac)' }} />
              Launch Offer
            </span>
          </div>

          <div className="flex items-end gap-2 mb-1">
            <span className="text-4xl font-black text-white">$29</span>
            <span className="text-white/40 text-sm mb-1.5">/month</span>
          </div>
          <p className="text-[12px] text-white/30 mb-5">
            Locked for life · Regular price $39/mo after launch
          </p>

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4">
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'rgb(var(--primary-rgb, 74 222 128) / 0.12)' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: 'var(--primary-light, #86efac)' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-[12px] text-white/55">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/pricing"
            className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(to right, var(--primary-light, #86efac), var(--primary, #4ade80))', boxShadow: '0 0 30px rgb(var(--primary-rgb, 74 222 128) / 0.3)' }}
          >
            Upgrade to PRO — $29/mo
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium text-white/60 hover:text-white/90 border border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all duration-200"
          >
            Back to Home
          </Link>
        </div>

        {/* Reassurance */}
        <p className="text-center text-[11px] text-white/25 mt-5">
          No credit card required for free trial &bull; Cancel anytime &bull; Instant access after upgrade
        </p>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradeContent />
    </Suspense>
  );
}
