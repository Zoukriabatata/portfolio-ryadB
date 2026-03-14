// ─── Simulation Engine ────────────────────────────────────────────────────────
// Generates realistic-looking footprint candle data for visual testing.
// No WebSocket or REST dependency.

export interface SimLevel {
  price: number;
  bidVol: number;
  askVol: number;
}

export interface SimCandle {
  time: number;       // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  totalVol: number;
  delta: number;      // sum(askVol - bidVol)
  levels: SimLevel[];
  poc: number;        // price with highest total volume
  sessionStart?: boolean;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function boxMuller(): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randNormal(mean: number, std: number): number {
  return mean + boxMuller() * std;
}

function roundTo(value: number, tick: number): number {
  return Math.round(value / tick) * tick;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateSimCandles(
  count     = 60,
  startPrice = 95000,
  tickSize   = 10,
  tfSeconds  = 300,   // 5-minute candles
): SimCandle[] {
  const candles: SimCandle[] = [];
  let price = startPrice;

  // Trend state
  let trendDir   = 1;
  let trendLeft  = Math.floor(Math.random() * 6) + 4;
  let volatility = price * 0.0018;

  const startTime = Math.floor(Date.now() / 1000) - count * tfSeconds;

  for (let i = 0; i < count; i++) {
    // ── Trend management ─────────────────────────────────────────────────────
    if (trendLeft <= 0) {
      trendDir   = Math.random() > 0.45 ? -trendDir : trendDir; // sometimes continue
      trendLeft  = Math.floor(Math.random() * 7) + 3;
      volatility = price * (0.001 + Math.random() * 0.002);
    }
    trendLeft--;

    // ── OHLC ─────────────────────────────────────────────────────────────────
    const isBullish   = Math.random() < (trendDir > 0 ? 0.62 : 0.38);
    const atr         = volatility;
    const bodySize    = atr * (0.4 + Math.random() * 0.8);
    const wickFactor  = 0.15 + Math.random() * 0.4;

    const open  = roundTo(price, tickSize);
    const close = roundTo(open + (isBullish ? 1 : -1) * bodySize, tickSize);
    const high  = roundTo(Math.max(open, close) + bodySize * wickFactor, tickSize);
    const low   = roundTo(Math.min(open, close) - bodySize * wickFactor, tickSize);

    // ── Volume ────────────────────────────────────────────────────────────────
    // Higher volume at trend reversals and session starts
    const isReversal = trendLeft === 0;
    const baseMult   = isReversal ? 2.5 : 1.0;
    const totalVol   = baseMult * (200 + Math.random() * 1500);

    // ── Price levels ──────────────────────────────────────────────────────────
    const numLevels  = Math.max(2, Math.round((high - low) / tickSize) + 1);
    const pocOffset  = isBullish
      ? 0.25 + Math.random() * 0.25  // bullish: POC in lower third
      : 0.5  + Math.random() * 0.25; // bearish: POC in upper portion
    const poc = roundTo(low + (high - low) * pocOffset, tickSize);

    const levels: SimLevel[] = [];
    let totalUsed = 0;

    for (let j = 0; j < numLevels; j++) {
      const levelPrice = roundTo(low + j * tickSize, tickSize);
      // Gaussian weight around POC
      const distFraction = Math.abs(levelPrice - poc) / Math.max(high - low, tickSize);
      const weight = Math.exp(-distFraction * distFraction * 8);
      // Add slight noise
      const noiseWeight = weight * (0.7 + Math.random() * 0.6);
      const levelVol    = totalVol * noiseWeight;

      // Bid/ask split — ask-heavy on bullish levels, bid-heavy on bearish
      const askBias  = isBullish ? 0.52 + Math.random() * 0.12 : 0.38 + Math.random() * 0.12;
      const askVol   = levelVol * askBias;
      const bidVol   = levelVol * (1 - askBias);

      levels.push({ price: levelPrice, bidVol, askVol });
      totalUsed += levelVol;
    }

    // Normalize to actual totalVol
    const scale = totalVol / Math.max(totalUsed, 1);
    levels.forEach(l => {
      l.bidVol *= scale;
      l.askVol *= scale;
    });

    const delta = levels.reduce((s, l) => s + l.askVol - l.bidVol, 0);

    candles.push({
      time: startTime + i * tfSeconds,
      open, high, low, close,
      totalVol,
      delta,
      levels,
      poc,
      sessionStart: i > 0 && i % 18 === 0,
    });

    price = close;
  }

  return candles;
}
