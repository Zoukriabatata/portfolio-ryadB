//! CSV line parser for the NinjaTrader bridge wire protocol.
//!
//! Wire format (UTF-8, newline-terminated):
//!   M,<symbol>,<tick_size>,<n_historical>          one-shot header
//!   H,<ts_ns>,<price>,<qty>,<side>[,<seq>]         historical tick (0=Buy 1=Sell)
//!   E                                              end-of-history sentinel
//!   L,<ts_ns>,<price>,<qty>,<side>[,<seq>]         live tick
//!   V,<ts_ns>,<daily_volume>                       exchange-pushed session vol
//!   P                                              ping / keepalive
//!
//! `seq` is an optional monotonic per-session counter emitted by the
//! current C# bridge (one increment per tick). When absent — older
//! Bridge builds — the parser falls back to 0. Tick-based timeframes
//! (100T, …) require the bridge to emit `seq`; time-based timeframes
//! work either way.
//!
//! See `desktop/scripts/ninjatrader/OrderflowBridge.cs` for the producer.

use crate::connectors::tick::{Side, Tick};

#[derive(Debug, Clone, PartialEq)]
pub struct BridgeMeta {
    pub symbol: String,
    pub tick_size: f64,
    pub n_historical: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DailyVolume {
    pub timestamp_ns: u64,
    pub volume: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum BridgeMessage {
    Meta(BridgeMeta),
    Historical(Tick),
    EndOfHistory,
    Live(Tick),
    DailyVolume(DailyVolume),
    Ping,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("empty line")]
    Empty,
    #[error("unknown message type: {0:?}")]
    UnknownType(char),
    #[error("missing field at position {0}")]
    MissingField(usize),
    #[error("invalid number in field {field}: {source}")]
    InvalidNumber {
        field: &'static str,
        #[source]
        source: std::num::ParseFloatError,
    },
    #[error("invalid integer in field {field}: {source}")]
    InvalidInteger {
        field: &'static str,
        #[source]
        source: std::num::ParseIntError,
    },
    #[error("invalid side value: {0} (expected 0 or 1)")]
    InvalidSide(u8),
    #[error("invalid tick_size: {0} (must be strictly positive and finite)")]
    InvalidTickSize(f64),
}

pub fn parse_line(line: &str) -> Result<BridgeMessage, ParseError> {
    let line = line.trim_end_matches('\r');
    if line.is_empty() {
        return Err(ParseError::Empty);
    }

    let first_char = line.as_bytes()[0] as char;
    let rest = if line.len() > 1 { &line[1..] } else { "" };

    match first_char {
        'M' => parse_meta(rest),
        'H' => parse_tick(rest).map(BridgeMessage::Historical),
        'L' => parse_tick(rest).map(BridgeMessage::Live),
        'V' => parse_daily_volume(rest).map(BridgeMessage::DailyVolume),
        'E' => Ok(BridgeMessage::EndOfHistory),
        'P' => Ok(BridgeMessage::Ping),
        c => Err(ParseError::UnknownType(c)),
    }
}

fn parse_daily_volume(rest: &str) -> Result<DailyVolume, ParseError> {
    // Expected: ,<ts_ns>,<volume>
    let mut parts = rest.splitn(3, ',');
    let _leading_comma = parts.next().ok_or(ParseError::MissingField(0))?;
    let ts_s = parts.next().ok_or(ParseError::MissingField(1))?;
    let vol_s = parts.next().ok_or(ParseError::MissingField(2))?;

    let timestamp_ns: u64 = ts_s.parse().map_err(|e| ParseError::InvalidInteger {
        field: "ts_ns",
        source: e,
    })?;
    let volume: u64 = vol_s.parse().map_err(|e| ParseError::InvalidInteger {
        field: "volume",
        source: e,
    })?;

    Ok(DailyVolume {
        timestamp_ns,
        volume,
    })
}

fn parse_meta(rest: &str) -> Result<BridgeMessage, ParseError> {
    // Expected: ,<symbol>,<tick_size>,<n_historical>
    let mut parts = rest.splitn(4, ',');
    let _leading_comma = parts.next().ok_or(ParseError::MissingField(0))?;
    let symbol = parts.next().ok_or(ParseError::MissingField(1))?.to_string();
    let tick_size_s = parts.next().ok_or(ParseError::MissingField(2))?;
    let n_hist_s = parts.next().ok_or(ParseError::MissingField(3))?;

    let tick_size: f64 = tick_size_s.parse().map_err(|e| ParseError::InvalidNumber {
        field: "tick_size",
        source: e,
    })?;
    // A non-positive or non-finite tick_size would cascade as NaN /
    // division-by-zero in the engine's `round_to_tick`. A real NT
    // instrument cannot report this, so refuse the stream at the
    // boundary rather than corrupt every downstream bar.
    if !tick_size.is_finite() || tick_size <= 0.0 {
        return Err(ParseError::InvalidTickSize(tick_size));
    }
    let n_historical: u64 = n_hist_s.parse().map_err(|e| ParseError::InvalidInteger {
        field: "n_historical",
        source: e,
    })?;

    Ok(BridgeMessage::Meta(BridgeMeta {
        symbol,
        tick_size,
        n_historical,
    }))
}

fn parse_tick(rest: &str) -> Result<Tick, ParseError> {
    // Expected: ,<ts_ns>,<price>,<qty>,<side>[,<seq>]
    // The trailing seq is optional so we stay compatible with any
    // OrderflowBridge.cs build older than the one that started
    // emitting it. When absent, seq defaults to 0 — the engine will
    // still aggregate time-based timeframes correctly; only tick-
    // based timeframes (100T, …) require a non-zero seq.
    let mut parts = rest.splitn(6, ',');
    let _leading_comma = parts.next().ok_or(ParseError::MissingField(0))?;
    let ts_s = parts.next().ok_or(ParseError::MissingField(1))?;
    let price_s = parts.next().ok_or(ParseError::MissingField(2))?;
    let qty_s = parts.next().ok_or(ParseError::MissingField(3))?;
    let side_s = parts.next().ok_or(ParseError::MissingField(4))?;
    let seq_opt = parts.next();

    let timestamp_ns: u64 = ts_s.parse().map_err(|e| ParseError::InvalidInteger {
        field: "ts_ns",
        source: e,
    })?;
    let price: f64 = price_s.parse().map_err(|e| ParseError::InvalidNumber {
        field: "price",
        source: e,
    })?;
    let qty: f64 = qty_s.parse().map_err(|e| ParseError::InvalidNumber {
        field: "qty",
        source: e,
    })?;
    let side_n: u8 = side_s.parse().map_err(|e| ParseError::InvalidInteger {
        field: "side",
        source: e,
    })?;
    let side = match side_n {
        0 => Side::Buy,
        1 => Side::Sell,
        n => return Err(ParseError::InvalidSide(n)),
    };
    let seq: u64 = match seq_opt {
        Some(s) => s.parse().map_err(|e| ParseError::InvalidInteger {
            field: "seq",
            source: e,
        })?,
        None => 0,
    };

    Ok(Tick {
        timestamp_ns,
        price,
        qty,
        side,
        // symbol + source are filled in by the reader once Meta is known.
        symbol: String::new(),
        source: String::new(),
        seq,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_meta() {
        let m = parse_line("M,MNQ 06-26,0.25000000,751015").unwrap();
        assert_eq!(
            m,
            BridgeMessage::Meta(BridgeMeta {
                symbol: "MNQ 06-26".into(),
                tick_size: 0.25,
                n_historical: 751015,
            })
        );
    }

    #[test]
    fn parses_historical_buy() {
        // 5-field form (legacy Bridge without seq) — seq defaults to 0.
        let m = parse_line("H,1779660000084000000,29675.7500,221,0").unwrap();
        match m {
            BridgeMessage::Historical(t) => {
                assert_eq!(t.timestamp_ns, 1779660000084000000);
                assert_eq!(t.price, 29675.75);
                assert_eq!(t.qty, 221.0);
                assert_eq!(t.side, Side::Buy);
                assert_eq!(t.seq, 0);
            }
            _ => panic!("expected Historical"),
        }
    }

    #[test]
    fn parses_historical_with_seq() {
        let m = parse_line("H,1779660000084000000,29675.7500,221,0,42").unwrap();
        match m {
            BridgeMessage::Historical(t) => {
                assert_eq!(t.seq, 42);
                assert_eq!(t.side, Side::Buy);
            }
            _ => panic!("expected Historical"),
        }
    }

    #[test]
    fn parses_live_with_seq() {
        let m = parse_line("L,1779700000123456789,29680.2500,3,1,1001").unwrap();
        match m {
            BridgeMessage::Live(t) => {
                assert_eq!(t.seq, 1001);
                assert_eq!(t.side, Side::Sell);
            }
            _ => panic!("expected Live"),
        }
    }

    #[test]
    fn parses_historical_sell() {
        let m = parse_line("H,1779660000100000000,29674.7500,1,1").unwrap();
        match m {
            BridgeMessage::Historical(t) => assert_eq!(t.side, Side::Sell),
            _ => panic!("expected Historical"),
        }
    }

    #[test]
    fn parses_live() {
        let m = parse_line("L,1779700000123456789,29680.2500,3,0").unwrap();
        match m {
            BridgeMessage::Live(t) => {
                assert_eq!(t.timestamp_ns, 1779700000123456789);
                assert_eq!(t.price, 29680.25);
                assert_eq!(t.qty, 3.0);
                assert_eq!(t.side, Side::Buy);
            }
            _ => panic!("expected Live"),
        }
    }

    #[test]
    fn parses_end_of_history() {
        assert_eq!(parse_line("E").unwrap(), BridgeMessage::EndOfHistory);
    }

    #[test]
    fn parses_ping() {
        assert_eq!(parse_line("P").unwrap(), BridgeMessage::Ping);
    }

    #[test]
    fn parses_daily_volume() {
        let m = parse_line("V,1779700000000000000,355478").unwrap();
        assert_eq!(
            m,
            BridgeMessage::DailyVolume(DailyVolume {
                timestamp_ns: 1779700000000000000,
                volume: 355478,
            })
        );
    }

    #[test]
    fn rejects_malformed_daily_volume() {
        // Missing volume field.
        assert!(parse_line("V,1779700000000000000").is_err());
        // Non-numeric volume.
        assert!(matches!(
            parse_line("V,1779700000000000000,abc"),
            Err(ParseError::InvalidInteger { field: "volume", .. })
        ));
    }

    #[test]
    fn strips_trailing_cr() {
        // PowerShell on Windows sometimes leaves \r in line endings
        assert_eq!(parse_line("E\r").unwrap(), BridgeMessage::EndOfHistory);
    }

    #[test]
    fn rejects_empty() {
        assert!(matches!(parse_line(""), Err(ParseError::Empty)));
    }

    #[test]
    fn rejects_unknown_type() {
        assert!(matches!(
            parse_line("X,1,2,3"),
            Err(ParseError::UnknownType('X'))
        ));
    }

    #[test]
    fn rejects_invalid_side() {
        assert!(matches!(
            parse_line("H,1,2,3,9"),
            Err(ParseError::InvalidSide(9))
        ));
    }

    #[test]
    fn rejects_malformed_tick() {
        assert!(parse_line("H,1,2").is_err());
    }

    #[test]
    fn rejects_zero_tick_size() {
        // Zero would cascade as div-by-zero / NaN in round_to_tick.
        assert!(matches!(
            parse_line("M,X,0,1"),
            Err(ParseError::InvalidTickSize(z)) if z == 0.0
        ));
    }

    #[test]
    fn rejects_negative_tick_size() {
        assert!(matches!(
            parse_line("M,X,-0.25,1"),
            Err(ParseError::InvalidTickSize(_))
        ));
    }

    #[test]
    fn rejects_invalid_price() {
        assert!(matches!(
            parse_line("L,1,notanumber,1,0"),
            Err(ParseError::InvalidNumber { field: "price", .. })
        ));
    }
}
