import { create } from 'zustand';
import type { OptionData, GEXData, GEXSummary } from '@/types/options';
import {
  calculateGEXByStrike,
  calculateGEXSummary,
  getGEXChartData,
} from '@/lib/calculations/gex';

interface GEXState {
  // GEX data
  gexByStrike: Map<number, GEXData>;
  gexChartData: GEXData[];
  summary: GEXSummary | null;

  // Spot price used for calculation
  spotPrice: number;

  // Actions
  calculateGEX: (options: OptionData[], spotPrice: number) => void;
  reset: () => void;
}

export const useGEXStore = create<GEXState>((set) => ({
  gexByStrike: new Map(),
  gexChartData: [],
  summary: null,
  spotPrice: 0,

  calculateGEX: (options, spotPrice) => {
    // Calculate GEX by strike
    const gexByStrike = calculateGEXByStrike(options, spotPrice);

    // Calculate summary
    const summary = calculateGEXSummary(gexByStrike);

    // Get chart data
    const gexChartData = getGEXChartData(gexByStrike);

    set({
      gexByStrike,
      gexChartData,
      summary,
      spotPrice,
    });
  },

  reset: () =>
    set({
      gexByStrike: new Map(),
      gexChartData: [],
      summary: null,
      spotPrice: 0,
    }),
}));
