'use client';

import type { DataFeedProviderInfo } from '@/lib/boutique/providers';
import type { DataFeedStatus } from '@/stores/useDataFeedStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon,
} from '@/components/ui/Icons';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  BinanceIcon, BybitIcon, DeribitIcon, RithmicIcon,
  InteractiveBrokersIcon, TradovateIcon, CQGIcon, DxFeedIcon, AMPIcon,
};

const STATUS_COLORS: Record<DataFeedStatus, { bg: string; text: string; label: string }> = {
  connected: { bg: 'var(--success-bg)', text: 'var(--success)', label: 'boutique.connected' },
  configured: { bg: 'var(--surface-elevated)', text: 'var(--text-muted)', label: 'boutique.notConfigured' }, // treat as not_configured
  not_configured: { bg: 'var(--surface-elevated)', text: 'var(--text-muted)', label: 'boutique.notConfigured' },
  error: { bg: 'var(--error-bg)', text: 'var(--error)', label: 'boutique.error' },
};

interface ProviderCardProps {
  provider: DataFeedProviderInfo;
  status: DataFeedStatus;
  userTier?: 'FREE' | 'ULTRA';
  onConfigure: (providerId: string) => void;
}

export default function ProviderCard({ provider, status, onConfigure }: ProviderCardProps) {
  const { t } = useTranslation();
  const Icon = ICON_MAP[provider.iconName];
  const statusInfo = STATUS_COLORS[status];
  const isPremiumBroker = provider.requiresCredentials;

  return (
    <div
      className="relative rounded-2xl p-6 flex flex-col transition-all duration-200 hover:translate-y-[-2px]"
      style={{
        background: isPremiumBroker
          ? `linear-gradient(170deg, ${provider.color}0F 0%, var(--surface) 40%)`
          : 'var(--surface)',
        border: isPremiumBroker ? `1.5px solid ${provider.color}40` : '1px solid var(--border)',
        boxShadow: isPremiumBroker ? `0 0 30px ${provider.color}10` : 'none',
        opacity: 1,
      }}
    >
      {/* Header: Icon + Name + Badges */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${provider.color}18` }}
          >
            {Icon && <Icon size={22} />}
          </div>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {provider.connectionType}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {/* Tier badge */}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{
              background: provider.tier === 'FREE' ? 'var(--success-bg)' : 'var(--accent-bg, rgba(168,85,247,0.15))',
              color: provider.tier === 'FREE' ? 'var(--success)' : 'var(--accent, #a855f7)',
            }}
          >
            {provider.tier === 'FREE' ? t('boutique.free') : 'ULTRA'}
          </span>
          {/* Status badge */}
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: statusInfo.bg, color: statusInfo.text }}
          >
            {t(statusInfo.label as any)}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {provider.description}
      </p>

      {/* Markets chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {provider.markets.map(m => (
          <span
            key={m}
            className="text-[11px] px-2 py-0.5 rounded-md"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            {m}
          </span>
        ))}
      </div>

      {/* Features */}
      <ul className="space-y-1.5 mb-5 flex-1">
        {provider.features.slice(0, 4).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0" style={{ color: provider.color }}>&#10003;</span>
            <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
          </li>
        ))}
        {provider.features.length > 4 && (
          <li className="text-xs" style={{ color: 'var(--text-muted)' }}>
            +{provider.features.length - 4} more
          </li>
        )}
      </ul>

      {/* Pricing note */}
      <div className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
        {provider.pricingNote}
      </div>

      {/* Action button */}
      <button
        onClick={() => onConfigure(provider.id)}
        className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
        style={{
          background: status === 'connected' ? `${provider.color}20` : status === 'error' ? 'rgba(239,68,68,0.15)' : provider.color,
          color: status === 'connected' ? provider.color : status === 'error' ? '#ef4444' : 'var(--primary-foreground, #000)',
        }}
      >
        {status === 'connected'
          ? `${t('boutique.connected')} \u2713`
          : status === 'error'
            ? 'Retry'
            : 'Connect'}
      </button>
    </div>
  );
}
