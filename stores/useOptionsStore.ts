import { create } from 'zustand';
import type { OptionData, Currency, VolatilitySkewPoint } from '@/types/options';

interface OptionsState {
  // Current selection
  currency: Currency;
  selectedExpiration: string | null;
  expirations: string[];

  // Options data by expiration
  optionsByExpiration: Map<string, OptionData[]>;

  // Underlying price
  underlyingPrice: number;

  // Loading state
  isLoading: boolean;

  // Actions
  setCurrency: (currency: Currency) => void;
  setSelectedExpiration: (expiration: string | null) => void;
  setExpirations: (expirations: string[]) => void;
  setOptionsForExpiration: (expiration: string, options: OptionData[]) => void;
  updateOption: (option: OptionData) => void;
  setUnderlyingPrice: (price: number) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;

  // Computed/derived data
  getOptionsForSelectedExpiration: () => OptionData[];
  getVolatilitySkew: () => VolatilitySkewPoint[];
  getATMStrike: () => number | null;
}

export const useOptionsStore = create<OptionsState>((set, get) => ({
  currency: 'BTC',
  selectedExpiration: null,
  expirations: [],
  optionsByExpiration: new Map(),
  underlyingPrice: 0,
  isLoading: false,

  setCurrency: (currency) => set({ currency }),

  setSelectedExpiration: (expiration) => set({ selectedExpiration: expiration }),

  setExpirations: (expirations) => {
    set({ expirations });
    // Auto-select first expiration if none selected
    const current = get().selectedExpiration;
    if (!current && expirations.length > 0) {
      set({ selectedExpiration: expirations[0] });
    }
  },

  setOptionsForExpiration: (expiration, options) =>
    set((state) => {
      const newMap = new Map(state.optionsByExpiration);
      newMap.set(expiration, options);

      // Update underlying price from first option
      const underlyingPrice = options[0]?.underlyingPrice || state.underlyingPrice;

      return {
        optionsByExpiration: newMap,
        underlyingPrice,
      };
    }),

  updateOption: (option) =>
    set((state) => {
      const expiration = option.expiration;
      const existing = state.optionsByExpiration.get(expiration) || [];

      const index = existing.findIndex(
        (o) => o.instrumentName === option.instrumentName
      );

      let updated: OptionData[];
      if (index >= 0) {
        updated = [...existing];
        updated[index] = option;
      } else {
        updated = [...existing, option];
      }

      const newMap = new Map(state.optionsByExpiration);
      newMap.set(expiration, updated);

      return {
        optionsByExpiration: newMap,
        underlyingPrice: option.underlyingPrice || state.underlyingPrice,
      };
    }),

  setUnderlyingPrice: (price) => set({ underlyingPrice: price }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      selectedExpiration: null,
      expirations: [],
      optionsByExpiration: new Map(),
      underlyingPrice: 0,
      isLoading: false,
    }),

  getOptionsForSelectedExpiration: () => {
    const state = get();
    if (!state.selectedExpiration) return [];
    return state.optionsByExpiration.get(state.selectedExpiration) || [];
  },

  getVolatilitySkew: () => {
    const state = get();
    const options = state.getOptionsForSelectedExpiration();
    if (options.length === 0) return [];

    // Group by strike
    const byStrike = new Map<number, { call?: OptionData; put?: OptionData }>();

    options.forEach((opt) => {
      if (!byStrike.has(opt.strike)) {
        byStrike.set(opt.strike, {});
      }
      const entry = byStrike.get(opt.strike)!;
      if (opt.optionType === 'call') {
        entry.call = opt;
      } else {
        entry.put = opt;
      }
    });

    // Build skew data
    const skewData: VolatilitySkewPoint[] = [];
    const spotPrice = state.underlyingPrice || 1;

    byStrike.forEach((opts, strike) => {
      skewData.push({
        strike,
        callIV: opts.call?.markIV ?? null,
        putIV: opts.put?.markIV ?? null,
        moneyness: strike / spotPrice,
      });
    });

    // Sort by strike
    skewData.sort((a, b) => a.strike - b.strike);

    return skewData;
  },

  getATMStrike: () => {
    const state = get();
    const options = state.getOptionsForSelectedExpiration();
    if (options.length === 0 || !state.underlyingPrice) return null;

    // Find strike closest to underlying price
    const strikes = [...new Set(options.map((o) => o.strike))];
    let closestStrike = strikes[0];
    let minDiff = Math.abs(strikes[0] - state.underlyingPrice);

    strikes.forEach((strike) => {
      const diff = Math.abs(strike - state.underlyingPrice);
      if (diff < minDiff) {
        minDiff = diff;
        closestStrike = strike;
      }
    });

    return closestStrike;
  },
}));
