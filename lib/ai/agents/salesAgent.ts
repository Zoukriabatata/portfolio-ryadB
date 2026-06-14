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
