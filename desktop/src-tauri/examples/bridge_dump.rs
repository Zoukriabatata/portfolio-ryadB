//! Connect to a running NinjaTrader OrderflowBridge and print the first
//! 20 parsed messages, then live updates for ~20 seconds.
//!
//! Run with:
//!   cargo run --example bridge_dump
//!
//! Requires NinjaTrader running with the OrderflowBridge indicator
//! applied to a Tick chart, listening on 127.0.0.1:7272.

use std::sync::Arc;
use std::time::Duration;

use desktop_lib::connectors::bridge::{BridgeAdapter, BridgeConfig, BridgeConnState};
use desktop_lib::connectors::MarketDataAdapter;
use desktop_lib::engine::{FootprintEngine, Timeframe};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info,desktop_lib=debug")))
        .init();

    // Throwaway engine — this debug tool only drains the tick broadcast;
    // the reader uses the engine just to register the M-header tick size.
    let engine = Arc::new(FootprintEngine::new(vec![Timeframe::Min1], 0.25));
    let mut adapter = BridgeAdapter::with_config(BridgeConfig::default(), engine);
    let mut ticks = adapter.ticks();
    let mut states = adapter.states();

    adapter.connect().await?;
    tracing::info!("Connected, draining 20 ticks + listening to state...");

    let mut tick_count = 0u64;
    let mut last_log = std::time::Instant::now();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(60);

    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                tracing::info!("Deadline reached, total ticks={}", tick_count);
                break;
            }
            r = states.recv() => match r {
                Ok(s) => match &s {
                    BridgeConnState::Live { symbol, tick_size } => {
                        tracing::info!("STATE: Live {} (tick_size={})", symbol, tick_size);
                    }
                    BridgeConnState::ReceivingHistory { received, total } => {
                        tracing::info!("STATE: ReceivingHistory {}/{}", received, total);
                    }
                    other => tracing::info!("STATE: {:?}", other),
                }
                Err(_) => {}
            },
            r = ticks.recv() => match r {
                Ok(t) => {
                    tick_count += 1;
                    if tick_count <= 5 || tick_count % 100_000 == 0 {
                        tracing::info!(
                            "TICK #{:>6} ts={} {} {:?} qty={} px={}",
                            tick_count, t.timestamp_ns, t.symbol, t.side, t.qty, t.price,
                        );
                    }
                    if last_log.elapsed() > Duration::from_secs(2) {
                        tracing::info!("running total ticks={}", tick_count);
                        last_log = std::time::Instant::now();
                    }
                }
                Err(broadcast_err) => {
                    tracing::warn!("tick channel: {:?}", broadcast_err);
                }
            }
        }
    }

    adapter.disconnect().await?;
    tracing::info!("Final tick count: {}", tick_count);
    Ok(())
}
