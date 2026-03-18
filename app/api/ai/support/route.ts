/**
 * POST /api/ai/support
 * ─────────────────────────────────────────────────────────────────────────────
 * Support agent endpoint — streams tokens via SSE.
 *
 * Request body:
 *   { message: string, history?: Array<{role, content}> }
 *
 * Response: text/event-stream
 *   data: {"token": "..."}\n\n
 *   data: [DONE]\n\n
 */

import { NextRequest } from 'next/server';
import { ollamaChatStream, ollamaIsRunning, DEFAULT_MODEL } from '@/lib/ai/ollama';
import { buildSupportMessages, type ChatMessage } from '@/lib/ai/agents/supportAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // ── Input validation ────────────────────────────────────────────────────────
  let body: { message?: string; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 });
  }

  // ── Ollama availability check ───────────────────────────────────────────────
  const isUp = await ollamaIsRunning();
  if (!isUp) {
    return new Response(
      JSON.stringify({
        error: 'Ollama is not running. Start it with: ollama serve',
        hint: `Then pull a model: ollama pull ${DEFAULT_MODEL}`,
      }),
      { status: 503 }
    );
  }

  // ── Build messages ──────────────────────────────────────────────────────────
  const messages = buildSupportMessages(message.trim(), history);

  // ── Stream response ─────────────────────────────────────────────────────────
  try {
    const stream = await ollamaChatStream(messages, DEFAULT_MODEL, {
      temperature: 0.7,
      num_predict: 512,
    });

    return new Response(stream, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Ollama error: ${msg}` }), { status: 500 });
  }
}

// ── Health check ────────────────────────────────────────────────────────────
export async function GET() {
  const isUp = await ollamaIsRunning();
  return Response.json({
    status:  isUp ? 'ok' : 'ollama_offline',
    model:   DEFAULT_MODEL,
    agent:   'support',
  });
}
