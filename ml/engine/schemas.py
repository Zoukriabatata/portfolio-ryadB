"""
Input / Output Data Contracts
────────────────────────────────────────────────────────────────────────────
These dataclasses define the strict boundary between:

  Layer 1 (DATA ENGINE)   →  EngineInput
  Layer 2 (THIS ENGINE)   →  EngineOutput

All values are validated at construction time.
No optional fields — every field must be provided by the data engine.
If data is unavailable, the data engine must supply a calibrated default.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import json


# ─── ENUMS ───────────────────────────────────────────────────────────────────

class Bias:
    LONG    = 'LONG'
    SHORT   = 'SHORT'
    NEUTRAL = 'NEUTRAL'


class GammaRegime:
    LONG_GAMMA  = 'LONG_GAMMA'
    SHORT_GAMMA = 'SHORT_GAMMA'
    NEAR_FLIP   = 'NEAR_FLIP'


class VolRegime:
    EXPANSION   = 'EXPANSION'
    COMPRESSION = 'COMPRESSION'


class FlowDirection:
    BULLISH = 'BULLISH'
    BEARISH = 'BEARISH'
    NEUTRAL = 'NEUTRAL'


class IntradayPhase:
    OPEN      = 'OPEN'       # 9:30–10:00 ET — high activity, wide spreads
    MORNING   = 'MORNING'    # 10:00–12:00 ET
    LUNCH     = 'LUNCH'      # 12:00–13:30 ET — low activity
    AFTERNOON = 'AFTERNOON'  # 13:30–15:30 ET
    CLOSE     = 'CLOSE'      # 15:30–16:00 ET — high activity, aggressive hedging


# ─── INPUT SCHEMA ────────────────────────────────────────────────────────────

@dataclass
class GEXInput:
    """
    Gamma Exposure metrics from the data engine.
    All dollar figures in billions ($B).
    """
    net_gex:              float   # net dealer gamma exposure in $B (signed)
    gamma_flip_level:     float   # price at which GEX crosses zero
    distance_to_flip:     float   # (spot - flip_level) / spot, signed
    call_wall:            float   # strike with highest positive GEX
    put_wall:             float   # strike with most negative GEX
    dealer_position_proxy: float  # +1 long gamma, -1 short gamma, 0 near flip

    def validate(self):
        assert abs(self.dealer_position_proxy) <= 1.0 + 1e-6, "dealer_position_proxy must be in [-1, 1]"
        assert self.gamma_flip_level > 0, "gamma_flip_level must be positive"


@dataclass
class SkewInput:
    """
    Volatility skew metrics from the data engine.
    """
    risk_reversal_25d: float   # IV(25Δ call) - IV(25Δ put), in percent
    iv_atm:            float   # ATM implied volatility, annualized (e.g. 0.20)
    iv_slope:          float   # slope of IV smile (dIV/d log-moneyness)
    term_structure:    float   # slope of IV vs expiry (backwardation if negative)
    skew_change_1d:    float   # Δ risk_reversal_25d vs 1 day ago

    def validate(self):
        assert 0 < self.iv_atm < 5.0, f"iv_atm={self.iv_atm} looks wrong (expect 0–5)"


@dataclass
class FlowInput:
    """
    Option order flow metrics from the data engine.
    """
    call_volume:          float   # total call volume (contracts)
    put_volume:           float   # total put volume (contracts)
    call_put_ratio:       float   # call_volume / put_volume (PCR inverse)
    order_flow_imbalance: float   # (buy_vol - sell_vol) / total_vol  ∈ [-1, 1]
    aggressive_buy_ratio: float   # market-order buys / total  ∈ [0, 1]
    sweep_net:            int     # net institutional sweeps (bullish - bearish count)

    def validate(self):
        assert -1.0 <= self.order_flow_imbalance <= 1.0, "order_flow_imbalance ∈ [-1, 1]"
        assert 0.0 <= self.aggressive_buy_ratio <= 1.0, "aggressive_buy_ratio ∈ [0, 1]"


@dataclass
class MicrostructureInput:
    """
    Market microstructure metrics from the data engine.
    """
    bid_ask_spread:   float   # in dollars (underlying)
    relative_spread:  float   # spread / mid  ∈ [0, 1]
    liquidity_index:  float   # composite liquidity [0, 1] — 1 is most liquid
    trade_intensity:  float   # trades per minute in recent window
    realized_vol_1h:  float   # 1-hour realized vol, annualized

    def validate(self):
        assert 0.0 <= self.liquidity_index <= 1.0, "liquidity_index ∈ [0, 1]"
        assert self.realized_vol_1h >= 0, "realized_vol_1h must be non-negative"


@dataclass
class ContextInput:
    """
    Market context — prices, timing, regime context.
    """
    spot_price:     float          # current underlying price
    time_to_expiry: float          # in calendar days (0DTE = fraction of day)
    intraday_phase: str            # IntradayPhase constant
    iv_rank:        float          # IV Rank 0–100 (vs 52-week range)
    prev_close:     float          # prior session close price

    def validate(self):
        assert self.spot_price > 0, "spot_price must be positive"
        assert self.time_to_expiry >= 0, "time_to_expiry must be ≥ 0"
        assert self.intraday_phase in vars(IntradayPhase).values(), f"Unknown phase: {self.intraday_phase}"
        assert 0 <= self.iv_rank <= 100, "iv_rank ∈ [0, 100]"


@dataclass
class EngineInput:
    """
    Complete input contract for the Analysis Engine (Layer 2).
    Supplied by the Data Engine (Layer 1).
    """
    gex:            GEXInput
    skew:           SkewInput
    flow:           FlowInput
    microstructure: MicrostructureInput
    context:        ContextInput

    def validate(self):
        self.gex.validate()
        self.skew.validate()
        self.flow.validate()
        self.microstructure.validate()
        self.context.validate()

    @classmethod
    def from_dict(cls, d: dict) -> 'EngineInput':
        return cls(
            gex=GEXInput(**d['gex']),
            skew=SkewInput(**d['skew']),
            flow=FlowInput(**d['flow']),
            microstructure=MicrostructureInput(**d['microstructure']),
            context=ContextInput(**d['context']),
        )


# ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

@dataclass
class KeyLevels:
    support:    list[float]
    resistance: list[float]
    gamma_flip: float


@dataclass
class EngineOutput:
    """
    Strict output contract from the Analysis Engine (Layer 2).
    Consumed by the Chat Assistant (Layer 3) and the UI.
    """
    bias:               str     # Bias constant
    confidence:         float   # 0.0–1.0
    gamma_regime:       str     # GammaRegime constant
    volatility_regime:  str     # VolRegime constant
    flow_direction:     str     # FlowDirection constant
    key_levels:         KeyLevels
    explanation:        str     # concise, theory-grounded (no chat filler)

    # Internal scores — available to Layer 3 for deeper explanations
    _gex_score:   float = field(default=0.0,  repr=False)
    _skew_score:  float = field(default=0.0,  repr=False)
    _flow_score:  float = field(default=0.0,  repr=False)
    _rule_fired:  str   = field(default='',   repr=False)

    # Advanced dynamics (from advanced_dynamics.py)
    gamma_squeeze:          bool  = field(default=False)
    squeeze_strength:       float = field(default=0.0)
    dealer_state:           str   = field(default='')
    confluence_score:       float = field(default=0.0)
    confluence_components:  dict  = field(default_factory=dict)
    regime:                 str   = field(default='')
    setup:                  dict  = field(default_factory=dict)
    # Adaptive dynamics fields (new)
    adaptive_threshold:     float = field(default=0.55)
    dynamic_weights:        dict  = field(default_factory=dict)
    signal_confidence:      float = field(default=0.0)  # adaptive engine confidence [0,1]
    persistence_score:      float = field(default=0.0)  # flow directional persistence [0,1]
    signal_quality:         float = field(default=0.0)  # agreement × structure quality [0,1]

    def to_dict(self) -> dict:
        d = {
            'bias':              self.bias,
            'confidence':        round(self.confidence, 4),
            'gamma_regime':      self.gamma_regime,
            'volatility_regime': self.volatility_regime,
            'flow_direction':    self.flow_direction,
            'key_levels': {
                'support':    self.key_levels.support,
                'resistance': self.key_levels.resistance,
                'gamma_flip': self.key_levels.gamma_flip,
            },
            'explanation': self.explanation,
        }
        # Include advanced dynamics if populated
        if self.dealer_state:
            d['gamma_squeeze']         = self.gamma_squeeze
            d['squeeze_strength']      = round(self.squeeze_strength, 3)
            d['dealer_state']          = self.dealer_state
            d['confluence_score']      = round(self.confluence_score, 2)
            d['confluence_components'] = self.confluence_components
            d['regime']                = self.regime
            d['setup']                 = self.setup
            d['adaptive_threshold']    = round(self.adaptive_threshold, 3)
            d['dynamic_weights']       = self.dynamic_weights
            d['signal_confidence']     = round(self.signal_confidence, 3)
            d['persistence_score']     = round(self.persistence_score, 3)
            d['signal_quality']        = round(self.signal_quality, 3)
        return d

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)
