// CSV → JournalEntry parser. Handles the common futures-broker export
// formats (Apex Trader Funding, NinjaTrader, Rithmic Trader Portal,
// TradingView). Strategy: parse the rows into a generic map, then
// auto-detect each JournalEntry field using fuzzy column-name matching.
//
// Why client-side (TS) and not Rust:
//   • Iteration speed — column heuristics change every time a broker
//     tweaks their export, and TS edits hot-reload instantly.
//   • UX — we want to preview the parsed rows before committing.
//   • No native deps — the browser FileReader covers everything we need.

import type { JournalEntry, TradeSide } from "../../types/journal";

// ── Generic CSV parser (RFC 4180-ish) ──────────────────────────────────

/** Parse a CSV string into rows. Handles quoted fields with embedded
 *  commas, quotes, and newlines. Auto-detects "," vs ";" delimiter. */
export function parseCsv(text: string): string[][] {
  // Strip BOM that Excel/Apex sometimes prefix.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = pickDelimiter(text);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === delim) {
      cur.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (field !== "" || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      }
      // Skip the \n of a \r\n pair
      if (c === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    field += c;
  }
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function pickDelimiter(text: string): string {
  // Sample the first line — whichever of "," or ";" or "\t" appears
  // more often wins.
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  let best = ",";
  let bestN = -1;
  for (const [d, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

// ── Column fuzzy-matching ──────────────────────────────────────────────

/** Find the first header that fuzzy-matches any of the candidate names. */
function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().replace(/[\s_\-./()]/g, ""));
  for (const cand of candidates) {
    const target = cand.toLowerCase().replace(/[\s_\-./()]/g, "");
    const idx = normalized.findIndex((h) => h === target);
    if (idx >= 0) return idx;
  }
  // Substring fallback — handles "Avg Fill Price (USD)" vs "AvgFillPrice".
  for (const cand of candidates) {
    const target = cand.toLowerCase().replace(/[\s_\-./()]/g, "");
    const idx = normalized.findIndex((h) => h.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Mapping from CSV header position to JournalEntry field. */
export interface CsvColumnMap {
  symbol: number;
  side: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  entryTime: number;
  exitTime: number;
  commission: number;
  accountId: number;
  externalId: number;
  notes: number;
}

/** Heuristic auto-detection of the column layout. Returns indices into
 *  the headers array; -1 means "not present". */
export function autoDetectColumns(headers: string[]): CsvColumnMap {
  return {
    symbol:     findColumn(headers, ["symbol", "instrument", "contract", "ticker"]),
    side:       findColumn(headers, ["side", "buy/sell", "b/s", "direction", "type"]),
    entryPrice: findColumn(headers, ["entryprice", "openprice", "buyprice", "avgentryprice", "fillprice"]),
    exitPrice:  findColumn(headers, ["exitprice", "closeprice", "sellprice", "avgexitprice"]),
    quantity:   findColumn(headers, ["qty", "quantity", "size", "contracts", "shares", "lots"]),
    pnl:        findColumn(headers, ["pnl", "p/l", "p&l", "profit", "netpnl", "realizedpnl", "pl"]),
    entryTime:  findColumn(headers, ["entrytime", "opentime", "buytime", "time", "datetime", "tradetime", "filltime"]),
    exitTime:   findColumn(headers, ["exittime", "closetime", "selltime"]),
    commission: findColumn(headers, ["commission", "commissions", "fee", "fees"]),
    accountId:  findColumn(headers, ["account", "accountid", "accountnumber"]),
    externalId: findColumn(headers, ["tradeid", "orderid", "ticketid", "executionid", "id", "fillid"]),
    notes:      findColumn(headers, ["notes", "comment", "memo", "tag"]),
  };
}

// ── Row → JournalEntry ─────────────────────────────────────────────────

function parseFloatLoose(s: string | undefined): number | null {
  if (s === undefined || s === null) return null;
  const cleaned = String(s).replace(/[$\s,]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIntLoose(s: string | undefined): number | null {
  const n = parseFloatLoose(s);
  return n === null ? null : Math.round(n);
}

function parseSide(s: string | undefined): TradeSide | null {
  if (!s) return null;
  const v = s.trim().toUpperCase();
  if (v === "B" || v === "BUY" || v === "LONG" || v === "L") return "LONG";
  if (v === "S" || v === "SELL" || v === "SHORT" || v === "SH") return "SHORT";
  return null;
}

/** Parse a date string that may be MM/DD/YYYY, DD/MM/YYYY, ISO, or
 *  Apex's "YYYY-MM-DD HH:MM:SS" format. Returns ISO 8601 UTC. */
function parseDateLoose(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  // Try direct Date.parse first — handles ISO 8601 and most US formats.
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Try "YYYYMMDD HH:MM:SS" (Rithmic-ish) — split + retry.
  const m = t.match(/^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [_, y, mo, da, h, mi, se] = m;
    return new Date(`${y}-${mo}-${da}T${h}:${mi}:${se ?? "00"}Z`).toISOString();
  }
  return null;
}

/** Build a JournalEntry from one CSV data row, given the column map.
 *  Returns null if the row can't be mapped to a usable trade (no
 *  symbol or no entry price). */
export function rowToTrade(
  row: string[],
  map: CsvColumnMap,
  source: string,
  fallbackId: string,
): JournalEntry | null {
  const get = (i: number): string | undefined => (i >= 0 ? row[i] : undefined);

  const symbol = (get(map.symbol) ?? "").trim();
  const side = parseSide(get(map.side));
  const entryPrice = parseFloatLoose(get(map.entryPrice));
  if (!symbol || !side || entryPrice === null) return null;

  const exitPrice = parseFloatLoose(get(map.exitPrice));
  const quantity = parseIntLoose(get(map.quantity)) ?? 1;
  const pnl = parseFloatLoose(get(map.pnl));
  const entryTime =
    parseDateLoose(get(map.entryTime)) ?? new Date().toISOString();
  const exitTime = parseDateLoose(get(map.exitTime));
  const commission = parseFloatLoose(get(map.commission));
  const accountId = get(map.accountId)?.trim() || null;
  const externalId = (get(map.externalId)?.trim() || fallbackId) as string;
  const notes = get(map.notes)?.trim() || null;

  return {
    id: "",
    symbol,
    side,
    entryPrice,
    exitPrice,
    quantity,
    pnl,
    entryTime,
    exitTime,
    timeframe: null,
    setup: null,
    tags: null,
    notes,
    rating: null,
    emotions: null,
    screenshotUrl: null,
    screenshotUrls: [],
    playbookSetupId: null,
    createdAt: "",
    updatedAt: "",
    externalSource: source,
    externalId,
    accountId,
    commission,
  };
}

/** Full file → parsed trades pipeline. Returns the trades + diagnostic
 *  info (headers, raw row count) so the UI can render a preview. */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];           // data rows only (header stripped)
  columnMap: CsvColumnMap;
  trades: JournalEntry[];
  skipped: number;            // rows that couldn't be mapped
}

export function parseCsvTrades(text: string, source: string): ParsedCsv {
  const all = parseCsv(text);
  if (all.length === 0) {
    const empty: CsvColumnMap = {
      symbol: -1, side: -1, entryPrice: -1, exitPrice: -1, quantity: -1,
      pnl: -1, entryTime: -1, exitTime: -1, commission: -1, accountId: -1,
      externalId: -1, notes: -1,
    };
    return { headers: [], rows: [], columnMap: empty, trades: [], skipped: 0 };
  }
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const columnMap = autoDetectColumns(headers);

  const trades: JournalEntry[] = [];
  let skipped = 0;
  rows.forEach((row, i) => {
    const fallbackId = `${source}-row-${i + 1}`;
    const t = rowToTrade(row, columnMap, source, fallbackId);
    if (t) trades.push(t);
    else skipped++;
  });
  return { headers, rows, columnMap, trades, skipped };
}
