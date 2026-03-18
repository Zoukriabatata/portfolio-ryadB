"""
Analysis Engine — Layer 2
────────────────────────────────────────────────────────────────────────────
This is the core of the system. It receives structured features from
Layer 1 (Data Engine), applies signal logic + ML scoring, and returns
a strict JSON output for Layer 3 (Chat Assistant) and the UI.

DESIGN CONTRACT:
  - Input:  EngineInput (fully validated)
  - Output: EngineOutput (strict JSON schema)
  - Stateless per request (no UI state, no conversation context)
  - Deterministic given the same input (except ML model version)

SIGNAL COMBINATION:
  Each rule and the ML scorer produce a score ∈ [-1, +1] and a weight.
  The final composite score is:

    composite = Σ (score_i × weight_i × fired_i) / Σ weight_i

  This is a weighted average that:
    - Upweights high-importance rules (GEX×Flow = 1.8)
    - Downweights low-liquidity conditions (microstructure dampening)
    - Allows rules to partially cancel each other (no forced alignment)

CONFIDENCE:
  Confidence is derived from:
    1. Spread of scores (all rules agree → high confidence)
    2. ML model probability (if available)
    3. Penalties for: near flip, low liquidity, 0DTE, conflicting signals
"""

from __future__ import annotations
import numpy as np
import json
from typing import Optional

from .schemas import (
    EngineInput, EngineOutput, KeyLevels,
    Bias, GammaRegime, VolRegime, FlowDirection,
)
from .signal_logic import (
    RuleResult,
    rule_gamma_regime,
    rule_gex_flow_interaction,
    rule_skew_signal,
    rule_skew_flow_alignment,
    rule_microstructure_regime,
    rule_sweep_momentum,
    rule_volatility_regime,
    rule_0dte_gamma_risk,
)
from .ml_scorer import MLScorer
from .advanced_dynamics import AdvancedDynamics, AdvancedContext


# ─── Engine ───────────────────────────────────────────────────────────────────

class AnalysisEngine:
    """
    Options Market Analysis Engine — Layer 2.

    Usage:
        engine = AnalysisEngine()                          # rule-based only
        engine = AnalysisEngine(model_dir='ml/saved/')    # with ML scoring

        output = engine.analyze(input_data)
        print(output.to_json())
    """

    # Weight of ML scorer relative to rules
    ML_WEIGHT = 1.5

    def __init__(
        self,
        model_dir:      Optional[str]  = None,
        min_confidence: float          = 0.35,
        use_ml:         bool           = True,
    ):
        self.min_confidence = min_confidence
        self.scorer   = MLScorer(model_dir) if use_ml else None
        self.advanced = AdvancedDynamics()

    def analyze(self, inp: EngineInput) -> EngineOutput:
        """
        Main entry point. Takes EngineInput, returns EngineOutput.
        """
        inp.validate()

        # ── 1. Run all microstructure rules ──────────────────────────────────
        rules: list[RuleResult] = [
            rule_gamma_regime(inp.gex, inp.context),
            rule_gex_flow_interaction(inp.gex, inp.flow),
            rule_skew_signal(inp.skew),
            rule_skew_flow_alignment(inp.skew, inp.flow),
            rule_microstructure_regime(inp.microstructure, inp.context),
            rule_sweep_momentum(inp.flow),
            rule_0dte_gamma_risk(inp.gex, inp.context),
        ]

        # ── 2. Get microstructure quality multiplier ──────────────────────────
        ms_rule      = next(r for r in rules if r.name == 'microstructure')
        quality_mult = ms_rule.weight    # < 1.0 if illiquid, > 1.0 if high-activity

        # ── 3. Compute composite rule score ──────────────────────────────────
        weighted_sum  = sum(r.score * r.weight for r in rules if r.fired)
        total_weight  = sum(r.weight for r in rules if r.fired)
        rule_score    = weighted_sum / max(total_weight, 1e-9)

        # ── 4. ML scorer ──────────────────────────────────────────────────────
        ml_result = None
        if self.scorer is not None:
            ml_result = self.scorer.score(inp)
            ml_score  = ml_result['ml_score']

            # Blend: ML gets ML_WEIGHT, rules get total_weight
            combined_score = (
                (rule_score * total_weight + ml_score * self.ML_WEIGHT)
                / (total_weight + self.ML_WEIGHT)
            )
        else:
            combined_score = rule_score

        combined_score = float(np.clip(combined_score, -1, 1))

        # ── 5. Regime classifications ─────────────────────────────────────────
        gamma_regime   = self._classify_gamma_regime(inp.gex)
        vol_regime     = self._classify_vol_regime(inp.skew, inp.microstructure, inp.context)
        flow_direction = self._classify_flow(inp.flow)

        # ── 6. Confidence calculation ─────────────────────────────────────────
        confidence = self._compute_confidence(
            combined_score, rules, ml_result, inp, quality_mult,
        )

        # ── 7. Bias from composite score + confidence gate ────────────────────
        bias = self._score_to_bias(combined_score, confidence)

        # ── 8. Key levels ─────────────────────────────────────────────────────
        key_levels = self._extract_key_levels(inp.gex, inp.context.spot_price)

        # ── 9. Explanation ────────────────────────────────────────────────────
        explanation = self._build_explanation(
            bias, confidence, gamma_regime, vol_regime, flow_direction,
            rules, combined_score,
        )

        # Identify most impactful rule
        fired_rules  = [r for r in rules if r.fired and abs(r.score) > 0.05]
        top_rule     = max(fired_rules, key=lambda r: abs(r.score) * r.weight, default=None)
        rule_fired   = top_rule.name if top_rule else 'none'

        # ── 10. Advanced dynamics ─────────────────────────────────────────────
        # Build a temporary partial output so AdvancedContext.from_engine works
        _partial_output = type('_O', (), {
            'gamma_regime':      gamma_regime,
            'volatility_regime': vol_regime,
            'flow_direction':    flow_direction,
        })()
        adv_ctx    = AdvancedContext.from_engine(inp, _partial_output, combined_score)
        adv_result = self.advanced.analyze(adv_ctx, bias=bias)

        return EngineOutput(
            bias              = bias,
            confidence        = round(confidence, 4),
            gamma_regime      = gamma_regime,
            volatility_regime = vol_regime,
            flow_direction    = flow_direction,
            key_levels        = key_levels,
            explanation       = explanation,
            _gex_score        = float(rules[0].score),
            _skew_score       = float(rules[2].score),
            _flow_score       = float(rules[1].score),
            _rule_fired       = rule_fired,
            # Advanced dynamics
            gamma_squeeze          = adv_result.gamma_squeeze,
            squeeze_strength       = adv_result.squeeze_strength,
            dealer_state           = adv_result.dealer_state,
            confluence_score       = adv_result.confluence_score,
            confluence_components  = adv_result.confluence_components,
            regime                 = adv_result.regime,
            setup                  = adv_result.setup,
        )

    # ── Regime classifiers ────────────────────────────────────────────────────

    def _classify_gamma_regime(self, gex) -> str:
        if abs(gex.distance_to_flip) < 0.005:
            return GammaRegime.NEAR_FLIP   # not in original enum but needed
        if gex.net_gex > 0:
            return GammaRegime.LONG_GAMMA
        return GammaRegime.SHORT_GAMMA

    def _classify_vol_regime(self, skew, ms, context) -> str:
        iv_rank = context.iv_rank
        rv_iv   = ms.realized_vol_1h / (skew.iv_atm + 1e-9)
        term    = skew.term_structure

        expansion_score = (
            (1 if iv_rank > 65 else 0)
            + (1 if rv_iv > 1.1 else 0)
            + (1 if term < -0.02 else 0)
        )
        return VolRegime.EXPANSION if expansion_score >= 2 else VolRegime.COMPRESSION

    def _classify_flow(self, flow) -> str:
        pressure = 0.7 * flow.order_flow_imbalance + 0.3 * (flow.aggressive_buy_ratio - 0.5) * 2
        if pressure > 0.2:
            return FlowDirection.BULLISH
        if pressure < -0.2:
            return FlowDirection.BEARISH
        return FlowDirection.NEUTRAL

    # ── Confidence ────────────────────────────────────────────────────────────

    def _compute_confidence(
        self,
        composite:   float,
        rules:       list[RuleResult],
        ml_result:   Optional[dict],
        inp:         EngineInput,
        quality_mult: float,
    ) -> float:
        """
        Confidence = signal strength × agreement × quality × ML confidence.
        """
        # Base: how strong is the composite signal?
        base = min(abs(composite) * 1.5, 0.90)

        # Agreement: how consistent are individual rule scores?
        fired_scores = [r.score for r in rules if r.fired and abs(r.score) > 0.05]
        if len(fired_scores) >= 2:
            signs     = np.sign(fired_scores)
            agreement = abs(signs.sum()) / len(signs)   # 1.0 = all agree, 0.0 = split
        else:
            agreement = 0.5

        # ML confidence boost (if model available and agrees)
        ml_boost = 0.0
        if ml_result is not None:
            ml_conf  = ml_result['confidence']
            ml_score = ml_result['ml_score']
            if np.sign(ml_score) == np.sign(composite) and abs(composite) > 0.1:
                ml_boost = (ml_conf - 0.33) * 0.3   # above 33% base → boost

        # Penalties
        near_flip_penalty  = 0.25 if abs(inp.gex.distance_to_flip) < 0.005 else 0.0
        low_liq_penalty    = 0.15 if inp.microstructure.liquidity_index < 0.35 else 0.0
        low_quality_penalty = max(0, (1.0 - quality_mult) * 0.1)

        confidence = (
            base * 0.40
            + agreement * 0.35
            + 0.25
            + ml_boost
            - near_flip_penalty
            - low_liq_penalty
            - low_quality_penalty
        )

        return float(np.clip(confidence, self.min_confidence, 0.95))

    # ── Bias determination ────────────────────────────────────────────────────

    def _score_to_bias(self, score: float, confidence: float) -> str:
        """
        Convert composite score + confidence to bias.
        Confidence gate prevents weak signals from generating direction.
        """
        if confidence < self.min_confidence + 0.05:
            return Bias.NEUTRAL

        if score > 0.15:
            return Bias.LONG
        if score < -0.15:
            return Bias.SHORT
        return Bias.NEUTRAL

    # ── Key levels ────────────────────────────────────────────────────────────

    def _extract_key_levels(self, gex, spot: float) -> KeyLevels:
        """
        Extract support / resistance from GEX profile.
        Call wall above spot → resistance.
        Put wall below spot  → support.
        Gamma flip level     → critical level.
        """
        support    : list[float] = []
        resistance : list[float] = []

        flip = gex.gamma_flip_level

        if gex.put_wall < spot:
            support.append(round(gex.put_wall, 2))
        if gex.call_wall > spot:
            resistance.append(round(gex.call_wall, 2))

        # Flip level classification
        if flip < spot:
            support.append(round(flip, 2))
        else:
            resistance.append(round(flip, 2))

        # Deduplicate and sort
        support    = sorted(set(support),    reverse=True)
        resistance = sorted(set(resistance))

        return KeyLevels(
            support    = support,
            resistance = resistance,
            gamma_flip = round(flip, 2),
        )

    # ── Explanation builder ───────────────────────────────────────────────────

    def _build_explanation(
        self,
        bias:       str,
        confidence: float,
        gamma:      str,
        vol:        str,
        flow:       str,
        rules:      list[RuleResult],
        score:      float,
    ) -> str:
        """
        Concise, theory-grounded explanation. No chat filler.
        Selects the 2 most impactful rules as primary evidence.
        """
        # Select top 2 fired rules by impact (score × weight)
        fired = sorted(
            [r for r in rules if r.fired],
            key=lambda r: abs(r.score) * r.weight,
            reverse=True,
        )
        top2 = fired[:2]

        parts = [f"[{gamma} / {vol} / FLOW:{flow}]"]
        for r in top2:
            if r.evidence:
                parts.append(r.evidence.rstrip('.') + '.')

        if not top2:
            parts.append("No dominant signal. Market conditions are ambiguous.")

        parts.append(f"Composite score={score:+.2f}, confidence={confidence*100:.0f}%.")
        return ' '.join(parts)


# ─── JSON interface ───────────────────────────────────────────────────────────

def analyze(raw_input: dict, model_dir: Optional[str] = None) -> str:
    """
    Convenience function: accepts raw dict, returns JSON string.
    Suitable for use as an API handler or CLI tool.

    Args:
        raw_input : dict matching the EngineInput schema
        model_dir : optional path to trained model files

    Returns: JSON string matching EngineOutput schema
    """
    try:
        inp    = EngineInput.from_dict(raw_input)
        engine = AnalysisEngine(model_dir=model_dir)
        output = engine.analyze(inp)
        return output.to_json()
    except (KeyError, AssertionError, TypeError) as e:
        return json.dumps({'error': f'Invalid input: {e}'}, indent=2)
    except Exception as e:
        return json.dumps({'error': f'Analysis failed: {e}'}, indent=2)
