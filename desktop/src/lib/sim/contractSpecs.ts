// Contract specs for CME / CBOT / NYMEX / COMEX futures.
//
// PnL formula (single direction sense):
//   pnl = (currentPrice - entryPrice) * multiplier * qty       for LONG
//   pnl = (entryPrice - currentPrice) * multiplier * qty       for SHORT
//
// `tickSize` is the smallest legal price increment. `tickValue` =
// tickSize * multiplier is shown in the UI as "$ per tick".
//
// `validMonths` lists the CME delivery month codes the product
// actually trades — used by lib/sim/frontMonth.ts to compute the
// current front-month contract symbol without hardcoding it.
//
// SINGLE SOURCE OF TRUTH: this file feeds the symbol picker
// (lib/footprint/symbols.ts) and the journal filter
// (components/journal/TradeFilters.tsx). Add a product here and the
// picker + filter pick it up at build time — no other list to bump.

import {
  MONTHS_QUARTERLY,
  MONTHS_ALL,
  MONTHS_GOLD,
  MONTHS_SILVER,
  MONTHS_COPPER,
  MONTHS_PLATINUM,
  MONTHS_PALLADIUM,
  MONTHS_BONDS,
  MONTHS_GRAINS,
  MONTHS_SOYBEANS,
  MONTHS_SOYMEAL,
  MONTHS_OATS,
  MONTHS_RICE,
  MONTHS_CATTLE,
  MONTHS_HOGS,
  MONTHS_FEEDER,
} from "./frontMonth";

export type ContractCategory =
  | "indices"      // Equity index futures (ES, NQ, RTY, YM + micros)
  | "treasuries"   // Bond / note futures (ZB, ZN, ZF, ZT, UB, TN)
  | "currencies"   // CME FX futures (6E, 6B, 6J, 6A, 6C, 6S, 6N + micros)
  | "metals"       // COMEX precious + base metals (GC, SI, HG, PL, PA + micros)
  | "energy"       // NYMEX energy (CL, NG, RB, HO, BZ + micros)
  | "grains"       // CBOT grains (ZC, ZS, ZW, ZL, ZM, ZO, ZR)
  | "livestock"    // CME livestock (LE, HE, GF)
  | "crypto";      // CME crypto futures (BTC, MBT, ETH, MET)

export type ContractExchange = "CME" | "CBOT" | "NYMEX" | "COMEX";

export type ContractSpec = {
  root: string;
  name: string;
  category: ContractCategory;
  exchange: ContractExchange;
  tickSize: number;
  multiplier: number;
  tickValue: number; // = tickSize * multiplier
  validMonths: readonly string[];
};

export const SPECS: ContractSpec[] = [
  // ── Equity indices (CME) ─────────────────────────────────────────
  { root: "ES",  name: "E-mini S&P 500",            category: "indices",   exchange: "CME",   tickSize: 0.25,    multiplier: 50,        tickValue: 12.5,   validMonths: MONTHS_QUARTERLY },
  { root: "MES", name: "Micro E-mini S&P 500",      category: "indices",   exchange: "CME",   tickSize: 0.25,    multiplier: 5,         tickValue: 1.25,   validMonths: MONTHS_QUARTERLY },
  { root: "NQ",  name: "E-mini Nasdaq 100",         category: "indices",   exchange: "CME",   tickSize: 0.25,    multiplier: 20,        tickValue: 5.0,    validMonths: MONTHS_QUARTERLY },
  { root: "MNQ", name: "Micro E-mini Nasdaq 100",   category: "indices",   exchange: "CME",   tickSize: 0.25,    multiplier: 2,         tickValue: 0.5,    validMonths: MONTHS_QUARTERLY },
  { root: "RTY", name: "E-mini Russell 2000",       category: "indices",   exchange: "CME",   tickSize: 0.1,     multiplier: 50,        tickValue: 5.0,    validMonths: MONTHS_QUARTERLY },
  { root: "M2K", name: "Micro Russell 2000",        category: "indices",   exchange: "CME",   tickSize: 0.1,     multiplier: 5,         tickValue: 0.5,    validMonths: MONTHS_QUARTERLY },
  { root: "YM",  name: "E-mini Dow",                category: "indices",   exchange: "CBOT",  tickSize: 1.0,     multiplier: 5,         tickValue: 5.0,    validMonths: MONTHS_QUARTERLY },
  { root: "MYM", name: "Micro Dow",                 category: "indices",   exchange: "CBOT",  tickSize: 1.0,     multiplier: 0.5,       tickValue: 0.5,    validMonths: MONTHS_QUARTERLY },

  // ── Treasuries (CBOT) ────────────────────────────────────────────
  // Quoted in 32nds; the effective $/pt multiplier matches what NT
  // and most brokers display so sim PnL stays usable.
  { root: "ZB",  name: "30-Year US Treasury Bond",  category: "treasuries", exchange: "CBOT", tickSize: 0.03125,  multiplier: 1000,     tickValue: 31.25,  validMonths: MONTHS_BONDS },
  { root: "UB",  name: "Ultra US Treasury Bond",    category: "treasuries", exchange: "CBOT", tickSize: 0.03125,  multiplier: 1000,     tickValue: 31.25,  validMonths: MONTHS_BONDS },
  { root: "TN",  name: "Ultra 10-Year T-Note",      category: "treasuries", exchange: "CBOT", tickSize: 0.015625, multiplier: 1000,     tickValue: 15.625, validMonths: MONTHS_BONDS },
  { root: "ZN",  name: "10-Year T-Note",            category: "treasuries", exchange: "CBOT", tickSize: 0.015625, multiplier: 1000,     tickValue: 15.625, validMonths: MONTHS_BONDS },
  { root: "ZF",  name: "5-Year T-Note",             category: "treasuries", exchange: "CBOT", tickSize: 0.0078125,multiplier: 1000,     tickValue: 7.8125, validMonths: MONTHS_BONDS },
  { root: "ZT",  name: "2-Year T-Note",             category: "treasuries", exchange: "CBOT", tickSize: 0.00390625,multiplier: 2000,    tickValue: 7.8125, validMonths: MONTHS_BONDS },

  // ── Currencies (CME FX) ──────────────────────────────────────────
  { root: "6E",  name: "Euro FX",                   category: "currencies", exchange: "CME",  tickSize: 0.00005,  multiplier: 125000,   tickValue: 6.25,   validMonths: MONTHS_QUARTERLY },
  { root: "6B",  name: "British Pound",             category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 62500,    tickValue: 6.25,   validMonths: MONTHS_QUARTERLY },
  { root: "6J",  name: "Japanese Yen",              category: "currencies", exchange: "CME",  tickSize: 0.0000005,multiplier: 12500000, tickValue: 6.25,   validMonths: MONTHS_QUARTERLY },
  { root: "6A",  name: "Australian Dollar",         category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 100000,   tickValue: 10.0,   validMonths: MONTHS_QUARTERLY },
  { root: "6C",  name: "Canadian Dollar",           category: "currencies", exchange: "CME",  tickSize: 0.00005,  multiplier: 100000,   tickValue: 5.0,    validMonths: MONTHS_QUARTERLY },
  { root: "6S",  name: "Swiss Franc",               category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 125000,   tickValue: 12.5,   validMonths: MONTHS_QUARTERLY },
  { root: "6N",  name: "New Zealand Dollar",        category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 100000,   tickValue: 10.0,   validMonths: MONTHS_QUARTERLY },
  { root: "M6E", name: "Micro Euro FX",             category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 12500,    tickValue: 1.25,   validMonths: MONTHS_QUARTERLY },
  { root: "M6B", name: "Micro British Pound",       category: "currencies", exchange: "CME",  tickSize: 0.0001,   multiplier: 6250,     tickValue: 0.625,  validMonths: MONTHS_QUARTERLY },

  // ── Metals (COMEX) ───────────────────────────────────────────────
  { root: "GC",  name: "Gold",                      category: "metals",    exchange: "COMEX", tickSize: 0.1,     multiplier: 100,       tickValue: 10.0,   validMonths: MONTHS_GOLD },
  { root: "MGC", name: "Micro Gold",                category: "metals",    exchange: "COMEX", tickSize: 0.1,     multiplier: 10,        tickValue: 1.0,    validMonths: MONTHS_GOLD },
  { root: "SI",  name: "Silver",                    category: "metals",    exchange: "COMEX", tickSize: 0.005,   multiplier: 5000,      tickValue: 25.0,   validMonths: MONTHS_SILVER },
  { root: "SIL", name: "Micro Silver (1000 oz)",    category: "metals",    exchange: "COMEX", tickSize: 0.005,   multiplier: 1000,      tickValue: 5.0,    validMonths: MONTHS_SILVER },
  { root: "HG",  name: "Copper",                    category: "metals",    exchange: "COMEX", tickSize: 0.0005,  multiplier: 25000,     tickValue: 12.5,   validMonths: MONTHS_COPPER },
  { root: "MHG", name: "Micro Copper",              category: "metals",    exchange: "COMEX", tickSize: 0.0005,  multiplier: 2500,      tickValue: 1.25,   validMonths: MONTHS_COPPER },
  { root: "PL",  name: "Platinum",                  category: "metals",    exchange: "NYMEX", tickSize: 0.1,     multiplier: 50,        tickValue: 5.0,    validMonths: MONTHS_PLATINUM },
  { root: "PA",  name: "Palladium",                 category: "metals",    exchange: "NYMEX", tickSize: 0.05,    multiplier: 100,       tickValue: 5.0,    validMonths: MONTHS_PALLADIUM },

  // ── Energy (NYMEX) ───────────────────────────────────────────────
  { root: "CL",  name: "Crude Oil WTI",             category: "energy",    exchange: "NYMEX", tickSize: 0.01,    multiplier: 1000,      tickValue: 10.0,   validMonths: MONTHS_ALL },
  { root: "MCL", name: "Micro Crude Oil WTI",       category: "energy",    exchange: "NYMEX", tickSize: 0.01,    multiplier: 100,       tickValue: 1.0,    validMonths: MONTHS_ALL },
  { root: "QM",  name: "E-mini Crude Oil",          category: "energy",    exchange: "NYMEX", tickSize: 0.025,   multiplier: 500,       tickValue: 12.5,   validMonths: MONTHS_ALL },
  { root: "NG",  name: "Natural Gas",               category: "energy",    exchange: "NYMEX", tickSize: 0.001,   multiplier: 10000,     tickValue: 10.0,   validMonths: MONTHS_ALL },
  { root: "MNG", name: "Micro Natural Gas",         category: "energy",    exchange: "NYMEX", tickSize: 0.001,   multiplier: 1000,      tickValue: 1.0,    validMonths: MONTHS_ALL },
  { root: "RB",  name: "RBOB Gasoline",             category: "energy",    exchange: "NYMEX", tickSize: 0.0001,  multiplier: 42000,     tickValue: 4.2,    validMonths: MONTHS_ALL },
  { root: "HO",  name: "Heating Oil (NY Harbor)",   category: "energy",    exchange: "NYMEX", tickSize: 0.0001,  multiplier: 42000,     tickValue: 4.2,    validMonths: MONTHS_ALL },
  { root: "BZ",  name: "Brent Crude Oil",           category: "energy",    exchange: "NYMEX", tickSize: 0.01,    multiplier: 1000,      tickValue: 10.0,   validMonths: MONTHS_ALL },

  // ── Grains (CBOT) ────────────────────────────────────────────────
  { root: "ZC",  name: "Corn",                      category: "grains",    exchange: "CBOT",  tickSize: 0.25,    multiplier: 50,        tickValue: 12.5,   validMonths: MONTHS_GRAINS },
  { root: "ZS",  name: "Soybeans",                  category: "grains",    exchange: "CBOT",  tickSize: 0.25,    multiplier: 50,        tickValue: 12.5,   validMonths: MONTHS_SOYBEANS },
  { root: "ZW",  name: "Wheat",                     category: "grains",    exchange: "CBOT",  tickSize: 0.25,    multiplier: 50,        tickValue: 12.5,   validMonths: MONTHS_GRAINS },
  { root: "ZL",  name: "Soybean Oil",               category: "grains",    exchange: "CBOT",  tickSize: 0.01,    multiplier: 600,       tickValue: 6.0,    validMonths: MONTHS_SOYMEAL },
  { root: "ZM",  name: "Soybean Meal",              category: "grains",    exchange: "CBOT",  tickSize: 0.1,     multiplier: 100,       tickValue: 10.0,   validMonths: MONTHS_SOYMEAL },
  { root: "ZO",  name: "Oats",                      category: "grains",    exchange: "CBOT",  tickSize: 0.25,    multiplier: 50,        tickValue: 12.5,   validMonths: MONTHS_OATS },
  { root: "ZR",  name: "Rough Rice",                category: "grains",    exchange: "CBOT",  tickSize: 0.005,   multiplier: 2000,      tickValue: 10.0,   validMonths: MONTHS_RICE },

  // ── Livestock (CME) ──────────────────────────────────────────────
  { root: "LE",  name: "Live Cattle",               category: "livestock", exchange: "CME",   tickSize: 0.025,   multiplier: 400,       tickValue: 10.0,   validMonths: MONTHS_CATTLE },
  { root: "HE",  name: "Lean Hogs",                 category: "livestock", exchange: "CME",   tickSize: 0.025,   multiplier: 400,       tickValue: 10.0,   validMonths: MONTHS_HOGS },
  { root: "GF",  name: "Feeder Cattle",             category: "livestock", exchange: "CME",   tickSize: 0.025,   multiplier: 500,       tickValue: 12.5,   validMonths: MONTHS_FEEDER },

  // ── CME Crypto futures (regulated US contracts, monthly rollover) ─
  { root: "BTC", name: "Bitcoin (CME)",             category: "crypto",    exchange: "CME",   tickSize: 5.0,     multiplier: 5,         tickValue: 25.0,   validMonths: MONTHS_ALL },
  { root: "MBT", name: "Micro Bitcoin (CME)",       category: "crypto",    exchange: "CME",   tickSize: 5.0,     multiplier: 0.1,       tickValue: 0.5,    validMonths: MONTHS_ALL },
  { root: "ETH", name: "Ether (CME)",               category: "crypto",    exchange: "CME",   tickSize: 0.5,     multiplier: 50,        tickValue: 25.0,   validMonths: MONTHS_ALL },
  { root: "MET", name: "Micro Ether (CME)",         category: "crypto",    exchange: "CME",   tickSize: 0.5,     multiplier: 0.1,       tickValue: 0.05,   validMonths: MONTHS_ALL },
];

// Roots indexed for O(1) lookup. Longest-first sort keeps
// `contractRoot('MNQM6')` from matching 'MN' before 'MNQ'.
const BY_ROOT: Record<string, ContractSpec> = Object.fromEntries(
  SPECS.map((s) => [s.root, s]),
);

/** Extracts the contract root from a Rithmic-style symbol.
 *  "MNQM6" → "MNQ", "ES" → "ES", "MNQ.CME" → "MNQ".
 *  Tries the longest known root first so micros (MNQ) win over
 *  any prefix shadow.
 */
export function contractRoot(symbol: string): string {
  const noExchange = symbol.split(".")[0]?.toUpperCase() ?? "";
  if (!noExchange) return "";
  const candidates = Object.keys(BY_ROOT).sort((a, b) => b.length - a.length);
  for (const root of candidates) {
    if (noExchange.startsWith(root)) {
      return root;
    }
  }
  return noExchange;
}

/** Looks up a spec by raw symbol. Falls back to a generic 1-point
 *  multiplier so unknown contracts still trade (with rough PnL). */
export function getContractSpec(symbol: string): ContractSpec {
  const root = contractRoot(symbol);
  const hit = BY_ROOT[root];
  if (hit) return hit;
  return {
    root: root || symbol,
    name: root || symbol,
    category: "indices",
    exchange: "CME",
    tickSize: 0.25,
    multiplier: 1,
    tickValue: 0.25,
    validMonths: [],
  };
}

/** Computes signed PnL in dollars for a position. */
export function computePnl(
  spec: ContractSpec,
  side: "long" | "short",
  entryPrice: number,
  currentPrice: number,
  qty: number,
): number {
  const diff = side === "long" ? currentPrice - entryPrice : entryPrice - currentPrice;
  return diff * spec.multiplier * qty;
}
