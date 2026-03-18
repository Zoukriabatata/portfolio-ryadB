"""
ML Scorer — XGBoost + LSTM Hybrid Probability Engine
────────────────────────────────────────────────────────────────────────────
This is the ML component of the analysis engine. It takes the same
EngineInput, converts it to a flat feature vector, and returns class
probabilities from the trained hybrid model.

WHY SEPARATE FROM SIGNAL LOGIC:
  - Signal logic encodes theory-derived rules (high interpretability)
  - ML scorer learns non-linear patterns from historical data
  - Combining both reduces both false negatives (rules miss) and
    overfitting (ML without constraints)

The final engine blends both by treating ML as one more "rule" with its
own weight and score.

FEATURE EXTRACTION:
  All 43 features are derived ONLY from EngineInput (no raw market data).
  This enforces the Layer 2 boundary — the ML model never sees raw prices,
  only the pre-computed features from Layer 1.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
import os
from typing import Optional

from .schemas import EngineInput


# ─── Feature extraction from EngineInput ────────────────────────────────────

FEATURE_NAMES = [
    # GEX (9)
    'gex_net_gex', 'gex_flip_dist', 'gex_dealer_proxy',
    'gex_call_wall_dist', 'gex_put_wall_dist',
    'gex_net_gex_sign', 'gex_near_flip', 'gex_abs_gex', 'gex_gex_sq',
    # Skew (8)
    'skew_rr25', 'skew_iv_atm', 'skew_slope', 'skew_term',
    'skew_change', 'skew_extreme_put', 'skew_extreme_call', 'skew_rr25_abs',
    # Flow (10)
    'flow_ofi', 'flow_agg_buy', 'flow_cpr', 'flow_call_vol_log',
    'flow_put_vol_log', 'flow_sweep_net', 'flow_flow_pressure',
    'flow_bullish', 'flow_bearish', 'flow_ofi_sq',
    # Microstructure (6)
    'ms_spread_rel', 'ms_liquidity', 'ms_trade_intensity',
    'ms_rv_1h', 'ms_illiquid', 'ms_liq_x_intensity',
    # Context (10)
    'ctx_dte', 'ctx_log_dte', 'ctx_iv_rank', 'ctx_is_0dte',
    'ctx_overnight_gap', 'ctx_phase_open', 'ctx_phase_close',
    'ctx_phase_lunch', 'ctx_iv_rank_high', 'ctx_iv_rank_low',
]


def extract_features(inp: EngineInput) -> np.ndarray:
    """
    Convert EngineInput → flat feature vector (43 features).
    All transforms are deterministic and look-ahead-free.
    """
    spot = inp.context.spot_price
    g    = inp.gex
    s    = inp.skew
    f    = inp.flow
    m    = inp.microstructure
    c    = inp.context

    # ── GEX features ─────────────────────────────────────────────────────────
    gex_net        = g.net_gex
    flip_dist      = g.distance_to_flip
    dealer         = g.dealer_position_proxy
    call_wall_dist = (g.call_wall - spot) / spot
    put_wall_dist  = (g.put_wall  - spot) / spot
    gex_sign       = float(np.sign(gex_net))
    near_flip      = float(abs(flip_dist) < 0.005)
    abs_gex        = abs(gex_net)
    gex_sq         = gex_net ** 2

    # ── Skew features ─────────────────────────────────────────────────────────
    rr25         = s.risk_reversal_25d
    iv_atm       = s.iv_atm
    slope        = s.iv_slope
    term         = s.term_structure
    skew_chg     = s.skew_change_1d
    extreme_put  = float(rr25 < -5.0)
    extreme_call = float(rr25 > 3.0)
    rr25_abs     = abs(rr25)

    # ── Flow features ─────────────────────────────────────────────────────────
    ofi          = f.order_flow_imbalance
    agg          = f.aggressive_buy_ratio
    cpr          = f.call_put_ratio
    call_vol_log = np.log1p(f.call_volume)
    put_vol_log  = np.log1p(f.put_volume)
    sweep        = float(f.sweep_net)
    flow_press   = 0.7 * ofi + 0.3 * (agg - 0.5) * 2   # [-1, 1]
    bullish_flow = float(flow_press > 0.2)
    bearish_flow = float(flow_press < -0.2)
    ofi_sq       = ofi ** 2

    # ── Microstructure features ───────────────────────────────────────────────
    spread_rel    = m.relative_spread
    liquidity     = m.liquidity_index
    intensity     = m.trade_intensity
    rv_1h         = m.realized_vol_1h
    illiquid      = float(liquidity < 0.4)
    liq_x_int     = liquidity * min(intensity / 50.0, 2.0)

    # ── Context features ──────────────────────────────────────────────────────
    from .schemas import IntradayPhase
    dte           = c.time_to_expiry
    log_dte       = float(np.log(dte + 0.5))
    iv_rank       = c.iv_rank
    is_0dte       = float(dte < 1.0)
    overnight_gap = (spot - c.prev_close) / (c.prev_close + 1e-9)
    phase_open    = float(c.intraday_phase == IntradayPhase.OPEN)
    phase_close   = float(c.intraday_phase == IntradayPhase.CLOSE)
    phase_lunch   = float(c.intraday_phase == IntradayPhase.LUNCH)
    iv_rank_high  = float(iv_rank > 70)
    iv_rank_low   = float(iv_rank < 25)

    return np.array([
        gex_net, flip_dist, dealer, call_wall_dist, put_wall_dist,
        gex_sign, near_flip, abs_gex, gex_sq,
        rr25, iv_atm, slope, term, skew_chg, extreme_put, extreme_call, rr25_abs,
        ofi, agg, cpr, call_vol_log, put_vol_log, sweep, flow_press,
        bullish_flow, bearish_flow, ofi_sq,
        spread_rel, liquidity, intensity, rv_1h, illiquid, liq_x_int,
        dte, log_dte, iv_rank, is_0dte, overnight_gap,
        phase_open, phase_close, phase_lunch, iv_rank_high, iv_rank_low,
    ], dtype=np.float32)


def extract_features_df(inp: EngineInput) -> pd.DataFrame:
    return pd.DataFrame([extract_features(inp)], columns=FEATURE_NAMES)


# ─── ML Scorer ───────────────────────────────────────────────────────────────

class MLScorer:
    """
    Wraps the trained hybrid model and provides probability estimates
    for LONG / NEUTRAL / SHORT given an EngineInput.

    When no model is available (first deployment), falls back to a
    rule-derived pseudo-probability using the extracted features directly.
    """

    LABEL_DECODE = {0: -1, 1: 0, 2: 1}     # 0=SHORT, 1=NEUTRAL, 2=LONG

    def __init__(self, model_dir: Optional[str] = None):
        self.model      = None
        self.lstm       = None
        self.is_fitted  = False
        self.seq_buffer: list[np.ndarray] = []    # rolling input buffer for LSTM
        self.seq_len    = 20

        if model_dir:
            self.load(model_dir)

    def score(self, inp: EngineInput) -> dict:
        """
        Returns:
            ml_score    : float in [-1, +1]  (positive = bullish)
            confidence  : float in [0, 1]
            source      : 'ml' | 'heuristic'
        """
        feat = extract_features(inp)
        self.seq_buffer.append(feat)
        if len(self.seq_buffer) > self.seq_len:
            self.seq_buffer.pop(0)

        if self.is_fitted and self.model is not None:
            return self._ml_predict(feat)
        else:
            return self._heuristic_score(feat)

    def _ml_predict(self, feat: np.ndarray) -> dict:
        """Run XGBoost + optional LSTM and ensemble."""
        feat_df  = pd.DataFrame([feat], columns=FEATURE_NAMES)
        xgb_prob = self.model.predict_proba(feat_df)[0]    # [P_short, P_neutral, P_long]

        lstm_prob = None
        if self.lstm is not None and len(self.seq_buffer) >= self.seq_len:
            seq = np.stack(self.seq_buffer[-self.seq_len:])   # (seq_len, n_features)
            lstm_prob = self.lstm.predict_proba(seq[np.newaxis])[0]

        if lstm_prob is not None:
            # Confidence-weighted blend
            xgb_conf  = xgb_prob.max()
            lstm_conf = lstm_prob.max()
            total     = xgb_conf + lstm_conf + 1e-9
            prob      = (xgb_conf / total) * xgb_prob + (lstm_conf / total) * lstm_prob
        else:
            prob = xgb_prob

        regime_idx = int(prob.argmax())
        regime_int = self.LABEL_DECODE[regime_idx]
        conf       = float(prob.max())

        # Convert to [-1, 1] score: P(LONG) - P(SHORT)
        ml_score = float(prob[2] - prob[0])

        return {
            'ml_score':   np.clip(ml_score, -1, 1),
            'confidence': conf,
            'source':     'ml',
            'proba':      {'short': float(prob[0]), 'neutral': float(prob[1]), 'long': float(prob[2])},
        }

    def _heuristic_score(self, feat: np.ndarray) -> dict:
        """
        Fallback when no trained model is available.
        Uses a linear combination of the most theoretically grounded features.
        Weights derived from published research (not tuned to historical data).
        """
        idx = {n: i for i, n in enumerate(FEATURE_NAMES)}

        # Weights: GEX regime (−short gamma direction) + OFI + skew
        score = (
              0.30 * feat[idx['gex_dealer_proxy']]
            + 0.25 * feat[idx['flow_ofi']]
            + 0.15 * feat[idx['skew_rr25']] / 10.0   # normalize
            + 0.15 * feat[idx['flow_agg_buy']] * 2.0 - 0.15
            + 0.10 * feat[idx['flow_sweep_net']] / 5.0
            + 0.05 * (-feat[idx['skew_extreme_put']] * 0.5)
        )

        # Penalize near-flip
        if feat[idx['gex_near_flip']] > 0.5:
            score *= 0.3

        score = float(np.clip(score, -1, 1))
        conf  = min(abs(score) / 0.7 + 0.3, 0.80)    # minimum 30% conf

        p_long    = max(0, score) * conf + (1 - conf) / 3
        p_short   = max(0, -score) * conf + (1 - conf) / 3
        p_neutral = max(0, 1 - p_long - p_short)

        return {
            'ml_score':   score,
            'confidence': conf,
            'source':     'heuristic',
            'proba':      {'short': p_short, 'neutral': p_neutral, 'long': p_long},
        }

    # ── Model persistence ─────────────────────────────────────────────────────

    def load(self, model_dir: str) -> 'MLScorer':
        import joblib
        xgb_path = os.path.join(model_dir, 'xgb.pkl')
        if os.path.exists(xgb_path):
            data = joblib.load(xgb_path)
            self.model    = data['model']
            self.is_fitted = True

        try:
            import torch
            lstm_path = os.path.join(model_dir, 'lstm.pt')
            if os.path.exists(lstm_path):
                from ..models.lstm_model import LSTMTrainer
                trainer = LSTMTrainer(n_features=len(FEATURE_NAMES))
                trainer.load(lstm_path)
                self.lstm     = trainer
                self.seq_len  = trainer.seq_len
        except (ImportError, Exception):
            pass

        return self

    def train(
        self,
        inputs:  list[EngineInput],
        labels:  list[int],         # +1 / 0 / -1
        save_dir: Optional[str] = None,
    ) -> 'MLScorer':
        """
        Train the XGBoost model on historical EngineInput instances.

        Labels must be generated from FORWARD returns — caller's responsibility
        to ensure no look-ahead bias (use generate_labels from xgboost_model.py).
        """
        try:
            from xgboost import XGBClassifier
        except ImportError:
            raise ImportError("pip install xgboost")

        X = np.stack([extract_features(inp) for inp in inputs])
        y = np.array([{-1: 0, 0: 1, 1: 2}[l] for l in labels])

        X_df = pd.DataFrame(X, columns=FEATURE_NAMES)

        self.model = XGBClassifier(
            n_estimators=300, max_depth=5, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.7,
            reg_lambda=2.0, reg_alpha=0.5,
            num_class=3, objective='multi:softprob',
            eval_metric='mlogloss', random_state=42,
            n_jobs=-1, verbosity=0,
        )
        self.model.fit(X_df, y)
        self.is_fitted = True

        if save_dir:
            import joblib, os
            os.makedirs(save_dir, exist_ok=True)
            joblib.dump({'model': self.model, 'features': FEATURE_NAMES},
                        os.path.join(save_dir, 'xgb.pkl'))
            print(f"[MLScorer] Model saved to {save_dir}/xgb.pkl")

        return self
