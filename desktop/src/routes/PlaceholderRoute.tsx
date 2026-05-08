// Placeholder rendered by the new V1 routes (Heatmap / GEX / Volatility
// / Replay) until M3-M9 ports the real chart implementations from the
// Senzoukria web codebase. Kept centralised so the messaging stays
// consistent and the visual matches the rest of the shell.

type PlaceholderRouteProps = {
  title: string;
  /** Short descriptor (e.g. "Liquidity heatmap"). */
  subtitle: string;
  /** Which milestone will replace this stub (e.g. "M3"). */
  milestone: string;
  /** Optional icon glyph rendered above the title. */
  icon?: string;
};

export function PlaceholderRoute({
  title,
  subtitle,
  milestone,
  icon,
}: PlaceholderRouteProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
      {icon && (
        <div
          aria-hidden
          className="text-5xl opacity-30 [filter:drop-shadow(0_0_12px_rgba(74,222,128,0.4))]"
        >
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      <p className="max-w-md text-sm text-text-secondary">{subtitle}</p>
      <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs uppercase tracking-wider text-text-muted">
        <span>Coming in</span>
        <span className="font-mono text-primary">{milestone}</span>
      </div>
    </div>
  );
}
