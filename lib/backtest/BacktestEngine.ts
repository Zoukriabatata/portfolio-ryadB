/**
 * BACKTEST ENGINE
 *
 * Server-side backtesting engine that simulates strategy execution
 * on historical candle data. Supports multiple strategies with
 * configurable parameters.
 */

// ============ TYPES ============

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestConfig {
  symbol: string;
  timeframe: string;
  strategy: string;
  startDate: string;
  endDate: string;
  initialBalance?: number;
  positionSize?: number; // % of balance per trade
  stopLossPercent?: number;
  takeProfitPercent?: number;
}

export interface SimulatedTrade {
  entryTime: number;
  exitTime: number;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  quantity: number;
  reason: string;
}

export interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdown: number;
  sharpeRatio: number;
  averageWin: number;
  averageLoss: number;
  equity: number[];
  trades: SimulatedTrade[];
}

// ============ INDICATORS ============

function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      result.push(sum / period);
    } else {
      const prev = result[i - 1]!;
      result.push((data[i] - prev) * multiplier + prev);
    }
  }
  return result;
}

function rsi(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(null);
    } else if (i === period) {
      const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss));
      }
    } else {
      // Use smoothed averages
      const prevRSI = result[i - 1]!;
      const prevAvgGain = (100 / (100 - prevRSI) - 1) > 0
        ? gains[gains.length - 2] : 0; // Simplified
      const avgGain = (prevAvgGain * (period - 1) + gains[gains.length - 1]) / period;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length; // Simplified
      if (avgLoss === 0) {
        result.push(100);
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss));
      }
    }
  }
  return result;
}

function atr(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
      result.push(null);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trueRanges.push(tr);

    if (i < period) {
      result.push(null);
    } else if (i === period) {
      result.push(trueRanges.slice(0, period + 1).reduce((a, b) => a + b, 0) / (period + 1));
    } else {
      const prev = result[i - 1]!;
      result.push((prev * (period - 1) + tr) / period);
    }
  }
  return result;
}

function vwap(candles: Candle[]): number[] {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  return candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
    return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : c.close;
  });
}

// ============ STRATEGY SIGNALS ============

type Signal = 'buy' | 'sell' | null;

function maCrossoverStrategy(candles: Candle[]): Signal[] {
  const closes = candles.map(c => c.close);
  const fastMA = ema(closes, 9);
  const slowMA = ema(closes, 21);

  return candles.map((_, i) => {
    if (i < 21 || !fastMA[i] || !slowMA[i] || !fastMA[i - 1] || !slowMA[i - 1]) return null;
    // Fast crosses above slow → buy
    if (fastMA[i - 1]! < slowMA[i - 1]! && fastMA[i]! > slowMA[i]!) return 'buy';
    // Fast crosses below slow → sell
    if (fastMA[i - 1]! > slowMA[i - 1]! && fastMA[i]! < slowMA[i]!) return 'sell';
    return null;
  });
}

function rsiStrategy(candles: Candle[]): Signal[] {
  const closes = candles.map(c => c.close);
  const rsiValues = rsi(closes, 14);

  return candles.map((_, i) => {
    if (i < 15 || !rsiValues[i] || !rsiValues[i - 1]) return null;
    // RSI crosses up from oversold → buy
    if (rsiValues[i - 1]! < 30 && rsiValues[i]! >= 30) return 'buy';
    // RSI crosses down from overbought → sell
    if (rsiValues[i - 1]! > 70 && rsiValues[i]! <= 70) return 'sell';
    return null;
  });
}

function breakoutStrategy(candles: Candle[]): Signal[] {
  const lookback = 20;
  return candles.map((c, i) => {
    if (i < lookback) return null;
    const recentCandles = candles.slice(i - lookback, i);
    const highestHigh = Math.max(...recentCandles.map(r => r.high));
    const lowestLow = Math.min(...recentCandles.map(r => r.low));

    if (c.close > highestHigh) return 'buy';
    if (c.close < lowestLow) return 'sell';
    return null;
  });
}

function footprintDeltaStrategy(candles: Candle[]): Signal[] {
  // Simulate delta using volume and price direction
  return candles.map((c, i) => {
    if (i < 5) return null;
    const recentCandles = candles.slice(i - 5, i + 1);
    const delta = recentCandles.reduce((sum, rc) => {
      const direction = rc.close >= rc.open ? 1 : -1;
      return sum + rc.volume * direction;
    }, 0);
    const avgVolume = recentCandles.reduce((sum, rc) => sum + rc.volume, 0) / recentCandles.length;

    // Strong positive delta divergence with price dipping → buy
    if (delta > avgVolume * 1.5 && c.close < c.open) return 'buy';
    // Strong negative delta divergence with price rising → sell
    if (delta < -avgVolume * 1.5 && c.close > c.open) return 'sell';
    return null;
  });
}

function vwapReversionStrategy(candles: Candle[]): Signal[] {
  const vwapValues = vwap(candles);
  const atrValues = atr(candles, 14);

  return candles.map((c, i) => {
    if (i < 14 || !atrValues[i]) return null;
    const deviation = c.close - vwapValues[i];
    const threshold = atrValues[i]! * 1.5;

    // Price significantly below VWAP → buy (mean reversion)
    if (deviation < -threshold) return 'buy';
    // Price significantly above VWAP → sell (mean reversion)
    if (deviation > threshold) return 'sell';
    return null;
  });
}

function imbalanceStackingStrategy(candles: Candle[]): Signal[] {
  return candles.map((c, i) => {
    if (i < 3) return null;
    const recent = candles.slice(i - 3, i + 1);

    // Check for 3+ consecutive bullish imbalances (close > open, volume increasing)
    const bullishImbalances = recent.filter((r, j) =>
      r.close > r.open && (j === 0 || r.volume > recent[j - 1].volume)
    );
    if (bullishImbalances.length >= 3) return 'buy';

    // Check for 3+ consecutive bearish imbalances
    const bearishImbalances = recent.filter((r, j) =>
      r.close < r.open && (j === 0 || r.volume > recent[j - 1].volume)
    );
    if (bearishImbalances.length >= 3) return 'sell';

    return null;
  });
}

const STRATEGY_MAP: Record<string, (candles: Candle[]) => Signal[]> = {
  ma_crossover: maCrossoverStrategy,
  rsi_oversold: rsiStrategy,
  breakout: breakoutStrategy,
  footprint_delta: footprintDeltaStrategy,
  vwap_reversion: vwapReversionStrategy,
  imbalance_stack: imbalanceStackingStrategy,
};

// ============ BACKTEST ENGINE ============

export function runBacktest(candles: Candle[], config: BacktestConfig): BacktestResult {
  const strategyFn = STRATEGY_MAP[config.strategy];
  if (!strategyFn) {
    throw new Error(`Unknown strategy: ${config.strategy}`);
  }

  const initialBalance = config.initialBalance || 10000;
  const positionSizePct = config.positionSize || 2; // 2% per trade
  const stopLossPct = config.stopLossPercent || 2;
  const takeProfitPct = config.takeProfitPercent || 4;

  const signals = strategyFn(candles);
  const trades: SimulatedTrade[] = [];
  const equity: number[] = [initialBalance];
  let balance = initialBalance;
  let position: {
    direction: 'long' | 'short';
    entryPrice: number;
    entryTime: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
  } | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Check if position should be closed (stop loss / take profit)
    if (position) {
      let exitPrice: number | null = null;
      let reason = '';

      if (position.direction === 'long') {
        if (candle.low <= position.stopLoss) {
          exitPrice = position.stopLoss;
          reason = 'Stop Loss';
        } else if (candle.high >= position.takeProfit) {
          exitPrice = position.takeProfit;
          reason = 'Take Profit';
        }
      } else {
        if (candle.high >= position.stopLoss) {
          exitPrice = position.stopLoss;
          reason = 'Stop Loss';
        } else if (candle.low <= position.takeProfit) {
          exitPrice = position.takeProfit;
          reason = 'Take Profit';
        }
      }

      // Check for reverse signal
      const signal = signals[i];
      if (!exitPrice && signal) {
        if (
          (position.direction === 'long' && signal === 'sell') ||
          (position.direction === 'short' && signal === 'buy')
        ) {
          exitPrice = candle.close;
          reason = 'Signal Reversal';
        }
      }

      if (exitPrice) {
        const pnl = position.direction === 'long'
          ? (exitPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - exitPrice) * position.quantity;
        const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;

        trades.push({
          entryTime: position.entryTime,
          exitTime: candle.time,
          direction: position.direction,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl,
          pnlPercent,
          quantity: position.quantity,
          reason,
        });

        balance += pnl;
        position = null;
      }
    }

    // Open new position if signal and no current position
    if (!position && signals[i]) {
      const signal = signals[i]!;
      const positionValue = balance * (positionSizePct / 100);
      const quantity = positionValue / candle.close;
      const entryPrice = candle.close;

      if (signal === 'buy') {
        position = {
          direction: 'long',
          entryPrice,
          entryTime: candle.time,
          quantity,
          stopLoss: entryPrice * (1 - stopLossPct / 100),
          takeProfit: entryPrice * (1 + takeProfitPct / 100),
        };
      } else {
        position = {
          direction: 'short',
          entryPrice,
          entryTime: candle.time,
          quantity,
          stopLoss: entryPrice * (1 + stopLossPct / 100),
          takeProfit: entryPrice * (1 - takeProfitPct / 100),
        };
      }
    }

    equity.push(balance);
  }

  // Close any remaining open position at last candle
  if (position && candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const pnl = position.direction === 'long'
      ? (exitPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - exitPrice) * position.quantity;

    trades.push({
      entryTime: position.entryTime,
      exitTime: lastCandle.time,
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      pnlPercent: (pnl / (position.entryPrice * position.quantity)) * 100,
      quantity: position.quantity,
      reason: 'End of Period',
    });
    balance += pnl;
    equity.push(balance);
  }

  // Calculate statistics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const totalWins = winningTrades.reduce((s, t) => s + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0));
  const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

  // Max drawdown
  let peak = equity[0];
  let maxDrawdown = 0;
  for (const eq of equity) {
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
    profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
    netProfit: balance - initialBalance,
    maxDrawdown,
    sharpeRatio,
    averageWin: avgWin,
    averageLoss: avgLoss,
    equity,
    trades,
  };
}
