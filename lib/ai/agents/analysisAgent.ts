/**
 * ANALYSIS AGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent d'analyse de marché orienté trading professionnel.
 *
 * INPUT  : données de marché (GEX, skew, option flow, prix, VWAP, etc.)
 * OUTPUT : bias directionnel structuré + raisonnement logique
 *
 * Format de sortie : JSON structuré parsé depuis la réponse du LLM.
 */

import type { OllamaMessage } from '../ollama';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OptionsExpiration = '0DTE' | '1DTE' | 'Weekly' | 'Monthly';

export interface MarketData {
  symbol:              string;             // e.g. "SPY"
  price:               number;             // Prix actuel du sous-jacent
  gex:                 number;             // GEX en milliards USD (ex: 2.3 = +2.3B)
  gexFlipLevel?:       number;             // Prix du flip level GEX
  skew25d:             number;             // 25δ Risk Reversal (ex: -3.5 = put skew)
  callFlowPercent:     number;             // % calls dans le flow (0-100)
  putFlowPercent:      number;             // % puts dans le flow (0-100)
  putCallRatio:        number;             // PCR volume
  dominantFlow:        'calls' | 'puts' | 'neutral';
  ivRank?:             number;             // IV Rank 0-100 (optionnel)
  trend?:              'uptrend' | 'downtrend' | 'sideways';
  expiration?:         OptionsExpiration;  // Échéance des options analysées
  additionalContext?:  string;             // Note manuelle du trader
}

export interface AnalysisResult {
  bias:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence:   number;          // 0–100
  reasoning:    string[];        // Points d'analyse (3-5 items)
  keyLevels: {
    support:    number[];
    resistance: number[];
  };
  mmPositioning:  string;        // Positionnement des market makers
  action:         string;        // Suggestion d'approche (PAS un signal)
  riskFactors:    string[];      // Risques / invalidations
  rawResponse?:   string;        // Réponse brute du LLM
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function formatMarketData(d: MarketData): string {
  const gexStr = d.gex >= 0
    ? `+${d.gex.toFixed(2)}B$ (gamma positif — MM long gamma)`
    : `${d.gex.toFixed(2)}B$ (gamma négatif — MM short gamma)`;

  const skewStr = d.skew25d > 2
    ? `+${d.skew25d}% (call skew — biais haussier dans les options)`
    : d.skew25d < -2
    ? `${d.skew25d}% (put skew — protection baissière dominante)`
    : `${d.skew25d}% (neutre)`;

  const flowStr = `Calls ${d.callFlowPercent}% | Puts ${d.putFlowPercent}% | PCR ${d.putCallRatio.toFixed(2)} | Dominant: ${d.dominantFlow}`;

  let result = `SYMBOL: ${d.symbol}
PRIX: $${d.price.toLocaleString()}
GEX: ${gexStr}`;

  if (d.gexFlipLevel) result += `\nGEX FLIP LEVEL: $${d.gexFlipLevel.toLocaleString()}`;
  result += `\nSKEW 25δ: ${skewStr}`;
  result += `\nOPTION FLOW: ${flowStr}`;
  if (d.ivRank !== undefined) result += `\nIV RANK: ${d.ivRank.toFixed(0)}%`;
  if (d.trend) result += `\nTENDANCE: ${d.trend}`;
  if (d.expiration) {
    const expirationCtx: Record<OptionsExpiration, string> = {
      '0DTE':    '0DTE — expiration aujourd\'hui (gamma maximal, pin risk, intraday seulement)',
      '1DTE':    '1DTE — expiration demain (gamma élevé, risque overnight, sweeps amplifiés)',
      'Weekly':  'Weekly — expiration cette semaine (positionnement court terme, momentum)',
      'Monthly': 'Monthly — expiration mensuelle (positionnement structurel institutionnel)',
    };
    result += `\nÉCHÉANCE OPTIONS: ${expirationCtx[d.expiration]}`;
  }
  if (d.additionalContext) result += `\nCONTEXTE ADDITIONNEL: ${d.additionalContext}`;

  return result;
}

function buildSystemPrompt(): string {
  return `Tu es un analyste de marché quantitatif expert en options, GEX (Gamma Exposure), skew de volatilité et option flow. Tu analyses le positionnement des market makers et tu détermines un biais directionnel basé sur des données objectives.

## TON RÔLE
- Analyser les données de marché fournies : GEX, skew de volatilité, option flow
- Identifier la logique de positionnement des market makers (MM) via le GEX
- Calculer un biais directionnel (BULLISH / BEARISH / NEUTRAL) avec un niveau de confiance
- Expliquer chaque signal avec la logique de marché sous-jacente
- Identifier les niveaux clés et les facteurs de risque
- Ne PAS utiliser de RSI ou d'indicateurs techniques classiques — seulement GEX, skew, option flow et prix/VWAP

## RÈGLES D'ANALYSE

### GEX
- GEX positif (> 0) : MM long gamma → ils stabilisent le prix (achètent les dips, vendent les rallies)
- GEX négatif (< 0) : MM short gamma → ils amplifient les mouvements (trending market probable)
- Prix au-dessus du flip level : régime stabilisant → favoriser le range
- Prix en-dessous du flip level : régime volatile → suivre le momentum

### Skew
- Put skew élevé (< -5%) : peur institutionnelle → biais baissier
- Call skew élevé (> +5%) : FOMO / positionnement haussier agressif
- Flat skew : équilibre, attendre confirmation

### Option Flow
- Calls > 65% : flux directionnel haussier institutionnel
- Puts > 65% : flux directionnel baissier / protection massive
- PCR < 0.6 : sentiment très bullish
- PCR > 1.2 : sentiment très bearish
- Flow neutre (45-55%) : pas de conviction directionnelle

### Échéance des options — DIMENSION CRITIQUE

L'échéance change FONDAMENTALEMENT l'interprétation de chaque signal.
Tu DOIS adapter ton analyse selon l'échéance fournie :

**0DTE (expiration aujourd'hui) :**
- Gamma EXTRÊME — les prix sont attirés magnétiquement vers les strikes à OI maximal (pin risk)
- Les MM hedgent en temps réel avec un delta très sensible → mouvements brusques amplifiés
- Le GEX flip level est un aimant de prix pour la journée
- Éviter les positions directionnelles larges → privilégier le range autour des strikes dominants
- Un flow de sweeps agressifs est un signal FORT car coûteux à 0DTE
- La volatilité intraday peut tripler par rapport à d'autres expirations

**1DTE (expiration demain) :**
- Gamma encore très élevé mais déclin du theta accéléré overnight
- Les positions ouvertes sont à risque gap du lendemain matin
- Les sweeps calls/puts valent double comme signal directionnel
- Analyser le flow en fin de session pour les intentions overnight des institutionnels
- Attention aux catalyseurs macro avant l'ouverture (earnings, données économiques)

**Weekly (expiration cette semaine) :**
- Positionnement court terme — 3 à 5 jours de durée de vie
- Le flow dominant révèle le positionnement des fonds pour la semaine
- Le GEX structure est stable — les niveaux support/résistance sont fiables
- Les momentum plays sont viables — suivre la direction du flow > 60%
- La skew hebdomadaire reflète les convictions de court terme des institutionnels

**Monthly (expiration mensuelle) :**
- POSITIONNEMENT STRUCTUREL — les grands fonds et les desks d'options positionnent ici
- L'OI est maximal → les niveaux GEX sont les plus significatifs et les plus stables
- Le skew mensuel révèle les convictions directionnelles profondes (≥ 1 mois d'engagement)
- Ignorer les micro-mouvements intraday — analyser la tendance de fond
- Les flow mensuels représentent des hedges institutionnels réels (multi-millions $)
- Un pivot GEX mensuel est un événement majeur pour le marché entier


## FORMAT DE RÉPONSE OBLIGATOIRE
Tu dois répondre UNIQUEMENT avec un objet JSON valide, sans texte avant ou après, exactement dans ce format :

{
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": <nombre 0-100>,
  "reasoning": [
    "<point 1 : analyse d'un signal spécifique>",
    "<point 2 : analyse d'un second signal>",
    "<point 3 : convergence ou divergence des signaux>",
    "<point 4 optionnel>"
  ],
  "keyLevels": {
    "support": [<prix1>, <prix2>],
    "resistance": [<prix1>, <prix2>]
  },
  "mmPositioning": "<description du positionnement des market makers en 1-2 phrases>",
  "action": "<approche suggérée en 1-2 phrases — pas un signal direct>",
  "riskFactors": [
    "<risque / scénario d'invalidation 1>",
    "<risque / scénario d'invalidation 2>"
  ]
}`;
}

export function buildAnalysisMessages(data: MarketData): OllamaMessage[] {
  const systemPrompt = buildSystemPrompt();
  const dataStr      = formatMarketData(data);

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Analyse ces données de marché et génère le JSON de bias :\n\n${dataStr}`,
    },
  ];
}

// ─── Response parser ──────────────────────────────────────────────────────────

/**
 * Attempt to repair truncated JSON by closing any unclosed arrays/objects.
 * Handles the most common failure mode: model stops mid-generation.
 */
function repairJson(s: string): string {
  // Remove trailing commas before closing delimiters (another common LLM artifact)
  let repaired = s.replace(/,(\s*[}\]])/g, '$1').trim();

  // Walk the string, tracking open brackets and string state
  const stack: string[] = [];
  let inString = false;
  let escaped  = false;

  for (const ch of repaired) {
    if (escaped)                  { escaped = false; continue; }
    if (ch === '\\' && inString)  { escaped = true;  continue; }
    if (ch === '"')               { inString = !inString; continue; }
    if (inString)                 continue;
    if (ch === '{')               stack.push('}');
    else if (ch === '[')          stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }

  // If the model stopped mid-string (most common: "Le skew de volati<EOF>)
  // close the open string before closing any open brackets
  if (inString) repaired += '"';

  // Close any unclosed array/object structures
  return repaired + stack.reverse().join('');
}

/**
 * Parse the LLM response into a structured AnalysisResult.
 * Handles cases where the model adds extra text around the JSON,
 * and attempts to repair truncated responses (most common failure mode).
 */
export function parseAnalysisResponse(raw: string): AnalysisResult {
  // Extract JSON block (model sometimes wraps it in markdown code fences)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in analysis response');

  let parsed: Partial<AnalysisResult & { rawResponse?: string }>;

  // First attempt: parse as-is
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Second attempt: repair truncated JSON (model ran out of tokens mid-stream)
    try {
      parsed = JSON.parse(repairJson(jsonMatch[0]));
    } catch {
      throw new Error(`Invalid JSON in analysis response: ${jsonMatch[0].slice(0, 200)}`);
    }
  }

  // Validate and provide defaults
  const bias = (['BULLISH', 'BEARISH', 'NEUTRAL'] as const).includes(parsed.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL')
    ? (parsed.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL')
    : 'NEUTRAL';

  return {
    bias,
    confidence:     Math.max(0, Math.min(100, parsed.confidence ?? 50)),
    reasoning:      Array.isArray(parsed.reasoning) ? parsed.reasoning : ['Analyse insuffisante'],
    keyLevels:      parsed.keyLevels ?? { support: [], resistance: [] },
    mmPositioning:  parsed.mmPositioning ?? '',
    action:         parsed.action ?? '',
    riskFactors:    Array.isArray(parsed.riskFactors) ? parsed.riskFactors : [],
    rawResponse:    raw,
  };
}
