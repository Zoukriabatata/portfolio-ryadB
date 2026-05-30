// Contract specs for CME futures used by the sim trading panel.
//
// PnL formula (single direction sense):
//   pnl = (currentPrice - entryPrice) * multiplier * qty       for LONG
//   pnl = (entryPrice - currentPrice) * multiplier * qty       for SHORT
//
// `tickSize` is the smallest legal price increment (used to display SL/TP
// inputs at the right granularity). `tickValue` = tickSize * multiplier
// is shown in the UI as "$ per tick".

export type ContractSpec = {
  root: string;
  name: string;
  tickSize: number;
  multiplier: number;
  tickValue: number; // = tickSize * multiplier
};

const SPECS: ContractSpec[] = [
  // ── Equity indices ──────────────────────────────────────
  { root: "ES",  name: "E-mini S&P 500",       tickSize: 0.25,  multiplier: 50,    tickValue: 12.5  },
  { root: "MES", name: "Micro E-mini S&P 500", tickSize: 0.25,  multiplier: 5,     tickValue: 1.25  },
  { root: "NQ",  name: "E-mini Nasdaq 100",    tickSize: 0.25,  multiplier: 20,    tickValue: 5.0   },
  { root: "MNQ", name: "Micro E-mini Nasdaq",  tickSize: 0.25,  multiplier: 2,     tickValue: 0.5   },
  { root: "RTY", name: "E-mini Russell 2000",  tickSize: 0.1,   multiplier: 50,    tickValue: 5.0   },
  { root: "M2K", name: "Micro Russell 2000",   tickSize: 0.1,   multiplier: 5,     tickValue: 0.5   },
  { root: "YM",  name: "E-mini Dow",           tickSize: 1.0,   multiplier: 5,     tickValue: 5.0   },
  { root: "MYM", name: "Micro Dow",            tickSize: 1.0,   multiplier: 0.5,   tickValue: 0.5   },

  // ── Energy ──────────────────────────────────────────────
  { root: "CL",  name: "Crude Oil WTI",        tickSize: 0.01,  multiplier: 1000,  tickValue: 10.0  },
  { root: "MCL", name: "Micro Crude Oil",      tickSize: 0.01,  multiplier: 100,   tickValue: 1.0   },
  { root: "NG",  name: "Natural Gas",          tickSize: 0.001, multiplier: 10000, tickValue: 10.0  },
  { root: "QM",  name: "E-mini Crude Oil",     tickSize: 0.025, multiplier: 500,   tickValue: 12.5  },

  // ── Metals ──────────────────────────────────────────────
  { root: "GC",  name: "Gold",                 tickSize: 0.1,   multiplier: 100,   tickValue: 10.0  },
  { root: "MGC", name: "Micro Gold",           tickSize: 0.1,   multiplier: 10,    tickValue: 1.0   },
  { root: "SI",  name: "Silver",               tickSize: 0.005, multiplier: 5000,  tickValue: 25.0  },
  { root: "SIL", name: "Micro Silver",         tickSize: 0.005, multiplier: 1000,  tickValue: 5.0   },
  { root: "HG",  name: "Copper",               tickSize: 0.0005,multiplier: 25000, tickValue: 12.5  },

  // ── Treasuries (price quoted as decimal of 1/32; we approximate
  //    with the contract's effective $/pt multiplier, traders just need
  //    a usable PnL number for sim) ──────────────────────
  { root: "ZB",  name: "30-Year T-Bond",       tickSize: 0.03125,multiplier: 1000, tickValue: 31.25 },
  { root: "ZN",  name: "10-Year T-Note",       tickSize: 0.015625, multiplier: 1000, tickValue: 15.625 },
  { root: "ZF",  name: "5-Year T-Note",        tickSize: 0.0078125,multiplier: 1000, tickValue: 7.8125 },

  // ── Currencies ──────────────────────────────────────────
  { root: "6E",  name: "Euro FX",              tickSize: 0.00005,multiplier: 125000,tickValue: 6.25 },
  { root: "6B",  name: "British Pound",        tickSize: 0.0001, multiplier: 62500, tickValue: 6.25 },
  { root: "6J",  name: "Japanese Yen",         tickSize: 0.0000005, multiplier: 12500000, tickValue: 6.25 },

  // ── Crypto (CME) ────────────────────────────────────────
  { root: "BTC", name: "Bitcoin",              tickSize: 5.0,   multiplier: 5,     tickValue: 25.0  },
  { root: "MBT", name: "Micro Bitcoin",        tickSize: 5.0,   multiplier: 0.1,   tickValue: 0.5   },
  { root: "ETH", name: "Ether",                tickSize: 0.5,   multiplier: 50,    tickValue: 25.0  },
  { root: "MET", name: "Micro Ether",          tickSize: 0.5,   multiplier: 0.1,   tickValue: 0.05  },
];

const BY_ROOT: Record<string, ContractSpec> = Object.fromEntries(
  SPECS.map((s) => [s.root, s]),
);

/** Extracts the contract root from a Rithmic symbol.
 *  "MNQM6" → "MNQ", "ES" → "ES", "MNQ.CME" → "MNQ".
 *  Strategy: strip exchange suffix, then trim 1-2 trailing
 *  month/year characters (single letter month + 1-2 digit year).
 */
export function contractRoot(symbol: string): string {
  const noExchange = symbol.split(".")[0]?.toUpperCase() ?? "";
  if (!noExchange) return "";
  // Try matches longest-root-first (e.g. "MNQM6" should match "MNQ" not "MN").
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
    tickSize: 0.25,
    multiplier: 1,
    tickValue: 0.25,
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
