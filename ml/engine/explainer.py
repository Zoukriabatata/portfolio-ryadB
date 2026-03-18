"""
Signal Explainer — LLM Layer (Optional)
────────────────────────────────────────────────────────────────────────────
Generates a concise natural language explanation of a deterministic engine
signal. Uses the local Ollama instance.

CONTRACT:
  INPUT  : EngineOutput as dict (from AnalysisEngine.to_dict())
  OUTPUT : Plain text, 2-3 sentences maximum
  ROLE   : Explain only — does NOT generate trading decisions or JSON

FALLBACK:
  If Ollama is unreachable (offline, timeout) → returns the engine's
  built-in `explanation` string, which is always deterministic.

DESIGN:
  - Uses stdlib urllib only (no extra dependencies)
  - Hard timeout: 10 seconds max
  - Temperature 0.25 (low variance explanations)
  - num_predict 250 (enough for 2-3 sentences in French)
"""

from __future__ import annotations
import json
import urllib.request
import urllib.error

OLLAMA_URL    = 'http://localhost:11434'
DEFAULT_MODEL = 'mistral'
TIMEOUT_S     = 10


# ─── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(output: dict) -> str:
    bias         = output.get('bias', 'NEUTRAL')
    confidence   = output.get('confidence', 0)
    gamma_regime = output.get('gamma_regime', '')
    vol_regime   = output.get('volatility_regime', '')
    flow         = output.get('flow_direction', '')
    dealer       = output.get('dealer_state', '')
    regime       = output.get('regime', '')
    confluence   = output.get('confluence_score', 0)
    engine_text  = output.get('explanation', '')
    squeeze      = output.get('gamma_squeeze', False)
    sq_strength  = output.get('squeeze_strength', 0)

    facts = [
        f"Signal: {bias} | Confiance: {confidence * 100:.0f}%",
        f"Gamma: {gamma_regime} | Vol: {vol_regime} | Flow: {flow}",
    ]
    if dealer:
        facts.append(f"État dealer: {dealer.replace('_', ' ')}")
    if regime:
        facts.append(f"Régime marché: {regime.replace('_', ' ')}")
    if squeeze:
        facts.append(f"GAMMA SQUEEZE détecté ({sq_strength * 100:.0f}%)")
    if abs(confluence) > 1.5:
        direction = 'haussière' if confluence > 0 else 'baissière'
        facts.append(f"Confluence {direction} forte: {confluence:+.1f}/8")
    if engine_text:
        facts.append(f"Analyse moteur: {engine_text}")

    data_block = '\n'.join(f'  • {f}' for f in facts)

    return (
        "Tu es un assistant qui explique des signaux de marché quantitatifs "
        "à des traders professionnels.\n\n"
        f"Signal reçu:\n{data_block}\n\n"
        "En 2 phrases maximum:\n"
        "  1. Explique ce que ce signal signifie concrètement pour le marché\n"
        "  2. Indique le facteur de risque principal\n\n"
        "Règles absolues:\n"
        "  • Ne recommande PAS d'acheter ou de vendre\n"
        "  • Reste factuel — tu expliques, tu ne décides pas\n"
        "  • Commence directement par l'explication, sans salutation"
    )


# ─── Main function ─────────────────────────────────────────────────────────────

def explain_signal(output: dict, model: str = DEFAULT_MODEL) -> str:
    """
    Generate a brief NL explanation of the engine signal using Ollama.

    Args:
        output : EngineOutput.to_dict() result
        model  : Ollama model name (default: mistral)

    Returns:
        Natural language explanation string.
        Falls back to output['explanation'] if Ollama is unavailable.
    """
    prompt  = _build_prompt(output)
    payload = json.dumps({
        'model':    model,
        'messages': [{'role': 'user', 'content': prompt}],
        'stream':   False,
        'options':  {'temperature': 0.25, 'num_predict': 250},
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            url     = f'{OLLAMA_URL}/api/chat',
            data    = payload,
            headers = {'Content-Type': 'application/json'},
            method  = 'POST',
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            text = data.get('message', {}).get('content', '').strip()
            if text:
                return text
    except (urllib.error.URLError, OSError, KeyError, json.JSONDecodeError):
        pass

    # Fallback: return the deterministic engine explanation
    return output.get('explanation', '')
