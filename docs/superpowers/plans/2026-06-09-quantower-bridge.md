# Quantower Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second TCP bridge on port 7273 so Quantower can stream ticks + DOM into the Orderflow-v2 footprint engine, reusing the entire NinjaTrader bridge stack.

**Architecture:** `QuantowerState` mirrors `BridgeState` exactly (same `BridgeAdapter`, same parser, same wire protocol), runs on port 7273, fires `quantower-state` / `quantower-depth-update` events. `QuantowerFootprint.tsx` is a copy of `BridgeFootprint.tsx` with all event/command names substituted. `MultiSourceFootprint.tsx` gains a third source switch.

**Tech Stack:** Rust/Tauri 2.x, tokio, `BridgeAdapter` (reused), React/TypeScript, C# Quantower indicator.

**Spec:** `docs/superpowers/specs/2026-06-09-quantower-bridge-design.md`

---

## File Map

| File | Action |
|---|---|
| `src-tauri/src/state.rs` | +`QuantowerState` struct |
| `src-tauri/src/commands/quantower_bridge.rs` | New — connect/disconnect/status |
| `src-tauri/src/commands/quantower_bridge_depth.rs` | New — DOM pump/emitter/get |
| `src-tauri/src/commands/quantower_bridge_events.rs` | New — state emitter |
| `src-tauri/src/commands/mod.rs` | +3 `pub mod` |
| `src-tauri/src/lib.rs` | +manage + emitter + 4 commands |
| `src/lib/quantower_depth/api.ts` | New — `fetchQuantowerDepth` |
| `src/components/QuantowerDomPanel.tsx` | New — DOM ladder for quantower |
| `src/components/QuantowerFootprint.tsx` | New — full footprint component |
| `src/components/MultiSourceFootprint.tsx` | +`"quantower"` source |
| `Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs` | New — C# indicator |

---

## Task 1 — `QuantowerState` in `state.rs`

**Files:**
- Modify: `desktop/src-tauri/src/state.rs`

- [ ] **Step 1: Add `QuantowerState` after `BridgeState` (line 178)**

Append to the end of `desktop/src-tauri/src/state.rs`:

```rust
/// Quantower bridge state — mirrors BridgeState exactly.
/// Runs on port 7273 (BridgeAdapter with BridgeConfig { port: 7273 }).
/// Shares the Rithmic-side FootprintEngine so bars appear on the same
/// `footprint-update` event stream; the frontend filters by source.
pub struct QuantowerState {
    pub adapter:     Mutex<Option<BridgeAdapter>>,
    pub engine:      Arc<FootprintEngine>,
    pub engine_pump: Mutex<Option<JoinHandle<()>>>,
    pub state_emit:  Mutex<Option<JoinHandle<()>>>,
    pub depth_pump:  Mutex<Option<JoinHandle<()>>>,
}

impl QuantowerState {
    pub fn new(engine: Arc<FootprintEngine>) -> Self {
        Self {
            adapter:     Mutex::new(None),
            engine,
            engine_pump: Mutex::new(None),
            state_emit:  Mutex::new(None),
            depth_pump:  Mutex::new(None),
        }
    }
}
```

- [ ] **Step 2: Verify `cargo check` passes**

```powershell
cd desktop; cargo check 2>&1 | Select-String -Pattern "error"
```
Expected: no `error` lines (existing warnings about dead code are OK).

- [ ] **Step 3: Commit**

```powershell
git add desktop/src-tauri/src/state.rs
git commit -m "feat(qt-bridge): add QuantowerState to state.rs"
```

---

## Task 2 — `quantower_bridge_events.rs`

**Files:**
- Create: `desktop/src-tauri/src/commands/quantower_bridge_events.rs`

- [ ] **Step 1: Create the file**

```rust
//! Push-based emitter for Quantower bridge connection-state changes.
//! Mirror of bridge_events.rs — same logic, different event name.

use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::task::JoinHandle;

use crate::connectors::bridge::BridgeConnState;

const STATE_EVENT: &str = "quantower-state";

pub fn spawn_state_emitter(
    app: AppHandle,
    mut rx: Receiver<BridgeConnState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Quantower state emitter started");
        loop {
            match rx.recv().await {
                Ok(state) => {
                    if let Err(e) = app.emit(STATE_EVENT, &state) {
                        tracing::warn!("Failed to emit {}: {e}", STATE_EVENT);
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Quantower state emitter lagged, dropped {n}");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Quantower state channel closed, emitter exiting");
                    break;
                }
            }
        }
    })
}
```

- [ ] **Step 2: `cargo check` — no errors**

```powershell
cargo check 2>&1 | Select-String "error"
```

---

## Task 3 — `quantower_bridge_depth.rs`

**Files:**
- Create: `desktop/src-tauri/src/commands/quantower_bridge_depth.rs`

- [ ] **Step 1: Create the file**

This is a full copy of `bridge_depth.rs` with three name changes:
- `BridgeDepthState` → `QuantowerDepthState`
- `const DEPTH_BATCH_EVENT: &str = "quantower-depth-update"`
- command `bridge_get_depth` → `quantower_get_depth` with `Arc<QuantowerDepthState>`

```rust
//! L2 Depth-of-Market state holder + IPC emitter for the Quantower bridge.
//! Mirror of bridge_depth.rs — same logic, different event name + type names.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio::time::interval;

use crate::connectors::bridge::parser::{DepthOp, DepthSide, DepthUpdate};

const DEPTH_BATCH_EVENT: &str = "quantower-depth-update";
const FLUSH_INTERVAL: Duration = Duration::from_millis(16);
const PRICE_SCALE: f64 = 1_000_000.0;

#[derive(Default, Debug, Clone)]
pub struct OrderBook {
    pub bids: HashMap<i64, u64>,
    pub asks: HashMap<i64, u64>,
    pub last_update_ns: u64,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthLevel {
    pub price: f64,
    pub volume: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthSnapshot {
    pub symbol: String,
    pub bids: Vec<DepthLevel>,
    pub asks: Vec<DepthLevel>,
    pub last_update_ns: u64,
}

#[derive(Default)]
pub struct QuantowerDepthState {
    pub books: Arc<RwLock<HashMap<String, OrderBook>>>,
}

impl QuantowerDepthState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[inline]
fn price_key(price: f64) -> i64 {
    (price * PRICE_SCALE).round() as i64
}

#[inline]
fn key_to_price(key: i64) -> f64 {
    key as f64 / PRICE_SCALE
}

pub fn spawn_pump(
    mut rx: Receiver<(String, DepthUpdate)>,
    state: Arc<QuantowerDepthState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        tracing::info!("Quantower depth pump started");
        loop {
            match rx.recv().await {
                Ok((symbol, update)) => {
                    apply_update(&state, &symbol, &update).await;
                }
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("Quantower depth pump lagged, dropped {n} updates");
                }
                Err(RecvError::Closed) => {
                    tracing::info!("Quantower depth broadcast closed — pump exiting");
                    break;
                }
            }
        }
    })
}

async fn apply_update(state: &QuantowerDepthState, symbol: &str, update: &DepthUpdate) {
    let mut books = state.books.write().await;
    let book = books.entry(symbol.to_string()).or_default();
    let side = match update.side {
        DepthSide::Bid => &mut book.bids,
        DepthSide::Ask => &mut book.asks,
    };
    let key = price_key(update.price);
    match update.op {
        DepthOp::Upsert => {
            if update.volume == 0 {
                side.remove(&key);
            } else {
                side.insert(key, update.volume);
            }
        }
        DepthOp::Delete => {
            side.remove(&key);
        }
    }
    book.last_update_ns = update.timestamp_ns;
    book.dirty = true;
}

pub fn spawn_emitter(app: AppHandle, state: Arc<QuantowerDepthState>) {
    async_runtime::spawn(async move {
        tracing::info!(
            "Quantower depth IPC emitter started (window={:?})",
            FLUSH_INTERVAL
        );
        let mut ticker = interval(FLUSH_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let batch = snapshot_dirty(&state).await;
            if batch.is_empty() {
                continue;
            }
            if let Err(e) = app.emit(DEPTH_BATCH_EVENT, &batch) {
                tracing::warn!("Failed to emit {}: {e}", DEPTH_BATCH_EVENT);
            }
        }
    });
}

async fn snapshot_dirty(state: &QuantowerDepthState) -> Vec<DepthSnapshot> {
    let mut books = state.books.write().await;
    let mut out: Vec<DepthSnapshot> = Vec::with_capacity(books.len());
    for (symbol, book) in books.iter_mut() {
        if !book.dirty {
            continue;
        }
        book.dirty = false;
        out.push(DepthSnapshot {
            symbol: symbol.clone(),
            bids: sorted_levels(&book.bids, true),
            asks: sorted_levels(&book.asks, false),
            last_update_ns: book.last_update_ns,
        });
    }
    out
}

fn sorted_levels(map: &HashMap<i64, u64>, descending: bool) -> Vec<DepthLevel> {
    let mut levels: Vec<DepthLevel> = map
        .iter()
        .map(|(k, v)| DepthLevel {
            price: key_to_price(*k),
            volume: *v,
        })
        .collect();
    if descending {
        levels.sort_by(|a, b| b.price.partial_cmp(&a.price).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        levels.sort_by(|a, b| a.price.partial_cmp(&b.price).unwrap_or(std::cmp::Ordering::Equal));
    }
    levels
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDepthArgs {
    pub symbol: String,
}

#[tauri::command]
pub async fn quantower_get_depth(
    state: tauri::State<'_, Arc<QuantowerDepthState>>,
    args: GetDepthArgs,
) -> Result<Option<DepthSnapshot>, String> {
    let books = state.books.read().await;
    Ok(books.get(&args.symbol).map(|book| DepthSnapshot {
        symbol: args.symbol.clone(),
        bids: sorted_levels(&book.bids, true),
        asks: sorted_levels(&book.asks, false),
        last_update_ns: book.last_update_ns,
    }))
}
```

- [ ] **Step 2: `cargo check` — no errors**

```powershell
cargo check 2>&1 | Select-String "error"
```

---

## Task 4 — `quantower_bridge.rs`

**Files:**
- Create: `desktop/src-tauri/src/commands/quantower_bridge.rs`

- [ ] **Step 1: Create the file**

```rust
//! IPC surface for the Quantower bridge.
//!
//! Mirror of bridge.rs — identical logic, port 7273, "quantower-*" state.
//! Three commands:
//!   * `quantower_connect`    — start adapter + engine pump + state emitter
//!   * `quantower_disconnect` — stop them
//!   * `quantower_status`     — current connection status

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::commands::quantower_bridge_depth::{self, QuantowerDepthState};
use crate::commands::quantower_bridge_events;
use crate::connectors::adapter::MarketDataAdapter;
use crate::connectors::bridge::{BridgeAdapter, BridgeConfig};
use crate::state::QuantowerState;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuantowerConnectArgs {
    pub host: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuantowerStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
}

#[tauri::command]
pub async fn quantower_connect(
    state: State<'_, QuantowerState>,
    depth_state: State<'_, Arc<QuantowerDepthState>>,
    app: AppHandle,
    args: QuantowerConnectArgs,
) -> Result<QuantowerStatus, String> {
    if state.adapter.lock().await.is_some() {
        return quantower_status(state).await;
    }

    let host = {
        let h = args.host.unwrap_or_else(|| "127.0.0.1".to_string());
        if h != "127.0.0.1" && h != "localhost" && h != "::1" {
            return Err("quantower host must be a loopback address".to_string());
        }
        h
    };
    let port = args.port.unwrap_or(7273);
    let config = BridgeConfig {
        host: host.clone(),
        port,
    };

    let mut adapter = BridgeAdapter::with_config(config, state.engine.clone());

    let state_rx = adapter.states();
    let depth_rx = adapter.depths();

    adapter.connect().await.map_err(err)?;

    let pump       = state.engine.clone().spawn(adapter.ticks());
    let state_emit = quantower_bridge_events::spawn_state_emitter(app, state_rx);
    let depth_pump = quantower_bridge_depth::spawn_pump(depth_rx, depth_state.inner().clone());

    *state.engine_pump.lock().await = Some(pump);
    *state.state_emit.lock().await  = Some(state_emit);
    *state.depth_pump.lock().await  = Some(depth_pump);
    *state.adapter.lock().await     = Some(adapter);

    tracing::info!(host = %host, port, "Quantower bridge: connected");

    Ok(QuantowerStatus { connected: true, host, port })
}

#[tauri::command]
pub async fn quantower_disconnect(
    state: State<'_, QuantowerState>,
) -> Result<QuantowerStatus, String> {
    if let Some(mut adapter) = state.adapter.lock().await.take() {
        adapter.disconnect().await.map_err(err)?;
    }
    if let Some(h) = state.engine_pump.lock().await.take() { h.abort(); }
    if let Some(h) = state.state_emit.lock().await.take()  { h.abort(); }
    if let Some(h) = state.depth_pump.lock().await.take()  { h.abort(); }

    tracing::info!("Quantower bridge: disconnected");

    Ok(QuantowerStatus {
        connected: false,
        host: "127.0.0.1".to_string(),
        port: 7273,
    })
}

#[tauri::command]
pub async fn quantower_status(
    state: State<'_, QuantowerState>,
) -> Result<QuantowerStatus, String> {
    let guard = state.adapter.lock().await;
    let (host, port, connected) = match guard.as_ref() {
        Some(a) => (a.config().host.clone(), a.config().port, true),
        None    => ("127.0.0.1".to_string(), 7273, false),
    };
    Ok(QuantowerStatus { connected, host, port })
}
```

- [ ] **Step 2: `cargo check` — no errors**

```powershell
cargo check 2>&1 | Select-String "error"
```

- [ ] **Step 3: Commit Tasks 2-4**

```powershell
git add desktop/src-tauri/src/commands/quantower_bridge_events.rs `
        desktop/src-tauri/src/commands/quantower_bridge_depth.rs `
        desktop/src-tauri/src/commands/quantower_bridge.rs
git commit -m "feat(qt-bridge): add quantower_bridge* Rust commands"
```

---

## Task 5 — Wire into `commands/mod.rs` + `lib.rs`

**Files:**
- Modify: `desktop/src-tauri/src/commands/mod.rs`
- Modify: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Add 3 `pub mod` to `commands/mod.rs`**

After `pub mod bridge_events;` (line 10) add:

```rust
pub mod quantower_bridge;
pub mod quantower_bridge_depth;
pub mod quantower_bridge_events;
```

Result:
```rust
pub mod bridge;
pub mod bridge_depth;
pub mod bridge_events;
pub mod quantower_bridge;
pub mod quantower_bridge_depth;
pub mod quantower_bridge_events;
```

- [ ] **Step 2: Clone engine + manage QuantowerState in `lib.rs` setup block**

In `lib.rs`, the existing block (around line 325) reads:
```rust
let bridge_engine = rithmic_state.engine.clone();
app.manage(rithmic_state);
app.manage(state::BridgeState::new(bridge_engine));
```

Replace with:
```rust
let bridge_engine    = rithmic_state.engine.clone();
let quantower_engine = rithmic_state.engine.clone();
app.manage(rithmic_state);
app.manage(state::BridgeState::new(bridge_engine));
app.manage(state::QuantowerState::new(quantower_engine));
```

- [ ] **Step 3: Add QuantowerDepthState setup right after the existing `bridge_depth_state` block**

The existing bridge_depth block (around line 333) reads:
```rust
let bridge_depth_state = std::sync::Arc::new(
    commands::bridge_depth::BridgeDepthState::new(),
);
commands::bridge_depth::spawn_emitter(
    app.handle().clone(),
    bridge_depth_state.clone(),
);
app.manage(bridge_depth_state);
```

Add AFTER this block:
```rust
let quantower_depth_state = std::sync::Arc::new(
    commands::quantower_bridge_depth::QuantowerDepthState::new(),
);
commands::quantower_bridge_depth::spawn_emitter(
    app.handle().clone(),
    quantower_depth_state.clone(),
);
app.manage(quantower_depth_state);
```

- [ ] **Step 4: Register the 4 new commands in `invoke_handler`**

After the existing bridge commands block (around line 476):
```rust
commands::bridge::bridge_connect,
commands::bridge::bridge_disconnect,
commands::bridge::bridge_status,
commands::bridge_depth::bridge_get_depth,
```

Add:
```rust
// Quantower bridge — same wire protocol as NT bridge, port 7273.
commands::quantower_bridge::quantower_connect,
commands::quantower_bridge::quantower_disconnect,
commands::quantower_bridge::quantower_status,
commands::quantower_bridge_depth::quantower_get_depth,
```

- [ ] **Step 5: `cargo check` — no errors**

```powershell
cargo check 2>&1 | Select-String "error"
```

- [ ] **Step 6: Commit**

```powershell
git add desktop/src-tauri/src/commands/mod.rs desktop/src-tauri/src/lib.rs
git commit -m "feat(qt-bridge): wire QuantowerState + commands into lib.rs"
```

---

## Task 6 — `lib/quantower_depth/api.ts`

**Files:**
- Create: `desktop/src/lib/quantower_depth/api.ts`

- [ ] **Step 1: Create the file**

```typescript
import { invoke } from "@tauri-apps/api/core";

export type DepthLevel = {
  price: number;
  volume: number;
};

export type DepthSnapshot = {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastUpdateNs: number;
};

export async function fetchQuantowerDepth(
  symbol: string,
): Promise<DepthSnapshot | null> {
  return invoke<DepthSnapshot | null>("quantower_get_depth", {
    args: { symbol },
  });
}
```

---

## Task 7 — `QuantowerDomPanel.tsx`

**Files:**
- Create: `desktop/src/components/QuantowerDomPanel.tsx`

- [ ] **Step 1: Copy `BridgeDomPanel.tsx` to `QuantowerDomPanel.tsx` then apply these exact substitutions**

| Find | Replace |
|---|---|
| `// Live L2 Depth-of-Market sidebar…` (first comment) | `// Live L2 Depth-of-Market sidebar for the Quantower bridge.` |
| `from "../lib/bridge_depth/api"` | `from "../lib/quantower_depth/api"` |
| `fetchDepth` | `fetchQuantowerDepth` |
| `"bridge-depth-update"` | `"quantower-depth-update"` |
| `export function BridgeDomPanel(` | `export function QuantowerDomPanel(` |
| `bridge_get_depth` (in warning message) | `quantower_get_depth` |
| `"Requires L2 data subscription on the NinjaTrader feed."` | `"Requires L2 data subscription on the Quantower feed."` |

The file is otherwise identical — all layout, math, and DOM rendering logic is reused unchanged.

---

## Task 8 — `QuantowerFootprint.tsx`

**Files:**
- Create: `desktop/src/components/QuantowerFootprint.tsx`

- [ ] **Step 1: Copy `BridgeFootprint.tsx` to `QuantowerFootprint.tsx` then apply these exact substitutions**

Apply all replacements in order (each is unique in context):

| Find | Replace |
|---|---|
| `// BridgeFootprint.tsx` | `// QuantowerFootprint.tsx` |
| `// Orderflow chart fed by the NinjaTrader TCP bridge` | `// Orderflow chart fed by the Quantower TCP bridge` |
| `import { BridgeDomPanel }` | `import { QuantowerDomPanel }` |
| `from "./BridgeDomPanel"` | `from "./QuantowerDomPanel"` |
| `export function BridgeFootprint(` | `export function QuantowerFootprint(` |
| `invoke<BridgeStatus>("bridge_connect"` | `invoke<QuantowerStatus>("quantower_connect"` |
| `type BridgeStatus = {` | `type QuantowerStatus = {` |
| `type BridgeConnState =` | `type QuantowerConnState =` |
| `useState<BridgeConnState>({` | `useState<QuantowerConnState>({` |
| `listen<BridgeConnState>("bridge-state"` | `listen<QuantowerConnState>("quantower-state"` |
| `invoke("bridge_disconnect")` | `invoke("quantower_disconnect")` |
| `"127.0.0.1:7272"` | `"127.0.0.1:7273"` |
| `port: 7272` | `port: 7273` |
| `<BridgeDomPanel` | `<QuantowerDomPanel` |
| `function BridgeStatusBanner(` | `function QuantowerStatusBanner(` |
| `<BridgeStatusBanner` | `<QuantowerStatusBanner` |
| `"NinjaTrader Bridge"` | `"Quantower Bridge"` (2 occurrences) |
| `"connecting to NinjaTrader on 127.0.0.1:7272"` | `"connecting to Quantower on 127.0.0.1:7273"` |
| `"OrderflowBridge.cs is older than v2` | `"QuantowerOrderflowBridge.cs is older than v2` |
| `"locked to the NinjaTrader chart"` | `"locked to the Quantower chart"` |
| `"NT Bridge"` | `"QT Bridge"` |
| `"NT misconfigured"` | `"QT misconfigured"` |
| `"Switch to Rithmic native"` | `"Switch to Rithmic native"` (no change) |

After substitutions, the file exports `QuantowerFootprint` with prop `{ onSwitchToRithmic: () => void }` — identical contract to `BridgeFootprint`.

- [ ] **Step 2: Verify TypeScript — no errors**

```powershell
cd ..; npx tsc --noEmit 2>&1 | Select-String "error TS"
```
Expected: no `error TS` lines.

- [ ] **Step 3: Commit Tasks 6-8**

```powershell
git add desktop/src/lib/quantower_depth/api.ts `
        desktop/src/components/QuantowerDomPanel.tsx `
        desktop/src/components/QuantowerFootprint.tsx
git commit -m "feat(qt-bridge): add QuantowerDomPanel + QuantowerFootprint"
```

---

## Task 9 — Update `MultiSourceFootprint.tsx`

**Files:**
- Modify: `desktop/src/components/MultiSourceFootprint.tsx`

- [ ] **Step 1: Apply the full replacement of the file**

Replace the entire content of `MultiSourceFootprint.tsx` with:

```tsx
// 2026-05-26 — Bridge NinjaTrader source added as a SECOND code path.
// 2026-06-09 — Quantower bridge added as a THIRD code path (port 7273).
// Switcher lives at the top of this wrapper; neither child owns the UX.

import { useCallback, useEffect, useState } from "react";
import { RithmicFootprint } from "./RithmicFootprint";
import { BridgeFootprint } from "./BridgeFootprint";
import { QuantowerFootprint } from "./QuantowerFootprint";
import "./RithmicFootprint.css";
import "./MultiSourceFootprint.css";

type DataSource = "rithmic" | "bridge" | "quantower";

const PREF_KEY = "orderflow.dataSource";

function readDataSourcePref(): DataSource {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === "bridge") return "bridge";
    if (v === "quantower") return "quantower";
    return "rithmic";
  } catch {
    return "rithmic";
  }
}

function writeDataSourcePref(v: DataSource) {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* ignore */
  }
}

export function MultiSourceFootprint() {
  const [source, setSource] = useState<DataSource>(() => readDataSourcePref());

  useEffect(() => {
    writeDataSourcePref(source);
  }, [source]);

  const switchToBridge     = useCallback(() => setSource("bridge"),     []);
  const switchToQuantower  = useCallback(() => setSource("quantower"),  []);
  const switchToRithmic    = useCallback(() => setSource("rithmic"),    []);

  if (source === "bridge") {
    return (
      <div className="multi-source-footprint">
        <BridgeFootprint onSwitchToRithmic={switchToRithmic} />
      </div>
    );
  }

  if (source === "quantower") {
    return (
      <div className="multi-source-footprint">
        <QuantowerFootprint onSwitchToRithmic={switchToRithmic} />
      </div>
    );
  }

  return (
    <div className="multi-source-footprint">
      <RithmicFootprint
        onSwitchToBridge={switchToBridge}
        onSwitchToQuantower={switchToQuantower}
      />
    </div>
  );
}
```

> **Note:** `RithmicFootprint` currently accepts `onSwitchToBridge`. After this change it also receives `onSwitchToQuantower`. Check `RithmicFootprint.tsx` props and add `onSwitchToQuantower?: () => void` to its props type if missing — the prop is optional so no existing call site breaks.

- [ ] **Step 2: Add `onSwitchToQuantower` prop to `RithmicFootprint` if missing**

Grep for the props type definition:

```powershell
cd desktop; Select-String "onSwitchToBridge" src/components/RithmicFootprint.tsx | Select-Object -First 5
```

Find the type definition (e.g. `type RithmicFootprintProps = { onSwitchToBridge: () => void }`).

If `onSwitchToQuantower` is not there, add it:
```typescript
// Before:
type RithmicFootprintProps = {
  onSwitchToBridge: () => void;
};
// After:
type RithmicFootprintProps = {
  onSwitchToBridge: () => void;
  onSwitchToQuantower?: () => void;
};
```

- [ ] **Step 3: TypeScript check — no errors**

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS"
```

- [ ] **Step 4: Commit**

```powershell
git add desktop/src/components/MultiSourceFootprint.tsx `
        desktop/src/components/RithmicFootprint.tsx
git commit -m "feat(qt-bridge): add Quantower as third source in MultiSourceFootprint"
```

---

## Task 10 — C# Quantower Indicator

**Files:**
- Create: `Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs`

- [ ] **Step 1: Create the directory and file**

```powershell
New-Item -ItemType Directory -Force "Quantower/Scripts/Indicators"
```

Create `Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs`:

```csharp
// QuantowerOrderflowBridge.cs
// Streams ticks + DOM from Quantower to the Orderflow-v2 desktop app
// via a local TCP connection on port 7273.
//
// Wire protocol (UTF-8, newline-terminated, identical to NinjaTrader bridge):
//   M,{seq},{symbol},{price},{qty},{B|S}\n   — tick trade
//   D,{seq},{symbol},{B|S},{price},{qty}\n   — DOM update
//   H,{seq}\n                               — heartbeat (1 s)
//   E,{seq}\n                               — end of history sentinel
//
// Installation:
//   1. Copy this file to %QUANTOWER_DIR%\Scripts\Indicators\
//   2. Quantower → Tools → Scripts → Compile
//   3. Add the indicator to a chart with a Rithmic feed
//   4. In Orderflow-v2: switch source to Quantower → Connect

using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using TradingPlatform.BusinessLayer;

namespace OrderflowV2
{
    [Indicator("QuantowerOrderflowBridge", "Senzoukria Orderflow Bridge", Version = "1.0",
               Description = "Streams ticks + DOM to Orderflow-v2 desktop on localhost:7273")]
    public class QuantowerOrderflowBridge : Indicator
    {
        [InputParameter("Port", 0, 1024, 65535, 1, 0)]
        public int Port = 7273;

        private TcpListener  _listener;
        private TcpClient    _client;
        private NetworkStream _stream;
        private Thread       _acceptThread;
        private Thread       _heartbeatThread;
        private int          _seq;
        private volatile bool _running;
        private readonly object _writeLock = new object();

        // ──────────────────────────────────────────────────────────────
        protected override void OnInit()
        {
            Name = "QuantowerOrderflowBridge";
            _running = true;
            StartServer();
        }

        protected override void OnUpdate(UpdateArgs args) { /* not used */ }

        // Called for every trade print on the subscribed symbol.
        protected override void OnTrade(Trade trade)
        {
            if (trade == null) return;
            string side = trade.AggressorFlag == AggressorFlag.Buy ? "B" : "S";
            SendLine(
                $"M,{NextSeq()},{Symbol.Name}," +
                $"{trade.Price.ToString(System.Globalization.CultureInfo.InvariantCulture)}," +
                $"{(long)trade.Size},{side}"
            );
        }

        // Called for every DOM update on the subscribed symbol.
        protected override void OnLevel2(Level2Quote quote)
        {
            if (quote == null) return;
            string side = quote.Side == Side.Buy ? "B" : "S";
            SendLine(
                $"D,{NextSeq()},{Symbol.Name},{side}," +
                $"{quote.Price.ToString(System.Globalization.CultureInfo.InvariantCulture)}," +
                $"{(long)quote.Size}"
            );
        }

        protected override void OnStop()
        {
            _running = false;
            StopServer();
        }

        // ──────────────────────────────────────────────────────────────
        private void StartServer()
        {
            try
            {
                _listener = new TcpListener(IPAddress.Loopback, Port);
                _listener.Start();

                _acceptThread = new Thread(AcceptLoop) { IsBackground = true };
                _acceptThread.Start();

                _heartbeatThread = new Thread(HeartbeatLoop) { IsBackground = true };
                _heartbeatThread.Start();

                Log($"QuantowerOrderflowBridge: listening on 127.0.0.1:{Port}", StrategyLoggingLevel.Trading);
            }
            catch (Exception ex)
            {
                Log($"QuantowerOrderflowBridge: start failed — {ex.Message}", StrategyLoggingLevel.Error);
            }
        }

        private void StopServer()
        {
            try { _client?.Close();   } catch { /* ignore */ }
            try { _listener?.Stop();  } catch { /* ignore */ }
            _client   = null;
            _stream   = null;
            _listener = null;
        }

        private void AcceptLoop()
        {
            while (_running)
            {
                try
                {
                    var client = _listener.AcceptTcpClient();
                    lock (_writeLock)
                    {
                        _client?.Close();
                        _client = client;
                        _stream = client.GetStream();
                    }
                    Log("QuantowerOrderflowBridge: client connected", StrategyLoggingLevel.Trading);
                    // Send end-of-history sentinel immediately — we don't
                    // replay historical bars; the app requests them via
                    // rithmic_get_bars from its own cache.
                    SendLine($"E,{NextSeq()}");
                }
                catch (Exception ex) when (_running)
                {
                    Log($"QuantowerOrderflowBridge: accept error — {ex.Message}", StrategyLoggingLevel.Error);
                    Thread.Sleep(1000);
                }
            }
        }

        private void HeartbeatLoop()
        {
            while (_running)
            {
                Thread.Sleep(1000);
                SendLine($"H,{NextSeq()}");
            }
        }

        private void SendLine(string line)
        {
            lock (_writeLock)
            {
                if (_stream == null) return;
                try
                {
                    byte[] data = Encoding.UTF8.GetBytes(line + "\n");
                    _stream.Write(data, 0, data.Length);
                }
                catch
                {
                    _client?.Close();
                    _client = null;
                    _stream = null;
                }
            }
        }

        private int NextSeq() => Interlocked.Increment(ref _seq);
    }
}
```

- [ ] **Step 2: Commit**

```powershell
git add Quantower/Scripts/Indicators/QuantowerOrderflowBridge.cs
git commit -m "feat(qt-bridge): add QuantowerOrderflowBridge C# indicator"
```

---

## Task 11 — Full build verification

**Files:** none (verification only)

- [ ] **Step 1: Rust build**

```powershell
cd desktop; cargo build 2>&1 | Select-String -Pattern "^error"
```
Expected: no `error` lines.

- [ ] **Step 2: TypeScript check**

```powershell
cd ..; npx tsc --noEmit 2>&1 | Select-String "error TS"
```
Expected: no `error TS` lines.

- [ ] **Step 3: Manual smoke test checklist**

1. `npm run tauri dev`
2. In MultiSourceFootprint: verify three source buttons visible (Rithmic / NT Bridge / Quantower)
3. Click Quantower → `QuantowerFootprint` renders with "connecting to Quantower on 127.0.0.1:7273…" banner
4. Verify no console errors
5. Install C# indicator in Quantower → confirm TCP server starts on 7273 (check Quantower log)
6. Connect from app → banner transitions to Live state
7. DOM panel opens and populates

- [ ] **Step 4: Final commit**

```powershell
git add -A
git commit -m "feat(qt-bridge): Quantower bridge complete — port 7273, CSV protocol, DOM support"
```

---

## Self-Review Notes

- **spec §6 (error handling)**: Task 4 returns explicit `"quantower host must be a loopback address"` error — covered.
- **spec §8 (engine shared)**: `QuantowerState::new(quantower_engine)` passes the cloned `Arc<FootprintEngine>` — covered.
- **spec §9 (file recap)**: All 11 files in the spec's table have a corresponding task — covered.
- **MultiSourceFootprint `onSwitchToQuantower` prop**: Task 9 Step 2 explicitly handles the `RithmicFootprint` props extension — no silent breakage.
- **`QuantowerDepthState` type**: Used as `Arc<QuantowerDepthState>` in `quantower_bridge.rs` command signature and in `lib.rs` — both are consistent with the `quantower_get_depth` command which takes `tauri::State<'_, Arc<QuantowerDepthState>>`.
