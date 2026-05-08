//! Heartbeat task: sends RequestHeartbeat (template 18) at the cadence
//! the gateway dictated in ResponseLogin (`heartbeat_interval`, in
//! seconds — currently 60s on the Rithmic Test environment).
//!
//! Without this the gateway silently kicks the WebSocket after roughly
//! one missed interval, so the task is part of the post-login critical
//! path: it's spawned right after the reader and torn down before it
//! during disconnect.

use std::time::Duration;

use futures_util::SinkExt;
use prost::Message as ProstMessage;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

use crate::connectors::rithmic::client::SharedSink;
use crate::connectors::rithmic::proto::RequestHeartbeat;

const REQUEST_HEARTBEAT_TEMPLATE_ID: i32 = 18;

pub struct HeartbeatHandle {
    pub handle: JoinHandle<()>,
    pub shutdown: oneshot::Sender<()>,
}

/// Spawn the heartbeat loop. The first tick fires after one full
/// interval (we don't double-send right after login).
///
/// `interval_secs` is the value the server returned in
/// ResponseLogin.heartbeat_interval. Round any sub-second residue
/// up to the next whole second — sending faster than asked is
/// always safe; sending slower is what gets you kicked.
pub fn spawn(sink: SharedSink, interval_secs: f64) -> HeartbeatHandle {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let interval = Duration::from_secs_f64(interval_secs.max(1.0));
    let handle = tokio::spawn(heartbeat_task(sink, interval, shutdown_rx));
    HeartbeatHandle {
        handle,
        shutdown: shutdown_tx,
    }
}

async fn heartbeat_task(
    sink: SharedSink,
    interval: Duration,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    tracing::info!("Heartbeat task started, interval={:?}", interval);

    let mut ticker = tokio::time::interval(interval);
    // The first immediate tick is consumed at construction; the loop
    // below sees the first one at +interval, which is what we want.
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                tracing::info!("Heartbeat task: shutdown signal received");
                break;
            }
            _ = ticker.tick() => {
                if !send_heartbeat(&sink).await {
                    // Underlying socket is dead — the reader task will
                    // see the same condition and tear down via its own
                    // path. We just stop trying.
                    tracing::warn!("Heartbeat send failed — exiting task");
                    break;
                }
            }
        }
    }

    tracing::info!("Heartbeat task exited");
}

/// Send a single heartbeat. Returns false on transport error.
async fn send_heartbeat(sink: &SharedSink) -> bool {
    let req = RequestHeartbeat {
        template_id: REQUEST_HEARTBEAT_TEMPLATE_ID,
        user_msg: vec![],
        ssboe: None,
        usecs: None,
    };
    let mut buf = Vec::with_capacity(req.encoded_len());
    if let Err(e) = req.encode(&mut buf) {
        tracing::error!("Heartbeat: encode failed: {}", e);
        return false;
    }
    let mut s = sink.lock().await;
    match s.send(Message::Binary(buf)).await {
        Ok(()) => {
            tracing::trace!("Heartbeat sent (template 18)");
            true
        }
        Err(e) => {
            tracing::warn!("Heartbeat: send failed: {}", e);
            false
        }
    }
}
