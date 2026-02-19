'use client';

import Tabs from '@/components/ui/Tabs';
import { useJournalStore } from '@/stores/useJournalStore';
import type { JournalTab } from '@/types/journal';

const JOURNAL_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'trades', label: 'Trades' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'playbook', label: 'Playbook' },
  { id: 'notes', label: 'Daily Notes' },
];

interface JournalHeaderProps {
  onNewTrade: () => void;
}

export default function JournalHeader({ onNewTrade }: JournalHeaderProps) {
  const { activeTab, setActiveTab } = useJournalStore();

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
      <div className="flex items-center gap-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Trading Journal</h1>
        </div>
        <Tabs
          tabs={JOURNAL_TABS}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as JournalTab)}
          size="sm"
        />
      </div>
      <button
        onClick={onNewTrade}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97]"
        style={{ background: 'var(--primary)', color: 'var(--background)' }}
      >
        + New Trade
      </button>
    </div>
  );
}
