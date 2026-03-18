"""
XGBoost Regime Classifier
────────────────────────────────────────────────────────────────────────────
WHY XGBOOST for this problem:
  1. Tabular features (GEX, skew, flow, microstructure) are NOT sequential —
     they are cross-sectional snapshots. Tree ensembles excel here.
  2. Natural feature importance → interpretability (SHAP values supported).
  3. Handles non-linear interactions (e.g., GEX × skew regime) without
     manual feature engineering.
  4. Robust to outliers and missing values.
  5. Training is fast enough for daily/hourly refit cycles.

WHAT IT CAPTURES:
  - Non-linear interactions between GEX regime, skew slope, and flow
  - Threshold effects (e.g., GEX crosses zero → regime change)
  - Importance of each feature group (interpretability requirement)

TARGETS:
  - Regime: LONG (+1), NEUTRAL (0), SHORT (-1)
  - Confidence: probability of the predicted regime
  - Volatility regime: EXPANSION (+1) vs COMPRESSION (-1)
"""

import numpy as np
import pandas as pd
from typing import Optional
import joblib
import os

try:
    from xgboost import XGBClassifier
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False
    print("[WARN] xgboost not installed. Run: pip install xgboost")


class RegimeClassifier:
    """
    XGBoost-based market regime classifier.
    Outputs: LONG / NEUTRAL / SHORT with confidence probabilities.
    """

    # Label encoding
    LABEL_MAP    = {-1: 0, 0: 1, 1: 2}     # -1=SHORT, 0=NEUTRAL, +1=LONG
    LABEL_DECODE = {0: -1, 1: 0, 2: 1}

    def __init__(
        self,
        n_estimators:   int   = 300,
        max_depth:      int   = 5,
        learning_rate:  float = 0.05,
        subsample:      float = 0.8,
        colsample:      float = 0.7,
        min_child_weight: int = 5,          # avoid overfitting small samples
        reg_lambda:     float = 2.0,        # L2 regularization
        reg_alpha:      float = 0.5,        # L1 regularization
        random_state:   int   = 42,
    ):
        if not HAS_XGBOOST:
            raise ImportError("pip install xgboost")

        self.model = XGBClassifier(
            n_estimators     = n_estimators,
            max_depth        = max_depth,
            learning_rate    = learning_rate,
            subsample        = subsample,
            colsample_bytree = colsample,
            min_child_weight = min_child_weight,
            reg_lambda       = reg_lambda,
            reg_alpha        = reg_alpha,
            num_class        = 3,
            objective        = 'multi:softprob',
            eval_metric      = 'mlogloss',
            random_state     = random_state,
            n_jobs           = -1,
            verbosity        = 0,
        )
        self.feature_names: list[str] = []
        self.is_fitted = False

    # ── Training ─────────────────────────────────────────────────────────────

    def fit(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        eval_set: Optional[list] = None,
    ) -> 'RegimeClassifier':
        """
        Train the classifier.

        Args:
            X  : feature DataFrame (output of FeaturePipeline.transform_batch)
            y  : integer labels in {-1, 0, +1}
            eval_set: optional [(X_val, y_val)] for early stopping
        """
        self.feature_names = list(X.columns)
        y_enc = y.map(self.LABEL_MAP).astype(int)

        fit_kwargs: dict = {}
        if eval_set is not None:
            X_val, y_val = eval_set[0]
            y_val_enc = y_val.map(self.LABEL_MAP).astype(int)
            fit_kwargs['eval_set'] = [(X_val, y_val_enc)]
            fit_kwargs['verbose']  = False

        self.model.fit(X[self.feature_names], y_enc, **fit_kwargs)
        self.is_fitted = True
        return self

    # ── Inference ────────────────────────────────────────────────────────────

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict regime labels (-1, 0, +1)."""
        self._check_fitted()
        encoded = self.model.predict(X[self.feature_names])
        return np.array([self.LABEL_DECODE[e] for e in encoded])

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Return class probabilities [P(SHORT), P(NEUTRAL), P(LONG)].
        Shape: (n_samples, 3)
        """
        self._check_fitted()
        return self.model.predict_proba(X[self.feature_names])

    def predict_with_confidence(self, X: pd.DataFrame) -> dict:
        """
        Returns dict with:
            regime     : predicted label (-1, 0, +1)
            confidence : max class probability
            proba_long / proba_neutral / proba_short
        """
        proba  = self.predict_proba(X)
        labels = self.predict(X)
        conf   = proba.max(axis=1)

        return {
            'regime':        labels,
            'confidence':    conf,
            'proba_long':    proba[:, 2],
            'proba_neutral': proba[:, 1],
            'proba_short':   proba[:, 0],
        }

    # ── Interpretability (SHAP) ───────────────────────────────────────────────

    def get_feature_importance(self, top_n: int = 20) -> pd.DataFrame:
        """
        Feature importances from XGBoost (gain-based).
        For production, swap with SHAP for more reliable attribution.
        """
        self._check_fitted()
        imp = pd.DataFrame({
            'feature':    self.feature_names,
            'importance': self.model.feature_importances_,
        }).sort_values('importance', ascending=False).head(top_n)
        return imp.reset_index(drop=True)

    def get_shap_values(self, X: pd.DataFrame):
        """
        SHAP values for model explanation (requires shap package).
        Returns TreeExplainer shap_values array.
        """
        try:
            import shap
            explainer  = shap.TreeExplainer(self.model)
            shap_vals  = explainer.shap_values(X[self.feature_names])
            return shap_vals
        except ImportError:
            print("[WARN] pip install shap for SHAP explanations")
            return None

    # ── Volatility regime ────────────────────────────────────────────────────

    def predict_vol_regime(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict volatility regime: EXPANSION (+1) or COMPRESSION (-1).

        Heuristic rule-based (can be replaced with a separate classifier):
          - Short gamma + high IV rank + bearish flow → EXPANSION
          - Long gamma + low IV rank + neutral flow   → COMPRESSION
        """
        dealer_positioning = X.get('gex_dealer_positioning', pd.Series(np.zeros(len(X))))
        iv_atm             = X.get('skew_iv_atm', pd.Series(np.full(len(X), 0.2)))
        flow_regime        = X.get('flow_flow_regime', pd.Series(np.zeros(len(X))))

        expansion = (
            (dealer_positioning <= 0) &
            (iv_atm > iv_atm.median()) &
            (flow_regime != 0)
        )
        return np.where(expansion, 1, -1)

    # ── Persistence ──────────────────────────────────────────────────────────

    def save(self, path: str) -> None:
        """Persist model + metadata to disk."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump({'model': self.model, 'features': self.feature_names}, path)

    def load(self, path: str) -> 'RegimeClassifier':
        """Load model from disk."""
        data = joblib.load(path)
        self.model         = data['model']
        self.feature_names = data['features']
        self.is_fitted     = True
        return self

    def _check_fitted(self):
        if not self.is_fitted:
            raise RuntimeError("Model not fitted. Call .fit() first.")


# ─── Label generation helper ─────────────────────────────────────────────────

def generate_labels(
    prices:            pd.Series,
    lookahead_bars:    int   = 5,
    long_threshold:    float = 0.003,   # +0.3% to call LONG
    short_threshold:   float = 0.003,   # -0.3% to call SHORT
) -> pd.Series:
    """
    Generate forward-looking regime labels from price series.
    IMPORTANT: Used only during training. Never use at inference time.

    Returns pd.Series with values in {-1, 0, +1}.
    """
    # Forward return over lookahead_bars
    fwd_return = prices.pct_change(lookahead_bars).shift(-lookahead_bars)

    labels = pd.Series(0, index=prices.index)
    labels[fwd_return >  long_threshold]  =  1
    labels[fwd_return < -short_threshold] = -1

    # Drop last lookahead_bars (no future data)
    labels.iloc[-lookahead_bars:] = np.nan
    return labels


def generate_vol_labels(
    realized_vol:       pd.Series,
    lookahead_bars:     int   = 5,
    expansion_threshold: float = 0.2,   # 20% increase in RV
) -> pd.Series:
    """
    Binary labels: vol expanding (+1) or compressing (-1).
    """
    fwd_rv = realized_vol.shift(-lookahead_bars)
    change = (fwd_rv - realized_vol) / (realized_vol + 1e-9)

    labels = pd.Series(-1, index=realized_vol.index)
    labels[change > expansion_threshold] = 1
    labels.iloc[-lookahead_bars:] = np.nan
    return labels
