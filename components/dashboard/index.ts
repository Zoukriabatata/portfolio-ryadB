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
