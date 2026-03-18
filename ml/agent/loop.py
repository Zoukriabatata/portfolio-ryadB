"""
Continuous Agent Loop
────────────────────────────────────────────────────────────────────────────
The main real-time processing loop. Runs indefinitely, processing one tick
at a time, maintaining full state, and emitting signals only when meaningful
events are detected.

LOOP CYCLE (per tick):
  1. Receive new market data dict
  2. Push raw values into rolling buffers (EMA smoothing)
  3. Compute EMA-smoothed signals
  4. Apply fake signal detection
  5. Compute composite score
  6. Run persistence filters (categorical regime update)
  7. Run change detector
  8. If meaningful event → update state → emit JSON output
  9. Else → update buffers only → no output

THROUGHPUT: designed for 1–60 second tick intervals.
At 1-second intervals: ~3600 evaluations/hour, ~100 emits/hour in busy markets.
"""

from __future__ import annotations
import asyncio
import json
import time
import numpy as np
from datetime import datetime
from typing import AsyncIterator, Optional, Callable

from .state import (
    AgentState, RollingBuffer,
    GammaRegime, VolRegime, FlowState, Bias, ContextState,
)
from .filters import (
    ema_filter, z_score_gate,
    FlowPersistenceFilter, VolatilityClusterDetector, FakeSignalDetector,
)
from .detector import ChangeDetector, MacroCalendar
from ..engine.advanced_dynamics import AdvancedDynamics, AdvancedContext


# ─── EMA alphas ───────────────────────────────────────────────────────────────

EMA_ALPHA_FAST   = 0.20    # ~5 bar half-life  — flow, OFI
EMA_ALPHA_MEDIUM = 0.10    # ~10 bar half-life — skew, GEX
EMA_ALPHA_SLOW   = 0.05    # ~20 bar half-life — vol regime


# ─── Tick schema (what the agent receives each cycle) ─────────────────────────

class TickValidator:
    """Validates and normalizes incoming tick data."""

    REQUIRED = ['spot_price', 'net_gex', 'gamma_flip_level', 'distance_to_flip',
                'risk_reversal_25d', 'order_flow_imbalance', 'aggressive_flow',
                'call_volume', 'put_volume']

    DEFAULTS = {
        'iv_atm': 0.20, 'iv_slope': -0.20, 'skew_change': 0.0,
        'liquidity': 0.70, 'spread': 0.001, 'trade_intensity': 30.0,
        'sweep_net': 0, 'price_return': 0.0,
        'macro_event': '', 'support_levels': [], 'resistance_levels': [],
        'call_wall': 0.0, 'put_wall': 0.0, 'iv_rank': 50.0,
    }

    @classmethod
    def validate(cls, tick: dict) -> dict:
        for field in cls.REQUIRED:
            if field not in tick:
                raise ValueError(f"Missing required tick field: {field}")
        result = {**cls.DEFAULTS, **tick}
        return result


# ─── Core agent ──────────────────────────────────────────────────────────────

class TradingAgent:
    """
    Stateful continuous trading analysis agent.

    Usage (synchronous):
        agent = TradingAgent()
        for tick in my_data_stream:
            output = agent.process(tick)
            if output:
                print(output)   # JSON string, only emitted on changes

    Usage (async streaming):
        async for json_output in agent.stream(my_async_generator):
            await websocket.send(json_output)
    """

    def __init__(
        self,
        macro_calendar:   Optional[MacroCalendar] = None,
        min_emit_interval: float = 5.0,   # seconds between forced-silent periods
        verbose:           bool  = False,
    ):
        self.state    = AgentState()
        self.detector = ChangeDetector(macro_calendar or MacroCalendar())
        self.verbose  = verbose
        self.advanced = AdvancedDynamics()

        # Filters
        self.flow_filter   = FlowPersistenceFilter(min_ticks=3, ofi_threshold=0.15)
        self.vol_detector  = VolatilityClusterDetector(lambda_ewma=0.94)
        self.fake_detector = FakeSignalDetector()

        # EMA state (smooth raw inputs before use)
        self._ema: dict[str, float] = {
            'net_gex': 0.0, 'ofi': 0.0, 'rr25': 0.0, 'iv': 0.20,
            'spread': 0.001, 'flip_dist': 0.0,
        }

        # Rate limiting: don't emit more than once per min_emit_interval
        self._last_emit_time: float = 0.0
        self._min_emit_interval     = min_emit_interval

        # Advanced dynamics result (updated every tick, read on emit)
        self._last_advanced = None

    # ── Main process tick ─────────────────────────────────────────────────────

    def process(self, raw_tick: dict) -> Optional[str]:
        """
        Process one tick. Returns JSON string if meaningful signal, else None.
        """
        try:
            tick = TickValidator.validate(raw_tick)
        except ValueError as e:
            return json.dumps({'error': str(e)})

        self.state.total_ticks += 1
        self.state.ticks_since_change += 1

        # ── Step 1: EMA-smooth raw inputs ────────────────────────────────────
        spot = float(tick['spot_price'])
        self._ema['net_gex']    = ema_filter(tick['net_gex'],    self._ema['net_gex'],    EMA_ALPHA_MEDIUM)
        self._ema['ofi']        = ema_filter(tick['order_flow_imbalance'], self._ema['ofi'], EMA_ALPHA_FAST)
        self._ema['rr25']       = ema_filter(tick['risk_reversal_25d'],    self._ema['rr25'],EMA_ALPHA_MEDIUM)
        self._ema['iv']         = ema_filter(tick.get('iv_atm', 0.20),     self._ema['iv'],  EMA_ALPHA_SLOW)
        self._ema['spread']     = ema_filter(tick.get('spread', 0.001),    self._ema['spread'], EMA_ALPHA_FAST)
        self._ema['flip_dist']  = ema_filter(tick['distance_to_flip'],    self._ema['flip_dist'], EMA_ALPHA_MEDIUM)

        # ── Step 2: Push into rolling buffers ────────────────────────────────
        self.state.gex_history.push(self._ema['net_gex'])
        self.state.ofi_history.push(self._ema['ofi'])
        self.state.rr25_history.push(self._ema['rr25'])
        self.state.iv_history.push(self._ema['iv'])
        self.state.spread_history.push(self._ema['spread'])
        self.state.flip_dist_history.push(spot - tick['gamma_flip_level'])

        # ── Step 3: Vol clustering ────────────────────────────────────────────
        ret = float(tick.get('price_return', 0.0))
        vol_info = self.vol_detector.update(ret)

        # ── Step 4: Fake signal check ─────────────────────────────────────────
        fake_result = self.fake_detector.update(
            ofi         = self._ema['ofi'],
            price_ret   = ret,
            sweep_net   = tick.get('sweep_net', 0),
            net_gex     = self._ema['net_gex'],
            flow_signal = self._ema['ofi'],
        )

        # ── Step 5: Compute new regime labels (raw, before persistence) ───────
        raw_gamma  = self._compute_gamma_regime(tick)
        raw_flow   = self.flow_filter.update(self._ema['ofi'])
        raw_vol    = vol_info['vol_regime']
        raw_score  = self._compute_composite_score(tick)

        # Apply fake signal penalty to score
        raw_score *= fake_result['multiplier']
        self.state.score_history.push(raw_score)

        # ── Step 5b: Advanced dynamics ────────────────────────────────────────
        adv_ctx    = AdvancedContext.from_tick(
            tick            = tick,
            ema             = self._ema,
            gamma_regime    = raw_gamma,
            vol_regime      = raw_vol,
            flow_state      = raw_flow,
            composite_score = raw_score,
        )
        self._last_advanced = self.advanced.analyze(adv_ctx, bias=self.state.bias)

        # ── Step 6: Persistence filters (avoid flipping on single ticks) ───────
        gamma_changed = self.state.gamma_persistence.update(raw_gamma)
        new_gamma     = self.state.gamma_persistence.current or raw_gamma

        flow_changed  = False
        if raw_flow != self.state.flow_state:
            flow_changed = True
        new_flow = raw_flow    # flow filter already has built-in persistence

        # ── Step 7: Bias from score + confidence ─────────────────────────────
        new_bias, new_confidence = self._compute_bias(raw_score, fake_result, tick)

        # Macro context
        new_context = self.detector.calendar.get_context_state(warn_minutes=30)
        if abs(self._ema['flip_dist']) < 0.005:
            new_context = ContextState.BREAKOUT_ZONE

        # Update key levels from tick
        if tick.get('support_levels'):
            self.state.support_levels    = tick['support_levels']
        if tick.get('resistance_levels'):
            self.state.resistance_levels = tick['resistance_levels']
        if tick.get('gamma_flip_level'):
            self.state.gamma_flip        = tick['gamma_flip_level']

        # ── Step 8: Detect meaningful events ──────────────────────────────────
        self.state.snapshot_previous()

        events = self.detector.detect(
            state             = self.state,
            tick              = tick,
            new_bias          = new_bias,
            new_gamma_regime  = new_gamma,
            new_flow_state    = new_flow,
            new_vol_regime    = raw_vol,
            new_confidence    = new_confidence,
            new_score         = raw_score,
            spot              = spot,
        )

        # ── Step 9: Update state ───────────────────────────────────────────────
        self.state.gamma_regime   = new_gamma
        self.state.flow_state     = new_flow
        self.state.vol_regime     = raw_vol
        self.state.bias           = new_bias
        self.state.confidence     = new_confidence
        self.state.context_state  = new_context
        self.state.macro_event_pending = self.detector.calendar.get_imminent(15) is not None
        self.state.key_level_proximity = self._key_level_distance(spot)

        # ── Step 10: Emit if meaningful change ────────────────────────────────
        should_emit = (
            self.detector.should_emit(events)
            and (time.time() - self._last_emit_time) >= self._min_emit_interval
        )

        if should_emit:
            self.state.last_change_time   = datetime.now()
            self.state.last_change_reason = self.detector.build_reason(events)
            self.state.ticks_since_change = 0
            self._last_emit_time          = time.time()

            output = self._build_output(tick, spot, events)

            if self.verbose:
                print(f"\n{'─'*60}")
                print(self.state.to_summary())
                print(f"EVENTS: {[e.event_type for e in events]}")

            return json.dumps(output, indent=2, default=str)

        if self.verbose and self.state.total_ticks % 10 == 0:
            print(f"  {self.state.to_summary()} [silent]")

        return None

    # ── Signal computation ────────────────────────────────────────────────────

    def _compute_gamma_regime(self, tick: dict) -> str:
        gex        = self._ema['net_gex']
        flip_dist  = tick['distance_to_flip']

        if abs(flip_dist) < 0.005:
            return GammaRegime.NEAR_FLIP
        if gex > 0:
            return GammaRegime.LONG_GAMMA
        return GammaRegime.SHORT_GAMMA

    def _compute_composite_score(self, tick: dict) -> float:
        """
        Weighted composite of GEX × flow × skew signals.
        Returns float ∈ [-1, +1].
        """
        gex   = self._ema['net_gex']
        ofi   = self._ema['ofi']
        rr25  = self._ema['rr25']
        agg   = tick.get('aggressive_flow', 0.5)

        # GEX × flow interaction (primary signal per microstructure theory)
        gamma_sign = np.sign(gex)
        flow_press = 0.7 * ofi + 0.3 * (agg - 0.5) * 2

        if gamma_sign < 0:
            gex_flow_score = float(flow_press * 1.4)   # short gamma amplifies
        else:
            gex_flow_score = float(flow_press * 0.7)   # long gamma dampens

        # Skew signal
        skew_score = float(np.clip(rr25 / 8.0 + tick.get('skew_change', 0) / 3.0, -0.6, 0.6))

        # Sweep momentum
        sweep  = tick.get('sweep_net', 0)
        sweep_score = float(np.clip(sweep / 5.0, -0.5, 0.5))

        # Weighted combination
        composite = (
            0.50 * gex_flow_score +
            0.25 * skew_score +
            0.15 * sweep_score +
            0.10 * float(np.sign(gex) * 0.3)   # directional GEX baseline
        )

        return float(np.clip(composite, -1, 1))

    def _compute_bias(
        self,
        score:       float,
        fake_result: dict,
        tick:        dict,
    ) -> tuple[str, float]:
        """Compute bias label and confidence from composite score."""
        # Z-score gate on GEX history — only signal if statistically meaningful
        _, gex_z = z_score_gate(self._ema['net_gex'], self.state.gex_history, threshold=1.2)

        # Base confidence from score strength
        base_conf = min(abs(score) * 1.6, 0.90)

        # Confluence bonus: GEX + flow + skew all agree
        gex_dir   = np.sign(self._ema['net_gex'])
        flow_dir  = np.sign(self._ema['ofi'])
        skew_dir  = 1.0 if self._ema['rr25'] > 1 else (-1.0 if self._ema['rr25'] < -1 else 0.0)

        agree_count = sum([
            gex_dir == flow_dir and flow_dir != 0,
            flow_dir == skew_dir and skew_dir != 0,
        ])
        confluence_bonus = agree_count * 0.08

        # Apply fake signal multiplier
        final_conf = float(np.clip(
            (base_conf + confluence_bonus) * fake_result['multiplier'],
            0.25, 0.95,
        ))

        # Near flip → reduce confidence
        if abs(tick['distance_to_flip']) < 0.005:
            final_conf *= 0.6

        # Macro event → reduce confidence
        if self.state.macro_event_pending:
            final_conf *= 0.7

        # Determine bias
        if score >  0.15 and final_conf >= 0.40:
            bias = Bias.LONG
        elif score < -0.15 and final_conf >= 0.40:
            bias = Bias.SHORT
        else:
            bias = Bias.NEUTRAL

        return bias, final_conf

    def _key_level_distance(self, spot: float) -> float:
        """Minimum distance to any key level as fraction of spot."""
        all_levels = self.state.support_levels + self.state.resistance_levels
        if self.state.gamma_flip > 0:
            all_levels.append(self.state.gamma_flip)
        if not all_levels:
            return 1.0
        return float(min(abs(spot - lvl) / spot for lvl in all_levels if lvl > 0))

    def _compute_delta(self, tick: dict, spot: float) -> dict:
        """
        Compute human-readable deltas vs previous emitted values.
        Returned as the 'delta' field in every signal output.
        """
        prev_spot = self.state.prev_spot or spot
        ofi_now   = float(tick.get('order_flow_imbalance', 0))
        rr25_now  = float(tick.get('risk_reversal_25d', 0))
        ofi_delta = ofi_now  - self.state.prev_ofi
        rr25_delta = rr25_now - self.state.prev_rr25

        # Flow direction summary
        if abs(ofi_delta) < 0.05:
            flow_change = 'stable'
        elif ofi_delta > 0:
            flow_change = f'{ofi_delta:+.2f} — buying pressure building'
        else:
            flow_change = f'{ofi_delta:+.2f} — selling pressure building'

        # Skew movement summary
        if abs(rr25_delta) < 0.3:
            skew_change = 'stable'
        elif rr25_delta > 0:
            skew_change = f'{rr25_delta:+.1f}% — risk-on skew'
        else:
            skew_change = f'{rr25_delta:+.1f}% — risk-off skew'

        # Price position relative to gamma flip
        gf = self.state.gamma_flip
        if gf > 0:
            dist_pct = (spot - gf) / spot * 100
            side = 'above' if dist_pct >= 0 else 'below'
            price_vs_flip = f'{dist_pct:+.2f}% {side} flip ${gf:.0f}'
        else:
            price_vs_flip = 'flip level unknown'

        conf_delta = self.state.confidence - self.state.prev_confidence

        return {
            'flow_change':      flow_change,
            'skew_change':      skew_change,
            'price_vs_flip':    price_vs_flip,
            'confidence_delta': round(conf_delta, 3),
            'ofi_raw':          round(ofi_now,  3),
            'rr25_raw':         round(rr25_now, 2),
        }

    def _build_output(self, tick: dict, spot: float, events) -> dict:
        """
        Assemble the final output dict.
        Adds: mode, delta, live_feed vs the old version.
        Also pushes events into state.live_feed for future signals.
        """
        # Classify: any HIGH event = SIGNAL, MEDIUM-only = UPDATE
        has_high = any(e.severity == 'HIGH' for e in events)
        mode     = 'SIGNAL' if has_high else 'UPDATE'

        # Compute numeric deltas before updating prev_* values
        delta = self._compute_delta(tick, spot)

        # Push each event into the rolling live feed log
        for e in events:
            self.state.push_feed(
                event_type = e.event_type,
                message    = e.description,
                severity   = e.severity,
                mode       = mode,
            )

        # Update previous raw values for next delta cycle
        self.state.prev_spot = spot
        self.state.prev_rr25 = float(tick.get('risk_reversal_25d', 0))
        self.state.prev_ofi  = float(tick.get('order_flow_imbalance', 0))

        # Advanced dynamics fields (always present, defaults if not yet computed)
        adv = self._last_advanced
        adv_fields: dict = {}
        if adv is not None:
            adv_fields = {
                'gamma_squeeze':         adv.gamma_squeeze,
                'squeeze_strength':      adv.squeeze_strength,
                'dealer_state':          adv.dealer_state,
                'confluence_score':      adv.confluence_score,
                'confluence_components': adv.confluence_components,
                'regime':                adv.regime,
                'setup':                 adv.setup,
                'adaptive_threshold':    round(adv.adaptive_threshold, 3),
                'dynamic_weights':       adv.dynamic_weights,
                'signal_confidence':     round(adv.confidence, 3),
                'persistence_score':     round(adv.persistence_score, 3),
                'signal_quality':        round(adv.signal_quality, 3),
            }

        return {
            'timestamp':         datetime.now().isoformat(),
            'mode':              mode,
            'bias':              self.state.bias,
            'confidence':        round(self.state.confidence, 4),
            'gamma_regime':      self.state.gamma_regime,
            'volatility_regime': self.state.vol_regime,
            'flow_state':        self.state.flow_state,
            'context_state':     self.state.context_state,
            'key_levels': {
                'support':    self.state.support_levels,
                'resistance': self.state.resistance_levels,
                'gamma_flip': self.state.gamma_flip,
            },
            'change_detected': True,
            'delta':           delta,
            'reason':          self.state.last_change_reason,
            'events':          [{'type': e.event_type, 'severity': e.severity, 'description': e.description} for e in events],
            'live_feed':       list(self.state.live_feed),   # last 50, newest first
            'tick_count':      self.state.total_ticks,
            'ticks_since_change': 0,
            **adv_fields,
        }

    # ── Async streaming interface ─────────────────────────────────────────────

    async def stream(
        self,
        data_source: AsyncIterator[dict],
        on_signal:   Optional[Callable[[str], None]] = None,
    ) -> AsyncIterator[str]:
        """
        Async generator for continuous streaming.
        Yields JSON strings only when meaningful signals are detected.

        Usage:
            async for signal in agent.stream(my_async_data_source):
                await websocket.send(signal)
        """
        async for tick in data_source:
            output = self.process(tick)
            if output is not None:
                if on_signal:
                    on_signal(output)
                yield output
            await asyncio.sleep(0)   # yield event loop control

    # ── Synchronous loop (for simulation / backtesting) ───────────────────────

    def run_batch(
        self,
        ticks:     list[dict],
        on_signal: Optional[Callable[[str], None]] = None,
    ) -> list[str]:
        """
        Process a list of historical ticks synchronously.
        Returns list of emitted signals (much shorter than tick list).
        """
        signals = []
        for tick in ticks:
            output = self.process(tick)
            if output is not None:
                signals.append(output)
                if on_signal:
                    on_signal(output)
        return signals
