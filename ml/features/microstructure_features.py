"""
Market Microstructure Feature Engineering
────────────────────────────────────────────────────────────────────────────
Theory (Spatt & Ernst — Market Microstructure):
  Price impact, bid-ask spread, and trade intensity reflect the information
  content of order flow. Wider spreads → higher adverse selection risk.
  Kyle's lambda measures price impact per unit of order flow.

Theory (Hasbrouck — Empirical Market Microstructure):
  - Roll's spread estimator: infers spread from price autocorrelation
  - Amihud illiquidity ratio: |return| / volume → impact per dollar traded
  - These proxy the information environment around each trade

For options specifically:
  - Wide spreads → uncertainty, elevated IV, event risk
  - High Amihud → low liquidity, more slippage risk for large orders
"""

import numpy as np
import pandas as pd
from typing import Optional


# ─── Spread estimators ───────────────────────────────────────────────────────

def roll_spread(prices: np.ndarray) -> float:
    """
    Roll (1984) effective spread estimator.
    Estimates bid-ask spread from negative serial covariance of price changes.

    Formula: Spread = 2 * sqrt(-Cov(ΔP_t, ΔP_{t-1}))
    Negative covariance arises from bid-ask bounce.
    """
    if len(prices) < 3:
        return 0.0
    diffs = np.diff(prices)
    cov   = np.cov(diffs[1:], diffs[:-1])[0, 1]
    return 2.0 * np.sqrt(max(-cov, 0.0))


def quoted_spread(bid: float, ask: float) -> float:
    """Quoted (absolute) bid-ask spread."""
    return ask - bid


def relative_spread(bid: float, ask: float) -> float:
    """Quoted spread as fraction of mid-price."""
    mid = (bid + ask) / 2.0
    return (ask - bid) / (mid + 1e-9)


# ─── Price impact ─────────────────────────────────────────────────────────────

def amihud_illiquidity(
    returns:  np.ndarray,
    volumes:  np.ndarray,
    scale:    float = 1e6,
) -> float:
    """
    Amihud (2002) illiquidity ratio.
    Higher value → more price impact per dollar of volume.

    ILLIQ = mean(|r_t| / VolumeInDollars_t) * scale
    """
    if len(returns) == 0 or len(volumes) == 0:
        return 0.0
    mask = volumes > 0
    if not mask.any():
        return 0.0
    ratios = np.abs(returns[mask]) / volumes[mask]
    return float(np.mean(ratios) * scale)


def kyle_lambda(
    price_changes:  np.ndarray,
    signed_volumes: np.ndarray,
) -> float:
    """
    Kyle's lambda: price impact coefficient.
    Estimated via OLS: ΔP = λ * Q + ε

    Higher lambda → more price impact per unit of signed order flow.
    Signature of informed trading.
    """
    if len(price_changes) < 5 or len(signed_volumes) < 5:
        return 0.0
    # Simple OLS
    X = signed_volumes.reshape(-1, 1)
    y = price_changes
    try:
        lam = np.linalg.lstsq(
            np.column_stack([np.ones(len(X)), X]), y, rcond=None
        )[0][1]
        return float(max(lam, 0.0))
    except Exception:
        return 0.0


# ─── Trade intensity ─────────────────────────────────────────────────────────

def trade_rate(
    trade_timestamps: pd.Series,
    window_seconds:   float = 60.0,
) -> float:
    """
    Number of trades per unit time in recent window.
    High trade rate → increased activity, potential information event.
    """
    if len(trade_timestamps) < 2:
        return 0.0
    now   = trade_timestamps.iloc[-1]
    cutoff = now - pd.Timedelta(seconds=window_seconds)
    count = (trade_timestamps >= cutoff).sum()
    return float(count) / window_seconds


def avg_trade_size(
    volumes: np.ndarray,
) -> float:
    """Average size of trades. Large avg size → institutional activity."""
    return float(np.mean(volumes)) if len(volumes) > 0 else 0.0


# ─── Realized volatility ─────────────────────────────────────────────────────

def realized_volatility(
    returns:      np.ndarray,
    annualize:    bool  = True,
    periods_year: float = 252 * 6.5 * 60,  # minute-bars in a year
) -> float:
    """
    Realized vol from high-frequency returns (e.g., 1-min bars).
    RV = sqrt(sum(r_t^2)) * sqrt(periods_year) if annualized.
    """
    if len(returns) == 0:
        return 0.0
    rv = float(np.sqrt(np.sum(np.square(returns))))
    if annualize:
        rv *= np.sqrt(periods_year / len(returns))
    return rv


def vol_of_vol(
    rv_series: pd.Series,
) -> float:
    """
    Volatility of realized volatility.
    High VoV → regime uncertainty, harder to hedge.
    """
    return float(rv_series.std()) if len(rv_series) >= 5 else 0.0


# ─── Aggregate microstructure features ───────────────────────────────────────

def extract_microstructure_features(
    prices:            np.ndarray,
    volumes:           np.ndarray,
    bids:              Optional[np.ndarray] = None,
    asks:              Optional[np.ndarray] = None,
    signed_volumes:    Optional[np.ndarray] = None,
    trade_timestamps:  Optional[pd.Series]  = None,
    rv_lookback:       Optional[pd.Series]  = None,
) -> dict:
    """
    Compute all microstructure features for ML input.

    Returns dict with:
        roll_spread          – inferred spread from price autocorrelation
        quoted_spread        – current bid-ask spread (if available)
        relative_spread      – spread / mid
        amihud               – illiquidity ratio
        kyle_lambda          – price impact coefficient
        trade_rate           – trades per second in last 60s
        avg_trade_size       – mean volume per trade
        realized_vol         – annualized realized volatility
        vol_of_vol           – volatility of realized volatility
        liquidity_score      – composite [0,1] (1 = liquid)
    """
    features: dict = {}

    # Returns
    returns = np.diff(np.log(prices + 1e-9)) if len(prices) > 1 else np.array([0.0])

    # Spread
    features['roll_spread'] = roll_spread(prices)
    if bids is not None and asks is not None and len(bids) > 0:
        features['quoted_spread']   = float(np.mean(asks - bids))
        features['relative_spread'] = float(np.mean((asks - bids) / ((asks + bids) / 2 + 1e-9)))
    else:
        features['quoted_spread']   = features['roll_spread']
        features['relative_spread'] = features['roll_spread'] / (prices[-1] + 1e-9) if len(prices) > 0 else 0.0

    # Price impact
    features['amihud'] = amihud_illiquidity(returns, volumes[1:] if len(volumes) > 1 else volumes)
    if signed_volumes is not None and len(signed_volumes) >= 5:
        sv = signed_volumes[:len(returns)]
        features['kyle_lambda'] = kyle_lambda(returns[:len(sv)], sv)
    else:
        features['kyle_lambda'] = 0.0

    # Trade intensity
    if trade_timestamps is not None and len(trade_timestamps) > 1:
        features['trade_rate']      = trade_rate(trade_timestamps)
        features['avg_trade_size']  = avg_trade_size(volumes)
    else:
        features['trade_rate']     = 0.0
        features['avg_trade_size'] = float(np.mean(volumes)) if len(volumes) > 0 else 0.0

    # Realized volatility
    features['realized_vol'] = realized_volatility(returns)
    if rv_lookback is not None and len(rv_lookback) >= 5:
        features['vol_of_vol'] = vol_of_vol(rv_lookback)
    else:
        features['vol_of_vol'] = 0.0

    # Composite liquidity score (higher = more liquid)
    # Normalize components to [0,1] and average
    spread_score = np.clip(1 - features['relative_spread'] / 0.02, 0, 1)   # 2% spread = illiquid
    impact_score = np.clip(1 - features['amihud'] / 1.0, 0, 1)
    features['liquidity_score'] = float(0.5 * spread_score + 0.5 * impact_score)

    return features
