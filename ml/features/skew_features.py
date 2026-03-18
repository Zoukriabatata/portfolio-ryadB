"""
Volatility Skew Feature Engineering
────────────────────────────────────────────────────────────────────────────
Theory (Han 2008 — Investor Sentiment and Option Prices):
  The slope of the IV smile reflects aggregate investor sentiment.
    • Steep negative skew (puts > calls) → bearish hedging demand, fear
    • Flat / positive skew             → bullish positioning, FOMO
    • Changes in skew lead price        → information flow from options market

Theory (Spatt & Ernst — Market Microstructure):
  IV term structure encodes market's expectations about future vol:
    • Backwardation (short-term IV > long-term) → near-term fear / event
    • Contango       (long-term IV > short-term) → normal uncertainty premium

The 25-delta risk reversal (RR25) is the standard skew measure:
    RR25 = IV(25Δ call) - IV(25Δ put)
"""

import numpy as np
import pandas as pd
from typing import Optional


# ─── Risk Reversal & Skew ────────────────────────────────────────────────────

def compute_risk_reversal(
    iv_call_25d: float,
    iv_put_25d:  float,
) -> float:
    """
    25-delta risk reversal.
    Positive → call skew (bullish), Negative → put skew (bearish).
    """
    return iv_call_25d - iv_put_25d


def compute_butterfly(
    iv_call_25d: float,
    iv_put_25d:  float,
    iv_atm:      float,
) -> float:
    """
    25-delta butterfly spread.
    Measures smile curvature (how expensive wings are vs ATM).
    High butterfly → market expects fat tails.
    """
    return 0.5 * (iv_call_25d + iv_put_25d) - iv_atm


def compute_smile_slope(
    strikes:    np.ndarray,
    iv_surface: np.ndarray,
    spot:       float,
) -> float:
    """
    Linear slope of the IV smile around ATM (log-moneyness).
    Negative slope → left skew (standard for equity/index).
    """
    log_m = np.log(strikes / spot)                     # log-moneyness
    # Only use near-ATM strikes (±20%)
    mask  = np.abs(log_m) < 0.20
    if mask.sum() < 2:
        return 0.0
    slope = np.polyfit(log_m[mask], iv_surface[mask], 1)[0]
    return float(slope)


# ─── Term Structure ──────────────────────────────────────────────────────────

def compute_term_structure_slope(
    expiry_days: np.ndarray,
    atm_ivs:     np.ndarray,
) -> float:
    """
    Slope of IV vs time-to-expiry.
    Negative → backwardation (short-term fear elevated)
    Positive → contango (normal)
    """
    if len(expiry_days) < 2:
        return 0.0
    slope = np.polyfit(np.log(expiry_days + 1), atm_ivs, 1)[0]
    return float(slope)


def compute_vix_like_index(
    expiry_days: np.ndarray,
    atm_ivs:     np.ndarray,
    target_days: float = 30.0,
) -> float:
    """
    Interpolate to a constant 30-day IV (VIX-like).
    Uses log-linear interpolation between nearest expiries.
    """
    idx  = np.argsort(expiry_days)
    days = np.array(expiry_days)[idx]
    ivs  = np.array(atm_ivs)[idx]

    if len(days) == 1:
        return float(ivs[0])

    # Clamp to available range
    if target_days <= days[0]:
        return float(ivs[0])
    if target_days >= days[-1]:
        return float(ivs[-1])

    for i in range(len(days) - 1):
        if days[i] <= target_days <= days[i + 1]:
            # Log-linear interpolation
            w = (np.log(target_days) - np.log(days[i])) / (np.log(days[i + 1]) - np.log(days[i]))
            return float(ivs[i] * (1 - w) + ivs[i + 1] * w)

    return float(ivs[-1])


# ─── Aggregate skew features ─────────────────────────────────────────────────

def extract_skew_features(
    iv_call_25d:     float,
    iv_put_25d:      float,
    iv_atm:          float,
    spot:            float,
    strikes:         Optional[np.ndarray] = None,
    iv_surface:      Optional[np.ndarray] = None,
    expiry_days:     Optional[np.ndarray] = None,
    atm_ivs_by_exp:  Optional[np.ndarray] = None,
    lookback_rr25:   Optional[pd.Series]  = None,
) -> dict:
    """
    Compute all skew-related features for ML input.

    Returns dict with:
        rr25               – 25-delta risk reversal
        butterfly_25d      – 25-delta butterfly
        smile_slope        – slope of IV smile (if surface provided)
        term_slope         – term structure slope (if multi-expiry provided)
        iv30               – constant 30-day IV
        iv_atm             – ATM IV
        skew_z_score       – (rr25 - mean) / std over lookback
        skew_roc_1         – change in rr25 vs 1 period ago
        skew_roc_5         – change in rr25 vs 5 periods ago
        put_premium        – relative cost of puts vs ATM: (IV_put25 - IV_atm)/IV_atm
        sentiment_regime   – -1 bearish / 0 neutral / 1 bullish
    """
    features: dict = {}

    rr25 = compute_risk_reversal(iv_call_25d, iv_put_25d)
    features['rr25']          = rr25
    features['butterfly_25d'] = compute_butterfly(iv_call_25d, iv_put_25d, iv_atm)
    features['iv_atm']        = iv_atm
    features['put_premium']   = (iv_put_25d - iv_atm) / (iv_atm + 1e-9)

    # Optional: full smile slope
    if strikes is not None and iv_surface is not None:
        features['smile_slope'] = compute_smile_slope(strikes, iv_surface, spot)
    else:
        features['smile_slope'] = rr25 / (iv_atm + 1e-9)   # proxy

    # Optional: term structure
    if expiry_days is not None and atm_ivs_by_exp is not None:
        features['term_slope'] = compute_term_structure_slope(expiry_days, atm_ivs_by_exp)
        features['iv30']       = compute_vix_like_index(expiry_days, atm_ivs_by_exp)
    else:
        features['term_slope'] = 0.0
        features['iv30']       = iv_atm

    # Historical momentum features
    if lookback_rr25 is not None and len(lookback_rr25) >= 20:
        mu    = lookback_rr25.mean()
        sigma = lookback_rr25.std() + 1e-9
        features['skew_z_score'] = (rr25 - mu) / sigma
        features['skew_roc_1']   = rr25 - lookback_rr25.iloc[-1]
        features['skew_roc_5']   = rr25 - lookback_rr25.iloc[-5] if len(lookback_rr25) >= 5 else 0.0
    else:
        features['skew_z_score'] = 0.0
        features['skew_roc_1']   = 0.0
        features['skew_roc_5']   = 0.0

    # Sentiment regime classification
    # Based on Han (2008): extreme skew values are predictive
    if rr25 < -5.0:
        features['sentiment_regime'] = -1   # bearish fear premium
    elif rr25 > 2.0:
        features['sentiment_regime'] =  1   # bullish FOMO
    else:
        features['sentiment_regime'] =  0   # neutral

    return features
