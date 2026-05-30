# OrderflowBridge — Supported Pairs

Quick reference for running the `OrderflowBridge` NinjaScript
indicator on each instrument you want to trade.

## How to switch pairs

1. In NinjaTrader, open or create a chart for the desired instrument
   (e.g. `GC 06-26`, `NQ 03-26`) with:
   - **Bars Period Type = Tick**, **Value = 100** (not 1 — see note below)
   - **Tick Replay = ON** (Properties → Data Series)
   - **Days to load = 1** (or more) for the desired history
2. Apply the `OrderflowBridge` indicator. **No tick-size config needed** —
   the bridge reads the real tick size straight from the instrument
   (`Instrument.MasterInstrument.TickSize`) and reports it to the app.
3. The orderflow-v2 desktop app picks up the new symbol automatically:
   the bars cache resets, the new symbol's history replays on its
   correct price grid, and the contract label updates.

You can run the indicator on **one chart at a time** per NT instance
(single TCP port `7272`). To switch pairs, change the NT chart's
instrument (or open another chart) and re-apply the indicator.

> **Why 100 Tick and not 1 Tick:** a 1-Tick chart over 24h of an active
> contract creates millions of NT bars and hits internal platform limits
> — the resulting 1m candles decorrelate from NT's native chart. A 100
> Tick chart is ~30k NT bars, and with Tick Replay ON `OnMarketData`
> still fires for every individual tick, so we keep full tick-by-tick
> granularity (~95% aggressor accuracy) without saturating NT.

## Tick precision — native for every pair

As of the per-symbol tick-size engine, **every instrument renders its
footprint on its real tick grid**. The Rust `FootprintEngine` keys the
tick size per symbol, registered from the bridge `M` header before the
first historical tick is processed. No more 0.25-grid merging.

| Symbol | Name                  | Native tick | $/tick |
| ------ | --------------------- | ----------- | ------ |
| MNQ    | Micro E-mini Nasdaq   | 0.25        | $0.50  |
| NQ     | E-mini Nasdaq 100     | 0.25        | $5.00  |
| MES    | Micro E-mini S&P 500  | 0.25        | $1.25  |
| ES     | E-mini S&P 500        | 0.25        | $12.50 |
| RTY    | Russell 2000          | 0.10        | $5.00  |
| M2K    | Micro Russell         | 0.10        | $0.50  |
| GC     | Gold                  | 0.10        | $10.00 |
| MGC    | Micro Gold            | 0.10        | $1.00  |
| YM     | E-mini Dow            | 1.00        | $5.00  |
| MYM    | Micro Dow             | 1.00        | $0.50  |
| CL     | Crude Oil WTI         | 0.01        | $10.00 |
| MCL    | Micro Crude           | 0.01        | $1.00  |
| BTC    | Bitcoin               | 5.00        | $25.00 |
| MBT    | Micro Bitcoin         | 5.00        | $0.50  |
| ETH    | Ether                 | 0.50        | $25.00 |
| MET    | Micro Ether           | 0.50        | $0.05  |

Other CME/COMEX/NYMEX contracts (NG, SI, 6E, ZB/ZN, …) also work —
the tick size is auto-detected, so they render correctly without any
manual setup.

## Troubleshooting

**"backfill complete — 0 historical ticks ready"**
The NT chart has no historical data loaded. Check `Days to load`
(right-click chart → Properties) — set it to `1` for ~24h of history.

**Footprint cells look wrong (too few or too crowded)**
Check the Output window for the `instrument tick size = …` line the
bridge prints on connect. If it's wrong, the NT instrument's master
tick is misconfigured — verify the instrument in Tools → Instruments.

**Symbol stays as the old pair after switching the NT chart**
Remove the indicator from the chart, then re-apply it. NinjaTrader
caches the indicator instance per chart; the state transition from
`Terminated` → `DataLoaded` is what triggers the bridge to re-announce
the symbol and its tick size.
