"""
Real-Time Simulation
────────────────────────────────────────────────────────────────────────────
Generates a realistic stream of market ticks and runs the agent loop.
Simulates intraday dynamics including:
  - GEX regime shifts (random walks with drift)
  - Flow bursts (Hawkes-like clustering)
  - Skew drift correlated with price direction
  - Intraday vol patterns (open/close higher vol)
  - Macro event spikes (scheduled)

Used for testing, demos, and agent validation.
"""

from __future__ import annotations
import json
import numpy as np
import asyncio
from datetime import datetime, timedelta
from typing import AsyncIterator, Iterator
from .loop import TradingAgent
from .detector import MacroCalendar, MacroEvent


# ─── Tick generator ───────────────────────────────────────────────────────────

class MarketSimulator:
    """
    Generates synthetic but realistic tick data.
    Each call to .next_tick() advances by bar_seconds seconds.
    """

    def __init__(
        self,
        start_price:   float = 500.0,
        start_dt:      datetime = None,
        bar_seconds:   int   = 30,
        seed:          int   = 42,
    ):
        np.random.seed(seed)
        self.price         = start_price
        self.dt            = start_dt or datetime(2024, 9, 16, 9, 30)
        self.bar_seconds   = bar_seconds

        # Internal state
        self.gex           = 1.5     # start long gamma
        self.rr25          = -2.0
        self.ofi_state     = 0.0     # mean-reverting OFI state
        self.hawkes_lambda = 1.0     # Hawkes process intensity
        self.iv            = 0.18

        # Key levels
        self.support    = [start_price * 0.97, start_price * 0.94]
        self.resistance = [start_price * 1.03, start_price * 1.06]
        self.flip_level = start_price * 0.99

        self.tick_count = 0

    def next_tick(self) -> dict:
        self.tick_count += 1
        self.dt += timedelta(seconds=self.bar_seconds)

        # ── Intraday vol scaling ──────────────────────────────────────────────
        hour = self.dt.hour + self.dt.minute / 60
        if 9.5 <= hour < 10.0:
            vol_mult = 1.8   # open
        elif 12.0 <= hour < 13.5:
            vol_mult = 0.6   # lunch
        elif hour >= 15.5:
            vol_mult = 1.5   # close
        else:
            vol_mult = 1.0

        base_vol = self.iv * vol_mult / np.sqrt(252 * 6.5 * 3600 / self.bar_seconds)

        # ── Price (GBM with GEX regime effect) ───────────────────────────────
        drift = 0.0
        noise = np.random.normal(0, base_vol) * (1 + 0.5 * (self.gex < 0))
        ret   = drift + noise
        self.price *= (1 + ret)

        # ── GEX dynamics (mean-reverts, occasional regime flips) ──────────────
        self.gex += np.random.normal(-0.03 * self.gex, 0.15)
        self.gex  = np.clip(self.gex, -6, 6)
        if np.random.random() < 0.008:      # ~0.8% chance of flip per tick
            self.gex = -self.gex

        # Update flip level to track spot slowly
        self.flip_level = self.flip_level * 0.999 + self.price * 0.001 * np.sign(self.gex)

        # ── Hawkes OFI (self-exciting bursts) ─────────────────────────────────
        self.hawkes_lambda = max(0.5, self.hawkes_lambda * 0.95 + np.random.exponential(0.2))
        ofi_shock = np.random.normal(0, 0.15 * self.hawkes_lambda)

        # OFI correlates with price return (informed flow)
        self.ofi_state = 0.7 * self.ofi_state + 0.3 * ofi_shock + 0.5 * ret / base_vol * 0.1
        self.ofi_state = np.clip(self.ofi_state, -1, 1)

        # ── Skew (correlated with price direction) ────────────────────────────
        self.rr25 += np.random.normal(-0.5 * ret * 15 - 0.05 * self.rr25, 0.4)
        self.rr25  = np.clip(self.rr25, -12, 8)
        self.iv    = max(0.10, self.iv + np.random.normal(0, 0.005) + (self.gex < 0) * 0.002)

        # ── Flow volumes ─────────────────────────────────────────────────────
        base_vol_contracts = 5000
        flow_mult = 1 + abs(self.ofi_state) * 2
        call_vol  = max(100, np.random.poisson(base_vol_contracts * flow_mult * max(0.3, 0.5 + self.ofi_state * 0.5)))
        put_vol   = max(100, np.random.poisson(base_vol_contracts * flow_mult * max(0.3, 0.5 - self.ofi_state * 0.5)))

        # ── Sweeps (occasional institutional) ────────────────────────────────
        sweep_net = 0
        if self.hawkes_lambda > 1.5:
            sweep_dir = np.sign(self.ofi_state) if abs(self.ofi_state) > 0.2 else 0
            sweep_net = int(np.random.poisson(2) * sweep_dir)

        # ── Microstructure ────────────────────────────────────────────────────
        spread    = 0.001 * (1 + (1 - self.gex / 6) * 0.5) * vol_mult
        liquidity = np.clip(0.8 - abs(self.ofi_state) * 0.3 - (vol_mult - 1) * 0.15, 0.2, 0.99)
        intensity = base_vol_contracts * flow_mult / 100.0 * vol_mult

        dist_to_flip = (self.price - self.flip_level) / self.price

        return {
            'spot_price':           round(float(self.price), 2),
            'price_return':         float(ret),
            'net_gex':              round(float(self.gex), 3),
            'gamma_flip_level':     round(float(self.flip_level), 2),
            'distance_to_flip':     round(float(dist_to_flip), 6),
            'risk_reversal_25d':    round(float(self.rr25), 3),
            'iv_atm':               round(float(self.iv), 4),
            'iv_slope':             round(float(-0.3 + self.rr25 * 0.02), 3),
            'skew_change':          round(float(np.random.normal(0, 0.3)), 3),
            'order_flow_imbalance': round(float(self.ofi_state), 4),
            'aggressive_flow':      round(float(np.clip(0.5 + self.ofi_state * 0.4, 0, 1)), 4),
            'call_volume':          int(call_vol),
            'put_volume':           int(put_vol),
            'sweep_net':            sweep_net,
            'liquidity':            round(float(liquidity), 4),
            'spread':               round(float(spread), 6),
            'trade_intensity':      round(float(intensity), 1),
            'support_levels':       [round(l, 2) for l in self.support],
            'resistance_levels':    [round(l, 2) for l in self.resistance],
            'call_wall':            round(self.resistance[0], 2),
            'put_wall':             round(self.support[0], 2),
            'iv_rank':              round(float(np.clip((self.iv - 0.12) / 0.18 * 100, 0, 100)), 1),
            'macro_event':          '',
            'timestamp':            self.dt.isoformat(),
        }

    def __iter__(self) -> Iterator[dict]:
        return self

    def __next__(self) -> dict:
        return self.next_tick()

    async def async_stream(self, delay_seconds: float = 0.1) -> AsyncIterator[dict]:
        """Async version with configurable delay between ticks."""
        while True:
            yield self.next_tick()
            await asyncio.sleep(delay_seconds)


# ─── Demo runner ─────────────────────────────────────────────────────────────

def run_simulation(
    n_ticks:          int   = 500,
    bar_seconds:      int   = 30,
    verbose_agent:    bool  = False,
    print_all_signals: bool  = True,
):
    """
    Run a full simulation and print all emitted signals.
    """
    print("=" * 70)
    print("CONTINUOUS AGENT SIMULATION")
    print("=" * 70)

    # Add a scheduled macro event for realism
    calendar = MacroCalendar()
    from datetime import datetime, timedelta
    calendar.add('FOMC Minutes', datetime.now() + timedelta(minutes=12), vol_impact=0.04)
    calendar.add('CPI Release',  datetime.now() + timedelta(minutes=90), vol_impact=0.06)

    agent = TradingAgent(
        macro_calendar    = calendar,
        min_emit_interval = 0.0,   # no rate limit in simulation (no real time)
        verbose           = verbose_agent,
    )

    sim     = MarketSimulator(bar_seconds=bar_seconds)
    signals = []
    silent  = 0

    for i in range(n_ticks):
        tick   = sim.next_tick()
        output = agent.process(tick)

        if output:
            signals.append(output)
            if print_all_signals:
                data = json.loads(output) if isinstance(output, str) else output
                print(f"\n[SIGNAL #{len(signals)}] Tick {i+1}")
                print(f"  Bias:      {data['bias']} ({data['confidence']*100:.0f}%)")
                print(f"  Gamma:     {data['gamma_regime']}")
                print(f"  Flow:      {data['flow_state']}")
                print(f"  Vol:       {data['volatility_regime']}")
                print(f"  Events:    {[e['type'] for e in data.get('events', [])]}")
                print(f"  Reason:    {data['reason'][:100]}...")
        else:
            silent += 1

    print(f"\n{'─'*70}")
    print(f"SIMULATION COMPLETE")
    print(f"  Total ticks:    {n_ticks}")
    print(f"  Signals emitted: {len(signals)}")
    print(f"  Silent ticks:   {silent} ({silent/n_ticks*100:.1f}%)")
    print(f"  Signal rate:    1 per {n_ticks/max(len(signals),1):.0f} ticks")

    return signals


if __name__ == '__main__':
    run_simulation(n_ticks=300, print_all_signals=True)
