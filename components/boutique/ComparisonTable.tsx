'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { DATA_FEED_PROVIDERS } from '@/lib/boutique/providers';

const FEATURES = [
  { key: 'realtime', label: 'Real-time data' },
  { key: 'orderbook', label: 'Orderbook (L2)' },
  { key: 'tradetape', label: 'Trade tape' },
  { key: 'historical', label: 'Historical data' },
  { key: 'options', label: 'Options chain' },
  { key: 'futures', label: 'Futures' },
  { key: 'spot', label: 'Spot' },
  { key: 'freetier', label: 'Free tier' },
];

function hasFeature(providerName: string, featureKey: string): boolean | string {
  const map: Record<string, Record<string, boolean | string>> = {
    Binance: { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: true, freetier: true },
    Bybit: { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: true, freetier: true },
    Deribit: { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: false, freetier: true },
    Rithmic: { realtime: true, orderbook: true, tradetape: true, historical: true, options: false, futures: true, spot: false, freetier: false },
    Tradovate: { realtime: true, orderbook: true, tradetape: true, historical: true, options: false, futures: true, spot: false, freetier: false },
    CQG: { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: false, freetier: false },
    dxFeed: { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: true, freetier: false },
    'AMP Futures': { realtime: true, orderbook: true, tradetape: true, historical: true, options: false, futures: true, spot: false, freetier: false },
    'Interactive Brokers': { realtime: true, orderbook: true, tradetape: true, historical: true, options: true, futures: true, spot: true, freetier: false },
  };
  return map[providerName]?.[featureKey] ?? false;
}

export default function ComparisonTable() {
  const { t } = useTranslation();

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Header row */}
          <div className="flex" style={{ background: 'var(--surface-elevated)' }}>
            <div className="w-36 shrink-0 px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {t('boutique.features')}
            </div>
            {DATA_FEED_PROVIDERS.map(p => (
              <div
                key={p.id}
                className="flex-1 min-w-[70px] px-2 py-3 text-center text-xs font-semibold"
                style={{ color: p.color }}
              >
                {p.name.split(' ')[0]}
              </div>
            ))}
          </div>

          {/* Feature rows */}
          {FEATURES.map((feature, i) => (
            <div
              key={feature.key}
              className="flex"
              style={{ background: i % 2 === 0 ? 'var(--surface)' : 'transparent' }}
            >
              <div className="w-36 shrink-0 px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {feature.label}
              </div>
              {DATA_FEED_PROVIDERS.map(p => {
                const val = hasFeature(p.name, feature.key);
                return (
                  <div key={p.id} className="flex-1 min-w-[70px] px-2 py-2.5 text-center text-xs">
                    {val === true ? (
                      <span style={{ color: 'var(--primary)' }}>&#10003;</span>
                    ) : val === false ? (
                      <span style={{ color: 'var(--text-dimmed)' }}>&#8212;</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
