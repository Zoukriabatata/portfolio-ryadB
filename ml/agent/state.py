"""
Agent State — Persistent Memory
────────────────────────────────────────────────────────────────────────────
The agent maintains a rolling internal state across ticks.
This is what makes it stateful rather than a one-shot model.

Design principle: state is updated atomically at the END of each cycle,
only after all signals are computed. This prevents mid-cycle inconsistencies.

State tracks:
  1. Current regime labels (gamma / vol / flow / bias)
  2. Signal histories (for EMA smoothing and trend detection)
  3. Persistence counters (how many consecutive ticks a signal has held)
  4. Event flags (macro events, key level proximity)
  5. Change metadata (what changed, when, why)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from collections import deque
from datetime import datetime
from typing import Optional
import numpy as np


# ─── Regime enums ─────────────────────────────────────────────────────────────

class GammaRegime:
    LONG_GAMMA  = 'LONG_GAMMA'
    SHORT_GAMMA = 'SHORT_GAMMA'
    NEAR_FLIP   = 'NEAR_FLIP'

class VolRegime:
    EXPANSION   = 'EXPANSION'
    COMPRESSION = 'COMPRESSION'

class FlowState:
    BULLISH = 'BULLISH'
    BEARISH = 'BEARISH'
    NEUTRAL = 'NEUTRAL'

class Bias:
    LONG    = 'LONG'
    SHORT   = 'SHORT'
    NEUTRAL = 'NEUTRAL'

class ContextState:
    CALM          = 'CALM'
    EVENT_RISK    = 'EVENT_RISK'
    BREAKOUT_ZONE = 'BREAKOUT_ZONE'


# ─── Rolling buffer ────────────────────────────────────────────────────────────

class RollingBuffer:
    """
    Fixed-size deque with EMA and z-score utilities.
    Used for all continuous numeric signals.
    """

    def __init__(self, maxlen: int = 60):
        self._buf = deque(maxlen=maxlen)

    def push(self, value: float) -> None:
        self._buf.append(float(value))

    def ema(self, alpha: float = 0.1) -> float:
        """Exponential moving average — recent values weighted more."""
        if not self._buf:
            return 0.0
        result = self._buf[0]
        for v in list(self._buf)[1:]:
            result = alpha * v + (1 - alpha) * result
        return result

    def z_score(self) -> float:
        """Standardized current value vs rolling mean/std."""
        arr = np.array(self._buf)
        if len(arr) < 5:
            return 0.0
        return float((arr[-1] - arr.mean()) / (arr.std() + 1e-9))

    def last(self) -> float:
        return self._buf[-1] if self._buf else 0.0

    def prev(self, n: int = 1) -> float:
        buf = list(self._buf)
        idx = -(n + 1)
        return buf[idx] if len(buf) > n else 0.0

    def delta(self) -> float:
        """Change between current and previous value."""
        return self.last() - self.prev(1)

    def trend(self, n: int = 5) -> float:
        """
        Linear trend slope over last N values.
        Positive = rising, negative = falling.
        """
        buf = list(self._buf)
        if len(buf) < n:
            return 0.0
        y = np.array(buf[-n:])
        x = np.arange(n)
        return float(np.polyfit(x, y, 1)[0])

    def __len__(self) -> int:
        return len(self._buf)


# ─── Persistence counter ───────────────────────────────────────────────────────

@dataclass
class PersistenceCounter:
    """
    Counts how many consecutive ticks a categorical signal has held.
    Prevents regime labeling from flipping on single-bar spikes.

    Example: FlowState must be BULLISH for >= 3 consecutive ticks
    before we officially update the regime.
    """
    current:     str   = ''
    count:       int   = 0
    min_ticks:   int   = 3      # minimum ticks before accepting a regime change

    def update(self, new_label: str) -> bool:
        """
        Submit a new candidate label. Returns True if the regime
        officially changes (persistence threshold reached).
        """
        if new_label == self.current:
            self.count += 1
            return False

        # New label — start counting persistence
        self._pending       = new_label
        self._pending_count = getattr(self, '_pending_count', 0) + 1

        if getattr(self, '_last_pending', '') != new_label:
            self._pending_count = 1
        self._last_pending = new_label

        if self._pending_count >= self.min_ticks:
            old            = self.current
            self.current   = new_label
            self.count     = self._pending_count
            self._pending_count = 0
            return old != new_label   # True = real regime change

        return False


# ─── Agent State ───────────────────────────────────────────────────────────────

@dataclass
class AgentState:
    """
    Complete internal state of the trading agent.
    Persists across ticks. Updated atomically each cycle.
    """

    # ── Current regime labels (official — after persistence filter) ────────────
    gamma_regime:     str = GammaRegime.LONG_GAMMA
    vol_regime:       str = VolRegime.COMPRESSION
    flow_state:       str = FlowState.NEUTRAL
    bias:             str = Bias.NEUTRAL
    context_state:    str = ContextState.CALM

    # ── Confidence ────────────────────────────────────────────────────────────
    confidence:       float = 0.5

    # ── Rolling signal histories (for EMA + z-score) ──────────────────────────
    gex_history:      RollingBuffer = field(default_factory=lambda: RollingBuffer(60))
    ofi_history:      RollingBuffer = field(default_factory=lambda: RollingBuffer(60))
    rr25_history:     RollingBuffer = field(default_factory=lambda: RollingBuffer(60))
    iv_history:       RollingBuffer = field(default_factory=lambda: RollingBuffer(60))
    spread_history:   RollingBuffer = field(default_factory=lambda: RollingBuffer(30))
    flip_dist_history: RollingBuffer = field(default_factory=lambda: RollingBuffer(60))

    # ── Composite signal score history ────────────────────────────────────────
    score_history:    RollingBuffer = field(default_factory=lambda: RollingBuffer(30))

    # ── Persistence counters (noise filtering) ────────────────────────────────
    flow_persistence:  PersistenceCounter = field(default_factory=lambda: PersistenceCounter(min_ticks=3))
    gamma_persistence: PersistenceCounter = field(default_factory=lambda: PersistenceCounter(min_ticks=2))
    bias_persistence:  PersistenceCounter = field(default_factory=lambda: PersistenceCounter(min_ticks=4))

    # ── Key levels ────────────────────────────────────────────────────────────
    support_levels:    list[float] = field(default_factory=list)
    resistance_levels: list[float] = field(default_factory=list)
    gamma_flip:        float = 0.0

    # ── Event flags ──────────────────────────────────────────────────────────
    macro_event_pending: bool = False
    macro_event_name:    str  = ''
    near_key_level:      bool = False
    key_level_proximity: float = 1.0   # distance as fraction of price

    # ── Change tracking ───────────────────────────────────────────────────────
    last_change_time:   Optional[datetime] = None
    last_change_reason: str = ''
    ticks_since_change: int = 0
    total_ticks:        int = 0

    # ── Previous state snapshot (for delta detection) ─────────────────────────
    prev_bias:          str = Bias.NEUTRAL
    prev_gamma_regime:  str = GammaRegime.LONG_GAMMA
    prev_flow_state:    str = FlowState.NEUTRAL
    prev_vol_regime:    str = VolRegime.COMPRESSION
    prev_confidence:    float = 0.5

    # ── Previous raw values (for numeric delta computation) ────────────────────
    prev_spot:  float = 0.0   # last emitted spot price
    prev_rr25:  float = 0.0   # last emitted 25-delta risk reversal
    prev_ofi:   float = 0.0   # last emitted order flow imbalance

    # ── Live feed — rolling event log sent to frontend ─────────────────────────
    live_feed: deque = field(default_factory=lambda: deque(maxlen=50))

    def push_feed(self, event_type: str, message: str, severity: str, mode: str) -> None:
        """Prepend an event to the live feed (newest first)."""
        entry = {
            'time':     datetime.now().isoformat(),
            'event':    event_type,
            'message':  message,
            'severity': severity,
            'mode':     mode,
        }
        # deque.appendleft keeps newest at index 0
        self.live_feed.appendleft(entry)

    def snapshot_previous(self) -> None:
        """Save current state as previous, before updating."""
        self.prev_bias         = self.bias
        self.prev_gamma_regime = self.gamma_regime
        self.prev_flow_state   = self.flow_state
        self.prev_vol_regime   = self.vol_regime
        self.prev_confidence   = self.confidence

    def has_regime_changed(self) -> bool:
        return (
            self.bias          != self.prev_bias          or
            self.gamma_regime  != self.prev_gamma_regime  or
            self.flow_state    != self.prev_flow_state    or
            self.vol_regime    != self.prev_vol_regime
        )

    def confidence_shift_significant(self, threshold: float = 0.15) -> bool:
        return abs(self.confidence - self.prev_confidence) >= threshold

    def to_summary(self) -> str:
        return (
            f"[Tick #{self.total_ticks}] "
            f"Bias={self.bias}({self.confidence:.0%}) | "
            f"γ={self.gamma_regime} | "
            f"Flow={self.flow_state} | "
            f"Vol={self.vol_regime} | "
            f"Ctx={self.context_state}"
        )
