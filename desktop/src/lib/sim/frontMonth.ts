// CME futures front-month helper.
//
// Each contract product publishes a fixed set of delivery months
// (the "validMonths" — e.g. equity indices roll H/M/U/Z = quarterly,
// crude oil rolls every month). The "front month" is the next listed
// delivery month after today, with a small rollover allowance — most
// traders switch to the next contract a few days BEFORE expiry once
// open interest crosses over. We approximate that with the simple
// rule "if we're past the 8th of the delivery month, jump to the
// next listed month". Good enough for picker labels and sim PnL
// display — not authoritative for OI-driven rollover analytics.

// CME standard month codes, January through December.
const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z'] as const;

// Day-of-month threshold past which we consider the current delivery
// month "rolled" and jump to the next listed contract.
const ROLLOVER_DAY = 8;

/** Returns the next valid delivery month for `validMonths` starting
 *  from `from`. Applies the simple ROLLOVER_DAY rule so that, say,
 *  on June 10th we already see "U6" (Sept) for ES instead of
 *  "M6" (June) even though June hasn't technically expired yet.
 *
 *  The returned year is the calendar year of the chosen month, so a
 *  December lookup in November still says year=this-year, and a
 *  January lookup in December rolls to next-year.
 */
export function getFrontMonthCode(
  validMonths: readonly string[],
  from: Date,
): { month: string; year: number } {
  const month0 = from.getUTCMonth(); // 0..11
  const day = from.getUTCDate();
  const year = from.getUTCFullYear();

  // If we're past the rollover day in the current month, skip forward
  // so the front contract is "next listed", not "this listed".
  const startIdx = day >= ROLLOVER_DAY ? month0 + 1 : month0;

  // Walk forward up to 24 months — covers products that only list
  // once per year and the natural wrap into next year.
  for (let i = 0; i < 24; i++) {
    const idx = (startIdx + i) % 12;
    const yearOffset = Math.floor((startIdx + i) / 12);
    const code = MONTH_CODES[idx];
    if (validMonths.includes(code)) {
      return { month: code, year: year + yearOffset };
    }
  }
  // Defensive — should never hit unless validMonths is empty.
  return { month: MONTH_CODES[month0], year };
}

/** Combines root + front-month code + last digit of year into the
 *  Rithmic-style contract symbol. Example:
 *    getCurrentContract('MNQ', ['H','M','U','Z'], 2026-05-30)
 *      → 'MNQM6'
 *    getCurrentContract('CL',  MONTHS_ALL,        2026-05-30)
 *      → 'CLM6'
 *    getCurrentContract('GC',  ['G','J','M','Q','V','Z'], 2026-05-30)
 *      → 'GCM6'
 */
export function getCurrentContract(
  root: string,
  validMonths: readonly string[],
  from: Date = new Date(),
): string {
  const { month, year } = getFrontMonthCode(validMonths, from);
  return `${root}${month}${year % 10}`;
}

/** Human-readable label for a (month, year) tuple. Useful for the
 *  picker's `contractMonth` display.
 */
export function frontMonthLabel(validMonths: readonly string[], from: Date = new Date()): string {
  const { month, year } = getFrontMonthCode(validMonths, from);
  const monthIdx = MONTH_CODES.indexOf(month as typeof MONTH_CODES[number]);
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

// Common month-set presets to reduce repetition in contractSpecs.ts.
export const MONTHS_QUARTERLY = ['H','M','U','Z'] as const; // indices, currencies
export const MONTHS_ALL       = ['F','G','H','J','K','M','N','Q','U','V','X','Z'] as const; // energy, crypto
export const MONTHS_GOLD      = ['G','J','M','Q','V','Z'] as const; // GC, MGC: Feb Apr Jun Aug Oct Dec
export const MONTHS_SILVER    = ['H','K','N','U','Z'] as const; // SI, SIL: Mar May Jul Sep Dec
export const MONTHS_COPPER    = ['H','K','N','U','Z'] as const; // HG, MHG: Mar May Jul Sep Dec
export const MONTHS_PLATINUM  = ['F','J','N','V'] as const; // PL: Jan Apr Jul Oct
export const MONTHS_PALLADIUM = ['H','M','U','Z'] as const; // PA: quarterly
export const MONTHS_BONDS     = ['H','M','U','Z'] as const; // ZB, ZN, ZF, ZT, UB, TN
export const MONTHS_GRAINS    = ['H','K','N','U','Z'] as const; // ZC, ZW: Mar May Jul Sep Dec
export const MONTHS_SOYBEANS  = ['F','H','K','N','Q','U','X'] as const; // ZS: Jan Mar May Jul Aug Sep Nov
export const MONTHS_SOYMEAL   = ['F','H','K','N','Q','U','V','Z'] as const; // ZM, ZL
export const MONTHS_OATS      = ['H','K','N','U','Z'] as const; // ZO
export const MONTHS_RICE      = ['F','H','K','N','U','X'] as const; // ZR: Jan Mar May Jul Sep Nov
export const MONTHS_CATTLE    = ['G','J','M','Q','V','Z'] as const; // LE: Feb Apr Jun Aug Oct Dec
export const MONTHS_HOGS      = ['G','J','K','M','N','Q','V','Z'] as const; // HE
export const MONTHS_FEEDER    = ['F','H','J','K','Q','U','V','X'] as const; // GF
