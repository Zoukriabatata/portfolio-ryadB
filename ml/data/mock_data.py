"""
Mock Data Generator
────────────────────────────────────────────────────────────────────────────
Generates realistic synthetic market data for development and testing.
Replace with real data loaders (see data/loader.py) for production.

Data is designed to exhibit realistic microstructure properties:
  - GEX mean-reverts around zero with regime shifts
  - Skew tracks price momentum with lag
  - Flow is directionally persistent (Hawkes-like)
  - Volatility clusters (GARCH-like)
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

from ..features.feature_pipeline import MarketSnapshot, FeaturePipeline


def generate_option_chain(
    spot:            float,
    n_strikes:       int   = 15,
    atm_iv:          float = 0.20,
    skew_slope:      float = -0.3,
    moneyness_range: float = 0.10,
) -> pd.DataFrame:
    """
    Generate a synthetic option chain with realistic GEX profile.

    Assumptions:
    - Put OI is concentrated below spot (hedge demand)
    - Call OI is concentrated above spot (upside positioning)
    - Gamma peaks near ATM and decays at wings
    """
    strikes = np.linspace(spot * (1 - moneyness_range), spot * (1 + moneyness_range), n_strikes)

    rows = []
    for k in strikes:
        log_m = np.log(k / spot)

        # IV smile (skewed)
        iv = atm_iv + skew_slope * log_m + 0.5 * log_m ** 2

        # Gamma: peaks near ATM (simplified Black-Scholes)
        d1    = log_m / (iv * np.sqrt(0.25))   # assume 3-month T
        gamma = np.exp(-0.5 * d1 ** 2) / (k * iv * np.sqrt(0.25) * np.sqrt(2 * np.pi))

        # OI profiles: skewed toward puts below, calls above
        call_oi = max(int(1000 * np.exp(-2 * max(log_m, 0) ** 2)), 10)
        put_oi  = max(int(1000 * np.exp(-2 * max(-log_m, 0) ** 2)), 10)

        rows.append({
            'strike':     round(float(k), 2),
            'call_oi':    call_oi,
            'put_oi':     put_oi,
            'call_gamma': max(float(gamma), 0.0),
            'put_gamma':  max(float(gamma), 0.0),
        })

    return pd.DataFrame(rows)


def generate_market_snapshots(
    n_bars:          int       = 500,
    start_price:     float     = 500.0,
    start_dt:        Optional[datetime] = None,
    bar_minutes:     int       = 5,
    seed:            int       = 42,
) -> list[MarketSnapshot]:
    """
    Generate N market snapshots with realistic correlated dynamics.
    """
    np.random.seed(seed)
    dt_base = start_dt or datetime(2024, 1, 2, 9, 30)

    snapshots = []
    price     = start_price
    gex       = 1.0           # start in positive gamma
    rr25      = -2.0          # mild put skew
    call_vol  = 1000.0
    put_vol   = 900.0

    prices_hist = [price]

    for i in range(n_bars):
        # ── Simulate price (GBM + GEX regime effect) ─────────────────────────
        vol         = 0.15 + 0.10 * (gex < 0)          # higher vol in neg GEX
        ret         = np.random.normal(0, vol / np.sqrt(252 * 78), 1)[0]
        price      *= (1 + ret)
        prices_hist.append(price)

        # ── Simulate GEX mean-reversion with regime shifts ────────────────────
        gex += np.random.normal(-0.02 * gex, 0.15)
        gex  = np.clip(gex, -5, 5)

        # Occasional regime flip
        if np.random.random() < 0.02:
            gex = -gex

        # ── Simulate skew (correlated with returns) ────────────────────────────
        recent_ret = (price - prices_hist[-min(5, len(prices_hist))]) / prices_hist[-min(5, len(prices_hist))]
        rr25      += np.random.normal(-0.3 * recent_ret * 10 - 0.02 * rr25, 0.5)
        rr25       = np.clip(rr25, -15, 8)

        atm_iv = 0.18 + abs(rr25) * 0.003 + (gex < 0) * 0.05

        # ── Simulate flow (directional clustering) ─────────────────────────────
        flow_signal = np.sign(gex) * 0.3 + np.random.normal(0, 0.5)
        call_vol    = max(200, call_vol * (1 + np.random.normal(0.1 * flow_signal, 0.2)))
        put_vol     = max(200, put_vol  * (1 + np.random.normal(-0.1 * flow_signal, 0.2)))

        # ── Compute PCR and dominant side ─────────────────────────────────────
        total_vol    = call_vol + put_vol
        call_buy     = call_vol * (0.5 + 0.2 * (flow_signal > 0))
        call_sell    = call_vol - call_buy
        put_buy      = put_vol  * (0.5 + 0.2 * (flow_signal < 0))
        put_sell     = put_vol  - put_buy

        # ── Option chain ──────────────────────────────────────────────────────
        chain = generate_option_chain(price, atm_iv=atm_iv, skew_slope=rr25 / 100)

        # ── Prices for microstructure ─────────────────────────────────────────
        recent_prices = np.array(prices_hist[-20:]) if len(prices_hist) >= 20 else np.array(prices_hist)
        recent_vols   = np.ones_like(recent_prices) * total_vol / len(recent_prices)

        snap = MarketSnapshot(
            timestamp        = dt_base + timedelta(minutes=i * bar_minutes),
            spot             = round(float(price), 2),
            days_to_expiry   = max(0.1, 30.0 - i * bar_minutes / (390.0)),  # count down from 30d
            option_chain     = chain,
            iv_call_25d      = float(atm_iv + rr25 / 200),
            iv_put_25d       = float(atm_iv - rr25 / 200),
            iv_atm           = float(atm_iv),
            call_buy_vol     = float(call_buy),
            call_sell_vol    = float(call_sell),
            put_buy_vol      = float(put_buy),
            put_sell_vol     = float(put_sell),
            prices           = recent_prices,
            volumes          = recent_vols,
        )
        snapshots.append(snap)

    return snapshots


def snapshots_to_features(snapshots: list[MarketSnapshot]) -> pd.DataFrame:
    """Convert a list of snapshots to a feature DataFrame using the pipeline."""
    pipeline = FeaturePipeline()
    return pipeline.transform_batch(snapshots)


def generate_prices_series(n_bars: int = 500, start: float = 500.0, seed: int = 42) -> pd.Series:
    """Generate a simple price series for backtesting."""
    np.random.seed(seed)
    returns = np.random.normal(0, 0.01, n_bars)
    prices  = start * np.exp(np.cumsum(returns))
    return pd.Series(prices, name='price')
