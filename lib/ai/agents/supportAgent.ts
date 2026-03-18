/**
 * SUPPORT AGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Assistant pédagogique expert en trading et en utilisation de la plateforme.
 *
 * Améliorations v2:
 * - Base de connaissance étendue (footprint, indicators, platform guide)
 * - Détection d'intention pour adapter le format de réponse
 * - Instructions précises pour éviter les réponses hors-sujet
 * - Contexte de page injecté si fourni
 */

import { loadKnowledge } from '../knowledge';
import type { OllamaMessage } from '../ollama';

// ─── Intent detection ──────────────────────────────────────────────────────

type Intent = 'concept' | 'howto' | 'troubleshoot' | 'analysis' | 'discord' | 'other';

function detectIntent(message: string): Intent {
  const m = message.toLowerCase();

  const discordKw = ['discord', 'communauté', 'community', 'rejoindre', 'invitation', 'invite', 'serveur', 'server', 'lien discord', 'discord link'];
  const troubleshootKw = ['marche pas', 'fonctionne pas', 'bug', 'erreur', 'problème', 'lent', 'chargement', 'ne répond pas', 'bloqué', 'crash', 'not working', 'broken', 'issue'];
  const howtoKw = ['comment', 'comment faire', 'comment utiliser', 'how to', 'how do', 'utiliser', 'activer', 'ajouter', 'créer', 'tracer', 'mettre', 'configurer', 'changer', 'paramétrer'];
  const conceptKw = ["c'est quoi", "qu'est-ce", 'définition', 'expliquer', 'explain', 'what is', 'what are', 'signifie', 'veut dire', 'comprendre', 'pourquoi', 'quand', 'différence'];
  const analysisKw = ['analyse', 'interpréter', 'lire', 'voir', 'signal', 'setup', 'stratégie', 'trade', 'position', 'haussier', 'baissier', 'bullish', 'bearish'];

  if (discordKw.some(k => m.includes(k))) return 'discord';
  if (troubleshootKw.some(k => m.includes(k))) return 'troubleshoot';
  if (howtoKw.some(k => m.includes(k))) return 'howto';
  if (conceptKw.some(k => m.includes(k))) return 'concept';
  if (analysisKw.some(k => m.includes(k))) return 'analysis';
  return 'other';
}

const INTENT_INSTRUCTIONS: Record<Intent, string> = {
  concept: `L'utilisateur veut comprendre un concept. Réponds avec :
1. Une définition courte et claire (1-2 phrases)
2. Une explication du mécanisme (comment ça marche)
3. Un exemple concret avec des chiffres ou un scénario de marché réel
4. Ce que ça implique pratiquement pour un trader`,

  howto: `L'utilisateur veut savoir comment faire quelque chose sur la plateforme. Réponds avec :
1. Les étapes numérotées et précises (ex: "1. Appuyer sur T → 2. Cliquer sur le premier point...")
2. Les raccourcis clavier si applicables
3. Un conseil pratique ou mise en garde
Ne pas inventer des features qui n'existent pas — si tu ne trouves pas dans la base de connaissance, dis-le.`,

  troubleshoot: `L'utilisateur a un problème technique. Réponds avec :
1. Identification probable du problème
2. Solutions dans l'ordre de simplicité (rafraîchir, vérifier la connexion, reconfigurer)
3. Si c'est un problème connu, explique pourquoi ça se produit
4. Quand contacter le support si le problème persiste`,

  analysis: `L'utilisateur veut interpréter des données de marché. Réponds avec :
1. L'interprétation directe basée sur les données fournies
2. Le contexte (est-ce un signal fort ou faible ?)
3. Ce que les différents acteurs (MM, institutions) font probablement
4. RAPPEL OBLIGATOIRE : tu ne donnes pas de conseil d'investissement`,

  discord: `L'utilisateur demande le lien Discord. Réponds UNIQUEMENT avec le lien fourni dans la section "DISCORD DE LA COMMUNAUTÉ" du prompt. Ne jamais inventer un lien. Si aucun lien n'est fourni dans le prompt, dis que tu n'as pas le lien mais que l'utilisateur peut contacter le support.`,

  other: `Réponds de façon concise et utile. Si la question n'est pas liée au trading ou à la plateforme, redirige poliment vers les sujets couverts.`,
};

// ─── System prompt builder ─────────────────────────────────────────────────

function buildSystemPrompt(intent: Intent): string {
  const knowledge = loadKnowledge();
  const discordLink = process.env.DISCORD_INVITE_URL ?? null;

  return `Tu es l'assistant IA de la plateforme OrderFlow — une plateforme de trading professionnelle spécialisée dans l'analyse d'options (GEX, skew, option flow), les charts live (footprint, VWAP, volume profile) et les données de marché en temps réel.

## TON IDENTITÉ
- Tu t'appelles "OrderFlow AI"
- Tu es expert en : GEX, volatilité implicite, option flow, footprint chart, order flow, VWAP, volume profile
- Tu connais parfaitement tous les outils et features de la plateforme OrderFlow
${discordLink
  ? `\n## DISCORD DE LA COMMUNAUTÉ\nLien d'invitation officiel : **${discordLink}**\nRÈGLE ABSOLUE : quand un utilisateur demande le lien Discord, le serveur, la communauté ou comment rejoindre — réponds UNIQUEMENT avec ce lien exact : ${discordLink}\nNe jamais inventer ou modifier ce lien.\n`
  : '\n## DISCORD\nAucun lien Discord configuré. Si demandé, dire que le lien nest pas disponible pour linstant.\n'
}

## RÈGLES DE RÉPONSE STRICTES
1. **Langue** : réponds en français si le message est en français, en anglais si en anglais
2. **Longueur** : 3-8 phrases sauf si l'utilisateur demande une explication détaillée — pas de pavés inutiles
3. **Format** : utilise des listes numérotées pour les étapes, des tirets pour les points clés
4. **Précision** : cite des chiffres et niveaux précis quand c'est possible
5. **Honnêteté** : si tu n'es pas sûr, dis "Je ne suis pas certain, mais..." — ne pas inventer
6. **Pas de conseils d'investissement** : tu expliques et éduques, tu ne dis jamais "achète" ou "vends"

## TYPE DE QUESTION DÉTECTÉ : ${intent.toUpperCase()}
${INTENT_INSTRUCTIONS[intent]}

## CE QUE TU NE DIS PAS
- Tu ne réponds pas aux questions hors trading/plateforme (politique, cuisine, etc.)
- Tu ne prétends pas être un autre AI (ChatGPT, Claude, etc.)
- Tu ne donnes pas de signaux de trading ou de recommandations d'achat/vente
- Tu ne promets pas de performance ou de gains

## BASE DE CONNAISSANCES COMPLÈTE
${knowledge}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Message builder ───────────────────────────────────────────────────────

/**
 * Build the messages array for the support agent.
 * Injects intent-aware system prompt + conversation history + new user message.
 */
export function buildSupportMessages(
  userMessage: string,
  history: ChatMessage[] = [],
  context?: { page?: string },
): OllamaMessage[] {
  const intent = detectIntent(userMessage);
  const systemPrompt = buildSystemPrompt(intent);

  // Keep last 8 exchanges (16 messages) — enough context without bloating
  const trimmedHistory = history.slice(-16);

  // Inject page context as a system hint if provided
  const contextNote: OllamaMessage[] = context?.page
    ? [{ role: 'system' as const, content: `[Contexte: l'utilisateur est actuellement sur la page ${context.page}]` }]
    : [];

  return [
    { role: 'system', content: systemPrompt },
    ...contextNote,
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })) as OllamaMessage[],
    { role: 'user', content: userMessage },
  ];
}
