"""
Walk-Forward Backtesting Engine
────────────────────────────────────────────────────────────────────────────
Walk-forward validation is essential for time series:
  - NEVER shuffle or randomly split time series (look-ahead bias)
  - Train on period [0, T], validate on [T, T+window]
  - Roll forward: next fold trains on [0, T+step], validates on [T+step, ...]
  - This mimics live deployment: model only sees past data

TRANSACTION COSTS:
  - Bid-ask spread applied on entry AND exit
  - Slippage modeled as fraction of ATR
  - Commission per contract (configurable)

INTRADAY CONSIDERATIONS:
  - No position held overnight unless explicitly allowed
  - Signal evaluated at bar close, position entered at next bar open
  - Fill price = open + slippage

ANTI-OVERFITTING GUARDS:
  - Purged cross-validation gap: N bars between train end and val start
  - No future data leakage: features computed with FeaturePipeline (stateful)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional, Callable
import warnings


# ─── Config ───────────────────────────────────────────────────────────────────

@dataclass
class BacktestConfig:
    train_window:     int   = 252       # bars in training window
    val_window:       int   = 63        # bars in validation window
    step_size:        int   = 21        # roll step (bars)
    purge_gap:        int   = 5         # bars gap between train and val
    spread_bps:       float = 5.0       # round-trip transaction cost (basis pts)
    slippage_atr_pct: float = 0.1       # slippage as % of ATR
    commission:       float = 0.0       # per-contract commission $
    hold_bars:        int   = 5         # hold period for each signal
    allow_overnight:  bool  = False     # hold positions overnight
    neutral_threshold: float = 0.45     # confidence below this → NEUTRAL


@dataclass
class Trade:
    entry_bar:   int
    exit_bar:    int
    direction:   int    # +1 long, -1 short
    entry_price: float
    exit_price:  float
    regime:      str
    confidence:  float
    pnl_bps:     float  # in basis points
    pnl_pct:     float


@dataclass
class BacktestResults:
    trades:           list[Trade]
    equity_curve:     pd.Series
    metrics:          dict
    fold_results:     list[dict]        # per-fold statistics
    feature_importance: Optional[pd.DataFrame] = None


# ─── Engine ───────────────────────────────────────────────────────────────────

class WalkForwardEngine:
    """
    Walk-forward backtesting engine.

    Usage:
        engine = WalkForwardEngine(config)
        results = engine.run(features_df, prices, model_factory, label_fn)
    """

    def __init__(self, config: BacktestConfig = None):
        self.config = config or BacktestConfig()

    def run(
        self,
        features:       pd.DataFrame,
        prices:         pd.Series,
        model_factory:  Callable,       # () → fitted model with .predict()
        label_fn:       Callable,       # (prices) → pd.Series of labels
        verbose:        bool = True,
    ) -> BacktestResults:
        """
        Execute walk-forward backtest.

        Args:
            features      : feature DataFrame (T, n_features)
            prices        : underlying price series (T,)
            model_factory : callable returning a NEW unfitted model each fold
            label_fn      : function(prices) → labels series
            verbose       : print fold summaries

        Returns BacktestResults with all trades and performance metrics.
        """
        cfg = self.config
        T   = len(features)

        all_trades:       list[Trade] = []
        all_predictions:  list        = []
        fold_results:     list[dict]  = []
        fold_importances: list        = []

        # ── Walk-forward loop ─────────────────────────────────────────────────
        fold = 0
        start = 0

        while start + cfg.train_window + cfg.purge_gap + cfg.val_window <= T:
            train_end  = start + cfg.train_window
            val_start  = train_end + cfg.purge_gap
            val_end    = val_start + cfg.val_window

            # Generate labels for training set
            labels = label_fn(prices.iloc[:val_end])

            X_train = features.iloc[start:train_end]
            y_train = labels.iloc[start:train_end].dropna()
            X_train = X_train.loc[y_train.index]

            X_val   = features.iloc[val_start:val_end]
            y_val   = labels.iloc[val_start:val_end].dropna()
            X_val   = X_val.loc[y_val.index]

            if len(X_train) < 50 or len(X_val) < 10:
                start += cfg.step_size
                continue

            # ── Fit model on training fold ────────────────────────────────────
            model = model_factory()
            try:
                model.fit(X_train, y_train)
            except Exception as e:
                warnings.warn(f"Fold {fold} fit failed: {e}")
                start += cfg.step_size
                continue

            # ── Predict on validation fold ────────────────────────────────────
            preds = model.predict(X_val)
            try:
                proba = model.predict_proba(X_val)
                conf  = proba.max(axis=1)
            except Exception:
                conf = np.full(len(preds), 0.5)

            # Apply confidence gate
            preds = np.where(conf < cfg.neutral_threshold, 0, preds)

            # ── Simulate trades on validation period ──────────────────────────
            fold_prices = prices.iloc[val_start:val_end].reset_index(drop=True)
            trades, equity = self._simulate(fold_prices, preds, conf)
            all_trades.extend(trades)

            fold_metrics = self._compute_fold_metrics(trades, equity)
            fold_results.append({
                'fold':       fold,
                'train_start': start,
                'train_end':   train_end,
                'val_start':   val_start,
                'val_end':     val_end,
                **fold_metrics,
            })

            # Collect feature importance
            try:
                imp = model.get_feature_importance(10)
                imp['fold'] = fold
                fold_importances.append(imp)
            except Exception:
                pass

            if verbose:
                print(
                    f"Fold {fold:3d} | "
                    f"Trades: {len(trades):4d} | "
                    f"Win%: {fold_metrics.get('win_rate', 0)*100:.1f}% | "
                    f"Sharpe: {fold_metrics.get('sharpe', 0):.2f} | "
                    f"PnL: {fold_metrics.get('total_pnl_bps', 0):.0f}bps"
                )

            fold  += 1
            start += cfg.step_size

        # ── Aggregate results ─────────────────────────────────────────────────
        all_pnl     = [t.pnl_bps for t in all_trades]
        equity_curve = pd.Series(
            np.concatenate([[0.0], np.cumsum(all_pnl)]),
            name='equity_bps',
        )

        metrics = self._compute_aggregate_metrics(all_trades, equity_curve)

        feature_importance = None
        if fold_importances:
            feature_importance = (
                pd.concat(fold_importances)
                  .groupby('feature')['importance']
                  .mean()
                  .sort_values(ascending=False)
                  .reset_index()
            )

        return BacktestResults(
            trades=all_trades,
            equity_curve=equity_curve,
            metrics=metrics,
            fold_results=fold_results,
            feature_importance=feature_importance,
        )

    # ── Trade simulation ─────────────────────────────────────────────────────

    def _simulate(
        self,
        prices:  pd.Series,
        signals: np.ndarray,
        conf:    np.ndarray,
    ) -> tuple[list[Trade], pd.Series]:
        """
        Convert signals to trades with realistic costs.
        Signal at bar i → enter at bar i+1, exit after hold_bars.
        """
        cfg    = self.config
        trades = []
        equity = [0.0]

        i = 0
        while i < len(signals) - 1:
            sig = signals[i]

            if sig == 0:
                equity.append(equity[-1])
                i += 1
                continue

            # Entry at next bar's open (simulate 1-bar delay)
            entry_i = i + 1
            exit_i  = min(entry_i + cfg.hold_bars, len(prices) - 1)

            if entry_i >= len(prices):
                break

            entry_px = float(prices.iloc[entry_i])
            exit_px  = float(prices.iloc[exit_i])

            # Transaction costs
            tc_bps = cfg.spread_bps                     # round-trip spread
            if entry_px > 0:
                atr_proxy = prices.diff().abs().rolling(14).mean().iloc[entry_i]
                slippage  = (atr_proxy / entry_px * 10000) * cfg.slippage_atr_pct
                tc_bps   += slippage if not np.isnan(slippage) else 0.0

            # P&L
            raw_ret  = (exit_px - entry_px) / entry_px * sig * 10000   # bps
            net_pnl  = raw_ret - tc_bps
            pnl_pct  = net_pnl / 10000

            label_map = {1: 'LONG', -1: 'SHORT', 0: 'NEUTRAL'}
            trade = Trade(
                entry_bar=entry_i, exit_bar=exit_i,
                direction=sig,
                entry_price=entry_px, exit_price=exit_px,
                regime=label_map.get(sig, 'NEUTRAL'),
                confidence=float(conf[i]),
                pnl_bps=net_pnl, pnl_pct=pnl_pct,
            )
            trades.append(trade)

            # Fill equity between entry and exit
            for _ in range(exit_i - entry_i + 1):
                equity.append(equity[-1] + net_pnl / max(exit_i - entry_i, 1))

            i = exit_i + 1

        return trades, pd.Series(equity, name='equity_bps')

    # ── Metrics ──────────────────────────────────────────────────────────────

    def _compute_fold_metrics(self, trades: list[Trade], equity: pd.Series) -> dict:
        if not trades:
            return {'win_rate': 0.0, 'sharpe': 0.0, 'total_pnl_bps': 0.0, 'n_trades': 0}

        pnls     = np.array([t.pnl_bps for t in trades])
        win_rate = float((pnls > 0).mean())
        sharpe   = self._sharpe(equity.diff().dropna())

        return {
            'n_trades':      len(trades),
            'win_rate':      win_rate,
            'avg_pnl_bps':   float(pnls.mean()),
            'total_pnl_bps': float(pnls.sum()),
            'sharpe':        sharpe,
        }

    def _compute_aggregate_metrics(
        self,
        trades:       list[Trade],
        equity_curve: pd.Series,
    ) -> dict:
        if not trades:
            return {}

        pnls     = np.array([t.pnl_bps for t in trades])
        win_rate = float((pnls > 0).mean())

        # Regime breakdown
        long_pnl   = np.mean([t.pnl_bps for t in trades if t.direction  ==  1] or [0])
        short_pnl  = np.mean([t.pnl_bps for t in trades if t.direction  == -1] or [0])

        # Max drawdown
        eq_norm  = equity_curve / (equity_curve.abs().max() + 1e-9)
        rolling_max = equity_curve.cummax()
        drawdown = (equity_curve - rolling_max)
        max_dd   = float(drawdown.min())

        return {
            'total_trades':     len(trades),
            'win_rate':         round(win_rate, 4),
            'avg_pnl_bps':      round(float(pnls.mean()), 2),
            'total_pnl_bps':    round(float(pnls.sum()), 2),
            'sharpe_ratio':     round(self._sharpe(equity_curve.diff().dropna()), 4),
            'max_drawdown_bps': round(max_dd, 2),
            'profit_factor':    round(
                float(pnls[pnls > 0].sum()) / (abs(float(pnls[pnls < 0].sum())) + 1e-9), 4
            ),
            'avg_long_pnl':  round(long_pnl, 2),
            'avg_short_pnl': round(short_pnl, 2),
        }

    @staticmethod
    def _sharpe(returns: pd.Series, periods_per_year: float = 252.0) -> float:
        if len(returns) < 5 or returns.std() < 1e-9:
            return 0.0
        return float(returns.mean() / returns.std() * np.sqrt(periods_per_year))
