'use client';

import ConnectionBanner from '@/components/ui/ConnectionBanner';

// ─── Shell ────────────────────────────────────────────────────────────────────

interface ChartPageShellProps {
  symbol: string;
  onSymbolChange: (s: string) => void;
  /** Left slot in the thin toolbar row (e.g. trade toggle) */
  toolbarLeft?: React.ReactNode;
  /** Right slot in the thin toolbar row (e.g. layout selector) */
  toolbarRight?: React.ReactNode;
  /** Animated-height slot below toolbar (e.g. QuickTradeBar) */
  tradeBarSlot?: React.ReactNode;
  /** Whether the trade bar slot is visible (controls height animation) */
  tradeBarVisible?: boolean;
  children: React.ReactNode;
}

export default function ChartPageShell({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  symbol: _symbol,
  toolbarLeft,
  toolbarRight,
  tradeBarSlot,
  tradeBarVisible = false,
  children,
}: ChartPageShellProps) {
  const hasToolbar = toolbarLeft || toolbarRight;

  return (
    <div className="flex animate-fadeIn" style={{ backgroundColor: 'var(--background)', height: 'calc(100svh - var(--nav-height, 44px))' }}>

      {/* ── Center Column ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ConnectionBanner />

        {/* Toolbar row */}
        {hasToolbar && (
          <div
            className="flex items-center justify-between gap-2 px-2 py-0.5"
            style={{ borderBottom: '1px solid var(--border)', minHeight: 32 }}
          >
            <div className="flex items-center gap-1">{toolbarLeft}</div>
            <div className="flex items-center gap-1">{toolbarRight}</div>
          </div>
        )}

        {/* Trade bar animated slot */}
        {tradeBarSlot && (
          <div
            style={{
              height: tradeBarVisible ? 34 : 0,
              overflow: 'hidden',
              transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {tradeBarSlot}
          </div>
        )}

        {/* Chart area */}
        <div className="flex-1 min-h-0 relative">
          {children}
        </div>
      </div>
    </div>
  );
}
