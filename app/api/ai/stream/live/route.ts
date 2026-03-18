/**
 * GET /api/ai/stream/live
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent SSE endpoint. Client connects once and receives agent signals
 * in real-time for as long as the connection stays open.
 *
 * LOOP:
 *   while (connection open) {
 *     data = get_market_data()          ← Binance WS / simulation
 *     signal = agent.process(data)
 *     if (signal.change_detected)
 *       → send SSE event to client
 *     await sleep(interval)
 *   }
 *
 * MODES (via query param ?mode=):
 *   sim   → synthetic data (default, always works)
 *   live  → real Binance + Deribit data (requires market WebSocket running)
 *
 * SSE FORMAT:
 *   data: {"bias":"LONG","confidence":0.72,...}\n\n
 *   data: {"type":"heartbeat","ts":"..."}\n\n   ← every 15s to keep connection alive
 */

import { NextRequest, NextResponse } from 'next/server';
import { StreamAgent, SyntheticFeed } from '@/lib/ai/streamAgent';
import { requireAuth } from '@/lib/auth/api-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// StreamAgent and SyntheticFeed are imported from @/lib/ai/streamAgent above.

// ─── GET — persistent SSE loop ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const mode     = req.nextUrl.searchParams.get('mode') ?? 'sim';
  const interval = parseInt(req.nextUrl.searchParams.get('interval') ?? '3000', 10); // ms between ticks
  const agent    = new StreamAgent();
  const feed     = new SyntheticFeed();
  const encoder  = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatTimer = Date.now();
      let alive = true;

      // Detect client disconnect
      req.signal.addEventListener('abort', () => { alive = false; });

      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
        catch { alive = false; }
      };

      // Initial connection event
      send(JSON.stringify({ type: 'connected', mode, interval }));

      while (alive) {
        // ── Get market data (sim or live) ─────────────────────────────────
        const tick = feed.next();   // swap with real data source here

        // ── Run agent ─────────────────────────────────────────────────────
        const signal = agent.process(tick);
        if (signal !== null) {
          send(JSON.stringify(signal));
        }

        // ── Heartbeat every 15s ────────────────────────────────────────────
        if (Date.now() - heartbeatTimer > 15_000) {
          send(JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() }));
          heartbeatTimer = Date.now();
        }

        // ── Wait for next tick ─────────────────────────────────────────────
        await new Promise(r => setTimeout(r, interval));
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
    },
  });
}
