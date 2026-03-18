"""
GEX Feature Engineering
────────────────────────────────────────────────────────────────────────────
Gamma Exposure (GEX) measures the net gamma dealers hold across all strikes.

Theory (Spatt & Ernst — Market Microstructure):
  Dealers dynamically delta-hedge by trading the underlying. Net gamma sign
  tells us the *direction* of that hedging pressure:
    • Positive GEX → dealers are long gamma → they BUY dips, SELL rallies
                     → price mean-reverts (stabilizing regime)
    • Negative GEX → dealers are short gamma → they SELL dips, BUY rallies
                     → price trends / accelerates (destabilizing regime)

GEX flip level: the price where net gamma crosses zero. Below it the market
shifts from stabilizing to destabilizing — strong trending moves become likely.
"""

import numpy as np
import pandas as pd
from typing import Optional


# ─── Per-strike GEX calculation ───────────────────────────────────────────────

def compute_gex_per_strike(
    strike: float,
    call_oi: float,
    put_oi: float,
    call_gamma: float,
    put_gamma: float,
    spot: float,
    contract_multiplier: float = 100,
) -> float:
    """
    GEX at a single strike (in $-dollars of gamma exposure).

    Formula (market convention):
        GEX_strike = (Call_OI * Call_Gamma - Put_OI * Put_Gamma)
                     * Spot² * Multiplier * 0.01

    Dealers are assumed to be SHORT the retail/institutional flow, so:
      • Long calls by public  → dealer short calls  → dealer short call gamma
        But since dealer delta-hedges, the *effective* gamma they must hedge
        is the call gamma. Put gamma is subtracted because puts flip sign at
        short position.
    """
    call_gex = call_oi * call_gamma
    put_gex  = put_oi  * put_gamma      # puts contribute negative GEX
    net      = (call_gex - put_gex) * (spot ** 2) * contract_multiplier * 0.01
    return net


def build_gex_profile(
    option_chain: pd.DataFrame,
    spot: float,
    contract_multiplier: float = 100,
) -> pd.DataFrame:
    """
    Build a full GEX-by-strike profile from an option chain DataFrame.

    Expected columns: strike, call_oi, put_oi, call_gamma, put_gamma
    Returns: DataFrame with columns [strike, gex, cumulative_gex]
    """
    required = {'strike', 'call_oi', 'put_oi', 'call_gamma', 'put_gamma'}
    assert required.issubset(option_chain.columns), f"Missing: {required - set(option_chain.columns)}"

    df = option_chain.copy()
    df['gex'] = df.apply(
        lambda r: compute_gex_per_strike(
            r['strike'], r['call_oi'], r['put_oi'],
            r['call_gamma'], r['put_gamma'],
            spot, contract_multiplier,
        ),
        axis=1,
    )
    df = df.sort_values('strike').reset_index(drop=True)
    df['cumulative_gex'] = df['gex'].cumsum()
    return df[['strike', 'gex', 'cumulative_gex']]


# ─── Aggregate GEX features ──────────────────────────────────────────────────

def extract_gex_features(
    gex_profile: pd.DataFrame,
    spot: float,
    lookback_gex: Optional[pd.Series] = None,
) -> dict:
    """
    Extract scalar features from a GEX profile for ML input.

    Args:
        gex_profile   : output of build_gex_profile()
        spot          : current underlying price
        lookback_gex  : time-series of net GEX (for rate-of-change features)

    Returns dict with keys:
        net_gex              – total net gamma exposure ($B)
        gamma_flip_level     – price where cumulative GEX crosses 0
        dist_to_flip         – (spot - flip_level) / spot
        call_wall            – strike with highest call GEX
        put_wall             – strike with highest put GEX (most negative GEX)
        gamma_concentration  – Herfindahl index of |GEX| across strikes (0-1)
        dealer_positioning   – "long_gamma" | "short_gamma" | "near_flip"
        gex_roc_1            – % change in net GEX vs 1 period ago
        gex_roc_5            – % change in net GEX vs 5 periods ago
    """
    features: dict = {}

    # Net GEX (sum of all strikes)
    net_gex = gex_profile['gex'].sum()
    features['net_gex'] = net_gex

    # Gamma flip level: strike where cumulative GEX changes sign
    flip_level = _find_flip_level(gex_profile, spot)
    features['gamma_flip_level'] = flip_level
    features['dist_to_flip'] = (spot - flip_level) / spot if flip_level else 0.0

    # Call wall: strike with highest positive GEX
    pos_gex = gex_profile[gex_profile['gex'] > 0]
    features['call_wall'] = (
        pos_gex.loc[pos_gex['gex'].idxmax(), 'strike'] if not pos_gex.empty else spot * 1.02
    )

    # Put wall: strike with most negative GEX
    neg_gex = gex_profile[gex_profile['gex'] < 0]
    features['put_wall'] = (
        neg_gex.loc[neg_gex['gex'].idxmin(), 'strike'] if not neg_gex.empty else spot * 0.98
    )

    # Gamma concentration (how clustered gamma is around a few strikes)
    abs_gex  = gex_profile['gex'].abs()
    total    = abs_gex.sum()
    features['gamma_concentration'] = (
        ((abs_gex / total) ** 2).sum() if total > 0 else 0.0
    )

    # Dealer positioning proxy
    if abs(features['dist_to_flip']) < 0.005:          # within 0.5% of flip
        features['dealer_positioning'] = 0             # near_flip
    elif net_gex > 0:
        features['dealer_positioning'] = 1             # long_gamma
    else:
        features['dealer_positioning'] = -1            # short_gamma

    # Rate-of-change features (require historical series)
    if lookback_gex is not None and len(lookback_gex) >= 5:
        prev1 = lookback_gex.iloc[-1]
        prev5 = lookback_gex.iloc[-5]
        features['gex_roc_1'] = (net_gex - prev1) / (abs(prev1) + 1e-9)
        features['gex_roc_5'] = (net_gex - prev5) / (abs(prev5) + 1e-9)
    else:
        features['gex_roc_1'] = 0.0
        features['gex_roc_5'] = 0.0

    return features


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _find_flip_level(gex_profile: pd.DataFrame, spot: float) -> float:
    """
    Locate the gamma flip level by finding where cumulative GEX crosses zero.
    Returns the interpolated strike price.
    """
    df = gex_profile.sort_values('strike').reset_index(drop=True)

    for i in range(len(df) - 1):
        y0 = df.loc[i,   'cumulative_gex']
        y1 = df.loc[i+1, 'cumulative_gex']
        if y0 * y1 <= 0:                               # sign change
            x0 = df.loc[i,   'strike']
            x1 = df.loc[i+1, 'strike']
            # Linear interpolation
            frac = abs(y0) / (abs(y0) + abs(y1) + 1e-9)
            return x0 + frac * (x1 - x0)

    # No flip found — return nearest edge
    return df.iloc[0]['strike'] if spot < df['strike'].mean() else df.iloc[-1]['strike']
