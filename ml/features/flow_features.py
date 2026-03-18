"""
Option Flow Feature Engineering
────────────────────────────────────────────────────────────────────────────
Theory (Muravyev 2016 — Order Flow and Expected Option Returns):
  Informed traders preferentially use options. Order imbalance in the
  options market predicts future returns of the underlying:
    • Net call buying → positive future returns
    • Net put buying  → negative future returns
  The effect is strongest for aggressive (market-order) trades.

Theory (Hasbrouck — Liquidity Factors):
  Order Flow Imbalance (OFI) is a common microstructure factor:
    OFI = (Buy volume - Sell volume) / Total volume
  Higher OFI → stronger directional pressure on price.

Theory (Bacry et al. — Hawkes Processes):
  Trade arrivals are self-exciting: one trade increases the probability
  of subsequent trades in the same direction. This clustering effect
  means flow intensity is itself an informative signal.
"""

import numpy as np
import pandas as pd
from typing import Optional


# ─── Order Flow Imbalance (OFI) ──────────────────────────────────────────────

def compute_ofi(
    buy_volume:  float,
    sell_volume: float,
) -> float:
    """
    Order Flow Imbalance: normalized directional pressure.
    Range: [-1, +1]. Positive → net buying pressure.
    """
    total = buy_volume + sell_volume
    if total < 1e-9:
        return 0.0
    return (buy_volume - sell_volume) / total


def compute_call_put_imbalance(
    call_buy_vol: float,
    call_sell_vol: float,
    put_buy_vol:  float,
    put_sell_vol: float,
) -> dict:
    """
    Decompose flow into call-side and put-side OFI.
    Returns separate imbalance metrics for calls and puts.
    """
    call_ofi = compute_ofi(call_buy_vol, call_sell_vol)
    put_ofi  = compute_ofi(put_buy_vol, put_sell_vol)

    # Net directional signal: buying calls OR selling puts = bullish
    net_signal = call_ofi - put_ofi

    total_vol    = call_buy_vol + call_sell_vol + put_buy_vol + put_sell_vol
    call_pct     = (call_buy_vol + call_sell_vol) / (total_vol + 1e-9)
    put_pct      = 1 - call_pct

    return {
        'call_ofi':       call_ofi,
        'put_ofi':        put_ofi,
        'net_flow_signal': net_signal,   # main directional signal
        'call_pct':        call_pct,
        'put_pct':         put_pct,
        'pcr_volume':      (put_buy_vol + put_sell_vol) / (call_buy_vol + call_sell_vol + 1e-9),
    }


# ─── Sweep / Aggressive trade detection ──────────────────────────────────────

def detect_sweeps(
    trades: pd.DataFrame,
    volume_threshold_pct: float = 0.95,
    time_window_seconds:  float = 5.0,
) -> pd.DataFrame:
    """
    Identify 'sweep' events: large aggressive trades that cross multiple
    price levels rapidly — signature of informed institutional flow.

    Args:
        trades              : DataFrame with [timestamp, side, volume, price, option_type]
        volume_threshold_pct: percentile above which a trade is 'large'
        time_window_seconds : cluster window for sweeps

    Returns DataFrame with sweep events and their directional label.
    """
    if trades.empty:
        return pd.DataFrame(columns=['timestamp', 'direction', 'total_volume', 'option_type'])

    df = trades.copy().sort_values('timestamp')
    vol_threshold = df['volume'].quantile(volume_threshold_pct)

    # Flag large trades
    df['is_large'] = df['volume'] >= vol_threshold

    # Cluster nearby large trades into sweeps
    sweeps = []
    in_sweep    = False
    sweep_start = None
    sweep_rows  = []

    for _, row in df[df['is_large']].iterrows():
        if not in_sweep:
            in_sweep    = True
            sweep_start = row['timestamp']
            sweep_rows  = [row]
        else:
            elapsed = (row['timestamp'] - sweep_start).total_seconds()
            if elapsed <= time_window_seconds:
                sweep_rows.append(row)
            else:
                sweeps.append(_summarize_sweep(sweep_rows))
                sweep_start = row['timestamp']
                sweep_rows  = [row]

    if sweep_rows:
        sweeps.append(_summarize_sweep(sweep_rows))

    return pd.DataFrame(sweeps)


def _summarize_sweep(rows: list) -> dict:
    total_vol = sum(r['volume'] for r in rows)
    side_votes = [r['side'] for r in rows]
    direction  = 'buy' if side_votes.count('buy') > side_votes.count('sell') else 'sell'
    opt_types  = [r.get('option_type', 'unknown') for r in rows]
    opt_type   = max(set(opt_types), key=opt_types.count)
    return {
        'timestamp':    rows[0]['timestamp'],
        'direction':    direction,
        'total_volume': total_vol,
        'option_type':  opt_type,
        'count':        len(rows),
    }


# ─── Volume spike detection ───────────────────────────────────────────────────

def detect_volume_spike(
    current_volume: float,
    lookback_volumes: pd.Series,
    threshold_z: float = 2.5,
) -> dict:
    """
    Z-score based volume spike detection.
    Returns spike magnitude and direction.
    """
    if len(lookback_volumes) < 10:
        return {'is_spike': False, 'volume_z': 0.0}

    mu    = lookback_volumes.mean()
    sigma = lookback_volumes.std() + 1e-9
    z     = (current_volume - mu) / sigma

    return {
        'is_spike': bool(z > threshold_z),
        'volume_z': float(z),
    }


# ─── Hawkes process intensity estimation ─────────────────────────────────────

def estimate_hawkes_intensity(
    trade_timestamps: pd.Series,
    decay_rate:       float = 0.5,
    base_intensity:   float = 1.0,
) -> float:
    """
    Estimate current trade intensity using a simple Hawkes process model.

    The Hawkes process models self-exciting event clusters:
        λ(t) = μ + Σ α * exp(-β * (t - t_i))   for all past events t_i < t

    Args:
        trade_timestamps : series of trade arrival times (as seconds or epoch)
        decay_rate (β)   : how fast the excitement decays
        base_intensity(μ): unconditional arrival rate

    Returns: current intensity λ(t) — higher → more likely more trades soon
    """
    if len(trade_timestamps) == 0:
        return base_intensity

    now   = trade_timestamps.iloc[-1]
    alpha = decay_rate * 0.5                            # kernel amplitude

    # Sum excitation from all past events
    excitation = sum(
        alpha * np.exp(-decay_rate * (now - t))
        for t in trade_timestamps.iloc[:-1]
        if (now - t) < 60.0                             # only look back 60s
    )

    return base_intensity + excitation


# ─── Aggregate flow features ─────────────────────────────────────────────────

def extract_flow_features(
    call_buy_vol:       float,
    call_sell_vol:      float,
    put_buy_vol:        float,
    put_sell_vol:       float,
    trades_df:          Optional[pd.DataFrame] = None,
    lookback_pcr:       Optional[pd.Series]    = None,
    lookback_call_vol:  Optional[pd.Series]    = None,
) -> dict:
    """
    Compute all option-flow features for ML input.

    Returns dict with:
        call_ofi           – call order flow imbalance
        put_ofi            – put order flow imbalance
        net_flow_signal    – net directional signal
        call_pct / put_pct – market split
        pcr_volume         – put/call ratio by volume
        pcr_z_score        – standardized PCR vs lookback
        sweep_bullish_cnt  – bullish sweeps in recent window
        sweep_bearish_cnt  – bearish sweeps in recent window
        sweep_net          – net sweep direction
        hawkes_intensity   – current trade clustering intensity
        vol_spike_z        – volume z-score vs lookback
        flow_regime        – -1 bearish / 0 neutral / 1 bullish
    """
    features = {}

    # Core call/put decomposition
    cp = compute_call_put_imbalance(call_buy_vol, call_sell_vol, put_buy_vol, put_sell_vol)
    features.update(cp)

    # PCR z-score vs historical
    if lookback_pcr is not None and len(lookback_pcr) >= 20:
        mu    = lookback_pcr.mean()
        sigma = lookback_pcr.std() + 1e-9
        features['pcr_z_score'] = (cp['pcr_volume'] - mu) / sigma
    else:
        features['pcr_z_score'] = 0.0

    # Sweep analysis
    if trades_df is not None and not trades_df.empty:
        sweeps = detect_sweeps(trades_df)
        if not sweeps.empty:
            call_sweeps = sweeps[sweeps['option_type'] == 'call']
            put_sweeps  = sweeps[sweeps['option_type'] == 'put']
            bull_cnt    = (call_sweeps['direction'] == 'buy').sum()  + (put_sweeps['direction'] == 'sell').sum()
            bear_cnt    = (put_sweeps['direction']  == 'buy').sum()  + (call_sweeps['direction'] == 'sell').sum()
            features['sweep_bullish_cnt'] = int(bull_cnt)
            features['sweep_bearish_cnt'] = int(bear_cnt)
            features['sweep_net']         = int(bull_cnt - bear_cnt)
        else:
            features['sweep_bullish_cnt'] = 0
            features['sweep_bearish_cnt'] = 0
            features['sweep_net']         = 0

        # Hawkes intensity
        if 'timestamp' in trades_df.columns:
            ts = (trades_df['timestamp'].astype(np.int64) // 1e9)  # to seconds
            features['hawkes_intensity'] = estimate_hawkes_intensity(ts)
        else:
            features['hawkes_intensity'] = 1.0
    else:
        features['sweep_bullish_cnt'] = 0
        features['sweep_bearish_cnt'] = 0
        features['sweep_net']         = 0
        features['hawkes_intensity']  = 1.0

    # Volume spike
    total_vol = call_buy_vol + call_sell_vol + put_buy_vol + put_sell_vol
    if lookback_call_vol is not None and len(lookback_call_vol) >= 10:
        spike = detect_volume_spike(total_vol, lookback_call_vol)
        features['vol_spike_z'] = spike['volume_z']
    else:
        features['vol_spike_z'] = 0.0

    # Flow regime
    # Bullish: net call OFI positive + sweeps bullish + PCR low
    bull_score = (
        (cp['net_flow_signal'] > 0.2) +
        (features['sweep_net'] > 0) +
        (features['pcr_z_score'] < -1.0)
    )
    bear_score = (
        (cp['net_flow_signal'] < -0.2) +
        (features['sweep_net'] < 0) +
        (features['pcr_z_score'] > 1.0)
    )
    if bull_score >= 2:
        features['flow_regime'] = 1
    elif bear_score >= 2:
        features['flow_regime'] = -1
    else:
        features['flow_regime'] = 0

    return features
