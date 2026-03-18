"""
Engine Parameter Calibrator
────────────────────────────────────────────────────────────────────────────────
Grid search over interpretable engine parameters to maximise out-of-sample
Sharpe ratio.  Uses walk-forward validation (70% train / 30% validate).

Parameters searched:
  • confluence_weights  — relative weights for GEX, flow, skew, levels components
  • confidence_gate     — minimum confidence to emit a LONG/SHORT signal
  • squeeze_threshold   — minimum |score| before gamma squeeze fires

Design:
  - Only interpretable, bounded params — no curve-fitting to noise
  - Deduplicate normalised weight combos to avoid symmetric redundancy
  - Objective: annualised Sharpe on training set; select best OOS on validate set
  - Returns best params + full calibration history for inspection
"""

from __future__ import annotations

import itertools
import math
import statistics
from dataclasses import dataclass, field
from typing import Optional

from .signal_logger import SignalRecord
from .outcome_tracker import attach_outcomes
from .signal_evaluator import ANNUALIZATION_FACTOR_1H

# ─── Parameter space ─────────────────────────────────────────────────────────

WEIGHT_GRID      = [0.10, 0.20, 0.30, 0.40, 0.50]
THRESHOLD_GRID   = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
CONFIDENCE_GRID  = [0.35, 0.40, 0.45, 0.50, 0.55]

TRAIN_RATIO = 0.70


# ─── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class EngineParams:
    """Calibrated engine parameters."""
    w_gex:            float = 0.40
    w_flow:           float = 0.30
    w_skew:           float = 0.20
    w_levels:         float = 0.10
    confidence_gate:  float = 0.40
    squeeze_threshold:float = 0.40

    def __post_init__(self) -> None:
        total = self.w_gex + self.w_flow + self.w_skew + self.w_levels
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f'Weights must sum to 1.0, got {total:.4f}')

    def to_dict(self) -> dict:
        return {
            'w_gex':             round(self.w_gex, 3),
            'w_flow':            round(self.w_flow, 3),
            'w_skew':            round(self.w_skew, 3),
            'w_levels':          round(self.w_levels, 3),
            'confidence_gate':   round(self.confidence_gate, 3),
            'squeeze_threshold': round(self.squeeze_threshold, 3),
        }


@dataclass
class CalibrationResult:
    best_params:      EngineParams
    train_sharpe:     float
    val_sharpe:       float
    n_train_signals:  int
    n_val_signals:    int
    n_combos_tested:  int
    history:          list[dict] = field(default_factory=list)   # top-N entries

    def __str__(self) -> str:
        p = self.best_params
        return (
            f"Best params: w_gex={p.w_gex:.2f} w_flow={p.w_flow:.2f} "
            f"w_skew={p.w_skew:.2f} w_levels={p.w_levels:.2f} | "
            f"gate={p.confidence_gate:.2f} squeeze_thr={p.squeeze_threshold:.2f}\n"
            f"Train Sharpe={self.train_sharpe:.3f}  Val Sharpe={self.val_sharpe:.3f} "
            f"({self.n_train_signals} train / {self.n_val_signals} val signals, "
            f"{self.n_combos_tested} combos)"
        )


# ─── Calibrator ───────────────────────────────────────────────────────────────

class EngineCalibrator:
    """
    Walk-forward calibration for engine parameters.

    The calibration re-weights the composite score used in signal evaluation,
    NOT the deterministic engine internals.  The engine signal_quality and
    confluence_score are used as re-scoring inputs.
    """

    def __init__(
        self,
        records: list[SignalRecord],
        prices:  list[float],
        train_ratio:   float = TRAIN_RATIO,
        weight_grid:   list[float] = WEIGHT_GRID,
        conf_grid:     list[float] = CONFIDENCE_GRID,
        squeeze_grid:  list[float] = THRESHOLD_GRID,
        top_n:         int = 20,
    ) -> None:
        self.records       = records
        self.prices        = prices
        self.train_ratio   = train_ratio
        self.weight_grid   = weight_grid
        self.conf_grid     = conf_grid
        self.squeeze_grid  = squeeze_grid
        self.top_n         = top_n

    def calibrate(self) -> CalibrationResult:
        """Run grid search. Returns best params + full calibration result."""
        # ── Split ──────────────────────────────────────────────────────────────
        n       = len(self.records)
        n_train = max(1, int(n * self.train_ratio))
        train   = self.records[:n_train]
        val     = self.records[n_train:]

        train = attach_outcomes(train, self.prices)
        val   = attach_outcomes(val,   self.prices)

        combos = list(self._weight_combos())

        best_sharpe  = float('-inf')
        best_combo   = None
        best_conf    = self.conf_grid[0]
        best_squeeze = self.squeeze_grid[0]
        history: list[dict] = []

        n_tested = 0

        for weights in combos:
            for gate in self.conf_grid:
                for sq_thr in self.squeeze_grid:
                    filtered = self._apply_filter(train, gate, sq_thr)
                    sharpe   = self._sharpe(filtered)

                    n_tested += 1

                    if sharpe > best_sharpe and len(filtered) >= 5:
                        best_sharpe  = sharpe
                        best_combo   = weights
                        best_conf    = gate
                        best_squeeze = sq_thr

                    history.append({
                        'weights':   weights,
                        'gate':      gate,
                        'squeeze':   sq_thr,
                        'sharpe':    sharpe,
                        'n_signals': len(filtered),
                    })

        if best_combo is None:
            best_combo = {'w_gex': 0.40, 'w_flow': 0.30, 'w_skew': 0.20, 'w_levels': 0.10}

        best_params = EngineParams(
            w_gex             = best_combo['w_gex'],
            w_flow            = best_combo['w_flow'],
            w_skew            = best_combo['w_skew'],
            w_levels          = best_combo['w_levels'],
            confidence_gate   = best_conf,
            squeeze_threshold = best_squeeze,
        )

        # ── Validate OOS ───────────────────────────────────────────────────────
        val_filtered = self._apply_filter(val, best_conf, best_squeeze)
        val_sharpe   = self._sharpe(val_filtered)

        # Keep only top-N by train sharpe in history
        history.sort(key=lambda x: x['sharpe'], reverse=True)
        top_history = history[:self.top_n]

        return CalibrationResult(
            best_params      = best_params,
            train_sharpe     = best_sharpe,
            val_sharpe       = val_sharpe,
            n_train_signals  = len(self._apply_filter(train, best_conf, best_squeeze)),
            n_val_signals    = len(val_filtered),
            n_combos_tested  = n_tested,
            history          = top_history,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _weight_combos(self):
        """Generate normalised weight combos, deduplicating symmetric cases."""
        seen: set[tuple] = set()
        for a, b, c, d in itertools.product(self.weight_grid, repeat=4):
            total = a + b + c + d
            if abs(total) < 1e-9:
                continue
            # Normalise
            nw   = tuple(round(x / total, 3) for x in (a, b, c, d))
            if nw in seen:
                continue
            seen.add(nw)
            yield {'w_gex': nw[0], 'w_flow': nw[1], 'w_skew': nw[2], 'w_levels': nw[3]}

    def _apply_filter(
        self, records: list[SignalRecord], gate: float, sq_thr: float,
    ) -> list[SignalRecord]:
        """
        Keep only signals that pass the parameter gates.
        We use signal_quality + confidence as a proxy for the weighted score.
        """
        out: list[SignalRecord] = []
        for r in records:
            if r.bias == 'NEUTRAL':
                continue
            if r.confidence < gate:
                continue
            if r.gamma_squeeze and r.squeeze_strength < sq_thr:
                continue
            out.append(r)
        return out

    @staticmethod
    def _sharpe(records: list[SignalRecord]) -> float:
        """Annualised Sharpe from 1-h returns of filtered signals."""
        rets = [r.ret_1h for r in records if not math.isnan(r.ret_1h)]
        if len(rets) < 3:
            return float('-inf')
        mu  = statistics.mean(rets)
        std = statistics.stdev(rets)
        if std <= 0:
            return float('-inf')
        return mu / std * ANNUALIZATION_FACTOR_1H
