"""
Backtest Runner — end-to-end evaluation pipeline.
──────────────────────────────────────────────────────────────────────────────
Ties together:
  AnalysisEngine  →  SignalLogger  →  OutcomeTracker  →  SignalEvaluator
                                  →  EngineCalibrator

Usage:
    from ml.eval.backtest_runner import BacktestRunner
    from ml.data.mock_data import generate_market_snapshots

    snapshots = generate_market_snapshots(500)
    runner    = BacktestRunner()
    result    = runner.run(snapshots)
    print(result.report_text)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from ..engine.analysis_engine import AnalysisEngine
from ..engine.schemas import (
    EngineInput, GEXInput, SkewInput, FlowInput,
    MicrostructureInput, ContextInput, IntradayPhase,
)
from ..data.mock_data import MarketSnapshot

from .signal_logger    import SignalLogger, SignalRecord
from .outcome_tracker  import attach_outcomes
from .signal_evaluator import SignalEvaluator
from .calibrator       import EngineCalibrator, CalibrationResult
from .report           import format_report


# ─── Result dataclass ─────────────────────────────────────────────────────────

@dataclass
class BacktestRunResult:
    signals_df:   list[SignalRecord]
    eval_report:  dict
    report_text:  str
    calibration:  Optional[CalibrationResult] = None
    n_snapshots:  int = 0
    n_signals:    int = 0


# ─── Snapshot → EngineInput bridge ────────────────────────────────────────────

def _snapshot_to_input(snap: MarketSnapshot) -> EngineInput:
    """
    Convert a MarketSnapshot (from mock_data) to a full EngineInput.
    Handles the real MarketSnapshot schema: snap.spot, snap.option_chain (DataFrame),
    snap.iv_call_25d / iv_put_25d / iv_atm, snap.call_buy_vol / put_buy_vol, etc.
    """
    price = float(snap.spot)

    # ── Net GEX from option chain DataFrame ───────────────────────────────────
    net_gex = snap.net_gex if snap.net_gex is not None else 0.0
    if net_gex == 0.0 and snap.option_chain is not None:
        try:
            oc  = snap.option_chain
            # net GEX ∝ sum((call_gamma - put_gamma) × OI) × spot² × 0.01
            call_g = oc['call_gamma'].values if 'call_gamma' in oc.columns else None
            put_g  = oc['put_gamma'].values  if 'put_gamma'  in oc.columns else None
            c_oi   = oc['call_oi'].values    if 'call_oi'    in oc.columns else None
            p_oi   = oc['put_oi'].values     if 'put_oi'     in oc.columns else None
            if call_g is not None and put_g is not None and c_oi is not None:
                p_oi_   = p_oi if p_oi is not None else c_oi
                gex_raw = float(sum(
                    (cg * co - pg * po)
                    for cg, co, pg, po in zip(call_g, c_oi, put_g, p_oi_)
                ))
                # Scale to B$ range similar to JS engine (divide by 1e6)
                net_gex = round(gex_raw * price * price * 0.01 / 1e6, 4)
        except Exception:
            net_gex = 0.0

    # ── Gamma flip: approximate as net GEX zero-crossing proxy ───────────────
    flip = price * (0.99 if net_gex >= 0 else 1.01)

    # ── Skew (risk reversal 25d) ──────────────────────────────────────────────
    iv_call = float(snap.iv_call_25d) if snap.iv_call_25d is not None else 0.18
    iv_put  = float(snap.iv_put_25d)  if snap.iv_put_25d  is not None else 0.20
    skew25d = iv_call - iv_put          # positive = call skew, negative = put skew

    # ── IV rank (approximate from iv_atm: assume [0.10, 0.60] range) ─────────
    iv_atm  = float(snap.iv_atm) if snap.iv_atm is not None else 0.20
    iv_rank = max(0.0, min(100.0, (iv_atm - 0.10) / 0.50 * 100))

    # ── Flow from buy/sell volumes ────────────────────────────────────────────
    call_buy  = float(snap.call_buy_vol)  if snap.call_buy_vol  is not None else 500.0
    call_sell = float(snap.call_sell_vol) if snap.call_sell_vol is not None else 500.0
    put_buy   = float(snap.put_buy_vol)   if snap.put_buy_vol   is not None else 500.0

    total_flow = call_buy + call_sell + put_buy
    call_pct   = (call_buy / total_flow * 100) if total_flow > 0 else 50.0
    put_pct    = 100.0 - call_pct
    pcr        = put_pct / call_pct if call_pct > 0 else 1.0
    ofi        = (call_pct - 50) / 50

    # ── Key levels ────────────────────────────────────────────────────────────
    gex_mag   = abs(net_gex)
    spread    = 0.02 * (1 + min(gex_mag, 10) / 5)
    call_wall = round(price * (1 + spread), 2)
    put_wall  = round(price * (1 - spread), 2)
    dist      = (price - flip) / price

    # ── TTE from days_to_expiry ───────────────────────────────────────────────
    tte = float(snap.days_to_expiry) if snap.days_to_expiry is not None else 5.0

    return EngineInput(
        gex=GEXInput(
            net_gex               = net_gex,
            gamma_flip_level      = flip,
            distance_to_flip      = round(dist, 5),
            call_wall             = call_wall,
            put_wall              = put_wall,
            dealer_position_proxy = max(-1.0, min(1.0, net_gex / 3.0)),
        ),
        skew=SkewInput(
            risk_reversal_25d = skew25d,
            iv_atm            = iv_atm,
            iv_slope          = skew25d / 20.0,
            term_structure    = 0.0,
            skew_change_1d    = 0.0,
        ),
        flow=FlowInput(
            call_volume          = int(call_pct * 1000),
            put_volume           = int(put_pct  * 1000),
            call_put_ratio       = 1.0 / max(pcr, 1e-3),
            order_flow_imbalance = round(ofi, 4),
            aggressive_buy_ratio = round(call_pct / 100, 4),
            sweep_net            = int((call_pct - 50) / 5),
        ),
        microstructure=MicrostructureInput(
            bid_ask_spread  = round(price * 0.0002, 4),
            relative_spread = 0.0002,
            liquidity_index = 0.75,
            trade_intensity = 30.0,
            realized_vol_1h = iv_atm * 0.8,
        ),
        context=ContextInput(
            spot_price     = price,
            time_to_expiry = tte,
            intraday_phase = IntradayPhase.AFTERNOON,
            iv_rank        = iv_rank,
            prev_close     = round(price * 0.9985, 2),
        ),
    )


# ─── BacktestRunner ───────────────────────────────────────────────────────────

class BacktestRunner:
    """
    Full pipeline: snapshots → signals → outcomes → metrics → calibration.
    """

    def __init__(self, calibrate: bool = True) -> None:
        self._engine    = AnalysisEngine(use_ml=False)
        self._calibrate = calibrate

    def run(
        self,
        snapshots: list[MarketSnapshot],
        symbol: str = 'SIM',
    ) -> BacktestRunResult:
        """
        Args:
            snapshots : List of MarketSnapshot (from mock_data or real feed)
            symbol    : Symbol label for metadata

        Returns:
            BacktestRunResult
        """
        prices  = [float(s.spot) for s in snapshots]
        records = self._generate_signals(snapshots, symbol)

        if not records:
            return BacktestRunResult(
                signals_df  = [],
                eval_report = {},
                report_text = 'No signals generated.',
                n_snapshots = len(snapshots),
                n_signals   = 0,
            )

        attach_outcomes(records, prices)
        eval_report = SignalEvaluator(records).full_report()

        calibration: Optional[CalibrationResult] = None
        if self._calibrate and len(records) >= 20:
            calibration = EngineCalibrator(records, prices).calibrate()

        report_text = format_report(
            eval_report, n_snapshots=len(snapshots), symbol=symbol, calibration=calibration,
        )

        return BacktestRunResult(
            signals_df  = records,
            eval_report = eval_report,
            report_text = report_text,
            calibration = calibration,
            n_snapshots = len(snapshots),
            n_signals   = len(records),
        )

    # ── Internal ──────────────────────────────────────────────────────────────

    def _generate_signals(
        self, snapshots: list[MarketSnapshot], symbol: str,
    ) -> list[SignalRecord]:
        records: list[SignalRecord] = []
        logger = SignalLogger.__new__(SignalLogger)
        logger._buffer = []
        logger._lock   = __import__('threading').Lock()

        prev_bias  = None
        prev_score = 0.0

        for i, snap in enumerate(snapshots):
            try:
                eng_input  = _snapshot_to_input(snap)
                eng_output = self._engine.analyze(eng_input)
                result     = eng_output.to_dict()
            except Exception:
                continue

            bias = result.get('bias', 'NEUTRAL')

            # Emit on bias change or high-confidence signal (same logic as agent)
            if bias == 'NEUTRAL':
                prev_bias = bias
                continue

            if bias == prev_bias:
                prev_bias = bias
                continue

            rec = SignalRecord(
                timestamp          = snap.timestamp.isoformat() if hasattr(snap.timestamp, 'isoformat') else str(snap.timestamp),
                symbol             = symbol,
                bar_index          = i,
                bias               = bias,
                confidence         = float(result.get('confidence', 0)),
                gamma_regime       = result.get('gamma_regime', ''),
                volatility_regime  = result.get('volatility_regime', ''),
                flow_direction     = result.get('flow_direction', ''),
                dealer_state       = result.get('dealer_state', ''),
                regime             = result.get('regime', ''),
                confluence_score   = float(result.get('confluence_score', 0)),
                price              = float(snap.spot),
                gamma_flip         = float((result.get('key_levels') or {}).get('gamma_flip', 0)),
                signal_confidence  = float(result.get('signal_confidence', 0)),
                persistence_score  = float(result.get('persistence_score', 0)),
                signal_quality     = float(result.get('signal_quality', 0)),
                adaptive_threshold = float(result.get('adaptive_threshold', 0.55)),
                gamma_squeeze      = bool(result.get('gamma_squeeze', False)),
                squeeze_strength   = float(result.get('squeeze_strength', 0)),
            )
            records.append(rec)
            prev_bias = bias

        return records
