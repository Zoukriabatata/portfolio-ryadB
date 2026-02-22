import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { EconomicEvent, MarketImpact } from '@/types/news';
import { rateLimitByIP, tooManyRequests } from '@/lib/auth/rate-limiter';

/**
 * Economic Calendar API
 *
 * - DEV mode: fetches real data from Forex Factory (via faireconomy.media)
 * - PROD mode: returns simulated events (no external dependency on Vercel)
 *
 * Query params:
 *   - from: ISO date string (inclusive lower bound)
 *   - to:   ISO date string (exclusive upper bound)
 *   - currency: comma-separated currency codes (e.g. "USD,EUR")
 *   - impact: comma-separated impact levels (e.g. "high,medium")
 *   - simulation: "true" to enrich events with realistic data + market impact
 *
 * Response: { events: EconomicEvent[], source: string, updatedAt: string }
 * Cached in-memory for 5 minutes.
 */

const IS_DEV = process.env.NODE_ENV === 'development';

// ---------------------------------------------------------------------------
// In-memory cache (5 minutes TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  events: EconomicEvent[];
  source: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: CacheEntry | null = null;

function getCachedEvents(): CacheEntry | null {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  return null;
}

function setCachedEvents(entry: CacheEntry): void {
  cache = entry;
}

// ---------------------------------------------------------------------------
// Forex Factory — real data (dev only)
// ---------------------------------------------------------------------------

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

async function fetchForexFactory(): Promise<EconomicEvent[] | null> {
  try {
    console.log('[News] Fetching Forex Factory data...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[News] Forex Factory returned ${res.status}`);
      return null;
    }

    const data: FFEvent[] = await res.json();
    console.log(`[News] Received ${data.length} raw events from Forex Factory`);

    const events = data
      .filter((e) => {
        const imp = e.impact?.toLowerCase();
        return imp === 'high' || imp === 'medium' || imp === 'low';
      })
      .map((e, i) => {
        const impact = e.impact.toLowerCase() as 'high' | 'medium' | 'low';
        const isPast = new Date(e.date) < new Date();

        return {
          id: `ff-${i}-${e.country}-${e.date}`,
          time: new Date(e.date).toISOString(),
          currency: e.country,
          impact,
          event: e.title,
          actual: undefined,
          forecast: e.forecast || undefined,
          previous: e.previous || undefined,
        } satisfies EconomicEvent;
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    console.log(`[News] Mapped ${events.length} events (filtered holidays/non-impact)`);
    return events.length > 0 ? events : null;
  } catch (err) {
    console.error('[News] Forex Factory fetch failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event format map for realistic simulation data
// ---------------------------------------------------------------------------

interface FormatInfo {
  format: (v: number) => string;
  range: [number, number];
}

const DEFAULT_FORMAT: FormatInfo = {
  format: (v) => `${v.toFixed(1)}%`,
  range: [-2, 2],
};

const EVENT_FORMAT_MAP: Record<string, FormatInfo> = {
  // USD
  'Non-Farm Payrolls': { format: (v) => `${Math.round(v)}K`, range: [150, 350] },
  'FOMC Statement': { format: (v) => `${v.toFixed(2)}%`, range: [4.5, 5.75] },
  'CPI m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-0.2, 0.6] },
  'Core CPI m/m': { format: (v) => `${v.toFixed(1)}%`, range: [0.1, 0.5] },
  'Retail Sales m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-1.0, 1.5] },
  'Unemployment Rate': { format: (v) => `${v.toFixed(1)}%`, range: [3.4, 4.2] },
  'GDP q/q': { format: (v) => `${v.toFixed(1)}%`, range: [-0.5, 3.5] },
  'ISM Manufacturing PMI': { format: (v) => `${v.toFixed(1)}`, range: [46, 55] },
  'Initial Jobless Claims': { format: (v) => `${Math.round(v)}K`, range: [190, 260] },
  'Fed Chair Powell Speaks': { format: () => '-', range: [0, 0] },
  'ADP Non-Farm Employment Change': { format: (v) => `${Math.round(v)}K`, range: [100, 250] },
  'Crude Oil Inventories': { format: (v) => `${v.toFixed(1)}M`, range: [-8, 8] },
  'PPI m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-0.3, 0.6] },
  'CB Consumer Confidence': { format: (v) => `${v.toFixed(1)}`, range: [95, 115] },
  'Existing Home Sales': { format: (v) => `${v.toFixed(2)}M`, range: [3.8, 4.5] },
  'Durable Goods Orders m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-3, 4] },
  // EUR
  'ECB Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [3.5, 4.75] },
  'German CPI m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-0.3, 0.5] },
  'German Unemployment Change': { format: (v) => `${Math.round(v)}K`, range: [-15, 20] },
  'Eurozone CPI y/y': { format: (v) => `${v.toFixed(1)}%`, range: [1.5, 4.0] },
  'ECB President Lagarde Speaks': { format: () => '-', range: [0, 0] },
  'German ZEW Economic Sentiment': { format: (v) => `${v.toFixed(1)}`, range: [-10, 25] },
  'Eurozone GDP q/q': { format: (v) => `${v.toFixed(1)}%`, range: [-0.3, 0.8] },
  'French CPI m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-0.2, 0.5] },
  'Italian GDP q/q': { format: (v) => `${v.toFixed(1)}%`, range: [-0.2, 0.5] },
  // GBP
  'BOE Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [4.0, 5.5] },
  'CPI y/y': { format: (v) => `${v.toFixed(1)}%`, range: [2.0, 5.0] },
  'GDP m/m': { format: (v) => `${v.toFixed(1)}%`, range: [-0.3, 0.5] },
  'BOE Gov Bailey Speaks': { format: () => '-', range: [0, 0] },
  'Manufacturing PMI': { format: (v) => `${v.toFixed(1)}`, range: [46, 54] },
  // JPY
  'BOJ Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [-0.1, 0.5] },
  'Trade Balance': { format: (v) => `${v.toFixed(1)}B`, range: [-2, 3] },
  'BOJ Gov Ueda Speaks': { format: () => '-', range: [0, 0] },
  'Tankan Manufacturing Index': { format: (v) => `${Math.round(v)}`, range: [-5, 15] },
  // AUD
  'RBA Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [3.5, 4.75] },
  'Employment Change': { format: (v) => `${v.toFixed(1)}K`, range: [-20, 50] },
  'CPI q/q': { format: (v) => `${v.toFixed(1)}%`, range: [0.2, 1.5] },
  // CAD
  'BOC Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [3.5, 5.25] },
  // CHF
  'SNB Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [1.0, 2.0] },
  // NZD
  'RBNZ Interest Rate Decision': { format: (v) => `${v.toFixed(2)}%`, range: [4.0, 5.75] },
  'Employment Change q/q': { format: (v) => `${v.toFixed(1)}%`, range: [-0.5, 1.5] },
  // CNY
  'Manufacturing PMI (CN)': { format: (v) => `${v.toFixed(1)}`, range: [48, 52] },
};

// ---------------------------------------------------------------------------
// Simulation enrichment
// ---------------------------------------------------------------------------

function enrichWithSimulation(
  events: EconomicEvent[],
  random: () => number
): EconomicEvent[] {
  return events.map((event) => {
    const isPast = new Date(event.time) < new Date();

    // Speeches don't have numeric data
    const isSpeech = event.event.includes('Speaks') || event.event.includes('Statement');
    if (isSpeech) {
      const sentiment: MarketImpact['sentiment'] = random() > 0.5 ? 'bullish' : random() > 0.3 ? 'bearish' : 'neutral';
      if (isPast) {
        const impactMult = event.impact === 'high' ? 2.5 : event.impact === 'medium' ? 1.2 : 0.5;
        const dir = sentiment === 'bullish' ? 1 : sentiment === 'bearish' ? -1 : 0;
        const priceMove = dir * (0.3 + random() * 1.5) * impactMult;
        return {
          ...event,
          actual: '-',
          forecast: '-',
          previous: '-',
          deviation: undefined,
          marketImpact: {
            priceChange: `${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}%`,
            volumeMultiplier: parseFloat((1.5 + random() * impactMult).toFixed(1)),
            volatilityChange: `+${Math.round(2 + random() * 8 * impactMult)}pts`,
            sentiment,
          },
        };
      }
      return { ...event, actual: undefined, forecast: '-', previous: '-' };
    }

    const formatInfo = EVENT_FORMAT_MAP[event.event] || DEFAULT_FORMAT;
    const [lo, hi] = formatInfo.range;
    const span = hi - lo;

    // Keep real FF data if it exists, only generate if missing
    const hasRealForecast = !!event.forecast;
    const hasRealPrevious = !!event.previous;

    const previousVal = lo + random() * span;
    const forecastVal = previousVal + (random() - 0.5) * span * 0.2;
    const clampedForecast = Math.max(lo, Math.min(hi, forecastVal));

    const previous = hasRealPrevious ? event.previous! : formatInfo.format(previousVal);
    const forecast = hasRealForecast ? event.forecast! : formatInfo.format(clampedForecast);

    if (!isPast) {
      return { ...event, actual: undefined, forecast, previous };
    }

    // Past event: generate actual + deviation + market impact
    const actualVal = clampedForecast + (random() - 0.5) * span * 0.3;
    const actual = formatInfo.format(actualVal);

    const diff = actualVal - clampedForecast;
    const threshold = span * 0.05;
    const deviation: 'beat' | 'miss' | 'inline' =
      diff > threshold ? 'beat' : diff < -threshold ? 'miss' : 'inline';

    const impactMult = event.impact === 'high' ? 3 : event.impact === 'medium' ? 1.5 : 0.8;
    const direction = deviation === 'beat' ? 1 : deviation === 'miss' ? -1 : 0;
    const priceMove = direction * (0.5 + random() * 2.5) * impactMult;

    const marketImpact: MarketImpact = {
      priceChange: `${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}%`,
      volumeMultiplier: parseFloat((1.2 + random() * impactMult * 1.5).toFixed(1)),
      volatilityChange: `${direction >= 0 ? '+' : '-'}${Math.round(3 + random() * 15 * (impactMult / 3))}pts`,
      sentiment: deviation === 'beat' ? 'bullish' : deviation === 'miss' ? 'bearish' : 'neutral',
    };

    return { ...event, actual, forecast, previous, deviation, marketImpact };
  });
}

// ---------------------------------------------------------------------------
// Fallback: realistic simulated events
// ---------------------------------------------------------------------------

function generateSimulatedEvents(): EconomicEvent[] {
  const eventDefinitions: {
    currency: string;
    events: { name: string; impact: 'high' | 'medium' | 'low' }[];
  }[] = [
    {
      currency: 'USD',
      events: [
        { name: 'Non-Farm Payrolls', impact: 'high' },
        { name: 'FOMC Statement', impact: 'high' },
        { name: 'CPI m/m', impact: 'high' },
        { name: 'Core CPI m/m', impact: 'high' },
        { name: 'Retail Sales m/m', impact: 'high' },
        { name: 'Unemployment Rate', impact: 'high' },
        { name: 'GDP q/q', impact: 'high' },
        { name: 'ISM Manufacturing PMI', impact: 'high' },
        { name: 'Initial Jobless Claims', impact: 'medium' },
        { name: 'Fed Chair Powell Speaks', impact: 'high' },
        { name: 'ADP Non-Farm Employment Change', impact: 'medium' },
        { name: 'Crude Oil Inventories', impact: 'medium' },
        { name: 'PPI m/m', impact: 'medium' },
        { name: 'CB Consumer Confidence', impact: 'medium' },
        { name: 'Existing Home Sales', impact: 'low' },
        { name: 'Durable Goods Orders m/m', impact: 'medium' },
      ],
    },
    {
      currency: 'EUR',
      events: [
        { name: 'ECB Interest Rate Decision', impact: 'high' },
        { name: 'German CPI m/m', impact: 'high' },
        { name: 'German Unemployment Change', impact: 'medium' },
        { name: 'Eurozone CPI y/y', impact: 'high' },
        { name: 'ECB President Lagarde Speaks', impact: 'high' },
        { name: 'German ZEW Economic Sentiment', impact: 'medium' },
        { name: 'Eurozone GDP q/q', impact: 'high' },
        { name: 'French CPI m/m', impact: 'medium' },
        { name: 'Italian GDP q/q', impact: 'low' },
      ],
    },
    {
      currency: 'GBP',
      events: [
        { name: 'BOE Interest Rate Decision', impact: 'high' },
        { name: 'CPI y/y', impact: 'high' },
        { name: 'GDP m/m', impact: 'high' },
        { name: 'Retail Sales m/m', impact: 'medium' },
        { name: 'Unemployment Rate', impact: 'medium' },
        { name: 'BOE Gov Bailey Speaks', impact: 'high' },
        { name: 'Manufacturing PMI', impact: 'medium' },
      ],
    },
    {
      currency: 'JPY',
      events: [
        { name: 'BOJ Interest Rate Decision', impact: 'high' },
        { name: 'Trade Balance', impact: 'medium' },
        { name: 'CPI y/y', impact: 'high' },
        { name: 'GDP q/q', impact: 'high' },
        { name: 'BOJ Gov Ueda Speaks', impact: 'high' },
        { name: 'Tankan Manufacturing Index', impact: 'medium' },
      ],
    },
    {
      currency: 'AUD',
      events: [
        { name: 'RBA Interest Rate Decision', impact: 'high' },
        { name: 'Employment Change', impact: 'high' },
        { name: 'CPI q/q', impact: 'high' },
        { name: 'Trade Balance', impact: 'medium' },
        { name: 'Retail Sales m/m', impact: 'medium' },
      ],
    },
    {
      currency: 'CAD',
      events: [
        { name: 'BOC Interest Rate Decision', impact: 'high' },
        { name: 'Employment Change', impact: 'high' },
        { name: 'CPI m/m', impact: 'high' },
        { name: 'Trade Balance', impact: 'medium' },
        { name: 'GDP m/m', impact: 'medium' },
      ],
    },
    {
      currency: 'CHF',
      events: [
        { name: 'SNB Interest Rate Decision', impact: 'high' },
        { name: 'CPI m/m', impact: 'medium' },
        { name: 'Trade Balance', impact: 'low' },
      ],
    },
    {
      currency: 'NZD',
      events: [
        { name: 'RBNZ Interest Rate Decision', impact: 'high' },
        { name: 'GDP q/q', impact: 'high' },
        { name: 'Trade Balance', impact: 'medium' },
        { name: 'Employment Change q/q', impact: 'high' },
      ],
    },
    {
      currency: 'CNY',
      events: [
        { name: 'Manufacturing PMI', impact: 'medium' },
        { name: 'Trade Balance', impact: 'medium' },
        { name: 'CPI y/y', impact: 'medium' },
        { name: 'GDP q/q', impact: 'high' },
      ],
    },
  ];

  // Seeded pseudo-random for deterministic output within the same hour
  const seed = Math.floor(Date.now() / (60 * 60 * 1000));
  let rng = seed;
  function random(): number {
    rng = (rng * 16807 + 0) % 2147483647;
    return (rng & 0x7fffffff) / 0x7fffffff;
  }

  const events: EconomicEvent[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate events for the next 7 days
  for (let day = -1; day < 7; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);

    // Skip weekends (fewer events)
    const dow = date.getDay();
    if (dow === 0 || dow === 6) {
      if (random() > 0.15) continue;
    }

    // 4-10 events per weekday
    const numEvents = 4 + Math.floor(random() * 7);

    for (let i = 0; i < numEvents; i++) {
      const currGroup =
        eventDefinitions[Math.floor(random() * eventDefinitions.length)];
      const evtDef =
        currGroup.events[Math.floor(random() * currGroup.events.length)];

      // Typical release hours: 4:30-16:00 UTC
      const hour = 4 + Math.floor(random() * 12);
      const minute = random() > 0.5 ? 30 : 0;

      const eventDate = new Date(date);
      eventDate.setUTCHours(hour, minute, 0, 0);

      const isPast = eventDate < new Date();

      events.push({
        id: `sim-${date.toISOString().split('T')[0]}-${i}`,
        time: eventDate.toISOString(),
        currency: currGroup.currency,
        impact: evtDef.impact,
        event: evtDef.name,
        actual: isPast
          ? `${(random() * 4 - 2).toFixed(1)}%`
          : undefined,
        forecast:
          isPast || random() > 0.3
            ? `${(random() * 4 - 2).toFixed(1)}%`
            : undefined,
        previous: `${(random() * 4 - 2).toFixed(1)}%`,
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

function applyFilters(
  events: EconomicEvent[],
  params: {
    from?: string;
    to?: string;
    currency?: string;
    impact?: string;
  }
): EconomicEvent[] {
  let filtered = events;

  // Date range
  if (params.from) {
    const fromTime = new Date(params.from).getTime();
    if (!isNaN(fromTime)) {
      filtered = filtered.filter(
        (e) => new Date(e.time).getTime() >= fromTime
      );
    }
  }

  if (params.to) {
    const toTime = new Date(params.to).getTime();
    if (!isNaN(toTime)) {
      filtered = filtered.filter(
        (e) => new Date(e.time).getTime() < toTime
      );
    }
  }

  // Currency filter (comma-separated)
  if (params.currency) {
    const currencies = params.currency
      .toUpperCase()
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    if (currencies.length > 0) {
      filtered = filtered.filter((e) =>
        currencies.includes(e.currency.toUpperCase())
      );
    }
  }

  // Impact filter (comma-separated)
  if (params.impact) {
    const impacts = params.impact
      .toLowerCase()
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);
    if (impacts.length > 0) {
      filtered = filtered.filter((e) => impacts.includes(e.impact));
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    // ---- Rate limiting (IP-based, works for public/dev access) ----
    const rl = rateLimitByIP(req, 30, 60_000); // 30 req/min
    if (!rl.allowed) return tooManyRequests(rl);

    // ---- Authentication (skip in dev for local testing) ----
    if (!IS_DEV) {
      const token = await getToken({ req });
      if (!token) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    }

    // ---- Check cache first ----
    let entry = getCachedEvents();

    if (!entry) {
      // DEV: fetch real Forex Factory data
      if (IS_DEV) {
        const ffEvents = await fetchForexFactory();
        if (ffEvents && ffEvents.length > 0) {
          entry = { events: ffEvents, source: 'forex-factory', fetchedAt: Date.now() };
          setCachedEvents(entry);
          console.log(`[News] Loaded ${ffEvents.length} real events from Forex Factory`);
        }
      }
      // PROD fallback (or FF fetch failed)
      if (!entry) {
        const events = generateSimulatedEvents();
        events.sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        entry = { events, source: 'simulation', fetchedAt: Date.now() };
        setCachedEvents(entry);
      }
    }

    // ---- Apply simulation enrichment if requested ----
    const { searchParams } = new URL(req.url);
    const simulation = searchParams.get('simulation') === 'true';

    let processed = entry.events;
    if (simulation) {
      // Different seed multiplier for simulation variety
      const simSeed = Math.floor(Date.now() / (60 * 60 * 1000));
      let simRng = simSeed;
      function simRandom(): number {
        simRng = (simRng * 48271 + 0) % 2147483647;
        return (simRng & 0x7fffffff) / 0x7fffffff;
      }
      processed = enrichWithSimulation(processed, simRandom);
    }

    // ---- Apply query filters ----
    const filtered = applyFilters(processed, {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      currency: searchParams.get('currency') || undefined,
      impact: searchParams.get('impact') || undefined,
    });

    return NextResponse.json({
      events: filtered,
      source: entry.source,
      updatedAt: new Date(entry.fetchedAt).toISOString(),
    });
  } catch (error) {
    console.error('Economic calendar API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch economic calendar' },
      { status: 500 }
    );
  }
}
