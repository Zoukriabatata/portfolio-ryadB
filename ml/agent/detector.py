"""
Event Detector — Regime Change & Signal Event Detection
────────────────────────────────────────────────────────────────────────────
The detector evaluates whether the current tick represents a MEANINGFUL EVENT
that warrants emitting a new signal output.

Guiding principle: 95% of ticks should produce NO output.
Only emit when at least one of these events occurs:

  1. GAMMA REGIME CHANGE   — GEX crosses zero / crosses near-flip zone
  2. FLOW FLIP             — OFI direction reverses and persists
  3. SKEW SHIFT            — |Δ RR25| > threshold (significant sentiment shift)
  4. PRICE AT KEY LEVEL    — spot within proximity_pct of support/resistance
  5. MACRO EVENT APPROACH  — T-minus N minutes before known event
  6. ACCELERATION          — signal strengthening (trend gaining momentum)
  7. EXHAUSTION            — signal weakening after strong move (reversal risk)
  8. BREAKOUT              — price crosses gamma flip or key level

Each event has a severity level: HIGH / MEDIUM / LOW
Only HIGH and MEDIUM events trigger output by default.
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from .state import AgentState, GammaRegime, ContextState


# ─── Event types ─────────────────────────────────────────────────────────────

@dataclass
class DetectedEvent:
    event_type:  str     # e.g. 'GAMMA_REGIME_CHANGE'
    severity:    str     # 'HIGH' | 'MEDIUM' | 'LOW'
    description: str
    delta:       float   # magnitude of change (0 if categorical)


# ─── Macro event schedule ────────────────────────────────────────────────────

@dataclass
class MacroEvent:
    name:       str
    scheduled:  datetime
    vol_impact: float    # expected IV expansion (e.g. 0.03 = +3 vols)

    def minutes_until(self) -> float:
        return (self.scheduled - datetime.now()).total_seconds() / 60


class MacroCalendar:
    """Holds upcoming macro events and detects proximity."""

    def __init__(self, events: list[MacroEvent] = None):
        self.events = events or []

    def add(self, name: str, scheduled: datetime, vol_impact: float = 0.02) -> None:
        self.events.append(MacroEvent(name, scheduled, vol_impact))

    def get_imminent(self, warn_minutes: float = 30.0) -> Optional[MacroEvent]:
        """Return the most imminent event if within warn_minutes, else None."""
        now = datetime.now()
        upcoming = [
            e for e in self.events
            if 0 <= (e.scheduled - now).total_seconds() / 60 <= warn_minutes
        ]
        if not upcoming:
            return None
        return min(upcoming, key=lambda e: e.minutes_until())

    def get_context_state(self, warn_minutes: float = 30.0) -> str:
        event = self.get_imminent(warn_minutes)
        if event:
            return ContextState.EVENT_RISK
        return ContextState.CALM


# ─── Change detector ─────────────────────────────────────────────────────────

class ChangeDetector:
    """
    Evaluates each new tick against the current AgentState and returns
    a list of detected events (may be empty = no output needed).

    Thresholds are calibrated to avoid over-signaling while catching
    real regime changes quickly.
    """

    # Detection thresholds
    SKEW_SHIFT_THRESHOLD    = 1.5     # |Δ RR25| in percent to flag skew shift
    CONFIDENCE_SHIFT_MIN    = 0.15    # Δconfidence to trigger re-emit
    KEY_LEVEL_PROXIMITY     = 0.003   # within 0.3% of key level
    FLIP_PROXIMITY          = 0.005   # within 0.5% of gamma flip
    OFI_REVERSAL_THRESHOLD  = 0.25    # OFI must flip by this much to be a signal
    SCORE_ACCEL_THRESHOLD   = 0.20    # composite score must accelerate by this

    def __init__(self, macro_calendar: Optional[MacroCalendar] = None):
        self.calendar = macro_calendar or MacroCalendar()

    def detect(
        self,
        state:    AgentState,
        tick:     dict,
        new_bias: str,
        new_gamma_regime: str,
        new_flow_state:   str,
        new_vol_regime:   str,
        new_confidence:   float,
        new_score:        float,
        spot:             float,
    ) -> list[DetectedEvent]:
        """
        Compare new computed values against state.
        Returns list of DetectedEvent (empty = no meaningful change).
        """
        events: list[DetectedEvent] = []

        # ── 1. Gamma regime change ────────────────────────────────────────────
        if new_gamma_regime != state.gamma_regime:
            severity = 'HIGH'
            events.append(DetectedEvent(
                event_type='GAMMA_REGIME_CHANGE',
                severity=severity,
                description=(
                    f"Gamma regime: {state.gamma_regime} → {new_gamma_regime}. "
                    f"Dealer hedging behavior shifts — "
                    + ('mean-reversion dynamics now active.'
                       if new_gamma_regime == 'LONG_GAMMA'
                       else 'trend amplification risk now elevated.')
                ),
                delta=0.0,
            ))

        # ── 2. Bias change (direction flip) ───────────────────────────────────
        if new_bias != state.bias and state.bias != 'NEUTRAL' and new_bias != 'NEUTRAL':
            events.append(DetectedEvent(
                event_type='BIAS_REVERSAL',
                severity='HIGH',
                description=f"Bias REVERSED: {state.bias} → {new_bias}",
                delta=0.0,
            ))
        elif new_bias != state.bias:
            events.append(DetectedEvent(
                event_type='BIAS_CHANGE',
                severity='MEDIUM',
                description=f"Bias shifted: {state.bias} → {new_bias} (conf={new_confidence:.0%})",
                delta=0.0,
            ))

        # ── 3. Flow flip ─────────────────────────────────────────────────────
        if new_flow_state != state.flow_state:
            if state.flow_state != 'NEUTRAL' and new_flow_state != 'NEUTRAL':
                severity = 'HIGH'
            else:
                severity = 'MEDIUM'
            events.append(DetectedEvent(
                event_type='FLOW_FLIP',
                severity=severity,
                description=f"Option flow reversed: {state.flow_state} → {new_flow_state}",
                delta=float(tick.get('order_flow_imbalance', 0)),
            ))

        # ── 4. Skew shift ─────────────────────────────────────────────────────
        rr25_now  = tick.get('risk_reversal_25d', 0)
        rr25_prev = state.rr25_history.prev(1)
        skew_delta = abs(rr25_now - rr25_prev)
        if skew_delta >= self.SKEW_SHIFT_THRESHOLD:
            events.append(DetectedEvent(
                event_type='SKEW_SHIFT',
                severity='MEDIUM',
                description=(
                    f"Skew shifted {skew_delta:+.1f}% (RR25: {rr25_prev:.1f}% → {rr25_now:.1f}%). "
                    + ('Bearish sentiment building.' if rr25_now < rr25_prev
                       else 'Fear subsiding, risk-on skew.')
                ),
                delta=rr25_now - rr25_prev,
            ))

        # ── 5. Price at key level ─────────────────────────────────────────────
        for lvl in state.support_levels + state.resistance_levels:
            if lvl > 0:
                dist = abs(spot - lvl) / spot
                if dist <= self.KEY_LEVEL_PROXIMITY:
                    lvl_type = 'SUPPORT' if lvl < spot else 'RESISTANCE'
                    events.append(DetectedEvent(
                        event_type='KEY_LEVEL_TOUCH',
                        severity='MEDIUM',
                        description=f"Price (${spot:.2f}) approaching {lvl_type} ${lvl:.2f} ({dist*100:.2f}% away)",
                        delta=dist,
                    ))

        # ── 6. Gamma flip proximity ───────────────────────────────────────────
        if state.gamma_flip > 0:
            flip_dist = abs(spot - state.gamma_flip) / spot
            was_near  = state.key_level_proximity <= self.FLIP_PROXIMITY
            is_near   = flip_dist <= self.FLIP_PROXIMITY
            if is_near and not was_near:
                events.append(DetectedEvent(
                    event_type='NEAR_GAMMA_FLIP',
                    severity='HIGH',
                    description=(
                        f"Price (${spot:.2f}) within {flip_dist*100:.2f}% of gamma flip ${state.gamma_flip:.2f}. "
                        "Regime instability — potential for accelerated move in either direction."
                    ),
                    delta=flip_dist,
                ))

        # ── 7. Gamma flip CROSS ───────────────────────────────────────────────
        if state.gamma_flip > 0:
            prev_spot = state.flip_dist_history.prev(1)
            if prev_spot != 0:
                was_above = prev_spot >= 0
                is_above  = (spot - state.gamma_flip) >= 0
                if was_above != is_above:
                    events.append(DetectedEvent(
                        event_type='GAMMA_FLIP_CROSS',
                        severity='HIGH',
                        description=(
                            f"Price CROSSED gamma flip at ${state.gamma_flip:.2f}. "
                            "Regime switch from "
                            + ('stabilizing to destabilizing.' if not is_above
                               else 'destabilizing to stabilizing.')
                        ),
                        delta=spot - state.gamma_flip,
                    ))

        # ── 8. Macro event approach ───────────────────────────────────────────
        event = self.calendar.get_imminent(warn_minutes=15)
        if event:
            mins = event.minutes_until()
            if mins <= 15 and not state.macro_event_pending:
                events.append(DetectedEvent(
                    event_type='MACRO_EVENT_IMMINENT',
                    severity='HIGH',
                    description=(
                        f"MACRO: {event.name} in {mins:.0f} min. "
                        f"Expected vol impact: +{event.vol_impact*100:.0f} vols. "
                        "Reduce directional exposure until release."
                    ),
                    delta=event.vol_impact,
                ))

        # ── 9. Signal acceleration ────────────────────────────────────────────
        score_trend = state.score_history.trend(5)
        score_now   = new_score
        score_prev  = state.score_history.last()
        accel = abs(score_now - score_prev)
        if accel >= self.SCORE_ACCEL_THRESHOLD and len(state.score_history) >= 5:
            direction = 'accelerating' if abs(score_now) > abs(score_prev) else 'decelerating'
            events.append(DetectedEvent(
                event_type='SIGNAL_ACCELERATION',
                severity='MEDIUM',
                description=f"Signal {direction}: composite score {score_prev:+.2f} → {score_now:+.2f}",
                delta=accel,
            ))

        # ── 10. Volatility regime change ──────────────────────────────────────
        if new_vol_regime != state.vol_regime:
            events.append(DetectedEvent(
                event_type='VOL_REGIME_CHANGE',
                severity='MEDIUM',
                description=f"Volatility regime: {state.vol_regime} → {new_vol_regime}",
                delta=0.0,
            ))

        # ── 11. Confidence gap after no change ────────────────────────────────
        if (abs(new_confidence - state.confidence) >= self.CONFIDENCE_SHIFT_MIN
                and not events):
            events.append(DetectedEvent(
                event_type='CONFIDENCE_SHIFT',
                severity='LOW',
                description=f"Confidence: {state.confidence:.0%} → {new_confidence:.0%}",
                delta=new_confidence - state.confidence,
            ))

        return events

    def should_emit(self, events: list[DetectedEvent]) -> bool:
        """
        Return True only if at least one HIGH or MEDIUM event was detected.
        LOW events alone do not trigger output.
        """
        return any(e.severity in ('HIGH', 'MEDIUM') for e in events)

    def build_reason(self, events: list[DetectedEvent]) -> str:
        """Summarize all detected events into a single reason string."""
        if not events:
            return 'No significant change detected.'
        high   = [e for e in events if e.severity == 'HIGH']
        medium = [e for e in events if e.severity == 'MEDIUM']
        # Lead with high severity
        parts  = [e.description for e in (high + medium)[:3]]
        return ' | '.join(parts)
