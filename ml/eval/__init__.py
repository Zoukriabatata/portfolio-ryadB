"""
ml.eval — Data-driven evaluation layer for the OrderFlow engine.
────────────────────────────────────────────────────────────────
Modules:
  signal_logger    — CSV logging of engine signals
  outcome_tracker  — attach forward returns / MFE / MAE to signals
  signal_quality   — [0,1] quality score from deterministic engine fields
  signal_evaluator — aggregate metrics (Sharpe, win rate, drawdown, PF)
  calibrator       — walk-forward grid search for engine parameters
  backtest_runner  — end-to-end pipeline
  report           — plain-text + JSON report generation

Quick start:
    from ml.eval.backtest_runner import BacktestRunner
    from ml.data.mock_data import generate_market_snapshots

    result = BacktestRunner().run(generate_market_snapshots(500))
    print(result.report_text)
"""

from .signal_logger    import SignalLogger, SignalRecord
from .outcome_tracker  import attach_outcomes, compute_outcome
from .signal_quality   import SignalQualityScorer
from .signal_evaluator import SignalEvaluator, EvalMetrics
from .calibrator       import EngineCalibrator, EngineParams, CalibrationResult
from .backtest_runner  import BacktestRunner, BacktestRunResult
from .report           import format_report, save_report

__all__ = [
    'SignalLogger', 'SignalRecord',
    'attach_outcomes', 'compute_outcome',
    'SignalQualityScorer',
    'SignalEvaluator', 'EvalMetrics',
    'EngineCalibrator', 'EngineParams', 'CalibrationResult',
    'BacktestRunner', 'BacktestRunResult',
    'format_report', 'save_report',
]
