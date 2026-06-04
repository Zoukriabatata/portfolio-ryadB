'use client';

import type { DataFeedProviderInfo } from '@/lib/boutique/providers';
import type { DataFeedStatus } from '@/stores/useDataFeedStore';
import {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon, DatabentoIcon,
} from '@/components/ui/Icons';

const MONO = 'var(--font-jetbrains-mono)';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon, DatabentoIcon,
};

interface ProviderCardProps {
  provider: DataFeedProviderInfo;
  status: DataFeedStatus;
  userTier?: 'FREE' | 'PRO';
  onConfigure: (providerId: string) => void;
}

export default function ProviderCard({ provider, status, onConfigure }: ProviderCardProps) {
  const Icon = ICON_MAP[provider.iconName];
  const isConnected  = status === 'connected';
  const isConfigured = status === 'configured'; // saved but not verified (gateway providers)
  const isError      = status === 'error';

  const borderColor = isConnected
    ? 'var(--success)'
    : isConfigured
      ? 'var(--warning, #F59E0B)'
      : 'var(--border)';

  return (
    <div
      className="group relative rounded-2xl flex flex-col h-full transition-all duration-300 hover:translate-y-[-3px] overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${borderColor}`,
        boxShadow: isConnected
          ? '0 0 24px var(--success-bg)'
          : isConfigured
            ? '0 0 16px rgba(245,158,11,0.08)'
            : 'none',
      }}
    >
      {/* Hover glow — provider-tinted */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 50px ${provider.color}0A, 0 0 30px ${provider.color}12`, border: `1px solid ${provider.color}22` }}
      />
      {/* Top accent bar */}
      <div className="h-[2px] w-full" style={{ background: isConnected ? 'var(--success)' : isConfigured ? '#F59E0B' : provider.color }} />

      <div className="p-5 flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
            style={{ background: `${provider.color}15`, border: `1px solid ${provider.color}25` }}
          >
            {Icon && <Icon size={22} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {provider.name}
              </h3>
              {isConnected && <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--success)' }} />}
              {isConfigured && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#F59E0B' }} />}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              {provider.connectionType}
            </span>
          </div>
          {/* Tier badge */}
          <span
            className="shrink-0 px-2 py-0.5 rounded-full"
            style={{
              fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
              background: provider.tier === 'FREE' ? 'var(--success-bg)' : 'rgba(168,85,247,0.12)',
              color: provider.tier === 'FREE' ? 'var(--success)' : 'var(--accent)',
            }}
          >
            {provider.tier === 'FREE' ? 'Free' : 'Pro'}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs mb-3 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {provider.description}
        </p>

        {/* Markets */}
        <div className="flex flex-wrap gap-1 mb-3">
          {provider.markets.map(m => (
            <span
              key={m}
              className="px-1.5 py-0.5 rounded-md"
              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.04em', background: `${provider.color}0D`, color: provider.color, border: `1px solid ${provider.color}20` }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* Features — 2 columns */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mb-4 flex-1">
          {provider.features.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={provider.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div
          className="mb-3 px-2.5 py-1.5 rounded-lg"
          style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.02em', background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
        >
          {provider.pricingNote}
        </div>

        {/* Action */}
        <button
          onClick={() => onConfigure(provider.id)}
          className="w-full py-2.5 rounded-lg transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            background: isConnected
              ? 'var(--success-bg)'
              : isConfigured
                ? 'rgba(245,158,11,0.12)'
                : isError
                  ? 'var(--error-bg)'
                  : provider.color,
            color: isConnected
              ? 'var(--success)'
              : isConfigured
                ? '#F59E0B'
                : isError
                  ? 'var(--error)'
                  : '#06140b',
            border: isConnected
              ? '1px solid color-mix(in srgb, var(--success) 25%, transparent)'
              : isConfigured
                ? '1px solid rgba(245,158,11,0.3)'
                : isError
                  ? '1px solid color-mix(in srgb, var(--error) 25%, transparent)'
                  : 'none',
          }}
        >
          {isConnected
            ? 'Connected ✓'
            : isConfigured
              ? 'Configured ✓'
              : isError
                ? 'Retry'
                : 'Connect'}
        </button>
      </div>
    </div>
  );
}
