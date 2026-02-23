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

interface ProviderCardProps {
  provider: DataFeedProviderInfo;
  status: DataFeedStatus;
  userTier?: 'FREE' | 'ULTRA';
  onConfigure: (providerId: string) => void;
}

export default function ProviderCard({ provider, status, onConfigure }: ProviderCardProps) {
  const { t } = useTranslation();
  const Icon = ICON_MAP[provider.iconName];
  const isConnected = status === 'connected';
  const isError = status === 'error';

  return (
    <div
      className="group relative rounded-2xl flex flex-col transition-all duration-300 hover:translate-y-[-3px] overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isConnected ? 'var(--success)' : 'var(--border)'}`,
        boxShadow: isConnected
          ? '0 0 20px rgba(34,197,94,0.08)'
          : 'none',
      }}
    >
      {/* Top accent bar */}
      <div className="h-[2px] w-full" style={{ background: isConnected ? 'var(--success)' : provider.color }} />

      <div className="p-5 flex flex-col flex-1">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
            style={{ background: `${provider.color}15`, border: `1px solid ${provider.color}25` }}
          >
            {Icon && <Icon size={22} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {provider.name}
              </h3>
              {/* Connected dot */}
              {isConnected && (
                <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: 'var(--success)' }} />
              )}
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {provider.connectionType}
            </span>
          </div>
          {/* Tier badge */}
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
            style={{
              background: provider.tier === 'FREE' ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.12)',
              color: provider.tier === 'FREE' ? 'var(--success)' : 'var(--accent, #a855f7)',
            }}
          >
            {provider.tier === 'FREE' ? t('boutique.free') : 'ULTRA'}
          </span>
        </div>

        {/* Description */}
        <p className="text-xs mb-3 leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {provider.description}
        </p>

        {/* Markets chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {provider.markets.map(m => (
            <span
              key={m}
              className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: `${provider.color}0D`, color: provider.color, border: `1px solid ${provider.color}20` }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* Features — compact 2-column */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-4 flex-1">
          {provider.features.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span className="shrink-0 w-3 h-3 rounded-full flex items-center justify-center text-[8px]"
                style={{ background: `${provider.color}15`, color: provider.color }}>
                &#10003;
              </span>
              <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="text-[11px] mb-3 px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
          {provider.pricingNote}
        </div>

        {/* Action button */}
        <button
          onClick={() => onConfigure(provider.id)}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
          style={{
            background: isConnected
              ? 'rgba(34,197,94,0.12)'
              : isError
                ? 'rgba(239,68,68,0.12)'
                : provider.color,
            color: isConnected
              ? 'var(--success)'
              : isError
                ? '#ef4444'
                : '#000',
            border: isConnected
              ? '1px solid rgba(34,197,94,0.25)'
              : isError
                ? '1px solid rgba(239,68,68,0.25)'
                : 'none',
          }}
        >
          {isConnected
            ? `${t('boutique.connected')} \u2713`
            : isError
              ? 'Retry'
              : 'Connect'}
        </button>
      </div>
    </div>
  );
}
