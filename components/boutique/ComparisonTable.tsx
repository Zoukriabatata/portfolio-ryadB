'use client';

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
  return (
    <div className="w-full overflow-x-auto relative rounded-xl" style={{ WebkitOverflowScrolling: 'touch', border: '1px solid var(--border)' }}>
      {/* Scroll hint */}
      <div className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none z-10 sm:hidden"
        style={{ background: 'linear-gradient(to left, var(--surface), transparent)' }} />
      <div className="min-w-[700px]">
        {/* Header row */}
        <div className="flex" style={{ background: 'var(--surface-elevated)' }}>
          <div className="w-32 shrink-0 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}>
            Feature
          </div>
          {DATA_FEED_PROVIDERS.map(p => (
            <div key={p.id} className="flex-1 min-w-[65px] px-1 py-2.5 text-center">
              <span className="text-[10px] font-bold" style={{ color: p.color }}>
                {p.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>

        {/* Feature rows */}
        {FEATURES.map((feature, i) => (
          <div
            key={feature.key}
            className="flex"
            style={{
              background: i % 2 === 0 ? 'var(--surface)' : 'transparent',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div className="w-32 shrink-0 px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {feature.label}
            </div>
            {DATA_FEED_PROVIDERS.map(p => {
              const val = hasFeature(p.name, feature.key);
              return (
                <div key={p.id} className="flex-1 min-w-[65px] px-1 py-2 text-center">
                  {val === true ? (
                    <span className="inline-flex w-4 h-4 rounded-full items-center justify-center text-[9px]"
                      style={{ background: `${p.color}15`, color: p.color }}>
                      &#10003;
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>&#8212;</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
