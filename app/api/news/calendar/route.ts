import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Economic Calendar API
 *
 * Returns realistic simulated economic events.
 *
 * Query params:
 *   - from: ISO date string (inclusive lower bound)
 *   - to:   ISO date string (exclusive upper bound)
 *   - currency: comma-separated currency codes (e.g. "USD,EUR")
 *   - impact: comma-separated impact levels (e.g. "high,medium")
 *
 * Response: { events: EconomicEvent[], source: string, updatedAt: string }
 * Cached in-memory for 5 minutes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EconomicEvent {
  id: string;
  time: string; // ISO datetime
  currency: string; // USD, EUR, etc.
  impact: 'high' | 'medium' | 'low';
  event: string; // Event name
  actual?: string;
  forecast?: string;
  previous?: string;
}

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
    // ---- Authentication ----
    const token = await getToken({ req });

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ---- Check cache first ----
    let entry = getCachedEvents();

    if (!entry) {
      const events = generateSimulatedEvents();
      events.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );
      entry = { events, source: 'simulation', fetchedAt: Date.now() };
      setCachedEvents(entry);
    }

    // ---- Apply query filters ----
    const { searchParams } = new URL(req.url);

    const filtered = applyFilters(entry.events, {
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
