//! Pure GEX compute: aggregate per strike across expirations, derive
//! Zero Gamma / Call Wall / Put Wall, and extract an OTM-only IV
//! smile per expiration from the same chains.
//!
//! Convention (SpotGamma-style, ETF multiplier = 100):
//!   gex_call_strike = OI × gamma × 100 × spot² × 0.01
//!   gex_put_strike  = -OI × gamma × 100 × spot² × 0.01
//!   net_gex_strike  = sum across all expirations
//!   zero_gamma      = strike where cumulative-from-bottom net_gex
//!                     crosses 0 (linear interpolation)
//!   call_wall       = strike > spot with max net_gex (call-dominant)
//!   put_wall        = strike < spot with min net_gex (put-dominant)

use std::collections::BTreeMap;

use serde::Serialize;

use crate::connectors::alpaca::options::OptionChain;

const MULTIPLIER: f64 = 100.0; // SPY / QQQ ETF options

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexSnapshot {
    pub symbol: String,
    pub spot: f64,
    pub computed_at: String,
    pub expiration_count: u32,
    pub strikes: Vec<GexStrike>,
    pub zero_gamma: Option<f64>,
    pub call_wall: Option<f64>,
    pub put_wall: Option<f64>,
    pub total_gex: f64,
    pub stale: bool,
    pub iv_smiles: Vec<IvSmile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GexStrike {
    pub strike: f64,
    pub call_gex: f64,
    pub put_gex: f64,
    pub net_gex: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvSmile {
    pub expiration: String,
    pub days_to_expiry: u32,
    pub points: Vec<IvPoint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IvPoint {
    pub strike: f64,
    pub iv: f64,
    pub side: IvSide,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum IvSide {
    Put,
    Call,
}

/// Days from `today_unix_secs` until `expiration` (ISO "YYYY-MM-DD").
/// Returns 0 if expiration is unparseable or in the past.
fn days_to_expiry(today_unix_secs: i64, expiration: &str) -> u32 {
    let parts: Vec<&str> = expiration.split('-').collect();
    if parts.len() != 3 {
        return 0;
    }
    let y: i32 = parts[0].parse().unwrap_or(0);
    let m: u32 = parts[1].parse().unwrap_or(0);
    let d: u32 = parts[2].parse().unwrap_or(0);
    if y == 0 || m == 0 || d == 0 {
        return 0;
    }
    // Hinnant days_from_civil
    let yc = if m <= 2 { y - 1 } else { y };
    let era = (if yc >= 0 { yc } else { yc - 399 }) / 400;
    let yoe = (yc - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era as i64 * 146_097 + doe as i64 - 719_468;
    let expiry_secs = days * 86_400;
    let diff = expiry_secs - today_unix_secs;
    if diff <= 0 {
        0
    } else {
        (diff / 86_400) as u32
    }
}

/// Build a `GexSnapshot` from the symbol + spot + a list of
/// (expiration, chain) pairs. Pure function — no I/O.
pub fn compute_gex(
    symbol: &str,
    spot: f64,
    chains: &[OptionChain],
    computed_at: String,
    today_unix_secs: i64,
) -> GexSnapshot {
    let spot_sq = spot * spot;
    let mut by_strike: BTreeMap<u64, (f64, f64)> = BTreeMap::new();
    let mut iv_smiles: Vec<IvSmile> = Vec::with_capacity(chains.len());

    let key = |s: f64| -> u64 { (s * 1000.0).round() as u64 };

    for chain in chains {
        // ─── GEX aggregation ───
        for c in &chain.calls {
            if let Some(g) = c.gamma {
                let contribution = c.open_interest as f64 * g * MULTIPLIER * spot_sq * 0.01;
                by_strike.entry(key(c.strike)).or_insert((0.0, 0.0)).0 += contribution;
            }
        }
        for p in &chain.puts {
            if let Some(g) = p.gamma {
                let contribution =
                    -(p.open_interest as f64) * g * MULTIPLIER * spot_sq * 0.01;
                by_strike.entry(key(p.strike)).or_insert((0.0, 0.0)).1 += contribution;
            }
        }

        // ─── IV smile (OTM-only) ───
        let mut points: Vec<IvPoint> = Vec::new();
        let mut puts_by_k: BTreeMap<u64, &crate::connectors::alpaca::options::OptionLeg> =
            BTreeMap::new();
        for p in &chain.puts {
            puts_by_k.insert(key(p.strike), p);
        }
        let mut calls_by_k: BTreeMap<u64, &crate::connectors::alpaca::options::OptionLeg> =
            BTreeMap::new();
        for c in &chain.calls {
            calls_by_k.insert(key(c.strike), c);
        }
        let mut all_strikes: Vec<u64> =
            puts_by_k.keys().chain(calls_by_k.keys()).copied().collect();
        all_strikes.sort();
        all_strikes.dedup();
        for k in all_strikes {
            let strike = k as f64 / 1000.0;
            if strike < spot {
                if let Some(p) = puts_by_k.get(&k) {
                    if let Some(iv) = p.iv {
                        points.push(IvPoint {
                            strike,
                            iv,
                            side: IvSide::Put,
                        });
                    }
                }
            } else if let Some(c) = calls_by_k.get(&k) {
                if let Some(iv) = c.iv {
                    points.push(IvPoint {
                        strike,
                        iv,
                        side: IvSide::Call,
                    });
                }
            }
        }
        iv_smiles.push(IvSmile {
            expiration: chain.expiration.clone(),
            days_to_expiry: days_to_expiry(today_unix_secs, &chain.expiration),
            points,
        });
    }

    let mut strikes: Vec<GexStrike> = by_strike
        .into_iter()
        .map(|(k, (call_gex, put_gex))| GexStrike {
            strike: k as f64 / 1000.0,
            call_gex,
            put_gex,
            net_gex: call_gex + put_gex,
        })
        .collect();
    strikes.sort_by(|a, b| {
        a.strike
            .partial_cmp(&b.strike)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let total_gex: f64 = strikes.iter().map(|s| s.net_gex).sum();

    // Zero Gamma — cumul from bottom, find sign-change. Only meaningful
    // if there's actual gex movement; if all strikes have net_gex == 0
    // (e.g. open interest missing), we skip rather than report a false
    // positive at the first strike.
    let zero_gamma: Option<f64> = if total_gex.abs() < 1e-9 && strikes.iter().all(|s| s.net_gex.abs() < 1e-9) {
        None
    } else {
        let mut found: Option<f64> = None;
        let mut cumul = 0.0;
        let mut prev: Option<(f64, f64)> = None;
        for s in &strikes {
            let next_cumul = cumul + s.net_gex;
            if let Some((prev_strike, prev_cumul)) = prev {
                let crosses = (prev_cumul < 0.0 && next_cumul >= 0.0)
                    || (prev_cumul > 0.0 && next_cumul <= 0.0);
                if crosses {
                    let denom = next_cumul - prev_cumul;
                    let zg = if denom.abs() < 1e-9 {
                        s.strike
                    } else {
                        prev_strike + (s.strike - prev_strike) * (-prev_cumul) / denom
                    };
                    found = Some(zg);
                    break;
                }
            }
            prev = Some((s.strike, next_cumul));
            cumul = next_cumul;
        }
        found
    };

    let call_wall = strikes
        .iter()
        .filter(|s| s.strike > spot && s.net_gex > 0.0)
        .max_by(|a, b| {
            a.net_gex
                .partial_cmp(&b.net_gex)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|s| s.strike);
    let put_wall = strikes
        .iter()
        .filter(|s| s.strike < spot && s.net_gex < 0.0)
        .min_by(|a, b| {
            a.net_gex
                .partial_cmp(&b.net_gex)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|s| s.strike);

    GexSnapshot {
        symbol: symbol.to_string(),
        spot,
        computed_at,
        expiration_count: chains.len() as u32,
        strikes,
        zero_gamma,
        call_wall,
        put_wall,
        total_gex,
        stale: false,
        iv_smiles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::alpaca::options::{OptionChain, OptionLeg};

    fn leg(strike: f64, oi: u64, gamma: Option<f64>, iv: Option<f64>) -> OptionLeg {
        OptionLeg {
            strike,
            open_interest: oi,
            gamma,
            iv,
        }
    }

    #[test]
    fn put_gex_is_negative_call_gex_is_positive() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![leg(500.0, 1000, Some(0.01), Some(0.18))],
            puts: vec![leg(500.0, 1000, Some(0.01), Some(0.20))],
        };
        let snap = compute_gex(
            "SPY",
            500.0,
            &[chain],
            "2026-05-18T12:00:00Z".into(),
            1779451200,
        );
        assert_eq!(snap.strikes.len(), 1);
        assert!(snap.strikes[0].call_gex > 0.0);
        assert!(snap.strikes[0].put_gex < 0.0);
    }

    #[test]
    fn call_wall_is_strike_above_spot_with_max_net_gex() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![
                leg(500.0, 1000, Some(0.01), None),
                leg(510.0, 5000, Some(0.01), None),
                leg(520.0, 500, Some(0.01), None),
            ],
            puts: vec![],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.call_wall, Some(510.0));
    }

    #[test]
    fn put_wall_is_strike_below_spot_with_min_net_gex() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![],
            puts: vec![
                leg(495.0, 500, Some(0.01), None),
                leg(490.0, 5000, Some(0.01), None),
                leg(485.0, 1000, Some(0.01), None),
            ],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.put_wall, Some(490.0));
    }

    #[test]
    fn iv_smile_uses_put_below_spot_call_above_spot() {
        let chain = OptionChain {
            expiration: "2026-06-06".into(),
            calls: vec![
                leg(495.0, 100, Some(0.01), Some(0.25)),
                leg(505.0, 100, Some(0.01), Some(0.18)),
            ],
            puts: vec![
                leg(495.0, 100, Some(0.01), Some(0.22)),
                leg(505.0, 100, Some(0.01), Some(0.30)),
            ],
        };
        let snap = compute_gex("SPY", 500.0, &[chain], "now".into(), 0);
        assert_eq!(snap.iv_smiles.len(), 1);
        let pts = &snap.iv_smiles[0].points;
        let p495 = pts
            .iter()
            .find(|p| (p.strike - 495.0).abs() < 0.01)
            .unwrap();
        assert!(matches!(p495.side, IvSide::Put));
        assert!((p495.iv - 0.22).abs() < 1e-9);
        let p505 = pts
            .iter()
            .find(|p| (p.strike - 505.0).abs() < 0.01)
            .unwrap();
        assert!(matches!(p505.side, IvSide::Call));
        assert!((p505.iv - 0.18).abs() < 1e-9);
    }
}
