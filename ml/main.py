"""
Production AI System — Options Market Regime Analysis
────────────────────────────────────────────────────────────────────────────
Entry point for training, backtesting, and live inference.

QUICK START:
  python -m ml.main --mode demo            # demo with synthetic data
  python -m ml.main --mode backtest        # walk-forward backtest
  python -m ml.main --mode live --symbol SPY  # live inference (Yahoo Finance)

ARCHITECTURE:
  Feature Pipeline (GEX + Skew + Flow + Microstructure + Time)
       ↓
  XGBoost (tabular cross-section) + LSTM (time-series memory)
       ↓
  Hybrid Ensemble (confidence-weighted soft voting)
       ↓
  Signal Constructor (microstructure rules + key levels)
       ↓
  Structured Output JSON
"""

import argparse
import json
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import pandas as pd

from ml.features.feature_pipeline  import FeaturePipeline
from ml.models.hybrid_model         import HybridRegimeModel
from ml.models.xgboost_model        import generate_labels, generate_vol_labels, RegimeClassifier
from ml.signal.signal_constructor   import SignalConstructor
from ml.backtest.engine             import WalkForwardEngine, BacktestConfig
from ml.data.mock_data              import generate_market_snapshots, snapshots_to_features, generate_prices_series


# ─── Demo mode ───────────────────────────────────────────────────────────────

def run_demo():
    """
    Full pipeline demonstration with synthetic data.
    Shows training → inference → structured output.
    """
    print("=" * 70)
    print("OPTIONS REGIME AI — Demo Mode")
    print("=" * 70)

    # 1. Generate synthetic data
    print("\n[1/5] Generating synthetic market data (500 bars)...")
    snapshots = generate_market_snapshots(n_bars=500)
    features  = snapshots_to_features(snapshots)
    prices    = pd.Series([s.spot for s in snapshots], name='price')

    print(f"      Feature matrix: {features.shape[0]} bars × {features.shape[1]} features")
    print(f"      Feature groups: GEX, Skew, Flow, Microstructure, Time")

    # 2. Generate labels
    print("\n[2/5] Generating regime labels (5-bar forward returns)...")
    labels    = generate_labels(prices, lookahead_bars=5).dropna()
    features  = features.loc[labels.index]
    prices_al = prices.loc[labels.index]

    n_long    = (labels == 1).sum()
    n_neutral = (labels == 0).sum()
    n_short   = (labels == -1).sum()
    print(f"      LONG: {n_long} | NEUTRAL: {n_neutral} | SHORT: {n_short}")

    # 3. Train/val split (time-ordered — NO SHUFFLE)
    print("\n[3/5] Training hybrid XGBoost+LSTM model...")
    split     = int(len(features) * 0.75)
    X_train   = features.iloc[:split]
    y_train   = labels.iloc[:split]
    X_val     = features.iloc[split:]
    y_val     = labels.iloc[split:]

    n_features = features.shape[1]
    model = HybridRegimeModel(
        n_features  = n_features,
        seq_len     = 15,
        use_lstm    = _has_torch(),
    )
    model.fit(X_train, y_train, X_val, y_val)
    print("      Training complete.")

    # 4. Inference on latest data
    print("\n[4/5] Running inference on most recent 20 bars...")
    X_recent = features.iloc[-20:]
    output   = model.predict_full(X_recent)

    # Build signal
    constructor = SignalConstructor(min_confidence=0.40)
    latest_feat = features.iloc[-1]
    signal      = constructor.construct(output, latest_feat, spot=prices.iloc[-1])

    # 5. Print result
    print("\n[5/5] Signal output:")
    print_signal(signal.to_dict(), prices.iloc[-1])

    # Feature importance
    print("\nTop features (XGBoost gain-based):")
    try:
        imp = model.xgb.get_feature_importance(10)
        for _, row in imp.iterrows():
            bar = "█" * int(row['importance'] * 200)
            print(f"  {row['feature']:<40} {bar}")
    except Exception:
        pass

    return signal


# ─── Backtest mode ────────────────────────────────────────────────────────────

def run_backtest():
    """Walk-forward backtest on synthetic data."""
    print("=" * 70)
    print("OPTIONS REGIME AI — Walk-Forward Backtest")
    print("=" * 70)

    print("\nGenerating data...")
    snapshots = generate_market_snapshots(n_bars=1000)
    features  = snapshots_to_features(snapshots)
    prices    = pd.Series([s.spot for s in snapshots], name='price')

    config = BacktestConfig(
        train_window  = 200,
        val_window    = 50,
        step_size     = 25,
        purge_gap     = 5,
        spread_bps    = 5.0,
        hold_bars     = 5,
    )

    def model_factory():
        return RegimeClassifier()

    def label_fn(p):
        return generate_labels(p, lookahead_bars=5)

    engine  = WalkForwardEngine(config)
    results = engine.run(features, prices, model_factory, label_fn, verbose=True)

    print("\n" + "─" * 50)
    print("AGGREGATE BACKTEST METRICS")
    print("─" * 50)
    for k, v in results.metrics.items():
        print(f"  {k:<25} {v}")

    if results.feature_importance is not None:
        print("\nAverage feature importance across folds:")
        print(results.feature_importance.head(10).to_string(index=False))

    return results


# ─── Live inference mode ──────────────────────────────────────────────────────

def run_live(symbol: str = 'SPY', model_dir: Optional[str] = None):
    """
    Live inference using Yahoo Finance (delayed) or custom loader.

    For production, replace YahooFinanceLoader with TradierLoader or IB.
    """
    from typing import Optional
    print(f"[Live] Fetching data for {symbol}...")

    try:
        from ml.data.loader import create_loader
        loader   = create_loader(symbol, source='yahoo')
        snapshot = loader.get_snapshot()
    except ImportError:
        print("[WARN] yfinance not installed. Using synthetic snapshot.")
        from ml.data.mock_data import generate_market_snapshots
        snapshot = generate_market_snapshots(1)[0]

    pipeline = FeaturePipeline()
    features = pipeline.transform(snapshot)
    feat_df  = pd.DataFrame([features])

    if model_dir and os.path.exists(model_dir):
        print(f"[Live] Loading trained model from {model_dir}")
        model = HybridRegimeModel(n_features=len(features))
        model.load(model_dir)
    else:
        print("[Live] No saved model found. Using rule-based signal only.")
        # Fall back to pure microstructure signal
        output = _rule_based_signal(features)
        print(json.dumps(output, indent=2))
        return

    output = model.predict_full(feat_df)
    constructor = SignalConstructor()
    signal  = constructor.construct(output, feat_df.iloc[-1], spot=snapshot.spot)

    print(json.dumps(signal.to_dict(), indent=2))


def _rule_based_signal(features: dict) -> dict:
    """Pure microstructure rule-based signal (no ML required)."""
    gex     = features.get('gex_net_gex', 0)
    rr25    = features.get('skew_rr25', 0)
    flow    = features.get('flow_flow_regime', 0)
    dealer  = features.get('gex_dealer_positioning', 0)

    score = np.sign(gex) * 0.4 + np.sign(-rr25) * 0.2 + flow * 0.4

    bias = 'LONG' if score > 0.3 else ('SHORT' if score < -0.3 else 'NEUTRAL')
    conf = min(abs(score) / 1.0, 0.85)

    return {
        'bias':      bias,
        'confidence': round(float(conf), 4),
        'gamma_regime': 'LONG GAMMA' if gex > 0 else 'SHORT GAMMA',
        'explanation': f"Rule-based: GEX={gex:.2f}, RR25={rr25:.2f}, Flow={flow}",
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def print_signal(signal: dict, spot: float):
    bias  = signal['bias']
    conf  = signal['confidence']
    gamma = signal['gamma_regime']
    vol   = signal['volatility_regime']

    color = '\033[92m' if bias == 'LONG' else ('\033[91m' if bias == 'SHORT' else '\033[93m')
    reset = '\033[0m'

    print(f"\n  {'─'*48}")
    print(f"  SPOT PRICE:       ${spot:,.2f}")
    print(f"  BIAS:             {color}{bias}{reset}")
    print(f"  CONFIDENCE:       {conf*100:.1f}%")
    print(f"  GAMMA REGIME:     {gamma}")
    print(f"  VOL REGIME:       {vol}")

    levels = signal.get('key_levels', {})
    if levels.get('support'):
        print(f"  SUPPORT:          {levels['support']}")
    if levels.get('resistance'):
        print(f"  RESISTANCE:       {levels['resistance']}")

    print(f"\n  EXPLANATION:")
    explanation = signal.get('explanation', '')
    # Word-wrap at 60 chars
    words = explanation.split()
    line  = '    '
    for w in words:
        if len(line) + len(w) > 65:
            print(line)
            line = '    ' + w + ' '
        else:
            line += w + ' '
    if line.strip():
        print(line)
    print(f"  {'─'*48}\n")


def _has_torch() -> bool:
    try:
        import torch
        return True
    except ImportError:
        return False


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    from typing import Optional

    parser = argparse.ArgumentParser(description='Options Regime AI System')
    parser.add_argument('--mode',      choices=['demo', 'backtest', 'live'], default='demo')
    parser.add_argument('--symbol',    default='SPY', help='Ticker symbol for live mode')
    parser.add_argument('--model-dir', default=None,  help='Path to saved model directory')
    args = parser.parse_args()

    if args.mode == 'demo':
        run_demo()
    elif args.mode == 'backtest':
        run_backtest()
    elif args.mode == 'live':
        run_live(args.symbol, args.model_dir)


if __name__ == '__main__':
    main()
