'use client';

/**
 * Dashboard page — Phase 4 of the redesign.
 *
 * Composition shell only. The bento layout lives in
 * `<DashboardShell>`; this file just sources data from
 * `@/hooks/dashboard`, plugs widgets into slots, and stitches the
 * dynamic AIChat FAB outside the grid.
 *
 * Slots marked `<WidgetPlaceholder>` are phase-5 work
 * (Watchlist, TodaysSignals, RecentActivity, AccountSummary). They
 * reserve their grid footprint so the bento doesn't reshuffle when
 * those land.
 */

import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { Activity, History, Wallet } from 'lucide-react';

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
  WidgetPlaceholder,
  WatchlistCard,
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
    <>
      <WelcomeModal />
      <DashboardShell
        topBar={<TopBar userName={firstName} />}
        upgradeBanner={<UpgradeBanner />}
        watchlistSlot={<WatchlistCard />}
        marketPulseSlot={<MarketPulse tickers={tickers} />}
        todaysSignalsSlot={
          <WidgetPlaceholder
            title="Today's Signals"
            icon={<Activity size={14} />}
            comingSoon="Economic calendar + earnings + expirations"
          />
        }
        fundingSlot={<FundingRatesCompact rates={fundingRates} />}
        openInterestSlot={<OpenInterestCard oi={oi} />}
        liquidationsSlot={<LiquidationsCompact liquidations={liquidations} />}
        recentActivitySlot={
          <WidgetPlaceholder
            title="Recent Activity"
            icon={<History size={14} />}
            comingSoon="Your last 5 chart sessions"
          />
        }
        quickLaunchSlot={<QuickLaunchGrid />}
        accountSummarySlot={
          <WidgetPlaceholder
            title="Account"
            icon={<Wallet size={14} />}
            variant="compact"
            comingSoon="Broker P&L summary — connect Rithmic in Settings"
          />
        }
      />
      {/* AI chat FAB lives outside the grid so it stays anchored
          bottom-right across all routes. */}
      <DashboardAIChat />
    </>
  );
}
