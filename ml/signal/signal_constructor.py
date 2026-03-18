"""
Signal Construction
────────────────────────────────────────────────────────────────────────────
Combines ML model output with microstructure rules to produce the final
trading signal.

SIGNAL = f(GEX, SKEW, FLOW, VOL) where:
  • Positive GEX → mean reversion → fade extremes, expect range
  • Negative GEX → trend acceleration → follow momentum
  • Bearish skew → downside risk premium → prefer protective positioning
  • Strong call flow + low PCR → bullish institutional positioning

The final output is NOT a trade signal — it is a probabilistic bias
with supporting evidence for the trader to interpret.

Key levels are derived from:
  - GEX profile: call wall, put wall, gamma flip level
  - Volume profile (if available): POC, VAH, VAL
  - Microstructure: high-volume nodes
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from typing import Optional
import json


# ─── Output schema ────────────────────────────────────────────────────────────

@dataclass
class SignalOutput:
    # Directional bias
    bias:              str    # 'LONG' | 'NEUTRAL' | 'SHORT'
    confidence:        float  # 0.0 – 1.0
    regime_int:        int    # +1 / 0 / -1

    # Volatility
    volatility_regime: str    # 'EXPANSION' | 'COMPRESSION'
    iv_atm:            float  # current ATM IV

    # Dealer positioning
    gamma_regime:      str    # 'LONG GAMMA' | 'SHORT GAMMA' | 'NEAR FLIP'
    net_gex:           float  # in $B

    # Key levels
    key_levels: dict          # {support: [...], resistance: [...]}

    # Probabilities
    prob_long:         float
    prob_neutral:      float
    prob_short:        float

    # Probability of significant move
    prob_move:         float  # probability of ≥1σ move in predicted direction

    # Human-readable explanation
    explanation:       str

    # Debug / raw feature highlights
    top_features:      list

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


# ─── Signal constructor ───────────────────────────────────────────────────────

class SignalConstructor:
    """
    Post-processes ML model output + raw features → final signal.

    Applies microstructure-grounded rules on top of ML probabilities
    to catch situations where the model's statistical pattern doesn't
    align with the fundamental GEX/flow regime (model disagreement → NEUTRAL).
    """

    def __init__(
        self,
        min_confidence:   float = 0.45,   # below this → NEUTRAL override
        gex_agreement:    bool  = True,    # require GEX to agree with signal
        skew_agreement:   bool  = False,   # require skew to agree (optional)
    ):
        self.min_confidence = min_confidence
        self.gex_agreement  = gex_agreement
        self.skew_agreement = skew_agreement

    def construct(
        self,
        model_output:  dict,
        features:      pd.Series,         # last row of feature DataFrame
        gex_profile:   Optional[pd.DataFrame] = None,
        spot:          float = 0.0,
    ) -> SignalOutput:
        """
        Build the final SignalOutput from model predictions + current features.
        """
        bias       = model_output['regime']            # 'LONG'/'NEUTRAL'/'SHORT'
        conf       = model_output['confidence']
        regime_int = model_output['regime_int']

        # ── Confidence gate ───────────────────────────────────────────────────
        if conf < self.min_confidence:
            bias       = 'NEUTRAL'
            regime_int = 0

        # ── GEX agreement check ───────────────────────────────────────────────
        dealer_pos = features.get('gex_dealer_positioning', 0)
        if self.gex_agreement:
            # If model says LONG but dealer is short gamma → NEUTRAL (conflict)
            if bias == 'LONG'  and dealer_pos < 0:
                conf   = conf * 0.7    # reduce confidence but don't fully override
            if bias == 'SHORT' and dealer_pos > 0:
                conf   = conf * 0.7

        # ── Skew agreement ────────────────────────────────────────────────────
        rr25 = features.get('skew_rr25', 0.0)
        if self.skew_agreement:
            if bias == 'LONG'  and rr25 < -5.0:
                conf = conf * 0.8     # bearish skew conflicts with bullish ML
            if bias == 'SHORT' and rr25 > 3.0:
                conf = conf * 0.8     # bullish skew conflicts with bearish ML

        # ── Gamma regime label ────────────────────────────────────────────────
        dist_flip = features.get('gex_dist_to_flip', 0.0)
        net_gex   = features.get('gex_net_gex', 0.0)

        if abs(dist_flip) < 0.005:
            gamma_regime = 'NEAR FLIP'
        elif net_gex > 0:
            gamma_regime = 'LONG GAMMA'
        else:
            gamma_regime = 'SHORT GAMMA'

        # ── Key levels ────────────────────────────────────────────────────────
        key_levels = self._compute_key_levels(features, gex_profile, spot)

        # ── Probability of significant move ───────────────────────────────────
        vol_regime = model_output.get('vol_regime', 'COMPRESSION')
        prob_move  = self._estimate_move_probability(conf, vol_regime, dealer_pos)

        # ── Explanation ───────────────────────────────────────────────────────
        explanation = self._build_explanation(
            bias, conf, gamma_regime, rr25, features, vol_regime
        )

        iv_atm = features.get('skew_iv_atm', 0.0)

        return SignalOutput(
            bias              = bias,
            confidence        = round(conf, 4),
            regime_int        = regime_int,
            volatility_regime = vol_regime,
            iv_atm            = float(iv_atm),
            gamma_regime      = gamma_regime,
            net_gex           = float(net_gex),
            key_levels        = key_levels,
            prob_long         = model_output.get('proba_long', 0.0),
            prob_neutral      = model_output.get('proba_neutral', 0.0),
            prob_short        = model_output.get('proba_short', 0.0),
            prob_move         = round(prob_move, 4),
            explanation       = explanation,
            top_features      = model_output.get('top_features', []),
        )

    # ── Key level extraction ─────────────────────────────────────────────────

    def _compute_key_levels(
        self,
        features:    pd.Series,
        gex_profile: Optional[pd.DataFrame],
        spot:        float,
    ) -> dict:
        support:    list[float] = []
        resistance: list[float] = []

        # GEX-based levels
        flip  = features.get('gex_gamma_flip_level', spot)
        p_wall = features.get('gex_put_wall', spot * 0.98)
        c_wall = features.get('gex_call_wall', spot * 1.02)

        if flip > 0:
            if flip < spot:
                support.append(round(float(flip), 2))
            else:
                resistance.append(round(float(flip), 2))

        if p_wall > 0:
            support.append(round(float(p_wall), 2))
        if c_wall > 0:
            resistance.append(round(float(c_wall), 2))

        # Additional GEX profile peaks (if available)
        if gex_profile is not None and not gex_profile.empty:
            pos_peaks = gex_profile.nlargest(2, 'gex')['strike'].tolist()
            neg_peaks = gex_profile.nsmallest(2, 'gex')['strike'].tolist()

            for s in neg_peaks:
                if s < spot and round(s, 2) not in support:
                    support.append(round(s, 2))
            for r in pos_peaks:
                if r > spot and round(r, 2) not in resistance:
                    resistance.append(round(r, 2))

        # Deduplicate and sort
        support    = sorted(set(support),    reverse=True)[:3]
        resistance = sorted(set(resistance))[:3]

        return {'support': support, 'resistance': resistance}

    # ── Move probability ─────────────────────────────────────────────────────

    def _estimate_move_probability(
        self,
        model_conf:   float,
        vol_regime:   str,
        dealer_pos:   float,
    ) -> float:
        """
        Heuristic estimate of probability of ≥1σ move in predicted direction.
        - Higher model confidence → higher base probability
        - Short gamma regime → amplified moves more likely
        - Vol expansion regime → moves are larger
        """
        base = model_conf * 0.8         # cap at 80%

        # Amplify when dynamics favor larger moves
        if vol_regime == 'EXPANSION':
            base *= 1.25
        if dealer_pos < 0:               # short gamma → trend amplification
            base *= 1.15

        return min(base, 0.90)

    # ── Natural language explanation ─────────────────────────────────────────

    def _build_explanation(
        self,
        bias:         str,
        conf:         float,
        gamma_regime: str,
        rr25:         float,
        features:     pd.Series,
        vol_regime:   str,
    ) -> str:
        parts = []

        # Dealer context
        if gamma_regime == 'LONG GAMMA':
            parts.append(
                "Dealers are long gamma and will stabilize price by buying dips and "
                "selling rallies — mean-reverting regime favored."
            )
        elif gamma_regime == 'SHORT GAMMA':
            parts.append(
                "Dealers are short gamma and will amplify directional moves — "
                "trending/momentum regime active."
            )
        else:
            parts.append(
                "Price is near the gamma flip level — regime is unstable. "
                "A breakout in either direction may accelerate significantly."
            )

        # Skew context
        if rr25 < -4.0:
            parts.append(
                f"Bearish put skew (RR25={rr25:.1f}%) signals elevated "
                "institutional hedging demand and downside fear."
            )
        elif rr25 > 2.0:
            parts.append(
                f"Bullish call skew (RR25={rr25:.1f}%) indicates aggressive "
                "upside positioning or FOMO buying."
            )
        else:
            parts.append(f"Volatility skew is near neutral (RR25={rr25:.1f}%).")

        # Flow context
        flow_regime = features.get('flow_flow_regime', 0)
        pcr         = features.get('flow_pcr_volume', 1.0)
        sweep_net   = features.get('flow_sweep_net', 0)

        if flow_regime == 1:
            parts.append(
                f"Option flow is bullish: call OFI dominant, PCR={pcr:.2f}, "
                f"net sweeps={int(sweep_net)} bullish."
            )
        elif flow_regime == -1:
            parts.append(
                f"Option flow is bearish: put OFI dominant, PCR={pcr:.2f}, "
                f"net sweeps={abs(int(sweep_net))} bearish."
            )
        else:
            parts.append(f"Option flow is neutral (PCR={pcr:.2f}).")

        # Vol regime
        parts.append(
            f"Volatility regime: {vol_regime}. "
            + ("Expect larger intraday moves." if vol_regime == 'EXPANSION'
               else "Expect range-bound, lower volatility environment.")
        )

        # Bias summary
        parts.append(
            f"Combined signal: {bias} with {conf*100:.0f}% model confidence."
        )

        return " ".join(parts)
