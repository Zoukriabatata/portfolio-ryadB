// ─── Simulation Engine v2 ──────────────────────────────────────────────────────
// Realistic orderflow simulation — DeepChart / ATAS benchmark quality.
// Generates historically plausible footprint candles with institutional-grade
// microstructure: Gaussian volume profiles, directional bid/ask imbalance,
// absorption events, liquidity sweeps, and log-normal trade-size distributions.

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
  delta: number;      // sum(askVol − bidVol)
  levels: SimLevel[];
  poc: number;        // price level with highest total volume
  sessionStart?: boolean;
}

// ─── Statistical utilities ─────────────────────────────────────────────────────

function boxMuller(): number {
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randNormal(mean: number, std: number): number {
  return mean + boxMuller() * std;
}

// Log-normal sample: exp(N(mu, sigma))
function randLogNormal(mu: number, sigma: number): number {
  return Math.exp(randNormal(mu, sigma));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundTo(value: number, tick: number): number {
  return Math.round(value / tick) * tick;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Gaussian kernel weight for a given distance with a given sigma
function gaussian(dist: number, sigma: number): number {
  return Math.exp(-(dist * dist) / (2 * sigma * sigma));
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateSimCandles(
  count          = 60,
  startPrice     = 95000,
  tickSize       = 10,
  tfSeconds      = 300,     // 5-minute candles
  volatilityPts?: number,   // explicit ATR; derived from price if omitted
): SimCandle[] {
  const candles: SimCandle[] = [];
  let price = startPrice;

  // ── Markov regime: trend vs range ─────────────────────────────────────────
  // trend  : strong directional moves, high ATR multiplier
  // range  : tight back-and-forth, low ATR multiplier
  let regime     : 'trend' | 'range' = 'range';
  let regimeLeft = randInt(4, 12);
  let atrMult    = 1.0;  // regime-dependent ATR scaling

  // Trend state (within-regime direction bias)
  let trendDir  = 1;
  let trendLeft = randInt(4, 10);
  let baseVol = volatilityPts
    ?? Math.min(price * 0.0018, tickSize < 1 ? tickSize * 40 : Infinity);

  const startTime = Math.floor(Date.now() / 1000) - count * tfSeconds;

  // Inter-candle delta persistence: EMA of recent directional bias
  // Creates short autocorrelations (2–5 candle micro-trends) visible in real footprint data
  let prevDeltaBias = 0;

  for (let i = 0; i < count; i++) {
    // ── Regime transition ──────────────────────────────────────────────────────
    if (--regimeLeft <= 0) {
      if (regime === 'range' && Math.random() < 0.28) {
        regime = 'trend';
        regimeLeft = randInt(3, 8);
        atrMult    = 1.4 + Math.random() * 0.6; // trend: 1.4–2.0× ATR
      } else if (regime === 'trend' && Math.random() < 0.45) {
        regime = 'range';
        regimeLeft = randInt(5, 14);
        atrMult    = 0.5 + Math.random() * 0.35; // range: 0.5–0.85× ATR
      } else {
        regimeLeft = regime === 'trend' ? randInt(2, 5) : randInt(4, 9);
      }
    }

    // ── Trend management ───────────────────────────────────────────────────────
    if (trendLeft <= 0) {
      trendDir  = Math.random() > 0.45 ? -trendDir : trendDir;
      trendLeft = randInt(3, 10);
      const rawVol = price * (0.001 + Math.random() * 0.002);
      baseVol = volatilityPts
        ?? (tickSize < 1 ? Math.min(rawVol, tickSize * 40) : rawVol);
    }
    trendLeft--;

    // Persistence: recent delta bias nudges next candle direction by ±8% max
    const deltaPersist = Math.tanh(prevDeltaBias * 0.3) * 0.08;
    const isBullish    = Math.random() < (trendDir > 0 ? 0.62 : 0.38) + deltaPersist;

    // ── OHLC — regime-modulated ATR ────────────────────────────────────────────
    const atr = baseVol * atrMult;
    // Log-normal body: median ~0.6 ATR, heavy tail for big bars
    const bodySize = atr * clamp(randLogNormal(-0.45, 0.48), 0.08, 2.2);
    // Independent upper / lower wicks (log-normal, shorter on average)
    const topWick  = atr * clamp(randLogNormal(-1.6, 0.55), 0.02, 0.70);
    const botWick  = atr * clamp(randLogNormal(-1.6, 0.55), 0.02, 0.70);

    const open  = roundTo(price, tickSize);
    const close = roundTo(open + (isBullish ? 1 : -1) * bodySize, tickSize);
    const high  = roundTo(Math.max(open, close) + topWick, tickSize);
    const low   = roundTo(Math.min(open, close) - botWick, tickSize);

    // ── Total candle volume — U-shaped session curve ───────────────────────────
    // Open/close hours are busiest; midday is quietest (real CME/crypto pattern).
    // candle index i=0 is oldest; i=count-1 is most recent.
    // Map position in session [0,1] to a U-curve: 1 at edges, dips to ~0.4 midday.
    const sessionPos = i / Math.max(count - 1, 1); // 0 = open, 1 = close
    const uCurve = 0.40 + 0.60 * (4 * (sessionPos - 0.5) ** 2); // parabola, min 0.40 at midday
    // mu=6.2 → median ≈ 490; sigma=0.65 → fat-tailed (was 0.50; more realistic spikes)
    const isReversal = trendLeft === 0;
    const totalVol = Math.round(
      randLogNormal(6.2, 0.65) * uCurve * (isReversal ? 2.0 + Math.random() * 0.5 : 1.0),
    );

    // ── Price range setup ──────────────────────────────────────────────────────
    const numLevels  = Math.max(2, Math.round((high - low) / tickSize) + 1);
    const priceRange = Math.max(high - low, tickSize);

    // ── POC placement — biased toward directional origin ──────────────────────
    // Bullish: buyers powered lower prices → POC sits in lower 15-50% of range
    // Bearish: sellers dominated upper prices → POC in upper 50-85%
    const pocFrac  = isBullish
      ? 0.15 + Math.random() * 0.35
      : 0.50 + Math.random() * 0.35;
    const pocPrice = roundTo(low + priceRange * pocFrac, tickSize);

    // POC sigma: tighter profile = stronger single node; wider = value area spread
    const pocSigma = priceRange * (0.12 + Math.random() * 0.18);

    // ── Microstructure events ──────────────────────────────────────────────────

    // Absorption: ~15% of candles — large opposing prints at an extreme that
    // fail to move price, leaving a high-volume cluster near the candle extreme.
    const hasAbsorption = Math.random() < 0.15;
    // Bullish absorption: big bid prints near the low (buyers absorbing sellers)
    // Bearish absorption: big ask prints near the high (sellers absorbing buyers)
    const absorptionPrice = hasAbsorption
      ? roundTo(
          isBullish
            ? low + tickSize * randInt(0, 2)
            : high - tickSize * randInt(0, 2),
          tickSize,
        )
      : null;

    // Liquidity sweep: ~12% of candles — aggressive orders consume several
    // consecutive levels, leaving a dense band of footprint prints.
    const hasSweep      = !hasAbsorption && Math.random() < 0.12;
    const sweepStartFrac = 0.25 + Math.random() * 0.50;
    const sweepStart    = hasSweep
      ? roundTo(low + priceRange * sweepStartFrac, tickSize)
      : null;
    const sweepSpan     = hasSweep ? randInt(3, 6) * tickSize : 0;

    // ── Volume weights per level — Gaussian + microstructure boosts ───────────
    const rawWeights: number[] = [];
    const prices: number[]     = [];

    for (let j = 0; j < numLevels; j++) {
      const lp = roundTo(low + j * tickSize, tickSize);
      prices.push(lp);

      // Base weight: Gaussian around POC
      let w = gaussian(lp - pocPrice, Math.max(pocSigma, tickSize * 0.5));

      // Multiplicative log-normal noise — creates secondary nodes, uneven profile
      w *= randLogNormal(-0.05, 0.38);

      // Absorption cluster boost: 2–4.5× volume at the absorption zone
      if (absorptionPrice !== null && Math.abs(lp - absorptionPrice) <= tickSize) {
        w *= 2.0 + Math.random() * 2.5;
      }

      // Sweep band boost: 1.8–3.3× volume across the swept levels
      if (sweepStart !== null && lp >= sweepStart && lp <= sweepStart + sweepSpan) {
        w *= 1.8 + Math.random() * 1.5;
      }

      rawWeights.push(Math.max(w, 1e-6));
    }

    // Normalize weights → sum to 1 so levelVol sums to totalVol
    const wSum   = rawWeights.reduce((a, b) => a + b, 0);
    const nWeights = rawWeights.map(w => w / wSum);

    // ── Bid/ask split per level ────────────────────────────────────────────────
    // Overall directional bias: 60-80% ask-heavy on bullish, bid-heavy on bearish
    const dirBias = 0.60 + Math.random() * 0.20;

    const bodyLo = Math.min(open, close);
    const bodyHi = Math.max(open, close);

    const levels: SimLevel[] = [];
    let pocActual  = pocPrice;
    let maxLvlVol  = -Infinity;

    for (let j = 0; j < numLevels; j++) {
      const lp       = prices[j];
      const levelVol = totalVol * nWeights[j];

      const isTopWick = lp > bodyHi;
      const isBotWick = lp < bodyLo;

      // Ask fraction at this level (fraction of levelVol that is aggressive buying)
      let askFrac: number;

      if (isBullish) {
        if (isTopWick) {
          // Upper wick rejection: sellers pushed price back → bid dominated
          askFrac = 0.25 + Math.random() * 0.20;
        } else if (isBotWick) {
          // Lower wick: tested support then bounced — mixed to slightly ask
          askFrac = 0.42 + Math.random() * 0.22;
        } else {
          // Body: strong ask pressure with per-level jitter
          askFrac = dirBias + randNormal(0, 0.07);
        }
      } else {
        // Bearish candle
        if (isBotWick) {
          // Lower wick rejection: buyers pushed price back → ask dominated
          askFrac = 0.55 + Math.random() * 0.20;
        } else if (isTopWick) {
          // Upper wick: tested resistance then dropped — mixed to slightly bid
          askFrac = 0.40 + Math.random() * 0.22;
        } else {
          // Body: strong bid pressure (low ask fraction)
          askFrac = 1.0 - dirBias + randNormal(0, 0.07);
        }
      }

      // Absorption override: at the absorption zone, show opposing pressure
      // being absorbed by large passive orders (heavy prints, no movement)
      if (absorptionPrice !== null && Math.abs(lp - absorptionPrice) <= tickSize) {
        // Bullish absorption near low: huge bid cluster = buyers absorbed sellers
        // Show large bid volume (low askFrac) — the absorbed selling pressure
        askFrac = isBullish
          ? 0.12 + Math.random() * 0.16   // bid dominated — sellers absorbed
          : 0.72 + Math.random() * 0.16;  // ask dominated — buyers absorbed
      }

      askFrac = clamp(askFrac, 0.05, 0.95);

      const askVol = levelVol * askFrac;
      const bidVol = levelVol * (1 - askFrac);

      levels.push({ price: lp, bidVol, askVol });

      // Track actual POC (max total volume level)
      if (levelVol > maxLvlVol) {
        maxLvlVol = levelVol;
        pocActual = lp;
      }
    }

    const delta = levels.reduce((s, l) => s + l.askVol - l.bidVol, 0);

    candles.push({
      time: startTime + i * tfSeconds,
      open, high, low, close,
      totalVol,
      delta,
      levels,
      poc: pocActual,
      sessionStart: i > 0 && i % 18 === 0,
    });

    price = close;
    // Update inter-candle bias EMA
    prevDeltaBias = 0.75 * prevDeltaBias + 0.25 * (isBullish ? 1 : -1);
  }

  return candles;
}
