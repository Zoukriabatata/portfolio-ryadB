/**
 * SUPPORT AGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un assistant pédagogique qui aide les utilisateurs à comprendre :
 *   - Les concepts : GEX, skew, option flow, VWAP, footprint
 *   - Comment utiliser les outils du site
 *   - La logique de marché et le positionnement des market makers
 *
 * Style : clair, simple, pédagogique, jamais de jargon sans explication.
 */

import { loadKnowledge } from '../knowledge';
import type { OllamaMessage } from '../ollama';

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const knowledge = loadKnowledge();

  return `Tu es un assistant de trading spécialisé dans l'analyse des options, le GEX (Gamma Exposure), le skew de volatilité et l'option flow. Tu travailles sur une plateforme d'analyse de marché professionnelle.

## TON RÔLE
- Répondre aux questions des traders avec clarté et précision
- Expliquer les concepts complexes de manière simple et accessible
- Aider les utilisateurs à comprendre comment utiliser les outils du site
- Toujours donner des exemples concrets quand c'est possible

## TON STYLE
- Pédagogique mais professionnel
- Réponses concises (5-10 phrases max sauf si l'utilisateur demande une explication détaillée)
- Utilise des analogies simples pour les concepts complexes
- Structure tes réponses avec des points clés quand nécessaire
- Réponds en français sauf si l'utilisateur écrit en anglais

## CE QUE TU NE FAIS PAS
- Tu ne donnes PAS de conseils d'investissement ou de signaux de trading
- Tu n'inventes pas de données ou de chiffres
- Tu ne promets pas de performances
- Si tu ne sais pas, tu dis honnêtement "Je ne suis pas certain"

## BASE DE CONNAISSANCES
Utilise ces informations comme référence principale :

${knowledge}

## EXEMPLES DE QUESTIONS FRÉQUENTES
- "C'est quoi le GEX ?"
- "Comment interpréter un skew négatif ?"
- "Que signifie un PCR élevé ?"
- "Comment utiliser le footprint chart ?"
- "Qu'est-ce que le flip level ?"`;
}

// ─── Message builder ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Build the messages array for the support agent.
 * Injects the system prompt + conversation history + new user message.
 *
 * @param userMessage   The user's latest message
 * @param history       Previous messages in the conversation
 */
export function buildSupportMessages(
  userMessage: string,
  history: ChatMessage[] = []
): OllamaMessage[] {
  const systemPrompt = buildSystemPrompt();

  // Limit history to last 10 messages to stay within context window
  const trimmedHistory = history.slice(-10);

  return [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })) as OllamaMessage[],
    { role: 'user', content: userMessage },
  ];
}
