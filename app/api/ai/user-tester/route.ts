/**
 * POST /api/ai/user-tester
 * ──────────────────────────────────────────────────────────────────────────────
 * Autonomous AI user-testing agent.
 * Priority: ANTHROPIC_API_KEY → GROQ_API_KEY → static HTTP fallback
 *
 * The AI has full knowledge of all platform features (via /api/ai/user-tester/inventory)
 * and can test: market data, datafeed, AI support, journal, news, payment, auth,
 * and describe detailed UI interaction tests for chart tools/settings.
 *
 * SSE events:
 *   {"type":"thinking","text":"..."}
 *   {"type":"action","tool":"...","input":{},"id":"..."}
 *   {"type":"result","tool":"...","id":"...","detail":"","status":"ok|fail"}
 *   {"type":"report","report":{...}}
 *   {"type":"done","score":N}
 *   [DONE]
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// ── Base URL ───────────────────────────────────────────────────────────────

function getBaseUrl(req: NextRequest): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL)   return `https://${process.env.VERCEL_URL}`;
  return `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Navigation & page loading ──
  {
    name: 'navigate',
    description: 'Navigate to a page and verify it loads. Returns HTTP status, response time, page size, and whether the page has real content (vs an error/redirect).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:   { type: 'string', description: 'Page path, e.g. "/live", "/pricing", "/journal", "/gex"' },
        reason: { type: 'string', description: 'Why you are visiting this page' },
      },
      required: ['path', 'reason'],
    },
  },

  // ── Raw API call ──
  {
    name: 'call_api',
    description: 'Call any API endpoint with GET or POST. Use this to test specific backend features (datafeed, auth, payment, news, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        endpoint: { type: 'string', description: 'API path with query params, e.g. "/api/spot-price?symbol=BTCUSDT"' },
        method:   { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
        body:     { type: 'object', description: 'Request body for POST requests' },
        reason:   { type: 'string', description: 'What feature are you testing' },
      },
      required: ['endpoint', 'method', 'reason'],
    },
  },

  // ── Market data tests ──
  {
    name: 'get_market_data',
    description: 'Fetch live market data for a symbol. Tests whether real-time data feeds are working for crypto and futures.',
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol:   { type: 'string', description: 'Symbol, e.g. "BTCUSDT", "ETHUSDT", "SOLUSDT"' },
        dataType: { type: 'string', enum: ['price', 'klines', 'gex', 'volatility', 'options', 'news'], description: 'Type of data to fetch' },
      },
      required: ['symbol', 'dataType'],
    },
  },

  // ── Feature test suite ──
  {
    name: 'run_feature_suite',
    description: 'Run a complete battery of tests for a feature group. Tests multiple endpoints automatically and returns a summary of what works/fails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        suite: {
          type: 'string',
          enum: ['market_data', 'datafeed', 'ai_features', 'journal', 'auth', 'payment', 'news', 'live_chart_apis'],
          description: 'Which feature group to test',
        },
        reason: { type: 'string', description: 'Why you are running this suite' },
      },
      required: ['suite', 'reason'],
    },
  },

  // ── Page content inspection ──
  {
    name: 'inspect_page',
    description: 'Fetch a page and extract its visible text content, headings, links, and detect UI elements. Good for verifying landing pages, pricing, error pages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:   { type: 'string', description: 'Page path, e.g. "/", "/pricing", "/login"' },
        reason: { type: 'string', description: 'What you want to verify on this page' },
      },
      required: ['path', 'reason'],
    },
  },

  // ── AI support chat ──
  {
    name: 'chat_with_support',
    description: 'Send a real message to the OrderFlow AI support chat and read the actual streaming response. Tests whether the AI assistant is working correctly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Your question to the AI (e.g. "Comment utiliser les outils de dessin ?" or "Qu\'est-ce que le footprint chart ?")' },
        reason:  { type: 'string', description: 'Why you are testing this question' },
      },
      required: ['message', 'reason'],
    },
  },

  // ── UI interaction log (for client-side features) ──
  {
    name: 'log_ui_test',
    description: 'Log a detailed description of testing a client-side UI feature (chart tools, settings panels, indicators, quick trade). Since these are browser-only, describe exactly what you would do step-by-step and what you expect to see.',
    input_schema: {
      type: 'object' as const,
      properties: {
        feature:     { type: 'string', description: 'Feature name, e.g. "Trend Line Tool", "Chart Settings Panel", "Fibonacci Retracement", "Quick Trade Bar", "Volume Profile", "Split Chart"' },
        steps:       { type: 'array', items: { type: 'string' }, description: 'Step-by-step actions: ["1. Click the T key to select Trend Line", "2. Click on chart to set first point", ...]' },
        expected:    { type: 'string', description: 'What a working feature should look like' },
        status:      { type: 'string', enum: ['testable_via_api', 'ui_only', 'requires_auth'], description: 'Whether this can be verified via API or is UI-only' },
        api_verified: { type: 'boolean', description: 'Whether you already verified the backing API works' },
      },
      required: ['feature', 'steps', 'expected', 'status'],
    },
  },

  // ── Final report ──
  {
    name: 'write_report',
    description: 'Write and submit the final bilan after you have finished ALL testing (at least 10 actions). This ends the testing session. Be extremely specific in improvements — give exact file paths, code snippets, config values when possible.',
    input_schema: {
      type: 'object' as const,
      properties: {
        overall_score:    { type: 'number', description: 'Overall score out of 100' },
        summary:          { type: 'string', description: '2-3 sentence executive summary in French' },
        what_works:       { type: 'array',  items: { type: 'string' }, description: 'List of things that work well' },
        what_fails:       { type: 'array',  items: { type: 'string' }, description: 'List of bugs and failures' },
        verdict:          { type: 'string', description: 'One-line verdict' },
        user_experience:  { type: 'string', description: 'Detailed UX narrative in French (500+ words) written as a trader discovering the platform' },
        improvements: {
          type: 'array',
          description: 'Concrete, actionable improvements sorted by priority. Each must have a specific action to take.',
          items: {
            type: 'object',
            properties: {
              title:       { type: 'string', description: 'Short title of the improvement' },
              description: { type: 'string', description: 'What the problem is and why it matters' },
              action:      { type: 'string', description: 'EXACT action to take: file path + what to change, config value, API to add, UI fix, etc.' },
              category:    { type: 'string', enum: ['bug', 'performance', 'ux', 'feature', 'security', 'reliability'], description: 'Category' },
              impact:      { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Business impact' },
              effort:      { type: 'string', enum: ['minutes', 'hours', 'days'], description: 'Estimated effort to fix' },
            },
            required: ['title', 'description', 'action', 'category', 'impact', 'effort'],
          },
        },
        quick_wins: {
          type: 'array',
          items: { type: 'string' },
          description: 'Things fixable in under 30 minutes with big visible impact',
        },
      },
      required: ['overall_score', 'summary', 'what_works', 'what_fails', 'verdict', 'user_experience', 'improvements', 'quick_wins'],
    },
  },
];

// OpenAI-compatible format (for Groq)
const GROQ_TOOLS = TOOLS.map(t => ({
  type: 'function' as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// ── Feature test suites ────────────────────────────────────────────────────

type SuiteResult = { endpoint: string; ok: boolean; ms: number; status: number; detail: string };

async function runSuite(suite: string, baseUrl: string): Promise<{ results: SuiteResult[]; summary: string }> {
  const SUITES: Record<string, Array<{ label: string; path: string; method?: string; body?: object; accept?: number[] }>> = {
    market_data: [
      { label: 'BTC spot price',       path: '/api/spot-price?symbol=BTCUSDT' },
      { label: 'ETH spot price',       path: '/api/spot-price?symbol=ETHUSDT' },
      { label: 'SOL spot price',       path: '/api/spot-price?symbol=SOLUSDT' },
      { label: 'BTC klines 1m',        path: '/api/history/klines?symbol=BTCUSDT&interval=1m&limit=5' },
      { label: 'ETH klines 5m',        path: '/api/history/klines?symbol=ETHUSDT&interval=5m&limit=5' },
      { label: 'BTC klines 1h',        path: '/api/history/klines?symbol=BTCUSDT&interval=1h&limit=10' },
    ],
    datafeed: [
      { label: 'Datafeed search',      path: '/api/datafeed?listSymbolsGroup=futures', accept: [200, 400, 401] },
      { label: 'Datafeed credentials', path: '/api/datafeed/credentials', accept: [200, 401] },
      { label: 'DxFeed history',       path: '/api/dxfeed/history?symbol=ES1!&interval=1m&limit=5', accept: [200, 400, 401, 500] },
    ],
    ai_features: [
      { label: 'AI support health',    path: '/api/ai/support', method: 'GET' },
      { label: 'AI analysis',          path: '/api/ai/analysis', method: 'GET', accept: [200, 400, 401] },
      { label: 'AI stream live',       path: '/api/ai/stream/live', method: 'GET', accept: [200, 400, 401] },
    ],
    journal: [
      { label: 'Journal list',         path: '/api/journal', accept: [200, 401] },
      { label: 'Journal analytics',    path: '/api/journal/analytics', accept: [200, 401] },
      { label: 'Journal playbooks',    path: '/api/journal/playbook', accept: [200, 401] },
      { label: 'Daily notes',          path: '/api/journal/daily-notes', accept: [200, 401] },
    ],
    auth: [
      { label: 'Auth profile (no auth)', path: '/api/auth/profile', accept: [401] },
      { label: 'NextAuth endpoint',      path: '/api/auth/providers', accept: [200] },
    ],
    payment: [
      { label: 'Stripe promo validate', path: '/api/stripe/validate-promo', method: 'POST', body: { code: 'TEST' }, accept: [200, 400, 404] },
    ],
    news: [
      { label: 'Economic calendar',    path: '/api/news/calendar', accept: [200, 500] },
      { label: 'ETF SPY price',        path: '/api/market/etf-price?symbol=SPY', accept: [200, 500] },
      { label: 'Options flow',         path: '/api/options-flow', accept: [200, 401, 500] },
    ],
    live_chart_apis: [
      { label: 'BTC price (chart data)',  path: '/api/spot-price?symbol=BTCUSDT' },
      { label: 'ETH klines 4h',            path: '/api/history/klines?symbol=ETHUSDT&interval=4h&limit=10' },
      { label: 'GEX SPX',                 path: '/api/gex-data?symbol=SPX', accept: [200, 500] },
      { label: 'GEX live',                path: '/api/gex-live', accept: [200, 500] },
      { label: 'Volatility surface',      path: '/api/volatility-live', accept: [200, 500] },
      { label: 'Options data BTC',        path: '/api/options-data?symbol=BTC', accept: [200, 500] },
    ],
  };

  const checks = SUITES[suite] ?? [];
  const results: SuiteResult[] = [];

  for (const c of checks) {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}${c.path}`, {
        method: c.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', 'x-user-tester': '1' },
        body: c.body ? JSON.stringify(c.body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - start;
      const accept = c.accept ?? [200];
      const ok = accept.includes(res.status);
      let detail = `HTTP ${res.status} · ${ms}ms`;
      try {
        const text = await res.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed.error) detail += ` — ${parsed.error}`;
        else if (parsed.price) detail += ` — prix: $${parsed.price}`;
        else if (Array.isArray(parsed) && parsed.length > 0) detail += ` — ${parsed.length} items`;
        else if (parsed.candles && Array.isArray(parsed.candles)) detail += ` — ${(parsed.candles as unknown[]).length} bougies`;
      } catch { /* skip */ }
      results.push({ endpoint: c.label, ok, ms, status: res.status, detail });
    } catch (e) {
      results.push({ endpoint: c.label, ok: false, ms: Date.now() - start, status: 0, detail: e instanceof Error ? e.message : 'Timeout' });
    }
  }

  const pass = results.filter(r => r.ok).length;
  const total = results.length;
  const summary = `Suite "${suite}": ${pass}/${total} tests passés.\n` +
    results.map(r => `  ${r.ok ? '✅' : '❌'} ${r.endpoint} — ${r.detail}`).join('\n');

  return { results, summary };
}

// ── Page content inspector ─────────────────────────────────────────────────

async function toolInspectPage(input: { path: string; reason: string }, baseUrl: string): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${input.path}`, {
      headers: { 'x-user-tester': '1', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    const elapsed = Date.now() - start;
    const html = await res.text().catch(() => '');

    // Extract useful info from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? 'No title';

    const h1s = [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1].trim()).slice(0, 5);
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1].trim()).slice(0, 8);

    // Look for common UI signals
    const hasLoginForm  = /type=["']password["']|login|signin/i.test(html);
    const hasChart      = /LiveChartPro|tradingview|chart-container/i.test(html);
    const hasPricing    = /pricing|plan|subscribe|€|per month/i.test(html);
    const hasError      = /error|404|not found|something went wrong/i.test(html.slice(0, 2000));
    const isNextPage    = /__NEXT_DATA__|_next\/static/i.test(html);

    // Extract nav links
    const navLinks = [...html.matchAll(/href=["'](\/(live|dashboard|journal|pricing|gex|volatility|orderflow|liquidity)[^"']*)/gi)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);

    return JSON.stringify({
      ok: res.ok,
      status: res.status,
      responseTime: elapsed,
      title,
      headings: { h1: h1s, h2: h2s },
      signals: { hasLoginForm, hasChart, hasPricing, hasError, isNextPage },
      navLinks,
      contentSize: html.length,
      summary: `${title} — ${res.status} · ${elapsed}ms · ${h1s.length} H1s · ${h2s.length} H2s`,
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Timeout', responseTime: Date.now() - start });
  }
}

// ── Individual tool implementations ────────────────────────────────────────

async function toolNavigate(input: { path: string; reason: string }, baseUrl: string): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${input.path}`, {
      headers: { 'x-user-tester': '1' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const elapsed = Date.now() - start;
    const body = await res.text().catch(() => '');
    return JSON.stringify({
      status: res.status,
      ok: res.ok || [301, 302, 307].includes(res.status),
      responseTime: elapsed,
      contentSize: body.length,
      hasContent: body.length > 500,
      isNextApp: /_next\/static|__NEXT_DATA__/i.test(body),
      summary: res.ok
        ? `Page chargée en ${elapsed}ms (${(body.length / 1024).toFixed(1)} Ko)`
        : `HTTP ${res.status} en ${elapsed}ms`,
    });
  } catch (e) {
    return JSON.stringify({ status: 0, ok: false, error: e instanceof Error ? e.message : 'Timeout', responseTime: Date.now() - start });
  }
}

async function toolCallApi(input: { endpoint: string; method: 'GET' | 'POST'; body?: object; reason: string }, baseUrl: string): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${input.endpoint}`, {
      method: input.method,
      headers: { 'Content-Type': 'application/json', 'x-user-tester': '1' },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const elapsed = Date.now() - start;
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return JSON.stringify({ status: res.status, ok: res.ok, responseTime: elapsed, data: parsed ?? text.slice(0, 500), summary: `HTTP ${res.status} en ${elapsed}ms` });
  } catch (e) {
    return JSON.stringify({ status: 0, ok: false, error: e instanceof Error ? e.message : 'Timeout', responseTime: Date.now() - start });
  }
}

async function toolChatWithSupport(input: { message: string; reason: string }, baseUrl: string): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/ai/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-tester': '1' },
      body: JSON.stringify({ message: input.message, history: [] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return JSON.stringify({ ok: false, status: res.status, error: (err as { error?: string }).error ?? `HTTP ${res.status}`, responseTime: Date.now() - start });
    }
    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let reply = ''; let tokens = 0;
    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break outer;
        try {
          const ev = JSON.parse(raw);
          if (ev.token) { reply += ev.token; tokens++; }
          if (reply.length >= 500) break outer;
        } catch { /* skip */ }
      }
    }
    reader.cancel().catch(() => {});
    return JSON.stringify({
      ok: true,
      responseTime: Date.now() - start,
      tokensReceived: tokens,
      reply: reply.slice(0, 500),
      quality: tokens > 20 ? 'good' : tokens > 5 ? 'partial' : 'no_response',
      summary: tokens > 0 ? `IA a répondu en ${Date.now() - start}ms: "${reply.slice(0, 100)}..."` : 'Aucune réponse reçue',
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Erreur', responseTime: Date.now() - start });
  }
}

async function toolGetMarketData(input: { symbol: string; dataType: 'price' | 'klines' | 'gex' | 'volatility' | 'options' | 'news' }, baseUrl: string): Promise<string> {
  const start = Date.now();
  const endpoints: Record<string, string> = {
    price:      `/api/spot-price?symbol=${input.symbol}`,
    klines:     `/api/history/klines?symbol=${input.symbol}&interval=1m&limit=10`,
    gex:        `/api/gex-data?symbol=${input.symbol}`,
    volatility: `/api/volatility-live`,
    options:    `/api/options-data?symbol=${input.symbol}`,
    news:       `/api/news/calendar`,
  };
  try {
    const res = await fetch(`${baseUrl}${endpoints[input.dataType]}`, { headers: { 'x-user-tester': '1' }, signal: AbortSignal.timeout(8000) });
    const elapsed = Date.now() - start;
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* skip */ }
    let summary = `HTTP ${res.status} en ${elapsed}ms`;
    if (input.dataType === 'price' && parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      const price = p.price ?? p.lastPrice ?? p.c;
      if (price) summary = `Prix ${input.symbol}: $${Number(price).toLocaleString('fr-FR')} (${elapsed}ms)`;
    } else if (input.dataType === 'klines' && parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      const candles = Array.isArray(p.candles) ? p.candles : (Array.isArray(parsed) ? parsed : []);
      summary = `${candles.length} bougies reçues pour ${input.symbol} (${elapsed}ms)`;
    }
    return JSON.stringify({ ok: res.ok, status: res.status, responseTime: elapsed, data: parsed ?? text.slice(0, 300), summary });
  } catch (e) {
    return JSON.stringify({ ok: false, error: e instanceof Error ? e.message : 'Erreur', responseTime: Date.now() - start });
  }
}

async function toolLogUiTest(input: {
  feature: string;
  steps: string[];
  expected: string;
  status: string;
  api_verified?: boolean;
}): Promise<string> {
  return JSON.stringify({
    logged: true,
    feature: input.feature,
    step_count: input.steps.length,
    status: input.status,
    api_verified: input.api_verified ?? false,
    summary: `Test UI enregistré: "${input.feature}" (${input.steps.length} étapes, statut: ${input.status})`,
  });
}

async function executeTool(name: string, input: Record<string, unknown>, baseUrl: string): Promise<string> {
  if (name === 'navigate')          return toolNavigate(input as { path: string; reason: string }, baseUrl);
  if (name === 'inspect_page')      return toolInspectPage(input as { path: string; reason: string }, baseUrl);
  if (name === 'call_api')          return toolCallApi(input as { endpoint: string; method: 'GET' | 'POST'; body?: object; reason: string }, baseUrl);
  if (name === 'chat_with_support') return toolChatWithSupport(input as { message: string; reason: string }, baseUrl);
  if (name === 'get_market_data')   return toolGetMarketData(input as Parameters<typeof toolGetMarketData>[0], baseUrl);
  if (name === 'log_ui_test')       return toolLogUiTest(input as Parameters<typeof toolLogUiTest>[0]);
  if (name === 'run_feature_suite') {
    const { results, summary } = await runSuite(input.suite as string, baseUrl);
    const pass = results.filter(r => r.ok).length;
    return JSON.stringify({ ok: pass === results.length, passed: pass, total: results.length, results, summary });
  }
  if (name === 'write_report')      return JSON.stringify({ received: true });
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ── Groq agentic loop ──────────────────────────────────────────────────────

type GroqMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

interface GroqToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface GroqChoice {
  message: { role: string; content: string | null; tool_calls?: GroqToolCall[] };
  finish_reason: string;
}

async function runGroqLoop(
  baseUrl: string,
  systemPrompt: string,
  send: (p: object) => void,
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GROQ_API_KEY!;
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Lance le test utilisateur COMPLET de la plateforme OrderFlow (${baseUrl}).

Commence par récupérer l'inventaire complet des features via GET /api/ai/user-tester/inventory pour connaître toutes les pages et outils disponibles.

Ensuite teste méthodiquement:
1. Les pages principales (/, /live, /pricing, /journal, /gex)
2. Les données de marché avec run_feature_suite "market_data" et "live_chart_apis"
3. Le chat IA support avec une vraie question sur les outils
4. La datafeed avec run_feature_suite "datafeed"
5. Les features du journal et news
6. Documente chaque outil de dessin de la chart avec log_ui_test

Écris un bilan COMPLET et détaillé à la fin.` },
  ];

  let finalReport: Record<string, unknown> | null = null;

  send({ type: 'thinking', text: `🤖 Agent Groq (Llama 3.3 70B) démarré — test complet de ${baseUrl}` });

  for (let i = 0; i < 18 && !finalReport; i++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: GROQ_TOOLS,
        tool_choice: 'auto',
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json() as { choices: GroqChoice[] };
    const choice = data.choices[0];
    const msg = choice.message;

    if (msg.content?.trim()) send({ type: 'thinking', text: msg.content });

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) break;

    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });

    for (const tc of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tc.function.arguments); } catch { /* keep empty */ }

      const toolName = tc.function.name;
      send({ type: 'action', tool: toolName, input, id: tc.id });

      if (toolName === 'write_report') {
        finalReport = input;
        send({ type: 'report', report: finalReport });
        messages.push({ role: 'tool', content: JSON.stringify({ received: true }), tool_call_id: tc.id });
        break;
      }

      const resultText = await executeTool(toolName, input, baseUrl);

      try {
        const parsed = JSON.parse(resultText) as Record<string, unknown>;
        send({ type: 'result', tool: toolName, id: tc.id, detail: String(parsed.summary ?? parsed.error ?? resultText.slice(0, 120)), status: parsed.ok !== false ? 'ok' : 'fail' });
      } catch {
        send({ type: 'result', tool: toolName, id: tc.id, detail: resultText.slice(0, 120), status: 'ok' });
      }

      messages.push({ role: 'tool', content: resultText, tool_call_id: tc.id });
    }

    if (finalReport || choice.finish_reason === 'stop') break;
  }

  if (!finalReport) {
    send({ type: 'thinking', text: '⏱️ Génération du rapport final…' });
    messages.push({ role: 'user', content: 'Tu as suffisamment testé. Appelle maintenant write_report avec un bilan COMPLET et détaillé en français de toutes les features testées.' });

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: GROQ_TOOLS,
        tool_choice: { type: 'function', function: { name: 'write_report' } },
        max_tokens: 3000,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const data = await res.json() as { choices: GroqChoice[] };
      const tc = data.choices[0]?.message?.tool_calls?.[0];
      if (tc?.function.name === 'write_report') {
        try { finalReport = JSON.parse(tc.function.arguments); } catch { /* skip */ }
        if (finalReport) send({ type: 'report', report: finalReport });
      }
    }
  }

  return finalReport;
}

// ── Anthropic agentic loop ─────────────────────────────────────────────────

async function runAnthropicLoop(
  anthropic: Anthropic,
  baseUrl: string,
  systemPrompt: string,
  send: (p: object) => void,
): Promise<Record<string, unknown> | null> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Lance le test utilisateur COMPLET de la plateforme OrderFlow (${baseUrl}).

Commence par récupérer l'inventaire via GET /api/ai/user-tester/inventory, puis teste méthodiquement:
1. Pages principales
2. run_feature_suite pour "market_data", "live_chart_apis", "datafeed", "ai_features"
3. Chat IA support avec une vraie question
4. log_ui_test pour les outils de dessin principaux de la chart
5. Bilan final complet.`,
    },
  ];

  let finalReport: Record<string, unknown> | null = null;

  send({ type: 'thinking', text: `🤖 Agent Claude démarré — test complet de ${baseUrl}` });

  for (let iter = 0; iter < 18 && !finalReport; iter++) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    const toolUses: Anthropic.ToolUseBlock[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) send({ type: 'thinking', text: block.text });
      if (block.type === 'tool_use') toolUses.push(block);
    }

    if (toolUses.length === 0) break;

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;
      send({ type: 'action', tool: toolUse.name, input, id: toolUse.id });

      if (toolUse.name === 'write_report') {
        finalReport = input;
        send({ type: 'report', report: finalReport });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ received: true }) });
        break;
      }

      const resultText = await executeTool(toolUse.name, input, baseUrl);

      try {
        const parsed = JSON.parse(resultText) as Record<string, unknown>;
        send({ type: 'result', tool: toolUse.name, id: toolUse.id, detail: String(parsed.summary ?? parsed.error ?? resultText.slice(0, 120)), status: parsed.ok !== false ? 'ok' : 'fail' });
      } catch {
        send({ type: 'result', tool: toolUse.name, id: toolUse.id, detail: resultText.slice(0, 120), status: 'ok' });
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultText });
    }

    if (finalReport) break;

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    if (response.stop_reason === 'end_turn') break;
  }

  if (!finalReport) {
    send({ type: 'thinking', text: '⏱️ Génération du rapport final…' });
    const finalResp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: systemPrompt,
      tools: TOOLS,
      messages: [...messages, { role: 'user', content: 'Maintenant appelle write_report avec un bilan complet et détaillé de toutes les features testées.' }],
    });
    for (const block of finalResp.content) {
      if (block.type === 'tool_use' && block.name === 'write_report') {
        finalReport = block.input as Record<string, unknown>;
        send({ type: 'report', report: finalReport });
      }
    }
  }

  return finalReport;
}

// ── Fallback: HTTP-only tests ──────────────────────────────────────────────

async function runFallbackTests(req: NextRequest, encoder: TextEncoder): Promise<Response> {
  const baseUrl = getBaseUrl(req);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (p: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(p)}\n\n`));

      send({ type: 'thinking', text: '⚠️ Mode dégradé — Aucune clé IA configurée. Tests HTTP en cours…' });

      const suites = ['market_data', 'live_chart_apis', 'datafeed', 'ai_features', 'auth', 'news'];
      const allResults: SuiteResult[] = [];

      for (const suite of suites) {
        send({ type: 'action', tool: 'run_feature_suite', input: { suite }, id: `fallback_${suite}` });
        const { results, summary } = await runSuite(suite, baseUrl);
        allResults.push(...results);
        const pass = results.filter(r => r.ok).length;
        send({ type: 'result', tool: 'run_feature_suite', id: `fallback_${suite}`, status: pass === results.length ? 'ok' : 'fail', detail: `${suite}: ${pass}/${results.length} ✓` });
        // small delay to not blast the UI
        await new Promise(r => setTimeout(r, 100));
      }

      const pass = allResults.filter(r => r.ok).length;
      const score = Math.round((pass / allResults.length) * 100);

      const report = {
        overall_score: score,
        summary: `Tests HTTP de base : ${pass}/${allResults.length} endpoints opérationnels. Analyse IA non disponible (GROQ_API_KEY manquante).`,
        what_works: allResults.filter(r => r.ok).map(r => `${r.endpoint} (${r.ms}ms)`),
        what_fails: allResults.filter(r => !r.ok).map(r => `${r.endpoint} — HTTP ${r.status}`),
        recommendations: [
          'Ajouter GROQ_API_KEY dans Vercel → Settings → Environment Variables (gratuit sur console.groq.com)',
          'Redéployer après ajout de la variable pour activer l\'audit IA complet avec test des chart tools.',
        ],
        user_experience: `## Mode dégradé\n\nBilan généré sans IA.\n\n${allResults.map(r => `- ${r.ok ? '✅' : '❌'} **${r.endpoint}** — ${r.detail}`).join('\n')}`,
        verdict: `${score >= 80 ? 'Infrastructure OK' : score >= 50 ? 'Partiellement opérationnel' : 'Problèmes détectés'} — Activez GROQ_API_KEY pour l'audit IA complet`,
      };

      send({ type: 'report', report });
      send({ type: 'done', score });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

// ── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un CTO / consultant senior en product & engineering qui audite la plateforme de trading OrderFlow. Tu combines:
- Le regard d'un trader professionnel qui utilise la plateforme pour la première fois
- L'expertise d'un développeur senior qui identifie les causes racines des problèmes
- La vision d'un consultant produit qui priorise par impact/effort

## Ton objectif
Produire un audit actionable qui aide le développeur à AMÉLIORER CONCRÈTEMENT la plateforme. Pas juste "ça marche / ça marche pas" — mais "voici exactement quoi changer, dans quel fichier, pourquoi, et dans quel ordre".

## Méthodologie

### Phase 1 — Inventaire (OBLIGATOIRE)
Appelle GET /api/ai/user-tester/inventory pour obtenir la carte complète de la plateforme.

### Phase 2 — Tests infrastructure
- run_feature_suite "market_data" : données BTC/ETH/SOL en temps réel
- run_feature_suite "live_chart_apis" : GEX, volatilité, options
- run_feature_suite "datafeed" : compatibilité TradingView
- run_feature_suite "ai_features" : santé des AIs

### Phase 3 — Pages clés
- inspect_page "/" : landing page, message marketing, appel à l'action
- navigate "/pricing" : clarté des offres, conversion
- navigate "/live" : chargement du chart principal
- navigate "/journal" : journal de trading
- navigate "/gex" : GEX dashboard

### Phase 4 — Test IA Support
chat_with_support avec 2 questions:
1. "Comment utiliser les outils de dessin sur le chart live ?" → teste la qualité des réponses
2. "Qu'est-ce que le footprint chart et comment l'interpréter ?" → teste la connaissance produit

### Phase 5 — Documentation outils chart (log_ui_test)
Documente le test de chaque outil avec les étapes précises:
- Trend Line (T) : 2 clics pour définir la droite
- Fibonacci (F) : clic bas → clic haut d'une swing
- Long/Short Position (L/S) : TP, SL, taille de position
- Rectangle (B) : zone de support/résistance
- Settings panel : engrenage → onglets apparence/volume/indicateurs
- Quick Trade Bar : BUY/SELL market/limit/stop + TP/SL
- Volume Profile : POC/VAH/VAL visible sur le côté droit

### Phase 6 — Rapport final
Appelle write_report avec:

**improvements** (le plus important) — Pour chaque problème identifié, donne:
- Le titre du problème
- La description précise (cause racine si possible)
- L'ACTION EXACTE : "Dans components/trading/QuickTradeBar.tsx ligne ~45, changer X par Y" ou "Ajouter GROQ_API_KEY dans Vercel env vars" ou "Créer un endpoint /api/data/X qui fait Y"
- La catégorie (bug/performance/ux/feature/security/reliability)
- L'impact (critical/high/medium/low)
- L'effort (minutes/hours/days)

**quick_wins** — Les 3-5 choses qui prennent < 30min et ont le plus d'impact visuel/fonctionnel

**user_experience** — Narrative immersive (600+ mots) : "En tant que trader qui découvre la plateforme pour la première fois, voici ce que j'ai vécu..."

## Principes d'amélioration

Pour chaque problème, pense en termes de:
1. **Fiabilité** : l'endpoint répond toujours ? bon timeout ? gestion d'erreur ?
2. **Performance** : temps de réponse acceptable ? mise en cache ?
3. **UX** : intuitif pour un nouveau trader ? feedback visuel clair ?
4. **Features manquantes** : qu'est-ce qu'un trader pro s'attendrait à trouver ?
5. **Comparaison concurrents** : TradingView, ATAS, Bookmap font-ils mieux ?

## Règles
- Au minimum 12 actions avant write_report
- Toujours en français
- Sois CONCRET : un développeur doit pouvoir implémenter ta recommandation sans te recontacter
- Note explicitement quand tu inférres vs quand tu as vérifié via API
- Score sur 100 : sois honnête, pas généreux`;

// ── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const baseUrl = getBaseUrl(req);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  const hasGroq = !!process.env.GROQ_API_KEY;

  if (!anthropic && !hasGroq) {
    return runFallbackTests(req, encoder);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        let finalReport: Record<string, unknown> | null = null;

        if (anthropic) {
          finalReport = await runAnthropicLoop(anthropic, baseUrl, SYSTEM_PROMPT, send);
        } else if (hasGroq) {
          finalReport = await runGroqLoop(baseUrl, SYSTEM_PROMPT, send);
        }

        const score = typeof finalReport?.overall_score === 'number' ? finalReport.overall_score : 50;
        send({ type: 'done', score });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue' });
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

export async function GET() {
  const backend = process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GROQ_API_KEY ? 'groq' : 'fallback';
  return Response.json({
    status: 'ok',
    agent: 'autonomous-user-tester',
    backend,
    tools: TOOLS.map(t => t.name),
    tool_count: TOOLS.length,
  });
}
