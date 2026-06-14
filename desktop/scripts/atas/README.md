# ATAS → orderflow-v2 bridge

`OrderflowBridgeAtas.cs` is the ATAS port of the NinjaTrader bridge
(`../ninjatrader/OrderflowBridge.cs`). It streams **live tick-by-tick
trades** from ATAS to the orderflow-v2 desktop app over the **same**
CSV-line protocol on `127.0.0.1:7272`, so the existing generic "Bridge"
connector on the Rust side reads it **with zero changes**.

## How it works

ATAS calls `OnNewTrade(MarketDataArg)` for each real-time trade and gives
the **aggressor side directly** (`MarketDataArg.Direction` = Buy/Sell/
Between) — so, unlike the NinjaScript, no bid/ask classification is
needed. Each trade is emitted as an `L,<ts_ns>,<price>,<qty>,<side>` line
(0 = Buy, 1 = Sell). The instrument's symbol + tick size go in the one-shot
`M` header; an `E` sentinel marks "no history, go live".

Wire protocol (identical to the NT bridge, read by
`desktop/src-tauri/src/connectors/bridge/parser.rs`):

```
M,<symbol>,<tick_size>,<n_historical>
E
L,<ts_ns>,<price>,<qty>,<side>
P                  (keepalive, every 5s)
```

## Setup

ATAS loads **compiled DLLs**, not `.cs` files. Build the DLL from the
included project, then drop it in ATAS's Indicators folder.

### 1. Build the DLL

The folder ships an `OrderflowBridgeAtas.csproj`. From this folder:

```powershell
# Build (override AtasDir if your ATAS isn't at the default path)
dotnet build -c Release
#   …or point at your ATAS install explicitly:
dotnet build -c Release -p:AtasDir="C:\Users\<you>\AppData\Local\ATAS5\current"
```

→ produces `bin\Release\OrderflowBridgeAtas.dll`.

**Two things to set in `OrderflowBridgeAtas.csproj` first** (commented at the top):
- `<TargetFramework>` — match your ATAS runtime (ATAS 5 recent = `net8.0-windows`).
- `<AtasDir>` — the folder containing `ATAS.Indicators.dll` (your ATAS install).

If the **first build** flags an unknown member (`InstrumentInfo.TickSize`,
`MarketDataType.Trade`, `TradeDirection.Buy/Sell`…), it's a per-version API
name — paste the error and it's a one-line fix.

### 2. Install + run

1. Copy `OrderflowBridgeAtas.dll` into ATAS's Indicators folder
   (commonly `Documents\ATAS\Indicators\`, or use ATAS's *Indicators →
   load from file*). Restart ATAS if needed.
2. Apply **"Orderflow Bridge"** to a chart of the instrument you want.
3. In the orderflow-v2 desktop app, select the **Bridge** source
   (the "🔌 NT Bridge" toggle) — it connects to `127.0.0.1:7272` and the
   footprint streams live.

> No ATAS SDK here, so the DLL must be built on your machine against your
> ATAS assemblies — that's exactly what the `.csproj` does.

> Run **either** NinjaTrader **or** ATAS on port 7272, not both at once
> (single listener per port). To run both simultaneously, give ATAS a
> different port and add a second source option (see below).

## Scope & follow-ups

- **v1 = live only.** The footprint builds forward from when you attach
  the indicator (`n_historical = 0`). Correct data, no backfill.
- **Phase 2 — historical backfill:** replay each loaded candle's footprint
  (`IndicatorCandle` bid/ask volume per price) as synthetic `H` ticks
  before `E`. The desktop engine re-sums buy/sell per price, so the
  footprint reconstructs exactly. The extension point is documented in
  `OrderflowBridgeAtas.cs`; pin the `IndicatorCandle`/`PriceVolumeInfo`
  member names against your ATAS version first.
- **API names to confirm on first compile** (vary by ATAS version):
  `InstrumentInfo.TickSize` / `InstrumentInfo.Instrument`,
  `MarketDataType.Trade`, `TradeDirection.Buy/Sell`, and the
  `this.LogInfo/LogError` logging helpers. The compiler points at any
  mismatch; the protocol + threading don't depend on them.
- **Optional UI polish:** rename the desktop "NT Bridge" toggle to a
  platform-neutral "Platform Bridge" since it now serves ATAS too
  (`desktop/src/components/MultiSourceFootprint.tsx`). Not required —
  the toggle already works for whatever serves port 7272.
