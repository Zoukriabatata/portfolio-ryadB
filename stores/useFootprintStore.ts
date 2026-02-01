import { create } from 'zustand';
import type {
  ImbalanceCell,
  StackedImbalance,
  AbsorptionEvent,
  NakedPOC,
  FootprintSettings,
  FootprintStyleConfig,
} from '@/types/footprint';
import { DEFAULT_FOOTPRINT_SETTINGS, DEFAULT_STYLE_CONFIG } from '@/types/footprint';
import { detectCandleImbalances, detectStackedImbalances } from '@/lib/calculations/imbalance';
import { AbsorptionTracker } from '@/lib/calculations/absorption';

export interface FootprintLevel {
  price: number;
  bidVolume: number;  // Sell volume (taker sells)
  askVolume: number;  // Buy volume (taker buys)
  delta: number;      // askVolume - bidVolume
}

export interface FootprintCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: Map<number, FootprintLevel>;  // price -> level data
  totalBidVolume: number;
  totalAskVolume: number;
  totalDelta: number;
  poc: number;  // Point of Control (price with highest volume)
  // Advanced data
  imbalances: ImbalanceCell[];
  stackedImbalances: StackedImbalance[];
}

interface FootprintState {
  // Footprint data
  candles: FootprintCandle[];
  tickSize: number;  // Price aggregation level

  // Volume profile (session-wide)
  volumeProfile: Map<number, { bidVolume: number; askVolume: number }>;
  sessionPOC: number;

  // Advanced analysis data
  nakedPOCs: NakedPOC[];
  absorptionEvents: AbsorptionEvent[];
  cumulativeDelta: { time: number; delta: number }[];

  // Settings
  maxCandles: number;
  settings: FootprintSettings;

  // Actions
  setTickSize: (tickSize: number) => void;
  setSettings: (settings: Partial<FootprintSettings>) => void;
  processTradeForFootprint: (trade: {
    price: number;
    quantity: number;
    time: number;
    isBuyerMaker: boolean;
  }, candleTime: number, ohlc: { open: number; high: number; low: number; close: number }) => void;
  createNewCandle: (time: number, ohlc: { open: number; high: number; low: number; close: number }) => void;
  updateNakedPOCs: (currentPrice: number) => void;
  addAbsorptionEvent: (event: AbsorptionEvent) => void;
  reset: () => void;
}

const MAX_CANDLES = 1440; // 1440 minutes = 24h of 1m candles
const DEFAULT_TICK_SIZE = 10; // $10 for BTC
const MAX_NAKED_POCS = 50;
const MAX_ABSORPTION_EVENTS = 100;

// Round price to tick size
function roundToTick(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

// Absorption tracker singleton
let absorptionTracker: AbsorptionTracker | null = null;

export const useFootprintStore = create<FootprintState>((set, get) => ({
  candles: [],
  tickSize: DEFAULT_TICK_SIZE,
  volumeProfile: new Map(),
  sessionPOC: 0,
  maxCandles: MAX_CANDLES,
  nakedPOCs: [],
  absorptionEvents: [],
  cumulativeDelta: [],
  settings: { ...DEFAULT_FOOTPRINT_SETTINGS },

  setTickSize: (tickSize) => {
    set({ tickSize });
    // Reset absorption tracker with new tick size
    absorptionTracker = new AbsorptionTracker(5000, 100, 3, tickSize);
  },

  setSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  processTradeForFootprint: (trade, candleTime, ohlc) => {
    const { tickSize, candles, volumeProfile, settings, cumulativeDelta, nakedPOCs } = get();
    const roundedPrice = roundToTick(trade.price, tickSize);

    // Initialize absorption tracker if needed
    if (!absorptionTracker) {
      absorptionTracker = new AbsorptionTracker(5000, settings.absorptionVolumeThreshold, 3, tickSize);
    }

    // Check for absorption
    const absorptionEvent = absorptionTracker.addTrade({
      id: `${trade.time}-${trade.price}`,
      price: trade.price,
      quantity: trade.quantity,
      time: trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    });

    if (absorptionEvent) {
      get().addAbsorptionEvent(absorptionEvent);
    }

    // Track if this is a new candle
    const isNewCandle = !candles.find(c => c.time === candleTime);

    // If new candle, add previous candle's POC to naked POCs
    if (isNewCandle && candles.length > 0) {
      const prevCandle = candles[candles.length - 1];
      if (prevCandle.poc > 0) {
        const pocVolume = prevCandle.levels.get(prevCandle.poc);
        const newNakedPOC: NakedPOC = {
          price: prevCandle.poc,
          candleTime: prevCandle.time,
          volume: pocVolume ? pocVolume.bidVolume + pocVolume.askVolume : 0,
          tested: false,
        };
        set((state) => ({
          nakedPOCs: [...state.nakedPOCs.slice(-MAX_NAKED_POCS), newNakedPOC],
        }));
      }
    }

    // Find or create candle for this time
    let candle = candles.find(c => c.time === candleTime);

    if (!candle) {
      candle = {
        time: candleTime,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        levels: new Map(),
        totalBidVolume: 0,
        totalAskVolume: 0,
        totalDelta: 0,
        poc: roundedPrice,
        imbalances: [],
        stackedImbalances: [],
      };
      candles.push(candle);
    }

    // Update OHLC
    candle.high = Math.max(candle.high, ohlc.high);
    candle.low = Math.min(candle.low, ohlc.low);
    candle.close = ohlc.close;

    // Get or create level
    let level = candle.levels.get(roundedPrice);
    if (!level) {
      level = {
        price: roundedPrice,
        bidVolume: 0,
        askVolume: 0,
        delta: 0,
      };
      candle.levels.set(roundedPrice, level);
    }

    // isBuyerMaker = true means the trade was initiated by a seller (bid volume)
    // isBuyerMaker = false means the trade was initiated by a buyer (ask volume)
    if (trade.isBuyerMaker) {
      level.bidVolume += trade.quantity;
      candle.totalBidVolume += trade.quantity;
    } else {
      level.askVolume += trade.quantity;
      candle.totalAskVolume += trade.quantity;
    }
    level.delta = level.askVolume - level.bidVolume;
    candle.totalDelta = candle.totalAskVolume - candle.totalBidVolume;

    // Update POC (price with highest total volume)
    let maxVolume = 0;
    candle.levels.forEach((lvl, price) => {
      const totalVol = lvl.bidVolume + lvl.askVolume;
      if (totalVol > maxVolume) {
        maxVolume = totalVol;
        candle!.poc = price;
      }
    });

    // Detect imbalances
    candle.imbalances = detectCandleImbalances(candle.levels, settings.imbalanceRatio);

    // Detect stacked imbalances
    candle.stackedImbalances = detectStackedImbalances(
      candle.levels,
      tickSize,
      settings.imbalanceRatio,
      settings.stackedMinLevels
    ).map(s => ({ ...s, candleTime }));

    // Update session volume profile
    let vpLevel = volumeProfile.get(roundedPrice);
    if (!vpLevel) {
      vpLevel = { bidVolume: 0, askVolume: 0 };
      volumeProfile.set(roundedPrice, vpLevel);
    }
    if (trade.isBuyerMaker) {
      vpLevel.bidVolume += trade.quantity;
    } else {
      vpLevel.askVolume += trade.quantity;
    }

    // Update session POC
    let sessionMaxVol = 0;
    let newSessionPOC = get().sessionPOC;
    volumeProfile.forEach((vp, price) => {
      const total = vp.bidVolume + vp.askVolume;
      if (total > sessionMaxVol) {
        sessionMaxVol = total;
        newSessionPOC = price;
      }
    });

    // Update cumulative delta
    const lastCumDelta = cumulativeDelta.length > 0 ? cumulativeDelta[cumulativeDelta.length - 1].delta : 0;
    const tradeDelta = trade.isBuyerMaker ? -trade.quantity : trade.quantity;
    const newCumDelta = [...cumulativeDelta, { time: candleTime, delta: lastCumDelta + tradeDelta }];

    // Update naked POCs (mark as tested if price touches them)
    get().updateNakedPOCs(trade.price);

    // Trim old candles
    const trimmedCandles = candles.slice(-MAX_CANDLES);

    set({
      candles: trimmedCandles,
      volumeProfile,
      sessionPOC: newSessionPOC,
      cumulativeDelta: newCumDelta.slice(-1000), // Keep last 1000 points
    });
  },

  createNewCandle: (time, ohlc) => {
    const { candles, tickSize } = get();
    const roundedPrice = roundToTick(ohlc.close, tickSize);

    const newCandle: FootprintCandle = {
      time,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      levels: new Map(),
      totalBidVolume: 0,
      totalAskVolume: 0,
      totalDelta: 0,
      poc: roundedPrice,
      imbalances: [],
      stackedImbalances: [],
    };

    set({
      candles: [...candles.slice(-(MAX_CANDLES - 1)), newCandle],
    });
  },

  updateNakedPOCs: (currentPrice) => {
    set((state) => ({
      nakedPOCs: state.nakedPOCs.map(poc => {
        if (!poc.tested && Math.abs(currentPrice - poc.price) <= state.tickSize) {
          return { ...poc, tested: true };
        }
        return poc;
      }),
    }));
  },

  addAbsorptionEvent: (event) => {
    set((state) => ({
      absorptionEvents: [...state.absorptionEvents.slice(-MAX_ABSORPTION_EVENTS), event],
    }));
  },

  reset: () => {
    absorptionTracker?.reset();
    set({
      candles: [],
      volumeProfile: new Map(),
      sessionPOC: 0,
      nakedPOCs: [],
      absorptionEvents: [],
      cumulativeDelta: [],
    });
  },
}));
