"""
Hybrid XGBoost + LSTM Ensemble
────────────────────────────────────────────────────────────────────────────
ARCHITECTURE RATIONALE:

  XGBoost captures: non-linear interactions between current features
  LSTM captures:    temporal patterns and memory over the past N bars
  Ensemble:         combines both by averaging probability outputs

  Final signal uses a soft voting approach:
    P_final(class) = w_xgb * P_xgb(class) + w_lstm * P_lstm(class)

  XGBoost typically dominates when:
    - GEX / skew regime clearly defined (strong signal)
    - Feature space interaction matters more than history

  LSTM typically dominates when:
    - Market is in transition (XGBoost uncertain)
    - Historical context of flow or skew evolution matters

  Confidence weighting: when one model is much more confident than the
  other, we upweight it dynamically.

SIGNAL CONSTRUCTION (based on microstructure theory):
  The final regime signal combines:
    1. Dealer positioning (GEX sign)
    2. Sentiment (skew direction)
    3. Flow pressure (OFI, sweeps)
  Into a single directional bias with probability estimate.
"""

import numpy as np
import pandas as pd
from typing import Optional

from .xgboost_model import RegimeClassifier
from .lstm_model    import LSTMTrainer


LABEL_DECODE = {0: 'SHORT', 1: 'NEUTRAL', 2: 'LONG'}
LABEL_TO_INT = {'SHORT': -1, 'NEUTRAL': 0, 'LONG': 1}


class HybridRegimeModel:
    """
    Ensemble of XGBoost (tabular) + LSTM (sequential) regime classifiers.

    Usage:
        model = HybridRegimeModel(n_features=45, seq_len=20)
        model.fit(X_train, y_train, X_val, y_val)
        result = model.predict_full(X_latest)
    """

    def __init__(
        self,
        n_features:   int,
        seq_len:      int   = 20,
        xgb_weight:   float = 0.6,       # XGBoost gets 60% by default
        lstm_weight:  float = 0.4,
        device:       str   = 'cpu',
        use_lstm:     bool  = True,       # can disable if torch not available
    ):
        self.seq_len     = seq_len
        self.xgb_weight  = xgb_weight
        self.lstm_weight = lstm_weight
        self.use_lstm    = use_lstm

        self.xgb = RegimeClassifier()

        if use_lstm:
            try:
                self.lstm = LSTMTrainer(n_features=n_features, seq_len=seq_len, device=device)
            except ImportError:
                print("[WARN] PyTorch not found — running XGBoost only.")
                self.use_lstm = False
                self.lstm     = None
        else:
            self.lstm = None

        self.is_fitted  = False
        self.n_features = n_features

    # ── Training ─────────────────────────────────────────────────────────────

    def fit(
        self,
        X_train:   pd.DataFrame,
        y_train:   pd.Series,
        X_val:     Optional[pd.DataFrame] = None,
        y_val:     Optional[pd.Series]    = None,
    ) -> 'HybridRegimeModel':
        """
        Fit XGBoost and LSTM on the same training data.
        Labels should be in {-1, 0, +1}.
        """
        print("[HybridModel] Training XGBoost...")
        if X_val is not None:
            self.xgb.fit(X_train, y_train, eval_set=[(X_val, y_val)])
        else:
            self.xgb.fit(X_train, y_train)

        if self.use_lstm and self.lstm is not None:
            print("[HybridModel] Training LSTM...")
            # Encode labels: -1→0, 0→1, +1→2
            label_map = {-1: 0, 0: 1, 1: 2}
            y_enc     = y_train.map(label_map).values
            X_arr     = X_train.values

            y_val_enc = y_val.map(label_map).values if y_val is not None else None
            X_val_arr = X_val.values if X_val is not None else None

            self.lstm.fit(X_arr, y_enc, X_val_arr, y_val_enc)

        self.is_fitted = True
        return self

    # ── Inference ────────────────────────────────────────────────────────────

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Ensemble probability matrix: shape (n, 3) [P_SHORT, P_NEUTRAL, P_LONG].
        Uses confidence-weighted averaging.
        """
        xgb_proba = self.xgb.predict_proba(X)     # (n, 3)

        if self.use_lstm and self.lstm is not None and self.is_fitted:
            # LSTM returns fewer rows (seq_len is consumed)
            lstm_proba = self.lstm.predict_proba(X.values)
            n_lstm     = len(lstm_proba)

            # Align: take last n_lstm rows from XGBoost
            xgb_aligned = xgb_proba[-n_lstm:]

            # Dynamic weighting: upweight the more confident model per sample
            xgb_conf  = xgb_aligned.max(axis=1, keepdims=True)
            lstm_conf = lstm_proba.max(axis=1, keepdims=True)
            total     = xgb_conf + lstm_conf + 1e-9

            # Blend weights proportional to confidence
            w_xgb     = self.xgb_weight  * (xgb_conf / total)
            w_lstm    = self.lstm_weight * (lstm_conf / total)
            ensemble  = w_xgb * xgb_aligned + w_lstm * lstm_proba

            # Normalize rows
            ensemble  /= ensemble.sum(axis=1, keepdims=True)
            return ensemble

        # XGBoost-only fallback
        return xgb_proba

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        proba = self.predict_proba(X)
        return np.array([LABEL_TO_INT[LABEL_DECODE[i]] for i in proba.argmax(axis=1)])

    def predict_full(self, X: pd.DataFrame) -> dict:
        """
        Full inference output including explanations.

        Returns:
            regime          : 'LONG' | 'NEUTRAL' | 'SHORT'
            regime_int      : +1 / 0 / -1
            confidence      : max class probability
            proba_long      : P(LONG)
            proba_neutral   : P(NEUTRAL)
            proba_short     : P(SHORT)
            vol_regime      : 'EXPANSION' | 'COMPRESSION'
            dealer_position : 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEAR_FLIP'
            top_features    : list of top-5 features by importance (XGBoost)
        """
        proba     = self.predict_proba(X)
        last      = proba[-1]                          # most recent prediction
        conf      = float(last.max())
        regime_i  = int(last.argmax())
        regime    = LABEL_DECODE[regime_i]

        # Volatility regime from XGBoost rules
        vol_regime = self.xgb.predict_vol_regime(X)[-1]
        vol_label  = 'EXPANSION' if vol_regime == 1 else 'COMPRESSION'

        # Dealer position from latest GEX feature
        dp = X.get('gex_dealer_positioning', pd.Series([0])).iloc[-1]
        if dp > 0:
            dealer = 'LONG_GAMMA'
        elif dp < 0:
            dealer = 'SHORT_GAMMA'
        else:
            dealer = 'NEAR_FLIP'

        # Top features
        try:
            top_feats = self.xgb.get_feature_importance(5)['feature'].tolist()
        except Exception:
            top_feats = []

        return {
            'regime':           regime,
            'regime_int':       LABEL_TO_INT[regime],
            'confidence':       round(conf, 4),
            'proba_long':       round(float(last[2]), 4),
            'proba_neutral':    round(float(last[1]), 4),
            'proba_short':      round(float(last[0]), 4),
            'vol_regime':       vol_label,
            'dealer_position':  dealer,
            'top_features':     top_feats,
        }

    # ── Persistence ──────────────────────────────────────────────────────────

    def save(self, dir_path: str) -> None:
        import os
        os.makedirs(dir_path, exist_ok=True)
        self.xgb.save(os.path.join(dir_path, 'xgb.pkl'))
        if self.use_lstm and self.lstm is not None:
            self.lstm.save(os.path.join(dir_path, 'lstm.pt'))

    def load(self, dir_path: str) -> 'HybridRegimeModel':
        import os
        self.xgb.load(os.path.join(dir_path, 'xgb.pkl'))
        if self.use_lstm and self.lstm is not None:
            lstm_path = os.path.join(dir_path, 'lstm.pt')
            if os.path.exists(lstm_path):
                self.lstm.load(lstm_path)
        self.is_fitted = True
        return self
