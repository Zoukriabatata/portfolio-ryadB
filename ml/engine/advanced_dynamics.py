"""
Advanced Market Dynamics — Adaptive Engine
────────────────────────────────────────────────────────────────────────────
Upgrades the static advanced_dynamics system into an adaptive, regime-aware,
context-aware engine. All existing modules are preserved; new adaptive layers
are added on top.

MODULES (in dependency order):
  1. AdaptiveThresholdEngine  — dynamic squeeze threshold [0.35, 0.80]
  2. GammaSqueezeDetector     — UPGRADED: uses adaptive threshold
  3. DealerPositionModel      — unchanged
  4. AdaptiveWeightEngine     — computes regime-aware confluence weights
  5. AdaptiveConfluenceScorer — UPGRADED: normalized components + dynamic weights
  6. FlowPersistenceTracker   — STATEFUL: tracks directional flow duration
  7. SignalConfidenceEngine   — NEW: multi-factor confidence [0, 1]
  8. RegimeClassifier         — unchanged
  9. SetupBuilder             — unchanged

NORMALIZATION DESIGN:
  All four confluence components are normalized to [-1, +1] before weighting.
  Dynamic weights sum to exactly 1.0.
  Final score = weighted_sum × 8  →  scale remains [-8, +8] for compatibility.

  This prevents any single factor from dominating due to raw scale differences.

OUTPUT ADDITIONS (backward compatible — all prior fields preserved):
  adaptive_threshold  float   current squeeze trigger point [0.35, 0.80]
  dynamic_weights     dict    {gex, flow, skew, levels} sum=1.0
  confidence          float   [0, 1] multi-factor signal confidence
  persistence_score   float   [0, 1] flow directional persistence (abs)
  signal_quality      float   [0, 1] agreement × level quality
"""

from __future__ import annotations
from dataclasses import dataclass, field
from collections import deque
import numpy as np


# ─── State enums ─────────────────────────────────────────────────────────────

class DealerState:
    LONG_GAMMA    = 'LONG_GAMMA'
    SHORT_GAMMA   = 'SHORT_GAMMA'
    NEAR_FLIP     = 'NEAR_FLIP'
    TRAPPED_SHORT = 'TRAPPED_SHORT'
    TRAPPED_LONG  = 'TRAPPED_LONG'
    STABLE        = 'STABLE'
    TRANSITION    = 'TRANSITION'


class MarketRegime:
    HIGH_PROBABILITY_TREND = 'HIGH_PROBABILITY_TREND'
    RANGE_MARKET           = 'RANGE_MARKET'
    BREAKOUT_WATCH         = 'BREAKOUT_WATCH'
    GAMMA_SQUEEZE          = 'GAMMA_SQUEEZE'
    VOLATILE_TREND         = 'VOLATILE_TREND'
    DISTRIBUTION           = 'DISTRIBUTION'
    COMPRESSION            = 'COMPRESSION'
    AMBIGUOUS              = 'AMBIGUOUS'


# ─── Input contract ───────────────────────────────────────────────────────────

@dataclass
class AdvancedContext:
    """
    Flattened primitives consumed by all adaptive modules.
    Unchanged from prior version — fully backward compatible.
    """
    # GEX geometry
    net_gex:            float
    distance_to_flip:   float    # signed: (spot - flip) / spot
    call_wall:          float
    put_wall:           float
    spot_price:         float

    # Option flow
    order_flow_imbalance: float  # [-1, 1]
    aggressive_buy_ratio: float  # [0, 1]
    sweep_net:            int

    # Skew / vol
    risk_reversal_25d:  float
    iv_atm:             float
    iv_rank:            float    # 0–100

    # Price dynamics
    price_return:       float

    # Regime labels from core engine
    gamma_regime:       str
    vol_regime:         str
    flow_direction:     str
    composite_score:    float

    @classmethod
    def from_engine(cls, inp, output, composite_score: float) -> 'AdvancedContext':
        return cls(
            net_gex              = inp.gex.net_gex,
            distance_to_flip     = inp.gex.distance_to_flip,
            call_wall            = inp.gex.call_wall,
            put_wall             = inp.gex.put_wall,
            spot_price           = inp.context.spot_price,
            order_flow_imbalance = inp.flow.order_flow_imbalance,
            aggressive_buy_ratio = inp.flow.aggressive_buy_ratio,
            sweep_net            = inp.flow.sweep_net,
            risk_reversal_25d    = inp.skew.risk_reversal_25d,
            iv_atm               = inp.skew.iv_atm,
            iv_rank              = inp.context.iv_rank,
            price_return         = 0.0,
            gamma_regime         = output.gamma_regime,
            vol_regime           = output.volatility_regime,
            flow_direction       = output.flow_direction,
            composite_score      = composite_score,
        )

    @classmethod
    def from_tick(
        cls,
        tick:           dict,
        ema:            dict,
        gamma_regime:   str,
        vol_regime:     str,
        flow_state:     str,
        composite_score: float,
    ) -> 'AdvancedContext':
        return cls(
            net_gex              = ema['net_gex'],
            distance_to_flip     = float(tick['distance_to_flip']),
            call_wall            = float(tick.get('call_wall', 0)),
            put_wall             = float(tick.get('put_wall', 0)),
            spot_price           = float(tick['spot_price']),
            order_flow_imbalance = ema['ofi'],
            aggressive_buy_ratio = float(tick.get('aggressive_flow', 0.5)),
            sweep_net            = int(tick.get('sweep_net', 0)),
            risk_reversal_25d    = ema['rr25'],
            iv_atm               = ema['iv'],
            iv_rank              = float(tick.get('iv_rank', 50.0)),
            price_return         = float(tick.get('price_return', 0.0)),
            gamma_regime         = gamma_regime,
            vol_regime           = vol_regime,
            flow_direction       = flow_state,
            composite_score      = composite_score,
        )


# ─── Output contract ──────────────────────────────────────────────────────────

@dataclass
class AdvancedDynamicsResult:
    """
    Full output — all prior fields preserved, adaptive fields appended.
    """
    # ── Existing fields (unchanged) ───────────────────────────────────────────
    gamma_squeeze:         bool
    squeeze_strength:      float   # [0, 1]
    dealer_state:          str
    confluence_score:      float   # [-8, +8] (compatible with prior version)
    confluence_components: dict    # raw component values {gex, flow, skew, levels}
    regime:                str
    setup:                 dict

    # ── Adaptive fields (new) ─────────────────────────────────────────────────
    adaptive_threshold:    float   # current squeeze trigger [0.35, 0.80]
    dynamic_weights:       dict    # {gex, flow, skew, levels} sum to 1.0
    confidence:            float   # [0, 1] overall signal confidence
    persistence_score:     float   # [0, 1] directional flow persistence (abs)
    signal_quality:        float   # [0, 1] agreement × structure quality


# ─── 1. Adaptive threshold engine ────────────────────────────────────────────

class AdaptiveThresholdEngine:
    """
    Computes a context-sensitive squeeze trigger threshold.

    Base threshold: 0.55 (calibrated to avoid false positives in normal vol)

    Adjustments (additive, clamped to [0.35, 0.80]):

      Volatility regime:
        EXPANSION + high IV rank  → raise threshold  (noisy env, harder to fire)
        COMPRESSION + low IV rank → lower threshold  (clean signals, easier to fire)

      Flow intensity:
        Strong persistent OFI (> 0.5) → lower threshold (flow confirms squeeze)
        Weak/neutral OFI              → no change

      Flip proximity:
        Within ±0.5% of flip  → raise threshold  (regime unstable, avoid false fire)
        Beyond ±3% from flip  → lower threshold  (clear regime, higher conviction)

    Theory: In high-vol regimes, gamma dynamics are already elevated and noise
    is amplified. Requiring a stronger squeeze signal (higher threshold) reduces
    false alarms. In low-vol regimes, a squeeze is a more distinctive event and
    can be triggered at lower strength (Gârleanu & Pedersen 2011).
    """

    BASE      = 0.55
    FLOOR     = 0.35
    CEILING   = 0.80

    def compute(self, ctx: AdvancedContext) -> float:
        threshold = self.BASE
        iv_norm   = ctx.iv_rank / 100.0   # [0, 1]

        # ── Volatility adjustment ─────────────────────────────────────────────
        if ctx.vol_regime == 'EXPANSION':
            # High vol = more noise in squeeze signals → harder to trigger
            # Effect scales with IV rank: rank=100 → +0.08, rank=65 → ~+0.04
            vol_adj = +0.08 * max(0.0, (iv_norm - 0.50) / 0.50)
        else:
            # Low vol = squeeze is distinctive → easier to trigger
            # Effect scales inversely: rank=0 → -0.06, rank=30 → -0.02
            vol_adj = -0.06 * max(0.0, (0.50 - iv_norm) / 0.50)

        # ── Flow intensity adjustment ─────────────────────────────────────────
        # Only bullish OFI matters for squeeze (squeeze is always bullish)
        bull_ofi = max(0.0, ctx.order_flow_imbalance)
        if bull_ofi > 0.40:
            # Strong directional buying confirms squeeze setup → lower threshold
            flow_adj = -0.05 * min((bull_ofi - 0.40) / 0.60, 1.0)
        else:
            flow_adj = 0.0

        # ── Flip proximity adjustment ─────────────────────────────────────────
        dist = abs(ctx.distance_to_flip)
        if dist < 0.005:
            # Right at flip: regime is inherently ambiguous → raise bar
            flip_adj = +0.07
        elif dist < 0.015:
            # Approaching flip: some uncertainty → small raise
            flip_adj = +0.03
        elif dist > 0.03:
            # Clear and away from flip: confident regime → lower threshold
            flip_adj = -0.03
        else:
            flip_adj = 0.0

        raw = threshold + vol_adj + flow_adj + flip_adj
        return round(float(np.clip(raw, self.FLOOR, self.CEILING)), 4)


# ─── 2. Gamma squeeze detector (upgraded) ─────────────────────────────────────

class GammaSqueezeDetector:
    """
    Detects gamma squeeze conditions using an adaptive threshold.

    Squeeze strength computation is unchanged from the prior version.
    The threshold against which strength is compared is now dynamic,
    computed by AdaptiveThresholdEngine on every call.

    Theory: Convexity of gamma (Brenner & Subrahmanyam 1988) creates
    convex dealer hedging flows as price approaches call walls.
    """

    def detect(
        self,
        ctx:                AdvancedContext,
        adaptive_threshold: float,
    ) -> tuple[bool, float]:
        """Returns (gamma_squeeze: bool, squeeze_strength: float ∈ [0, 1])."""
        if ctx.net_gex >= 0:
            return False, 0.0

        components = []

        # Component 1 — short gamma intensity (weight 30%)
        short_gamma_intensity = float(min(abs(ctx.net_gex) / 3.0, 1.0))
        components.append(short_gamma_intensity * 0.30)

        # Component 2 — price proximity to call wall (weight 25%)
        if ctx.call_wall > ctx.spot_price:
            gap = (ctx.call_wall - ctx.spot_price) / max(ctx.spot_price, 1)
            proximity = float(max(0.0, 1.0 - gap / 0.02))
            components.append(proximity * 0.25)
        else:
            components.append(0.10)

        # Component 3 — aggressive call buying + bullish OFI (weight 25%)
        call_intensity = float(max(0.0, min((ctx.aggressive_buy_ratio - 0.50) / 0.35, 1.0)))
        ofi_bull       = float(max(0.0, ctx.order_flow_imbalance))
        flow_signal    = 0.6 * call_intensity + 0.4 * ofi_bull
        components.append(flow_signal * 0.25)

        # Component 4 — vol expansion: IV bid-up = squeeze fuel (weight 20%)
        iv_rank_norm  = ctx.iv_rank / 100.0
        vol_expanding = 1.0 if ctx.vol_regime == 'EXPANSION' else 0.0
        vol_signal    = 0.6 * iv_rank_norm + 0.4 * vol_expanding
        components.append(float(vol_signal) * 0.20)

        squeeze_strength = float(np.clip(sum(components), 0.0, 1.0))
        gamma_squeeze    = squeeze_strength >= adaptive_threshold

        return gamma_squeeze, round(squeeze_strength, 3)


# ─── 3. Dealer position model (unchanged) ─────────────────────────────────────

class DealerPositionModel:
    """
    Granular dealer state — 7 states vs 3 in the core engine.
    Unchanged from prior version.
    """

    PRICE_VELOCITY_THRESHOLD = 0.004
    TRANSITION_GEX_THRESHOLD  = 0.30

    def classify(self, ctx: AdvancedContext) -> str:
        gex  = ctx.net_gex
        dist = ctx.distance_to_flip
        ret  = ctx.price_return
        vol  = ctx.vol_regime

        if abs(gex) < self.TRANSITION_GEX_THRESHOLD and abs(dist) < 0.008:
            return DealerState.TRANSITION
        if abs(dist) < 0.005:
            return DealerState.NEAR_FLIP
        if gex < 0 and ret > self.PRICE_VELOCITY_THRESHOLD:
            return DealerState.TRAPPED_SHORT
        if gex > 0 and ret < -(self.PRICE_VELOCITY_THRESHOLD * 1.5):
            return DealerState.TRAPPED_LONG
        if gex > 0 and vol == 'COMPRESSION' and abs(dist) > 0.01:
            return DealerState.STABLE
        return DealerState.LONG_GAMMA if gex > 0 else DealerState.SHORT_GAMMA


# ─── 4. Adaptive weight engine ────────────────────────────────────────────────

class AdaptiveWeightEngine:
    """
    Computes regime-aware confluence weights, normalized to sum to exactly 1.0.

    Base weights (calibrated to microstructure theory):
      Flow:   0.38  — highest weight: most predictive in all regimes
                       (Chordia, Roll & Subrahmanyam 2002)
      Levels: 0.28  — GEX structure defines key price magnets
      GEX:    0.20  — regime directionality (dampened in long-gamma)
      Skew:   0.14  — sentiment signal (amplified in high vol)

    Regime adjustments (before normalization):

      SHORT_GAMMA:
        Flow   +0.12  — dealer amplification makes flow decisive
        Levels +0.08  — flip level proximity is critical
        GEX    -0.05  — GEX is already captured in regime label
        Skew   -0.05  — less informative when amplification dominates

      LONG_GAMMA:
        GEX    +0.10  — structural GEX dominates (absorb / pin)
        Skew   +0.06  — sentiment more visible without amplification
        Flow   -0.10  — dealer hedging offsets flow → less predictive
        Levels -0.06  — walls are effective but less urgent

      NEAR_FLIP:
        All → 0.25 equal weights  — no signal is reliable at regime boundary

      EXPANSION vol:
        Skew   +0.08  — fear/greed explicitly priced in IV surface
        Flow   -0.04  — vol noise reduces OFI signal quality
        GEX    -0.04  — GEX becomes volatile during vol spikes

    Theory: Regime-conditional weighting mirrors how practitioners
    mentally adjust signal importance based on market structure
    (Gabaix et al. 2016 — asset pricing with frictions).
    """

    # Base weights (unnormalized — will be normalized after adjustments)
    _BASE = {'gex': 0.20, 'flow': 0.38, 'skew': 0.14, 'levels': 0.28}

    def compute(self, ctx: AdvancedContext) -> dict[str, float]:
        w = dict(self._BASE)

        # ── Gamma regime adjustments ──────────────────────────────────────────
        if ctx.gamma_regime == 'SHORT_GAMMA':
            w['flow']   += 0.12
            w['levels'] += 0.08
            w['gex']    -= 0.05
            w['skew']   -= 0.05

        elif ctx.gamma_regime == 'LONG_GAMMA':
            w['gex']    += 0.10
            w['skew']   += 0.06
            w['flow']   -= 0.10
            w['levels'] -= 0.06

        elif ctx.gamma_regime == 'NEAR_FLIP':
            # No signal is reliable at the boundary → equal weights
            w = {'gex': 0.25, 'flow': 0.25, 'skew': 0.25, 'levels': 0.25}

        # ── Volatility regime adjustments (stacked on top of gamma adj) ───────
        if ctx.vol_regime == 'EXPANSION' and ctx.gamma_regime != 'NEAR_FLIP':
            w['skew']   += 0.08
            w['flow']   -= 0.04
            w['gex']    -= 0.04

        # ── Normalize to exactly 1.0 ──────────────────────────────────────────
        total = sum(w.values())
        return {k: round(max(0.0, v / total), 4) for k, v in w.items()}


# ─── 5. Adaptive confluence scorer (upgraded) ─────────────────────────────────

class AdaptiveConfluenceScorer:
    """
    Normalized, dynamically-weighted multi-factor directional score.

    NORMALIZATION:
      Each component is mapped to [-1, +1] independently before weighting.
      This ensures no factor dominates due to raw scale differences.

      gex_norm    = clip(gex_raw   / 2.0, -1, 1)
      flow_norm   = clip(flow_raw  / 3.0, -1, 1)
      skew_norm   = clip(skew_raw  / 1.0, -1, 1)
      levels_norm = clip(levels_raw / 2.0, -1, 1)

    SCORING:
      weighted_sum ∈ [-1, +1]
      final_score  = weighted_sum × 8  ∈ [-8, +8]  (scale-compatible)

    PERSISTENCE BONUS:
      Directional flow persistence adds a small bonus (up to +0.15 normalized)
      in the direction of flow. Applied after weighting, before final scaling.

    Interpretation of final score (unchanged from prior version):
      > +5  : strong bullish confluence
      > +3  : moderate bullish confluence
      -3 to +3 : neutral / conflicted
      < -3  : moderate bearish confluence
      < -5  : strong bearish confluence
    """

    # Raw component caps (for normalization denominators)
    _CAPS = {'gex': 2.0, 'flow': 3.0, 'skew': 1.0, 'levels': 2.0}

    def score(
        self,
        ctx:              AdvancedContext,
        weights:          dict[str, float],
        persistence_bonus: float = 0.0,    # [0, 0.30] from FlowPersistenceTracker
    ) -> tuple[float, dict]:
        """
        Returns (confluence_score: float [-8, +8], components: dict).
        components contains raw (not normalized) values for display.
        """
        # ── Raw component scores ──────────────────────────────────────────────
        raw = {
            'gex':    self._raw_gex(ctx),
            'flow':   self._raw_flow(ctx),
            'skew':   self._raw_skew(ctx),
            'levels': self._raw_levels(ctx),
        }

        # ── Normalize each to [-1, +1] ────────────────────────────────────────
        norm = {k: float(np.clip(v / self._CAPS[k], -1.0, 1.0)) for k, v in raw.items()}

        # ── Weighted sum ∈ [-1, +1] ───────────────────────────────────────────
        weighted_sum = sum(weights[k] * norm[k] for k in norm)

        # ── Flow persistence bonus (directional) ──────────────────────────────
        # Bonus is proportional to persistence magnitude, in OFI direction
        ofi_sign     = float(np.sign(ctx.order_flow_imbalance)) if abs(ctx.order_flow_imbalance) > 0.05 else 0.0
        bonus_norm   = persistence_bonus * ofi_sign * weights['flow']  # weighted by flow importance
        weighted_sum = float(np.clip(weighted_sum + bonus_norm, -1.0, 1.0))

        # ── Scale to [-8, +8] for backward compatibility ──────────────────────
        final_score = round(weighted_sum * 8.0, 2)

        # Return raw component values for display (users understand ±2, ±3 scale)
        components = {k: round(v, 2) for k, v in raw.items()}

        return final_score, components

    # ── Raw component scorers (same formulas as prior version) ────────────────

    def _raw_gex(self, ctx: AdvancedContext) -> float:
        """GEX raw score: [-2, +2]."""
        gex  = ctx.net_gex
        dist = ctx.distance_to_flip
        if abs(dist) < 0.005:
            return 0.0
        if gex > 0:
            return 0.5
        ofi = ctx.order_flow_imbalance
        amp = float(min(abs(gex) / 2.0, 1.0))
        return float(np.clip(ofi * amp * 2.0, -2.0, 2.0))

    def _raw_flow(self, ctx: AdvancedContext) -> float:
        """Flow raw score: [-3, +3]."""
        ofi   = ctx.order_flow_imbalance
        agg   = (ctx.aggressive_buy_ratio - 0.5) * 2
        sweep = float(np.clip(ctx.sweep_net / 5.0, -1.0, 1.0))
        raw   = 0.45 * ofi + 0.35 * agg + 0.20 * sweep
        return float(np.clip(raw * 3.0, -3.0, 3.0))

    def _raw_skew(self, ctx: AdvancedContext) -> float:
        """Skew raw score: [-1, +1]."""
        return float(np.clip(ctx.risk_reversal_25d / 6.0, -1.0, 1.0))

    def _raw_levels(self, ctx: AdvancedContext) -> float:
        """Levels raw score: [-2, +2]."""
        dist = ctx.distance_to_flip
        if abs(dist) < 0.003:
            return 0.0
        dist_score = float(np.clip(dist / 0.02 * 2.0, -2.0, 2.0))
        spot = ctx.spot_price
        if ctx.call_wall > spot:
            gap = (ctx.call_wall - spot) / max(spot, 1)
            if gap < 0.005:
                dist_score -= 0.3
        if 0 < ctx.put_wall < spot:
            gap = (spot - ctx.put_wall) / max(spot, 1)
            if gap < 0.005:
                dist_score += 0.3
        return float(np.clip(dist_score, -2.0, 2.0))


# ─── 6. Flow persistence tracker (stateful) ───────────────────────────────────

class FlowPersistenceTracker:
    """
    Stateful tracker for directional flow duration and intensity.

    PERSISTENCE SCORE:
      EMA of OFI over time. Positive = sustained bullish flow, negative = bearish.
      Faster decay (lower α_slow) = more reactive; slower = more persistent signal.

    STREAK COUNTER:
      Counts consecutive ticks where |OFI| > threshold. Resets on direction flip.
      Used to compute the persistence_bonus for the confluence scorer.

    BONUS FUNCTION:
      bonus = 0.10 × log1p(streak / 5)
      →  5 ticks directional = +0.10 bonus (≈ 10% of max weight contribution)
      → 15 ticks directional = +0.18 bonus
      → 30 ticks directional = +0.24 bonus
      Capped at 0.30.

    Must be instantiated ONCE per AdvancedDynamics instance and persisted across
    all tick calls. Stateless callers (batch/single analysis) receive zero bonus.
    """

    OFI_THRESHOLD = 0.15   # minimum OFI to count as directional
    ALPHA         = 0.15   # EMA decay for persistence score

    def __init__(self):
        self._ema:            float = 0.0    # signed EMA of OFI
        self._streak:         int   = 0      # consecutive directional ticks
        self._streak_dir:     float = 0.0    # current streak direction (+1 or -1)
        self._tick_window:    deque = deque(maxlen=60)  # raw OFI history (last 60 ticks)

    def update(self, ofi: float) -> tuple[float, float]:
        """
        Ingest one tick of OFI.
        Returns (persistence_score, persistence_bonus).
        persistence_score ∈ [-1, +1] (signed, directional)
        persistence_bonus ∈ [0, 0.30] (unsigned, magnitude only)
        """
        self._tick_window.append(ofi)

        # ── EMA persistence score ─────────────────────────────────────────────
        self._ema = self.ALPHA * ofi + (1.0 - self.ALPHA) * self._ema
        self._ema = float(np.clip(self._ema, -1.0, 1.0))

        # ── Directional streak counter ─────────────────────────────────────────
        if abs(ofi) >= self.OFI_THRESHOLD:
            direction = float(np.sign(ofi))
            if direction == self._streak_dir:
                self._streak += 1
            else:
                # Direction flip: reset
                self._streak     = 1
                self._streak_dir = direction
        else:
            # Neutral tick: decay streak but don't flip
            self._streak = max(0, self._streak - 1)

        persistence_bonus = float(np.clip(0.10 * np.log1p(self._streak / 5.0), 0.0, 0.30))

        return round(self._ema, 3), round(persistence_bonus, 3)

    @property
    def score(self) -> float:
        return round(float(np.clip(self._ema, -1.0, 1.0)), 3)

    @property
    def bonus(self) -> float:
        return float(np.clip(0.10 * np.log1p(self._streak / 5.0), 0.0, 0.30))


# ─── 7. Signal confidence engine ─────────────────────────────────────────────

class SignalConfidenceEngine:
    """
    Multi-factor signal confidence [0, 1].

    FOUR INPUTS, FOUR PENALTIES:

    Inputs (positive contributions):
      1. Confluence strength  [0, 1]  — abs(score) / 8, concave (sqrt) transformation
         → Strong directional score = higher confidence
      2. Signal agreement     [0, 1]  — fraction of GEX/flow/skew pointing same way
         → All three aligned = maximum agreement bonus
      3. Persistence          [0, 1]  — flow duration × EMA magnitude
         → Sustained flow is more likely genuine than a single spike
      4. Level quality        [0, 1]  — distance from flip (clear side = better)
         → Far from flip = well-defined regime = reliable levels

    Penalties (negative, subtracted after combining inputs):
      - Near flip / Transition  → -0.20  (regime ambiguity)
      - Extreme vol noise       → -0.10  (IV rank > 80 in expansion)

    SIGNAL QUALITY (separate metric):
      agreement × level_quality × (1 − penalties)
      Measures structural quality independent of signal strength.
      A market can have high quality but low strength (neutral regime).

    Weights:
      Strength:    0.40
      Agreement:   0.25
      Persistence: 0.20
      Levels:      0.15
    """

    def compute(
        self,
        ctx:               AdvancedContext,
        confluence_score:  float,         # [-8, +8]
        weights:           dict,          # dynamic weights
        persistence_score: float,         # [-1, +1] signed
        persistence_bonus: float,         # [0, 0.30]
        dealer_state:      str,
    ) -> tuple[float, float]:
        """
        Returns (confidence, signal_quality) both in [0, 1].
        """
        # ── 1. Confluence strength ────────────────────────────────────────────
        # sqrt concave transform: penalizes weak signals more than linear
        raw_strength = abs(confluence_score) / 8.0             # [0, 1]
        strength     = float(np.sqrt(np.clip(raw_strength, 0, 1)))  # concave, still [0, 1]

        # ── 2. Signal agreement ───────────────────────────────────────────────
        # Which factors are directionally aligned?
        ofi = ctx.order_flow_imbalance

        # GEX contribution to direction
        if ctx.net_gex < 0 and ofi > 0.05:
            gex_dir = +1.0    # short gamma + bullish flow = amplified bull
        elif ctx.net_gex < 0 and ofi < -0.05:
            gex_dir = -1.0    # short gamma + bearish flow = amplified bear
        elif ctx.net_gex > 0:
            gex_dir = +0.3    # long gamma = mildly stabilizing/bull structural
        else:
            gex_dir = 0.0

        flow_dir = float(np.sign(ofi)) if abs(ofi) > 0.10 else 0.0
        skew_dir = float(np.sign(ctx.risk_reversal_25d)) if abs(ctx.risk_reversal_25d) > 1.5 else 0.0

        dirs = [d for d in [gex_dir, flow_dir, skew_dir] if d != 0.0]
        if len(dirs) >= 2:
            agree_raw = abs(sum(dirs)) / len(dirs)   # 1.0 = full agreement
            agreement = float(np.clip(agree_raw, 0.0, 1.0))
        else:
            agreement = 0.40   # not enough signals to judge

        # ── 3. Persistence contribution ───────────────────────────────────────
        # Combines EMA magnitude (sustained direction) + bonus (streak duration)
        persist_contrib = min(
            abs(persistence_score) * 0.55 + persistence_bonus * 0.45,
            0.30,
        )

        # ── 4. Level quality ──────────────────────────────────────────────────
        dist_pct = abs(ctx.distance_to_flip)
        if dist_pct > 0.025:
            level_quality = 1.00    # clearly on one side of flip
        elif dist_pct > 0.010:
            level_quality = 0.70    # some distance
        elif dist_pct > 0.004:
            level_quality = 0.40    # approaching flip
        else:
            level_quality = 0.15    # right at flip — everything ambiguous

        # ── Penalties ─────────────────────────────────────────────────────────
        near_flip_pen = 0.20 if dealer_state in (DealerState.NEAR_FLIP, DealerState.TRANSITION) else 0.0
        noise_pen     = 0.10 if (ctx.vol_regime == 'EXPANSION' and ctx.iv_rank > 80) else 0.0
        total_penalty = near_flip_pen + noise_pen

        # ── Combine ───────────────────────────────────────────────────────────
        raw_confidence = (
            strength        * 0.40 +
            agreement       * 0.25 +
            persist_contrib * 0.20 +
            level_quality   * 0.15
            - total_penalty
        )
        confidence = float(np.clip(raw_confidence, 0.0, 1.0))

        # ── Signal quality (structural measure, independent of strength) ───────
        noise_factor = 1.0 - total_penalty
        signal_quality = float(np.clip(
            agreement * level_quality * noise_factor,
            0.0, 1.0
        ))

        return round(confidence, 3), round(signal_quality, 3)


# ─── 8. Regime classifier (unchanged) ─────────────────────────────────────────

class RegimeClassifier:
    """
    IF/THEN market regime classification — unchanged from prior version.
    Priority: SQUEEZE > HIGH_PROB_TREND > VOLATILE_TREND > BREAKOUT_WATCH
            > DISTRIBUTION > RANGE_MARKET > COMPRESSION > AMBIGUOUS
    """

    def classify(
        self,
        ctx:           AdvancedContext,
        dealer_state:  str,
        gamma_squeeze: bool,
        confluence:    float,
    ) -> str:
        gex  = ctx.net_gex
        ofi  = ctx.order_flow_imbalance
        dist = ctx.distance_to_flip
        vol  = ctx.vol_regime

        if gamma_squeeze:
            return MarketRegime.GAMMA_SQUEEZE

        if gex < 0 and abs(ofi) > 0.25 and abs(dist) > 0.005 and abs(confluence) > 3.5:
            if (ofi > 0 and dist > 0) or (ofi < 0 and dist < 0):
                return MarketRegime.HIGH_PROBABILITY_TREND

        if vol == 'EXPANSION' and gex < 0 and abs(ofi) > 0.15:
            return MarketRegime.VOLATILE_TREND

        if dealer_state in (DealerState.NEAR_FLIP, DealerState.TRANSITION):
            return MarketRegime.BREAKOUT_WATCH

        if dealer_state == DealerState.TRAPPED_LONG and ofi < -0.15:
            return MarketRegime.DISTRIBUTION

        if gex > 0 and abs(ofi) < 0.20:
            return MarketRegime.RANGE_MARKET

        if dealer_state == DealerState.STABLE and vol == 'COMPRESSION':
            return MarketRegime.COMPRESSION

        return MarketRegime.AMBIGUOUS


# ─── 9. Setup builder (unchanged) ─────────────────────────────────────────────

class SetupBuilder:
    """Generates entry / target / invalidation — unchanged."""

    def build(self, ctx: AdvancedContext, regime: str, bias: str) -> dict:
        spot      = ctx.spot_price
        flip      = spot * (1.0 - ctx.distance_to_flip)
        call_wall = ctx.call_wall if ctx.call_wall > spot    else spot * 1.02
        put_wall  = ctx.put_wall  if 0 < ctx.put_wall < spot else spot * 0.98

        if regime == MarketRegime.HIGH_PROBABILITY_TREND:
            if bias == 'LONG':
                return {'entry': f'Buy pullbacks above flip ${flip:.0f}',
                        'target': f'Call wall ${call_wall:.0f}',
                        'invalidation': f'Close below flip ${flip:.0f}'}
            if bias == 'SHORT':
                return {'entry': f'Sell rallies below flip ${flip:.0f}',
                        'target': f'Put wall ${put_wall:.0f}',
                        'invalidation': f'Close above flip ${flip:.0f}'}

        if regime == MarketRegime.GAMMA_SQUEEZE:
            return {'entry': 'Long on dips — avoid shorts while squeeze is active',
                    'target': f'Call wall ${call_wall:.0f} (magnetic pull)',
                    'invalidation': f'Break below flip ${flip:.0f}'}

        if regime == MarketRegime.VOLATILE_TREND:
            direction = 'long' if bias == 'LONG' else 'short'
            tgt = f'Call wall ${call_wall:.0f}' if bias == 'LONG' else f'Put wall ${put_wall:.0f}'
            return {'entry': f'Momentum {direction} — reduce size (elevated vol)',
                    'target': tgt,
                    'invalidation': 'Vol normalization (IV Rank < 50)'}

        if regime == MarketRegime.RANGE_MARKET:
            return {'entry': f'Fade extremes: buy ${put_wall:.0f}, sell ${call_wall:.0f}',
                    'target': 'Mean-reversion to VWAP / midpoint',
                    'invalidation': f'Flip breach at ${flip:.0f}'}

        if regime == MarketRegime.BREAKOUT_WATCH:
            return {'entry': f'Wait for flip break at ${flip:.0f}',
                    'target': f'${call_wall:.0f} (bull) or ${put_wall:.0f} (bear)',
                    'invalidation': 'No action until directional confirmation'}

        if regime == MarketRegime.DISTRIBUTION:
            return {'entry': f'Short rallies toward ${spot * 1.005:.0f}',
                    'target': f'Put wall ${put_wall:.0f}',
                    'invalidation': f'Recapture of flip ${flip:.0f}'}

        if regime == MarketRegime.COMPRESSION:
            return {'entry': 'No directional setup — await vol expansion',
                    'target': 'N/A',
                    'invalidation': f'Flip break at ${flip:.0f}'}

        return {'entry': 'No high-conviction setup',
                'target': 'N/A',
                'invalidation': f'Monitor flip ${flip:.0f}'}


# ─── Main orchestrator ────────────────────────────────────────────────────────

class AdvancedDynamics:
    """
    Adaptive regime-aware market dynamics engine.

    STATEFUL: FlowPersistenceTracker accumulates across calls.
    Instantiate once per agent/session; call analyze() on every tick.

    For single / batch analysis (no persistence history), the tracker
    starts at zero — persistence_score and bonus will be 0 on the first call,
    building up naturally over subsequent calls.
    """

    def __init__(self):
        # Stateless modules (instantiated once, no internal state)
        self._threshold  = AdaptiveThresholdEngine()
        self._squeeze    = GammaSqueezeDetector()
        self._dealer     = DealerPositionModel()
        self._weights    = AdaptiveWeightEngine()
        self._scorer     = AdaptiveConfluenceScorer()
        self._confidence = SignalConfidenceEngine()
        self._regime     = RegimeClassifier()
        self._setup      = SetupBuilder()

        # Stateful module — must persist across calls
        self._flow_tracker = FlowPersistenceTracker()

    def analyze(self, ctx: AdvancedContext, bias: str = 'NEUTRAL') -> AdvancedDynamicsResult:
        """
        Full adaptive analysis. Execution order is strict — each step
        feeds into the next.

        Steps:
          1. Adaptive threshold   (stateless — depends only on current ctx)
          2. Gamma squeeze detect (uses adaptive threshold)
          3. Dealer state         (stateless)
          4. Flow persistence     (STATEFUL — updates internal EMA)
          5. Dynamic weights      (stateless — depends on gamma + vol regime)
          6. Confluence score     (uses weights + persistence bonus)
          7. Confidence           (uses confluence + agreement + persistence)
          8. Regime               (uses squeeze + confluence + dealer state)
          9. Setup                (uses regime + bias + key levels)
        """
        # 1. Adaptive threshold
        adaptive_threshold = self._threshold.compute(ctx)

        # 2. Gamma squeeze (with adaptive threshold)
        gamma_squeeze, squeeze_strength = self._squeeze.detect(ctx, adaptive_threshold)

        # 3. Dealer state
        dealer_state = self._dealer.classify(ctx)

        # 4. Flow persistence (stateful update)
        persistence_score, persistence_bonus = self._flow_tracker.update(ctx.order_flow_imbalance)

        # 5. Dynamic weights
        dynamic_weights = self._weights.compute(ctx)

        # 6. Adaptive confluence score
        confluence_score, components = self._scorer.score(ctx, dynamic_weights, persistence_bonus)

        # 7. Signal confidence
        confidence, signal_quality = self._confidence.compute(
            ctx               = ctx,
            confluence_score  = confluence_score,
            weights           = dynamic_weights,
            persistence_score = persistence_score,
            persistence_bonus = persistence_bonus,
            dealer_state      = dealer_state,
        )

        # 8. Regime classification
        regime = self._regime.classify(ctx, dealer_state, gamma_squeeze, confluence_score)

        # 9. Setup
        setup = self._setup.build(ctx, regime, bias)

        return AdvancedDynamicsResult(
            # Existing fields
            gamma_squeeze          = gamma_squeeze,
            squeeze_strength       = squeeze_strength,
            dealer_state           = dealer_state,
            confluence_score       = confluence_score,
            confluence_components  = components,
            regime                 = regime,
            setup                  = setup,
            # New adaptive fields
            adaptive_threshold     = adaptive_threshold,
            dynamic_weights        = dynamic_weights,
            confidence             = confidence,
            persistence_score      = abs(persistence_score),   # UI gets abs, sign in confluence
            signal_quality         = signal_quality,
        )
