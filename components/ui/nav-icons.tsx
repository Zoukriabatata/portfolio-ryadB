import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Cohesive nav icon set — one visual family for the app sidebar.
 *
 * Every glyph shares the same 24×24 grid, the same round-joined stroke and
 * no fills, so the menu reads as a designed set rather than a mix of stock
 * library icons. Each is tuned to the orderflow domain (candles, footprint
 * ladder, gamma bell, vol zigzag, options flow, …).
 *
 * Typed as `LucideIcon` so they drop into the existing `NavItem.Icon`
 * config and the `<IconComp size={..} strokeWidth={..} />` call sites with
 * zero changes to the rendering logic.
 */

interface NavIconProps {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: CSSProperties;
}

function makeIcon(displayName: string, children: ReactNode): LucideIcon {
  function Icon({ size = 24, strokeWidth = 1.75, className, style }: NavIconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon as unknown as LucideIcon;
}

/* Dashboard — asymmetric panel layout. */
export const DashboardIcon = makeIcon('DashboardIcon', (
  <>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.6" />
    <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </>
));

/* Live — two candlesticks with wicks. */
export const LiveIcon = makeIcon('LiveIcon', (
  <>
    <line x1="7" y1="3.5" x2="7" y2="20.5" />
    <rect x="4.5" y="7" width="5" height="8" rx="1.2" />
    <line x1="16.5" y1="4.5" x2="16.5" y2="19.5" />
    <rect x="14" y="9" width="5" height="6" rx="1.2" />
  </>
));

/* Footprint — bid/ask ladder: boxed grid split into price-level cells. */
export const FootprintIcon = makeIcon('FootprintIcon', (
  <>
    <rect x="3" y="3.5" width="18" height="17" rx="2.2" />
    <line x1="12" y1="3.5" x2="12" y2="20.5" />
    <line x1="3" y1="9.2" x2="21" y2="9.2" />
    <line x1="3" y1="14.8" x2="21" y2="14.8" />
  </>
));

/* GEX — gamma bell over a baseline. */
export const GexIcon = makeIcon('GexIcon', (
  <>
    <path d="M3 17.5 C7 17.5 8 6.5 12 6.5 C16 6.5 17 17.5 21 17.5" />
    <line x1="3" y1="20.5" x2="21" y2="20.5" />
  </>
));

/* Volatility — choppy zigzag. */
export const VolatilityIcon = makeIcon('VolatilityIcon', (
  <path d="M3 13.5 L7 8.5 L11 15 L15 7.5 L19 12.5 L21 10.5" />
));

/* Options Flow — two opposing arrows (calls vs puts). */
export const FlowIcon = makeIcon('FlowIcon', (
  <>
    <path d="M4 9 H16" />
    <path d="M13 6 L16 9 L13 12" />
    <path d="M20 15 H8" />
    <path d="M11 12 L8 15 L11 18" />
  </>
));

/* Trading — long / short arrows. */
export const TradingIcon = makeIcon('TradingIcon', (
  <>
    <path d="M7 20.5 V5.5" />
    <path d="M3.5 9 L7 5.5 L10.5 9" />
    <path d="M17 3.5 V18.5" />
    <path d="M13.5 15 L17 18.5 L20.5 15" />
  </>
));

/* Journal — notebook with pen. */
export const JournalIcon = makeIcon('JournalIcon', (
  <>
    <path d="M6 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <line x1="8" y1="9" x2="13" y2="9" />
    <line x1="8" y1="12.5" x2="11.5" y2="12.5" />
    <path d="M19.4 13.6l-3.4 3.4-1.6-1.6 3.4-3.4z" />
  </>
));

/* News — article with folded corner + text lines. */
export const NewsIcon = makeIcon('NewsIcon', (
  <>
    <path d="M14 3.5 H6.5 A2 2 0 0 0 4.5 5.5 V18.5 A2 2 0 0 0 6.5 20.5 H17.5 A2 2 0 0 0 19.5 18.5 V9 Z" />
    <path d="M14 3.5 V9 H19.5" />
    <line x1="8" y1="12.5" x2="15" y2="12.5" />
    <line x1="8" y1="16" x2="12.5" y2="16" />
  </>
));

/* AI Agents — sparkle. */
export const AiIcon = makeIcon('AiIcon', (
  <>
    <path d="M12 3 L13.7 9.1 L20 11 L13.7 12.9 L12 19 L10.3 12.9 L4 11 L10.3 9.1 Z" />
    <circle cx="18.5" cy="5.5" r="1.1" />
  </>
));

/* Academy — graduation cap. */
export const AcademyIcon = makeIcon('AcademyIcon', (
  <>
    <path d="M2.5 8 L12 4 L21.5 8 L12 12 Z" />
    <path d="M6 10 V14.8 C6 16.3 18 16.3 18 14.8 V10" />
    <line x1="21.5" y1="8" x2="21.5" y2="12.5" />
  </>
));

/* Data Feeds — broadcast signal. */
export const DataFeedsIcon = makeIcon('DataFeedsIcon', (
  <>
    <circle cx="5.5" cy="18.5" r="1.4" />
    <path d="M5 13.2 A5.5 5.5 0 0 1 10.8 19" />
    <path d="M5 8 A10.5 10.5 0 0 1 16 19" />
  </>
));

/* Account — user. */
export const AccountIcon = makeIcon('AccountIcon', (
  <>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20 C5 16.2 8 14 12 14 C16 14 19 16.2 19 20" />
  </>
));
