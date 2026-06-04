'use client';

/**
 * Dashboard page — final shell after Phase 5.
 *
 * Composition only. Layout lives in `<DashboardShell>`, widgets live
 * in `@/components/dashboard`, data hooks in `@/hooks/dashboard`.
 * This file is the wiring board.
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
  DashboardShell,
  WatchlistCard,
  TodaysSignals,
  RecentActivity,
  AccountSummary,
  FloatingAIChat,
} from '@/components/dashboard';

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
    <>
      <WelcomeModal />
      <DashboardShell
        topBar={<TopBar userName={firstName} />}
        upgradeBanner={<UpgradeBanner />}
        watchlistSlot={<WatchlistCard />}
        marketPulseSlot={<MarketPulse tickers={tickers} />}
        todaysSignalsSlot={<TodaysSignals />}
        fundingSlot={<FundingRatesCompact rates={fundingRates} />}
        openInterestSlot={<OpenInterestCard oi={oi} />}
        liquidationsSlot={<LiquidationsCompact liquidations={liquidations} />}
        recentActivitySlot={<RecentActivity />}
        quickLaunchSlot={<QuickLaunchGrid />}
        accountSummarySlot={<AccountSummary />}
      />
      {/* AI assistant — collapsed FAB pill at bottom-right, expands
          into a 420 px slide-over panel on click. The bento can
          finally use the bottom rows without competing with the
          chat for vertical space. */}
      <FloatingAIChat />
    </>
  );
}
