/**
 * POST /api/ai/sales
 * ─────────────────────────────────────────────────────────────────────────────
 * Sales agent endpoint — streams tokens via SSE.
 * Priority: ANTHROPIC_API_KEY → GROQ_API_KEY → Gemini → Ollama (local)
 *
 * Request body:
 *   { message: string, history?: Array<{role, content}>, page?: string }
 *
 * Response: text/event-stream
 *   data: {"token": "..."}\n\n
 *   data: {"cta": [...]}\n\n   ← injected before [DONE]
 *   data: [DONE]\n\n
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { ollamaChatStream, ollamaIsRunning, DEFAULT_MODEL } from '@/lib/ai/ollama';
import { geminiChatStream, geminiAvailable } from '@/lib/ai/gemini';
import { groqChatStream, groqAvailable } from '@/lib/ai/groq';
import { buildSalesMessages, type ChatMessage } from '@/lib/ai/agents/salesAgent';
import { nextBestAction } from '@/lib/ai/sales/nextBestAction';
import { rateLimitByUser, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * Tee a helper SSE stream and inject the CTA frame right before [DONE].
 *
 * Assumption: backends flush `data: [DONE]\n\n` in a single chunk (the SSE
 * convention used by groq/gemini/ollama helpers), so a substring match is
 * enough. A [DONE] split across two reads would skip the CTA — accepted as
 * rare. If the source stream errors mid-flight we still close the SSE
 * cleanly with an error frame + [DONE] so the client never hangs.
 */
function appendCtaFrame(src: ReadableStream<Uint8Array>, ctaFrame: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = src.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        const text = dec.decode(value, { stream: true });
        if (text.includes('data: [DONE]')) {
          const before = text.replace('data: [DONE]\n\n', '');
          if (before) controller.enqueue(enc.encode(before));
          controller.enqueue(enc.encode(ctaFrame));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
    cancel(reason) { void reader.cancel(reason); },
  });
}

export async function POST(req: NextRequest) {
  // Public endpoint — no auth required (landing page sales chat + dashboard)

  // ── Rate-limit par userId si session authentifiée (30 req/min) ──────────────
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const rl = await rateLimitByUser(session.user.id, 30, 60_000);
    if (!rl.allowed) return tooManyRequests(rl);
  }
  // Note : les requêtes non authentifiées restent soumises au rate-limit IP du middleware.

  // ── Input validation ────────────────────────────────────────────────────────
  let body: { message?: string; history?: ChatMessage[]; page?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 });
  }

  if (message.length > 4000) {
    return new Response(JSON.stringify({ error: 'Message too long (max 4000 characters)' }), { status: 400 });
  }

  // Limit history to last 20 messages, each capped at 2000 chars
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-20)
    .map(m => ({ ...m, content: typeof m.content === 'string' ? m.content.slice(0, 2000) : '' }));

  const messages = buildSalesMessages(message.trim(), safeHistory);
  const cta = nextBestAction(message.trim(), safeHistory).ctas;
  const ctaFrame = `data: ${JSON.stringify({ cta })}\n\n`;
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
          controller.enqueue(encoder.encode(ctaFrame));
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

  // ── Groq Llama 3.3 70B (free, cloud — PRIMARY public backend) ───────────────
  if (groqAvailable()) {
    try {
      const stream = await groqChatStream(
        messages.map(m => ({ role: m.role, content: m.content })),
        { maxTokens: 512, temperature: 0.7 },
      );
      const withCta = appendCtaFrame(stream, ctaFrame);
      return new Response(withCta, {
        headers: {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'X-AI-Backend':  'groq',
        },
      });
    } catch (err) {
      console.warn('[sales] Groq failed, falling back to Gemini:', err);
    }
  }

  // ── Gemini API (optional fallback if GEMINI_API_KEY is set) ─────────────────
  if (geminiAvailable()) {
    try {
      const stream = await geminiChatStream(messages, {
        maxTokens:   512,
        temperature: 0.7,
      });
      const withCta = appendCtaFrame(stream, ctaFrame);
      return new Response(withCta, {
        headers: {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
          'X-AI-Backend':  'gemini',
        },
      });
    } catch (err) {
      console.warn('[sales] Gemini failed, falling back to Ollama:', err);
    }
  }

  // ── Ollama fallback (local dev only) ────────────────────────────────────────
  const isUp = await ollamaIsRunning();
  if (!isUp) {
    return new Response(
      JSON.stringify({
        error: 'Service IA temporairement indisponible. Veuillez réessayer plus tard.',
      }),
      { status: 503 }
    );
  }

  try {
    const stream = await ollamaChatStream(messages, DEFAULT_MODEL, {
      temperature: 0.7,
      num_predict: 512,
    });

    const withCta = appendCtaFrame(stream, ctaFrame);
    return new Response(withCta, {
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
    return Response.json({ status: 'ok', model: 'claude-haiku-4-5', agent: 'sales', backend: 'claude' });
  }
  if (groqAvailable()) {
    return Response.json({ status: 'ok', model: 'llama-3.3-70b-versatile', agent: 'sales', backend: 'groq' });
  }
  if (geminiAvailable()) {
    return Response.json({ status: 'ok', model: 'gemini-2.5-flash', agent: 'sales', backend: 'gemini' });
  }
  const isUp = await ollamaIsRunning();
  return Response.json({
    status: isUp ? 'ok' : 'ollama_offline',
    model: DEFAULT_MODEL,
    agent: 'sales',
    backend: 'ollama',
  });
}
