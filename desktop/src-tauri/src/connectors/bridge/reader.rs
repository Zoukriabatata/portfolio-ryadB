//! Background reader task for the NinjaTrader bridge.
//!
//! Owns the TCP connection, parses incoming CSV lines, and fans out
//! normalized `Tick`s on a broadcast channel. Reconnects with
//! exponential backoff when the bridge goes away.

use std::sync::Arc;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{broadcast, oneshot};

use crate::connectors::bridge::client::{connect, BridgeConfig, ReconnectBackoff};
use crate::connectors::bridge::parser::{parse_line, BridgeMessage};
use crate::connectors::tick::Tick;
use crate::engine::FootprintEngine;

pub const BRIDGE_SOURCE: &str = "bridge";

/// State exposed to the UI via a broadcast channel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BridgeConnState {
    Disconnected,
    Connecting,
    #[serde(rename_all = "camelCase")]
    ReceivingHistory {
        received: u64,
        total: u64,
    },
    #[serde(rename_all = "camelCase")]
    Live {
        symbol: String,
        tick_size: f64,
    },
    #[serde(rename_all = "camelCase")]
    Reconnecting {
        in_ms: u64,
    },
    /// Emitted once at end-of-history when the count of received H
    /// ticks does NOT match the announced `n_historical` from the
    /// M header. A non-zero gap means ticks were lost between NT
    /// and us — typically broadcast-channel lag — and tick-based
    /// timeframes (100T) will be off by that many bar boundaries.
    /// The UI surfaces this as a warning badge.
    #[serde(rename_all = "camelCase")]
    Drift {
        symbol: String,
        received: u64,
        expected: u64,
    },
    /// Emitted once at end-of-history when the wire format is
    /// understood but the data tells us NT is not set up to
    /// produce a footprint that matches its own chart. Currently
    /// detected case (`reason = "no-seq"`): every historical tick
    /// arrived without a seq counter, which means the running
    /// `OrderflowBridge.cs` is older than the v2 protocol — tick-
    /// based timeframes (100T) will collapse into a single bucket
    /// and never align with NT's chart. The UI shows this as a
    /// pedagogical banner so the user knows to update the bridge
    /// or check Tick Replay is ON.
    #[serde(rename_all = "camelCase")]
    Misconfigured {
        symbol: String,
        reason: String,
    },
    /// Latest exchange-pushed session volume, forwarded by the C#
    /// bridge as a `V` wire line whenever NT receives a
    /// `MarketDataType.DailyVolume` event. This is the SAME source
    /// as NT's Market Analyzer "Daily volume" column: the broker's
    /// running counter for the contract since session open. It is
    /// independent of how many ticks we have ingested ourselves,
    /// so the UI can show it as the authoritative session volume
    /// next to the bar-summed one we compute locally.
    #[serde(rename_all = "camelCase")]
    DailyVolume {
        symbol: String,
        volume: u64,
    },
}

pub fn spawn(
    config: BridgeConfig,
    tick_tx: broadcast::Sender<Tick>,
    state_tx: broadcast::Sender<BridgeConnState>,
    shutdown_rx: oneshot::Receiver<()>,
    engine: Arc<FootprintEngine>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(reader_task(config, tick_tx, state_tx, shutdown_rx, engine))
}

async fn reader_task(
    config: BridgeConfig,
    tick_tx: broadcast::Sender<Tick>,
    state_tx: broadcast::Sender<BridgeConnState>,
    mut shutdown_rx: oneshot::Receiver<()>,
    engine: Arc<FootprintEngine>,
) {
    tracing::info!("Bridge reader task started");
    let _ = state_tx.send(BridgeConnState::Disconnected);

    let mut backoff = ReconnectBackoff::new();

    loop {
        // Check shutdown before each connect attempt.
        if shutdown_rx.try_recv().is_ok() {
            break;
        }

        let _ = state_tx.send(BridgeConnState::Connecting);
        let stream = match connect(&config).await {
            Ok(s) => {
                backoff.reset();
                s
            }
            Err(e) => {
                let delay = backoff.next_delay();
                tracing::warn!(
                    "Bridge: connect failed ({}); retrying in {:?}",
                    e,
                    delay
                );
                let _ = state_tx.send(BridgeConnState::Reconnecting {
                    in_ms: delay.as_millis() as u64,
                });
                tokio::select! {
                    _ = tokio::time::sleep(delay) => continue,
                    _ = &mut shutdown_rx => break,
                }
            }
        };

        // Drive one TCP session until it ends or shutdown is requested.
        let outcome =
            drive_session(stream, &tick_tx, &state_tx, &mut shutdown_rx, &engine).await;

        match outcome {
            SessionOutcome::Shutdown => break,
            SessionOutcome::Reconnect => {
                let delay = backoff.next_delay();
                tracing::warn!("Bridge: session ended; reconnecting in {:?}", delay);
                let _ = state_tx.send(BridgeConnState::Reconnecting {
                    in_ms: delay.as_millis() as u64,
                });
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    _ = &mut shutdown_rx => break,
                }
            }
        }
    }

    let _ = state_tx.send(BridgeConnState::Disconnected);
    tracing::info!("Bridge reader task exited");
}

enum SessionOutcome {
    Shutdown,
    Reconnect,
}

async fn drive_session(
    stream: tokio::net::TcpStream,
    tick_tx: &broadcast::Sender<Tick>,
    state_tx: &broadcast::Sender<BridgeConnState>,
    shutdown_rx: &mut oneshot::Receiver<()>,
    engine: &Arc<FootprintEngine>,
) -> SessionOutcome {
    let mut lines = BufReader::new(stream).lines();

    // Session-local state — reset on every new connection.
    let mut symbol = String::new();
    let mut tick_size: f64 = 0.0;
    let mut total_hist: u64 = 0;
    let mut received_hist: u64 = 0;
    let mut hist_seq_zero: u64 = 0;
    let mut got_end_of_history = false;

    loop {
        tokio::select! {
            _ = &mut *shutdown_rx => return SessionOutcome::Shutdown,
            next = lines.next_line() => match next {
                Ok(Some(line)) => {
                    if line.is_empty() { continue; }
                    match parse_line(&line) {
                        Ok(BridgeMessage::Meta(m)) => {
                            symbol = m.symbol.clone();
                            tick_size = m.tick_size;
                            total_hist = m.n_historical;
                            received_hist = 0;
                            got_end_of_history = false;
                            tracing::info!(
                                symbol = %m.symbol,
                                tick_size = m.tick_size,
                                n_historical = m.n_historical,
                                "Bridge: meta received"
                            );
                            // A fresh backfill fully REPLACES this symbol's
                            // data. Drop any bars left from a previous session
                            // (reconnect, re-applied indicator) before the new
                            // history streams in — otherwise an old partial
                            // session layered under a new one leaves a mid-chart
                            // gap (e.g. 16:40→20:04 from the old session,
                            // 22:53→now from the new one, nothing between).
                            engine.clear_symbol(&symbol).await;
                            // Register the per-symbol tick size on the engine
                            // BEFORE forwarding any historical tick. We are the
                            // single tick producer and the engine pump drains
                            // the channel in FIFO order, so this completes
                            // before the first H tick is processed — historical
                            // bars round on the correct grid (e.g. 0.1 for
                            // GC/MGC instead of the 0.25 default).
                            engine
                                .set_symbol_tick_size(symbol.clone(), tick_size)
                                .await;
                            let _ = state_tx.send(BridgeConnState::ReceivingHistory {
                                received: 0,
                                total: total_hist,
                            });
                        }
                        Ok(BridgeMessage::Historical(mut t)) => {
                            if t.seq == 0 {
                                hist_seq_zero += 1;
                            }
                            t.symbol = symbol.clone();
                            t.source = BRIDGE_SOURCE.to_string();
                            let _ = tick_tx.send(t);
                            received_hist += 1;
                            // Throttle progress events to ~once per 5k ticks
                            // so we don't flood the broadcast channel.
                            if received_hist % 5000 == 0 {
                                let _ = state_tx.send(BridgeConnState::ReceivingHistory {
                                    received: received_hist,
                                    total: total_hist,
                                });
                            }
                        }
                        Ok(BridgeMessage::EndOfHistory) => {
                            got_end_of_history = true;
                            tracing::info!(
                                received = received_hist,
                                total = total_hist,
                                "Bridge: end-of-history received"
                            );
                            // Final progress update + transition to Live state.
                            let _ = state_tx.send(BridgeConnState::ReceivingHistory {
                                received: received_hist,
                                total: total_hist,
                            });
                            // Drift check — if NT announced N ticks and we
                            // received fewer (or more), tick-based bucketing
                            // will be off. Surface it so the user knows the
                            // 100T view is not bar-aligned with NT for this
                            // session. total_hist == 0 means the user is on
                            // an older Bridge that didn't announce it, so
                            // we skip the check rather than false-positive.
                            if total_hist > 0 && received_hist != total_hist {
                                tracing::warn!(
                                    symbol = %symbol,
                                    received = received_hist,
                                    expected = total_hist,
                                    "Bridge: historical tick count drift detected"
                                );
                                let _ = state_tx.send(BridgeConnState::Drift {
                                    symbol: symbol.clone(),
                                    received: received_hist,
                                    expected: total_hist,
                                });
                            }
                            // "No-seq" detection — every historical tick came
                            // in without a seq counter. Only meaningful once
                            // we've seen a non-trivial sample; below the
                            // threshold a quiet chart could legitimately
                            // produce no diagnostic.
                            if is_no_seq_misconfig(received_hist, hist_seq_zero) {
                                tracing::warn!(
                                    symbol = %symbol,
                                    received = received_hist,
                                    "Bridge: no seq counter on any historical tick — \
                                     OrderflowBridge.cs is older than v2 or Tick Replay is OFF"
                                );
                                let _ = state_tx.send(BridgeConnState::Misconfigured {
                                    symbol: symbol.clone(),
                                    reason: "no-seq".to_string(),
                                });
                            }
                            let _ = state_tx.send(BridgeConnState::Live {
                                symbol: symbol.clone(),
                                tick_size,
                            });
                        }
                        Ok(BridgeMessage::Live(mut t)) => {
                            if !got_end_of_history {
                                // Defensive: bridge should always send E before
                                // any L. If we get here, transition anyway.
                                got_end_of_history = true;
                                let _ = state_tx.send(BridgeConnState::Live {
                                    symbol: symbol.clone(),
                                    tick_size,
                                });
                            }
                            t.symbol = symbol.clone();
                            t.source = BRIDGE_SOURCE.to_string();
                            let _ = tick_tx.send(t);
                        }
                        Ok(BridgeMessage::DailyVolume(dv)) => {
                            // Forward unconditionally — the C# side
                            // already dedups (only emits on change), so
                            // every V we see is a new exchange counter.
                            tracing::trace!(
                                symbol = %symbol,
                                volume = dv.volume,
                                "Bridge: daily volume update"
                            );
                            let _ = state_tx.send(BridgeConnState::DailyVolume {
                                symbol: symbol.clone(),
                                volume: dv.volume,
                            });
                        }
                        Ok(BridgeMessage::Ping) => {
                            tracing::trace!("Bridge: ping");
                        }
                        Err(e) => {
                            tracing::warn!("Bridge: parse error on '{}': {}", line, e);
                        }
                    }
                }
                Ok(None) => {
                    tracing::warn!("Bridge: stream closed by peer");
                    return SessionOutcome::Reconnect;
                }
                Err(e) => {
                    tracing::warn!("Bridge: read error: {}", e);
                    return SessionOutcome::Reconnect;
                }
            }
        }
    }
}

/// Minimum historical sample below which the "every tick has seq=0"
/// signal is too noisy to act on — a quiet chart can legitimately
/// produce a tiny backfill with no real activity.
const NO_SEQ_MIN_SAMPLE: u64 = 100;

/// True iff the historical sample is large enough to trust AND every
/// tick in it came without a seq counter. That combination means the
/// running C# bridge is older than v2 (which always emits a non-zero
/// monotonic seq) — tick-based timeframes (100T) will collapse into
/// a single bucket and never align with NT's chart.
fn is_no_seq_misconfig(received_hist: u64, hist_seq_zero: u64) -> bool {
    received_hist >= NO_SEQ_MIN_SAMPLE && hist_seq_zero == received_hist
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_seq_misconfig_triggers_when_full_sample_lacks_seq() {
        assert!(is_no_seq_misconfig(NO_SEQ_MIN_SAMPLE, NO_SEQ_MIN_SAMPLE));
        assert!(is_no_seq_misconfig(10_000, 10_000));
    }

    #[test]
    fn no_seq_misconfig_silent_on_tiny_sample() {
        // Below the minimum sample, even all-zero is not actionable.
        assert!(!is_no_seq_misconfig(50, 50));
        assert!(!is_no_seq_misconfig(0, 0));
    }

    #[test]
    fn no_seq_misconfig_silent_when_any_tick_has_seq() {
        // A single seq-bearing tick proves the bridge is v2+ — the
        // rest are zero only because they came before the first
        // tracked event.
        assert!(!is_no_seq_misconfig(10_000, 9_999));
        assert!(!is_no_seq_misconfig(10_000, 0));
    }
}
