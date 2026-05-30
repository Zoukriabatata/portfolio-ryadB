/** Curated list of US-listed underlyings with deep option markets on
 *  Alpaca. Grouped by category for the picker panel. */

export type SymbolEntry = {
  ticker: string;
  name: string;
};

export type SymbolCategory = {
  id: string;
  label: string;
  symbols: SymbolEntry[];
};

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  {
    id: "index-etf",
    label: "Index ETFs",
    symbols: [
      { ticker: "SPY", name: "S&P 500" },
      { ticker: "QQQ", name: "Nasdaq 100" },
      { ticker: "IWM", name: "Russell 2000" },
      { ticker: "DIA", name: "Dow Jones 30" },
      { ticker: "VXX", name: "VIX Short-Term" },
    ],
  },
  {
    id: "sector-etf",
    label: "Sector ETFs",
    symbols: [
      { ticker: "XLF", name: "Financials" },
      { ticker: "XLE", name: "Energy" },
      { ticker: "XLK", name: "Technology" },
      { ticker: "XLV", name: "Healthcare" },
      { ticker: "XLU", name: "Utilities" },
      { ticker: "XBI", name: "Biotech" },
      { ticker: "SMH", name: "Semiconductors" },
      { ticker: "ARKK", name: "ARK Innovation" },
    ],
  },
  {
    id: "commodity-bond",
    label: "Commodities & Bonds",
    symbols: [
      { ticker: "GLD", name: "Gold" },
      { ticker: "SLV", name: "Silver" },
      { ticker: "USO", name: "Crude Oil" },
      { ticker: "UNG", name: "Natural Gas" },
      { ticker: "TLT", name: "20+ Year Treasury" },
      { ticker: "HYG", name: "High Yield Bonds" },
    ],
  },
  {
    id: "mega-cap",
    label: "Mega Caps",
    symbols: [
      { ticker: "AAPL", name: "Apple" },
      { ticker: "MSFT", name: "Microsoft" },
      { ticker: "NVDA", name: "Nvidia" },
      { ticker: "AMZN", name: "Amazon" },
      { ticker: "GOOGL", name: "Alphabet" },
      { ticker: "META", name: "Meta" },
      { ticker: "TSLA", name: "Tesla" },
      { ticker: "AMD", name: "AMD" },
      { ticker: "NFLX", name: "Netflix" },
      { ticker: "AVGO", name: "Broadcom" },
    ],
  },
  {
    id: "finance",
    label: "Financials",
    symbols: [
      { ticker: "JPM", name: "JPMorgan" },
      { ticker: "BAC", name: "Bank of America" },
      { ticker: "GS", name: "Goldman Sachs" },
      { ticker: "V", name: "Visa" },
      { ticker: "MA", name: "Mastercard" },
    ],
  },
  {
    id: "crypto-prox",
    label: "Crypto-correlated",
    symbols: [
      { ticker: "COIN", name: "Coinbase" },
      { ticker: "MSTR", name: "MicroStrategy" },
      { ticker: "IBIT", name: "iShares Bitcoin Trust" },
    ],
  },
];

export const ALL_SYMBOLS: SymbolEntry[] = SYMBOL_CATEGORIES.flatMap(
  (c) => c.symbols,
);

export function lookupSymbolName(ticker: string): string | null {
  const t = ticker.toUpperCase();
  for (const cat of SYMBOL_CATEGORIES) {
    for (const s of cat.symbols) {
      if (s.ticker === t) return s.name;
    }
  }
  return null;
}
