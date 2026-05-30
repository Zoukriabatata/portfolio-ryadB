// Native Journal route. Day 1 shipped Trades; Day 2 enables Calendar
// and Daily Notes. Day 3 will add Playbook, Day 4 Dashboard analytics.

import { useState } from "react";
import TradesTab from "../components/journal/TradesTab";
import CalendarTab from "../components/journal/CalendarTab";
import DailyNotesTab from "../components/journal/DailyNotesTab";
import PlaybookTab from "../components/journal/PlaybookTab";
import DashboardTab from "../components/journal/DashboardTab";
import "../components/journal/journal.css";

type Tab = "trades" | "calendar" | "notes" | "playbook" | "dashboard";

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: "trades",    label: "Trades",      ready: true },
  { id: "calendar",  label: "Calendar",    ready: true },
  { id: "notes",     label: "Daily Notes", ready: true },
  { id: "playbook",  label: "Playbook",    ready: true },
  { id: "dashboard", label: "Dashboard",   ready: true },
];

export function JournalRoute() {
  const [tab, setTab] = useState<Tab>("trades");

  return (
    <div className="journal-route h-full w-full flex flex-col bg-[#0a0a0a]">
      {/* Tab bar — sliding green indicator + soft hover background. */}
      <nav className="journal-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => t.ready && setTab(t.id)}
            disabled={!t.ready}
            aria-disabled={!t.ready}
            aria-current={tab === t.id ? "page" : undefined}
            className={`journal-tab ${tab === t.id ? "is-active" : ""}`}
          >
            {t.label}
            {!t.ready && <span className="soon-pill">soon</span>}
          </button>
        ))}
      </nav>

      {/* Pane — re-mounts per tab so the entry animation fires on switch. */}
      <div key={tab} className="j-route-pane flex-1 min-h-0">
        {tab === "trades"    && <TradesTab />}
        {tab === "calendar"  && <CalendarTab />}
        {tab === "notes"     && <DailyNotesTab />}
        {tab === "playbook"  && <PlaybookTab />}
        {tab === "dashboard" && <DashboardTab />}
      </div>
    </div>
  );
}
