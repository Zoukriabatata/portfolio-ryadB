/**
 * POST /api/ai/analysis
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid deterministic analysis endpoint.
 *
 * STRATEGY (in priority order):
 *
 *   1. Python engine  (localhost:8765/analyze)
 *      → Full deterministic signals: GEX, skew, flow, dealer state,
 *        confluence, regime classification, trade setup
 *      → Optional: Ollama explanation (natural language, secondary layer)
 *      → Fast: ~50-200ms (no LLM in the hot path)
 *
 *   2. JS engine  (built-in, no external dependencies)
 *      → Same output shape, simplified rule set
 *      → Always available, always deterministic
 *      → No LLM at all — engine explanation only
 *
 * The LLM is NEVER used to generate trading decisions or JSON structure.
 * It only produces the optional `llm_explanation` text field.
 *
 * GET /api/ai/analysis  →  health check (reports engine availability)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PYTHON_URL      = process.env.AGENT_SERVER_URL ?? 'http://localhost:8765';
const CONNECT_TIMEOUT = 3000;   // ms before falling back to JS engine

// ─── Output type ──────────────────────────────────────────────────────────────

export interface EngineAnalysisResult {
  // Core signals (deterministic engine)
  bias:              'LONG' | 'SHORT' | 'NEUTRAL';
  confidence:        number;   // 0–1
  gamma_regime:      string;   // LONG_GAMMA | SHORT_GAMMA | NEAR_FLIP
  volatility_regime: string;   // EXPANSION | COMPRESSION
  flow_direction:    string;   // BULLISH | BEARISH | NEUTRAL
  key_levels:        { support: number[]; resistance: number[]; gamma_flip: number };
  explanation:       string;   // concise, deterministic (engine-built)
  // Advanced dynamics
  gamma_squeeze:     boolean;
  squeeze_strength:  number;   // 0–1
  dealer_state:      string;
  confluence_score:  number;   // –8 to +8
  regime:            string;
  setup:             { entry: string; target: string; invalidation: string };
  // LLM layer (optional — absent when Ollama offline)
  llm_explanation:   string | null;
  // Provenance
  source:            'python' | 'js_fallback';
  meta:              { symbol: string; price: number; timestamp: string };
}

// ─── JS deterministic fallback engine ─────────────────────────────────────────

function runJsEngine(body: Record<string, unknown>): EngineAnalysisResult {
  const price   = Number(body.price    ?? 100);
  const gex     = Number(body.gex      ?? 0);
  const flip    = Number(body.gexFlipLevel ?? price * 0.99);
  const skew    = Number(body.skew25d  ?? 0);
  const callPct = Number(body.callFlowPercent ?? 50);
  const putPct  = Number(body.putFlowPercent  ?? 50);
  const pcr     = Number(body.putCallRatio    ?? 1.0);
  const ivRank  = Number(body.ivRank          ?? 50);

  const distFlip = (price - flip) / price;   // signed
  const ofi      = (callPct - 50) / 50;      // –1 to +1

  // ── Regime classification ────────────────────────────────────────────────
  const gammaRegime =
    Math.abs(distFlip) < 0.005 ? 'NEAR_FLIP' :
    gex > 0 ? 'LONG_GAMMA' : 'SHORT_GAMMA';
  const volRegime  = ivRank > 65 ? 'EXPANSION' : 'COMPRESSION';
  const flowDir    = ofi > 0.2 ? 'BULLISH' : ofi < -0.2 ? 'BEARISH' : 'NEUTRAL';

  // ── Composite score ──────────────────────────────────────────────────────
  const gexSign   = Math.sign(gex);
  const flowPress = 0.7 * ofi + 0.3 * (callPct / 100 - 0.5) * 2;
  const gexFlow   = gexSign < 0 ? flowPress * 1.4 : flowPress * 0.7;
  const skewScore = Math.max(-0.6, Math.min(0.6, skew / 8));
  const pcrScore  = Math.max(-0.5, Math.min(0.5, (1 - pcr) * 0.5));
  let score       = 0.50 * gexFlow + 0.25 * skewScore + 0.15 * pcrScore + 0.10 * gexSign * 0.3;
  score           = Math.max(-1, Math.min(1, score));

  // ── Confidence ───────────────────────────────────────────────────────────
  const base       = Math.min(Math.abs(score) * 1.5, 0.90);
  const dirs       = [Math.sign(gex), Math.sign(ofi), Math.sign(skew)].filter(s => s !== 0);
  const agreement  = dirs.length > 0
    ? dirs.filter(s => s === Math.sign(score)).length / dirs.length
    : 0.5;
  const flipPen    = Math.abs(distFlip) < 0.005 ? 0.25 : 0;
  const confidence = Math.max(0.35, Math.min(0.95,
    base * 0.40 + agreement * 0.35 + 0.25 - flipPen,
  ));

  // ── Bias ─────────────────────────────────────────────────────────────────
  const bias: 'LONG' | 'SHORT' | 'NEUTRAL' =
    score >  0.15 && confidence >= 0.40 ? 'LONG'  :
    score < -0.15 && confidence >= 0.40 ? 'SHORT' : 'NEUTRAL';

  // ── Key levels ────────────────────────────────────────────────────────────
  const spread    = 0.02 * (1 + Math.abs(gex) / 5);
  const callWall  = +(price * (1 + spread)).toFixed(2);
  const putWall   = +(price * (1 - spread)).toFixed(2);
  const support    = [...(putWall  < price ? [putWall]  : []), ...(flip < price  ? [+flip.toFixed(2)] : [])];
  const resistance = [...(callWall > price ? [callWall] : []), ...(flip >= price ? [+flip.toFixed(2)] : [])];

  // ── Dealer state (simplified) ─────────────────────────────────────────────
  const dealerState =
    Math.abs(distFlip) < 0.005 ? 'NEAR_FLIP' :
    gex > 0 ? 'LONG_GAMMA' : 'SHORT_GAMMA';

  // ── Confluence score ──────────────────────────────────────────────────────
  const confluenceScore = +(score * 8).toFixed(2);   // scale to [–8, +8]

  // ── Gamma squeeze detection ───────────────────────────────────────────────
  const squeeze = gex < 0 && callPct > 60 && score > 0.4;
  const squeezeStrength = squeeze ? Math.min(1, Math.abs(score)) : 0;

  // ── Market regime ─────────────────────────────────────────────────────────
  const regime =
    squeeze                        ? 'GAMMA_SQUEEZE'          :
    Math.abs(score) > 0.5          ? 'HIGH_PROBABILITY_TREND' :
    Math.abs(distFlip) < 0.01      ? 'BREAKOUT_WATCH'         :
    'RANGE_MARKET';

  // ── Trade setup ───────────────────────────────────────────────────────────
  const biasDir = bias === 'LONG' ? 'haussière' : bias === 'SHORT' ? 'baissière' : 'neutre';
  const setup = {
    entry:        bias === 'NEUTRAL'
                    ? 'Attendre confirmation de direction'
                    : `Entrée ${biasDir} sur pullback vers ${flip.toFixed(0)}`,
    target:       bias === 'LONG'  ? `Résistance ${callWall.toFixed(0)}` :
                  bias === 'SHORT' ? `Support ${putWall.toFixed(0)}`     : 'N/A',
    invalidation: flip > 0
                    ? `Clôture ${bias === 'SHORT' ? 'au-dessus du' : 'sous le'} flip ${flip.toFixed(0)}`
                    : 'Flip level indéfini',
  };

  // ── Engine explanation (concise, deterministic) ───────────────────────────
  const gexStr  = gex > 0
    ? `GEX +${gex}B$ → MM long gamma, marché stabilisant`
    : `GEX ${gex}B$ → MM short gamma, volatilité amplifiée`;
  const flowStr = flowDir === 'BULLISH' ? `flow haussier (calls ${callPct}%)`
                : flowDir === 'BEARISH' ? `flow baissier (puts ${putPct}%)`
                : `flow équilibré (${callPct}%/${putPct}%)`;
  const explanation =
    `[${gammaRegime}/${volRegime}] ${gexStr}. ${flowStr}, PCR=${pcr.toFixed(2)}. ` +
    `Score ${score > 0 ? '+' : ''}${score.toFixed(2)}, confiance ${(confidence * 100).toFixed(0)}%.`;

  return {
    bias,
    confidence:        +confidence.toFixed(4),
    gamma_regime:      gammaRegime,
    volatility_regime: volRegime,
    flow_direction:    flowDir,
    key_levels:        { support, resistance, gamma_flip: +flip.toFixed(2) },
    explanation,
    gamma_squeeze:     squeeze,
    squeeze_strength:  +squeezeStrength.toFixed(3),
    dealer_state:      dealerState,
    confluence_score:  confluenceScore,
    regime,
    setup,
    llm_explanation:   null,
    source:            'js_fallback',
    meta: {
      symbol:    String(body.symbol ?? 'UNKNOWN'),
      price,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const required = ['price', 'gex', 'skew25d', 'callFlowPercent', 'putFlowPercent'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null) {
      return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  // ── 1. Try Python deterministic engine ─────────────────────────────────────
  try {
    const ac      = new AbortController();
    const timeout = setTimeout(() => ac.abort(), CONNECT_TIMEOUT);

    const upstream = await fetch(`${PYTHON_URL}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ac.signal,
    });
    clearTimeout(timeout);

    if (upstream.ok) {
      const result = await upstream.json();
      return Response.json(result);
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      // Connection refused or other error → fall through to JS engine
    }
  }

  // ── 2. JS deterministic fallback ────────────────────────────────────────────
  try {
    const result = runJsEngine(body);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Analysis]', msg);
    return Response.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
  }
}

// ── Health check ───────────────────────────────────────────────────────────────

export async function GET() {
  let pythonOnline = false;
  try {
    const res = await fetch(`${PYTHON_URL}/health`, { signal: AbortSignal.timeout(2000) });
    pythonOnline = res.ok;
  } catch { /* offline */ }

  return Response.json({
    engine:        pythonOnline ? 'python' : 'js_fallback',
    python_online: pythonOnline,
    deterministic: true,
    llm_role:      'explanation_only',
  });
}
