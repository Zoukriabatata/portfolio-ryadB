/**
 * GROQ CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the Groq API (https://api.groq.com/openai/v1) — OpenAI-compatible.
 * Free tier: ~14 400 req/day, 30 req/min, no credit card required.
 *
 * Used as the PRIMARY public-facing LLM (no cost, no billing setup needed).
 * Defaults to Llama 3.3 70B Versatile — quality close to Claude Haiku.
 *
 * Get a free API key (email signup only): https://console.groq.com/keys
 * Then set:  GROQ_API_KEY=gsk_...   in .env.local
 */

const GROQ_BASE = 'https://api.groq.com/openai/v1';

// Text model — Llama 3.3 70B is the current best free option on Groq
export const GROQ_TEXT_MODEL =
  process.env.GROQ_TEXT_MODEL ?? 'llama-3.3-70b-versatile';

// Vision model — Llama 4 Scout is multimodal and free on Groq
export const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

export const groqAvailable = (): boolean => Boolean(process.env.GROQ_API_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroqMessage {
  role:    'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
}

interface GroqContentPart {
  type:       'text' | 'image_url';
  text?:      string;
  image_url?: { url: string };
}

export interface GroqImage {
  base64:    string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

// ─── Non-streaming ────────────────────────────────────────────────────────────

/**
 * Single-shot completion. Use for short non-interactive tasks
 * (e.g. analysis explanation enrichment).
 * Returns null on any error so callers can fall back gracefully.
 */
export async function groqGenerate(
  messages: GroqMessage[],
  opts: { maxTokens?: number; temperature?: number; model?: string } = {},
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       opts.model ?? GROQ_TEXT_MODEL,
        messages,
        max_tokens:  opts.maxTokens  ?? 512,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ─── Streaming SSE ────────────────────────────────────────────────────────────

/**
 * Streaming chat response. Emits standard SSE:
 *   data: {"token": "..."}\n\n
 *   data: [DONE]\n\n
 *
 * Throws on connection error so the caller can fall back.
 * Pass `image` to use the vision model automatically.
 */
export async function groqChatStream(
  messages: GroqMessage[],
  opts: {
    maxTokens?:   number;
    temperature?: number;
    model?:       string;
    image?:       GroqImage;
  } = {},
): Promise<ReadableStream<Uint8Array>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');

  // If image attached, replace last user message content with multimodal parts
  // and switch to vision model.
  let finalMessages = messages;
  let model = opts.model ?? GROQ_TEXT_MODEL;

  if (opts.image) {
    model = opts.model ?? GROQ_VISION_MODEL;
    const lastUserIdx = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return i;
      }
      return -1;
    })();

    if (lastUserIdx >= 0) {
      const last = messages[lastUserIdx];
      const text = typeof last.content === 'string' ? last.content : '';
      const dataUrl = `data:${opts.image.mediaType};base64,${opts.image.base64}`;
      finalMessages = [
        ...messages.slice(0, lastUserIdx),
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text },
          ],
        },
        ...messages.slice(lastUserIdx + 1),
      ];
    }
  }

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages:    finalMessages,
      stream:      true,
      max_tokens:  opts.maxTokens  ?? 1024,
      temperature: opts.temperature ?? 0.7,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${errText.slice(0, 200)}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = res.body!.getReader();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;

            try {
              const j = JSON.parse(raw) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const token = j.choices?.[0]?.delta?.content;
              if (token) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ token })}\n\n`),
                );
              }
            } catch { /* skip malformed */ }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        try { controller.close(); } catch { /* already closed */ }
        reader.releaseLock();
      }
    },
  });
}
