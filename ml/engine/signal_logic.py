"""
Signal Logic — Explicit Microstructure Rules
────────────────────────────────────────────────────────────────────────────
This module encodes the IF/THEN signal combinations derived from academic
microstructure theory. Each rule is a named, interpretable condition that
maps input features to a directional score.

Rules are NOT heuristics — each one is grounded in a specific theoretical
mechanism described in the literature (cited inline).

DESIGN:
  - Each rule returns a RuleResult (score, direction, name, evidence)
  - Scores are in [-1, +1]: negative = bearish, positive = bullish
  - The SignalAggregator weights and combines rules into a final signal
  - Rules can VETO each other (e.g., near-flip overrides strong directional)
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass

from .schemas import (
    EngineInput, GammaRegime, VolRegime, FlowDirection,
    GEXInput, SkewInput, FlowInput, MicrostructureInput, ContextInput,
    IntradayPhase,
)


# ─── Rule result ─────────────────────────────────────────────────────────────

@dataclass
class RuleResult:
    name:      str
    score:     float    # [-1, +1]  negative=bearish, positive=bullish
    weight:    float    # importance of this rule in the final composite
    fired:     bool     # True if the rule's conditions were triggered
    evidence:  str      # human-readable explanation of why it fired


# ─── Individual rules ────────────────────────────────────────────────────────

def rule_gamma_regime(gex: GEXInput, context: ContextInput) -> RuleResult:
    """
    GEX Regime Rule.

    Theory (Spatt & Ernst — Market Microstructure):
      Positive net GEX → dealers long gamma → they BUY dips / SELL rallies
      → mean-reverting regime → fade breakouts, bias NEUTRAL
      Negative net GEX → dealers short gamma → they amplify moves
      → trending regime → follow momentum

    Flip level proximity: within ±0.5%, the regime is unstable and
    the market is vulnerable to rapid acceleration in either direction.
    """
    dist = gex.distance_to_flip
    net  = gex.net_gex

    # Near flip: both sides are at risk — do not take directional bet
    if abs(dist) < 0.005:
        return RuleResult(
            name='gamma_regime', score=0.0, weight=1.5, fired=True,
            evidence=f"Price within 0.5% of gamma flip ({gex.gamma_flip_level:.2f}) — regime unstable",
        )

    # Short gamma regime with price already below flip → downside acceleration
    if net < 0 and dist < -0.01:
        score = -0.6 * min(abs(net) / 2.0, 1.0)      # scale by GEX magnitude
        return RuleResult(
            name='gamma_regime', score=score, weight=1.5, fired=True,
            evidence=f"SHORT GAMMA ({net:.2f}B$), price {abs(dist)*100:.1f}% below flip — dealer selling amplifies downside",
        )

    # Short gamma with price above flip → upside acceleration possible
    if net < 0 and dist > 0.01:
        score = 0.4 * min(abs(net) / 2.0, 1.0)
        return RuleResult(
            name='gamma_regime', score=score, weight=1.0, fired=True,
            evidence=f"SHORT GAMMA ({net:.2f}B$) but price above flip — trend continuation risk if support fails",
        )

    # Long gamma → mean reversion (directionally neutral, suppresses moves)
    if net > 0:
        # Don't add direction, but reduce other signals' impact
        return RuleResult(
            name='gamma_regime', score=0.0, weight=0.8, fired=True,
            evidence=f"LONG GAMMA ({net:.2f}B$) — dealers stabilize price, mean-reversion regime",
        )

    return RuleResult(name='gamma_regime', score=0.0, weight=1.0, fired=False, evidence="GEX neutral")


def rule_gex_flow_interaction(gex: GEXInput, flow: FlowInput) -> RuleResult:
    """
    GEX × Flow Interaction Rule (PRIMARY SIGNAL).

    Theory (Muravyev 2016 — Order Flow and Expected Option Returns):
      Informed flow in a short-gamma regime has amplified price impact.
      Dealers who are short gamma must hedge by trading in the SAME direction
      as the incoming flow — this creates a positive feedback loop.

    Conversely, in long gamma, dealer hedging OPPOSES flow direction.

    Rules:
      SHORT_GAMMA + BULLISH_FLOW → strong LONG  (feedback amplification)
      SHORT_GAMMA + BEARISH_FLOW → strong SHORT (feedback amplification)
      LONG_GAMMA  + BULLISH_FLOW → weak  LONG   (dealer hedging dampens)
      LONG_GAMMA  + BEARISH_FLOW → weak  SHORT  (dealer hedging dampens)
    """
    gamma_sign = np.sign(gex.net_gex)            # +1 long, -1 short
    ofi        = flow.order_flow_imbalance         # [-1, 1]
    agg        = flow.aggressive_buy_ratio - 0.5   # center at 0

    # Composite flow pressure: OFI + aggressive ratio
    flow_pressure = 0.7 * ofi + 0.3 * agg

    if abs(flow_pressure) < 0.1:                   # no clear flow signal
        return RuleResult(
            name='gex_flow', score=0.0, weight=1.2, fired=False,
            evidence="Flow imbalance too small to generate directional signal",
        )

    # Short gamma amplifies flow
    if gamma_sign < 0:
        score = flow_pressure * 1.4               # amplified
        direction = 'bullish' if score > 0 else 'bearish'
        return RuleResult(
            name='gex_flow', score=np.clip(score, -1, 1), weight=1.8, fired=True,
            evidence=(
                f"SHORT GAMMA + {direction.upper()} FLOW (OFI={ofi:.2f}, agg={agg+0.5:.2f}) — "
                f"dealer hedging amplifies {direction} pressure"
            ),
        )

    # Long gamma dampens flow
    score = flow_pressure * 0.7                   # dampened
    direction = 'bullish' if score > 0 else 'bearish'
    return RuleResult(
        name='gex_flow', score=np.clip(score, -1, 1), weight=1.0, fired=True,
        evidence=(
            f"LONG GAMMA + {direction.upper()} FLOW (OFI={ofi:.2f}) — "
            f"dealer hedging partially offsets {direction} pressure"
        ),
    )


def rule_skew_signal(skew: SkewInput) -> RuleResult:
    """
    Skew Predictive Signal Rule.

    Theory (Han 2008 — Investor Sentiment and Option Prices):
      The slope of the IV smile is a measure of aggregate investor sentiment.
      Extreme put skew (very negative RR25) signals excess bearish hedging
      demand — often a contrarian indicator at extremes but momentum signal
      in trending periods.

      Change in skew (Δskew) is more informative than level:
        Skew becoming MORE negative → increasing fear → bearish momentum
        Skew becoming LESS negative → fear relief   → bullish momentum
    """
    rr25    = skew.risk_reversal_25d     # negative = put skew
    skew_chg = skew.skew_change_1d       # change in RR25 over 1 day

    # Level signal: extreme put skew → bearish sentiment
    if rr25 < -6.0:
        level_score = -0.5
        level_ev = f"extreme put skew (RR25={rr25:.1f}%) — elevated institutional fear"
    elif rr25 < -3.0:
        level_score = -0.25
        level_ev = f"moderate put skew (RR25={rr25:.1f}%) — defensive positioning"
    elif rr25 > 3.0:
        level_score = 0.3
        level_ev = f"call skew (RR25={rr25:.1f}%) — bullish FOMO positioning"
    else:
        level_score = rr25 / 12.0        # linear within neutral band
        level_ev = f"neutral skew (RR25={rr25:.1f}%)"

    # Change signal: momentum in skew movement (more informative than level)
    change_score = np.clip(skew_chg / 3.0, -0.5, 0.5)    # 3% change = max signal
    change_ev = (
        f"skew deteriorating ({skew_chg:+.1f}% today) — fear rising" if skew_chg < -0.5
        else (f"skew improving ({skew_chg:+.1f}% today) — fear easing" if skew_chg > 0.5
              else f"skew stable ({skew_chg:+.1f}% today)")
    )

    # Combine: skew change gets 60% weight (more predictive per Han 2008)
    total_score = 0.4 * level_score + 0.6 * change_score
    evidence    = f"{level_ev}; {change_ev}"

    return RuleResult(
        name='skew', score=np.clip(total_score, -1, 1), weight=1.0, fired=True,
        evidence=evidence,
    )


def rule_skew_flow_alignment(skew: SkewInput, flow: FlowInput) -> RuleResult:
    """
    Skew × Flow Alignment Rule.

    Theory: When skew and flow are aligned, the signal is high-conviction.
    When they diverge, one side is likely positioned defensively.

    Alignment examples:
      Put skew + net put buying  → high-conviction bearish
      Call skew + net call buying → high-conviction bullish
      Put skew + net call buying  → hedged positioning, lower conviction
    """
    ofi  = flow.order_flow_imbalance
    rr25 = skew.risk_reversal_25d

    skew_dir = np.sign(rr25)       # + = call skew, - = put skew
    flow_dir = np.sign(ofi)        # + = net buying, - = net selling

    if skew_dir == 0 or flow_dir == 0:
        return RuleResult(name='skew_flow', score=0.0, weight=0.5, fired=False, evidence="No alignment signal")

    if skew_dir == flow_dir:       # aligned
        strength = abs(rr25) / 5.0 * abs(ofi)         # scales with conviction
        score    = np.sign(ofi) * min(strength, 0.6)
        return RuleResult(
            name='skew_flow', score=score, weight=1.2, fired=True,
            evidence=f"Skew and flow aligned ({rr25:+.1f}% RR25, OFI={ofi:.2f}) — high-conviction signal",
        )
    else:                           # diverged
        return RuleResult(
            name='skew_flow', score=0.0, weight=0.6, fired=True,
            evidence=f"Skew/flow divergence (RR25={rr25:.1f}%, OFI={ofi:.2f}) — mixed positioning, lower conviction",
        )


def rule_microstructure_regime(ms: MicrostructureInput, context: ContextInput) -> RuleResult:
    """
    Microstructure Quality Rule.

    Theory (Hasbrouck — Empirical Market Microstructure):
      Wide spreads, low liquidity, and high trade intensity are signatures
      of informed trading or stress. These conditions amplify price impact.

      In OPEN/CLOSE sessions, wide spreads are normal — discount them.
      In MORNING/AFTERNOON, wide spreads signal elevated information asymmetry.

    This rule MODULATES confidence rather than adding direction.
    """
    illiquid = ms.liquidity_index < 0.4
    stressed = ms.relative_spread > 0.005        # spread > 0.5% of mid
    intense  = ms.trade_intensity > 50            # > 50 trades/min

    # Normal open/close spread elevation — not a signal
    if context.intraday_phase in (IntradayPhase.OPEN, IntradayPhase.CLOSE):
        stressed = ms.relative_spread > 0.01      # higher threshold at open/close

    if illiquid and stressed:
        return RuleResult(
            name='microstructure', score=0.0, weight=0.5, fired=True,
            evidence=f"Low liquidity ({ms.liquidity_index:.2f}) and wide spread ({ms.relative_spread*100:.2f}%) — reduce position size, signals less reliable",
        )

    if intense and not illiquid:
        return RuleResult(
            name='microstructure', score=0.0, weight=1.3, fired=True,
            evidence=f"High trade intensity ({ms.trade_intensity:.0f}/min) with good liquidity — flow signals are more reliable",
        )

    return RuleResult(
        name='microstructure', score=0.0, weight=1.0, fired=False,
        evidence=f"Normal microstructure conditions (liq={ms.liquidity_index:.2f})",
    )


def rule_sweep_momentum(flow: FlowInput) -> RuleResult:
    """
    Institutional Sweep Momentum Rule.

    Theory (Muravyev 2016):
      Aggressive, large trades (sweeps) that cross multiple price levels
      are signatures of informed institutional flow. They have higher
      predictive power than passive volume imbalance.

    Net sweep direction provides a clean signal of institutional intent.
    """
    sweeps = flow.sweep_net

    if sweeps == 0:
        return RuleResult(name='sweeps', score=0.0, weight=0.8, fired=False, evidence="No institutional sweeps detected")

    score = np.clip(sweeps / 5.0, -0.7, 0.7)    # 5 net sweeps = max signal
    direction = 'bullish' if sweeps > 0 else 'bearish'

    return RuleResult(
        name='sweeps', score=score, weight=1.3, fired=True,
        evidence=f"{abs(sweeps)} net {direction} institutional sweeps — directional institutional intent",
    )


def rule_volatility_regime(skew: SkewInput, ms: MicrostructureInput, context: ContextInput) -> RuleResult:
    """
    Volatility Regime Classification Rule.

    EXPANSION signals:
      - IV Rank above 60 (elevated vs history)
      - Realized vol accelerating
      - Negative term structure (backwardation: short-term fear > long-term)

    COMPRESSION signals:
      - IV Rank below 30
      - Realized vol below IV (positive carry)
      - Normal/positive term structure
    """
    iv_rank    = context.iv_rank
    rv_1h      = ms.realized_vol_1h
    term_slope = skew.term_structure
    iv_atm     = skew.iv_atm

    # Vol-of-vol proxy: current RV vs implied
    rv_iv_ratio = rv_1h / (iv_atm + 1e-9)

    expansion_signals = sum([
        iv_rank > 65,
        rv_iv_ratio > 1.1,          # realized > implied → vol expanding
        term_slope < -0.02,         # backwardation → near-term fear elevated
    ])

    compression_signals = sum([
        iv_rank < 30,
        rv_iv_ratio < 0.8,          # realized < implied → carry is positive
        term_slope > 0.02,          # contango → normal
    ])

    if expansion_signals >= 2:
        return RuleResult(
            name='vol_regime', score=0.0, weight=1.0, fired=True,
            evidence=f"VOL EXPANSION: IV rank={iv_rank:.0f}, RV/IV={rv_iv_ratio:.2f}, term={term_slope:+.3f}",
        )

    if compression_signals >= 2:
        return RuleResult(
            name='vol_regime', score=0.0, weight=1.0, fired=True,
            evidence=f"VOL COMPRESSION: IV rank={iv_rank:.0f}, RV/IV={rv_iv_ratio:.2f}, term={term_slope:+.3f}",
        )

    return RuleResult(
        name='vol_regime', score=0.0, weight=1.0, fired=False,
        evidence=f"Ambiguous vol regime (IV rank={iv_rank:.0f})",
    )


def rule_0dte_gamma_risk(gex: GEXInput, context: ContextInput) -> RuleResult:
    """
    0DTE Gamma Explosion Risk Rule.

    Near expiry (DTE < 1), gamma is extremely concentrated near ATM strikes.
    Even small spot moves can trigger large dealer hedging flows.
    This amplifies ANY directional signal when short gamma.

    Theory: as T→0, gamma approaches a delta function at the strike.
    Market makers cannot fully hedge fast enough → increased impact.
    """
    dte = context.time_to_expiry

    if dte > 3.0:
        return RuleResult(name='0dte', score=0.0, weight=1.0, fired=False, evidence="DTE > 3 days, no 0DTE effect")

    net_gex = gex.net_gex

    # 0DTE amplification
    amplification = max(1.0, 3.0 / (dte + 0.1))   # 10x at DTE=0.3

    if net_gex < -0.5:
        # Short gamma + 0DTE = extreme risk
        amp_score = -0.3 * min(amplification / 3.0, 1.0)
        return RuleResult(
            name='0dte', score=amp_score, weight=1.4, fired=True,
            evidence=f"0DTE SHORT GAMMA — gamma explosion risk (DTE={dte:.1f}d, GEX={net_gex:.2f}B$)",
        )

    if net_gex > 0.5:
        return RuleResult(
            name='0dte', score=0.0, weight=0.7, fired=True,
            evidence=f"0DTE LONG GAMMA — pin risk near gamma walls (DTE={dte:.1f}d)",
        )

    return RuleResult(
        name='0dte', score=0.0, weight=1.0, fired=True,
        evidence=f"0DTE near-neutral GEX (DTE={dte:.1f}d) — monitor for gamma acceleration",
    )
