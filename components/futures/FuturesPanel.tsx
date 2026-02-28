'use client';

/**
 * FUTURES PANEL — Bloomberg-style institutional module
 *
 * Container scrollable with 4 sections:
 * A. Market Overview (header stratégique)
 * B. Liquidity & Positioning (OI, L/S, liquidations, squeeze)
 * C. Derivatives Pressure (funding gauge, basis)
 * D. Composite Market Pressure Score (0-100 gauge)
 */

import { useState, useMemo } from 'react';
import { useFuturesStore } from '@/stores/useFuturesStore';
import {
  detectMarketRegime,
  calculateRiskTemperature,
  calculateVolatilityFromPrices,
} from '@/lib/calculations/futures/marketRegime';
import { interpretPositioning, detectSqueezeRisk } from '@/lib/calculations/futures/positioning';
import { calculateCompositeScore } from '@/lib/calculations/futures/compositeScore';

import MarketOverview from './MarketOverview';
import LiquidityPositioning from './LiquidityPositioning';
import DerivativesPressure from './DerivativesPressure';
import CompositeScore from './CompositeScore';

type PanelSection = 'overview' | 'positioning' | 'derivatives' | 'composite';

const SECTION_TABS: { id: PanelSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'positioning', label: 'Position' },
  { id: 'derivatives', label: 'Deriv.' },
  { id: 'composite', label: 'Score' },
];

export default function FuturesPanel() {
  const [activeSection, setActiveSection] = useState<PanelSection | 'all'>('all');

  const store = useFuturesStore();

  // Build price history from mark price updates (use OI history timestamps as proxy)
  const priceHistory = useMemo(() => {
    // We use the current mark price as the only data point available in real-time
    // The OI history gives us timestamps we can correlate
    if (store.markPrice === 0) return [];
    return [{ time: Date.now(), price: store.markPrice }];
  }, [store.markPrice]);

  // Funding history — build from current rate (store doesn't have historical yet)
  const fundingHistory = useMemo(() => {
    if (store.fundingRate === 0) return [];
    return [{ time: Date.now(), rate: store.fundingRate }];
  }, [store.fundingRate]);

  // Liquidations intensity (per minute)
  const liqIntensity = useMemo(() => {
    const recent = store.liquidations.filter(l => Date.now() - l.time < 60_000);
    return recent.length;
  }, [store.liquidations]);

  // Volatility (from OI-derived price proxy)
  const volatility = useMemo(() => {
    if (priceHistory.length < 3) return 0;
    return calculateVolatilityFromPrices(priceHistory.map(p => p.price));
  }, [priceHistory]);

  // Market regime
  const regime = useMemo(() => {
    return detectMarketRegime({
      priceHistory,
      oiHistory: store.openInterestHistory,
      fundingRate: store.fundingRate,
      liquidationsIntensity: liqIntensity,
      lsRatio: store.globalLongShortRatio || 1,
    });
  }, [priceHistory, store.openInterestHistory, store.fundingRate, liqIntensity, store.globalLongShortRatio]);

  // Risk temperature
  const riskTemperature = useMemo(() => {
    return calculateRiskTemperature({
      priceHistory,
      oiHistory: store.openInterestHistory,
      fundingRate: store.fundingRate,
      liquidationsIntensity: liqIntensity,
      lsRatio: store.globalLongShortRatio || 1,
    });
  }, [priceHistory, store.openInterestHistory, store.fundingRate, liqIntensity, store.globalLongShortRatio]);

  // Positioning reading
  const positioning = useMemo(() => {
    return interpretPositioning({
      oiHistory: store.openInterestHistory,
      priceNow: store.markPrice,
      priceStart: store.markPrice, // Without price history, use current
      lsRatio: store.globalLongShortRatio || 1,
      topTraderLsRatio: store.topTraderLongShortRatio || 1,
      liquidationsIntensity: liqIntensity,
    });
  }, [store.openInterestHistory, store.markPrice, store.globalLongShortRatio, store.topTraderLongShortRatio, liqIntensity]);

  // Squeeze detection
  const squeeze = useMemo(() => {
    return detectSqueezeRisk({
      oiHistory: store.openInterestHistory,
      priceNow: store.markPrice,
      priceStart: store.markPrice,
      lsRatio: store.globalLongShortRatio || 1,
      topTraderLsRatio: store.topTraderLongShortRatio || 1,
      liquidationsIntensity: liqIntensity,
    });
  }, [store.openInterestHistory, store.markPrice, store.globalLongShortRatio, store.topTraderLongShortRatio, liqIntensity]);

  // Composite score
  const compositeResult = useMemo(() => {
    return calculateCompositeScore({
      oiHistory: store.openInterestHistory,
      priceNow: store.markPrice,
      priceStart: store.markPrice,
      fundingRate: store.fundingRate,
      lsRatio: store.globalLongShortRatio || 1,
      topTraderLsRatio: store.topTraderLongShortRatio || 1,
      liquidationsIntensity: liqIntensity,
      recentLiqBuyVolume: store.recentLiqBuyVolume,
      recentLiqSellVolume: store.recentLiqSellVolume,
      volatility,
    });
  }, [store, liqIntensity, volatility]);

  // Loading state
  if (store.markPrice === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        <div className="flex flex-col items-center gap-2 animate-fadeIn">
          {store.metricsError ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Futures data unavailable</span>
              <span className="text-[10px] text-[var(--text-dimmed)]">Retrying automatically...</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 border-2 border-[var(--border-light)] border-t-transparent rounded-full animate-spin" />
              <span>Loading futures data...</span>
            </>
          )}
        </div>
      </div>
    );
  }

  const showSection = (s: PanelSection) => activeSection === 'all' || activeSection === s;

  return (
    <div className="h-full flex flex-col text-xs">
      {/* Section tabs */}
      <div className="flex items-center gap-0.5 px-1 py-1 border-b border-[var(--border)]/50 flex-shrink-0">
        <button
          onClick={() => setActiveSection('all')}
          className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
          style={{
            backgroundColor: activeSection === 'all' ? 'var(--primary)' : 'transparent',
            color: activeSection === 'all' ? '#fff' : 'var(--text-muted)',
          }}
        >
          All
        </button>
        {SECTION_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors"
            style={{
              backgroundColor: activeSection === tab.id ? 'var(--primary)' : 'transparent',
              color: activeSection === tab.id ? '#fff' : 'var(--text-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5 py-2 space-y-3">
        {showSection('overview') && (
          <Section title="Market Overview" collapsed={activeSection !== 'all' && activeSection !== 'overview'}>
            <MarketOverview
              markPrice={store.markPrice}
              indexPrice={store.indexPrice}
              fundingRate={store.fundingRate}
              nextFundingTime={store.nextFundingTime}
              volatility={volatility}
              regime={regime}
              riskTemperature={riskTemperature}
            />
          </Section>
        )}

        {showSection('positioning') && (
          <Section title="Liquidity & Positioning" collapsed={activeSection !== 'all' && activeSection !== 'positioning'}>
            <LiquidityPositioning
              openInterestValue={store.openInterestValue}
              openInterestHistory={store.openInterestHistory}
              globalLongShortRatio={store.globalLongShortRatio}
              globalLongAccount={store.globalLongAccount}
              globalShortAccount={store.globalShortAccount}
              topTraderLongShortRatio={store.topTraderLongShortRatio}
              longShortHistory={store.longShortHistory}
              liquidations={store.liquidations}
              recentLiqBuyVolume={store.recentLiqBuyVolume}
              recentLiqSellVolume={store.recentLiqSellVolume}
              positioning={positioning}
              squeezeDirection={squeeze.direction}
              squeezeRisk={squeeze.risk}
            />
          </Section>
        )}

        {showSection('derivatives') && (
          <Section title="Derivatives Pressure" collapsed={activeSection !== 'all' && activeSection !== 'derivatives'}>
            <DerivativesPressure
              fundingRate={store.fundingRate}
              fundingHistory={fundingHistory}
              markPrice={store.markPrice}
              indexPrice={store.indexPrice}
            />
          </Section>
        )}

        {showSection('composite') && (
          <Section title="Market Pressure" collapsed={activeSection !== 'all' && activeSection !== 'composite'}>
            <CompositeScore result={compositeResult} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, collapsed, children }: { title: string; collapsed?: boolean; children: React.ReactNode }) {
  if (collapsed) return null;
  return (
    <div>
      <p className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider font-semibold mb-1.5 px-1">
        {title}
      </p>
      {children}
    </div>
  );
}
