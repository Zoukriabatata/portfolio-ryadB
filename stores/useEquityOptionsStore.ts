import { create } from 'zustand';
import type { EquitySymbol, EquityOptionData, VolatilitySkewPoint, GEXData, GEXSummary } from '@/types/options';

interface EquityOptionsState {
  symbol: EquitySymbol;
  selectedExpiration: number | null; // Unix timestamp
  expirations: number[];
  calls: EquityOptionData[];
  puts: EquityOptionData[];
  underlyingPrice: number;
  isLoading: boolean;
  error: string | null;

  // GEX data
  gexData: GEXData[];
  gexSummary: GEXSummary | null;

  // Actions
  setSymbol: (symbol: EquitySymbol) => void;
  setSelectedExpiration: (expiration: number | null) => void;
  setExpirations: (expirations: number[]) => void;
  setOptions: (calls: EquityOptionData[], puts: EquityOptionData[], underlyingPrice: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Computed
  getVolatilitySkew: () => VolatilitySkewPoint[];
  getATMStrike: () => number | null;
  calculateGEX: () => void;
}

// GEX calculation constants
const CONTRACT_MULTIPLIER = 100; // Standard equity options multiplier

export const useEquityOptionsStore = create<EquityOptionsState>((set, get) => ({
  symbol: 'SPY',
  selectedExpiration: null,
  expirations: [],
  calls: [],
  puts: [],
  underlyingPrice: 0,
  isLoading: false,
  error: null,
  gexData: [],
  gexSummary: null,

  setSymbol: (symbol) => set({ symbol }),

  setSelectedExpiration: (expiration) => set({ selectedExpiration: expiration }),

  setExpirations: (expirations) => {
    set({ expirations });
    const current = get().selectedExpiration;
    if (!current && expirations.length > 0) {
      set({ selectedExpiration: expirations[0] });
    }
  },

  setOptions: (calls, puts, underlyingPrice) => {
    set({ calls, puts, underlyingPrice });
    get().calculateGEX();
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () => set({
    selectedExpiration: null,
    expirations: [],
    calls: [],
    puts: [],
    underlyingPrice: 0,
    isLoading: false,
    error: null,
    gexData: [],
    gexSummary: null,
  }),

  getVolatilitySkew: () => {
    const { calls, puts, underlyingPrice } = get();
    if (calls.length === 0 && puts.length === 0) return [];

    const spotPrice = underlyingPrice || 1;
    const byStrike = new Map<number, { callIV?: number; putIV?: number }>();

    calls.forEach((opt) => {
      if (!byStrike.has(opt.strike)) {
        byStrike.set(opt.strike, {});
      }
      byStrike.get(opt.strike)!.callIV = opt.impliedVolatility;
    });

    puts.forEach((opt) => {
      if (!byStrike.has(opt.strike)) {
        byStrike.set(opt.strike, {});
      }
      byStrike.get(opt.strike)!.putIV = opt.impliedVolatility;
    });

    const skewData: VolatilitySkewPoint[] = [];
    byStrike.forEach((ivs, strike) => {
      skewData.push({
        strike,
        callIV: ivs.callIV ?? null,
        putIV: ivs.putIV ?? null,
        moneyness: strike / spotPrice,
      });
    });

    skewData.sort((a, b) => a.strike - b.strike);
    return skewData;
  },

  getATMStrike: () => {
    const { calls, puts, underlyingPrice } = get();
    if ((calls.length === 0 && puts.length === 0) || !underlyingPrice) return null;

    const allStrikes = new Set([...calls.map((o) => o.strike), ...puts.map((o) => o.strike)]);
    const strikes = Array.from(allStrikes);
    if (strikes.length === 0) return null;

    let closestStrike = strikes[0];
    let minDiff = Math.abs(strikes[0] - underlyingPrice);

    strikes.forEach((strike) => {
      const diff = Math.abs(strike - underlyingPrice);
      if (diff < minDiff) {
        minDiff = diff;
        closestStrike = strike;
      }
    });

    return closestStrike;
  },

  calculateGEX: () => {
    const { calls, puts, underlyingPrice } = get();
    if (calls.length === 0 && puts.length === 0) {
      set({ gexData: [], gexSummary: null });
      return;
    }

    const spotPrice = underlyingPrice || 1;
    const byStrike = new Map<number, { call?: EquityOptionData; put?: EquityOptionData }>();

    calls.forEach((opt) => {
      if (!byStrike.has(opt.strike)) byStrike.set(opt.strike, {});
      byStrike.get(opt.strike)!.call = opt;
    });

    puts.forEach((opt) => {
      if (!byStrike.has(opt.strike)) byStrike.set(opt.strike, {});
      byStrike.get(opt.strike)!.put = opt;
    });

    const gexData: GEXData[] = [];
    let totalCallGEX = 0;
    let totalPutGEX = 0;
    let maxPosGEX = -Infinity;
    let maxNegGEX = Infinity;
    let posGEXStrike: number | null = null;
    let negGEXStrike: number | null = null;

    byStrike.forEach((opts, strike) => {
      // Approximate gamma using Black-Scholes approximation
      // For simplicity, we use IV-based gamma estimation
      const callOI = opts.call?.openInterest || 0;
      const putOI = opts.put?.openInterest || 0;
      const callIV = opts.call?.impliedVolatility || 0.3;
      const putIV = opts.put?.impliedVolatility || 0.3;

      // Simplified gamma calculation
      const moneyness = strike / spotPrice;
      const daysToExp = 30; // Approximate
      const sqrtT = Math.sqrt(daysToExp / 365);

      // Approximate gamma (peaks at ATM)
      const d1Call = (Math.log(spotPrice / strike) + 0.5 * callIV * callIV * (daysToExp / 365)) / (callIV * sqrtT);
      const d1Put = (Math.log(spotPrice / strike) + 0.5 * putIV * putIV * (daysToExp / 365)) / (putIV * sqrtT);

      const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

      const callGamma = callIV > 0 ? normPdf(d1Call) / (spotPrice * callIV * sqrtT) : 0;
      const putGamma = putIV > 0 ? normPdf(d1Put) / (spotPrice * putIV * sqrtT) : 0;

      // GEX = Gamma * OI * Spot^2 * 0.01 * Contract Multiplier
      // Calls: dealers are short gamma (positive GEX = stabilizing)
      // Puts: dealers are long gamma (negative GEX = destabilizing)
      const callGEX = callGamma * callOI * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;
      const putGEX = -putGamma * putOI * spotPrice * spotPrice * 0.01 * CONTRACT_MULTIPLIER;
      const netGEX = callGEX + putGEX;

      totalCallGEX += callGEX;
      totalPutGEX += Math.abs(putGEX);

      if (netGEX > maxPosGEX) {
        maxPosGEX = netGEX;
        posGEXStrike = strike;
      }
      if (netGEX < maxNegGEX) {
        maxNegGEX = netGEX;
        negGEXStrike = strike;
      }

      gexData.push({
        strike,
        callGEX,
        putGEX,
        netGEX,
        callOI,
        putOI,
        callGamma,
        putGamma,
      });
    });

    gexData.sort((a, b) => a.strike - b.strike);

    // Find zero gamma level (where net GEX crosses zero)
    let zeroGammaLevel: number | null = null;
    for (let i = 0; i < gexData.length - 1; i++) {
      const curr = gexData[i];
      const next = gexData[i + 1];
      if ((curr.netGEX >= 0 && next.netGEX < 0) || (curr.netGEX < 0 && next.netGEX >= 0)) {
        // Linear interpolation
        const ratio = Math.abs(curr.netGEX) / (Math.abs(curr.netGEX) + Math.abs(next.netGEX));
        zeroGammaLevel = curr.strike + ratio * (next.strike - curr.strike);
        break;
      }
    }

    const netGEX = totalCallGEX - totalPutGEX;
    const gexRatio = totalPutGEX !== 0 ? totalCallGEX / totalPutGEX : 0;

    set({
      gexData,
      gexSummary: {
        totalCallGEX,
        totalPutGEX,
        netGEX,
        gexRatio,
        zeroGammaLevel,
        maxGammaStrike: posGEXStrike,
        posGEXStrike,
        negGEXStrike,
      },
    });
  },
}));
