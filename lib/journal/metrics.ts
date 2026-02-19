/**
 * Server-side journal metrics computation
 */

interface TradeEntry {
  pnl: number | null;
  entryTime: Date;
  symbol: string;
  side: string;
  setup: string | null;
  emotions: string | null;
}

interface FieldStats {
  key: string;
  pnl: number;
  count: number;
  winRate: number;
  profitFactor: number;
}

function groupByField(trades: TradeEntry[], field: 'symbol' | 'setup' | 'emotions'): FieldStats[] {
  const groups = new Map<string, TradeEntry[]>();
  for (const t of trades) {
    const key = (t[field] as string) || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return Array.from(groups.entries()).map(([key, entries]) => {
    const closed = entries.filter(e => e.pnl !== null);
    const wins = closed.filter(e => e.pnl! > 0);
    const grossProfit = wins.reduce((s, e) => s + e.pnl!, 0);
    const grossLoss = Math.abs(closed.filter(e => e.pnl! < 0).reduce((s, e) => s + e.pnl!, 0));

    return {
      key,
      pnl: closed.reduce((s, e) => s + e.pnl!, 0),
      count: closed.length,
      winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
      profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
    };
  }).sort((a, b) => b.pnl - a.pnl);
}

export function computeAnalytics(entries: TradeEntry[]) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime()
  );
  const closedTrades = sorted.filter(e => e.pnl !== null);

  if (closedTrades.length === 0) {
    return {
      equityCurve: [],
      drawdown: [],
      byHour: [],
      byDayOfWeek: [],
      bySymbol: [],
      bySetup: [],
      byEmotion: [],
      streaks: { currentWin: 0, currentLoss: 0, maxWin: 0, maxLoss: 0 },
      metrics: {
        profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0, maxDrawdownPct: 0,
        expectancy: 0, avgRR: 0, bestTrade: 0, worstTrade: 0, avgWin: 0, avgLoss: 0,
      },
    };
  }

  // Equity curve
  let cumPnl = 0;
  const equityCurve = closedTrades.map(e => {
    cumPnl += e.pnl!;
    return {
      date: new Date(e.entryTime).toISOString().slice(0, 10),
      cumulativePnl: Math.round(cumPnl * 100) / 100,
    };
  });

  // Drawdown
  let peak = 0;
  const drawdown = equityCurve.map(point => {
    if (point.cumulativePnl > peak) peak = point.cumulativePnl;
    const dd = point.cumulativePnl - peak;
    return {
      date: point.date,
      drawdown: Math.round(dd * 100) / 100,
      drawdownPct: peak > 0 ? Math.round((dd / peak) * 1000) / 10 : 0,
    };
  });

  const maxDrawdown = Math.min(...drawdown.map(d => d.drawdown), 0);
  const maxDrawdownPct = Math.min(...drawdown.map(d => d.drawdownPct), 0);

  // Profit Factor
  const wins = closedTrades.filter(e => e.pnl! > 0);
  const losses = closedTrades.filter(e => e.pnl! < 0);
  const grossProfit = wins.reduce((s, e) => s + e.pnl!, 0);
  const grossLoss = Math.abs(losses.reduce((s, e) => s + e.pnl!, 0));
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;

  // Sharpe Ratio (simplified daily)
  const dailyPnlMap = new Map<string, number>();
  for (const t of closedTrades) {
    const dateKey = new Date(t.entryTime).toISOString().slice(0, 10);
    dailyPnlMap.set(dateKey, (dailyPnlMap.get(dateKey) || 0) + t.pnl!);
  }
  const dailyReturns = Array.from(dailyPnlMap.values());
  const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length;
  const stdev = Math.sqrt(variance);
  const sharpeRatio = stdev > 0 ? Math.round((meanReturn / stdev) * Math.sqrt(252) * 100) / 100 : 0;

  // Win/Loss stats
  const avgWin = wins.length > 0 ? Math.round((wins.reduce((s, e) => s + e.pnl!, 0) / wins.length) * 100) / 100 : 0;
  const avgLoss = losses.length > 0 ? Math.round((losses.reduce((s, e) => s + e.pnl!, 0) / losses.length) * 100) / 100 : 0;
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;

  // Expectancy
  const expectancy = Math.round(((winRate * avgWin) + ((1 - winRate) * avgLoss)) * 100) / 100;

  // Average R:R
  const avgRR = avgLoss !== 0 ? Math.round((avgWin / Math.abs(avgLoss)) * 100) / 100 : 0;

  // Best/worst
  const bestTrade = Math.max(...closedTrades.map(e => e.pnl!));
  const worstTrade = Math.min(...closedTrades.map(e => e.pnl!));

  // Streaks
  let currentWin = 0, currentLoss = 0, maxWin = 0, maxLoss = 0;
  let streak = 0;
  for (const t of closedTrades) {
    if (t.pnl! > 0) {
      streak = streak > 0 ? streak + 1 : 1;
      maxWin = Math.max(maxWin, streak);
    } else if (t.pnl! < 0) {
      streak = streak < 0 ? streak - 1 : -1;
      maxLoss = Math.max(maxLoss, Math.abs(streak));
    }
  }
  // Current streak from last trades
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    if (closedTrades[i].pnl! > 0) {
      if (currentLoss > 0) break;
      currentWin++;
    } else if (closedTrades[i].pnl! < 0) {
      if (currentWin > 0) break;
      currentLoss++;
    }
  }

  // By Hour
  const hourMap = new Map<number, { pnl: number; count: number; wins: number }>();
  for (const t of closedTrades) {
    const h = new Date(t.entryTime).getHours();
    const existing = hourMap.get(h) || { pnl: 0, count: 0, wins: 0 };
    existing.pnl += t.pnl!;
    existing.count++;
    if (t.pnl! > 0) existing.wins++;
    hourMap.set(h, existing);
  }
  const byHour = Array.from(hourMap.entries())
    .map(([hour, data]) => ({
      hour,
      pnl: Math.round(data.pnl * 100) / 100,
      count: data.count,
      winRate: Math.round((data.wins / data.count) * 1000) / 10,
    }))
    .sort((a, b) => a.hour - b.hour);

  // By Day of Week
  const dayMap = new Map<number, { pnl: number; count: number }>();
  for (const t of closedTrades) {
    const d = new Date(t.entryTime).getDay();
    const existing = dayMap.get(d) || { pnl: 0, count: 0 };
    existing.pnl += t.pnl!;
    existing.count++;
    dayMap.set(d, existing);
  }
  const byDayOfWeek = Array.from(dayMap.entries())
    .map(([day, data]) => ({
      day,
      pnl: Math.round(data.pnl * 100) / 100,
      count: data.count,
    }))
    .sort((a, b) => a.day - b.day);

  // By field
  const bySymbol = groupByField(closedTrades, 'symbol').map(s => ({ symbol: s.key, ...s }));
  const bySetup = groupByField(closedTrades, 'setup').map(s => ({ setup: s.key, ...s }));
  const byEmotion = groupByField(closedTrades, 'emotions').map(s => ({ emotion: s.key, ...s }));

  return {
    equityCurve,
    drawdown,
    byHour,
    byDayOfWeek,
    bySymbol,
    bySetup,
    byEmotion,
    streaks: { currentWin, currentLoss, maxWin, maxLoss },
    metrics: {
      profitFactor, sharpeRatio, maxDrawdown, maxDrawdownPct,
      expectancy, avgRR, bestTrade, worstTrade, avgWin, avgLoss,
    },
  };
}
