"""
Signal Filters — Noise Reduction
────────────────────────────────────────────────────────────────────────────
Raw market data is extremely noisy. The agent must distinguish between:

  1. REAL SIGNAL: regime change backed by multiple confluent inputs
  2. NOISE:       single-input spike that doesn't persist

Filters applied:
  - EMA smoothing: removes tick-level noise from continuous signals
  - Persistence filter: categorical regime must hold N ticks to be confirmed
  - Z-score gate: only act when a signal is statistically significant
  - Flow persistence: OFI must be directional for >= K consecutive ticks
  - Volatility clustering: detect sustained high-vol episodes (GARCH proxy)
  - Fake signal detection: divergence between volume and price action

Theory:
  - Bachelier (1900): prices are noisy Brownian motion — short-term moves
    contain minimal information → filter them
  - Bacry et al. (Hawkes): real flow bursts are self-exciting and persistent;
    isolated spikes are noise
  - Muravyev (2016): OFI predicts returns ONLY over multi-bar windows,
    not tick-by-tick
"""

from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from .state import RollingBuffer


# ─── EMA filter ───────────────────────────────────────────────────────────────

def ema_filter(
    new_value:  float,
    prev_ema:   float,
    alpha:      float = 0.15,    # lower = smoother but slower
) -> float:
    """
    Exponential moving average for continuous signals.
    Higher alpha → faster response (more noise).
    Lower alpha → slower response (more stable).

    Typical values:
      alpha=0.20 → ~5 bar half-life (responsive)
      alpha=0.10 → ~10 bar half-life (balanced)
      alpha=0.05 → ~20 bar half-life (slow, macro regime)
    """
    return alpha * new_value + (1 - alpha) * prev_ema


# ─── Z-score gate ─────────────────────────────────────────────────────────────

def z_score_gate(
    signal:    float,
    history:   RollingBuffer,
    threshold: float = 1.5,
) -> tuple[bool, float]:
    """
    Return (passes_gate, z_score).
    Signal passes only if |z_score| >= threshold.
    Prevents trading on within-normal-range fluctuations.
    """
    z = history.z_score()
    return abs(z) >= threshold, z


# ─── Flow persistence filter ──────────────────────────────────────────────────

@dataclass
class FlowPersistenceFilter:
    """
    OFI must be directional for `min_ticks` consecutive bars.
    Direction reversal resets the counter.

    Inspired by Muravyev: short-horizon OFI is predictive only when
    it persists, not when it spikes and reverses.
    """
    min_ticks:      int   = 3
    ofi_threshold:  float = 0.15   # minimum |OFI| to count as directional

    _consecutive_bull: int = 0
    _consecutive_bear: int = 0

    def update(self, ofi: float) -> str:
        """
        Returns 'BULLISH' | 'BEARISH' | 'NEUTRAL'.
        Only changes state after min_ticks consecutive bars.
        """
        if ofi >= self.ofi_threshold:
            self._consecutive_bull += 1
            self._consecutive_bear = 0
        elif ofi <= -self.ofi_threshold:
            self._consecutive_bear += 1
            self._consecutive_bull = 0
        else:
            self._consecutive_bull = max(0, self._consecutive_bull - 1)
            self._consecutive_bear = max(0, self._consecutive_bear - 1)

        if self._consecutive_bull >= self.min_ticks:
            return 'BULLISH'
        if self._consecutive_bear >= self.min_ticks:
            return 'BEARISH'
        return 'NEUTRAL'

    def reset(self) -> None:
        self._consecutive_bull = 0
        self._consecutive_bear = 0


# ─── Volatility clustering detector ──────────────────────────────────────────

class VolatilityClusterDetector:
    """
    Detects sustained volatility elevation (GARCH-inspired proxy).
    Uses EWMA of squared returns — same approach as RiskMetrics VaR model.

    Returns:
      is_clustering : bool — True if volatility is in a clustered episode
      vol_regime    : 'EXPANSION' | 'COMPRESSION'
      intensity     : 0.0–1.0
    """

    def __init__(self, lambda_ewma: float = 0.94, threshold_ratio: float = 1.4):
        """
        lambda_ewma     : EWMA decay (0.94 = daily RiskMetrics standard)
        threshold_ratio : vol/long_run_vol ratio above which = EXPANSION
        """
        self.lam       = lambda_ewma
        self.threshold = threshold_ratio
        self._ewma_var = None        # current EWMA variance
        self._lt_var   = None        # slow long-run variance (lambda=0.97)

    def update(self, ret: float) -> dict:
        """Update with a new return observation."""
        r2 = ret ** 2

        if self._ewma_var is None:
            self._ewma_var = r2
            self._lt_var   = r2
            return {'is_clustering': False, 'vol_regime': 'COMPRESSION', 'intensity': 0.0}

        # Short-term EWMA (lambda=0.94)
        self._ewma_var = self.lam * self._ewma_var + (1 - self.lam) * r2
        # Long-run EWMA (lambda=0.97)
        self._lt_var   = 0.97 * self._lt_var + 0.03 * r2

        ratio     = float(self._ewma_var / (self._lt_var + 1e-12))
        is_clust  = ratio >= self.threshold
        intensity = float(np.clip((ratio - 1.0) / (self.threshold * 2), 0, 1))

        return {
            'is_clustering': is_clust,
            'vol_regime':    'EXPANSION' if is_clust else 'COMPRESSION',
            'intensity':     intensity,
            'ewma_vol':      float(np.sqrt(self._ewma_var * 252)),
            'lt_vol':        float(np.sqrt(self._lt_var * 252)),
        }


# ─── Fake signal detector ─────────────────────────────────────────────────────

class FakeSignalDetector:
    """
    Detects divergences that suggest a signal is false:

    1. Volume-Price Divergence: large OFI with small price move
       → order being absorbed → likely fake breakout

    2. Sweep-Price Divergence: many sweeps but price not following
       → large player testing liquidity, not actually directional

    3. GEX-Flow Conflict: GEX says mean-reversion, flow says trend
       → signals cancel each other → low conviction

    Returns confidence multiplier ∈ [0.3, 1.0]
    """

    def __init__(self, ofi_buf_len: int = 10):
        self._ofi_buf    = RollingBuffer(ofi_buf_len)
        self._ret_buf    = RollingBuffer(ofi_buf_len)
        self._sweep_buf  = RollingBuffer(ofi_buf_len)

    def update(
        self,
        ofi:         float,
        price_ret:   float,
        sweep_net:   int,
        net_gex:     float,
        flow_signal: float,   # positive = bullish, negative = bearish
    ) -> dict:
        self._ofi_buf.push(ofi)
        self._ret_buf.push(price_ret)
        self._sweep_buf.push(float(sweep_net))

        penalties = []

        # 1. OFI-price divergence: OFI strongly directional but price unmoved
        ofi_ema  = self._ofi_buf.ema(alpha=0.3)
        ret_ema  = self._ret_buf.ema(alpha=0.3)
        if abs(ofi_ema) > 0.3 and abs(ret_ema) < 0.0005:
            penalties.append(('ofi_price_divergence', 0.30,
                              f"Strong OFI ({ofi_ema:.2f}) but price unmoved → absorption likely"))

        # 2. Sweep-price divergence: sweeps not moving price
        sweep_ema = self._sweep_buf.ema(alpha=0.3)
        if abs(sweep_ema) > 2 and abs(ret_ema) < 0.0003:
            penalties.append(('sweep_price_divergence', 0.20,
                              f"Sweeps (net={sweep_ema:.1f}) not moving price → fake breakout risk"))

        # 3. GEX-flow conflict
        gex_direction  = np.sign(net_gex)
        flow_direction = np.sign(flow_signal)
        if gex_direction != 0 and flow_direction != 0 and gex_direction != flow_direction:
            penalties.append(('gex_flow_conflict', 0.15,
                              f"GEX direction ({gex_direction:+.0f}) conflicts with flow ({flow_direction:+.0f})"))

        total_penalty = sum(p[1] for p in penalties)
        multiplier    = float(max(0.3, 1.0 - total_penalty))

        return {
            'multiplier': multiplier,
            'is_fake':    multiplier < 0.6,
            'penalties':  [(p[0], p[2]) for p in penalties],
        }
