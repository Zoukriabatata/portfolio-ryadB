'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { DATA_FEED_PROVIDERS, type ProviderCategory } from '@/lib/boutique/providers';
import ProviderCard from '@/components/boutique/ProviderCard';
import ConfigureModal from '@/components/boutique/ConfigureModal';
import ComparisonTable from '@/components/boutique/ComparisonTable';

type FilterCategory = ProviderCategory | 'all';

const CATEGORY_TABS: { key: FilterCategory; labelKey: string }[] = [
  { key: 'all', labelKey: 'boutique.allProviders' },
  { key: 'crypto', labelKey: 'boutique.crypto' },
  { key: 'futures', labelKey: 'boutique.futures' },
  { key: 'multi-asset', labelKey: 'boutique.multiAsset' },
];

const FAQ_ITEMS: { qKey: string; aKey: string }[] = [
  { qKey: 'boutique.faqSubscription', aKey: 'boutique.faqSubscriptionAnswer' },
  { qKey: 'boutique.faqConnect', aKey: 'boutique.faqConnectAnswer' },
  { qKey: 'boutique.faqRealtime', aKey: 'boutique.faqRealtimeAnswer' },
  { qKey: 'boutique.faqMultiple', aKey: 'boutique.faqMultipleAnswer' },
  { qKey: 'boutique.faqDifference', aKey: 'boutique.faqDifferenceAnswer' },
];

export default function BoutiquePage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const configs = useDataFeedStore(s => s.configs);

  const [category, setCategory] = useState<FilterCategory>('all');
  const [configureProvider, setConfigureProvider] = useState<string | null>(null);

  const userTier = (session?.user as any)?.tier || 'FREE';

  const filtered = category === 'all'
    ? DATA_FEED_PROVIDERS
    : DATA_FEED_PROVIDERS.filter(p => p.category === category);

  const activeProvider = configureProvider
    ? DATA_FEED_PROVIDERS.find(p => p.id === configureProvider)
    : null;

  const connectedCount = Object.values(configs).filter(c => c.status === 'connected').length;
  const configuredCount = Object.values(configs).filter(c => c.status === 'configured').length;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      {/* Animated gradient orbs — use CSS variables for theme compatibility */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full"
          style={{ background: 'radial-gradient(circle, var(--success-bg) 0%, transparent 70%)', animation: 'pulse 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full"
          style={{ background: 'radial-gradient(circle, var(--info-bg) 0%, transparent 70%)', animation: 'pulse 10s ease-in-out infinite 2s' }} />
        <div className="absolute top-[30%] right-[10%] w-[40vw] h-[40vw] rounded-full"
          style={{ background: 'radial-gradient(circle, var(--warning-bg) 0%, transparent 70%)', animation: 'pulse 12s ease-in-out infinite 4s' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-[var(--success)] to-[var(--primary)] bg-clip-text text-transparent">
              {t('boutique.title')}
            </span>
          </h1>
          <p className="text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-muted)' }}>
            {t('boutique.subtitle')}
          </p>

          {/* Stats bar */}
          {(connectedCount > 0 || configuredCount > 0) && (
            <div className="flex items-center justify-center gap-6 mt-6">
              {connectedCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{connectedCount} connected</span>
                </div>
              )}
              {configuredCount > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full" style={{ background: 'var(--info)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{configuredCount} configured</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: category === tab.key ? 'var(--primary)' : 'var(--surface)',
                color: category === tab.key ? 'var(--primary-foreground, #000)' : 'var(--text-secondary)',
                border: category === tab.key ? 'none' : '1px solid var(--border)',
              }}
            >
              {t(tab.labelKey as any)}
            </button>
          ))}
        </div>

        {/* Provider Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-20">
          {filtered.map(provider => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              status={configs[provider.id]?.status || 'not_configured'}
              userTier={userTier}
              onConfigure={setConfigureProvider}
            />
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            {t('boutique.comparison')}
          </h2>
          <ComparisonTable />
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mb-20">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            {t('boutique.faq')}
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <summary
                  className="flex items-center justify-between px-5 py-4 cursor-pointer list-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="text-sm font-medium pr-4">{t(item.qKey as any)}</span>
                  <span
                    className="shrink-0 text-lg transition-transform group-open:rotate-45"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    +
                  </span>
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {t(item.aKey as any)}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Info section */}
        <div className="max-w-2xl mx-auto text-center pb-12">
          <div
            className="rounded-2xl p-8"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-3xl mb-4">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" className="mx-auto">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
              What are data feeds?
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Data feeds provide real-time market data streams directly from exchanges and data providers.
              They power the order flow analysis, footprint charts, liquidity heatmaps, and all trading features
              on this platform. Free crypto feeds connect instantly. Professional futures feeds require an account
              with the data provider and may involve additional exchange subscription fees.
            </p>
          </div>
        </div>
      </div>

      {/* Configure Modal */}
      {activeProvider && (
        <ConfigureModal
          provider={activeProvider}
          onClose={() => setConfigureProvider(null)}
        />
      )}
    </div>
  );
}
