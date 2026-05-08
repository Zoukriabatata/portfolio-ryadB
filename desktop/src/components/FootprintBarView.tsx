// Phase B / M3 — shared rendering for a single FootprintBar.
// Pulled out of RithmicFootprint so the crypto pipeline (Bybit /
// Binance) can render identical bars without duplicating layout +
// CSS classes. Both call sites already share `RithmicFootprint.css`,
// the `rf-*` selectors stay namespaced there even though the
// component is multi-source now.

export type PriceLevel = {
  price: number;
  buyVolume: number;
  sellVolume: number;
  buyTrades: number;
  sellTrades: number;
};

export type FootprintBar = {
  symbol: string;
  timeframe: string;
  bucketTsNs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  totalDelta: number;
  tradeCount: number;
  levels: PriceLevel[];
};

export function BarView({
  bar,
  priceDecimals = 2,
}: {
  bar: FootprintBar;
  priceDecimals?: number;
}) {
  const date = new Date(bar.bucketTsNs / 1_000_000);
  const time = date.toLocaleTimeString("fr-FR", { hour12: false });

  const maxLevelVolume = Math.max(
    ...bar.levels.map((l) => l.buyVolume + l.sellVolume),
    1,
  );
  const sortedLevels = [...bar.levels].sort((a, b) => b.price - a.price);

  return (
    <div
      className={`rf-bar ${
        bar.totalDelta >= 0 ? "rf-bar-bullish" : "rf-bar-bearish"
      }`}
    >
      <div className="rf-bar-header">
        <span className="rf-bar-time">{time}</span>
        <span className="rf-bar-ohlc">
          O {bar.open.toFixed(priceDecimals)} · H {bar.high.toFixed(priceDecimals)} · L{" "}
          {bar.low.toFixed(priceDecimals)} · C {bar.close.toFixed(priceDecimals)}
        </span>
        <span
          className={
            bar.totalDelta >= 0 ? "rf-delta-pos" : "rf-delta-neg"
          }
        >
          Δ {bar.totalDelta >= 0 ? "+" : ""}
          {bar.totalDelta.toFixed(0)}
        </span>
        <span className="rf-bar-vol">
          vol {bar.totalVolume.toFixed(0)} · {bar.tradeCount} trade
          {bar.tradeCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="rf-bar-levels">
        {sortedLevels.map((level) => (
          <LevelRow
            key={level.price}
            level={level}
            maxVolume={maxLevelVolume}
            priceDecimals={priceDecimals}
          />
        ))}
      </div>
    </div>
  );
}

function LevelRow({
  level,
  maxVolume,
  priceDecimals,
}: {
  level: PriceLevel;
  maxVolume: number;
  priceDecimals: number;
}) {
  const total = level.buyVolume + level.sellVolume;
  const widthPct = (total / maxVolume) * 100;
  const buyPct = total > 0 ? (level.buyVolume / total) * 100 : 0;
  const delta = level.buyVolume - level.sellVolume;

  return (
    <div className="rf-level">
      <span className="rf-level-price">{level.price.toFixed(priceDecimals)}</span>
      <span className="rf-level-volumes">
        b {level.buyVolume.toFixed(0)} · s {level.sellVolume.toFixed(0)}
      </span>
      <div className="rf-level-bar-track">
        <div className="rf-level-bar" style={{ width: `${widthPct}%` }}>
          <div className="rf-level-buy" style={{ width: `${buyPct}%` }} />
          <div
            className="rf-level-sell"
            style={{ width: `${100 - buyPct}%` }}
          />
        </div>
      </div>
      <span
        className={delta >= 0 ? "rf-level-delta-pos" : "rf-level-delta-neg"}
      >
        {delta >= 0 ? "+" : ""}
        {delta.toFixed(0)}
      </span>
    </div>
  );
}
