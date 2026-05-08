//! Rithmic R|Protocol API connector.
//!
//! Phase 7 scaffolding: structure + trait wiring only. All network
//! and auth logic lives in `client.rs` / `adapter.rs` and is currently
//! `todo!()` — see Phase 7.3+ for implementation.
//!
//! The compiled protobuf types (from `rithmic-sdk/proto/`) are
//! generated into `proto/mod.rs` by `build.rs` and re-exported here.

pub mod adapter;
pub mod auth;
pub mod client;

// The proto module is fully generated from rithmic-sdk/proto/ at build
// time. We deliberately compile every Rithmic message type even though
// Phase 7 only consumes a subset, so the lint noise is expected.
#[allow(dead_code, clippy::all, non_snake_case)]
pub mod proto;

pub use adapter::RithmicAdapter;
pub use auth::RithmicSession;
