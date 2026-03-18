/**
 * GET /api/ai/agent/stream
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary SSE endpoint for the /ai page live agent panel.
 *
 * STRATEGY (in order):
 *   1. Try to proxy the Python FastAPI agent (http://localhost:8765)
 *      → Full agent: GEX, skew, flow, microstructure, persistence filters
 *      → Set env var AGENT_SERVER_URL to change host
 *   2. If Python is unreachable → fall back to built-in JS simulation
 *      → Lighter agent, same output shape
 *
 * RESPONSE HEADERS:
 *   X-Agent-Source: "python" | "js_fallback"
 *   Content-Type:   text/event-stream
 *
 * USAGE:
 *   Start Python:  py -m ml.agent.server   (port 8765)
 *   Frontend:      EventSource('/api/ai/agent/stream?interval=3000')
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/api-middleware';
import { StreamAgent, SyntheticFeed } from '@/lib/ai/streamAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PYTHON_URL   = process.env.AGENT_SERVER_URL ?? 'http://localhost:8765';
const CONNECT_TIMEOUT_MS = 2000;  // give Python 2s to respond before falling back

// ── Helpers ───────────────────────────────────────────────────────────────────

const SSE_HEADERS = (source: string) => ({
  'Content-Type':      'text/event-stream',
  'Cache-Control':     'no-cache, no-transform',
  'Connection':        'keep-alive',
  'X-Accel-Buffering': 'no',
  'X-Agent-Source':    source,
});

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const interval = parseInt(req.nextUrl.searchParams.get('interval') ?? '3000', 10);

  // ── 1. Attempt Python FastAPI proxy ────────────────────────────────────────
  try {
    // AbortController merges: client disconnect OR our connect-timeout
    const ac      = new AbortController();
    const timeout = setTimeout(() => ac.abort(), CONNECT_TIMEOUT_MS);

    // Propagate browser disconnect to Python fetch
    req.signal.addEventListener('abort', () => ac.abort(), { once: true });

    const upstream = await fetch(
      `${PYTHON_URL}/stream/live?delay_ms=${Math.max(100, interval)}`,
      { signal: ac.signal },
    );
    clearTimeout(timeout);

    if (upstream.ok && upstream.body) {
      // Pass Python's SSE stream directly to the browser
      return new Response(upstream.body, { headers: SSE_HEADERS('python') });
    }
  } catch (e) {
    // Abort from browser disconnect (not timeout) → stop immediately
    if ((e as Error).name === 'AbortError' && req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    // Python not running → fall through to JS fallback
  }

  // ── 2. JS fallback simulation ───────────────────────────────────────────────
  const agent   = new StreamAgent();
  const feed    = new SyntheticFeed();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatTimer = Date.now();
      let alive = true;

      req.signal.addEventListener('abort', () => { alive = false; }, { once: true });

      const send = (data: string) => {
        try   { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
        catch { alive = false; }
      };

      // Announce source so the UI can distinguish JS sim from Python
      send(JSON.stringify({ type: 'connected', source: 'js_fallback', interval }));

      while (alive) {
        const tick   = feed.next();
        const signal = agent.process(tick);
        if (signal) send(JSON.stringify(signal));

        // Keep-alive heartbeat every 15s
        if (Date.now() - heartbeatTimer > 15_000) {
          send(JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() }));
          heartbeatTimer = Date.now();
        }

        await new Promise(r => setTimeout(r, interval));
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS('js_fallback') });
}
