"""
Outcome Tracker — attach forward returns and excursions to logged signals.
──────────────────────────────────────────────────────────────────────────
Given a list of SignalRecords and a corresponding price series, computes:
  • ret_5m, ret_15m, ret_1h   — directional forward returns
  • mfe                        — max favorable excursion (best price in window)
  • mae                        — max adverse excursion (worst price in window)
  • hit_target                 — price moved ≥ TARGET_R × atr in bias direction
  • hit_stop                   — price moved ≥ STOP_R   × atr against bias

Assumptions:
  • Price series is indexed by bar_index (integer, 0-based)
  • Each bar = 1 period (caller decides period length)
  • LONG bias:  positive return = favorable
  • SHORT bias: negative return = favorable
  • 1-bar fill delay after signal bar
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

from .signal_logger import SignalRecord

# ─── Config ───────────────────────────────────────────────────────────────────

BARS_5M  = 1     # number of bars for ~5-minute horizon (caller sets bar size)
BARS_15M = 3
BARS_1H  = 12
FILL_LAG = 1     # fill on bar after signal

TARGET_R = 1.5   # ATR multiples for target
STOP_R   = 1.0   # ATR multiples for stop
ATR_BARS = 14    # bars for ATR estimate


# ─── Outcome dataclass ────────────────────────────────────────────────────────

@dataclass
class Outcome:
    bar_index:   int
    entry_price: float
    ret_5m:      float = float('nan')
    ret_15m:     float = float('nan')
    ret_1h:      float = float('nan')
    mfe:         float = float('nan')   # as fraction of entry
    mae:         float = float('nan')
    hit_target:  bool  = False
    hit_stop:    bool  = False


# ─── Core functions ───────────────────────────────────────────────────────────

def compute_outcome(
    signal: SignalRecord,
    prices: Sequence[float],
    bars_5m:  int = BARS_5M,
    bars_15m: int = BARS_15M,
    bars_1h:  int = BARS_1H,
    fill_lag: int = FILL_LAG,
    atr_bars: int = ATR_BARS,
    target_r: float = TARGET_R,
    stop_r:   float = STOP_R,
) -> Optional[Outcome]:
    """
    Compute outcome for a single signal given the full price series.

    Args:
        signal  : SignalRecord with bar_index set
        prices  : Sequence of close prices indexed by bar
        bars_*  : Look-forward windows (in bars)
        fill_lag: How many bars after signal before fill

    Returns:
        Outcome, or None if not enough future bars.
    """
    entry_bar = signal.bar_index + fill_lag
    if entry_bar >= len(prices):
        return None

    entry = prices[entry_bar]
    if entry <= 0:
        return None

    direction = 1.0 if signal.bias == 'LONG' else (-1.0 if signal.bias == 'SHORT' else 0.0)
    if direction == 0.0:
        return None   # NEUTRAL signals not evaluated for returns

    outcome = Outcome(bar_index=signal.bar_index, entry_price=entry)

    # ── Forward returns ────────────────────────────────────────────────────────
    for horizon, attr in [(bars_5m, 'ret_5m'), (bars_15m, 'ret_15m'), (bars_1h, 'ret_1h')]:
        target_bar = entry_bar + horizon
        if target_bar < len(prices):
            raw_ret = (prices[target_bar] - entry) / entry
            setattr(outcome, attr, direction * raw_ret)

    # ── MFE / MAE ─────────────────────────────────────────────────────────────
    window_end = min(entry_bar + bars_1h + 1, len(prices))
    window     = prices[entry_bar:window_end]
    if window:
        hi = max(window)
        lo = min(window)
        if direction > 0:
            outcome.mfe = (hi - entry) / entry
            outcome.mae = (lo - entry) / entry   # negative = adverse for LONG
        else:
            outcome.mfe =  (entry - lo) / entry
            outcome.mae =  (entry - hi) / entry  # negative = adverse for SHORT

    # ── ATR estimate (prior bars) ──────────────────────────────────────────────
    atr_start = max(0, entry_bar - atr_bars)
    atr_window = prices[atr_start:entry_bar + 1]
    if len(atr_window) >= 2:
        ranges = [abs(atr_window[i] - atr_window[i - 1]) for i in range(1, len(atr_window))]
        atr    = sum(ranges) / len(ranges)
    else:
        atr    = entry * 0.005   # 0.5% fallback

    atr_frac = atr / entry if entry > 0 else 0.005

    # ── Hit target / stop ─────────────────────────────────────────────────────
    window_end_1h = min(entry_bar + bars_1h + 1, len(prices))
    for bar_price in prices[entry_bar:window_end_1h]:
        move = direction * (bar_price - entry) / entry
        if move >= target_r * atr_frac:
            outcome.hit_target = True
        if move <= -stop_r * atr_frac:
            outcome.hit_stop = True

    return outcome


def attach_outcomes(
    records: list[SignalRecord],
    prices:  Sequence[float],
    **kwargs,
) -> list[SignalRecord]:
    """
    Attach outcome fields in-place to all records.

    `prices` must be indexed by bar — use the same bar_index that was used
    when logging signals.  Records without a resolvable outcome are left with
    NaN forward returns (they are excluded by evaluators that require outcomes).
    """
    for rec in records:
        outcome = compute_outcome(rec, prices, **kwargs)
        if outcome is None:
            continue
        rec.ret_5m     = outcome.ret_5m
        rec.ret_15m    = outcome.ret_15m
        rec.ret_1h     = outcome.ret_1h
        rec.mfe        = outcome.mfe
        rec.mae        = outcome.mae
        rec.hit_target = outcome.hit_target
        rec.hit_stop   = outcome.hit_stop
    return records


def _simple_atr(prices: Sequence[float], period: int = ATR_BARS) -> list[float]:
    """Compute simple bar-to-bar ATR for each bar index."""
    result = [0.0] * len(prices)
    for i in range(1, len(prices)):
        start  = max(0, i - period)
        window = [abs(prices[j] - prices[j - 1]) for j in range(start + 1, i + 1)]
        result[i] = sum(window) / len(window) if window else 0.0
    return result
