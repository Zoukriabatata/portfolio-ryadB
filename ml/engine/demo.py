"""
Analysis Engine — Integration Demo
────────────────────────────────────────────────────────────────────────────
Shows the complete Layer 2 contract:
  - Input from Layer 1 (raw dict / JSON)
  - Output to Layer 3 (strict JSON)

Run:
    python -m ml.engine.demo
"""

import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ml.engine.analysis_engine import AnalysisEngine, analyze
from ml.engine.schemas import (
    EngineInput, GEXInput, SkewInput, FlowInput,
    MicrostructureInput, ContextInput, IntradayPhase,
)


# ─── Scenario definitions ────────────────────────────────────────────────────

SCENARIOS = {

    "SHORT_GAMMA_BULLISH_FLOW": {
        "description": "Short gamma + strong bullish flow — expect trend continuation",
        "gex": {
            "net_gex": -1.8,                # dealers short gamma → amplify moves
            "gamma_flip_level": 530.0,
            "distance_to_flip": -0.02,      # 2% below flip → bearish regime
            "call_wall": 545.0,
            "put_wall":  520.0,
            "dealer_position_proxy": -0.8,
        },
        "skew": {
            "risk_reversal_25d": 1.5,       # mild call skew — not fearful
            "iv_atm": 0.18,
            "iv_slope": -0.15,
            "term_structure": 0.01,
            "skew_change_1d": 0.8,          # skew improving
        },
        "flow": {
            "call_volume": 85000,
            "put_volume":  32000,
            "call_put_ratio": 2.65,
            "order_flow_imbalance": 0.55,   # strong net buying
            "aggressive_buy_ratio": 0.68,   # mostly market orders
            "sweep_net": 4,                 # 4 net bullish sweeps
        },
        "microstructure": {
            "bid_ask_spread": 0.10,
            "relative_spread": 0.0019,
            "liquidity_index": 0.82,
            "trade_intensity": 67.0,
            "realized_vol_1h": 0.22,
        },
        "context": {
            "spot_price": 522.0,
            "time_to_expiry": 3.0,
            "intraday_phase": IntradayPhase.MORNING,
            "iv_rank": 42.0,
            "prev_close": 518.5,
        },
    },

    "LONG_GAMMA_BEARISH_SKEW": {
        "description": "Long gamma + extreme put skew — mean reversion in bearish environment",
        "gex": {
            "net_gex": 2.4,
            "gamma_flip_level": 480.0,
            "distance_to_flip": 0.04,      # 4% above flip → stabilizing
            "call_wall": 510.0,
            "put_wall":  490.0,
            "dealer_position_proxy": 0.9,
        },
        "skew": {
            "risk_reversal_25d": -7.2,     # extreme put skew → fear
            "iv_atm": 0.31,
            "iv_slope": -0.55,
            "term_structure": -0.04,       # backwardation → near-term fear
            "skew_change_1d": -1.5,        # skew deteriorating
        },
        "flow": {
            "call_volume": 28000,
            "put_volume":  71000,
            "call_put_ratio": 0.39,
            "order_flow_imbalance": -0.42,
            "aggressive_buy_ratio": 0.33,
            "sweep_net": -3,
        },
        "microstructure": {
            "bid_ask_spread": 0.22,
            "relative_spread": 0.0044,
            "liquidity_index": 0.55,
            "trade_intensity": 89.0,
            "realized_vol_1h": 0.38,
        },
        "context": {
            "spot_price": 500.5,
            "time_to_expiry": 12.0,
            "intraday_phase": IntradayPhase.AFTERNOON,
            "iv_rank": 78.0,
            "prev_close": 508.0,
        },
    },

    "NEAR_FLIP_NEUTRAL": {
        "description": "Price at gamma flip — unstable regime, no directional signal",
        "gex": {
            "net_gex": 0.15,
            "gamma_flip_level": 450.2,
            "distance_to_flip": 0.001,     # < 0.5% of flip → unstable
            "call_wall": 460.0,
            "put_wall":  440.0,
            "dealer_position_proxy": 0.1,
        },
        "skew": {
            "risk_reversal_25d": -1.2,
            "iv_atm": 0.21,
            "iv_slope": -0.18,
            "term_structure": 0.005,
            "skew_change_1d": 0.1,
        },
        "flow": {
            "call_volume": 41000,
            "put_volume":  38000,
            "call_put_ratio": 1.08,
            "order_flow_imbalance": 0.05,
            "aggressive_buy_ratio": 0.49,
            "sweep_net": 0,
        },
        "microstructure": {
            "bid_ask_spread": 0.12,
            "relative_spread": 0.0027,
            "liquidity_index": 0.70,
            "trade_intensity": 45.0,
            "realized_vol_1h": 0.20,
        },
        "context": {
            "spot_price": 450.7,
            "time_to_expiry": 0.5,         # 0DTE
            "intraday_phase": IntradayPhase.CLOSE,
            "iv_rank": 52.0,
            "prev_close": 449.8,
        },
    },

    "0DTE_SHORT_GAMMA_BREAKDOWN": {
        "description": "0DTE + short gamma + bearish flow — extreme downside risk",
        "gex": {
            "net_gex": -2.1,
            "gamma_flip_level": 395.0,
            "distance_to_flip": -0.015,
            "call_wall": 400.0,
            "put_wall":  385.0,
            "dealer_position_proxy": -1.0,
        },
        "skew": {
            "risk_reversal_25d": -9.5,
            "iv_atm": 0.55,
            "iv_slope": -0.80,
            "term_structure": -0.09,
            "skew_change_1d": -3.2,
        },
        "flow": {
            "call_volume": 12000,
            "put_volume":  93000,
            "call_put_ratio": 0.13,
            "order_flow_imbalance": -0.72,
            "aggressive_buy_ratio": 0.19,
            "sweep_net": -8,
        },
        "microstructure": {
            "bid_ask_spread": 0.45,
            "relative_spread": 0.0114,
            "liquidity_index": 0.32,
            "trade_intensity": 142.0,
            "realized_vol_1h": 0.78,
        },
        "context": {
            "spot_price": 389.3,
            "time_to_expiry": 0.25,
            "intraday_phase": IntradayPhase.OPEN,
            "iv_rank": 96.0,
            "prev_close": 401.0,
        },
    },
}


# ─── Runner ───────────────────────────────────────────────────────────────────

def run_demo():
    print("=" * 72)
    print("OPTIONS ANALYSIS ENGINE — Layer 2 Demo")
    print("=" * 72)

    engine = AnalysisEngine(use_ml=True)

    for name, scenario in SCENARIOS.items():
        print(f"\n{'─'*72}")
        print(f"SCENARIO: {name}")
        print(f"         {scenario['description']}")
        print('─' * 72)

        # Build EngineInput from dict (simulating Layer 1 output)
        inp    = EngineInput.from_dict({k: v for k, v in scenario.items() if k != 'description'})
        output = engine.analyze(inp)

        # Print structured output (what Layer 3 and UI receive)
        result = output.to_dict()
        print(json.dumps(result, indent=2))

    print(f"\n{'=' * 72}")
    print("All scenarios complete. Output is pure JSON — ready for Layer 3.")
    print('=' * 72)


# ─── JSON API demo ────────────────────────────────────────────────────────────

def run_api_demo():
    """
    Shows how to call the engine from an API endpoint or external process.
    The `analyze()` function accepts a raw dict and returns JSON string.
    """
    print("\n── API interface demo ──")
    raw = SCENARIOS["SHORT_GAMMA_BULLISH_FLOW"].copy()
    del raw['description']

    result_json = analyze(raw)
    print(result_json)


if __name__ == '__main__':
    run_demo()
    run_api_demo()
