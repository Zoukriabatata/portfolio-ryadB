"""
Unified Feature Pipeline
────────────────────────────────────────────────────────────────────────────
Assembles all feature groups into a single flat feature vector ready for ML.

Design principles:
  - All features are computed from their respective modules
  - No look-ahead: features at time T only use data available at time T
  - Consistent NaN handling with forward-fill + zero-fill fallback
  - FeatureStore accumulates rolling history for momentum features
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .gex_features        import extract_gex_features, build_gex_profile
from .skew_features       import extract_skew_features
from .flow_features       import extract_flow_features
from .microstructure_features import extract_microstructure_features
from .time_features       import extract_time_features


# ─── Input schema ────────────────────────────────────────────────────────────

@dataclass
class MarketSnapshot:
    """
    All raw market data needed to compute one feature vector.
    Fill only what's available; optional fields will gracefully degrade.
    """
    # Required
    timestamp:       datetime
    spot:            float
    days_to_expiry:  float

    # GEX (provide option_chain OR pre-computed aggregates)
    option_chain:    Optional[pd.DataFrame] = None  # strike, call_oi, put_oi, call_gamma, put_gamma
    net_gex:         Optional[float]        = None  # pre-computed aggregate

    # Skew
    iv_call_25d:     Optional[float]        = None
    iv_put_25d:      Optional[float]        = None
    iv_atm:          Optional[float]        = None
    strikes:         Optional[np.ndarray]   = None
    iv_surface:      Optional[np.ndarray]   = None
    expiry_days:     Optional[np.ndarray]   = None
    atm_ivs_by_exp:  Optional[np.ndarray]   = None

    # Flow
    call_buy_vol:    float = 0.0
    call_sell_vol:   float = 0.0
    put_buy_vol:     float = 0.0
    put_sell_vol:    float = 0.0
    trades_df:       Optional[pd.DataFrame] = None  # recent trades

    # Microstructure
    prices:          Optional[np.ndarray]   = None  # recent price series
    volumes:         Optional[np.ndarray]   = None  # corresponding volumes
    bids:            Optional[np.ndarray]   = None
    asks:            Optional[np.ndarray]   = None
    signed_volumes:  Optional[np.ndarray]   = None
    trade_timestamps:Optional[pd.Series]    = None


# ─── Rolling history store ────────────────────────────────────────────────────

class FeatureStore:
    """
    Maintains rolling history of scalar time series needed for
    momentum / z-score features. No look-ahead: only appended to
    after the current bar is complete.
    """
    def __init__(self, maxlen: int = 252):
        self.maxlen = maxlen
        self._data: dict[str, list] = {}

    def append(self, key: str, value: float) -> None:
        if key not in self._data:
            self._data[key] = []
        self._data[key].append(value)
        if len(self._data[key]) > self.maxlen:
            self._data[key].pop(0)

    def get(self, key: str) -> pd.Series:
        return pd.Series(self._data.get(key, []))

    def append_snapshot(self, features: dict, keys: list[str]) -> None:
        for k in keys:
            if k in features:
                self.append(k, features[k])


# ─── Main pipeline ────────────────────────────────────────────────────────────

class FeaturePipeline:
    """
    Stateful feature pipeline. Call `.transform(snapshot)` per bar.
    State (FeatureStore) accumulates history for momentum features.
    """

    HISTORY_KEYS = [
        'net_gex', 'rr25', 'pcr_volume', 'call_vol_total',
        'realized_vol', 'amihud',
    ]

    def __init__(self, maxlen: int = 252):
        self.store = FeatureStore(maxlen)

    def transform(self, snap: MarketSnapshot) -> dict:
        """
        Compute the full feature vector for one market snapshot.
        Returns a flat dict of feature_name → float.
        """
        features: dict = {}

        # ── 1. GEX features ──────────────────────────────────────────────────
        if snap.option_chain is not None:
            gex_profile = build_gex_profile(snap.option_chain, snap.spot)
            gex_feats   = extract_gex_features(
                gex_profile, snap.spot,
                lookback_gex=self.store.get('net_gex'),
            )
        elif snap.net_gex is not None:
            # Fallback: use pre-aggregated GEX only
            gex_feats = {
                'net_gex':            snap.net_gex,
                'gamma_flip_level':   snap.spot,
                'dist_to_flip':       0.0,
                'call_wall':          snap.spot * 1.01,
                'put_wall':           snap.spot * 0.99,
                'gamma_concentration': 0.0,
                'dealer_positioning':  np.sign(snap.net_gex),
                'gex_roc_1':          0.0,
                'gex_roc_5':          0.0,
            }
        else:
            gex_feats = {k: 0.0 for k in [
                'net_gex', 'gamma_flip_level', 'dist_to_flip',
                'call_wall', 'put_wall', 'gamma_concentration',
                'dealer_positioning', 'gex_roc_1', 'gex_roc_5',
            ]}

        features.update({f'gex_{k}': v for k, v in gex_feats.items()})

        # ── 2. Skew features ─────────────────────────────────────────────────
        if snap.iv_call_25d and snap.iv_put_25d and snap.iv_atm:
            skew_feats = extract_skew_features(
                snap.iv_call_25d, snap.iv_put_25d, snap.iv_atm,
                snap.spot,
                strikes=snap.strikes,
                iv_surface=snap.iv_surface,
                expiry_days=snap.expiry_days,
                atm_ivs_by_exp=snap.atm_ivs_by_exp,
                lookback_rr25=self.store.get('rr25'),
            )
        else:
            skew_feats = {k: 0.0 for k in [
                'rr25', 'butterfly_25d', 'iv_atm', 'put_premium',
                'smile_slope', 'term_slope', 'iv30',
                'skew_z_score', 'skew_roc_1', 'skew_roc_5', 'sentiment_regime',
            ]}

        features.update({f'skew_{k}': v for k, v in skew_feats.items()})

        # ── 3. Flow features ─────────────────────────────────────────────────
        flow_feats = extract_flow_features(
            snap.call_buy_vol, snap.call_sell_vol,
            snap.put_buy_vol,  snap.put_sell_vol,
            trades_df=snap.trades_df,
            lookback_pcr=self.store.get('pcr_volume'),
            lookback_call_vol=self.store.get('call_vol_total'),
        )
        features.update({f'flow_{k}': v for k, v in flow_feats.items()})

        # ── 4. Microstructure features ───────────────────────────────────────
        if snap.prices is not None and len(snap.prices) > 1:
            ms_feats = extract_microstructure_features(
                snap.prices, snap.volumes or np.ones(len(snap.prices)),
                bids=snap.bids, asks=snap.asks,
                signed_volumes=snap.signed_volumes,
                trade_timestamps=snap.trade_timestamps,
                rv_lookback=self.store.get('realized_vol'),
            )
        else:
            ms_feats = {k: 0.0 for k in [
                'roll_spread', 'quoted_spread', 'relative_spread',
                'amihud', 'kyle_lambda', 'trade_rate',
                'avg_trade_size', 'realized_vol', 'vol_of_vol', 'liquidity_score',
            ]}

        features.update({f'ms_{k}': v for k, v in ms_feats.items()})

        # ── 5. Time features ─────────────────────────────────────────────────
        time_feats = extract_time_features(snap.timestamp, snap.days_to_expiry)
        features.update({f'time_{k}': v for k, v in time_feats.items()})

        # ── 6. Spot price as feature ─────────────────────────────────────────
        features['spot'] = snap.spot

        # ── Update history store (after computing features, no look-ahead) ───
        self.store.append('net_gex',        gex_feats.get('net_gex', 0))
        self.store.append('rr25',           skew_feats.get('rr25', 0))
        self.store.append('pcr_volume',     flow_feats.get('pcr_volume', 1))
        self.store.append('call_vol_total', snap.call_buy_vol + snap.call_sell_vol)
        self.store.append('realized_vol',   ms_feats.get('realized_vol', 0))
        self.store.append('amihud',         ms_feats.get('amihud', 0))

        return features

    def transform_batch(self, snapshots: list[MarketSnapshot]) -> pd.DataFrame:
        """
        Process a list of snapshots in order, returning a feature DataFrame.
        History is accumulated sequentially — no look-ahead bias.
        """
        rows = [self.transform(s) for s in snapshots]
        df   = pd.DataFrame(rows)
        df   = df.ffill().fillna(0.0)
        return df

    @property
    def feature_names(self) -> list[str]:
        """Return feature names based on a zero snapshot (for schema only)."""
        dummy = MarketSnapshot(
            timestamp=datetime.now(),
            spot=100.0,
            days_to_expiry=30.0,
        )
        return list(self.transform(dummy).keys())
