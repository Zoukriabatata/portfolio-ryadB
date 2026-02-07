import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Economic Calendar API
 *
 * Fetches economic events from Forex Factory public JSON feed.
 * Falls back to realistic simulated data if the external fetch fails.
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
// Forex Factory feed parsing
// ---------------------------------------------------------------------------

interface ForexFactoryEvent {
  title: string;
  country: string;
  date: string; // e.g. "01-06-2026"
  time: string; // e.g. "8:30am" or "All Day" or "Tentative"
  impact: string; // "High", "Medium", "Low", "Holiday", "Non-Economic"
  forecast: string;
  previous: string;
}

function mapImpact(raw: string): 'high' | 'medium' | 'low' {
  const lower = raw.toLowerCase();
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  return 'low';
}

function parseFFDate(dateStr: string, timeStr: string): string {
  // dateStr format: "MM-DD-YYYY"
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date().toISOString();

  const [month, day, year] = parts;

  // Handle non-standard time values
  if (!timeStr || timeStr === 'All Day' || timeStr === 'Tentative' || timeStr === '') {
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  // Parse "8:30am" / "2:00pm" style
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!match) {
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toLowerCase();

  if (ampm === 'pm' && hours !== 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;

  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');

  // FF times are US Eastern
  return new Date(`${year}-${month}-${day}T${h}:${m}:00-05:00`).toISOString();
}

async function fetchForexFactoryEvents(): Promise<EconomicEvent[]> {
  const url = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'OrderFlow/2.0' },
    });

    if (!response.ok) {
      throw new Error(`Forex Factory responded with ${response.status}`);
    }

    const data: ForexFactoryEvent[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Empty or invalid response from Forex Factory');
    }

    return data
      .filter(
        (e) =>
          e.impact &&
          !['Holiday', 'Non-Economic'].includes(e.impact)
      )
      .map((e, index) => ({
        id: `ff-${e.date}-${index}`,
        time: parseFFDate(e.date, e.time),
        currency: e.country || 'USD',
        impact: mapImpact(e.impact),
        event: e.title,
        actual: undefined, // FF free feed doesn't include actuals reliably
        forecast: e.forecast || undefined,
        previous: e.previous || undefined,
      }));
  } finally {
    clearTimeout(timeout);
  }
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
      // Try Forex Factory first, fall back to simulation
      let events: EconomicEvent[];
      let source: string;

      try {
        events = await fetchForexFactoryEvents();
        source = 'forex-factory';
      } catch (fetchError) {
        console.warn(
          'Forex Factory fetch failed, using simulated data:',
          fetchError instanceof Error ? fetchError.message : fetchError
        );
        events = generateSimulatedEvents();
        source = 'simulation';
      }

      // Sort by time ascending
      events.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
      );

      entry = { events, source, fetchedAt: Date.now() };
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
