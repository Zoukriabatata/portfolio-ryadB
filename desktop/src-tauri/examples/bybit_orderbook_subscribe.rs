//! M3.5 smoke test — connects directly to Bybit V5 linear, applies
//! the snapshot + delta stream into an OrderbookEngine for 30 s,
//! and prints periodic best-bid/best-ask + sequence so we can
//! eyeball the state machine without spinning up Tauri.
//!
//! Usage (PowerShell):
//!   cargo run --example bybit_orderbook_subscribe
//!
//! Optional env override:
//!   $env:BYBIT_OB_SYMBOL = "ETHUSDT"

use std::time::{Duration, Instant};

use desktop_lib::engine::OrderbookEngine;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const URL: &str = "wss://stream.bybit.com/v5/public/linear";
// Linear public WS supports 1/50/200 only — 500 is REST-side.
const DEPTH: u32 = 200;
const RUN_DURATION: Duration = Duration::from_secs(30);

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();

    let symbol = std::env::var("BYBIT_OB_SYMBOL").unwrap_or_else(|_| "BTCUSDT".to_string());
    let topic = format!("orderbook.{}.{}", DEPTH, symbol);

    println!("Connecting to {} for {}", URL, topic);
    let (ws, _) = connect_async(URL).await?;
    let (mut sink, mut stream) = ws.split();
    sink.send(Message::Text(
        json!({ "op": "subscribe", "args": [topic] }).to_string(),
    ))
    .await?;

    let mut engine = OrderbookEngine::new(symbol.clone(), DEPTH);
    let mut snapshots = 0u64;
    let mut deltas = 0u64;
    let mut errors = 0u64;
    let deadline = Instant::now() + RUN_DURATION;
    let mut last_log = Instant::now();

    while Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match tokio::time::timeout(remaining.min(Duration::from_secs(2)), stream.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                let v: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let topic = v.get("topic").and_then(|t| t.as_str()).unwrap_or("");
                if !topic.starts_with("orderbook.") {
                    continue;
                }
                let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let data = match v.get("data") {
                    Some(d) => d,
                    None => continue,
                };
                let bids = parse_levels(data.get("b"));
                let asks = parse_levels(data.get("a"));
                let seq = data
                    .get("seq")
                    .or_else(|| data.get("u"))
                    .and_then(|s| s.as_u64())
                    .unwrap_or(0);
                match typ {
                    "snapshot" => {
                        engine.apply_snapshot(bids, asks, seq);
                        snapshots += 1;
                    }
                    "delta" => match engine.apply_delta(bids, asks, seq) {
                        Ok(()) => deltas += 1,
                        Err(e) => {
                            errors += 1;
                            eprintln!("delta error #{}: {}", errors, e);
                        }
                    },
                    _ => {}
                }

                if last_log.elapsed() >= Duration::from_secs(2) {
                    let ev = engine.snapshot_event("BYBIT");
                    let bb = ev.bids.first().map(|l| l.price).unwrap_or(0.0);
                    let ba = ev.asks.first().map(|l| l.price).unwrap_or(0.0);
                    println!(
                        "snap={} delta={} err={} bid={:.2} ask={:.2} seq={}",
                        snapshots, deltas, errors, bb, ba, ev.sequence
                    );
                    last_log = Instant::now();
                }
            }
            Ok(Some(Ok(Message::Ping(p)))) => {
                let _ = sink.send(Message::Pong(p)).await;
            }
            Ok(Some(Err(e))) => {
                eprintln!("WS error: {}", e);
                break;
            }
            Ok(None) | Ok(Some(Ok(Message::Close(_)))) => {
                println!("stream ended");
                break;
            }
            Err(_) => {} // periodic logging timeout, keep waiting
            _ => {}
        }
    }

    println!(
        "\n=== Summary ===\nsnapshots: {}\ndeltas:    {}\nerrors:    {}",
        snapshots, deltas, errors
    );
    let ev = engine.snapshot_event("BYBIT");
    println!(
        "final book: {} bids ({}..{}) | {} asks ({}..{})",
        ev.bids.len(),
        ev.bids.last().map(|l| l.price).unwrap_or(0.0),
        ev.bids.first().map(|l| l.price).unwrap_or(0.0),
        ev.asks.len(),
        ev.asks.first().map(|l| l.price).unwrap_or(0.0),
        ev.asks.last().map(|l| l.price).unwrap_or(0.0),
    );
    Ok(())
}

fn parse_levels(v: Option<&serde_json::Value>) -> Vec<(f64, f64)> {
    let Some(arr) = v.and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|lvl| {
            let pair = lvl.as_array()?;
            let p: f64 = pair.first()?.as_str()?.parse().ok()?;
            let q: f64 = pair.get(1)?.as_str()?.parse().ok()?;
            Some((p, q))
        })
        .collect()
}
