/**
 * Public surface of the redesigned dashboard widget system. Importers
 * pull everything they need through `@/components/dashboard` so future
 * file moves stay invisible.
 */

export { DashboardCard, type DashboardCardProps } from "./DashboardCard";
export type {
  DashboardCardVariant,
  DashboardWidgetProps,
  CardAction,
} from "./types";

// Phase 3 widgets — each one a leaf component that consumes data
// hooks from @/hooks/dashboard and renders inside a DashboardCard
// (except UpgradeBanner and TopBar which sit outside the grid).
export { UpgradeBanner } from "./UpgradeBanner";
export { TopBar } from "./TopBar";
export { MarketPulse } from "./MarketPulse";
export { FundingRatesCompact } from "./FundingRatesCompact";
export { OpenInterestCard } from "./OpenInterestCard";
export { LiquidationsCompact } from "./LiquidationsCompact";
export { QuickLaunchGrid } from "./QuickLaunchGrid";

// Phase 4 layout + Phase-5 placeholder.
export { DashboardShell } from "./DashboardShell";
export type { DashboardShellProps } from "./DashboardShell";
export { WidgetPlaceholder } from "./WidgetPlaceholder";

// Phase 5 widgets — editorial terminal aesthetic.
export { WatchlistCard } from "./WatchlistCard";
export { TodaysSignals } from "./TodaysSignals";
export { RecentActivity } from "./RecentActivity";
export { AccountSummary } from "./AccountSummary";

// Phase 6 polish — animated atmosphere.
export { DashboardAtmosphere } from "./DashboardAtmosphere";

// Floating AI chat — wraps the legacy DashboardAIChat in a FAB +
// slide-over panel so it doesn't eat the dashboard's vertical real
// estate.
export { FloatingAIChat } from "./FloatingAIChat";
