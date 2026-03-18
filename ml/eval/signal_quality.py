"""
Signal Quality Scorer
──────────────────────────────────────────────────────────────────────────────
Computes a composite [0, 1] quality score for each engine signal.
Designed to be computed from deterministic engine output only — no look-ahead,
no outcome data required.

Formula:
  signal_quality = 0.40 × confluence_strength
                 + 0.25 × regime_alignment
                 + 0.20 × flow_persistence
                 + 0.15 × level_proximity

Components:
  confluence_strength  — |confluence_score| normalised to [0,1] (max ±8)
  regime_alignment     — do gamma, vol, flow regimes point the same way as bias?
  flow_persistence     — persistence_score from adaptive engine (already [0,1])
  level_proximity      — how close price is to a key level (closer = higher risk/reward)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

# ─── Weights ──────────────────────────────────────────────────────────────────

W_CONFLUENCE  = 0.40
W_ALIGNMENT   = 0.25
W_PERSISTENCE = 0.20
W_PROXIMITY   = 0.15

MAX_CONFLUENCE = 8.0          # theoretical ±max from engine
PROXIMITY_CAP  = 0.05         # distances > 5% get score 0

# ─── Regime alignment tables ──────────────────────────────────────────────────

_GAMMA_LONG_BIAS  = {'LONG_GAMMA': 1.0, 'SHORT_GAMMA': 0.5, 'NEAR_FLIP': 0.25}
_GAMMA_SHORT_BIAS = {'SHORT_GAMMA': 1.0, 'LONG_GAMMA': 0.5, 'NEAR_FLIP': 0.25}

_FLOW_LONG_BIAS   = {'BULLISH': 1.0, 'NEUTRAL': 0.5, 'BEARISH': 0.0}
_FLOW_SHORT_BIAS  = {'BEARISH': 1.0, 'NEUTRAL': 0.5, 'BULLISH': 0.0}

_VOL_ALIGNMENT    = {'EXPANSION': 0.75, 'COMPRESSION': 1.0}  # compression favours structured moves


# ─── Scorer ───────────────────────────────────────────────────────────────────

@dataclass
class QualityComponents:
    confluence_strength: float = 0.0
    regime_alignment:    float = 0.0
    flow_persistence:    float = 0.0
    level_proximity:     float = 0.0
    total:               float = 0.0


class SignalQualityScorer:
    """Stateless scorer — call score() per signal."""

    @staticmethod
    def score(
        bias:              str,
        confluence_score:  float,
        gamma_regime:      str,
        volatility_regime: str,
        flow_direction:    str,
        persistence_score: float,
        price:             float,
        gamma_flip:        float,
        support_levels:    Optional[list[float]] = None,
        resistance_levels: Optional[list[float]] = None,
    ) -> QualityComponents:
        """
        Compute quality score from deterministic engine fields.

        Args:
            bias              : 'LONG' | 'SHORT' | 'NEUTRAL'
            confluence_score  : raw engine score [–8, +8]
            gamma_regime      : 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEAR_FLIP'
            volatility_regime : 'EXPANSION' | 'COMPRESSION'
            flow_direction    : 'BULLISH' | 'BEARISH' | 'NEUTRAL'
            persistence_score : [0, 1] from adaptive engine
            price             : current spot price
            gamma_flip        : gamma flip level
            support_levels    : list of support prices
            resistance_levels : list of resistance prices

        Returns:
            QualityComponents with individual component scores + total.
        """
        if bias == 'NEUTRAL':
            return QualityComponents()

        is_long = (bias == 'LONG')

        # ── 1. Confluence strength ─────────────────────────────────────────────
        cs = min(1.0, abs(confluence_score) / MAX_CONFLUENCE)

        # Directional penalty: wrong-sign confluence gets penalised
        if (is_long and confluence_score < 0) or (not is_long and confluence_score > 0):
            cs *= 0.4

        # ── 2. Regime alignment ────────────────────────────────────────────────
        gamma_score = (_GAMMA_LONG_BIAS if is_long else _GAMMA_SHORT_BIAS).get(gamma_regime, 0.5)
        flow_score  = (_FLOW_LONG_BIAS  if is_long else _FLOW_SHORT_BIAS ).get(flow_direction, 0.5)
        vol_score   = _VOL_ALIGNMENT.get(volatility_regime, 0.5)
        ra           = (gamma_score * 0.45 + flow_score * 0.35 + vol_score * 0.20)

        # ── 3. Flow persistence ────────────────────────────────────────────────
        fp = max(0.0, min(1.0, persistence_score))

        # ── 4. Level proximity ────────────────────────────────────────────────
        levels = [gamma_flip] if gamma_flip > 0 else []
        if support_levels:
            levels.extend(support_levels)
        if resistance_levels:
            levels.extend(resistance_levels)

        if levels and price > 0:
            dists   = [abs(price - lvl) / price for lvl in levels if lvl > 0]
            nearest = min(dists) if dists else PROXIMITY_CAP
            # Closer to level = higher potential reversal/breakout quality
            # But within 0.5% = too close = increased risk (reduce score)
            if nearest < 0.005:
                lp = 0.60   # too close — slippage risk
            elif nearest < PROXIMITY_CAP:
                lp = 1.0 - (nearest / PROXIMITY_CAP) * 0.40   # linear 1.0 → 0.60
            else:
                lp = 0.20   # far from any level
        else:
            lp = 0.50   # no level info

        # ── Weighted total ─────────────────────────────────────────────────────
        total = (W_CONFLUENCE * cs + W_ALIGNMENT * ra + W_PERSISTENCE * fp + W_PROXIMITY * lp)
        total = round(max(0.0, min(1.0, total)), 4)

        return QualityComponents(
            confluence_strength = round(cs, 4),
            regime_alignment    = round(ra, 4),
            flow_persistence    = round(fp, 4),
            level_proximity     = round(lp, 4),
            total               = total,
        )

    @staticmethod
    def score_from_dict(result: dict) -> float:
        """
        Convenience wrapper: score directly from EngineOutput.to_dict() / JS fallback dict.
        Returns only the total [0, 1].
        """
        kl = result.get('key_levels', {}) or {}
        meta = result.get('meta', {}) or {}

        comp = SignalQualityScorer.score(
            bias              = result.get('bias', 'NEUTRAL'),
            confluence_score  = float(result.get('confluence_score', 0)),
            gamma_regime      = result.get('gamma_regime', ''),
            volatility_regime = result.get('volatility_regime', ''),
            flow_direction    = result.get('flow_direction', ''),
            persistence_score = float(result.get('persistence_score', 0)),
            price             = float(meta.get('price', result.get('price', 0))),
            gamma_flip        = float(kl.get('gamma_flip', 0)),
            support_levels    = kl.get('support', []),
            resistance_levels = kl.get('resistance', []),
        )
        return comp.total
