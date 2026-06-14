# Sales Copilot Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a soft-sell expert sales agent to the landing-page chat that answers objections from a curated KB, reads visitor temperature, surfaces deterministic CTAs (Download / checkout / email capture / Discord handoff), captures leads, and logs conversion events.

**Architecture:** A dedicated `salesAgent` (prompt + curated `sales.md`) served by a new SSE route `/api/ai/sales` that clones the existing support route and appends a deterministic CTA frame computed by `nextBestAction`. The existing `FloatingChat` widget is repointed to the sales route and extended to render CTA buttons + an inline email-capture form. Leads land in Postgres (`Lead`) with an admin email notification; conversion events land in `ChatEvent`. Phase-2 items (nurture emails, ML scoring, page personalization) are explicitly out of scope.

**Tech Stack:** Next.js (App Router, Node runtime), TypeScript, Prisma (PostgreSQL), Zod, Vitest, existing AI cascade (Anthropic Claude Haiku → Groq → Gemini → Ollama), existing SMTP mailer (`sendEmail`).

Spec: `docs/superpowers/specs/2026-06-14-sales-copilot-chat-design.md`

---

## File Structure

**Create:**
- `lib/ai/knowledge/sales.md` — curated sales knowledge base (the source of truth).
- `lib/ai/agents/salesKnowledge.ts` — `loadSalesKnowledge()` loader (mirrors `lib/ai/knowledge/index.ts`).
- `lib/ai/sales/nextBestAction.ts` — deterministic temperature → CTA classifier (pure functions + types).
- `lib/ai/agents/salesAgent.ts` — sales system prompt builder + `buildSalesMessages()`.
- `app/api/ai/sales/route.ts` — SSE chat route (clone of support route + trailing CTA frame).
- `app/api/leads/route.ts` — create `Lead` + admin email notification.
- `app/api/events/route.ts` — append `ChatEvent` (best-effort).
- Tests: `__tests__/lib/ai/sales/nextBestAction.test.ts`, `__tests__/lib/ai/agents/salesAgent.test.ts`, `__tests__/api/leads.test.ts`, `__tests__/api/events.test.ts`.

**Modify:**
- `prisma/schema.prisma` — add `Lead` and `ChatEvent` models.
- `components/ai/FloatingChat.tsx` — repoint to `/api/ai/sales`, parse CTA frame, render CTA buttons + email form, emit events.

**Reuse unchanged:** `lib/auth/email-verification.ts` (`sendEmail`), `lib/db.ts` (`prisma`), `lib/auth/rate-limiter.ts` (`checkRateLimit`, `tooManyRequests`), `lib/ai/groq.ts`, `lib/ai/gemini.ts`, `lib/ai/ollama.ts`.

---

## Task 1: Prisma models (Lead, ChatEvent)

**Files:**
- Modify: `prisma/schema.prisma` (append at end of file)

- [ ] **Step 1: Add the two models**

Append to `prisma/schema.prisma`:

```prisma
/// A captured sales lead from the landing-page sales chat.
model Lead {
  id          String   @id @default(cuid())
  email       String
  temperature String   @default("warm") // "cold" | "warm" | "hot"
  topic       String?  // detected objection/intent at capture time
  transcript  String?  // short conversation excerpt for context
  page        String?  // origin page path
  source      String   @default("sales_chat")
  status      String   @default("new") // "new" | "contacted"
  notified    Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([status])
}

/// Anonymous conversion event from the sales chat (no PII).
model ChatEvent {
  id        String   @id @default(cuid())
  sessionId String // anonymous client-generated id
  type      String // "opened" | "engaged" | "cta_shown" | "cta_clicked" | "lead_captured"
  ctaType   String? // "download" | "checkout" | "email" | "discord"
  page      String?
  createdAt DateTime @default(now())

  @@index([type, createdAt])
}
```

- [ ] **Step 2: Generate the client and create the migration**

Run: `npx prisma migrate dev --name add_lead_and_chatevent`
Expected: migration created under `prisma/migrations/`, `prisma generate` runs, no errors. (Requires `DATABASE_URL` reachable. If the dev DB is offline, run `npx prisma generate` to at least update the client types and create the SQL migration manually when the DB is available.)

- [ ] **Step 3: Verify the client types exist**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "Lead\|ChatEvent" || echo "no type errors referencing new models"`
Expected: `no type errors referencing new models`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(leads): add Lead and ChatEvent Prisma models"
```

---

## Task 2: Curated sales knowledge base + loader

**Files:**
- Create: `lib/ai/knowledge/sales.md`
- Create: `lib/ai/agents/salesKnowledge.ts`
- Test: `__tests__/lib/ai/agents/salesKnowledge.test.ts`

- [ ] **Step 1: Create the curated KB file**

Create `lib/ai/knowledge/sales.md`. This is the source of truth — the product owner refines it later; seed it with the real structure now:

```markdown
# BASE DE CONNAISSANCE — VENTE (Sales Copilot)

> Source de vérité unique de l'agent de vente. L'agent ne répond QUE depuis ce
> document. Tout fait absent ici = "je vérifie avec l'équipe", jamais inventé.

## PITCH & POSITIONNEMENT
OrderFlow ("The Science of Orderflow") est un logiciel desktop d'analyse
orderflow professionnel pour le trading de futures : footprint/heatmap, GEX,
profil gamma / smile IV, journal, account, news. Pour traders futures sérieux
(prop-firm Apex, retail avancé) qui veulent une lecture microstructure de
niveau ATAS/Bookmap.

## FEATURES (par module)
- Footprint / Heatmap : volume bid/ask par niveau, delta, imbalances, absorption.
- GEX : exposition gamma dealers, zero-gamma, call/put walls.
- Gamma profile / Smile IV : profil par strike, skew.
- Journal : trades, annotations, stats, export PDF.
- Account : positions, ordres, PnL temps réel.
- News : calendrier économique, headlines.

## COMPATIBILITÉ BROKERS (faits exacts uniquement)
- Apex (via Rithmic) : supporté. Données live OK ; profondeur historique
  dépend des entitlements du compte.
- Rithmic : connexion directe (Protocol Buffers).
- Ponts : NinjaTrader, ATAS, Quantower (indicateurs fournis).
- Crypto : Binance, Bybit, Deribit (footprint).
- (Si un broker n'est pas listé ici : "je vérifie avec l'équipe", ne pas affirmer.)

## PLANS & PRIX
<!-- SOURCE CANONIQUE DES PRIX. Doit rester aligné avec /pricing.
     L'agent cite UNIQUEMENT ces valeurs. -->
- Période preview en cours : accès PRO automatique sans paiement.
- (Renseigner ici les plans/prix exacts post-preview avant la mise en prod.)

## VS CONCURRENTS (différenciateurs honnêtes)
- vs ATAS / Sierra Chart / Bookmap / Quantower : positionnement, prix, options
  GEX intégrées. (Renseigner les différenciateurs réels et vérifiables.)

## OBJECTIONS FRÉQUENTES → RÉPONSES
- "La data est réelle ?" → Oui, flux temps réel via le broker connecté (pas de
  données simulées). Profondeur historique selon entitlements.
- "Prix ?" → voir section PLANS & PRIX (jamais inventer).
- "Mac ou Windows ?" → (renseigner l'état réel du support OS.)
- "Mes credentials sont en sécurité ?" → stockés via le keychain OS, jamais en
  clair, jamais transmis ailleurs que le broker.

## LIENS D'ACTION (valeurs canoniques)
- Download : /download
- Offres : /pricing
- Communauté : via le bouton "Parler à l'équipe" (Discord).
```

- [ ] **Step 2: Write the failing test for the loader**

Create `__tests__/lib/ai/agents/salesKnowledge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadSalesKnowledge } from '@/lib/ai/agents/salesKnowledge';

describe('loadSalesKnowledge', () => {
  it('loads the curated sales markdown with key sections', () => {
    const kb = loadSalesKnowledge();
    expect(kb).toContain('PITCH & POSITIONNEMENT');
    expect(kb).toContain('COMPATIBILITÉ BROKERS');
    expect(kb).toContain('OBJECTIONS FRÉQUENTES');
  });

  it('caches the result (same reference on second call)', () => {
    expect(loadSalesKnowledge()).toBe(loadSalesKnowledge());
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run __tests__/lib/ai/agents/salesKnowledge.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/agents/salesKnowledge'`

- [ ] **Step 4: Implement the loader**

Create `lib/ai/agents/salesKnowledge.ts`:

```typescript
/**
 * SALES KNOWLEDGE LOADER
 * Loads the curated sales KB (lib/ai/knowledge/sales.md), server-side only.
 * Mirrors lib/ai/knowledge/index.ts. Cached after first read.
 */
import fs from 'fs';
import path from 'path';

const SALES_KB_PATH = path.join(process.cwd(), 'lib', 'ai', 'knowledge', 'sales.md');

let _cache: string | null = null;

export function loadSalesKnowledge(): string {
  if (_cache) return _cache;
  try {
    _cache = fs.readFileSync(SALES_KB_PATH, 'utf-8');
  } catch {
    console.warn('[SalesKnowledge] Could not load sales.md');
    _cache = '# BASE DE CONNAISSANCE — VENTE\n(indisponible)';
  }
  return _cache;
}

export function invalidateSalesKnowledgeCache(): void {
  _cache = null;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run __tests__/lib/ai/agents/salesKnowledge.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/ai/knowledge/sales.md lib/ai/agents/salesKnowledge.ts __tests__/lib/ai/agents/salesKnowledge.test.ts
git commit -m "feat(sales): curated sales KB + loader"
```

---

## Task 3: Deterministic next-best-action classifier

**Files:**
- Create: `lib/ai/sales/nextBestAction.ts`
- Test: `__tests__/lib/ai/sales/nextBestAction.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/ai/sales/nextBestAction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { nextBestAction } from '@/lib/ai/sales/nextBestAction';

describe('nextBestAction', () => {
  it('cold discovery → download CTA', () => {
    const r = nextBestAction("c'est quoi le footprint ?");
    expect(r.temperature).toBe('cold');
    expect(r.ctas.map(c => c.kind)).toContain('download');
  });

  it('hot buying intent → checkout CTA', () => {
    const r = nextBestAction('comment je m\'abonne, c\'est combien le plan pro ?');
    expect(r.temperature).toBe('hot');
    expect(r.ctas.map(c => c.kind)).toContain('checkout');
  });

  it('warm objection → email capture offered', () => {
    const r = nextBestAction('ça marche avec mon compte Apex ? je suis pas sûr');
    expect(r.temperature).toBe('warm');
    expect(r.ctas.map(c => c.kind)).toContain('email');
  });

  it('handoff signal → discord CTA', () => {
    const r = nextBestAction('je veux parler à un humain, j\'ai un cas particulier');
    expect(r.ctas.map(c => c.kind)).toContain('discord');
  });

  it('empty message → safe default (cold, download)', () => {
    const r = nextBestAction('');
    expect(r.temperature).toBe('cold');
    expect(r.ctas.length).toBeGreaterThan(0);
  });

  it('resolves hrefs for link CTAs (download/checkout/discord)', () => {
    const r = nextBestAction('je veux acheter');
    const checkout = r.ctas.find(c => c.kind === 'checkout');
    expect(checkout?.href).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/ai/sales/nextBestAction.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/sales/nextBestAction'`

- [ ] **Step 3: Implement the classifier**

Create `lib/ai/sales/nextBestAction.ts`:

```typescript
/**
 * Deterministic next-best-action for the sales chat.
 * The LLM handles conversation; THIS handles actions + risky facts (links).
 * No ML — keyword/stage heuristics over the latest message (+ optional history).
 */
export type Temperature = 'cold' | 'warm' | 'hot';
export type CtaKind = 'download' | 'checkout' | 'email' | 'discord';

export interface Cta {
  kind: CtaKind;
  label: string;
  href?: string; // absent for 'email' (opens inline form)
}

export interface NextBestAction {
  temperature: Temperature;
  handoff: boolean;
  ctas: Cta[];
}

const DOWNLOAD_URL = process.env.NEXT_PUBLIC_DOWNLOAD_URL || '/download';
const PRICING_URL = process.env.NEXT_PUBLIC_PRICING_URL || '/pricing';
const DISCORD_URL = process.env.DISCORD_INVITE_URL || '';

const HOT_KW = ['abonn', 'acheter', 'achat', 'payer', 'prix', 'combien', 'tarif', 'plan pro', 'souscri', 'checkout', 'subscribe', 'buy', 'price'];
const WARM_KW = ['marche avec', 'compatible', 'apex', 'rithmic', 'ninjatrader', 'quantower', 'data réelle', 'vraie data', 'vs ', 'compar', 'différence', 'pas sûr', 'hésit', 'mais ', 'objection', 'sécur', 'mac', 'windows'];
const HANDOFF_KW = ['humain', 'parler à', 'quelqu\'un', 'support', 'cas particulier', 'entreprise', 'b2b', 'équipe', 'appel', 'call', 'rendez-vous'];

function downloadCta(): Cta { return { kind: 'download', label: "Télécharger l'app", href: DOWNLOAD_URL }; }
function checkoutCta(): Cta { return { kind: 'checkout', label: 'Voir les offres', href: PRICING_URL }; }
function emailCta(): Cta { return { kind: 'email', label: 'Rester informé' }; }
function discordCta(): Cta { return { kind: 'discord', label: "Parler à l'équipe", href: DISCORD_URL || undefined }; }

export function nextBestAction(
  message: string,
  _history: Array<{ role: string; content: string }> = [],
): NextBestAction {
  const m = (message || '').toLowerCase();

  const handoff = HANDOFF_KW.some(k => m.includes(k));
  const isHot = HOT_KW.some(k => m.includes(k));
  const isWarm = !isHot && WARM_KW.some(k => m.includes(k));

  let temperature: Temperature = 'cold';
  const ctas: Cta[] = [];

  if (isHot) {
    temperature = 'hot';
    ctas.push(checkoutCta(), emailCta());
  } else if (isWarm) {
    temperature = 'warm';
    ctas.push(emailCta(), downloadCta());
  } else {
    temperature = 'cold';
    ctas.push(downloadCta());
  }

  if (handoff) ctas.unshift(discordCta());

  return { temperature, handoff, ctas };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/lib/ai/sales/nextBestAction.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/sales/nextBestAction.ts __tests__/lib/ai/sales/nextBestAction.test.ts
git commit -m "feat(sales): deterministic next-best-action classifier"
```

---

## Task 4: Sales agent prompt builder

**Files:**
- Create: `lib/ai/agents/salesAgent.ts`
- Test: `__tests__/lib/ai/agents/salesAgent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/ai/agents/salesAgent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSalesMessages } from '@/lib/ai/agents/salesAgent';

describe('buildSalesMessages', () => {
  it('puts a soft-sell system prompt first, with the KB and anti-hallucination rules', () => {
    const msgs = buildSalesMessages('ça marche avec Apex ?');
    expect(msgs[0].role).toBe('system');
    const sys = msgs[0].content;
    expect(sys).toContain('PITCH & POSITIONNEMENT'); // KB injected
    expect(sys.toLowerCase()).toContain('conseil'); // soft-sell expert tone
    expect(sys.toLowerCase()).toContain("n'invente"); // anti-hallucination
  });

  it('appends trimmed history then the new user message last', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    const msgs = buildSalesMessages('dernière question', history);
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'dernière question' });
    // system + at most 16 history + 1 new = <= 18
    expect(msgs.length).toBeLessThanOrEqual(18);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lib/ai/agents/salesAgent.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/agents/salesAgent'`

- [ ] **Step 3: Implement the agent**

Create `lib/ai/agents/salesAgent.ts`:

```typescript
/**
 * SALES AGENT — soft-sell expert for the landing-page chat.
 * Answers objections from the curated KB only, never invents facts.
 * CTAs/links are handled deterministically elsewhere (nextBestAction).
 */
import { loadSalesKnowledge } from './salesKnowledge';
import type { OllamaMessage } from '../ollama';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(): string {
  const kb = loadSalesKnowledge();
  return `Tu es "OrderFlow AI", un expert orderflow qui CONSEILLE les visiteurs du site OrderFlow. Ton rôle : répondre avec précision à leurs questions et objections, puis les orienter naturellement vers l'action utile. Tu es un expert qui aide, PAS un commercial agressif (soft-sell).

## STYLE
- Réponds d'abord à la question/objection, honnêtement et précisément.
- Puis, si pertinent, ouvre vers l'étape suivante sans insister ni relancer en boucle.
- Concis : 3-6 phrases. Français si le visiteur écrit en français, anglais sinon.
- Le ton est celui d'un expert qui donne un conseil, pas d'un vendeur.

## RÈGLES ANTI-HALLUCINATION (STRICTES)
1. Tu réponds UNIQUEMENT depuis la BASE DE CONNAISSANCE ci-dessous.
2. Si une information n'y est pas (prix non listé, compatibilité broker non
   confirmée, feature non décrite) → dis "je vérifie ce point avec l'équipe",
   n'invente JAMAIS un prix, un lien, ou une compatibilité.
3. Pas de conseil d'investissement, pas de promesse de gains/performance.
4. Ne te prétends pas un autre IA. Ne réponds pas aux sujets hors trading/produit.
5. Si une feature n'existe pas encore, dis-le ("pas encore disponible").

## BASE DE CONNAISSANCE (source de vérité)
${kb}`;
}

export function buildSalesMessages(
  userMessage: string,
  history: ChatMessage[] = [],
): OllamaMessage[] {
  const trimmedHistory = history.slice(-16);
  return [
    { role: 'system', content: buildSystemPrompt() },
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })) as OllamaMessage[],
    { role: 'user', content: userMessage },
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/lib/ai/agents/salesAgent.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/agents/salesAgent.ts __tests__/lib/ai/agents/salesAgent.test.ts
git commit -m "feat(sales): soft-sell sales agent prompt builder"
```

---

## Task 5: Sales chat SSE route

**Files:**
- Create: `app/api/ai/sales/route.ts`

This route clones `app/api/ai/support/route.ts` and changes three things: it uses `buildSalesMessages` instead of `buildSupportMessages`, it drops the Discord-keyword shortcut (handled by CTAs now), and it emits a trailing CTA frame `data: {"cta": [...]}` before `[DONE]` on every backend.

- [ ] **Step 1: Create the route by cloning support, with the changes below**

Create `app/api/ai/sales/route.ts`. Start from a copy of `app/api/ai/support/route.ts`, then:

1. Replace the import `buildSupportMessages` → `buildSalesMessages` and add the CTA import:

```typescript
import { buildSalesMessages, type ChatMessage } from '@/lib/ai/agents/salesAgent';
import { nextBestAction } from '@/lib/ai/sales/nextBestAction';
```

2. Delete the entire "Discord shortcut" block (the `DISCORD_KW` early-return).

3. Read an optional `page` from the body for context logging:

```typescript
const { message, history = [], page } = body as { message?: string; history?: ChatMessage[]; page?: string };
```

4. Replace `const messages = buildSupportMessages(...)` with:

```typescript
const messages = buildSalesMessages(message.trim(), safeHistory);
const cta = nextBestAction(message.trim(), safeHistory).ctas;
const ctaFrame = `data: ${JSON.stringify({ cta })}\n\n`;
```

5. In EACH backend branch, emit the CTA frame immediately before the `[DONE]` frame. For the Anthropic branch, change the success tail to:

```typescript
          controller.enqueue(encoder.encode(ctaFrame));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
```

For the Groq, Gemini, and Ollama branches (which return a stream from a helper), wrap the helper stream so the CTA frame is appended before `[DONE]`. Replace each `return new Response(stream, { headers })` for those three branches with:

```typescript
      const withCta = appendCtaFrame(stream, ctaFrame);
      return new Response(withCta, { headers: { /* same headers as before */ } });
```

6. Add this helper near the top of the file (after imports):

```typescript
/** Tee a helper SSE stream and inject the CTA frame right before [DONE]. */
function appendCtaFrame(src: ReadableStream<Uint8Array>, ctaFrame: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const reader = src.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
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
    },
    cancel(reason) { void reader.cancel(reason); },
  });
}
```

7. Update the `GET` health check `agent` field from `'support'` to `'sales'`.

- [ ] **Step 2: Typecheck the route**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "app/api/ai/sales" || echo "no type errors in sales route"`
Expected: `no type errors in sales route`

- [ ] **Step 3: Smoke-test the stream shape (manual)**

Run: `npm run dev` then in another shell:
`curl -N -s -X POST http://localhost:3000/api/ai/sales -H 'Content-Type: application/json' -d '{"message":"c est quoi le footprint ?","history":[]}' | grep -E '"cta"|\[DONE\]'`
Expected: a `data: {"cta":[...]}` line containing a `download` CTA, then `data: [DONE]`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ai/sales/route.ts
git commit -m "feat(sales): /api/ai/sales SSE route with deterministic CTA frame"
```

---

## Task 6: Lead capture endpoint

**Files:**
- Create: `app/api/leads/route.ts`
- Test: `__tests__/api/leads.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/leads.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
const update = vi.fn();
const sendEmail = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/db', () => ({
  prisma: { lead: { create: (...a: unknown[]) => create(...a), update: (...a: unknown[]) => update(...a) } },
  isPrismaAvailable: () => true,
}));
vi.mock('@/lib/auth/email-verification', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/auth/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  tooManyRequests: () => new Response('rate', { status: 429 }),
}));

import { POST } from '@/app/api/leads/route';

function req(body: unknown) {
  return new Request('http://localhost/api/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/leads', () => {
  beforeEach(() => { create.mockReset().mockResolvedValue({ id: 'lead_1' }); update.mockReset(); sendEmail.mockClear(); });

  it('rejects an invalid email', async () => {
    const res = await POST(req({ email: 'not-an-email' }) as never);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a lead and notifies admin', async () => {
    const res = await POST(req({ email: 'trader@example.com', temperature: 'hot', topic: 'apex', page: '/' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('still succeeds (lead kept) when the admin email fails', async () => {
    sendEmail.mockResolvedValueOnce(false);
    const res = await POST(req({ email: 'trader@example.com' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/api/leads.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/leads/route'`

- [ ] **Step 3: Implement the endpoint**

Create `app/api/leads/route.ts`:

```typescript
/**
 * POST /api/leads
 * Capture a sales lead from the landing chat + notify admin by email.
 * Public, rate-limited. Lead is persisted even if the email notification fails.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/auth/email-verification';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.ADMIN_EMAILS?.split(',')[0]?.trim()
  || process.env.SUPPORT_EMAIL
  || 'ryad.bouderga78@gmail.com';

const leadSchema = z.object({
  email:       z.string().email().max(200),
  temperature: z.enum(['cold', 'warm', 'hot']).default('warm'),
  topic:       z.string().max(200).optional(),
  transcript:  z.string().max(4000).optional(),
  page:        z.string().max(200).optional(),
}).strict();

function getClientIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`ip:leads:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }

  const { email, temperature, topic, transcript, page } = parsed.data;
  const lead = await prisma.lead.create({
    data: { email: email.toLowerCase().trim(), temperature, topic, transcript, page, source: 'sales_chat' },
  });

  const content = `
    <h2 style="margin:0 0 12px;font-size:18px;color:#e2e8f0;">Nouveau lead — chat de vente</h2>
    <p style="font-size:14px;color:#cbd5e1;">
      <b>Email</b> : ${escapeHtml(email)}<br/>
      <b>Température</b> : ${escapeHtml(temperature)}<br/>
      <b>Sujet</b> : ${escapeHtml(topic ?? '—')}<br/>
      <b>Page</b> : ${escapeHtml(page ?? '—')}
    </p>
    ${transcript ? `<p style="font-size:12px;color:#94a3b8;">Extrait :</p><div style="padding:12px;background:#0f0f1a;border:1px solid #1e1e2e;border-radius:8px;font-size:13px;color:#cbd5e1;white-space:pre-wrap;">${escapeHtml(transcript)}</div>` : ''}
  `;

  let notified = false;
  try {
    notified = await sendEmail({
      to: ADMIN_EMAIL,
      replyTo: email,
      subject: `[Lead ${temperature}] ${email}`,
      content,
      text: `Nouveau lead\nEmail: ${email}\nTempérature: ${temperature}\nSujet: ${topic ?? '—'}\nPage: ${page ?? '—'}\n\n${transcript ?? ''}`,
    });
    if (notified) await prisma.lead.update({ where: { id: lead.id }, data: { notified: true } });
  } catch (err) {
    console.error('[leads] admin notification failed (lead kept):', err);
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/api/leads.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/leads/route.ts __tests__/api/leads.test.ts
git commit -m "feat(leads): lead capture endpoint + admin email notification"
```

---

## Task 7: Conversion event endpoint

**Files:**
- Create: `app/api/events/route.ts`
- Test: `__tests__/api/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/events.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { chatEvent: { create: (...a: unknown[]) => create(...a) } },
  isPrismaAvailable: () => true,
}));
vi.mock('@/lib/auth/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  tooManyRequests: () => new Response('rate', { status: 429 }),
}));

import { POST } from '@/app/api/events/route';

function req(body: unknown) {
  return new Request('http://localhost/api/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/events', () => {
  beforeEach(() => { create.mockReset().mockResolvedValue({ id: 'e1' }); });

  it('records a valid event', async () => {
    const res = await POST(req({ sessionId: 's1', type: 'cta_clicked', ctaType: 'download', page: '/' }) as never);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects an unknown event type', async () => {
    const res = await POST(req({ sessionId: 's1', type: 'bogus' }) as never);
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws on DB failure (best-effort)', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(req({ sessionId: 's1', type: 'opened' }) as never);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/api/events.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/events/route'`

- [ ] **Step 3: Implement the endpoint**

Create `app/api/events/route.ts`:

```typescript
/**
 * POST /api/events
 * Best-effort conversion event log for the sales chat. Never blocks UX,
 * never surfaces an error. No PII (anonymous sessionId only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { checkRateLimit, tooManyRequests } from '@/lib/auth/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  sessionId: z.string().min(1).max(100),
  type:      z.enum(['opened', 'engaged', 'cta_shown', 'cta_clicked', 'lead_captured']),
  ctaType:   z.enum(['download', 'checkout', 'email', 'discord']).optional(),
  page:      z.string().max(200).optional(),
}).strict();

function getClientIP(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`ip:events:${ip}`, 120, 60 * 1000);
  if (!rl.allowed) return tooManyRequests(rl);

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  try {
    await prisma.chatEvent.create({ data: parsed.data });
  } catch (err) {
    // Best-effort: swallow so the UX never sees an error.
    console.warn('[events] failed to record (ignored):', err);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/api/events.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/events/route.ts __tests__/api/events.test.ts
git commit -m "feat(events): best-effort sales chat event log"
```

---

## Task 8: Wire FloatingChat to the sales agent + CTAs + email capture

**Files:**
- Modify: `components/ai/FloatingChat.tsx`

All edits are in this one file. The shape: repoint the fetch, parse the `{cta}` frame, store CTAs on the last assistant message, render CTA buttons + an inline email form, and fire `/api/events`.

- [ ] **Step 1: Extend the message type and add session/CTA state**

Replace the `Msg` interface (lines ~13-17) with:

```typescript
import { nextBestAction, type Cta } from '@/lib/ai/sales/nextBestAction';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  ctas?: Cta[];
}
```

Inside the component, after the existing `useState` hooks (~line 35), add:

```typescript
  const [emailFor, setEmailFor] = useState<number | null>(null); // message index showing the email form
  const [emailValue, setEmailValue] = useState('');
  const [emailDone, setEmailDone] = useState(false);
  const sessionIdRef = useRef<string>(
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `s_${Date.now()}`,
  );
  const lastTempRef = useRef<'cold' | 'warm' | 'hot'>('cold');

  const logEvent = useCallback((type: string, ctaType?: string) => {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current, type, ctaType, page: typeof location !== 'undefined' ? location.pathname : undefined }),
    }).catch(() => { /* best-effort */ });
  }, []);
```

- [ ] **Step 2: Fire `opened` / `engaged` events**

In the `useEffect(() => { if (open) {...} }, [open])` block, add `logEvent('opened');` inside the `if (open)`.
In `send`, right after `setLoading(true);` (line ~69), add:

```typescript
    if (messages.filter(m => m.role === 'user').length === 0) logEvent('engaged');
    lastTempRef.current = nextBestAction(text.trim(), history).temperature;
```

- [ ] **Step 3: Repoint the fetch and parse the CTA frame**

Change the fetch URL (line ~73) from `'/api/ai/support'` to `'/api/ai/sales'`, and add `page` to the body:

```typescript
        body: JSON.stringify({ message: text.trim(), history, page: typeof location !== 'undefined' ? location.pathname : undefined }),
```

In the SSE parse loop, replace the inner `try { const { token } ... }` block (lines ~93-101) with one that also handles `cta`:

```typescript
          try {
            const parsed = JSON.parse(d) as { token?: string; cta?: Cta[] };
            if (parsed.cta) {
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: full, ctas: parsed.cta };
                return copy;
              });
              parsed.cta.forEach(c => logEvent('cta_shown', c.kind));
              continue;
            }
            if (parsed.token) {
              full += parsed.token;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: full };
                return copy;
              });
            }
          } catch { /* skip */ }
```

- [ ] **Step 4: Render CTA buttons + email form under assistant messages**

In the messages map, immediately after the closing `</div>` of a bubble and before the row's closing `</div>` (~line 204), insert a CTA block that renders only for assistant messages carrying `ctas`:

```tsx
                {m.role === 'assistant' && m.ctas && m.ctas.length > 0 && !m.loading && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {m.ctas.map((c, ci) => (
                      c.kind === 'email' ? (
                        <button
                          key={ci}
                          onClick={() => { setEmailFor(i); setEmailDone(false); }}
                          className="text-[10.5px] px-3 py-1.5 rounded-full"
                          style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                        >
                          {c.label}
                        </button>
                      ) : (
                        <a
                          key={ci}
                          href={c.href || '#'}
                          target={c.kind === 'discord' ? '_blank' : undefined}
                          rel={c.kind === 'discord' ? 'noopener noreferrer' : undefined}
                          onClick={() => logEvent('cta_clicked', c.kind)}
                          className="text-[10.5px] px-3 py-1.5 rounded-full"
                          style={{ background: 'rgb(var(--primary-rgb) / 0.12)', color: 'var(--primary)', border: '1px solid rgb(var(--primary-rgb) / 0.35)' }}
                        >
                          {c.label}
                        </a>
                      )
                    ))}
                  </div>
                )}
                {emailFor === i && (
                  emailDone ? (
                    <p className="mt-1.5 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Merci, on te tient au courant.</p>
                  ) : (
                    <form
                      className="flex gap-1.5 mt-1.5"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!/.+@.+\..+/.test(emailValue)) return;
                        try {
                          const r = await fetch('/api/leads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              email: emailValue.trim(),
                              temperature: lastTempRef.current,
                              page: typeof location !== 'undefined' ? location.pathname : undefined,
                              transcript: messages.slice(-6).map(mm => `${mm.role}: ${mm.content}`).join('\n').slice(0, 2000),
                            }),
                          });
                          if (r.ok) { setEmailDone(true); setEmailValue(''); logEvent('lead_captured'); }
                        } catch { /* keep input, user can retry */ }
                      }}
                    >
                      <input
                        type="email"
                        value={emailValue}
                        onChange={e => setEmailValue(e.target.value)}
                        placeholder="ton@email.com"
                        className="flex-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-transparent outline-none"
                        style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      />
                      <button type="submit" className="text-[10.5px] px-3 py-1.5 rounded-lg" style={{ background: 'var(--primary)', color: 'var(--background)' }}>OK</button>
                    </form>
                  )
                )}
```

- [ ] **Step 5: Update the header label (optional polish)**

Change the status line text (`En ligne · Claude Haiku`, line ~154) to `En ligne · Assistant OrderFlow` so it isn't model-specific.

- [ ] **Step 6: Typecheck the widget**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "FloatingChat" || echo "no type errors in FloatingChat"`
Expected: `no type errors in FloatingChat`

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open the landing page, open the chat:
- Ask "c'est quoi le footprint ?" → answer streams, a **Télécharger** button appears.
- Ask "c'est combien le plan pro ?" → a **Voir les offres** button appears (no invented price).
- Click "Rester informé" → email form, submit a valid email → "Merci, on te tient au courant.", and the admin inbox / dev console shows the lead email.

- [ ] **Step 8: Commit**

```bash
git add components/ai/FloatingChat.tsx
git commit -m "feat(sales): wire FloatingChat to sales agent — CTAs, email capture, events"
```

---

## Final verification

- [ ] **Run the full new test set**

Run: `npx vitest run __tests__/lib/ai/sales __tests__/lib/ai/agents/salesAgent.test.ts __tests__/lib/ai/agents/salesKnowledge.test.ts __tests__/api/leads.test.ts __tests__/api/events.test.ts`
Expected: all PASS.

- [ ] **Typecheck the whole web project**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Confirm the support route is untouched**

Run: `git log --oneline -- app/api/ai/support/route.ts | head -1`
Expected: the last commit predates this plan (no regression to the support chat).

---

## Notes for the implementer

- **`sales.md` content is the real product work.** The seeded file has placeholders for prices/OS support/competitor diffs marked with `(renseigner…)`. The agent will say "je vérifie avec l'équipe" for anything not yet filled — which is the correct, safe behavior. Fill it before production launch.
- **DB availability:** Tasks 6-7 mock Prisma in tests, so they pass without a live DB. Task 1's migration needs a reachable `DATABASE_URL`; if unavailable in dev, generate the client and apply the migration when the DB is up.
- **Env to set before prod:** `NEXT_PUBLIC_DOWNLOAD_URL`, `NEXT_PUBLIC_PRICING_URL` (else defaults `/download`, `/pricing`), and confirm `DISCORD_INVITE_URL`, `ADMIN_EMAILS`, `SMTP_*` are present.
- **Out of scope (phase 2):** nurture email sequences, ML lead scoring, page personalization, A/B prompt testing.
