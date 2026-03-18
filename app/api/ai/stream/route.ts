/**
 * POST /api/ai/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-Sent Events (SSE) endpoint for the continuous trading agent.
 *
 * MODES:
 *   1. Single-tick analysis (body: { tick: {...} })
 *      → Runs one tick through the JS-side analysis engine
 *      → Returns one signal JSON immediately
 *
 *   2. Streaming session (body: { stream: true, ticks: [...] })
 *      → Processes a batch of ticks
 *      → Emits SSE events only when meaningful changes are detected
 *      → Client stays connected, receives updates as they occur
 *
 * SSE FORMAT:
 *   data: {"bias": "LONG", "confidence": 0.72, ...}\n\n
 *   data: [DONE]\n\n
 *
 * This endpoint bridges the Python agent logic into the Next.js stack.
 * For production, replace the JS reimplementation below with a call
 * to the Python agent server (run separately via FastAPI).
 *
 * GET /api/ai/stream → health check
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tick {
  spot_price:           number;
  net_gex:              number;
  gamma_flip_level:     number;
  distance_to_flip:     number;
  risk_reversal_25d:    number;
  order_flow_imbalance: number;
  aggressive_flow:      number;
  call_volume:          number;
  put_volume:           number;
  iv_atm?:              number;
  iv_rank?:             number;
  sweep_net?:           number;
  liquidity?:           number;
  spread?:              number;
  trade_intensity?:     number;
  support_levels?:      number[];
  resistance_levels?:   number[];
  price_return?:        number;
  skew_change?:         number;
}

interface AgentSignal {
  timestamp:          string;
  bias:               'LONG' | 'SHORT' | 'NEUTRAL';
  confidence:         number;
  gamma_regime:       'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEAR_FLIP';
  volatility_regime:  'EXPANSION' | 'COMPRESSION';
  flow_state:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  context_state:      'CALM' | 'EVENT_RISK' | 'BREAKOUT_ZONE';
  key_levels: {
    support:    number[];
    resistance: number[];
    gamma_flip: number;
  };
  change_detected: boolean;
  reason:          string;
  events?:         { type: string; severity: string }[];
}

// ─── Lightweight JS agent state (for single-server-tick mode) ─────────────────

class LightweightAgentState {
  private emaGex  = 0;
  private emaOfi  = 0;
  private emaRr25 = 0;
  private emaIv   = 0.20;

  private prevBias:  string = 'NEUTRAL';
  private prevGamma: string = 'LONG_GAMMA';
  private prevFlow:  string = 'NEUTRAL';
  private prevVol:   string = 'COMPRESSION';

  private ofiConsecutive   = 0;
  private ofiDirection     = 0;

  private scoreHistory: number[] = [];
  private tickCount = 0;

  process(tick: Tick): AgentSignal | null {
    this.tickCount++;
    const ALPHA_FAST   = 0.20;
    const ALPHA_MEDIUM = 0.10;
    const ALPHA_SLOW   = 0.05;

    // EMA smooth
    this.emaGex  = ALPHA_MEDIUM * tick.net_gex              + (1 - ALPHA_MEDIUM) * this.emaGex;
    this.emaOfi  = ALPHA_FAST   * tick.order_flow_imbalance + (1 - ALPHA_FAST)   * this.emaOfi;
    this.emaRr25 = ALPHA_MEDIUM * tick.risk_reversal_25d    + (1 - ALPHA_MEDIUM) * this.emaRr25;
    this.emaIv   = ALPHA_SLOW   * (tick.iv_atm ?? 0.20)     + (1 - ALPHA_SLOW)   * this.emaIv;

    // Gamma regime
    const distFlip   = tick.distance_to_flip;
    const gammaRegime: AgentSignal['gamma_regime'] =
      Math.abs(distFlip) < 0.005 ? 'NEAR_FLIP' :
      this.emaGex > 0            ? 'LONG_GAMMA' : 'SHORT_GAMMA';

    // Flow (persistence: needs 3 consecutive bars)
    const rawFlowDir = this.emaOfi > 0.15 ? 1 : (this.emaOfi < -0.15 ? -1 : 0);
    if (rawFlowDir === this.ofiDirection && rawFlowDir !== 0) {
      this.ofiConsecutive++;
    } else {
      this.ofiConsecutive = rawFlowDir !== 0 ? 1 : 0;
      this.ofiDirection   = rawFlowDir;
    }
    const flowState: AgentSignal['flow_state'] =
      this.ofiConsecutive >= 3 ? (this.ofiDirection > 0 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL';

    // Composite score
    const gammaSign  = Math.sign(this.emaGex);
    const flowPress  = 0.7 * this.emaOfi + 0.3 * ((tick.aggressive_flow ?? 0.5) - 0.5) * 2;
    const gexFlow    = gammaSign < 0 ? flowPress * 1.4 : flowPress * 0.7;
    const skewScore  = Math.max(-0.6, Math.min(0.6, this.emaRr25 / 8));
    const sweepScore = Math.max(-0.5, Math.min(0.5, (tick.sweep_net ?? 0) / 5));
    const score      = Math.max(-1, Math.min(1,
      0.50 * gexFlow + 0.25 * skewScore + 0.15 * sweepScore + 0.10 * gammaSign * 0.3
    ));

    this.scoreHistory.push(score);
    if (this.scoreHistory.length > 30) this.scoreHistory.shift();

    // Confidence
    const baseConf  = Math.min(Math.abs(score) * 1.6, 0.90);
    const nearFlip  = Math.abs(distFlip) < 0.005 ? 0.6 : 1.0;
    const confidence = Math.max(0.25, Math.min(0.95, baseConf * nearFlip));

    // Bias
    const bias: AgentSignal['bias'] =
      score >  0.15 && confidence >= 0.40 ? 'LONG'  :
      score < -0.15 && confidence >= 0.40 ? 'SHORT' : 'NEUTRAL';

    // Vol regime (simple IV rank proxy)
    const ivRank = tick.iv_rank ?? 50;
    const volRegime: AgentSignal['volatility_regime'] = ivRank > 65 ? 'EXPANSION' : 'COMPRESSION';

    // Context
    const contextState: AgentSignal['context_state'] =
      Math.abs(distFlip) < 0.005 ? 'BREAKOUT_ZONE' : 'CALM';

    // Detect changes
    const events: { type: string; severity: string }[] = [];

    if (gammaRegime !== this.prevGamma)
      events.push({ type: 'GAMMA_REGIME_CHANGE', severity: 'HIGH' });
    if (bias !== this.prevBias)
      events.push({ type: 'BIAS_CHANGE', severity: bias !== 'NEUTRAL' && this.prevBias !== 'NEUTRAL' ? 'HIGH' : 'MEDIUM' });
    if (flowState !== this.prevFlow && flowState !== 'NEUTRAL')
      events.push({ type: 'FLOW_FLIP', severity: 'MEDIUM' });
    if (volRegime !== this.prevVol)
      events.push({ type: 'VOL_REGIME_CHANGE', severity: 'MEDIUM' });

    // Key level check
    const spot = tick.spot_price;
    const flip  = tick.gamma_flip_level;
    if (flip > 0 && Math.abs(spot - flip) / spot < 0.003)
      events.push({ type: 'NEAR_GAMMA_FLIP', severity: 'HIGH' });

    this.prevBias  = bias;
    this.prevGamma = gammaRegime;
    this.prevFlow  = flowState;
    this.prevVol   = volRegime;

    // Only emit on meaningful events (HIGH or MEDIUM)
    const shouldEmit = events.some(e => e.severity === 'HIGH' || e.severity === 'MEDIUM');
    if (!shouldEmit && this.tickCount > 1) return null;

    const reason = events.length > 0
      ? events.map(e => `${e.type}(${e.severity})`).join(' | ')
      : 'Initial signal';

    return {
      timestamp:         new Date().toISOString(),
      bias,
      confidence:        Math.round(confidence * 10000) / 10000,
      gamma_regime:      gammaRegime,
      volatility_regime: volRegime,
      flow_state:        flowState,
      context_state:     contextState,
      key_levels: {
        support:    tick.support_levels    ?? [],
        resistance: tick.resistance_levels ?? [],
        gamma_flip: tick.gamma_flip_level,
      },
      change_detected: events.length > 0,
      reason,
      events,
    };
  }
}

// ─── Agent singleton (persists across requests in the same server process) ────

// NOTE: In serverless (Vercel), state is per-invocation. For true persistence,
// run the Python agent server and call it via HTTP.
const agentState = new LightweightAgentState();

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { tick?: Tick; ticks?: Tick[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Single tick mode ─────────────────────────────────────────────────────
  if (body.tick) {
    const signal = agentState.process(body.tick);
    return Response.json(signal ?? { change_detected: false, reason: 'No significant change' });
  }

  // ── Streaming batch mode ─────────────────────────────────────────────────
  if (body.ticks && Array.isArray(body.ticks)) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let emitCount = 0;

        for (const tick of body.ticks!) {
          const signal = agentState.process(tick);
          if (signal !== null) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(signal)}\n\n`)
            );
            emitCount++;
            // Small delay to avoid overwhelming the client
            await new Promise(r => setTimeout(r, 10));
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'DONE', total_emits: emitCount })}\n\n`)
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  }

  return Response.json({ error: 'Provide tick or ticks in body' }, { status: 400 });
}

// ─── GET handler — health check ───────────────────────────────────────────────

export async function GET() {
  return Response.json({
    status:  'ok',
    agent:   'continuous-trading-agent',
    mode:    'stateful-sse',
    endpoint: '/api/ai/stream',
    usage: {
      single_tick: 'POST with { tick: {...} }',
      batch_stream: 'POST with { ticks: [...] } → SSE',
    },
  });
}
