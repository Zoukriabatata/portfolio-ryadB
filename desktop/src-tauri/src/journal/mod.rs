// Native journal — SQLite-backed CRUD for trades, daily notes, and
// playbook setups. Mirror of the website's Prisma JournalEntry /
// DailyNote / PlaybookSetup tables, ported to single-user local
// storage (no userId column needed: the desktop app is one-user).
//
// Day 1 ships the Trade table only. Day 2-5 will add daily_notes,
// playbook_setups, screenshots, and analytics aggregations.

pub mod commands;
pub mod db;
pub mod rithmic_sync;

pub use db::{
    CalendarDay, CalendarMonthStats, DailyNote, JournalDb, PlaybookSetup, Trade, TradeFilter,
    TradeStats,
};
pub use rithmic_sync::{SyncResult, DEFAULT_LOOKBACK_DAYS};
