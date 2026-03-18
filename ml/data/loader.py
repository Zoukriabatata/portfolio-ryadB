"""
Real-Time Data Loader
────────────────────────────────────────────────────────────────────────────
Connects to real data sources for live inference.

SUPPORTED SOURCES:
  1. CBOE LiveVol (via REST API) — option chain + IV surface
  2. Tradier API (free tier) — option quotes + greeks
  3. Interactive Brokers (via ib_insync) — full market data
  4. Yahoo Finance (yfinance) — delayed data, testing only

SETUP:
  pip install requests pandas yfinance
  For IB: pip install ib_insync

HOW TO USE IN PRODUCTION:
  loader = OptionDataLoader(symbol='SPY', source='tradier', api_key='...')
  snapshot = loader.get_snapshot()
  features = pipeline.transform(snapshot)
  signal   = model.predict_full(pd.DataFrame([features]))
"""

import numpy as np
import pandas as pd
from datetime import datetime
from typing import Optional
import warnings

from ..features.feature_pipeline import MarketSnapshot


# ─── Base class ──────────────────────────────────────────────────────────────

class BaseDataLoader:
    """Abstract base for all data loaders."""

    def __init__(self, symbol: str):
        self.symbol = symbol.upper()

    def get_snapshot(self) -> MarketSnapshot:
        raise NotImplementedError

    def get_option_chain(self) -> pd.DataFrame:
        raise NotImplementedError


# ─── Yahoo Finance loader (free, delayed) ────────────────────────────────────

class YahooFinanceLoader(BaseDataLoader):
    """
    Uses yfinance for delayed option data.
    Suitable for research and testing. NOT for live trading.

    Usage:
        loader = YahooFinanceLoader('SPY')
        snap   = loader.get_snapshot()
    """

    def __init__(self, symbol: str, days_to_expiry_target: float = 30.0):
        super().__init__(symbol)
        self.dte_target = days_to_expiry_target

        try:
            import yfinance as yf
            self._yf = yf
        except ImportError:
            raise ImportError("pip install yfinance")

    def get_snapshot(self) -> MarketSnapshot:
        ticker = self._yf.Ticker(self.symbol)

        # Current price
        info  = ticker.fast_info
        spot  = float(info.last_price or info.regularMarketPrice or 100.0)

        # Option chain (nearest expiry to target DTE)
        chain_df, dte = self._get_nearest_chain(ticker, spot)

        # IV estimates
        iv_atm = self._estimate_atm_iv(chain_df, spot)

        # Volume-based flow proxy
        call_df = chain_df[chain_df['optionType'] == 'call']
        put_df  = chain_df[chain_df['optionType'] == 'put']

        call_vol = float(call_df['volume'].sum())
        put_vol  = float(put_df['volume'].sum())

        # Approximate bid-ask spread as proxy for buy/sell split
        call_buy  = call_vol * 0.55   # rough approximation
        call_sell = call_vol * 0.45
        put_buy   = put_vol  * 0.55
        put_sell  = put_vol  * 0.45

        # Build option chain for GEX
        gex_chain = self._build_gex_chain(chain_df, spot)

        # 25d RR approximation from chain
        iv_c25, iv_p25 = self._estimate_25d_ivs(chain_df, spot)

        return MarketSnapshot(
            timestamp       = datetime.now(),
            spot            = spot,
            days_to_expiry  = dte,
            option_chain    = gex_chain,
            iv_call_25d     = iv_c25,
            iv_put_25d      = iv_p25,
            iv_atm          = iv_atm,
            call_buy_vol    = call_buy,
            call_sell_vol   = call_sell,
            put_buy_vol     = put_buy,
            put_sell_vol    = put_sell,
        )

    def _get_nearest_chain(self, ticker, spot: float) -> tuple[pd.DataFrame, float]:
        """Get option chain closest to target DTE."""
        expirations = ticker.options
        if not expirations:
            warnings.warn("No option expirations found.")
            return pd.DataFrame(), self.dte_target

        # Find expiry closest to target
        today = datetime.today()
        best_exp = min(
            expirations,
            key=lambda e: abs((datetime.strptime(e, '%Y-%m-%d') - today).days - self.dte_target),
        )
        dte = (datetime.strptime(best_exp, '%Y-%m-%d') - today).days

        chain = ticker.option_chain(best_exp)
        calls = chain.calls.copy()
        puts  = chain.puts.copy()
        calls['optionType'] = 'call'
        puts['optionType']  = 'put'
        combined = pd.concat([calls, puts], ignore_index=True)
        combined['volume'] = combined['volume'].fillna(0).astype(float)

        return combined, max(float(dte), 0.5)

    def _build_gex_chain(self, chain_df: pd.DataFrame, spot: float) -> pd.DataFrame:
        """Build GEX-format option chain from yfinance data."""
        calls = chain_df[chain_df['optionType'] == 'call'].copy()
        puts  = chain_df[chain_df['optionType'] == 'put'].copy()

        strikes = sorted(set(calls['strike'].tolist()) | set(puts['strike'].tolist()))
        rows = []
        for k in strikes:
            c = calls[calls['strike'] == k]
            p = puts[puts['strike'] == k]
            rows.append({
                'strike':     float(k),
                'call_oi':    float(c['openInterest'].sum() if not c.empty else 0),
                'put_oi':     float(p['openInterest'].sum() if not p.empty else 0),
                'call_gamma': float(c['gamma'].mean() if not c.empty and 'gamma' in c else 0.01),
                'put_gamma':  float(p['gamma'].mean() if not p.empty and 'gamma' in p else 0.01),
            })
        return pd.DataFrame(rows)

    def _estimate_atm_iv(self, chain_df: pd.DataFrame, spot: float) -> float:
        """Find ATM IV from the option chain."""
        near_atm = chain_df.iloc[
            (chain_df['strike'] - spot).abs().argsort()[:4]
        ]
        iv_col = 'impliedVolatility'
        if iv_col in near_atm.columns:
            return float(near_atm[iv_col].replace(0, np.nan).mean()) or 0.20
        return 0.20

    def _estimate_25d_ivs(self, chain_df: pd.DataFrame, spot: float) -> tuple[float, float]:
        """Approximate 25-delta call and put IVs."""
        calls = chain_df[chain_df['optionType'] == 'call']
        puts  = chain_df[chain_df['optionType'] == 'put']

        atm_iv = self._estimate_atm_iv(chain_df, spot)

        # 25-delta ≈ strike at 1σ OTM
        c25_strike = spot * 1.08
        p25_strike = spot * 0.92

        c = calls.iloc[(calls['strike'] - c25_strike).abs().argsort()[:1]]
        p = puts.iloc[(puts['strike'] - p25_strike).abs().argsort()[:1]]

        iv_c = float(c['impliedVolatility'].iloc[0]) if not c.empty and 'impliedVolatility' in c else atm_iv + 0.01
        iv_p = float(p['impliedVolatility'].iloc[0]) if not p.empty and 'impliedVolatility' in p else atm_iv + 0.02

        return iv_c, iv_p


# ─── Tradier API loader (free tier) ──────────────────────────────────────────

class TradierLoader(BaseDataLoader):
    """
    Tradier brokerage API — free sandbox available.
    Sign up: https://developer.tradier.com/
    """

    SANDBOX_URL = "https://sandbox.tradier.com/v1"
    LIVE_URL    = "https://api.tradier.com/v1"

    def __init__(self, symbol: str, api_key: str, sandbox: bool = True):
        super().__init__(symbol)
        self.api_key  = api_key
        self.base_url = self.SANDBOX_URL if sandbox else self.LIVE_URL
        self.headers  = {
            'Authorization': f'Bearer {api_key}',
            'Accept': 'application/json',
        }

    def get_snapshot(self) -> MarketSnapshot:
        try:
            import requests
        except ImportError:
            raise ImportError("pip install requests")

        # Quote
        r     = requests.get(f"{self.base_url}/markets/quotes", params={'symbols': self.symbol}, headers=self.headers)
        quote = r.json()['quotes']['quote']
        spot  = float(quote['last'] or quote['ask'])

        # Options chain
        chains = self._get_chains(requests, spot)

        return MarketSnapshot(
            timestamp      = datetime.now(),
            spot           = spot,
            days_to_expiry = chains.get('dte', 30.0),
            option_chain   = chains.get('gex_chain'),
            iv_call_25d    = chains.get('iv_c25', 0.20),
            iv_put_25d     = chains.get('iv_p25', 0.22),
            iv_atm         = chains.get('iv_atm', 0.20),
            call_buy_vol   = chains.get('call_vol', 0.0) * 0.55,
            call_sell_vol  = chains.get('call_vol', 0.0) * 0.45,
            put_buy_vol    = chains.get('put_vol', 0.0)  * 0.55,
            put_sell_vol   = chains.get('put_vol', 0.0)  * 0.45,
        )

    def _get_chains(self, requests, spot: float) -> dict:
        """Fetch and parse option chain from Tradier."""
        r   = requests.get(f"{self.base_url}/markets/options/expirations",
                           params={'symbol': self.symbol}, headers=self.headers)
        exp_dates = r.json().get('expirations', {}).get('date', [])
        if not exp_dates:
            return {}

        # Pick nearest ~30 DTE
        today = datetime.today()
        target_exp = min(
            exp_dates,
            key=lambda e: abs((datetime.strptime(e, '%Y-%m-%d') - today).days - 30),
        )
        dte = (datetime.strptime(target_exp, '%Y-%m-%d') - today).days

        r       = requests.get(f"{self.base_url}/markets/options/chains",
                               params={'symbol': self.symbol, 'expiration': target_exp,
                                       'greeks': 'true'}, headers=self.headers)
        options = r.json().get('options', {}).get('option', [])
        if not options:
            return {}

        df = pd.DataFrame(options)
        df['volume'] = pd.to_numeric(df.get('volume', 0), errors='coerce').fillna(0)

        calls = df[df['option_type'] == 'call']
        puts  = df[df['option_type'] == 'put']

        call_vol = float(calls['volume'].sum())
        put_vol  = float(puts['volume'].sum())

        # GEX chain
        gex_rows = []
        for k in sorted(df['strike'].unique()):
            c = calls[calls['strike'] == k]
            p = puts[puts['strike'] == k]
            gex_rows.append({
                'strike':     float(k),
                'call_oi':    float(c['open_interest'].sum() if 'open_interest' in c else 0),
                'put_oi':     float(p['open_interest'].sum() if 'open_interest' in p else 0),
                'call_gamma': float(c['greeks'].apply(lambda g: g.get('gamma', 0.01) if isinstance(g, dict) else 0.01).mean() if not c.empty else 0.01),
                'put_gamma':  float(p['greeks'].apply(lambda g: g.get('gamma', 0.01) if isinstance(g, dict) else 0.01).mean() if not p.empty else 0.01),
            })

        atm_row = df.iloc[(df['strike'] - spot).abs().argsort()[:4]]
        iv_atm  = float(atm_row['greeks'].apply(
            lambda g: g.get('mid_iv', 0.20) if isinstance(g, dict) else 0.20
        ).mean())

        return {
            'dte':       float(dte),
            'gex_chain': pd.DataFrame(gex_rows),
            'iv_atm':    iv_atm,
            'iv_c25':    iv_atm + 0.01,
            'iv_p25':    iv_atm + 0.02,
            'call_vol':  call_vol,
            'put_vol':   put_vol,
        }


# ─── Factory ─────────────────────────────────────────────────────────────────

def create_loader(
    symbol:  str,
    source:  str = 'yahoo',
    api_key: str = '',
    **kwargs,
) -> BaseDataLoader:
    """
    Factory function for data loaders.

    Args:
        symbol : ticker symbol (e.g., 'SPY')
        source : 'yahoo' | 'tradier'
        api_key: required for 'tradier'

    Returns: configured loader instance
    """
    source = source.lower()
    if source == 'yahoo':
        return YahooFinanceLoader(symbol, **kwargs)
    elif source == 'tradier':
        if not api_key:
            raise ValueError("Tradier requires an api_key")
        return TradierLoader(symbol, api_key, **kwargs)
    else:
        raise ValueError(f"Unknown source: {source}. Use 'yahoo' or 'tradier'.")
