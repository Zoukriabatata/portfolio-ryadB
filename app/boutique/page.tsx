'use client';

import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { DATA_FEED_PROVIDERS, type ProviderCategory } from '@/lib/boutique/providers';
import ProviderCard from '@/components/boutique/ProviderCard';
import ConfigureModal from '@/components/boutique/ConfigureModal';
import ComparisonTable from '@/components/boutique/ComparisonTable';

type FilterCategory = ProviderCategory | 'all';

const CATEGORY_TABS: { key: FilterCategory; labelKey: string; icon: string }[] = [
  { key: 'all', labelKey: 'boutique.allProviders', icon: '' },
  { key: 'crypto', labelKey: 'boutique.crypto', icon: '' },
  { key: 'futures', labelKey: 'boutique.futures', icon: '' },
  { key: 'multi-asset', labelKey: 'boutique.multiAsset', icon: '' },
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

  const filtered = useMemo(() =>
    category === 'all'
      ? DATA_FEED_PROVIDERS
      : DATA_FEED_PROVIDERS.filter(p => p.category === category),
    [category]
  );

  const activeProvider = configureProvider
    ? DATA_FEED_PROVIDERS.find(p => p.id === configureProvider)
    : null;

  const connectedCount = Object.values(configs).filter(c => c.status === 'connected').length;
  const totalProviders = DATA_FEED_PROVIDERS.length;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      {/* Subtle gradient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[50vh] opacity-30"
          style={{ background: 'radial-gradient(ellipse at center top, var(--primary-glow) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--primary)' }} />
            {totalProviders} data sources available
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-3 tracking-tight">
            <span className="bg-gradient-to-r from-[var(--primary-light)] via-[var(--primary)] to-[var(--accent)] bg-clip-text text-transparent">
              {t('boutique.title')}
            </span>
          </h1>
          <p className="text-base sm:text-lg max-w-lg mx-auto" style={{ color: 'var(--text-muted)' }}>
            {t('boutique.subtitle')}
          </p>

          {/* Connection status */}
          {connectedCount > 0 && (
            <div className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-full text-xs font-medium"
              style={{ background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)', color: 'var(--success)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
              {connectedCount} {connectedCount === 1 ? 'feed connected' : 'feeds connected'}
            </div>
          )}
        </div>

        {/* Category filter */}
        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex rounded-xl p-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {CATEGORY_TABS.map(tab => {
              const isActive = category === tab.key;
              const count = tab.key === 'all'
                ? DATA_FEED_PROVIDERS.length
                : DATA_FEED_PROVIDERS.filter(p => p.category === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setCategory(tab.key)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: isActive ? 'var(--primary)' : 'transparent',
                    color: isActive ? 'var(--primary-foreground, #000)' : 'var(--text-muted)',
                  }}
                >
                  {t(tab.labelKey as any)} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Provider Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {filtered.map((provider, i) => (
            <div key={provider.id} className="animate-fadeIn" style={{ animationDelay: `${i * 50}ms` }}>
              <ProviderCard
                provider={provider}
                status={configs[provider.id]?.status || 'not_configured'}
                userTier={userTier}
                onConfigure={setConfigureProvider}
              />
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mb-16">
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('boutique.howItWorks' as any)}
            </h2>
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {[
              { step: '1', titleKey: 'boutique.step1Title', descKey: 'boutique.step1Desc', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
              { step: '2', titleKey: 'boutique.step2Title', descKey: 'boutique.step2Desc', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
              { step: '3', titleKey: 'boutique.step3Title', descKey: 'boutique.step3Desc', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            ].map((item, i) => (
              <div key={i} className="text-center group">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: 'var(--primary-glow)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                </div>
                <div className="text-[11px] font-bold mb-1" style={{ color: 'var(--primary)' }}>
                  STEP {item.step}
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {t(item.titleKey as any)}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {t(item.descKey as any)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick connect banner */}
        {connectedCount < 2 && (
          <div className="rounded-2xl p-6 mb-16 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-center gap-3 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Get started in seconds
              </h3>
            </div>
            <p className="text-xs max-w-md mx-auto mb-4" style={{ color: 'var(--text-muted)' }}>
              Crypto feeds (Binance, Bybit, Deribit) connect instantly with no credentials.
              Click Connect on any crypto provider to start streaming real-time data.
            </p>
            <button
              onClick={() => setConfigureProvider('binance')}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 active:scale-[0.98]"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground, #000)' }}
            >
              Connect Binance
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Comparison Table */}
        <div className="mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('boutique.comparison')}
            </h2>
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
          </div>
          <ComparisonTable />
        </div>

        {/* FAQ Section */}
        <div className="max-w-2xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('boutique.faq')}
            </h2>
            <div className="h-px flex-1 max-w-[60px]" style={{ background: 'var(--border)' }} />
          </div>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <summary
                  className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="text-sm font-medium pr-4">{t(item.qKey as any)}</span>
                  <span
                    className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-xs transition-all group-open:rotate-45"
                    style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
                  >
                    +
                  </span>
                </summary>
                <div className="px-4 pb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {t(item.aKey as any)}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="max-w-lg mx-auto text-center pb-8">
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" className="mx-auto mb-3">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              What are data feeds?
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Data feeds provide real-time market data from exchanges. They power order flow analysis,
              footprint charts, heatmaps, and all trading features on this platform.
              Free crypto feeds connect instantly. Futures feeds require a broker account.
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
