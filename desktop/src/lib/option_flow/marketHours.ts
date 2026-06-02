// US options market hours helper.
//
// Regular session: Mon–Fri 09:30 → 16:00 America/New_York. We don't
// model holidays (Thanksgiving, July 4, etc.) — those are rare and
// the empty state already says "the market may be closed" so a holiday
// just reads as "closed today". DST is handled implicitly by reading
// the ET wall-clock through Intl.DateTimeFormat with timeZone='America/New_York'.

export type MarketStatus =
  | { state: "open"; closesInMinutes: number }
  | { state: "pre-market"; opensInMinutes: number }
  | { state: "post-market"; opensInMinutes: number; openOnIso: string }
  | { state: "weekend"; opensInMinutes: number; openOnIso: string };

const SESSION_OPEN_HOUR = 9;
const SESSION_OPEN_MIN = 30;
const SESSION_CLOSE_HOUR = 16;
const SESSION_CLOSE_MIN = 0;

/**
 * Decomposes `now` into year, month, day, hour, minute, weekday in the
 * America/New_York timezone using Intl. Returns the values as integers.
 * weekday: 0=Sun, 1=Mon, ..., 6=Sat (JS convention).
 */
function nyTimeParts(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // weekday short → number
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/** Returns whether `weekday` (0=Sun…6=Sat) is a US trading day (Mon–Fri). */
function isTradingDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

/** Minutes from midnight in ET wall-clock. */
function etMinutes(p: { hour: number; minute: number }): number {
  return p.hour * 60 + p.minute;
}

const OPEN_MIN = SESSION_OPEN_HOUR * 60 + SESSION_OPEN_MIN; // 570
const CLOSE_MIN = SESSION_CLOSE_HOUR * 60 + SESSION_CLOSE_MIN; // 960

/**
 * Returns the option-market status for `now` (defaults to current time).
 * The four states are:
 *   - open: session is live, includes minutes-to-close so the UI can
 *     show a countdown in the last hour.
 *   - pre-market: it's a weekday before 09:30 ET, includes minutes-to-open.
 *   - post-market: weekday past 16:00 ET — the next open is tomorrow
 *     09:30 ET (or Monday if today is Friday). `openOnIso` carries the
 *     ISO date (YYYY-MM-DD) so we can label "Opens Mon" without parsing.
 *   - weekend: same as post-market but on Sat/Sun. Next open Monday.
 */
export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const p = nyTimeParts(now);
  const minutes = etMinutes(p);

  if (isTradingDay(p.weekday)) {
    if (minutes >= OPEN_MIN && minutes < CLOSE_MIN) {
      return { state: "open", closesInMinutes: CLOSE_MIN - minutes };
    }
    if (minutes < OPEN_MIN) {
      return { state: "pre-market", opensInMinutes: OPEN_MIN - minutes };
    }
    // Post-close: next open is tomorrow 09:30 unless today is Friday.
    const daysToNextOpen = p.weekday === 5 ? 3 : 1; // Fri→Mon = +3
    const nextOpen = nextTradingDayDate(now, daysToNextOpen);
    const opensInMinutes = (CLOSE_MIN - minutes) < 0
      ? (1440 - minutes) + OPEN_MIN + (daysToNextOpen - 1) * 1440
      : 0;
    return { state: "post-market", opensInMinutes, openOnIso: nextOpen };
  }

  // Weekend: next open is Monday.
  const daysToMonday = p.weekday === 6 ? 2 : 1; // Sat→Mon = +2, Sun→Mon = +1
  const nextOpen = nextTradingDayDate(now, daysToMonday);
  const opensInMinutes = (1440 - minutes) + OPEN_MIN + (daysToMonday - 1) * 1440;
  return { state: "weekend", opensInMinutes, openOnIso: nextOpen };
}

/** Adds `days` ET-calendar days to `now` and returns YYYY-MM-DD in ET. */
function nextTradingDayDate(now: Date, days: number): string {
  const future = new Date(now.getTime() + days * 86_400_000);
  const p = nyTimeParts(future);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** Compact human label, e.g. "OPEN · closes in 3h 12m" / "OPENS IN 14m". */
export function formatMarketStatus(status: MarketStatus): string {
  switch (status.state) {
    case "open":
      return `LIVE · closes in ${formatDuration(status.closesInMinutes)}`;
    case "pre-market":
      return `OPENS IN ${formatDuration(status.opensInMinutes)}`;
    case "post-market":
      return `CLOSED · opens ${formatNextOpen(status.openOnIso)}`;
    case "weekend":
      return `CLOSED · opens ${formatNextOpen(status.openOnIso)}`;
  }
}

/** "3h 12m" / "47m" / "1d 2h". */
function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes < 1440) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/** "Mon Jun 3" — short, human, no year. */
function formatNextOpen(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  // Use UTC to avoid TZ shifts of one day. The date itself is already
  // the ET-calendar date.
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
