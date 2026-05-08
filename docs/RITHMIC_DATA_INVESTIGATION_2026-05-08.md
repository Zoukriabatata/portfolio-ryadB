# Rithmic Test env data investigation — 2026-05-08

## Verdict

**THROTTLED + PARTIALLY SYNTHETIC** — the gateway is serving a real-shaped CME stream (correct schema, correct symbol, plausible price level), but the contents are heavily attenuated and at least one server-derived stat (VWAP) is frozen. This is not a live CME firehose; it's a UAT (User Acceptance Testing) feed designed for protocol-correctness validation, not for stress-testing volume.

## Evidence

### 1. Account routes through Rithmic UAT, not the production matching engine

The `unique_user_id` in `ResponseLogin` was:
```
rproto_srvr_01_rituz00100@rithmic_uat_domain:6290
```
`rithmic_uat_domain` = User Acceptance Testing. This is the test infrastructure tier, not Rithmic 01 (prod) or Rithmic Paper Trading. The PDF Reference Guide (Feb 2026 draft, v0.48.0.0) does not document UAT semantics — there is no published claim that "Rithmic Test" data is live.

### 2. Volume rate is two orders of magnitude below cash-hour reality

Capture window: **2026-05-08 16:18:37 → 16:19:32 UTC (54s)** = **12:18 ET, mid-cash session**.

Captured during that window:
- 11 actual trades (the other 9 messages were stats-only updates with `presence_bits=0x8`, no `LAST_TRADE` bit)
- Total contracts traded: **16** (sizes: 1,1,1,1,2,1,1,5,1,2 plus the snapshot's 1)
- Rate: **0.3 contracts/sec**

Real MNQM6 during cash hours typically clocks 50–200+ contracts/sec (NQ ~500K/day in 2018 per Wikipedia; MNQ today is several million contracts/day, of which 80%+ during cash). Our observed rate is roughly **2 orders of magnitude below** what a real live feed produces at noon ET.

### 3. All 11 trades printed at the same price, all on the same side

| field | observation |
|-------|-------------|
| `trade_price` | 28344.50 for **every** real-trade message |
| `aggressor` | 1 (BUY) for **every** real-trade message |

Real markets exhibit price discovery in any 54s window, especially during cash. Eleven consecutive prints at exactly one tick, all aggressively buying, is statistically implausible — it points to either a curated test sequence or a heavily filtered subset.

### 4. Server-side VWAP is frozen

Every message with `presence_bits=0x17` (which sets the `VWAP` bit) reports `vwap = 28366.75`. With cum volume around 7540 and trades at 28344.50 incrementally added, a real cumulative VWAP should drift toward 28344.50 — even quantized to a 0.25 tick the value should have moved. It didn't. The server is reporting a static VWAP value, not a derived one.

### 5. Source-to-local latency is suspiciously consistent

| min | median | max |
|-----|--------|-----|
| 1675 ms | 1675 ms | 1677 ms |

Real-network latency varies tick-to-tick due to jitter; a 2 ms window across 11 samples is not real network latency, it's a server-side fixed offset. Either the UAT server's clock is offset from wall-clock by a fixed 1.675s, or a delay is intentionally applied. Either way, this is not the sub-50ms behavior expected from a co-located CME feed via Rithmic 01.

### 6. Inter-trade gaps consistent with throttled / scripted output

Gaps between consecutive real trades:
```
4080 ms, 2810 ms, 8390 ms, 14803 ms, 3201 ms, 2395 ms, 1208 ms, 4001 ms, 5993 ms
```
Median ≈ 4s, max 14.8s. Real cash-hour MNQ has inter-trade gaps measured in milliseconds, sometimes microseconds during news. A median 4s gap during noon ET is implausible for live data.

### 7. `is_snapshot` distribution is normal

19 of 20 frames are `is_snapshot=false`; only the very first (catch-up after subscribe) carries `is_snapshot=true`. So the gateway claims the data is "live" rather than DB replay. But the rest of the evidence shows the "live" stream itself is heavily throttled.

## Implication for product

- **Phase 7.7.3 validation still stands.** The pipeline (`Rithmic WS → protobuf decode → Tick → FootprintEngine → broadcast → Tauri event → React → DOM`) is correct. The footprint shows what the data shows; the engine is faithfully aggregating the throttled feed.
- **Volume / latency benchmarks cannot be done on this account.** Throughput tests, dropped-tick tests, footprint-bar density tests, GPU rendering stress tests — none of these are meaningful on data that prints at 0.3 contracts/sec.
- **Next-phase testing needs a real data source.** Two pragmatic paths:
  1. **Apex Trader Funding (or similar funded challenge)** — ~$30–150 entry, includes Rithmic Paper Trading or Rithmic 01 data. Fastest way to get on a real feed under our existing connector.
  2. **dxFeed Retail Partnership** — already on the lundi-matin email list. Slower but doesn't require a prop-firm relationship and is a separate connector for redundancy.
- **What we shipped is fine for a demo / smoke test against the test env.** It's not fine for a recorded performance video or a public benchmark.

## Reproducibility

- Trace log: `desktop/src-tauri/rithmic_trace.log` (gitignored via `*.log`)
- Capture command:
  ```pwsh
  $env:RITHMIC_TEST_USER     = "<email>"
  $env:RITHMIC_TEST_PASSWORD = "<password>"
  cd desktop/src-tauri
  cargo run --example rithmic_trace
  ```
  Stops after 20 trades or 120s, whichever comes first. Writes `rithmic_trace.log` next to `Cargo.toml`.
- Capture happened at: `local_ns=1778249917500829900` → 2026-05-08 16:18:37 UTC → 12:18 ET (mid-cash session, ~3 hours after open).

## Notes for future investigation

- The `presence_bits` enum (`LAST_TRADE=1, NET_CHANGE=2, PERCENT_CHANGE=4, VOLUME=8, VWAP=16`) is the canonical way to know which fields a `LastTrade` message actually carries — earlier code paths that just read `trade_price` will see `0.0` on stats-only updates and may miscount "trades". The trace example handles this correctly; the production engine should too (Phase 7.5's `last_trade_to_tick()` already requires `trade_price.is_some()` so stats-only frames are correctly ignored).
- Worth re-running this trace after we have access to Rithmic 01 / dxFeed / Tradovate to confirm the same pipeline behaves correctly on real volume.
- If we ever need an "is this account on real data?" runtime check, three signals suffice:
  1. `unique_user_id.contains("uat_domain")` → test env
  2. Source→local latency consistently above ~500ms with low variance → throttled
  3. `vwap` not changing across multiple `LAST_TRADE`-bit-set frames → synthetic stats
