import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * ACCOUNT RULES STORE
 *
 * Topstep / Apex-style risk rules. Tracks the limits the user sets for
 * their demo account and the current state (Active / Warning / Locked /
 * Passed). Today's anchor balance is recorded so the daily loss limit
 * resets every calendar day.
 *
 * The store is presentational — actual order blocking will plug into the
 * placeOrder() flow in a later phase.
 */

export type AccountState = 'ACTIVE' | 'WARNING' | 'LOCKED' | 'PASSED';

export type AccountPreset =
  | 'topstep_50k'
  | 'topstep_100k'
  | 'topstep_150k'
  | 'apex_50k'
  | 'apex_100k'
  | 'custom';

interface AccountRulesState {
  // Configuration
  enabled:           boolean;     // master toggle
  preset:            AccountPreset;
  startingBalance:   number;      // baseline used to derive other limits

  dailyLossLimit:    number;      // max negative day P&L before LOCKED
  maxDrawdown:       number;      // max distance below highest equity (trailing)
  profitTarget:      number;      // total realised profit to reach PASSED

  // Day tracking
  dayStartBalance:   number | null;  // equity at start of today (UTC date boundary)
  dayStartedAt:      number | null;  // timestamp ms of when dayStartBalance was set

  // Trailing high water mark
  peakEquity:        number;      // highest equity ever reached on this account

  // Account lifecycle state
  accountState:      AccountState;
  lockedReason:      string | null;
  lockedAt:          number | null;

  // Discipline tracking — set true the first time the account ever
  // entered the WARNING state, and the first time it ever LOCKED.
  // Both reset on reset(). Used to compute the "Discipline Achievement"
  // certificate trigger (everWarning && !everLocked && enough trades).
  everWarning:       boolean;
  everLocked:        boolean;

  // ── Actions ────────────────────────────────────────────────────────────
  setEnabled:        (on: boolean) => void;
  applyPreset:       (preset: AccountPreset) => void;
  setCustomLimits:   (opts: { dailyLossLimit?: number; maxDrawdown?: number; profitTarget?: number; startingBalance?: number }) => void;

  /** Re-evaluate state given the current balance + unrealized PnL (called from dashboard). */
  evaluate:          (currentEquity: number) => void;

  /** Reset day P&L baseline to the given equity. Called once per UTC day. */
  startNewDay:       (equity: number) => void;

  /** Reset all state — used by "Reset Account" or fresh combine. */
  reset:             (startingBalance?: number) => void;

  /** Manually unlock (admin / "i want to keep trading") */
  unlock:            () => void;
}

export const PRESET_DEFAULTS: Record<Exclude<AccountPreset, 'custom'>, {
  starting:    number;
  dailyLoss:   number;
  drawdown:    number;
  target:      number;
}> = {
  topstep_50k:  { starting: 50_000,  dailyLoss: 1_000, drawdown: 2_000, target: 3_000  },
  topstep_100k: { starting: 100_000, dailyLoss: 2_000, drawdown: 3_000, target: 6_000  },
  topstep_150k: { starting: 150_000, dailyLoss: 3_000, drawdown: 4_500, target: 9_000  },
  apex_50k:     { starting: 50_000,  dailyLoss: 1_500, drawdown: 2_500, target: 3_000  },
  apex_100k:    { starting: 100_000, dailyLoss: 2_500, drawdown: 3_000, target: 6_000  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns true if the two timestamps fall on different UTC calendar days. */
function isDifferentDay(a: number, b: number): boolean {
  const da = new Date(a); const db = new Date(b);
  return (
    da.getUTCFullYear() !== db.getUTCFullYear() ||
    da.getUTCMonth()    !== db.getUTCMonth()    ||
    da.getUTCDate()     !== db.getUTCDate()
  );
}

export const useAccountRulesStore = create<AccountRulesState>()(
  persist(
    (set, get) => ({
      enabled:          false,
      preset:           'topstep_50k',
      startingBalance:  50_000,

      dailyLossLimit:   1_000,
      maxDrawdown:      2_000,
      profitTarget:     3_000,

      dayStartBalance:  null,
      dayStartedAt:     null,
      peakEquity:       50_000,

      accountState:     'ACTIVE',
      lockedReason:     null,
      lockedAt:         null,
      everWarning:      false,
      everLocked:       false,

      setEnabled: (on) => set({ enabled: on }),

      applyPreset: (preset) => {
        if (preset === 'custom') {
          set({ preset });
          return;
        }
        const p = PRESET_DEFAULTS[preset];
        set({
          preset,
          startingBalance: p.starting,
          dailyLossLimit:  p.dailyLoss,
          maxDrawdown:     p.drawdown,
          profitTarget:    p.target,
          peakEquity:      p.starting,
          // Don't auto-reset day or lock — that's a user action via reset()
        });
      },

      setCustomLimits: (opts) => set(state => ({
        ...state,
        ...opts,
        preset: 'custom',
      })),

      evaluate: (currentEquity) => {
        const state = get();
        if (!state.enabled) return;

        const now = Date.now();

        // Day rollover: if we crossed midnight UTC since last evaluation
        const needsNewDay =
          state.dayStartedAt === null ||
          isDifferentDay(state.dayStartedAt, now);

        const dayStart = needsNewDay ? currentEquity : (state.dayStartBalance ?? currentEquity);
        const dayStartTs = needsNewDay ? now : state.dayStartedAt;
        const peak = Math.max(state.peakEquity, currentEquity);

        // Compute checks
        const dayPnL    = currentEquity - dayStart;
        const drawdown  = peak - currentEquity;
        const totalPnL  = currentEquity - state.startingBalance;

        let nextState: AccountState     = 'ACTIVE';
        let lockedReason: string | null = null;
        let lockedAt: number | null     = state.lockedAt;

        if (totalPnL >= state.profitTarget) {
          nextState = 'PASSED';
          lockedReason = `Profit target reached: +$${totalPnL.toFixed(0)}`;
          lockedAt = lockedAt ?? now;
        } else if (drawdown >= state.maxDrawdown) {
          nextState = 'LOCKED';
          lockedReason = `Max drawdown breached: -$${drawdown.toFixed(0)}`;
          lockedAt = lockedAt ?? now;
        } else if (dayPnL <= -state.dailyLossLimit) {
          nextState = 'LOCKED';
          lockedReason = `Daily loss limit hit: ${dayPnL.toFixed(0)}`;
          lockedAt = lockedAt ?? now;
        } else if (
          (dayPnL <= -0.7 * state.dailyLossLimit) ||
          (drawdown >= 0.7 * state.maxDrawdown)
        ) {
          nextState = 'WARNING';
          lockedReason = null;
          lockedAt = null;
        }

        set({
          dayStartBalance: dayStart,
          dayStartedAt:    dayStartTs,
          peakEquity:      peak,
          accountState:    nextState,
          lockedReason,
          lockedAt,
          // Sticky flags — once set, never go back to false within the same
          // account life (only cleared by reset()).
          everWarning: state.everWarning || nextState === 'WARNING',
          everLocked:  state.everLocked  || nextState === 'LOCKED',
        });
      },

      startNewDay: (equity) => set({
        dayStartBalance: equity,
        dayStartedAt:    Date.now(),
      }),

      reset: (startingBalance) => {
        const start = startingBalance ?? get().startingBalance;
        set({
          startingBalance: start,
          dayStartBalance: start,
          dayStartedAt:    Date.now(),
          peakEquity:      start,
          accountState:    'ACTIVE',
          lockedReason:    null,
          lockedAt:        null,
          everWarning:     false,
          everLocked:      false,
        });
      },

      unlock: () => set({
        accountState: 'ACTIVE',
        lockedReason: null,
        lockedAt:     null,
      }),
    }),
    {
      name:           'account-rules',
      version:        1,
      skipHydration:  true,
    },
  ),
);

/** Helper for UI: returns an object with raw and bounded percentages. */
export function ruleProgress(used: number, limit: number): { pct: number; status: 'safe' | 'warning' | 'danger' } {
  if (limit <= 0) return { pct: 0, status: 'safe' };
  const pct = Math.max(0, Math.min(100, (used / limit) * 100));
  const status: 'safe' | 'warning' | 'danger' =
    pct >= 100 ? 'danger' : pct >= 70 ? 'warning' : 'safe';
  return { pct, status };
}
