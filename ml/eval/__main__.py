"""
CLI entry point for the ml.eval backtest pipeline.

Usage:
    python -m ml.eval                        # 500 bars, SIM
    python -m ml.eval --bars 1000            # more bars
    python -m ml.eval --symbol BTC --bars 500 --no-calibrate
    python -m ml.eval --save                 # save txt + JSON report

Options:
    --bars N         Number of synthetic bars (default: 500)
    --symbol SYM     Symbol label (default: SIM)
    --no-calibrate   Skip parameter calibration (faster)
    --save           Save report to data/reports/
    --out DIR        Output directory for saved reports
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description='OrderFlow engine backtest / calibration',
        prog='python -m ml.eval',
    )
    parser.add_argument('--bars',         type=int,   default=500,    help='Synthetic bars')
    parser.add_argument('--symbol',       type=str,   default='SIM',  help='Symbol label')
    parser.add_argument('--no-calibrate', action='store_true',        help='Skip calibration')
    parser.add_argument('--save',         action='store_true',        help='Save report files')
    parser.add_argument('--out',          type=str,   default='data/reports', help='Report output dir')
    args = parser.parse_args()

    # ── Imports (deferred to avoid slow import at help time) ──────────────────
    try:
        from ml.data.mock_data import generate_market_snapshots
    except ImportError:
        print('[ERROR] Could not import ml.data.mock_data — run from project root.', file=sys.stderr)
        return 1

    from ml.eval.backtest_runner import BacktestRunner
    from ml.eval.report import save_report

    print(f'Generating {args.bars} synthetic bars for {args.symbol}...', flush=True)
    snapshots = generate_market_snapshots(args.bars)

    print('Running engine + evaluation pipeline...', flush=True)
    runner = BacktestRunner(calibrate=not args.no_calibrate)
    result = runner.run(snapshots, symbol=args.symbol)

    print(result.report_text)

    if args.save:
        from pathlib import Path
        txt, jsn = save_report(
            result.report_text,
            result.eval_report,
            output_dir  = Path(args.out),
            symbol      = args.symbol,
            calibration = result.calibration,
        )
        print(f'\nReport saved:\n  {txt}\n  {jsn}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
