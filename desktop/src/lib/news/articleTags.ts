/**
 * Heuristic tagging of news articles. Finnhub /news?category=general
 * ships a flat `category` field that's always "general" for market
 * news, so we regex the headline + summary to assign topical tags.
 *
 * The trader uses these tags to filter the feed down to what's
 * relevant for their symbol. Presets (e.g. `MNQ relevant`) bundle the
 * tags that typically move CME index futures.
 */

export const ALL_TAGS = [
  "US",
  "EU",
  "CHINA",
  "FED",
  "ECB",
  "MACRO",
  "TECH",
  "ENERGY",
  "INDICES",
  "CRYPTO",
  "EARNINGS",
  "GEOPOLITICS",
] as const;
export type Tag = (typeof ALL_TAGS)[number];

/** Regex rules — checked against `headline + " " + summary`. */
const RULES: Record<Tag, RegExp> = {
  US: /\b(united\s*states|u\.?s\.?\s*economy|american|wall\s*street|nyse|federal\s*reserve|treasury|biden|trump|white\s*house|washington)\b/i,
  EU: /\b(europe|eurozone|euro\s*area|germany|german|france|french|italy|spain|brussels|euro\b|eu\s*economy)\b/i,
  CHINA: /\b(china|chinese|beijing|shanghai|hong\s*kong|yuan|pboc|caixin|xi\s*jinping)\b/i,
  FED: /\b(fed|federal\s*reserve|fomc|powell|jerome\s*powell|fed\s*chair|hawkish|dovish|rate\s*hike|rate\s*cut)\b/i,
  ECB: /\b(ecb|european\s*central\s*bank|lagarde|christine\s*lagarde)\b/i,
  MACRO: /\b(inflation|cpi|ppi|pce|gdp|nfp|non[\s-]?farm|payrolls?|unemployment|jobless\s*claims|retail\s*sales|pmi|ism|consumer\s*confidence|housing\s*starts)\b/i,
  TECH: /\b(tech\s*stocks?|technology\s*sector|apple|microsoft|alphabet|google|nvidia|meta|amazon|tesla|netflix|semiconductor|chipmaker|silicon\s*valley|artificial\s*intelligence|\bai\b)\b/i,
  ENERGY: /\b(oil|crude|brent|wti|opec|natural\s*gas|gasoline|saudi|exxon|chevron|energy\s*sector|refinery)\b/i,
  INDICES: /\b(s&p\s*500|sp500|spx|nasdaq(\s*100)?|ndx|dow\s*jones|djia|russell\s*2000|futures|stock\s*index|index\s*futures|\bes\s*futures?|\bnq\s*futures?|\bmes\b|\bmnq\b)\b/i,
  CRYPTO: /\b(bitcoin|crypto(?:currency)?|\bbtc\b|ether(eum)?|\beth\b|stablecoin|binance|coinbase|spot\s*etf)\b/i,
  EARNINGS: /\b(earnings|eps|revenue|quarterly\s*results|profit\s*report|guidance\s*(beat|miss|cut|raise)|q[1-4]\s*\d{2,4})\b/i,
  GEOPOLITICS: /\b(war|sanction|russia|ukraine|iran|israel|conflict|middle\s*east|tariff|trade\s*war|north\s*korea)\b/i,
};

/** Classify an article into 0..N tags by matching the rules. */
export function classifyArticle(headline: string, summary: string): Tag[] {
  const text = `${headline} ${summary}`;
  const tags: Tag[] = [];
  for (const tag of ALL_TAGS) {
    if (RULES[tag].test(text)) tags.push(tag);
  }
  return tags;
}

/** Preset definition for a tradable instrument. */
export type PresetCategory = "indices" | "energy" | "fx" | "metals" | "rates" | "ags" | "crypto";
export type PresetDef = {
  key: string;
  label: string;
  fullName: string;
  category: PresetCategory;
  tags: Tag[];
  description: string;
};

/** Symbol presets — each bundles the tags that typically move that instrument. */
export const PRESETS: ReadonlyArray<PresetDef> = [
  // ── Index futures ────────────────────────────────────────────
  {
    key: "MNQ",
    label: "MNQ / NQ",
    fullName: "Micro / E-mini Nasdaq-100",
    category: "indices",
    tags: ["US", "FED", "MACRO", "TECH", "INDICES"],
    description: "Fed policy, US macro, tech mega-caps.",
  },
  {
    key: "MES",
    label: "MES / ES",
    fullName: "Micro / E-mini S&P 500",
    category: "indices",
    tags: ["US", "FED", "MACRO", "INDICES", "ENERGY", "TECH"],
    description: "Broader US market — Fed + macro + earnings.",
  },
  {
    key: "M2K",
    label: "M2K / RTY",
    fullName: "Micro / E-mini Russell 2000",
    category: "indices",
    tags: ["US", "FED", "MACRO", "INDICES"],
    description: "US small caps — domestic-sensitive, rate-driven.",
  },
  {
    key: "MYM",
    label: "MYM / YM",
    fullName: "Micro / E-mini Dow",
    category: "indices",
    tags: ["US", "FED", "MACRO", "INDICES", "EARNINGS"],
    description: "Dow Jones blue chips — earnings + macro.",
  },
  // ── Energy ───────────────────────────────────────────────────
  {
    key: "CL",
    label: "CL / MCL",
    fullName: "Crude Oil (WTI) Futures",
    category: "energy",
    tags: ["ENERGY", "GEOPOLITICS", "US"],
    description: "OPEC, US inventory, geopolitics.",
  },
  {
    key: "NG",
    label: "NG",
    fullName: "Natural Gas Futures",
    category: "energy",
    tags: ["ENERGY", "US"],
    description: "US storage, weather, LNG export demand.",
  },
  // ── FX ───────────────────────────────────────────────────────
  {
    key: "6E",
    label: "6E",
    fullName: "Euro FX Futures (EUR/USD)",
    category: "fx",
    tags: ["EU", "ECB", "MACRO", "FED"],
    description: "ECB vs Fed differential, Eurozone macro.",
  },
  {
    key: "6J",
    label: "6J",
    fullName: "Japanese Yen Futures",
    category: "fx",
    tags: ["MACRO", "FED", "GEOPOLITICS"],
    description: "BoJ policy, US-Japan yield differential.",
  },
  {
    key: "6B",
    label: "6B",
    fullName: "British Pound Futures",
    category: "fx",
    tags: ["MACRO", "ECB"],
    description: "BoE policy, UK macro releases.",
  },
  {
    key: "DX",
    label: "DX",
    fullName: "US Dollar Index Futures",
    category: "fx",
    tags: ["US", "FED", "MACRO"],
    description: "Fed policy, US macro vs G7.",
  },
  // ── Metals ───────────────────────────────────────────────────
  {
    key: "GC",
    label: "GC / MGC",
    fullName: "Gold Futures",
    category: "metals",
    tags: ["FED", "MACRO", "GEOPOLITICS", "US"],
    description: "Real yields, dollar, safe-haven flows.",
  },
  {
    key: "SI",
    label: "SI",
    fullName: "Silver Futures",
    category: "metals",
    tags: ["FED", "MACRO", "ENERGY"],
    description: "Industrial + monetary demand, dollar.",
  },
  // ── Rates ────────────────────────────────────────────────────
  {
    key: "ZN",
    label: "ZN / ZB",
    fullName: "10Y / 30Y Treasury Futures",
    category: "rates",
    tags: ["US", "FED", "MACRO"],
    description: "Fed, CPI, jobs, Treasury auctions.",
  },
  // ── Crypto ───────────────────────────────────────────────────
  {
    key: "BTC",
    label: "BTC",
    fullName: "Bitcoin Futures",
    category: "crypto",
    tags: ["CRYPTO", "FED", "US"],
    description: "ETF flows, Fed liquidity, US regulation.",
  },
];

/** Index by key for fast lookup. */
export const PRESETS_BY_KEY: Record<string, PresetDef> = Object.fromEntries(
  PRESETS.map((p) => [p.key, p]),
);

export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  indices: "Index Futures",
  energy: "Energy",
  fx: "Forex",
  metals: "Metals",
  rates: "Rates",
  ags: "Agriculture",
  crypto: "Crypto",
};
