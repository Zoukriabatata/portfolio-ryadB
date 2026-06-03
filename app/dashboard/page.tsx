'use client';

/**
 * Dashboard page — Phase 3 of the redesign.
 *
 * The page is now a thin composition shell:
 *   - data hooks live in `@/hooks/dashboard` (phase 2)
 *   - widget components live in `@/components/dashboard` (phase 3)
 *   - this file only mounts them and feeds props.
 *
 * The bento layout itself is *intentionally* still the legacy 1-col /
 * 3-col stack — phase 4 will replace it with a proper bento grid.
 * Keeping the layout untouched here keeps phase 3 a pure structural
 * move with zero visual regression risk.
 *
 * Removed in phase 3: NewsFeed, CommunityFeed (+ Discord hook),
 * FearGreedWidget, HeroBar, PriceChip, TopMovers, MarketStatsCard.
 */

import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';

import {
  useMarketTickers,
  useFundingRates,
  useOpenInterest,
  useLiquidations,
} from '@/hooks/dashboard';

import {
  UpgradeBanner,
  TopBar,
  MarketPulse,
  FundingRatesCompact,
  OpenInterestCard,
  LiquidationsCompact,
  QuickLaunchGrid,
} from '@/components/dashboard';

const DashboardAIChat = dynamic(
  () => import('@/components/ai/DashboardAIChat'),
  { ssr: false },
);
const WelcomeModal = dynamic(
  () => import('@/components/ui/WelcomeModal'),
  { ssr: false },
);

export default function DashboardPage() {
  const { data: session } = useSession();
  const { tickers } = useMarketTickers();
  const fundingRates = useFundingRates();
  const oi = useOpenInterest();
  const liquidations = useLiquidations();

  const firstName = session?.user?.name?.split(' ')[0];

  return (
    <div className="h-full overflow-auto custom-scrollbar">
      <WelcomeModal />
      <div className="max-w-[1400px] mx-auto px-3 py-3 space-y-3 animate-fadeIn">
        <UpgradeBanner />

        <TopBar userName={firstName} />

        {/* Phase 4 will replace this stack with the bento grid. */}
        <div className="grid lg:grid-cols-3 gap-3" style={{ alignItems: 'stretch' }}>
          <div className="lg:col-span-2">
            <MarketPulse tickers={tickers} />
          </div>
          <div className="flex flex-col gap-3">
            <FundingRatesCompact rates={fundingRates} />
            <OpenInterestCard oi={oi} />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-3" style={{ alignItems: 'stretch' }}>
          <LiquidationsCompact liquidations={liquidations} />
          <QuickLaunchGrid />
          <DashboardAIChat />
        </div>
      </div>
    </div>
  );
}
