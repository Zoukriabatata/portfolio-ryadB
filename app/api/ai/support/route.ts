/**
 * POST /api/ai/support
 * ─────────────────────────────────────────────────────────────────────────────
 * Support agent endpoint — streams tokens via SSE.
 * Priority: Claude API (Vercel/cloud) → Ollama (local)
 *
 * Request body:
 *   { message: string, history?: Array<{role, content}> }
 *
 * Response: text/event-stream
 *   data: {"token": "..."}\n\n
 *   data: [DONE]\n\n
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ollamaChatStream, ollamaIsRunning, DEFAULT_MODEL } from '@/lib/ai/ollama';
import { buildSupportMessages, type ChatMessage } from '@/lib/ai/agents/supportAgent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

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

  const messages = buildSupportMessages(message.trim(), history);
  const encoder = new TextEncoder();

  // ── Claude API (cloud / Vercel) ─────────────────────────────────────────────
  if (anthropic) {
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const response = await anthropic.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemMessage?.content ?? '',
            messages: chatMessages,
          });

          for await (const chunk of response) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta' &&
              chunk.delta.text
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token: chunk.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Claude error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-AI-Backend': 'claude',
      },
    });
  }

  // ── Ollama fallback (local dev) ─────────────────────────────────────────────
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

  try {
    const stream = await ollamaChatStream(messages, DEFAULT_MODEL, {
      temperature: 0.7,
      num_predict: 512,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-AI-Backend': 'ollama',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Ollama error: ${msg}` }), { status: 500 });
  }
}

// ── Health check ────────────────────────────────────────────────────────────
export async function GET() {
  if (anthropic) {
    return Response.json({ status: 'ok', model: 'claude-haiku-4-5', agent: 'support', backend: 'claude' });
  }
  const isUp = await ollamaIsRunning();
  return Response.json({
    status: isUp ? 'ok' : 'ollama_offline',
    model: DEFAULT_MODEL,
    agent: 'support',
    backend: 'ollama',
  });
}
