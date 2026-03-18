/**
 * POST /api/ai/support
 * ─────────────────────────────────────────────────────────────────────────────
 * Support agent endpoint — streams tokens via SSE.
 * Priority: ANTHROPIC_API_KEY → GROQ_API_KEY → Ollama (local)
 *
 * Request body:
 *   { message: string, history?: Array<{role, content}> }
 *
 * Response: text/event-stream
 *   data: {"token": "..."}\n\n
 *   data: [DONE]\n\n
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ollamaChatStream, ollamaIsRunning, DEFAULT_MODEL } from '@/lib/ai/ollama';
import { buildSupportMessages, type ChatMessage } from '@/lib/ai/agents/supportAgent';
import { requireAuth } from '@/lib/auth/api-middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

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

  if (message.length > 4000) {
    return new Response(JSON.stringify({ error: 'Message too long (max 4000 characters)' }), { status: 400 });
  }

  // Limit history to last 20 messages, each capped at 2000 chars
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-20)
    .map(m => ({ ...m, content: typeof m.content === 'string' ? m.content.slice(0, 2000) : '' }));

  const messages = buildSupportMessages(message.trim(), safeHistory);
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

  // ── Groq API (free, cloud) ───────────────────────────────────────────────────
  if (process.env.GROQ_API_KEY) {
    const systemMsg = messages.find(m => m.role === 'system');
    const groqMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: systemMsg
                ? groqMessages
                : [{ role: 'system', content: 'Tu es un assistant support pour OrderFlow, une plateforme de trading professionnelle.' }, ...groqMessages],
              stream: true,
              max_tokens: 512,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(30_000),
          });

          if (!res.ok) {
            const errText = await res.text();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `Groq error: ${errText.slice(0, 100)}` })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }

          const reader = res.body!.getReader();
          const dec = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = dec.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') break;
              try {
                const ev = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: string } }> };
                const token = ev.choices?.[0]?.delta?.content;
                if (token) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Groq error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
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
        'X-AI-Backend': 'groq',
      },
    });
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
  if (process.env.GROQ_API_KEY) {
    return Response.json({ status: 'ok', model: 'llama-3.1-8b-instant', agent: 'support', backend: 'groq' });
  }
  const isUp = await ollamaIsRunning();
  return Response.json({
    status: isUp ? 'ok' : 'ollama_offline',
    model: DEFAULT_MODEL,
    agent: 'support',
    backend: 'ollama',
  });
}
