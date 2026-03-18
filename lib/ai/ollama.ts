/**
 * OLLAMA CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps the Ollama local API (http://localhost:11434).
 * Supports both streaming (SSE) and non-streaming responses.
 *
 * Prerequisites:
 *   1. Install Ollama: https://ollama.com
 *   2. Pull a model: ollama pull mistral
 *   3. Ollama runs automatically on port 11434
 */

const OLLAMA_BASE = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'mistral';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  temperature?: number;   // 0.0–1.0  (default 0.7)
  top_p?: number;         // 0.0–1.0
  num_ctx?: number;       // Context window size (default 4096)
  num_predict?: number;   // Max tokens to generate
}

// ─── Non-streaming ────────────────────────────────────────────────────────────

/**
 * Send a chat request and wait for the full response.
 * Use for analysis agent (structured output).
 */
export async function ollamaChat(
  messages: OllamaMessage[],
  model = DEFAULT_MODEL,
  options: OllamaOptions = {}
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const data = await res.json() as { message: { content: string } };
  return data.message.content;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

/**
 * Send a chat request and return a ReadableStream of SSE events.
 * Each event: { token: string }
 * Final event: [DONE]
 *
 * Use for support agent (real-time chat feel).
 */
export async function ollamaChatStream(
  messages: OllamaMessage[],
  model = DEFAULT_MODEL,
  options: OllamaOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, options }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error('Ollama: no response body');

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const raw = decoder.decode(value, { stream: true });

          // Ollama streams one JSON object per line
          for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line) as {
                message?: { content: string };
                done: boolean;
              };
              if (json.message?.content) {
                const sseData = `data: ${JSON.stringify({ token: json.message.content })}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              }
              if (json.done) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } catch {
              // Malformed line — skip
            }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function ollamaIsRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    const data = await res.json() as { models: Array<{ name: string }> };
    return data.models.map(m => m.name);
  } catch {
    return [];
  }
}
