// Tauri IPC wrappers for the native Journal. Replaces the website's
// `/api/journal/*` REST endpoints with `invoke()` calls.

import { invoke } from "@tauri-apps/api/core";
import type {
  JournalEntry,
  TradeFilter,
  ListTradesResult,
  DailyNote,
  CalendarMonthResult,
  RithmicSyncResult,
  PlaybookSetup,
} from "../../types/journal";

/** Mirror of the Rust `SyncStatus` returned by `journal_rithmic_sync_status`. */
export interface RithmicLocalStatus {
  importedCount: number;
  lastImportedAt: string | null;
}

export function listTrades(filter: TradeFilter = {}): Promise<ListTradesResult> {
  return invoke<ListTradesResult>("journal_list_trades", { filter });
}

export function getTrade(id: string): Promise<JournalEntry | null> {
  return invoke<JournalEntry | null>("journal_get_trade", { id });
}

export function createTrade(trade: JournalEntry): Promise<JournalEntry> {
  return invoke<JournalEntry>("journal_create_trade", { trade });
}

export function updateTrade(trade: JournalEntry): Promise<JournalEntry> {
  return invoke<JournalEntry>("journal_update_trade", { trade });
}

export function deleteTrade(id: string): Promise<number> {
  return invoke<number>("journal_delete_trade", { id });
}

export function bulkDeleteTrades(ids: string[]): Promise<number> {
  return invoke<number>("journal_bulk_delete", { args: { ids } });
}

// ── Day 2: Calendar + Daily notes ──────────────────────────────────────────

export function calendarMonth(month: string): Promise<CalendarMonthResult> {
  return invoke<CalendarMonthResult>("journal_calendar_month", {
    args: { month },
  });
}

export function tradesOnDay(date: string): Promise<JournalEntry[]> {
  return invoke<JournalEntry[]>("journal_trades_on_day", { args: { date } });
}

export function listDailyNotesMonth(month: string): Promise<DailyNote[]> {
  return invoke<DailyNote[]>("journal_list_daily_notes_month", {
    args: { month },
  });
}

export function saveDailyNote(note: DailyNote): Promise<DailyNote> {
  return invoke<DailyNote>("journal_save_daily_note", { note });
}

export function deleteDailyNote(id: string): Promise<number> {
  return invoke<number>("journal_delete_daily_note", { id });
}

// ── Rithmic broker sync ────────────────────────────────────────────────────

/** Trigger a one-shot pull of Rithmic order history into the journal.
 *  Resolves with insert/update/unchanged counts once the round-trip
 *  reconstruction has finished. Throws if no broker creds are saved. */
export function syncRithmic(days?: number): Promise<RithmicSyncResult> {
  return invoke<RithmicSyncResult>("journal_sync_rithmic", {
    args: { days: days ?? null },
  });
}

/** Cheap query: how many rithmic-imported trades are in the local DB,
 *  and what's the most recent entry_time among them. Used to drive the
 *  "Last sync" badge in the TradesTab toolbar. */
export function getRithmicSyncStatus(): Promise<RithmicLocalStatus> {
  return invoke<RithmicLocalStatus>("journal_rithmic_sync_status");
}

// ── CSV batch import ───────────────────────────────────────────────────

export interface CsvImportResult {
  inserted: number;
  updated: number;
  failed: number;
}

/** Bulk-upsert pre-parsed trades. Each row must carry an
 *  `externalSource` + `externalId` for dedupe to work. */
export function importTrades(trades: JournalEntry[]): Promise<CsvImportResult> {
  return invoke<CsvImportResult>("journal_import_trades", {
    args: { trades },
  });
}

// ── Playbook setups (Day 3) ────────────────────────────────────────────

export function listPlaybookSetups(): Promise<PlaybookSetup[]> {
  return invoke<PlaybookSetup[]>("journal_list_playbook_setups");
}

export function savePlaybookSetup(setup: PlaybookSetup): Promise<PlaybookSetup> {
  return invoke<PlaybookSetup>("journal_save_playbook_setup", { setup });
}

export function deletePlaybookSetup(id: string): Promise<number> {
  return invoke<number>("journal_delete_playbook_setup", { id });
}
