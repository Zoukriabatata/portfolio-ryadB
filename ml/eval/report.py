"""
Report Formatter — human-readable backtest report.
────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Optional

from .signal_evaluator import EvalMetrics

_NL = '\n'


def _pct(v: float, digits: int = 1) -> str:
    if math.isnan(v):
        return 'N/A'
    return f'{v * 100:.{digits}f}%'


def _f(v: float, digits: int = 3) -> str:
    if math.isnan(v):
        return 'N/A'
    return f'{v:.{digits}f}'


def _section(title: str) -> str:
    bar = '─' * (len(title) + 4)
    return f'\n{bar}\n  {title}\n{bar}'


def _metrics_block(m: EvalMetrics, indent: str = '  ') -> str:
    if m.n_evaluated == 0:
        return f'{indent}No evaluated signals.'
    lines = [
        f'{indent}Signals   : {m.n_evaluated}/{m.n_signals} evaluated',
        f'{indent}Win rate  : {_pct(m.win_rate)}   '
        f'Target hit: {_pct(m.hit_target_pct)}   '
        f'Stop hit: {_pct(m.hit_stop_pct)}',
        f'{indent}Returns   : 5m={_f(m.avg_ret_5m)}  15m={_f(m.avg_ret_15m)}  1h={_f(m.avg_ret_1h)}',
        f'{indent}MFE/MAE   : {_f(m.mfe_mae_ratio)} (>1 = good entries)',
        f'{indent}Sharpe(1h): {_f(m.sharpe_1h)}   '
        f'PF: {_f(m.profit_factor)}   '
        f'MaxDD: {_pct(m.max_drawdown)}',
    ]
    return _NL.join(lines)


def format_report(
    eval_report: dict,
    n_snapshots: int = 0,
    symbol:      str = 'SIM',
    calibration  = None,   # CalibrationResult | None
) -> str:
    """Build a plain-text backtest report from SignalEvaluator.full_report()."""
    lines: list[str] = []

    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    lines.append('=' * 60)
    lines.append(f'  ORDERFLOW ENGINE BACKTEST REPORT')
    lines.append(f'  Symbol: {symbol}   Bars: {n_snapshots}   {ts}')
    lines.append('=' * 60)

    # ── Overall ───────────────────────────────────────────────────────────────
    lines.append(_section('OVERALL'))
    overall = eval_report.get('overall')
    if overall:
        lines.append(_metrics_block(overall))

    # ── Quality filter ────────────────────────────────────────────────────────
    lines.append(_section('HIGH QUALITY (quality ≥ 0.60)'))
    fq = eval_report.get('filtered_quality')
    if fq:
        lines.append(_metrics_block(fq))

    # ── By bias ───────────────────────────────────────────────────────────────
    lines.append(_section('BY BIAS'))
    for bias, m in (eval_report.get('by_bias') or {}).items():
        if m.n_evaluated == 0:
            continue
        lines.append(f'  [{bias}]')
        lines.append(_metrics_block(m, indent='    '))

    # ── By quality tier ───────────────────────────────────────────────────────
    lines.append(_section('BY QUALITY TIER'))
    for tier, m in (eval_report.get('by_quality_tier') or {}).items():
        if m.n_evaluated == 0:
            continue
        lines.append(f'  [{tier.upper()}]')
        lines.append(_metrics_block(m, indent='    '))

    # ── By gamma regime ───────────────────────────────────────────────────────
    lines.append(_section('BY GAMMA REGIME'))
    for reg, m in (eval_report.get('by_gamma_regime') or {}).items():
        if m.n_evaluated == 0:
            continue
        lines.append(f'  [{reg}]')
        lines.append(_metrics_block(m, indent='    '))

    # ── By market regime ──────────────────────────────────────────────────────
    lines.append(_section('BY MARKET REGIME'))
    for reg, m in (eval_report.get('by_regime') or {}).items():
        if m.n_evaluated == 0:
            continue
        lines.append(f'  [{reg}]')
        lines.append(_metrics_block(m, indent='    '))

    # ── Gamma squeeze ─────────────────────────────────────────────────────────
    lines.append(_section('GAMMA SQUEEZE vs NORMAL'))
    for label, m in (eval_report.get('by_gamma_squeeze') or {}).items():
        if m.n_evaluated == 0:
            continue
        lines.append(f'  [{label.upper()}]')
        lines.append(_metrics_block(m, indent='    '))

    # ── Calibration ───────────────────────────────────────────────────────────
    if calibration is not None:
        lines.append(_section('PARAMETER CALIBRATION'))
        lines.append(f'  {calibration}')
        lines.append(f'  Combos tested : {calibration.n_combos_tested}')
        if calibration.history:
            lines.append(f'\n  Top 5 combos (train Sharpe):')
            for entry in calibration.history[:5]:
                w = entry['weights']
                lines.append(
                    f"    gex={w['w_gex']:.2f} flow={w['w_flow']:.2f} "
                    f"skew={w['w_skew']:.2f} lvl={w['w_levels']:.2f} | "
                    f"gate={entry['gate']:.2f} sq={entry['squeeze']:.2f} | "
                    f"Sharpe={entry['sharpe']:.3f} n={entry['n_signals']}"
                )

    lines.append('\n' + '=' * 60)
    return _NL.join(lines)


def save_report(
    report_text: str,
    eval_report: dict,
    output_dir: Path = Path('data/reports'),
    symbol:     str  = 'SIM',
    calibration = None,
) -> tuple[Path, Path]:
    """
    Save report as .txt and .json.
    Returns (txt_path, json_path).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    ts_str  = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    stem    = f'{symbol}_{ts_str}'
    txt_path  = output_dir / f'{stem}.txt'
    json_path = output_dir / f'{stem}.json'

    txt_path.write_text(report_text, encoding='utf-8')

    # Build JSON-serialisable summary
    def _serialise(obj):
        if hasattr(obj, '__dataclass_fields__'):
            return {k: _serialise(getattr(obj, k)) for k in obj.__dataclass_fields__}
        if isinstance(obj, dict):
            return {k: _serialise(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_serialise(x) for x in obj]
        if isinstance(obj, float) and math.isnan(obj):
            return None
        return obj

    payload = {
        'symbol':      symbol,
        'timestamp':   datetime.utcnow().isoformat(),
        'eval':        _serialise(eval_report),
        'calibration': _serialise(calibration) if calibration else None,
    }
    json_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')

    return txt_path, json_path
