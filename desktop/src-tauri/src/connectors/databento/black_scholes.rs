//! Black-Scholes European option pricing, IV bisection, and Greeks.
//! Used to compute Greeks from raw OPRA market prices when the data
//! provider (Databento) supplies bid/ask but not pre-computed Greeks.

use std::f64::consts::PI;

/// Standard normal PDF.
#[inline]
fn norm_pdf(x: f64) -> f64 {
    (-0.5 * x * x).exp() / (2.0 * PI).sqrt()
}

/// Standard normal CDF — Abramowitz & Stegun 26.2.17 approximation.
/// Max absolute error < 7.5e-8.
pub fn norm_cdf(x: f64) -> f64 {
    if x < 0.0 {
        return 1.0 - norm_cdf(-x);
    }
    let t = 1.0 / (1.0 + 0.231_641_9 * x);
    let poly = t * (0.319_381_530
        + t * (-0.356_563_782
        + t * (1.781_477_937
        + t * (-1.821_255_978
        + t * 1.330_274_429))));
    1.0 - norm_pdf(x) * poly
}

/// Black-Scholes European option price.
///
/// - `s`      — spot price
/// - `k`      — strike price
/// - `t`      — time to expiry in years (> 0)
/// - `r`      — continuous risk-free rate
/// - `q`      — continuous dividend yield
/// - `sigma`  — annualised implied volatility (> 0)
/// - `is_call`— true = call, false = put
pub fn bs_price(s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64, is_call: bool) -> f64 {
    if t <= 0.0 || sigma <= 0.0 || s <= 0.0 || k <= 0.0 {
        return 0.0;
    }
    let sqrt_t = t.sqrt();
    let d1 = ((s / k).ln() + (r - q + 0.5 * sigma * sigma) * t) / (sigma * sqrt_t);
    let d2 = d1 - sigma * sqrt_t;
    let df = (-r * t).exp();
    let dq = (-q * t).exp();
    if is_call {
        s * dq * norm_cdf(d1) - k * df * norm_cdf(d2)
    } else {
        k * df * norm_cdf(-d2) - s * dq * norm_cdf(-d1)
    }
}

/// Option Greeks computed analytically from a known IV.
#[derive(Debug, Clone, Copy)]
pub struct Greeks {
    pub iv: f64,
    /// Price sensitivity to a $1 move in the underlying.
    pub delta: f64,
    /// Delta sensitivity to a $1 move (curvature). Key input for GEX.
    pub gamma: f64,
    /// Time decay per calendar day (negative for long options).
    pub theta: f64,
    /// Sensitivity to 1% change in IV.
    pub vega: f64,
}

/// Compute Greeks analytically from a known IV.
pub fn greeks_from_vol(
    s: f64, k: f64, t: f64, r: f64, q: f64, sigma: f64, is_call: bool,
) -> Greeks {
    if t <= 0.0 || sigma <= 0.0 {
        return Greeks { iv: sigma, delta: 0.0, gamma: 0.0, theta: 0.0, vega: 0.0 };
    }
    let sqrt_t = t.sqrt();
    let d1 = ((s / k).ln() + (r - q + 0.5 * sigma * sigma) * t) / (sigma * sqrt_t);
    let d2 = d1 - sigma * sqrt_t;
    let df  = (-r * t).exp();
    let dq  = (-q * t).exp();
    let nd1 = norm_pdf(d1);

    let delta = if is_call { dq * norm_cdf(d1) } else { -dq * norm_cdf(-d1) };
    let gamma = dq * nd1 / (s * sigma * sqrt_t);
    // Theta per calendar day
    let theta = (
        -(s * dq * nd1 * sigma) / (2.0 * sqrt_t)
        - r * k * df * (if is_call { norm_cdf(d2) } else { -norm_cdf(-d2) })
        + q * s * dq * (if is_call { norm_cdf(d1) } else { -norm_cdf(-d1) })
    ) / 365.0;
    let vega = s * dq * nd1 * sqrt_t / 100.0; // per 1% vol change

    Greeks { iv: sigma, delta, gamma, theta, vega }
}

/// Implied volatility via bisection (100 iterations, ε = 1e-6 in price).
/// Returns None when the market price is below intrinsic value or
/// the solution falls outside [0.01%, 500%] IV range.
pub fn implied_vol(
    market_price: f64,
    s: f64, k: f64, t: f64, r: f64, q: f64,
    is_call: bool,
) -> Option<f64> {
    if t <= 0.0 || market_price <= 0.0 {
        return None;
    }
    // Reject below-intrinsic prices (minus a small tolerance)
    let intrinsic = if is_call {
        (s * (-q * t).exp() - k * (-r * t).exp()).max(0.0)
    } else {
        (k * (-r * t).exp() - s * (-q * t).exp()).max(0.0)
    };
    if market_price < intrinsic - 0.02 {
        return None;
    }

    let mut lo = 1e-4_f64;
    let mut hi = 5.0_f64; // 500% IV cap

    // Bracket check — if even 500% vol can't reach the market price, give up.
    if bs_price(s, k, t, r, q, hi, is_call) < market_price {
        return None;
    }

    for _ in 0..100 {
        let mid = (lo + hi) * 0.5;
        let p = bs_price(s, k, t, r, q, mid, is_call);
        if (p - market_price).abs() < 1e-6 || (hi - lo) < 1e-8 {
            return Some(mid);
        }
        if p < market_price { lo = mid; } else { hi = mid; }
    }
    Some((lo + hi) * 0.5)
}

/// Convenience: compute full Greeks from a market mid-price.
/// Returns None when IV computation fails (deep OTM/ITM, zero bid).
pub fn compute_greeks(
    market_price: f64,
    s: f64, k: f64, t: f64, r: f64, q: f64,
    is_call: bool,
) -> Option<Greeks> {
    let iv = implied_vol(market_price, s, k, t, r, q, is_call)?;
    Some(greeks_from_vol(s, k, t, r, q, iv, is_call))
}
