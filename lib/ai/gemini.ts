/**
 * GEMINI CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the Google Gemini API (https://generativelanguage.googleapis.com).
 * Free tier: ~1500 req/day, 15 req/min, 1M tokens/day on Gemini 2.5 Flash.
 *
 * Used as the primary public-facing LLM (no cost for the site owner).
 * Supports text + multimodal (images via base64), streaming via SSE.
 *
 * Get a free API key: https://aistudio.google.com/apikey
 * Then set:  GEMINI_API_KEY=AI...   in .env.local
 */

const GEMINI_BASE   = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL  = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
export const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';

export const geminiAvailable = (): boolean => GEMINI_KEY.length > 0;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GeminiImage {
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ─── Message conversion ──────────────────────────────────────────────────────

/**
 * Convert OpenAI-style messages to Gemini format.
 * Gemini uses 'user' and 'model' roles (no 'assistant'), and merges any
 * 'system' messages into a separate `systemInstruction` field.
 */
function toGeminiContents(
  messages: GeminiMessage[],
  image?: GeminiImage,
): { contents: GeminiContent[]; systemInstruction?: string } {
  const systemMsgs = messages.filter(m => m.role === 'system');
  const chatMsgs   = messages.filter(m => m.role !== 'system');

  const systemInstruction = systemMsgs.length
    ? systemMsgs.map(m => m.content).join('\n\n')
    : undefined;

  const contents: GeminiContent[] = chatMsgs.map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Attach image to the last user message
  if (image && contents.length > 0) {
    const last = contents[contents.length - 1];
    if (last.role === 'user') {
      last.parts.push({
        inline_data: { mime_type: image.mediaType, data: image.base64 },
      });
    }
  }

  return { contents, systemInstruction };
}

// ─── Non-streaming ────────────────────────────────────────────────────────────

/**
 * Single-shot text generation. Use for short non-interactive tasks
 * (e.g. analysis explanation enrichment).
 * Returns null on any error so callers can fall back gracefully.
 */
export async function geminiGenerate(
  messages: GeminiMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string | null> {
  if (!GEMINI_KEY) return null;

  const { contents, systemInstruction } = toGeminiContents(messages);

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
          generationConfig: {
            maxOutputTokens: opts.maxTokens ?? 512,
            temperature:     opts.temperature ?? 0.7,
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!res.ok) return null;

    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

// ─── Streaming SSE ────────────────────────────────────────────────────────────

/**
 * Streaming chat response. Returns a ReadableStream emitting standard SSE:
 *   data: {"token": "..."}\n\n
 *   data: [DONE]\n\n
 *
 * Throws on connection error so the caller can fall back to another backend.
 */
export async function geminiChatStream(
  messages: GeminiMessage[],
  opts: {
    maxTokens?:   number;
    temperature?: number;
    image?:       GeminiImage;
  } = {},
): Promise<ReadableStream<Uint8Array>> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is not set');

  const { contents, systemInstruction } = toGeminiContents(messages, opts.image);

  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1024,
          temperature:     opts.temperature ?? 0.7,
        },
      }),
    },
  );

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
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

          // SSE events are separated by blank lines
          const events = buf.split('\n\n');
          buf = events.pop() ?? '';

          for (const evt of events) {
            const dataLine = evt.split('\n').find(l => l.startsWith('data: '));
            if (!dataLine) continue;
            const raw = dataLine.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const j = JSON.parse(raw) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              };
              const token = j.candidates?.[0]?.content?.parts?.[0]?.text;
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