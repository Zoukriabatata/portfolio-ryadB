/**
 * app/api/ai/vision/route.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Multimodal chat with two backends:
 *
 *   1. Claude claude-sonnet-4-6  (ANTHROPIC_API_KEY set)  — GPT-4o level, best quality
 *   2. Ollama local              (fallback)                — free, private
 *
 * POST multipart/form-data
 *   message  — user text (required)
 *   image    — image file, optional (PNG/JPG/GIF/WEBP ≤ 10 MB)
 *   history  — JSON [{role,content}[]]
 *
 * Response: SSE  data: {"token":"…"}\n\n  …  data: [DONE]\n\n
 *           Header: X-Vision-Backend: claude | ollama
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic        from '@anthropic-ai/sdk';
import { ollamaIsRunning, listModels, DEFAULT_MODEL } from '@/lib/ai/ollama';
import { requireAuth } from '@/lib/auth/api-middleware';

// ─── Config ────────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY ?? '';
const OLLAMA_BASE    = process.env.OLLAMA_URL   ?? 'http://localhost:11434';
const VISION_MODEL   = process.env.VISION_MODEL ?? '';
const MAX_BYTES      = 10 * 1024 * 1024;
const CLAUDE_MODEL   = 'claude-sonnet-4-6';

const VISION_CANDIDATES = ['moondream', 'llava-phi3', 'llava', 'bakllava', 'minicpm-v', 'llava-llama3'];

async function detectVisionModel(installed: string[]): Promise<string | null> {
  for (const base of VISION_CANDIDATES) {
    const hit = installed.find(m => m === base || m.startsWith(base + ':'));
    if (hit) return hit;
  }
  return null;
}

// ─── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_VISION = `You are an elite trading analyst at the level of a senior prop trader or hedge fund portfolio manager.

Your expertise covers:
- Price action and multi-timeframe market structure (HH/HL, LH/LL, BOS, CHoCH)
- Order flow and footprint chart reading (bid/ask delta, imbalances, absorption, stacked prints)
- Volume profile analysis (POC, VAH, VAL, naked POC, volume nodes)
- Gamma exposure (GEX), options flow, put/call skew, IV rank
- Liquidity concepts: stop hunts, liquidity sweeps, fair value gaps (FVG), order blocks (OB)
- Chart patterns: breakouts, compressions, wedges, double tops/bottoms, head & shoulders
- Technical indicators when visible: RSI divergence, MACD, VWAP, moving averages

When you receive a chart image, you ALWAYS respond with a structured, specific analysis.
You give exact price levels when readable from the chart.
You are direct, professional, and concise. No generic disclaimers. No hedging.
Your analysis should read like a Bloomberg terminal note or a desk research brief.`;

const SYSTEM_TEXT = `You are an elite trading analyst and assistant at the level of a senior prop trader.

Your deep expertise includes:
- Technical analysis, price action, multi-timeframe structure
- Order flow: footprint charts, delta, bid/ask imbalances, absorption
- Volume profile: POC, VAH/VAL, volume nodes
- Derivatives: GEX, gamma flip, options flow, put/call skew, IV rank/percentile
- Liquidity: stop hunts, FVG, order blocks, liquidity sweeps
- Risk: position sizing, R:R, entry/target/invalidation frameworks

You answer concisely, specifically, and professionally. No generic disclaimers.
When discussing setups, always include entry zone, target, and invalidation level.`;

// Triggers where user just says "analyse" — expand to full structured request
const ANALYSE_TRIGGERS = [
  'analyse', 'analyze', 'analyser', 'analysis', 'analyse le', 'analyze this',
  'analyse le graphique', 'analyse le chart', 'what do you see', 'que vois tu',
  'que vois-tu', 'dis moi', 'dis-moi', 'explique', 'what is this',
];

function isAnalyseRequest(msg: string): boolean {
  const lower = msg.toLowerCase().trim();
  return ANALYSE_TRIGGERS.some(t => lower === t || lower.startsWith(t + ' ') || lower.startsWith(t + ','));
}

const FULL_ANALYSIS_PROMPT = `Analyse this trading chart and give me a complete professional analysis.

Structure your response exactly like this:

**CHART**: [asset, timeframe if visible, chart type]

**STRUCTURE**: [trend direction, recent swing points, any BOS or CHoCH]

**KEY LEVELS**:
- Resistance: [price] — [brief reason]
- Support: [price] — [brief reason]
- [POC / VWAP / GEX level if visible]

**MOMENTUM**: [accelerating / decelerating / diverging — what signals confirm this]

**PATTERN**: [any setup visible — breakout, rejection, compression, FVG, OB, etc.]

**THESIS**:
- Bias: LONG / SHORT / NEUTRAL
- Conviction: HIGH / MEDIUM / LOW
- Entry zone: [price range]
- Target 1: [price]
- Target 2: [price if applicable]
- Invalidation: [price — what proves this wrong]
- Reasoning: [2-3 sentences of clear explanation]

Use exact price numbers from the chart wherever readable. Be specific and direct.`;

// ─── SSE helper ────────────────────────────────────────────────────────────────

function sseResponse(
  stream: ReadableStream<Uint8Array>,
  backend: 'claude' | 'ollama',
): Response {
  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Vision-Backend':  backend,
    },
  });
}

function makeSSEStream(
  gen: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (token: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
      const done = () => controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      try {
        await gen(controller);
        done();
      } catch {
        done();
      } finally {
        controller.close();
      }
    },
  });
}

// ─── Claude backend ────────────────────────────────────────────────────────────

async function callClaude(
  userContent: Anthropic.MessageParam['content'],
  history: { role: string; content: string }[],
  hasImage: boolean,
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  const messages: Anthropic.MessageParam[] = [
    // History (text only)
    ...history.slice(-12).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    // Current message
    { role: 'user', content: userContent },
  ];

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model:      CLAUDE_MODEL,
          max_tokens: hasImage ? 1500 : 1000,
          system:     hasImage ? SYSTEM_VISION : SYSTEM_TEXT,
          messages,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta' &&
            event.delta.text
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Claude API error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: `\n\nError: ${msg}` })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });
}

// ─── Ollama backend ────────────────────────────────────────────────────────────

async function callOllama(
  model: string,
  userText: string,
  base64Image: string | null,
  history: { role: string; content: string }[],
  hasImage: boolean,
): Promise<ReadableStream<Uint8Array>> {
  const ollamaMessages: { role: string; content: string; images?: string[] }[] = [
    { role: 'system', content: hasImage ? SYSTEM_VISION : SYSTEM_TEXT },
    ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
    base64Image
      ? { role: 'user', content: userText, images: [base64Image] }
      : { role: 'user', content: userText },
  ];

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream:   true,
      messages: ollamaMessages,
      options: { temperature: hasImage ? 0.2 : 0.65, num_predict: hasImage ? 1200 : 800, top_p: 0.9 },
    }),
  });

  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status}`);

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.trim()) continue;
            try {
              const j = JSON.parse(line) as { message?: { content: string }; done: boolean };
              if (j.message?.content)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: j.message.content })}\n\n`));
              if (j.done)
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            } catch { /* skip */ }
          }
        }
      } catch {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // ── Parse form ──────────────────────────────────────────────────────────────
  let form: FormData;
  try { form = await req.formData(); }
  catch { return Response.json({ error: 'Invalid multipart/form-data.' }, { status: 400 }); }

  const message = (form.get('message') as string | null)?.trim() ?? '';
  if (!message) return Response.json({ error: 'message field is required.' }, { status: 400 });
  if (message.length > 4000) return Response.json({ error: 'Message too long (max 4000 characters).' }, { status: 400 });

  let history: { role: string; content: string }[] = [];
  try { history = JSON.parse((form.get('history') as string | null) ?? '[]'); } catch { history = []; }

  // ── Optional image ──────────────────────────────────────────────────────────
  const fileEntry = form.get('image');
  const hasImage  = fileEntry instanceof File && fileEntry.size > 0;
  let base64Image = '';
  type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  let mediaType: ImageMediaType = 'image/png';

  if (hasImage) {
    const file = fileEntry as File;
    const allowed: ImageMediaType[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const fileType = file.type as ImageMediaType;
    if (!allowed.includes(fileType))
      return Response.json({ error: `Type non supporté: ${file.type}` }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength > MAX_BYTES)
      return Response.json({ error: 'Image trop grande (max 10 MB).' }, { status: 413 });
    base64Image = buf.toString('base64');
    mediaType   = fileType;
  }

  // ── Expand short "analyse" messages when image is attached ──────────────────
  const userText = hasImage && isAnalyseRequest(message) ? FULL_ANALYSIS_PROMPT : message;

  // ── 1. Try Claude claude-sonnet-4-6 (if API key present) ─────────────────────────
  if (ANTHROPIC_KEY) {
    let claudeContent: Anthropic.MessageParam['content'];

    if (hasImage) {
      claudeContent = [
        {
          type:   'image',
          source: { type: 'base64', media_type: mediaType, data: base64Image },
        },
        { type: 'text', text: userText },
      ];
    } else {
      claudeContent = userText;
    }

    const stream = await callClaude(claudeContent, history, hasImage);
    return sseResponse(stream, 'claude');
  }

  // ── 2. Fallback: Ollama ─────────────────────────────────────────────────────
  if (!(await ollamaIsRunning())) {
    return Response.json({
      error: 'Ollama not running and no ANTHROPIC_API_KEY set.',
      hint:  'Either set ANTHROPIC_API_KEY in .env.local or run: ollama serve',
    }, { status: 503 });
  }

  const installed = await listModels();
  let model: string;

  if (hasImage) {
    model = VISION_MODEL || (await detectVisionModel(installed)) || '';
    if (!model) {
      return Response.json({
        error:            'No vision model found in Ollama.',
        hint:             'ollama pull moondream',
        installed_models: installed,
      }, { status: 503 });
    }
  } else {
    model = DEFAULT_MODEL;
  }

  try {
    const stream = await callOllama(model, userText, hasImage ? base64Image : null, history, hasImage);
    return sseResponse(stream, 'ollama');
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
