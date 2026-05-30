/**
 * Heuristic mapping from Finnhub event names → short impact summary.
 * Finnhub doesn't ship descriptions in /calendar/economic, so we
 * pattern-match on the event title. Covers the high-impact macro
 * releases a futures trader watches. Returns `null` for unknown
 * events so the UI can hide the description line cleanly.
 *
 * Each rule is `[regex, summary]`. First match wins — order matters
 * for overlapping patterns (e.g. "Core CPI" before "CPI").
 */

const RULES: ReadonlyArray<[RegExp, string]> = [
  // ── Inflation ──────────────────────────────────────────────
  [/\b(core\s*cpi|cpi\s*core)\b/i, "Core inflation (ex food/energy) — Fed's main rate signal."],
  [/\bcpi\b/i, "Headline inflation — moves Fed expectations and yields."],
  [/\b(core\s*ppi|ppi\s*core)\b/i, "Core producer prices — leading CPI indicator."],
  [/\bppi\b/i, "Producer inflation — feeds into headline CPI next month."],
  [/\b(core\s*pce|pce\s*core)\b/i, "Core PCE — Fed's preferred inflation gauge."],
  [/\bpce\b/i, "Personal Consumption Expenditures — Fed inflation target."],
  [/\b(hicp|harmonized)\b/i, "Harmonized inflation — ECB policy input."],
  [/\binflation\s*(rate|expectations?)\b/i, "Inflation reading — rate-path driver."],

  // ── Labor market ───────────────────────────────────────────
  [/\b(non[\s-]?farm|nfp|payrolls?)\b/i, "Jobs report — most-watched US macro print."],
  [/\bunemployment\s*rate\b/i, "Labor slack — Fed dual-mandate input."],
  [/\b(initial|continuing)\s*(jobless|claims)\b/i, "Weekly labor pulse — leading employment data."],
  [/\baverage\s*hourly\s*earnings?\b/i, "Wage growth — sticky inflation signal."],
  [/\b(jolts|job\s*openings)\b/i, "Labor demand — Fed's tightness metric."],
  [/\badp\s*(employment|payrolls?)\b/i, "Private payrolls preview (2 days before NFP)."],

  // ── Growth / activity ──────────────────────────────────────
  [/\bgdp\b/i, "Growth pulse — recession/expansion signal."],
  [/\bretail\s*sales\b/i, "Consumer demand — drives growth forecasts."],
  [/\bindustrial\s*production\b/i, "Manufacturing output — cyclical indicator."],
  [/\bdurable\s*goods\b/i, "Capex pulse — business investment gauge."],
  [/\bpersonal\s*(income|spending)\b/i, "Household balance sheet — consumption driver."],

  // ── Surveys / PMI ──────────────────────────────────────────
  [/\bism\s*(manufacturing|services|non[\s-]?manufacturing)\b/i, "ISM survey — US business activity index."],
  [/\b(manufacturing|services|composite)\s*pmi\b/i, "PMI — leading business activity gauge."],
  [/\bpmi\b/i, "Purchasing Managers Index — sentiment + activity."],
  [/\b(consumer|umich|michigan)\s*(confidence|sentiment)\b/i, "Consumer mood — leads spending."],
  [/\bbusiness\s*(confidence|climate|sentiment)\b/i, "Business sentiment — leading indicator."],
  [/\b(zew|ifo)\b/i, "German business survey — EUR/bunds driver."],

  // ── Central banks ──────────────────────────────────────────
  [/\bfomc\b/i, "Fed policy decision — primary market driver."],
  [/\b(fed|federal\s*reserve).*(rate|decision|funds?)\b/i, "Fed rate decision — primary risk driver."],
  [/\binterest\s*rate\s*(decision|announcement)\b/i, "Central bank rate decision — currency + bonds driver."],
  [/\becb\b.*(rate|decision|refi|deposit)\b/i, "ECB policy — EUR + bunds driver."],
  [/\bdeposit\s*rate\b/i, "ECB deposit facility — euro driver."],
  [/\b(boe|bank\s*of\s*england)\b/i, "BoE policy — GBP + gilts driver."],
  [/\b(boj|bank\s*of\s*japan)\b/i, "BoJ policy — JPY + JGB driver."],
  [/\b(snb|swiss\s*national)\b/i, "SNB policy — CHF driver."],
  [/\bpowell|lagarde|bailey|ueda\b/i, "Central bank chair speech — guidance signal."],
  [/\b(speech|testimony|press\s*conference)\b/i, "Policy commentary — forward guidance."],
  [/\bminutes\b/i, "Central bank minutes — policy nuance."],

  // ── Housing ────────────────────────────────────────────────
  [/\bhousing\s*(starts|completions?)\b/i, "Construction activity — housing cycle gauge."],
  [/\bbuilding\s*permits?\b/i, "Future construction pipeline."],
  [/\b(existing|new)\s*home\s*sales?\b/i, "Housing demand — rate-sensitive sector."],
  [/\bcase[\s-]?shiller\b/i, "Home price index — wealth effect indicator."],

  // ── External / FX ──────────────────────────────────────────
  [/\btrade\s*balance\b/i, "External demand — currency driver."],
  [/\bcurrent\s*account\b/i, "External imbalance — long-term FX driver."],
  [/\bforeign\s*exchange\s*reserves?\b/i, "FX intervention capacity."],

  // ── Energy / commodities ───────────────────────────────────
  [/\b(crude\s*oil|eia\s*crude|api\s*crude)\b/i, "Oil inventory — WTI/CL driver."],
  [/\bnatural\s*gas\s*storage\b/i, "Nat gas inventory — NG driver."],

  // ── Auctions / debt ────────────────────────────────────────
  [/\b(treasury|bond|note|bill)\s*auction\b/i, "Debt auction — yield + funding signal."],

  // ── China specifics ────────────────────────────────────────
  [/\bcaixin\b/i, "China private survey — global growth read."],
  [/\b(loan|credit|m2|aggregate\s*financing)\b/i, "China credit pulse — global liquidity."],
];

/** Return a short impact summary for an event name, or `null` if no rule matches. */
export function describeEvent(eventName: string): string | null {
  if (!eventName) return null;
  for (const [pattern, summary] of RULES) {
    if (pattern.test(eventName)) return summary;
  }
  return null;
}
