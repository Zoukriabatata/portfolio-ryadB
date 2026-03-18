"""
FastAPI Streaming Server — Production Python Agent
────────────────────────────────────────────────────────────────────────────
Runs the Python TradingAgent as a persistent HTTP + SSE server.
The Next.js app calls this server instead of reimplementing the logic in JS.

ENDPOINTS:
  POST /tick            → process one tick, return signal or null
  POST /stream          → process a list of ticks, SSE stream of signals
  GET  /state           → return current agent state
  POST /reset           → reset agent state
  GET  /health          → health check

SETUP:
  pip install fastapi uvicorn
  python -m ml.agent.server         (runs on port 8765)

NEXT.JS INTEGRATION:
  In route.ts, replace the JS agent with:
    const res = await fetch('http://localhost:8765/tick', {
      method: 'POST', headers: {...}, body: JSON.stringify(tick)
    })

PRODUCTION:
  Deploy this separately from Next.js (e.g., a small Python container).
  Use environment variable AGENT_SERVER_URL in Next.js to point to it.
"""

from __future__ import annotations
import json
import asyncio
import time
from datetime import datetime
from typing import AsyncIterator, Optional

try:
    from fastapi import FastAPI
    from fastapi.responses import StreamingResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    print("[WARN] pip install fastapi uvicorn to run the agent server")

from .loop import TradingAgent
from .detector import MacroCalendar, MacroEvent
from .simulation import MarketSimulator
from ..engine.analysis_engine import AnalysisEngine
from ..engine.schemas import (
    EngineInput, GEXInput, SkewInput, FlowInput,
    MicrostructureInput, ContextInput, IntradayPhase,
)
from ..engine.explainer import explain_signal

# ─── App setup ────────────────────────────────────────────────────────────────

if HAS_FASTAPI:
    app = FastAPI(
        title   = 'Trading Agent Server',
        version = '1.0.0',
        docs_url= '/docs',
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins = ['http://localhost:3000'],   # Next.js dev
        allow_methods = ['*'],
        allow_headers = ['*'],
    )

    # ── Singleton analysis engine (stateless per request, safe to share) ────
    _analysis_engine = AnalysisEngine(use_ml=False)

    # ── Singleton agent (lives for the server process lifetime) ───────────────
    calendar = MacroCalendar()
    agent    = TradingAgent(
        macro_calendar    = calendar,
        min_emit_interval = 5.0,
        verbose           = False,
    )

    # ── Routes ────────────────────────────────────────────────────────────────

    @app.get('/health')
    async def health():
        return {
            'status':     'ok',
            'tick_count': agent.state.total_ticks,
            'uptime_ticks': agent.state.total_ticks,
            'current_bias': agent.state.bias,
        }

    @app.post('/tick')
    async def process_tick(tick: dict):
        """
        Process a single tick. Returns signal JSON if meaningful change,
        or { change_detected: false } if no change.
        """
        result = agent.process(tick)
        if result is None:
            return JSONResponse({'change_detected': False, 'reason': 'No significant change detected'})
        return JSONResponse(json.loads(result))

    @app.post('/stream')
    async def stream_ticks(body: dict):
        """
        Process a list of ticks as an SSE stream.
        Body: { ticks: [...] }
        """
        ticks = body.get('ticks', [])
        if not ticks:
            return JSONResponse({'error': 'No ticks provided'}, status_code=400)

        async def event_generator() -> AsyncIterator[str]:
            emit_count = 0
            for tick in ticks:
                result = agent.process(tick)
                if result is not None:
                    emit_count += 1
                    yield f"data: {result}\n\n"
                    await asyncio.sleep(0)   # yield to event loop
            yield f"data: {json.dumps({'type': 'DONE', 'total_emits': emit_count})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type = 'text/event-stream',
            headers    = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
        )

    @app.get('/stream/live')
    async def stream_live(delay_ms: int = 200):
        """
        Infinite live simulation stream — SSE, runs until client disconnects.
        The Next.js app proxies this via /api/ai/agent/stream.

        Query params:
          delay_ms  — ms between ticks (default 200 = 5 ticks/s)

        Signal mode:
          "SIGNAL"  — at least one HIGH-severity event (e.g. gamma flip cross)
          "UPDATE"  — only MEDIUM events (e.g. bias change, flow flip)
        """
        sim = MarketSimulator()
        emit_count  = 0
        last_hb     = time.time()
        HB_INTERVAL = 15.0   # heartbeat every 15 seconds

        async def simulate() -> AsyncIterator[str]:
            nonlocal emit_count, last_hb

            # Initial handshake — lets the frontend know we're Python
            yield f"data: {json.dumps({'type': 'connected', 'source': 'python_agent', 'delay_ms': delay_ms})}\n\n"

            while True:
                tick   = sim.next_tick()
                result = agent.process(tick)

                if result is not None:
                    emit_count += 1
                    data = json.loads(result)

                    # Classify mode: HIGH events → SIGNAL, MEDIUM-only → UPDATE
                    events   = data.get('events', [])
                    has_high = any(e.get('severity') == 'HIGH' for e in events)
                    data['mode']   = 'SIGNAL' if has_high else 'UPDATE'
                    data['source'] = 'python_agent'

                    yield f"data: {json.dumps(data)}\n\n"

                # Heartbeat to keep the connection alive through proxies
                now = time.time()
                if now - last_hb >= HB_INTERVAL:
                    last_hb = now
                    yield f"data: {json.dumps({'type': 'heartbeat', 'ts': datetime.now().isoformat(), 'total_emits': emit_count})}\n\n"

                await asyncio.sleep(delay_ms / 1000)

        return StreamingResponse(
            simulate(),
            media_type = 'text/event-stream',
            headers    = {
                'Cache-Control':     'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection':        'keep-alive',
            },
        )

    @app.get('/state')
    async def get_state():
        """Return current agent state summary."""
        s = agent.state
        return {
            'bias':           s.bias,
            'confidence':     round(s.confidence, 4),
            'gamma_regime':   s.gamma_regime,
            'vol_regime':     s.vol_regime,
            'flow_state':     s.flow_state,
            'context_state':  s.context_state,
            'tick_count':     s.total_ticks,
            'last_change':    s.last_change_time.isoformat() if s.last_change_time else None,
            'last_reason':    s.last_change_reason,
            'ticks_since_change': s.ticks_since_change,
            'key_levels': {
                'support':    s.support_levels,
                'resistance': s.resistance_levels,
                'gamma_flip': s.gamma_flip,
            },
        }

    @app.post('/reset')
    async def reset_state():
        """Reset agent state (e.g., new trading session)."""
        global agent
        agent = TradingAgent(
            macro_calendar    = calendar,
            min_emit_interval = 5.0,
        )
        return {'status': 'reset', 'timestamp': datetime.now().isoformat()}

    # ── MarketData form → EngineInput bridge ─────────────────────────────────

    def _bridge(body: dict) -> EngineInput:
        """
        Convert the UI MarketData form payload into a full EngineInput.
        Uses calibrated defaults for fields not present in the UI form.
        """
        price    = float(body['price'])
        gex_val  = float(body.get('gex', 0))
        flip     = float(body.get('gexFlipLevel', price * 0.99))
        skew25d  = float(body.get('skew25d', 0))
        call_pct = float(body.get('callFlowPercent', 50))
        put_pct  = float(body.get('putFlowPercent',  50))
        pcr      = float(body.get('putCallRatio', 1.0))
        iv_rank  = float(body.get('ivRank', 50))
        expiry   = body.get('expiration', 'Weekly')

        dist_to_flip = (price - flip) / price   # signed
        gex_mag      = abs(gex_val)

        # Estimate call/put walls from GEX magnitude (larger GEX → wider walls)
        spread    = 0.02 * (1 + gex_mag / 5)
        call_wall = round(price * (1 + spread), 2)
        put_wall  = round(price * (1 - spread), 2)

        # Order flow imbalance: positive = more calls = bullish
        ofi            = (call_pct - 50) / 50          # ∈ [-1, +1]
        aggressive_buy = call_pct / 100.0

        # IV: approximated from IV rank (10% base + 50% scale)
        iv_atm = 0.10 + (iv_rank / 100) * 0.50

        # Time-to-expiry in calendar days
        tte = {'0DTE': 0.1, '1DTE': 1.0, 'Weekly': 5.0, 'Monthly': 30.0}.get(expiry, 5.0)

        return EngineInput(
            gex=GEXInput(
                net_gex               = gex_val,
                gamma_flip_level      = flip,
                distance_to_flip      = round(dist_to_flip, 5),
                call_wall             = call_wall,
                put_wall              = put_wall,
                dealer_position_proxy = max(-1.0, min(1.0, gex_val / 3.0)),
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
                call_put_ratio       = 1.0 / max(pcr, 1e-3),   # inverse of PCR
                order_flow_imbalance = round(ofi, 4),
                aggressive_buy_ratio = round(aggressive_buy, 4),
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

    @app.post('/analyze')
    async def analyze_form(body: dict):
        """
        Deterministic analysis endpoint for the UI market-data form.

        Accepts: MarketData form payload (UI format — simplified)
        Returns: Full EngineOutput + optional LLM explanation

        The engine is ALWAYS deterministic. The LLM only provides the
        `llm_explanation` field (natural language context, optional).
        If Ollama is offline the field is omitted — analysis still works.
        """
        required = ['price', 'gex', 'skew25d', 'callFlowPercent', 'putFlowPercent']
        for field in required:
            if field not in body:
                return JSONResponse({'error': f'Missing required field: {field}'}, status_code=400)

        try:
            engine_input  = _bridge(body)
            engine_output = _analysis_engine.analyze(engine_input)
            result        = engine_output.to_dict()
        except (AssertionError, TypeError, KeyError, ValueError) as e:
            return JSONResponse({'error': f'Invalid input: {e}'}, status_code=422)
        except Exception as e:
            return JSONResponse({'error': f'Engine error: {e}'}, status_code=500)

        # Optional LLM explanation — never blocks the response if Ollama is down
        llm_text = None
        if body.get('explain', True):
            try:
                text     = explain_signal(result)
                llm_text = text if text and text != result.get('explanation') else None
            except Exception:
                pass

        result.update({
            'llm_explanation': llm_text,
            'source':          'python',
            'meta': {
                'symbol':    body.get('symbol', 'UNKNOWN'),
                'price':     float(body['price']),
                'timestamp': datetime.now().isoformat(),
            },
        })
        return JSONResponse(result)

    @app.post('/calendar/add')
    async def add_macro_event(body: dict):
        """
        Add a macro event to the calendar.
        Body: { name: str, scheduled_iso: str, vol_impact: float }
        """
        try:
            dt = datetime.fromisoformat(body['scheduled_iso'])
            calendar.add(body['name'], dt, float(body.get('vol_impact', 0.02)))
            return {'status': 'added', 'event': body['name'], 'scheduled': body['scheduled_iso']}
        except (KeyError, ValueError) as e:
            return JSONResponse({'error': str(e)}, status_code=400)


# ─── Entry point ─────────────────────────────────────────────────────────────

def run_server(host: str = '0.0.0.0', port: int = 8765, reload: bool = False):
    if not HAS_FASTAPI:
        print("Error: pip install fastapi uvicorn")
        return
    uvicorn.run('ml.agent.server:app', host=host, port=port, reload=reload)


if __name__ == '__main__':
    run_server()
