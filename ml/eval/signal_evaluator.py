"""
Signal Evaluator — aggregate metrics from logged signals with outcomes.
────────────────────────────────────────────────────────────────────────
Computes:
  • Win rate, average return, profit factor, Sharpe, max drawdown
  • Breakdowns by: bias, regime, dealer state, quality tier, gamma squeeze
  • MFE/MAE ratio (entry quality proxy)

Requires: SignalRecords with outcome fields filled (by OutcomeTracker).
Records with NaN ret_1h are excluded (no future data available).
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from .signal_logger import SignalRecord

ANNUALIZATION_FACTOR_1H = math.sqrt(252 * 6.5)   # 1-hour periodicity


# ─── Metrics dataclass ────────────────────────────────────────────────────────

@dataclass
class EvalMetrics:
    n_signals:      int   = 0
    n_evaluated:    int   = 0    # signals with outcomes
    win_rate:       float = float('nan')
    avg_ret_5m:     float = float('nan')
    avg_ret_15m:    float = float('nan')
    avg_ret_1h:     float = float('nan')
    avg_mfe:        float = float('nan')
    avg_mae:        float = float('nan')
    mfe_mae_ratio:  float = float('nan')   # >1 = good entries
    sharpe_1h:      float = float('nan')
    profit_factor:  float = float('nan')
    max_drawdown:   float = float('nan')
    hit_target_pct: float = float('nan')
    hit_stop_pct:   float = float('nan')

    def __str__(self) -> str:
        lines = [
            f"  Signals : {self.n_evaluated}/{self.n_signals} evaluated",
            f"  Win rate: {_pct(self.win_rate)}   Target: {_pct(self.hit_target_pct)}   Stop: {_pct(self.hit_stop_pct)}",
            f"  Returns : 5m={_fmt(self.avg_ret_5m)}  15m={_fmt(self.avg_ret_15m)}  1h={_fmt(self.avg_ret_1h)}",
            f"  MFE/MAE : {_fmt(self.mfe_mae_ratio)} (>1 = good entries)",
            f"  Sharpe  : {_fmt(self.sharpe_1h)}   PF: {_fmt(self.profit_factor)}   DD: {_pct(self.max_drawdown)}",
        ]
        return '\n'.join(lines)


def _pct(v: float) -> str:
    return f'{v*100:.1f}%' if not math.isnan(v) else 'N/A'

def _fmt(v: float) -> str:
    return f'{v:.3f}' if not math.isnan(v) else 'N/A'


# ─── Core computation ─────────────────────────────────────────────────────────

def _compute_metrics(records: list[SignalRecord]) -> EvalMetrics:
    n_total = len(records)
    evaled  = [r for r in records if not math.isnan(r.ret_1h)]

    if not evaled:
        return EvalMetrics(n_signals=n_total)

    rets_5m  = [r.ret_5m  for r in evaled if not math.isnan(r.ret_5m)]
    rets_15m = [r.ret_15m for r in evaled if not math.isnan(r.ret_15m)]
    rets_1h  = [r.ret_1h  for r in evaled]

    wins = [r for r in evaled if r.ret_1h > 0]
    mfes = [r.mfe for r in evaled if not math.isnan(r.mfe)]
    maes = [r.mae for r in evaled if not math.isnan(r.mae)]

    # Sharpe (1-h based)
    sharpe = float('nan')
    if len(rets_1h) >= 5:
        mu  = statistics.mean(rets_1h)
        std = statistics.stdev(rets_1h) if len(rets_1h) > 1 else float('nan')
        if std and std > 0:
            sharpe = mu / std * ANNUALIZATION_FACTOR_1H

    # Profit factor
    gross_win  = sum(r for r in rets_1h if r > 0)
    gross_loss = abs(sum(r for r in rets_1h if r < 0))
    pf = gross_win / gross_loss if gross_loss > 0 else float('nan')

    # Max drawdown
    dd = _max_drawdown(rets_1h)

    # MFE/MAE ratio
    avg_mfe      = statistics.mean(mfes)       if mfes else float('nan')
    avg_mae_abs  = statistics.mean([abs(m) for m in maes]) if maes else float('nan')
    mfe_mae      = avg_mfe / avg_mae_abs if (avg_mae_abs and avg_mae_abs > 0) else float('nan')

    return EvalMetrics(
        n_signals      = n_total,
        n_evaluated    = len(evaled),
        win_rate       = len(wins) / len(evaled),
        avg_ret_5m     = statistics.mean(rets_5m)  if rets_5m  else float('nan'),
        avg_ret_15m    = statistics.mean(rets_15m) if rets_15m else float('nan'),
        avg_ret_1h     = statistics.mean(rets_1h),
        avg_mfe        = avg_mfe,
        avg_mae        = statistics.mean(maes) if maes else float('nan'),
        mfe_mae_ratio  = mfe_mae,
        sharpe_1h      = sharpe,
        profit_factor  = pf,
        max_drawdown   = dd,
        hit_target_pct = sum(r.hit_target for r in evaled) / len(evaled),
        hit_stop_pct   = sum(r.hit_stop   for r in evaled) / len(evaled),
    )


def _max_drawdown(returns: list[float]) -> float:
    """Compute max drawdown from a sequence of per-trade returns."""
    if not returns:
        return float('nan')
    equity = 1.0
    peak   = 1.0
    worst  = 0.0
    for r in returns:
        equity = equity * (1 + r)
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak
        if dd > worst:
            worst = dd
    return worst


# ─── Evaluator ────────────────────────────────────────────────────────────────

class SignalEvaluator:
    """Analyse a set of SignalRecords (with outcomes attached)."""

    def __init__(self, records: list[SignalRecord]) -> None:
        self.records = records

    # ── Aggregates ─────────────────────────────────────────────────────────────

    def overall(self) -> EvalMetrics:
        return _compute_metrics(self.records)

    def filtered_quality(self, min_quality: float = 0.60) -> EvalMetrics:
        return _compute_metrics([r for r in self.records if r.signal_quality >= min_quality])

    # ── Breakdowns ─────────────────────────────────────────────────────────────

    def by_bias(self) -> dict[str, EvalMetrics]:
        return {
            bias: _compute_metrics([r for r in self.records if r.bias == bias])
            for bias in ('LONG', 'SHORT', 'NEUTRAL')
        }

    def by_regime(self) -> dict[str, EvalMetrics]:
        regimes = {r.regime for r in self.records if r.regime}
        return {reg: _compute_metrics([r for r in self.records if r.regime == reg]) for reg in regimes}

    def by_dealer_state(self) -> dict[str, EvalMetrics]:
        states = {r.dealer_state for r in self.records if r.dealer_state}
        return {s: _compute_metrics([r for r in self.records if r.dealer_state == s]) for s in states}

    def by_quality_tier(self) -> dict[str, EvalMetrics]:
        tiers = {
            'high'  : [r for r in self.records if r.signal_quality >= 0.70],
            'medium': [r for r in self.records if 0.45 <= r.signal_quality < 0.70],
            'low'   : [r for r in self.records if r.signal_quality < 0.45],
        }
        return {k: _compute_metrics(v) for k, v in tiers.items()}

    def by_gamma_squeeze(self) -> dict[str, EvalMetrics]:
        return {
            'squeeze'   : _compute_metrics([r for r in self.records if r.gamma_squeeze]),
            'no_squeeze': _compute_metrics([r for r in self.records if not r.gamma_squeeze]),
        }

    def by_gamma_regime(self) -> dict[str, EvalMetrics]:
        regimes = {r.gamma_regime for r in self.records if r.gamma_regime}
        return {
            reg: _compute_metrics([r for r in self.records if r.gamma_regime == reg])
            for reg in regimes
        }

    # ── Full report ────────────────────────────────────────────────────────────

    def full_report(self) -> dict:
        return {
            'overall':          self.overall(),
            'filtered_quality': self.filtered_quality(),
            'by_bias':          self.by_bias(),
            'by_regime':        self.by_regime(),
            'by_gamma_regime':  self.by_gamma_regime(),
            'by_dealer_state':  self.by_dealer_state(),
            'by_quality_tier':  self.by_quality_tier(),
            'by_gamma_squeeze': self.by_gamma_squeeze(),
        }
